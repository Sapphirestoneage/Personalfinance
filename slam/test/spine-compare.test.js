// Estimated vs actual (S-207): the plan from the cash flow against the log,
// per line and tag, over a window; income planned against logged; the
// savings rate from the real ledger. A month with nothing logged is named.

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadHousehold } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';
import { logSpend, putFact } from '../engine/edits.js';
import { estimatedVsActual } from '../engine/compare.js';
import { readJson, loadRules } from './spine-helpers.js';

const R = loadRules();
const demo = () => applyDefaults(loadHousehold(readJson('fixtures/demo.json')), R);
const T = '2026-10-22';

test('one month: planned per line from the cash flow, actual from the log, the difference, and the tag totals', () => {
  let s = demo();
  const empty = estimatedVsActual(s, R, { months: 1, asOf: T });
  assert.deepEqual(empty.months, ['2026-10']);
  assert.deepEqual(empty.monthsSilent, ['2026-10'], 'nothing logged: the month is named silent');
  assert.equal(empty.spend.actual, 0);
  assert.equal(empty.income.actual, null, 'no income logged is not zero income');
  assert.equal(empty.savingsRate.real, null);
  assert.ok(empty.savingsRate.note);
  s = logSpend(s, { amount: 480, date: '2026-10-10', expenseId: 'groceries' }).spine;
  s = logSpend(s, { amount: 60, date: '2026-10-12', expenseId: 'groceries' }).spine;
  s = logSpend(s, { amount: 25, date: '2026-10-15', tag: 'food' }).spine;
  s = logSpend(s, { amount: 1800, date: '2026-10-01', expenseId: 'rent' }).spine;
  s = logSpend(s, { amount: 4211, date: '2026-10-15', kind: 'income' }).spine;
  const c = estimatedVsActual(s, R, { months: 1, asOf: T });
  const groceries = c.lines.find((r) => r.id === 'groceries');
  assert.equal(groceries.planned, 500);
  assert.equal(groceries.actual, 540);
  assert.equal(groceries.diff, 40);
  assert.equal(groceries.entries, 2);
  const rent = c.lines.find((r) => r.id === 'rent');
  assert.equal(rent.diff, 0);
  const food = c.tags.find((r) => r.tag === 'food');
  assert.equal(food.planned, 700);
  assert.equal(food.actual, 565, 'the untagged-to-a-line 25 counts in the tag');
  assert.equal(food.unassigned, 25);
  assert.equal(c.spend.actual, 2365);
  assert.equal(c.income.actual, 4211);
  assert.ok(c.income.planned > 0);
  assert.equal(c.savingsRate.real, Math.round((4211 - 2365) / 4211 * 10000) / 10000);
  assert.ok(c.savingsRate.plan !== null);
  assert.deepEqual(c.monthsLogged, ['2026-10']);
  for (let i = 1; i < c.lines.length; i++) assert.ok(Math.abs(c.lines[i - 1].diff) >= Math.abs(c.lines[i].diff), 'sorted by the size of the miss');
  assert.equal(c.lines[0].id, 'other', 'nothing logged against the biggest rough line is the biggest miss');
});

test('a window of months: the plan adds up month by month, the log across them; a missing line amount is a missing row', () => {
  let s = demo();
  s = logSpend(s, { amount: 100, date: '2026-08-05', expenseId: 'gym' }).spine;
  s = logSpend(s, { amount: 50, date: '2026-09-05', expenseId: 'gym' }).spine;
  const c = estimatedVsActual(s, R, { months: 3, asOf: T });
  assert.deepEqual(c.months, ['2026-08', '2026-09', '2026-10']);
  assert.deepEqual(c.monthsSilent, ['2026-10']);
  const gym = c.lines.find((r) => r.id === 'gym');
  assert.equal(gym.planned, 150, 'three months of 50');
  assert.equal(gym.actual, 150);
  assert.equal(gym.diff, 0);
  const gone = putFact(s, 'expenses.gym.amount', null, 'missing', T);
  const c2 = estimatedVsActual(gone, R, { months: 3, asOf: T });
  assert.equal(c2.lines.find((r) => r.id === 'gym').kind, 'missing');
  assert.equal(c2.lines.find((r) => r.id === 'gym').diff, null);
  assert.equal(c2.tags.find((r) => r.tag === 'other').diff, null, 'the tag with the missing line has no difference');
  assert.equal(c2.spend.planned, null);
  assert.equal(c2.kind, 'missing');
});
