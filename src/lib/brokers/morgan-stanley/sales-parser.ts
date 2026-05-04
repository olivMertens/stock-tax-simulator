import Papa from 'papaparse';
import type { SoldLot, StockOrigin, HoldingPeriod, PlanType, ImportCurrency } from '../../types';
import { parseWorksheet, parseSharedStrings, readXlsx } from '../../xlsx-reader';

const MAX_ROWS = 5000;

const MONTH_MAP: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

/** Parse a Morgan Stanley CSV-style date "22-Dec-2025". */
function parseMsDate(raw: string): Date | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const parts = trimmed.split('-');
  if (parts.length !== 3) return undefined;
  const day = parseInt(parts[0], 10);
  const month = MONTH_MAP[parts[1]];
  const year = parseInt(parts[2], 10);
  if (!Number.isFinite(day) || month === undefined || !Number.isFinite(year)) return undefined;
  return new Date(year, month, day);
}

/** Convert an Excel serial date (number of days since 1899-12-30) to a JS Date. */
function excelSerialToDate(serial: number): Date | undefined {
  if (!Number.isFinite(serial) || serial <= 0) return undefined;
  const ms = Math.round(serial) * 86400000;
  // Excel epoch is 1899-12-30 (after accounting for Lotus-123 1900 leap-year bug).
  const d = new Date(Date.UTC(1899, 11, 30) + ms);
  // Re-express in local time using its UTC components to avoid TZ drift.
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Parse a value that may be either an Excel serial number or a "DD-Mmm-YYYY" string. */
function parseAnyMsDate(raw: string): Date | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  // Pure numeric → Excel serial
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return excelSerialToDate(parseFloat(trimmed));
  }
  return parseMsDate(trimmed);
}

