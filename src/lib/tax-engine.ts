// Tax engine - main orchestrator module.
// Sub-module logic is delegated; re-exported here for backward compatibility.

import type {
  StockLot,
  SaleLotEntry,
  SaleSimulation,
  LotTaxResult,
  TaxSimulationResult,
} from './types';
import {
  calculateCEHR,
  getHoldingAbatementRate,
  getTaxConfig,
} from './tax-rates';
import { calculateAcquisitionGainTax } from './acquisition-tax';
import { calculateCapitalGainTax } from './capital-gain-tax';

// Re-export sub-modules for backward compatibility
export { calculateAcquisitionGainTax } from './acquisition-tax';
export { calculateCapitalGainTax } from './capital-gain-tax';
export { rankLotsForSale, type LotRanking } from './lot-ranking';

export function isQualifiedStockAward(lot: StockLot): boolean {
  return (
    lot.origin === 'FM' ||
    lot.origin === 'FQ' ||
    (lot.origin === 'DO' && lot.planType !== 'non_qualified')
  );
}

export function calculateLotTax(entry: SaleLotEntry): LotTaxResult {
  const { lot, quantitySold, salePricePerShare } = entry;
  const safeQty = Math.max(0, quantitySold);
  const safePrice = Math.max(0, salePricePerShare);
  const proceeds = safeQty * safePrice;

  if (safeQty === 0) {
    return {
      lotId: lot.id,
      proceeds: 0,
      acquisitionGain: 0,
      capitalGain: 0,
      origin: lot.origin,
      planType: lot.planType,
    };
  }

  if (lot.origin === 'SP') {
    const acquisitionValue = lot.esppFmvPerShare ?? lot.costBasisPerShare;
    const capitalGain = safeQty * (safePrice - acquisitionValue);
    return {
      lotId: lot.id,
      proceeds,
      acquisitionGain: 0,
      capitalGain,
      origin: lot.origin,
      planType: lot.planType,
    };
  }

  if (isQualifiedStockAward(lot)) {
    const rawAcquisitionGain = safeQty * lot.costBasisPerShare;
    const rawCapitalGain = safeQty * (safePrice - lot.costBasisPerShare);

    let netAcquisitionGain = rawAcquisitionGain;
    let netCapitalGain = rawCapitalGain;

    if (rawCapitalGain < 0) {
      netAcquisitionGain = Math.max(0, rawAcquisitionGain + rawCapitalGain);
      netCapitalGain = Math.min(0, rawCapitalGain + rawAcquisitionGain);
    }

    return {
      lotId: lot.id,
      proceeds,
      acquisitionGain: netAcquisitionGain,
      capitalGain: netCapitalGain,
      origin: lot.origin,
      planType: lot.planType,
    };
  } else {
    const capitalGain = safeQty * (safePrice - lot.costBasisPerShare);
    return {
      lotId: lot.id,
      proceeds,
      acquisitionGain: 0,
      capitalGain,
      origin: lot.origin,
      planType: lot.planType,
    };
  }
}

