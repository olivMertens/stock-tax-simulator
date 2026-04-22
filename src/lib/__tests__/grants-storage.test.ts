// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { loadGrants, saveGrants, clearGrants, GRANTS_STORAGE_KEY } from '../storage';
import type { GrantInfo } from '../types';

const GRANT: GrantInfo = {
  grantIdHash: 'abc123',
  awardType: 'FY23 FQ Annual',
  awardDate: new Date(2022, 7, 31),
  planType: 'qualified_macron',
  origin: 'FM',
  vestSchedule: [
    { date: new Date(2023, 7, 15), shares: 9 },
    { date: new Date(2024, 7, 15), shares: 8 },
  ],
  totalAwarded: 39,
  totalVested: 36,
  totalUnvested: 3,
};

describe('grants persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips a grant through save and load', () => {
    saveGrants([GRANT]);
    const loaded = loadGrants();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].grantIdHash).toBe(GRANT.grantIdHash);
    expect(loaded[0].awardDate.toISOString()).toBe(GRANT.awardDate.toISOString());
    expect(loaded[0].vestSchedule).toHaveLength(2);
    expect(loaded[0].vestSchedule[0].shares).toBe(9);
  });

  it('returns empty array when nothing is stored', () => {
    expect(loadGrants()).toEqual([]);
  });

  it('returns empty array on corrupted JSON', () => {
    localStorage.setItem(GRANTS_STORAGE_KEY, '{not json');
    expect(loadGrants()).toEqual([]);
  });

  it('drops grants with invalid shapes', () => {
    localStorage.setItem(
      GRANTS_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        data: [
          { grantIdHash: '', awardType: 'X', awardDate: '2022-05-15', planType: 'qualified_macron', origin: 'FM' },
          { grantIdHash: 'ok', awardType: 'Y', awardDate: 'not-a-date', planType: 'qualified_macron', origin: 'FM' },
          { grantIdHash: 'valid', awardType: 'Z', awardDate: '2022-05-15', planType: 'qualified_macron', origin: 'FM', vestSchedule: [] },
        ],
      }),
    );
    const loaded = loadGrants();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].awardType).toBe('Z');
  });

  it('clearGrants removes stored data', () => {
    saveGrants([GRANT]);
    clearGrants();
    expect(loadGrants()).toEqual([]);
  });
});
