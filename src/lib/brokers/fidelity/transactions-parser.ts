import Papa from 'papaparse';
import type { Broker } from '../../types';

/**
 * A single MSFT dividend event extracted from the Fidelity Transaction History
 * CSV. Each quarterly payment appears as two lines that we pair by date:
 *
 *   DIVIDEND RECEIVED      MICROSOFT CORP   -   $86.04   (gross, positive)
 *   NON-RESIDENT TAX       MICROSOFT CORP   -   -$12.91  (US withholding, negative)
 *
 * Net paid to the brokerage account = gross − tax.
 */
export interface DividendEvent {
  date: Date;
  broker: Broker;
  grossUsd: number;
  taxWithheldUsd: number;
  netUsd: number;
}

/** Interest-like payouts on the Fidelity cash sweep (MMKT fund). Displayed separately. */
export interface CashInterestEvent {
  date: Date;
  broker: Broker;
  amountUsd: number;
}

export interface TransactionHistoryParseResult {
  dividends: DividendEvent[];
  cashInterest: CashInterestEvent[];
  warnings: string[];
}

const CSV_HEADER_MATCHERS = [
  /date.*transaction/i,
  /type.*transaction/i,
  /investissement/i,
  /actions/i,
  /montant/i,
];

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function parseFidelityDate(raw: string): Date | null {
  // Format "Dec-11-2025"
  const m = raw.trim().match(/^([A-Za-z]{3})-(\d{1,2})-(\d{4})$/);
  if (!m) return null;
  const month = MONTHS[m[1].toLowerCase()];
  if (month === undefined) return null;
  const day = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  if (!Number.isFinite(day) || !Number.isFinite(year)) return null;
  return new Date(year, month, day);
}

/**
 * Parses a Fidelity amount string.
 * Accepts "$86.04", "-$12.91", "$1,234.56", "-$1,234.56", "$0.00", "-".
 * Returns NaN for unparseable values.
 */
function parseAmount(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '-') return NaN;
  // Strip $ and thousand-separator commas, keep leading minus if any
  const cleaned = trimmed.replace(/[$\s\u00a0]/g, '').replace(/,/g, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

function isMicrosoftRow(investment: string): boolean {
  return /microsoft\s+corp/i.test(investment);
}

function isMoneyMarketRow(investment: string): boolean {
  return /fid\s+treasury|mmkt|money\s+market/i.test(investment);
}

/**
 * Validate the CSV header matches the expected Fidelity Transaction History format.
 * Raises a friendly error otherwise.
 */
function validateHeader(headerRow: string[]): void {
  if (headerRow.length < 5) {
    throw new Error("En-tête inattendu : le fichier doit contenir au moins 5 colonnes.");
  }
  const headerText = headerRow.join(' ').toLowerCase();
  const misses = CSV_HEADER_MATCHERS.filter((rx) => !rx.test(headerText));
  if (misses.length > 0) {
    throw new Error(
      "En-tête non reconnu. Vérifiez que le fichier provient bien de l'historique des transactions Fidelity en français.",
    );
  }
}

/**
 * Parse the Fidelity Transaction History CSV and extract MSFT dividends + tax
 * withholdings. Robust to:
 *   - additional unrelated rows (ESPP purchases, vest deposits, sales, …)
 *   - dividends from the cash sweep fund (returned separately as `cashInterest`)
 *   - missing tax row (no US withholding → net = gross, tax = 0)
 *   - orphaned NON-RESIDENT TAX lines (warned, not dropped silently)
 */
export function parseTransactionHistoryCsv(content: string): TransactionHistoryParseResult {
  const warnings: string[] = [];

  const parsed = Papa.parse<string[]>(content, {
    skipEmptyLines: true,
    dynamicTyping: false,
  });

  if (!parsed.data.length) {
    return { dividends: [], cashInterest: [], warnings: ['Fichier vide.'] };
  }

  validateHeader(parsed.data[0]);

  const grossByDate = new Map<string, number>();
  const taxByDate = new Map<string, number>();
  const dates = new Map<string, Date>();
  const cashInterest: CashInterestEvent[] = [];

  const MAX_ROWS = 20000;
  if (parsed.data.length > MAX_ROWS) {
    throw new Error(`Fichier trop volumineux (${parsed.data.length} lignes, limite ${MAX_ROWS}).`);
  }

  for (let i = 1; i < parsed.data.length; i++) {
    const row = parsed.data[i];
    if (row.length < 5) continue;
    const [dateRaw, typeRaw, investmentRaw, , amountRaw] = row;

    const date = parseFidelityDate(dateRaw);
    if (!date) continue;

    const type = typeRaw.toUpperCase();
    const amount = parseAmount(amountRaw);
    if (!Number.isFinite(amount)) continue;

    if (type.includes('DIVIDEND RECEIVED')) {
      if (isMicrosoftRow(investmentRaw)) {
        const key = dateRaw;
        grossByDate.set(key, (grossByDate.get(key) ?? 0) + amount);
        dates.set(key, date);
      } else if (isMoneyMarketRow(investmentRaw)) {
        cashInterest.push({ date, broker: 'fidelity', amountUsd: amount });
      }
      continue;
    }

    if (type.includes('NON-RESIDENT TAX')) {
      if (isMicrosoftRow(investmentRaw)) {
        const key = dateRaw;
        // Amounts in the file are negative; store positive withheld amount.
        taxByDate.set(key, (taxByDate.get(key) ?? 0) + Math.abs(amount));
        dates.set(key, date);
      }
      continue;
    }
  }

  // Detect orphan taxes (tax without matching dividend)
  for (const key of taxByDate.keys()) {
    if (!grossByDate.has(key)) {
      warnings.push(`Retenue US du ${key} sans dividende correspondant — ignorée.`);
    }
  }

  const dividends: DividendEvent[] = [];
  for (const [key, gross] of grossByDate.entries()) {
    const tax = taxByDate.get(key) ?? 0;
    const date = dates.get(key)!;
    dividends.push({
      date,
      broker: 'fidelity',
      grossUsd: round2(gross),
      taxWithheldUsd: round2(tax),
      netUsd: round2(gross - tax),
    });
  }

  dividends.sort((a, b) => a.date.getTime() - b.date.getTime());
  cashInterest.sort((a, b) => a.date.getTime() - b.date.getTime());

  return { dividends, cashInterest, warnings };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
