import { describe, it, expect } from 'vitest';
import { reconcileLots } from '../stockexport-reconciliation';
import type { GrantInfo, StockLot } from '../types';

function makeLot(partial: Partial<StockLot> & Pick<StockLot, 'id' | 'acquisitionDate' | 'origin'>): StockLot {
  return {
    quantity: 2,
    costBasisPerShare: 0,
    totalCostBasis: 0,
    currentValue: 0,
    unrealizedGainLoss: 0,
    holdingPeriod: 'Short',
    planType: 'qualified_macron',
    ...partial,
  } as StockLot;
}

function makeGrant(partial: Partial<GrantInfo> & Pick<GrantInfo, 'grantIdHash' | 'vestSchedule'>): GrantInfo {
  return {
    awardType: 'FY23 FQ Annual',
    awardDate: new Date(2022, 7, 31),
    planType: 'qualified_macron',
    origin: 'FM',
    totalAwarded: 0,
    totalVested: 0,
    totalUnvested: 0,
    ...partial,
  } as GrantInfo;
}

describe('reconcileLots', () => {
  it('reconciles a DO lot when a single grant has a vest on the same date', () => {
    const lot = makeLot({
      id: 'lot-1',
      acquisitionDate: new Date(2024, 1, 15),
      origin: 'DO',
      planType: 'qualified_macron',
    });
    const grant = makeGrant({
      grantIdHash: 'hash-a',
      awardType: 'On-Hire FQ',
      awardDate: new Date(2022, 4, 15),
      planType: 'qualified_macron',
      origin: 'FM',
      vestSchedule: [{ date: new Date(2024, 1, 15), shares: 3 }],
    });

    const { lots, stats } = reconcileLots([lot], [grant]);

    expect(stats.reconciled).toBe(1);
    expect(lots[0].reconciled).toBe(true);
    expect(lots[0].origin).toBe('FM');
    expect(lots[0].planType).toBe('qualified_macron');
    expect(lots[0].grantIdHash).toBe('hash-a');
    expect(lots[0].awardType).toBe('On-Hire FQ');
  });

  it('leaves ESPP lots alone (they are self-describing via Fidelity)', () => {
    const lot = makeLot({
      id: 'espp-1',
      acquisitionDate: new Date(2025, 5, 30),
      origin: 'SP',
      planType: 'non_qualified',
    });
    const { lots, stats } = reconcileLots([lot], []);
    expect(stats.notApplicable).toBe(1);
    expect(lots[0].reconciled).toBeUndefined();
  });

  it('does not reconcile when no grant matches the vest date', () => {
    const lot = makeLot({
      id: 'lot-1',
      acquisitionDate: new Date(2024, 1, 15),
      origin: 'DO',
    });
    const grant = makeGrant({
      grantIdHash: 'hash-a',
      vestSchedule: [{ date: new Date(2025, 0, 1), shares: 3 }],
    });
    const { lots, stats } = reconcileLots([lot], [grant]);
    expect(stats.unmatched).toBe(1);
    expect(lots[0].reconciled).toBeUndefined();
  });

  it('still reconciles when multiple grants share a vest date but agree on classification', () => {
    const lot = makeLot({
      id: 'lot-1',
      acquisitionDate: new Date(2024, 1, 15),
      origin: 'DO',
    });
    const grantA = makeGrant({
      grantIdHash: 'hash-a',
      vestSchedule: [{ date: new Date(2024, 1, 15), shares: 3 }],
    });
    const grantB = makeGrant({
      grantIdHash: 'hash-b',
      vestSchedule: [{ date: new Date(2024, 1, 15), shares: 2 }],
    });
    const { stats, lots } = reconcileLots([lot], [grantA, grantB]);
    expect(stats.reconciled).toBe(1);
    expect(lots[0].origin).toBe('FM');
  });

  it('flags as ambiguous when candidates disagree on planType', () => {
    const lot = makeLot({
      id: 'lot-1',
      acquisitionDate: new Date(2024, 1, 15),
      origin: 'DO',
    });
    const grantA = makeGrant({
      grantIdHash: 'hash-a',
      planType: 'qualified_macron',
      origin: 'FM',
      vestSchedule: [{ date: new Date(2024, 1, 15), shares: 3 }],
    });
    const grantB = makeGrant({
      grantIdHash: 'hash-b',
      awardType: 'FY24 SA Annual',
      planType: 'non_qualified',
      origin: 'DO',
      vestSchedule: [{ date: new Date(2024, 1, 15), shares: 2 }],
    });
    const { stats, lots, warnings } = reconcileLots([lot], [grantA, grantB]);
    expect(stats.ambiguous).toBe(1);
    expect(lots[0].reconciled).toBeUndefined();
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('does not double-count one grant that has the same vest date twice', () => {
    const lot = makeLot({
      id: 'lot-1',
      acquisitionDate: new Date(2024, 1, 15),
      origin: 'DO',
    });
    const grant = makeGrant({
      grantIdHash: 'hash-a',
      vestSchedule: [
        { date: new Date(2024, 1, 15), shares: 2 },
        { date: new Date(2024, 1, 15), shares: 1 },
      ],
    });
    const { stats } = reconcileLots([lot], [grant]);
    expect(stats.reconciled).toBe(1);
  });

  it('matches Fidelity deposit dates up to 5 days after the Microsoft vest date', () => {
    // Real-world case: MSFT vests Aug-31, Fidelity deposits Sep-02 (2-day lag).
    // Similarly: vest Feb-15, deposit Feb-18 (3-day lag).
    const lotA = makeLot({ id: 'lot-a', acquisitionDate: new Date(2025, 8, 2), origin: 'DO' });
    const lotB = makeLot({ id: 'lot-b', acquisitionDate: new Date(2025, 1, 18), origin: 'DO' });
    const lotC = makeLot({ id: 'lot-c', acquisitionDate: new Date(2025, 11, 1), origin: 'DO' });
    const grant = makeGrant({
      grantIdHash: 'hash-a',
      vestSchedule: [
        { date: new Date(2025, 7, 31), shares: 9 },  // matches lotA (2-day lag)
        { date: new Date(2025, 1, 15), shares: 3 },  // matches lotB (3-day lag)
        { date: new Date(2025, 10, 30), shares: 2 }, // matches lotC (1-day lag)
      ],
    });
    const { stats, lots } = reconcileLots([lotA, lotB, lotC], [grant]);
    expect(stats.reconciled).toBe(3);
    expect(lots.every((l) => l.reconciled)).toBe(true);
  });
});
