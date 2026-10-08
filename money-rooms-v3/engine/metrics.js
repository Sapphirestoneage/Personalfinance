/* The 74 metrics (48 through Level 7, 26 more in Level 9). Each is computed from the Sun's slots, carries units and
   a show-the-math record (formula, inputs with state and source, result),
   and says what it needs when an input is missing. Labels come only from
   data/metrics.json so one number never has two names. */
import { q, U, add, sub, ratio, pct, count, dateValue, needs, isNeeds, isQ, scale, weightedConfidence } from './units.js';
import * as F from './format.js';
import { ageAt } from './format.js';
import { fiLadder, baristaRule, monthsToReach, RUNGS, RUNG_LABELS } from './fiLadder.js';
import { federalTax, standardDeduction } from './tax.js';

function inputOf(label, value, meta) { return Object.assign({ label, value }, meta || {}); }
function describe(v) {
  if (v === null || v === undefined) return 'needs';
  if (isNeeds(v)) return 'needs ' + v.needs.join(', ');
  if (typeof v === 'number') return String(v);
  return F.value(v) || String(v);
}
function ok(id, value, math, extra) {
  return Object.assign({ id, status: 'ok', value, math, rough: !!(value && value.rough), confidence: value && typeof value.confidence === 'number' ? value.confidence : 1 }, extra || {});
}
function need(id, list, math) { return { id, status: 'needs', needs: Array.isArray(list) ? list : [list], math: math || null, value: null }; }
function needsOf(...vals) { return vals.flatMap(v => (v === null || v === undefined) ? ['an input'] : isNeeds(v) ? v.needs : []); }
function fromNeeds(id, formula, ...vals) { return need(id, needsOf(...vals), { formula, inputs: [] }); }

