/* What a decision does to the FI date (Level 13, MR-067). One function the
   home, house and car calculators share: a one-off cost and a monthly change
   for some years, folded into the projection the same way a scenario block
   is (engine/scenarios.js projectWith), read to the month. Pure. */
import { projectWith } from './scenarios.js';
import { project } from './projection.js';

function monthsOnPath(inp, path, target) {
  const debt0 = (inp.debts || []).reduce((s, d) => s + (d.balance || 0), 0);
  let prev = inp.invested + inp.cash - debt0;
  if (prev >= target) return 0;
  for (let i = 0; i < path.length; i++) { const nw = path[i].netWorth; if (nw >= target) { const frac = nw === prev ? 1 : Math.min(1, Math.max(0, (target - prev) / (nw - prev))); return Math.round((i + frac) * 12 * 10) / 10; } prev = nw; }
  return null;
}
/* q: { oneOff (cents, now), monthly (cents a month; positive costs more), years, startYear } */
export function fiEffect(result, q) {
  const inp = result && result.projectionInputs; if (!inp) return { needs: ['income, spending, account balances and a birth date'], deltaMonths: null, baseMonths: null, newMonths: null };
  const rate = inp.asm.returnLikely; const wr = inp.asm.withdrawalRate;
  const base = projectWith(inp, rate, {});
  const y0 = q.startYear || inp.year + 1; const adj = {}; const at = y => (adj[y] = adj[y] || { oneOff: 0, monthly: 0, pay: 0 });
  at(y0).oneOff += Math.round(q.oneOff || 0);
  const yrs = Math.max(0, Math.round(q.years || 0)); for (let y = y0; y < y0 + yrs; y++) at(y).monthly += Math.round(q.monthly || 0);
  const alt = projectWith(inp, rate, adj);
  const target = inp.annualSpend / wr; const altTarget = (inp.annualSpend + ((q.monthly || 0) > 0 && yrs >= (inp.asm.projectionEndAge - inp.age) ? (q.monthly || 0) * 12 : 0)) / wr;
  const baseMonths = monthsOnPath(inp, base.path, target); const newMonths = monthsOnPath(inp, alt.path, altTarget);
  return { baseMonths, newMonths, deltaMonths: baseMonths === null || newMonths === null ? null : Math.round((newMonths - baseMonths) * 10) / 10, baseFiAge: base.fiAge, newFiAge: alt.fiAge, netWorthAt95: { base: base.path[base.path.length - 1].netWorth, alt: alt.path[alt.path.length - 1].netWorth }, path: alt.path, basePath: base.path };
}

/* What the goals do to the FI date (MR-070): the headline path already carries the draws, so "without" is the
   path with none, "with" is the path with all of them, and each goal's months are what it adds on top of the
   others. draws comes from engine/goals.js (planGoals().draws or quickDraws()). Pure. */
export function goalFi(result, draws) {
  const inp = result && result.projectionInputs; if (!inp) return { needs: ['income, spending, account balances and a birth date'], deltaMonths: null, baseMonths: null, withMonths: null, byGoal: {}, left: [] };
  const rate = inp.asm.returnLikely; const target = inp.annualSpend / inp.asm.withdrawalRate;
  const d = draws || { byYear: {}, byGoal: {}, left: [] };
  const run = byYear => project(Object.assign({}, inp, { oneOffs: byYear }), rate);
  const without = run(null); const withAll = run(d.byYear);
  const baseMonths = monthsOnPath(inp, without.path, target); const withMonths = monthsOnPath(inp, withAll.path, target);
  const delta = (a, b) => a === null || b === null ? null : Math.round((a - b) * 10) / 10;
  const byGoal = {};
  Object.keys(d.byGoal).forEach(id => {
    const g = d.byGoal[id]; const rest = Object.assign({}, d.byYear); rest[g.year] -= g.cents; if (rest[g.year] <= 0) delete rest[g.year];
    byGoal[id] = delta(withMonths, monthsOnPath(inp, run(rest).path, target));
  });
  return { baseMonths, withMonths, deltaMonths: delta(withMonths, baseMonths), fiYearBase: without.fiYear, fiYearWith: withAll.fiYear, fiAgeBase: without.fiAge, fiAgeWith: withAll.fiAge, byGoal, left: d.left || [], total: d.total || 0 };
}

/* The FI month the way the fiDate metric reads it: the projection year plus the birth month. */
export function fiMonthOf(result, fiYear) {
  if (fiYear === null || fiYear === undefined) return null;
  const f = result && result.record && result.record.sun && result.record.sun.f && result.record.sun.f.birthDate;
  const bm = f && typeof f.v === 'string' && f.v.length >= 7 ? f.v.slice(5, 7) : '01';
  return String(fiYear) + '-' + bm;
}
