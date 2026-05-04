import { describe, it, expect } from 'vitest';
import { parseTransactionHistoryCsv } from '../brokers/fidelity/transactions-parser';

const HEADER = "Date de transaction,Type de transaction,Nom de l'investissement,Actions,Montant";

describe('parseTransactionHistoryCsv', () => {
  it('extracts MSFT dividends and pairs them with US withholding', () => {
    const csv = [
      HEADER,
      'Dec-11-2025,DIVIDEND RECEIVED,MICROSOFT CORP,-,$86.04',
      'Dec-11-2025,NON-RESIDENT TAX,MICROSOFT CORP,-,-$12.91',
      'Sep-11-2025,DIVIDEND RECEIVED,MICROSOFT CORP,-,$63.38',
      'Sep-11-2025,NON-RESIDENT TAX,MICROSOFT CORP,-,-$9.51',
    ].join('\n');
    const { dividends, cashInterest, warnings } = parseTransactionHistoryCsv(csv);
    expect(warnings).toEqual([]);
    expect(cashInterest).toEqual([]);
    expect(dividends).toHaveLength(2);
    expect(dividends[0]).toMatchObject({
      grossUsd: 63.38,
      taxWithheldUsd: 9.51,
      netUsd: 53.87,
    });
    expect(dividends[1]).toMatchObject({
      grossUsd: 86.04,
      taxWithheldUsd: 12.91,
      netUsd: 73.13,
    });
  });

  it('sorts dividends by date ascending', () => {
    const csv = [
      HEADER,
      'Dec-11-2025,DIVIDEND RECEIVED,MICROSOFT CORP,-,$86.04',
      'Mar-13-2025,DIVIDEND RECEIVED,MICROSOFT CORP,-,$50.00',
    ].join('\n');
    const { dividends } = parseTransactionHistoryCsv(csv);
    expect(dividends.map((d) => d.date.getMonth())).toEqual([2, 11]);
  });

  it('ignores unrelated rows (ESPP, sales, conversion deposits)', () => {
    const csv = [
      HEADER,
      'Sep-30-2025,YOU BOUGHT ESPP### AS OF 09-30-25,MICROSOFT CORP,7.0125,-$3268.95',
      'May-12-2025,YOU SOLD,MICROSOFT CORP,-5.00,$2239.93',
      'Dec-15-2025,CONVERSION SHARES DEPOSITED,MICROSOFT CORP,2.541,$0.00',
      'Dec-11-2025,DIVIDEND RECEIVED,MICROSOFT CORP,-,$86.04',
    ].join('\n');
    const { dividends } = parseTransactionHistoryCsv(csv);
    expect(dividends).toHaveLength(1);
    expect(dividends[0].grossUsd).toBe(86.04);
  });

  it('separates money-market fund interest', () => {
    const csv = [
      HEADER,
      'Dec-31-2025,DIVIDEND RECEIVED,FID TREASURY ONLY MMKT FUND CL OUS,-,$0.31',
      'Jun-30-2025,DIVIDEND RECEIVED,FID TREASURY ONLY MMKT FUND CL OUS,-,$7.52',
      'Dec-11-2025,DIVIDEND RECEIVED,MICROSOFT CORP,-,$86.04',
    ].join('\n');
    const { dividends, cashInterest } = parseTransactionHistoryCsv(csv);
    expect(dividends).toHaveLength(1);
    expect(cashInterest).toHaveLength(2);
    expect(cashInterest[0].amountUsd).toBe(7.52);
  });

  it('handles dividends without tax withholding (net = gross)', () => {
    const csv = [
      HEADER,
      'Dec-11-2025,DIVIDEND RECEIVED,MICROSOFT CORP,-,$86.04',
    ].join('\n');
    const { dividends } = parseTransactionHistoryCsv(csv);
    expect(dividends[0]).toMatchObject({
      grossUsd: 86.04,
      taxWithheldUsd: 0,
      netUsd: 86.04,
    });
  });

  it('warns when tax lines have no matching dividend', () => {
    const csv = [
      HEADER,
      'Dec-11-2025,NON-RESIDENT TAX,MICROSOFT CORP,-,-$12.91',
    ].join('\n');
    const { dividends, warnings } = parseTransactionHistoryCsv(csv);
    expect(dividends).toHaveLength(0);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toMatch(/Dec-11-2025/);
  });

  it('parses amounts with thousand separators', () => {
    const csv = [
      HEADER,
      'Dec-11-2025,DIVIDEND RECEIVED,MICROSOFT CORP,-,"$1,234.56"',
      'Dec-11-2025,NON-RESIDENT TAX,MICROSOFT CORP,-,"-$185.18"',
    ].join('\n');
    const { dividends } = parseTransactionHistoryCsv(csv);
    expect(dividends[0]).toMatchObject({
      grossUsd: 1234.56,
      taxWithheldUsd: 185.18,
      netUsd: 1049.38,
    });
  });

  it('rejects a file with an unexpected header', () => {
    const csv = ['Wrong,Header,Format', 'a,b,c'].join('\n');
    expect(() => parseTransactionHistoryCsv(csv)).toThrow(/en-tête/i);
  });

  it('returns empty result for empty file', () => {
    expect(parseTransactionHistoryCsv('')).toEqual({ dividends: [], cashInterest: [], warnings: ['Fichier vide.'] });
  });
});