/* ctx: { sun (outputs), facts (sun.f), asm, data, today, projection, debts } */
export function computeMetrics(ctx) {
  const out = {};
  const S = ctx.sun.outputs; const asm = ctx.asm; const reg = ctx.data.metrics.metrics;
  const inc = S.income, sp = S.spending, dt = S.debt, sf = S.safety, inv = S.invest, tx = S.taxes, lf = S.life;
  const def = id => reg.find(m => m.id === id);
  const put = m => { out[m.id] = Object.assign({ def: def(m.id) }, m); };
  const Q = (v) => v && v.status === 'ok' && typeof v.cents === 'number' ? v : null;

  /* 1, 2, 3 */
  const take = inc && Q(inc.takeHomeMonthly), gross = inc && Q(inc.grossMonthly);
  put(take ? ok('takeHome', take, { formula: 'sum of take-home per income row, to a month', inputs: [inputOf('Take-home rows', take)], result: take }) : fromNeeds('takeHome', 'sum of take-home', inc ? inc.takeHomeMonthly : null));
  put(gross ? ok('gross', gross, { formula: 'sum of gross pay, bonus and equity, to a month', inputs: [inputOf('Gross rows', gross)], result: gross }) : fromNeeds('gross', 'sum of gross', inc ? inc.grossMonthly : null));
  const spending = sf && Q(sf.spendingWithPremiums);
  put(spending ? ok('spending', spending, { formula: 'spending lines (detail overrides a rough total) + premiums paid from the bank', inputs: [inputOf('Spending lines', Q(sp.baselineMonthly)), inputOf('Bank-paid premiums', Q(sf.premiumsMonthly))], result: spending }) : fromNeeds('spending', 'spending lines + bank premiums', sp ? sp.baselineMonthly : null));
  /* 13, 14 */
  const service = dt && Q(dt.debtServiceMonthly), totalDebt = dt && Q(dt.totalDebt);
  put(service ? ok('debtService', service, { formula: 'sum of minimum payments, to a month', inputs: [inputOf('Minimums', service)], result: service }) : fromNeeds('debtService', 'sum of minimums', dt && dt.debtServiceMonthly));
  put(totalDebt ? ok('totalDebt', totalDebt, { formula: 'sum of balances', inputs: [inputOf('Balances', totalDebt)], result: totalDebt }) : fromNeeds('totalDebt', 'sum of balances', dt && dt.totalDebt));
  /* 4 */
  if (take && spending && service) {
    const surplus = sub(sub(take, spending), service);
    put(ok('surplus', surplus, { formula: 'take-home - spending - debt minimums', inputs: [inputOf('Take-home', take), inputOf('Spending', spending), inputOf('Debt minimums', service)], result: surplus }));
  } else put(fromNeeds('surplus', 'take-home - spending - debt minimums', take || (inc && inc.takeHomeMonthly), spending || (sp && sp.baselineMonthly), service || (dt && dt.debtServiceMonthly)));
  /* 5 */
  if (take && spending) {
    const r = ratio(sub(take, spending), take);
    put(isNeeds(r) ? need('savingsRateTakeHome', r.needs) : ok('savingsRateTakeHome', r, { formula: '(take-home - spending) / take-home', inputs: [inputOf('Take-home', take), inputOf('Spending', spending)], result: r }));
  } else put(fromNeeds('savingsRateTakeHome', '(take-home - spending) / take-home', take || (inc && inc.takeHomeMonthly), spending || (sp && sp.baselineMonthly)));
  /* 6 */
  if (take && spending && gross && (gross.cents > 0 || (Q(inc.matchMonthly) && Q(inc.matchMonthly).cents > 0))) {
    const pre = Q(inc.pretaxContribMonthly) || q(0, U.monthlyPre), ro = Q(inc.rothContribMonthly) || q(0, U.monthlyAfter), hs = Q(inc.hsaPayrollMonthly) || q(0, U.monthlyPre), match = Q(inc.matchMonthly) || q(0, U.monthlyPre);
    const num = pre.cents + ro.cents + hs.cents + match.cents + take.cents - spending.cents; const den = gross.cents + match.cents;
    const r = pct(num / den, weightedConfidence([take, spending, gross]), null);
    put(ok('savingsRateGross', Object.assign({}, r, { rough: take.rough || spending.rough || gross.rough }), { formula: '(pre-tax + Roth + HSA + match + take-home - spending) / (gross + match)', inputs: [inputOf('Pre-tax retirement', pre), inputOf('Roth', ro), inputOf('HSA', hs), inputOf('Match', match), inputOf('Take-home', take), inputOf('Spending', spending), inputOf('Gross', gross)], result: r }));
  } else put(gross && gross.cents === 0 ? need('savingsRateGross', ['gross pay']) : fromNeeds('savingsRateGross', '(contributions + match + take-home - spending) / (gross + match)', take || (inc && inc.takeHomeMonthly), spending || (sp && sp.baselineMonthly), gross || (inc && inc.grossMonthly)));
  /* 7 */
  const surplus = out.surplus.status === 'ok' ? out.surplus.value : null;
  if (surplus && take && take.cents > 0) {
    const landing = Q(sp.savingsLandingMonthly) || q(0, U.monthlyAfter);
    const leak = sub(surplus, landing); const r = pct(leak.cents / take.cents, leak.confidence); 
    put(ok('leak', Object.assign({}, r, { rough: leak.rough }), { formula: '(surplus - savings landing) / take-home', inputs: [inputOf('Surplus', surplus), inputOf('Savings landing', landing), inputOf('Take-home', take)], result: r }, { leakMonthly: leak }));
  } else put(take && take.cents === 0 ? need('leak', ['take-home pay']) : fromNeeds('leak', '(surplus - savings landing) / take-home', surplus || out.surplus));
  /* 8 */
  if (take && take.cents > 0 && gross && gross.cents > 0 && spending && sp.byCategory && Object.keys(sp.byCategory).length) {
    const cat = sp.byCategory; const pre = Q(inc.pretaxContribMonthly) || q(0, U.monthlyPre), ro = Q(inc.rothContribMonthly) || q(0, U.monthlyAfter), match = Q(inc.matchMonthly) || q(0, U.monthlyPre);
    const bank = inv && inv.annualContributions ? Math.round(inv.annualContributions.bank / 12) : 0;
    const shares = {
      debt: service ? service.cents / take.cents : null,
      retirement: (pre.cents + ro.cents + match.cents + bank) / gross.cents,
      accommodation: (cat.accommodation.cents + cat.utilities.cents) / take.cents,
      food: cat.food.cents / take.cents, transportation: cat.transportation.cents / take.cents, therapy: cat.therapy.cents / take.cents,
    };
    put(ok('draftt', { status: 'ok', kind: 'shares', value: shares, confidence: take.confidence, rough: take.rough || spending.rough }, { formula: 'debt / take-home; retirement / gross; accommodation (+ utilities), food, transportation, therapy / take-home', inputs: [inputOf('Debt minimums', service), inputOf('Retirement a month', q(pre.cents + ro.cents + match.cents + bank, U.monthlyPre)), inputOf('Accommodation', cat.accommodation), inputOf('Utilities', cat.utilities), inputOf('Food', cat.food), inputOf('Transportation', cat.transportation), inputOf('Therapy', cat.therapy), inputOf('Take-home', take), inputOf('Gross', gross)], result: null }));
  } else put(take && take.cents === 0 ? need('draftt', ['take-home pay']) : fromNeeds('draftt', 'each DRAFTT line / take-home', take || (inc && inc.takeHomeMonthly), gross || (inc && inc.grossMonthly), sp && sp.baselineMonthly));
  /* 9 */
  const fat = sp && Q(sp.fatFloorMonthly);
  put(fat ? ok('fatFloor', fat, { formula: 'sum of spending lines flagged in the FAT floor', inputs: [inputOf('Flagged lines', fat)], result: fat }) : fromNeeds('fatFloor', 'flagged lines', sp && sp.fatFloorMonthly));
  /* 10 */
  if (out.draftt.status === 'ok' && typeof out.draftt.value.value.accommodation === 'number') { const r = pct(out.draftt.value.value.accommodation, take.confidence); put(ok('shelterRate', Object.assign({}, r, { rough: out.draftt.value.rough }), { formula: '(accommodation + utilities) / take-home', inputs: [inputOf('Accommodation', sp.byCategory.accommodation), inputOf('Utilities', sp.byCategory.utilities), inputOf('Take-home', take)], result: r })); }
  else put(fromNeeds('shelterRate', 'accommodation / take-home', take || (inc && inc.takeHomeMonthly), sp && sp.baselineMonthly));
  /* 11 */
  const fixed = sp && Q(sp.fixedMonthly);
  if (fixed && take && take.cents > 0) { const fx = add(fixed, Q(sf.premiumsMonthly) || q(0, U.monthlyAfter)); const r = ratio(fx, take); put(ok('fixedRate', r, { formula: '(needs + bank-paid premiums) / take-home', inputs: [inputOf('Needs', fixed), inputOf('Premiums', Q(sf.premiumsMonthly)), inputOf('Take-home', take)], result: r }, { fixedMonthly: fx })); }
  else put(fromNeeds('fixedRate', 'fixed / take-home', fixed || (sp && sp.fixedMonthly), take || (inc && inc.takeHomeMonthly)));
  /* 12 */
  if (take && inc.workHoursMonthly > 0) {
    const wc = Q(inc.workCostsMonthly) || q(0, U.monthlyAfter);
    const cents = Math.round((take.cents - wc.cents) / inc.workHoursMonthly);
    const v = q(cents, U.oneoffAfter, { confidence: weightedConfidence([take, wc]), rough: take.rough || wc.rough });
    const stated = gross && gross.cents > 0 ? Math.round(gross.cents * 12 / 2080) : null;
    put(ok('realHourlyWage', v, { formula: '(take-home - costs of working) / (paid + commute and prep hours a month)', inputs: [inputOf('Take-home', take), inputOf('Costs of working', wc), inputOf('Hours a month', count(inc.workHoursMonthly, 'hours'))], result: v }, { statedHourly: stated }));
  } else put(fromNeeds('realHourlyWage', '(take-home - work costs) / hours', take || (inc && inc.takeHomeMonthly), inc && inc.workHoursMonthly ? q(1, U.oneoff) : needs(['paid hours a week'])));
  /* 15 */
  if (service && gross && gross.cents > 0) { const r = ratio(service, gross); put(ok('dti', r, { formula: 'debt minimums / gross monthly', inputs: [inputOf('Debt minimums', service), inputOf('Gross', gross)], result: r })); } else put(fromNeeds('dti', 'debt service / gross', service, gross || (inc && inc.grossMonthly)));
  /* 16 */
  const totalAssets = inv && Q(inv.totalAssets);
  if (totalDebt && totalAssets) { const r = ratio(totalDebt, totalAssets); put(isNeeds(r) ? need('debtToAssets', r.needs) : ok('debtToAssets', r, { formula: 'total debt / total assets', inputs: [inputOf('Total debt', totalDebt), inputOf('Total assets', totalAssets)], result: r })); } else put(fromNeeds('debtToAssets', 'total debt / total assets', totalDebt, totalAssets || (inv && inv.totalAssets)));
  /* 17, 18, 19, 20, 21 */
  put(dt && dt.weightedApr !== null && totalDebt && totalDebt.cents ? ok('weightedApr', pct(dt.weightedApr, totalDebt.confidence), { formula: 'sum(balance x rate today) / total debt', inputs: [inputOf('Total debt', totalDebt)], result: pct(dt.weightedApr) }) : need('weightedApr', ['debt balances with rates']));
  const interest = dt && Q(dt.annualInterest);
  put(interest && totalDebt && totalDebt.cents ? ok('annualInterest', interest, { formula: 'for each debt: balance x promo rate for the promo months + balance x standard rate for the rest of the year; full autopay cards carry none', inputs: (ctx.interestParts || []).map(p => inputOf(p.name, q(p.cents, U.annualAfter))), result: interest }) : need('annualInterest', ['debt balances with rates']));
  put(dt && dt.utilization && dt.utilization.total !== null ? ok('utilization', pct(dt.utilization.total), { formula: 'card balances / credit limits', inputs: Object.keys(dt.utilization.perCard).map(id => inputOf(ctx.debts.find(d => d.id === id).name, pct(dt.utilization.perCard[id]))), result: pct(dt.utilization.total) }, { perCard: dt.utilization.perCard }) : need('utilization', ['card balances and credit limits']));
  put(dt && dt.promoCliffs && dt.promoCliffs.length ? ok('promoCliff', { status: 'ok', kind: 'list', value: dt.promoCliffs, confidence: 1 }, { formula: 'months until the promo ends; balance x standard APR a year after', inputs: dt.promoCliffs.map(c => inputOf(c.name, q(c.costAfterAnnual, U.annualAfter))), result: null }) : need('promoCliff', ['a card with a promo rate and end date']));
  put(dt && dt.debtFreeDate ? ok('debtFree', dateValue(dt.debtFreeDate, service ? service.confidence : 1), { formula: 'monthly payoff at current minimums, freed minimums rolled to the next debt by rate (avalanche)', inputs: (ctx.debts || []).map(d => inputOf(d.name, q(d.minimum, U.monthlyAfter))), result: dateValue(dt.debtFreeDate) }, { freedCash: dt.freedCashByMonth, orders: dt.payoffOrders }) : need('debtFree', ctx.debts && ctx.debts.length ? ['minimum payments that cover the interest'] : ['debt balances, rates and minimums']));
  /* 22 */
  if (totalAssets && totalDebt) { const nw = sub(totalAssets, totalDebt); put(ok('netWorth', nw, { formula: 'total assets - total debt', inputs: [inputOf('Total assets', totalAssets), inputOf('Total debt', totalDebt)], result: nw })); } else put(fromNeeds('netWorth', 'assets - debts', totalAssets || (inv && inv.totalAssets), totalDebt || (dt && dt.totalDebt)));
  /* 23, 24, 25 */
  if (totalAssets) {
    const invested = Q(inv.investedAssets); const liq = inv.balancesByLiquidity;
    put(ok('assets', { status: 'ok', kind: 'list', value: { total: totalAssets.cents, invested: invested ? invested.cents : 0, liquid: liq.liquid, semi: liq.semi, locked: liq.locked }, confidence: totalAssets.confidence, rough: totalAssets.rough }, { formula: 'balances by account type: invested takes market returns; liquid is reachable now', inputs: [inputOf('Total', totalAssets), inputOf('Invested', invested), inputOf('Liquid', q(liq.liquid, U.oneoff)), inputOf('Semi-liquid', q(liq.semi, U.oneoff)), inputOf('Locked', q(liq.locked, U.oneoff))], result: null }));
    const lr = totalAssets.cents ? pct(liq.liquid / totalAssets.cents, totalAssets.confidence) : null;
    put(lr ? ok('liquidityRate', lr, { formula: 'liquid / total assets', inputs: [inputOf('Liquid', q(liq.liquid, U.oneoff)), inputOf('Total assets', totalAssets)], result: lr }) : need('liquidityRate', ['account balances']));
    if (spending && spending.cents > 0) { const by = count(Math.round(((liq.liquid + liq.semi) / (spending.cents * 12)) * 100) / 100, 'years', spending.confidence); put(ok('bridgeYears', by, { formula: '(liquid + semi-liquid) / annual spending', inputs: [inputOf('Liquid + semi', q(liq.liquid + liq.semi, U.oneoff)), inputOf('Annual spending', scale(spending, 12))], result: by })); } else put(fromNeeds('bridgeYears', '(liquid + semi) / annual spending', spending || (sp && sp.baselineMonthly)));
  } else { ['assets', 'liquidityRate', 'bridgeYears'].forEach(id => put(fromNeeds(id, 'account balances', inv && inv.totalAssets))); }
  /* 26, 27, 28, 29 */
  const cash = inv && Q(inv.cashBalances);
  if (sf && sf.runway && sf.runway.full !== null && Number.isFinite(sf.runway.full)) put(ok('runway', { status: 'ok', kind: 'list', value: sf.runway, confidence: spending ? spending.confidence : 1, rough: spending ? spending.rough : false }, { formula: 'cash / monthly spending at full, needs-only and FAT floor', inputs: [inputOf('Cash', cash), inputOf('Full spending', spending), inputOf('Needs', out.fixedRate.fixedMonthly || null), inputOf('FAT floor', fat)], result: null }));
  else put(fromNeeds('runway', 'cash / spending', cash || (inv && inv.cashBalances), spending || (sp && sp.baselineMonthly)));
  const target = sf && Q(sf.ruleOf5Target);
  put(target ? ok('ruleOf5Target', target, { formula: 'age / 5 months x monthly spending', inputs: [inputOf('Age', count(ctx.age, 'years')), inputOf('Months', count(Math.round(sf.ruleOf5Months * 10) / 10, 'months')), inputOf('Spending', spending)], result: target }) : need('ruleOf5Target', sf && sf.ruleOf5Target && isNeeds(sf.ruleOf5Target) ? sf.ruleOf5Target.needs : ['birth date', 'monthly spending']));
  const gap = sf && Q(sf.gap);
  put(gap ? ok('emergencyGap', gap, { formula: 'max(0, Rule of 5 target - cash); a twelfth of it to close in a year', inputs: [inputOf('Target', target), inputOf('Cash', cash)], result: gap }, { monthlyToClose: sf.monthlyToClose }) : need('emergencyGap', sf && sf.gap && isNeeds(sf.gap) ? sf.gap.needs : ['cash accounts']));
  if (target && cash) { const excess = Math.max(0, cash.cents - target.cents); const drag = q(Math.round(excess * (asm.returnLikely - asm.cashRealReturn)), U.annualNa, { confidence: Math.min(cash.confidence, target.confidence), rough: target.rough }); put(ok('cashDrag', drag, { formula: '(cash - Rule of 5 target) x (likely real return - cash real return)', inputs: [inputOf('Cash', cash), inputOf('Target', target), inputOf('Likely return', pct(asm.returnLikely)), inputOf('Cash return', pct(asm.cashRealReturn))], result: drag }, { excess })); }
  else put(fromNeeds('cashDrag', '(cash - target) x (return gap)', cash || (inv && inv.cashBalances), target || (sf && sf.ruleOf5Target)));
  /* 30, 31 */
  if (totalAssets && totalAssets.cents) {
    const b = inv.balancesByBucket; const r = pct((b.pretax + b.roth + b.hsa) / totalAssets.cents, totalAssets.confidence);
    put(ok('taxAdvantagedShare', r, { formula: '(pre-tax + Roth + HSA) / total assets', inputs: [inputOf('Pre-tax', q(b.pretax, U.oneoff)), inputOf('Roth', q(b.roth, U.oneoff)), inputOf('HSA', q(b.hsa, U.oneoff)), inputOf('Total assets', totalAssets)], result: r }));
    const mix = {}; Object.keys(b).forEach(k => { mix[k] = b[k] / totalAssets.cents; });
    put(ok('bucketMix', { status: 'ok', kind: 'shares', value: mix, dollars: b, confidence: totalAssets.confidence }, { formula: 'each bucket / total assets', inputs: Object.keys(b).map(k => inputOf(k, q(b[k], U.oneoff))), result: null }));
  } else { put(fromNeeds('taxAdvantagedShare', 'sheltered / total', inv && inv.totalAssets)); put(fromNeeds('bucketMix', 'bucket / total', inv && inv.totalAssets)); }
  /* 32, 33 */
  if (inv && inv.matchCapture && inv.matchCapture.ratio !== null) { const r = pct(inv.matchCapture.ratio); put(ok('matchCapture', r, { formula: 'match received / match available; (available - received) x 12', inputs: [inputOf('Match a month', q(inv.matchCapture.actualMonthly, U.monthlyPre)), inputOf('Most available', q(inv.matchCapture.maxMonthly, U.monthlyPre))], result: r }, { dollarsLeftAnnual: inv.matchCapture.dollarsLeftAnnual })); }
  else put(need('matchCapture', ['a match formula and the pre-tax deferral (Benefits and match row)']));
  put(inv && inv.roomLeft && inv.roomLeft.length ? ok('roomLeft', { status: 'ok', kind: 'list', value: inv.roomLeft, confidence: 1 }, { formula: 'limit - this year\'s contributions, per limit', inputs: inv.roomLeft.map(r => inputOf(r.label, q(r.used, U.annualNa))), result: null }) : need('roomLeft', ['a retirement or HSA account']));
  /* 34, 35, 36 */
  const wer = inv && inv.weightedExpenseRatio;
  put(wer !== null && wer !== undefined ? ok('weightedEr', pct(wer, 0.7), { formula: 'sum(balance x expense ratio) / balances with holdings', inputs: [inputOf('Fee drag a year', Q(inv.feeDragAnnual))], result: pct(wer) }) : need('weightedEr', ['holdings with expense ratios']));
  const retAge = (lf && lf.retirementAge) || asm.retirementAgeDefault;
  const invested = inv && Q(inv.investedAssets);
  if (wer !== null && wer !== undefined && invested && ctx.age !== null) {
    const years = retAge - ctx.age; const g = Math.pow(1 + asm.returnLikely, years), gf = Math.pow(1 + asm.returnLikely - wer, years);
    const v = q(Math.round(invested.cents * (g - gf)), U.oneoff, { confidence: 0.7, rough: true });
    put(ok('feeDragLifetime', v, { formula: 'invested x ((1 + r)^years - (1 + r - ER)^years) to retirement age', inputs: [inputOf('Invested', invested), inputOf('Expense ratio', pct(wer)), inputOf('Years to ' + retAge, count(years, 'years')), inputOf('Likely return', pct(asm.returnLikely))], result: v }));
  } else put(need('feeDragLifetime', ['holdings with expense ratios', 'birth date']));
  put(inv && inv.allocation ? ok('allocation', { status: 'ok', kind: 'shares', value: inv.allocation, confidence: totalAssets ? totalAssets.confidence : 1 }, { formula: 'sum(balance x share) / total assets', inputs: Object.keys(inv.allocation.dollars).map(k => inputOf(k, q(inv.allocation.dollars[k], U.oneoff))), result: null }) : need('allocation', ['account balances with stock, bond and cash shares']));
  /* 37-40 */
  put(tx && tx.impliedRate !== null && tx.impliedRate !== undefined && !isNeeds(tx.impliedRate) && Number.isFinite(tx.impliedRate) ? ok('impliedTaxRate', pct(tx.impliedRate, take ? take.confidence : 1), { formula: '(gross - take-home - payroll deductions) / gross, from the paystub', inputs: [inputOf('Gross', gross), inputOf('Take-home', take), inputOf('Pre-tax retirement', Q(inc.pretaxContribMonthly)), inputOf('Other pre-tax', Q(inc.pretaxOtherMonthly))], result: pct(tx.impliedRate) }) : fromNeeds('impliedTaxRate', '(gross - take-home - deductions) / gross', tx && tx.impliedRate));
  if (tx && Q(tx.federalAnnual)) {
    put(ok('federalRates', { status: 'ok', kind: 'ratio', value: tx.effectiveRate, confidence: tx.federalAnnual.confidence, rough: tx.federalAnnual.rough, marginal: tx.marginalRate, federalAnnual: tx.federalAnnual }, { formula: 'taxable = gross x 12 - pre-tax deductions - standard deduction; tax by 2026 bracket; effective = tax / gross; marginal = bracket of the last dollar', inputs: [inputOf('Gross a year', scale(gross, 12)), inputOf('Pre-tax deductions a year', q(((Q(inc.pretaxContribMonthly) || { cents: 0 }).cents + (Q(inc.hsaPayrollMonthly) || { cents: 0 }).cents + (Q(inc.pretaxOtherMonthly) || { cents: 0 }).cents) * 12, U.annualPre)), inputOf('Standard deduction', q(tx.standardDeduction, U.oneoff)), inputOf('Taxable income', tx.taxable), inputOf('Federal tax', tx.federalAnnual)], result: pct(tx.effectiveRate) }));
    put(ok('fica', tx.ficaAnnual, { formula: 'Social Security 6.2% of wages up to the wage base + Medicare 1.45%; both halves on self-employment income', inputs: [inputOf('Social Security', q(tx.ficaParts.socialSecurity, U.annualNa)), inputOf('Medicare', q(tx.ficaParts.medicare, U.annualNa)), inputOf('Self-employment tax', q(tx.selfEmployment.tax, U.annualNa))], result: tx.ficaAnnual }));
    put(ok('taxSavedPer1000', tx.savedPer1000Pretax, { formula: 'marginal rate x $1,000', inputs: [inputOf('Marginal rate', pct(tx.marginalRate))], result: tx.savedPer1000Pretax }));
  } else { ['federalRates', 'fica', 'taxSavedPer1000'].forEach(id => put(fromNeeds(id, 'federal brackets and FICA', tx && tx.federalAnnual))); }
  /* 41-46 */
  const nw = out.netWorth.status === 'ok' ? out.netWorth.value : null;
  if (spending && spending.cents > 0) {
    const annual = scale(spending, 12); const fi = q(Math.round(annual.cents / asm.withdrawalRate), U.oneoff, { confidence: spending.confidence, rough: spending.rough, range: spending.range ? { low: Math.round(spending.range.low * 12 / asm.withdrawalRate), high: Math.round(spending.range.high * 12 / asm.withdrawalRate) } : null });
    put(ok('fiNumber', fi, { formula: 'annual spending / withdrawal rate', inputs: [inputOf('Annual spending', annual), inputOf('Withdrawal rate', pct(asm.withdrawalRate))], result: fi }));
    /* the FI progress basis (MR-040, MR-057): net worth by default, the same line the FI date is read from; invested assets by assumption */
    const basisQ = asm.fiProgressBasis === 'netWorth' ? nw : (inv && Q(inv.investedAssets));
    const basisLabel = asm.fiProgressBasis === 'netWorth' ? 'Net worth' : 'Invested assets';
    if (basisQ && fi.cents > 0) { const r = ratio(basisQ, fi); put(ok('pctToFi', r, { formula: basisLabel.toLowerCase() + ' / FI number', inputs: [inputOf(basisLabel, basisQ), inputOf('FI number', fi)], result: r }, { basis: asm.fiProgressBasis === 'netWorth' ? 'netWorth' : 'invested' })); } else put(fromNeeds('pctToFi', 'invested / FI number', basisQ || (asm.fiProgressBasis === 'netWorth' ? out.netWorth : (inv && inv.investedAssets))));
    if (ctx.age !== null) {
      const years = retAge - ctx.age; const g = Math.pow(1 + asm.returnLikely, years); const coast = q(Math.round(fi.cents / g), U.oneoff, { confidence: fi.confidence, rough: fi.rough });
      put(ok('coastFi', coast, { formula: 'FI number / (1 + likely return)^(years to retirement age); ' + basisLabel.toLowerCase() + ' / that', inputs: [inputOf('FI number', fi), inputOf('Years to ' + retAge, count(years, 'years')), inputOf('Likely return', pct(asm.returnLikely)), inputOf(basisLabel, basisQ)], result: coast }, { coastPct: basisQ && coast.cents > 0 ? basisQ.cents / coast.cents : null, retirementAge: retAge }));
    } else put(need('coastFi', ['birth date']));
    const lean = fat ? q(Math.round(fat.cents * 12 / asm.withdrawalRate), U.oneoff, { confidence: fat.confidence, rough: fat.rough }) : null;
    const baristaAnnual = lf && Q(lf.baristaIncomeMonthly) ? Q(lf.baristaIncomeMonthly).cents * 12 : asm.baristaIncomeAnnualCents;
    put(ok('fiLevels', { status: 'ok', kind: 'list', value: { lean: lean ? lean.cents : null, fi: fi.cents, fat: lf && Q(lf.dreamSpendingMonthly) ? Math.round(Q(lf.dreamSpendingMonthly).cents * 12 / asm.withdrawalRate) : Math.round(annual.cents * asm.fatFiMultiplier / asm.withdrawalRate), barista: Math.round(Math.max(0, annual.cents - baristaAnnual) / asm.withdrawalRate) }, confidence: fi.confidence, rough: fi.rough }, { formula: 'Lean: FAT floor x 12 / wr; Fat: dream spending x 12 / wr (or spending x fat multiplier); Barista: (spending x 12 - part-time income) / wr', inputs: [inputOf('FAT floor', fat), inputOf('Annual spending', annual), inputOf('Fat multiplier', count(asm.fatFiMultiplier, 'x')), inputOf('Part-time income a year', q(baristaAnnual, U.annualAfter))], result: null }));
  } else { ['fiNumber', 'pctToFi', 'coastFi', 'fiLevels'].forEach(id => put(fromNeeds(id, 'annual spending / withdrawal rate', spending || (sp && sp.baselineMonthly)))); }
  const pj = ctx.projection;
  if (pj && pj.likely && pj.likely.fiAge !== null) {
    const v = dateValue(String(pj.likely.fiYear) + '-' + ctx.birthMonth, spending ? spending.confidence : 0.6);
    put(ok('fiDate', Object.assign({}, v, { rough: true }), { formula: 'projection year by year to 95 at the likely, best and worst real returns; goals leave cash in the year they are spent; first year net worth x withdrawal rate covers spending', inputs: [inputOf('Likely return', pct(asm.returnLikely)), inputOf('Best', pct(asm.returnBest)), inputOf('Worst', pct(asm.returnWorst)), inputOf('Annual spending', spending ? scale(spending, 12) : null), inputOf('Contributions a year', q(ctx.contribAnnual || 0, U.annualNa))].concat(ctx.goalDrawTotal > 0 ? [inputOf('Goals spent along the way', q(ctx.goalDrawTotal, U.annualNa))] : []), result: v }, { ages: { likely: pj.likely.fiAge, best: pj.best.fiAge, worst: pj.worst.fiAge }, yearsToFi: pj.likely.fiAge - ctx.age }));
  } else put(need('fiDate', pj ? ['a savings rate that reaches the FI number before 95 at the likely return'] : ['income, spending and account balances']));
  if (pj && pj.likely && ctx.oneMorePoint !== null && ctx.oneMorePoint !== undefined) { const c = count(ctx.oneMorePoint.months, 'months'); put(ok('oneMorePoint', c, { formula: 'FI date with 1% more of take-home saved each month, minus the FI date today', inputs: [inputOf('One more point a month', q(ctx.oneMorePoint.monthly, U.monthlyAfter)), inputOf('FI age today', count(pj.likely.fiAge, 'years')), inputOf('FI age with one more point', count(ctx.oneMorePoint.fiAge, 'years'))], result: c }, { monthly: ctx.oneMorePoint.monthly })); }
  else put(need('oneMorePoint', ['an FI date']));
  /* Level 9 (MR-040): the FI ladder, the headline FI metrics and the benchmarks. One formula each; the ladder math lives in fiLadder.js. */
  levelNine(ctx, out, put, { take, gross, spending, fat, nw, inv, lf, retAge, pj: ctx.projection, asm });
  /* 47, 48 */
  put(dt && dt.wallet && dt.wallet.cards.length ? ok('cardNetValue', { status: 'ok', kind: 'list', value: dt.wallet.cards, confidence: 0.7, rough: true }, { formula: 'credits actually used + rewards on actual spending - annual fee, per card (library rates, verify)', inputs: dt.wallet.cards.map(c => inputOf(c.name, q(c.netAnnual, U.annualAfter))), result: null }) : need('cardNetValue', ['a credit card row from the library and spending lines that name it']));
  put(dt && dt.wallet && dt.wallet.cards.length ? ok('rewardsLeft', q(dt.wallet.rewardsLeftAnnual, U.annualAfter, { confidence: 0.7, rough: true }), { formula: 'for each spending line with a card: (best library rate for its category - actual rate) x spend x 12', inputs: Object.keys(dt.wallet.bestRates).map(k => inputOf('Best ' + k, pct(dt.wallet.bestRates[k]))), result: q(dt.wallet.rewardsLeftAnnual, U.annualAfter) }) : need('rewardsLeft', ['spending lines that name a card']));
  return out;
}

