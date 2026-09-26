#!/usr/bin/env node
/* binders/tools/vendor.js, the copies the Binders carry of SPARKS. PB-001.
   Only the look: the theme, the fonts, the icon. No engine, no data.
     node binders/tools/vendor.js           copy them in
     node binders/tools/vendor.js --check   exit 1 if any copy has drifted */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const HERE = path.join(ROOT, 'binders');
const FILES = ['shared/theme.css', 'shared/fonts.css', 'vendor/fonts/fraunces-latin-wght-normal.woff2', 'vendor/fonts/space-grotesk-latin-wght-normal.woff2', 'vendor/fonts/OFL.txt', 'favicon.svg'];
const check = process.argv.indexOf('--check') !== -1;
const drift = [];
FILES.forEach(function (f) {
  const from = path.join(ROOT, f), to = path.join(HERE, f);
  if (!fs.existsSync(from)) { drift.push(f + ' (gone from SPARKS)'); return; }
  const a = fs.readFileSync(from);
  const same = fs.existsSync(to) && Buffer.compare(a, fs.readFileSync(to)) === 0;
  if (check) { if (!same) drift.push(f); return; }
  if (!same) { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.writeFileSync(to, a); console.log('copied    binders/' + f); }
});
if (check) {
  if (drift.length) { console.log('drifted from SPARKS: ' + drift.join(', ') + '\nrun: node binders/tools/vendor.js'); process.exit(1); }
  console.log('every vendored copy matches SPARKS (' + FILES.length + ' files)');
}
module.exports = { FILES: FILES };
