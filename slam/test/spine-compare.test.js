// Estimated vs actual (S-207): the plan from the cash flow against the log,
// per line and tag, over a window; income planned against logged; the
// savings rate from the real ledger. A month with nothing logged is named.

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadHousehold } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';
import { logSpend, putFact, confirmOccurrence } from '../engine/edits.js';
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

test('so far and expected by month end (S-209): the log so far, then what the run still has this month, less the rest of each spread line', async () => {
  const { monthOutlook } = await import('../engine/compare.js');
  const { cashsim } = await import('../engine/cashsim.js');
  let s = demo();
  const empty = monthOutlook(s, R, cashsim(s, R, { months: 1 }), { asOf: T });
  assert.equal(empty.logged, 0);
  assert.equal(empty.soFar, 0);
  s = logSpend(s, { amount: 4211, date: '2026-10-15', kind: 'income' }).spine;
  s = logSpend(s, { amount: 300, date: '2026-10-10', expenseId: 'groceries' }).spine;
  s = logSpend(s, { amount: 20, date: '2026-10-12', expenseId: 'groceries', kind: 'refund' }).spine;
  s = logSpend(s, { amount: 1800, date: '2026-10-01', expenseId: 'rent' }).spine;
  s = logSpend(s, { amount: 99, date: '2026-10-25', expenseId: 'groceries' }).spine;
  const sim = cashsim(s, R, { months: 1 });
  const o = monthOutlook(s, R, sim, { asOf: T });
  assert.equal(o.incomeSoFar, 4211);
  assert.equal(o.spentSoFar, 2080, '300 - 20 + 1800; the entry after today is not so far');
  assert.equal(o.soFar, 2131);
  const food = o.rest.find((r) => r.id === 'food');
  assert.deepEqual(food.lines, ['Groceries', 'Eating out']);
  assert.deepEqual([food.plan, food.logged, food.left], [700, 280, 420]);
  // A Food entry with no line still eats the Food spread; a rent entry (a dated bill) does not.
  const tagged = monthOutlook(logSpend(s, { amount: 50, date: '2026-10-20', tag: 'food' }).spine, R, sim, { asOf: T });
  assert.equal(tagged.rest.find((r) => r.id === 'food').left, 370);
  assert.equal(tagged.expected, o.expected, 'so far down 50, the plan left down 50');
  assert.ok(o.items.every((i) => i.date > T && i.date.slice(0, 7) === '2026-10'));
  assert.equal(o.expected, Math.round((o.soFar + o.paychecks - o.bills - o.planLeft) * 100) / 100);
  assert.equal(o.planLeft, Math.round(o.rest.reduce((a, r) => a + r.left, 0) * 100) / 100);
  // Today after the as-of date: so far runs to today, the run still starts at the as-of date.
  const later = monthOutlook(s, R, sim, { asOf: T, today: '2026-10-25' });
  assert.equal(later.spentSoFar, 2179);
  // A run item already in the log is not still to come: "It happened" claims it by key, a typed entry on the line by day.
  const early = { ...demo(), meta: { ...demo().meta, asOf: '2026-10-02' } };
  const base = monthOutlook(early, R, cashsim(early, R, { months: 1 }), { asOf: '2026-10-02' });
  const pay = base.items.find((i) => i.kind === 'income');
  const bill = base.items.find((i) => i.kind === 'bill');
  assert.ok(pay && bill, 'the demo has a paycheck and a bill after Oct 2');
  const payId = early.income.find((x) => x.label === pay.label).id;
  const hap = confirmOccurrence(early, payId + '|' + pay.date, { amount: pay.amount });
  const o2 = monthOutlook(hap, R, cashsim(hap, R, { months: 1 }), { asOf: '2026-10-02', today: pay.date });
  assert.deepEqual(o2.claimed.map((i) => i.label), [pay.label]);
  assert.equal(o2.paychecks, Math.round((base.paychecks - pay.amount) * 100) / 100);
  assert.equal(o2.incomeSoFar, pay.amount, 'counted once, in so far');
  const billId = early.expenses.find((x) => x.label === bill.label).id;
  const typed = logSpend(early, { amount: -bill.amount, date: bill.date, expenseId: billId }).spine;
  const o3 = monthOutlook(typed, R, cashsim(typed, R, { months: 1 }), { asOf: '2026-10-02', today: bill.date });
  assert.deepEqual(o3.claimed.map((i) => i.label), [bill.label]);
  assert.equal(o3.bills, Math.round((base.bills + bill.amount) * 100) / 100);
  // A spread line with no amount: expected is a missing row.
  const gone = putFact(s, 'expenses.groceries.amount', null, 'missing', T);
  assert.equal(monthOutlook(gone, R, cashsim(gone, R, { months: 1 }), { asOf: T }).expected, null);
});

