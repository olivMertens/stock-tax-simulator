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
  it('maps the year summary to 2DC / 2AB / 2BH boxes', () => {
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
    expect(buildDeclarationLines(summary)).toEqual({
      year: 2025,
      box2DC: 270,
      box2AB: 40.5,
      box2BH: 270,
    });
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
