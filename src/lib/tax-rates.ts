export interface TaxBracket {
  limit: number;
  rate: number;
}

export interface TaxConfig {
  brackets: TaxBracket[];
  /**
   * PS on "revenus du patrimoine" (capital gains, AGA acquisition gain).
   * Liquidated in the annual 2042 at the rate in force at collection time.
   * For 2025 income → 18,6 % (LFSS 2025 retroactive CSG increase).
   */
  psPatrimoine: number;
  psActivite: number;
  /** CSG déductible portion paired with `psPatrimoine` (8,2 % for 18,6 %). */
  csgDeductible: number;
  pfuIrRate: number;
  pfuTotalRate: number;
  /**
   * PS on dividends. Unlike `psPatrimoine`, dividends are due at the rate in
   * force at the **fait générateur** (payment date): the PFNL paid quarterly
   * via form 2778-DIV is libératoire, and even the annual catch-up uses the
   * payment-date rate. KPMG 2025 deck p. 33 confirms 17,2 % for dividends
   * paid in 2025.
   */
  psDividends: number;
  /**
   * CSG déductible portion paired with `psDividends`. For dividends paid in
   * 2025 (CSG 9,2 %) → 6,8 %. For 2026+ (CSG 10,6 %) → 8,2 %.
   */
  csgDeductibleDividends: number;
  /** PFU global rate on dividends = 12,8 % IR + `psDividends`. */
  pfuDividendsTotalRate: number;
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
  psDividends: 0.172,
  csgDeductibleDividends: 0.068,
  pfuDividendsTotalRate: 0.300,
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
  // PS patrimoine (PV de cession, gain d'acquisition AGA) are liquidated in
  // the 2026 annual return at the rate in force at collection time. KPMG
  // 2025 deck slide 48 confirms a PFU at 31,4 % on PV de cession 2025.
  psPatrimoine: 0.186,   // CSG 10.6% + CRDS 0.5% + prélèvement solidarité 7.5%
  psActivite: 0.111,     // CSG 10.6% + CRDS 0.5%
  csgDeductible: 0.082,  // CSG déductible 8.2%
  pfuTotalRate: 0.314,   // 12.8% IR + 18.6% PS
  // Dividends paid during 2025 are taxed at the rate in force at the fait
  // générateur (payment date). KPMG 2025 deck slide 33 confirms 17,2 %.
  // PFNL via form 2778-DIV paid quarterly at 30 % is libératoire; even the
  // annual catch-up for late filers uses 17,2 % PS for 2025 payments.
  psDividends: 0.172,
  csgDeductibleDividends: 0.068,
  pfuDividendsTotalRate: 0.300,
};

const TAX_CONFIG_2026: TaxConfig = {
  ...TAX_CONFIG_2025,
  // From 2026 onwards, dividends paid align with the post-LFSS-2025 rates.
  psDividends: 0.186,
  csgDeductibleDividends: 0.082,
  pfuDividendsTotalRate: 0.314,
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

/**
 * CDHR — Contribution Différentielle sur les Hauts Revenus.
 *
 * Introduced by article 10 of the 2025 Finance Act, codified at CGI art. 224.
 * KPMG 2025 deck, section 8 (pages 72-74).
 *
 * Applies to French tax residents whose adjusted reference tax income (adj.
 * RFR) exceeds €250 k (single) / €500 k (couple) AND whose effective income
 * tax (IR + CEHR + libératoires) is below the minimum threshold below.
 *
 * Headline rule: minimum effective IR = 20 % of adjusted RFR.
 *
 * Smoothing (décote, CGI 224 III 5°): when adj. RFR is between the entry
 * threshold and the upper threshold (330 k single / 660 k couple), the
 * minimum target is replaced by 82,5 % × (RFR − threshold_low). This
 * provides perfect continuity at the upper threshold (82,5 % × 80 000 =
 * 66 000 = 20 % × 330 000) and avoids a cliff effect at the entry
 * threshold (target = 0 when RFR = threshold_low).
 *
 * Main impact for MSFT employees: PFU income (12.8 % IR) can be pushed up
 * to a 20 % effective IR rate, so PFU rises from 31.4 % up to 38.6 %
 * (KPMG p. 73).
 *
 * NOTE: this is a simplified implementation. The legal definition of
 * "adjusted RFR" and "adjusted IR" includes specific add-backs (CGI 224 III
 * 1° and 2°, e.g. add-backs of certain tax credits and a 1/4 reducer for
 * exceptional income). Treat the result as guidance only.
 *
 * @param adjustedRfr  Adjusted reference tax income (≈ RFR for a typical
 *                     MSFT employee with only salary + AGA + dividends/PV).
 * @param adjustedIr   Adjusted income tax = barème IR + PFU IR + CEHR
 *                     + libératoires.
 * @param familyStatus 'single' or 'couple'.
 */
export function calculateCDHR(
  adjustedRfr: number,
  adjustedIr: number,
  familyStatus: 'single' | 'couple'
): number {
  const thresholdLow = familyStatus === 'single' ? 250_000 : 500_000;
  const thresholdHigh = familyStatus === 'single' ? 330_000 : 660_000;
  if (adjustedRfr <= thresholdLow) return 0;

  // Décote zone: linear ramp from 0 (at threshold_low) up to the headline
  // 20 % at threshold_high. Above threshold_high the headline 20 % applies
  // directly. The two formulas coincide at threshold_high by design.
  const target =
    adjustedRfr <= thresholdHigh
      ? 0.825 * (adjustedRfr - thresholdLow)
      : 0.20 * adjustedRfr;

  if (adjustedIr >= target) return 0;
  return target - adjustedIr;
}
