// Phase 2.5, Batch 1: Plan and Got extra money? on the shell (S-230). Plan's steps each open their own screen
// (Plan › 3. High-interest debt), every change on Plan goes through the shell's change() in words and undoes to exactly
// the household before it (the owner saw Undo on Plan do nothing), Got extra money? sits under Plan as a whole-card
// way in, and the words a client sees follow THE COPY RULE. Read from the sources where a browser is needed. Every
// household here is made up.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SLAM, readJson, loadRules } from './spine-helpers.js';
import { loadHousehold } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';
import { summarize } from '../engine/summary.js';
import { fooLadder, surplusWaterfall, applyLifeEvent, removeLifeEvent, importJson, exportJson } from '../engine/plan.js';
import { windfall } from '../engine/windfall.js';
import { maxItSim } from '../engine/maxit.js';
import { createHistory, commit, undo, redo, putFact } from '../engine/edits.js';

const R = loadRules();
const T = '2026-10-25';
const read = (f) => readFileSync(SLAM + f, 'utf8');
const demo = () => applyDefaults(loadHousehold(readJson('fixtures/demo.json')), R);
const JARGON = /\b(engine|registry|rules|spine|kind|path|field|stored|simulation|template|schema|computed|derived)\b|S-\d{3}|the Ledger|\bLedger\b/i;
const strings = (src) => [...src.replace(/^\s*\/\/.*$/gm, '').matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]).filter((x) => /\s/.test(x) && /^[A-Z ]/.test(x));

