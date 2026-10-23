// Unit tests for the Phase 1 engines on tiny hand-worked households.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fact, setAt } from '../engine/spine.js';
import { money } from '../src/ui/format.js';
import { validate } from '../engine/schema.js';
import { monthlyAmount, paidBetween, cashflow } from '../engine/cashflow.js';
import { computeTax, taxForYear, nextEstimatedDate } from '../engine/tax.js';
import { minimumPayment, rateOn, debtSchedule, utilization, creditScoreNote, promoDeadlines, order, payoffPlan, paymentsBefore } from '../engine/debt.js';
import { balanceSheet } from '../engine/networth.js';
import { emergency } from '../engine/emergency.js';
import { fiReport, yearsToTarget } from '../engine/fi.js';
import { project } from '../engine/projection.js';
import { buildFlags, goal, stageFor } from '../engine/flags.js';
import { summarize } from '../engine/summary.js';
import { loadRules } from './spine-helpers.js';

const R = loadRules();
const K = (x) => fact(x, { kind: 'known', asOf: '2026-10-22', source: 'test' });
const RO = (x) => fact(x, { kind: 'rough', asOf: '2026-10-22', source: 'test' });
const M = () => fact(null, { asOf: '2026-10-22', source: 'test' });
const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, a + ' is not ' + b);
// En and em dashes, built from char codes so this file holds neither.
const DASHES = new RegExp("[" + String.fromCharCode(0x2013, 0x2014) + "]");

// A one-person household; pass pieces to replace.
function mini(over = {}) {
  const s = {
    schema: 'slam-spine/1',
    meta: { name: 'Test', asOf: '2026-10-22', demo: true },
    household: {
      people: [{ id: 'p', name: 'Pat', birthDate: K('1996-01-01') }],
      filingStatus: K('single'), state: K('NY'), county: K('Albany'), nycResident: K(false),
      situation: [{ id: 'now', from: null, value: K('employed') }],
      healthCoverage: [{ id: 'now', from: null, value: K('employer') }]
    },
    income: [], expenses: [], accounts: [], debts: [], goals: [],
    assumptions: { inflation: K(0.03), realReturn: K(0.05), withdrawalRate: K(0.04), lifeExpectancy: K(90) },
    taxYears: [{ id: '2026', year: 2026, estimatedPaidFederal: K(0), estimatedPaidState: K(0) }],
    ...over
  };
  const r = validate(s);
  assert.ok(r.ok, r.errors.map((e) => e.path + ' ' + e.message).join('\n'));
  return s;
}
const stream = (id, type, amount, cadence, o = {}) => ({ id, type, label: o.label || id, personId: 'p', amount: o.kind === 'missing' ? M() : K(amount), cadence, start: o.start ?? null, end: o.end ?? null, withholding: { federal: o.fed === undefined ? K(0) : o.fed === null ? M() : K(o.fed), state: o.st === undefined ? K(0) : o.st === null ? M() : K(o.st) }, ...(o.likelihood !== undefined ? { likelihood: RO(o.likelihood) } : {}) });
const expense = (id, amount, o = {}) => ({ id, label: id, amount: K(amount), cadence: o.cadence || 'monthly', start: o.start ?? null, end: o.end ?? null, fixed: null, need: o.need === undefined ? M() : K(o.need), fat: o.fat ?? null });
const card = (id, balance, o = {}) => ({ id, family: 'debt', type: 'credit_card', name: K(id), balance: K(balance), apr: o.apr === null ? M() : K(o.apr ?? 0.2), limit: o.limit === null ? M() : K(o.limit ?? 5000), minimum: o.min === undefined ? M() : K(o.min), ...(o.promoEnds ? { promoApr: K(0), promoEnds: K(o.promoEnds), deferredInterest: K(o.deferred ?? false) } : {}), ...(o.stress ? { stress: K(o.stress) } : {}), business: K(o.business ?? false), reportsToPersonalCredit: o.reports === null ? M() : K(o.reports ?? !(o.business ?? false)) });

// ------------------------------------------------------------------ cashflow
test('cashflow: a weekly stream is a rate; partial months prorate by day', () => {
  near(monthlyAmount(700, 'weekly', null, null, '2026-10'), 700 * 52 / 12);
  near(monthlyAmount(1200, 'monthly', '2026-10-16', null, '2026-10'), 1200 * 16 / 31);
  assert.equal(monthlyAmount(1200, 'monthly', '2026-11-01', null, '2026-10'), 0);
  near(monthlyAmount(6000, 'total', '2026-01-01', '2026-06-30', '2026-03'), 6000 * 31 / 181);
  assert.equal(monthlyAmount(500, 'once', '2026-10-05', null, '2026-10'), 500);
  assert.equal(monthlyAmount(null, 'monthly', null, null, '2026-10'), null);
});

test('cashflow: weekly pay dates are counted for a year total (26 weeks = 26 payments)', () => {
  assert.equal(paidBetween(500, 'weekly', '2026-07-01', '2026-12-23', '2026-01-01', '2026-12-31'), 500 * 26);
  assert.equal(paidBetween(500, 'weekly', '2026-07-01', '2026-12-23', '2027-01-01', '2027-12-31'), 0);
  near(paidBetween(1000, 'monthly', '2026-01-01', null, '2026-01-01', '2026-12-31'), 12000);
});

test('cashflow: gross, take-home with FICA and payroll saving, surplus and both savings rates', () => {
  const s = mini({
    income: [stream('job', 'w2', 5000, 'monthly', { fed: 500, st: 200 })],
    expenses: [expense('rent', 2000, { fat: 'accommodation' }), expense('food', 500, { fat: 'food' }), expense('fun', 300)],
    accounts: [
      { id: 'k', family: 'employerRetirement', type: 'k401', name: K('401k'), balance: K(1000), monthlyContribution: K(400) },
      { id: 'r', family: 'ira', type: 'roth_ira', name: K('Roth'), balance: K(1000), monthlyContribution: K(100) }
    ],
    debts: [{ id: 'l', family: 'debt', type: 'auto_loan', name: K('Car'), balance: K(5000), apr: K(0.05), minimum: K(250) }]
  });
  const c = cashflow(s, R, '2026-10');
  assert.equal(c.income.gross.value, 5000);
  near(c.income.fica.value, 5000 * 0.0765);
  near(c.income.takeHome.value, 5000 - 700 - 382.5 - 400);
  assert.equal(c.expenses.total.value, 2800);
  assert.equal(c.expenses.fat.value, 2500);
  assert.equal(c.debtMinimums.total.value, 250);
  near(c.surplus.value, 3517.5 - 2800 - 250 - 100);
  near(c.savingsRate.gross.value, (367.5 + 400 + 100) / 5000);
  near(c.savingsRate.net.value, (367.5 + 100) / 3517.5);
  assert.equal(c.surplus.kind, 'computed');
  assert.ok(c.income.fica.rules.includes('FICA_SS_RATE'));
});

