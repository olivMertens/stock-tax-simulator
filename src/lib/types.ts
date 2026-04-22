export type StockOrigin = 'SP' | 'DO' | 'FM' | 'FQ';
export type PlanType = 'qualified_macron' | 'qualified_pre_macron' | 'non_qualified';
export type TaxMode = 'pfu' | 'bareme';
export type FamilyStatus = 'single' | 'couple';
export type HoldingPeriod = 'Short' | 'Long';
export type ImportCurrency = 'EUR' | 'USD';

export interface StockLot {
  id: string;
  acquisitionDate: Date;
  quantity: number;
  costBasisPerShare: number;
  totalCostBasis: number;
  currentValue: number;
  unrealizedGainLoss: number;
  availableForSaleDate?: Date;
  availableForTransferDate?: Date;
  grantDate?: Date;
  origin: StockOrigin;
  holdingPeriod: HoldingPeriod;
  planType: PlanType;
  // ESPP: Fair Market Value at acquisition (before 10% discount)
  esppFmvPerShare?: number;
  esppFmvPerShareUsd?: number;
  // USD import fields
  costBasisPerShareUsd?: number;
  totalCostBasisUsd?: number;
  currentValueUsd?: number;
  eurUsdRate?: number;
  importCurrency?: ImportCurrency;
  // Reconciliation with Microsoft StockExport (optional — present when matched)
  grantIdHash?: string;
  awardType?: string;
  reconciled?: boolean;
}

/**
 * A single vesting event from the StockExport Vest Schedules sheet.
 * For qualified plans, this is the legal acquisition date (date d'acquisition
 * définitive) which triggers the gain d'acquisition for French tax purposes.
 */
export interface VestEvent {
  date: Date;
  shares: number;
}

/**
 * A stock grant extracted from the Microsoft StockExport file.
 * Used to auto-classify Fidelity lots (planType, origin refinement) and to
 * project future unvested income.
 */
export interface GrantInfo {
  /** SHA-256 hash of the original Award ID (we never persist the plaintext). */
  grantIdHash: string;
  /** Raw Award Type label from the file (e.g. "FY23 FQ Annual", "On-Hire FQ", "FY24 SA Annual"). */
  awardType: string;
  /** Award (grant) date — decisive for Macron / pré-Macron classification. */
  awardDate: Date;
  /** Derived plan type based on awardType + awardDate. */
  planType: PlanType;
  /** Short origin code the rest of the app uses (DO / FM / FQ / SP). */
  origin: StockOrigin;
  /** Vesting schedule; dates may be past or future. */
  vestSchedule: VestEvent[];
  /** Totals from Award Summary (for audit display). */
  totalAwarded: number;
  totalVested: number;
  totalUnvested: number;
}

export interface SoldLot {
  id: string;
  acquisitionDate: Date;
  saleDate: Date;
  quantity: number;
  proceeds: number;
  costBasis: number;
  gainLoss: number;
  holdingPeriod: HoldingPeriod;
  origin: StockOrigin;
  planType: PlanType;
  // USD import fields
  proceedsUsd?: number;
  costBasisUsd?: number;
  eurUsdRate?: number;
  importCurrency?: ImportCurrency;
}

export interface SaleLotEntry {
  lot: StockLot;
  quantitySold: number;
  salePricePerShare: number;
  saleDate?: Date;
}

export interface SaleSimulation {
  lots: SaleLotEntry[];
  taxMode: TaxMode;
  otherTaxableIncome: number;
  taxShares: number;
  familyStatus: FamilyStatus;
  priorLosses: number;
  fiscalYear: number;
}

export interface LotTaxResult {
  lotId: string;
  proceeds: number;
  acquisitionGain: number;
  capitalGain: number;
  origin: StockOrigin;
  planType: PlanType;
}

export interface AcquisitionGainTaxResult {
  below300k: number;
  above300k: number;
  abatement50: number;
  irBelow: number;
  irAbove: number;
  psBelow: number;
  psAbove: number;
  salaryContribution: number;
  deductibleCSG: number;
  total: number;
}

export interface CapitalGainTaxResult {
  grossGain: number;
  netGain: number;
  ir: number;
  ps: number;
  deductibleCSG: number;
  holdingAbatement: number;
  total: number;
  remainingLosses: number;
  netLoss: number;
}

export interface TaxSimulationResult {
  totalProceeds: number;
  totalAcquisitionGain: number;
  totalCapitalGain: number;
  acquisitionGainTax: AcquisitionGainTaxResult;
  capitalGainTax: CapitalGainTaxResult;
  cehr: number;
  totalTax: number;
  netAmount: number;
  effectiveTaxRate: number;
  lotResults: LotTaxResult[];
  taxMode: TaxMode;
}

export interface AppSettings {
  familyStatus: FamilyStatus;
  numberOfChildren: number;
  taxShares: number;
  taxSharesManual: boolean;
  otherTaxableIncome: number;
  defaultPlanType: 'qualified_macron' | 'non_qualified';
  priorLosses: number;
}

export interface SavedSimulation {
  id: string;
  date: string;
  name: string;
  result: TaxSimulationResult;
  settings: AppSettings;
  lots: SaleLotEntry[];
}

export interface DeclarationData {
  fiscalYear: number;
  case3VG: number;
  case3VH: number;
  case1TZ: number;
  case1WZ: number;
  case1TT: number;
  option2OP: boolean;
  case3SG: number;
  deductibleCSGNextYear: number;
  form2074Lines: Form2074Line[];
  psDetails: PSDetails;
}

export interface Form2074Line {
  date: string;
  quantity: number;
  origin: string;
  salePrice: number;
  costBasis: number;
  gainLoss: number;
}

export interface PSDetails {
  pvCessionPS: number;
  acquisitionGainPSBelow: number;
  acquisitionGainPSAbove: number;
  total: number;
}
