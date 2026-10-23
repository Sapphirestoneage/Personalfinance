// Hand-checkable examples for the engines: small, round numbers a reader can verify in their head
// before trusting the bigger household tests (src/data/households). Each test says the arithmetic in
// its comment. Depends on the engines under test and on store/value.js for makeValue.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toMonthly, PAYCHECKS_PER_YEAR, sumParts } from '../src/engines/normalize.js';
import { bracketTax, marginalRate, bracketSlices, estimateAnnualTax } from '../src/engines/tax.js';
import { sumKnown, sum, ratio, minus, r2, r2OrNull, r2Exact } from '../src/engines/money.js';
import { fiftyThirtyTwenty } from '../src/engines/lenses.js';
import { cardInterest, cardInterestTotal } from '../src/engines/debts.js';
import { rentShare, surplusAllocation } from '../src/engines/totals.js';
import { merchantRange, waterfallSteps } from '../src/engines/trends.js';
import { makeValue } from '../src/store/value.js';

// A made-up tax table with round brackets, so every figure below can be checked by hand.
// 10% on the first 10,000; 20% on the next 30,000; 30% above 40,000.
const TOY_TAX = {
  taxYear: 2026,
  brackets: {
    single: [
      [10000, 0.1],
      [40000, 0.2],
      [null, 0.3]
    ]
  },
  fica: { socialSecurityRate: 0.06, socialSecurityWageBase: 100000, medicareRate: 0.01 },
  selfEmployment: { netEarningsFactor: 1, socialSecurityRate: 0.1, medicareRate: 0.02 }
};

test('toMonthly: every cadence lands on the same month', () => {
  assert.equal(toMonthly(makeValue(100, { cadence: 'month' })), 100);
  assert.equal(toMonthly(makeValue(1200, { cadence: 'year' })), 100); // 1,200 a year is 100 a month
  assert.equal(toMonthly(makeValue(120, { cadence: 'week' })), 520); // 120 x 52 weeks / 12 months
  assert.equal(toMonthly(makeValue(600, { cadence: 'paycheck' }), 'biweekly'), 1300); // 600 x 26 / 12
  assert.equal(toMonthly(makeValue(500, { cadence: 'paycheck' }), 'semimonthly'), 1000); // 500 x 24 / 12
  assert.equal(PAYCHECKS_PER_YEAR.weekly, 52);
});

test('toMonthly: empty is not zero, and "does not apply" is zero', () => {
  assert.equal(toMonthly(makeValue()), null); // nobody answered
  assert.equal(toMonthly(makeValue(null, { status: 'not-for-me' })), 0); // answered: not for me
  assert.equal(toMonthly(makeValue(900, { cadence: 'one-off' })), 0); // one-offs stay out of the month
  assert.equal(toMonthly(makeValue(600, { cadence: 'paycheck' }), 'every-so-often'), null); // unknown schedule
});

test('sumParts: items in mixed cadences add up to the cent in the value cadence', () => {
  // 10 a week plus 20 a month, as a monthly amount: 10 x 52 / 12 = 43.33, plus 20 = 63.33
  assert.equal(
    sumParts(
      [
        { name: 'bus', amount: 10, cadence: 'week' },
        { name: 'parking', amount: 20 }
      ],
      'month'
    ),
    63.33
  );
  assert.equal(
    sumParts(
      [
        { name: 'a', amount: null },
        { name: 'b', amount: null }
      ],
      'month'
    ),
    null
  );
});

test('bracketTax: 50,000 taxable in the toy brackets is 10,000', () => {
  // 10,000 x 10% = 1,000; 30,000 x 20% = 6,000; 10,000 x 30% = 3,000.
  assert.equal(bracketTax(50000, TOY_TAX.brackets.single), 10000);
  assert.equal(marginalRate(50000, TOY_TAX.brackets.single), 0.3);
  assert.equal(marginalRate(5000, TOY_TAX.brackets.single), 0.1);
  assert.equal(marginalRate(0, TOY_TAX.brackets.single), 0);
  const slices = bracketSlices(25000, TOY_TAX.brackets.single);
  assert.deepEqual(
    slices.map((s) => [s.amount, s.tax]),
    [
      [10000, 1000],
      [15000, 3000]
    ]
  );
});

