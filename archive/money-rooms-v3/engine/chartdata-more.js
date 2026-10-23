/* The 22 charts of the demo brief Part C (MR-061). Every builder reads the
   computed result (slots, metrics, the projection, the ladder, the debt
   simulations, the anchors) and returns plain numbers for ui/charts-more.js
   to draw. A builder returns { needs } when its inputs are missing. The few
   curves that are not already a metric (savings rate to years, the coast
   curve, the fee-drag path) run the engine's own formulas here, so the views
   still do no math. Builders that need the sensitivity run read it from
   `extra.sensitivity`, handed in by the view from the levers bridge. */
import { isQ } from './units.js';
import { project } from './projection.js';
import { variance } from './variance.js';
import { monthlyOf } from './compute.js';
import { netWorthProjection, runwayLadder, drafttBands, taxLadder } from './chartdata.js';
import { AREAS } from './anchors.js';

const CAT_LABELS = { accommodation: 'Housing', utilities: 'Utilities and subscriptions', food: 'Food', transportation: 'Transportation', therapy: 'Health and therapy', wants: 'Wants', irregular: 'Irregular', mistakes: 'Mistakes', other: 'Other' };
const BUCKET_LABELS = { pretax: 'Pre-tax', roth: 'Roth', taxable: 'Taxable', hsa: 'HSA', cash: 'Cash', other: 'Other' };
const ok = m => m && m.status === 'ok';
const S_ = r => r.sun && r.sun.outputs;
const yearsToReach = (target, basis, contribAnnual, r) => {
  /* B(1+r)^n + C((1+r)^n - 1)/r = target */
  if (basis >= target) return 0;
  if (r < 1e-9) return contribAnnual > 0 ? (target - basis) / contribAnnual : null;
  const num = target + contribAnnual / r, den = basis + contribAnnual / r;
  if (den <= 0 || num <= den) return null;
  return Math.log(num / den) / Math.log(1 + r);
};

/* a. Savings rate against years to FI, with the household's own dot. */
export function savingsRateCurve(result) {
  const S = S_(result); const M = result.metrics;
  if (!S || !isQ(S.income.takeHomeMonthly) || !ok(M.savingsRateTakeHome)) return { needs: ['take-home pay', 'monthly spending'] };
  const take = S.income.takeHomeMonthly.cents * 12; const r = result.asm.returnLikely; const wr = result.asm.withdrawalRate;
  const basis = ok(M.pctToFi) && M.pctToFi.basis === 'netWorth' && ok(M.netWorth) ? M.netWorth.value.cents : (isQ(S.invest.investedAssets) ? S.invest.investedAssets.cents : 0);
  const points = [];
  for (let s = 0.05; s <= 0.901; s += 0.05) { const spend = take * (1 - s); const fi = spend / wr; const n = yearsToReach(fi, Math.max(0, basis), take * s, r); points.push({ rate: Math.round(s * 100) / 100, years: n === null ? null : Math.round(n * 10) / 10 }); }
  const sr = M.savingsRateTakeHome.value.value;
  const own = ok(M.fiDate) ? M.fiDate.yearsToFi : null;
  return { points, own: { rate: sr, years: own }, rough: M.savingsRateTakeHome.value.rough, maxYears: 60 };
}

/* b. FI ladder rungs as lines on the net worth path, with the crossing age for each. */
export function fiLadderLines(result) {
  const nw = netWorthProjection(result); if (nw.needs) return nw;
  const L = result.ladder; if (!L) return { needs: ['monthly spending'] };
  const rungs = L.rungs.filter(r => r.number !== null).map(r => ({ id: r.id, label: r.label, number: r.number, reachedAge: r.reachedAge, months: r.months }));
  if (L.coast && L.coast.number !== null) rungs.push({ id: 'coast', label: 'Coast FI', number: L.coast.number, reachedAge: L.coast.months !== null && result.age !== null ? Math.round((result.age + L.coast.months / 12) * 10) / 10 : null, months: L.coast.months, dashed: true });
  return { years: nw.years, rungs, fiAges: nw.fiAges, retirementAge: nw.retirementAge };
}

