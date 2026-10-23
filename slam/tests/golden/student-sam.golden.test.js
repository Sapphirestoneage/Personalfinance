// Golden values for Sam Lindqvist (made up), worked by hand in
// households/student-sam.expected.md. Known failures are marked todo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize, payoffOrders } from '../../engine/summary.js';
import { project } from '../../engine/projection.js';
import { loadGolden, near, R, KNOWN } from './golden-helpers.js';

test('golden: student-sam (federal loans in deferment, help from parents)', async (t) => {
  const spine = loadGolden('student-sam');
  const s = summarize(spine, R);
  const cf = s.cashflow;

  await t.test('October 2026 cash flow', () => {
    assert.equal(cf.income.gross.value, 1400);
    near(cf.income.fica.value, 68.85);
    near(cf.income.takeHome.value, 1271.15);
    assert.equal(cf.expenses.total.value, 1585);
    assert.equal(cf.expenses.items.find((i) => i.id === 'phone').amount, 0, 'covered by Parents');
    assert.equal(cf.expenses.items.find((i) => i.id === 'rent').amount, 800, 'a third of the rent');
    assert.equal(cf.expenses.fat.value, 1375);
    assert.equal(cf.debtMinimums.total.value, 40);
    assert.equal(cf.saving.afterTax.value, 50);
  });

  await t.test('help from parents is a gift, not taxable income', KNOWN('no gift income type: the 6,000 a year is taxed as other income, balance due 46.20 instead of a 872.55 refund'), () => {
    near(s.tax.lines.grossIncome.value, 19800);
    near(s.tax.lines.federalIncomeTax.value, 370);
    near(s.tax.lines.stateTax.value, 477.45);
    near(s.tax.balanceDue.value, -872.55);
  });

  await t.test('no set-aside on a refund, surplus', KNOWN('follows the tax: set-aside 6.60 and surplus -410.45 instead of 0 and -403.85'), () => {
    assert.equal(cf.taxSetAside.total.value, 0);
    near(cf.surplus.value, -403.85);
  });

  await t.test('the summer internship total counts once, in 2026', () => {
    near(s.tax.inputs.wages, 19800, 0.01, 'W-2 wages: 10,800 + 9,000');
    near(s.tax.inputs.withheldFederal + s.tax.inputs.withheldState, 1720);
  });

  await t.test('balance sheet and emergency fund', () => {
    assert.equal(s.sheet.netWorth.value, -22000);
    assert.equal(s.sheet.cash.value, 3600);
    assert.equal(s.emergency.backstop.contributions.value, 1800);
    assert.equal(s.emergency.targetMonths.value, 4.8);
    near(s.emergency.tiers.full.runway.value, 2.215, 0.001);
    assert.equal(s.emergency.targetDollars.value, 7800);
  });

  await t.test('FI', () => {
    assert.equal(s.fi.fiNumber.value, 475500);
    near(s.fi.fiPercent.value, 0.003785, 0.000001);
    near(s.fi.coastFi.value, 64326.40);
    assert.equal(s.fi.yearsToFi.value, null);
    assert.equal(s.fi.neverAtThisRate, true);
  });

  await t.test('Lean FI counts every food, housing and transportation cost', KNOWN('needs only: 367,500 instead of 412,500'), () => {
    assert.equal(s.fi.leanFi.value, 412500);
  });

  await t.test('the Visa clears in October 2027 on the default minimum', () => {
    const p = project(spine, R, { mode: 'expected' });
    assert.ok(p.events.some((e) => e.kind === 'debtPaidOff' && e.ym === '2027-10'));
  });

  await t.test('a deferred loan with no payment does not report 50 years of interest', KNOWN('payoffPlan compounds 27,000 at 6.53% for 600 months at $0 a month and reports 525,784.67 of interest'), () => {
    const po = payoffOrders(spine, R, s).avalanche;
    const loan = po.debts.find((d) => d.id === 'fedloan');
    assert.ok(loan.interest < 2000, 'interest reported: ' + loan.interest);
  });
});
