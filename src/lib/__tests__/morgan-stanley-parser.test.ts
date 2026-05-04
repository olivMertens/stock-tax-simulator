// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { parseMsSalesCsv, parseMsHoldingsCsv } from '../brokers/morgan-stanley';

describe('parseMsHoldingsCsv', () => {
  const sample = [
    'Holdings by Lot',
    'Acquisition Date,Savings Plan Name,Lot Number,Current Share Quantity,Current Value',
    // Cash dividend row (no acq date, no lot, value=quantity) — must be skipped
    ',Microsoft Stock Awards,,"1,570.570000","$1,570.57"',
    '31-Aug-2012,Microsoft Stock Awards,119,495.000000,"$15,008.40"',
    '14-Jun-2024,Microsoft Stock Awards,1,0.042000,$18.55',
    ',Microsoft Corporation Long Share Savings Plan,,261.430000,$261.43',
    '12-Mar-2009,Microsoft Corporation Long Share Savings Plan,770,0.990000,$16.84',
    '30-Nov-2023,Microsoft Qualified Stock Awards - Macron,1,5.000000,"$1,894.25"',
    // Unknown plan — should be skipped, not crash
    '01-Jan-2020,Some Other Plan,1,1.000000,$10.00',
    // Footer prose lines (single comma-less cell) — must be skipped
    'Includes shares from stock award vests on/after November 30, 2023.',
  ].join('\n');

  it('parses valid lots and skips cash / unknown / footer rows', () => {
    const lots = parseMsHoldingsCsv(sample);
    expect(lots).toHaveLength(4);
    expect(lots.every(l => l.broker === 'morgan_stanley')).toBe(true);
    expect(lots.every(l => l.importCurrency === 'USD')).toBe(true);
  });

  it('maps plan names to the correct origin', () => {
    const lots = parseMsHoldingsCsv(sample);
    const byOrigin = (o: string) => lots.filter(l => l.origin === o).length;
    expect(byOrigin('DO')).toBe(2); // Microsoft Stock Awards
    expect(byOrigin('SP')).toBe(1); // ESPP
    expect(byOrigin('FM')).toBe(1); // Macron qualified
  });

  it('uses Current Value as the cost basis (USD)', () => {
    const lots = parseMsHoldingsCsv(sample);
    const lot = lots.find(l => l.quantity === 5)!;
    expect(lot.totalCostBasisUsd).toBeCloseTo(1894.25, 2);
    expect(lot.costBasisPerShareUsd).toBeCloseTo(1894.25 / 5, 4);
    // Current value defaults to cost basis (no market price in this file)
    expect(lot.currentValueUsd).toBeCloseTo(1894.25, 2);
  });

  it('computes ESPP FMV (cost basis / 0.90) for SP origin only', () => {
    const lots = parseMsHoldingsCsv(sample);
    const espp = lots.find(l => l.origin === 'SP')!;
    expect(espp.esppFmvPerShareUsd).toBeCloseTo((16.84 / 0.99) / 0.90, 4);
    const stockAward = lots.find(l => l.origin === 'DO')!;
    expect(stockAward.esppFmvPerShareUsd).toBeUndefined();
  });
});