/* c. Net worth to 95 as a stacked area: cash and the invested buckets (today's bucket shares carried forward). */
export function netWorthStacked(result) {
  const pj = result.projection; const S = S_(result);
  if (!pj || !S || !S.invest.balancesByBucket) return { needs: ['income, spending, account balances and a birth date'] };
  const b = S.invest.balancesByBucket; const invested = Object.keys(b).filter(k => k !== 'cash').reduce((s, k) => s + b[k], 0);
  const keys = ['taxable', 'pretax', 'roth', 'hsa', 'other'].filter(k => b[k] > 0);
  const shares = {}; keys.forEach(k => { shares[k] = invested > 0 ? b[k] / invested : 0; });
  const years = pj.likely.path.map(p => { const row = { year: p.year, age: p.age, cash: Math.max(0, p.cash), debt: p.debt, netWorth: p.netWorth }; keys.forEach(k => { row[k] = Math.max(0, Math.round(p.invested * shares[k])); }); return row; });
  const series = [{ key: 'cash', label: 'Cash' }].concat(keys.map(k => ({ key: k, label: BUCKET_LABELS[k] })));
  return { years, series, fiAge: pj.likely.fiAge, note: 'Buckets grow in today\'s shares; a home is not modelled.' };
}

/* d. Milestone timeline: the dates that matter, on one line of ages. */
export function milestones(result) {
  const M = result.metrics; const age = result.age; if (age === null || age === undefined || !ok(M.fiDate)) return { needs: ['income, spending, account balances and a birth date'] };
  const today = result.today; const y0 = parseInt(today.slice(0, 4), 10) + (parseInt(today.slice(5, 7), 10) - 1) / 12;
  const ageOf = ym => { if (!ym) return null; const y = parseInt(ym.slice(0, 4), 10) + (parseInt(ym.slice(5, 7), 10) - 1) / 12; return Math.round((age + (y - y0)) * 10) / 10; };
  const items = [];
  if (ok(M.first100kDate)) items.push({ key: 'first100k', label: 'First $100,000', age: M.first100kDate.reached ? age : ageOf(M.first100kDate.value.value), reached: !!M.first100kDate.reached });
  if (ok(M.theFlip)) items.push({ key: 'flip', label: 'The flip', age: M.theFlip.already ? age : M.theFlip.age, reached: !!M.theFlip.already });
  if (ok(M.debtFree)) items.push({ key: 'debtFree', label: 'Debt-free', age: ageOf(M.debtFree.value.value), reached: false });
  if (result.ladder && result.ladder.coast && result.ladder.coast.months !== null) items.push({ key: 'coast', label: 'Coast FI', age: Math.round((age + result.ladder.coast.months / 12) * 10) / 10, reached: result.ladder.coast.months === 0 });
  items.push({ key: 'fi', label: 'FI', age: M.fiDate.ages.likely, reached: false, big: true });
  if (ok(M.crossoverDate)) items.push({ key: 'crossover', label: 'Crossover', age: Math.round((age + M.crossoverDate.months / 12) * 10) / 10, reached: M.crossoverDate.months === 0 });
  items.push({ key: 'medicare', label: 'Medicare at 65', age: 65, fixed: true });
  items.push({ key: 'ss', label: 'Social Security at ' + result.asm.socialSecurityAge, age: result.asm.socialSecurityAge, fixed: true });
  const withAge = items.filter(i => i.age !== null && i.age !== undefined);
  return { age, items: withAge.sort((a, b) => a.age - b.age), endAge: result.asm.projectionEndAge };
}

/* e. Tornado: months of FI date per standard shock, from the sensitivity run. */
export function tornado(result, extra) {
  const sens = extra && extra.sensitivity; const M = result.metrics;
  if (!ok(M.fiDate)) return { needs: ['a savings rate that reaches the FI number before 95'] };
  if (!sens || !sens.ranked) return { needs: ['the sensitivity run (a moment)'], waiting: true };
  const items = (sens.ranked.impact || []).filter(i => i.impact > 0 && !i.windfall).slice(0, 10).map(i => ({ id: i.id, label: i.label, months: i.impact, family: i.family, assumption: !!i.assumption, planet: i.planet }));
  if (!items.length) return { needs: ['a lever with a measurable effect'] };
  return { items, fiAge: M.fiDate.ages.likely };
}

