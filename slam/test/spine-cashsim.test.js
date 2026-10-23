// The cash simulation adapter (S-203): the spine through the vendored cashflow
// v44 engine. The ten self-test assertions from the reference spec (section 7)
// on spine-built households, plus what the adapter maps.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadHousehold } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';
import { validate } from '../engine/schema.js';
import { editFact, putFact, addItem, editIncome, editPayment } from '../engine/edits.js';
import { cashsim, cashModel, threeWays, burnTiers, windowDays } from '../engine/cashsim.js';
import { cashflow } from '../engine/cashflow.js';
import { readJson, loadRules } from './spine-helpers.js';

const R = loadRules();
const demo = () => applyDefaults(loadHousehold(readJson('fixtures/demo.json')), R);
const near = (a, b, msg = '', eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, a + ' is not ' + b + (msg ? ': ' + msg : ''));
const set = (s, path, value, kind = 'known') => editFact(s, path, 'set', { value, kind, today: '2026-10-23' });
const put = (s, path, value, kind = 'known') => putFact(s, path, value, kind, '2026-10-23');
// A card that revolves: the demo Visa with its minimum left to the house rule, paid by the minimum.
const richer = (s, cash = 20000) => set(s, 'accounts.chk.balance', cash);

test('the adapter maps the demo: accounts, what lands from each paycheck, bills on their days, cards with statement and due, loans paid last', () => {
  const s = demo();
  const { model, needs } = cashModel(s, R, { months: 2 });
  assert.equal(needs.length, 0);
  assert.deepEqual(model.accounts.map((a) => [a.id, a.primary, a.cushion]), [['chk', true, false], ['hysa', false, true]]);
  const salary = model.incomes.find((i) => i.id === 'salary');
  assert.deepEqual([salary.cadence, salary.day, salary.cents], ['month', 15, (4711 - 500) * 100], 'the salary lands on the 15th, net of tax, FICA and the 401(k) share');
  const tut = model.incomes.find((i) => i.id === 'tutoring');
  assert.deepEqual([tut.day, tut.cents, tut.estimated], [1, 50000, true], 'no pay day: the 1st, as a guess');
  assert.ok(model.maybe.length === 0, 'the bonus is in 2027, outside a two-month window');
  const rent = model.bills.find((b) => b.id === 'rent');
  assert.deepEqual([rent.cadence, rent.day, rent.cents, rent.paidWith, rent.budgeted], ['month', 1, 180000, 'cash', false]);
  assert.equal(model.bills.find((b) => b.id === 'groceries').cadence, 'spread', 'no day: spread as everyday spending');
  const visa = model.cards.find((c) => c.id === 'visa');
  assert.deepEqual([visa.dueDay, visa.stmtDay, visa.minimum, visa.minPct, visa.autopay, visa.revolving, visa.estimated], [12, 19, 9000, 0, 'minimum', true, true], 'an entered minimum is used as is; the close day is placed one grace period before the due day');
  const store = model.cards.find((c) => c.id === 'store');
  assert.deepEqual([store.promoApr, store.promoEnd], [0, '2027-02']);
  const sl = model.loans.find((l) => l.id === 'sl');
  assert.deepEqual([sl.payment, sl.day, sl.payLast, sl.rate], [21200, 1, true, 0.05], 'a student loan is paid last');
  assert.ok(model.transfers.some((t) => t.id === 'save:roth' && t.cents === 30000) && model.transfers.some((t) => t.id === 'setAside'));
  assert.equal(windowDays('2026-10-22', 1), 10);
  assert.equal(windowDays('2026-10-22', 3), 71);
});

test('SLAM minimum rule: a card with no entered minimum pays the larger of $40 or 1% plus a month of interest, following the balance', () => {
  let s = richer(demo());
  s = editFact(s, 'debts.visa.minimum', 'clear', { today: '2026-10-23' });
  s = applyDefaults(s, R);
  const { model } = cashModel(s, R, { months: 3 });
  const visa = model.cards.find((c) => c.id === 'visa');
  near(visa.minPct, 0.01 + 0.22 / 12, 'one percent plus a month of interest at 22%', 1e-9);
  assert.equal(visa.minFloor, 4000);
  assert.equal(visa.minimum, null, 'the house default is recomputed by the engine, not fixed');
  const r = cashsim(s, R, { months: 3 });
  const pay = r.daily.find((d) => d.date === '2026-12-12').events.find((e) => e.kind === 'card-payment' && /Visa/.test(e.label));
  const stmt = r.cards.visa.statements[0].balance;
  near(-pay.amount, Math.max(40, Math.round(stmt * (0.01 + 0.22 / 12) * 100) / 100), 'the first minimum');
  assert.ok(r.rough.includes('debts.visa.minimum'), 'a house-default minimum reads rough');
});

