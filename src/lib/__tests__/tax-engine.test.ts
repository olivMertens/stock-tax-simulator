import { describe, it, expect } from 'vitest';
import {
  isQualifiedStockAward,
  calculateLotTax,
  calculateAcquisitionGainTax,
  calculateCapitalGainTax,
  runSimulation,
  rankLotsForSale,
} from '../tax-engine';
import type { StockLot, SaleLotEntry, SaleSimulation } from '../types';

// ---------- Helpers ----------

function makeLot(overrides: Partial<StockLot> = {}): StockLot {
  return {
    id: 'lot-1',
    broker: 'fidelity',
    acquisitionDate: new Date(2023, 0, 15),
    quantity: 100,
    costBasisPerShare: 250,
    totalCostBasis: 25000,
    currentValue: 40000,
    unrealizedGainLoss: 15000,
    origin: 'DO',
    holdingPeriod: 'Short',
    planType: 'qualified_macron',
    ...overrides,
  };
}

function makeEntry(lot: StockLot, qty?: number, price?: number): SaleLotEntry {
  return {
    lot,
    quantitySold: qty ?? lot.quantity,
    salePricePerShare: price ?? 400,
  };
}

function makeSimulation(entries: SaleLotEntry[], overrides: Partial<SaleSimulation> = {}): SaleSimulation {
  return {
    lots: entries,
    taxMode: 'pfu',
    otherTaxableIncome: 80000,
    taxShares: 2,
    familyStatus: 'couple',
    priorLosses: 0,
    fiscalYear: 2025,
    ...overrides,
  };
}

// ---------- isQualifiedStockAward ----------

describe('isQualifiedStockAward', () => {
  it('FM is always qualified', () => {
    expect(isQualifiedStockAward(makeLot({ origin: 'FM' }))).toBe(true);
  });

  it('FQ is always qualified', () => {
    expect(isQualifiedStockAward(makeLot({ origin: 'FQ' }))).toBe(true);
  });

  it('DO with qualified_macron is qualified', () => {
    expect(isQualifiedStockAward(makeLot({ origin: 'DO', planType: 'qualified_macron' }))).toBe(true);
  });

  it('DO with non_qualified is not qualified', () => {
    expect(isQualifiedStockAward(makeLot({ origin: 'DO', planType: 'non_qualified' }))).toBe(false);
  });

  it('SP is never qualified (returns false)', () => {
    expect(isQualifiedStockAward(makeLot({ origin: 'SP' }))).toBe(false);
  });
});

// ---------- calculateLotTax ----------

