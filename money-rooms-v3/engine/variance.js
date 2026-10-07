/* How far off were we (Level 8, MR-049). For every spending area and the
   total, with whatever of gut, dream and actual exist: the awareness gap
   (actual minus gut), the dream gap (actual minus dream) and the wish gap
   (dream minus gut), each a month and a year, as a percent, with a
   direction. Guesses never count as gut or actual. Shared areas compare the
   client's share. Non-spending gut anchors get the awareness gap only, with
   a direction per kind. Pure, tested. */
import { AREAS, dreamTotal, gutTotal } from './anchors.js';
import { project } from './projection.js';

const AREA_LABELS = { accommodation: 'Home', utilities: 'Phone, internet and subscriptions', food: 'Food', transportation: 'Getting around', therapy: 'Health and therapy', wants: 'Fun and wants', irregular: 'Once-a-year things', total: 'Everything' };
const OTHER = { 'income:takeHome': { label: 'Take-home pay', higherIs: 'better' }, 'income:gross': { label: 'Pay before tax', higherIs: 'better' }, 'debt:total': { label: 'What you owe', higherIs: 'worse' }, 'debt:minimums': { label: 'Debt payments', higherIs: 'worse' }, 'safety:cash': { label: 'Cash', higherIs: 'better' }, 'invest:total': { label: 'Invested', higherIs: 'better' } };

const gap = (a, b) => (a === null || b === null) ? null : a - b;
const pctOf = (d, base) => (d === null || !base) ? null : Math.round(d / base * 1000) / 1000;

/* actuals: { areas: { cat: cents | null }, total, standIns: { cat: 'anchor' | 'guess' }, other: { 'income:takeHome': cents, ... } } */
export function variance(record, actuals, opts) {
  const o = opts || {};
  const A = record.anchors || { gut: {}, dream: {} }; const gut = A.gut || {}, dream = A.dream || {};
  const rows = [];
  const standIns = actuals.standIns || {};
  const areaRow = (key, label, gutC, dreamC, actualC) => {
    const aware = gap(actualC, gutC), dreamGap = gap(actualC, dreamC), wish = gap(dreamC, gutC);
    return { key, label, kind: 'spending', gut: gutC, dream: dreamC, actual: actualC,
      awareness: aware === null ? null : { monthly: aware, annual: aware * 12, pct: pctOf(aware, gutC), direction: aware > 0 ? 'more' : aware < 0 ? 'less' : 'same' },
      dreamGap: dreamGap === null ? null : { monthly: dreamGap, annual: dreamGap * 12, pct: pctOf(dreamGap, dreamC), direction: dreamGap > 0 ? 'above' : dreamGap < 0 ? 'below' : 'same' },
      wish: wish === null ? null : { monthly: wish, annual: wish * 12, pct: pctOf(wish, gutC), direction: wish > 0 ? 'more' : wish < 0 ? 'less' : 'same' } };
  };
  AREAS.forEach(cat => {
    const g = gut['spending:' + cat] ? gut['spending:' + cat].cents : null;
    const d = dream['spending:' + cat] ? dream['spending:' + cat].cents : null;
    /* an actual is real lines only: a stand-in (the anchor itself or a guess) is not "what it really is" */
    const actual = actuals.areas && actuals.areas[cat] !== undefined && actuals.areas[cat] !== null && !standIns[cat] ? actuals.areas[cat] : null;
    if (g === null && d === null && actual === null) return;
    rows.push(areaRow(cat, AREA_LABELS[cat], g, d, actual));
  });
  const gt = gutTotal(record), dt = dreamTotal(record);
  const anyStandIn = Object.keys(standIns).length > 0;
  const total = areaRow('total', AREA_LABELS.total, gt ? gt.cents : null, dt ? dt.cents : null, actuals.total !== undefined && actuals.total !== null && !anyStandIn ? actuals.total : null);
  total.gutFrom = gt ? gt.from : null; total.dreamFrom = dt ? dt.from : null;
  /* the other gut anchors */
  const others = [];
  Object.keys(OTHER).forEach(key => {
    const g = gut[key] ? gut[key].cents : null; const actual = actuals.other && actuals.other[key] !== undefined ? actuals.other[key] : null;
    if (g === null || actual === null) return;
    const d = actual - g; const better = OTHER[key].higherIs === 'better' ? d > 0 : d < 0;
    others.push({ key, label: OTHER[key].label, kind: key.split(':')[0], gut: g, actual, awareness: { monthly: d, annual: d * 12, pct: pctOf(d, g), direction: d === 0 ? 'same' : better ? 'better' : 'worse' } });
  });
  /* ranking and groups by absolute annual dollars */
  const ranked = rows.filter(r => r.awareness || r.dreamGap).slice().sort((a, b) => Math.abs((b.awareness || b.dreamGap).annual) - Math.abs((a.awareness || a.dreamGap).annual));
  const groups = {
    bigger: rows.filter(r => r.awareness && r.awareness.monthly > 0).sort((a, b) => b.awareness.annual - a.awareness.annual),
    smaller: rows.filter(r => r.awareness && r.awareness.monthly < 0).sort((a, b) => a.awareness.annual - b.awareness.annual),
    aboveDream: rows.filter(r => r.dreamGap && r.dreamGap.monthly > 0).sort((a, b) => b.dreamGap.annual - a.dreamGap.annual),
    roomToSpend: rows.filter(r => r.dreamGap && r.dreamGap.monthly < 0).sort((a, b) => a.dreamGap.annual - b.dreamGap.annual),
  };
  /* the headline: the top two areas explain X% of the awareness gap */
  const aware = rows.filter(r => r.awareness); const sumAbs = aware.reduce((s, r) => s + Math.abs(r.awareness.monthly), 0);
  const top2 = aware.slice().sort((a, b) => Math.abs(b.awareness.monthly) - Math.abs(a.awareness.monthly)).slice(0, 2);
  const headline = { discovery: o.discoveryTotal === undefined ? null : o.discoveryTotal, gut: total.gut, actual: total.actual, dream: total.dream, top2: top2.map(r => r.key), top2Share: sumAbs ? Math.round(top2.reduce((s, r) => s + Math.abs(r.awareness.monthly), 0) / sumAbs * 100) / 100 : null };
  return { rows, total, others, ranked, groups, headline };
}

