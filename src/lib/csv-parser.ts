import Papa from 'papaparse';
import type { StockLot, StockOrigin, HoldingPeriod, PlanType, SoldLot } from './types';

// Safety guard: reject CSV files with absurd row counts to prevent DoS.
const MAX_CSV_ROWS = 5000;

const MONTH_MAP: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

/** Returns true if the date is strictly after today (local time). */
function isFutureDate(date: Date): boolean {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return date.getTime() > today.getTime();
}

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

function parseFidelityQuantity(qtyStr: string): number {
  if (!qtyStr || !qtyStr.trim()) return 0;
  return parseFloat(qtyStr.trim()) || 0;
}

/**
 * Reassemble amount tokens that may have been split by thousand-separator commas.
 * Expects exactly 4 amounts: totalCost, costPerShare, currentValue, gainLoss.
 * When there are more than 4 tokens (thousand separators created extra fields),
 * tries all valid partitions and picks the most coherent one.
 */
function reassembleAmounts(
  tokens: string[],
  quantity: number,
): { totalCost: number; costPerShare: number; currentValue: number; gainLoss: number } | null {
  const n = tokens.length;
  if (n < 4) return null;

  // Fast path: exactly 4 tokens → no thousand-separator ambiguity
  if (n === 4) {
    const amounts = tokens.map(t => parseFloat(t));
    if (amounts.some(v => isNaN(v))) return null;
    return { totalCost: amounts[0], costPerShare: amounts[1], currentValue: amounts[2], gainLoss: amounts[3] };
  }

  // More than 4 tokens: some commas were thousand separators.
  // Try all ways to place 3 column-separator boundaries among the n−1 comma positions.
  let best: { totalCost: number; costPerShare: number; currentValue: number; gainLoss: number; error: number } | null = null;

  for (let s0 = 0; s0 < n - 3; s0++) {
    for (let s1 = s0 + 1; s1 < n - 2; s1++) {
      for (let s2 = s1 + 1; s2 < n - 1; s2++) {
        const groups = [
          tokens.slice(0, s0 + 1),
          tokens.slice(s0 + 1, s1 + 1),
          tokens.slice(s1 + 1, s2 + 1),
          tokens.slice(s2 + 1),
        ];

        // Validate thousand-separator pattern: within each group, continuation
        // tokens must have exactly 3 digits (last one may also have decimals).
        let valid = true;
        for (const g of groups) {
          for (let i = 1; i < g.length; i++) {
            const pattern = i === g.length - 1 ? /^\d{3}(\.\d+)?$/ : /^\d{3}$/;
            if (!pattern.test(g[i])) { valid = false; break; }
          }
          if (!valid) break;
        }
        if (!valid) continue;

        const amounts = groups.map(g => parseFloat(g.join('')));
        if (amounts.some(v => isNaN(v))) continue;

        const [totalCost, costPerShare, currentValue, gainLoss] = amounts;

        // Coherence: totalCost ≈ quantity × costPerShare
        const expectedCost = quantity * costPerShare;
        const costErr = expectedCost > 0
          ? Math.abs(totalCost - expectedCost) / expectedCost
          : (totalCost > 0 ? 1 : 0);

        // Coherence: gainLoss ≈ currentValue − totalCost
        const expectedGL = currentValue - totalCost;
        const glErr = Math.abs(gainLoss - expectedGL) / Math.max(Math.abs(expectedGL), 1);

        const error = costErr + glErr;
        if (!best || error < best.error) {
          best = { totalCost, costPerShare, currentValue, gainLoss, error };
        }
      }
    }
  }

  return best;
}

function getDefaultPlanType(origin: StockOrigin): PlanType {
  switch (origin) {
    case 'FM': return 'qualified_macron';
    case 'FQ': return 'qualified_pre_macron';
    case 'DO': return 'qualified_macron'; // default, user can change
    case 'SP': return 'non_qualified'; // not applicable for ESPP
  }
}