describe('calculateLotTax', () => {
  describe('Input validation', () => {
    it('handles negative quantitySold by clamping to 0', () => {
      const lot = makeLot({ origin: 'SP', planType: 'non_qualified' });
      const result = calculateLotTax(makeEntry(lot, -5, 400));
      expect(result.proceeds).toBe(0);
      expect(result.capitalGain).toBe(0);
      expect(result.acquisitionGain).toBe(0);
    });

    it('handles negative price by clamping to 0', () => {
      const lot = makeLot({ origin: 'SP', planType: 'non_qualified' });
      const result = calculateLotTax(makeEntry(lot, 10, -100));
      expect(result.proceeds).toBe(0);
    });
  });

  describe('ESPP (SP)', () => {
    it('uses FMV (not discounted cost basis) for capital gain', () => {
      // costBasis = 90 (discounted), FMV = 100 (before 10% discount)
      const lot = makeLot({ origin: 'SP', costBasisPerShare: 90, esppFmvPerShare: 100, planType: 'non_qualified' });
      const result = calculateLotTax(makeEntry(lot, 10, 400));
      expect(result.acquisitionGain).toBe(0);
      expect(result.capitalGain).toBe(10 * (400 - 100)); // 3,000 (not 3,100)
      expect(result.proceeds).toBe(10 * 400); // 4,000
    });

    it('falls back to costBasis when FMV is not set', () => {
      const lot = makeLot({ origin: 'SP', costBasisPerShare: 200, planType: 'non_qualified' });
      const result = calculateLotTax(makeEntry(lot, 10, 400));
      expect(result.acquisitionGain).toBe(0);
      expect(result.capitalGain).toBe(10 * (400 - 200)); // 2,000
      expect(result.proceeds).toBe(10 * 400); // 4,000
    });

    it('handles capital loss with FMV', () => {
      const lot = makeLot({ origin: 'SP', costBasisPerShare: 450, esppFmvPerShare: 500, planType: 'non_qualified' });
      const result = calculateLotTax(makeEntry(lot, 10, 400));
      expect(result.capitalGain).toBe(10 * (400 - 500)); // -1,000
      expect(result.acquisitionGain).toBe(0);
    });
  });

  describe('Qualified AGA (DO qualified)', () => {
    it('calculates acquisition gain = cost basis and capital gain = sale - cost', () => {
      const lot = makeLot({ origin: 'DO', planType: 'qualified_macron', costBasisPerShare: 250 });
      const result = calculateLotTax(makeEntry(lot, 10, 400));
      // Acquisition gain = qty * costBasis (free shares, cost basis = vesting value)
      expect(result.acquisitionGain).toBe(10 * 250); // 2,500
      expect(result.capitalGain).toBe(10 * (400 - 250)); // 1,500
      expect(result.proceeds).toBe(10 * 400); // 4,000
    });

    it('offsets acquisition gain with capital loss', () => {
      const lot = makeLot({ origin: 'DO', planType: 'qualified_macron', costBasisPerShare: 250 });
      // Sale price below cost basis → capital loss
      const result = calculateLotTax(makeEntry(lot, 10, 200));
      // Raw acq gain = 10 * 250 = 2,500
      // Raw cap gain = 10 * (200 - 250) = -500
      // Net acq gain = max(0, 2500 + (-500)) = 2,000
      // Net cap gain = min(0, -500 + 2500) = 0
      expect(result.acquisitionGain).toBe(2000);
      expect(result.capitalGain).toBe(0);
    });

    it('handles total loss exceeding acquisition gain', () => {
      const lot = makeLot({ origin: 'DO', planType: 'qualified_macron', costBasisPerShare: 250 });
      // Sale price 0 → total loss
      const result = calculateLotTax(makeEntry(lot, 10, 0));
      // Raw acq gain = 2,500, Raw cap gain = -2,500
      // Net acq gain = max(0, 2500 - 2500) = 0
      // Net cap gain = min(0, -2500 + 2500) = 0
      expect(result.acquisitionGain).toBe(0);
      expect(result.capitalGain).toBe(0);
    });

    it('handles sale price far below cost → negative remains', () => {
      const lot = makeLot({ origin: 'FM', planType: 'qualified_macron', costBasisPerShare: 100 });
      // costBasis = 100, but sell at 50 (very low)
      // Raw acq = 10 * 100 = 1000, raw cap = 10 * (50 - 100) = -500
      // net acq = max(0, 1000 - 500) = 500
      // net cap = min(0, -500 + 1000) = 0
      const result = calculateLotTax(makeEntry(lot, 10, 50));
      expect(result.acquisitionGain).toBe(500);
      expect(result.capitalGain).toBe(0);
    });
  });

  describe('Non-qualified DO', () => {
    it('has no acquisition gain, only capital gain', () => {
      const lot = makeLot({ origin: 'DO', planType: 'non_qualified', costBasisPerShare: 300 });
      const result = calculateLotTax(makeEntry(lot, 10, 400));
      expect(result.acquisitionGain).toBe(0);
      expect(result.capitalGain).toBe(10 * (400 - 300)); // 1,000
    });
  });
});

// ---------- calculateAcquisitionGainTax ----------

