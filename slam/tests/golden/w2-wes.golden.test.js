// Golden values for Wes Delgado (made up), worked by hand in
// households/w2-wes.expected.md. Known failures are marked todo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize, payoffOrders } from '../../engine/summary.js';
import { project } from '../../engine/projection.js';
import { loadGolden, near, R, KNOWN } from './golden-helpers.js';

test('golden: w2-wes (W-2, 401(k) match, card paid in full)', async (t) => {
  const spine = loadGolden('w2-wes');
  const s = summarize(spine, R);
  const cf = s.cashflow;

  await t.test('October 2026 income: 26 paychecks a year', () => {
    near(cf.income.gross.value, 6933.33);
    near(cf.income.withheld.value, 1235);
    near(cf.income.fica.value, 530.40);
    near(cf.income.takeHome.value, 4647.93);
    assert.equal(cf.saving.payroll.value, 520);
    assert.equal(cf.saving.afterTax.value, 450);
    assert.equal(cf.expenses.total.value, 3232);
    assert.equal(cf.expenses.fat.value, 2692);
    assert.equal(cf.taxSetAside.total.value, 0);
  });

  await t.test('a card paid in full each month is not a debt payment on top of spending', KNOWN('the statement pay setting makes the 900 balance a minimum payment, so surplus reads 65.93 instead of 965.93'), () => {
    assert.equal(cf.debtMinimums.total.value, 0);
    near(cf.surplus.value, 965.93);
  });

  await t.test('savings rate without the card double count', KNOWN('follows the surplus: 14.9% of gross instead of 27.9%'), () => {
    near(cf.savingsRate.gross.value, 0.2792, 0.0001);
    near(cf.savingsRate.net.value, 0.3046, 0.0001);
  });

  await t.test('2026 tax: a refund', () => {
    near(s.tax.lines.grossIncome.value, 76960);
    near(s.tax.lines.federalIncomeTax.value, 8101.20);
    near(s.tax.lines.stateTax.value, 3558.84);
    near(s.tax.owed.value, 11660.04);
    near(s.tax.withheld.value, 14820);
    near(s.tax.balanceDue.value, -3159.96);
    near(s.tax.marginal.value, 0.274, 0.0001);
  });

  await t.test('balance sheet and Roth basis', () => {
    assert.equal(s.sheet.cash.value, 19500);
    assert.equal(s.sheet.invested.value, 139000);
    assert.equal(s.sheet.netWorth.value, 157600);
    assert.equal(s.emergency.backstop.contributions.value, 24000);
  });

  await t.test('emergency fund months on spending alone', KNOWN('the 900 card balance is added to monthly need: 4.72 months and a 31,404 target instead of 6.03 and 24,564'), () => {
    assert.equal(s.emergency.targetMonths.value, 7.6);
    near(s.emergency.tiers.full.runway.value, 6.033, 0.001);
    assert.equal(s.emergency.targetDollars.value, 24564);
  });

  await t.test('FI number, percent, coast, years', () => {
    assert.equal(s.fi.fiNumber.value, 1100000);
    assert.equal(s.fi.goalSource, 'direct');
    assert.equal(s.fi.implied.value, 969600);
    near(s.fi.fiPercent.value, 0.12636, 0.00001);
    near(s.fi.coastFi.value, 294633.15);
    // Closed form 19.5 years; with the yearly refund invested (as the projection does) 18.3.
    near(s.fi.yearsToFi.value, 18.3, 1, 'years to FI');
  });

  await t.test('Lean FI counts every food, housing and transportation cost', KNOWN('needs only: 741,600 instead of 807,600'), () => {
    assert.equal(s.fi.leanFi.value, 807600);
  });

  await t.test('the employer match counts as saving', KNOWN('matchFormula is text; no number reaches cash flow, so saving from pay is 520 instead of 728'), () => {
    near(cf.saving.payroll.value, 728);
  });

  await t.test('a statement-paid card clears in November with no interest', KNOWN('the projection accrues 16.49 of interest on a balance that is paid by its due date (debtPaid 916.49, not 900)'), () => {
    const p = project(spine, R, { mode: 'expected' });
    assert.equal(p.months[0].ym, '2026-11');
    assert.equal(p.months[0].debtPaid, 900);
  });

  await t.test('payoff orders follow the pay-in-full setting', KNOWN('payoffPlan uses the 35 minimum plus surplus and reports August 2027; the projection clears the card in November 2026'), () => {
    assert.equal(payoffOrders(spine, R, s).avalanche.debts[0].payoffYm, '2026-11');
  });

  await t.test('utilization and flags', () => {
    near(s.debt.utilization.personal.value, 0.1125, 0.0001);
    const st = Object.fromEntries(s.flags.map((f) => [f.id, f.stage]));
    assert.equal(st['utilization-visa'], 'yellow');
    assert.equal(st['tax-2026'], 'green');
    assert.equal(st['fi-goal-gap'], 'green');
  });
});