test('cashflow: dated changes month by month (income ends, an expense starts)', () => {
  const s = mini({
    income: [stream('ui', 'unemployment', 1000, 'monthly', { end: '2026-12-31' }), stream('gig', '1099', 3000, 'monthly', { start: '2027-01-01' })],
    expenses: [expense('rent', 1000), expense('health', 800, { start: '2027-03-01' })]
  });
  assert.equal(cashflow(s, R, '2026-12').income.gross.value, 1000);
  assert.equal(cashflow(s, R, '2027-01').income.gross.value, 3000);
  assert.equal(cashflow(s, R, '2027-02').expenses.total.value, 1000);
  assert.equal(cashflow(s, R, '2027-03').expenses.total.value, 1800);
});

test('cashflow: maybe money counts only in expected mode, weighted', () => {
  const s = mini({ income: [stream('job', '1099', 1000, 'monthly'), stream('maybe', 'maybeMoney', 1000, 'monthly', { likelihood: 0.5 })] });
  assert.equal(cashflow(s, R, '2026-10').income.gross.value, 1000);
  assert.equal(cashflow(s, R, '2026-10', { mode: 'expected' }).income.gross.value, 1500);
});

test('cashflow: a missing withholding leaves take-home incomplete and names it', () => {
  const s = mini({ income: [stream('ui', 'unemployment', 1000, 'monthly', { st: null })] });
  const c = cashflow(s, R, '2026-10');
  assert.equal(c.income.takeHome.value, 1000);
  assert.equal(c.income.takeHome.kind, 'incomplete');
  assert.deepEqual(c.income.takeHome.missing, ['income.ui.withholding.state']);
});

// ------------------------------------------------------------------ tax
const T = (o) => computeTax({ filingStatus: 'single', state: 'NY', wages: 0, seNet: 0, unemployment: 0, otherOrdinary: 0, conversions: 0, ltcg: 0, qualifiedDividends: 0, withheldFederal: 0, withheldState: 0, ...o }, R, 2026).lines;

test('tax: W-2 wages through the 2026 single brackets and the standard deduction', () => {
  const l = T({ wages: 60000, ficaWages: 60000 });
  assert.equal(l.taxable.value, 60000 - 16100);
  near(l.federalIncomeTax.value, 1240 + (43900 - 12400) * 0.12);
  near(l.fica.value, 60000 * 0.0765);
  assert.equal(l.seTax.value, 0);
  assert.equal(l.marginalFederal.value, 0.12);
  assert.ok(l.standardDeduction.rules.includes('STD_S'));
});

test('tax: SE tax is net x 0.9235 x 15.3% and half of it is deductible', () => {
  const l = T({ seNet: 40000 });
  near(l.seTax.value, 40000 * 0.9235 * 0.153);
  near(l.seDeduction.value, 40000 * 0.9235 * 0.153 / 2);
  near(l.agi.value, 40000 - 40000 * 0.9235 * 0.153 / 2);
  assert.ok(l.seTax.rules.includes('SE_FACTOR'));
});

test('tax: SE earnings under the floor pay no SE tax', () => {
  assert.equal(T({ seNet: 400 }).seTax.value, 0);
});

test('tax: unemployment is taxable with no SE tax and no FICA', () => {
  const l = T({ unemployment: 20000 });
  assert.equal(l.seTax.value, 0);
  assert.equal(l.fica.value, 0);
  near(l.federalIncomeTax.value, (20000 - 16100) * 0.10);
});

test('tax: long-term gains stack on top of ordinary income across the 0% line', () => {
  // Ordinary taxable 40,000; gains 20,000; 0% top 49,450: 9,450 at 0%, 10,550 at 15%.
  const l = T({ wages: 56100, ficaWages: 56100, ltcg: 20000 });
  assert.equal(l.taxable.value, 60000);
  near(l.gainsTax.value, 10550 * 0.15);
  near(l.ordinaryTax.value, 1240 + 27600 * 0.12);
});

test('tax: a Roth conversion is ordinary income', () => {
  const a = T({ conversions: 30000 });
  near(a.federalIncomeTax.value, 1240 + (13900 - 12400) * 0.12);
});

test('tax: New York State tax on NY AGI less the NY standard deduction', () => {
  const l = T({ wages: 50000, ficaWages: 50000 });
  near(l.stateTaxable.value, 42000);
  near(l.stateTax.value, 8500 * 0.039 + 3200 * 0.044 + 2200 * 0.0515 + (42000 - 13900) * 0.054);
  assert.ok(l.stateTax.rules.includes('NY_BRK_S'));
});

test('tax: owed, withheld, balance due, marginal and effective rates', () => {
  const l = T({ wages: 50000, ficaWages: 50000, withheldFederal: 3000, withheldState: 2000, estimatedFederal: 100 });
  near(l.balanceDue.value, l.total.value - 5100);
  near(l.marginal.value, 0.12 + 0.054);
  near(l.effective.value, l.total.value / 50000);
});

test('tax: the next estimated payment date', () => {
  assert.equal(nextEstimatedDate('2026-10-22', R).date, '2027-01-15');
  assert.equal(nextEstimatedDate('2026-10-22', R).taxYear, 2026);
  assert.equal(nextEstimatedDate('2027-01-16', R).date, '2027-04-15');
  assert.equal(nextEstimatedDate('2026-06-15', R).date, '2026-06-15');
});

test('tax: a missing W-2 amount gives no number and says what is missing', () => {
  const s = mini({ income: [stream('job', 'w2', null, 'total', { kind: 'missing', start: '2026-01-01', end: '2026-06-30', fed: null, st: null })] });
  const t = taxForYear(s, R, 2026);
  assert.equal(t.owed.value, null);
  assert.equal(t.balanceDue.value, null);
  assert.equal(t.missingText, 'missing: 2026 W-2 wages and withholding');
  assert.ok(t.balanceDue.missing.includes('income.job.amount'));
});

test('tax: a year from the spine, with withholding and a 1099', () => {
  const s = mini({ income: [stream('job', 'w2', 4000, 'monthly', { fed: 300, st: 150 }), stream('gig', '1099', 500, 'monthly')] });
  const t = taxForYear(s, R, 2026);
  const l = T({ wages: 48000, ficaWages: 48000, seNet: 6000, withheldFederal: 3600, withheldState: 1800 });
  near(t.balanceDue.value, l.balanceDue.value);
  assert.equal(t.balanceDue.kind, 'computed');
  assert.equal(t.missingText, null);
});

