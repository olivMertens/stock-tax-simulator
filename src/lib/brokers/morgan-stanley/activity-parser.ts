import type { SoldLot, StockLot, StockOrigin, HoldingPeriod, PlanType, ImportCurrency } from '../../types';
import type { DividendEvent } from '../fidelity/transactions-parser';
import { parseWorksheet, parseSharedStrings, readXlsx } from '../../xlsx-reader';
import { MS_MISSING_LOT_DETAIL_MESSAGE, MS_NON_ENGLISH_EXPORT_MESSAGE } from './sales-parser';

/**
 * Parser for the Morgan Stanley "Participant Share Sales Report" XLSX file.
 *
 * Despite its name this rapport bundles up to three sections on its first
 * worksheet ("Activity"), separated by blank rows:
 *
 *   1. Share Sales                          (only present if the user sold)
 *   2. Dividend Reinvestment Activity       (DRIP — taxed in France even
 *                                            though reinvested in shares)
 *   3. Holdings by Lot                      (open positions remaining after
 *                                            sales)
 *
 * Any of the three sections may be absent. We parse what is present and
 * return three independent collections.
 *
 * The file MUST be in USD. EUR (or any other currency) is detected via the
 * dedicated currency columns and rejected with a clear error so the user
 * knows to switch their StockPlan Connect display currency to USD.
 *
 * Files saved by Excel under a sensitivity label (Microsoft Information
 * Protection: Confidential, Internal Only…) are sometimes written as legacy
 * binary OLE2 (.xls) despite their .xlsx extension. We detect this on the
 * raw bytes and surface a guidance message rather than letting the ZIP
 * reader fail with an opaque error.
 */

const MAX_ROWS = 8000;

/**
 * Hypothesis (cf. project notes): the `Cash` column on dividend
 * reinvestment rows is the NET amount after the 15 % U.S. withholding tax
 * applied to non-resident dividend recipients (treaty rate for France-US).
 * We reconstruct gross = net / (1 - rate).
 */
const US_DIVIDEND_WITHHOLDING_RATE = 0.15;

const EXPECTED_USD = 'USD';
// Cells that contain the single currency code marker accompanying each
// monetary value. Anything not USD (or empty) is treated as a hard error.
const CURRENCY_CODE_RE = /^[A-Z]{3}$/;

const MONTH_MAP: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

function parseMsCsvDate(raw: string): Date | undefined {
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

function excelSerialToDate(serial: number): Date | undefined {
  if (!Number.isFinite(serial) || serial <= 0) return undefined;
  const ms = Math.round(serial) * 86400000;
  const d = new Date(Date.UTC(1899, 11, 30) + ms);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function parseAnyMsDate(raw: string): Date | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return excelSerialToDate(parseFloat(trimmed));
  }
  return parseMsCsvDate(trimmed);
}

function parseMsAmount(raw: string): number {
  if (!raw) return NaN;
  const cleaned = raw.trim().replace(/[$,\s\u00A0]/g, '');
  if (!cleaned) return NaN;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

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

function computeHoldingPeriod(acquisition: Date, sale: Date): HoldingPeriod {
  const diffDays = (sale.getTime() - acquisition.getTime()) / 86400000;
  return diffDays >= 365 ? 'Long' : 'Short';
}

function isFutureDate(date: Date): boolean {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return date.getTime() > today.getTime();
}

/**
 * Inspect the raw header bytes of the supplied XLSX file. Excel sometimes
 * writes legacy binary `.xls` OLE2 documents under a `.xlsx` extension when
 * a sensitivity label is applied — those files start with the OLE2 magic
 * `D0 CF 11 E0` and are unreadable by any XLSX (ZIP/OOXML) parser.
 *
 * Exported for tests; production callers go through `parseMsActivityXlsx`.
 */
export function detectOle2(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 8) return false;
  const v = new DataView(buffer);
  return v.getUint32(0, false) === 0xd0cf11e0 && v.getUint32(4, false) === 0xa1b11ae1;
}

interface ActivityParseResult {
  soldLots: SoldLot[];
  lots: StockLot[];
  dividends: DividendEvent[];
}

