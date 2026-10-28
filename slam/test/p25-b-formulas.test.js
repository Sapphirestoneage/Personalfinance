// Phase 2.5, Part B2: every metric's definition, checked by hand on one made-up household (Pat, 30, single, NY).
// Each number below is worked out from the household as written, not read from the engine.
//
// Pat, as of 2026-10-22 (born 1996-01-01, so 30):
//   W-2 pay 5,000 a month; withheld 900 federal + 300 state (more than the year's tax, so no set-aside: a refund).
//   FICA 5,000 x 7.65% = 382.50. 401(k) 400 a month from pay; match 50% up to 6% of pay: 0.5 x min(400, 300) = 150.
//   Take-home = 5,000 - 1,200 - 382.50 - 400 = 3,017.50.
//   Roth IRA 100 a month and high-yield savings 50 a month from take-home. Extra at the debt 100 a month.
//   Spending: rent 1,500 (need), groceries 400 (need), eating out 200 (want), transit 100 (need), fun 300 (want) = 2,500.
//   Debt minimums: car loan 250 + Visa 40 = 290.
//   Cash: checking 6,000 + savings 3,000 = 9,000 (the 1,000 trip fund is set aside for a goal, not cash).
//   Invested: 401(k) 20,000 + Roth 5,000 = 25,000 (Roth contributions 4,000). Debt: car 8,000 + Visa 1,000 = 9,000.
//   Withdrawal rate 4%, real return 5%, coast age 65 (the app's default). FI goal: 40,000 a year;
//   dream spending 60,000 a year; part-time income 20,000 a year.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fact } from '../engine/spine.js';
import { validate } from '../engine/schema.js';
import { summarize } from '../engine/summary.js';
import { draftt } from '../engine/plan.js';
import { explainMetric, METRICS, READS } from '../engine/math.js';
import { loadRules, readJson } from './spine-helpers.js';
import { readFileSync } from 'node:fs';

const R = loadRules();
const K = (x) => fact(x, { kind: 'known', asOf: '2026-10-22', source: 'test' });
const near = (a, b, eps = 0.005, what = '') => assert.ok(a !== null && Math.abs(a - b) <= eps, what + ': ' + a + ' is not ' + b);
const ex = (id, amount, need, fat = null) => ({ id, label: id, amount: K(amount), cadence: 'monthly', start: null, end: null, fixed: null, need: K(need), fat });

function pat() {
  const s = {
    schema: 'slam-spine/1',
    meta: { name: 'Pat (made up)', asOf: '2026-10-22', demo: true },
    household: {
      people: [{ id: 'p', name: 'Pat', birthDate: K('1996-01-01') }],
      filingStatus: K('single'), state: K('NY'), county: K('Albany'), nycResident: K(false),
      situation: [{ id: 'now', from: null, value: K('employed') }],
      healthCoverage: [{ id: 'now', from: null, value: K('employer') }]
    },
    income: [{ id: 'job', type: 'w2', label: 'Job', personId: 'p', amount: K(5000), cadence: 'monthly', start: null, end: null, withholding: { federal: K(900), state: K(300) } }],
    expenses: [ex('rent', 1500, true, 'accommodation'), ex('groceries', 400, true, 'food'), ex('dining', 200, false, 'food'), ex('transit', 100, true, 'transportation'), ex('fun', 300, false)],
    accounts: [
      { id: 'chk', family: 'cash', type: 'checking', name: K('Checking'), balance: K(6000) },
      { id: 'sav', family: 'cash', type: 'hysa', name: K('Savings'), balance: K(3000), apy: K(0.04), monthlyContribution: K(50) },
      { id: 'trip', family: 'cash', type: 'savings', name: K('Trip fund'), balance: K(1000), role: K('sinking') },
      { id: 'k', family: 'employerRetirement', type: 'k401', name: K('401(k)'), balance: K(20000), monthlyContribution: K(400), matchRate: K(0.5), matchCap: K(0.06) },
      { id: 'r', family: 'ira', type: 'roth_ira', name: K('Roth'), balance: K(5000), basis: K(4000), monthlyContribution: K(100) }
    ],
    debts: [
      { id: 'car', family: 'debt', type: 'auto_loan', name: K('Car'), balance: K(8000), apr: K(0.05), minimum: K(250) },
      { id: 'visa', family: 'debt', type: 'credit_card', name: K('Visa'), balance: K(1000), apr: K(0.2), limit: K(5000), minimum: K(40), business: K(false), reportsToPersonalCredit: K(true) }
    ],
    goals: [{ id: 'fi', type: 'fi', label: 'Financial independence', annualSpending: K(40000), dreamSpending: K(60000), partTimeIncome: K(20000) }],
    debtPlan: { extra: K(100) },
    assumptions: { inflation: K(0.03), realReturn: K(0.05), withdrawalRate: K(0.04), lifeExpectancy: K(90) },
    taxYears: [{ id: '2026', year: 2026, estimatedPaidFederal: K(0), estimatedPaidState: K(0) }]
  };
  const r = validate(s);
  assert.ok(r.ok, r.errors.map((e) => e.path + ' ' + e.message).join('\n'));
  return s;
}
const S = summarize(pat(), R);
const cf = S.cashflow;

