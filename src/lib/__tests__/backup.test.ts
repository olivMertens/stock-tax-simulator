import { describe, it, expect } from 'vitest';
import {
  exportToJsonString,
  importFromJsonString,
  buildBackupFilename,
  type BackupInput,
} from '../backup';
import type { AppSettings, StockLot, SoldLot } from '../types';

const DEFAULTS: AppSettings = {
  familyStatus: 'single',
  numberOfChildren: 0,
  taxShares: 1,
  taxSharesManual: false,
  otherTaxableIncome: 0,
  defaultPlanType: 'qualified_macron',
  priorLosses: 0,
};

const LOT: StockLot = {
  id: 'lot-1',
  broker: 'fidelity',
  acquisitionDate: new Date(2023, 5, 15),
  quantity: 100,
  costBasisPerShare: 200,
  totalCostBasis: 20000,
  currentValue: 40000,
  unrealizedGainLoss: 20000,
  origin: 'FM',
  holdingPeriod: 'Short',
  planType: 'qualified_macron',
};

const SOLD: SoldLot = {
  id: 'sold-1',
  broker: 'fidelity',
  acquisitionDate: new Date(2022, 0, 10),
  saleDate: new Date(2025, 5, 20),
  quantity: 50,
  proceeds: 25000,
  costBasis: 15000,
  gainLoss: 10000,
  holdingPeriod: 'Long',
  origin: 'DO',
  planType: 'qualified_macron',
};

function makeInput(overrides: Partial<BackupInput> = {}): BackupInput {
  return {
    settings: DEFAULTS,
    lots: [LOT],
    soldLots: [SOLD],
    savedSimulations: [],
    ...overrides,
  };
}

describe('buildBackupFilename', () => {
  it('produces an ISO-date stamped JSON filename', () => {
    const name = buildBackupFilename(new Date(2026, 3, 21));
    expect(name).toBe('stock-tax-simulator-backup-2026-04-21.json');
  });
});

