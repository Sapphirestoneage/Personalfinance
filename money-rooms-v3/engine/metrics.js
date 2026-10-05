/* The 48 metrics. Each is computed from the Sun's slots, carries units and
   a show-the-math record (formula, inputs with state and source, result),
   and says what it needs when an input is missing. Labels come only from
   data/metrics.json so one number never has two names. */
import { q, U, add, sub, ratio, pct, count, dateValue, needs, isNeeds, isQ, scale, weightedConfidence } from './units.js';
import * as F from './format.js';
import { ageAt } from './format.js';

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
  } else put(gross && gross.cents === 0 ? need('savingsRateGross', ['gross pay above zero']) : fromNeeds('savingsRateGross', '(contributions + match + take-home - spending) / (gross + match)', take || (inc && inc.takeHomeMonthly), spending || (sp && sp.baselineMonthly), gross || (inc && inc.grossMonthly)));
  /* 7 */
  const surplus = out.surplus.status === 'ok' ? out.surplus.value : null;
  if (surplus && take && take.cents > 0) {
    const landing = Q(sp.savingsLandingMonthly) || q(0, U.monthlyAfter);
    const leak = sub(surplus, landing); const r = pct(leak.cents / take.cents, leak.confidence); 
    put(ok('leak', Object.assign({}, r, { rough: leak.rough }), { formula: '(surplus - savings landing) / take-home', inputs: [inputOf('Surplus', surplus), inputOf('Savings landing', landing), inputOf('Take-home', take)], result: r }, { leakMonthly: leak }));
  } else put(take && take.cents === 0 ? need('leak', ['take-home above zero']) : fromNeeds('leak', '(surplus - savings landing) / take-home', surplus || out.surplus));
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
  } else put(take && take.cents === 0 ? need('draftt', ['take-home above zero']) : fromNeeds('draftt', 'each DRAFTT line / take-home', take || (inc && inc.takeHomeMonthly), gross || (inc && inc.grossMonthly), sp && sp.baselineMonthly));
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
  else put(need('matchCapture', ['a match formula (Benefits and match row) and the pre-tax deferral']));
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
    if (nw && fi.cents > 0) { const r = ratio(nw, fi); put(ok('pctToFi', r, { formula: 'net worth / FI number', inputs: [inputOf('Net worth', nw), inputOf('FI number', fi)], result: r })); } else put(fromNeeds('pctToFi', 'net worth / FI number', nw || out.netWorth));
    if (ctx.age !== null) {
      const years = retAge - ctx.age; const g = Math.pow(1 + asm.returnLikely, years); const coast = q(Math.round(fi.cents / g), U.oneoff, { confidence: fi.confidence, rough: fi.rough });
      put(ok('coastFi', coast, { formula: 'FI number / (1 + likely return)^(years to retirement age); net worth / that', inputs: [inputOf('FI number', fi), inputOf('Years to ' + retAge, count(years, 'years')), inputOf('Likely return', pct(asm.returnLikely)), inputOf('Net worth', nw)], result: coast }, { coastPct: nw && coast.cents > 0 ? nw.cents / coast.cents : null, retirementAge: retAge }));
    } else put(need('coastFi', ['birth date']));
    const lean = fat ? q(Math.round(fat.cents * 12 / asm.withdrawalRate), U.oneoff, { confidence: fat.confidence, rough: fat.rough }) : null;
    put(ok('fiLevels', { status: 'ok', kind: 'list', value: { lean: lean ? lean.cents : null, fi: fi.cents, fat: Math.round(annual.cents * asm.fatFiMultiplier / asm.withdrawalRate), barista: Math.round(Math.max(0, annual.cents - asm.baristaIncomeAnnualCents) / asm.withdrawalRate) }, confidence: fi.confidence, rough: fi.rough }, { formula: 'Lean: FAT floor x 12 / wr; Fat: spending x 12 x fat multiplier / wr; Barista: (spending x 12 - part-time income) / wr', inputs: [inputOf('FAT floor', fat), inputOf('Annual spending', annual), inputOf('Fat multiplier', count(asm.fatFiMultiplier, 'x')), inputOf('Part-time income a year', q(asm.baristaIncomeAnnualCents, U.annualAfter))], result: null }));
  } else { ['fiNumber', 'pctToFi', 'coastFi', 'fiLevels'].forEach(id => put(fromNeeds(id, 'annual spending / withdrawal rate', spending || (sp && sp.baselineMonthly)))); }
  const pj = ctx.projection;
  if (pj && pj.likely && pj.likely.fiAge !== null) {
    const v = dateValue(String(pj.likely.fiYear) + '-' + ctx.birthMonth, spending ? spending.confidence : 0.6);
    put(ok('fiDate', Object.assign({}, v, { rough: true }), { formula: 'projection year by year to 95 at the likely, best and worst real returns; first year net worth x withdrawal rate covers spending', inputs: [inputOf('Likely return', pct(asm.returnLikely)), inputOf('Best', pct(asm.returnBest)), inputOf('Worst', pct(asm.returnWorst)), inputOf('Annual spending', spending ? scale(spending, 12) : null), inputOf('Contributions a year', q(ctx.contribAnnual || 0, U.annualNa))], result: v }, { ages: { likely: pj.likely.fiAge, best: pj.best.fiAge, worst: pj.worst.fiAge }, yearsToFi: pj.likely.fiAge - ctx.age }));
  } else put(need('fiDate', pj ? ['a savings rate that reaches the FI number before 95 at the likely return'] : ['income, spending and account balances']));
  if (pj && pj.likely && ctx.oneMorePoint !== null && ctx.oneMorePoint !== undefined) { const c = count(ctx.oneMorePoint.months, 'months'); put(ok('oneMorePoint', c, { formula: 'FI date with 1% more of take-home saved each month, minus the FI date today', inputs: [inputOf('One more point a month', q(ctx.oneMorePoint.monthly, U.monthlyAfter)), inputOf('FI age today', count(pj.likely.fiAge, 'years')), inputOf('FI age with one more point', count(ctx.oneMorePoint.fiAge, 'years'))], result: c }, { monthly: ctx.oneMorePoint.monthly })); }
  else put(need('oneMorePoint', ['a FI date']));
  /* 47, 48 */
  put(dt && dt.wallet && dt.wallet.cards.length ? ok('cardNetValue', { status: 'ok', kind: 'list', value: dt.wallet.cards, confidence: 0.7, rough: true }, { formula: 'credits actually used + rewards on actual spending - annual fee, per card (library rates, verify)', inputs: dt.wallet.cards.map(c => inputOf(c.name, q(c.netAnnual, U.annualAfter))), result: null }) : need('cardNetValue', ['a credit card row from the library and spending lines that name it']));
  put(dt && dt.wallet && dt.wallet.cards.length ? ok('rewardsLeft', q(dt.wallet.rewardsLeftAnnual, U.annualAfter, { confidence: 0.7, rough: true }), { formula: 'for each spending line with a card: (best library rate for its category - actual rate) x spend x 12', inputs: Object.keys(dt.wallet.bestRates).map(k => inputOf('Best ' + k, pct(dt.wallet.bestRates[k]))), result: q(dt.wallet.rewardsLeftAnnual, U.annualAfter) }) : need('rewardsLeft', ['spending lines that name a card']));
  return out;
}
