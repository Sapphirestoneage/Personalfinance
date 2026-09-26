#!/usr/bin/env node
/* ==========================================================================
   kehillah/tools/vendor.js, the copies Kehillah carries of SPARKS. KD-001.
   --------------------------------------------------------------------------
   Kehillah is a separate app (D-340) and loads nothing from outside its own
   folder. The few SPARKS files it shares, the theme, the fonts and the money
   module (integer cents, ok/incomplete results, the formatter), are carried
   as byte-identical copies rather than rewritten. Nothing that reaches the
   rooms, the spine or ownership is carried.

     node kehillah/tools/vendor.js           copy them in from SPARKS
     node kehillah/tools/vendor.js --check   exit 1 if any copy has drifted
   kehillah/test/run.js runs the check.
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'kehillah');

const FILES = [
  'shared/money.js', 'shared/theme.css', 'shared/fonts.css',
  'vendor/fonts/fraunces-latin-wght-normal.woff2', 'vendor/fonts/space-grotesk-latin-wght-normal.woff2', 'vendor/fonts/OFL.txt'
];

const check = process.argv.indexOf('--check') !== -1;
const drift = [];
FILES.forEach(function (f) {
  const from = path.join(ROOT, f), to = path.join(APP, f);
  if (!fs.existsSync(from)) { drift.push(f + ' (gone from SPARKS)'); return; }
  const a = fs.readFileSync(from);
  const same = fs.existsSync(to) && Buffer.compare(a, fs.readFileSync(to)) === 0;
  if (check) { if (!same) drift.push(f); return; }
  if (!same) { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.writeFileSync(to, a); console.log('copied    kehillah/' + f); }
});
if (check) {
  if (drift.length) { console.log('drifted from SPARKS: ' + drift.join(', ') + '\nrun: node kehillah/tools/vendor.js'); process.exit(1); }
  console.log('every vendored copy matches SPARKS (' + FILES.length + ' files)');
}
module.exports = { FILES: FILES };
