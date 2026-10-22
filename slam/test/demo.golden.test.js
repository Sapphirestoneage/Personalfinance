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
    assert.equal(cf.expenses.total.value, 1800 + 150 + 500 + 200 + 130 + 60 + 40 + 50 + 300); // 3,230
    assert.equal(cf.expenses.fat.value, 1800 + 150 + 500 + 200 + 130); // 2,780
    assert.equal(cf.debtMinimums.total.value, 90 + 40 + 212); // 342
    near(cf.surplus.value, 4711 - 3230 - 342 - 300); // 839 (300 to the Roth from take-home)
    near(cf.savingsRate.gross.value, (839 + 500 + 300) / 6500); // 25.2%
    near(cf.savingsRate.net.value, (839 + 300) / 4711); // 24.2%
    assert.equal(cf.surplus.kind, 'rough');
  });

  await t.test('balance sheet', () => {
    assert.equal(s.sheet.cash.value, 3000 + 9000);
    assert.equal(s.sheet.invested.value, 45000 + 15000 + 5000);
    assert.equal(s.sheet.assets.value, 12000 + 65000 + 10000);
    assert.equal(s.sheet.debts.value, 3000 + 1200 + 20000);
    assert.equal(s.sheet.netWorth.value, 87000 - 24200);
    assert.equal(s.sheet.cards.value, 4200);
  });

  await t.test('emergency fund', () => {
    assert.equal(s.emergency.age, 32);
    near(s.emergency.targetMonths.value, 32 / 5); // 6.4
    near(s.emergency.tiers.full.runway.value, 12000 / (3230 + 342)); // 3.36
    near(s.emergency.tiers.fatOnly.runway.value, 12000 / (2780 + 342)); // 3.84
    near(s.emergency.targetDollars.value, 6.4 * 3572); // 22,860.80
    assert.equal(s.emergency.backstop.contributions.value, 12000);
  });

  await t.test('FI', () => {
    assert.equal(s.fi.fiNumber.value, 40000 / 0.04); // goal spending at 4%
    assert.equal(s.fi.goalSource, 'spending');
    near(s.fi.fiPercent.value, 65000 / 1000000);
    assert.equal(s.fi.implied.value, 3230 * 12 / 0.04); // 969,000
    assert.equal(s.fi.goalBelowImplied.value, false);
    assert.equal(s.fi.leanFi.value, 2780 * 12 * 25); // 834,000
    near(s.fi.coastFi.value, 1000000 / Math.pow(1.05, 65 - 32), 0.01); // 199,872.54
  });

  await t.test('cards: utilization, promo deadline, orders', () => {
    const u = Object.fromEntries(s.debt.utilization.items.map((x) => [x.id, x.util.value]));
    assert.deepEqual(u, { visa: 0.3, store: 0.6 });
    near(s.debt.utilization.overall.value, 4200 / 12000);
    assert.equal(s.debt.promo.total.value, 1200);
    assert.equal(s.debt.promo.items[0].paymentsLeft, 4); // Nov, Dec, Jan, Feb
    near(s.debt.promo.monthly.value, 300);
    assert.deepEqual(s.debt.avalanche, ['visa', 'sl', 'store']); // 22%, 5%, then the 0% promo
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

  await t.test('flags', () => {
    const ids = s.flags.map((f) => f.id).sort();
    assert.deepEqual(ids, ['promo-deadlines', 'utilization-overall', 'utilization-store']);
  });
});
