// Check a numbers spreadsheet against a household (S-237): which rows land where, what needs a look and why, what
// would change, and what the household holds that the sheet does not cover yet. Read-only; prints words.
//
//   node tools/import-check.mjs fixtures/eli-numbers.local.xlsx [fixtures/eli.local.json]
//
// With no household file, it checks against an empty one (every answered row should land as New).
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadHousehold } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';
import { makeRules } from '../engine/rules.js';
import { isFact, valueOf } from '../engine/spine.js';
import { readSheets, planImport, changeWords, targetWords, parseCsv } from '../js/sheet-import.js';
import { readXlsx } from '../test/sheet-read.js';

const SLAM = fileURLToPath(new URL('..', import.meta.url));
const json = (p) => JSON.parse(readFileSync(p, 'utf8'));
export const emptyHousehold = (asOf) => ({ _meta: { version: 3, asOf, name: 'Empty' }, household: { people: [{ name: 'You' }] } });

// The facts on items the sheet writes; anything else with a value is "not covered yet".
const SHEET_FACTS = {
  income: ['amount', 'withholding'], expenses: ['amount', 'need'], debts: ['balance', 'minimum', 'apr', 'limit', 'promoApr', 'promoEnds', 'payoffDate', 'institution', 'name'],
  accounts: ['balance', 'apy', 'rate', 'expectedReturn', 'appreciationRate', 'monthlyContribution', 'contributions', 'name'], goals: ['target', 'fiNumber', 'annualSpending']
};

export function importCheck(sheets, raw, { today }) {
  const rules = makeRules(json(SLAM + 'data/rules-2026.json'));
  const map = json(SLAM + 'data/import-map.json');
  const spine = applyDefaults(loadHousehold(raw), rules);
  const read = readSheets(sheets, map);
  const plan = planImport(spine, read.rows, map, { today });
  const notCovered = [];
  for (const [c, keep] of Object.entries(SHEET_FACTS)) for (const it of spine[c] || []) for (const [k, v] of Object.entries(it)) {
    if (keep.includes(k) || !isFact(v) || valueOf(v) === null || v.kind === 'computed') continue;
    notCovered.push(c + '.' + it.id + '.' + k);
  }
  return { read, plan, spine, notCovered, notInFile: plan.notInFile };
}

export function words(r) {
  const out = [];
  const by = (g) => r.plan.rows.filter((x) => x.group === g);
  out.push('Read ' + r.read.rows.length + ' rows from the "' + r.read.sheet + '" tab.' + (r.read.problems.length ? ' Problems: ' + r.read.problems.join('; ') : ''));
  for (const [g, title] of [['review', 'Needs a look'], ['change', 'Will change (the sheet differs)'], ['new', 'New'], ['same', 'Same, or blank']]) {
    const list = by(g);
    out.push('', title + ' (' + list.length + ')');
    if (g === 'same') continue;
    for (const x of list) out.push('  row ' + x.n + ' ' + JSON.stringify(x.question) + ' -> ' + targetWords(x.target) + ': ' + (x.why ? x.why + '. ' : '') + "read '" + x.answer + "' as " + x.reading + (x.changes.length && g === 'change' ? ' [' + x.changes.map(changeWords).join('; ') + ']' : '') + (x.parse.notes.length ? ' (assumed: ' + x.parse.notes.join('; ') + ')' : ''));
  }
  out.push('', 'In the household, not in the sheet (' + r.notInFile.length + ')');
  for (const x of r.notInFile) out.push('  ' + x.label);
  out.push('', 'Details the sheet does not cover yet (' + r.notCovered.length + ')');
  for (const x of r.notCovered) out.push('  ' + x);
  return out.join('\n');
}

export const sheetsOf = (path) => (/\.csv$/i.test(path) ? [{ name: 'csv', rows: parseCsv(readFileSync(path, 'utf8')) }] : readXlsx(readFileSync(path)));

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [file, prof] = process.argv.slice(2);
  if (!file || !existsSync(file)) { console.log('Usage: node tools/import-check.mjs <sheet.xlsx|.csv> [household.json]'); process.exit(1); }
  const today = new Date().toISOString().slice(0, 10);
  console.log(words(importCheck(sheetsOf(file), prof ? json(prof) : emptyHousehold(today), { today })));
}