describe('calculateAcquisitionGainTax', () => {
  it('returns zeros for no acquisition gain', () => {
    const result = calculateAcquisitionGainTax(0, 80000, 2, 'qualified_macron');
    expect(result.total).toBe(0);
    expect(result.below300k).toBe(0);
    expect(result.above300k).toBe(0);
  });

  it('returns zeros for negative acquisition gain', () => {
    const result = calculateAcquisitionGainTax(-5000, 80000, 2, 'qualified_macron');
    expect(result.total).toBe(0);
  });

  describe('Macron regime (≤300k)', () => {
    it('applies 50% abatement for Short holding', () => {
      const result = calculateAcquisitionGainTax(100000, 80000, 2, 'qualified_macron', undefined, 0.5);
      expect(result.below300k).toBe(100000);
      expect(result.above300k).toBe(0);
      expect(result.abatement50).toBe(50000); // 50% of 100k
      // PS patrimoine on full amount
      expect(result.psBelow).toBeCloseTo(100000 * 0.186, 2);
    });

    it('applies 0 % abatement when caller signals < 2 years held (KPMG p. 27)', () => {
      const result = calculateAcquisitionGainTax(100000, 80000, 2, 'qualified_macron', undefined, 0);
      expect(result.abatement50).toBe(0); // 100% taxable in 1TZ
      expect(result.below300k).toBe(100000);
    });
  });

  describe('Macron regime (>300k)', () => {
    it('splits correctly at 300k threshold', () => {
      const result = calculateAcquisitionGainTax(500000, 80000, 2, 'qualified_macron', undefined, 0.5);
      expect(result.below300k).toBe(300000);
      expect(result.above300k).toBe(200000);
      expect(result.abatement50).toBe(150000); // 50% of 300k
      // PS activité on above-300k portion
      expect(result.psAbove).toBeCloseTo(200000 * 0.111, 2);
      // Salary contribution on above-300k
      expect(result.salaryContribution).toBeCloseTo(200000 * 0.10, 2);
    });
  });

  describe('Pre-Macron regime', () => {
    it('handles grant before 28/09/2012', () => {
      const grantDate = new Date(2012, 0, 1); // Jan 2012
      const result = calculateAcquisitionGainTax(100000, 80000, 2, 'qualified_pre_macron', grantDate);
      expect(result.below300k).toBe(100000);
      expect(result.above300k).toBe(0);
      expect(result.abatement50).toBe(0); // No abatement for pre-Macron
      expect(result.psBelow).toBeCloseTo(100000 * 0.186, 2); // PS patrimoine
      expect(result.salaryContribution).toBeCloseTo(100000 * 0.10, 2);
    });

    it('handles grant after 28/09/2012 (PS activité)', () => {
      const grantDate = new Date(2013, 0, 1); // Jan 2013
      const result = calculateAcquisitionGainTax(100000, 80000, 2, 'qualified_pre_macron', grantDate);
      expect(result.psBelow).toBeCloseTo(100000 * 0.111, 2); // PS activité, not patrimoine
    });
  });

  it('computes deductible CSG on total acquisition gain', () => {
    const result = calculateAcquisitionGainTax(200000, 80000, 2, 'qualified_macron', undefined, 0.5);
    expect(result.deductibleCSG).toBeCloseTo(200000 * 0.082, 2);
  });
});

// ---------- calculateCapitalGainTax ----------

