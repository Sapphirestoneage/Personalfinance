// Phase 2.5, Batch 0 fixes (adapted from the second build's p25-card-in-full-wes test).
// Answer 38: a card set to pay the full statement never carries a balance and
// never accrues interest. Wes (made up, as of 2026-10-22): a W-2 earner whose
// Rewards Visa ($900 at 21.99%, limit $8,000, minimum $35, due the 25th) is paid
// in full every month. The numbers below are worked by hand:
//   gross 3,200 x 26 / 12 = 6,933.33; withheld (410 + 160) x 26 / 12 = 1,235;
//   FICA 6,933.33 x 7.65% = 530.40; 401(k) 520; take-home = 4,647.93
//   expenses 1650 + 140 + 60 + 15 + 480 + 220 + 127 + 45 + 65 + 30 + 400 = 3,232
//   after-tax saving 300 + 150 = 450; 2026 is a refund, so no tax set-aside
//   surplus = 4,647.93 - 3,232 - 0 (the card is spending already counted) - 450 = 965.93
//   savings rate of gross = (965.93 + 520 + 450) / 6,933.33 = 27.92%; of take-home = (965.93 + 450) / 4,647.93 = 30.46%
//   age 38: Rule of 5 = 7.6 months; runway = 19,500 / 3,232 = 6.03 months; target = ceil(7.6 x 3,232) = 24,564
//   the $900 clears with the November statement payment, with no interest.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadHousehold } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';
import { validate } from '../engine/schema.js';
import { putFact } from '../engine/edits.js';
import { summarize, payoffOrders } from '../engine/summary.js';
import { cashflow } from '../engine/cashflow.js';
import { project } from '../engine/projection.js';
import { debtSchedule, minimumsTotal, order, payoffPlan } from '../engine/debt.js';
import { cashsim } from '../engine/cashsim.js';
import { debtView } from '../engine/debtview.js';
import { fooLadder } from '../engine/plan.js';
import { windfall } from '../engine/windfall.js';
import { loadRules } from './spine-helpers.js';

const R = loadRules();
const AS_OF = '2026-10-22';
const F = (value, kind = 'known') => ({ value, asOf: AS_OF, source: 'test (made up)', kind });
const near = (a, b, eps = 0.01, what = '') => assert.ok(a !== null && a !== undefined && Math.abs(a - b) <= eps, (what ? what + ': ' : '') + a + ' is not within ' + eps + ' of ' + b);

const expense = (id, label, amount, need, fat, kind = 'known') => ({ id, label, amount: F(amount, kind), cadence: 'monthly', start: null, end: null, fixed: null, need: F(need), fat });

// The household as the pages load it: normalized, house defaults applied, valid.
function wes(payPolicy = 'statement') {
  const raw = {
    schema: 'slam-spine/1',
    meta: { name: 'Wes (made up)', asOf: AS_OF, demo: true },
    household: {
      people: [{ id: 'p1', name: 'Wes', birthDate: F('1988-02-20') }],
      filingStatus: F('single'), state: F('NY'), county: F('Erie'), nycResident: F(false),
      situation: [{ id: 'now', from: null, value: F('employed') }],
      healthCoverage: [{ id: 'now', from: null, personId: 'p1', value: F('employer'), planType: F('other') }]
    },
    income: [{ id: 'salary', type: 'w2', label: 'Salary', personId: 'p1', amount: F(3200), cadence: 'biweekly', start: '2020-05-01', end: null, withholding: { federal: F(410), state: F(160) } }],
    expenses: [
      expense('rent', 'Rent', 1650, true, 'accommodation'), expense('utilities', 'Utilities', 140, true, 'accommodation'),
      expense('internet', 'Internet', 60, true, 'accommodation'), expense('renters', 'Renters insurance', 15, true, 'accommodation'),
      expense('groceries', 'Groceries', 480, true, 'food'), expense('dining', 'Eating out', 220, false, 'food'),
      expense('transit', 'Metro pass', 127, true, 'transportation'), expense('gym', 'Gym', 45, false, null),
      expense('phone', 'Phone', 65, true, null), expense('streaming', 'Streaming', 30, false, null),
      expense('other', 'Everything else', 400, false, null, 'rough')
    ],
    accounts: [
      { id: 'chk', family: 'cash', type: 'checking', name: F('Checking'), balance: F(4500), role: F('spending') },
      { id: 'sav', family: 'cash', type: 'hysa', name: F('High-yield savings'), balance: F(15000), apy: F(0.04), role: F('emergency') },
      { id: 'k401', family: 'employerRetirement', type: 'k401', name: F('Work 401(k)'), balance: F(96000), monthlyContribution: F(520) },
      { id: 'roth', family: 'ira', type: 'roth_ira', name: F('Roth IRA'), balance: F(31000), monthlyContribution: F(300), basis: F(24000) },
      { id: 'brk', family: 'taxable', type: 'brokerage', name: F('Brokerage'), balance: F(12000), monthlyContribution: F(150), costBasis: F(10500) }
    ],
    debts: [{ id: 'visa', family: 'debt', type: 'credit_card', name: F('Rewards Visa'), balance: F(900), apr: F(0.2199), limit: F(8000), minimum: F(35), dueDay: F(25), payPolicy: F(payPolicy), business: F(false), reportsToPersonalCredit: F(true) }],
    goals: [{ id: 'fi', type: 'fi', label: 'Financial independence', fiNumber: F(1100000) }],
    assumptions: { inflation: F(0.03, 'rough'), realReturn: F(0.05, 'rough'), withdrawalRate: F(0.04), lifeExpectancy: F(90, 'rough'), coastAge: F(65) },
    taxYears: [{ id: '2026', year: 2026, estimatedPaidFederal: F(0), estimatedPaidState: F(0), setAside: F(0) }]
  };
  const spine = applyDefaults(loadHousehold(raw), R);
  const r = validate(spine);
  assert.ok(r.ok, r.errors.map((e) => e.path + ' ' + e.message).join('\n'));
  return spine;
}

