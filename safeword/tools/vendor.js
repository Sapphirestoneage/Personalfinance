#!/usr/bin/env node
/* ==========================================================================
   safeword/tools/vendor.js, the copies Safeword carries of SPARKS. SF-001.
   --------------------------------------------------------------------------
   Safeword reads a few SPARKS engines and tables so its tax and growth
   numbers are the same numbers the rooms show: one formula, one function,
   carried as a byte-identical copy rather than rewritten. Only these files,
   and nothing that reaches the rooms, the spine or ownership.

     node safeword/tools/vendor.js           copy them in from SPARKS
     node safeword/tools/vendor.js --check   exit 1 if any copy has drifted
   safeword/test/run.js runs the check; a SPARKS change to one of these
   files shows up there, and one run of this tool brings the copy across.
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'safeword');

const FILES = [
  'shared/money.js', 'shared/schema.js', 'shared/reference.js',
  'engines/selfemployed.js', 'engines/tax.js', 'engines/projection.js',
  'data/se_tax_2026.json', 'data/federal_brackets_2026.json', 'data/state_brackets_2026.json',
  'data/irs_limits_2026.json', 'data/effective_tax_rates_2026.json',
  'shared/theme.css', 'shared/fonts.css',
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
  if (!same) { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.writeFileSync(to, a); console.log('copied    safeword/' + f); }
});
if (check) {
  if (drift.length) { console.log('drifted from SPARKS: ' + drift.join(', ') + '\nrun: node safeword/tools/vendor.js'); process.exit(1); }
  console.log('every vendored copy matches SPARKS (' + FILES.length + ' files)');
}
module.exports = { FILES: FILES };
