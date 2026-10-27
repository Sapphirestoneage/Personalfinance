// The Debt tab (S-205): every reading comes from the one run and the debt
// engine; a missing input or rule is a missing row, never a number.

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadHousehold } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';
import { validate } from '../engine/schema.js';
import { summarize } from '../engine/summary.js';
import { cashsim } from '../engine/cashsim.js';
import { calendar } from '../engine/calendar.js';
import { milestones } from '../engine/calendar-views.js';
import { makeRules } from '../engine/rules.js';
import { putFact } from '../engine/edits.js';
import { debtView, minimumTrap, utilizationAtReport, feeRoi, signupBonus, idr, solvePayoff, whichCard, balanceTransfer, gantt, orderList, interestTimeline, clearDates } from '../engine/debtview.js';
import { readJson, loadRules } from './spine-helpers.js';

const R = loadRules();
const demo = () => applyDefaults(loadHousehold(readJson('fixtures/demo.json')), R);
const T = '2026-10-22';

test('the Debt tab reads one run: clear dates, a Gantt bar per debt, the order, the interest stack', () => {
  const s = demo();
  const sim = cashsim(s, R, { months: 12 });
  const d = debtView(s, R, sim, summarize(s, R, { flags: false }));
  // The lead dates are the Plan's (morning answer 1): high-interest gone, all gone, and the comparison.
  for (const k of ['hiYm', 'allYm', 'everyYm']) assert.match(d.clearDates[k], /^\d{4}-\d{2}$/, k);
  assert.ok(d.clearDates.hiYm <= d.clearDates.allYm && d.clearDates.everyYm <= d.clearDates.allYm);
  assert.deepEqual(d.gantt.rows.map((r) => r.id), ['visa', 'store', 'sl'], 'the zero-balance business card has no bar');
  for (const r of d.gantt.rows) { assert.ok(r.fraction > 0 && r.fraction <= 1); assert.ok(r.startBalance > 0); assert.equal(typeof r.beyond, 'boolean'); }
  assert.ok(d.gantt.ticks.length >= 11, 'a tick per month start inside the window');
  assert.deepEqual(d.order.rows.map((r) => r.position), [1, 2, 3]);
  assert.equal(d.order.rows[0].id, 'store', 'the one ranking: the deferred-interest Store card before its cliff, then the 22% Visa (Krug pass)');
  assert.equal(d.order.strategy, 'avalanche');
  assert.ok(d.order.rows.every((r) => r.planYm), 'every debt has its month on the Plan');
  assert.ok(d.interest.months.length >= 12 && d.interest.debts.some((x) => x.id === 'visa'));
  assert.ok(d.interest.total > 0 && d.interest.max > 0);
  assert.equal(d.cards.length, 3);
  assert.equal(d.loans.length, 1);
});

test('minimum-payment trap: the minimum against a month of interest, and the minimum-only payoff from the monthly plan', () => {
  const s = demo();
  const visa = s.debts.find((d) => d.id === 'visa');
  const t = minimumTrap(s, R, visa, T);
  assert.equal(t.minimumNow, 90);
  assert.equal(t.interestNow, 55);
  assert.equal(t.trapped, false);
  assert.ok(t.months > 12 && t.months < 120, 'paying $90 on $3,000 at 22% takes years, not forever: ' + t.months);
  assert.ok(t.interest > 500, 'and costs real interest: ' + t.interest);
  assert.equal(t.kind, 'computed');
  // Raise the rate until the minimum no longer covers the interest: trapped, never pays off.
  const hot = putFact(s, 'debts.visa.apr', 0.40, 'known', T);
  const t2 = minimumTrap(hot, R, hot.debts.find((d) => d.id === 'visa'), T);
  assert.equal(t2.interestNow, 100);
  assert.equal(t2.trapped, true);
  assert.equal(t2.neverPaysOff, true);
  assert.equal(t2.months, null);
  // A missing balance is a missing row.
  const gone = putFact(s, 'debts.visa.balance', null, 'missing', T);
  const t3 = minimumTrap(gone, R, gone.debts.find((d) => d.id === 'visa'), T);
  assert.equal(t3.kind, 'missing');
  assert.ok(t3.missing.includes('debts.visa.balance'));
});

