// Phase 2.5, Batch 0 fixes: answers 34 and 35 (a second pay day; a debt paid by a budget line). Made-up demo only.
// A link counts only when it can be paid once: the line repeats, the debt has a balance, and it is the only line
// naming that debt; otherwise the line counts as an ordinary bill. A linked line keeps its category for the readers
// that work by category. A second pay day equal to the first is the one-day rule, and a file holding one is flagged.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadHousehold, readHousehold } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';
import { validate } from '../engine/schema.js';
import { editFact, putFact, addItem, editPayment, editExpense } from '../engine/edits.js';
import { cashflow } from '../engine/cashflow.js';
import { cashsim } from '../engine/cashsim.js';
import { summarize } from '../engine/summary.js';
import { paysDebtOf, lineFor } from '../engine/debt.js';
import { estimatedVsActual } from '../engine/compare.js';
import { draftt } from '../engine/plan.js';
import { donut, tagBudgets } from '../engine/spending.js';
import { ledgerRows, paymentRow } from '../engine/ledger.js';
import { payDay2Of, paydaysOf } from '../engine/contrib.js';
import { readJson, loadRules } from './spine-helpers.js';

const R = loadRules();
const T = '2026-10-23';
const demo = () => applyDefaults(loadHousehold(readJson('fixtures/demo.json')), R);
const near = (a, b, msg = '', eps = 0.01) => assert.ok(a !== null && Math.abs(a - b) <= eps, a + ' is not ' + b + (msg ? ': ' + msg : ''));
const set = (s, path, value, kind = 'known') => editFact(s, path, 'set', { value, kind, today: T });
const put = (s, path, value, kind = 'known') => putFact(s, path, value, kind, T);
const out = (cf) => round(cf.expenses.total.value + cf.debtMinimums.total.value);
const round = (x) => Math.round(x * 100) / 100;

// The demo with a car loan ($350 minimum, due the 5th) and a $350 car payment line (transportation, a need).
function withCar({ link = true, balance = 15000, cadence = 'monthly' } = {}) {
  let s = demo();
  let made = addItem(s, { collection: 'debts', type: 'auto_loan', label: 'Car loan' }, T);
  s = balance === null ? made.spine : set(made.spine, 'debts.car-loan.balance', balance);
  s = set(s, 'debts.car-loan.minimum', 350);
  s = set(s, 'debts.car-loan.apr', 0.06);
  s = put(s, 'debts.car-loan.dueDay', 5);
  made = addItem(s, { collection: 'expenses', label: 'Car payment', fat: 'transportation' }, T);
  s = set(made.spine, 'expenses.car-payment.amount', 350);
  s = put(s, 'expenses.car-payment.need', true);
  if (cadence !== 'monthly') s = editExpense(s, 'car-payment', { amount: 350, cadence }, T);
  s = editPayment(s, 'car-payment', { from: 'chk', day: 5 }, T);
  return link ? editPayment(s, 'car-payment', { from: 'chk', day: 5, paysDebt: 'car-loan' }, T) : s;
}
// A file that names the debt on a line the editor would refuse: the link is written straight into the household.
const forceLink = (s, id, debt = 'car-loan') => ({ ...s, expenses: s.expenses.map((e) => (e.id === id ? { ...e, paysDebt: { value: debt, kind: 'known', asOf: T, source: 'file' } } : e)) });

