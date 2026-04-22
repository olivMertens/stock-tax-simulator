// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { parseSharedStrings, parseWorksheet } from '../xlsx-reader';

describe('parseSharedStrings', () => {
  it('reads simple <t> entries', () => {
    const xml = `<?xml version="1.0"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="3" uniqueCount="3">
  <si><t>Alpha</t></si>
  <si><t>Beta</t></si>
  <si><t xml:space="preserve">Gamma </t></si>
</sst>`;
    expect(parseSharedStrings(xml)).toEqual(['Alpha', 'Beta', 'Gamma ']);
  });

  it('concatenates rich text runs', () => {
    const xml = `<?xml version="1.0"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <si><r><t>Hello </t></r><r><t>world</t></r></si>
</sst>`;
    expect(parseSharedStrings(xml)).toEqual(['Hello world']);
  });
});

describe('parseWorksheet', () => {
  const shared = ['Header1', 'Header2', 'Value A'];

  it('resolves shared-string cells (t="s") against the shared strings table', () => {
    const xml = `<?xml version="1.0"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>
    <row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>42.5</v></c></row>
  </sheetData>
</worksheet>`;
    const rows = parseWorksheet(xml, shared);
    expect(rows).toHaveLength(2);
    expect(rows[0].cells).toEqual({ A: 'Header1', B: 'Header2' });
    expect(rows[1].cells).toEqual({ A: 'Value A', B: '42.5' });
  });

  it('supports inline strings (t="inlineStr")', () => {
    const xml = `<?xml version="1.0"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1"><c r="A1" t="inlineStr"><is><t>Inline</t></is></c></row>
  </sheetData>
</worksheet>`;
    const rows = parseWorksheet(xml, []);
    expect(rows[0].cells.A).toBe('Inline');
  });

  it('skips empty rows', () => {
    const xml = `<?xml version="1.0"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1"><c r="A1"><v>1</v></c></row>
    <row r="2"></row>
    <row r="3"><c r="A3"><v>2</v></c></row>
  </sheetData>
</worksheet>`;
    const rows = parseWorksheet(xml, []);
    expect(rows.map((r) => r.rowIndex)).toEqual([1, 3]);
  });

  it('throws a clear error on invalid XML', () => {
    expect(() => parseWorksheet('<not xml', [])).toThrow(/XLSX invalide/);
  });
});