test('utilization at the report day: the peak before each card reports, personal and overall, warned over the red line', () => {
  const s = demo();
  const sim = cashsim(s, R, { months: 3 });
  const u = utilizationAtReport(s, R, sim);
  const store = u.items.find((x) => x.id === 'store');
  assert.ok(store.peak >= 1200 && store.limit === 2000);
  assert.ok(store.util.value >= 0.6);
  assert.equal(store.warn, true, 'the store card is over the 30% line');
  assert.equal(store.reportDayRough, true, 'no report day entered: the statement close day stands in');
  assert.ok(store.util.rough.includes('debts.store.reportDay'));
  const ink = u.items.find((x) => x.id === 'ink');
  assert.equal(ink.reports, false);
  assert.ok(u.personal.value !== null && u.overall.value !== null);
  assert.ok(u.personal.value > u.overall.value, 'the zero-balance business card lowers the overall figure only');
  // Enter a report day: nothing rough about it any more.
  const dated = putFact(s, 'debts.store.reportDay', 25, 'known', T);
  const u2 = utilizationAtReport(dated, R, cashsim(dated, R, { months: 3 }));
  assert.equal(u2.items.find((x) => x.id === 'store').reportDayRough, false);
  assert.equal(u2.items.find((x) => x.id === 'store').reportDay, 25);
});

test('annual fee ROI: nothing without a fee, a missing row without the value, a verdict with both', () => {
  const s = demo();
  assert.equal(feeRoi(s.debts.find((d) => d.id === 'visa')), null);
  let s2 = putFact(s, 'debts.visa.annualFee', 95, 'known', T);
  const r1 = feeRoi(s2.debts.find((d) => d.id === 'visa'));
  assert.equal(r1.kind, 'missing');
  assert.ok(r1.missing.includes('debts.visa.annualValue'));
  assert.equal(r1.net, null);
  s2 = putFact(s2, 'debts.visa.annualValue', 150, 'known', T);
  const r2 = feeRoi(s2.debts.find((d) => d.id === 'visa'));
  assert.equal(r2.net, 55);
  assert.equal(r2.verdict, 'pays for itself');
  s2 = putFact(s2, 'debts.visa.annualValue', 40, 'known', T);
  assert.equal(feeRoi(s2.debts.find((d) => d.id === 'visa')).verdict, 'costs more than it gives back');
});

test('signup bonus: what is left, the days, the pace needed; the deadline lands on the calendar and the milestones', () => {
  let s = demo();
  s = putFact(s, 'debts.ink.bonusSpend', 3000, 'known', T);
  s = putFact(s, 'debts.ink.bonusBy', '2026-12-21', 'known', T);
  s = putFact(s, 'debts.ink.bonusSpent', 1000, 'known', T);
  s = putFact(s, 'debts.ink.bonusValue', 750, 'known', T);
  const sim = cashsim(s, R, { months: 3 });
  const b = signupBonus(s.debts.find((d) => d.id === 'ink'), sim, T);
  assert.equal(b.left, 2000);
  assert.equal(b.daysLeft, 60);
  assert.equal(b.perDayNeeded, 33.33);
  assert.equal(b.done, false);
  assert.equal(b.missed, false);
  assert.equal(b.value, 750);
  assert.equal(b.kind, 'computed');
  const c = calendar(s, R, { from: '2026-12', months: 1 });
  const ev = c.months[0].events.find((e) => e.kind === 'bonusBy');
  assert.ok(ev && ev.date === '2026-12-21' && ev.counted === false, 'the deadline is a dated marker, not money');
  assert.ok(milestones(s, R, sim, c.months).some((m) => m.kind === 'bonusBy'));
  // Spent only is missing: left is a missing row.
  const half = putFact(s, 'debts.ink.bonusSpent', null, 'missing', T);
  assert.equal(signupBonus(half.debts.find((d) => d.id === 'ink'), sim, T).kind, 'missing');
});

test('income-driven repayment from the rules registry; a missing household size or rule is a missing row', () => {
  const s = demo();
  const sum = summarize(s, R, { flags: false });
  const sl = s.debts.find((d) => d.id === 'sl');
  const r0 = idr(s, R, sl, sum, T);
  assert.equal(r0.payment, null);
  assert.ok(r0.missing.includes('household.householdSize'));
  const sized = putFact(s, 'household.householdSize', 1, 'known', T);
  const r1 = idr(sized, R, sized.debts.find((d) => d.id === 'sl'), sum, T);
  assert.equal(r1.povertyLine, R.get('POVERTY_LINE_1', 2026));
  assert.equal(r1.agiSource, 'tax');
  const expect = Math.round(R.get('IDR_PAYMENT_SHARE', 2026) * Math.max(0, r1.agi - R.get('IDR_POVERTY_MULTIPLE', 2026) * r1.povertyLine) / 12 * 100) / 100;
  assert.equal(r1.payment, expect);
  assert.equal(r1.forgivenessYears, 20);
  assert.equal(r1.forgivenessDate, '2046-10-22');
  assert.equal(r1.pslf, null);
  assert.ok(r1.rules.includes('POVERTY_LINE_1') && r1.rules.includes('IDR_PAYMENT_SHARE'));
  // Public service: 120 payments from today.
  const ps = putFact(sized, 'debts.sl.pslf', true, 'known', T);
  const r2 = idr(ps, R, ps.debts.find((d) => d.id === 'sl'), sum, T);
  assert.deepEqual(r2.pslf, { payments: 120, date: '2036-10-22' });
  // A registry without the poverty line: a missing row that names the rule.
  const reg = readJson('data/rules-2026.json');
  const thin = makeRules({ ...reg, rules: reg.rules.filter((x) => x.id !== 'POVERTY_LINE_1') });
  const r3 = idr(sized, thin, sized.debts.find((d) => d.id === 'sl'), sum, T);
  assert.equal(r3.payment, null);
  assert.deepEqual(r3.missingRules, ['POVERTY_LINE_1']);
  assert.equal(r3.kind, 'missing');
  assert.ok(r3.missing.includes('rule:POVERTY_LINE_1'));
  // A private loan: not for me.
  const priv = { ...sl, id: 'pl', type: 'private_student_loan', federal: { value: false, kind: 'known', asOf: T, source: 'test' } };
  assert.equal(idr(s, R, priv, sum, T).kind, 'notForMe');
  // Household size validates as an int.
  assert.equal(validate(sized).ok, true);
});