test('the linked car payment is counted once and keeps its place under transportation', () => {
  const plain = withCar({ link: false }), linked = withCar();
  assert.ok(validate(linked).ok, JSON.stringify(validate(linked).errors));
  const a = cashflow(plain, R, '2026-10'), b = cashflow(linked, R, '2026-10');
  near(b.surplus.value, a.surplus.value + 350, 'the double count is gone');
  // Needs and Lean FI read the same with or without the link.
  near(b.expenses.need.value, a.expenses.need.value, 'needs');
  near(b.expenses.lean.value, a.expenses.lean.value, 'lean spending');
  near(summarize(linked, R).fi.leanFi.value, summarize(plain, R).fi.leanFi.value, 'Lean FI');
  assert.deepEqual(b.expenses.linked.map((x) => [x.id, x.amount, x.fat, x.need, x.debt]), [['car-payment', 350, 'transportation', true, 'car-loan']]);
  // DATING shares: the payment sits under transportation, not under debt.
  const dp = draftt(plain, R, summarize(plain, R)), dl = draftt(linked, R, summarize(linked, R));
  const row = (d, k) => d.rows.find((r) => r.key === k).amount;
  near(row(dl, 'transportation'), row(dp, 'transportation'), 'transportation keeps the payment');
  near(row(dl, 'debt'), row(dp, 'debt') - 350, 'D drops the minimum the line now pays');
  near(dl.leftOver, dp.leftOver + 350, 'left over gains the double count');
  // Where it goes: the transportation slice keeps the line; the minimums slice does not list the loan.
  const wp = donut(plain, R, summarize(plain, R)), wl = donut(linked, R, summarize(linked, R));
  const slice = (w, id) => w.slices.find((x) => x.id === id);
  near(slice(wl, 'transportation').amount, slice(wp, 'transportation').amount);
  assert.ok(slice(wl, 'transportation').items.some((i) => i.id === 'car-payment'));
  assert.ok(!slice(wl, 'minimums').items.some((i) => i.id === 'car-loan'));
  // The tag budget keeps the payment.
  const tb = (s) => tagBudgets(s, R, cashflow(s, R, '2026-10')).rows.find((r) => r.tag === 'transportation').budget;
  near(tb(linked), tb(plain));
});

test('Plan vs actual: the payment logged to the linked line meets its plan', () => {
  const logged = (s) => ({ ...s, log: [...(s.log || []), { id: 'l-car', date: '2026-10-05', kind: 'spend', amount: 350, expenseId: 'car-payment', label: 'Car payment' }] });
  const a = estimatedVsActual(logged(withCar({ link: false })), R), b = estimatedVsActual(logged(withCar()), R);
  const line = (c) => c.lines.find((r) => r.id === 'car-payment');
  assert.deepEqual([line(b).planned, line(b).actual, line(b).diff], [350, 350, 0]);
  const tag = (c) => c.tags.find((r) => r.tag === 'transportation');
  assert.deepEqual([tag(b).planned, tag(b).actual, tag(b).unassigned], [tag(a).planned, tag(a).actual, 0]);
});

test('a one-time or total line cannot pay a debt: the editor refuses, a file is flagged, and the line counts as itself', () => {
  const once = withCar({ link: false, cadence: 'once' });
  assert.throws(() => editPayment(once, 'car-payment', { from: 'chk', day: 5, paysDebt: 'car-loan' }, T), /repeats/);
  const forced = forceLink(once, 'car-payment');
  assert.ok(validate(forced).errors.some((e) => e.path === 'expenses.car-payment.paysDebt' && /repeats/.test(e.message)));
  assert.equal(paysDebtOf(forced, forced.expenses.find((e) => e.id === 'car-payment')), null);
  assert.equal(lineFor(forced, forced.debts.find((d) => d.id === 'car-loan')), null);
  // The same money out either way: the one-time line is not dropped.
  const ym = (forced.expenses.find((e) => e.id === 'car-payment').start || forced.meta.asOf).slice(0, 7);
  assert.equal(out(cashflow(forced, R, ym)), out(cashflow(once, R, ym)));
  // Changing a linked line to one time drops the link.
  const changed = editExpense(withCar(), 'car-payment', { amount: 350, cadence: 'once' }, T);
  assert.equal(changed.expenses.find((e) => e.id === 'car-payment').paysDebt, undefined);
});

