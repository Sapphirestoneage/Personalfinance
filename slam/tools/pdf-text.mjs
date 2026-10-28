// Text items out of a PDF, in Node (S-243): pdf.js when it is installed beside the app (npm install pdfjs-dist, a
// dev tool like Playwright, never part of the app), else a small reader that understands only the PDFs
// tools/pdf-write.mjs makes (uncompressed Helvetica text with a position per string). Real statements need pdf.js.
// Returns [[{ str, transform, width, height }]], one list per page, the shape pdf.js gives the browser.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let pdfjs = null, tried = false;
export async function loadPdfjs() {
  if (tried) return pdfjs;
  tried = true;
  for (const spec of ['pdfjs-dist/legacy/build/pdf.mjs', 'pdfjs-dist/build/pdf.mjs']) {
    try { const path = require.resolve(spec); pdfjs = await import(path); break; } catch { /* next */ }
  }
  return pdfjs;
}

// Helvetica widths for the fallback reader (close enough to split cells the way pdf.js would).
const W = { ' ': 278, '!': 278, '"': 355, '#': 556, $: 556, '%': 889, '&': 667, "'": 191, '(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278, ':': 278, ';': 278, '<': 584, '=': 584, '>': 584, '?': 556, '@': 1015, '[': 278, '\\': 278, ']': 278, '^': 469, _: 556, '`': 333, '{': 334, '|': 260, '}': 334, '~': 584 };
for (const c of '0123456789') W[c] = 556;
const UP = { A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500, K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611 };
const LO = { a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222, k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278, u: 556, v: 500, w: 722, x: 500, y: 500, z: 500 };
const widthOf = (s, size) => [...s].reduce((a, c) => a + (W[c] || UP[c] || LO[c] || 556), 0) * size / 1000;
const unesc = (s) => s.replace(/\\([\\()])/g, '$1');
export function fallbackItems(buf) {
  const text = buf.toString('latin1');
  const pages = [];
  const streams = text.split(/stream\r?\n/).slice(1).map((s) => s.split(/\r?\nendstream/)[0]);
  for (const st of streams) {
    const items = [];
    const re = /BT \/F1 ([\d.]+) Tf 1 0 0 1 ([\d.]+) ([\d.]+) Tm \(((?:[^()\\]|\\.)*)\) Tj ET/g;
    let m;
    while ((m = re.exec(st))) { const size = +m[1], str = unesc(m[4]); items.push({ str, transform: [size, 0, 0, size, +m[2], +m[3]], width: widthOf(str, size), height: size }); }
    if (items.length) pages.push(items);
  }
  return pages;
}

export async function pdfItems(file) {
  const buf = readFileSync(file);
  const lib = await loadPdfjs();
  if (!lib) return { pages: fallbackItems(buf), via: 'fallback' };
  const doc = await lib.getDocument({ data: new Uint8Array(buf), useSystemFonts: true, disableFontFace: true, isEvalSupported: false, verbosity: 0 }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    pages.push(tc.items.filter((it) => 'str' in it).map((it) => ({ str: it.str, transform: it.transform, width: it.width, height: it.height })));
  }
  await doc.destroy();
  return { pages, via: 'pdfjs' };
}