interface SectionRange {
  /** Localised section title found in column A (e.g. "Share Sales"). */
  title: string;
  /** Index of the row containing the column headers. */
  headerRowIdx: number;
  /** Inclusive range of data rows (excludes header). */
  startRowIdx: number;
  /** Exclusive end (first row not part of this section). */
  endRowIdx: number;
}

const SECTION_TITLES = new Set([
  'Share Sales',
  'Dividend Reinvestment Activity',
  'Holdings by Lot',
]);

/**
 * Walk the rows of the Activity worksheet and return one entry per
 * recognised section, with the row range that contains its data.
 */
function findSections(rows: string[][]): SectionRange[] {
  const sections: SectionRange[] = [];
  let i = 0;
  while (i < rows.length) {
    const row = rows[i];
    const first = row && row[0] ? row[0].trim() : '';
    if (SECTION_TITLES.has(first)) {
      const headerRowIdx = i + 1;
      // Find the next blank row (data ends) or another section title.
      let j = headerRowIdx + 1;
      while (j < rows.length) {
        const r = rows[j];
        const cell0 = r && r[0] ? r[0].trim() : '';
        const isBlank = !r || r.length === 0 || r.every(c => !c || !c.trim());
        if (isBlank) break;
        if (SECTION_TITLES.has(cell0)) break;
        j++;
      }
      sections.push({
        title: first,
        headerRowIdx,
        startRowIdx: headerRowIdx + 1,
        endRowIdx: j,
      });
      i = j;
      continue;
    }
    i++;
  }
  return sections;
}

/**
 * Look for a 3-letter currency code in the row that is NOT the expected USD.
 * Returns the offending code, or null when the row only contains USD/empty
 * currency markers.
 */
function detectNonUsdCurrency(row: string[]): string | null {
  for (const cell of row) {
    const v = (cell ?? '').trim().toUpperCase();
    if (!v) continue;
    if (v === EXPECTED_USD) continue;
    if (CURRENCY_CODE_RE.test(v)) return v;
  }
  return null;
}

/** Build a column-name → 0-based index map from a header row. */
function buildHeaderMap(headerRow: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (let i = 0; i < headerRow.length; i++) {
    const name = (headerRow[i] ?? '').trim();
    if (name) out[name] = i;
  }
  return out;
}

function requireColumns(headerMap: Record<string, number>, names: string[], section: string): void {
  const missing = names.filter(n => headerMap[n] === undefined);
  if (missing.length > 0) {
    throw new Error(
      `Section « ${section} » : colonnes attendues manquantes (${missing.join(', ')}). Le format Morgan Stanley a peut-être changé.`,
    );
  }
}

function parseShareSalesSection(
  rows: string[][],
  section: SectionRange,
  idCounter: { n: number },
): SoldLot[] {
  const headerRow = rows[section.headerRowIdx] ?? [];
  const map = buildHeaderMap(headerRow);
  requireColumns(
    map,
    ['Date', 'Plan Name', 'Order Status', 'Sale Price', 'Quantity', 'Acquisition Date', 'Acquisition Value'],
    'Share Sales',
  );

  const out: SoldLot[] = [];
  let totalCompletedRows = 0;
  let completedRowsMissingLotDetail = 0;
  for (let r = section.startRowIdx; r < section.endRowIdx; r++) {
    const row = rows[r] ?? [];
    if (row.every(c => !c || !c.trim())) continue;

    const offendingCcy = detectNonUsdCurrency(row);
    if (offendingCcy) {
      throw makeNonUsdError(offendingCcy);
    }

    const orderStatus = (row[map['Order Status']] ?? '').trim();
    if (orderStatus !== 'Complete') continue;
    totalCompletedRows++;

    const acqRaw = (row[map['Acquisition Date']] ?? '').trim();
    const acqValRaw = (row[map['Acquisition Value']] ?? '').trim();
    if (!acqRaw && !acqValRaw) {
      completedRowsMissingLotDetail++;
      continue;
    }

    const saleDate = parseAnyMsDate(row[map['Date']] ?? '');
    if (!saleDate) continue;
    const acquisitionDate = parseAnyMsDate(acqRaw);
    if (!acquisitionDate) continue;

    const quantity = parseMsAmount(row[map['Quantity']] ?? '');
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    const salePrice = parseMsAmount(row[map['Sale Price']] ?? '');
    if (!Number.isFinite(salePrice) || salePrice <= 0) continue;
    const acquisitionValue = parseMsAmount(acqValRaw);
    if (!Number.isFinite(acquisitionValue) || acquisitionValue < 0) continue;

    const origin = planNameToOrigin(row[map['Plan Name']] ?? '');
    if (!origin) continue;

    idCounter.n++;
    out.push({
      id: `ms-sold-${idCounter.n}`,
      broker: 'morgan_stanley',
      acquisitionDate,
      saleDate,
      quantity,
      proceeds: 0,
      costBasis: 0,
      gainLoss: 0,
      proceedsUsd: quantity * salePrice,
      costBasisUsd: acquisitionValue,
      holdingPeriod: computeHoldingPeriod(acquisitionDate, saleDate),
      origin,
      planType: defaultPlanTypeFor(origin),
      importCurrency: 'USD' as ImportCurrency,
    });
  }

  if (
    out.length === 0 &&
    totalCompletedRows > 0 &&
    completedRowsMissingLotDetail === totalCompletedRows
  ) {
    throw new Error(MS_MISSING_LOT_DETAIL_MESSAGE);
  }

  return out;
}