export function parseCsvFile(csvText: string): StockLot[] {
  // Detect non-USD files via the footer line
  if (/Les valeurs sont affichées en(?!.*USD)/i.test(csvText)) {
    throw new Error('Le fichier CSV doit être en dollars (USD). Veuillez exporter votre fichier depuis Fidelity avec l\'option USD.');
  }

  const result = Papa.parse(csvText, {
    header: false,
    skipEmptyLines: true,
  });

  const rows = result.data as string[][];
  if (rows.length > MAX_CSV_ROWS) {
    throw new Error(`Le fichier contient trop de lignes (${rows.length}). Maximum autorisé : ${MAX_CSV_ROWS}.`);
  }

  const lots: StockLot[] = [];
  let id = 0;

  for (const row of rows) {
    // Skip header row
    if (row[0] === "Date d'acquisition" || row[0] === 'Date d\'acquisition') continue;
    // Skip footer lines
    if (row.join(',').includes('Les valeurs sont affichées en')) continue;
    // Skip empty rows
    if (!row[0] || !row[0].trim()) continue;

    const acquisitionDate = parseFidelityDate(row[0]);
    if (!acquisitionDate) continue;
    // Acquisition date must be in the past (vesting/transfer dates may be future and are OK)
    if (isFutureDate(acquisitionDate)) continue;

    const quantity = parseFidelityQuantity(row[1]);
    if (quantity <= 0) continue;

    const n = row.length;
    if (n < 11) continue; // minimum expected fields

    // Parse fixed fields from the end of the row (unaffected by thousand-separator splits)
    const holdingPeriod = (row[n - 1]?.trim() || 'Short') as HoldingPeriod;
    const origin = (row[n - 2]?.trim() || 'DO') as StockOrigin;
    const grantDate = parseFidelityDate(row[n - 3]);
    const availableForTransferDate = parseFidelityDate(row[n - 4]);
    const availableForSaleDate = parseFidelityDate(row[n - 5]);

    // Middle section: 4 amount fields that may have been split by thousand-separator commas.
    // Also strip any commas preserved by PapaParse inside quoted fields (e.g. "42,200").
    const middleTokens = row.slice(2, n - 5).map(f => f.trim().replace(/,/g, ''));
    const amounts = reassembleAmounts(middleTokens, quantity);
    if (!amounts) continue;

    const { totalCost: totalCostBasis, costPerShare: costBasisPerShare, currentValue } = amounts;

    id++;

    lots.push({
      id: `lot-${id}`,
      acquisitionDate,
      quantity,
      // EUR values will be filled after ECB rate fetch
      costBasisPerShare: 0,
      totalCostBasis: 0,
      currentValue: 0,
      unrealizedGainLoss: 0,
      // ESPP: FMV = cost basis before 10% discount
      esppFmvPerShareUsd: origin === 'SP' ? costBasisPerShare / 0.90 : undefined,
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

export function parseSalesCsvFile(csvText: string): SoldLot[] {
  // Detect non-USD files via the footer line
  if (/Les valeurs sont affichées en(?!.*USD)/i.test(csvText)) {
    throw new Error('Le fichier CSV doit être en dollars (USD). Veuillez exporter votre fichier depuis Fidelity avec l\'option USD.');
  }

  const cleaned = preprocessSalesCsv(csvText);
  const result = Papa.parse(cleaned, {
    header: false,
    skipEmptyLines: true,
  });

  const rows = result.data as string[][];
  if (rows.length > MAX_CSV_ROWS) {
    throw new Error(`Le fichier contient trop de lignes (${rows.length}). Maximum autorisé : ${MAX_CSV_ROWS}.`);
  }

  const lots: SoldLot[] = [];
  let id = 0;

  for (const row of rows) {
    // Skip empty rows
    if (!row[0] || !row[0].trim()) continue;

    const acquisitionDate = parseSalesDate(row[0]);
    if (!acquisitionDate) continue;
    if (isFutureDate(acquisitionDate)) continue;

    const quantity = parseFloat(row[1]?.trim() || '0');
    if (!quantity || quantity <= 0) continue;

    const saleDate = parseSalesDate(row[2]);
    if (!saleDate) continue;
    if (isFutureDate(saleDate)) continue;

    const proceeds = parseSalesAmount(row[3]);
    const costBasis = parseSalesAmount(row[4]);
    const holdingPeriod = (row[6]?.trim()?.toUpperCase() === 'LONG' ? 'Long' : 'Short') as HoldingPeriod;

    id++;

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
  }

  return lots;
}
