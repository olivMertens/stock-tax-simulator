import { describe, it, expect } from 'vitest';
import { parseCsvFile, parseSalesCsvFile } from '../csv-parser';

const HEADER = "Date d'acquisition,Quantité,\"Coût total\",\"Coût/action\",\"Valeur actuelle\",\"+/- value\",\"Dispo vente\",\"Dispo transfert\",\"Date attribution\",Origine,\"Période détention\"";

function makeCsvRow(overrides: Partial<{
  date: string; qty: string; totalCost: string; costPerShare: string;
  currentValue: string; gl: string; saleDate: string; transferDate: string;
  grantDate: string; origin: string; holding: string;
}> = {}) {
  return [
    overrides.date ?? 'Mar-15-2023',
    overrides.qty ?? '100',
    overrides.totalCost ?? '2500000', // 25000.00
    overrides.costPerShare ?? '25000',  // 250.00
    overrides.currentValue ?? '4000000', // 40000.00
    overrides.gl ?? '1500000', // 15000.00
    overrides.saleDate ?? 'Mar-15-2024',
    overrides.transferDate ?? 'Mar-15-2024',
    overrides.grantDate ?? 'Jan-01-2022',
    overrides.origin ?? 'DO',
    overrides.holding ?? 'Short',
  ].join(',');
}

describe('parseCsvFile', () => {
  it('parses a valid CSV line (EUR)', () => {
    const csv = [HEADER, makeCsvRow()].join('\n');
    const lots = parseCsvFile(csv, 'EUR');

    expect(lots).toHaveLength(1);
    expect(lots[0].quantity).toBe(100);
    expect(lots[0].costBasisPerShare).toBe(250);
    expect(lots[0].totalCostBasis).toBe(25000);
    expect(lots[0].origin).toBe('DO');
    expect(lots[0].holdingPeriod).toBe('Short');
    expect(lots[0].importCurrency).toBe('EUR');
  });

  it('parses multiple rows', () => {
    const csv = [HEADER, makeCsvRow(), makeCsvRow({ date: 'Jun-01-2023', origin: 'SP' })].join('\n');
    const lots = parseCsvFile(csv, 'EUR');
    expect(lots).toHaveLength(2);
    expect(lots[1].origin).toBe('SP');
  });

  it('skips header row', () => {
    const csv = [HEADER, makeCsvRow()].join('\n');
    const lots = parseCsvFile(csv, 'EUR');
    expect(lots).toHaveLength(1);
  });

  it('skips footer lines containing "Les valeurs sont affichées en"', () => {
    const csv = [HEADER, makeCsvRow(), 'Les valeurs sont affichées en EUR,,,,,,,,,,'].join('\n');
    const lots = parseCsvFile(csv, 'EUR');
    expect(lots).toHaveLength(1);
  });

  it('skips rows with invalid dates', () => {
    const csv = [HEADER, makeCsvRow({ date: 'INVALID' })].join('\n');
    const lots = parseCsvFile(csv, 'EUR');
    expect(lots).toHaveLength(0);
  });

  it('skips rows with zero quantity', () => {
    const csv = [HEADER, makeCsvRow({ qty: '0' })].join('\n');
    const lots = parseCsvFile(csv, 'EUR');
    expect(lots).toHaveLength(0);
  });

  it('parses USD imports with raw USD values stored', () => {
    const csv = [HEADER, makeCsvRow()].join('\n');
    const lots = parseCsvFile(csv, 'USD');

    expect(lots).toHaveLength(1);
    expect(lots[0].importCurrency).toBe('USD');
    expect(lots[0].costBasisPerShareUsd).toBe(250);
    expect(lots[0].totalCostBasisUsd).toBe(25000);
    // EUR values should be 0 (awaiting ECB rate)
    expect(lots[0].costBasisPerShare).toBe(0);
    expect(lots[0].totalCostBasis).toBe(0);
  });

  it('assigns correct default plan type per origin', () => {
    const csvFM = [HEADER, makeCsvRow({ origin: 'FM' })].join('\n');
    const csvFQ = [HEADER, makeCsvRow({ origin: 'FQ' })].join('\n');
    const csvSP = [HEADER, makeCsvRow({ origin: 'SP' })].join('\n');
    const csvDO = [HEADER, makeCsvRow({ origin: 'DO' })].join('\n');

    expect(parseCsvFile(csvFM)[0].planType).toBe('qualified_macron');
    expect(parseCsvFile(csvFQ)[0].planType).toBe('qualified_pre_macron');
    expect(parseCsvFile(csvSP)[0].planType).toBe('non_qualified');
    expect(parseCsvFile(csvDO)[0].planType).toBe('qualified_macron');
  });

  it('handles empty input', () => {
    expect(parseCsvFile('')).toEqual([]);
    expect(parseCsvFile(HEADER)).toEqual([]);
  });

  it('parses date correctly (MMM-DD-YYYY)', () => {
    const csv = [HEADER, makeCsvRow({ date: 'Dec-25-2024' })].join('\n');
    const lots = parseCsvFile(csv, 'EUR');
    expect(lots[0].acquisitionDate.getFullYear()).toBe(2024);
    expect(lots[0].acquisitionDate.getMonth()).toBe(11); // December = 11
    expect(lots[0].acquisitionDate.getDate()).toBe(25);
  });

  it('parses amounts with Fidelity format (integer / 100)', () => {
    // 123456 → 1234.56
    const csv = [HEADER, makeCsvRow({ costPerShare: '123456' })].join('\n');
    const lots = parseCsvFile(csv, 'EUR');
    expect(lots[0].costBasisPerShare).toBe(1234.56);
  });
});

