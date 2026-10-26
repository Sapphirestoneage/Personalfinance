// Reading an .xlsx in Node for the numbers spreadsheet tests (S-237): the cells as text, sheet by sheet, the way the
// page reads them with SheetJS. Handles stored and deflated parts, shared and inline strings. Test helper only.
import { inflateRawSync } from 'node:zlib';

function unzip(buf) {
  const b = Buffer.from(buf);
  let e = b.length - 22;
  while (e >= 0 && b.readUInt32LE(e) !== 0x06054b50) e--;
  const n = b.readUInt16LE(e + 10), at = b.readUInt32LE(e + 16);
  const files = {};
  let p = at;
  for (let i = 0; i < n; i++) {
    const method = b.readUInt16LE(p + 10), size = b.readUInt32LE(p + 20), nameLen = b.readUInt16LE(p + 28), extra = b.readUInt16LE(p + 30), comment = b.readUInt16LE(p + 32), off = b.readUInt32LE(p + 42);
    const name = b.toString('utf8', p + 46, p + 46 + nameLen);
    const lh = off + 30 + b.readUInt16LE(off + 26) + b.readUInt16LE(off + 28);
    const raw = b.subarray(lh, lh + size);
    files[name] = method === 0 ? raw : inflateRawSync(raw);
    p += 46 + nameLen + extra + comment;
  }
  return files;
}
const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d)).replace(/&amp;/g, '&');
const texts = (xml) => [...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>|<t[^>]*\/>/g)].map((m) => unesc(m[1] || '')).join('');
const colIndex = (ref) => { let n = 0; for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };

export function readXlsx(buf) {
  const f = unzip(buf);
  const txt = (k) => (f[k] ? f[k].toString('utf8') : '');
  const shared = [...txt('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => texts(m[1]));
  const rels = Object.fromEntries([...txt('xl/_rels/workbook.xml.rels').matchAll(/<Relationship [^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], m[2]]));
  const out = [];
  for (const m of txt('xl/workbook.xml').matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)) {
    const target = rels[m[2]].replace(/^\/?(xl\/)?/, 'xl/');
    const xml = txt(target);
    const rows = [];
    for (const r of xml.matchAll(/<row [^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
      const row = [];
      for (const c of r[2].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = /r="([A-Z]+\d+)"/.exec(c[1])[1], t = (/t="(\w+)"/.exec(c[1]) || [])[1];
        const body = c[2] || '';
        const v = (/<v>([\s\S]*?)<\/v>/.exec(body) || [])[1];
        row[colIndex(ref)] = t === 's' ? shared[+v] : t === 'inlineStr' ? texts(body) : v === undefined ? '' : unesc(v);
      }
      rows[+r[1] - 1] = Array.from(row, (x) => x ?? '');
    }
    out.push({ name: unesc(m[1]), rows: Array.from(rows, (x) => x || []), xml });
  }
  return out;
}
