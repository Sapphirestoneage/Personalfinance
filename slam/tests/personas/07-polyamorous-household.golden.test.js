// Hand-checked values for persona 7, Tess and Omar with Lin (made up), worked
// in 07-polyamorous-household.expected.md. Known failures are marked todo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize } from '../../engine/summary.js';
import { project } from '../../engine/projection.js';
import { loadGolden, near, R, KNOWN } from '../golden/golden-helpers.js';

const load = (id) => loadGolden('../../personas/households/' + id);

test('persona 7: polyamorous household (two-thirds shares, a 1099 spouse, a third adult)', async (t) => {
  const spine = load('07-polyamorous-household');
  const s = summarize(spine, R);
  const cf = s.cashflow;

  await t.test('two-thirds of each shared bill', () => {
    const by = Object.fromEntries(cf.expenses.items.map((i) => [i.id, i.amount]));
    near(by.rent, 2600); near(by.utilities, 220); near(by.internet, 53.33); near(by.groceries, 733.33);
    near(cf.expenses.total.value, 6040.67, 0.02);
    near(cf.expenses.fat.value, 4370.67, 0.02);
  });

  await t.test('withholding, FICA and the 401(k) from pay', () => {
    assert.equal(cf.income.withheld.value, 1130);
    near(cf.income.fica.value, 497.25);
    assert.equal(cf.saving.payroll.value, 500);
    assert.equal(cf.saving.afterTax.value, 400);
  });

  await t.test('take-home after business expenses', KNOWN('the 600 of business expenses only reaches the tax engine: 8,572.75 instead of 7,972.75'), () => {
    near(cf.income.takeHome.value, 7972.75);
  });

  await t.test('self-employment tax on the profit', () => {
    near(s.tax.lines.seTax.value, 6103.97);
  });

  await t.test('2026 joint tax with the SEP and health insurance deductions', KNOWN('neither deduction is modeled: balance due 6,498.52 instead of 4,661.08'), () => {
    near(s.tax.lines.agi.value, 101588.02);
    near(s.tax.balanceDue.value, 4661.08);
  });

  await t.test('surplus and runway without the paid-in-full Visa as a debt payment', KNOWN('the statement pay setting makes the 1,200 balance a minimum payment, and the set-aside follows the tax: surplus -176.28 instead of 686.21, runway 2.80 instead of 3.34'), () => {
    near(cf.surplus.value, 686.21, 0.02);
    near(s.emergency.tiers.full.runway.value, 3.344, 0.002);
  });

  await t.test('balance sheet, FI from spending, the loan schedule', () => {
    assert.equal(s.sheet.netWorth.value, 144600);
    assert.equal(s.sheet.cash.value, 20800);
    near(s.fi.fiNumber.value, 1812200, 2);
    const p = project(spine, R, { mode: 'expected' });
    assert.ok(p.events.some((e) => e.kind === 'debtPaidOff' && e.path === 'debts.omarloan.balance' && e.ym === '2035-05'));
  });

  await t.test('Lean FI counts every food, housing and transportation cost', KNOWN('needs only: 1,161,201 instead of 1,311,200'), () => {
    near(s.fi.leanFi.value, 1311200, 2);
  });
});