test('the target solver: the smallest extra that clears a card by a date, and whether it breaks cash', () => {
  const s = demo();
  const sim = cashsim(s, R, { months: 12 });
  const x = solvePayoff(s, R, sim, { target: 'visa', byDate: '2027-04-01' });
  assert.ok(x && !x.impossible, 'a $3,000 card can be cleared in five months');
  assert.ok(x.need > 0 && x.need <= 3000, 'need ' + x.need);
  assert.ok(x.date <= '2027-04-01', 'cleared by the date: ' + x.date);
  assert.equal(typeof x.breaksCash, 'boolean');
  // Already on track: a date past the natural clear date needs no more.
  const late = solvePayoff(s, R, sim, { target: 'store', byDate: '2030-01-01' });
  assert.ok(late.already || late.need >= 0);
  // A date before tomorrow cannot be met.
  const no = solvePayoff(s, R, sim, { target: 'sl', byDate: '2026-10-23' });
  assert.equal(no.impossible, true);
  assert.equal(solvePayoff(s, R, sim, { target: 'nope', byDate: '2027-01-01' }), null);
});

test('which card: rewards minus interest, interest-free days on a card paid in full, the house rate when none is entered', () => {
  const s = demo();
  const sim = cashsim(s, R, { months: 2 });
  // The Ink is a business card, so this is a business purchase (morning answer 8); an ordinary one leaves it out.
  const w = whichCard(s, R, sim, { amount: 100, business: true });
  assert.equal(w.rows.length, 3);
  assert.equal(w.best, 'ink', 'the card with no balance carries no interest and wins');
  const ink = w.rows.find((r) => r.id === 'ink');
  assert.equal(ink.rewards, 1, '1% house default');
  assert.equal(ink.interest, 0);
  assert.ok(ink.interestFreeDays > 0, 'float days until its next due date');
  assert.ok(w.rough.includes('debts.ink.rewardsRate'), 'the default rate is rough');
  const visa = w.rows.find((r) => r.id === 'visa');
  assert.ok(visa.interest > 0 && visa.revolving === true);
  // A card's own rate wins and is known.
  const rich = putFact(s, 'debts.ink.rewardsRate', 0.02, 'known', T);
  const w2 = whichCard(rich, R, cashsim(rich, R, { months: 2 }), { amount: 100, business: true });
  assert.equal(w2.rows.find((r) => r.id === 'ink').rewards, 2);
  assert.ok(!w2.rough.includes('debts.ink.rewardsRate'));
  assert.equal(whichCard(s, R, sim, { amount: null }).rows.length, 0);
});

test('balance transfer: the fee against the interest skipped, house defaults unless the offer is typed', () => {
  const s = demo();
  const b = balanceTransfer(s, R, { cardId: 'visa' }, T);
  assert.equal(b.fee, 90, '3% of $3,000');
  assert.equal(b.promoMonths, 18);
  assert.ok(b.interestSkipped > b.fee, 'at 22% the interest skipped beats the fee');
  assert.equal(b.worthIt, true);
  assert.ok(b.rules.includes('BT_FEE_SHARE') && b.rules.includes('BT_PROMO_MONTHS'));
  const own = balanceTransfer(s, R, { cardId: 'visa', feeShare: 0.05, promoMonths: 12 }, T);
  assert.equal(own.fee, 150);
  assert.equal(own.promoMonths, 12);
  assert.ok(!own.rules.includes('BT_FEE_SHARE'));
  assert.equal(balanceTransfer(s, R, { cardId: 'nope' }), null);
});

