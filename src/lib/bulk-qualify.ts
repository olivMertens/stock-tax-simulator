import type { PlanType, SoldLot, StockLot, StockOrigin } from './types';

/**
 * User intent for bulk-requalifying a set of lots:
 *   - 'uniform': apply the same (origin, planType) to every eligible lot.
 *   - 'byDate':  split on a pivot acquisition date — typically used to mark
 *                everything vested before the Macron law cut-off as
 *                pré-Macron and the rest as Macron.
 */
export type BulkQualifyChoice =
  | { kind: 'uniform'; origin: StockOrigin; planType: PlanType }
  | {
      kind: 'byDate';
      /** Pivot acquisition date. Lots strictly before are classified by `before`, others by `after`. */
      pivotDate: Date;
      before: { origin: StockOrigin; planType: PlanType };
      after: { origin: StockOrigin; planType: PlanType };
    };

/** Loose shape so the helpers can operate on either StockLot or SoldLot. */
interface QualifiableLot {
  acquisitionDate: Date;
  origin: StockOrigin;
  planType: PlanType;
  reconciled?: boolean;
}

/**
 * Bulk-qualification only touches lots that the user genuinely needs to
 * decide for: ESPP (origin SP) is self-describing in the broker exports,
 * and lots already reconciled against StockExport carry an authoritative
 * classification we must not silently overwrite.
 */
export function isEligibleForBulk(lot: QualifiableLot): boolean {
  return !lot.reconciled && lot.origin !== 'SP';
}

export function countEligible(items: QualifiableLot[]): number {
  return items.filter(isEligibleForBulk).length;
}

/**
 * Apply a BulkQualifyChoice to a list of lots, leaving non-eligible lots
 * (ESPP / already reconciled) untouched. Generic over StockLot | SoldLot
 * so the same engine drives bulk requalification of open positions and
 * realised sales.
 */
export function applyBulkChoice<T extends QualifiableLot>(items: T[], choice: BulkQualifyChoice): T[] {
  return items.map((item) => {
    if (!isEligibleForBulk(item)) return item;
    if (choice.kind === 'uniform') {
      return { ...item, origin: choice.origin, planType: choice.planType };
    }
    const target = item.acquisitionDate.getTime() < choice.pivotDate.getTime() ? choice.before : choice.after;
    return { ...item, origin: target.origin, planType: target.planType };
  });
}

/** Convenience wrapper for typed call sites. */
export function applyBulkChoiceToLots(lots: StockLot[], choice: BulkQualifyChoice): StockLot[] {
  return applyBulkChoice(lots, choice);
}

export function applyBulkChoiceToSoldLots(soldLots: SoldLot[], choice: BulkQualifyChoice): SoldLot[] {
  return applyBulkChoice(soldLots, choice);
}
