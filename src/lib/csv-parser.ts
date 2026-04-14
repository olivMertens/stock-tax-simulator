import Papa from 'papaparse';
import type { StockLot, StockOrigin, HoldingPeriod, PlanType, ImportCurrency, SoldLot } from './types';

const MONTH_MAP: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

function parseFidelityDate(dateStr: string): Date | undefined {
  if (!dateStr || !dateStr.trim()) return undefined;
  const trimmed = dateStr.trim();
  // Format: MMM-DD-YYYY e.g. Mar-31-2026
  const parts = trimmed.split('-');
  if (parts.length !== 3) return undefined;
  const month = MONTH_MAP[parts[0]];
  if (month === undefined) return undefined;
  const day = parseInt(parts[1], 10);
  const year = parseInt(parts[2], 10);
  if (isNaN(day) || isNaN(year)) return undefined;
  return new Date(year, month, day);
}

function parseFidelityAmount(amountStr: string): number {
  if (!amountStr || !amountStr.trim()) return 0;
  // Remove spaces (thousand separators), the last 2 digits are cents
  const cleaned = amountStr.trim().replace(/\s/g, '');
  if (!cleaned || isNaN(Number(cleaned))) return 0;
  const num = parseInt(cleaned, 10);
  return num / 100;
}

function parseFidelityQuantity(qtyStr: string): number {
  if (!qtyStr || !qtyStr.trim()) return 0;
  return parseFloat(qtyStr.trim()) || 0;
}

function getDefaultPlanType(origin: StockOrigin): PlanType {
  switch (origin) {
    case 'FM': return 'qualified_macron';
    case 'FQ': return 'qualified_pre_macron';
    case 'DO': return 'qualified_macron'; // default, user can change
    case 'SP': return 'non_qualified'; // not applicable for ESPP
  }
}

export function parseCsvFile(csvText: string, currency: ImportCurrency = 'EUR'): StockLot[] {
  const result = Papa.parse(csvText, {
    header: false,
    skipEmptyLines: true,
  });

  const lots: StockLot[] = [];
  let id = 0;

  for (const row of result.data as string[][]) {
    // Skip header row
    if (row[0] === "Date d'acquisition" || row[0] === 'Date d\'acquisition') continue;
    // Skip footer lines
    if (row.join(',').includes('Les valeurs sont affichées en')) continue;
    // Skip empty rows
    if (!row[0] || !row[0].trim()) continue;

    const acquisitionDate = parseFidelityDate(row[0]);
    if (!acquisitionDate) continue;

    const quantity = parseFidelityQuantity(row[1]);
    if (quantity <= 0) continue;

    const totalCostBasis = parseFidelityAmount(row[2]);
    const costBasisPerShare = parseFidelityAmount(row[3]);
    const currentValue = parseFidelityAmount(row[4]);
    const unrealizedGainLoss = parseFidelityAmount(row[5]);
    const availableForSaleDate = parseFidelityDate(row[6]);
    const availableForTransferDate = parseFidelityDate(row[7]);
    const grantDate = parseFidelityDate(row[8]);
    const origin = (row[9]?.trim() || 'DO') as StockOrigin;
    const holdingPeriod = (row[10]?.trim() || 'Short') as HoldingPeriod;

    id++;

    if (currency === 'USD') {
      lots.push({
        id: `lot-${id}`,
        acquisitionDate,
        quantity,
        // EUR values will be filled after ECB rate fetch
        costBasisPerShare: 0,
        totalCostBasis: 0,
        currentValue: 0,
        unrealizedGainLoss: 0,
        // Store raw USD values
        costBasisPerShareUsd: costBasisPerShare,
        totalCostBasisUsd: totalCostBasis,
        currentValueUsd: currentValue,
        importCurrency: 'USD',
        availableForSaleDate,
        availableForTransferDate,
        grantDate,
        origin,
        holdingPeriod,
        planType: getDefaultPlanType(origin),
      });
    } else {
      lots.push({
        id: `lot-${id}`,
        acquisitionDate,
        quantity,
        costBasisPerShare,
        totalCostBasis,
        currentValue,
        unrealizedGainLoss,
        importCurrency: 'EUR',
        availableForSaleDate,
        availableForTransferDate,
        grantDate,
        origin,
        holdingPeriod,
        planType: getDefaultPlanType(origin),
      });
    }
  }

  return lots;
}

