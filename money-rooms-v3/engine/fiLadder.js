/* The FI ladder (Level 9, MR-040): every kind of financial independence as a
   rung with its number, how far along the household is, when the projection
   reaches it and the monthly investing that reaches it by the dream FI age.
   Pure: takes Quantities and the projection path, returns plain numbers.
   One formula each; the views only draw. */
import { isQ } from './units.js';

export const RUNGS = Object.freeze(['leanFi', 'baristaLeanFi', 'baristaRegularFi', 'regularFi', 'fatFi']);
export const RUNG_LABELS = Object.freeze({ leanFi: 'Lean FI', baristaLeanFi: 'Barista Lean FI', baristaRegularFi: 'Barista FI', regularFi: 'FI', fatFi: 'Fat FI', coastFi: 'Coast FI' });
export const RUNG_CLIENT = Object.freeze({ leanFi: 'The floor', baristaLeanFi: 'The floor, with part-time work', baristaRegularFi: 'Enough, with part-time work', regularFi: 'Enough', fatFi: 'The dream', coastFi: 'Coast' });

const Q = v => (isQ(v) ? v : null);

/* $X a month of part-time income lowers every target by X x 12 / withdrawal rate. */
export function baristaRule(wr, monthlyCents) { return Math.round((monthlyCents === undefined ? 10000 : monthlyCents) * 12 / wr); }

/* Monthly investing that takes `basis` to `target` in `years` at real return r (end-of-year contributions). */
export function requiredMonthly(target, basis, years, r) {
  const gap = target - basis;
  if (gap <= 0) return 0;
  if (years <= 0) return gap;
  if (Math.abs(r) < 1e-9) return Math.round(gap / (12 * years));
  const g = Math.pow(1 + r, years);
  return Math.max(0, Math.round((target - basis * g) * r / (12 * (g - 1))));
}

/* Months from today until `series` first reaches `target`, interpolated inside the year it crosses.
   series: [{ year, age, value }] at year ends; `now` is today's value. null when it never does. */
export function monthsToReach(target, now, series) {
  if (now >= target) return 0;
  let prev = now;
  for (let i = 0; i < series.length; i++) {
    const v = series[i].value;
    if (v >= target) {
      const frac = v === prev ? 1 : Math.min(1, Math.max(0, (target - prev) / (v - prev)));
      return Math.round((i + frac) * 12 * 10) / 10;
    }
    prev = v;
  }
  return null;
}