test('estimateAnnualTax: a 60,000 W-2 salary in the toy table takes home 45,800', () => {
  // Taxable = 60,000 - 10,000 standard deduction = 50,000, so income tax 10,000 (above).
  // Social Security 6% of 60,000 = 3,600; Medicare 1% = 600. Total tax 14,200. Take-home 45,800.
  const t = estimateAnnualTax({ gross: 60000, type: 'w2', filingStatus: 'single', stdDeduction: 10000 }, TOY_TAX);
  assert.equal(t.taxable, 50000);
  assert.equal(t.incomeTax, 10000);
  assert.equal(t.socialSecurity, 3600);
  assert.equal(t.medicare, 600);
  assert.equal(t.totalTax, 14200);
  assert.equal(t.takeHome, 45800);
  assert.equal(t.bracket, 0.3);
});

test('estimateAnnualTax: self-employment tax, half of it off the top', () => {
  // 50,000 of 1099 income: SE tax = 10% + 2% of 50,000 = 6,000. Half (3,000) comes off before the
  // deduction: AGI 47,000, taxable 40,000 (7,000 deduction), income tax 1,000 + 6,000 = 7,000.
  // Total 13,000; take-home 37,000.
  const t = estimateAnnualTax({ gross: 50000, type: '1099', filingStatus: 'single', stdDeduction: 7000 }, TOY_TAX);
  assert.equal(t.seTax, 6000);
  assert.equal(t.agi, 47000);
  assert.equal(t.taxable, 40000);
  assert.equal(t.incomeTax, 7000);
  assert.equal(t.totalTax, 13000);
  assert.equal(t.takeHome, 37000);
});

test('estimateAnnualTax: family support is not taxed', () => {
  const t = estimateAnnualTax({ gross: 12000, type: 'family', filingStatus: 'single', stdDeduction: 10000 }, TOY_TAX);
  assert.equal(t.totalTax, 0);
  assert.equal(t.takeHome, 12000);
});

test('money helpers: empty is not zero', () => {
  assert.deepEqual(sumKnown([100, null, 50]), { total: 150, missing: 1 });
  assert.equal(sum([null, null]), null); // nothing entered, so no total
  assert.equal(sum([null, 0]), 0); // a typed zero counts
  assert.equal(ratio(25, 100), 0.25);
  assert.equal(ratio(1, 0), null); // never divide by zero
  assert.equal(minus(100, null), null);
  assert.equal(minus(100, 40), 60);
});

test('rounding to the cent: r2, r2OrNull and the exact variant', () => {
  assert.equal(r2(12.345), 12.35);
  assert.equal(r2(12.344), 12.34);
  assert.ok(Object.is(r2(-0.001), 0)); // never -0
  assert.equal(r2OrNull(null), null);
  assert.equal(r2OrNull(2.5), 2.5);
  // Floating point leaves 0.03 - 0.005 + 0.01 at 0.034999999999999996, so plain rounding gives 0.03.
  // r2Exact trims the noise to 12 digits first, sees 0.035, and rounds it to 0.04 like pencil arithmetic.
  const noisy = 0.03 - 0.005 + 0.01;
  assert.equal(r2(noisy), 0.03);
  assert.equal(r2Exact(noisy), 0.04);
});

test('50/30/20: 4,000 take-home split 2,000 / 1,200 / 800 is exactly 50%, 30%, 20%', () => {
  const totals = { takeHome: 4000, needs: 2000, wants: 1200, savingsAmount: 800, surplus: 0 };
  const lens = fiftyThirtyTwenty(totals, { needs: 0.5, wants: 0.3, savings: 0.2 });
  assert.deepEqual(
    lens.rows.map((r) => [r.key, r.share, r.target]),
    [
      ['needs', 0.5, 0.5],
      ['wants', 0.3, 0.3],
      ['savings', 0.2, 0.2]
    ]
  );
  assert.equal(lens.unassignedShare, 0);
});

