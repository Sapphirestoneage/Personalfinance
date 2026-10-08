/* What a decision does to the FI date (Level 13, MR-067). One function the
   home, house and car calculators share: a one-off cost and a monthly change
   for some years, folded into the projection the same way a scenario block
   is (engine/scenarios.js projectWith), read to the month. Pure. */
import { projectWith } from './scenarios.js';

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
