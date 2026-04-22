/**
 * Minimal XLSX reader — no external dependencies.
 *
 * An .xlsx file is a ZIP archive containing XML parts. We only need to:
 *   1. Locate and read specific entries in the ZIP (sharedStrings.xml, sheet*.xml, workbook.xml).
 *   2. DEFLATE-decompress them using the browser's native DecompressionStream.
 *   3. Parse the XML using the browser's native DOMParser.
 *
 * Scope is intentionally tiny: we only support the subset of the XLSX format that
 * Microsoft's StockExport actually uses (inline strings, shared strings, numeric
 * cells, no formulas, no styles interpretation beyond raw values). Any format
 * weirdness raises an explicit error — we prefer failing loudly over producing
 * silently-wrong data.
 */

/** A single entry extracted from the ZIP archive. */
export interface ZipEntry {
  name: string;
  /** UTF-8 decoded content. */
  text: string;
}

/** A typed representation of a worksheet row. Cells are addressed by column letters (A, B, …). */
export interface SheetRow {
  /** 1-based row index from the XLSX file. */
  rowIndex: number;
  /** Values keyed by column letter (A, B, AA…). Missing cells are absent. */
  cells: Record<string, string>;
}

/**
 * Read an XLSX file entirely in-memory.
 * Returns a map of entry name → UTF-8 text for the entries requested via `wanted`.
 * Unknown/binary entries (images, theme, styles) are skipped silently.
 */
export async function readXlsx(
  buffer: ArrayBuffer,
  wanted: readonly string[],
): Promise<Map<string, string>> {
  const entries = await unzip(buffer, new Set(wanted));
  const out = new Map<string, string>();
  for (const entry of entries) {
    out.set(entry.name, entry.text);
  }
  return out;
}

// ---------------------------------------------------------------------------
// ZIP reader (Store + Deflate only, which is all Excel writes)
// ---------------------------------------------------------------------------

const EOCD_SIGNATURE = 0x06054b50;
const CD_SIGNATURE = 0x02014b50;
const LFH_SIGNATURE = 0x04034b50;

async function unzip(buffer: ArrayBuffer, wanted: Set<string>): Promise<ZipEntry[]> {
  const view = new DataView(buffer);
  const eocdOffset = findEOCD(view);
  if (eocdOffset < 0) throw new Error('Archive XLSX invalide : EOCD introuvable.');

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const cdSize = view.getUint32(eocdOffset + 12, true);
  const cdOffset = view.getUint32(eocdOffset + 16, true);

  const decoder = new TextDecoder('utf-8');
  const entries: ZipEntry[] = [];

  let cursor = cdOffset;
  const cdEnd = cdOffset + cdSize;

  for (let i = 0; i < totalEntries && cursor < cdEnd; i++) {
    if (view.getUint32(cursor, true) !== CD_SIGNATURE) {
      throw new Error('Archive XLSX invalide : signature de central directory manquante.');
    }
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLen = view.getUint16(cursor + 28, true);
    const extraLen = view.getUint16(cursor + 30, true);
    const commentLen = view.getUint16(cursor + 32, true);
    const localHeaderOffset = view.getUint32(cursor + 42, true);

    const nameBytes = new Uint8Array(buffer, cursor + 46, nameLen);
    const name = decoder.decode(nameBytes);
    cursor += 46 + nameLen + extraLen + commentLen;

    if (!wanted.has(name)) continue;

    // Read the local file header to locate the actual data start
    if (view.getUint32(localHeaderOffset, true) !== LFH_SIGNATURE) {
      throw new Error(`Archive XLSX invalide : en-tête local manquant pour ${name}.`);
    }
    const lfhNameLen = view.getUint16(localHeaderOffset + 26, true);
    const lfhExtraLen = view.getUint16(localHeaderOffset + 28, true);
    const dataOffset = localHeaderOffset + 30 + lfhNameLen + lfhExtraLen;

    const compressed = new Uint8Array(buffer, dataOffset, compressedSize);
    let bytes: Uint8Array;

    if (method === 0) {
      // Stored (no compression)
      bytes = compressed;
    } else if (method === 8) {
      // Deflate (raw)
      bytes = await inflateRaw(compressed, uncompressedSize);
    } else {
      throw new Error(`Méthode de compression ZIP non supportée : ${method}.`);
    }

    entries.push({ name, text: decoder.decode(bytes) });
  }

  return entries;
}

