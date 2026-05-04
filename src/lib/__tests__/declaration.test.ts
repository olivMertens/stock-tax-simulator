import { describe, it, expect } from 'vitest';
import { generateDeclaration, formatDeclarationText } from '../declaration';
import type { TaxSimulationResult, SaleLotEntry, StockLot } from '../types';

function makeLot(overrides: Partial<StockLot> = {}): StockLot {
  return {
    id: 'lot-1',
    broker: 'fidelity',
    acquisitionDate: new Date(2022, 0, 15),
    quantity: 100,
    costBasisPerShare: 250,
    totalCostBasis: 25000,
    currentValue: 40000,
    unrealizedGainLoss: 15000,
    origin: 'DO',
    holdingPeriod: 'Long',
    planType: 'qualified_macron',
    ...overrides,
  };
}

function makeResult(overrides: Partial<TaxSimulationResult> = {}): TaxSimulationResult {
  return {
    totalProceeds: 40000,
    totalAcquisitionGain: 10000,
    totalCapitalGain: 5000,
    acquisitionGainTax: {
      below300k: 10000,
      above300k: 0,
      abatement50: 5000,
      irBelow: 1500,
      irAbove: 0,
      psBelow: 1720,
      psAbove: 0,
      salaryContribution: 0,
      deductibleCSG: 680,
      total: 3220,
    },
    capitalGainTax: {
      grossGain: 5000,
      netGain: 5000,
      ir: 640,
      ps: 860,
      deductibleCSG: 340,
      holdingAbatement: 0,
      total: 1500,
      remainingLosses: 0,
      netLoss: 0,
    },
    cehr: 0,
    totalTax: 4720,
    netAmount: 35280,
    effectiveTaxRate: 11.8,
    lotResults: [],
    taxMode: 'pfu',
    ...overrides,
  };
}

describe('generateDeclaration', () => {
  const lot = makeLot();
  const entry: SaleLotEntry = { lot, quantitySold: 50, salePricePerShare: 400 };
  const result = makeResult();

  it('computes case3VG from positive net gain', () => {
    const decl = generateDeclaration(result, [entry], 2024);
    expect(decl.case3VG).toBe(5000);
    expect(decl.case3VH).toBe(0);
  });

  it('computes case3VH from net loss', () => {
    const lossResult = makeResult({
      capitalGainTax: { ...result.capitalGainTax, netGain: 0, netLoss: 2000 },
    });
    const decl = generateDeclaration(lossResult, [entry], 2024);
    expect(decl.case3VG).toBe(0);
    expect(decl.case3VH).toBe(2000);
  });

  it('computes case1TZ with 50% abatement', () => {
    const decl = generateDeclaration(result, [entry], 2024);
    // below300k(10000) - abatement50(5000) = 5000
    expect(decl.case1TZ).toBe(5000);
    expect(decl.case1WZ).toBe(5000);
  });

  it('sets option2OP for barème mode', () => {
    const baremeResult = makeResult({ taxMode: 'bareme' });
    const decl = generateDeclaration(baremeResult, [entry], 2024);
    expect(decl.option2OP).toBe(true);
  });

  it('sets option2OP false for PFU mode', () => {
    const decl = generateDeclaration(result, [entry], 2024);
    expect(decl.option2OP).toBe(false);
  });

  it('carries fiscal year', () => {
    const decl = generateDeclaration(result, [entry], 2025);
    expect(decl.fiscalYear).toBe(2025);
  });

  it('generates form 2074 lines per lot', () => {
    const entry2: SaleLotEntry = {
      lot: makeLot({ id: 'lot-2', origin: 'SP', costBasisPerShare: 300 }),
      quantitySold: 20,
      salePricePerShare: 350,
    };
    const decl = generateDeclaration(result, [entry, entry2], 2024);
    expect(decl.form2074Lines).toHaveLength(2);
    expect(decl.form2074Lines[0].origin).toBe('Stock Award');
    expect(decl.form2074Lines[1].origin).toBe('ESPP');
    expect(decl.form2074Lines[1].gainLoss).toBe(20 * (350 - 300));
  });

  it('sums PS details', () => {
    const decl = generateDeclaration(result, [entry], 2024);
    expect(decl.psDetails.pvCessionPS).toBe(860);
    expect(decl.psDetails.acquisitionGainPSBelow).toBe(1720);
    expect(decl.psDetails.total).toBe(860 + 1720);
  });

  it('computes deductibleCSGNextYear', () => {
    const decl = generateDeclaration(result, [entry], 2024);
    expect(decl.deductibleCSGNextYear).toBe(680 + 340);
  });

  it('clamps case1TZ to 0 if negative', () => {
    const overResult = makeResult({
      acquisitionGainTax: {
        ...result.acquisitionGainTax,
        below300k: 3000,
        abatement50: 5000, // abatement > below300k
      },
    });
    const decl = generateDeclaration(overResult, [entry], 2024);
    expect(decl.case1TZ).toBe(0);
  });
});

describe('formatDeclarationText', () => {
  const result = makeResult();
  const lot = makeLot();
  const entry: SaleLotEntry = { lot, quantitySold: 50, salePricePerShare: 400 };

  it('includes fiscal year', () => {
    const decl = generateDeclaration(result, [entry], 2024);
    const text = formatDeclarationText(decl);
    expect(text).toContain('REVENUS 2024');
  });

  it('includes 3VG when gain > 0', () => {
    const decl = generateDeclaration(result, [entry], 2024);
    const text = formatDeclarationText(decl);
    expect(text).toContain('Case 3VG');
  });

  it('includes 2OP checkbox for PFU', () => {
    const decl = generateDeclaration(result, [entry], 2024);
    const text = formatDeclarationText(decl);
    expect(text).toContain('☐ Ne pas cocher');
  });

  it('includes 2OP checked for barème', () => {
    const baremeResult = makeResult({ taxMode: 'bareme' });
    const decl = generateDeclaration(baremeResult, [entry], 2024);
    const text = formatDeclarationText(decl);
    expect(text).toContain('☑ Cocher');
  });

  it('includes form 2074 lines', () => {
    const decl = generateDeclaration(result, [entry], 2024);
    const text = formatDeclarationText(decl);
    expect(text).toContain('FORMULAIRE 2074');
    expect(text).toContain('Stock Award');
    expect(text).toContain('50 actions');
  });

  it('includes CSG deductible reminder', () => {
    const decl = generateDeclaration(result, [entry], 2024);
    const text = formatDeclarationText(decl);
    expect(text).toContain('CSG déductible');
  });

  it('includes loss carry-forward reminder when 3VH > 0', () => {
    const lossResult = makeResult({
      capitalGainTax: { ...result.capitalGainTax, netGain: 0, netLoss: 3000 },
    });
    const decl = generateDeclaration(lossResult, [entry], 2024);
    const text = formatDeclarationText(decl);
    expect(text).toContain('moins-value');
    expect(text).toContain('reportable pendant 10 ans');
  });
});
