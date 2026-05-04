import { describe, it, expect } from 'vitest';
import { rankLotsForSale } from '../lot-ranking';
import type { StockLot } from '../types';

function makeLot(overrides: Partial<StockLot> = {}): StockLot {
  return {
    id: 'lot-1',
    broker: 'fidelity',
    acquisitionDate: new Date(2023, 5, 15),
    quantity: 100,
    costBasisPerShare: 200,
    totalCostBasis: 20000,
    currentValue: 40000,
    unrealizedGainLoss: 20000,
    origin: 'FM',
    holdingPeriod: 'Short',
    planType: 'qualified_macron',
    ...overrides,
  };
}

describe('rankLotsForSale', () => {
  it('returns empty array for zero sale price', () => {
    expect(rankLotsForSale([makeLot()], 0, 50000, 1, 'single', 0, 2025)).toEqual([]);
  });

  it('returns empty array for empty lot list', () => {
    expect(rankLotsForSale([], 400, 50000, 1, 'single', 0, 2025)).toEqual([]);
  });

  it('ranks lots with best (lowest) effective rate first', () => {
    const lots = [
      makeLot({ id: 'lot-a', costBasisPerShare: 100 }), // big gain → high tax
      makeLot({ id: 'lot-b', costBasisPerShare: 350 }), // small gain → low tax
    ];
    const rankings = rankLotsForSale(lots, 400, 50000, 1, 'single', 0, 2025);
    expect(rankings).toHaveLength(2);
    expect(rankings[0].bestRate).toBeLessThanOrEqual(rankings[1].bestRate);
  });

  it('selects the better tax mode between PFU and barème per lot', () => {
    const rankings = rankLotsForSale(
      [makeLot({ origin: 'SP', planType: 'non_qualified' })],
      400, 20000, 1, 'single', 0, 2025
    );
    const r = rankings[0];
    expect(['pfu', 'bareme']).toContain(r.bestMode);
    expect(r.bestRate).toBeLessThanOrEqual(Math.max(r.effectiveTaxRatePfu, r.effectiveTaxRateBareme));
  });

  it('warns when cumulative acquisition gain exceeds 300k€', () => {
    // Each lot contributes ~120k€ acquisition gain (costBasisPerShare × quantity)
    // 3 lots × 120k = 360k → warning should trigger on the 3rd lot.
    const lots = [
      makeLot({ id: 'a', costBasisPerShare: 1200, quantity: 100 }),
      makeLot({ id: 'b', costBasisPerShare: 1200, quantity: 100 }),
      makeLot({ id: 'c', costBasisPerShare: 1200, quantity: 100 }),
    ];
    const rankings = rankLotsForSale(lots, 1500, 50000, 1, 'single', 0, 2025);
    const anyExceedsWarning = rankings.some((r) =>
      r.warnings.some((w) => /300[\s\u00a0\u202f]000/.test(w))
    );
    expect(anyExceedsWarning).toBe(true);
  });

  it('warns when CEHR is triggered (single, > 250k€ RFI)', () => {
    const lot = makeLot({ costBasisPerShare: 500, quantity: 100 }); // ~50k acq gain
    const rankings = rankLotsForSale([lot], 800, 300000, 1, 'single', 0, 2025);
    const hasCehrWarning = rankings[0].warnings.some((w) => w.includes('CEHR'));
    expect(hasCehrWarning).toBe(true);
  });

  it('does not trigger CEHR warning below threshold (single, < 250k€)', () => {
    const lot = makeLot({ costBasisPerShare: 200, quantity: 10 });
    const rankings = rankLotsForSale([lot], 300, 50000, 1, 'single', 0, 2025);
    const hasCehrWarning = rankings[0].warnings.some((w) => w.includes('CEHR'));
    expect(hasCehrWarning).toBe(false);
  });

  it('applies higher CEHR threshold for couples (500k€)', () => {
    const lot = makeLot({ costBasisPerShare: 500, quantity: 100 }); // ~50k acq gain
    const rfiApprox = 300000; // would trigger CEHR for single, not couple
    const singleRanking = rankLotsForSale([lot], 800, rfiApprox, 1, 'single', 0, 2025);
    const coupleRanking = rankLotsForSale([lot], 800, rfiApprox, 2, 'couple', 0, 2025);
    const singleHasCehr = singleRanking[0].warnings.some((w) => w.includes('CEHR'));
    const coupleHasCehr = coupleRanking[0].warnings.some((w) => w.includes('CEHR'));
    expect(singleHasCehr).toBe(true);
    expect(coupleHasCehr).toBe(false);
  });

  it('warns when selling at a loss (capital loss reportable 10 years)', () => {
    // Non-qualified plan so all of the loss shows up as a capital loss
    const lot = makeLot({
      origin: 'SP',
      planType: 'non_qualified',
      costBasisPerShare: 500,
      quantity: 100,
    });
    const rankings = rankLotsForSale([lot], 300, 50000, 1, 'single', 0, 2025);
    const hasLossWarning = rankings[0].warnings.some((w) => w.includes('Moins-value'));
    expect(hasLossWarning).toBe(true);
    expect(rankings[0].capitalGain).toBeLessThan(0);
  });

  it('exposes both PFU and barème tax amounts', () => {
    const rankings = rankLotsForSale([makeLot()], 400, 50000, 1, 'single', 0, 2025);
    expect(rankings[0].totalTaxPfu).toBeGreaterThanOrEqual(0);
    expect(rankings[0].totalTaxBareme).toBeGreaterThanOrEqual(0);
  });

  it('preserves lot reference in ranking', () => {
    const lot = makeLot({ id: 'unique-id' });
    const rankings = rankLotsForSale([lot], 400, 50000, 1, 'single', 0, 2025);
    expect(rankings[0].lot.id).toBe('unique-id');
  });
});