test('cash flow: a card paid in full is not a debt payment on top of the spending already on it', () => {
  const s = summarize(wes(), R);
  const cf = s.cashflow;
  near(cf.income.takeHome.value, 4647.93);
  assert.equal(cf.expenses.total.value, 3232);
  assert.equal(cf.taxSetAside.total.value, 0);
  assert.equal(cf.debtMinimums.total.value, 0);
  assert.deepEqual(cf.debtMinimums.items, [], 'the Visa is not listed as a payment');
  near(cf.surplus.value, 965.93);
  near(cf.savingsRate.gross.value, 0.2792, 0.0001, 'savings rate of gross');
  near(cf.savingsRate.net.value, 0.3046, 0.0001, 'savings rate of take-home');
});

test('cash flow in a later month leaves out the statement payment too', () => {
  const cf = cashflow(wes(), R, '2026-11');
  assert.equal(cf.debtMinimums.total.value, 0);
  assert.deepEqual(cf.debtMinimums.items, []);
  near(cf.surplus.value, 965.93);
});

test('emergency fund: the card balance is not added to the monthly need', () => {
  const s = summarize(wes(), R);
  const em = s.emergency;
  assert.equal(s.sheet.cash.value, 19500);
  assert.equal(em.targetMonths.value, 7.6);
  assert.equal(em.monthlyNeed, 3232);
  near(em.tiers.full.runway.value, 6.033, 0.001, 'runway in months');
  assert.equal(em.targetDollars.value, 24564);
  assert.equal(em.gap.value, 5064);
});

test('the debt schedule and the projection: no interest, the card clears with the November statement payment', () => {
  const spine = wes();
  const sc = debtSchedule(spine, R, AS_OF, '2027-01');
  const nov = sc.months.get('2026-11');
  assert.equal(nov.interest, 0);
  assert.equal(nov.paid, 900);
  assert.deepEqual(nov.payments.map((p) => [p.id, p.amount, p.inFull, p.dueDate]), [['visa', 900, true, '2026-11-25']]);
  assert.deepEqual(nov.paidOff, ['visa']);
  assert.equal(nov.debt, 0);
  const dec = sc.months.get('2026-12');
  assert.deepEqual([dec.paid, dec.interest, dec.payments.length], [0, 0, 0]);
  const p = project(spine, R, { mode: 'expected' });
  assert.equal(p.months[0].ym, '2026-11');
  assert.equal(p.months[0].debtPaid, 900, 'the carried statement leaves cash once');
  assert.equal(p.months[0].interest, 0);
  assert.equal(p.months[0].debt, 0);
  assert.ok(p.events.some((e) => e.kind === 'debtPaidOff' && e.ym === '2026-11' && e.path === 'debts.visa.balance'));
  assert.ok(p.months.every((m) => m.interest === 0), 'no interest in any month');
});