test('card tiles carry the billing cycle, why it is stuck and the trap; the everyday card and a clear card are not stuck', () => {
  const s = demo();
  const sim = cashsim(s, R, { months: 6 });
  const d = debtView(s, R, sim, null);
  const visa = d.cards.find((c) => c.id === 'visa');
  assert.ok(visa.cycle.nextClose && visa.cycle.nextDue && visa.cycle.nextDue > visa.cycle.nextClose, 'the next statement closes, then is due');
  assert.equal(visa.cycle.dueDay, 12);
  assert.equal(visa.cycle.closeRough, true, 'no close day entered: a house guess');
  assert.ok(visa.why && typeof visa.why.code === 'string');
  assert.ok(visa.trap && visa.trap.minimumNow === 90);
  const ink = d.cards.find((c) => c.id === 'ink');
  assert.equal(ink.why, null, 'nothing owed: nothing to be stuck on');
  assert.equal(ink.trap, null);
  assert.equal(clearDates(sim).rows.length, 4);
  assert.equal(gantt(sim).rows.length, 3);
  assert.ok(orderList(s, R, sim).rows.length === 3 && interestTimeline(sim).months.length >= 6);
});

// Answer 38 (S-226): a card set to pay its statement never carries a balance and never accrues interest, in the run,
// the Debt tab and the cash flow's debt schedule alike.
test('a card that pays its statement: no interest in the run, the Debt tab or the cash flow schedule', async () => {
  const { debtSchedule, payoffPlan } = await import('../engine/debt.js');
  const s = putFact(demo(), 'debts.visa.payPolicy', 'statement', 'known', T);
  const sim = cashsim(s, R, { months: 12 });
  assert.equal(sim.cards.visa.interest, 0, 'the run');
  assert.equal(sim.cards.visa.revolving, false);
  const d = debtView(s, R, sim, summarize(s, R, { flags: false }));
  // Paid in full each month (answer 38): not a debt to pay down, so no payoff order row, no bar and no minimum trap.
  assert.equal(d.order.rows.find((r) => r.id === 'visa'), undefined, 'the Debt tab: not in the payoff order');
  assert.equal(d.gantt.rows.find((r) => r.id === 'visa'), undefined, 'no payoff bar');
  assert.equal(d.interest.debts.find((x) => x.id === 'visa') ? d.interest.debts.find((x) => x.id === 'visa').total : 0, 0, 'no interest stack');
  // The cash flow's months ahead: the statement is the balance, paid in full, with no month of interest on it.
  const sched = debtSchedule(s, R, T, '2027-01');
  const nov = sched.months.get('2026-11').payments.find((x) => x.id === 'visa');
  assert.equal(nov.amount, 3000, 'the whole $3,000 balance, no interest added');
  assert.equal(sched.months.get('2026-12').payments.some((x) => x.id === 'visa'), false, 'nothing carried after');
  assert.equal(payoffPlan(s, R, { asOf: T }).debts.find((x) => x.id === 'visa').interest, 0);
  // Paid by the minimum, the same card carries its balance and pays interest.
  const carried = payoffPlan(demo(), R, { asOf: T }).debts.find((x) => x.id === 'visa');
  assert.ok(carried.interest > 0);
});

test('one extra at the debt: the Plan\'s step amount, the same in the debt view and the calendar chip (Calendar audit)', async () => {
  const { planDebtExtra, fooGhosts, fooLadder } = await import('../engine/plan.js');
  const s = demo(), S = summarize(s, R, { flags: false });
  const x = planDebtExtra(s, R, S);
  const sim = cashsim(s, R, { months: 12 });
  const d = debtView(s, R, sim, S);
  // The order runs on the Plan's extra month by month (morning answer 1): this month, the step's amount.
  assert.equal(Math.round(d.order.extra(1)), x.amount);
  const f = fooLadder(s, R, S);
  if (['highInterest', 'lowInterest'].includes(f.current)) assert.equal(fooGhosts(s, R, S, [s.meta.asOf.slice(0, 7)])[0].amount, x.amount);
});

test('Which card: a business card only for a purchase marked business (morning answer 8)', () => {
  const s = demo(), sim = cashsim(s, R, { months: 12 });
  const plain = whichCard(s, R, sim, { amount: 100 });
  assert.ok(!plain.rows.some((r) => r.id === 'ink'), 'the business Ink card is left out of an ordinary purchase');
  assert.ok(plain.left.length === 1 && plain.best !== 'ink');
  const biz = whichCard(s, R, sim, { amount: 100, business: true });
  assert.ok(biz.rows.some((r) => r.id === 'ink'));
  assert.deepEqual(biz.left, []);
});