// ------------------------------------------------------------------ debt
test('debt: a known minimum is used; a card with none gets a rough estimate', () => {
  const known = minimumPayment(card('a', 1000, { min: 40 }), R, '2026-11-01');
  assert.equal(known.value, 40);
  const est = minimumPayment(card('b', 2000, { apr: 0.24 }), R, '2026-11-01');
  near(est.value, 2000 * 0.01 + 2000 * 0.24 / 12);
  assert.equal(est.estimated, true);
  assert.ok(est.rough.includes('debts.b.minimum'));
  assert.equal(minimumPayment(card('c', 300, { apr: 0 }), R, '2026-11-01').value, 40, 'floor');
  assert.equal(minimumPayment(card('d', 10, { apr: 0 }), R, '2026-11-01').value, 10, 'never above the balance');
});

test('debt: utilization per card, personal (cards reporting to personal credit) and overall', () => {
  const s1 = mini({ debts: [card('p1', 1000, { limit: 2000 }), card('p2', 500, { limit: 3000 }), card('biz', 4000, { limit: 5000, business: true })] });
  const u = utilization(s1);
  assert.equal(u.items[0].util.value, 0.5);
  assert.equal(u.items[2].util.value, 0.8);
  assert.equal(u.items[2].reports, false, 'a business card defaults to not reporting');
  assert.equal(u.personal.value, 1500 / 5000);
  assert.deepEqual([u.personal.balance, u.personal.limit], [1500, 5000]);
  assert.equal(u.overall.value, 5500 / 10000);
});

test('debt: a missing limit or reporting answer leaves that total null and names the field', () => {
  const s1 = mini({ debts: [card('a', 1000, { limit: 2000 }), card('b', 500, { limit: null })] });
  const u = utilization(s1);
  assert.equal(u.items[1].util.value, null);
  assert.equal(u.personal.value, null);
  assert.equal(u.overall.value, null);
  assert.deepEqual(u.overall.missing, ['debts.b.limit']);
  const s2 = mini({ debts: [card('a', 1000, { limit: 2000 }), card('c', 0, { limit: 1000, reports: null })] });
  const u2 = utilization(s2);
  assert.equal(u2.personal.value, null);
  assert.deepEqual(u2.personal.missing, ['debts.c.reportsToPersonalCredit']);
  assert.equal(u2.overall.value, 1000 / 3000, 'overall does not need the reporting answer');
});

test('debt: the credit score note lists personal cards over 30% and pays off the smallest', () => {
  const s1 = mini({ debts: [card('big', 900, { limit: 1000 }), card('small', 400, { limit: 1000 }), card('low', 100, { limit: 4000 }), card('biz', 5000, { limit: 5000, business: true })] });
  const n = creditScoreNote(s1, R, '2026-10-22');
  assert.deepEqual(n.cards.map((c) => c.id), ['big', 'small'], 'highest first; business card not listed');
  assert.equal(n.smallest.id, 'small');
  near(n.personalAfter.value, (1400 - 400) / 6000);
  const none = creditScoreNote(mini({ debts: [card('low', 100, { limit: 4000 })] }), R, '2026-10-22');
  assert.deepEqual([none.cards, none.smallest, none.personalAfter.value], [[], null, null]);
});

test('debt: promo deadlines, payments left and the monthly amount', () => {
  assert.equal(paymentsBefore('2026-10-22', '2027-05-31'), 7);
  const s = mini({ debts: [card('a', 7000, { promoEnds: '2027-05-31' }), card('b', 700, { promoEnds: '2027-05-31' }), card('c', 100)] });
  const p = promoDeadlines(s, '2026-10-22');
  assert.equal(p.total.value, 7700);
  near(p.monthly.value, 1100);
  assert.equal(p.items.length, 2);
});

test('debt: avalanche, snowball and stress orders', () => {
  const s = mini({ debts: [card('lo', 500, { apr: 0.1, stress: 9 }), card('hi', 3000, { apr: 0.25, stress: 2 }), card('promo', 100, { promoEnds: '2027-05-31', apr: 0.3, stress: 5 })] });
  assert.deepEqual(order(s, 'avalanche', '2026-10-22'), ['hi', 'lo', 'promo']);
  assert.deepEqual(order(s, 'snowball', '2026-10-22'), ['promo', 'lo', 'hi']);
  assert.deepEqual(order(s, 'stress', '2026-10-22'), ['lo', 'promo', 'hi']);
});

test('debt: payoff dates and interest for a single loan', () => {
  const s = mini({ debts: [{ id: 'l', family: 'debt', type: 'personal_loan', name: K('Loan'), balance: K(1200), apr: K(0.12), minimum: K(100) }] });
  const p = payoffPlan(s, R, { strategy: 'avalanche', asOf: '2026-10-22' });
  // 1% a month on a falling balance: 13 payments.
  assert.equal(p.months, 13);
  assert.equal(p.debts[0].payoffYm, '2027-11');
  assert.ok(p.totalInterest.value > 80 && p.totalInterest.value < 90);
  const fast = payoffPlan(s, R, { strategy: 'avalanche', asOf: '2026-10-22', extra: 500 });
  assert.equal(fast.months, 3);
});

test('debt: a deferred-interest promo left unpaid charges interest from the start', () => {
  const s = mini({ debts: [card('d', 1200, { promoEnds: '2026-12-31', deferred: true, apr: 0.3, min: 50 })] });
  const p = payoffPlan(s, R, { asOf: '2026-10-22' });
  // 2 promo payments, then 1,200 x 30% x 2 / 12 = 60 at once, plus ordinary interest.
  assert.ok(p.totalInterest.value > 60);
});

// ------------------------------------------------------------------ balance sheet, emergency, FI
function household() {
  return mini({
    household: { ...mini().household, people: [{ id: 'p', name: 'Pat', birthDate: K('1991-06-01') }] },
    income: [stream('job', 'w2', 6000, 'monthly', { fed: 600, st: 300 })],
    expenses: [expense('rent', 1500, { fat: 'accommodation' }), expense('food', 500, { fat: 'food' }), expense('fun', 500)],
    accounts: [
      { id: 'c', family: 'cash', type: 'checking', name: K('Checking'), balance: K(5000) },
      { id: 'r', family: 'ira', type: 'roth_ira', name: K('Roth'), balance: K(20000), contributions: K([{ year: 2020, amount: 6000 }, { year: 2021, amount: 6000 }]), conversions: K([{ year: 2025, amount: 4000, taxable: 4000 }]) },
      { id: 'b', family: 'taxable', type: 'brokerage', name: K('Brokerage'), balance: K(30000) },
      { id: 'h', family: 'otherAssets', type: 'car', name: K('Car'), balance: RO(9000) }
    ],
    debts: [card('v', 1000, { apr: 0.2, min: 100, limit: 5000 })],
    goals: [{ id: 'fi', type: 'fi', label: 'FI', annualSpending: K(36000) }]
  });
}

