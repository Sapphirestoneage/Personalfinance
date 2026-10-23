// Hand-checked values for persona 11, Ruth Castellano (made up), worked in
// 11-widow.expected.md. Known failures are marked todo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize } from '../../engine/summary.js';
import { loadGolden, near, R, KNOWN } from '../golden/golden-helpers.js';

const load = (id) => loadGolden('../../personas/households/' + id);

test('persona 11: widow (survivor benefits, a life insurance payout, one income where there were two)', async (t) => {
  const spine = load('11-widow');

  await t.test('the summary with flags does not throw', KNOWN('Social Security income makes the balance due rough with no rough input; buildFlags calls labelFor(undefined); the Dashboard cannot load'), () => {
    assert.doesNotThrow(() => summarize(spine, R));
  });

  const s = summarize(spine, R, { flags: false });
  const cf = s.cashflow;

  await t.test('October 2026 income and spending', () => {
    assert.equal(cf.income.gross.value, 5600);
    assert.equal(cf.income.withheld.value, 380);
    near(cf.income.fica.value, 168.30);
    near(cf.income.takeHome.value, 5051.70);
    assert.equal(cf.expenses.total.value, 3860);
    assert.equal(cf.expenses.fat.value, 2310);
  });

  await t.test('the paid-in-full Visa is not a debt payment: surplus and runway', KNOWN('the statement pay setting makes the 900 balance a minimum payment: surplus 291.70 instead of 1,191.70, runway 51.3 instead of 63.2 months'), () => {
    near(cf.surplus.value, 1191.70);
    near(s.emergency.tiers.full.runway.value, 63.21, 0.01);
  });

  await t.test('2026 joint tax: Paul\'s half year of wages, 85% of the Social Security taxable, the NY pension exclusion', KNOWN('Social Security benefits are not modeled and NY taxes the pension: refund 3,582.10 instead of 2,706.10'), () => {
    near(s.tax.lines.grossIncome.value, 91425);
    near(s.tax.lines.federalIncomeTax.value, 6251);
    near(s.tax.lines.stateTax.value, 2912.90);
    near(s.tax.balanceDue.value, -2706.10);
  });

  await t.test('what the engine does get: wages to June 15, withholding, dividends in the 0% band', () => {
    near(s.tax.inputs.wages, 46750 + 26400);
    near(s.tax.withheld.value, 11870);
    assert.equal(s.tax.lines.gainsTax.value, 0);
    assert.ok(s.tax.notModeled.some((x) => /Social Security/.test(x)));
  });

  await t.test('balance sheet and the Rule of 5', () => {
    assert.equal(s.sheet.netWorth.value, 1413100);
    assert.equal(s.sheet.invested.value, 678000);
    assert.equal(s.sheet.cash.value, 244000);
    assert.equal(s.emergency.age, 63);
    assert.equal(s.emergency.targetMonths.value, 12.6);
  });

  await t.test('the FI number nets out pension and Social Security income', KNOWN('the FI number covers all spending (1,200,000, 56.5%) and ignores 3,250 a month of guaranteed income; net of it she is past FI'), () => {
    assert.ok(s.fi.fiPercent.value >= 1, 'FI percent: ' + s.fi.fiPercent.value);
  });
});
