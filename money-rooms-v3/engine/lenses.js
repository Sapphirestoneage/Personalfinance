/* The 19 lenses: each fires on a condition, fills its sentence with figures,
   says its yearly impact, shows its math and points at a reading. Phrased
   as information, never instructions. Under the materiality line it is
   skipped. Rough inputs make it say "roughly". */
import * as F from './format.js';

function dollars(cents, rough) { return F.dollarsWhole(cents, { rough }); }

export function computeLenses(ctx) {
  const { metrics: M, sun, asm, data, age } = ctx;
  const S = sun.outputs; const reg = data.lenses.lenses; const floor = data.lenses.skipBelowAnnualCents;
  const readings = data.readings.readings;
  const out = [];
  const val = id => (M[id] && M[id].status === 'ok') ? M[id].value : null;
  const roughOf = (...ids) => ids.some(id => M[id] && M[id].status === 'ok' && M[id].value && M[id].value.rough);
  const push = (id, impact, fills, inputs, extra) => {
    const def = reg.find(l => l.id === id);
    if (impact !== null && impact < floor) return;
    let text = def.template;
    Object.keys(fills).forEach(k => { text = text.split('{' + k + '}').join(fills[k]); });
    const rough = !!(extra && extra.rough);
    if (rough) text = text.replace(/ about /g, ' roughly ').replace(/costs about/, 'costs roughly');
    out.push(Object.assign({ id, name: def.name, text, impactAnnual: impact, inputs, reading: readings.find(r => r.id === def.reading) || null, metric: def.metric, rough }, extra || {}));
  };
  const inc = S.income, dt = S.debt, inv = S.invest, sf = S.safety, tx = S.taxes, lf = S.life;
  /* 1 saving at a loss */
  if (M.cashDrag && M.cashDrag.status === 'ok' && M.cashDrag.excess > 0 && ctx.debts && ctx.debts.length) {
    const month = (ctx.today || '').slice(0, 7);
    const effRate = d => (d.promoApr !== null && d.promoApr !== undefined && d.promoEnd && month < d.promoEnd) ? d.promoApr : d.rate;
    const open = ctx.debts.filter(d => !d.full && effRate(d) > asm.cashRealReturn + 0.02);
    if (open.length) {
      const top = open.slice().sort((a, b) => effRate(b) - effRate(a))[0];
      const cost = Math.round(M.cashDrag.excess * (effRate(top) - 0.04));
      push('saving-at-a-loss', cost, { excess: dollars(M.cashDrag.excess), debt: top.name, apr: F.percent(effRate(top)), cost: dollars(cost) }, [['Excess cash', dollars(M.cashDrag.excess)], [top.name + ' rate today', F.percent(effRate(top))], ['Cash yield assumed', '4.0% nominal']], { rough: roughOf('cashDrag') });
    }
  }
  /* 2 match */
  if (M.matchCapture && M.matchCapture.status === 'ok' && M.matchCapture.dollarsLeftAnnual > 0) push('match-left', M.matchCapture.dollarsLeftAnnual, { cost: dollars(M.matchCapture.dollarsLeftAnnual) }, [['Match captured', F.percent(M.matchCapture.value.value)], ['Left a year', dollars(M.matchCapture.dollarsLeftAnnual)]]);
  /* 3 promo cliff */
  if (M.promoCliff && M.promoCliff.status === 'ok') M.promoCliff.value.value.filter(c => c.monthsLeft <= 12).forEach(c => push('promo-cliff', c.costAfterAnnual, { card: c.name, promo: F.percent(c.promoApr), apr: F.percent(c.standardApr), months: F.months(c.monthsLeft), cost: dollars(c.costAfterAnnual) }, [['Balance', dollars(c.balance)], ['Promo ends', F.date(c.promoEnd)], ['Standard APR', F.percent(c.standardApr)]], { rowId: c.rowId }));
  /* 4 cash drag */
  if (M.cashDrag && M.cashDrag.status === 'ok' && M.cashDrag.excess > 0) push('cash-drag', M.cashDrag.value.cents, { excess: dollars(M.cashDrag.excess), cost: dollars(M.cashDrag.value.cents) }, [['Cash', F.value(val('ruleOf5Target') ? S.invest.cashBalances : null)], ['Rule of 5 target', F.value(val('ruleOf5Target'))], ['Return gap', F.percent(asm.returnLikely - asm.cashRealReturn)]], { rough: roughOf('cashDrag') });
  /* 5 fee drag */
  if (M.weightedEr && M.weightedEr.status === 'ok' && inv.weightedExpenseRatio > asm.feeDragEr && inv.feeDragAnnual) push('fee-drag', inv.feeDragAnnual.cents, { er: F.percent(inv.weightedExpenseRatio), cost: dollars(inv.feeDragAnnual.cents), lifetime: M.feeDragLifetime.status === 'ok' ? dollars(M.feeDragLifetime.value.cents) : 'more' }, [['Weighted expense ratio', F.percent(inv.weightedExpenseRatio)], ['Invested', F.value(inv.investedAssets)]]);
  /* 6 shelter */
  if (M.shelterRate && M.shelterRate.status === 'ok' && M.shelterRate.value.value > asm.shelterHeavyShare) {
    const take = val('takeHome'); const over = Math.round((M.shelterRate.value.value - asm.shelterHeavyShare) * take.cents * 12);
    push('shelter-heavy', over, { share: F.percent(M.shelterRate.value.value), cost: dollars(over) }, [['Accommodation and utilities', dollars(Math.round(M.shelterRate.value.value * take.cents))], ['Take-home', F.value(take)], ['Line', F.percent(asm.shelterHeavyShare)]], { rough: roughOf('shelterRate') });
  }
  /* 7 hidden leak */
  if (M.leak && M.leak.status === 'ok' && M.leak.value.value > asm.hiddenLeakShare) push('hidden-leak', M.leak.leakMonthly.cents * 12, { cost: dollars(M.leak.leakMonthly.cents * 12) }, [['Surplus', F.value(val('surplus'))], ['Savings landing', F.value(S.spending.savingsLandingMonthly)]], { rough: roughOf('leak') });
  /* 8 wrong debt first */
  if (dt && dt.payoffOrders && dt.payoffOrders.interest.stress !== null && dt.payoffOrders.interest.avalanche !== null) {
    const st = dt.payoffOrders.stalled || {};
    if (st.avalanche) {
      const def = reg.find(l => l.id === 'wrong-debt-first');
      out.push({ id: 'wrong-debt-first', name: def.name, text: 'At today\'s minimums the interest on ' + (dt.payoffOrders.stalledOn[0] || 'a debt') + ' is never paid down; no payoff order finishes.', impactAnnual: null, figure: 'minimums below interest', inputs: [['Not paid down', dt.payoffOrders.stalledOn.join(', ')]], reading: readings.find(r => r.id === def.reading) || null, metric: def.metric, rough: false });
    } else if (!st.stress) {
      const diff = dt.payoffOrders.interest.stress - dt.payoffOrders.interest.avalanche;
      if (diff > 0) push('wrong-debt-first', diff, { cost: dollars(diff) }, [['Interest, highest rate first', dollars(dt.payoffOrders.interest.avalanche)], ['Interest, most stressful first', dollars(dt.payoffOrders.interest.stress)]]);
    }
  }
  /* 9 utilization */
  if (M.utilization && M.utilization.status === 'ok') {
    const per = M.utilization.perCard; const worst = Object.keys(per).sort((a, b) => per[b] - per[a])[0];
    if ((worst && per[worst] > asm.utilizationCardMax) || M.utilization.value.value > asm.utilizationTotalMax) {
      const d = ctx.debts.find(x => x.id === worst);
      push('utilization-drag', null, { card: d ? d.name : 'A card', utilization: F.percent(per[worst]) }, [['Total utilization', F.percent(M.utilization.value.value)], [d ? d.name : 'Card', F.percent(per[worst])]], { rowId: worst, figure: F.percent(per[worst]) + ' of its limit' });
    }
  }
  /* 10 tax room */
  if (M.leak && M.leak.status === 'ok' && M.leak.leakMonthly.cents > 0 && M.roomLeft && M.roomLeft.status === 'ok' && tx && typeof tx.marginalRate === 'number') {
    const room = M.roomLeft.value.value.find(r => r.limitId === '401k');
    if (room && room.left > 0) { const amt = Math.min(M.leak.leakMonthly.cents * 12, room.left); const saved = Math.round(amt * tx.marginalRate); push('tax-room', saved, { leak: dollars(amt), cost: dollars(saved) }, [['Leak a year', dollars(M.leak.leakMonthly.cents * 12)], ['401k room', dollars(room.left)], ['Marginal rate', F.percent(tx.marginalRate)]], { rough: roughOf('leak') }); }
  }
  /* 11 thin runway */
  if (M.runway && M.runway.status === 'ok' && M.runway.value.value.fat !== null && M.runway.value.value.fat < asm.thinRunwayMonths && val('fatFloor') && inv && inv.cashBalances && inv.cashBalances.cents !== undefined) {
    const fat = val('fatFloor'); const gap = Math.round(fat.cents * asm.thinRunwayMonths - inv.cashBalances.cents);
    push('thin-runway', gap, { months: F.months(M.runway.value.value.fat), cost: dollars(Math.max(0, gap)) }, [['Cash', F.value(inv.cashBalances)], ['FAT floor a month', F.value(fat)]], { rough: roughOf('fatFloor') });
  }
  /* 12 locked up */
  if (M.liquidityRate && M.liquidityRate.status === 'ok' && M.liquidityRate.value.value < asm.lockedLiquidityShare && lf && lf.retirementAge && lf.retirementAge < 59.5) push('locked-up', null, { share: F.percent(M.liquidityRate.value.value), age: String(lf.retirementAge) }, [['Liquid share', F.percent(M.liquidityRate.value.value)], ['Retirement age', String(lf.retirementAge)]], { figure: F.percent(M.liquidityRate.value.value) + ' reachable' });
  /* 13 real hourly wage */
  if (M.realHourlyWage && M.realHourlyWage.status === 'ok' && M.realHourlyWage.statedHourly && M.realHourlyWage.value.cents < M.realHourlyWage.statedHourly * asm.realWageShare) push('real-hourly-wage', null, { real: F.dollars(M.realHourlyWage.value.cents), stated: F.dollars(M.realHourlyWage.statedHourly) }, [['Real hourly wage', F.dollars(M.realHourlyWage.value.cents)], ['Stated gross hourly', F.dollars(M.realHourlyWage.statedHourly)]], { rough: roughOf('realHourlyWage'), figure: F.dollars(M.realHourlyWage.value.cents) + ' an hour' });
  /* 14 cost in hours */
  if (M.annualInterest && M.annualInterest.status === 'ok' && M.realHourlyWage && M.realHourlyWage.status === 'ok' && M.realHourlyWage.value.cents > 0) { const hours = M.annualInterest.value.cents / M.realHourlyWage.value.cents; push('cost-in-hours', M.annualInterest.value.cents, { cost: dollars(M.annualInterest.value.cents), hours: F.hours(hours) }, [['Interest this year', F.value(M.annualInterest.value)], ['Real hourly wage', F.dollars(M.realHourlyWage.value.cents)]], { rough: roughOf('annualInterest', 'realHourlyWage') }); }
  /* 15 one more point */
  if (M.oneMorePoint && M.oneMorePoint.status === 'ok' && M.oneMorePoint.value.value > 0) push('one-more-point', null, { amount: dollars(M.oneMorePoint.monthly), months: F.months(M.oneMorePoint.value.value) }, [['One point of take-home', dollars(M.oneMorePoint.monthly)], ['FI date today', F.value(val('fiDate'))]], { rough: true, figure: F.months(M.oneMorePoint.value.value) + ' sooner' });
  /* 16 coast */
  if (M.coastFi && M.coastFi.status === 'ok' && M.coastFi.coastPct !== null && M.coastFi.coastPct >= 1) push('coast-check', null, { netWorth: F.value(val('netWorth')), age: String(M.coastFi.retirementAge) }, [['Coast FI number', F.value(M.coastFi.value)], ['Net worth', F.value(val('netWorth'))]], { figure: F.percent(M.coastFi.coastPct) + ' of coast' });
  /* 17 mistake tax */
  if (S.spending && S.spending.mistakesAnnual && S.spending.mistakesAnnual.cents > 0) push('mistake-tax', S.spending.mistakesAnnual.cents, { cost: dollars(S.spending.mistakesAnnual.cents) }, [['Lines marked mistake, a year', F.value(S.spending.mistakesAnnual)]]);
  /* 18 card fee */
  if (M.cardNetValue && M.cardNetValue.status === 'ok') M.cardNetValue.value.value.forEach(c => {
    if (c.feeAnnual <= 0) return;
    const incremental = Math.max(0, c.rewardsAnnual - c.baselineAnnual) + c.creditsUsedAnnual;
    const cost = c.feeAnnual - incremental;
    if (cost > 0) push('card-fee', cost, { card: c.name, cost: dollars(cost), credits: dollars(c.unusedCreditsAnnual) }, [['Annual fee', dollars(c.feeAnnual)], ['Rewards on actual spend', dollars(c.rewardsAnnual)], ['A no-fee 2% card would earn', dollars(c.baselineAnnual)], ['Credits used', dollars(c.creditsUsedAnnual)]], { rowId: c.rowId, rough: true });
  });
  /* 19 wrong card */
  if (M.rewardsLeft && M.rewardsLeft.status === 'ok' && M.rewardsLeft.value.cents > 0) push('wrong-card', M.rewardsLeft.value.cents, { cost: dollars(M.rewardsLeft.value.cents) }, Object.keys(dt.wallet.bestRates).map(k => ['Best ' + k, F.percent(dt.wallet.bestRates[k])]), { rough: true });
  return out.sort((a, b) => (b.impactAnnual || 0) - (a.impactAnnual || 0));
}
