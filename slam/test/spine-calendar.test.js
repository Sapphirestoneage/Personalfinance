// The cash flow calendar (S-200): every dated item on its day, the undated
// ones kept and named, totals that add up, and month-end cash from the projection.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadHousehold } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';
import { editIncome, editExpense, editPayment, editFact, putFact } from '../engine/edits.js';
import { calendar, payDatesIn } from '../engine/calendar.js';
import { cashflow } from '../engine/cashflow.js';
import { project } from '../engine/projection.js';
import { readJson, loadRules } from './spine-helpers.js';

const R = loadRules();
const demo = () => applyDefaults(loadHousehold(readJson('fixtures/demo.json')), R);
const near = (a, b, msg = '', eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, a + ' is not ' + b + (msg ? ': ' + msg : ''));
const find = (m, id) => m.events.find((e) => e.id === id);

test('pay dates: weekly and biweekly count from the first pay date, inside the month only', () => {
  assert.deepEqual(payDatesIn('2026-10-02', 'biweekly', null, '2026-11'), ['2026-11-13', '2026-11-27']);
  assert.deepEqual(payDatesIn('2026-09-04', 'weekly', '2026-10-20', '2026-10'), ['2026-10-02', '2026-10-09', '2026-10-16']);
  assert.deepEqual(payDatesIn('2026-12-01', 'biweekly', null, '2026-10'), [], 'not started yet');
  assert.deepEqual(payDatesIn(null, 'biweekly', null, '2026-10'), [], 'no first pay date, no dates');
});

test('the demo month: each item on its day, the rest sometime this month, totals that add up', () => {
  const c = calendar(demo(), R, { months: 1 });
  const m = c.months[0];
  assert.equal(m.ym, '2026-10');
  const on = (id) => find(m, id).date;
  assert.equal(on('pay:salary'), '2026-10-15', 'the salary lands on its pay day');
  near(find(m, 'pay:salary').amount, 4711 - 500, 'what lands: gross less tax, FICA and the $500 saved from pay');
  assert.equal(on('bill:rent'), '2026-10-01');
  assert.equal(on('bill:utilities'), '2026-10-10');
  assert.equal(on('debt:visa'), '2026-10-12');
  assert.equal(on('debt:store'), '2026-10-03');
  assert.equal(on('debt:sl'), '2026-10-01');
  assert.equal(find(m, 'debt:sl').rough, true, 'the loan has no due day entered, so the house default day is a guess');
  assert.equal(find(m, 'debt:visa').rough, false);
  // No day: kept, never put on a made-up day, never dropped.
  for (const id of ['pay:tutoring', 'bill:groceries', 'save:roth', 'setAside']) { assert.equal(find(m, id).date, null, id); assert.ok(m.undated.some((e) => e.id === id)); }
  assert.equal(find(m, 'bill:phone').date, '2026-10-20');
  assert.equal(m.events.some((e) => e.id === 'bill:other'), true, '"everything else" is a line too');
  // Totals: in is every pay, out is every bill, minimum, saving and the set-aside (from the same cash flow).
  const cf = cashflow(demo(), R, '2026-10', { mode: 'expected' });
  near(m.in, cf.income.takeHome.value, 'every paycheck adds up to the month\'s take-home');
  near(m.out, cf.expenses.total.value + cf.debtMinimums.total.value + cf.saving.afterTax.value + cf.taxSetAside.total.value);
  near(m.net, cf.surplus.value, 'what is left on the calendar is the month\'s surplus');
  // Days add up to the month.
  near(m.days.reduce((x, d) => x + d.in, 0) + m.undated.filter((e) => e.direction === 'in').reduce((x, e) => x + e.amount, 0), m.in);
  // This month's cash is cash today; a later month's is the projection's month-end cash.
  assert.equal(m.cash.value, 12000);
  assert.equal(m.cash.when, 'now');
  const later = calendar(demo(), R, { from: '2026-12', months: 1 }).months[0];
  const p = project(demo(), R, { endYm: '2026-12' });
  assert.equal(later.cash.value, p.months.find((x) => x.ym === '2026-12').cash);
  assert.equal(later.cash.when, 'end');
  // Every event with a field links to it; every event has a kind and a label.
  for (const e of m.events) { assert.ok(e.kind && e.label, e.id); if (e.path) assert.ok(/^[a-z]+\./.test(e.path)); }
});