test('balance sheet: cash, invested, assets, debts, net worth', () => {
  const b = balanceSheet(household());
  assert.equal(b.cash.value, 5000);
  assert.equal(b.invested.value, 50000);
  assert.equal(b.assets.value, 64000);
  assert.equal(b.debts.value, 1000);
  assert.equal(b.netWorth.value, 63000);
  assert.equal(b.netWorth.kind, 'rough', 'the car value is rough');
});

test('emergency: Rule of 5, runway tiers and the Roth backstop kept out of cash', () => {
  const s = household();
  const cf = cashflow(s, R, '2026-10');
  const e = emergency(s, R, cf, balanceSheet(s), '2026-10-22');
  assert.equal(e.age, 35);
  assert.equal(e.targetMonths.value, 7);
  near(e.tiers.full.runway.value, 5000 / 2600);
  near(e.tiers.fatOnly.runway.value, 5000 / 2100);
  assert.equal(e.targetDollars.value, 7 * 2600);
  assert.equal(e.backstop.contributions.value, 12000);
  assert.equal(e.backstop.conversions[0].clockOpens, '2030-01-01');
  assert.equal(e.backstop.conversions[0].penaltyRate, 0.1);
  assert.equal(e.backstop.countedAsCash, false);
});

test('FI: goal spending / rate, percent, implied, lean, coast and years', () => {
  const s = household();
  const cf = cashflow(s, R, '2026-10');
  const f = fiReport(s, R, cf, balanceSheet(s), '2026-10-22');
  assert.equal(f.fiNumber.value, 900000);
  assert.equal(f.goalSource, 'spending');
  near(f.fiPercent.value, 50000 / 900000);
  assert.equal(f.implied.value, 2500 * 12 / 0.04);
  assert.equal(f.goalBelowImplied.value, false);
  assert.equal(f.leanFi.value, 2000 * 12 / 0.04, 'lean uses the same withdrawal rate');
  near(f.coastFi.value, 900000 / Math.pow(1.05, 65 - 35), 0.05);
  assert.ok(f.coastFi.rough.includes('assumptions.coastAge'), 'default coast age is rough');
  assert.ok(f.yearsToFi.value > 10 && f.yearsToFi.value < 30);
});

test('FI: years to a target, closed form', () => {
  assert.equal(yearsToTarget(100, 0, 50, 0.05), 0);
  near(yearsToTarget(0, 1000, 10000, 0), 10);
  near(yearsToTarget(1000, 0, 2000, 0.05), Math.log(2) / Math.log(1.05));
  assert.equal(yearsToTarget(100, -50, 1000, 0.05), null);
});

test('FI: a direct FI number goal wins over goal spending', () => {
  const s = household();
  s.goals[0].fiNumber = K(500000);
  const f = fiReport(s, R, cashflow(s, R, '2026-10'), balanceSheet(s), '2026-10-22');
  assert.equal(f.fiNumber.value, 500000);
  assert.equal(f.goalBelowImplied.value, true);
});

// ------------------------------------------------------------------ projection
test('projection: monthly for 24 months, then yearly to life expectancy, with dated changes', () => {
  const s = mini({
    income: [stream('ui', 'unemployment', 3000, 'monthly', { end: '2026-12-31' }), stream('gig', '1099', 4000, 'monthly', { start: '2027-01-01' })],
    expenses: [expense('rent', 2000), expense('health', 500, { start: '2027-06-01' })],
    accounts: [{ id: 'c', family: 'cash', type: 'checking', name: K('Checking'), balance: K(1000) }],
    debts: [{ id: 'car', family: 'debt', type: 'auto_loan', name: K('Car'), balance: K(1000), apr: K(0), minimum: K(500), payoffDate: K('2026-12-31') }]
  });
  const p = project(s, R, { mode: 'committed' });
  assert.equal(p.months.length, 24);
  assert.equal(p.months[0].ym, '2026-11');
  assert.equal(p.months[0].gross, 3000);
  assert.equal(p.months[2].gross, 4000);
  assert.equal(p.months[1].debt, 0, 'car loan paid off in December');
  assert.equal(p.months[2].debtPaid, 0);
  assert.equal(p.months[7].expenses, 2500, 'health cost from June 2027');
  assert.equal(p.years.at(-1).year, 1996 + 90);
  assert.ok(p.events.some((e) => e.kind === 'debtPaidOff' && e.ym === '2026-12'));
  assert.ok(p.events.some((e) => e.kind === 'incomeEnds'));
  assert.ok(p.months[5].tax !== 0, 'April 2027 settles the 2026 tax');
});

test('debt: an intro ending mid-month switches to the rate after it the next day', () => {
  const s = mini({ debts: [card('m', 1200, { promoEnds: '2026-11-15', apr: 0.24, min: 0 })] });
  const p = payoffPlan(s, R, { asOf: '2026-10-22', maxMonths: 1 });
  // November: 15 days at 0%, 15 days at 24%: 1,200 x 12% / 12 = 12.
  near(p.debts[0].interest, 12);
});

test('flags: the promo flag names the rate after the intro and the day it starts', () => {
  const s = household();
  s.accounts[0].balance = K(9000);
  s.debts = [card('p', 700, { promoEnds: '2027-03-31', apr: 0.24, min: 25, limit: 7000 })];
  s.debts[0].apr = RO(0.24);
  const f = summarize(s, R).flags.find((x) => x.id === 'promo-deadlines');
  assert.match(f.detail, /\$700 on p goes to 24% \(rough\) on April 1, 2027 if not paid/);
});

test('debt: an APR marked not for me charges nothing', () => {
  const c = card('n', 100, {});
  c.apr = fact(null, { kind: 'notForMe' });
  assert.equal(rateOn(c, '2026-11-01').rate, 0);
});

test('debt: each minimum lands on its due day, the last day in a short month', () => {
  const c = card('a', 1000, { min: 40 });
  c.dueDay = K(31);
  const s = mini({ debts: [c, { id: 'l', family: 'debt', type: 'auto_loan', name: K('Car'), balance: K(2000), apr: K(0), minimum: K(500), dueDay: K(15) }] });
  const feb = cashflow(s, R, '2027-02').debtMinimums.items;
  assert.deepEqual(feb.map((x) => [x.id, x.dueDate]), [['a', '2027-02-28'], ['l', '2027-02-15']]);
  const p = project(s, R, { mode: 'committed', endYm: '2026-12' });
  assert.deepEqual(p.months[0].payments.map((x) => [x.id, x.date, x.amount]), [['l', '2026-11-15', 500], ['a', '2026-11-30', 40]]);
});