test('take-home, spending, minimums and no set-aside, as worked above', () => {
  near(cf.income.takeHome.value, 3017.5, 0.005, 'take-home');
  assert.equal(cf.expenses.total.value, 2500);
  assert.equal(cf.debtMinimums.total.value, 290);
  assert.equal(cf.taxSetAside.total.value, 0, 'withholding covers the year');
});

test('monthly surplus = take-home - spending - debt minimums - tax set-aside: 3,017.50 - 2,500 - 290 - 0 = 227.50', () => {
  near(cf.monthlySurplus.value, 227.5, 0.005, 'surplus');
  near(explainMetric('surplus', { spine: pat(), rules: R, s: S }).value, 227.5);
  // Left after saving: 227.50 - 100 to the Roth = 127.50 (the 50 into savings stays cash).
  near(cf.surplus.value, 127.5, 0.005, 'left after saving');
});

test('savings rate (headline) = (150 savings + 400 pre-tax + 150 match + 100 extra) / (3,017.50 + 400 + 150) = 800 / 3,567.50 = 22.42%', () => {
  near(cf.saving.match.value, 150, 0.005, 'match');
  near(cf.saving.cash.value, 50, 0.005, 'cash saving');
  near(cf.saving.extraDebt.value, 100, 0.005, 'extra at the debt');
  near(cf.savingsRate.net.value, 800 / 3567.5, 0.00001, 'headline');
  near(cf.savingsRate.net.value, 0.2242, 0.0001, 'headline, rounded');
});

test('savings rate of gross = 800 / (5,000 + 150) = 15.53%', () => {
  near(cf.savingsRate.gross.value, 800 / 5150, 0.00001, 'gross');
});

test('FI number three ways: today 837,000; goal 1,000,000; without debt 750,000', () => {
  // Today: (2,500 + 290) x 12 / 4% = 33,480 / 0.04. Goal: 40,000 / 4%. Without debt: 2,500 x 12 / 4%.
  assert.deepEqual(S.fi.threeWays.map((x) => [x.id, x.result.value]), [['today', 837000], ['goal', 1000000], ['noDebt', 750000]]);
});

test('Lean, Fat, Barista and Coast FI', () => {
  // Lean: needs in food, housing, transportation (1,500 + 400 + 100 = 2,000) x 12 / 4% = 600,000.
  assert.equal(S.fi.leanFi.value, 600000);
  // Fat: 60,000 / 4% = 1,500,000.
  assert.equal(S.fi.fatFi.value, 1500000);
  // Barista: (33,480 - 20,000) / 4% = 337,000.
  assert.equal(S.fi.baristaFi.value, 337000);
  // Coast: the FI number (the goal, 1,000,000) / 1.05 ^ (65 - 30) = 1,000,000 / 5.5160154 = 181,290.29.
  near(S.fi.coastFi.value, 181290.29, 0.01, 'coast');
});

test('FI % = invested / today\'s FI number = 25,000 / 837,000 = 2.99%', () => {
  near(S.fi.fiPercent.value, 25000 / 837000, 0.000001, 'FI %');
});

test('the cushion in three steps: 2,290 needs, 2,790 a month, 16,740 at age / 5', () => {
  assert.deepEqual(S.emergency.cushion.map((x) => [x.id, x.target.value, x.reached]), [['needs', 2290, true], ['month', 2790, true], ['ruleOf5', 16740, false]]);
});

test('cash runway = 9,000 / 2,790 = 3.23 months; on needs only 9,000 / 2,290 = 3.93', () => {
  assert.equal(S.sheet.cash.value, 9000, 'the trip fund is set aside, not cash');
  near(S.emergency.tiers.full.runway.value, 9000 / 2790, 0.0001, 'runway');
  near(S.emergency.tiers.needsOnly.runway.value, 9000 / 2290, 0.0001, 'needs runway');
});

