import { describe, it, expect } from 'vitest';
import { parseMsActivityCells, detectOle2, parseMsActivityXlsx } from '../activity-parser';

// Helper: build a 2D string grid with named columns.
function row(...cells: string[]): string[] {
  return cells;
}
const blank = (): string[] => [];

describe('detectOle2', () => {
  it('flags OLE2 magic bytes (legacy .xls under .xlsx extension)', () => {
    const ole2 = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    expect(detectOle2(ole2.buffer)).toBe(true);
  });

  it('does not flag a real ZIP/XLSX header', () => {
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
    expect(detectOle2(zip.buffer)).toBe(false);
  });

  it('does not flag short buffers', () => {
    expect(detectOle2(new Uint8Array([0xd0, 0xcf]).buffer)).toBe(false);
  });
});

describe('parseMsActivityXlsx (top-level)', () => {
  it('rejects an OLE2-disguised file with a guidance message', async () => {
    const ole2 = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0, 0, 0, 0, 0]);
    await expect(parseMsActivityXlsx(ole2.buffer)).rejects.toThrow(/format Excel binaire/i);
  });
});

describe('parseMsActivityCells — full Activity sheet (Dupont-like)', () => {
  // Mirrors the structure observed on a real export: name row, Share Sales
  // section, blank, Dividend Reinvestment Activity, blank, Holdings by Lot,
  // and footnotes.
  const cells: string[][] = [
    row('Dupont Martin'),
    blank(),
    row('Share Sales'),
    row('Date', 'Plan Name', 'Fund Name', 'Type', 'Order Status', 'Sale Price', 'Quantity', 'Net Cash Proceeds', 'Acquisition Date', 'Acquisition Value'),
    row('46013', 'Microsoft Stock Awards', 'MSFT', 'Ad Hoc', 'Complete', '488', '5', '2440', '44804', '1314.85'),
    row('46013', 'Microsoft Stock Awards', 'MSFT', 'Ad Hoc', 'Complete', '488', '8', '2440', '45076', '2663.12'),
    blank(),
    row('Dividend Reinvestment Activity'),
    row('Date', 'Savings Plan Name', 'Fund Name', 'Activity', 'Cash', 'Share Quantity', 'Share Price'),
    row('46006', 'Microsoft Stock Awards', 'MSFT', 'You bought (dividend)', '-7.42', '0.015', '479.48'),
    row('46006', 'Microsoft Qualified Stock Awards - Macron', 'MSFT', 'You bought (dividend)', '-8.54', '0.018', '479.48'),
    blank(),
    row('Holdings by Lot'),
    row('Acquisition Date', 'Savings Plan Name', 'Lot Number', 'Current Share Quantity', 'Current Value'),
    // Sub-total row (empty acquisition date and lot number) — must be skipped.
    row('', 'Microsoft Stock Awards', '', '1570.57', '1570.57'),
    row('41152', 'Microsoft Stock Awards', '119', '495', '15008.4'),
    row('45260', 'Microsoft Qualified Stock Awards - Macron', '1', '5', '1894.25'),
    row('Includes shares from stock award vests on/after November 30, 2023.'),
  ];

  it('extracts sales, dividends, and holdings independently', () => {
    const result = parseMsActivityCells(cells);

    expect(result.soldLots).toHaveLength(2);
    expect(result.soldLots[0].broker).toBe('morgan_stanley');
    expect(result.soldLots[0].quantity).toBe(5);
    expect(result.soldLots[0].proceedsUsd).toBe(2440);
    expect(result.soldLots[0].costBasisUsd).toBe(1314.85);
    expect(result.soldLots[0].origin).toBe('DO');

    expect(result.lots).toHaveLength(2);
    expect(result.lots[0].quantity).toBe(495);
    expect(result.lots[0].totalCostBasisUsd).toBe(15008.4);
    expect(result.lots[0].origin).toBe('DO');
    expect(result.lots[1].origin).toBe('FM');

    expect(result.dividends).toHaveLength(2);
    // Net 7.42 → gross 7.42 / 0.85 ≈ 8.73, withholding ≈ 1.31
    expect(result.dividends[0].netUsd).toBe(7.42);
    expect(result.dividends[0].grossUsd).toBeCloseTo(8.73, 2);
    expect(result.dividends[0].taxWithheldUsd).toBeCloseTo(1.31, 2);
    expect(result.dividends[0].broker).toBe('morgan_stanley');
  });
});

