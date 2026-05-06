import { describe, it, expect } from 'vitest';
import {
  applyBulkChoice,
  applyBulkChoiceToLots,
  applyBulkChoiceToSoldLots,
  countEligible,
  isEligibleForBulk,
  type BulkQualifyChoice,
} from '../bulk-qualify';
import type { SoldLot, StockLot } from '../types';

function makeLot(partial: Partial<StockLot> & Pick<StockLot, 'id' | 'acquisitionDate' | 'origin'>): StockLot {
  return {
    broker: 'fidelity',
    quantity: 1,
    costBasisPerShare: 0,
    totalCostBasis: 0,
    currentValue: 0,
    unrealizedGainLoss: 0,
    holdingPeriod: 'Long',
    planType: 'qualified_macron',
    ...partial,
  } as StockLot;
}

function makeSoldLot(partial: Partial<SoldLot> & Pick<SoldLot, 'id' | 'acquisitionDate' | 'origin'>): SoldLot {
  return {
    broker: 'fidelity',
    saleDate: new Date(2025, 5, 1),
    quantity: 1,
    proceeds: 0,
    costBasis: 0,
    gainLoss: 0,
    holdingPeriod: 'Long',
    planType: 'qualified_macron',
    ...partial,
  } as SoldLot;
}

describe('isEligibleForBulk', () => {
  it('excludes ESPP lots (self-describing)', () => {
    expect(isEligibleForBulk({ acquisitionDate: new Date(), origin: 'SP', planType: 'non_qualified' })).toBe(false);
  });

  it('excludes reconciled lots (authoritative classification)', () => {
    expect(isEligibleForBulk({ acquisitionDate: new Date(), origin: 'DO', planType: 'qualified_macron', reconciled: true })).toBe(false);
  });

  it('includes plain DO / FM / FQ lots', () => {
    expect(isEligibleForBulk({ acquisitionDate: new Date(), origin: 'DO', planType: 'qualified_macron' })).toBe(true);
    expect(isEligibleForBulk({ acquisitionDate: new Date(), origin: 'FM', planType: 'qualified_macron' })).toBe(true);
    expect(isEligibleForBulk({ acquisitionDate: new Date(), origin: 'FQ', planType: 'qualified_pre_macron' })).toBe(true);
  });
});

describe('applyBulkChoice — uniform', () => {
  const choice: BulkQualifyChoice = { kind: 'uniform', origin: 'FM', planType: 'qualified_macron' };

  it('rewrites every eligible lot to the chosen origin/planType', () => {
    const lots = [
      makeLot({ id: 'a', acquisitionDate: new Date(2020, 0, 1), origin: 'DO' }),
      makeLot({ id: 'b', acquisitionDate: new Date(2018, 0, 1), origin: 'DO', planType: 'qualified_pre_macron' }),
    ];
    const out = applyBulkChoiceToLots(lots, choice);
    expect(out.every((l) => l.origin === 'FM' && l.planType === 'qualified_macron')).toBe(true);
  });

  it('leaves ESPP and reconciled lots untouched', () => {
    const lots = [
      makeLot({ id: 'espp', acquisitionDate: new Date(2024, 0, 1), origin: 'SP', planType: 'non_qualified' }),
      makeLot({ id: 'reconciled', acquisitionDate: new Date(2020, 0, 1), origin: 'FQ', planType: 'qualified_pre_macron', reconciled: true }),
      makeLot({ id: 'plain', acquisitionDate: new Date(2020, 0, 1), origin: 'DO' }),
    ];
    const out = applyBulkChoiceToLots(lots, choice);
    expect(out[0].origin).toBe('SP');
    expect(out[0].planType).toBe('non_qualified');
    expect(out[1].origin).toBe('FQ');
    expect(out[1].planType).toBe('qualified_pre_macron');
    expect(out[2].origin).toBe('FM');
  });
});

describe('applyBulkChoice — byDate', () => {
  const choice: BulkQualifyChoice = {
    kind: 'byDate',
    pivotDate: new Date(2019, 0, 1),
    before: { origin: 'FQ', planType: 'qualified_pre_macron' },
    after: { origin: 'FM', planType: 'qualified_macron' },
  };

  it('classifies lots strictly before the pivot using `before`, others using `after`', () => {
    const lots = [
      makeLot({ id: 'pre', acquisitionDate: new Date(2018, 11, 31), origin: 'DO' }),
      makeLot({ id: 'pivot', acquisitionDate: new Date(2019, 0, 1), origin: 'DO' }), // pivot itself → after
      makeLot({ id: 'post', acquisitionDate: new Date(2020, 5, 15), origin: 'DO' }),
    ];
    const out = applyBulkChoiceToLots(lots, choice);
    expect(out[0]).toMatchObject({ origin: 'FQ', planType: 'qualified_pre_macron' });
    expect(out[1]).toMatchObject({ origin: 'FM', planType: 'qualified_macron' });
    expect(out[2]).toMatchObject({ origin: 'FM', planType: 'qualified_macron' });
  });

  it('also works on SoldLots', () => {
    const sold = [
      makeSoldLot({ id: 's-pre', acquisitionDate: new Date(2017, 5, 1), origin: 'DO' }),
      makeSoldLot({ id: 's-post', acquisitionDate: new Date(2024, 5, 1), origin: 'DO' }),
    ];
    const out = applyBulkChoiceToSoldLots(sold, choice);
    expect(out[0].planType).toBe('qualified_pre_macron');
    expect(out[1].planType).toBe('qualified_macron');
  });
});

describe('countEligible', () => {
  it('counts only non-ESPP, non-reconciled lots', () => {
    const items = [
      makeLot({ id: '1', acquisitionDate: new Date(), origin: 'DO' }),
      makeLot({ id: '2', acquisitionDate: new Date(), origin: 'SP', planType: 'non_qualified' }),
      makeLot({ id: '3', acquisitionDate: new Date(), origin: 'FM', reconciled: true }),
      makeLot({ id: '4', acquisitionDate: new Date(), origin: 'FQ', planType: 'qualified_pre_macron' }),
    ];
    expect(countEligible(items)).toBe(2);
  });
});

describe('applyBulkChoice — type preservation', () => {
  it('preserves all other StockLot fields', () => {
    const lots: StockLot[] = [
      makeLot({ id: 'a', acquisitionDate: new Date(2020, 0, 1), origin: 'DO', quantity: 42, totalCostBasis: 1234 }),
    ];
    const out = applyBulkChoice(lots, { kind: 'uniform', origin: 'FM', planType: 'qualified_macron' });
    expect(out[0].quantity).toBe(42);
    expect(out[0].totalCostBasis).toBe(1234);
    expect(out[0].id).toBe('a');
  });
});
