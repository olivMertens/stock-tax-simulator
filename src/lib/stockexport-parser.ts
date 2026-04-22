import type { GrantInfo, PlanType, StockOrigin, VestEvent } from './types';
import { parseSharedStrings, parseWorksheet, readXlsx, type SheetRow } from './xlsx-reader';

/**
 * Hard limits to prevent a malformed or malicious XLSX from eating RAM / freezing the UI.
 */
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_ROWS = 5000;
const MAX_GRANTS = 200;

/** Columns in the "Award Summary" sheet (position-based, as observed in MS StockExport). */
const AWARD_COL = {
  awardId: 'D',
  awardDate: 'E',
  awardType: 'F',
  awarded: 'G',
  vested: 'I',
  unvested: 'J',
} as const;

/** Columns in the "Vest Schedules" sheet. */
const VEST_COL = {
  awardId: 'D',
  vestDate: 'H',
  vestShares: 'I',
} as const;

/** Macron law takes effect for awards granted on/after 2015-08-07 (JO 2015-08-07). */
const MACRON_START = new Date('2015-08-07T00:00:00Z');

export interface ParsedStockExport {
  grants: GrantInfo[];
  /** Warnings surfaced to the user (unknown award types, unmatched vest rows, etc.). */
  warnings: string[];
}

/**
 * Read and parse a Microsoft StockExport .xlsx file.
 * Never throws on malformed rows — accumulates warnings and returns what could be parsed.
 * Throws only on fatal structural issues (wrong file, corrupted ZIP, oversized input).
 */
export async function parseStockExportFile(file: File): Promise<ParsedStockExport> {
  if (file.size === 0) throw new Error('Le fichier StockExport est vide.');
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`Fichier StockExport trop volumineux (${(file.size / 1024 / 1024).toFixed(1)} Mo). Maximum : 5 Mo.`);
  }

  const buffer = await file.arrayBuffer();
  const parts = await readXlsx(buffer, [
    'xl/sharedStrings.xml',
    'xl/worksheets/sheet1.xml',
    'xl/worksheets/sheet2.xml',
  ]);

  const sharedStringsXml = parts.get('xl/sharedStrings.xml');
  const awardXml = parts.get('xl/worksheets/sheet1.xml');
  const vestXml = parts.get('xl/worksheets/sheet2.xml');

  if (!awardXml || !vestXml) {
    throw new Error(
      "Le fichier ne ressemble pas à un export StockExport Microsoft " +
      '(feuilles "Award Summary" ou "Vest Schedules" manquantes).',
    );
  }

  const sharedStrings = sharedStringsXml ? parseSharedStrings(sharedStringsXml) : [];
  const awardRows = parseWorksheet(awardXml, sharedStrings);
  const vestRows = parseWorksheet(vestXml, sharedStrings);

  if (awardRows.length > MAX_ROWS || vestRows.length > MAX_ROWS) {
    throw new Error(`Fichier StockExport anormalement volumineux (> ${MAX_ROWS} lignes).`);
  }

  return buildGrants(awardRows, vestRows);
}

/**
 * Test-friendly variant: operate on already-extracted rows.
 * Kept separate from the file-based entry point to make unit tests trivial.
 */
export function buildGrantsForTest(awardRows: SheetRow[], vestRows: SheetRow[]): ParsedStockExport {
  return buildGrants(awardRows, vestRows);
}

