// Hand-checked values for persona 1, Mila Soto (made up), worked in
// 01-sugar-baby.expected.md. Known failures are marked todo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize } from '../../engine/summary.js';
import { loadGolden, near, R, KNOWN } from '../golden/golden-helpers.js';

const load = (id) => loadGolden('../../personas/households/' + id);

test('persona 1: sugar baby (an allowance with no income kind for it)', async (t) => {
  const spine = load('01-sugar-baby');
  const s = summarize(spine, R);
  const cf = s.cashflow;

  await t.test('October 2026 cash flow', () => {
    near(cf.income.gross.value, 5383.33);
    near(cf.income.takeHome.value, 5006.01);
    assert.equal(cf.expenses.total.value, 4497);
    assert.equal(cf.expenses.fat.value, 3092);
    near(cf.debtMinimums.total.value, 146.49, 0.02);
    assert.equal(cf.saving.afterTax.value, 100);
  });

  await t.test('the allowance as a gift: no tax, a small refund', KNOWN('no gift income kind; "other income" is taxed as ordinary income: balance due 5,601.40 instead of a 140.60 refund'), () => {
    near(s.tax.balanceDue.value, -140.60);
  });

  await t.test('the allowance as compensation: self-employment tax applies', KNOWN('"other income" carries no self-employment tax: 5,601.40 instead of 9,858.49'), () => {
    near(s.tax.lines.seTax.value, 4662.75);
    near(s.tax.balanceDue.value, 9858.49);
  });

  await t.test('surplus under the gift reading', KNOWN('follows the tax: -537.68 instead of 262.52'), () => {
    assert.equal(cf.taxSetAside.total.value, 0);
    near(cf.surplus.value, 262.52);
  });

  await t.test('balance sheet, emergency fund, FI', () => {
    assert.equal(s.sheet.netWorth.value, 10250);
    assert.equal(s.sheet.cash.value, 10400);
    assert.equal(s.emergency.targetMonths.value, 4.8);
    near(s.emergency.tiers.full.runway.value, 2.24, 0.01);
    assert.equal(s.emergency.targetDollars.value, 22292);
    assert.equal(s.fi.fiNumber.value, 1349100);
    assert.equal(s.fi.neverAtThisRate, true);
  });

  await t.test('Lean FI counts every food, housing and transportation cost', KNOWN('needs only: 822,600 instead of 927,600'), () => {
    assert.equal(s.fi.leanFi.value, 927600);
  });
});