test('the month reading counts a card-charged bill still to come, flags a month the balances are not from, and names guessed pay days (S-209)', async () => {
  const { monthOutlook } = await import('../engine/compare.js');
  const { cashsim } = await import('../engine/cashsim.js');
  const early = (s) => ({ ...s, meta: { ...s.meta, asOf: '2026-10-02' } });
  const onCard = early(putFact(demo(), 'expenses.phone.paidFrom', 'visa', 'known', '2026-10-23'));
  const o = monthOutlook(onCard, R, cashsim(onCard, R, { months: 1 }), { asOf: '2026-10-02' });
  const phone = o.items.find((i) => i.label === 'Phone');
  assert.deepEqual([phone.date, phone.amount, phone.card], ['2026-10-20', -60, 'visa']);
  const s = demo();
  assert.equal(monthOutlook(s, R, cashsim(s, R, { months: 1 }), { asOf: T, today: '2026-11-02' }).stale, true);
  assert.equal(monthOutlook(s, R, cashsim(s, R, { months: 1 }), { asOf: T, today: '2026-10-25' }).stale, false);
  const guessed = putFact(s, 'income.salary.payDay', 15, 'rough', '2026-10-23');
  const g = monthOutlook(guessed, R, cashsim(guessed, R, { months: 1 }), { asOf: T });
  assert.ok(g.guessedPayDay.some((x) => /^Salary/.test(x)));
});

test('the month reading counts the as-of day, keeps a held-back bill, and waits for a checking balance (S-209 review)', async () => {
  const { monthOutlook } = await import('../engine/compare.js');
  const { cashsim } = await import('../engine/cashsim.js');
  // As of the 15th, nothing logged: the paycheck on the 15th is still to come.
  const mid = { ...demo(), meta: { ...demo().meta, asOf: '2026-10-15' } };
  const o = monthOutlook(mid, R, cashsim(mid, R, { months: 1 }), { asOf: '2026-10-15' });
  assert.ok(o.items.some((i) => i.date === '2026-10-15' && i.kind === 'income' && i.amount === 4211));
  // Checking at 10 dollars as of Oct 2: the floor holds bills back, but they are still owed this month.
  const poor = putFact({ ...demo(), meta: { ...demo().meta, asOf: '2026-10-02' } }, 'accounts.chk.balance', 10, 'known', '2026-10-02');
  const noCushion = putFact(poor, 'accounts.hysa.balance', 0, 'known', '2026-10-02');
  const sim = cashsim(noCushion, R, { months: 1 });
  const p = monthOutlook(noCushion, R, sim, { asOf: '2026-10-02' });
  const held = sim.shortfalls.filter((x) => x.kind === 'bill' && x.date.slice(0, 7) === '2026-10');
  assert.ok(held.length > 0, 'something is held back');
  for (const x of held) assert.equal(p.items.filter((i) => i.label === x.label && i.date === x.date).reduce((a, i) => a + i.amount, 0), -x.amount - (sim.daily.find((d) => d.date === x.date).events.filter((e) => e.label === x.label && e.kind === x.kind).reduce((a, e) => a - e.amount, 0)));
  // No checking balance: expected is missing, never a number without the bills.
  const none = putFact(demo(), 'accounts.chk.balance', null, 'missing', '2026-10-23');
  const n = monthOutlook(none, R, cashsim(none, R, { months: 1 }), { asOf: T });
  assert.equal(n.expected, null);
  assert.ok(n.missing.includes('accounts.chk.balance'));
});

test('a paycheck or bill before the as-of date that nobody marked is still to come in the month reading (S-209 review)', async () => {
  const { monthOutlook } = await import('../engine/compare.js');
  const { cashsim } = await import('../engine/cashsim.js');
  const { waiting } = await import('../engine/calendar-views.js');
  const s = demo();
  const sim = cashsim(s, R, { months: 1 });
  const w = waiting(s, R, { today: T });
  const plain = monthOutlook(s, R, sim, { asOf: T });
  const o = monthOutlook(s, R, sim, { asOf: T, waiting: w });
  const rent = o.items.find((i) => i.label === 'Rent' && i.waiting);
  assert.deepEqual([rent.date, rent.amount], ['2026-10-01', -1800]);
  assert.equal(o.bills, Math.round((plain.bills + w.filter((e) => e.direction === 'out').reduce((a, e) => a + e.amount, 0)) * 100) / 100);
  assert.equal(o.expected, Math.round((plain.expected + w.reduce((a, e) => a + (e.direction === 'in' ? e.amount : -e.amount), 0)) * 100) / 100);
});