test('card interest: 12% a year on a 1,000 balance is 10 a month', () => {
  const doc = { accounts: [], balances: {} };
  const card = {
    id: 'd1',
    type: 'credit-card',
    state: 'active',
    apr: makeValue(12),
    balance: makeValue(1000),
    promoEnds: null,
    promoApr: makeValue()
  };
  const ci = cardInterest(doc, card, '2026-10');
  assert.equal(ci.amount, 10); // 1,000 x 12% / 12 months
  assert.equal(ci.apr, 12);
  // Missing the APR: no number, and the reason says so (empty is not zero).
  const noApr = cardInterest(doc, { ...card, apr: makeValue() }, '2026-10');
  assert.equal(noApr.amount, null);
  assert.equal(noApr.why, 'Needs the APR');
  assert.equal(cardInterestTotal([{ amount: 10 }, { amount: null }, { amount: 2.5 }]), 12.5);
});

test('rent share: 2,400 total rent with two roommates is 800 each', () => {
  const doc = {
    household: { roommates: { count: 2, totalRent: makeValue(2400) } },
    categories: [{ type: 'housing', lines: [{ id: 'rent', type: 'rent', state: 'active', estimate: makeValue() }] }]
  };
  const r = rentShare(doc);
  assert.equal(r.total, 2400);
  assert.equal(r.even, 800); // 2,400 / (2 roommates + you)
  assert.equal(r.yours, null); // the Rent line is still blank
});

test('surplus allocation: 4,600 take-home, 3,000 of spending, 600 saved so far', () => {
  // surplus = 4,600 - 3,000 = 1,600; allocated 600; not allocated yet 1,000.
  // Pre-tax retirement 400 makes the base 5,000: savings rate (600 + 400) / 5,000 = 20%;
  // the rest of the surplus would add 1,000 / 5,000 = 20% more, for a possible 40%.
  const model = {
    categories: [
      { savings: true, lines: [{ id: 'ef', name: 'Emergency fund', type: 'emergency-fund', estimate: 600 }] }
    ]
  };
  const totals = { estimateTotal: 3000, takeHome: 4600, savingsEstimate: 600, retirementDeductions: 400 };
  const a = surplusAllocation(model, totals);
  assert.equal(a.surplus, 1600);
  assert.equal(a.allocated, 600);
  assert.equal(a.unallocated, 1000);
  assert.equal(a.groups.saving, 600);
  assert.equal(a.savingsRate, 0.2);
  assert.equal(a.boost, 0.2);
  assert.equal(a.possibleSavingsRate, 0.4);
});

test('trends: a merchant range and a folded waterfall', () => {
  // Three months at one coffee shop: 4 + 6 + 10 visits, 20 + 30 + 50 spent; average ticket 100 / 20 = 5.
  const range = merchantRange([
    { visits: 4, total: 20 },
    { visits: 6, total: 30 },
    { visits: 10, total: 50 }
  ]);
  assert.deepEqual(range, { visits: 20, total: 100, averageTicket: 5 });
  // Month over month from 1,000 to 1,150 in four steps, folded after two: +200, -100, then +30 + 20 as one step.
  const mom = {
    before: 1000,
    after: 1150,
    steps: [
      { id: 'a', name: 'A', change: 200 },
      { id: 'b', name: 'B', change: -100 },
      { id: 'c', name: 'C', change: 30 },
      { id: 'd', name: 'D', change: 20 }
    ]
  };
  const wf = waterfallSteps(mom, 2);
  assert.deepEqual(
    wf.steps.map((s) => [s.from, s.to]),
    [
      [1000, 1200],
      [1200, 1100]
    ]
  );
  assert.deepEqual(wf.rest, { change: 50, from: 1100, to: 1150 });
  assert.equal(wf.after, 1150);
});