describe('calculateCapitalGainTax', () => {
  it('returns zeros for zero capital gain', () => {
    const result = calculateCapitalGainTax(0, 0, 'pfu', 80000, 2);
    expect(result.total).toBe(0);
    expect(result.netGain).toBe(0);
    expect(result.remainingLosses).toBe(0);
  });

  it('carries forward loss for negative capital gain', () => {
    const result = calculateCapitalGainTax(-5000, 3000, 'pfu', 80000, 2);
    expect(result.total).toBe(0);
    expect(result.netLoss).toBe(5000);
    expect(result.remainingLosses).toBe(8000); // prior + current loss
  });

  describe('PFU mode', () => {
    it('applies flat 12.8% IR + 18.6% PS', () => {
      const result = calculateCapitalGainTax(10000, 0, 'pfu', 80000, 2);
      expect(result.ir).toBeCloseTo(10000 * 0.128, 2);
      expect(result.ps).toBeCloseTo(10000 * 0.186, 2);
      expect(result.total).toBeCloseTo(10000 * 0.314, 2);
      expect(result.deductibleCSG).toBe(0); // No CSG deductible under PFU
    });

    it('offsets prior losses', () => {
      const result = calculateCapitalGainTax(10000, 3000, 'pfu', 80000, 2);
      expect(result.netGain).toBe(7000);
      expect(result.ir).toBeCloseTo(7000 * 0.128, 2);
      expect(result.ps).toBeCloseTo(7000 * 0.186, 2);
      expect(result.remainingLosses).toBe(0);
    });

    it('carries remaining losses if prior > gain', () => {
      const result = calculateCapitalGainTax(5000, 8000, 'pfu', 80000, 2);
      expect(result.netGain).toBe(0);
      expect(result.total).toBe(0);
      expect(result.remainingLosses).toBe(3000);
    });
  });

  describe('Barème mode', () => {
    it('applies progressive scale and calculates deductible CSG', () => {
      const result = calculateCapitalGainTax(10000, 0, 'bareme', 80000, 2);
      expect(result.ps).toBeCloseTo(10000 * 0.186, 2);
      expect(result.deductibleCSG).toBeCloseTo(10000 * 0.082, 2);
      // IR should be the marginal tax on 10,000€ above 80,000€ base (for 2 shares)
      expect(result.ir).toBeGreaterThan(0);
    });

    it('accounts for acquisition gain taxable income in base', () => {
      const result1 = calculateCapitalGainTax(10000, 0, 'bareme', 80000, 2, 0);
      const result2 = calculateCapitalGainTax(10000, 0, 'bareme', 80000, 2, 50000);
      // Higher base income → higher marginal rate → more IR
      expect(result2.ir).toBeGreaterThanOrEqual(result1.ir);
    });
  });
});

// ---------- runSimulation ----------

describe('runSimulation', () => {
  it('aggregates proceeds from multiple lots', () => {
    const lot1 = makeLot({ id: 'lot-1', origin: 'SP', planType: 'non_qualified', costBasisPerShare: 200 });
    const lot2 = makeLot({ id: 'lot-2', origin: 'DO', planType: 'qualified_macron', costBasisPerShare: 250 });
    const entries = [makeEntry(lot1, 10, 400), makeEntry(lot2, 5, 400)];
    const sim = makeSimulation(entries);
    const result = runSimulation(sim);

    expect(result.totalProceeds).toBe(10 * 400 + 5 * 400); // 6,000
    expect(result.lotResults).toHaveLength(2);
  });

  it('calculates effective tax rate correctly', () => {
    const lot = makeLot({ origin: 'SP', planType: 'non_qualified', costBasisPerShare: 200 });
    const entries = [makeEntry(lot, 10, 400)];
    const sim = makeSimulation(entries, { taxMode: 'pfu' });
    const result = runSimulation(sim);

    expect(result.effectiveTaxRate).toBeCloseTo(
      (result.totalTax / result.totalProceeds) * 100,
      2
    );
  });

  it('handles mixed SP + AGA lots', () => {
    const spLot = makeLot({ id: 'sp', origin: 'SP', planType: 'non_qualified', costBasisPerShare: 300 });
    const agaLot = makeLot({ id: 'aga', origin: 'FM', planType: 'qualified_macron', costBasisPerShare: 200 });
    const entries = [makeEntry(spLot, 5, 400), makeEntry(agaLot, 5, 400)];
    const result = runSimulation(makeSimulation(entries));

    // SP: acq gain 0, cap gain = 5*(400-300) = 500
    // AGA: acq gain = 5*200 = 1000, cap gain = 5*(400-200) = 1000
    expect(result.totalAcquisitionGain).toBe(1000);
    expect(result.totalCapitalGain).toBe(500 + 1000);
    expect(result.netAmount).toBe(result.totalProceeds - result.totalTax);
  });

  it('always uses 50% abatement for Macron regime regardless of holding period', () => {
    const shortLot = makeLot({ id: 'short', holdingPeriod: 'Short', costBasisPerShare: 250, origin: 'FM' });
    const longLot = makeLot({ id: 'long', holdingPeriod: 'Long', costBasisPerShare: 250, origin: 'FM' });
    const entriesShort = [makeEntry(shortLot, 10, 400)];
    const entriesMixed = [makeEntry(shortLot, 10, 400), makeEntry(longLot, 10, 400)];

    const resultShort = runSimulation(makeSimulation(entriesShort));
    const resultMixed = runSimulation(makeSimulation(entriesMixed));

    // Macron AGA: fixed 50% abatement on acquisition gain, no Long/Short distinction
    const acqGainShort = resultShort.totalAcquisitionGain;
    const acqGainMixed = resultMixed.totalAcquisitionGain;
    expect(resultShort.acquisitionGainTax.abatement50).toBeCloseTo(acqGainShort * 0.5, 0);
    expect(resultMixed.acquisitionGainTax.abatement50).toBeCloseTo(acqGainMixed * 0.5, 0);
  });

  it('applies prior losses to capital gains', () => {
    const lot = makeLot({ origin: 'SP', planType: 'non_qualified', costBasisPerShare: 300 });
    const entries = [makeEntry(lot, 10, 400)];
    const noPrior = runSimulation(makeSimulation(entries, { priorLosses: 0, taxMode: 'pfu' }));
    const withPrior = runSimulation(makeSimulation(entries, { priorLosses: 500, taxMode: 'pfu' }));

    expect(withPrior.totalTax).toBeLessThan(noPrior.totalTax);
  });

  it('handles taxShares = 0 without crashing (clamped to 1)', () => {
    const lot = makeLot({ origin: 'SP', planType: 'non_qualified', costBasisPerShare: 300 });
    const entries = [makeEntry(lot, 10, 400)];
    const sim = makeSimulation(entries, { taxShares: 0 });
    const result = runSimulation(sim);
    // Should not throw, and should produce valid results
    expect(result.totalTax).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(result.effectiveTaxRate)).toBe(true);
  });

  it('returns 0% effective rate for zero proceeds', () => {
    const lot = makeLot({ origin: 'SP', planType: 'non_qualified', costBasisPerShare: 400, quantity: 0 });
    const entries = [makeEntry(lot, 0, 400)];
    const result = runSimulation(makeSimulation(entries));
    expect(result.effectiveTaxRate).toBe(0);
  });
});

