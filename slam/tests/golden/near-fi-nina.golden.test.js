// Golden values for Nina and Lev Petrov (made up), worked by hand in
// households/near-fi-nina.expected.md. Known failures are marked todo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize, payoffOrders } from '../../engine/summary.js';
import { project } from '../../engine/projection.js';
import { loadGolden, near, R, KNOWN } from './golden-helpers.js';

test('golden: near-fi-nina (close to FI, married, small mortgage)', async (t) => {
  const spine = loadGolden('near-fi-nina');
  const s = summarize(spine, R);
  const cf = s.cashflow;

  await t.test('October 2026 cash flow for two earners', () => {
    assert.equal(cf.income.gross.value, 13500);
    assert.equal(cf.income.withheld.value, 1850);
    near(cf.income.fica.value, 1032.75);
    near(cf.income.takeHome.value, 8317.25);
    assert.equal(cf.saving.payroll.value, 2300);
    assert.equal(cf.saving.afterTax.value, 2000);
    assert.equal(cf.expenses.total.value, 4130);
    assert.equal(cf.expenses.fat.value, 2710);
    assert.equal(cf.debtMinimums.total.value, 1650);
    assert.equal(cf.taxSetAside.total.value, 0);
    near(cf.surplus.value, 537.25);
    near(cf.savingsRate.gross.value, 0.3583, 0.0001);
    near(cf.savingsRate.net.value, 0.3051, 0.0001);
  });

  await t.test('2026 tax, joint, with gains stacked on top', () => {
    near(s.tax.lines.grossIncome.value, 144400);
    near(s.tax.lines.taxable.value, 112200);
    near(s.tax.lines.ordinaryTax.value, 11908);
    near(s.tax.lines.gainsTax.value, 1500);
    near(s.tax.lines.federalIncomeTax.value, 13408);
    near(s.tax.lines.stateTax.value, 6598.40);
    near(s.tax.owed.value, 20006.40);
    near(s.tax.balanceDue.value, -2193.60);
    assert.equal(s.tax.lines.additionalMedicare.value, 0);
  });

  await t.test('balance sheet and emergency fund', () => {
    assert.equal(s.sheet.cash.value, 72000);
    assert.equal(s.sheet.invested.value, 1500000);
    assert.equal(s.sheet.assets.value, 2123000);
    assert.equal(s.sheet.netWorth.value, 2028000);
    assert.equal(s.emergency.age, 47);
    assert.equal(s.emergency.targetMonths.value, 9.4);
    near(s.emergency.tiers.full.runway.value, 12.457, 0.001);
    assert.equal(s.emergency.targetDollars.value, 54332);
    assert.equal(s.emergency.gap.value, 0);
  });

  await t.test('FI', () => {
    assert.equal(s.fi.fiNumber.value, 1600000);
    assert.equal(s.fi.implied.value, 1239000);
    near(s.fi.fiPercent.value, 0.9375, 0.0001);
    near(s.fi.coastFi.value, 664833.05);
    assert.equal(s.fi.coastReached, true);
    near(s.fi.yearsToFi.value, 0.8, 0.3);
  });

  await t.test('Lean FI counts every food, housing and transportation cost', KNOWN('needs only: 693,000 instead of 813,000'), () => {
    assert.equal(s.fi.leanFi.value, 813000);
  });

  await t.test('the mortgage ends in January 2032 on its payment', () => {
    const p = project(spine, R, { mode: 'expected' });
    assert.ok(p.events.some((e) => e.kind === 'debtPaidOff' && e.ym === '2032-01'));
    // The payoff orders pay the surplus as extra, so they land earlier; that is a different question.
    assert.ok(payoffOrders(spine, R, s).avalanche.debtFreeYm < '2032-01');
  });

  await t.test('flags: runway green, FI goal green', () => {
    const st = Object.fromEntries(s.flags.map((f) => [f.id, f.stage]));
    assert.equal(st.runway, 'green');
    assert.equal(st['fi-goal-gap'], 'green');
    assert.equal(st['tax-2026'], 'green');
  });
});
