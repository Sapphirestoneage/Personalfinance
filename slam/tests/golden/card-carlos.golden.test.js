// Golden values for Carlos Reyes (made up), worked by hand in
// households/card-carlos.expected.md. Known failures are marked todo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize, payoffOrders } from '../../engine/summary.js';
import { project } from '../../engine/projection.js';
import { loadGolden, near, R, KNOWN } from './golden-helpers.js';

test('golden: card-carlos (cards, payday loan, negative net worth)', async (t) => {
  const spine = loadGolden('card-carlos');
  const s = summarize(spine, R);
  const cf = s.cashflow;

  await t.test('October 2026 cash flow', () => {
    near(cf.income.gross.value, 3556.67);
    near(cf.income.withheld.value, 303.33);
    near(cf.income.fica.value, 245.31);
    near(cf.income.takeHome.value, 3008.03);
    assert.equal(cf.expenses.total.value, 2222, 'his share of shared bills');
    assert.equal(cf.expenses.fat.value, 1802);
    const mins = Object.fromEntries(cf.debtMinimums.items.map((i) => [i.id, i.amount]));
    near(mins.visa, 163.96, 0.01, 'house default minimum');
    assert.equal(mins.payday, 600, 'never more than the balance');
    near(cf.debtMinimums.total.value, 963.96);
    near(cf.taxSetAside.total.value, 191.29);
    near(cf.surplus.value, -369.22, 0.02);
    near(cf.savingsRate.gross.value, -0.1038, 0.0001);
  });

  await t.test('2026 tax with a small 1099 profit', () => {
    near(s.tax.lines.seTax.value, 494.53);
    near(s.tax.lines.federalIncomeTax.value, 2827.93);
    near(s.tax.lines.stateTax.value, 1656.57);
    near(s.tax.owed.value, 4979.03);
    near(s.tax.balanceDue.value, 1339.03);
    assert.ok(s.tax.notModeled.includes('New York City income tax'));
  });

  await t.test('balance sheet and emergency fund', () => {
    assert.equal(s.sheet.netWorth.value, -8005);
    assert.equal(s.sheet.invested.value, 0);
    assert.equal(s.emergency.targetMonths.value, 4.6);
    near(s.emergency.tiers.full.runway.value, 0.1146, 0.0001);
    assert.equal(s.emergency.targetDollars.value, 14656);
  });

  await t.test('FI from spending, coast', () => {
    assert.equal(s.fi.fiNumber.value, 666600);
    assert.equal(s.fi.goalSource, null);
    assert.equal(s.fi.fiPercent.value, 0);
    near(s.fi.coastFi.value, 85884.49);
  });

  await t.test('Lean FI counts every food, housing and transportation cost', KNOWN('needs only: 462,600 instead of 540,600'), () => {
    assert.equal(s.fi.leanFi.value, 540600);
  });

  await t.test('utilization, all red', () => {
    const u = Object.fromEntries(s.debt.utilization.items.map((x) => [x.id, x.util.value]));
    near(u.visa, 0.96, 0.0001); near(u.store, 0.9, 0.0001);
    near(s.debt.utilization.personal.value, 0.9462, 0.0001);
    const st = Object.fromEntries(s.flags.map((f) => [f.id, f.stage]));
    assert.equal(st['utilization-personal'], 'red');
    assert.equal(st.runway, 'red');
  });

  await t.test('payoff dates on minimums only (the projection), and the avalanche order', () => {
    const p = project(spine, R, { mode: 'expected' });
    const paid = Object.fromEntries(p.events.filter((e) => e.kind === 'debtPaidOff').map((e) => [e.path.split('.')[1], e.ym]));
    assert.deepEqual(paid, { payday: '2026-12', bnpl: '2027-02', mom: '2028-10', store: '2031-12', visa: '2041-11' });
    assert.equal(p.firstShortfall, '2026-11');
    near(p.months[0].cash, -83.18);
    assert.deepEqual(payoffOrders(spine, R, s).avalanche.order, ['payday', 'store', 'visa', 'bnpl', 'mom']);
  });
});