/* ---- Level 9 ---- */
function levelNine(ctx, out, put, v) {
  const { take, gross, spending, fat, nw, inv, lf, retAge, pj, asm } = v;
  const Q = (x) => x && x.status === 'ok' && typeof x.cents === 'number' ? x : null;
  const S = ctx.sun.outputs; const sp = S.spending;
  const invested = inv && Q(inv.investedAssets);
  const path = pj && pj.likely ? pj.likely.path : null;
  const wr = asm.withdrawalRate, r = asm.returnLikely;
  const todayYear = parseInt(ctx.today.slice(0, 4), 10);
  const monthDate = months => { if (months === null) return null; const m0 = todayYear * 12 + parseInt(ctx.today.slice(5, 7), 10) - 1 + Math.round(months); return String(Math.floor(m0 / 12)) + '-' + String(m0 % 12 + 1).padStart(2, '0'); };
  const L = fiLadder({ spending, fatFloor: fat, byCategory: sp && sp.byCategory, gut: lf && lf.gutSpendingMonthly, dream: lf && lf.dreamSpendingMonthly, barista: lf && lf.baristaIncomeMonthly, invested, netWorth: nw, asm, age: ctx.age, retirementAge: retAge, dreamFiAge: lf && lf.dreamFiAge, path, today: ctx.today });
  ctx.ladderOut = L;
  const baseNeeds = spending ? [] : ['monthly spending'];
  /* the five rungs */
  L.rungs.forEach(rg => {
    if (rg.number === null) { put(need(rg.id, rg.needs || baseNeeds)); return; }
    const val = q(rg.number, U.oneoff, { confidence: spending ? spending.confidence : 0.6, rough: rg.rough });
    const inputs = [inputOf('Spending a month on this rung', q(rg.monthlySpend, U.monthlyAfter)), inputOf('Withdrawal rate', pct(wr)), inputOf(L.basis === 'netWorth' ? 'Net worth' : 'Invested assets', L.basisCents === null ? null : q(L.basisCents, U.oneoff))];
    if (rg.id === 'baristaLeanFi' || rg.id === 'baristaRegularFi') inputs.push(inputOf('Part-time income a month' + (L.barista.typed ? '' : ' (assumption)'), q(L.barista.monthly, U.monthlyAfter)));
    if (rg.id === 'fatFi') inputs.push(inputOf(rg.source === 'dream' ? 'Dream spending' : 'Fat multiplier', rg.source === 'dream' ? q(rg.monthlySpend, U.monthlyAfter) : count(asm.fatFiMultiplier, 'x')));
    put(ok(rg.id, val, { formula: (ctx.data.metrics.metrics.find(m => m.id === rg.id) || {}).formula, inputs, result: val }, { pct: rg.pct, months: rg.months, reachedYear: rg.reachedYear, reachedAge: rg.reachedAge, requiredMonthly: rg.requiredMonthly, targetAge: L.targetAge, source: rg.source || null, date: monthDate(rg.months), rungLabel: RUNG_LABELS[rg.id] }));
  });
  /* the rule of thumb and the reverse */
  if (spending) put(ok('baristaRule', q(L.baristaRule, U.oneoff), { formula: '$100 x 12 / withdrawal rate', inputs: [inputOf('Withdrawal rate', pct(wr))], result: q(L.baristaRule, U.oneoff) }, { perHundred: L.baristaRule, at35: baristaRule(0.035) }));
  else put(need('baristaRule', ['monthly spending']));
  if (L.baristaIncomeNeeded.regular !== null) put(ok('baristaIncomeNeededToday', q(L.baristaIncomeNeeded.regular, U.monthlyAfter, { confidence: spending.confidence, rough: spending.rough }), { formula: 'max(0, spending a month - invested x withdrawal rate / 12)', inputs: [inputOf('Spending a month', spending), inputOf(L.basis === 'netWorth' ? 'Net worth' : 'Invested assets', q(L.basisCents, U.oneoff)), inputOf('Withdrawal rate', pct(wr))], result: q(L.baristaIncomeNeeded.regular, U.monthlyAfter) }, { lean: L.baristaIncomeNeeded.lean }));
  else put(need('baristaIncomeNeededToday', spending ? ['account balances'] : ['monthly spending']));
  /* ratios of invested to spending */
  if (invested && spending && spending.cents > 0) {
    const annual = spending.cents * 12;
    const rental = S.income && S.income.byType && S.income.byType.rental ? S.income.byType.rental * 12 : 0;
    const fr = pct((invested.cents * wr + rental) / annual, weightedConfidence([invested, spending]));
    put(ok('fiRatio', Object.assign({}, fr, { rough: invested.rough || spending.rough }), { formula: '(invested x withdrawal rate + rental income a year) / annual spending', inputs: [inputOf('Invested', invested), inputOf('Withdrawal rate', pct(wr)), inputOf('Rental income a year', q(rental, U.annualPre)), inputOf('Annual spending', q(annual, U.annualAfter))], result: fr }));
    const days = count(Math.round(invested.cents / (annual / 365) * 10) / 10, 'days', weightedConfidence([invested, spending]));
    put(ok('daysOfFreedom', Object.assign({}, days, { rough: invested.rough || spending.rough }), { formula: 'invested / (annual spending / 365)', inputs: [inputOf('Invested', invested), inputOf('Spending a day', q(Math.round(annual / 365), U.oneoffAfter))], result: days }));
    const yrs = count(Math.round(invested.cents / annual * 100) / 100, 'years', weightedConfidence([invested, spending]));
    put(ok('yearsOfExpenses', Object.assign({}, yrs, { rough: invested.rough || spending.rough }), { formula: 'invested / annual spending', inputs: [inputOf('Invested', invested), inputOf('Annual spending', q(annual, U.annualAfter))], result: yrs }, { fiAt: Math.round(1 / wr * 10) / 10 }));
    /* true FI: withdrawals taxed as ordinary income on the pre-tax share */
    const b = inv.balancesByBucket; const total = Object.values(b).reduce((s2, x) => s2 + x, 0);
    const pretaxShare = total > 0 ? b.pretax / total : 0;
    const table = ctx.data.tax2026; const status = (ctx.facts.filingStatus && ctx.facts.filingStatus.v) || 'single';
    const afterTax = W => W - federalTax(table, Math.max(0, Math.round(W * pretaxShare) - standardDeduction(table, status)), status).tax;
    let lo = annual, hi = annual * 2;
    for (let i = 0; i < 60; i++) { const mid = Math.round((lo + hi) / 2); if (afterTax(mid) >= annual) hi = mid; else lo = mid; if (hi - lo <= 100) break; }
    const W = hi; const trueFi = q(Math.round(W / wr), U.oneoff, { confidence: Math.min(spending.confidence, 0.85), rough: true });
    put(ok('trueFiNumber', trueFi, { formula: 'withdrawals W where W - federal tax on (W x pre-tax share - standard deduction) = annual spending; W / withdrawal rate', inputs: [inputOf('Annual spending', q(annual, U.annualAfter)), inputOf('Pre-tax share of balances', pct(pretaxShare)), inputOf('Gross withdrawals a year', q(W, U.annualPre)), inputOf('Tax on them', q(W - afterTax(W), U.annualNa))], result: trueFi }, { grossWithdrawal: W, taxAnnual: W - afterTax(W), pretaxShare }));
  } else ['fiRatio', 'daysOfFreedom', 'yearsOfExpenses', 'trueFiNumber'].forEach(id => put(fromNeeds(id, 'invested / spending', invested || (inv && inv.investedAssets), spending || (sp && sp.baselineMonthly))));
  /* projection-based dates */
  const fiAge = pj && pj.likely ? pj.likely.fiAge : null;
  if (path && invested && spending && spending.cents > 0) {
    const regular = L.rungs.find(x => x.id === 'regularFi');
    /* MR-057: the crossover and the first $100,000 are read from the projection's net worth line, the same line the FI date and every ladder rung come from, so every FI date tells one story. The flip stays on invested assets by its nature and says so. */
    const nwToday = nw ? nw.cents : invested.cents;
    const nwSeries = path.map(p => ({ year: p.year, age: p.age, value: p.netWorth }));
    const cross = monthsToReach(regular.number, nwToday, nwSeries);
    put(cross === null ? need('crossoverDate', ['a savings rate that reaches the FI number before 95']) : ok('crossoverDate', Object.assign({}, dateValue(monthDate(cross)), { rough: true }), { formula: 'first projected month net worth x withdrawal rate covers spending (the FI date, to the month)', inputs: [inputOf('FI number', q(regular.number, U.oneoff)), inputOf('Net worth today', nw || invested)], result: dateValue(monthDate(cross)) }, { months: cross }));
    const m100 = monthsToReach(10000000, nwToday, nwSeries);
    put(m100 === null ? need('first100kDate', ['contributions that reach $100,000 before 95']) : ok('first100kDate', Object.assign({}, dateValue(monthDate(m100)), { rough: true }), { formula: 'first projected month net worth reaches $100,000', inputs: [inputOf('Net worth today', nw || invested)], result: dateValue(monthDate(m100)) }, { months: m100, reached: m100 === 0 }));
    const contrib = ctx.contribAnnual || 0;
    let flip = null; let prev = invested.cents;
    for (let i = 0; i < path.length; i++) { if (!path[i].working) break; if (Math.round(prev * r) > contrib) { flip = path[i]; break; } prev = path[i].invested; }
    put(flip ? ok('theFlip', Object.assign({}, dateValue(String(flip.year) + '-' + ctx.birthMonth), { rough: true }), { formula: 'first projected year invested x return exceeds contributions', inputs: [inputOf('Contributions a year', q(contrib, U.annualNa)), inputOf('Likely return', pct(r)), inputOf('Invested today', invested)], result: dateValue(String(flip.year) + '-' + ctx.birthMonth) }, { age: flip.age, already: Math.round(invested.cents * r) > contrib }) : need('theFlip', ['contributions that growth can overtake before retirement']));
  } else ['crossoverDate', 'first100kDate', 'theFlip'].forEach(id => put(need(id, ['income, spending and account balances'])));
  /* Social Security floor and the health care bridge */
  if (spending && spending.cents > 0 && pj && pj.ssMonthly !== undefined) {
    const ss = pj.ssMonthly * 12; const annual = spending.cents * 12;
    const fiA = fiAge !== null ? fiAge : retAge;
    const bridge = Math.max(0, asm.socialSecurityAge - fiA);
    const n = Math.round(Math.max(0, annual - ss) / wr + ss * bridge);
    const val = q(n, U.oneoff, { confidence: Math.min(spending.confidence, 0.7), rough: true });
    put(ok('ssAdjustedFiNumber', val, { formula: '(annual spending - Social Security a year) / withdrawal rate + Social Security a year x bridge years', inputs: [inputOf('Annual spending', q(annual, U.annualAfter)), inputOf('Social Security a year from ' + asm.socialSecurityAge, q(ss, U.annualNa)), inputOf('Bridge years from FI at ' + fiA, count(bridge, 'years'))], result: val }, { bridgeYears: bridge, ssAnnual: ss, fiAge: fiA }));
    const years65 = Math.max(0, 65 - fiA);
    const hc = q(Math.round(asm.healthcarePremiumMonthlyCents * 12 * years65), U.oneoff, { confidence: 0.5, rough: true });
    put(ok('healthcareBridge', hc, { formula: 'premium a month x 12 x years from the FI date to 65', inputs: [inputOf('Premium a month (assumption)', q(asm.healthcarePremiumMonthlyCents, U.monthlyAfter)), inputOf('Years from FI at ' + fiA + ' to 65', count(years65, 'years'))], result: hc }, { years: years65, fiAge: fiA }));
  } else { put(fromNeeds('ssAdjustedFiNumber', 'FI number with Social Security', spending || (sp && sp.baselineMonthly), pj ? q(1, U.oneoff) : needs(['income, spending and account balances']))); put(fromNeeds('healthcareBridge', 'premium x years to 65', spending || (sp && sp.baselineMonthly), pj ? q(1, U.oneoff) : needs(['income, spending and account balances']))); }
  /* multipliers */
  if (ctx.age !== null) {
    const yrs = retAge - ctx.age; const wm = count(Math.round(Math.pow(1 + r, yrs) * 100) / 100, 'x');
    put(ok('wealthMultiplier', wm, { formula: '(1 + likely return) ^ (retirement age - age)', inputs: [inputOf('Likely return', pct(r)), inputOf('Years to ' + retAge, count(yrs, 'years'))], result: wm }, { years: yrs }));
  } else put(need('wealthMultiplier', ['birth date']));
  const dt = count(Math.round(72 / (r * 100) * 10) / 10, 'years');
  if (invested) put(ok('doublingTime', dt, { formula: '72 / (real return x 100)', inputs: [inputOf('Likely return', pct(r)), inputOf('Invested today', invested)], result: dt }, { doubled: invested.cents * 2 }));
  else put(need('doublingTime', ['account balances']));
  /* a purchase in FI days */
  if (out.fiNumber.status === 'ok') {
    const growth = Math.round(out.fiNumber.value.cents * r) + (ctx.contribAnnual || 0);
    if (growth > 0) {
      const days = count(Math.round(100000 / growth * 365 * 10) / 10, 'days', 0.7);
      put(ok('purchaseInFiDays', Object.assign({}, days, { rough: true }), { formula: '$1,000 / (FI number x return + contributions a year) x 365 days; $100 a month x 12 / withdrawal rate', inputs: [inputOf('FI number', out.fiNumber.value), inputOf('Growth near FI, a year', q(growth, U.annualNa)), inputOf('Withdrawal rate', pct(wr))], result: days }, { perThousandDays: days.value, perHundredMonthly: baristaRule(wr, 10000), growthAnnual: growth }));
    } else put(need('purchaseInFiDays', ['contributions or a return above zero']));
  } else put(need('purchaseInFiDays', out.fiNumber.needs));
  /* the dream FI age */
  const regular = L.rungs.find(x => x.id === 'regularFi');
  if (regular.number !== null && regular.requiredMonthly !== null) {
    const req = q(regular.requiredMonthly, U.monthlyAfter, { confidence: spending.confidence, rough: true });
    put(ok('requiredMonthly', req, { formula: '(FI number - invested x g) x r / (12 x (g - 1)), g = (1 + r)^years to the dream FI age', inputs: [inputOf('FI number', q(regular.number, U.oneoff)), inputOf(L.basis === 'netWorth' ? 'Net worth' : 'Invested', q(L.basisCents, U.oneoff)), inputOf('Years to ' + L.targetAge + (lf && lf.dreamFiAge ? ' (dream FI age)' : ' (retirement age)'), count(L.years, 'years')), inputOf('Likely return', pct(r))], result: req }, { targetAge: L.targetAge, years: L.years, dream: !!(lf && lf.dreamFiAge) }));
    if (take && take.cents > 0) { const sr = pct(regular.requiredMonthly / take.cents, take.confidence); put(ok('savingsRateNeeded', Object.assign({}, sr, { rough: true }), { formula: 'required monthly / take-home', inputs: [inputOf('Required a month', req), inputOf('Take-home', take)], result: sr }, { targetAge: L.targetAge })); }
    else put(need('savingsRateNeeded', ['take-home pay']));
  } else { put(need('requiredMonthly', regular.number === null ? ['monthly spending'] : ['account balances', 'birth date'])); put(need('savingsRateNeeded', regular.number === null ? ['monthly spending'] : ['account balances', 'birth date'])); }
  /* guardrails */
  if (spending && spending.cents > 0) {
    const band = asm.guardrailsBand; const g = q(spending.cents, U.monthlyAfter, { confidence: spending.confidence, rough: spending.rough, range: { low: Math.round(spending.cents * (1 - band)), high: Math.round(spending.cents * (1 + band)) } });
    put(ok('guardrailsBand', g, { formula: 'spending x (1 - band) to spending x (1 + band); the withdrawal rate stays within the band of its start', inputs: [inputOf('Spending a month', spending), inputOf('Band', pct(band))], result: g }, { band }));
  } else put(fromNeeds('guardrailsBand', 'spending band', spending || (sp && sp.baselineMonthly)));
  /* gut and dream gaps as FI date */
  const gapMetric = (id, other, label) => {
    const o = Q(other);
    if (!o) { put(need(id, [label.toLowerCase() + ' on the Life plan'])); return; }
    if (!spending || out.fiNumber.status !== 'ok') { put(need(id, ['monthly spending'])); return; }
    const diff = o.cents - spending.cents; const dN = Math.round(diff * 12 / wr);
    const growth = Math.round(out.fiNumber.value.cents * r) + (ctx.contribAnnual || 0);
    const months = growth > 0 ? Math.round(dN / growth * 12 * 10) / 10 : null;
    const c = count(months === null ? 0 : months, 'months', 0.6);
    put(ok(id, Object.assign({}, c, { rough: true }), { formula: '(' + label.toLowerCase() + ' - spending) x 12 / withdrawal rate; that / growth near FI x 12 months', inputs: [inputOf(label, o), inputOf('Spending a month', spending), inputOf('FI number change', q(dN, U.oneoff)), inputOf('Growth near FI, a year', q(growth, U.annualNa))], result: c }, { diffMonthly: diff, fiNumberDelta: dN }));
  };
  gapMetric('gutGap', lf && lf.gutSpendingMonthly, 'Gut spending');
  gapMetric('dreamGap', lf && lf.dreamSpendingMonthly, 'Dream spending');
  /* benchmarks (coach view by default) */
  if (ctx.age !== null && gross && gross.cents > 0 && nw) {
    const expected = Math.round(ctx.age * gross.cents * 12 / 10);
    const rr = pct(expected > 0 ? nw.cents / expected : 0, Math.min(gross.confidence, nw.confidence));
    put(ok('expectedNetWorth', Object.assign({}, rr, { rough: gross.rough || nw.rough }), { formula: 'age x annual gross / 10; net worth / that', inputs: [inputOf('Age', count(ctx.age, 'years')), inputOf('Gross a year', scale(gross, 12)), inputOf('Expected net worth', q(expected, U.oneoff)), inputOf('Net worth', nw)], result: rr }, { expectedCents: expected }));
  } else put(need('expectedNetWorth', [ctx.age === null ? 'birth date' : null, !gross ? 'gross pay' : null, !nw ? 'account balances' : null].filter(Boolean)));
  if (ctx.age !== null && gross && gross.cents > 0 && invested) {
    const src = ctx.data.benchmarks && ctx.data.benchmarks.salaryMultiples[asm.benchmarkSource] ? ctx.data.benchmarks.salaryMultiples[asm.benchmarkSource] : null;
    const bench = src ? interpolate(src.points, ctx.age) : null;
    const mult = invested.cents / (gross.cents * 12);
    const rr = pct(Math.round(mult * 100) / 100, Math.min(gross.confidence, invested.confidence));
    put(ok('salaryMultiple', Object.assign({}, rr, { rough: gross.rough || invested.rough }), { formula: 'invested / annual gross, against the benchmark for this age', inputs: [inputOf('Invested', invested), inputOf('Gross a year', scale(gross, 12)), inputOf('Benchmark at ' + ctx.age + (src ? ' (' + src.label + ', verify)' : ''), bench === null ? null : count(bench, 'x'))], result: rr }, { benchmark: bench, source: src ? src.label : null, verify: true }));
  } else put(need('salaryMultiple', [ctx.age === null ? 'birth date' : null, !gross ? 'gross pay' : null, !invested ? 'account balances' : null].filter(Boolean)));
}
function interpolate(points, x) {
  if (!points || !points.length) return null;
  if (x <= points[0][0]) return points[0][1] * Math.max(0, x / points[0][0]);
  for (let i = 1; i < points.length; i++) { if (x <= points[i][0]) { const [x0, y0] = points[i - 1]; const [x1, y1] = points[i]; return Math.round((y0 + (y1 - y0) * (x - x0) / (x1 - x0)) * 100) / 100; } }
  return points[points.length - 1][1];
}