// --- Sales CSV tests ---

const SALES_HEADER = "Date d'acquisition,Quantité,Date de vente ou de transfert,Produits,Prix de revient,Plus-value/Moins-value,Durée";

function makeSalesRow(overrides: Partial<{
  acqDate: string; qty: string; saleDate: string;
  proceeds: string; costBasis: string; gainLoss: string; duration: string;
}> = {}) {
  return [
    overrides.acqDate ?? 'MAR/17/2025',
    overrides.qty ?? '0.4550',
    overrides.saleDate ?? 'MAR/17/2025',
    overrides.proceeds ?? '177.79',
    overrides.costBasis ?? '175.98',
    overrides.gainLoss ?? '1.81',
    overrides.duration ?? 'SHORT',
  ].join(',');
}

describe('parseSalesCsvFile', () => {
  it('parses a valid sales CSV line (USD)', () => {
    const csv = [SALES_HEADER, makeSalesRow()].join('\n');
    const lots = parseSalesCsvFile(csv, 'USD');
    expect(lots).toHaveLength(1);
    expect(lots[0].quantity).toBeCloseTo(0.455);
    expect(lots[0].proceedsUsd).toBeCloseTo(177.79);
    expect(lots[0].costBasisUsd).toBeCloseTo(175.98);
    expect(lots[0].holdingPeriod).toBe('Short');
    expect(lots[0].importCurrency).toBe('USD');
    // EUR values should be 0 awaiting ECB conversion
    expect(lots[0].proceeds).toBe(0);
    expect(lots[0].costBasis).toBe(0);
  });

  it('parses a valid sales CSV line (EUR)', () => {
    const csv = [SALES_HEADER, makeSalesRow()].join('\n');
    const lots = parseSalesCsvFile(csv, 'EUR');
    expect(lots).toHaveLength(1);
    expect(lots[0].proceeds).toBeCloseTo(177.79);
    expect(lots[0].costBasis).toBeCloseTo(175.98);
    expect(lots[0].gainLoss).toBeCloseTo(1.81);
    expect(lots[0].importCurrency).toBe('EUR');
  });

  it('parses dates in MMM/DD/YYYY format', () => {
    const csv = [SALES_HEADER, makeSalesRow({ acqDate: 'JUN/17/2024', saleDate: 'MAR/17/2025' })].join('\n');
    const lots = parseSalesCsvFile(csv, 'EUR');
    expect(lots[0].acquisitionDate.getFullYear()).toBe(2024);
    expect(lots[0].acquisitionDate.getMonth()).toBe(5); // June = 5
    expect(lots[0].acquisitionDate.getDate()).toBe(17);
    expect(lots[0].saleDate.getFullYear()).toBe(2025);
    expect(lots[0].saleDate.getMonth()).toBe(2); // March = 2
  });

  it('parses LONG holding period', () => {
    const csv = [SALES_HEADER, makeSalesRow({ duration: 'LONG' })].join('\n');
    const lots = parseSalesCsvFile(csv, 'EUR');
    expect(lots[0].holdingPeriod).toBe('Long');
  });

  it('parses multiple rows', () => {
    const csv = [
      SALES_HEADER,
      makeSalesRow(),
      makeSalesRow({ acqDate: 'FEB/28/2025', qty: '0.6350', proceeds: '248.14', costBasis: '249.40', gainLoss: '-1.26' }),
    ].join('\n');
    const lots = parseSalesCsvFile(csv, 'EUR');
    expect(lots).toHaveLength(2);
    expect(lots[1].gainLoss).toBeCloseTo(-1.26);
  });

  it('skips header row including HTML-styled headers', () => {
    const htmlHeader = '"Date d\'acquisition,Quantité,<span style=""color: rgb(0, 0, 51)"">Date de vente ou de transfert</span>,Produits,Prix de revient,Plus-value/Moins-value,Durée"';
    const csv = [htmlHeader, makeSalesRow()].join('\n');
    const lots = parseSalesCsvFile(csv, 'EUR');
    expect(lots).toHaveLength(1);
  });

  it('skips footer lines', () => {
    const csv = [SALES_HEADER, makeSalesRow(), ',', 'Les valeurs sont affichées en USD'].join('\n');
    const lots = parseSalesCsvFile(csv, 'EUR');
    expect(lots).toHaveLength(1);
  });

  it('skips empty rows', () => {
    const csv = [SALES_HEADER, makeSalesRow(), '', ',', makeSalesRow({ qty: '3.3560' })].join('\n');
    const lots = parseSalesCsvFile(csv, 'EUR');
    expect(lots).toHaveLength(2);
  });

  it('handles empty input', () => {
    expect(parseSalesCsvFile('')).toEqual([]);
    expect(parseSalesCsvFile(SALES_HEADER)).toEqual([]);
  });

  it('defaults origin to DO and planType to qualified_macron', () => {
    const csv = [SALES_HEADER, makeSalesRow()].join('\n');
    const lots = parseSalesCsvFile(csv, 'EUR');
    expect(lots[0].origin).toBe('DO');
    expect(lots[0].planType).toBe('qualified_macron');
  });

  it('parses negative gain/loss', () => {
    const csv = [SALES_HEADER, makeSalesRow({ gainLoss: '-208.85' })].join('\n');
    const lots = parseSalesCsvFile(csv, 'EUR');
    expect(lots[0].gainLoss).toBeCloseTo(-208.85);
  });

  it('parses real broker export with HTML header and wrapping quotes', () => {
    const realCsv = `"Date d'acquisition,Quantité,<span style=""color: rgb(0, 0, 51)"; background-color: rgb(255, 255, 255);">Date de vente ou de transfert</span>,Produits,Prix de revient,Plus-value/Moins-value,Durée
MAR/17/2025,0.4550,MAR/17/2025,177.79,175.98,1.81,SHORT
FEB/28/2025,0.6350,MAR/17/2025,248.14,249.40,-1.26,SHORT
MAR/17/2025,3.3560,MAR/17/2025,1311.22,1298.00,13.22,SHORT
JUN/17/2024,4.0420,MAR/17/2025,1579.49,1788.34,-208.85,SHORT
,
Les valeurs sont affichées en USD
"`;
    const lots = parseSalesCsvFile(realCsv, 'USD');
    expect(lots).toHaveLength(4);
    expect(lots[0].quantity).toBeCloseTo(0.455);
    expect(lots[0].proceedsUsd).toBeCloseTo(177.79);
    expect(lots[3].proceedsUsd).toBeCloseTo(1579.49);
    expect(lots[3].costBasisUsd).toBeCloseTo(1788.34);
    expect(lots[1].acquisitionDate.getMonth()).toBe(1); // February
    expect(lots[3].acquisitionDate.getMonth()).toBe(5); // June
  });
});
