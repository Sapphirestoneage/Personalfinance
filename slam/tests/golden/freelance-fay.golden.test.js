// Golden values for Fay Nakamura (made up), worked by hand in
// households/freelance-fay.expected.md. Known failures are marked todo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize } from '../../engine/summary.js';
import { loadGolden, near, R, KNOWN } from './golden-helpers.js';

test('golden: freelance-fay (1099, quarterly estimates, solo 401(k))', async (t) => {
  const spine = loadGolden('freelance-fay');

  await t.test('the summary with flags does not throw', KNOWN('buildFlags reads tax.balanceDue.rough[0] on a rough-with-no-rough-inputs balance due (NYC tax not modeled) and labelFor(undefined) throws; the Dashboard cannot load'), () => {
    assert.doesNotThrow(() => summarize(spine, R));
  });

  const s = summarize(spine, R, { flags: false });
  const cf = s.cashflow;

  await t.test('October 2026 expenses and saving from take-home', () => {
    assert.equal(cf.expenses.total.value, 3882);
    assert.equal(cf.expenses.fat.value, 2982);
    assert.equal(cf.debtMinimums.total.value, 0);
    assert.equal(cf.saving.afterTax.value, 825);
    assert.equal(cf.income.withheld.value, 0);
    assert.equal(cf.income.fica.value, 0);
  });

  await t.test('business expenses come out of the month\'s money', KNOWN('cash flow counts the 7,500 gross; the 900 of business expenses only reaches the tax engine'), () => {
    near(cf.income.takeHome.value, 6600);
  });

  await t.test('the solo 401(k) deferral is saving even with no W-2 paycheck', KNOWN('employerRetirement contributions are skipped unless a W-2 stream is active: payroll saving reads 0, not 1,000'), () => {
    assert.equal(cf.saving.payroll.value, 1000);
  });

  await t.test('self-employment tax', () => {
    near(s.tax.lines.seTax.value, 11190.60);
    near(s.tax.lines.seDeduction.value, 5595.30);
    assert.equal(s.tax.nextEstimated.date, '2027-01-15');
    assert.equal(s.tax.missingText, null);
  });

  await t.test('2026 income tax with the solo 401(k) and health insurance deductions', KNOWN('neither deduction is modeled: AGI 73,604.70 instead of 56,564.70, balance due 10,531.28 instead of 6,855.85'), () => {
    near(s.tax.lines.agi.value, 56564.70);
    near(s.tax.lines.federalIncomeTax.value, 4607.76);
    near(s.tax.lines.stateTax.value, 2457.49);
    near(s.tax.owed.value, 18255.85);
    near(s.tax.balanceDue.value, 6855.85);
  });

  await t.test('set-aside and surplus', KNOWN('follows the balance due and the gross: set-aside 1,290.18 and surplus 1,502.82 instead of 765.12 and 127.88'), () => {
    near(cf.taxSetAside.total.value, 765.12);
    near(cf.surplus.value, 127.88);
  });

  await t.test('balance sheet and emergency fund', () => {
    assert.equal(s.sheet.cash.value, 28000);
    assert.equal(s.sheet.invested.value, 153000);
    assert.equal(s.sheet.netWorth.value, 181000);
    assert.equal(s.emergency.backstop.contributions.value, 30000);
    assert.equal(s.emergency.targetMonths.value, 8);
    near(s.emergency.tiers.full.runway.value, 7.213, 0.001);
    assert.equal(s.emergency.targetDollars.value, 31056);
  });

  await t.test('FI', () => {
    assert.equal(s.fi.fiNumber.value, 1200000);
    assert.equal(s.fi.implied.value, 1164600);
    near(s.fi.fiPercent.value, 0.1275, 0.0001);
    near(s.fi.coastFi.value, 354363.33);
    near(s.fi.yearsToFi.value, 20.2, 1);
  });

  await t.test('Lean FI counts every food, housing and transportation cost', KNOWN('needs only: 804,600 instead of 894,600'), () => {
    assert.equal(s.fi.leanFi.value, 894600);
  });
});
