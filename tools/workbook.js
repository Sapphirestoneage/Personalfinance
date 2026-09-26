#!/usr/bin/env node
/* ==========================================================================
   tools/workbook.js — write the blank workbook into sheet/. D-356.
   --------------------------------------------------------------------------
   The app hands you your own numbers as a spreadsheet from Your Data. This
   writes the EMPTY one, so there is a file to download and start typing into
   without opening the app at all: every question, the words that explain it,
   and every formula, with nothing filled in.

   It is committed because GitHub Pages serves files, not node, and because a
   spreadsheet is the one thing in this repository a person who does not code
   might want to download on its own.

   The bytes are pinned to the file's own asOf date, so building it twice
   gives the same file and a commit only shows up when something really moved.

     node tools/workbook.js            write it
     node tools/workbook.js --check    fail if the committed one is stale
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const Schema = require(path.join(ROOT, 'shared/schema.js'));
const LR = require(path.join(ROOT, 'shared/ledger-rows.js'));
const Workbook = require(path.join(ROOT, 'shared/workbook.js'));

const req = (n) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', n + '.json'), 'utf8'));
const plan = req('workbook');
const T = {
  ledgerRows: req('ledger-rows'), expenseCategories: req('expense_categories'), accessRules: req('access_rules'),
  irsLimits: req('irs_limits_2026'), effectiveTaxRates: req('effective_tax_rates_2026'), debtRules: req('debt_rules'),
  ratioBenchmarks: req('ratio_benchmarks'), confidenceWeights: req('confidence_weights'), staleness: req('staleness'),
  federalBrackets: req('federal_brackets_2026'), states: req('states'), bands: req('bands'), workbook: plan
};
LR.use(T.ledgerRows);

const OUT = path.join(ROOT, 'sheet', 'money-rooms-blank.xlsx');
const when = new Date(plan.asOf + 'T00:00:00Z');
const bytes = Buffer.from(Workbook.file(Schema.createHousehold({}), T, { now: when }));

if (process.argv.indexOf('--check') > -1) {
  const have = fs.existsSync(OUT) ? fs.readFileSync(OUT) : null;
  if (have && Buffer.compare(have, bytes) === 0) { console.log('sheet/ is current (' + bytes.length + ' bytes)'); process.exit(0); }
  console.error('sheet/money-rooms-blank.xlsx is stale. Run: node tools/workbook.js');
  process.exit(1);
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, bytes);
console.log('wrote sheet/money-rooms-blank.xlsx (' + bytes.length + ' bytes)');