describe('parseMsActivityCells — no Share Sales (Jones-like)', () => {
  const cells: string[][] = [
    row('Patrick Jones'),
    blank(),
    row('Dividend Reinvestment Activity'),
    row('Date', 'Savings Plan Name', 'Fund Name', 'Activity', 'Cash', 'Share Quantity', 'Share Price'),
    row('46006', 'Microsoft Stock Awards', 'MSFT', 'You bought (dividend)', '-7.42', '0.015', '479.48'),
    blank(),
    row('Holdings by Lot'),
    row('Acquisition Date', 'Savings Plan Name', 'Lot Number', 'Current Share Quantity', 'Current Value'),
    row('45457', 'Microsoft Stock Awards', '1', '0.141', '62.1'),
    row('45538', 'Microsoft Qualified Stock Awards - Macron', '1', '5', '2089.95'),
  ];

  it('returns zero sales but parses dividends and positions', () => {
    const result = parseMsActivityCells(cells);
    expect(result.soldLots).toHaveLength(0);
    expect(result.lots).toHaveLength(2);
    expect(result.dividends).toHaveLength(1);
  });
});

describe('parseMsActivityCells — currency rejection', () => {
  it('throws when a holdings row carries a non-USD currency code', () => {
    const cells: string[][] = [
      row('Holdings by Lot'),
      row('Acquisition Date', 'Savings Plan Name', 'Lot Number', 'Current Share Quantity', 'Current Value'),
      row('41564', 'Microsoft Stock Awards', '1', '1', '200', 'EUR'),
    ];
    expect(() => parseMsActivityCells(cells)).toThrow(/EUR/);
    expect(() => parseMsActivityCells(cells)).toThrow(/USD/);
  });

  it('throws when a dividends row carries a non-USD currency code', () => {
    const cells: string[][] = [
      row('Dividend Reinvestment Activity'),
      row('Date', 'Savings Plan Name', 'Fund Name', 'Activity', 'Cash', '', 'Share Quantity', 'Share Price', ''),
      row('46006', 'Microsoft Stock Awards', 'MSFT', 'You bought (dividend)', '-10', 'EUR', '1', '100', 'EUR'),
    ];
    expect(() => parseMsActivityCells(cells)).toThrow(/EUR/);
  });

  it('accepts USD when a currency code is present', () => {
    const cells: string[][] = [
      row('Holdings by Lot'),
      row('Acquisition Date', 'Savings Plan Name', 'Lot Number', 'Current Share Quantity', 'Current Value'),
      row('41564', 'Microsoft Stock Awards', '1', '1', '200', 'USD'),
    ];
    const result = parseMsActivityCells(cells);
    expect(result.lots).toHaveLength(1);
  });
});

describe('parseMsActivityCells — no sections', () => {
  it('throws an explicit error when nothing recognisable is present', () => {
    const cells: string[][] = [
      row('Some Random Title'),
      row('foo', 'bar', 'baz'),
    ];
    expect(() => parseMsActivityCells(cells)).toThrow(/aucune section attendue/);
  });

  it('throws the FR/EUR error (not the bad-file error) when section titles are localised but the export is otherwise valid', () => {
    // French export: section titles aren't recognised so findSections() returns [],
    // but the workbook clearly contains EUR amounts. We must surface the
    // actionable "switch to English/USD" message instead of "fichier non reconnu".
    const cells: string[][] = [
      row('Ventes d\u2019actions'),
      row('Date', 'Nom du plan', 'Statut', 'Prix de vente', 'Quantit\u00e9', 'Date d\u2019acquisition', 'Valeur d\u2019acquisition'),
      row('21-janv.-2025', 'Microsoft Stock Awards', 'Complet', '\u20ac365.99', '5', '17-avr.-2023', '\u20ac1,217.72'),
    ];
    expect(() => parseMsActivityCells(cells)).toThrow(/anglais.*USD/);
  });
});

describe('parseMsActivityCells — blank-row separation', () => {
  it('does not bleed Share Sales rows into Holdings when the blank separator is missing', () => {
    // Two sections back-to-back without an explicit blank: the parser
    // should still detect the second section by its title.
    const cells: string[][] = [
      row('Share Sales'),
      row('Date', 'Plan Name', 'Fund Name', 'Type', 'Order Status', 'Sale Price', 'Quantity', 'Net Cash Proceeds', 'Acquisition Date', 'Acquisition Value'),
      row('46013', 'Microsoft Stock Awards', 'MSFT', 'Ad Hoc', 'Complete', '488', '5', '2440', '44804', '1314.85'),
      row('Holdings by Lot'),
      row('Acquisition Date', 'Savings Plan Name', 'Lot Number', 'Current Share Quantity', 'Current Value'),
      row('41152', 'Microsoft Stock Awards', '119', '495', '15008.4'),
    ];
    const result = parseMsActivityCells(cells);
    expect(result.soldLots).toHaveLength(1);
    expect(result.lots).toHaveLength(1);
  });
});