function buildGrants(awardRows: SheetRow[], vestRows: SheetRow[]): ParsedStockExport {
  const warnings: string[] = [];

  // Index vest events by Award ID (plaintext — never leaves this function).
  const vestByAward = new Map<string, VestEvent[]>();
  for (const row of vestRows) {
    if (row.rowIndex === 1) continue; // header
    const awardIdRaw = row.cells[VEST_COL.awardId];
    const dateRaw = row.cells[VEST_COL.vestDate];
    const sharesRaw = row.cells[VEST_COL.vestShares];
    if (!awardIdRaw || !dateRaw || !sharesRaw) continue;

    const date = parseIsoDate(dateRaw);
    const shares = parseNumber(sharesRaw);
    if (!date || !Number.isFinite(shares) || shares <= 0) continue;

    const existing = vestByAward.get(awardIdRaw) ?? [];
    existing.push({ date, shares });
    vestByAward.set(awardIdRaw, existing);
  }

  const grants: GrantInfo[] = [];
  for (const row of awardRows) {
    if (row.rowIndex === 1) continue; // header
    if (grants.length >= MAX_GRANTS) {
      warnings.push(`Limite de ${MAX_GRANTS} grants atteinte — lignes supplémentaires ignorées.`);
      break;
    }

    const awardIdRaw = row.cells[AWARD_COL.awardId];
    const awardDateRaw = row.cells[AWARD_COL.awardDate];
    const awardType = row.cells[AWARD_COL.awardType];
    if (!awardIdRaw || !awardDateRaw || !awardType) continue;

    const awardDate = parseIsoDate(awardDateRaw);
    if (!awardDate) {
      warnings.push(`Date d'attribution invalide pour ${awardType} : "${awardDateRaw}".`);
      continue;
    }

    const totalAwarded = parseNumber(row.cells[AWARD_COL.awarded]) ?? 0;
    const totalVested = parseNumber(row.cells[AWARD_COL.vested]) ?? 0;
    const totalUnvested = parseNumber(row.cells[AWARD_COL.unvested]) ?? 0;

    const vestSchedule = (vestByAward.get(awardIdRaw) ?? []).slice().sort((a, b) => a.date.getTime() - b.date.getTime());

    const { origin, planType } = classifyAward(awardType, awardDate);
    if (origin === 'DO' && planType === 'non_qualified') {
      // Only emit a warning when we truly could not categorise — not for normal SA/ESPP.
      if (!/\b(SA|RSU|ESPP|FQ|FM)\b/i.test(awardType)) {
        warnings.push(`Type d'award inconnu : "${awardType}". Classé comme Stock Award non qualifié par défaut.`);
      }
    }

    grants.push({
      grantIdHash: '', // filled below (async)
      awardType,
      awardDate,
      planType,
      origin,
      vestSchedule,
      totalAwarded,
      totalVested,
      totalUnvested,
    });

    // Stash the plaintext ID on a side channel for the async hash pass.
    (grants[grants.length - 1] as GrantInfo & { __rawAwardId: string }).__rawAwardId = awardIdRaw;
  }

  return { grants, warnings };
}

/**
 * Apply SHA-256 hashing to every grant's Award ID, then strip the plaintext side channel.
 * Must be called before persisting / returning grants to the UI.
 */
export async function hashGrantIds(parsed: ParsedStockExport): Promise<ParsedStockExport> {
  for (const grant of parsed.grants) {
    const raw = (grant as GrantInfo & { __rawAwardId?: string }).__rawAwardId;
    if (!raw) continue;
    grant.grantIdHash = await sha256Hex(raw);
    delete (grant as GrantInfo & { __rawAwardId?: string }).__rawAwardId;
  }
  return parsed;
}

/**
 * Derive origin code + planType from the raw Microsoft award label and date.
 * Conservative by design: anything we don't recognise becomes a non-qualified Stock Award.
 */
export function classifyAward(awardType: string, awardDate: Date): { origin: StockOrigin; planType: PlanType } {
  const label = awardType.toUpperCase();

  if (label.includes('ESPP')) {
    return { origin: 'SP', planType: 'non_qualified' };
  }

  // French Qualified (AGA): Microsoft uses "FQ" in the award type label.
  if (/\bFQ\b/.test(label)) {
    if (awardDate.getTime() >= MACRON_START.getTime()) {
      return { origin: 'FM', planType: 'qualified_macron' };
    }
    return { origin: 'FQ', planType: 'qualified_pre_macron' };
  }

  // Standard Stock Award (US RSU) — not French-qualified.
  if (/\bSA\b/.test(label) || label.includes('RSU') || label.includes('STOCK AWARD')) {
    return { origin: 'DO', planType: 'non_qualified' };
  }

  return { origin: 'DO', planType: 'non_qualified' };
}

/**
 * Parse a date string. Accepts ISO `YYYY-MM-DD` (the format Microsoft uses)
 * and falls back to Excel serial numbers when necessary.
 */
function parseIsoDate(raw: string): Date | undefined {
  const s = raw.trim();
  if (!s) return undefined;

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) {
    const y = parseInt(iso[1], 10);
    const m = parseInt(iso[2], 10) - 1;
    const d = parseInt(iso[3], 10);
    const date = new Date(y, m, d);
    if (date.getFullYear() === y && date.getMonth() === m && date.getDate() === d) return date;
    return undefined;
  }

  // Excel serial date (days since 1899-12-30, accounting for the 1900 leap-year bug).
  const serial = parseFloat(s);
  if (Number.isFinite(serial) && serial > 59 && serial < 80000) {
    const epoch = Date.UTC(1899, 11, 30);
    return new Date(epoch + serial * 86400000);
  }

  return undefined;
}

function parseNumber(raw: string | undefined): number {
  if (raw === undefined) return NaN;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : NaN;
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
