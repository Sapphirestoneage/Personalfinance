/* The seven charts of the Scoreboard (Level 12, MR-063). Same contract as
   engine/chartdata-more.js: a builder reads the computed result (and the
   record behind it) and returns plain numbers for ui/charts-score.js to
   draw, or { needs } when its inputs are missing. The waterfall runs the
   engine again through engine/momentum.js so the split is the engine's own
   answer; the result is memoised per record version. */
import { isQ } from './units.js';
import { simulate, addMonths } from './debtsim.js';
import { programOf } from './program.js';
import { whyMoved, snapshotsOf, numOf } from './momentum.js';
import { compute } from './compute.js';

const ok = m => m && m.status === 'ok';
const S_ = r => r.sun && r.sun.outputs;
const ORDER_LABELS = { avalanche: 'Highest rate first', stress: 'Most stressful first' };

/* a. Crossover: the year the money earns more than the household spends. */
export function crossover(result) {
  const S = S_(result); const pj = result.projection;
  if (!pj || !S || !isQ(S.spending.baselineMonthly)) return { needs: ['income, spending, account balances and a birth date'] };
  const rate = result.asm.returnLikely; const spendNow = S.spending.baselineMonthly.cents * 12;
  const withPrem = S.safety && isQ(S.safety.spendingWithPremiums) ? S.safety.spendingWithPremiums.cents * 12 : spendNow;
  const years = pj.likely.path.map(p => ({ year: p.year, age: p.age, assetIncome: Math.round(Math.max(0, p.invested) * rate), spending: p.working ? spendNow : withPrem, working: p.working }));
  const cross = years.find(y => y.assetIncome >= y.spending) || null;
  return { years, crossYear: cross ? cross.year : null, crossAge: cross ? cross.age : null, rate, spendNow, fiAge: pj.likely.fiAge, rough: S.spending.baselineMonthly.rough };
}

/* b. What moved the FI date since the last snapshot, as a waterfall: learned, did, market, time, the rest. */
const wfCache = { key: null, value: null };
export function fiDateWaterfall(result) {
  const rec = result.record; if (!rec) return { needs: ['a saved client'] };
  if (!snapshotsOf(rec).length) return { needs: ['a closed session or a money date'] };
  if (!ok(result.metrics.fiDate)) return { needs: ['income, spending, account balances and a birth date'] };
  const key = rec.id + ':' + rec.journal.length + ':' + result.today + ':' + (rec.journal.length ? rec.journal[rec.journal.length - 1].ts : '');
  if (wfCache.key === key) return wfCache.value;
  const w = whyMoved(rec, result, null, 'fiDate', { compute: (r, today) => compute(r, result.data || null, { today, light: true }) });
  const value = !w || w.total === null ? { needs: ['a second look after the first snapshot'] } : { since: w.since, sinceKind: w.sinceKind, total: w.total, totalText: w.totalText, verdict: w.verdict, steps: ['learned', 'did', 'market', 'time', 'other'].map(k => ({ key: k, label: { learned: 'What you learned', did: 'What you did', market: 'The market', time: 'Time passing', other: 'Everything else' }[k], months: w.parts[k] })).filter(s => Math.abs(s.months) >= 0.05), sentences: w.sentences, marketNote: w.marketNote };
  wfCache.key = key; wfCache.value = value;
  return value;
}

/* c. The month as a calendar: paydays and bills by day, with the running balance from the first. */
export function cashflowCalendar(result) {
  const rec = result.record; const P = rec ? programOf(rec) : null; const T = P && P.transactions; const cal = T && T.calendar;
  if (!cal || (!cal.bills.length && !cal.paydays.length)) return { needs: ['transactions imported'] };
  const days = Array.from({ length: 31 }, (_, i) => ({ day: i + 1, inCents: 0, outCents: 0, items: [] }));
  cal.paydays.forEach(p => p.days.forEach(d => { const slot = days[Math.min(31, Math.max(1, d)) - 1]; const each = Math.round(p.cents / Math.max(1, p.days.length)); slot.inCents += each; slot.items.push({ kind: 'pay', label: p.label, cents: each }); }));
  cal.bills.forEach(b => { const slot = days[Math.min(31, Math.max(1, b.day)) - 1]; slot.outCents += b.cents; slot.items.push({ kind: 'bill', label: b.label, cents: b.cents, category: b.category }); });
  let run = 0; let low = { day: 1, cents: 0 };
  days.forEach(d => { run += d.inCents - d.outCents; d.running = run; if (run < low.cents) low = { day: d.day, cents: run }; });
  const tight = days.filter(d => d.running < 0).map(d => d.day);
  return { days, low, tight, totalIn: days.reduce((s, d) => s + d.inCents, 0), totalOut: days.reduce((s, d) => s + d.outCents, 0), spanDays: cal.spanDays };
}

/* d. Picture against progress: how much of the picture is in (x) against how far along (y), one dot per snapshot and today. */
export function pictureVsProgress(result) {
  const rec = result.record; const snaps = rec ? snapshotsOf(rec) : [];
  if (!snaps.length) return { needs: ['a closed session or a money date'] };
  const M = result.metrics; const useFi = ok(M.pctToFi) || snaps.some(s => typeof s.values.pctToFi === 'number');
  const yId = useFi ? 'pctToFi' : 'savingsRateTakeHome';
  const points = snaps.map(s => ({ ts: s.ts, kind: s.kind, label: s.kind === 'session' && s.session ? 'Session ' + String(s.session).replace(/^s/, '') : s.kind === 'money-date' ? 'Money date' : s.kind === 'discovery' ? 'First call' : s.kind === 'import' ? 'Transactions' : 'Snapshot', x: typeof s.values.completeness === 'number' ? s.values.completeness : null, y: typeof s.values[yId] === 'number' ? s.values[yId] : null }));
  points.push({ ts: result.today, kind: 'now', label: 'Today', x: ok(M.completeness) ? M.completeness.value.value : null, y: numOf(M[yId]) });
  const usable = points.filter(p => p.x !== null && p.y !== null);
  if (usable.length < 2) return { needs: ['income, spending and account balances at two points in time'] };
  return { points: usable, yId, yLabel: useFi ? 'Progress to FI' : 'Share of take-home saved' };
}

