// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { validateSettings, loadVersionedSettings, saveVersionedSettings } from '../storage';
import type { AppSettings } from '../types';

const DEFAULTS: AppSettings = {
  fiscalYear: 2025,
  familyStatus: 'single',
  numberOfChildren: 0,
  taxShares: 1,
  taxSharesManual: false,
  otherTaxableIncome: 0,
  defaultPlanType: 'qualified_macron',
  priorLosses: 0,
};

describe('validateSettings', () => {
  it('returns defaults for null input', () => {
    expect(validateSettings(null, DEFAULTS)).toEqual(DEFAULTS);
  });

  it('returns defaults for non-object input', () => {
    expect(validateSettings('garbage', DEFAULTS)).toEqual(DEFAULTS);
    expect(validateSettings(42, DEFAULTS)).toEqual(DEFAULTS);
  });

  it('preserves valid settings', () => {
    const valid: AppSettings = {
      ...DEFAULTS,
      fiscalYear: 2024,
      familyStatus: 'couple',
      numberOfChildren: 2,
      taxShares: 3,
      otherTaxableIncome: 80000,
      priorLosses: 5000,
    };
    expect(validateSettings(valid, DEFAULTS)).toEqual(valid);
  });

  it('falls back to default for invalid fiscalYear', () => {
    expect(validateSettings({ ...DEFAULTS, fiscalYear: 1900 }, DEFAULTS).fiscalYear).toBe(DEFAULTS.fiscalYear);
    expect(validateSettings({ ...DEFAULTS, fiscalYear: 'abc' }, DEFAULTS).fiscalYear).toBe(DEFAULTS.fiscalYear);
    expect(validateSettings({ ...DEFAULTS, fiscalYear: NaN }, DEFAULTS).fiscalYear).toBe(DEFAULTS.fiscalYear);
  });

  it('falls back for invalid familyStatus', () => {
    expect(validateSettings({ ...DEFAULTS, familyStatus: 'married' }, DEFAULTS).familyStatus).toBe('single');
  });

  it('falls back for negative taxShares', () => {
    expect(validateSettings({ ...DEFAULTS, taxShares: -2 }, DEFAULTS).taxShares).toBe(DEFAULTS.taxShares);
    expect(validateSettings({ ...DEFAULTS, taxShares: 0 }, DEFAULTS).taxShares).toBe(DEFAULTS.taxShares);
  });

  it('falls back for negative income', () => {
    expect(validateSettings({ ...DEFAULTS, otherTaxableIncome: -100 }, DEFAULTS).otherTaxableIncome).toBe(0);
  });

  it('falls back for invalid planType', () => {
    expect(validateSettings({ ...DEFAULTS, defaultPlanType: 'invalid' }, DEFAULTS).defaultPlanType).toBe('qualified_macron');
  });
});

describe('loadVersionedSettings / saveVersionedSettings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns defaults when no data stored', () => {
    expect(loadVersionedSettings('appSettings', DEFAULTS)).toEqual(DEFAULTS);
  });

  it('loads legacy unversioned data and validates it', () => {
    localStorage.setItem('appSettings', JSON.stringify({ ...DEFAULTS, fiscalYear: 2024 }));
    const result = loadVersionedSettings('appSettings', DEFAULTS);
    expect(result.fiscalYear).toBe(2024);
  });

  it('loads versioned data', () => {
    saveVersionedSettings('appSettings', { ...DEFAULTS, fiscalYear: 2024 });
    const result = loadVersionedSettings('appSettings', DEFAULTS);
    expect(result.fiscalYear).toBe(2024);
  });

  it('handles corrupted JSON gracefully', () => {
    localStorage.setItem('appSettings', '{invalid json!!}');
    expect(loadVersionedSettings('appSettings', DEFAULTS)).toEqual(DEFAULTS);
  });

  it('rejects invalid fields in stored data', () => {
    localStorage.setItem('appSettings', JSON.stringify({ taxShares: -5, familyStatus: 123 }));
    const result = loadVersionedSettings('appSettings', DEFAULTS);
    expect(result.taxShares).toBe(1); // default
    expect(result.familyStatus).toBe('single'); // default
  });
});