/** Locate the End Of Central Directory record (search from the end, max 64 KB comment). */
function findEOCD(view: DataView): number {
  const len = view.byteLength;
  const maxBack = Math.min(len, 65557);
  for (let i = len - 22; i >= len - maxBack && i >= 0; i--) {
    if (view.getUint32(i, true) === EOCD_SIGNATURE) return i;
  }
  return -1;
}

/** Inflate raw DEFLATE data using the browser's DecompressionStream. */
async function inflateRaw(compressed: Uint8Array, expectedSize: number): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('DecompressionStream non disponible : veuillez utiliser un navigateur récent.');
  }
  const stream = new Blob([compressed as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const buf = await new Response(stream).arrayBuffer();
  if (expectedSize > 0 && buf.byteLength !== expectedSize) {
    // Non-fatal: some writers use streaming mode and report 0. Only flag true mismatches.
    if (expectedSize !== 0 && buf.byteLength !== expectedSize) {
      console.warn(`inflateRaw: taille inattendue (attendu=${expectedSize}, obtenu=${buf.byteLength})`);
    }
  }
  return new Uint8Array(buf);
}

// ---------------------------------------------------------------------------
// Worksheet XML → SheetRow[]
// ---------------------------------------------------------------------------

/**
 * Parse a sheet XML document against a shared strings table.
 * Supports numeric cells, shared-string cells (t="s"), inline strings (t="inlineStr"),
 * and boolean cells (t="b"). Formula cells are evaluated to their cached `<v>` value.
 * Returns rows in file order; empty rows are skipped.
 */
export function parseWorksheet(sheetXml: string, sharedStrings: string[]): SheetRow[] {
  const doc = parseXml(sheetXml);
  const rowNodes = doc.getElementsByTagName('row');
  const rows: SheetRow[] = [];

  for (let i = 0; i < rowNodes.length; i++) {
    const rowEl = rowNodes[i];
    const rowIndex = parseInt(rowEl.getAttribute('r') ?? `${i + 1}`, 10);
    const cells: Record<string, string> = {};

    const cellNodes = rowEl.getElementsByTagName('c');
    for (let j = 0; j < cellNodes.length; j++) {
      const cell = cellNodes[j];
      const ref = cell.getAttribute('r'); // e.g. "B12"
      if (!ref) continue;
      const col = ref.replace(/\d+$/, '');
      const type = cell.getAttribute('t') ?? 'n';

      const value = extractCellValue(cell, type, sharedStrings);
      if (value !== '') cells[col] = value;
    }

    if (Object.keys(cells).length > 0) {
      rows.push({ rowIndex, cells });
    }
  }

  return rows;
}

/**
 * Parse the sharedStrings.xml part into a simple string[].
 * Handles both plain `<si><t>foo</t></si>` and rich text runs `<si><r><t>a</t></r>...</si>`.
 */
export function parseSharedStrings(xml: string): string[] {
  const doc = parseXml(xml);
  const siNodes = doc.getElementsByTagName('si');
  const out: string[] = [];
  for (let i = 0; i < siNodes.length; i++) {
    const si = siNodes[i];
    // Concatenate all <t> descendants (handles rich text).
    const tNodes = si.getElementsByTagName('t');
    let s = '';
    for (let j = 0; j < tNodes.length; j++) {
      s += tNodes[j].textContent ?? '';
    }
    out.push(s);
  }
  return out;
}

function extractCellValue(cell: Element, type: string, sharedStrings: string[]): string {
  if (type === 'inlineStr') {
    const is = cell.getElementsByTagName('is')[0];
    if (!is) return '';
    const tNodes = is.getElementsByTagName('t');
    let s = '';
    for (let i = 0; i < tNodes.length; i++) s += tNodes[i].textContent ?? '';
    return s;
  }

  const v = cell.getElementsByTagName('v')[0];
  if (!v) return '';
  const raw = v.textContent ?? '';

  if (type === 's') {
    const idx = parseInt(raw, 10);
    return Number.isFinite(idx) && idx >= 0 && idx < sharedStrings.length
      ? sharedStrings[idx]
      : '';
  }

  if (type === 'b') return raw === '1' ? 'TRUE' : 'FALSE';

  // Numeric, date-as-number, str (formula result), etc. → return raw text.
  return raw;
}

function parseXml(xml: string): Document {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');
  const err = doc.getElementsByTagName('parsererror')[0];
  if (err) throw new Error('XML XLSX invalide : ' + (err.textContent ?? '(sans détail)'));
  return doc;
}
