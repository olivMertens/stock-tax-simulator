import { describe, it, expect } from 'vitest';
import { calculateAcquisitionGainTax } from '../acquisition-tax';
import { runSimulation } from '../tax-engine';
import { getTaxConfig, AGA_THRESHOLD } from '../tax-rates';
import type { StockLot, SaleLotEntry, SaleSimulation } from '../types';

const cfg2025 = getTaxConfig(2025);

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
  return { lot, quantitySold: qty ?? lot.quantity, salePricePerShare: price ?? 400 };
}

function makeSim(entries: SaleLotEntry[], overrides: Partial<SaleSimulation> = {}): SaleSimulation {
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

// ---------------------------------------------------------------------------
// Edge cases — Acquisition gain: the 300 k€ AGA threshold (off-by-one risks)
// ---------------------------------------------------------------------------

describe('Acquisition gain — 300 k€ threshold edge cases', () => {
  it('gain exactly at 300 000 € stays fully below threshold', () => {
    const r = calculateAcquisitionGainTax(AGA_THRESHOLD, 0, 1, 'qualified_macron', undefined, 0.5, cfg2025);
    expect(r.below300k).toBe(AGA_THRESHOLD);
    expect(r.above300k).toBe(0);
    expect(r.salaryContribution).toBe(0);
  });

  it('gain at 300 001 € puts exactly 1 € above threshold', () => {
    const r = calculateAcquisitionGainTax(AGA_THRESHOLD + 1, 0, 1, 'qualified_macron', undefined, 0.5, cfg2025);
    expect(r.below300k).toBe(AGA_THRESHOLD);
    expect(r.above300k).toBe(1);
    expect(r.salaryContribution).toBeCloseTo(1 * cfg2025.salaryContributionRate, 4);
  });

  it('gain at 299 999 € stays fully below with no salary contribution', () => {
    const r = calculateAcquisitionGainTax(AGA_THRESHOLD - 1, 0, 1, 'qualified_macron', undefined, 0.5, cfg2025);
    expect(r.below300k).toBe(AGA_THRESHOLD - 1);
    expect(r.above300k).toBe(0);
    expect(r.salaryContribution).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Edge cases — Pre-Macron FQ granted before/after sep 28, 2012
// ---------------------------------------------------------------------------

describe('FQ pre/post 28-sep-2012 boundary', () => {
  it('grant on 2012-09-27 (before) applies PS patrimoine', () => {
    const r = calculateAcquisitionGainTax(
      50000, 0, 1, 'qualified_pre_macron', new Date(2012, 8, 27), 0.5, cfg2025
    );
    expect(r.psBelow).toBeCloseTo(50000 * cfg2025.psPatrimoine, 2);
  });

  it('grant on 2012-09-28 (boundary) falls into the post-sep path (PS activité)', () => {
    const r = calculateAcquisitionGainTax(
      50000, 0, 1, 'qualified_pre_macron', new Date(2012, 8, 28), 0.5, cfg2025
    );
    expect(r.psBelow).toBeCloseTo(50000 * cfg2025.psActivite, 2);
  });

  it('grant on 2012-09-29 (after) applies PS activité', () => {
    const r = calculateAcquisitionGainTax(
      50000, 0, 1, 'qualified_pre_macron', new Date(2012, 8, 29), 0.5, cfg2025
    );
    expect(r.psBelow).toBeCloseTo(50000 * cfg2025.psActivite, 2);
  });
});

// ---------------------------------------------------------------------------
// Edge cases — Mixing FM and FQ lots in the same simulation
// ---------------------------------------------------------------------------

describe('Mixed FM + FQ simulation', () => {
  it('applies Macron abatement only to FM portion, not FQ', () => {
    // FM lot: acquisition gain = quantity * costBasis = 100 * 200 = 20 000
    const fmLot = makeLot({
      id: 'fm',
      origin: 'FM',
      planType: 'qualified_macron',
      quantity: 100,
      costBasisPerShare: 200,
    });
    // FQ lot: no Macron abatement applies
    const fqLot = makeLot({
      id: 'fq',
      origin: 'FQ',
      planType: 'qualified_pre_macron',
      quantity: 100,
      costBasisPerShare: 200,
      grantDate: new Date(2015, 0, 1),
    });

    const entries = [makeEntry(fmLot, 100, 400), makeEntry(fqLot, 100, 400)];
    const result = runSimulation(makeSim(entries));

    // FM Macron abatement should be 20 000 * 50% = 10 000
    expect(result.acquisitionGainTax.abatement50).toBeCloseTo(10000, 0);
  });

  it('mixed FM + FQ — totals are coherent (sum of lot results)', () => {
    const fmLot = makeLot({ id: 'fm', origin: 'FM', quantity: 50, costBasisPerShare: 100 });
    const fqLot = makeLot({
      id: 'fq', origin: 'FQ', planType: 'qualified_pre_macron',
      quantity: 50, costBasisPerShare: 100,
      grantDate: new Date(2015, 0, 1),
    });
    const entries = [makeEntry(fmLot, 50, 400), makeEntry(fqLot, 50, 400)];
    const result = runSimulation(makeSim(entries));

    const sumAcqGain = result.lotResults.reduce((s, r) => s + r.acquisitionGain, 0);
    const sumCapGain = result.lotResults.reduce((s, r) => s + r.capitalGain, 0);
    expect(result.totalAcquisitionGain).toBeCloseTo(sumAcqGain, 2);
    expect(result.totalCapitalGain).toBeCloseTo(sumCapGain, 2);
  });
});

// ---------------------------------------------------------------------------
// Edge cases — Capital loss scenarios in runSimulation
// ---------------------------------------------------------------------------

describe('Capital loss in runSimulation', () => {
  it('sale below cost basis: capital gain tax is 0 and loss is tracked', () => {
    const lot = makeLot({ origin: 'SP', planType: 'non_qualified', costBasisPerShare: 500 });
    const entries = [makeEntry(lot, 100, 300)]; // loss of 20 000 €
    const result = runSimulation(makeSim(entries));

    expect(result.capitalGainTax.total).toBe(0);
    expect(result.capitalGainTax.netLoss).toBeGreaterThan(0);
  });

  it('prior losses fully offset current gain', () => {
    const lot = makeLot({ origin: 'SP', planType: 'non_qualified', costBasisPerShare: 300 });
    const entries = [makeEntry(lot, 100, 400)]; // gain of 10 000 €
    const result = runSimulation(makeSim(entries, { priorLosses: 15000 }));

    expect(result.capitalGainTax.netGain).toBe(0);
    expect(result.capitalGainTax.total).toBe(0);
    expect(result.capitalGainTax.remainingLosses).toBe(5000);
  });
});