test('dates: a promo ending, the estimated tax dates, the return with its balance (not counted twice), maybe money at its odds', () => {
  const s = demo();
  const mar = calendar(s, R, { from: '2027-03', months: 1 }).months[0];
  assert.equal(find(mar, 'promo:store').date, '2027-03-01', 'the day after the intro ends');
  assert.match(find(mar, 'promo:store').label, /29\.99%/);
  const bonus = find(mar, 'pay:bonus');
  assert.equal(bonus.date, '2027-03-15');
  near(bonus.amount, (3000 - 660 - 165) * 0.5, 'half, at 50% likely');
  assert.match(bonus.label, /50% likely/);
  const apr = calendar(s, R, { from: '2027-04', months: 1 }).months[0];
  assert.equal(find(apr, 'est:1').date, '2027-04-15');
  const ret = find(apr, 'return:2026');
  assert.equal(ret.date, '2027-04-15');
  near(ret.amount, 1072.63);
  assert.equal(ret.direction, 'out');
  assert.equal(ret.counted, false, 'the set-aside already counted it month by month');
  const cf = cashflow(s, R, '2027-04', { mode: 'expected' });
  near(apr.out, cf.expenses.total.value + cf.debtMinimums.total.value + cf.saving.afterTax.value + cf.taxSetAside.total.value, 'the return payment is not added to the month\'s total');
  const jan = calendar(s, R, { from: '2027-01', months: 1 }).months[0];
  assert.equal(find(jan, 'est:4').date, '2027-01-15');
  assert.equal(find(jan, 'est:4').amount, null, 'a date, not a payment');
});

test('edits move things: a biweekly paycheck, a bill day, an ending income, a subscription on its charge day', () => {
  let s = demo();
  s = editIncome(s, 'salary', { amount: 2769.23, cadence: 'biweekly', start: '2026-10-02', end: '2027-02-28' }, '2026-10-23');
  s = editPayment(s, 'groceries', { from: 'chk', day: 7 }, '2026-10-23');
  s = editExpense(s, 'streaming', { amount: 120, cadence: 'yearly', subscription: true }, '2026-10-23');
  s = putFact(s, 'expenses.streaming.renews', '2026-11-20', 'known', '2026-10-23');
  s = applyDefaults(s, R);
  const nov = calendar(s, R, { from: '2026-11', months: 1 }).months[0];
  assert.deepEqual(nov.events.filter((e) => e.id === 'pay:salary').map((e) => e.date), ['2026-11-13', '2026-11-27']);
  // Two real paychecks in November; the month-by-month numbers use the rate (26 a year / 12), so the two differ on purpose.
  const cf = cashflow(s, R, '2026-11', { mode: 'expected' });
  const st = cf.income.streams.find((x) => x.id === 'salary');
  near(nov.events.filter((e) => e.id === 'pay:salary').reduce((x, e) => x + e.amount, 0), 2 * 2769.23 * (st.takeHome - cf.saving.payroll.value) / st.gross, 'each paycheck is its gross less its share of tax, FICA and payroll saving');
  assert.equal(find(nov, 'bill:groceries').date, '2026-11-07');
  const sub = find(nov, 'sub:streaming');
  assert.equal(sub.date, '2026-11-20');
  assert.equal(sub.amount, 120, 'a yearly subscription charges its whole amount on its day');
  const dec = calendar(s, R, { from: '2026-12', months: 1 }).months[0];
  assert.equal(dec.events.some((e) => e.id === 'sub:streaming'), false, 'and nothing in a month it does not charge');
  const feb = calendar(s, R, { from: '2027-02', months: 1 }).months[0];
  assert.equal(find(feb, 'ends:salary').date, '2027-02-28');
  const mar = calendar(s, R, { from: '2027-03', months: 1 }).months[0];
  assert.equal(mar.events.some((e) => e.id === 'pay:salary'), false, 'gone after it ends');
  // A rough amount or a guessed day reads rough; a semimonthly pay lands twice.
  s = editIncome(s, 'tutoring', { amount: 500, cadence: 'semimonthly', payDay: 1, kind: 'rough' }, '2026-10-23');
  const m = calendar(s, R, { from: '2026-11', months: 1 }).months[0];
  const t = m.events.filter((e) => e.id === 'pay:tutoring');
  assert.deepEqual(t.map((e) => [e.date, e.rough]), [['2026-11-01', true], ['2026-11-16', true]]);
  near(t[0].amount + t[1].amount, cashflow(s, R, '2026-11', { mode: 'expected' }).income.streams.find((x) => x.id === 'tutoring').takeHome, 'a 1099 has nothing taken out');
});

test('a missing amount is a missing line, never $0; a covered bill is not on the calendar', () => {
  let s = demo();
  s = editFact(s, 'expenses.gym.amount', 'clear', { today: '2026-10-23' });
  s = editExpense(s, 'phone', { amount: 60, cadence: 'monthly', coveredBy: 'Parents' }, '2026-10-23');
  const m = calendar(s, R, { months: 1 }).months[0];
  const gym = find(m, 'bill:gym');
  assert.ok(gym, 'the gym still shows');
  assert.equal(gym.amount, null);
  assert.equal(m.events.some((e) => e.id === 'bill:phone'), false, 'covered: someone else pays it');
  assert.equal(m.kind, 'incomplete');
  assert.ok(m.missing.includes('expenses.gym.amount'));
});
