import { describe, it, expect } from 'vitest';
import {
  enrichDividendsWithEur,
  groupDividendsByYear,
  buildDeclarationLines,
  totalCashInterestUsd,
} from '../dividends';

describe('enrichDividendsWithEur', () => {
  it('converts USD amounts to EUR at the date rate', () => {
    const events = [
      { broker: 'fidelity' as const, date: new Date(2025, 11, 11), grossUsd: 100, taxWithheldUsd: 15, netUsd: 85 },
    ];
    const rates = { '2025-12-11': 1.1 };
    const { enriched, missingDates } = enrichDividendsWithEur(events, rates);
    expect(missingDates).toEqual([]);
    expect(enriched).toHaveLength(1);
    expect(enriched[0].grossEur).toBeCloseTo(90.91, 2);
    expect(enriched[0].taxWithheldEur).toBeCloseTo(13.64, 2);
    expect(enriched[0].netEur).toBeCloseTo(77.27, 2);
  });

  it('reports missing dates and skips them', () => {
    const events = [
      { broker: 'fidelity' as const, date: new Date(2025, 0, 1), grossUsd: 10, taxWithheldUsd: 0, netUsd: 10 },
      { broker: 'fidelity' as const, date: new Date(2025, 5, 15), grossUsd: 20, taxWithheldUsd: 0, netUsd: 20 },
    ];
    const { enriched, missingDates } = enrichDividendsWithEur(events, { '2025-01-01': 1.08 });
    expect(enriched).toHaveLength(1);
    expect(missingDates).toEqual(['2025-06-15']);
  });
});

describe('groupDividendsByYear', () => {
  it('aggregates by calendar year', () => {
    const enriched = [
      { broker: 'fidelity' as const, date: new Date(2024, 2, 11), grossUsd: 50, taxWithheldUsd: 7.5, netUsd: 42.5, grossEur: 46, taxWithheldEur: 6.9, netEur: 39.1, eurUsdRate: 1.087 },
      { broker: 'fidelity' as const, date: new Date(2025, 2, 13), grossUsd: 55, taxWithheldUsd: 8.25, netUsd: 46.75, grossEur: 50, taxWithheldEur: 7.5, netEur: 42.5, eurUsdRate: 1.1 },
      { broker: 'fidelity' as const, date: new Date(2025, 11, 11), grossUsd: 60, taxWithheldUsd: 9, netUsd: 51, grossEur: 54.55, taxWithheldEur: 8.18, netEur: 46.37, eurUsdRate: 1.1 },
    ];
    const groups = groupDividendsByYear(enriched);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ year: 2024, count: 1, grossUsd: 50 });
    expect(groups[1]).toMatchObject({ year: 2025, count: 2, grossUsd: 115 });
    expect(groups[1].grossEur).toBeCloseTo(104.55, 2);
  });
});

describe('buildDeclarationLines', () => {
  const summary = {
    year: 2025,
    count: 4,
    grossUsd: 300,
    taxWithheldUsd: 45,
    netUsd: 255,
    grossEur: 270,
    taxWithheldEur: 40.5,
    netEur: 229.5,
    events: [],
  };

  it('defaults to PFU: 2CG filled, 2BH = 0', () => {
    expect(buildDeclarationLines(summary)).toEqual({
      year: 2025,
      taxMode: 'pfu',
      box2DC: 270,
      box2CG: 270,
      box2BH: 0,
      box2AB: 40.5,
      box2CK: 0,
      box8VL: 40.5,
      box8PL: 229.5,
    });
  });

  it('barème option: 2BH filled, 2CG = 0', () => {
    const lines = buildDeclarationLines(summary, { taxMode: 'bareme' });
    expect(lines.taxMode).toBe('bareme');
    expect(lines.box2BH).toBe(270);
    expect(lines.box2CG).toBe(0);
  });

  it('PFNL already paid is reported on 2CK only when provided', () => {
    const lines = buildDeclarationLines(summary, { pfnlAlreadyPaidEur: 34.56 });
    expect(lines.box2CK).toBe(34.56);
  });

  it('2AB and 8VL both reflect the foreign withholding (US 15 %)', () => {
    const lines = buildDeclarationLines(summary);
    expect(lines.box2AB).toBe(summary.taxWithheldEur);
    expect(lines.box8VL).toBe(summary.taxWithheldEur);
    expect(lines.box8PL).toBe(summary.netEur);
  });
});

describe('dividends anti-regression guards', () => {
  const summary = {
    year: 2025,
    count: 1,
    grossUsd: 100,
    taxWithheldUsd: 15,
    netUsd: 85,
    grossEur: 100,
    taxWithheldEur: 15,
    netEur: 85,
    events: [],
  };

  it('2BH and 2CG are mutually exclusive (only one is non-zero)', () => {
    const pfu = buildDeclarationLines(summary, { taxMode: 'pfu' });
    const bareme = buildDeclarationLines(summary, { taxMode: 'bareme' });
    expect(pfu.box2BH === 0 || pfu.box2CG === 0).toBe(true);
    expect(bareme.box2BH === 0 || bareme.box2CG === 0).toBe(true);
    expect(pfu.box2BH).toBe(0);
    expect(bareme.box2CG).toBe(0);
  });

  it('does NOT report the foreign withholding on 2CK (which is the PFNL, not the US tax credit)', () => {
    // Régression: 2CK n'est PAS le crédit d'impôt (qui va en 8VL).
    const lines = buildDeclarationLines(summary);
    expect(lines.box2CK).toBe(0);
    expect(lines.box8VL).toBe(15);
  });

  it('keeps the full set of expected dividend boxes', () => {
    const lines = buildDeclarationLines(summary);
    expect(lines).toHaveProperty('box2DC');
    expect(lines).toHaveProperty('box2CG');
    expect(lines).toHaveProperty('box2BH');
    expect(lines).toHaveProperty('box2AB');
    expect(lines).toHaveProperty('box2CK');
    expect(lines).toHaveProperty('box8VL');
    expect(lines).toHaveProperty('box8PL');
  });
});

describe('totalCashInterestUsd', () => {
  it('sums cash-sweep interest', () => {
    const events = [
      { broker: 'fidelity' as const, date: new Date(2025, 5, 30), amountUsd: 7.52 },
      { broker: 'fidelity' as const, date: new Date(2025, 11, 31), amountUsd: 0.31 },
    ];
    expect(totalCashInterestUsd(events)).toBe(7.83);
  });
});
