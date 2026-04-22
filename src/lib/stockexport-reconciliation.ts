import type { GrantInfo, PlanType, StockLot, StockOrigin } from './types';

/**
 * Tolerance window when matching Fidelity deposit dates to Microsoft vest dates.
 * Microsoft vests on a fixed schedule (15th or last day of month) but Fidelity
 * deposits the shares a few business days later — observed lag is 0–3 calendar
 * days, so 5 days gives a safety margin for long weekends / holidays without
 * crossing into the next vest event (minimum spacing between distinct vest
 * events in a single grant is ~13 days).
 */
const DATE_MATCH_TOLERANCE_MS = 5 * 24 * 60 * 60 * 1000;

export interface ReconciliationStats {
  reconciled: number;
  ambiguous: number;
  unmatched: number;
  notApplicable: number; // ESPP or already non-qualifiable
}

export interface ReconciliationResult {
  lots: StockLot[];
  stats: ReconciliationStats;
  warnings: string[];
}

/**
 * Apply StockExport grant metadata to a set of Fidelity lots:
 *  - assign planType and refine origin when a grant can be identified by vest date;
 *  - flag lots as `reconciled` so the UI can display them differently;
 *  - keep lots untouched when matching is ambiguous or no grant is found.
 *
 * Strategy: match on vest date only. Quantities don't match 1:1 because Microsoft
 * reports gross vest shares while Fidelity reports net-of-withholding shares.
 * When multiple grants share a vest date but all derive the same planType, we
 * still reconcile (safe ambiguity). Otherwise we abstain.
 */
export function reconcileLots(lots: StockLot[], grants: GrantInfo[]): ReconciliationResult {
  const stats: ReconciliationStats = { reconciled: 0, ambiguous: 0, unmatched: 0, notApplicable: 0 };
  const warnings: string[] = [];

  // Pre-index: vest date (day-granularity) → list of grants having a vest event on that day.
  const byDay = new Map<string, GrantInfo[]>();
  for (const grant of grants) {
    for (const vest of grant.vestSchedule) {
      const key = dayKey(vest.date);
      const list = byDay.get(key) ?? [];
      list.push(grant);
      byDay.set(key, list);
    }
  }

  const out = lots.map((lot) => {
    // ESPP lots are self-describing (Fidelity encodes them as SP with correct metadata).
    if (lot.origin === 'SP') {
      stats.notApplicable++;
      return lot;
    }

    const candidates = findCandidateGrants(lot, byDay);
    if (candidates.length === 0) {
      stats.unmatched++;
      return lot;
    }

    // De-duplicate by grantIdHash (a grant could have several vest events on the same day).
    const uniqueGrants = Array.from(new Map(candidates.map((g) => [g.grantIdHash, g])).values());

    if (uniqueGrants.length === 1) {
      stats.reconciled++;
      return applyGrant(lot, uniqueGrants[0]);
    }

    // Multiple grants — only safe when they all agree on the classification.
    const planTypes = new Set(uniqueGrants.map((g) => g.planType));
    const origins = new Set(uniqueGrants.map((g) => g.origin));
    if (planTypes.size === 1 && origins.size === 1) {
      stats.reconciled++;
      return applyGrant(lot, uniqueGrants[0]);
    }

    stats.ambiguous++;
    warnings.push(
      `Lot du ${lot.acquisitionDate.toLocaleDateString('fr-FR')} : plusieurs grants candidats avec classifications différentes — qualification conservée telle quelle.`,
    );
    return lot;
  });

  return { lots: out, stats, warnings };
}

function findCandidateGrants(lot: StockLot, byDay: Map<string, GrantInfo[]>): GrantInfo[] {
  const key = dayKey(lot.acquisitionDate);
  const sameDay = byDay.get(key);
  if (sameDay && sameDay.length > 0) return sameDay;

  // Tolerant fallback (±1 day) — handles rare timezone edge cases.
  const t = lot.acquisitionDate.getTime();
  const fuzzy: GrantInfo[] = [];
  for (const [k, list] of byDay.entries()) {
    const d = dayFromKey(k);
    if (Math.abs(d.getTime() - t) <= DATE_MATCH_TOLERANCE_MS) fuzzy.push(...list);
  }
  return fuzzy;
}

function applyGrant(lot: StockLot, grant: GrantInfo): StockLot {
  const origin: StockOrigin = grant.origin;
  const planType: PlanType = grant.planType;
  return {
    ...lot,
    origin,
    planType,
    grantIdHash: grant.grantIdHash,
    awardType: grant.awardType,
    reconciled: true,
  };
}

function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function dayFromKey(key: string): Date {
  const [y, m, d] = key.split('-').map((s) => parseInt(s, 10));
  return new Date(y, m - 1, d);
}
