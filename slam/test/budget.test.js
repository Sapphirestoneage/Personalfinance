// Budget vs actual, one view (engine/budget.js). The demo's three months of actuals are made up.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readJson, loadRules, emptyLog } from './spine-helpers.js';
import { loadHousehold } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';
import { validate } from '../engine/schema.js';
import { fact, valueOf } from '../engine/spine.js';
import { logSpend, editExpense } from '../engine/edits.js';
import { proposeCsv, applyImport } from '../engine/feed.js';
import * as B from '../engine/budget.js';

const R = loadRules();
const T = '2026-10-27';
const demo = () => applyDefaults(loadHousehold(readJson('fixtures/demo.json')), R);
const cat = (vw, key) => vw.cats.find((c) => c.key === key);
const log = (s, x) => logSpend(s, x).spine;

test('the demo: September reads against its plan; only real differences are marked', () => {
  const s = demo();
  assert.ok(validate(s).ok, validate(s).errors.map((e) => e.path + ' ' + e.message).join('\n'));
  assert.equal(B.startMonth(s), '2026-09', 'October has nothing logged yet, so the Budget opens on September');
  const vw = B.budgetView(s, R, { ym: '2026-09' });
  assert.deepEqual([vw.income.plan, vw.income.actual, vw.income.words], [4711, 4711, 'on plan']);
  // Food: $500 groceries and $200 eating out planned; $670 and $252 logged: $222 over, past $100 and 10%.
  assert.deepEqual([cat(vw, 'food').plan, cat(vw, 'food').actual, cat(vw, 'food').words, cat(vw, 'food').mark], [700, 922, '$222 over', 'over']);
  // Housing: $1 over is a number with no mark.
  assert.deepEqual([cat(vw, 'accommodation').words, cat(vw, 'accommodation').mark], ['$1 over', null]);
  assert.equal(vw.notSorted.length, 2, 'two purchases from the statement are not sorted yet');
  // The shared streaming bill counts your $14 of each $40 charge.
  assert.equal(cat(vw, 'other').lines.find((l) => l.id === 'streaming').actual, 14);
  // The threshold is the larger of $100 and 10% of the line, both house defaults.
  assert.equal(B.budgetThreshold(R, 2026, 700), 100);
  assert.equal(B.budgetThreshold(R, 2026, 1950), 195);
  assert.equal(B.budgetThreshold(R, 2026, 700, 3), 300, 'three months: three times the amount');
});

test('a card purchase plus its card payment counts once', () => {
  let s = emptyLog(demo());
  const csv = 'Date,Description,Amount\n2026-10-08,GREEN GROCER 12,-61.10\n2026-10-20,PAYMENT THANK YOU,61.10\n';
  const p = proposeCsv(s, R, csv, { paidWith: 'visa', merchantRules: readJson('data/merchant-rules.json') });
  s = applyImport(s, p.proposals).spine || applyImport(s, p.proposals);
  const vw = B.budgetView(s, R, { ym: '2026-10', asOf: '2026-10-31' });
  const spent = vw.cats.reduce((t, c) => t + c.actual, 0) + vw.notSorted.reduce((t, e) => t + e.amount, 0);
  assert.equal(Math.round(spent * 100) / 100, 61.1, 'the purchase on its day, the payment never');
});

test('a refund lowers its category', () => {
  let s = emptyLog(demo());
  s = log(s, { amount: 120, date: '2026-09-04', expenseId: 'groceries', tag: 'food' });
  s = log(s, { amount: 30, date: '2026-09-09', kind: 'refund', expenseId: 'groceries', tag: 'food' });
  assert.equal(cat(B.budgetView(s, R, { ym: '2026-09' }), 'food').actual, 90);
});

test('a yearly bill never shows as a monthly overspend; it is held against its own cycle', () => {
  let s = emptyLog(demo());
  s = { ...s, expenses: [...s.expenses, { id: 'carins', label: 'Car insurance', amount: fact(900, { kind: 'known', asOf: T, source: 'test' }), cadence: 'yearly', fat: 'transportation', start: '2026-03-15', end: null }] };
  s = log(s, { amount: 900, date: '2026-03-15', expenseId: 'carins', tag: 'transportation' });
  s = log(s, { amount: 130, date: '2026-03-02', expenseId: 'transit', tag: 'transportation' });
  const mar = B.budgetView(s, R, { ym: '2026-03', asOf: '2026-03-31' });
  assert.equal(cat(mar, 'transportation').mark, null, 'March does not read $825 over');
  assert.ok(!cat(mar, 'transportation').lines.some((l) => l.id === 'carins'));
  const oct = B.budgetView(s, R, { ym: '2026-10', asOf: '2026-10-22' });
  assert.equal(oct.cycles[0].words, '$900 due in March, $525 set aside of $900', '7 of 12 months of $75');
});