test('1. interest accrues on a carried balance at the statement and never on a card paid in full', () => {
  const s = richer(demo());
  const r = cashsim(s, R, { months: 4 });
  assert.ok(r.cards.visa.interest > 0, 'the Visa revolves');
  assert.ok(r.cards.visa.statements.length >= 3);
  near(r.cards.visa.statements[0].interest, Math.round(r.cards.visa.statements[0].adb * 0.22 / 12 * 100) / 100, 'on the average daily balance', 0.02);
  assert.equal(r.cards.ink.interest, 0, 'a card with no balance charges nothing');
  const full = cashsim(put(s, 'debts.visa.payPolicy', 'statement'), R, { months: 4 });
  assert.ok(full.cards.visa.interest < r.cards.visa.interest, 'paying the statement stops interest after the carried balance clears');
  assert.ok(full.cards.visa.statements.slice(1).every((x) => x.interest === 0), 'no interest once a statement is paid in full');
});

test('2. paying more clears sooner and costs less', () => {
  const s = richer(demo());
  const slow = cashsim(s, R, { months: 24 });
  const fast = cashsim(put(s, 'debtPlan.extra', 400), R, { months: 24 });
  assert.ok(fast.cards.visa.interest < slow.cards.visa.interest, 'less interest');
  assert.ok((fast.clearDates.perCard.visa || '9999') < (slow.clearDates.perCard.visa || '9999'), 'cleared sooner: ' + fast.clearDates.perCard.visa + ' vs ' + slow.clearDates.perCard.visa);
  assert.ok(fast.extraPaid > 0);
});

test('3. pay-later plans pay exactly their total; 4. a loan with a term pays more than its principal', () => {
  let s = richer(demo());
  const made = addItem(s, { collection: 'debts', type: 'bnpl', label: 'Shoes' }, '2026-10-23');
  s = set(made.spine, 'debts.shoes.balance', 240);
  s = set(s, 'debts.shoes.minimum', 60);
  s = put(s, 'debts.shoes.dueDay', 12);
  s = applyDefaults(s, R);
  assert.ok(validate(s).ok);
  const r = cashsim(s, R, { months: 6 });
  const paid = r.daily.flatMap((d) => d.events).filter((e) => e.kind === 'paylater').reduce((x, e) => x - e.amount, 0);
  near(paid, 240, 'the plan pays its total and stops');
  assert.equal(r.daily[r.daily.length - 1].payLater, 0);
  const loan = cashsim(s, R, { months: 12 });
  assert.ok(loan.loans.sl.paid > loan.loans.sl.interest && loan.loans.sl.interest > 0, 'the student loan pays principal and interest');
  near(loan.loans.sl.paid - loan.loans.sl.interest + loan.loans.sl.balance, 20000, 'principal paid plus what is left is the loan', 0.5);
});

test('5. cash never breaches the floor when the guard is on; a bill it cannot fund is a shortfall; off, the balance can go under', () => {
  let s = set(demo(), 'accounts.chk.balance', 1500);
  s = set(s, 'accounts.hysa.balance', 0);
  s = editIncome(s, 'salary', { amount: 6000, cadence: 'monthly', end: '2026-10-31' }, '2026-10-23');
  s = editIncome(s, 'tutoring', { amount: 500, cadence: 'monthly', end: '2026-10-31' }, '2026-10-23');
  const on = cashsim(s, R, { months: 2 });
  assert.ok(on.floor.amount > 0 && on.floor.guard);
  // Everyday spending is never guarded, so the balance drifts down by it; planned bills never push it under the floor.
  let everyday = 0; const start = 1500;
  for (const d of on.daily) { everyday += d.events.filter((e) => e.kind === 'everyday').reduce((x, e) => x - e.amount, 0); assert.ok(d.primary >= Math.min(start, on.floor.amount) - everyday - 0.05, d.date + ': ' + d.primary + ' is under the floor path'); }
  assert.ok(on.shortfalls.some((x) => /Rent/.test(x.label)), 'the rent cannot be paid without breaching it');
  const off = cashsim({ ...s, calendar: { guard: false } }, R, { months: 2 });
  assert.ok(off.daily.some((d) => d.primary < off.floor.amount));
  assert.equal(off.shortfalls.length, 0);
});

