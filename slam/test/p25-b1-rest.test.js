// Phase 2.5, Batch 1, the Builder pages and the One-pager on the shell, and DATING in the docs. All formulas is
// screen by screen (one number per screen, its rules on the Rules page, old links still land); the One-pager's cards
// with more behind them are whole-card targets; the Design kit's samples are never dead clicks; the docs say DATING
// and My numbers. Read from the sources (the pages need a browser); every household here is made up.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SLAM, readJson, loadRules } from './spine-helpers.js';
import { loadHousehold } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';
import { summarize } from '../engine/summary.js';
import { METRICS, explainMetric } from '../engine/math.js';

const R = loadRules();
const read = (f) => readFileSync(SLAM + f, 'utf8');
const JARGON = /\b(engine|registry|rules|spine|kind|path|field|stored|simulation|template|schema|computed|derived)\b|S-\d{3}|Ledger/i;
const strings = (src) => [...src.replace(/^\s*\/\/.*$/gm, '').matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]).filter((x) => /\s/.test(x) && /^[A-Z ]/.test(x));

test('All formulas: a list with a chevron per number, each on its own screen, rules on the Rules page', () => {
  const src = read('ui/math-page.js');
  assert.match(src, /startPage\(\{\n {4}tab: null, title: 'All formulas', parent: \['Builder', 'builder\.html'\],/);
  assert.match(src, /h\('a', \{ class: 'go-row plain', href: '#\/' \+ encodeURIComponent\(level\) \}/, 'each number is a row that opens its own screen');
  assert.match(src, /name: \(levels, \{ spine, rules \}\) => \(levels\.length === 1 && metricAt/, 'one level deep; any other level is gone');
  assert.doesNotMatch(src, /h\('details'|rule-list|#rule-' \+|#metric-' \+/, 'nothing opens in place, no rules list of its own, no in-page anchors');
  assert.match(src, /const ruleHref = \(id\) => 'rules\.html#\/' \+ encodeURIComponent\(id\)/);
  // Old links land: #metric-x opens the number, #rule-x and #rules open the Rules page.
  assert.match(src, /\/\^#\(metric\|rule\)-\(\.\+\)\$\|\^#rules\$\//);
  assert.match(src, /location\.replace\('rules\.html'/);
  assert.match(src, /history\.replaceState\(history\.state, '', '#\/' \+ old\[2\]\)/);
  // An input with nowhere to go is plain text, never a link to nothing.
  assert.match(src, /t\.metric && levelOf\.has\(t\.metric\)/);
  assert.doesNotMatch(src, /Built from the engines/, 'THE COPY RULE: the line about how the page is built is gone');
});

test('every number on All formulas explains itself on the demo household', () => {
  const s0 = applyDefaults(loadHousehold(readJson('fixtures/demo.json')), R);
  const ctx = { spine: s0, rules: R, s: summarize(s0, R) };
  for (const id of [...METRICS.map((m) => m.id), 'earned:' + s0.meta.asOf.slice(0, 4)]) {
    const e = explainMetric(id, ctx);
    assert.ok(e && e.label && e.formula && Array.isArray(e.terms), id);
  }
});

test('the One-pager: under Today, the cards with more behind them are whole-card targets, My numbers in words', () => {
  const src = read('ui/onepager.js');
  assert.match(src, /const goCard = \(title, href, \.\.\.body\) => h\('section', \{ class: 'card has-target' \},/);
  assert.match(src, /h\('a', \{ class: 'card-link', href \}, h\('span', \{\}, title\), h\('span', \{ class: 'chev', 'aria-hidden': 'true' \}, '\\u203A'\)\)/);
  for (const [title, href] of [['Debt', "numbersHref\\('debt'\\)"], ['The next rung', "'plan\\.html'"], ['Spending a month', "numbersHref\\('needs'\\)"]]) assert.match(src, new RegExp("goCard\\('" + title + "', " + href), title);
  for (const w of strings(src)) assert.doesNotMatch(w, JARGON, 'onepager: ' + w);
  assert.match(read('ui/spine.css'), /\.onepager \.op-cell \.op-k, \.onepager \.op-cell \.tile-note \{ display: block; \}/, 'a cell label never runs into its note');
});

test('the Design kit: My numbers in words, and a tapped sample says it is a sample', () => {
  const kit = read('affordances.html');
  assert.doesNotMatch(kit, /Ledger|DAITE/);
  assert.match(kit, /import \{ startPage, say \} from '\.\/ui\/shell\.js';/);
  assert.match(kit, /const t = e\.target\.closest\('button, a\[href\^="#"\]'\);/);
  assert.match(kit, /say\('A sample, so it does nothing here\./);
});

test('the docs say DATING and My numbers, and the tab list is the new one', () => {
  // BOARD.md is a record of what was done; only its DAITE line is renamed.
  assert.doesNotMatch(read('BOARD.md'), /DAITE/);
  for (const f of ['README.md', 'CONTRACTS.md', 'DESIGN.md', 'docs/SIMPLE_PATTERNS.md', 'docs/PHASE2_REPORT.md', 'docs/CALENDAR_PARITY.md']) {
    const doc = read(f);
    assert.doesNotMatch(doc, /DAITE|Goals and assumptions/, f);
    assert.doesNotMatch(doc, /\bthe Ledger\b(?!\) holds)|Ledger link|\bthe Dashboard\b/, f + ' names the old pages');
  }
  assert.match(read('README.md'), /D Debt, A Assets, T Taxes, I Income, N Needs \(all\n {2}spending\) and G Goals/);
  assert.match(read('README.md'), /six tabs on every page \(Today, Session, My numbers,\nCalendar, Spending, Plan;/);
  assert.match(read('CONTRACTS.md'), /its DATING section \(D Debt, A Assets, T Taxes, I Income, N Needs, G Goals/);
});