test('net worth: liquid 14,000 - 9,000 = 5,000; total 35,000 - 9,000 = 26,000', () => {
  // Liquid: cash accounts 10,000 (the trip fund is liquid, just not emergency cash) + Roth contributions 4,000.
  assert.equal(S.sheet.liquid.value, 14000);
  assert.equal(S.sheet.liquidNetWorth.value, 5000);
  assert.equal(S.sheet.netWorth.value, 26000);
});

test('DRAFTT: each letter / take-home, Retirement / gross; no bands', () => {
  const d = draftt(pat(), R, S);
  const share = (k) => d.rows.find((r) => r.key === k).share;
  assert.equal(share('debt'), 0.0961, '290 / 3,017.50');
  assert.equal(share('retirement'), 0.1, '(400 + 100) / 5,000');
  assert.equal(share('accommodation'), 0.4971, '1,500 / 3,017.50');
  assert.equal(share('food'), 0.1988, '600 / 3,017.50');
  assert.equal(share('transportation'), 0.0331, '100 / 3,017.50');
  assert.ok(d.rows.every((r) => !('band' in r) && !('verdict' in r)));
});

test('housing reference = 1,500 / 3,017.50 = 49.71% against 30% (it has a car); 594.75 over the line', () => {
  near(explainMetric('housingShare', { spine: pat(), rules: R, s: S }).value, 1500 / 3017.5, 0.00001, 'housing share');
  const a = draftt(pat(), R, S).rows.find((r) => r.key === 'accommodation');
  near(a.overReference, 1500 - 3017.5 * 0.3, 0.011, 'over the reference');
});

test('card use: personal cards 1,000 / 5,000 = 20%, all cards the same here', () => {
  assert.equal(S.debt.utilization.personal.value, 0.2);
  assert.equal(S.debt.utilization.overall.value, 0.2);
});

test('every metric has a written definition and says which layers it reads; FORMULAS.md is up to date', async () => {
  for (const m of METRICS) {
    assert.ok(m.formula && m.plain, m.id + ' has a formula and plain words');
    assert.ok((READS[m.id] || []).length, m.id + ' says which layers it reads');
  }
  const { formulasDoc } = await import('../tools/formulas-doc.mjs');
  assert.equal(readFileSync(new URL('../docs/FORMULAS.md', import.meta.url), 'utf8'), formulasDoc(), 'run node tools/formulas-doc.mjs');
  for (const id of ['surplus', 'savingsRateNet', 'savingsRateGross', 'fiToday', 'fiNumber', 'impliedFi', 'leanFi', 'fatFi', 'baristaFi', 'coastFi', 'fiPercent', 'cushionNeeds', 'cushionMonth', 'ruleOf5Dollars', 'runway', 'runwayNeeds', 'liquidNetWorth', 'netWorth', 'housingShare', 'personalUtil', 'overallUtil']) assert.ok(METRICS.some((m) => m.id === id), id);
});

test('Batch 8: a typed 0 deductible is done with no deductible; a blank one is missing; neither reads as covered', async () => {
  const { fooLadder } = await import('../engine/plan.js');
  const { putFact, recordDebtPayment } = await import('../engine/edits.js');
  const step = (s) => fooLadder(s, R, summarize(s, R)).rungs.find((r) => r.id === 'deductibles');
  // The deductible as Step 1's target (S-261: chosen per client; a typed one keeps an older file on it).
  const blank = step(putFact(pat(), 'household.starterBasis', 'deductible', 'known', '2026-10-22'));
  assert.deepEqual([blank.need, blank.done], [null, null]);
  const zero = step(putFact(pat(), 'household.deductible', 0, 'known', '2026-10-22'));
  assert.deepEqual([zero.need, zero.done], [0, true]);
  assert.match(zero.why, /No insurance deductible/);
  assert.doesNotMatch(zero.why + blank.why, /covers|100%/);
  // A payment lowers the debt and checking: Visa 1,000 - 200 = 800; checking 6,000 - 200 = 5,800.
  const paid = recordDebtPayment(pat(), 'visa', 200, '2026-10-22');
  assert.equal(paid.debts.find((d) => d.id === 'visa').balance.value, 800);
  assert.equal(paid.accounts.find((a) => a.id === 'chk').balance.value, 5800);
});