test('6. burn tiers reconcile to total spending and to the surplus', () => {
  const s = demo();
  const cf = cashflow(s, R, '2026-10', { mode: 'expected' });
  const b = burnTiers(s, R, cf);
  near(b.tiers[1].cumulative, cf.expenses.total.value, 'core plus the rest is spending');
  near(b.tiers[2].cumulative, cf.expenses.total.value + cf.debtMinimums.total.value);
  near(b.tiers[3].cumulative, cf.expenses.total.value + cf.debtMinimums.total.value + cf.saving.afterTax.value + cf.taxSetAside.total.value);
  near(b.unallocated.value, cf.surplus.value, 'what is left is the surplus');
  assert.equal(b.kind, 'rough');
});

test('7. null is never zero: a line with no amount is left out and named in needs', () => {
  let s = editFact(demo(), 'expenses.rent.amount', 'clear', { today: '2026-10-23' });
  s = editFact(s, 'debts.sl.minimum', 'clear', { today: '2026-10-23' });
  const { model, needs } = cashModel(s, R, { months: 2 });
  assert.ok(!model.bills.some((b) => b.id === 'rent'));
  assert.ok(!model.loans.some((l) => l.id === 'sl'));
  assert.deepEqual(needs.map((n) => n.path).sort(), ['debts.sl.minimum', 'expenses.rent.amount']);
  const r = cashsim(s, R, { months: 2 });
  assert.equal(r.kind, 'incomplete');
  assert.ok(r.missing.includes('expenses.rent.amount'));
});

test('8. a 0% promo card sorts last in avalanche until it reverts; student loans wait', () => {
  let s = richer(demo());
  s = put(s, 'debtPlan.extra', 300);
  s = put(s, 'debtPlan.stopAtHi', false);
  const r = cashsim(s, R, { months: 2 });
  const first = r.extraLog[0];
  assert.ok(first && first.to === 'visa', 'the extra goes to the Visa at 22%, not the Store card at 0% nor the student loan: ' + JSON.stringify(first));
  // With the Visa at 10%: the extra stays on it while the store card is at 0%, and moves to the store card the month its intro reverts to 29.99%.
  const later = cashsim(set(s, 'debts.visa.apr', 0.10), R, { months: 6 });
  assert.ok(!later.extraLog.some((x) => x.to === 'store' && x.date < '2027-03-01'), 'not while the store card is at 0%');
  assert.ok(later.extraLog.some((x) => x.to === 'store' && x.date >= '2027-03-01'), 'after the intro ends the extra reaches the store card: ' + JSON.stringify(later.extraLog));
});

test('9. cleared means stopped revolving, not balance zero, including at 0%', () => {
  let s = richer(demo());
  s = put(s, 'debts.visa.payPolicy', 'statement');
  s = editPayment(s, 'groceries', { from: 'visa', day: null }, '2026-10-23');
  const r = cashsim(s, R, { months: 4 });
  assert.ok(r.cards.visa.cleared && r.cards.visa.cleared > r.start, 'the Visa stops revolving at its first full payment');
  assert.ok(r.cards.visa.balance > 0, 'and still carries the groceries put on it since');
  const promo = cashsim(put(richer(demo()), 'debts.store.payPolicy', 'statement'), R, { months: 4 });
  assert.equal(promo.cards.store.interest, 0);
  assert.ok(promo.cards.store.cleared && promo.cards.store.cleared > promo.start, 'a 0% card clears the day its statement is paid in full');
  assert.equal(r.cards.ink.cleared, r.start, 'a card that never revolved is clear from the start');
});

