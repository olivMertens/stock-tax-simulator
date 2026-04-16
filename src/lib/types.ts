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