/* f. Paycheck waterfall: gross to take-home, then to spending and savings. */
export function paycheckWaterfall(result) {
  const t = taxLadder(result); if (t.needs) return t;
  const S = S_(result); const M = result.metrics;
  const steps = [{ key: 'gross', label: 'Gross pay', cents: t.gross, kind: 'total' }];
  if (t.federal) steps.push({ key: 'federal', label: 'Federal tax', cents: -t.federal, kind: 'tax' });
  if (t.fica && t.fica.total) steps.push({ key: 'fica', label: 'Social Security and Medicare', cents: -t.fica.total, kind: 'tax' });
  if (t.selfEmployment) steps.push({ key: 'se', label: 'Self-employment tax', cents: -t.selfEmployment, kind: 'tax' });
  if (t.pretax) steps.push({ key: 'pretax', label: 'Pre-tax savings and benefits', cents: -t.pretax, kind: 'saving' });
  const take = isQ(S.income.takeHomeMonthly) ? S.income.takeHomeMonthly.cents * 12 : t.takeHome;
  steps.push({ key: 'take', label: 'Take-home', cents: take, kind: 'total' });
  if (ok(M.spending)) steps.push({ key: 'spend', label: 'Spending', cents: -M.spending.value.cents * 12, kind: 'spend' });
  if (ok(M.surplus)) steps.push({ key: 'left', label: M.surplus.value.cents >= 0 ? 'Left to save' : 'Short', cents: M.surplus.value.cents * 12, kind: 'total' });
  return { steps, rough: t.rough || (ok(M.spending) && M.spending.value.rough) };
}

/* g. Spending treemap: every area, split needs against wants from the lines. */
export function spendingTreemap(result) {
  const S = S_(result); if (!S || !S.spending.byCategory || !isQ(S.spending.baselineMonthly)) return { needs: ['monthly spending'] };
  const rows = result.record.planets.spending.rows.filter(r => r.type === 'line');
  const cells = [];
  Object.keys(S.spending.byCategory).forEach(cat => {
    const q = S.spending.byCategory[cat]; if (!isQ(q) || q.cents <= 0) return;
    let need = 0, want = 0;
    rows.forEach(r => { if (!r.f.category || r.f.category.v !== cat) return; const m = monthlyOf(r, 'amount'); if (m === null) return; if (r.f.needWant && r.f.needWant.v === 'want') want += m; else need += m; });
    const known = need + want; const scale = known > 0 ? q.cents / known : 0;
    if (known > 0) { if (need) cells.push({ cat, label: CAT_LABELS[cat] || cat, kind: 'need', cents: Math.round(need * scale) }); if (want) cells.push({ cat, label: CAT_LABELS[cat] || cat, kind: 'want', cents: Math.round(want * scale) }); }
    else cells.push({ cat, label: CAT_LABELS[cat] || cat, kind: 'need', cents: q.cents });
  });
  const total = cells.reduce((s, c) => s + c.cents, 0);
  const fat = isQ(S.spending.fatFloorMonthly) ? S.spending.fatFloorMonthly.cents : null;
  return { cells, total, needs_: cells.filter(c => c.kind === 'need').reduce((s, c) => s + c.cents, 0), wants: cells.filter(c => c.kind === 'want').reduce((s, c) => s + c.cents, 0), fatFloor: fat, rough: S.spending.baselineMonthly.rough };
}

/* h. DRAFTT bullets: each share as a bullet against its band. */
export function drafttBullets(result) { const d = drafttBands(result); if (d.needs) return d; const lines = d.lines.filter(l => typeof l.share === 'number' && Number.isFinite(l.share)).map(l => ({ key: l.key, label: l.label, share: l.share, low: l.band[0], high: l.band[1], max: Math.max(l.band[1] * 1.6, l.share * 1.15, 0.2) })); return lines.length ? { lines } : { needs: ['take-home pay and spending lines'] }; }

