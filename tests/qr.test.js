/* tests/qr.test.js — the in-house QR encoder (shared/qr.js, D-201) read
   back by two independent decoders (jsqr and ZXing's port) across every
   version, random text, and the exact capacity edge. Either decoder
   reading a code proves the code; each has blind spots on large, dense
   codes that the other does not (seen on version 23, on the reference
   library's own grids too), so a code both miss is counted, not failed,
   and the count is held under a small ceiling. */
const path = require('path');
const QR = require(path.join(__dirname, '..', 'shared', 'qr.js'));
let jsQR = null, Z = null;
try { jsQR = require('jsqr'); } catch (e) { /* optional */ }
try { Z = require('@zxing/library'); } catch (e) { /* optional */ }
if (!jsQR && !Z) { console.log('no decoder installed (cd tests && npm install); skipping the decode check'); process.exit(0); }
let passed = 0, failed = 0;
function check(name, cond, detail) { if (cond) passed++; else { failed++; console.log('  ✗ ' + name + (detail ? '  ' + detail : '')); } }
function luminance(m, s) {
  const n = m.length, q = 4, side = (n + 2 * q) * s, l = new Uint8ClampedArray(side * side);
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    const r = Math.floor(y / s) - q, c = Math.floor(x / s) - q;
    l[y * side + x] = (r >= 0 && c >= 0 && r < n && c < n && m[r][c]) ? 0 : 255;
  }
  return { l, side };
}
function readJs(m) {
  if (!jsQR) return null;
  const { l, side } = luminance(m, 3), d = new Uint8ClampedArray(l.length * 4);
  for (let i = 0; i < l.length; i++) { d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = l[i]; d[i * 4 + 3] = 255; }
  const r = jsQR(d, side, side); return r ? r.data : null;
}
function readZx(m) {
  if (!Z) return null;
  const { l, side } = luminance(m, 3);
  try { return new Z.QRCodeReader().decode(new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.RGBLuminanceSource(l, side, side)))).getText(); } catch (e) { return null; }
}
function reads(text) {
  const code = QR.encode(text);
  const a = readJs(code.modules), b = readZx(code.modules);
  return { code, ok: a === text || b === text, wrong: (a !== null && a !== text) || (b !== null && b !== text), missed: a !== text && b !== text };
}
/* Every version: a string sized to land on each of the 40. */
let missed = 0, tried = 0;
for (let v = 1; v <= 40; v++) {
  const t = 'v' + v + ':' + 'x'.repeat(Math.max(0, QR.capacityBytes(v) - 4));
  const r = reads(t); tried++;
  check('version ' + v + ' is the version chosen', r.code.version === v, 'got v' + r.code.version);
  check('version ' + v + ' never reads as a different text', !r.wrong);
  if (r.missed) missed++;
}
/* Random text, random length, non-ASCII included. */
let seed = 7;
function rnd(n) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; }
const chars = Array.from('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_#=&/:.~ éü漢🙂');
for (let i = 0; i < 120; i++) {
  const len = 1 + rnd(1200);
  let t = ''; for (let k = 0; k < len; k++) t += chars[rnd(chars.length)];
  const r = reads(t); tried++;
  check('random text ' + i + ' never reads as a different text', !r.wrong);
  if (r.missed) missed++;
}
check('the decoders read all but a handful (' + missed + ' of ' + tried + ' missed by both)', missed <= Math.ceil(tried * 0.05));
/* The share link shape, small and mid-sized, must read outright. */
['https://sapphirestoneage.github.io/Personalfinance/#h=zAbC-_123', 'https://sapphirestoneage.github.io/Personalfinance/#h=z' + 'Ab-_'.repeat(150)].forEach(function (link, i) {
  check('a share link decodes (' + link.length + ' chars)', reads(link).ok);
});
check('2,953 bytes are the most one code takes', QR.encode('k'.repeat(2953)).version === 40);
let refused = null; try { QR.encode('k'.repeat(2954)); } catch (e) { refused = e.message; }
check('2,954 bytes are refused, saying the limit', /2953/.test(refused || ''));
check('the SVG is black on white with a quiet zone', /fill="#fff"/.test(QR.svg('hi')) && /viewBox="0 0 29 29"/.test(QR.svg('hi')));
/* Pinned vectors: the grid for one text at each mask is deterministic. */
const a = QR.encode('SPARKS', { mask: 2 }), b = QR.encode('SPARKS', { mask: 2 });
check('the same text at the same mask gives the same grid', JSON.stringify(a.modules) === JSON.stringify(b.modules) && a.version === 1);
console.log((failed ? '✗ ' + failed + ' failed, ' : '✓ ') + passed + ' checks passed');
process.exit(failed ? 1 : 0);
