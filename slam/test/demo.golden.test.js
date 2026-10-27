// Golden values for the demo household (Casey Rivera, made up), worked by
// hand from fixtures/demo.json as of 2026-10-22. The arithmetic is written out
// so each value can be checked without the engine.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadHousehold } from '../engine/normalize.js';
import { validate } from '../engine/schema.js';
import { summarize, payoffOrders } from '../engine/summary.js';
import { readJson, loadRules } from './spine-helpers.js';

const R = loadRules();
const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, a + ' is not ' + b);

test('demo golden values as of 2026-10-22', async (t) => {
  const spine = loadHousehold(readJson('fixtures/demo.json'));
  assert.ok(validate(spine).ok);
  const s = summarize(spine, R);
  const cf = s.cashflow;

  await t.test('cash flow for October 2026', () => {
    assert.equal(cf.income.gross.value, 6000 + 500); // salary + tutoring; the bonus is maybe money in 2027
    near(cf.income.fica.value, 6000 * 0.0765); // 459
    near(cf.income.takeHome.value, 6500 - 550 - 280 - 459 - 500); // 4,711 (500 to the 401(k) from pay)
    assert.equal(cf.expenses.total.value, 1800 + 150 + 500 + 200 + 130 + 60 + 14 + 50 + 300); // 3,204: streaming is $40 less $13 each from Maya and Theo
    assert.equal(cf.expenses.fat.value, 1800 + 150 + 500 + 200 + 130); // 2,780
    assert.equal(cf.debtMinimums.total.value, 90 + 40 + 212); // 342
    // Tax set-aside on the 1099 tutoring (no withholding): 500 x (22% federal + 5.4% NY
    // + 92.35% x 15.3% self-employment) = 500 x 0.4152955 = 207.65.
    const setAside = Math.round(s.tax.balanceDue.value / 7 * 100) / 100;
    near(cf.taxSetAside.total.value, setAside);
    assert.deepEqual(cf.taxSetAside.lines.map((l) => [l.kind, l.months]), [['balance', 7]]);
    const surplus = 4711 - 3204 - 342 - 300 - setAside; // 657.35 (300 to the Roth from take-home)
    near(cf.surplus.value, surplus);
    // Monthly surplus (B2): take-home - spending - minimums - the set-aside, before any saving: 957.35.
    near(cf.monthlySurplus.value, 4711 - 3204 - 342 - setAside);
    // Savings rate (B2): what is set to be saved (300 to the Roth + 500 to the 401(k); no match, no cash saving, no
    // extra at the debt; the 657.35 left unassigned is not counted) over take-home + pre-tax: 800 / 5,211 = 15.35%.
    near(cf.savingsRate.net.value, 800 / (4711 + 500), 0.0001);
    // Of gross: 800 / 6,500 = 12.31%.
    near(cf.savingsRate.gross.value, 800 / 6500, 0.0001);
    assert.equal(cf.expenses.need.value, 1800 + 150 + 500 + 130 + 60); // tagged needs; "Everything else" is not tagged yet
    assert.equal(cf.expenses.lean.value, 1800 + 150 + 500 + 130); // food, housing, transportation that are not wants
    assert.equal(cf.surplus.kind, 'rough');
  });

  await t.test('balance sheet', () => {
    assert.equal(s.sheet.cash.value, 3000 + 9000);
    assert.equal(s.sheet.invested.value, 45000 + 15000 + 5000);
    assert.equal(s.sheet.assets.value, 12000 + 65000 + 10000);
    assert.equal(s.sheet.debts.value, 3000 + 1200 + 20000);
    assert.equal(s.sheet.owed, 26 + 150); // Theo's Sep and Oct streaming, and the $150 lent to Jordan
    assert.equal(s.sheet.netWorth.value, 87000 - 24200 + 176);
    assert.equal(s.sheet.cards.value, 4200);
  });

  await t.test('emergency fund', () => {
    assert.equal(s.emergency.age, 32);
    near(s.emergency.targetMonths.value, 32 / 5); // 6.4
    near(s.emergency.tiers.full.runway.value, 12000 / (3204 + 342)); // 3.38
    near(s.emergency.tiers.fatOnly.runway.value, 12000 / (2780 + 342)); // 3.84
    assert.equal(s.emergency.targetDollars.value, Math.ceil(6.4 * 3546)); // 22,695: whole dollars, rounded up
    assert.equal(s.emergency.backstop.contributions.value, 12000);
  });

  await t.test('FI', () => {
    assert.equal(s.fi.fiNumber.value, 40000 / 0.04); // goal spending at 4%
    assert.equal(s.fi.goalSource, 'spending');
    near(s.fi.fiPercent.value, 65000 / 1000000);
    assert.equal(s.fi.implied.value, 3204 * 12 / 0.04); // 961,200
    assert.equal(s.fi.goalBelowImplied.value, false);
    assert.equal(s.fi.leanFi.value, (2780 - 200) * 12 / 0.04); // 774,000: eating out is a want; same 4% rate
    near(s.fi.coastFi.value, 1000000 / Math.pow(1.05, 65 - 32), 0.01); // 199,872.54
  });

  await t.test('cards: utilization, promo deadline, orders', () => {
    const u = Object.fromEntries(s.debt.utilization.items.map((x) => [x.id, x.util.value]));
    assert.deepEqual(u, { visa: 0.3, store: 0.6, ink: 0 });
    near(s.debt.utilization.personal.value, (3000 + 1200) / (10000 + 2000)); // 35%: the business card does not report
    near(s.debt.utilization.overall.value, 4200 / (10000 + 2000 + 10000)); // 19.1%
    const cs = s.debt.creditScore;
    assert.deepEqual(cs.cards.map((c) => c.id), ['store']); // Visa is at exactly 30%, not over
    assert.equal(cs.smallest.id, 'store');
    near(cs.personalAfter.value, 3000 / 12000); // 25%
    assert.equal(s.debt.promo.total.value, 1200);
    assert.equal(s.debt.promo.items[0].paymentsLeft, 4); // Nov, Dec, Jan, Feb
    near(s.debt.promo.monthly.value, 300);
    // Krug pass: the debts losing money first, most lost a month first (the deferred-interest Store card's charge-back
    // before its Feb 2027 cliff, then the Visa at 22%), then the rest by rate.
    assert.deepEqual(s.debt.avalanche, ['store', 'visa', 'sl']);
    const po = payoffOrders(spine, R, s);
    assert.deepEqual(po.snowball.order, ['store', 'visa', 'sl']);
    assert.deepEqual(po.stress.order, ['store', 'visa', 'sl']); // stress 8, 6, 3
  });

  await t.test('2026 tax', () => {
    // Wages 72,000 less 6,000 to the 401(k) = 66,000. Tutoring 6,000 of 1099.
    const se = 6000 * 0.9235 * 0.153; // 847.77
    const agi = 66000 + 6000 - se / 2; // 71,576.11
    const taxable = agi - 16100; // 55,476.11
    const fed = 12400 * 0.10 + (50400 - 12400) * 0.12 + (taxable - 50400) * 0.22; // 6,916.74
    const nyTaxable = agi - 8000;
    const ny = 8500 * 0.039 + (11700 - 8500) * 0.044 + (13900 - 11700) * 0.0515 + (nyTaxable - 13900) * 0.054; // 3,268.11
    const withheld = 550 * 12 + 280 * 12; // 9,960
    const L = s.tax.lines;
    near(L.seTax.value, se);
    near(L.agi.value, agi);
    near(L.federalIncomeTax.value, fed);
    near(L.stateTax.value, ny);
    near(s.tax.owed.value, fed + se + ny);
    near(s.tax.withheld.value, withheld);
    near(s.tax.balanceDue.value, fed + se + ny - withheld); // 1,072.63
    near(s.tax.marginal.value, 0.22 + 0.054);
    assert.equal(s.tax.nextEstimated.date, '2027-01-15');
    assert.equal(s.tax.missingText, null);
    assert.ok(L.federalIncomeTax.rules.includes('FED_BRK_S'));
  });

  await t.test('flags and their stages', () => {
    const st = Object.fromEntries(s.flags.map((f) => [f.id, f.stage]));
    assert.equal(st['utilization-store'], 'red'); // 60%
    assert.equal(st['utilization-personal'], 'red'); // 35%
    assert.equal(st['utilization-visa'], 'yellow'); // exactly 30%
    assert.equal(st['promo-deadlines'], 'yellow'); // 300 a month fits in an 839 surplus
    assert.equal(st.runway, 'yellow'); // 3.4 months, under the 6.4-month target
    assert.equal(st['fi-goal-gap'], 'green'); // 1,000,000 is over 961,200
    assert.equal(st['tax-2026'], 'yellow'); // a number, built on the rough tutoring amount
    const runway = s.flags.find((f) => f.id === 'runway');
    assert.deepEqual([runway.next.target, runway.next.gap], [22695, 22695 - 12000]);
  });
});
