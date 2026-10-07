/* The 39 lenses (19 through Level 5, 20 more in Level 9): each fires on a condition, fills its sentence with figures,
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
    if (rough) text = text.replace(/ about /g, ' roughly ').replace(/costs about/, 'costs roughly').replace(/^About /, 'Roughly ');
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
  if (M.promoCliff && M.promoCliff.status === 'ok') M.promoCliff.value.value.filter(c => c.monthsLeft <= 12).forEach(c => push('promo-cliff', c.costAfterAnnual, { card: c.name, promo: F.percent(c.promoApr, { whole: true }), apr: F.percent(c.standardApr, { whole: true }), months: F.months(c.monthsLeft), cost: dollars(c.costAfterAnnual) }, [['Balance', dollars(c.balance)], ['Promo ends', F.date(c.promoEnd)], ['Standard APR', F.percent(c.standardApr)]], { rowId: c.rowId }));
  /* 4 cash drag */
  if (M.cashDrag && M.cashDrag.status === 'ok' && M.cashDrag.excess > 0 && !out.some(l => l.id === 'saving-at-a-loss')) push('cash-drag', M.cashDrag.value.cents, { excess: dollars(M.cashDrag.excess), cost: dollars(M.cashDrag.value.cents) }, [['Cash', F.value(val('ruleOf5Target') ? S.invest.cashBalances : null)], ['Rule of 5 target', F.value(val('ruleOf5Target'))], ['Return gap', F.percent(asm.returnLikely - asm.cashRealReturn)]], { rough: roughOf('cashDrag') });
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
    if (room && room.left > 0) { const amt = Math.min(M.leak.leakMonthly.cents * 12, room.left); const saved = Math.round(amt * tx.marginalRate); push('tax-room', saved, { leak: dollars(amt, M.leak.rough), cost: dollars(saved, M.leak.rough) }, [['Leak a year', dollars(M.leak.leakMonthly.cents * 12)], ['401k room', dollars(room.left)], ['Marginal rate', F.percent(tx.marginalRate)]], { rough: roughOf('leak') }); }
  }
  /* 11 thin runway */
  if (M.runway && M.runway.status === 'ok' && M.runway.value.value.fat !== null && M.runway.value.value.fat < asm.thinRunwayMonths && val('fatFloor') && inv && inv.cashBalances && inv.cashBalances.cents !== undefined) {
    const fat = val('fatFloor'); const gap = Math.round(fat.cents * asm.thinRunwayMonths - inv.cashBalances.cents);
    push('thin-runway', gap, { months: F.months(M.runway.value.value.fat), cost: dollars(Math.max(0, gap)) }, [['Cash', F.value(inv.cashBalances)], ['FAT floor a month', F.value(fat)]], { rough: roughOf('fatFloor'), impactAnnual: null });
  }
  /* 12 locked up */
  if (M.liquidityRate && M.liquidityRate.status === 'ok' && M.liquidityRate.value.value < asm.lockedLiquidityShare && lf && lf.retirementAge && lf.retirementAge < 59.5) push('locked-up', null, { share: F.percent(M.liquidityRate.value.value), age: String(lf.retirementAge) }, [['Liquid share', F.percent(M.liquidityRate.value.value)], ['Retirement age', String(lf.retirementAge)]], { figure: F.percent(M.liquidityRate.value.value) + ' reachable' });
  /* 13 real hourly wage */
  if (M.realHourlyWage && M.realHourlyWage.status === 'ok' && M.realHourlyWage.statedHourly && M.realHourlyWage.value.cents < M.realHourlyWage.statedHourly * asm.realWageShare) push('real-hourly-wage', null, { real: F.dollars(M.realHourlyWage.value.cents), stated: F.dollars(M.realHourlyWage.statedHourly) }, [['Real hourly wage', F.dollars(M.realHourlyWage.value.cents)], ['Stated gross hourly', F.dollars(M.realHourlyWage.statedHourly)]], { rough: roughOf('realHourlyWage'), figure: F.dollars(M.realHourlyWage.value.cents) + ' an hour' });
  /* 14 cost in hours */
  if (M.annualInterest && M.annualInterest.status === 'ok' && M.realHourlyWage && M.realHourlyWage.status === 'ok' && M.realHourlyWage.value.cents > 0) { const hours = M.annualInterest.value.cents / M.realHourlyWage.value.cents; push('cost-in-hours', M.annualInterest.value.cents, { cost: dollars(M.annualInterest.value.cents), hours: F.hours(hours).replace(/ h$/, ' hours') }, [['Interest this year', F.value(M.annualInterest.value)], ['Real hourly wage', F.dollars(M.realHourlyWage.value.cents)]], { rough: roughOf('annualInterest', 'realHourlyWage') }); }
  /* 15 one more point */
  if (M.oneMorePoint && M.oneMorePoint.status === 'ok' && M.oneMorePoint.value.value > 0) push('one-more-point', null, { amount: dollars(M.oneMorePoint.monthly), months: F.monthsOrYears(M.oneMorePoint.value.value) }, [['One point of take-home', dollars(M.oneMorePoint.monthly)], ['FI date today', F.value(val('fiDate'))]], { rough: true, figure: F.months(M.oneMorePoint.value.value) + ' sooner' });
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
  levelNineLenses(ctx, out, push, val, roughOf);
  /* roommate risk (Level 8, MR-047): shared lines above a quarter of take-home, or the lease in the client's name only */
  const hh = (ctx.record && ctx.record.household) || { roommates: [], lease: 'none' };
  const sfull = S.spending && S.spending.sharedFullMonthly, sshare = S.spending && S.spending.sharedShareMonthly, take0 = val('takeHome');
  if (hh.roommates && hh.roommates.length && sfull && sfull.cents > 0 && take0 && (sfull.cents > take0.cents * 0.25 || hh.lease === 'mine')) {
    const gapM = sfull.cents - sshare.cents; const months = asm.roommateMonthsToReplace || 2; const bridge = gapM * months;
    const names = ctx.record.planets.spending.rows.filter(r => r.type === 'line' && r.f.shared && r.f.shared.v).map(r => r.nickname.toLowerCase()).slice(0, 3).join(', ');
    const nick = hh.roommates[0].nickname || 'your roommate';
    push('roommate-risk', null, { nickname: nick, lines: names || 'the shared bills', share: dollars(sshare.cents), full: dollars(sfull.cents), months: String(months), bridge: dollars(bridge) }, [['Shared bills, full', dollars(sfull.cents)], ['Your share', dollars(sshare.cents)], ['Months to replace', String(months)], ['Lease', hh.lease === 'mine' ? 'in your name only' : hh.lease === 'both' ? 'in both names' : hh.lease === 'theirs' ? 'in their name' : 'none']], { figure: dollars(bridge) + ' to bridge', rough: sfull.rough });
  }
  return out.sort((a, b) => (b.impactAnnual || 0) - (a.impactAnnual || 0));
}