test('schedule: a $2,000 loan at $500 a month ends after 4 payments, in cash flow and the projection', () => {
  const s = mini({ debts: [{ id: 'car', family: 'debt', type: 'auto_loan', name: K('Car'), balance: K(2000), apr: K(0), minimum: K(500), dueDay: K(1) }] });
  const sc = debtSchedule(s, R, '2026-10-22', '2027-04');
  assert.deepEqual([...sc.months.values()].map((m) => m.paid), [500, 500, 500, 500, 0, 0]); // Nov to Apr
  assert.deepEqual(sc.months.get('2027-02').paidOff, ['car']);
  assert.equal(cashflow(s, R, '2027-02').debtMinimums.total.value, 500, 'the fourth payment');
  assert.equal(cashflow(s, R, '2027-03').debtMinimums.total.value, 0, 'no payment once paid off');
  assert.equal(cashflow(s, R, '2026-10').debtMinimums.total.value, 500, 'this month reads today\'s balance');
  const p = project(s, R, { mode: 'committed', endYm: '2027-04' });
  assert.deepEqual(p.months.map((m) => m.debtPaid), [500, 500, 500, 500, 0, 0]);
});

test('schedule: a promo card moves to its rate after the intro and its minimum follows', () => {
  const c = card('p', 6000, { promoEnds: '2026-12-31', apr: 0.24 }); // Dec: 1% = $60; Jan: $60 + $120 interest
  const s = mini({ debts: [c] });
  const sc = debtSchedule(s, R, '2026-10-22', '2027-02');
  assert.equal(sc.months.get('2026-12').interest, 0);
  assert.ok(sc.months.get('2027-01').interest > 0, 'interest after the intro');
  assert.ok(sc.months.get('2027-01').payments[0].amount > sc.months.get('2026-12').payments[0].amount, 'the default minimum includes the new interest');
});

test('tax set-aside: the year\'s balance due, less what is set aside, spread to the return', () => {
  const s = mini({
    income: [stream('job', 'w2', 4000, 'monthly', { fed: 400, st: 150 }), stream('gig', '1099', 1000, 'monthly'), stream('ui', 'unemployment', 1000, 'monthly')],
    accounts: [{ id: 'r', family: 'ira', type: 'roth_ira', name: K('Roth'), balance: K(9000), conversions: K([{ year: 2026, amount: 7000, taxable: 7000 }]) }]
  });
  const c = cashflow(s, R, '2026-10');
  const due = c.taxSetAside.lines[0].base;
  assert.equal(due, summarize(s, R).tax.balanceDue.value);
  assert.deepEqual(c.taxSetAside.lines.map((l) => [l.kind, l.taxYear, l.months]), [['balance', 2026, 7]], 'October 2026 through April 2027');
  near(c.taxSetAside.total.value, due / 7);
  near(c.surplus.value, c.income.takeHome.value - c.expenses.total.value - c.debtMinimums.total.value - c.saving.afterTax.value - c.taxSetAside.total.value);
  // Money already set aside comes off; a refund sets nothing aside.
  near(cashflow(setAt(s, 'taxYears.2026.setAside', K(1000)), R, '2026-10').taxSetAside.total.value, (due - 1000) / 7);
  assert.equal(cashflow(setAt(s, 'income.job.withholding.federal', K(4000)), R, '2026-10').taxSetAside.total.value, 0);
  assert.equal(cashflow(s, R, '2027-05').taxSetAside.lines.filter((l) => l.taxYear === 2026).length, 0, 'done after the return is due');
});

test('tax set-aside: while the year\'s tax cannot be figured, the marginal rate on untaxed income', () => {
  const s = mini({
    income: [stream('job', 'w2', 4000, 'monthly', { fed: null, st: 150 }), stream('gig', '1099', 1000, 'monthly'), stream('ui', 'unemployment', 1000, 'monthly')],
    accounts: [{ id: 'r', family: 'ira', type: 'roth_ira', name: K('Roth'), balance: K(9000), conversions: K([{ year: 2026, amount: 7000, taxable: 7000 }]) }]
  });
  const c = cashflow(s, R, '2026-10');
  const sa = c.taxSetAside;
  const gig = sa.lines.find((l) => l.id === 'gig'), ui = sa.lines.find((l) => l.id === 'ui'), conv = sa.lines.find((l) => l.kind === 'conversion');
  assert.ok(!sa.lines.some((l) => l.id === 'job'), 'a withheld paycheck sets nothing aside');
  near(ui.amount, 1000 * (sa.rate.federal + sa.rate.state));
  near(gig.amount, 1000 * (sa.rate.federal + sa.rate.state + sa.rate.se));
  assert.equal(conv.months, 7, 'October 2026 through April 2027');
  near(conv.amount, 7000 * (sa.rate.federal + sa.rate.state) / 7);
  // Surplus = take-home - expenses - minimums - after-tax saving - tax set-aside.
  near(c.surplus.value, c.income.takeHome.value - c.expenses.total.value - c.debtMinimums.total.value - c.saving.afterTax.value - sa.total.value);
  assert.equal(cashflow(s, R, '2027-05').taxSetAside.lines.filter((l) => l.kind === 'conversion').length, 0, 'done after the return is due');
  assert.notEqual(sa.total.kind, 'computed', 'a floor while the paycheck withholding is missing');
  assert.ok(sa.total.missing.includes('income.job.withholding.federal'));
});

test('needs: missing when nothing is tagged a need; a covered expense counts $0', () => {
  const s = mini({ expenses: [expense('rent', 1000, { fat: 'accommodation' }), expense('food', 400, { fat: 'food', need: true }), expense('out', 200, { fat: 'food', need: false }), expense('phone', 70, { need: true })] });
  s.expenses.find((e) => e.id === 'phone').covered = K(true);
  const c = cashflow(s, R, '2026-10');
  assert.equal(c.expenses.total.value, 1600, 'phone is covered by someone else');
  assert.equal(c.expenses.need.value, 400);
  assert.ok(c.expenses.need.missing.includes('expenses.rent.need'), 'an untagged expense is named');
  assert.equal(c.expenses.lean.value, 1400, 'lean: food and housing that are not wants');
  const none = mini({ expenses: [expense('rent', 1000)] });
  assert.equal(cashflow(none, R, '2026-10').expenses.need.value, null, 'no need tags: missing, not $0');
});

