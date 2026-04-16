export interface TaxBracket {
  limit: number;
  rate: number;
}

export interface TaxConfig {
  brackets: TaxBracket[];
  psPatrimoine: number;
  psActivite: number;
  csgDeductible: number;
  pfuIrRate: number;
  pfuTotalRate: number;
  salaryContributionRate: number;
  agaAbatementRateShort: number;
  agaAbatementRateLong: number;
  agaThreshold: number;
  cehrSingle: { from: number; to: number; rate: number }[];
  cehrCouple: { from: number; to: number; rate: number }[];
  qfCapPerHalfShare: number;
}

// ---- Per-year configurations ----

const TAX_CONFIG_2024: TaxConfig = {
  brackets: [
    { limit: 11294, rate: 0 },
    { limit: 28797, rate: 0.11 },
    { limit: 82341, rate: 0.30 },
    { limit: 177106, rate: 0.41 },
    { limit: Infinity, rate: 0.45 },
  ],
  psPatrimoine: 0.172,   // CSG 9.2% + CRDS 0.5% + prélèvement solidarité 7.5%
  psActivite: 0.097,     // CSG 9.2% + CRDS 0.5%
  csgDeductible: 0.068,  // CSG déductible 6.8%
  pfuIrRate: 0.128,
  pfuTotalRate: 0.300,   // 12.8% IR + 17.2% PS
  salaryContributionRate: 0.10,
  agaAbatementRateShort: 0.50,
  agaAbatementRateLong: 0.65,
  agaThreshold: 300000,
  cehrSingle: [
    { from: 250001, to: 500000, rate: 0.03 },
    { from: 500001, to: Infinity, rate: 0.04 },
  ],
  cehrCouple: [
    { from: 500001, to: 1000000, rate: 0.03 },
    { from: 1000001, to: Infinity, rate: 0.04 },
  ],
  qfCapPerHalfShare: 1759,
};

const TAX_CONFIG_2025: TaxConfig = {
  ...TAX_CONFIG_2024,
  brackets: [
    { limit: 11600, rate: 0 },
    { limit: 29579, rate: 0.11 },
    { limit: 84577, rate: 0.30 },
    { limit: 181917, rate: 0.41 },
    { limit: Infinity, rate: 0.45 },
  ],
  qfCapPerHalfShare: 1791,
  // PS patrimoine are levied at the rate in force at collection time (2026),
  // so 2025 income is subject to the post-CSG-increase rates.
  psPatrimoine: 0.186,   // CSG 10.6% + CRDS 0.5% + prélèvement solidarité 7.5%
  psActivite: 0.111,     // CSG 10.6% + CRDS 0.5%
  csgDeductible: 0.082,  // CSG déductible 8.2%
  pfuTotalRate: 0.314,   // 12.8% IR + 18.6% PS
};

const TAX_CONFIG_2026: TaxConfig = {
  ...TAX_CONFIG_2025,
};

const TAX_CONFIGS: Record<number, TaxConfig> = {
  2024: TAX_CONFIG_2024,
  2025: TAX_CONFIG_2025,
  2026: TAX_CONFIG_2026,
};

/**
 * Get the tax configuration for a given fiscal year.
 * Falls back to the nearest available year.
 */
export function getTaxConfig(fiscalYear: number): TaxConfig {
  if (TAX_CONFIGS[fiscalYear]) return TAX_CONFIGS[fiscalYear];
  const years = Object.keys(TAX_CONFIGS).map(Number).sort((a, b) => a - b);
  // Use latest available config for future years, earliest for past years
  if (fiscalYear > years[years.length - 1]) return TAX_CONFIGS[years[years.length - 1]];
  return TAX_CONFIGS[years[0]];
}

// ---- Default exports (latest config) for backward compatibility ----

export const TAX_BRACKETS_2024 = TAX_CONFIG_2024.brackets;
export const PS_PATRIMOINE = TAX_CONFIG_2026.psPatrimoine;
export const PS_ACTIVITE = TAX_CONFIG_2026.psActivite;
export const CSG_DEDUCTIBLE = TAX_CONFIG_2026.csgDeductible;
export const PFU_IR_RATE = TAX_CONFIG_2026.pfuIrRate;
export const PFU_TOTAL_RATE = TAX_CONFIG_2026.pfuTotalRate;
export const SALARY_CONTRIBUTION_RATE = TAX_CONFIG_2026.salaryContributionRate;
export const AGA_ABATEMENT_RATE_SHORT = TAX_CONFIG_2026.agaAbatementRateShort;
export const AGA_ABATEMENT_RATE_LONG = TAX_CONFIG_2026.agaAbatementRateLong;
export const AGA_THRESHOLD = TAX_CONFIG_2026.agaThreshold;
export const CEHR_SINGLE = TAX_CONFIG_2026.cehrSingle;
export const CEHR_COUPLE = TAX_CONFIG_2026.cehrCouple;
export const QF_CAP_PER_HALF_SHARE = TAX_CONFIG_2026.qfCapPerHalfShare;

// Holding period abatement (for titles acquired before 2018, bareme option)
export function getHoldingAbatementRate(acquisitionDate: Date, saleDate: Date): number {
  if (acquisitionDate.getFullYear() >= 2018) return 0;
  const years = (saleDate.getTime() - acquisitionDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  if (years >= 8) return 0.65;
  if (years >= 2) return 0.50;
  return 0;
}

export function calculateProgressiveTax(taxableIncome: number, shares: number, config?: TaxConfig): number {
  if (shares <= 0) return 0;
  if (taxableIncome <= 0) return 0;
  const perShare = taxableIncome / shares;
  let tax = 0;
  let previousLimit = 0;

  const brackets = config ? config.brackets : TAX_BRACKETS_2024;
  for (const bracket of brackets) {
    if (perShare <= previousLimit) break;
    const taxableInBracket = Math.min(perShare, bracket.limit) - previousLimit;
    tax += taxableInBracket * bracket.rate;
    previousLimit = bracket.limit;
  }

  return tax * shares;
}

export function calculateCEHR(rfi: number, familyStatus: 'single' | 'couple', config?: TaxConfig): number {
  const thresholds = config
    ? (familyStatus === 'single' ? config.cehrSingle : config.cehrCouple)
    : (familyStatus === 'single' ? CEHR_SINGLE : CEHR_COUPLE);
  let cehr = 0;

  for (const t of thresholds) {
    if (rfi > t.from - 1) {
      const taxable = Math.min(rfi, t.to) - (t.from - 1);
      cehr += Math.max(0, taxable) * t.rate;
    }
  }

  return cehr;
}