test('mid-month: against what the plan expects by today, a bill whole once its day has passed', () => {
  let s = emptyLog(demo());
  s = log(s, { amount: 1800, date: '2026-10-01', expenseId: 'rent', tag: 'accommodation' });
  s = log(s, { amount: 150, date: '2026-10-10', expenseId: 'utilities', tag: 'accommodation' });
  s = log(s, { amount: 420, date: '2026-10-12', expenseId: 'groceries', tag: 'food' });
  const vw = B.budgetView(s, R, { ym: '2026-10', asOf: '2026-10-15' });
  assert.equal(cat(vw, 'accommodation').words, 'on pace', 'rent and utilities have come, as planned');
  // Groceries $500 by the 15th of 31 days: $241.94 expected; $420 is $178 ahead of pace.
  const g = cat(vw, 'food').lines.find((l) => l.id === 'groceries');
  assert.equal(g.expected, 241.94);
  assert.equal(g.words, '$178 ahead of pace');
});

test('closing a month writes one History entry; Undo (reopen) takes it back; a carry moves next month\'s plan', () => {
  const s = demo();
  const vw = B.budgetView(s, R, { ym: '2026-09' });
  const diffs = B.realDifferences(vw);
  assert.deepEqual(diffs.map((d) => [d.key, d.kind, d.amount]), [['food', 'over', 222]]);
  const closed = B.closeMonth(s, '2026-09', [{ ...diffs[0], choice: 'carry' }], T);
  assert.equal(closed.closes.length, 1);
  assert.equal(closed.closes[0].summary, 'September closed: $222 over on Food, carried into next month');
  assert.ok(B.budgetView(closed, R, { ym: '2026-09' }).closed, 'the month is locked');
  assert.equal(cat(B.budgetView(closed, R, { ym: '2026-10' }), 'food').plan, 700 - 222, 'carried: October has $222 less for food');
  assert.ok(validate(closed).ok);
  assert.equal(B.reopenMonth(closed, '2026-09').closes.length, 0);
  assert.equal(B.closeSummary('2026-10', [{ kind: 'over', amount: 112, label: 'Food', choice: 'cover', fromLabel: 'Fun' }, { kind: 'under', amount: 240, label: 'Housing', choice: 'fund', toLabel: 'the emergency fund' }]), 'October closed: $112 over on Food, covered from Fun; $240 to the emergency fund');
});

test('the plan learns, and never changes without Update', () => {
  const s = demo();
  const sug = B.planSuggestions(s, R);
  assert.deepEqual(sug.map((x) => [x.id, x.to, x.words]), [['groceries', 648, 'Update plan to $648 (your 3-month average)?']]);
  assert.equal(valueOf(s.expenses.find((e) => e.id === 'groceries').amount), 500, 'nothing updated on its own');
  // Keep remembers that average; Update writes the plan (and the suggestion goes away).
  assert.deepEqual(B.planSuggestions(B.keepPlan(s, 'groceries', 648, T), R), []);
  const up = editExpense(s, 'groceries', { amount: 648, kind: 'known' }, T);
  assert.deepEqual(B.planSuggestions(up, R), []);
  // A fixed line whose price changed: "Rent went up to $1,995. Update?"
  let r = emptyLog(demo());
  for (const ym of ['2026-07', '2026-08', '2026-09']) r = log(r, { amount: 1995, date: ym + '-01', expenseId: 'rent', tag: 'accommodation' });
  assert.equal(B.planSuggestions(r, R).find((x) => x.id === 'rent').words, 'Rent went up to $1,995. Update?');
});

test('old files load with the same numbers: no closes and nothing kept read as none', () => {
  const s = emptyLog(demo());
  assert.equal(B.budgetView(s, R, { ym: '2026-10' }).closed, null);
  assert.deepEqual(B.planSuggestions(s, R), []);
});
