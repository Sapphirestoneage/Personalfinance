#!/usr/bin/env node
/* ==========================================================================
   marketing/tools/vendor.js, the copies the marketing app carries. MD-001.
   --------------------------------------------------------------------------
   The Scoreboard reads a few files from elsewhere in this repository so it
   looks and reads the same way: the CSV reader, the money formatter, the
   theme and fonts, and the coach's chart module (every picture, with its
   eight validated colour themes). Carried as byte-identical copies, never
   rewritten: one formula, one function.

     node marketing/tools/vendor.js           copy them in
     node marketing/tools/vendor.js --check   exit 1 if any copy has drifted
   marketing/test/run.js runs the check.
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'marketing');

/* [from, to] relative to the repository root and to marketing/. */
const FILES = [
  ['shared/csv.js', 'shared/csv.js'], ['shared/money.js', 'shared/money.js'],
  ['coach/shared/charts.js', 'shared/charts.js'],
  ['shared/theme.css', 'shared/theme.css'], ['shared/fonts.css', 'shared/fonts.css'],
  ['vendor/fonts/fraunces-latin-wght-normal.woff2', 'vendor/fonts/fraunces-latin-wght-normal.woff2'],
  ['vendor/fonts/space-grotesk-latin-wght-normal.woff2', 'vendor/fonts/space-grotesk-latin-wght-normal.woff2'],
  ['vendor/fonts/OFL.txt', 'vendor/fonts/OFL.txt'], ['favicon.svg', 'favicon.svg']
];

const check = process.argv.indexOf('--check') !== -1;
const drift = [];
FILES.forEach(function (pair) {
  const from = path.join(ROOT, pair[0]), to = path.join(APP, pair[1]);
  if (!fs.existsSync(from)) { drift.push(pair[0] + ' (gone)'); return; }
  const a = fs.readFileSync(from);
  const same = fs.existsSync(to) && Buffer.compare(a, fs.readFileSync(to)) === 0;
  if (check) { if (!same) drift.push(pair[1]); return; }
  if (!same) { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.writeFileSync(to, a); console.log('copied    marketing/' + pair[1]); }
});
if (check) {
  if (drift.length) { console.log('drifted: ' + drift.join(', ') + '\nrun: node marketing/tools/vendor.js'); process.exit(1); }
  console.log('every vendored copy matches (' + FILES.length + ' files)');
}
module.exports = { FILES: FILES };