/* i. Debt payoff compared: avalanche, snowball and stress order, months and interest. */
export function debtCompared(result) {
  const S = S_(result); const po = S && S.debt.payoffOrders; const debts = result.debts || [];
  if (!po || !debts.length) return { needs: ['debt balances, rates and minimums'] };
  const months = ym => { if (!ym) return null; const [y, m] = ym.split('-').map(Number); const [y0, m0] = result.today.slice(0, 7).split('-').map(Number); return (y - y0) * 12 + (m - m0); };
  const orders = ['avalanche', 'snowball', 'stress'].map(k => ({ key: k, label: { avalanche: 'Highest rate first', snowball: 'Smallest balance first', stress: 'Most stressful first' }[k], months: months(po.debtFree[k]), debtFree: po.debtFree[k], interest: po.interest[k], stalled: po.stalled[k], order: (po.orders[k] || []).map(id => (debts.find(d => d.id === id) || { name: id }).name) }));
  const best = orders.filter(o => o.interest !== null).sort((a, b) => a.interest - b.interest)[0];
  return { orders, best: best ? best.key : null, totalDebt: debts.reduce((s, d) => s + (d.balance || 0), 0) };
}

/* j. Tax bucket mix today and over the projection (today's shares carried forward). */
export function taxBucketMix(result) {
  const S = S_(result); if (!S || !isQ(S.invest.totalAssets) || !S.invest.balancesByBucket) return { needs: ['account balances'] };
  const b = S.invest.balancesByBucket; const total = Object.values(b).reduce((s, v) => s + v, 0);
  const today = Object.keys(b).filter(k => b[k] > 0).map(k => ({ key: k, label: BUCKET_LABELS[k], cents: b[k], share: total ? b[k] / total : 0 }));
  const stacked = netWorthStacked(result);
  return { today, total, years: stacked.needs ? null : stacked.years, series: stacked.needs ? null : stacked.series };
}

/* k. Allocation donut: stocks, bonds, cash, other, with the US share. */
export function allocationDonut(result) {
  const S = S_(result); const a = S && S.invest.allocation; if (!a || !a.dollars) return { needs: ['account balances with stock, bond and cash shares'] };
  const slices = ['stocks', 'bonds', 'cash', 'other'].filter(k => a.dollars[k] > 0).map(k => ({ key: k, label: { stocks: 'Stocks', bonds: 'Bonds', cash: 'Cash', other: 'Other' }[k], cents: a.dollars[k], share: a[k] }));
  return { slices, usShare: a.usShare, total: slices.reduce((s, x) => s + x.cents, 0) };
}

/* l. Runway staircase: how many months at each spending level, against the Rule of 5 target. */
export function runwayStaircase(result) { const r = runwayLadder(result); if (r.needs) return r; return { cash: r.cash, steps: r.rungs.map(x => ({ key: x.key, label: x.label, monthly: x.monthly, months: x.months })), targetMonths: r.targetMonths }; }

/* m. Rule of 5 gauge: cash against the target, with the monthly amount that closes the gap. */
export function ruleOf5Gauge(result) {
  const S = S_(result); const M = result.metrics;
  if (!S || !isQ(S.safety.ruleOf5Target) || !isQ(S.invest.cashBalances)) return { needs: ['cash accounts and monthly spending', 'birth date'] };
  const target = S.safety.ruleOf5Target.cents; const cash = S.invest.cashBalances.cents;
  return { cash, target, pct: target ? cash / target : null, months: S.safety.ruleOf5Months, gap: isQ(S.safety.gap) ? S.safety.gap.cents : Math.max(0, target - cash), monthlyToClose: isQ(S.safety.monthlyToClose) ? S.safety.monthlyToClose.cents : null, roommateGap: isQ(S.safety.roommateGap) ? S.safety.roommateGap.cents : 0, rough: S.safety.ruleOf5Target.rough };
}

/* n. Contribution room: used against the limit for the 401k, the IRA and the HSA. */
export function contributionRoom(result) {
  const M = result.metrics; if (!ok(M.roomLeft)) return { needs: (M.roomLeft && M.roomLeft.needs) || ['a retirement or HSA account'] };
  const rows = M.roomLeft.value.value.map(r => ({ id: r.limitId, label: r.label.split(' (')[0].split(',')[0], limit: r.limit, used: r.used, left: Math.max(0, r.left), pct: r.limit ? r.used / r.limit : 0 }));
  return { rows };
}