test('a linked debt with no balance yet: the line goes out as a bill, so the known payment is never dropped', () => {
  const plain = withCar({ link: false, balance: null }), linked = withCar({ balance: null });
  assert.equal(paysDebtOf(linked, linked.expenses.find((e) => e.id === 'car-payment')), null);
  const a = cashflow(plain, R, '2026-10'), b = cashflow(linked, R, '2026-10');
  assert.equal(out(b), out(a), 'the month spends the same');
  near(b.surplus.value, a.surplus.value);
  const run = (s) => cashsim(s, R, { months: 3 }).daily.flatMap((d) => d.events).filter((e) => e.amount < 0).reduce((x, e) => x + e.amount, 0);
  near(run(linked), run(plain), 'the run spends the same', 0.05);
  // The payment row keeps the debt picked and says why it counts as a bill for now.
  const row = paymentRow(linked, linked.expenses.find((e) => e.id === 'car-payment'));
  assert.equal(row.fact.value.paysDebt, 'car-loan');
  assert.match(row.display, /pays Car loan \(counted as a bill until the debt has a balance\)/);
  // Once the balance is entered the link counts.
  const later = set(linked, 'debts.car-loan.balance', 15000);
  assert.equal(paysDebtOf(later, later.expenses.find((e) => e.id === 'car-payment')), 'car-loan');
});

test('two lines naming the same debt in a file: flagged, and the second counts as an ordinary bill', () => {
  let s = withCar();
  const made = addItem(s, { collection: 'expenses', label: 'Car insurance', fat: 'transportation' }, T);
  s = set(made.spine, 'expenses.car-insurance.amount', 120);
  const both = forceLink(s, 'car-insurance');
  assert.ok(validate(both).errors.some((e) => e.path === 'expenses.car-insurance.paysDebt' && /another line already pays this debt/.test(e.message)));
  assert.equal(paysDebtOf(both, both.expenses.find((e) => e.id === 'car-insurance')), null);
  assert.equal(out(cashflow(both, R, '2026-10')), round(out(cashflow(s, R, '2026-10'))), 'the $120 still goes out');
  assert.ok(cashflow(both, R, '2026-10').expenses.items.some((i) => i.id === 'car-insurance' && i.amount === 120));
  // Loaded from a file, the second link is named on My numbers.
  const r = readHousehold(JSON.parse(JSON.stringify(both)), { today: T });
  assert.ok(r.problems.some((p) => p.path === 'expenses.car-insurance.paysDebt'));
});

test('the minimum row of a linked debt opens the line, not the minimum', () => {
  const s = withCar();
  const row = ledgerRows(s).flatMap((g) => g.rows).find((r) => r.path === 'debts.car-loan.minimum');
  assert.equal(row.linked, true);
  assert.equal(row.linePath, 'expenses.car-payment.paidFrom');
});

test('a second pay day equal to the first: flagged in a file, and read as the one-day rule', () => {
  const s = demo();
  const F = (value) => ({ value, kind: 'known', asOf: T, source: 'file' });
  const same = { ...s, income: s.income.map((x) => (x.id === 'salary' ? { ...x, amount: F(3000), cadence: 'semimonthly', payDay: F(1), payDay2: F(1) } : x)) };
  assert.ok(validate(same).errors.some((e) => e.path === 'income.salary.payDay2' && /a different day from the first/.test(e.message)));
  const line = same.income.find((x) => x.id === 'salary');
  assert.equal(payDay2Of(line), null, 'the second day is not used');
  const days = paydaysOf(same, line, '2027-01-01', '2027-12-31');
  assert.equal(days.length, 24, 'twice a month, every month');
  assert.equal(new Set(days).size, 24, 'never twice on one day');
  // Two different days still work.
  const two = { ...same, income: same.income.map((x) => (x.id === 'salary' ? { ...x, payDay2: F(15) } : x)) };
  assert.ok(validate(two).ok);
  assert.deepEqual(paydaysOf(two, two.income.find((x) => x.id === 'salary'), '2027-02-01', '2027-02-28'), ['2027-02-01', '2027-02-15']);
});
