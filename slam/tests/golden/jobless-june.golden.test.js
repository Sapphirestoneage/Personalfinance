// Golden values for June Okafor (made up), worked by hand in
// households/jobless-june.expected.md. Known failures are marked todo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize, payoffOrders } from '../../engine/summary.js';
import { project } from '../../engine/projection.js';
import { loadGolden, near, R, KNOWN } from './golden-helpers.js';

test('golden: jobless-june (between jobs, unemployment, no withholding)', async (t) => {
  const spine = loadGolden('jobless-june');
  const s = summarize(spine, R);
  const cf = s.cashflow;

  await t.test('October 2026 cash flow', () => {
    near(cf.income.gross.value, 2184, 0.01, 'gross: unemployment 504 x 52 / 12');
    assert.equal(cf.income.withheld.value, 0);
    assert.equal(cf.income.fica.value, 0);
    near(cf.income.takeHome.value, 2184);
    assert.equal(cf.expenses.total.value, 2910);
    assert.equal(cf.expenses.fat.value, 2270);
    assert.equal(cf.debtMinimums.total.value, 75);
    near(cf.taxSetAside.total.value, 247.12, 0.01, 'set-aside 1729.83 / 7');
    near(cf.surplus.value, -1048.12);
    near(cf.savingsRate.gross.value, -0.4799, 0.0001);
  });

  await t.test('2026 tax: 8 months of wages, 17 weeks of unemployment', () => {
    near(s.tax.lines.grossIncome.value, 52568);
    near(s.tax.lines.federalIncomeTax.value, 4128.16);
    near(s.tax.lines.stateTax.value, 2241.67);
    near(s.tax.owed.value, 6369.83);
    near(s.tax.withheld.value, 4640);
    near(s.tax.balanceDue.value, 1729.83);
    near(s.tax.marginal.value, 0.174, 0.0001);
    assert.equal(s.tax.nextEstimated.date, '2027-01-15');
  });

  await t.test('balance sheet', () => {
    assert.equal(s.sheet.cash.value, 9000);
    assert.equal(s.sheet.invested.value, 38000);
    assert.equal(s.sheet.netWorth.value, 53600);
  });

  await t.test('emergency fund', () => {
    assert.equal(s.emergency.age, 35);
    assert.equal(s.emergency.targetMonths.value, 7);
    near(s.emergency.tiers.full.runway.value, 3.015, 0.001);
    near(s.emergency.tiers.fatOnly.runway.value, 3.838, 0.001);
    assert.equal(s.emergency.targetDollars.value, 20895);
    assert.equal(s.emergency.gap.value, 11895);
  });

  await t.test('FI number, percent, coast', () => {
    assert.equal(s.fi.fiNumber.value, 900000);
    assert.equal(s.fi.goalSource, 'spending');
    assert.equal(s.fi.implied.value, 873000);
    near(s.fi.fiPercent.value, 0.04222, 0.00001);
    near(s.fi.coastFi.value, 208239.70);
  });

  await t.test('Lean FI counts every food, housing and transportation cost', KNOWN('the engine leaves out FAT expenses tagged as wants (eating out): 651,000 instead of 681,000'), () => {
    assert.equal(s.fi.leanFi.value, 681000);
  });

  await t.test('years to FI is never while saving is negative', KNOWN('the projection reports FI in 52.3 years: invested money grows at 5% while cash goes to -266,000; a cash shortfall should stop the FI clock'), () => {
    assert.equal(s.fi.yearsToFi.value, null);
  });

  await t.test('Visa payoff on minimums: February 2031, about 1,468 of interest', () => {
    const po = payoffOrders(spine, R, s).avalanche;
    assert.equal(po.debts[0].payoffYm, '2031-02');
    near(po.totalInterest.value, 1468.35, 0.5);
  });

  await t.test('flags: the cliff first, then utilization and unemployment', () => {
    assert.equal(s.flags[0].id, 'income-cliff');
    assert.equal(s.cliff.from, '2027-03-08');
    near(s.cliff.costs, 3232.12);
    near(s.cliff.likely.value, 2900);
    const st = Object.fromEntries(s.flags.map((f) => [f.id, f.stage]));
    assert.equal(st['utilization-visa'], 'red');
    assert.equal(st['unemployment-withholding-ui'], 'yellow');
    assert.equal(st.runway, 'yellow');
    assert.equal(st['tax-2026'], 'yellow');
  });

  await t.test('projection events: unemployment ends, the Visa is paid off', () => {
    const p = project(spine, R, { mode: 'expected' });
    const kinds = p.events.map((e) => e.ym + ':' + e.kind);
    assert.ok(kinds.includes('2027-03:incomeEnds'));
    assert.ok(kinds.includes('2031-02:debtPaidOff'));
    assert.ok(p.firstShortfall !== null, 'cash runs out before the new job is certain');
  });
});
