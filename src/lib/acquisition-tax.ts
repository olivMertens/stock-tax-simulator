import type { AcquisitionGainTaxResult } from './types';
import {
  calculateProgressiveTax,
  PS_PATRIMOINE,
  PS_ACTIVITE,
  CSG_DEDUCTIBLE,
  AGA_ABATEMENT_RATE_SHORT,
  AGA_ABATEMENT_RATE_LONG,
  AGA_THRESHOLD,
  SALARY_CONTRIBUTION_RATE,
  type TaxConfig,
} from './tax-rates';

export function calculateAcquisitionGainTax(
  totalAcquisitionGain: number,
  otherIncome: number,
  taxShares: number,
  planType: 'qualified_macron' | 'qualified_pre_macron',
  grantDate?: Date,
  holdingPeriod: 'Short' | 'Long' = 'Short',
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
  const agaShort = config?.agaAbatementRateShort ?? AGA_ABATEMENT_RATE_SHORT;
  const agaLong = config?.agaAbatementRateLong ?? AGA_ABATEMENT_RATE_LONG;
  const salaryRate = config?.salaryContributionRate ?? SALARY_CONTRIBUTION_RATE;

  // Pre-Macron regime (FQ)
  if (planType === 'qualified_pre_macron' && grantDate) {
    return calculatePreMacronAcquisitionGainTax(totalAcquisitionGain, otherIncome, taxShares, grantDate, config);
  }

  // Macron regime (FM, DO qualified) - post 01/01/2018 attributions
  const below = Math.min(totalAcquisitionGain, agaThreshold);
  const above = Math.max(0, totalAcquisitionGain - agaThreshold);

  // Macron AGA: fixed 50% abatement on acquisition gain (≤ 300k€),
  // regardless of holding period (CGI art. 80 quaterdecies).
  const abatement = below * agaShort;
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

  if (grantTimestamp < sep2012) {
    const ir =
      calculateProgressiveTax(otherIncome + totalAcquisitionGain, taxShares, config) -
      calculateProgressiveTax(otherIncome, taxShares, config);
    const ps = totalAcquisitionGain * psPatrimoine;
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
