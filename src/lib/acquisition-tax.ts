import type { AcquisitionGainTaxResult } from './types';
import {
  calculateProgressiveTax,
  PS_PATRIMOINE,
  PS_ACTIVITE,
  CSG_DEDUCTIBLE,
  AGA_ABATEMENT_RATE_SHORT,
  AGA_THRESHOLD,
  SALARY_CONTRIBUTION_RATE,
  type TaxConfig,
} from './tax-rates';

/**
 * Macron AGA abatement rate driven by the holding period (vesting → sale),
 * per KPMG 2025 guidance (deck pages 23 and 27):
 *   - < 2 years         → 0 % (100 % taxable in case 1TZ, no abatement)
 *   - ≥ 2 and < 8 years → 50 % (split 1TZ / 1UZ)
 *   - ≥ 8 years         → 65 %
 * The rate applies on the fraction ≤ 300 k€ only; the > 300 k€ fraction is
 * never abated.
 */
export function macronAbatementRateFromHoldingYears(holdingYears: number): number {
  if (holdingYears < 2) return 0;
  if (holdingYears < 8) return 0.5;
  return 0.65;
}

export function calculateAcquisitionGainTax(
  totalAcquisitionGain: number,
  otherIncome: number,
  taxShares: number,
  planType: 'qualified_macron' | 'qualified_pre_macron',
  grantDate?: Date,
  /**
   * Effective Macron abatement rate to apply on the below-300k portion.
   * Default = 0.5 (legacy behaviour: ≥2 years held). Caller should compute
   * a per-lot weighted average based on actual holding years using
   * {@link macronAbatementRateFromHoldingYears}.
   *
   * Only used when planType === 'qualified_macron' (or pre-Macron falls back
   * through the Macron path because grantDate is missing).
   */
  macronAbatementRate: number = AGA_ABATEMENT_RATE_SHORT,
  config?: TaxConfig
): AcquisitionGainTaxResult {
  if (totalAcquisitionGain <= 0) {
    return {
      below300k: 0, above300k: 0, abatement50: 0,
      irBelow: 0, irAbove: 0, psBelow: 0, psAbove: 0,
      salaryContribution: 0, deductibleCSG: 0, total: 0,
    };
  }

  const psPatrimoine = config?.psPatrimoine ?? PS_PATRIMOINE;
  const psActivite = config?.psActivite ?? PS_ACTIVITE;
  const csgDeductible = config?.csgDeductible ?? CSG_DEDUCTIBLE;
  const agaThreshold = config?.agaThreshold ?? AGA_THRESHOLD;
  const salaryRate = config?.salaryContributionRate ?? SALARY_CONTRIBUTION_RATE;

  // Pre-Macron regime (FQ)
  if (planType === 'qualified_pre_macron' && grantDate) {
    return calculatePreMacronAcquisitionGainTax(totalAcquisitionGain, otherIncome, taxShares, grantDate, config);
  }

  // Macron regime (FM, DO qualified) - post 01/01/2018 attributions
  const below = Math.min(totalAcquisitionGain, agaThreshold);
  const above = Math.max(0, totalAcquisitionGain - agaThreshold);

  // Macron AGA: abatement on the fraction ≤ 300 k€.
  // Per KPMG 2025 (p. 23, 27): rate depends on holding period
  // (< 2 years: 0 %, 2-8 years: 50 %, > 8 years: 65 %). The caller is
  // responsible for providing the effective (potentially weighted) rate.
  const abatementRate = Math.max(0, Math.min(macronAbatementRate, 0.65));
  const abatement = below * abatementRate;
  const taxableBelow = below - abatement;
  const psBelow = below * psPatrimoine;

  const psAbove = above * psActivite;
  const salaryContribution = above * salaryRate;

  const irBelow =
    calculateProgressiveTax(otherIncome + taxableBelow, taxShares, config) -
    calculateProgressiveTax(otherIncome, taxShares, config);

  const irAbove =
    calculateProgressiveTax(otherIncome + taxableBelow + above, taxShares, config) -
    calculateProgressiveTax(otherIncome + taxableBelow, taxShares, config);

  const deductibleCSG = totalAcquisitionGain * csgDeductible;

  return {
    below300k: below,
    above300k: above,
    abatement50: abatement,
    irBelow,
    irAbove,
    psBelow,
    psAbove,
    salaryContribution,
    deductibleCSG,
    total: irBelow + irAbove + psBelow + psAbove + salaryContribution,
  };
}

function calculatePreMacronAcquisitionGainTax(
  totalAcquisitionGain: number,
  otherIncome: number,
  taxShares: number,
  grantDate: Date,
  config?: TaxConfig
): AcquisitionGainTaxResult {
  const psPatrimoine = config?.psPatrimoine ?? PS_PATRIMOINE;
  const psActivite = config?.psActivite ?? PS_ACTIVITE;
  const csgDeductible = config?.csgDeductible ?? CSG_DEDUCTIBLE;
  const salaryRate = config?.salaryContributionRate ?? SALARY_CONTRIBUTION_RATE;

  const grantTimestamp = grantDate.getTime();
  const sep2012 = new Date(2012, 8, 28).getTime();
  // 10 % salary contribution introduced by article 13 of the 2008 Social
  // Security Financing Act, applicable only to AGA grants on or after
  // 16 October 2007 (KPMG 2025 deck p. 21). Grants prior to that date are
  // exempt from the 10 % "contribution salariale".
  const oct2007 = new Date(2007, 9, 16).getTime();
  const isPre2007Grant = grantTimestamp < oct2007;

  if (grantTimestamp < sep2012) {
    // TODO: KPMG p. 21 also allows the taxpayer to elect for a flat 30 %
    // rate (case 3VI of form 2042 C) in lieu of the progressive bareme.
    // Not yet implemented; would require a Settings toggle. Currently only
    // the progressive bareme path is computed.
    const ir =
      calculateProgressiveTax(otherIncome + totalAcquisitionGain, taxShares, config) -
      calculateProgressiveTax(otherIncome, taxShares, config);
    const ps = totalAcquisitionGain * psPatrimoine;
    const salaryContribution = isPre2007Grant ? 0 : totalAcquisitionGain * salaryRate;
    const deductibleCSG = totalAcquisitionGain * csgDeductible;

    return {
      below300k: totalAcquisitionGain,
      above300k: 0,
      abatement50: 0,
      irBelow: ir,
      irAbove: 0,
      psBelow: ps,
      psAbove: 0,
      salaryContribution,
      deductibleCSG,
      total: ir + ps + salaryContribution,
    };
  } else {
    const ir =
      calculateProgressiveTax(otherIncome + totalAcquisitionGain, taxShares, config) -
      calculateProgressiveTax(otherIncome, taxShares, config);
    const ps = totalAcquisitionGain * psActivite;
    const salaryContribution = totalAcquisitionGain * salaryRate;
    const deductibleCSG = totalAcquisitionGain * csgDeductible;

    return {
      below300k: totalAcquisitionGain,
      above300k: 0,
      abatement50: 0,
      irBelow: ir,
      irAbove: 0,
      psBelow: ps,
      psAbove: 0,
      salaryContribution,
      deductibleCSG,
      total: ir + ps + salaryContribution,
    };
  }
}