/* Effect of a monthly spending change on the FI number and the FI date, one change at a time against the current baseline. */
export function fiEffect(result, deltaMonthly) {
  const inp = result.projectionInputs; const wr = result.asm.withdrawalRate;
  const fiNumberDelta = Math.round(deltaMonthly * 12 / wr);
  if (!inp || deltaMonthly === 0) return { fiNumberDelta, fiAgeDelta: inp ? 0 : null, months: inp ? 0 : null };
  const base = project(inp, result.asm.returnLikely);
  const alt = project(Object.assign({}, inp, { annualSpend: inp.annualSpend + deltaMonthly * 12, leakAnnual: inp.leakAnnual - deltaMonthly * 12 }), result.asm.returnLikely);
  const months = alt.fiAge === null || base.fiAge === null ? null : (alt.fiAge - base.fiAge) * 12;
  return { fiNumberDelta, fiAgeDelta: alt.fiAge === null || base.fiAge === null ? null : alt.fiAge - base.fiAge, months, never: alt.fiAge === null && base.fiAge !== null };
}

/* The tier comparison for the coach: actual against the area average for the tier and household. */
export function tierComparison(actualCents, averageCents) {
  if (actualCents === null || !averageCents) return null;
  const r = actualCents / averageCents;
  return { ratio: Math.round(r * 100) / 100, word: r > 1.2 ? 'well above most people' : r > 1.05 ? 'a little above most people' : r < 0.8 ? 'well below most people' : r < 0.95 ? 'a little below most people' : 'about the same as most people' };
}
export { AREA_LABELS };
