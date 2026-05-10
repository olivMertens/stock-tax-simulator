import type { DividendEvent, CashInterestEvent } from './transaction-parser';

/** A dividend event enriched with EUR amounts at the ECB rate of the payment date. */
export interface DividendEventEur extends DividendEvent {
  grossEur: number;
  taxWithheldEur: number;
  netEur: number;
  eurUsdRate: number;
}

export interface DividendYearSummary {
  year: number;
  grossUsd: number;
  taxWithheldUsd: number;
  netUsd: number;
  grossEur: number;
  taxWithheldEur: number;
  netEur: number;
  /** Number of payment events in the year. */
  count: number;
  events: DividendEventEur[];
}

/**
 * Enrich dividend events with EUR amounts using provided ECB rates.
 * `rates` is a map "YYYY-MM-DD" -> EUR/USD rate (1 EUR = rate USD).
 */
export function enrichDividendsWithEur(
  events: DividendEvent[],
  rates: Record<string, number>,
): { enriched: DividendEventEur[]; missingDates: string[] } {
  const missingDates: string[] = [];
  const enriched: DividendEventEur[] = [];
  for (const ev of events) {
    const key = formatKey(ev.date);
    const rate = rates[key];
    if (!rate || !Number.isFinite(rate) || rate <= 0) {
      missingDates.push(key);
      continue;
    }
    enriched.push({
      ...ev,
      eurUsdRate: rate,
      grossEur: round2(ev.grossUsd / rate),
      taxWithheldEur: round2(ev.taxWithheldUsd / rate),
      netEur: round2(ev.netUsd / rate),
    });
  }
  return { enriched, missingDates };
}

/** Group enriched dividend events by calendar year, sorted ascending. */
export function groupDividendsByYear(events: DividendEventEur[]): DividendYearSummary[] {
  const byYear = new Map<number, DividendEventEur[]>();
  for (const ev of events) {
    const y = ev.date.getFullYear();
    const arr = byYear.get(y);
    if (arr) arr.push(ev);
    else byYear.set(y, [ev]);
  }
  return [...byYear.entries()]
    .sort(([a], [b]) => a - b)
    .map(([year, evs]) => ({
      year,
      count: evs.length,
      grossUsd: round2(sum(evs.map((e) => e.grossUsd))),
      taxWithheldUsd: round2(sum(evs.map((e) => e.taxWithheldUsd))),
      netUsd: round2(sum(evs.map((e) => e.netUsd))),
      grossEur: round2(sum(evs.map((e) => e.grossEur))),
      taxWithheldEur: round2(sum(evs.map((e) => e.taxWithheldEur))),
      netEur: round2(sum(evs.map((e) => e.netEur))),
      events: evs,
    }));
}

/**
 * Cases de la déclaration française pour les dividendes de l'année.
 *
 * Codes officiels — cf. `src/lib/tax-forms.ts` (FORM_2042_DIVIDENDS) et KPMG Avocats
 * « Obligations fiscales Microsoft » (mai 2026, slides 38–44).
 *
 *   2DC = montant brut des dividendes (avant retenue à la source US).
 *   2CG = SI PFU → même montant que 2DC (ces revenus ont déjà supporté les PS via PFNL).
 *   2BH = SI option barème (case 2OP) → même montant que 2DC.
 *         ⚠️ 2BH et 2CG sont mutuellement exclusifs : on ne renseigne que l'un des deux.
 *   2AB = crédit d'impôt sur valeurs étrangères (= retenue US, 15 %).
 *   2CK = PFNL trimestriel déjà versé via formulaires 2778-DIV (s'impute sur l'IR).
 *         0 si l'utilisateur a bénéficié de la dispense (RFR N-2 < 50k€ / 75k€).
 *   8VL = impôt payé à l'étranger sur ces revenus (= 2AB, déclaré aussi sur la 2042).
 *   8PL = revenus nets de source étrangère ouvrant droit au crédit d'impôt.
 */
export interface DividendDeclarationLines {
  year: number;
  taxMode: 'pfu' | 'bareme';
  box2DC: number;
  box2CG: number;
  box2BH: number;
  box2AB: number;
  box2CK: number;
  box8VL: number;
  box8PL: number;
}

export interface BuildDeclarationLinesOptions {
  /**
   * Mode d'imposition global (case 2OP). Par défaut PFU.
   * En cas d'option barème, l'option s'applique à TOUS les revenus mobiliers
   * (intérêts, dividendes, plus-values) du foyer.
   */
  taxMode?: 'pfu' | 'bareme';
  /**
   * Montant cumulé du PFNL trimestriel déjà versé en N via les 2778-DIV (case IL).
   * Laisser à 0 si vous bénéficiez de la dispense (RFR N-2 sous seuil) ou si vous
   * ne déposez pas les 2778-DIV.
   */
  pfnlAlreadyPaidEur?: number;
}

export function buildDeclarationLines(
  summary: DividendYearSummary,
  options: BuildDeclarationLinesOptions = {},
): DividendDeclarationLines {
  const taxMode = options.taxMode ?? 'pfu';
  const pfnl = round2(options.pfnlAlreadyPaidEur ?? 0);
  const gross = summary.grossEur;
  const tax = summary.taxWithheldEur;
  const net = summary.netEur;
  return {
    year: summary.year,
    taxMode,
    box2DC: gross,
    box2CG: taxMode === 'pfu' ? gross : 0,
    box2BH: taxMode === 'bareme' ? gross : 0,
    box2AB: tax,
    box2CK: pfnl,
    box8VL: tax,
    box8PL: net,
  };
}

export function totalCashInterestUsd(events: CashInterestEvent[]): number {
  return round2(sum(events.map((e) => e.amountUsd)));
}

function formatKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function sum(arr: number[]): number {
  return arr.reduce((s, n) => s + n, 0);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