describe('parseMsSalesCsv', () => {
  const sample = [
    'Date,Plan Name,Fund Name,Type,Order Status,Sale Price,Quantity,Net Cash Proceeds,Acquisition Date,Acquisition Value',
    '22-Dec-2025,Microsoft Stock Awards,MSFT,Ad Hoc,Complete,$488.00,5,"$134,763.05",31-Aug-2022,"$1,314.85"',
    '22-Dec-2025,Microsoft Stock Awards,MSFT,Ad Hoc,Complete,$488.00,8,"$134,763.05",05-Sep-2022,"$2,663.12"',
    // Cancelled order — must be skipped
    '15-Jun-2024,Microsoft Stock Awards,MSFT,Ad Hoc,Cancelled,$420.00,2,$0.00,01-Jan-2020,$200.00',
    '10-Mar-2025,Microsoft Corporation Long Share Savings Plan,MSFT,Historical Transaction,Complete,$390.00,3,"$1,170.00",10-Mar-2020,$420.00',
  ].join('\n');

  it('keeps only completed sales', () => {
    const sales = parseMsSalesCsv(sample);
    expect(sales).toHaveLength(3);
    expect(sales.every(s => s.broker === 'morgan_stanley')).toBe(true);
  });

  it('computes proceeds as quantity × salePrice (ignores Net Cash Proceeds)', () => {
    const sales = parseMsSalesCsv(sample);
    const dec22 = sales.filter(s => s.saleDate.getMonth() === 11);
    expect(dec22[0].proceedsUsd).toBeCloseTo(5 * 488, 2);
    expect(dec22[1].proceedsUsd).toBeCloseTo(8 * 488, 2);
  });

  it('reads acquisition value as cost basis', () => {
    const sales = parseMsSalesCsv(sample);
    const lot = sales.find(s => s.quantity === 5)!;
    expect(lot.costBasisUsd).toBeCloseTo(1314.85, 2);
  });

  it('maps plan names to origin', () => {
    const sales = parseMsSalesCsv(sample);
    expect(sales.find(s => s.origin === 'SP')).toBeDefined();
    expect(sales.find(s => s.origin === 'DO')).toBeDefined();
  });

  it('infers Long holding period when held ≥ 1 year', () => {
    const sales = parseMsSalesCsv(sample);
    // 31-Aug-2022 → 22-Dec-2025 = Long
    const longSale = sales.find(s => s.acquisitionDate.getFullYear() === 2022 && s.acquisitionDate.getMonth() === 7)!;
    expect(longSale.holdingPeriod).toBe('Long');
  });

  it('throws when no recognizable header row is found', () => {
    expect(() => parseMsSalesCsv('foo,bar,baz\n1,2,3')).toThrow(/Format Morgan Stanley/);
  });

  it('throws an explicit error when sales lack per-lot detail (Show Withdrawal by Lot unchecked)', () => {
    const noLotDetail = [
      'Share Sales',
      'Date,Plan Name,Fund Name,Type,Order Status,Sale Price,Quantity,Net Cash Proceeds,Acquisition Date,Acquisition Value',
      // Three completed sales with empty Acquisition Date / Value (the
      // exact shape produced when "Show Withdrawal by Lot" is unticked)
      '23-Dec-2022,Microsoft Stock Awards,MSFT,Ad Hoc,Complete,$238.19,730.000000,,,',
      '04-Sep-2018,Microsoft Stock Awards,MSFT,Historical Transaction,Complete,$111.74,57.151000,"$6,371.07",,',
      '06-Jul-2020,Microsoft Stock Awards,MSFT,Historical Transaction,Complete,$208.71,129.366000,"$26,984.43",,',
    ].join('\n');
    expect(() => parseMsSalesCsv(noLotDetail)).toThrow(/Show Withdrawal by Lot/);
  });

  it('parses Excel-serial dates (XLSX-style numeric input)', () => {
    // 46013 = 22-Dec-2025; 44804 = 31-Aug-2022
    const xlsxStyle = [
      'Date,Plan Name,Fund Name,Type,Order Status,Sale Price,Quantity,Net Cash Proceeds,Acquisition Date,Acquisition Value',
      '46013,Microsoft Stock Awards,MSFT,Ad Hoc,Complete,488,5,134763.05,44804,1314.85',
    ].join('\n');
    const sales = parseMsSalesCsv(xlsxStyle);
    expect(sales).toHaveLength(1);
    expect(sales[0].saleDate.getFullYear()).toBe(2025);
    expect(sales[0].saleDate.getMonth()).toBe(11);
    expect(sales[0].saleDate.getDate()).toBe(22);
    expect(sales[0].acquisitionDate.getFullYear()).toBe(2022);
  });
});
