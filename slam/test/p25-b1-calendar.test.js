// Phase 2.5, Batch 1: the Calendar on the shell (S-230). Read from the sources (the page needs a browser), plus the
// engine reading that finds an item for its own screen. No page-links row, no Undo of its own, every change through
// the shell's change() in words, the whole card the target instead of "View in the Ledger", and client words that
// follow THE COPY RULE. Every household here is made up.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SLAM, readJson, loadRules } from './spine-helpers.js';
import { loadHousehold } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';
import { calendar } from '../engine/calendar.js';
import { itemId, itemDay } from '../engine/calendar-views.js';
import * as E from '../engine/edits.js';

const R = loadRules();
const read = (f) => readFileSync(SLAM + f, 'utf8');
const demo = () => applyDefaults(loadHousehold(readJson('fixtures/demo.json')), R);
const JARGON = /\b(engine|registry|rules|spine|kind|path|field|stored|simulation|template|schema|computed|derived)\b|S-\d{3}|Ledger/i;
const strings = (src) => [...src.replace(/^\s*\/\/.*$/gm, '').matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]).filter((x) => /\s/.test(x) && /^[A-Z ]/.test(x));
const EDITS = /\b(moveOccurrence|skipOccurrence|repriceOccurrence|lockOccurrence|confirmOccurrence|unconfirmOccurrence|addMaybe|setMaybeDate|removeMaybe|putFact)\(s\b/;

test('the Calendar is on the shell: its tab, no page-links row, no Undo or loader of its own', () => {
  const src = read('ui/calendar.js');
  assert.match(src, /startPage\(\{ tab: 'calendar', title: 'Calendar', name: nameOf, render \}\)/);
  assert.doesNotMatch(src, /page-links|saved-line|loadAll\(|mountPage\(|createHistory|tryApply|\bapply\(|whoseLine|from '\.\/household\.js'/);
  assert.doesNotMatch(src, /\b(undo|redo|commit)\(hist/, 'the shell keeps the one history');
  assert.doesNotMatch(src, /toLowerCase\(\) !== 'z'/, 'Ctrl+Z is the shell\'s');
  // Every change to the household goes through change(), one per line, with its words.
  const lines = src.split('\n').filter((l) => EDITS.test(l));
  assert.ok(lines.length >= 12, 'found the edits');
  for (const l of lines) assert.match(l, /change\(\(s\) =>/, l.trim().slice(0, 120));
  // Drag is one change, so one Undo; the listeners go on once.
  assert.equal((src.match(/^dragSetup\(app\);$/gm) || []).length, 1);
  assert.match(src, /if \(d\.kind === 'maybe'\) change\(\(s\) => setMaybeDate\(s, d\.maybeId, date\), said\.moved\(d\.label, date\)\);\n\s+else change\(\(s\) => moveOccurrence\(s, d\.key, date\), said\.moved\(d\.label, date\)\);/);
});

test('screen by screen: Calendar, a day, an item; the month screen keeps its month, view, time picker and search', () => {
  const src = read('ui/calendar.js');
  assert.match(src, /if \(ctx\.levels\.length === 2\) return itemScreen\(v, date, id\);/);
  assert.match(src, /if \(ctx\.levels\.length === 1\) return dayScreen\(v, date\);/);
  // Made simple: one month control (no month count), three views, Group by paycheck, a day picked in the grid.
  for (const k of ['ym', 'view', 'q', 'byPay', 'day', 'back', 'open', 'filter']) assert.match(src, new RegExp('\\b' + k + ': '), 'kept: ' + k);
  assert.match(src, /const VIEWS = \[\['month', 'Month'\], \['week', 'Week'\], \['list', 'List'\], \['year', 'Year'\]\];/, 'a calendar first: Month, then Week, the list and the year');
  assert.match(src, /keep\(\{ q: box\.value \}\)/, 'what is typed in search is kept');
  // An item that cannot move says why; old month links still open their month.
  assert.match(src, /h\('strong', \{\}, 'This date is set elsewhere\. '\), fixedWords\(e\)/);
  assert.match(src, /'It comes from the lender\. Change it in Numbers\.'/);
  assert.match(src, /\/\^#\\d\{4\}-\\d\{2\}\$\/\.test\(startHash\)/);
});

test('the whole card is the target, with a chevron, where "View in the Ledger" was', () => {
  for (const f of ['ui/calendar.js', 'ui/debt-tab.js', 'ui/cash-chart.js']) assert.doesNotMatch(read(f), /View in the Ledger|Open in the Ledger|in the Ledger/, f);
  const cal = read('ui/calendar.js');
  assert.match(cal, /class: 'cal-item' \+ \(href \? ' has-target' : ''\)/);
  assert.match(cal, /h\('a', \{ class: 'cal-name ev-go', href \}, e\.label\)/);
  const debt = read('ui/debt-tab.js');
  assert.equal((debt.match(/h\('a', \{ class: 'card-link', href: ledgerHref\((t|l)\.path\) \}, h\('span', \{\}, (t|l)\.name\), chev\(\)\)/g) || []).length, 2);
  const css = read('ui/spine.css');
  assert.match(css, /\.ev-go::after \{ content: ""; position: absolute; inset: 0;/);
  assert.match(css, /\.ev \.grip, \.ev a:not\(\.ev-go\) \{ position: relative; z-index: 1; \}/, 'the grip stays above the row so it drags');
});

test('client words on the Calendar follow THE COPY RULE', () => {
  for (const f of ['ui/calendar.js', 'ui/debt-tab.js', 'ui/cash-chart.js']) {
    const said = strings(read(f));
    assert.ok(said.length > 10, f + ': found its words');
    for (const w of said) assert.doesNotMatch(w, JARGON, f + ': ' + w);
  }
  // The month before the as-of date says so in plain words.
  const c = calendar(demo(), R, { from: '2026-09', months: 1 });
  assert.equal(c.months[0].cash.note, 'This month is over. Cash by day starts on the date your numbers are from.');
  assert.doesNotMatch(read('engine/calendar.js'), /does not look back/);
});

test('an item\'s screen finds it on the day it is on now: moved, skipped, a maybe item, a date', () => {
  const s0 = demo();
  const key = 'rent|2026-11-01';
  const find = (s, id, date) => { const day = itemDay(s, id, date); return day ? calendar(s, R, { from: day.slice(0, 7), months: 1 }).months[0].events.find((e) => itemId(e) === id && e.date === day) || null : null; };
  assert.equal(find(s0, key, '2026-11-01').label, 'Rent');
  const moved = E.moveOccurrence(s0, key, '2026-11-03');
  assert.equal(itemDay(moved, key, '2026-11-01'), '2026-11-03');
  assert.equal(find(moved, key, '2026-11-01').date, '2026-11-03', 'the screen follows it to its new day');
  const intoDec = E.moveOccurrence(s0, key, '2026-12-02');
  assert.equal(find(intoDec, key, '2026-11-01').date, '2026-12-02', 'into another month too');
  assert.equal(itemDay(E.skipOccurrence(s0, key, true), key, '2026-11-01'), null, 'skipped: the screen goes up to the day');
  const { spine: withMaybe, id } = E.addMaybe(s0, { label: 'Gift from aunt', amount: 200, date: '2026-11-20' });
  assert.equal(find(withMaybe, 'maybe:' + id, '2026-11-01').label, 'Gift from aunt');
  assert.equal(itemDay(E.setMaybeDate(withMaybe, id, null), 'maybe:' + id, '2026-11-20'), null, 'back in the tray');
  // An item with no key (a debt minimum) is found by its id on the day in the address, and only there.
  const debt = calendar(s0, R, { from: '2026-11', months: 1 }).months[0].events.find((e) => e.kind === 'debt' && e.date);
  assert.equal(find(s0, itemId(debt), debt.date).label, debt.label);
  assert.equal(find(s0, itemId(debt), '2026-11-29' === debt.date ? '2026-11-28' : '2026-11-29'), null);
  assert.equal(itemDay(s0, 'x', 'not a day'), null);
});