/** Parse an MS amount: raw number ("488"), decimal ("488.0023"), or "$1,314.85". */
function parseMsAmount(raw: string): number {
  if (!raw) return NaN;
  const cleaned = raw.trim().replace(/[$,\s\u00A0]/g, '');
  if (!cleaned) return NaN;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

/** Map MS Plan Name to the app's StockOrigin code. */
function planNameToOrigin(planName: string): StockOrigin | null {
  const n = planName.trim();
  if (n === 'Microsoft Corporation Long Share Savings Plan') return 'SP';
  if (n === 'Microsoft Qualified Stock Awards - Macron') return 'FM';
  if (n === 'Microsoft Stock Awards') return 'DO';
  return null;
}

function defaultPlanTypeFor(origin: StockOrigin): PlanType {
  switch (origin) {
    case 'FM': return 'qualified_macron';
    case 'FQ': return 'qualified_pre_macron';
    case 'DO': return 'qualified_macron';
    case 'SP': return 'non_qualified';
  }
}

/** Long-term if held ≥ 365 days, else Short. (For display only — French tax engine ignores this.) */
function computeHoldingPeriod(acquisition: Date, sale: Date): HoldingPeriod {
  const diffDays = (sale.getTime() - acquisition.getTime()) / 86400000;
  return diffDays >= 365 ? 'Long' : 'Short';
}

interface ShareSaleRow {
  date: string;
  planName: string;
  fundName: string;
  type: string;
  orderStatus: string;
  salePrice: string;
  quantity: string;
  netCashProceeds: string;
  acquisitionDate: string;
  acquisitionValue: string;
}

const HEADER_ALIASES = [
  ['date', 'Date'],
  ['planName', 'Plan Name'],
  ['fundName', 'Fund Name'],
  ['type', 'Type'],
  ['orderStatus', 'Order Status'],
  ['salePrice', 'Sale Price'],
  ['quantity', 'Quantity'],
  ['netCashProceeds', 'Net Cash Proceeds'],
  ['acquisitionDate', 'Acquisition Date'],
  ['acquisitionValue', 'Acquisition Value'],
] as const;

/**
 * Convert a sold-lot row into a SoldLot.
 * Returns null for rows that don't represent a valid completed sale.
 *
 * IMPORTANT: We compute proceeds as quantity × salePrice rather than reading
 * "Net Cash Proceeds". Net Cash Proceeds is the SUM across all per-lot rows of
 * the same sale event, repeated identically on each row — and it survives if
 * the user manually deletes some lot rows from the export, which would yield
 * silently-inflated proceeds. quantity × salePrice is robust to this case.
 */
function rowToSoldLot(row: ShareSaleRow, idCounter: { n: number }): SoldLot | null {
  // Only keep completed sales
  if (row.orderStatus.trim() !== 'Complete') return null;

  const saleDate = parseAnyMsDate(row.date);
  if (!saleDate) return null;
  const acquisitionDate = parseAnyMsDate(row.acquisitionDate);
  if (!acquisitionDate) return null;

  const quantity = parseMsAmount(row.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) return null;

  const salePrice = parseMsAmount(row.salePrice);
  if (!Number.isFinite(salePrice) || salePrice <= 0) return null;

  const acquisitionValue = parseMsAmount(row.acquisitionValue);
  if (!Number.isFinite(acquisitionValue) || acquisitionValue < 0) return null;

  const origin = planNameToOrigin(row.planName);
  if (!origin) return null;

  const proceedsUsd = quantity * salePrice;
  const holdingPeriod = computeHoldingPeriod(acquisitionDate, saleDate);

  idCounter.n++;
  return {
    id: `ms-sold-${idCounter.n}`,
    broker: 'morgan_stanley',
    acquisitionDate,
    saleDate,
    quantity,
    proceeds: 0,
    costBasis: 0,
    gainLoss: 0,
    proceedsUsd,
    costBasisUsd: acquisitionValue,
    holdingPeriod,
    origin,
    planType: defaultPlanTypeFor(origin),
    importCurrency: 'USD' as ImportCurrency,
  };
}

/** Build a header-index map from a row of cell strings. Returns null if no recognizable header. */
function findHeaderIndex(cells: string[]): Record<keyof ShareSaleRow, number> | null {
  const norm = cells.map(c => (c ?? '').trim());
  const idx: Partial<Record<keyof ShareSaleRow, number>> = {};
  let matches = 0;
  for (const [key, label] of HEADER_ALIASES) {
    const i = norm.indexOf(label);
    if (i >= 0) {
      idx[key] = i;
      matches++;
    }
  }
  // We need at least Date + Plan Name + Sale Price + Quantity + Acquisition Date + Acquisition Value
  const required: (keyof ShareSaleRow)[] = ['date', 'planName', 'salePrice', 'quantity', 'acquisitionDate', 'acquisitionValue'];
  if (matches < required.length || required.some(k => idx[k] === undefined)) return null;
  return idx as Record<keyof ShareSaleRow, number>;
}

/**
 * Error thrown when a Share Sales export was generated WITHOUT the
 * "Show Withdrawal by Lot" option: every sale row is structurally valid
 * but the Acquisition Date / Acquisition Value columns are empty,
 * meaning the per-lot ventilation needed for capital-gain computation is
 * missing. The user has to re-export with the option ticked.
 */
export const MS_MISSING_LOT_DETAIL_MESSAGE =
  'Le rapport contient des ventes mais sans la ventilation par lot d\u2019acquisition. ' +
  'Re-t\u00e9l\u00e9charge le rapport depuis Morgan Stanley en cochant l\u2019option ' +
  '\u00ab\u00a0Show Withdrawal by Lot\u00a0\u00bb (sinon le simulateur ne peut pas calculer la plus-value).';

/**
 * Same as `rowsFromCells` but returns null when no recognizable Share Sales
 * header is found. Used by the XLSX path which scans multiple sheets.
 */
function tryRowsFromCells(rows: string[][]): SoldLot[] | null {
  if (rows.length > MAX_ROWS) {
    throw new Error(`Le fichier contient trop de lignes (${rows.length}). Maximum autorisé : ${MAX_ROWS}.`);
  }

  let headerIdx: Record<keyof ShareSaleRow, number> | null = null;
  const out: SoldLot[] = [];
  const counter = { n: 0 };
  // Track rows that look like completed sales but lack the per-lot detail
  // (empty Acquisition Date). A non-zero count combined with an empty `out`
  // is the "Show Withdrawal by Lot" footgun.
  let completedRowsMissingLotDetail = 0;
  let totalCompletedRows = 0;

  for (const row of rows) {
    if (!row || row.length === 0) continue;

    if (!headerIdx) {
      headerIdx = findHeaderIndex(row);
      continue;
    }

    const get = (k: keyof ShareSaleRow) => (row[headerIdx![k]] ?? '').toString();
    const sale: ShareSaleRow = {
      date: get('date'),
      planName: get('planName'),
      fundName: get('fundName'),
      type: get('type'),
      orderStatus: get('orderStatus'),
      salePrice: get('salePrice'),
      quantity: get('quantity'),
      netCashProceeds: get('netCashProceeds'),
      acquisitionDate: get('acquisitionDate'),
      acquisitionValue: get('acquisitionValue'),
    };

    if (sale.orderStatus.trim() === 'Complete') {
      totalCompletedRows++;
      if (!sale.acquisitionDate.trim() && !sale.acquisitionValue.trim()) {
        completedRowsMissingLotDetail++;
      }
    }

    const sold = rowToSoldLot(sale, counter);
    if (sold) out.push(sold);
  }

  if (
    headerIdx &&
    out.length === 0 &&
    totalCompletedRows > 0 &&
    completedRowsMissingLotDetail === totalCompletedRows
  ) {
    throw new Error(MS_MISSING_LOT_DETAIL_MESSAGE);
  }

  return headerIdx ? out : null;
}

function rowsFromCells(rows: string[][]): SoldLot[] {
  const result = tryRowsFromCells(rows);
  if (result === null) {
    throw new Error('Format Morgan Stanley non reconnu : en-tête « Share Sales » introuvable.');
  }
  return result;
}

/** Parse a Morgan Stanley "Share Sales.csv" (or the equivalent personal `.csv`). */
export function parseMsSalesCsv(csvText: string): SoldLot[] {
  const result = Papa.parse<string[]>(csvText, {
    header: false,
    skipEmptyLines: true,
  });
  return rowsFromCells(result.data);
}

/** Parse a Morgan Stanley "Participant Share Sales Report" XLSX file. */
export async function parseMsSalesXlsx(buffer: ArrayBuffer): Promise<SoldLot[]> {
  // The Participant Share Sales Report typically ships with several sheets
  // (Summary, Activity, Notes…). The Share Sales table is not always sheet 1,
  // so we try every sheet and keep the first one whose first row matches our
  // header signature.
  const MAX_SHEETS = 20;
  const sheetNames: string[] = [];
  for (let i = 1; i <= MAX_SHEETS; i++) sheetNames.push(`xl/worksheets/sheet${i}.xml`);
  const wanted = ['xl/sharedStrings.xml', ...sheetNames];

  const parts = await readXlsx(buffer, wanted);
  const sharedStrings = parts.has('xl/sharedStrings.xml')
    ? parseSharedStrings(parts.get('xl/sharedStrings.xml')!)
    : [];

  const errors: string[] = [];
  for (const name of sheetNames) {
    const sheetXml = parts.get(name);
    if (!sheetXml) continue;
    const sheetRows = parseWorksheet(sheetXml, sharedStrings);
    const cellsRows = sheetRowsToCellsArray(sheetRows);
    try {
      const result = tryRowsFromCells(cellsRows);
      if (result !== null) return result;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  if (errors.length > 0) {
    throw new Error(errors[0]);
  }
  throw new Error(
    'Fichier XLSX Morgan Stanley non reconnu : aucune feuille ne contient l’en-tête « Share Sales ». Vérifiez que c’est bien le « Participant Share Sales Report ».',
  );
}

/** Convert SheetRow[] (column-letter keyed) into a dense 2D string array. */
function sheetRowsToCellsArray(sheetRows: { cells: Record<string, string> }[]): string[][] {
  return sheetRows.map(r => {
    const cols = Object.keys(r.cells);
    if (cols.length === 0) return [];
    let maxIdx = 0;
    for (const c of cols) maxIdx = Math.max(maxIdx, columnLetterToIndex(c));
    const arr = new Array<string>(maxIdx + 1).fill('');
    for (const c of cols) arr[columnLetterToIndex(c)] = r.cells[c];
    return arr;
  });
}

/** Convert a column letter ("A", "B", "AA") to a 0-based index. */
function columnLetterToIndex(letters: string): number {
  let n = 0;
  for (const ch of letters) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n - 1;
}