/* e. Effort against the market: what the contributions add each year against what growth adds, along the likely path. */
export function effortVsMarket(result) {
  const pj = result.projection; const inp = result.projectionInputs;
  if (!pj || !inp) return { needs: ['income, spending, account balances and a birth date'] };
  const rate = pj.likely.rate; let prev = inp.invested; let cumC = 0, cumG = 0;
  const years = pj.likely.path.filter(p => p.working).map(p => { const growth = Math.round(Math.max(0, prev) * rate); const contrib = Math.max(0, p.invested - prev - growth); prev = p.invested; cumC += contrib; cumG += growth; return { year: p.year, age: p.age, contrib, growth, cumContrib: cumC, cumGrowth: cumG }; });
  if (!years.length) return { needs: ['a working year ahead of the retirement age'] };
  const flip = years.find(y => y.growth > y.contrib && y.contrib > 0) || null;
  return { years, flipYear: flip ? flip.year : null, flipAge: flip ? flip.age : null, rate, contribAnnual: inp.employeeAnnual + inp.employerAnnual };
}

/* f. How money has felt: the stress score at each ask. */
export function stressTrend(result) {
  const rec = result.record; const P = rec ? programOf(rec) : null; const scores = (P && P.stress || []).filter(s => typeof s.score === 'number').slice().sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || 0);
  if (!scores.length) return { needs: ['a stress score from the discovery form or a session'] };
  const points = scores.map(s => ({ session: s.session, label: s.session === 'discovery' ? 'First call' : /^s?\d+$/.test(String(s.session)) ? 'Session ' + String(s.session).replace(/^s/, '') : /^md-/.test(String(s.session)) ? 'Money date' : String(s.session), score: s.score, date: s.date || s.at || null }));
  return { points, first: points[0].score, last: points[points.length - 1].score, change: points[points.length - 1].score - points[0].score };
}

/* g. Two ways to pay the debts off: highest rate first against most stressful first, total balance month by month. */
export function debtCurves(result) {
  const S = S_(result); const po = S && S.debt.payoffOrders; const debts = (result.debts || []).filter(d => d.balance > 0);
  if (!po || !po.orders || !debts.length) return { needs: ['debt balances, rates and minimums'] };
  if (!debts.some(d => typeof d.stress === 'number')) return { needs: ['a stress rating on at least one debt'] };
  const from = result.today.slice(0, 7);
  const curves = ['avalanche', 'stress'].map(k => { const order = (po.orders[k] || po.orders.avalanche).filter(id => debts.some(d => d.id === id)); const sim = simulate(debts, order, from, 360, true); const series = sim.series.map(s => ({ month: s.month, total: Object.values(s.balances).reduce((a, b) => a + b, 0) })); const first = sim.milestones[0] || null; const stressful = debts.slice().sort((a, b) => (b.stress || 0) - (a.stress || 0))[0]; const relief = sim.paid[stressful.id] || null; return { key: k, label: ORDER_LABELS[k], series, debtFree: sim.debtFree, months: sim.months, interest: sim.interest, stalled: sim.stalled, firstPayoff: first ? first.month : null, reliefMonth: relief, stressfulName: stressful.name }; });
  const [av, st] = curves;
  const monthsBetween = (a, b) => { if (!a || !b) return null; const [y1, m1] = a.split('-').map(Number), [y2, m2] = b.split('-').map(Number); return (y2 - y1) * 12 + (m2 - m1); };
  return { curves, from, reliefCostCents: st.interest - av.interest, reliefMonthsSooner: monthsBetween(st.reliefMonth, av.reliefMonth), totalDebt: debts.reduce((s, d) => s + d.balance, 0), next: addMonths(from, 1) };
}

export const SCORE_CHARTS = [
  { id: 'crossover', name: 'Crossover point', client: 'When the money starts paying for life', planet: 'life', stage: 5, metrics: ['crossoverDate', 'fiDate'], build: crossover },
  { id: 'fiDateWaterfall', name: 'What moved the FI date', client: 'What moved your date since last time', planet: 'life', stage: 5, metrics: ['fiDate'], build: fiDateWaterfall },
  { id: 'cashflowCalendar', name: 'Cash flow calendar', client: 'Paydays and bills across the month', planet: 'spending', stage: 1, metrics: ['spending', 'takeHome'], build: cashflowCalendar },
  { id: 'pictureVsProgress', name: 'Picture against progress', client: 'How much is in, and how far along', planet: 'life', stage: 1, metrics: ['completeness', 'pctToFi'], build: pictureVsProgress },
  { id: 'effortVsMarket', name: 'Effort against the market', client: 'What you added and what the market added', planet: 'invest', stage: 3, metrics: ['netWorth', 'theFlip'], build: effortVsMarket },
  { id: 'stressTrend', name: 'Stress trend', client: 'How money has felt, session by session', planet: 'life', stage: 1, metrics: ['stressScore'], build: stressTrend },
  { id: 'debtCurves', name: 'Debt curves: rate against relief', client: 'Two ways to pay the debts off', planet: 'debt', stage: 2, metrics: ['debtFree', 'annualInterest'], build: debtCurves },
];
