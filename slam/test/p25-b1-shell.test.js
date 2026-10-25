// Phase 2.5, Batch 1: the shell every page uses (S-230), read from the sources (the shell itself needs a browser;
// the history and the rules are tested in p25-b1-history and p25-b1-rules). Six tabs in order, Today on the shell
// with no page-links row and no "View in the Ledger", the One-pager under Today, the Builder pages out of the tabs,
// Session with one total per step from the engine. Every household here is made up.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { SLAM, readJson, loadRules } from './spine-helpers.js';
import { loadHousehold } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';
import { summarize, sessionSteps, SESSION_ORDER } from '../engine/summary.js';
import { editFact } from '../engine/edits.js';

const R = loadRules();
const read = (f) => readFileSync(SLAM + f, 'utf8');
const demo = () => applyDefaults(loadHousehold(readJson('fixtures/demo.json')), R);
// Words a client screen never shows (THE COPY RULE).
const JARGON = /\b(engine|registry|rules|spine|kind|path|field|stored|simulation|template|schema|computed|derived)\b|S-\d{3}|the Ledger/i;
const strings = (src) => [...src.replace(/^\s*\/\/.*$/gm, '').matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]).filter((x) => /\s/.test(x) && /^[A-Z ]/.test(x));

test('six tabs, the same on every page, in order', () => {
  const src = read('ui/shell.js');
  const tabs = [...src.slice(src.indexOf('export const TABS'), src.indexOf('];', src.indexOf('export const TABS'))).matchAll(/\['(\w+)', '([^']+)', '([\w.]+)'\]/g)].map((m) => [m[2], m[3]]);
  assert.deepEqual(tabs, [['Today', 'dashboard.html'], ['Session', 'session.html'], ['My numbers', 'ledger.html'], ['Calendar', 'calendar.html'], ['Spending', 'spending.html'], ['Plan', 'plan.html']]);
  for (const [, page] of tabs) assert.ok(existsSync(SLAM + page), page + ' exists, so no tab is a dead click');
  assert.match(src, /'aria-current': id === lit \? 'page' : null/);
  const css = read('ui/spine.css');
  assert.match(css, /\.tabbar \{ position: fixed; left: 0; right: 0; bottom: 0;/, 'at the bottom on a phone');
  assert.match(css, /@media \(min-width: 640px\) \{\n {2}\.tabbar \{ position: sticky; top: 0; bottom: auto;/, 'at the top on a computer');
});

test('levels are real history entries: pushed, never replaced over the trail', () => {
  const src = read('ui/shell.js');
  assert.match(src, /history\.pushState\(fresh\(lv(, at\(lv\))?\), '', hashOf\(lv\)\)/);
  // Every replaceState either leaves the address alone ('') or stamps a fresh entry before its levels are pushed.
  for (const m of src.matchAll(/history\.replaceState\(([^;]*)\);/g)) assert.ok(/, ''\)?$/.test(m[1]) || /fresh\(\[\](\)|, at\(\[\]\)\))/.test(m[1]), 'replaceState: ' + m[1]);
  assert.match(src, /history\.scrollRestoration = 'manual'/);
  assert.match(src, /addEventListener\('pagehide', saveScroll\)/);
});

test('Today is on the shell: no page-links row, no "View in the Ledger", the whole card the target, the One-pager a button', () => {
  const src = read('ui/dashboard.js');
  assert.match(src, /startPage\(\{ tab: 'today', title: 'Today'/);
  assert.doesNotMatch(src, /page-links|View in the Ledger|windfall\.html|loadAll\(|mountPage\(/);
  assert.match(src, /class: 'tile' \+ \(first \? ' has-target' : ''\)/);
  assert.match(src, /h\('a', \{ class: 'card-link', href: first \}/);
  assert.match(src, /h\('a', \{ class: 'btn', href: 'onepager\.html' \}, 'One-pager'\)/);
  assert.match(read('dashboard.html'), /<title>SLAM Today<\/title>/);
  // The One-pager sits under Today: its Back returns there.
  assert.match(read('ui/onepager.js'), /startPage\(\{\n {2}tab: 'today', title: 'One-pager', parent: \['Today', 'dashboard\.html'\]/);
  assert.doesNotMatch(read('ui/onepager.js'), /page-links/);
});

test('the Builder: one small link at the bottom of every page; the Design kit, All formulas and Rules; no tab lit', () => {
  assert.match(read('ui/page.js'), /h\('a', \{ class: 'builder-link', href: 'builder\.html' \}, 'Builder'\)/);
  const b = read('ui/builder.js');
  for (const [name, href] of [['Design kit', 'affordances.html'], ['All formulas', 'math.html'], ['Rules', 'rules.html']]) assert.ok(b.includes("['" + name + "', '" + href + "'"), name);
  assert.match(b, /tab: null, title: 'Builder'/);
  for (const f of ['ui/math-page.js', 'ui/rules-page.js']) { assert.match(read(f), /tab: null, title: '[^']+', parent: \['Builder', 'builder\.html'\]/, f); assert.doesNotMatch(read(f), /page-links/, f); }
  const kit = read('affordances.html');
  assert.match(kit, /<title>SLAM Design kit<\/title>/);
  assert.match(kit, /<h1>Design kit<\/h1>/);
  assert.doesNotMatch(kit, /class="page-links"/);
  assert.match(kit, /startPage\(\{ tab: null, title: 'Design kit', parent: \['Builder', 'builder\.html'\], household: false \}\)/);
  for (const f of ['session.html', 'builder.html', 'rules.html']) assert.match(read(f), /<script type="module" src="ui\/[\w-]+\.js"><\/script>/, f);
});

test('Session: the five steps in call order, each with its letter and one total from the engine, missing never $0', () => {
  assert.deepEqual(SESSION_ORDER.map(([id, letter]) => letter + ' ' + id), ['N needs', 'D debt', 'I income', 'A assets', 'G goals']);
  const s0 = demo();
  const sum = summarize(s0, R, { flags: false });
  const steps = sessionSteps(s0, sum);
  assert.deepEqual(steps.map((x) => x.label), ['Needs', 'Debt', 'Income', 'Assets', 'Goals']);
  assert.equal(steps[0].result, sum.cashflow.expenses.total);
  assert.equal(steps[1].result, sum.sheet.debts);
  assert.equal(steps[2].result, sum.cashflow.income.gross);
  assert.equal(steps[3].result, sum.sheet.assets);
  assert.equal(steps[4].result.value, 20000, 'the cushion goal; the FI goal is figured, not added');
  // A goal with no amount yet: incomplete, never $0; no goals at all: missing.
  const blank = editFact(s0, 'goals.cushion.target', 'clear', { today: '2026-10-25' });
  const g = sessionSteps(blank, summarize(blank, R, { flags: false }))[4].result;
  assert.deepEqual([g.value, g.kind, g.count], [null, 'missing', 1]);
  const none = { ...s0, goals: s0.goals.filter((x) => x.type === 'fi') };
  assert.deepEqual([sessionSteps(none, summarize(none, R, { flags: false }))[4].result.value, sessionSteps(none, summarize(none, R, { flags: false }))[4].result.count], [null, 0]);
  const src = read('ui/session.js');
  // Batch 3: each row opens its own guided step (session.html#/needs), not My numbers.
  assert.match(src, /h\('a', \{ class: 'go-row', href: '#\/' \+ st\.id \}/, 'each row opens its step');
  assert.match(src, /startPage\(\{ tab: 'session', title: 'Session', render, name \}\)/);
});

test('client words on the new screens follow THE COPY RULE', () => {
  for (const f of ['ui/session.js', 'ui/shell.js', 'ui/dashboard.js']) {
    const said = strings(read(f));
    assert.ok(said.length > 5, f + ': found its words');
    for (const w of said) assert.doesNotMatch(w, JARGON, f + ': ' + w);
  }
});
