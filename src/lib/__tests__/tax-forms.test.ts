import { describe, it, expect } from 'vitest';
import { FORM_2042, FORM_2042_DIVIDENDS, FORM_2042C_AGA_MACRON, FORM_2074_CADRE_510 } from '../tax-forms';

describe('tax-forms source of truth', () => {
  it('keeps 1UZ (not 1WZ) for AGA Macron 50% abatement', () => {
    expect(FORM_2042C_AGA_MACRON.case1UZ.code).toBe('1UZ');
    // 1WZ is a totally different case (dirigeant partant en retraite, art. 150-0 D ter)
    const allCodes = Object.values(FORM_2042C_AGA_MACRON).map((c) => c.code);
    expect(allCodes).not.toContain('1WZ');
  });

  it('exposes the three AGA Macron cases', () => {
    const codes = Object.values(FORM_2042C_AGA_MACRON).map((c) => c.code);
    expect(codes).toEqual(['1TZ', '1UZ', '1TT']);
  });

  it('keeps 2074 cadre 510 line numbers stable', () => {
    expect(FORM_2074_CADRE_510.designation.line).toBe('511');
    expect(FORM_2074_CADRE_510.saleDate.line).toBe('512');
    expect(FORM_2074_CADRE_510.unitSalePrice.line).toBe('514');
    expect(FORM_2074_CADRE_510.quantity.line).toBe('515');
    expect(FORM_2074_CADRE_510.totalSale.line).toBe('516');
    expect(FORM_2074_CADRE_510.unitAcqPrice.line).toBe('520');
    expect(FORM_2074_CADRE_510.totalAcqPrice.line).toBe('521');
    expect(FORM_2074_CADRE_510.costBasis.line).toBe('523');
    expect(FORM_2074_CADRE_510.result.line).toBe('524');
  });

  it('documents the official formulas for derived 2074 lines', () => {
    expect(FORM_2074_CADRE_510.totalSale.formula).toBe('514 × 515');
    expect(FORM_2074_CADRE_510.totalAcqPrice.formula).toBe('520 × 515');
    expect(FORM_2074_CADRE_510.costBasis.formula).toBe('521 + 522');
    expect(FORM_2074_CADRE_510.result.formula).toBe('518 − 523');
  });

  it('keeps 2042 main cases stable', () => {
    expect(FORM_2042.case3VG.code).toBe('3VG');
    expect(FORM_2042.case3VH.code).toBe('3VH');
    expect(FORM_2042.case3SG.code).toBe('3SG');
    expect(FORM_2042.option2OP.code).toBe('2OP');
  });

  it('keeps 2042 dividend cases stable (KPMG mai 2026)', () => {
    expect(FORM_2042_DIVIDENDS.case2DC.code).toBe('2DC');
    expect(FORM_2042_DIVIDENDS.case2CG.code).toBe('2CG');
    expect(FORM_2042_DIVIDENDS.case2BH.code).toBe('2BH');
    expect(FORM_2042_DIVIDENDS.case2AB.code).toBe('2AB');
    expect(FORM_2042_DIVIDENDS.case2CK.code).toBe('2CK');
    expect(FORM_2042_DIVIDENDS.case8VL.code).toBe('8VL');
    expect(FORM_2042_DIVIDENDS.case8PL.code).toBe('8PL');
  });
});
