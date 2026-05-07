import { describe, it, expect } from 'vitest';
import {
  calculateAcquisitionGainTax,
  macronAbatementRateFromHoldingYears,
} from '../acquisition-tax';
import { getTaxConfig, AGA_THRESHOLD } from '../tax-rates';

const cfg2025 = getTaxConfig(2025);

describe('calculateAcquisitionGainTax', () => {
  describe('guards', () => {
    it('returns zeros for zero gain', () => {
      const r = calculateAcquisitionGainTax(0, 50000, 1, 'qualified_macron', undefined, 0.5, cfg2025);
      expect(r.total).toBe(0);
      expect(r.below300k).toBe(0);
      expect(r.above300k).toBe(0);
      expect(r.abatement50).toBe(0);
    });

    it('returns zeros for negative gain', () => {
      const r = calculateAcquisitionGainTax(-1000, 50000, 1, 'qualified_macron', undefined, 0.5, cfg2025);
      expect(r.total).toBe(0);
    });
  });

  describe('Macron regime (qualified_macron)', () => {
    it('applies 50% abatement below 300k€', () => {
      const gain = 100000;
      const r = calculateAcquisitionGainTax(gain, 50000, 1, 'qualified_macron', undefined, 0.5, cfg2025);

      expect(r.below300k).toBe(gain);
      expect(r.above300k).toBe(0);
      expect(r.abatement50).toBe(gain * 0.5);
    });

    it('applies PS patrimoine on full below-300k gain (not abated portion)', () => {
      const gain = 100000;
      const r = calculateAcquisitionGainTax(gain, 50000, 1, 'qualified_macron', undefined, 0.5, cfg2025);
      // 2025 psPatrimoine = 18.6%
      expect(r.psBelow).toBeCloseTo(gain * cfg2025.psPatrimoine, 2);
      expect(r.psAbove).toBe(0);
      expect(r.salaryContribution).toBe(0);
    });

    it('splits gain at the 300k€ threshold', () => {
      const gain = 450000;
      const r = calculateAcquisitionGainTax(gain, 0, 1, 'qualified_macron', undefined, 0.5, cfg2025);

      expect(r.below300k).toBe(AGA_THRESHOLD);
      expect(r.above300k).toBe(150000);
      expect(r.abatement50).toBe(AGA_THRESHOLD * 0.5);
    });

    it('applies salary contribution 10% on fraction above 300k€', () => {
      const gain = 400000;
      const r = calculateAcquisitionGainTax(gain, 0, 1, 'qualified_macron', undefined, 0.5, cfg2025);
      expect(r.salaryContribution).toBeCloseTo(100000 * 0.10, 2);
    });

    it('applies PS activité (not patrimoine) on fraction above 300k€', () => {
      const gain = 400000;
      const r = calculateAcquisitionGainTax(gain, 0, 1, 'qualified_macron', undefined, 0.5, cfg2025);
      // psAbove uses psActivite (11.1% in 2025), not psPatrimoine (18.6%)
      expect(r.psAbove).toBeCloseTo(100000 * cfg2025.psActivite, 2);
      expect(r.psBelow).toBeCloseTo(AGA_THRESHOLD * cfg2025.psPatrimoine, 2);
    });

    it('computes deductible CSG on the full gain', () => {
      const gain = 100000;
      const r = calculateAcquisitionGainTax(gain, 0, 1, 'qualified_macron', undefined, 0.5, cfg2025);
      expect(r.deductibleCSG).toBeCloseTo(gain * cfg2025.csgDeductible, 2);
    });

    it('IR stacks on top of other income (progressive)', () => {
      // With 0 other income, IR on 100k after abatement (50k) should be lower
      // than IR on the same 50k when stacked on top of 100k salary.
      const lowBase = calculateAcquisitionGainTax(100000, 0, 1, 'qualified_macron', undefined, 0.5, cfg2025);
      const highBase = calculateAcquisitionGainTax(100000, 100000, 1, 'qualified_macron', undefined, 0.5, cfg2025);
      expect(highBase.irBelow).toBeGreaterThan(lowBase.irBelow);
    });

    it('total equals sum of IR + PS + salary contribution', () => {
      const r = calculateAcquisitionGainTax(400000, 80000, 1, 'qualified_macron', undefined, 0.5, cfg2025);
      const expected = r.irBelow + r.irAbove + r.psBelow + r.psAbove + r.salaryContribution;
      expect(r.total).toBeCloseTo(expected, 2);
    });

    it('handles multi-share households (taxShares > 1)', () => {
      // Couple (2 shares) should pay less IR than single on same gain
      const single = calculateAcquisitionGainTax(100000, 50000, 1, 'qualified_macron', undefined, 0.5, cfg2025);
      const couple = calculateAcquisitionGainTax(100000, 50000, 2, 'qualified_macron', undefined, 0.5, cfg2025);
      expect(couple.irBelow).toBeLessThan(single.irBelow);
    });
  });

  describe('Macron abatement rate by holding period (KPMG p. 23, 27)', () => {
    it('returns 0 % when held less than 2 years', () => {
      expect(macronAbatementRateFromHoldingYears(0)).toBe(0);
      expect(macronAbatementRateFromHoldingYears(1.99)).toBe(0);
    });
    it('returns 50 % when held between 2 and 8 years', () => {
      expect(macronAbatementRateFromHoldingYears(2)).toBe(0.5);
      expect(macronAbatementRateFromHoldingYears(7.99)).toBe(0.5);
    });
    it('returns 65 % when held 8 years or more', () => {
      expect(macronAbatementRateFromHoldingYears(8)).toBe(0.65);
      expect(macronAbatementRateFromHoldingYears(15)).toBe(0.65);
    });

    it('passes 0 % through when caller signals < 2 years held', () => {
      const gain = 100000;
      const r = calculateAcquisitionGainTax(gain, 50000, 1, 'qualified_macron', undefined, 0, cfg2025);
      expect(r.abatement50).toBe(0);
      // Below-300k stays fully taxable in 1TZ
      expect(r.below300k).toBe(gain);
    });

    it('passes 65 % through when caller signals ≥ 8 years held', () => {
      const gain = 100000;
      const r = calculateAcquisitionGainTax(gain, 50000, 1, 'qualified_macron', undefined, 0.65, cfg2025);
      expect(r.abatement50).toBeCloseTo(gain * 0.65, 2);
    });
  });

  describe('Pre-Macron regime (qualified_pre_macron)', () => {
    it('returns no abatement (abatement50 = 0)', () => {
      const gain = 100000;
      const grantDate = new Date(2015, 0, 1); // post sep-2012
      const r = calculateAcquisitionGainTax(gain, 50000, 1, 'qualified_pre_macron', grantDate, 0.5, cfg2025);
      expect(r.abatement50).toBe(0);
      expect(r.below300k).toBe(gain);
      expect(r.above300k).toBe(0);
    });

    it('post-sep-2012 grant: uses PS activité', () => {
      const gain = 100000;
      const grantDate = new Date(2015, 0, 1);
      const r = calculateAcquisitionGainTax(gain, 0, 1, 'qualified_pre_macron', grantDate, 0.5, cfg2025);
      expect(r.psBelow).toBeCloseTo(gain * cfg2025.psActivite, 2);
    });

    it('pre-sep-2012 grant: uses PS patrimoine', () => {
      const gain = 100000;
      const grantDate = new Date(2010, 5, 15); // before sep-28-2012
      const r = calculateAcquisitionGainTax(gain, 0, 1, 'qualified_pre_macron', grantDate, 0.5, cfg2025);
      expect(r.psBelow).toBeCloseTo(gain * cfg2025.psPatrimoine, 2);
    });

    it('applies salary contribution on full gain', () => {
      const gain = 200000;
      const grantDate = new Date(2015, 0, 1);
      const r = calculateAcquisitionGainTax(gain, 0, 1, 'qualified_pre_macron', grantDate, 0.5, cfg2025);
      expect(r.salaryContribution).toBeCloseTo(gain * cfg2025.salaryContributionRate, 2);
    });

    it('falls back to Macron path when grantDate is undefined', () => {
      // Without grantDate, pre-macron branch is skipped → Macron abatement applies
      const r = calculateAcquisitionGainTax(100000, 0, 1, 'qualified_pre_macron', undefined, 0.5, cfg2025);
      expect(r.abatement50).toBe(50000);
    });

    it('grants before 16 Oct 2007 escape the 10 % salary contribution', () => {
      // KPMG p. 21: the 10 % "contribution salariale" applies only to AGA
      // grants on or after 16 October 2007.
      const gain = 200000;
      const grantDate = new Date(2007, 9, 15); // 15 Oct 2007 — pre-2007 regime
      const r = calculateAcquisitionGainTax(gain, 0, 1, 'qualified_pre_macron', grantDate, 0.5, cfg2025);
      expect(r.salaryContribution).toBe(0);
    });

    it('grants on/after 16 Oct 2007 (and pre-sep-2012) bear the 10 % salary contribution', () => {
      const gain = 200000;
      const grantDate = new Date(2007, 9, 16); // 16 Oct 2007
      const r = calculateAcquisitionGainTax(gain, 0, 1, 'qualified_pre_macron', grantDate, 0.5, cfg2025);
      expect(r.salaryContribution).toBeCloseTo(gain * cfg2025.salaryContributionRate, 2);
    });
  });

  describe('config fallback', () => {
    it('uses default rates when config is omitted', () => {
      // Should not throw and produce a coherent result
      const r = calculateAcquisitionGainTax(100000, 0, 1, 'qualified_macron');
      expect(r.below300k).toBe(100000);
      expect(r.abatement50).toBe(50000);
      expect(r.total).toBeGreaterThan(0);
    });
  });
});