test('years to FI come from the projection; missing when nothing is ever saved', () => {
  const s = household();
  const f = fiReport(s, R, cashflow(s, R, '2026-10'), balanceSheet(s), '2026-10-22');
  assert.ok(f.yearsToFi.value > 0 && f.yearsToFi.value < 60);
  const broke = household();
  broke.income = [];
  const g = fiReport(broke, R, cashflow(broke, R, '2026-10'), balanceSheet(broke), '2026-10-22');
  assert.equal(g.yearsToFi.value, null);
  assert.match(g.yearsToFi.note, /no month with positive saving|does not reach/);
});

test('income cliff: certain income at $0 within 6 months is the first flag', () => {
  const s = mini({
    income: [stream('ui', 'unemployment', 2000, 'monthly', { end: '2027-01-02' }), stream('gig', '1099', 3000, 'monthly', { start: '2027-01-01', likelihood: 0.7 })],
    expenses: [expense('rent', 1500)]
  });
  const sum = summarize(s, R);
  assert.equal(sum.cliff.from, '2027-01-03');
  assert.equal(sum.flags[0].id, 'income-cliff');
  // Costs: the $1,500 of spending plus the 2026 tax still due, set aside until April.
  near(sum.cliff.costs, 1500 + sum.cliff.setAside.value);
  assert.ok(sum.cliff.setAside.value > 0);
  assert.match(sum.flags[0].title, new RegExp('From January 3, 2027, certain income is \\$0 and costs are ' + money(Math.round(sum.cliff.costs)).replace('$', '\\$') + ' a month'));
  near(sum.cliff.likely.value, 2100);
});

test('stages: FI is goal / implied FI; red under 80%, yellow 80% to 100%, green at 100%', () => {
  // $3,100 a month at a 5% withdrawal rate implies $744,000; the goal is $580,000 (78%, red).
  const s = mini({
    income: [stream('job', 'w2', 6000, 'monthly', { fed: 900, st: 300 })],
    expenses: [expense('rent', 3100)],
    goals: [{ id: 'fi', type: 'fi', label: 'FI', fiNumber: K(580000) }],
    assumptions: { inflation: K(0.03), realReturn: K(0.08), withdrawalRate: K(0.05), lifeExpectancy: K(90) }
  });
  const sum = summarize(s, R);
  assert.equal(sum.fi.implied.value, 744000);
  const f = sum.flags.find((x) => x.id === 'fi-goal-gap');
  assert.equal(f.stage, 'red');
  assert.deepEqual([f.next.goalNeeded, f.next.spendingNeeded], [595200, 3020], 'yellow: 80% of $744,000, or spending at $580,000 / 80% x 5% / 12');
  assert.deepEqual([f.green.goalNeeded, f.green.spendingNeeded], [744000, 2416], 'green: the goal reaches the implied number, or spending at $580,000 x 5% / 12');
  // Raising the goal to $595,200 is yellow; to $744,000 is green.
  const at = (v) => summarize(setAt(s, 'goals.fi.fiNumber', K(v)), R).flags.find((x) => x.id === 'fi-goal-gap');
  assert.equal(at(595200).stage, 'yellow');
  assert.equal(at(744000) ? at(744000).stage : 'green', 'green');
});

test('projection: a 0% promo starts charging the APR after it ends', () => {
  const s = mini({ debts: [card('p', 1000, { promoEnds: '2026-12-31', apr: 0.24, min: 25 })] });
  const p = project(s, R, { mode: 'committed', endYm: '2027-03' });
  assert.equal(p.months[0].interest, 0);
  assert.equal(p.months[1].interest, 0);
  assert.ok(p.months[2].interest > 0);
});

// ------------------------------------------------------------------ flags
test('flags: each alert fires from data and stays quiet otherwise', () => {
  const s = mini({
    household: {
      ...mini().household,
      people: [{ id: 'p', name: 'Pat', birthDate: K('2000-12-01') }],
      healthCoverage: [{ id: 'now', from: null, value: K('parent_plan') }, { id: 'next', from: '2026-12-01', value: K('own_plan'), planType: M() }]
    },
    income: [stream('ui', 'unemployment', 3000, 'monthly', { start: '2026-07-01', end: '2027-01-09' }), stream('gig', '1099', 4000, 'monthly', { start: '2027-01-01', likelihood: 0.7 })],
    expenses: [expense('rent', 2500), expense('health', 650, { start: '2026-12-01' })],
    accounts: [
      { id: 'c', family: 'cash', type: 'checking', name: K('Checking'), balance: K(1000) },
      { id: 'r', family: 'ira', type: 'roth_ira', name: K('Roth'), balance: K(9000), basis: K(5000), conversions: K([{ year: 2026, amount: 4000, taxable: 4000 }]) }
    ],
    debts: [card('cc', 5000, { limit: 5000, promoEnds: '2027-04-30' }), card('x', 100, { limit: null })],
    goals: [{ id: 'fi', type: 'fi', label: 'FI', fiNumber: K(100000) }]
  });
  const ids = summarize(s, R).flags.map((f) => f.id);
  for (const id of ['roth-conversion-r', 'unemployment-withholding-ui', 'utilization-cc', 'promo-deadlines', 'income-ends-ui', 'runway', 'fi-goal-gap', 'health-26-p', 'input-utilization']) assert.ok(ids.includes(id), 'expected ' + id + ' in ' + ids.join(', '));

  // A calm household: every flag it shows is at stage 3 (green).
  const quiet = household();
  quiet.accounts[0].balance = K(20000);
  quiet.accounts.find((a) => a.id === 'h').balance = K(9000);
  quiet.debts[0].limit = K(20000);
  quiet.taxYears[0].setAside = K(50000);
  const q = summarize(quiet, R).flags.filter((f) => f.stage !== 'green').map((f) => f.id + ':' + f.stage);
  assert.deepEqual(q, [], 'a calm household has only green flags: ' + q.join(', '));
});

test('flags: the 30% flag uses personal cards; a business card that does not report is not flagged', () => {
  const s1 = household();
  s1.accounts[0].balance = K(9000);
  s1.debts = [card('p', 1800, { limit: 2000, min: 50 }), card('q', 200, { limit: 3000, min: 25 }), card('biz', 4500, { limit: 5000, min: 100, business: true })];
  const f = summarize(s1, R).flags;
  const ids = f.map((x) => x.id);
  const stage = (id) => (f.find((x) => x.id === id) || {}).stage;
  assert.equal(stage('utilization-p'), 'red', '90%');
  assert.equal(stage('utilization-personal'), 'red', 'personal 2,000 / 5,000 = 40%');
  assert.equal(stage('utilization-q'), 'green', '200 / 3,000 = 6.7%');
  assert.ok(!ids.includes('utilization-biz'), 'a business card that does not report is not flagged');
  assert.match(f.find((x) => x.id === 'utilization-personal').detail, /All cards, business ones included: 65.0%/);
});

