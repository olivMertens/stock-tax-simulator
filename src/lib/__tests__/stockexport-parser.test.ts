// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { buildGrantsForTest, classifyAward } from '../stockexport-parser';
import type { SheetRow } from '../xlsx-reader';

// Helper to build a SheetRow from a plain record.
function row(rowIndex: number, cells: Record<string, string>): SheetRow {
  return { rowIndex, cells };
}

describe('classifyAward', () => {
  it('classifies FQ awards granted on/after Macron law as qualified_macron (origin FM)', () => {
    expect(classifyAward('FY23 FQ Annual', new Date(2022, 7, 31))).toEqual({
      origin: 'FM', planType: 'qualified_macron',
    });
    expect(classifyAward('On-Hire FQ', new Date(2022, 4, 15))).toEqual({
      origin: 'FM', planType: 'qualified_macron',
    });
  });

  it('classifies FQ awards granted before 2015-08-07 as qualified_pre_macron (origin FQ)', () => {
    expect(classifyAward('FQ Annual', new Date(2014, 0, 15))).toEqual({
      origin: 'FQ', planType: 'qualified_pre_macron',
    });
  });

  it('classifies ESPP as non_qualified with origin SP', () => {
    expect(classifyAward('ESPP', new Date(2024, 5, 30))).toEqual({
      origin: 'SP', planType: 'non_qualified',
    });
  });

  it('classifies SA (Stock Award) as non_qualified with origin DO', () => {
    expect(classifyAward('FY24 SA Annual', new Date(2023, 7, 31))).toEqual({
      origin: 'DO', planType: 'non_qualified',
    });
  });

  it('defaults unknown labels to non_qualified DO', () => {
    expect(classifyAward('Mystery Grant', new Date(2020, 0, 1))).toEqual({
      origin: 'DO', planType: 'non_qualified',
    });
  });
});

describe('buildGrantsForTest', () => {
  const awardHeader = row(1, { D: 'Award ID', E: 'Award Date', F: 'Award Type' });
  const vestHeader = row(1, { D: 'Award ID', H: 'Vest Date', I: 'Vest Shares' });

  it('builds grants with vest schedules indexed by Award ID', () => {
    const awardRows = [
      awardHeader,
      row(2, { D: 'A-1', E: '2022-05-15', F: 'On-Hire FQ', G: '39', I: '36', J: '3' }),
      row(3, { D: 'A-2', E: '2023-08-31', F: 'FY23 FQ Annual', G: '42', I: '21', J: '21' }),
    ];
    const vestRows = [
      vestHeader,
      row(2, { D: 'A-1', H: '2023-05-15', I: '9' }),
      row(3, { D: 'A-1', H: '2023-08-15', I: '3' }),
      row(4, { D: 'A-2', H: '2024-02-15', I: '3' }),
    ];

    const { grants, warnings } = buildGrantsForTest(awardRows, vestRows);

    expect(warnings).toEqual([]);
    expect(grants).toHaveLength(2);

    const a1 = grants[0];
    expect(a1.awardType).toBe('On-Hire FQ');
    expect(a1.planType).toBe('qualified_macron');
    expect(a1.origin).toBe('FM');
    expect(a1.vestSchedule).toHaveLength(2);
    expect(a1.vestSchedule[0].date.getFullYear()).toBe(2023);
    expect(a1.vestSchedule[0].shares).toBe(9);

    const a2 = grants[1];
    expect(a2.vestSchedule).toHaveLength(1);
    expect(a2.vestSchedule[0].shares).toBe(3);
  });

  it('skips rows with invalid dates and surfaces a warning', () => {
    const { grants, warnings } = buildGrantsForTest(
      [awardHeader, row(2, { D: 'A-1', E: 'not-a-date', F: 'FY23 FQ Annual' })],
      [vestHeader],
    );
    expect(grants).toHaveLength(0);
    expect(warnings.some((w) => w.includes("Date d'attribution"))).toBe(true);
  });

  it('sorts vest events by date within a grant', () => {
    const awardRows = [awardHeader, row(2, { D: 'A-1', E: '2022-05-15', F: 'On-Hire FQ' })];
    const vestRows = [
      vestHeader,
      row(2, { D: 'A-1', H: '2024-05-15', I: '2' }),
      row(3, { D: 'A-1', H: '2023-05-15', I: '9' }),
      row(4, { D: 'A-1', H: '2023-11-15', I: '2' }),
    ];
    const { grants } = buildGrantsForTest(awardRows, vestRows);
    const dates = grants[0].vestSchedule.map((v) => v.date.getFullYear() * 100 + v.date.getMonth() + 1);
    expect(dates).toEqual([...dates].sort((a, b) => a - b));
  });
});