describe('exportToJsonString', () => {
  it('produces valid JSON with expected top-level fields', () => {
    const json = exportToJsonString(makeInput());
    const parsed = JSON.parse(json);
    expect(parsed.app).toBe('stock-tax-simulator');
    expect(parsed.version).toBe(2);
    expect(typeof parsed.exportedAt).toBe('string');
    expect(parsed.lots).toHaveLength(1);
    expect(parsed.soldLots).toHaveLength(1);
  });

  it('serializes dates as ISO strings', () => {
    const json = exportToJsonString(makeInput());
    const parsed = JSON.parse(json);
    expect(typeof parsed.lots[0].acquisitionDate).toBe('string');
    expect(parsed.lots[0].acquisitionDate).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('importFromJsonString', () => {
  it('round-trips a valid export', () => {
    const json = exportToJsonString(makeInput());
    const result = importFromJsonString(json, DEFAULTS);

    expect(result.settings).toEqual(DEFAULTS);
    expect(result.lots).toHaveLength(1);
    expect(result.lots[0].id).toBe('lot-1');
    expect(result.lots[0].acquisitionDate).toBeInstanceOf(Date);
    expect(result.lots[0].acquisitionDate.getTime()).toBe(LOT.acquisitionDate.getTime());
    expect(result.soldLots).toHaveLength(1);
    expect(result.soldLots[0].saleDate).toBeInstanceOf(Date);
    expect(result.warnings).toEqual([]);
  });

  it('throws on invalid JSON', () => {
    expect(() => importFromJsonString('{not json', DEFAULTS)).toThrow(/JSON invalide/);
  });

  it('throws when app signature is missing or wrong', () => {
    const payload = JSON.stringify({ version: 1, app: 'other-app', settings: DEFAULTS, lots: [], soldLots: [] });
    expect(() => importFromJsonString(payload, DEFAULTS)).toThrow(/simulateur/);
  });

  it('throws on unsupported future version', () => {
    const payload = JSON.stringify({ version: 999, app: 'stock-tax-simulator', settings: DEFAULTS, lots: [], soldLots: [] });
    expect(() => importFromJsonString(payload, DEFAULTS)).toThrow(/version/i);
  });

  it('accepts v1 backups (no broker field) and defaults broker to fidelity', () => {
    const v1Lot = {
      id: 'legacy-lot',
      acquisitionDate: new Date(2023, 5, 15).toISOString(),
      quantity: 10,
      costBasisPerShare: 100,
      totalCostBasis: 1000,
      currentValue: 1500,
      unrealizedGainLoss: 500,
      origin: 'FM',
      holdingPeriod: 'Long',
      planType: 'qualified_macron',
    };
    const v1Sold = {
      id: 'legacy-sold',
      acquisitionDate: new Date(2022, 0, 10).toISOString(),
      saleDate: new Date(2025, 5, 20).toISOString(),
      quantity: 50,
      proceeds: 25000,
      costBasis: 15000,
      gainLoss: 10000,
      holdingPeriod: 'Long',
      origin: 'DO',
      planType: 'qualified_macron',
    };
    const payload = JSON.stringify({
      version: 1,
      app: 'stock-tax-simulator',
      exportedAt: new Date().toISOString(),
      settings: DEFAULTS,
      lots: [v1Lot],
      soldLots: [v1Sold],
      savedSimulations: [],
    });

    const result = importFromJsonString(payload, DEFAULTS);
    expect(result.lots).toHaveLength(1);
    expect(result.lots[0].broker).toBe('fidelity');
    expect(result.soldLots).toHaveLength(1);
    expect(result.soldLots[0].broker).toBe('fidelity');
  });

  it('throws on non-object root', () => {
    expect(() => importFromJsonString('"string"', DEFAULTS)).toThrow();
    expect(() => importFromJsonString('null', DEFAULTS)).toThrow();
  });

  it('drops invalid lots and records a warning', () => {
    const payload = JSON.stringify({
      version: 1,
      app: 'stock-tax-simulator',
      exportedAt: new Date().toISOString(),
      settings: DEFAULTS,
      lots: [
        { ...LOT, acquisitionDate: LOT.acquisitionDate.toISOString() }, // valid
        { id: 'bad', quantity: -5 }, // invalid: missing date, negative quantity
        { acquisitionDate: 'not-a-date' }, // invalid
      ],
      soldLots: [],
      savedSimulations: [],
    });

    const result = importFromJsonString(payload, DEFAULTS);
    expect(result.lots).toHaveLength(1);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toMatch(/position/i);
  });

  it('drops invalid sold lots and records a warning', () => {
    const payload = JSON.stringify({
      version: 1,
      app: 'stock-tax-simulator',
      exportedAt: new Date().toISOString(),
      settings: DEFAULTS,
      lots: [],
      soldLots: [
        { ...SOLD, acquisitionDate: SOLD.acquisitionDate.toISOString(), saleDate: SOLD.saleDate.toISOString() },
        { id: 'bad' }, // invalid
      ],
      savedSimulations: [],
    });

    const result = importFromJsonString(payload, DEFAULTS);
    expect(result.soldLots).toHaveLength(1);
    expect(result.warnings.some((w) => /vente/i.test(w))).toBe(true);
  });

  it('falls back to defaults when settings are invalid', () => {
    const payload = JSON.stringify({
      version: 1,
      app: 'stock-tax-simulator',
      exportedAt: new Date().toISOString(),
      settings: { familyStatus: 'INVALID', taxShares: -99 },
      lots: [],
      soldLots: [],
    });

    const result = importFromJsonString(payload, DEFAULTS);
    expect(result.settings.familyStatus).toBe(DEFAULTS.familyStatus);
    expect(result.settings.taxShares).toBe(DEFAULTS.taxShares);
  });

  it('treats missing arrays as empty', () => {
    const payload = JSON.stringify({
      version: 1,
      app: 'stock-tax-simulator',
      exportedAt: new Date().toISOString(),
      settings: DEFAULTS,
    });
    const result = importFromJsonString(payload, DEFAULTS);
    expect(result.lots).toEqual([]);
    expect(result.soldLots).toEqual([]);
    expect(result.savedSimulations).toEqual([]);
  });
});