test('10. maybe money: weighted falls between ignored and likely-only; a stream at 0.7 counts in the likely view', () => {
  let s = demo();
  const made = addItem(s, { collection: 'income', type: 'maybeMoney', label: 'Town contract', cadence: 'monthly' }, '2026-10-23');
  s = set(made.spine, 'income.town-contract.amount', 2000);
  s = set(s, 'income.town-contract.likelihood', 0.7);
  s = set(s, 'income.town-contract.withholding.federal', 0);
  s = set(s, 'income.town-contract.withholding.state', 0);
  s = applyDefaults(s, R);
  const t = threeWays(s, R, { months: 3 });
  assert.ok(t.ignore.end < t.weighted.end && t.weighted.end < t.likely.end, JSON.stringify(t));
  const likely = cashsim(s, R, { months: 3, maybeMode: 'likely' });
  assert.ok(likely.daily.some((d) => d.events.some((e) => e.kind === 'maybe-in' && /Town contract/.test(e.label) && e.amount === 2000)), 'at 0.7 it counts in full in the likely view');
  const weighted = cashsim(s, R, { months: 3 });
  assert.ok(weighted.daily.some((d) => d.events.some((e) => e.kind === 'maybe-in' && e.amount === 1400)), 'weighted by its likelihood');
  const under = cashsim(set(s, 'income.town-contract.likelihood', 0.4), R, { months: 3, maybeMode: 'likely' });
  assert.ok(!under.daily.some((d) => d.events.some((e) => e.kind === 'maybe-in')), 'under the threshold it is left out of the likely view');
});

test('overrides move, re-price or skip one occurrence; the maybe tray lands on its date; the dates that fence a repeat', () => {
  let s = demo();
  s = { ...s, calendar: { overrides: { 'utilities|2026-11-10': { date: '2026-11-20' }, 'rent|2026-12-01': { amount: 1700 }, 'gym|2026-11-01': { skip: true } }, maybe: [{ id: 'gift', label: 'Birthday gift', amount: 200, date: '2026-11-05', likelihood: 0.9, direction: 'in' }] } };
  assert.ok(validate(s).ok, JSON.stringify(validate(s).errors));
  const r = cashsim(s, R, { months: 3 });
  const on = (date, re) => r.daily.find((d) => d.date === date).events.some((e) => re.test(e.label));
  assert.ok(!on('2026-11-10', /Utilities/) && on('2026-11-20', /Utilities/) && on('2026-12-10', /Utilities/), 'moved once, the rule still fires');
  assert.ok(r.daily.find((d) => d.date === '2026-12-01').events.some((e) => /Rent/.test(e.label) && e.amount === -1700));
  assert.ok(!on('2026-11-01', /Gym/) && on('2026-12-01', /Gym/));
  assert.ok(r.daily.find((d) => d.date === '2026-11-05').events.some((e) => e.kind === 'maybe-in' && e.amount === 180), 'the tray item, weighted');
  // An income that ends: no paycheck after its end date.
  const ended = cashsim(editIncome(s, 'salary', { amount: 6000, cadence: 'monthly', end: '2026-11-30' }, '2026-10-23'), R, { months: 3 });
  assert.ok(ended.daily.find((d) => d.date === '2026-11-15').events.some((e) => e.kind === 'income' && /Salary/.test(e.label)));
  assert.ok(!ended.daily.find((d) => d.date === '2026-12-15').events.some((e) => e.kind === 'income' && /Salary/.test(e.label)), 'fenced by its end date');
});

test('a shared bill paid whole comes back a few days later; auto-cover tops checking up from the cushion; the dates it reports', () => {
  let s = demo();
  s = put(s, 'expenses.rent.shared', true); s = put(s, 'expenses.rent.sharedWith', 2); s = put(s, 'expenses.rent.whoPays', 'whole');
  const r = cashsim(s, R, { months: 2 });
  assert.ok(r.daily.find((d) => d.date === '2026-11-01').events.some((e) => /Rent/.test(e.label) && e.amount === -1800), 'the whole bill goes out');
  assert.ok(r.daily.find((d) => d.date === '2026-11-04').events.some((e) => /paid back/.test(e.label) && e.amount === 900), 'half comes back three days later');
  assert.ok(r.raidDate === null || r.raidDate >= r.start);
  assert.equal(r.clearDates.hiRate, 0.1);
  assert.ok(['computed', 'rough', 'incomplete'].includes(r.kind));
});