/* o. Income by type: wages, 1099, side, other, benefits, partner. */
export function incomeByType(result) {
  const S = S_(result); const t = S && S.income.byType; if (!t || !isQ(S.income.grossMonthly)) return { needs: ['income'] };
  const parts = [['w2', 'Wages'], ['c1099', '1099 work'], ['side', 'Side income'], ['rental', 'Rental'], ['unemployment', 'Unemployment'], ['benefits', 'Benefits'], ['other', 'Other']].filter(([k]) => t[k] > 0).map(([k, label]) => ({ key: k, label, cents: t[k] }));
  if (isQ(S.income.partnerTakeHomeMonthly) && S.income.partnerTakeHomeMonthly.cents > 0) parts.push({ key: 'partner', label: 'Partner take-home', cents: S.income.partnerTakeHomeMonthly.cents });
  const total = parts.reduce((s, p) => s + p.cents, 0);
  return { parts: parts.map(p => Object.assign({}, p, { share: total ? p.cents / total : 0 })), total, rough: S.income.grossMonthly.rough };
}

/* p. Fee drag: the invested path with fees against the same path without them, to 95. */
export function feeDrag(result) {
  const M = result.metrics; const inp = result.projectionInputs;
  if (!inp || !ok(M.weightedEr)) return { needs: (M.weightedEr && M.weightedEr.needs) || ['holdings with expense ratios'] };
  const er = M.weightedEr.value.value; const r = result.asm.returnLikely;
  const same = Object.assign({}, inp, { keepWorking: true }); /* both paths work to the retirement age, so the gap is the fees alone */
  const withFees = project(same, r); const without = project(same, r + er);
  const years = withFees.path.map((p, i) => ({ year: p.year, age: p.age, withFees: p.invested, without: without.path[i].invested }));
  const last = years[years.length - 1];
  return { years, er, costAt95: last ? last.without - last.withFees : null, lifetime: ok(M.feeDragLifetime) ? M.feeDragLifetime.value.cents : null, fiAges: { withFees: project(inp, r).fiAge, without: project(inp, r + er).fiAge } };
}

/* q. Withdrawal guardrails: after FI, spending against the band the portfolio can carry. */
export function guardrails(result) {
  const pj = result.projection; const M = result.metrics; const asm = result.asm;
  if (!pj || !pj.likely || pj.likely.fiAge === null || !ok(M.spending)) return { needs: ['a savings rate that reaches the FI number before 95'] };
  const band = asm.guardrailsBand; const wr = asm.withdrawalRate; const inp = result.projectionInputs;
  const years = pj.likely.path.filter(p => p.age >= pj.likely.fiAge).map(p => { const mult = p.age < asm.slowgoAge ? inp.mult.gogo : p.age < asm.nogoAge ? inp.mult.slowgo : inp.mult.nogo; const carry = Math.max(0, p.netWorth) * wr; return { year: p.year, age: p.age, lower: Math.round(carry * (1 - band)), upper: Math.round(carry * (1 + band)), carry: Math.round(carry), spend: Math.round(inp.annualSpend * mult) - (p.ss || 0) }; });
  return { years, band, wr, fiAge: pj.likely.fiAge, rough: M.spending.value.rough };
}

/* r. Coast FI curve: the amount that coasts to the FI number from each age, against what is there today. */
export function coastCurve(result) {
  const M = result.metrics; const age = result.age; const L = result.ladder;
  if (!ok(M.fiNumber) || age === null || age === undefined || !L || !L.coast || L.coast.number === null) return { needs: ['monthly spending', 'birth date'] };
  const r = result.asm.returnLikely; const retAge = L.coast.retirementAge; const fi = M.fiNumber.value.cents;
  const points = []; for (let a = age; a <= retAge; a++) points.push({ age: a, needed: Math.round(fi / Math.pow(1 + r, retAge - a)) });
  const basis = L.basisCents;
  const basisAge = points.find(p => p.needed >= (basis || 0));
  return { points, basis, basisToday: L.coast.number, pct: L.coast.pct, retirementAge: retAge, fiNumber: fi, coastAge: basisAge ? basisAge.age : null, rough: !!L.coast.rough };
}

/* s. Health care bridge: premium years from the FI age to 65. */
export function healthcareBridge(result) {
  const M = result.metrics; if (!ok(M.healthcareBridge)) return { needs: (M.healthcareBridge && M.healthcareBridge.needs) || ['an FI date'] };
  const years = []; const monthly = result.asm.healthcarePremiumMonthlyCents; const fiAge = M.healthcareBridge.fiAge;
  for (let a = fiAge; a < 65; a++) years.push({ age: a, cents: monthly * 12 });
  return { years, total: M.healthcareBridge.value.cents, monthly, fiAge, count: M.healthcareBridge.years };
}