test('stages: thresholds, labels, sorting, and goals with gaps and monthly amounts', () => {
  assert.equal(stageFor(0.31, 0.3, 0.1), 'red');
  assert.equal(stageFor(0.3, 0.3, 0.1), 'yellow');
  assert.equal(stageFor(0.1, 0.3, 0.1), 'green');
  const g = goal('2026-10-22', 'Next: x', { target: 100, gap: 700, by: '2027-05-31', path: 'debts.a.balance' });
  assert.deepEqual([g.months, g.monthly, g.path], [7, 100, 'debts.a.balance']);
  assert.match(g.text, /\$100 a month, Nov 2026 to May 2027/);
  const s1 = household();
  s1.debts = [card('p', 1800, { limit: 2000, min: 50, promoEnds: '2027-03-31' })];
  const f = summarize(s1, R).flags;
  const order = f.map((x) => x.stageNumber);
  assert.deepEqual(order, [...order].sort((a, b) => a - b), 'red first, then yellow, then green');
  for (const x of f) {
    assert.equal(x.stageLabel, 'Stage ' + x.stageNumber + ' of 3');
    if (x.stage !== 'green') assert.ok(x.green && x.green.text.startsWith('Stage 3'), x.id + ' has a green goal');
    if (x.stage !== 'green') assert.ok(x.next && x.next.text.startsWith('Next'), x.id + ' has a next goal');
  }
  const u = f.find((x) => x.id === 'utilization-p');
  assert.deepEqual([u.next.target, u.next.gap, u.green.target], [600, 1200, 200]);
  assert.equal(u.next.months, 5, 'the promo end gives a date: Nov to Mar');
});

test('stages: runway, promo, income ending, FI and coverage', () => {
  const s1 = mini({
    household: { ...mini().household, people: [{ id: 'p', name: 'Pat', birthDate: K('2000-12-01') }], healthCoverage: [{ id: 'now', from: null, value: K('parent_plan') }, { id: 'next', from: '2026-12-01', value: K('own_plan'), planType: M() }] },
    income: [stream('job', 'w2', 3000, 'monthly', { end: '2026-12-31', fed: 300, st: 100 }), stream('gig', '1099', 2000, 'monthly', { start: '2027-01-01', likelihood: 0.6 })],
    expenses: [expense('rent', 1500), expense('health', 300, { start: '2026-12-01' })],
    accounts: [{ id: 'c', family: 'cash', type: 'savings', name: K('Savings'), balance: K(1000) }],
    debts: [card('pr', 1400, { limit: 10000, min: 40, promoEnds: '2027-05-31' })],
    goals: [{ id: 'fi', type: 'fi', label: 'FI', fiNumber: K(400000) }]
  });
  const f = Object.fromEntries(summarize(s1, R).flags.map((x) => [x.id, x]));
  // runway: 1,000 / 1,540 = 0.65 months: red; 1 month is 1,540
  assert.equal(f.runway.stage, 'red');
  assert.deepEqual([f.runway.next.target, f.runway.next.gap], [1540, 540]);
  assert.equal(f.runway.green.target, Math.ceil((25 / 5) * 1540));
  // promo: 1,400 / 7 = 200 a month against a surplus of 3000-300-100-229.5-1500-40 = 830.5: yellow
  assert.equal(f['promo-deadlines'].stage, 'yellow');
  // income ending: the gig is 60% likely: yellow
  assert.equal(f['income-ends-job'].stage, 'yellow');
  assert.equal(f['income-ends-job'].next.path, 'income.gig.likelihood');
  // FI: 400,000 / (1,500 x 12 / 0.04 = 450,000) = 89%: yellow; green at 450,000 or 1,333 a month
  assert.equal(f['fi-goal-gap'].stage, 'yellow');
  assert.deepEqual([f['fi-goal-gap'].next.goalNeeded, f['fi-goal-gap'].next.spendingNeeded], [450000, 1333]);
  // coverage: 40 days away, no plan type: red
  assert.equal(f['health-26-p'].stage, 'red');
  assert.equal(f['health-26-p'].next.path, 'household.healthCoverage.next.planType');
});

test('flags: no em dashes and no instructions in flag text', () => {
  const s = household();
  s.debts[0].limit = K(1500);
  for (const f of buildFlags(s, R, summarize(s, R, { flags: false }))) {
    assert.ok(!DASHES.test(f.title + f.detail));
    assert.ok(!/\byou should\b/i.test(f.detail));
  }
});

// ------------------------------------------------------------------ Triple D (S-183)
import { withScenario, scenarioAssumptions, SCENARIOS } from '../engine/scenarios.js';

test('Triple D: best is the household\'s own assumptions; likely and worst come from the rules', () => {
  const s = mini({
    income: [stream('job', 'w2', 6000, 'monthly', { fed: 900, st: 300 })],
    expenses: [expense('rent', 3100)],
    assumptions: { inflation: K(0.03), realReturn: K(0.08), withdrawalRate: K(0.05), lifeExpectancy: K(90) }
  });
  assert.deepEqual(SCENARIOS, ['best', 'likely', 'worst']);
  assert.equal(withScenario(s, R, 'best'), s, 'best changes nothing');
  const rate = (id) => { const a = scenarioAssumptions(s, R, id); return [a.realReturn.value, a.withdrawalRate.value]; };
  assert.deepEqual(rate('best'), [0.08, 0.05]);
  assert.deepEqual(rate('likely'), [R.get('SCENARIO_LIKELY_RETURN', 2026), R.get('SCENARIO_LIKELY_WR', 2026)]);
  assert.deepEqual(rate('worst'), [R.get('SCENARIO_WORST_RETURN', 2026), R.get('SCENARIO_WORST_WR', 2026)]);
  // Every FI number follows the set: implied FI is yearly spending / the set's withdrawal rate.
  for (const id of SCENARIOS) {
    const sum = summarize(withScenario(s, R, id), R);
    near(sum.fi.implied.value, 3100 * 12 / rate(id)[1], 1);
  }
  const fiYears = (id) => summarize(withScenario(s, R, id), R).fi.yearsToFi.value;
  assert.ok(fiYears('best') <= fiYears('likely') && fiYears('likely') <= fiYears('worst'), 'the projection follows the set');
  assert.equal(scenarioAssumptions(s, R, 'likely').realReturn.source, 'SCENARIO_LIKELY_RETURN');
});