function parseHoldingsSection(
  rows: string[][],
  section: SectionRange,
  idCounter: { n: number },
): StockLot[] {
  const headerRow = rows[section.headerRowIdx] ?? [];
  const map = buildHeaderMap(headerRow);
  requireColumns(
    map,
    ['Acquisition Date', 'Savings Plan Name', 'Lot Number', 'Current Share Quantity', 'Current Value'],
    'Holdings by Lot',
  );

  const out: StockLot[] = [];
  for (let r = section.startRowIdx; r < section.endRowIdx; r++) {
    const row = rows[r] ?? [];
    if (row.every(c => !c || !c.trim())) continue;

    const offendingCcy = detectNonUsdCurrency(row);
    if (offendingCcy) {
      throw makeNonUsdError(offendingCcy);
    }

    const acqRaw = (row[map['Acquisition Date']] ?? '').trim();
    const lotNumber = (row[map['Lot Number']] ?? '').trim();
    // Sub-total rows have empty Acquisition Date and Lot Number.
    if (!acqRaw || !lotNumber) continue;

    const acquisitionDate = parseAnyMsDate(acqRaw);
    if (!acquisitionDate) continue;
    if (isFutureDate(acquisitionDate)) continue;

    const origin = planNameToOrigin(row[map['Savings Plan Name']] ?? '');
    if (!origin) continue;

    const quantity = parseMsAmount(row[map['Current Share Quantity']] ?? '');
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    const acquisitionValue = parseMsAmount(row[map['Current Value']] ?? '');
    if (!Number.isFinite(acquisitionValue) || acquisitionValue < 0) continue;

    const costBasisPerShareUsd = acquisitionValue / quantity;

    idCounter.n++;
    out.push({
      id: `ms-lot-${idCounter.n}`,
      broker: 'morgan_stanley',
      acquisitionDate,
      quantity,
      costBasisPerShare: 0,
      totalCostBasis: 0,
      currentValue: 0,
      unrealizedGainLoss: 0,
      esppFmvPerShareUsd: origin === 'SP' ? costBasisPerShareUsd / 0.90 : undefined,
      costBasisPerShareUsd,
      totalCostBasisUsd: acquisitionValue,
      currentValueUsd: acquisitionValue,
      importCurrency: 'USD' as ImportCurrency,
      origin,
      holdingPeriod: 'Long' as HoldingPeriod,
      planType: defaultPlanTypeFor(origin),
    });
  }
  return out;
}

