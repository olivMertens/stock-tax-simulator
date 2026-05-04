import Papa from 'papaparse';
import type { StockLot, StockOrigin, HoldingPeriod, PlanType, ImportCurrency } from '../../types';

const MAX_ROWS = 5000;

const MONTH_MAP: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

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

function isFutureDate(date: Date): boolean {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return date.getTime() > today.getTime();
}

/**
 * Parse a Morgan Stanley "Holdings by Lot.csv" file.
 *
 * IMPORTANT CAVEAT: in this file, the "Current Value" column is actually the
 * acquisition (cost basis) value, NOT the current market value. We therefore
 * map it to costBasisPerShareUsd / totalCostBasisUsd. currentValueUsd is
 * intentionally left equal to the cost basis at parse time; the live MSFT
 * market price (fetched separately by the app) will be used to recompute the
 * displayed current value where needed.
 *
 * Rows skipped:
 *  - The two title/header rows ("Holdings by Lot" + column headers)
 *  - Cash dividend rows: empty Acquisition Date + Lot Number, quantity == value
 *  - Single-cell prose footer disclaimers
 *  - Any plan name we don't recognize
 */
export function parseMsHoldingsCsv(csvText: string): StockLot[] {
  const result = Papa.parse<string[]>(csvText, {
    header: false,
    skipEmptyLines: true,
  });

  const rows = result.data;
  if (rows.length > MAX_ROWS) {
    throw new Error(`Le fichier contient trop de lignes (${rows.length}). Maximum autorisé : ${MAX_ROWS}.`);
  }

  const lots: StockLot[] = [];
  let id = 0;
  let headerSeen = false;

  for (const row of rows) {
    if (!row || row.length < 5) continue;

    // Skip the "Holdings by Lot" title row (single non-empty cell)
    if (!headerSeen && row.length >= 2 && row[0]?.trim() === 'Acquisition Date') {
      headerSeen = true;
      continue;
    }
    if (!headerSeen) continue;

    const acqRaw = row[0]?.trim() ?? '';
    const planName = row[1]?.trim() ?? '';
    const lotNumber = row[2]?.trim() ?? '';
    const qtyRaw = row[3]?.trim() ?? '';
    const valueRaw = row[4]?.trim() ?? '';

    // Cash dividend rows have no acquisition date and no lot number.
    if (!acqRaw || !lotNumber) continue;

    const acquisitionDate = parseMsDate(acqRaw);
    if (!acquisitionDate) continue;
    if (isFutureDate(acquisitionDate)) continue;

    const origin = planNameToOrigin(planName);
    if (!origin) continue;

    const quantity = parseMsAmount(qtyRaw);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;

    const acquisitionValue = parseMsAmount(valueRaw);
    if (!Number.isFinite(acquisitionValue) || acquisitionValue < 0) continue;

    const costBasisPerShareUsd = acquisitionValue / quantity;

    id++;
    lots.push({
      id: `ms-lot-${id}`,
      broker: 'morgan_stanley',
      acquisitionDate,
      quantity,
      // EUR values filled by ECB conversion downstream
      costBasisPerShare: 0,
      totalCostBasis: 0,
      currentValue: 0,
      unrealizedGainLoss: 0,
      // ESPP FMV before 10% discount
      esppFmvPerShareUsd: origin === 'SP' ? costBasisPerShareUsd / 0.90 : undefined,
      costBasisPerShareUsd,
      totalCostBasisUsd: acquisitionValue,
      // MS does not export market value; default to cost basis (live MSFT
      // price fetch will overwrite where it is used for display).
      currentValueUsd: acquisitionValue,
      importCurrency: 'USD' as ImportCurrency,
      origin,
      holdingPeriod: 'Long' as HoldingPeriod,
      planType: defaultPlanTypeFor(origin),
    });
  }

  return lots;
}
