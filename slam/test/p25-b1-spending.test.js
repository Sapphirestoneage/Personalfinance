// Phase 2.5, Batch 1: the Spending page on the shell (S-230). Read from the sources (the page itself needs a browser):
// no page-links row, no own header, Undo or history; every change through the shell's change() in words; delete never
// asks; "Ledger" never on the screen. From the engines: every line in "where it goes" sits in a category screen, and
// cutting the lines tried leaves the household where the cut simulator said it would, and undoes to exactly the
// household before. Every household here is made up.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SLAM, readJson, loadRules, emptyLog } from './spine-helpers.js';
import { loadHousehold } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';
import { validate } from '../engine/schema.js';
import { summarize } from '../engine/summary.js';
import { cashsim } from '../engine/cashsim.js';
import { spendingView, cutSimulator } from '../engine/spending.js';
import { removeItem, putFact, createHistory, commit, undo } from '../engine/edits.js';

const R = loadRules();
const T = '2026-10-25';
const src = readFileSync(SLAM + 'ui/spending.js', 'utf8');
const demo = () => emptyLog(applyDefaults(loadHousehold(readJson('fixtures/demo.json')), R));
// Words a client screen never shows (THE COPY RULE), as the shell test reads them.
const JARGON = /\b(engine|registry|rules|spine|kind|path|field|stored|simulation|template|schema|computed|derived)\b|S-\d{3}|Ledger|what-if on this page only/i;
const strings = (s) => [...s.replace(/^\s*\/\/.*$/gm, '').matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]).filter((x) => /\s/.test(x) && /^[A-Z ]/.test(x));

test('Spending is on the shell: no page-links row, no own header, Undo, history or Ctrl+Z', () => {
  assert.match(src, /startPage\(\{ tab: 'spending', title: 'Spending', render, name \}\)/);
  assert.doesNotMatch(src, /page-links|saved-line|whoseLine|mountPage\(|loadAll\(|createHistory|commit\(|undo\(|canUndo|keydown|function apply|tryApply/);
  assert.match(read('spending.html'), /<script type="module" src="ui\/spending\.js"><\/script>/);
});

test('every change goes through change() with words; delete never asks', () => {
  for (const edit of ['logSpend', 'removeLog', 'checkIn', 'setSweep', 'applyImport', 'removeItem']) assert.match(src, new RegExp('change\\(\\(s\\) => [^\\n]*' + edit + '\\('), edit + ' goes through change()');
  // Each call names the change in words (said.*) before its statement ends.
  const calls = src.replace(/^\s*\/\/.*$/gm, '').split(/\bchange\(/).slice(1);
  assert.ok(calls.length >= 6, calls.length + ' changes');
  for (const c of calls) assert.match(c.slice(0, c.search(/\);\s*\n|\)\);\s*$/m) + 1 || 600), /said\.(added|deleted|changed|moved|happened)\(/, 'change(' + c.slice(0, 80));
  assert.doesNotMatch(src, /confirm\(|Are you sure/i);
});

test('the categories are their own screens, and their lines one more: Spending > Housing > Rent', () => {
  assert.match(src, /const at = \(\.\.\.levels\) => '#\/' \+ levels\.map\(encodeURIComponent\)\.join\('\/'\)/);
  assert.match(src, /h\('a', \{ class: 'go-row', href: at\(x\.id\) \}/, 'a slice with lines opens its category');
  assert.match(src, /h\('a', \{ class: 'go-row plain', href: at\(cat\.id, l\.id\) \}/, 'a line opens itself');
  assert.match(src, /h\('div', \{ class: 'go-still' \}/, 'a slice with no lines is plain text');
  assert.match(src, /inPlace \? null : h\('p', \{\}, h\('a', \{ href: ledgerHref\(l\.path\) \}, 'Change it in Numbers'\)\)/, 'one way to change a line: Numbers only when its plan is not edited in place');
  // Every line in "where it goes" is in a category: a tag slice's lines are among its tag's lines, and the minimums keep theirs.
  const s0 = demo();
  const s = summarize(s0, R, { flags: false });
  const vw = spendingView(s0, R, cashsim(s0, R, { months: 1 }), s, { today: T });
  for (const slice of vw.donut.slices.filter((x) => x.items.length)) {
    const row = vw.tags.rows.find((r) => r.tag === slice.id);
    if (slice.id === 'minimums') { assert.ok(slice.items.length >= 1); continue; }
    assert.ok(row, slice.id + ' is a tag');
    for (const i of slice.items) assert.ok(row.items.some((x) => x.id === i.id), i.id + ' is a line of ' + slice.label);
  }
});

test('cutting the lines tried lands where the cut simulator said, and undoes exactly', () => {
  const s0 = demo();
  const s = summarize(s0, R, { flags: false });
  const cut = cutSimulator(s0, R, s, { dropped: ['gym', 'streaming'], towardDebt: true });
  assert.ok(cut.saved > 0 && cut.debt, 'the cut saves something and aims it at the debt');
  // What the page's "Cut them from my plan" does: the lines out, the extra toward debt set to what the simulator used.
  let next = s0;
  for (const i of cut.dropped) next = removeItem(next, 'expenses', i.id);
  next = applyDefaults(putFact(next, 'debtPlan.extra', cut.debt.extraAfter, 'known', T), R);
  assert.equal(validate(next).ok, true, JSON.stringify(validate(next).errors));
  assert.equal(summarize(next, R, { flags: false }).cashflow.surplus.value, cut.surplusAfter);
  assert.equal(next.debtPlan.extra.value, cut.debt.extraAfter);
  const hist = commit(createHistory(s0), next, 'Gym and Streaming deleted');
  assert.deepEqual(undo(hist).present, s0);
});

test('client words on Spending follow THE COPY RULE; "Ledger" is "Numbers"', () => {
  const said = strings(src);
  assert.ok(said.length > 20, 'found its words');
  for (const w of said) assert.doesNotMatch(w, JARGON, w);
  assert.match(src, /'Change it in Numbers'/);
  assert.match(src, /Try cutting something\. Nothing is saved until you choose\./);
});

function read(f) { return readFileSync(SLAM + f, 'utf8'); }