export function runSimulation(simulation: SaleSimulation): TaxSimulationResult {
  const safeTaxShares = Math.max(1, simulation.taxShares);
  const safeSimulation = { ...simulation, taxShares: safeTaxShares };

  const config = getTaxConfig(safeSimulation.fiscalYear);

  const lotResults = safeSimulation.lots.map((entry) => calculateLotTax(entry));

  const totalProceeds = lotResults.reduce((sum, r) => sum + r.proceeds, 0);
  const totalAcquisitionGain = lotResults.reduce((sum, r) => sum + r.acquisitionGain, 0);
  const totalCapitalGain = lotResults.reduce((sum, r) => sum + r.capitalGain, 0);

  // Split acquisition gain between Macron and pre-Macron regimes: each regime
  // has its own abatement and PS rules, so they must be computed independently
  // and summed (instead of routing everything through a single "primary" regime).
  const macronAcqGain = lotResults
    .filter((r) => r.planType !== 'qualified_pre_macron')
    .reduce((sum, r) => sum + r.acquisitionGain, 0);
  const fqAcqGain = lotResults
    .filter((r) => r.planType === 'qualified_pre_macron')
    .reduce((sum, r) => sum + r.acquisitionGain, 0);

  const fqLots = safeSimulation.lots.filter(
    (e) => e.lot.planType === 'qualified_pre_macron'
  );
  const earliestGrantDate = fqLots.length > 0
    ? fqLots.reduce((earliest, e) => {
        const gd = e.lot.grantDate;
        if (!gd) return earliest;
        return !earliest || gd < earliest ? gd : earliest;
      }, undefined as Date | undefined)
    : undefined;

  const hasLongHolding = safeSimulation.lots.some((e) => e.lot.holdingPeriod === 'Long');
  const holdingPeriod: 'Short' | 'Long' = hasLongHolding ? 'Long' : 'Short';

  const macronTax = calculateAcquisitionGainTax(
    macronAcqGain,
    safeSimulation.otherTaxableIncome,
    safeSimulation.taxShares,
    'qualified_macron',
    undefined,
    holdingPeriod,
    config
  );

  // FQ taxable income stacks on top of Macron taxable contribution so progressive
  // IR brackets are applied correctly when both regimes coexist.
  const macronTaxableContribution =
    (macronTax.below300k - macronTax.abatement50) + macronTax.above300k;

  const fqTax = calculateAcquisitionGainTax(
    fqAcqGain,
    safeSimulation.otherTaxableIncome + macronTaxableContribution,
    safeSimulation.taxShares,
    'qualified_pre_macron',
    earliestGrantDate,
    holdingPeriod,
    config
  );

  const acquisitionGainTax = {
    below300k: macronTax.below300k + fqTax.below300k,
    above300k: macronTax.above300k + fqTax.above300k,
    abatement50: macronTax.abatement50 + fqTax.abatement50,
    irBelow: macronTax.irBelow + fqTax.irBelow,
    irAbove: macronTax.irAbove + fqTax.irAbove,
    psBelow: macronTax.psBelow + fqTax.psBelow,
    psAbove: macronTax.psAbove + fqTax.psAbove,
    salaryContribution: macronTax.salaryContribution + fqTax.salaryContribution,
    deductibleCSG: macronTax.deductibleCSG + fqTax.deductibleCSG,
    total: macronTax.total + fqTax.total,
  };

  // FQ below300k carries no abatement, so its full value is taxable income.
  const acqTaxableIncome = macronTaxableContribution + fqTax.below300k;

  // Compute holding abatement for pre-2018 lots (applies only in barème mode)
  const saleDate = new Date();
  let totalHoldingAbatement = 0;
  if (safeSimulation.taxMode === 'bareme') {
    for (let i = 0; i < safeSimulation.lots.length; i++) {
      const entry = safeSimulation.lots[i];
      const lotResult = lotResults[i];
      if (lotResult.capitalGain > 0 && entry.lot.acquisitionDate.getFullYear() < 2018) {
        const rate = getHoldingAbatementRate(entry.lot.acquisitionDate, saleDate);
        totalHoldingAbatement += lotResult.capitalGain * rate;
      }
    }
  }

  const capitalGainTax = calculateCapitalGainTax(
    totalCapitalGain,
    safeSimulation.priorLosses,
    safeSimulation.taxMode,
    safeSimulation.otherTaxableIncome,
    safeSimulation.taxShares,
    acqTaxableIncome,
    totalHoldingAbatement,
    config
  );

  const netCapitalGainForRfi = Math.max(0, totalCapitalGain - safeSimulation.priorLosses);
  const rfi = safeSimulation.otherTaxableIncome + totalAcquisitionGain + netCapitalGainForRfi;
  const cehr = calculateCEHR(rfi, safeSimulation.familyStatus, config);

  const totalTax = acquisitionGainTax.total + capitalGainTax.total + cehr;
  const netAmount = totalProceeds - totalTax;
  const effectiveTaxRate = totalProceeds > 0 ? (totalTax / totalProceeds) * 100 : 0;

  return {
    totalProceeds,
    totalAcquisitionGain,
    totalCapitalGain,
    acquisitionGainTax,
    capitalGainTax,
    cehr,
    totalTax,
    netAmount,
    effectiveTaxRate,
    lotResults,
    taxMode: safeSimulation.taxMode,
  };
}