test('payoff orders follow the setting: it is not a debt to pay down, and it clears in November', () => {
  const spine = wes();
  const s = summarize(spine, R);
  assert.deepEqual(order(spine, 'avalanche', AS_OF), [], 'nothing to pay down');
  assert.deepEqual(s.debt.avalancheCards, []);
  const orders = payoffOrders(spine, R, s);
  for (const k of ['avalanche', 'snowball', 'stress']) {
    const plan = orders[k];
    assert.deepEqual(plan.debts.map((d) => [d.id, d.payoffYm, d.interest]), [['visa', '2026-11', 0]], k);
    assert.equal(plan.debtFreeYm, '2026-11', k);
    assert.equal(plan.totalInterest.value, 0, k);
  }
});

test('the day-by-day run never charges a card paid in full interest, not even at its first statement', () => {
  const sim = cashsim(wes(), R, { months: 3 });
  const card = sim.model.cards.find((c) => c.id === 'visa');
  assert.equal(card.revolving, false, 'it opens as not carrying a balance');
  assert.equal(card.autopay, 'statement');
  assert.equal(sim.cards.visa.interest, 0);
  assert.equal(sim.interest.total, 0);
  assert.ok(sim.cards.visa.statements.every((x) => x.interest === 0));
  assert.ok(!sim.daily.some((d) => d.events.some((e) => e.kind === 'interest')), 'no interest on any day');
  const paid = sim.daily.flatMap((d) => d.events.filter((e) => e.card === 'visa' || /Rewards Visa/.test(e.label)).filter((e) => e.kind === 'card-payment').map((e) => [d.date, e.amount]));
  assert.ok(paid.length >= 1 && paid[0][0] === '2026-10-25' && paid[0][1] === -900, 'the statement is paid on its due day: ' + JSON.stringify(paid));
});

test('the debt tab: no payoff bar, no minimum trap and no order row for a card paid in full', () => {
  const spine = wes();
  const s = summarize(spine, R);
  const sim = cashsim(spine, R, { months: 3 });
  const view = debtView(spine, R, sim, s);
  assert.deepEqual(view.gantt.rows, []);
  assert.deepEqual(view.order.rows, []);
  const tile = view.cards.find((c) => c.id === 'visa');
  assert.equal(tile.trap, null);
  assert.equal(tile.interest, 0);
  assert.equal(tile.revolving, false);
  assert.equal(view.clearDates.rows.find((r) => r.id === 'cardsFree').date, sim.start, 'every card is clear from the start');
});

test('flags and the plan stay right: utilization still reads the balance; the Visa is not high-interest debt', () => {
  const spine = wes();
  const s = summarize(spine, R);
  near(s.debt.utilization.personal.value, 0.1125, 0.0001, 'utilization reads the $900 balance');
  const st = Object.fromEntries(s.flags.map((f) => [f.id, f.stage]));
  assert.equal(st['utilization-visa'], 'yellow');
  assert.equal(st.runway, 'yellow', '6.03 months against a 7.6 month target');
  assert.equal(s.sheet.netWorth.value, 157600, 'the $900 is still owed on the balance sheet');
  const rung = fooLadder(spine, R, s).rungs.find((r) => r.id === 'highInterest');
  assert.equal(rung.need, 0);
  const cards = windfall(spine, R, s, { amount: 5000 }).steps.find((x) => x.id === 'cards');
  assert.equal(cards.need, 0, 'no card is charging interest');
});

test('the same card paid by the minimum still counts its payment and its interest', () => {
  const spine = wes('minimum');
  const cf = cashflow(spine, R, '2026-10');
  assert.equal(cf.debtMinimums.total.value, 35);
  near(cf.surplus.value, 930.93);
  const nov = debtSchedule(spine, R, AS_OF, '2026-11').months.get('2026-11');
  near(nov.interest, 16.49, 0.01, 'a month of interest at 21.99% on $900');
  assert.ok(nov.payments.every((p) => !p.inFull), 'paid by the minimum: nothing in full');
  assert.deepEqual(order(spine, 'avalanche', AS_OF), ['visa']);
  assert.equal(cashsim(spine, R, { months: 1 }).model.cards[0].revolving, true);
  // Switching the one setting is all it takes.
  const full = putFact(spine, 'debts.visa.payPolicy', 'statement', 'known', AS_OF);
  assert.equal(minimumsTotal(full, R, '2026-10-01').total.value, 0);
});