/* inp: { spending, fatFloor, byCategory, gut, dream, barista, invested, netWorth, asm, age, retirementAge, dreamFiAge, path, today } */
export function fiLadder(inp) {
  const asm = inp.asm; const wr = asm.withdrawalRate; const r = asm.returnLikely;
  const basisKey = asm.fiProgressBasis === 'netWorth' ? 'netWorth' : 'invested';
  const basisQ = basisKey === 'netWorth' ? Q(inp.netWorth) : Q(inp.invested);
  const needs = [];
  const actual = Q(inp.spending);
  if (!actual) needs.push('monthly spending');
  /* the Level 8 spending basis switch: actual lines, the gut guess, or the dream; falls back to actual and says so */
  let base = actual ? { cents: actual.cents, rough: actual.rough, source: 'actual', confidence: actual.confidence } : null;
  if (asm.fiSpendingBasis === 'gut' && Q(inp.gut)) base = { cents: inp.gut.cents, rough: true, source: 'gut', confidence: inp.gut.confidence };
  if (asm.fiSpendingBasis === 'dream' && Q(inp.dream)) base = { cents: inp.dream.cents, rough: true, source: 'dream', confidence: inp.dream.confidence };
  /* lean: the FAT floor, or food + accommodation + transportation as a stand-in */
  let lean = null, leanRough = false, leanSource = 'fatFloor';
  const fat = Q(inp.fatFloor);
  if (fat && fat.cents > 0) { lean = fat.cents; leanRough = fat.rough; }
  else if (inp.byCategory) { const c = inp.byCategory; const sum = ['food', 'accommodation', 'transportation'].reduce((s, k) => s + (Q(c[k]) ? c[k].cents : 0), 0); if (sum > 0) { lean = sum; leanRough = true; leanSource = 'categories'; } }
  /* fat: the dream, or spending x the fat multiplier */
  const dream = Q(inp.dream);
  const fatCents = dream ? dream.cents : (base ? base.cents * asm.fatFiMultiplier : null);
  const fatNumber = dream ? undefined : (base ? Math.round(base.cents * 12 * asm.fatFiMultiplier / wr) : undefined);
  const fatRough = !dream;
  /* barista: the typed part-time income, or the assumption, marked rough */
  const barista = Q(inp.barista);
  const baristaMonthly = barista ? barista.cents : Math.round(asm.baristaIncomeAnnualCents / 12);
  const baristaRough = !barista;
  const basisCents = basisQ ? basisQ.cents : null;
  /* dates follow the projection's net worth, the same line the FI date is read from, whatever counts as progress today (MR-040) */
  const nwQ = Q(inp.netWorth); const nwToday = nwQ ? nwQ.cents : basisCents;
  const series = inp.path ? inp.path.map(p => ({ year: p.year, age: p.age, value: p.netWorth })) : null;
  const todayYear = inp.today ? parseInt(inp.today.slice(0, 4), 10) : null;
  const targetAge = inp.dreamFiAge || inp.retirementAge || null;
  const years = targetAge !== null && inp.age !== null && inp.age !== undefined ? targetAge - inp.age : null;
  const rung = (id, monthly, rough, extra) => {
    if (monthly === null || monthly === undefined) return { id, label: RUNG_LABELS[id], number: null, pct: null, months: null, reachedYear: null, reachedAge: null, requiredMonthly: null, rough: true, needs: extra && extra.needs ? extra.needs : ['monthly spending'] };
    const number = extra && extra.number !== undefined ? extra.number : Math.round(Math.max(0, monthly) * 12 / wr);
    const pct = basisCents !== null && number > 0 ? basisCents / number : (number === 0 ? 1 : null);
    const months = series && nwToday !== null ? monthsToReach(number, nwToday, series) : null;
    const reachedYear = months === null ? null : (todayYear !== null ? Math.round((todayYear * 12 + months) / 12 * 100) / 100 : null);
    const reachedAge = months === null || inp.age === null || inp.age === undefined ? null : Math.round((inp.age + months / 12) * 10) / 10;
    const req = basisCents !== null && years !== null ? requiredMonthly(number, basisCents, years, r) : null;
    const clean = Object.assign({}, extra || {}); delete clean.number; delete clean.needs;
    return Object.assign({ id, label: RUNG_LABELS[id], number, monthlySpend: Math.max(0, monthly), pct, months, reachedYear, reachedAge, requiredMonthly: req, rough: !!rough }, clean);
  };
  const rungs = [
    rung('leanFi', lean, leanRough, { source: leanSource, needs: ['spending lines flagged in the FAT floor'] }),
    rung('baristaLeanFi', lean === null ? null : lean - baristaMonthly, leanRough || baristaRough, { source: leanSource, needs: ['spending lines flagged in the FAT floor'] }),
    rung('baristaRegularFi', base ? base.cents - baristaMonthly : null, (base && base.rough) || baristaRough),
    rung('regularFi', base ? base.cents : null, base && base.rough),
    rung('fatFi', fatCents === null ? null : Math.round(fatCents), (base && base.rough) || fatRough, { source: dream ? 'dream' : 'multiplier', number: fatNumber }),
  ];
  /* coast: the regular number discounted to today over the years to retirement age */
  let coast = { number: null, pct: null, months: null, years: null, rough: true, needs: [] };
  const retAge = inp.retirementAge;
  if (base && inp.age !== null && inp.age !== undefined && retAge) {
    const n = retAge - inp.age; const g = Math.pow(1 + r, n);
    const number = Math.round(rungs[3].number / g);
    coast = { number, pct: basisCents !== null && number > 0 ? basisCents / number : null, months: series && nwToday !== null ? monthsToReach(number, nwToday, series) : null, years: n, growth: g, rough: !!base.rough, retirementAge: retAge, needs: [] };
  } else coast.needs = [!base ? 'monthly spending' : null, inp.age === null || inp.age === undefined ? 'birth date' : null].filter(Boolean);
  /* reverse barista: part-time income that would make the household Barista FI today */
  const needed = base && basisCents !== null ? { regular: Math.max(0, base.cents - Math.round(basisCents * wr / 12)), lean: lean === null ? null : Math.max(0, lean - Math.round(basisCents * wr / 12)) } : { regular: null, lean: null };
  return {
    basis: basisKey, basisCents, baseSpending: base, lean: lean === null ? null : { monthly: lean, rough: leanRough, source: leanSource },
    barista: { monthly: baristaMonthly, rough: baristaRough, typed: !!barista }, wr, realReturn: r, targetAge, years,
    rungs, coast, baristaRule: baristaRule(wr), baristaIncomeNeeded: needed, needs,
  };
}
