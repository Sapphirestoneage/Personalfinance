// A real .xlsx for the numbers spreadsheet (S-237), written here so it can carry what makes the sheet easy for a
// person: answer boxes with thick borders, a colored How sure? dropdown, a hidden id column and no gridlines. (SheetJS
// on cdnjs reads the file back; its free build does not write styles or dropdowns.) Pure: returns the file's bytes.
//
// writeXlsx([{ name, cols: [{ width, hidden }], rows: [[{ v, style } | text]], gridlines, freezeRows,
//   dropdowns: [{ ref, list }], colorIf: [{ ref, equals, color }] }]) -> Uint8Array

// The styles a cell may name. Order is the cellXfs index (0 is the plain default).
export const STYLES = ['plain', 'header', 'section', 'question', 'answer', 'sure', 'notes', 'title', 'text', 'subhead', 'swatchKnown', 'swatchRough', 'swatchMissing', 'swatchAnswer', 'id'];
// Fill colors (ARGB): the How sure? colors are the same in the dropdown and on the Key.
export const COLORS = { known: 'FFD9F2E3', rough: 'FFFFF1C2', missing: 'FFE8E8EE', section: 'FFE6EEF8', header: 'FF0F52BA' };

const esc = (s) => String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const colName = (n) => { let s = ''; n++; while (n) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

function stylesXml() {
  const fonts = [
    '<font><sz val="11"/><name val="Calibri"/></font>',
    '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>',
    '<font><b/><sz val="12"/><name val="Calibri"/></font>',
    '<font><b/><sz val="14"/><name val="Calibri"/></font>',
    '<font><sz val="11"/><color rgb="FF555555"/><name val="Calibri"/></font>'
  ];
  const fill = (rgb) => '<fill><patternFill patternType="solid"><fgColor rgb="' + rgb + '"/><bgColor indexed="64"/></patternFill></fill>';
  const fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>', fill(COLORS.header), fill(COLORS.section), fill(COLORS.known), fill(COLORS.rough), fill(COLORS.missing), fill('FFFFFFFF')];
  const side = (k, st) => '<' + k + ' style="' + st + '"><color rgb="FF1F2937"/></' + k + '>';
  const box = (st) => '<border>' + ['left', 'right', 'top', 'bottom'].map((k) => side(k, st)).join('') + '<diagonal/></border>';
  const borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>', box('thick'), box('thin')];
  // [font, fill, border, wrap, vertical top]
  const X = {
    plain: [0, 0, 0, false], header: [1, 2, 0, true], section: [2, 3, 0, false], question: [0, 0, 0, true], answer: [0, 7, 1, true],
    sure: [0, 7, 1, false], notes: [4, 0, 0, true], title: [3, 0, 0, false], text: [0, 0, 0, true], subhead: [2, 0, 0, false],
    swatchKnown: [0, 4, 2, false], swatchRough: [0, 5, 2, false], swatchMissing: [0, 6, 2, false], swatchAnswer: [0, 7, 1, false], id: [4, 0, 0, false]
  };
  const xfs = STYLES.map((k) => { const [fo, fi, bo, wrap] = X[k]; return '<xf numFmtId="0" fontId="' + fo + '" fillId="' + fi + '" borderId="' + bo + '" xfId="0"' + (fo ? ' applyFont="1"' : '') + (fi ? ' applyFill="1"' : '') + (bo ? ' applyBorder="1"' : '') + ' applyAlignment="1"><alignment vertical="top"' + (wrap ? ' wrapText="1"' : '') + '/></xf>'; });
  const dxf = (rgb) => '<dxf><fill><patternFill patternType="solid"><fgColor rgb="' + rgb + '"/><bgColor rgb="' + rgb + '"/></patternFill></fill></dxf>';
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<fonts count="' + fonts.length + '">' + fonts.join('') + '</fonts>'
    + '<fills count="' + fills.length + '">' + fills.join('') + '</fills>'
    + '<borders count="' + borders.length + '">' + borders.join('') + '</borders>'
    + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + '<cellXfs count="' + xfs.length + '">' + xfs.join('') + '</cellXfs>'
    + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
    + '<dxfs count="3">' + dxf(COLORS.known) + dxf(COLORS.rough) + dxf(COLORS.missing) + '</dxfs>'
    + '</styleSheet>';
}
const DXF = { known: 0, rough: 1, missing: 2 };

function sheetXml(sh) {
  const rows = sh.rows.map((r, i) => {
    const cells = r.map((c, j) => {
      const cell = c && typeof c === 'object' ? c : { v: c };
      const s = STYLES.indexOf(cell.style || 'plain');
      const ref = colName(j) + (i + 1);
      const v = cell.v === null || cell.v === undefined ? '' : String(cell.v);
      if (v === '') return s > 0 ? '<c r="' + ref + '" s="' + s + '"/>' : '';
      return '<c r="' + ref + '" t="inlineStr"' + (s > 0 ? ' s="' + s + '"' : '') + '><is><t xml:space="preserve">' + esc(v) + '</t></is></c>';
    }).join('');
    return '<row r="' + (i + 1) + '"' + (sh.heights && sh.heights[i] ? ' ht="' + sh.heights[i] + '" customHeight="1"' : '') + '>' + cells + '</row>';
  }).join('');
  const cols = (sh.cols || []).map((c, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + (c.width || 12) + '" customWidth="1"' + (c.hidden ? ' hidden="1"' : '') + '/>').join('');
  const pane = sh.freezeRows ? '<pane ySplit="' + sh.freezeRows + '" topLeftCell="A' + (sh.freezeRows + 1) + '" activePane="bottomLeft" state="frozen"/>' : '';
  const cf = (sh.colorIf || []).map((x, k) => '<conditionalFormatting sqref="' + x.ref + '"><cfRule type="cellIs" dxfId="' + DXF[x.color] + '" priority="' + (k + 1) + '" operator="equal"><formula>"' + esc(x.equals) + '"</formula></cfRule></conditionalFormatting>').join('');
  const dv = (sh.dropdowns || []).length ? '<dataValidations count="' + sh.dropdowns.length + '">' + sh.dropdowns.map((d) => '<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="0" sqref="' + d.ref + '"><formula1>"' + esc(d.list.join(',')) + '"</formula1></dataValidation>').join('') + '</dataValidations>' : '';
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + '<sheetViews><sheetView workbookViewId="0"' + (sh.gridlines === false ? ' showGridLines="0"' : '') + (sh.selected ? ' tabSelected="1"' : '') + '>' + pane + '</sheetView></sheetViews>'
    + '<sheetFormatPr defaultRowHeight="15"/>'
    + (cols ? '<cols>' + cols + '</cols>' : '')
    + '<sheetData>' + rows + '</sheetData>' + cf + dv
    + '<pageMargins left="0.5" right="0.5" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>';
}

export function writeXlsx(sheets) {
  const files = [];
  const add = (name, text) => files.push([name, new TextEncoder().encode(text)]);
  add('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
    + sheets.map((_, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') + '</Types>');
  add('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  add('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets>'
    + sheets.map((s, i) => '<sheet name="' + esc(s.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') + '</sheets></workbook>');
  add('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + sheets.map((_, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('')
    + '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
  add('xl/styles.xml', stylesXml());
  sheets.forEach((s, i) => add('xl/worksheets/sheet' + (i + 1) + '.xml', sheetXml({ ...s, selected: i === 0 })));
  return zip(files);
}

// ---------------------------------------------------------------- a stored (uncompressed) zip
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function zip(files) {
  const enc = new TextEncoder();
  const parts = [], central = [];
  let offset = 0;
  for (const [name, data] of files) {
    const nb = enc.encode(name), crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint16(10, 0, true); h.setUint16(12, 0x21, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true);
    h.setUint16(26, nb.length, true); h.setUint16(28, 0, true);
    parts.push(new Uint8Array(h.buffer), nb, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
    c.setUint16(12, 0, true); c.setUint16(14, 0x21, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
    c.setUint16(28, nb.length, true); c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), nb);
    offset += 30 + nb.length + data.length;
  }
  const size = central.reduce((n, x) => n + x.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, size, true); e.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(e.buffer)];
  const out = new Uint8Array(all.reduce((n, x) => n + x.length, 0));
  let at = 0;
  for (const x of all) { out.set(x, at); at += x.length; }
  return out;
}