test('Plan is on the shell: no page-links row, no header or undo of its own, every change through change() in words', () => {
  const src = read('ui/plan.js');
  assert.match(src, /startPage\(\{ tab: 'plan', title: 'Plan', subtab: subtabOf, name, render \}\)/);
  assert.doesNotMatch(src, /page-links|View in the Ledger|loadAll\(|mountPage\(|whoseLine\(|createHistory|commit\(|undoLabel|saved-line|lastSaved|keydown/);
  const code = src.replace(/^\s*\/\/.*$/gm, '');
  const calls = [...code.matchAll(/\bchange\(/g)];
  assert.ok(calls.length >= 6, 'the deductible, the hours, a life event added and removed, a scenario loaded, a file applied');
  for (const c of calls) assert.match(code.slice(c.index, code.indexOf('\n', c.index)), /said\.(changed|added|deleted|moved|happened)\(/, 'a change says what changed: ' + code.slice(c.index, c.index + 80));
  // Deleting never asks; saved scenarios (outside the household) offer Undo in the bar.
  assert.doesNotMatch(src, /confirm\(/);
  assert.match(src, /const putBack = \(was, now, words\) => say\(words, \(\) => \{ keepScenarios\(was\); refresh\(\); \}, \(\) => \{ keepScenarios\(now\); refresh\(\); \}\)/);
  // The Windfall is Plan's Extra money tab (S-280).
  assert.match(read('ui/shell.js'), /\['extra', 'Extra money', 'windfall\.html'\]/);
  assert.match(read('plan.html'), /<script type="module" src="ui\/plan\.js"><\/script>/);
});

test('Extra money is a second-level tab of Plan (S-280)', () => {
  const src = read('ui/windfall.js');
  assert.match(src, /startPage\(\{ tab: 'plan', title: 'Extra money', subtab: \(\) => 'extra', name, render \}\)/);
  assert.doesNotMatch(src, /page-links|View in the Ledger|loadAll\(|mountPage\(|whoseLine\(|WINDFALL_ORDER'\)/);
  assert.match(read('windfall.html'), /<title>SLAM Extra money<\/title>/);
  // Each step opens its own screen, numbered in the order; a step with no amount yet is not there (the shell goes up).
  assert.match(src, /return i < 0 \? null : m\.w\.steps\[i\]\.label;/);
});

test('each step of the order of operations is its own screen, titled as its row: Plan > High-interest debt', () => {
  const s = demo();
  const sum = summarize(s, R, { flags: false });
  const f = fooLadder(s, R, sum, { sim: maxItSim(s, R) });
  assert.deepEqual(f.rungs.map((r) => r.rung), f.rungs.map((_, i) => i + 1));
  const hi = f.rungs.find((r) => r.id === 'highInterest');
  assert.equal(hi.rung + '. ' + hi.label, '3. High-interest debt');
  // The screen's address is the step in words; its title is the label clicked, word for word (S-281).
  const src = read('ui/plan.js');
  assert.match(src, /const slug = \(id\) => id\.replace\(\/\[A-Z\]\/g, \(c\) => '-' \+ c\.toLowerCase\(\)\);/);
  assert.match(src, /return r \? r\.label : null;/);
  assert.match(src, /href: '#\/' \+ slug\(r\.id\)/);
  // No step says where a number lives in words a client would not use.
  for (const r of f.rungs) assert.doesNotMatch(r.why, JARGON, r.id + ': ' + r.why);
});

test('the surplus step by step: months to fill come from the engine, not the view', () => {
  const s = demo();
  const w = surplusWaterfall(s, R, summarize(s, R, { flags: false }));
  for (const st of w.steps) assert.equal(st.months, st.amount > 0 && st.need > st.amount ? Math.ceil(st.need / st.amount) : null, st.id);
  assert.doesNotMatch(read('ui/plan.js'), /Math\.ceil/);
});

test('undo on Plan: every change Plan makes undoes to exactly the household before it, and redoes', () => {
  const s0 = applyDefaults(demo(), R);
  const tpl = JSON.parse(read('data/life-events.json')).templates.find((t) => t.id === 'new-job');
  const changes = [
    ['the biggest deductible', (x) => putFact(x, 'household.deductible', 2500, 'known', T)],
    ['hours and commute', (x) => putFact(putFact(x, 'household.workHoursPerWeek', 40, 'known', T), 'household.commuteHoursPerWeek', 5, 'known', T)],
    ['a life event added', (x) => applyLifeEvent(x, tpl, '2026-12-01').spine],
    ['a file applied', () => importJson(exportJson(putFact(s0, 'household.deductible', 900, 'known', T))).spine]
  ];
  for (const [what, fn] of changes) {
    const before = createHistory(s0);
    const after = commit(before, applyDefaults(fn(before.present), R), what, 25);
    assert.notDeepEqual(after.present, s0, what + ' changes something');
    const back = undo(after);
    assert.deepEqual(back.present, s0, what + ': Undo returns exactly the household before it');
    assert.deepEqual(redo(back).present, after.present, what + ': Redo puts it back');
  }
  // A life event removed, then Undo: the event's lines are back.
  const withEvent = applyDefaults(applyLifeEvent(s0, tpl, '2026-12-01').spine, R);
  const h1 = commit(createHistory(withEvent), applyDefaults(removeLifeEvent(withEvent, 'new-job'), R), 'removed', 25);
  assert.deepEqual(undo(h1).present, withEvent);
});

test('client words on Plan and Got extra money? follow THE COPY RULE, and say My numbers, not the Ledger', () => {
  for (const f of ['ui/plan.js', 'ui/windfall.js', 'ui/scenario.js']) {
    const said = strings(read(f));
    assert.ok(said.length > (f === 'ui/scenario.js' ? 1 : 5), f + ': found its words');
    for (const w of said) assert.doesNotMatch(w, JARGON, f + ': ' + w);
  }
  // The Plan's "How much to max it" card and the engine words its steps show.
  const card = read('ui/maxit-panel.js');
  const body = card.slice(card.indexOf('export function maxItCard'));
  for (const w of strings(body)) assert.doesNotMatch(w, /Ledger/, 'maxItCard: ' + w);
  const s = demo();
  const w = windfall({ ...s, accounts: (s.accounts || []).filter((a) => a.type !== 'roth_ira') }, R, summarize(s, R, { flags: false }), { amount: 5000 });
  for (const st of w.steps) assert.doesNotMatch(st.why, /Ledger/, st.id + ': ' + st.why);
});