/* t. Real hourly wage: the top spending areas in hours of work a month. */
export function hoursOfWork(result) {
  const M = result.metrics; const S = S_(result);
  if (!ok(M.realHourlyWage) || !S || !S.spending.byCategory) return { needs: (M.realHourlyWage && M.realHourlyWage.needs) || ['paid hours a week', 'monthly spending'] };
  const hourly = M.realHourlyWage.value.cents; if (!hourly) return { needs: ['paid hours a week'] };
  const rows = Object.keys(S.spending.byCategory).filter(c => isQ(S.spending.byCategory[c]) && S.spending.byCategory[c].cents > 0).map(c => ({ cat: c, label: CAT_LABELS[c] || c, cents: S.spending.byCategory[c].cents, hours: Math.round(S.spending.byCategory[c].cents / hourly * 10) / 10 })).sort((a, b) => b.hours - a.hours).slice(0, 6);
  return { rows, hourly, stated: M.realHourlyWage.statedHourly || null, rough: M.realHourlyWage.value.rough };
}

/* u. Gut, dream and actual per area as a dumbbell; locked until an anchor exists. */
export function gutDreamActual(result) {
  const S = S_(result); const rec = result.record; const A = rec && rec.anchors;
  const anyAnchor = A && ((A.gut && Object.keys(A.gut).length) || (A.dream && Object.keys(A.dream).length));
  if (!anyAnchor) return { needs: ['gut spending on the Life plan'] };
  if (!S || !S.spending.byCategory) return { needs: ['monthly spending'] };
  const areas = {}; Object.keys(S.spending.byCategory).forEach(c => { areas[c] = isQ(S.spending.byCategory[c]) ? S.spending.byCategory[c].cents : null; });
  const v = variance(rec, { areas, total: isQ(S.spending.baselineMonthly) ? S.spending.baselineMonthly.cents : null, standIns: S.spending.standIns || {}, other: {} });
  const rows = v.rows.filter(r => r.key !== 'total' && (r.gut !== null || r.dream !== null || r.actual !== null)).map(r => ({ key: r.key, label: r.label, gut: r.gut, dream: r.dream, actual: r.actual }));
  if (!rows.length) return { needs: ['gut spending on the Life plan'] };
  return { rows, areas: AREAS.length };
}

/* v. Benchmarks: net worth against the two multiples (Coach only). */
export function benchmarks(result) {
  const M = result.metrics; if (!ok(M.netWorth) || (!ok(M.expectedNetWorth) && !ok(M.salaryMultiple))) return { needs: ['income, account balances and a birth date'] };
  const bars = [];
  if (ok(M.expectedNetWorth)) bars.push({ key: 'millionaire', label: 'Millionaire Next Door formula', have: M.netWorth.value.cents, expect: M.expectedNetWorth.expectedCents, ratio: M.expectedNetWorth.value.value });
  if (ok(M.salaryMultiple)) { const S = S_(result); const salary = isQ(S.income.grossMonthly) ? S.income.grossMonthly.cents * 12 : null; bars.push({ key: 'salary', label: 'Salary multiple (' + (M.salaryMultiple.source || 'benchmark') + ')', have: salary ? Math.round(M.salaryMultiple.value.value * salary) : M.netWorth.value.cents, expect: salary ? Math.round(M.salaryMultiple.benchmark * salary) : null, ratio: M.salaryMultiple.benchmark ? M.salaryMultiple.value.value / M.salaryMultiple.benchmark : null, verify: !!M.salaryMultiple.verify }); }
  return { bars, netWorth: M.netWorth.value.cents, rough: true };
}

