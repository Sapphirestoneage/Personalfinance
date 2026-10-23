// Golden values for Cat Morales (made up), worked by hand in
// households/carloan-cat.expected.md. Known failures are marked todo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize } from '../../engine/summary.js';
import { cashflow } from '../../engine/cashflow.js';
import { project } from '../../engine/projection.js';
import { loadGolden, near, R, KNOWN } from './golden-helpers.js';

test('golden: carloan-cat (head of household, car loan paid off mid-projection)', async (t) => {
  const spine = loadGolden('carloan-cat');
  const s = summarize(spine, R);
  const cf = s.cashflow;

  await t.test('October 2026 cash flow', () => {
    assert.equal(cf.income.gross.value, 6200);
    near(cf.income.fica.value, 474.30);
    near(cf.income.takeHome.value, 4555.70);
    assert.equal(cf.saving.payroll.value, 400);
    assert.equal(cf.saving.afterTax.value, 100);
    assert.equal(cf.expenses.total.value, 3970);
    assert.equal(cf.expenses.fat.value, 3050);
    assert.equal(cf.debtMinimums.total.value, 450);
    assert.equal(cf.taxSetAside.total.value, 0);
    near(cf.surplus.value, 35.70);
    near(cf.savingsRate.gross.value, 0.0864, 0.0001);
    near(cf.savingsRate.net.value, 0.0298, 0.0001);
  });

  await t.test('2026 tax, head of household brackets', () => {
    near(s.tax.lines.taxable.value, 45450);
    near(s.tax.lines.federalIncomeTax.value, 5100);
    near(s.tax.lines.stateTax.value, 2904.98);
    near(s.tax.owed.value, 8004.98);
    near(s.tax.balanceDue.value, -1235.02);
    assert.ok(s.tax.lines.federalIncomeTax.rules.includes('FED_BRK_H'));
  });

  await t.test('the child tax credit lowers the balance due', KNOWN('credits are not modeled: refund 1,235.02 instead of 3,435.02 with the 2,200 child tax credit'), () => {
    near(s.tax.balanceDue.value, -3435.02);
  });

  await t.test('balance sheet and emergency fund', () => {
    assert.equal(s.sheet.cash.value, 14800);
    assert.equal(s.sheet.invested.value, 72000, 'the 529 is not FI money');
    assert.equal(s.sheet.netWorth.value, 104900);
    assert.equal(s.emergency.targetMonths.value, 7.2);
    near(s.emergency.tiers.full.runway.value, 3.348, 0.001);
    assert.equal(s.emergency.targetDollars.value, 31824);
  });

  await t.test('FI', () => {
    assert.equal(s.fi.fiNumber.value, 1125000);
    assert.equal(s.fi.implied.value, 1191000);
    near(s.fi.fiPercent.value, 0.064, 0.0001);
    near(s.fi.coastFi.value, 273314.61);
    near(s.fi.yearsToFi.value, 29.5, 1);
    assert.equal(s.flags.find((f) => f.id === 'fi-goal-gap').stage, 'yellow');
  });

  await t.test('Lean FI counts every food, housing and transportation cost', KNOWN('needs only: 861,000 instead of 915,000'), () => {
    assert.equal(s.fi.leanFi.value, 915000);
  });

  await t.test('the car loan makes its last payment in September 2027 and then stops', () => {
    const p = project(spine, R, { mode: 'expected' });
    const paid = Object.fromEntries(p.events.filter((e) => e.kind === 'debtPaidOff').map((e) => [e.path.split('.')[1], e.ym]));
    assert.deepEqual(paid, { carloan: '2027-09', visa: '2029-10' });
    assert.ok(cashflow(spine, R, '2027-09').debtMinimums.items.some((i) => i.id === 'carloan'));
    assert.equal(cashflow(spine, R, '2027-10').debtMinimums.total.value, 25);
    near(cashflow(spine, R, '2027-10').surplus.value, 460.70);
  });
});
