#!/usr/bin/env node
/* ==========================================================================
   coach/tools/vendor.js, the copies Coach Mode carries of SPARKS. CD-001.
   --------------------------------------------------------------------------
   The coach app reads a few SPARKS engines and tables so its numbers are
   the same numbers the rooms show: one formula, one function, carried as a
   byte-identical copy rather than rewritten. Only these files, and nothing
   that reaches the rooms, the spine or ownership (Ratios and Goals do, so
   the coach reads Tier0, CashFlow, Opening, Debt and Countdown instead).

     node coach/tools/vendor.js           copy them in from SPARKS
     node coach/tools/vendor.js --check   exit 1 if any copy has drifted
   coach/test/run.js runs the check; a SPARKS change to one of these files
   shows up there, and one run of this tool brings the copy across.
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const COACH = path.join(ROOT, 'coach');

const FILES = [
  'shared/money.js', 'shared/schema.js', 'shared/reference.js', 'shared/csv.js', 'shared/vault.js', 'shared/demo-persona.js',
  'engines/tier0.js', 'engines/foo.js', 'engines/projection.js', 'engines/cashflow.js',
  'engines/coast.js', 'engines/debt.js', 'engines/opening.js', 'engines/countdown.js',
  'data/effective_tax_rates_2026.json', 'data/expense_categories.json', 'data/opening.json', 'data/return_bands.json',
  'data/levers.json', 'data/debt_rules.json', 'data/retirement_milestones.json', 'data/milestones.json',
  'data/foo_rules.json', 'data/net_worth_percentiles_scf_2022.json', 'data/ratio_benchmarks.json',
  'shared/theme.css', 'shared/fonts.css', 'vendor/fonts/fraunces-latin-wght-normal.woff2', 'vendor/fonts/space-grotesk-latin-wght-normal.woff2', 'vendor/fonts/OFL.txt', 'favicon.svg'
];

const check = process.argv.indexOf('--check') !== -1;
const drift = [];
FILES.forEach(function (f) {
  const from = path.join(ROOT, f), to = path.join(COACH, f);
  if (!fs.existsSync(from)) { drift.push(f + ' (gone from SPARKS)'); return; }
  const a = fs.readFileSync(from);
  const same = fs.existsSync(to) && Buffer.compare(a, fs.readFileSync(to)) === 0;
  if (check) { if (!same) drift.push(f); return; }
  if (!same) { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.writeFileSync(to, a); console.log('copied    coach/' + f); }
});
if (check) {
  if (drift.length) { console.log('drifted from SPARKS: ' + drift.join(', ') + '\nrun: node coach/tools/vendor.js'); process.exit(1); }
  console.log('every vendored copy matches SPARKS (' + FILES.length + ' files)');
}
module.exports = { FILES: FILES };