// --- Sales CSV parsing (closed/sold lots) ---

const SALES_MONTH_MAP: Record<string, number> = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
};

function parseSalesDate(dateStr: string): Date | undefined {
  if (!dateStr || !dateStr.trim()) return undefined;
  const trimmed = dateStr.trim();
  // Format: MMM/DD/YYYY e.g. MAR/17/2025
  const parts = trimmed.split('/');
  if (parts.length !== 3) return undefined;
  const month = SALES_MONTH_MAP[parts[0].toUpperCase()];
  if (month === undefined) return undefined;
  const day = parseInt(parts[1], 10);
  const year = parseInt(parts[2], 10);
  if (isNaN(day) || isNaN(year)) return undefined;
  return new Date(year, month, day);
}

function parseSalesAmount(amountStr: string): number {
  if (!amountStr || !amountStr.trim()) return 0;
  const cleaned = amountStr.trim().replace(/,/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

const SALES_HEADER_MARKERS = ["Date d'acquisition", 'Date d\'acquisition', 'Date de vente', 'Produits'];

function isSalesHeaderOrJunkLine(line: string): boolean {
  // Header line (may contain HTML tags from broker export)
  if (SALES_HEADER_MARKERS.filter((m) => line.includes(m)).length >= 2) return true;
  if (/<[^>]+>/.test(line)) return true; // contains HTML tags
  // Footer
  if (line.includes('Les valeurs sont affichées en')) return true;
  return false;
}

/**
 * Pre-process raw sales CSV text: strip header/footer lines (which may contain
 * HTML and problematic quoting that breaks PapaParse), then return clean lines.
 */
function preprocessSalesCsv(csvText: string): string {
  const lines = csvText.split(/\r?\n/);
  const cleanLines: string[] = [];

  for (const raw of lines) {
    // Strip leading/trailing quotes wrapping entire lines
    let line = raw.replace(/^"+|"+$/g, '');
    line = line.trim();

    if (!line) continue;
    if (isSalesHeaderOrJunkLine(line)) continue;

    cleanLines.push(line);
  }

  return cleanLines.join('\n');
}

export function parseSalesCsvFile(csvText: string, currency: ImportCurrency = 'USD'): SoldLot[] {
  const cleaned = preprocessSalesCsv(csvText);
  const result = Papa.parse(cleaned, {
    header: false,
    skipEmptyLines: true,
  });

  const lots: SoldLot[] = [];
  let id = 0;

  for (const row of result.data as string[][]) {
    // Skip empty rows
    if (!row[0] || !row[0].trim()) continue;

    const acquisitionDate = parseSalesDate(row[0]);
    if (!acquisitionDate) continue;

    const quantity = parseFloat(row[1]?.trim() || '0');
    if (!quantity || quantity <= 0) continue;

    const saleDate = parseSalesDate(row[2]);
    if (!saleDate) continue;

    const proceeds = parseSalesAmount(row[3]);
    const costBasis = parseSalesAmount(row[4]);
    const gainLoss = parseSalesAmount(row[5]);
    const holdingPeriod = (row[6]?.trim()?.toUpperCase() === 'LONG' ? 'Long' : 'Short') as HoldingPeriod;

    id++;

    if (currency === 'USD') {
      lots.push({
        id: `sold-${id}`,
        acquisitionDate,
        saleDate,
        quantity,
        proceeds: 0,
        costBasis: 0,
        gainLoss: 0,
        proceedsUsd: proceeds,
        costBasisUsd: costBasis,
        holdingPeriod,
        origin: 'DO',
        planType: 'qualified_macron',
        importCurrency: 'USD',
      });
    } else {
      lots.push({
        id: `sold-${id}`,
        acquisitionDate,
        saleDate,
        quantity,
        proceeds,
        costBasis,
        gainLoss,
        holdingPeriod,
        origin: 'DO',
        planType: 'qualified_macron',
        importCurrency: 'EUR',
      });
    }
  }

  return lots;
}
