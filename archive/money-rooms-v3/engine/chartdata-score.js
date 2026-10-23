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
import { WORTH_IT } from './scoremetrics.js';
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

/* f. How it has felt: satisfaction at every session close and money date, with the stress score at its four checkpoints on the same timeline. */
const askLabel = s => s === 'discovery' ? 'First call' : /^s?\d+$/.test(String(s)) ? 'Session ' + String(s).replace(/^s/, '') : /^md-/.test(String(s)) ? 'Money date ' + String(s).slice(3) : String(s);
export function satisfactionTrend(result) {
  const rec = result.record; const P = rec ? programOf(rec) : null;
  const sat = (P && P.satisfaction || []).filter(s => typeof s.score === 'number').slice().sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  const stress = (P && P.stress || []).filter(s => typeof s.score === 'number').slice().sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  if (!sat.length && !stress.length) return { needs: ['a satisfaction score from a session close or a money date'] };
  const keys = Array.from(new Set(sat.map(s => String(s.session)).concat(stress.map(s => String(s.session)))));
  const dateOf = k => ((sat.find(s => String(s.session) === k) || stress.find(s => String(s.session) === k) || {}).date) || '';
  keys.sort((a, b) => dateOf(a).localeCompare(dateOf(b)));
  const points = keys.map(k => ({ session: k, label: askLabel(k), date: dateOf(k), satisfaction: (sat.find(s => String(s.session) === k) || {}).score ?? null, stress: (stress.find(s => String(s.session) === k) || {}).score ?? null }));
  const satOnly = points.filter(p => p.satisfaction !== null); const stOnly = points.filter(p => p.stress !== null);
  return { points, satisfaction: { first: satOnly.length ? satOnly[0].satisfaction : null, last: satOnly.length ? satOnly[satOnly.length - 1].satisfaction : null, change: satOnly.length >= 2 ? satOnly[satOnly.length - 1].satisfaction - satOnly[0].satisfaction : null }, stress: { first: stOnly.length ? stOnly[0].stress : null, last: stOnly.length ? stOnly[stOnly.length - 1].stress : null, change: stOnly.length >= 2 ? stOnly[stOnly.length - 1].stress - stOnly[0].stress : null } };
}

/* f2. Worth it: dollars a month per area (x) against how much she valued it (y); the two corners that matter are named. */
export function worthIt(result) {
  const M = result.metrics; const m = M.valuePerDollar;
  if (!m || m.status !== 'ok') return { needs: (m && m.needs) || ['worth-it scores for the spending areas'] };
  const areas = m.value.value.areas.filter(a => a.cents !== null);
  if (!areas.length) return { needs: ['worth-it scores and monthly spending'] };
  const total = areas.reduce((s, a) => s + a.cents, 0);
  return { areas, easyCut: m.value.value.easyCut.map(a => a.area), room: m.value.value.room.map(a => a.area), total, bigShare: WORTH_IT.bigShare, lowScore: WORTH_IT.lowScore, highScore: WORTH_IT.highScore };
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
  { id: 'satisfactionTrend', name: 'Satisfaction and stress over time', client: 'How it has felt, session by session', planet: 'life', stage: 1, metrics: ['satisfaction', 'stressScore'], build: satisfactionTrend },
  { id: 'worthIt', name: 'Worth it: cost against value', client: 'What the money buys for you', planet: 'spending', stage: 1, metrics: ['areaWorthIt', 'valuePerDollar'], build: worthIt },
  { id: 'debtCurves', name: 'Debt curves: rate against relief', client: 'Two ways to pay the debts off', planet: 'debt', stage: 2, metrics: ['debtFree', 'annualInterest'], build: debtCurves },
];
