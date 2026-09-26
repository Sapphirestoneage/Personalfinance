#!/usr/bin/env node
/* ==========================================================================
   leads/tools/vendor.js, the copies the Leads Ladder carries. LD-001.
   --------------------------------------------------------------------------
   The ladder draws its pictures with Coach Mode's chart module and formats
   money with SPARKS' money module: one formula, one function, carried as a
   byte-identical copy rather than rewritten. The theme and the fonts come
   across the same way, so the app looks like the rest of the house.

     node leads/tools/vendor.js           copy them in
     node leads/tools/vendor.js --check   exit 1 if any copy has drifted
   leads/test/run.js runs the check.
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const HERE = path.join(ROOT, 'leads');

/* [source relative to the repo root, destination relative to leads/] */
const FILES = [
  ['shared/money.js', 'shared/money.js'],
  ['coach/shared/charts.js', 'shared/charts.js'],
  ['shared/theme.css', 'shared/theme.css'],
  ['shared/fonts.css', 'shared/fonts.css'],
  ['vendor/fonts/fraunces-latin-wght-normal.woff2', 'vendor/fonts/fraunces-latin-wght-normal.woff2'],
  ['vendor/fonts/space-grotesk-latin-wght-normal.woff2', 'vendor/fonts/space-grotesk-latin-wght-normal.woff2'],
  ['vendor/fonts/OFL.txt', 'vendor/fonts/OFL.txt'],
  ['favicon.svg', 'favicon.svg']
];

const check = process.argv.indexOf('--check') !== -1;
const drift = [];
FILES.forEach(function (pair) {
  const from = path.join(ROOT, pair[0]), to = path.join(HERE, pair[1]);
  if (!fs.existsSync(from)) { drift.push(pair[0] + ' (gone from its source)'); return; }
  const a = fs.readFileSync(from);
  const same = fs.existsSync(to) && Buffer.compare(a, fs.readFileSync(to)) === 0;
  if (check) { if (!same) drift.push(pair[1]); return; }
  if (!same) { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.writeFileSync(to, a); console.log('copied    leads/' + pair[1]); }
});
if (check) {
  if (drift.length) { console.log('drifted from source: ' + drift.join(', ') + '\nrun: node leads/tools/vendor.js'); process.exit(1); }
  console.log('every vendored copy matches its source (' + FILES.length + ' files)');
}
module.exports = { FILES: FILES };
