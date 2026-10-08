/* Tie-out: the engine against each household's hand-computed workpaper.
   Expected values come from <name>-expected.json, written by
   tests/households/expected.py from the fixture's facts, never from the engine. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compute } from '../../engine/compute.js';
import { loadData, loadHousehold, loadExpected } from './load-data.js';

const data = loadData();
const TODAY = '2026-10-05';
const close = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= (tol || 0), what + ': engine ' + a + ' vs workpaper ' + b);

for (const name of ['jordan', 'dev', 'leah']) {
  const rec = loadHousehold(name); const E = loadExpected(name);
  const R = compute(rec, data, { today: TODAY });
  const M = R.metrics; const S = R.sun.outputs;
  const v = id => { assert.equal(M[id].status, 'ok', id + ' should compute: ' + JSON.stringify(M[id].needs)); return M[id].value; };

  test(name + ': income slots tie out', () => {
    assert.equal(S.income.grossMonthly.cents, E.grossMonthly);
    assert.equal(S.income.takeHomeMonthly.cents, E.takeHomeMonthly);
    assert.equal(S.income.pretaxContribMonthly.cents, E.pretaxContribMonthly);
    assert.equal(S.income.pretaxOtherMonthly.cents, E.pretaxOtherMonthly);
    assert.equal(S.income.matchMonthly.cents, E.matchMonthly);
    assert.equal(S.income.matchFormula ? S.income.matchFormula.maxMonthly : 0, E.matchMaxMonthly);
    assert.equal(S.income.workHoursMonthly, E.workHoursMonthly);
    assert.equal(S.income.workCostsMonthly.cents, E.workCostsMonthly);
  });
  test(name + ': spending slots tie out', () => {
    assert.equal(S.spending.baselineMonthly.cents, E.baselineMonthly);
    assert.equal(S.safety.premiumsMonthly.cents, E.premiumsMonthly);
    assert.equal(v('spending').cents, E.spending);
    assert.deepEqual([v('spending').range.low, v('spending').range.high], E.spendingRange);
    assert.equal(v('fatFloor').cents, E.fatFloor);
    assert.equal(M.fixedRate.fixedMonthly.cents, E.fixedMonthly);
    assert.equal(S.spending.mistakesAnnual.cents, E.mistakesAnnual);
    assert.equal(S.spending.savingsLandingMonthly.cents, E.savingsLandingMonthly);
    Object.keys(E.byCategory).forEach(c => assert.equal(S.spending.byCategory[c].cents, E.byCategory[c], c));
  });
  test(name + ': debt slots tie out', () => {
    assert.equal(v('totalDebt').cents, E.totalDebt);
    assert.equal(v('debtService').cents, E.debtServiceMonthly);
    close(v('weightedApr').value, E.weightedApr, 1e-6, 'weighted APR');
    assert.equal(v('annualInterest').cents, E.annualInterest);
    close(v('utilization').value, E.utilizationTotal, 1e-6, 'utilization');
    Object.keys(E.utilizationPerCard).forEach(id => close(M.utilization.perCard[id], E.utilizationPerCard[id], 1e-6, id));
    if (E.promoCliffs.length) assert.deepEqual(v('promoCliff').value.map(c => [c.rowId, c.monthsLeft, c.costAfterAnnual]), E.promoCliffs.map(c => [c.rowId, c.monthsLeft, c.costAfterAnnual]));
    else assert.equal(M.promoCliff.status, 'needs');
    assert.deepEqual(S.debt.payoffOrders.orders, E.payoffOrders);
    assert.equal(S.debt.debtFreeDate, E.debtFreeDate);
    assert.deepEqual(S.debt.payoffOrders.interest, E.payoffInterest);
    assert.deepEqual(S.debt.freedCashByMonth.map(m => [m.month, m.cents]), E.freedCashByMonth.map(m => [m.month, m.cents]));
    E.wallet.forEach(w => { const c = S.debt.wallet.cards.find(x => x.rowId === w.rowId); assert.ok(c, w.rowId); ['rewardsAnnual', 'creditsUsedAnnual', 'feeAnnual', 'netAnnual', 'baselineAnnual', 'unusedCreditsAnnual'].forEach(k => assert.equal(c[k], w[k], w.rowId + '.' + k)); });
    assert.equal(S.debt.wallet.rewardsLeftAnnual, E.rewardsLeftAnnual);
    assert.equal(S.debt.creditScore.score, E.creditScore);
  });
  test(name + ': investment slots tie out', () => {
    assert.equal(v('netWorth').cents, E.netWorth);
    assert.equal(S.invest.totalAssets.cents, E.totalAssets);
    assert.equal(S.invest.investedAssets.cents, E.investedAssets);
    assert.equal(S.invest.cashBalances.cents, E.cashBalances);
    assert.deepEqual(S.invest.balancesByBucket, E.balancesByBucket);
    assert.deepEqual(S.invest.balancesByLiquidity, E.balancesByLiquidity);
    Object.keys(E.allocation).forEach(k => close(S.invest.allocation[k], E.allocation[k], 1e-6, 'allocation ' + k));
    close(S.invest.allocation.usShare, E.allocationUsShare, 1e-6, 'US share');
    close(S.invest.weightedExpenseRatio, E.weightedExpenseRatio, 1e-8, 'weighted ER');
    assert.equal(S.invest.feeDragAnnual.cents, E.feeDragAnnual);
    assert.deepEqual({ employee: S.invest.annualContributions.employee, employer: S.invest.annualContributions.employer, total: S.invest.annualContributions.total }, E.annualContributions);
    assert.deepEqual(S.invest.roomLeft.map(r => [r.limitId, r.limit, r.used, r.left]), E.roomLeft.map(r => [r.limitId, r.limit, r.used, r.left]));
    close(S.invest.matchCapture.ratio, E.matchCapture, 1e-6, 'match capture');
    assert.equal(S.invest.matchCapture.dollarsLeftAnnual, E.matchDollarsLeftAnnual);
  });
  test(name + ': safety slots tie out', () => {
    close(S.safety.ruleOf5Months, E.ruleOf5Months, 1e-9, 'rule of 5 months');
    assert.equal(v('ruleOf5Target').cents, E.ruleOf5Target);
    ['full', 'draftt', 'fat'].forEach(k => close(S.safety.runway[k], E.runway[k], 1e-4, 'runway ' + k));
    assert.equal(v('emergencyGap').cents, E.gap);
    assert.equal(S.safety.monthlyToClose.cents, E.monthlyToClose);
    assert.equal(v('cashDrag').cents, E.cashDragAnnual);
  });
  test(name + ': engine metrics tie out', () => {
    assert.equal(v('surplus').cents, E.surplus);
    close(v('savingsRateTakeHome').value, E.savingsRateTakeHome, 1e-6, 'savings rate');
    close(v('savingsRateGross').value, E.savingsRateGross, 1e-6, 'FIRE savings rate');
    assert.equal(M.leak.leakMonthly.cents, E.leakMonthly);
    close(v('leak').value, E.leakRate, 1e-6, 'leak rate');
    Object.keys(E.draftt).forEach(k => close(v('draftt').value[k], E.draftt[k], 1e-6, 'DRAFTT ' + k));
    close(v('shelterRate').value, E.shelterRate, 1e-6, 'shelter');
    close(v('fixedRate').value, E.fixedRate, 1e-6, 'fixed');
    assert.equal(v('realHourlyWage').cents, E.realHourlyWage);
    assert.equal(M.realHourlyWage.statedHourly, E.statedHourlyWage);
    close(v('dti').value, E.dti, 1e-6, 'DTI');
    close(v('debtToAssets').value, E.debtToAssets, 1e-6, 'debt to assets');
    close(v('liquidityRate').value, E.liquidityRate, 1e-6, 'liquidity');
    close(v('bridgeYears').value, E.bridgeYears, 0.01, 'bridge years');
    close(v('taxAdvantagedShare').value, E.taxAdvantagedShare, 1e-6, 'tax advantaged');
  });
  test(name + ': tax metrics tie out', () => {
    assert.equal(S.taxes.federalAnnual.cents, E.federalAnnual);
    assert.equal(S.taxes.marginalRate, E.marginalRate);
    close(S.taxes.effectiveRate, E.effectiveRate, 1e-6, 'effective');
    assert.equal(v('fica').cents, E.ficaAnnual);
    assert.equal(v('taxSavedPer1000').cents, E.savedPer1000Pretax);
    close(v('impliedTaxRate').value, E.impliedRate, 1e-6, 'implied');
  });
  test(name + ': FI metrics and projection tie out', () => {
    assert.equal(v('fiNumber').cents, E.fiNumber);
    close(v('pctToFi').value, E.pctToFi, 1e-6, '% to FI');
    assert.equal(v('coastFi').cents, E.coastFiNumber);
    close(M.coastFi.coastPct, E.coastPct, 1e-6, 'coast %');
    assert.deepEqual([v('fiLevels').value.lean, v('fiLevels').value.fat, v('fiLevels').value.barista], [E.leanFi, E.fatFi, E.baristaFi]);
    assert.equal(v('feeDragLifetime').cents, E.feeDragLifetime);
    /* Level 9 (MR-040): the ladder rungs, the rule of thumb and the ratios */
    Object.keys(E.ladder).forEach(id => assert.equal(v(id).cents, E.ladder[id], id));
    assert.equal(v('baristaRule').cents, E.baristaRule);
    assert.equal(v('baristaIncomeNeededToday').cents, E.baristaIncomeNeededToday);
    close(v('yearsOfExpenses').value, E.yearsOfExpenses, 1e-9, 'years of expenses');
    close(v('daysOfFreedom').value, E.daysOfFreedom, 1e-9, 'days of freedom');
    close(v('fiRatio').value, E.fiRatio, 1e-6, 'FI ratio');
    assert.equal(R.projection.ssMonthly, E.socialSecurityMonthly);
    ['likely', 'best', 'worst'].forEach(k => {
      assert.equal(R.projection[k].fiAge, E.projection[k].fiAge, k + ' FI age');
      E.projection[k].first5.forEach((p, i) => { const g = R.projection[k].path[i]; assert.deepEqual([g.year, g.age, g.invested, g.cash, g.debt, g.netWorth], [p.year, p.age, p.invested, p.cash, p.debt, p.netWorth], k + ' year ' + p.year); });
      const last = R.projection[k].path[R.projection[k].path.length - 1];
      assert.equal(last.netWorth, E.projection[k].at95.netWorth, k + ' at 95');
    });
    assert.equal(M.fiDate.status, E.projection.likely.fiAge === null ? 'needs' : 'ok');
    /* MR-070: the goals spend along the way; the workpaper lands each one by hand and the projection carries the same draws */
    assert.deepEqual(R.projectionInputs.oneOffs, Object.fromEntries(Object.keys(E.goalDraws).map(y => [y, E.goalDraws[y]])), 'goal draws by year');
    Object.keys(E.goalLanding).forEach(id => assert.equal(R.goalPlan.draws.byGoal[id] && R.goalPlan.draws.byGoal[id].month, E.goalLanding[id], id + ' lands'));
    assert.deepEqual(R.goalPlan.draws.byYear, R.projectionInputs.oneOffs, 'the timeline and the headline agree');
  });
  test(name + ': the lenses that fire match the workpaper', () => {
    const level9 = new Set(data.lenses.lenses.filter(l => l.level === 9).map(l => l.id));
    assert.deepEqual(R.lenses.map(l => l.id).filter(id => !level9.has(id)).sort(), E.lensesFiring);
    /* the Level 9 lenses the workpaper can state simply */
    const fired = R.lenses.map(l => l.id);
    (E.lensesFiringLevel9 || []).forEach(id => assert.ok(fired.includes(id), id + ' should fire'));
    (E.lensesSilentLevel9 || []).forEach(id => assert.ok(!fired.includes(id), id + ' should not fire'));
  });
}
