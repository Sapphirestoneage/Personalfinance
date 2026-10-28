// A very small PDF writer for synthetic statements (S-243): Helvetica text at positions, one content stream a page,
// no compression. pdf.js reads it like any statement; tools/pdf-text.mjs can read it back without pdf.js.
// pages: [[{ x, y, size, text }]] with y measured from the top of a US Letter page.

const esc = (s) => String(s).replace(/[\\()]/g, (c) => '\\' + c).replace(/[^\x20-\x7e]/g, '?');
export function writePdf(pages) {
  const objs = [];
  const add = (body) => { objs.push(body); return objs.length; };
  const fontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const pagesId = objs.length + 1; objs.push(null);
  const kids = [];
  for (const items of pages) {
    const stream = items.map((it) => 'BT /F1 ' + (it.size || 9) + ' Tf 1 0 0 1 ' + it.x.toFixed(1) + ' ' + (792 - it.y).toFixed(1) + ' Tm (' + esc(it.text) + ') Tj ET').join('\n');
    const cId = add('<< /Length ' + Buffer.byteLength(stream, 'latin1') + ' >>\nstream\n' + stream + '\nendstream');
    kids.push(add('<< /Type /Page /Parent ' + pagesId + ' 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ' + fontId + ' 0 R >> >> /Contents ' + cId + ' 0 R >>'));
  }
  objs[pagesId - 1] = '<< /Type /Pages /Kids [' + kids.map((k) => k + ' 0 R').join(' ') + '] /Count ' + kids.length + ' >>';
  const catId = add('<< /Type /Catalog /Pages ' + pagesId + ' 0 R >>');
  let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
  const offsets = [];
  objs.forEach((body, i) => { offsets.push(Buffer.byteLength(out, 'latin1')); out += (i + 1) + ' 0 obj\n' + body + '\nendobj\n'; });
  const xref = Buffer.byteLength(out, 'latin1');
  out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('') + 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root ' + catId + ' 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  return Buffer.from(out, 'latin1');
}

// Rows to items: a row is a string (left margin), an array of [x, text] cells, or { gap: n } for space.
export function layout(rows, { left = 36, top = 50, lineHeight = 11, size = 8.5 } = {}) {
  const items = [];
  let y = top;
  for (const row of rows) {
    if (row && typeof row === 'object' && !Array.isArray(row)) { y += row.gap || lineHeight; continue; }
    const cells = typeof row === 'string' ? [[left, row]] : row;
    for (const [x, text, s] of cells) if (text) items.push({ x, y, size: s || size, text });
    y += lineHeight;
  }
  return items;
}