// ---------- rankLotsForSale ----------

describe('rankLotsForSale', () => {
  it('returns empty array for empty lots', () => {
    const result = rankLotsForSale([], 400, 80000, 2, 'couple', 0, 2025);
    expect(result).toEqual([]);
  });

  it('returns empty for zero price', () => {
    const result = rankLotsForSale([makeLot()], 0, 80000, 2, 'couple', 0, 2025);
    expect(result).toEqual([]);
  });

  it('ranks lots by effective tax rate ascending', () => {
    const spLot = makeLot({ id: 'sp', origin: 'SP', costBasisPerShare: 350, planType: 'non_qualified' });
    const agaLot = makeLot({ id: 'aga', origin: 'FM', costBasisPerShare: 200, planType: 'qualified_macron' });
    const rankings = rankLotsForSale([spLot, agaLot], 400, 80000, 2, 'couple', 0, 2025);

    expect(rankings).toHaveLength(2);
    // Should be sorted ascending by bestRate
    expect(rankings[0].bestRate).toBeLessThanOrEqual(rankings[1].bestRate);
  });

  it('includes best mode recommendation', () => {
    const lot = makeLot({ origin: 'SP', costBasisPerShare: 300, planType: 'non_qualified' });
    const rankings = rankLotsForSale([lot], 400, 80000, 2, 'couple', 0, 2025);
    expect(rankings[0].bestMode).toMatch(/^(pfu|bareme)$/);
  });

  it('warns when cumulative acquisition gain exceeds 300k', () => {
    // Lot with very high acquisition gain (large quantity, high cost basis)
    const lot = makeLot({
      id: 'big',
      origin: 'FM',
      costBasisPerShare: 350,
      quantity: 1000,
      planType: 'qualified_macron',
    });
    const rankings = rankLotsForSale([lot], 400, 80000, 2, 'couple', 0, 2025);
    // Acquisition gain = 1000 * 350 = 350,000 > 300,000
    const warnings = rankings[0].warnings;
    expect(warnings.some((w) => /300[\s\u00a0\u202f]000/.test(w))).toBe(true);
  });
});
