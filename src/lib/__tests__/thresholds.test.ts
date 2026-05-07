import { describe, it, expect } from 'vitest';
import { analyzeThresholds } from '../thresholds';
import type { TaxSimulationResult } from '../types';

function makeResult(overrides: Partial<TaxSimulationResult> = {}): TaxSimulationResult {
  return {
    totalProceeds: 0,
    totalAcquisitionGain: 0,
    totalCapitalGain: 0,
    acquisitionGainTax: {
      below300k: 0, above300k: 0, abatement50: 0,
      irBelow: 0, irAbove: 0, psBelow: 0, psAbove: 0,
      salaryContribution: 0, deductibleCSG: 0, total: 0,
    },
    capitalGainTax: {
      grossGain: 0, netGain: 0, ir: 0, ps: 0,
      deductibleCSG: 0, holdingAbatement: 0, total: 0,
      remainingLosses: 0, netLoss: 0,
    },
    cehr: 0,
    cdhr: 0,
    totalTax: 0,
    netAmount: 0,
    effectiveTaxRate: 0,
    lotResults: [],
    taxMode: 'pfu',
    ...overrides,
  };
}

describe('analyzeThresholds', () => {
  it('flags AGA threshold overrun when above300k > 0', () => {
    const r = makeResult({ acquisitionGainTax: { ...makeResult().acquisitionGainTax, above300k: 50000 } });
    const t = analyzeThresholds(r, 2025);
    expect(t.exceedsAgaThreshold).toBe(true);
    expect(t.amountAboveAgaThreshold).toBe(50000);
    expect(t.agaThreshold).toBe(300000);
  });

  it('does not flag AGA when above300k is 0', () => {
    const t = analyzeThresholds(makeResult(), 2025);
    expect(t.exceedsAgaThreshold).toBe(false);
    expect(t.amountAboveAgaThreshold).toBe(0);
  });

  it('flags CEHR when cehr > 0', () => {
    const t = analyzeThresholds(makeResult({ cehr: 1500 }), 2025);
    expect(t.cehrTriggered).toBe(true);
  });

  it('provides single-status CEHR entry threshold 250 000 by default', () => {
    const t = analyzeThresholds(makeResult(), 2025, 'single');
    expect(t.cehrEntryThreshold).toBe(250000);
    expect(t.cehrCoupleEntryThreshold).toBe(500000);
  });

  it('provides couple CEHR entry threshold 500 000 for couple family status', () => {
    const t = analyzeThresholds(makeResult(), 2025, 'couple');
    expect(t.cehrEntryThreshold).toBe(500000);
  });
});