/* The registry: id, coach and client names, the planet it belongs to, the stage, the metrics behind it, and the builder. */
export const MORE_CHARTS = [
  { id: 'savingsRateCurve', name: 'Savings rate and years to FI', client: 'How much saving changes when work becomes a choice', planet: 'income', stage: 5, metrics: ['savingsRateTakeHome', 'fiDate'], build: savingsRateCurve },
  { id: 'fiLadderLines', name: 'FI ladder on the net worth path', client: 'When each kind of enough arrives', planet: 'life', stage: 5, metrics: ['regularFi', 'fiDate'], build: fiLadderLines },
  { id: 'netWorthStacked', name: 'Net worth to 95 by bucket', client: 'What you could have, and where it sits', planet: 'invest', stage: 5, metrics: ['netWorth', 'fiDate'], build: netWorthStacked },
  { id: 'milestones', name: 'Milestone timeline', client: 'The dates that matter, in order', planet: 'life', stage: 5, metrics: ['fiDate', 'first100kDate', 'theFlip', 'debtFree', 'crossoverDate'], build: milestones },
  { id: 'tornado', name: 'What moves the FI date', client: 'The things that move your date most', planet: 'life', stage: 5, metrics: ['fiDate'], build: tornado, extra: 'sensitivity' },
  { id: 'paycheckWaterfall', name: 'Paycheck waterfall', client: 'Where each dollar of pay goes', planet: 'income', stage: 1, metrics: ['takeHome', 'spending', 'surplus'], build: paycheckWaterfall },
  { id: 'spendingTreemap', name: 'Spending treemap', client: 'What a month buys, needs and wants', planet: 'spending', stage: 1, metrics: ['spending', 'fatFloor'], build: spendingTreemap },
  { id: 'drafttBullets', name: 'DRAFTT bullets', client: 'Each share of pay against its healthy range', planet: 'spending', stage: 1, metrics: ['draftt'], build: drafttBullets },
  { id: 'debtCompared', name: 'Debt payoff compared', client: 'Three ways to pay the debts off', planet: 'debt', stage: 2, metrics: ['debtFree', 'annualInterest'], build: debtCompared },
  { id: 'taxBucketMix', name: 'Tax bucket mix', client: 'Which tax rules your money sits under', planet: 'invest', stage: 3, metrics: ['bucketMix', 'taxAdvantagedShare'], build: taxBucketMix },
  { id: 'allocationDonut', name: 'Allocation', client: 'Stocks, bonds and cash', planet: 'invest', stage: 3, metrics: ['allocation'], build: allocationDonut },
  { id: 'runwayStaircase', name: 'Runway staircase', client: 'How long the cash lasts at each level of spending', planet: 'safety', stage: 3, metrics: ['runway'], build: runwayStaircase },
  { id: 'ruleOf5Gauge', name: 'Rule of 5 gauge', client: 'Your cash target and the monthly amount that closes it', planet: 'safety', stage: 3, metrics: ['ruleOf5Target', 'emergencyGap'], build: ruleOf5Gauge },
  { id: 'contributionRoom', name: 'Contribution room', client: 'Room left in the 401(k), IRA and HSA this year', planet: 'invest', stage: 3, metrics: ['roomLeft'], build: contributionRoom },
  { id: 'incomeByType', name: 'Income by type', client: 'Where the income comes from', planet: 'income', stage: 1, metrics: ['gross'], build: incomeByType },
  { id: 'feeDrag', name: 'Fee drag to 95', client: 'What fund fees cost over a lifetime', planet: 'invest', stage: 3, metrics: ['weightedEr', 'feeDragLifetime'], build: feeDrag },
  { id: 'guardrails', name: 'Withdrawal guardrails', client: 'The band your spending can move in after work', planet: 'life', stage: 5, metrics: ['guardrailsBand', 'fiDate'], build: guardrails },
  { id: 'coastCurve', name: 'Coast FI curve', client: 'The amount that would coast to enough from each age', planet: 'life', stage: 5, metrics: ['coastFi'], build: coastCurve },
  { id: 'healthcareBridge', name: 'Health care bridge to 65', client: 'Health premiums between stopping work and 65', planet: 'safety', stage: 5, metrics: ['healthcareBridge'], build: healthcareBridge },
  { id: 'hoursOfWork', name: 'Spending in hours of work', client: 'What the biggest areas cost in hours worked', planet: 'spending', stage: 1, metrics: ['realHourlyWage', 'spending'], build: hoursOfWork },
  { id: 'gutDreamActual', name: 'Gut, dream and actual', client: 'What you said, what it is, what you would want', planet: 'spending', stage: 1, metrics: ['gutGap', 'dreamGap'], build: gutDreamActual },
  { id: 'benchmarks', name: 'Benchmarks (verify)', client: 'Net worth against two rules of thumb', planet: 'invest', stage: 3, metrics: ['expectedNetWorth', 'salaryMultiple'], build: benchmarks, coachOnly: true },
];
