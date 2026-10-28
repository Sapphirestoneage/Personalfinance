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

test('five main tabs in order, the same on every page; coach pages in the gear; Profile in the client menu (S-280)', () => {
  const src = read('ui/shell.js');
  const tabs = [...src.slice(src.indexOf('export const TABS'), src.indexOf('];', src.indexOf('export const TABS'))).matchAll(/\['(\w+)', '([^']+)', '([\w.]+)'\]/g)].map((m) => [m[2], m[3]]);
  assert.deepEqual(tabs, [['Home', 'dashboard.html'], ['Numbers', 'ledger.html'], ['Plan', 'plan.html'], ['Calendar', 'calendar.html'], ['Spending', 'spending.html']]);
  const coach = [...src.slice(src.indexOf('export const COACH'), src.indexOf('];', src.indexOf('export const COACH'))).matchAll(/\['(\w+)', '([^']+)', '([\w.#/]+)'\]/g)].map((m) => m[2]);
  assert.deepEqual(coach, ['Rules', 'House defaults', 'Assumptions', 'All formulas', 'Where each number came from', 'Builder']);
  assert.match(read('ui/page.js'), /h\('a', \{ class: 'btn small', href: 'profile\.html' \}, 'Profile'\)/);
  for (const page of tabs.map((t) => t[1])) assert.ok(existsSync(SLAM + page), page + ' exists, so no tab is a dead click');
  assert.match(src, /'aria-current': id === lit \? 'page' : null/);
  assert.doesNotMatch(src, /more-menu/, 'the More menu is gone');
  const css = read('ui/spine.css');
  assert.match(css, /\.tabbar \{ position: fixed; left: 0; right: 0; bottom: 0; z-index: 40;/, 'at the bottom on a phone');
});

test('levels are real history entries: pushed, never replaced over the trail', () => {
  const src = read('ui/shell.js');
  assert.match(src, /history\.pushState\(fresh\(lv(, at\(lv\))?\), '', hashOf\(lv\)\)/);
  // Every replaceState either leaves the address alone ('') or stamps a fresh entry before its levels are pushed.
  for (const m of src.matchAll(/history\.replaceState\(([^;]*)\);/g)) assert.ok(/, ''\)?$/.test(m[1]) || /fresh\(\[\](\)|, at\(\[\]\)\))/.test(m[1]), 'replaceState: ' + m[1]);
  assert.match(src, /history\.scrollRestoration = 'manual'/);
  assert.match(src, /addEventListener\('pagehide', saveScroll\)/);
});

test('Today is on the shell: no page-links row, no "View in the Ledger", the whole card the target, the One-pager a row', () => {
  const src = read('ui/dashboard.js');
  assert.match(src, /startPage\(\{ tab: 'home', title: 'Home'/);
  assert.doesNotMatch(src, /page-links|View in the Ledger|windfall\.html|loadAll\(|mountPage\(/);
  assert.match(src, /class: 'tile' \+ \(first \? ' has-target' : ''\)/);
  assert.match(src, /h\('a', \{ class: 'card-link', href: first \}/);
  assert.match(read('dashboard.html'), /<title>SLAM Home<\/title>/);
  // The One-pager is an action (End call, Print one-pager); its print view sits under Home.
  assert.match(read('ui/onepager.js'), /startPage\(\{\n {2}tab: 'home', title: 'One-pager'/);
  assert.doesNotMatch(read('ui/onepager.js'), /page-links/);
});

test('the Builder: opened from the Coach gear, not a second link in the footer; the Design kit, All formulas and Rules; no tab lit', () => {
  assert.doesNotMatch(read('ui/page.js'), /builder-link|builder\.html/);
  assert.match(read('ui/shell.js'), /\['Builder', 'builder\.html'\]|'builder\.html'/);
  const b = read('ui/builder.js');
  for (const [name, href] of [['Design kit', 'affordances.html'], ['All formulas', 'math.html'], ['Rules', 'rules.html']]) assert.ok(b.includes("['" + name + "', '" + href + "'"), name);
  assert.match(b, /tab: null, title: 'Builder'/);
  for (const f of ['ui/math-page.js', 'ui/rules-page.js']) { assert.match(read(f), /tab: null, title: (?:'[^']+'|ON_HOUSE \? 'House defaults' : 'Rules'), parent: \['Builder', 'builder\.html'\]/, f); assert.doesNotMatch(read(f), /page-links/, f); }
  const kit = read('affordances.html');
  assert.match(kit, /<title>SLAM Design kit<\/title>/);
  assert.doesNotMatch(kit, /<h1>/, 'the shell draws the title from startPage, so the kit has no title of its own');
  assert.doesNotMatch(kit, /class="page-links"/);
  assert.match(kit, /startPage\(\{ tab: null, title: 'Design kit', parent: \['Builder', 'builder\.html'\] \}\)/);
  for (const f of ['ledger.html', 'builder.html', 'rules.html']) assert.match(read(f), /<script type="module" src="ui\/[\w-]+\.js"><\/script>/, f);
});

test('Session: the six steps in DATING order, as My numbers, each with its letter and one total from the engine, missing never $0', () => {
  assert.deepEqual(SESSION_ORDER.map(([id, letter]) => letter + ' ' + id), ['D debt', 'A assets', 'T taxes', 'I income', 'N needs', 'G goals']);
  const s0 = demo();
  const sum = summarize(s0, R, { flags: false });
  const steps = sessionSteps(s0, sum);
  assert.deepEqual(steps.map((x) => x.label), ['Debt', 'Assets', 'Taxes', 'Income', 'Needs', 'Goals']);
  const at = (list, id) => list.find((x) => x.id === id);
  assert.equal(at(steps, 'needs').result, sum.cashflow.expenses.total);
  assert.equal(at(steps, 'debt').result, sum.sheet.debts);
  assert.equal(at(steps, 'taxes').result, sum.tax.balanceDue);
  assert.equal(at(steps, 'income').result, sum.cashflow.income.gross);
  assert.equal(at(steps, 'assets').result, sum.sheet.assets);
  assert.equal(at(steps, 'goals').result.value, null, 'no savings goal in the demo (its cushion goal is the Plan\'s reserve step now); the FI goal is figured, not added');
  // A goal with no amount yet: incomplete, never $0; no goals at all: missing.
  const withTrip = { ...s0, goals: [...s0.goals, { id: 'trip', type: 'savings', label: 'Trip', target: { value: 3000, kind: 'known', asOf: '2026-10-01', source: 'test' } }] };
  assert.equal(sessionSteps(withTrip, summarize(withTrip, R, { flags: false })).find((x) => x.id === 'goals').result.value, 3000);
  const blank = editFact(withTrip, 'goals.trip.target', 'clear', { today: '2026-10-25' });
  const g = sessionSteps(blank, summarize(blank, R, { flags: false })).find((x) => x.id === 'goals').result;
  assert.deepEqual([g.value, g.kind, g.count], [null, 'missing', 1]);
  const none = { ...s0, goals: s0.goals.filter((x) => x.type === 'fi') };
  assert.deepEqual([sessionSteps(none, summarize(none, R, { flags: false })).find((x) => x.id === 'goals').result.value, sessionSteps(none, summarize(none, R, { flags: false })).find((x) => x.id === 'goals').result.count], [null, 0]);
  const src = read('ui/guide.js');
  // Batch 3: each row opens its own guided step; S-280: Guide me is a mode of Numbers, session.html redirects there.
  assert.match(src, /h\('a', \{ class: 'go-row', href: '#\/' \+ st\.id \}/, 'each row opens its step');
  assert.doesNotMatch(src, /startPage\(/);
  assert.match(read('session.html'), /location\.replace\('ledger\.html\?guide=1'/);
});

test('client words on the new screens follow THE COPY RULE', () => {
  for (const f of ['ui/guide.js', 'ui/shell.js', 'ui/dashboard.js']) {
    const said = strings(read(f));
    assert.ok(said.length > 5, f + ': found its words');
    for (const w of said) assert.doesNotMatch(w, JARGON, f + ': ' + w);
  }
});