function parseDividendsSection(
  rows: string[][],
  section: SectionRange,
): DividendEvent[] {
  const headerRow = rows[section.headerRowIdx] ?? [];
  const map = buildHeaderMap(headerRow);
  requireColumns(
    map,
    ['Date', 'Savings Plan Name', 'Activity', 'Cash'],
    'Dividend Reinvestment Activity',
  );

  const out: DividendEvent[] = [];
  for (let r = section.startRowIdx; r < section.endRowIdx; r++) {
    const row = rows[r] ?? [];
    if (row.every(c => !c || !c.trim())) continue;

    const offendingCcy = detectNonUsdCurrency(row);
    if (offendingCcy) {
      throw makeNonUsdError(offendingCcy);
    }

    const activity = (row[map['Activity']] ?? '').trim();
    if (activity !== 'You bought (dividend)') continue;

    const date = parseAnyMsDate(row[map['Date']] ?? '');
    if (!date) continue;

    // Plan name must map to a known origin to confirm this is a MSFT
    // dividend; we don't differentiate per-plan in the dividend totals.
    const origin = planNameToOrigin(row[map['Savings Plan Name']] ?? '');
    if (!origin) continue;

    // `Cash` is negative (cash spent buying shares); take its magnitude.
    const cashRaw = parseMsAmount(row[map['Cash']] ?? '');
    if (!Number.isFinite(cashRaw)) continue;
    const netUsd = Math.abs(cashRaw);
    if (netUsd <= 0) continue;

    const grossUsd = netUsd / (1 - US_DIVIDEND_WITHHOLDING_RATE);
    const taxWithheldUsd = grossUsd - netUsd;

    out.push({
      date,
      broker: 'morgan_stanley',
      grossUsd: round2(grossUsd),
      taxWithheldUsd: round2(taxWithheldUsd),
      netUsd: round2(netUsd),
    });
  }
  return out;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function makeNonUsdError(code: string): Error {
  return new Error(
    `Ce fichier Morgan Stanley est libellé en ${code}. Le simulateur n'accepte que les exports en USD. ` +
    `Sur StockPlan Connect, change ta devise d'affichage en USD (Profile / Account Settings → Display Currency → USD), puis re-télécharge le rapport.`,
  );
}

/**
 * Convert SheetRow[] (column-letter keyed) into a dense 2D string array.
 * The output row index matches the source row order (skipping the all-empty
 * rows that the worksheet parser already discards), so blank-row separators
 * between sections are preserved.
 */
function sheetRowsToCellsArray(sheetRows: { rowIndex: number; cells: Record<string, string> }[]): string[][] {
  if (sheetRows.length === 0) return [];
  // Re-expand into a sparse array indexed by the original row index so blank
  // rows (which the worksheet parser drops) become the explicit empty arrays
  // findSections() relies on as section separators.
  const maxRowIndex = sheetRows[sheetRows.length - 1].rowIndex;
  const out: string[][] = [];
  for (let i = 0; i <= maxRowIndex; i++) out.push([]);

  for (const r of sheetRows) {
    const cols = Object.keys(r.cells);
    if (cols.length === 0) continue;
    let maxIdx = 0;
    for (const c of cols) maxIdx = Math.max(maxIdx, columnLetterToIndex(c));
    const arr = new Array<string>(maxIdx + 1).fill('');
    for (const c of cols) arr[columnLetterToIndex(c)] = r.cells[c];
    out[r.rowIndex - 1] = arr;
  }
  return out;
}

function columnLetterToIndex(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/**
 * True if any cell in the workbook contains a non-USD currency symbol
 * (€ or £). Used as a fast "non-English export" signal — Morgan Stanley
 * localizes section titles, dates and statuses jointly with the display
 * currency, so a single symbol is enough to disambiguate.
 */
function containsNonUsdCurrencySymbol(rows: string[][]): boolean {
  for (const row of rows) {
    if (!row) continue;
    for (const cell of row) {
      if (cell && (cell.includes('€') || cell.includes('£'))) return true;
    }
  }
  return false;
}

/**
 * Walk pre-extracted Activity worksheet cells and produce the three
 * collections. Exposed for testing without going through the XLSX layer;
 * production code path is `parseMsActivityXlsx`.
 *
 * Throws if a non-USD currency code is detected anywhere in the data rows.
 */
export function parseMsActivityCells(cellsRows: string[][]): ActivityParseResult {
  // If any cell carries a non-USD currency symbol (€ or £) the export was
  // generated with a non-English locale — section titles will be localized
  // too, so `findSections` would silently return [] and we would mis-report
  // it as a "bad file". Detecting the currency marker first lets us surface
  // the actionable FR/EUR error (the file IS a Share Sales Report, just in
  // the wrong locale).
  if (containsNonUsdCurrencySymbol(cellsRows)) {
    throw new Error(MS_NON_ENGLISH_EXPORT_MESSAGE);
  }

  const sections = findSections(cellsRows);
  if (sections.length === 0) {
    throw new Error(
      "Fichier XLSX Morgan Stanley non reconnu : aucune section attendue trouvée " +
      "(Share Sales, Holdings by Lot, Dividend Reinvestment Activity). " +
      "Vérifie que c'est bien le « Participant Share Sales Report ».",
    );
  }

  const idCounter = { n: 0 };
  const out: ActivityParseResult = { soldLots: [], lots: [], dividends: [] };
  for (const section of sections) {
    switch (section.title) {
      case 'Share Sales':
        out.soldLots.push(...parseShareSalesSection(cellsRows, section, idCounter));
        break;
      case 'Holdings by Lot':
        out.lots.push(...parseHoldingsSection(cellsRows, section, idCounter));
        break;
      case 'Dividend Reinvestment Activity':
        out.dividends.push(...parseDividendsSection(cellsRows, section));
        break;
    }
  }
  return out;
}

/**
 * Parse a Morgan Stanley "Participant Share Sales Report" XLSX file and
 * return the three tracked collections. Any of them may be empty if the
 * underlying section is absent (e.g. user who never sold has no Share
 * Sales section).
 *
 * Throws an explicit error when:
 *  - the file is actually a legacy binary `.xls` (OLE2) under an `.xlsx`
 *    extension (typically caused by a sensitivity label),
 *  - the file is not in USD,
 *  - no recognised section can be located.
 */
export async function parseMsActivityXlsx(buffer: ArrayBuffer): Promise<ActivityParseResult> {
  if (detectOle2(buffer)) {
    throw new Error(
      "Ce fichier est en format Excel binaire (.xls) malgré l'extension .xlsx. " +
      "C'est généralement dû à un label de sensibilité (Confidential, Internal Only) " +
      "qui empêche Excel de l'écrire en XLSX. Solution : ouvre le fichier dans Excel, " +
      'retire ou abaisse le label de sensibilité, puis Enregistrer sous → Classeur Excel (.xlsx). ' +
      "À défaut, utilise l'export CSV depuis Morgan Stanley.",
    );
  }

  const MAX_SHEETS = 20;
  const sheetNames: string[] = [];
  for (let i = 1; i <= MAX_SHEETS; i++) sheetNames.push(`xl/worksheets/sheet${i}.xml`);
  const wanted = ['xl/sharedStrings.xml', ...sheetNames];

  const parts = await readXlsx(buffer, wanted);
  const sharedStrings = parts.has('xl/sharedStrings.xml')
    ? parseSharedStrings(parts.get('xl/sharedStrings.xml')!)
    : [];

  let lastError: Error | null = null;
  for (const name of sheetNames) {
    const sheetXml = parts.get(name);
    if (!sheetXml) continue;
    const sheetRows = parseWorksheet(sheetXml, sharedStrings);
    if (sheetRows.length > MAX_ROWS) {
      throw new Error(`Le fichier contient trop de lignes (${sheetRows.length}). Maximum autorisé : ${MAX_ROWS}.`);
    }
    const cellsRows = sheetRowsToCellsArray(sheetRows);
    try {
      return parseMsActivityCells(cellsRows);
    } catch (err) {
      // Only retry the next sheet when the failure is "no section found";
      // currency or shape errors must propagate immediately.
      lastError = err instanceof Error ? err : new Error(String(err));
      if (!/aucune section attendue/.test(lastError.message)) throw lastError;
    }
  }

  throw lastError ?? new Error(
    "Fichier XLSX Morgan Stanley non reconnu : aucune section attendue trouvée " +
    "(Share Sales, Holdings by Lot, Dividend Reinvestment Activity). " +
    "Vérifie que c'est bien le « Participant Share Sales Report ».",
  );
}
