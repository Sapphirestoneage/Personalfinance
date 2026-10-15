// Chart-ready data, built from the summary. Charts draw these numbers and
// never compute their own. Categories beyond the 7 biggest fold into "Other"
// (the palette has 8 validated colors and a 9th hue is never generated).

import { ratio, sumKnown, minus } from './money.js';

const MAX_SLICES = 8;

// Biggest first; the tail folds into one "Other" slice.
export function foldSlices(items, max = MAX_SLICES) {
  const sorted = items.filter((x) => x.amount > 0).sort((a, b) => b.amount - a.amount);
  if (sorted.length <= max) return sorted;
  const keep = sorted.slice(0, max - 1);
  const rest = sorted.slice(max - 1);
  keep.push({ id: 'other', name: 'Other (' + rest.length + ')', amount: rest.reduce((a, x) => a + x.amount, 0), other: true, members: rest.map((x) => x.name) });
  return keep;
}

// Stable color slot per category (follows the entity, never its rank).
export function colorSlots(summary) {
  const slots = {};
  summary.rows.forEach((r, i) => { slots[r.id] = (i % 8) + 1; });
  return slots;
}

export function spendingDonut(summary) {
  const spend = summary.totals.spending;
  const slices = foldSlices(summary.rows.filter((r) => !r.savings && r.basis !== null).map((r) => ({ id: r.id, name: r.name, amount: r.basis })));
  return { total: spend, slices: slices.map((s) => ({ ...s, share: ratio(s.amount, spend) })) };
}

// Take-home on the left; categories, savings, and surplus on the right.
// A shortfall shows up as a second source on the left.
export function sankeyData(summary) {
  const t = summary.totals;
  if (t.takeHome === null || t.outflow === null) return null;
  const right = foldSlices(summary.rows.filter((r) => !r.savings && r.basis !== null).map((r) => ({ id: r.id, name: r.name, amount: r.basis })), 7);
  if (t.savings) right.push({ id: 'savings', name: 'Savings', amount: t.savings, savings: true });
  if (t.surplus > 0) right.push({ id: 'surplus', name: 'Surplus', amount: t.surplus, surplus: true });
  const left = [{ id: 'take-home', name: 'Take-home', amount: t.takeHome }];
  if (t.surplus < 0) left.push({ id: 'shortfall', name: 'Shortfall', amount: -t.surplus, shortfall: true });
  const total = sumKnown(left.map((x) => x.amount)).total;
  return { left, right: right.map((x) => ({ ...x, share: ratio(x.amount, t.takeHome) })), total };
}

export function needsWantsSavings(summary) {
  const l = summary.lenses.fiftyThirtyTwenty;
  const parts = l.rows.map((r) => ({ id: r.key, name: r.key[0].toUpperCase() + r.key.slice(1), amount: r.amount, share: r.share, target: r.target }));
  if (l.unassigned > 0) parts.push({ id: 'unassigned', name: 'Not assigned', amount: l.unassigned, share: l.unassignedShare, target: null });
  return { takeHome: l.takeHome, parts };
}

export function fixedVariable(summary) {
  const t = summary.totals;
  return [
    { id: 'fixed', name: 'Fixed', amount: t.fixed, share: t.fixedPct },
    { id: 'variable', name: 'Variable', amount: t.variable, share: t.variablePct }
  ];
}

const hasAny = (r) => r.estimate !== null || r.dream !== null || r.actual !== null;

// Estimate, dream, actual per category (also used for the overlap chart).
export function threeColumns(summary) {
  const th = summary.totals.takeHome;
  return summary.rows.filter((r) => !r.notForMe && hasAny(r) && !(r.estimate === 0 && r.actual === 0 && !r.dream)).map((r) => ({
    id: r.id, name: r.name, savings: r.savings,
    estimate: r.estimate, dream: r.dream, actual: r.actual,
    estimateShare: ratio(r.estimate, th), dreamShare: ratio(r.dream, th), actualShare: ratio(r.actual, th)
  }));
}

// Actual minus estimate per category, biggest overage first.
export function variance(summary) {
  return summary.rows
    .filter((r) => r.gaps.actualMinusEstimate !== null && !r.isDebt && !r.notForMe)
    .map((r) => ({ id: r.id, name: r.name, amount: r.gaps.actualMinusEstimate, share: r.gaps.actualMinusEstimatePct, savings: r.savings }))
    .sort((a, b) => b.amount - a.amount);
}

export function accuracyData(summary) {
  return summary.rows
    .filter((r) => r.accuracy !== null && !r.isDebt && !r.savings)
    .map((r) => ({ id: r.id, name: r.name, ratio: r.accuracy, estimate: r.estimate, actual: r.actual }))
    .sort((a, b) => b.ratio - a.ratio);
}

export function gutBars(summary) {
  const g = summary.gutCheck;
  const th = summary.totals.takeHome;
  return [
    { id: 'gut', name: 'Gut number', amount: g.gut, share: ratio(g.gut, th) },
    { id: 'estimates', name: 'Sum of estimates', amount: g.estimates, share: ratio(g.estimates, th) },
    { id: 'dreams', name: 'Sum of dreams', amount: g.dreams, share: ratio(g.dreams, th) },
    { id: 'actual', name: 'Actual', amount: g.actual, share: ratio(g.actual, th) }
  ];
}

// Estimate vs actual per closed month for one category (plus the current month).
export function trendData(summary, catId) {
  const pts = (summary.history.byCategory[catId] || []).map((p) => ({ key: p.key, estimate: p.estimate, actual: p.actual }));
  const row = summary.rows.find((r) => r.id === catId);
  if (row) pts.push({ key: summary.month, estimate: row.estimate, actual: row.actual, current: true });
  return { id: catId, name: row ? row.name : catId, points: pts };
}

export function trendCategories(summary) {
  return Object.keys(summary.history.byCategory).map((id) => {
    const row = summary.rows.find((r) => r.id === id);
    return { id, name: row ? row.name : summary.history.byCategory[id][0].name };
  });
}

export function varianceByMonth(summary) {
  return summary.history.totals.map((m) => ({ key: m.key, share: m.variancePct, amount: minus(m.actual, m.estimate) }));
}

export function joyPoints(summary) {
  const pts = [];
  for (const c of summary.rows) {
    if (c.savings) continue;
    for (const l of c.lines) {
      const amt = l.basis;
      if (l.joy === null || amt === null || amt <= 0) continue;
      pts.push({ id: l.id, name: l.name, category: c.name, spend: amt, joy: l.joy });
    }
  }
  const avgSpend = pts.length ? pts.reduce((a, p) => a + p.spend, 0) / pts.length : null;
  return { points: pts, splitSpend: avgSpend, splitJoy: 5.5 };
}

export function mistakeData(summary) {
  const t = summary.totals;
  return { monthly: t.mistakeMonthly, yearly: t.mistakeYearly };
}

export function gauges(summary, refs) {
  const t = summary.totals;
  return {
    housing: { value: t.housingShare, band: t.housingBand, over: t.housingOver },
    savings: { value: t.savingsRate, target: refs.benchmarks.fiftyThirtyTwenty.savings, under: t.savingsRate === null ? null : t.savingsRate < refs.benchmarks.fiftyThirtyTwenty.savings }
  };
}