test('house defaults: 0.01% APY on cash that is not high-yield; a standard plan for a phone with no amount', async () => {
  const { applyDefaults, isPhone } = await import('../engine/defaults.js');
  const s = mini({
    accounts: [{ id: 'chk', family: 'cash', type: 'checking', name: K('Checking'), balance: K(500) }, { id: 'hy', family: 'cash', type: 'hysa', name: K('HYSA'), balance: K(500) }],
    expenses: [{ ...expense('phone', 0), label: 'Phone', amount: M() }, { ...expense('gym', 0), amount: M() }]
  });
  const d = applyDefaults(s, R);
  assert.deepEqual([d.accounts[0].apy.value, d.accounts[0].apy.kind, d.accounts[0].apy.source], [0.0001, 'rough', 'DEFAULT_APY']);
  assert.equal(d.accounts[1].apy, undefined, 'high-yield savings asks for its real rate');
  assert.deepEqual([d.expenses[0].amount.value, d.expenses[0].amount.kind], [R.get('DEFAULT_PHONE_PLAN_1', 2026), 'rough']);
  assert.equal(d.expenses[1].amount.value, null, 'only a phone gets the standard plan');
  assert.ok(isPhone({ label: 'Cell plan' }) && !isPhone({ label: 'Microphone fund' }));
});

// ------------------------------------------------------------------ subscriptions (S-191)
import { nextCharge } from '../engine/subscriptions.js';
import { editExpense } from '../engine/edits.js';

test('subscriptions: cost a month and a year, next charge, and a yellow flag until reviewed', () => {
  const s0 = mini({ income: [stream('job', 'w2', 4000, 'monthly', { fed: 400, st: 150 })], expenses: [expense('stream', 15), expense('gym', 40), expense('rent', 1000)] });
  let s = editExpense(s0, 'stream', { amount: 15, cadence: 'monthly', subscription: true }, '2026-10-22');
  s = editExpense(s, 'gym', { amount: 40, cadence: 'monthly', subscription: true }, '2026-10-22');
  assert.equal(s.expenses[0].renews.kind, 'missing', 'it asks when it next charges');
  s = setAt(s, 'expenses.stream.renews', K('2026-09-30'));
  const sum = summarize(s, R);
  assert.equal(sum.subs.items.length, 2);
  assert.equal(sum.subs.monthly.value, 55);
  assert.equal(sum.subs.yearly, 660);
  const st = sum.subs.items.find((i) => i.id === 'stream');
  assert.equal(st.renews, '2026-10-30', 'a past date rolls forward by a month');
  assert.ok(st.soon, 'charging within 14 days');
  const f = sum.flags.find((x) => x.id === 'subscriptions');
  assert.equal(f.stage, 'yellow');
  assert.match(f.title, /2 subscriptions: \$55 a month \(\$660 a year\)/);
  assert.match(f.detail, /Charging soon: stream on October 30, 2026/);
  // Reviewed today and charging later: green.
  let r = setAt(s, 'expenses.stream.reviewed', K('2026-10-22'));
  r = setAt(r, 'expenses.gym.reviewed', K('2026-10-20'));
  r = setAt(r, 'expenses.stream.renews', K('2026-11-30'));
  assert.equal(summarize(r, R).flags.find((x) => x.id === 'subscriptions').stage, 'green');
  // Unmarking drops its dates.
  const un = editExpense(r, 'gym', { amount: 40, cadence: 'monthly', subscription: false }, '2026-10-22');
  assert.equal(un.expenses[1].renews, undefined);
  assert.equal(nextCharge('2026-01-31', 'yearly', '2026-10-22'), '2027-01-31');
  assert.ok(validate(r).ok);
});

// ------------------------------------------------------------------ money flow (S-192)
import { moneyFlow } from '../engine/flow.js';
import { applyDefaults } from '../engine/defaults.js';
import { loadHousehold } from '../engine/normalize.js';
import { readJson } from './spine-helpers.js';

test('money flow: from income through accounts and cards to where it goes, adding up to the surplus', () => {
  const s = applyDefaults(loadHousehold(readJson('fixtures/demo.json')), R);
  const cf = cashflow(s, R, '2026-10');
  const f = moneyFlow(s, R, cf);
  near(f.left - f.short, cf.surplus.value);
  // Every place balances: what comes into an account or card goes out of it.
  for (const n of f.nodes.filter((x) => x.kind === 'account' || x.kind === 'card')) {
    const inn = f.links.filter((l) => l.to === n.id).reduce((x, l) => x + l.amount, 0), out = f.links.filter((l) => l.from === n.id).reduce((x, l) => x + l.amount, 0);
    near(inn, out, 0.02);
  }
  assert.ok(f.links.some((l) => l.rough), 'unlinked routes are guesses');
  // A bill put on a card: the card carries it, and its account pays the card for it.
  const card = s.debts.find((d) => d.type === 'credit_card');
  const food = s.expenses.find((e) => e.fat === 'food');
  const s2 = setAt(s, 'expenses.' + food.id + '.paidFrom', K(card.id));
  const f2 = moneyFlow(s2, R, cashflow(s2, R, '2026-10'));
  assert.ok(f2.links.some((l) => l.from === 'card:' + card.id && l.to === 'sec:food' && !l.rough));
  near(f2.left - f2.short, cf.surplus.value, 0.01);
  // A section opened shows each expense.
  const f3 = moneyFlow(s, R, cf, { open: ['food'] });
  assert.ok(f3.nodes.some((n) => n.id === 'exp:' + food.id) && !f3.nodes.some((n) => n.id === 'sec:food'));
  assert.ok(f.nodes.every((n) => n.amount > 0), 'no empty places');
});

// ------------------------------------------------------------------ vehicles depreciate (S-196)
test('a car with no rate loses 15% a year (rough), and the net worth projection uses it', () => {
  const s = applyDefaults(mini({ accounts: [{ id: 'chk', family: 'cash', type: 'checking', name: K('Checking'), balance: K(1000) }, { id: 'car', family: 'otherAssets', type: 'car', name: K('Car'), balance: K(10000) }] }), R);
  assert.deepEqual([s.accounts[1].appreciationRate.value, s.accounts[1].appreciationRate.kind, s.accounts[1].appreciationRate.source], [-0.15, 'rough', 'DEFAULT_VEHICLE_DEPRECIATION']);
  const p = project(s, R, { mode: 'committed', endYm: '2027-10' });
  const oct27 = p.months.find((m) => m.ym === '2027-10');
  near(oct27.otherAssets, 8500, 1);
  // A rate someone enters wins.
  const own = applyDefaults(setAt(s, 'accounts.car.appreciationRate', K(-0.1)), R);
  near(project(own, R, { mode: 'committed', endYm: '2027-10' }).months.find((m) => m.ym === '2027-10').otherAssets, 9000, 1);
});