/* Level 9 (MR-043): the FI lenses. Information, never instructions. */
function levelNineLenses(ctx, out, push, val, roughOf) {
  const { metrics: M, sun, asm } = ctx; const S = sun.outputs; const pj = ctx.projection;
  const okM = id => M[id] && M[id].status === 'ok' ? M[id] : null;
  const months = m => { const a = Math.abs(m); return a >= 12 ? (Math.round(a / 12 * 10) / 10) + ' years' : (Math.round(a) || 1) + (Math.round(a) === 1 ? ' month' : ' months'); };
  const when = m => m === 0 ? 'already here' : m === null ? 'not in the projection' : 'about ' + months(m) + ' away';
  const fi = okM('fiNumber'); const take = val('takeHome');
  /* 20 the double lever */
  if (fi) push('double-lever', null, { perHundred: dollars(Math.round(10000 * 12 / asm.withdrawalRate)), perHundredYear: dollars(120000) }, [['FI number', F.value(fi.value)], ['Withdrawal rate', F.percent(asm.withdrawalRate)]], { figure: dollars(Math.round(10000 * 12 / asm.withdrawalRate)) + ' per $100 a month' });
  /* 21 the big three */
  if (take && S.spending && S.spending.byCategory && take.cents > 0) {
    const c = S.spending.byCategory; const big = ['accommodation', 'transportation', 'food'].reduce((s2, k) => s2 + (c[k] && c[k].cents ? c[k].cents : 0), 0);
    const share = big / take.cents;
    if (big > 0 && share > 0.5) push('big-three', null, { share: F.percent(share), dollars: dollars(big) }, [['Housing', F.value(c.accommodation)], ['Transportation', F.value(c.transportation)], ['Food', F.value(c.food)], ['Take-home', F.value(take)]], { figure: F.percent(share) + ' of take-home', rough: roughOf('takeHome', 'spending') });
    /* 33 house hack */
    const housing = c.accommodation && c.accommodation.cents ? c.accommodation.cents / take.cents : 0;
    if (housing > 0.4) push('house-hack', null, { share: F.percent(housing) }, [['Housing', F.value(c.accommodation)], ['Take-home', F.value(take)]], { figure: F.percent(housing) + ' of take-home', rough: roughOf('takeHome', 'spending') });
  }
  /* 22 lean FI close */
  const lean = okM('leanFi');
  if (lean && lean.months !== null && lean.months <= 36) push('lean-fi-close', null, { number: dollars(lean.value.cents), when: when(lean.months) }, [['Lean FI number', F.value(lean.value)], ['Percent there', F.percent(lean.pct)]], { figure: when(lean.months), rough: lean.rough });
  /* 23 the barista option */
  const bn = okM('baristaIncomeNeededToday');
  if (bn && take && bn.value.cents > 0 && bn.value.cents < take.cents * 0.5) push('barista-option', null, { needed: dollars(bn.value.cents), wr: F.percent(asm.withdrawalRate) }, [['Part-time income needed a month', F.value(bn.value)], ['Take-home today', F.value(take)]], { figure: dollars(bn.value.cents) + ' a month', rough: bn.rough });
  /* 24 coast reached */
  const coast = okM('coastFi');
  if (coast && coast.coastPct !== null && coast.coastPct >= 1 && S.invest && S.invest.annualContributions && S.invest.annualContributions.total > 0) push('coast-reached', null, { basis: asm.fiProgressBasis === 'netWorth' ? 'Net worth' : 'What is invested', age: String(coast.retirementAge), ret: F.percent(asm.returnLikely) }, [['Coast FI number', F.value(coast.value)], ['Percent of coast', F.percent(coast.coastPct)]], { figure: F.percent(coast.coastPct) + ' of coast' });
  /* 25 crossover in sight */
  const cross = okM('crossoverDate');
  if (cross && cross.months !== null && cross.months > 0 && cross.months <= 60) push('crossover-in-sight', null, { wr: F.percent(asm.withdrawalRate), date: F.date(cross.value.value), when: months(cross.months) }, [['Crossover date', F.value(cross.value)]], { figure: months(cross.months) + ' away', rough: true });
  /* 26 the flip */
  const flip = okM('theFlip'); const inv = S.invest && S.invest.investedAssets && S.invest.investedAssets.cents !== undefined ? S.invest.investedAssets.cents : null;
  if (flip && inv !== null) {
    const yrs = flip.value.value ? parseInt(flip.value.value.slice(0, 4), 10) - parseInt(ctx.today.slice(0, 4), 10) : 0;
    if (flip.already || yrs <= 3) push('the-flip', null, { when: flip.already ? 'Already' : 'From ' + flip.value.value.slice(0, 4), growth: dollars(Math.round(inv * asm.returnLikely)), contrib: dollars(ctx.contribAnnual || (S.invest.annualContributions ? S.invest.annualContributions.total : 0)) }, [['Invested', dollars(inv)], ['Likely return', F.percent(asm.returnLikely)], ['Contributions a year', dollars(S.invest.annualContributions ? S.invest.annualContributions.total : 0)]], { figure: flip.already ? 'growth leads' : 'in ' + yrs + (yrs === 1 ? ' year' : ' years') });
  }
  /* 27 first 100k */
  const k = okM('first100kDate');
  if (k && inv !== null && inv < 10000000 && k.months !== null && k.months > 0) push('first-100k', null, { date: F.date(k.value.value) }, [['Invested today', dollars(inv)], ['Projected date', F.value(k.value)]], { figure: months(k.months) + ' away', rough: true });
  /* 28 true FI gap */
  const tf = okM('trueFiNumber');
  if (tf && fi && tf.value.cents >= fi.value.cents * 1.05) push('true-fi-gap', null, { gap: dollars(tf.value.cents - fi.value.cents), trueFi: dollars(tf.value.cents), fi: dollars(fi.value.cents) }, [['FI number', F.value(fi.value)], ['After-tax FI number', F.value(tf.value)], ['Pre-tax share', F.percent(tf.pretaxShare)]], { figure: dollars(tf.value.cents - fi.value.cents) + ' more', rough: true });
  /* 29 health care bridge */
  const hc = okM('healthcareBridge');
  if (hc && hc.years > 0 && hc.value.cents > 0) push('healthcare-bridge', null, { cost: dollars(hc.value.cents), years: hc.years + (hc.years === 1 ? ' year' : ' years'), premium: dollars(asm.healthcarePremiumMonthlyCents) }, [['FI age', String(hc.fiAge)], ['Years to 65', String(hc.years)], ['Premium a month (assumption)', dollars(asm.healthcarePremiumMonthlyCents)]], { figure: F.value(hc.value) + ' to 65', rough: true });
  /* 30 Social Security floor */
  const ssn = okM('ssAdjustedFiNumber');
  if (ssn && fi && ssn.value.cents <= fi.value.cents * 0.9) push('ss-floor', null, { age: String(asm.socialSecurityAge), number: dollars(ssn.value.cents), saving: dollars(fi.value.cents - ssn.value.cents) }, [['FI number', F.value(fi.value)], ['With Social Security', F.value(ssn.value)], ['Bridge years', String(ssn.bridgeYears)]], { figure: dollars(fi.value.cents - ssn.value.cents) + ' less', rough: true });
  /* 31 withdrawal sensitivity, 34 geo arbitrage, 37 purchase in FI days, 32 guardrails: a FI date exists */
  const alt = pj && pj.alt; const fiDate = okM('fiDate');
  if (fiDate && alt && alt.baseMonths !== null && fi) {
    const n35 = Math.round(fi.value.cents * asm.withdrawalRate / 0.035);
    push('withdrawal-sensitivity', null, { number: dollars(n35), months: alt.wr35Months === null ? 'past the projection' : months(alt.wr35Months - alt.baseMonths) + ' later' }, [['FI number at 4%', F.value(fi.value)], ['FI number at 3.5%', dollars(n35)], ['FI date today', F.value(fiDate.value)]], { figure: alt.wr35Months === null ? 'never at 3.5%' : months(alt.wr35Months - alt.baseMonths) + ' later', rough: true });
    const flags = (ctx.record && ctx.record.sun && ctx.record.sun.flags) || {};
    if (flags.geoArbitrage) push('geo-arbitrage', null, { number: dollars(fi.value.cents - alt.geoFiNumber), months: alt.geoMonths === null ? 'a lot' : months(alt.baseMonths - alt.geoMonths) + ' earlier' }, [['FI number', F.value(fi.value)], ['At 80% of spending', dollars(alt.geoFiNumber)], ['FI date today', F.value(fiDate.value)]], { figure: alt.geoMonths === null ? '' : months(alt.baseMonths - alt.geoMonths) + ' earlier', rough: true });
    const pd = okM('purchaseInFiDays');
    if (pd) push('purchase-in-fi-days', null, { days: (Math.round(pd.perThousandDays) || 1) + ' days', number: dollars(pd.perHundredMonthly) }, [['Growth near FI, a year', dollars(pd.growthAnnual)], ['$1,000 once', (Math.round(pd.perThousandDays) || 1) + ' days'], ['$100 a month', dollars(pd.perHundredMonthly) + ' of FI number']], { figure: (Math.round(pd.perThousandDays) || 1) + ' days per $1,000', rough: true });
    const gb = okM('guardrailsBand');
    if (gb && gb.value.range) push('guardrails-room', null, { low: dollars(gb.value.range.low), high: dollars(gb.value.range.high), band: F.percent(gb.band, { places: 0 }) }, [['Spending a month', F.value(gb.value)], ['Band', F.percent(gb.band)]], { figure: dollars(gb.value.range.low) + ' to ' + dollars(gb.value.range.high), rough: gb.rough });
    /* 36 room to spend more, 39 underspending */
    const at95 = pj.likely.path[pj.likely.path.length - 1].netWorth;
    const dream = S.life && S.life.dreamSpendingMonthly && S.life.dreamSpendingMonthly.cents !== undefined ? S.life.dreamSpendingMonthly.cents : null; const sp = val('spending');
    if (at95 > fi.value.cents * 3 || (dream !== null && sp && dream > sp.cents)) push('room-to-spend-more', null, { at95: dollars(at95) }, [['Net worth at 95', dollars(at95)], ['FI number', F.value(fi.value)], dream !== null ? ['Dream spending', dollars(dream)] : ['Dream spending', 'not typed']], { figure: dollars(at95) + ' at 95', rough: true });
    const sr = okM('savingsRateTakeHome');
    if (sr && sr.value.value > 0.5 && at95 > fi.value.cents * 3) push('underspending', null, { rate: F.percent(sr.value.value), at95: dollars(at95) }, [['Savings rate', F.percent(sr.value.value)], ['Net worth at 95', dollars(at95)]], { figure: F.percent(sr.value.value) + ' saved', rough: true });
  }
  /* 35 gut gap */
  const gg = okM('gutGap');
  const spend = val('spending');
  if (gg && spend && Math.abs(gg.diffMonthly) >= spend.cents * 0.1) push('gut-gap', null, { gut: dollars(spend.cents + gg.diffMonthly), direction: gg.diffMonthly > 0 ? 'above' : 'below', lines: F.value(spend), diff: dollars(Math.abs(gg.diffMonthly)), months: months(gg.value.value) }, [['Gut spending', dollars(spend.cents + gg.diffMonthly)], ['The lines', F.value(spend)], ['FI number change', dollars(gg.fiNumberDelta)]], { figure: months(gg.value.value) + ' of FI date', rough: true });
  /* 38 side hustle real wage */
  const rh = okM('realHourlyWage'); const by = S.income && S.income.byType;
  if (by && by.side > 0 && by.sideHours > 0 && rh && rh.statedHourly) {
    const sideHourly = Math.round(by.side / by.sideHours);
    if (sideHourly < rh.statedHourly) push('side-hustle-real-wage', null, { side: F.dollars(sideHourly), main: F.dollars(rh.statedHourly) }, [['Side income a month', dollars(by.side)], ['Side hours a month', String(by.sideHours)], ['Main job, gross an hour', F.dollars(rh.statedHourly)]], { figure: F.dollars(sideHourly) + ' an hour' });
  }
}
