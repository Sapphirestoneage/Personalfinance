// Chart-ready data, built from the summary (summary.js) that every function here takes. Charts draw
// these numbers and never compute their own. Categories beyond the 7 biggest fold into "Other" (the
// palette has 8 validated colors and a 9th hue is never generated). Amounts are dollars a month; shares
// are ratios 0 to 1. Charts with one number per category use the budget's basis (actual when there is
// one, else the estimate). Depends on money.js (ratio, sumKnown, minus), which keep a missing number
// null instead of 0.

import { ratio, sumKnown, minus } from './money.js';

const MAX_SLICES = 8;

/**
 * Biggest first; the tail folds into one "Other" slice so there are at most max slices. Zero and
 * negative amounts are dropped (a slice needs area).
 * @param {Array<{id: string, name: string, amount: ?number}>} items dollars a month
 * @param {number} [max=8] slices at most, "Other" included
 * @returns {object[]} the kept items, plus { id: 'other', other: true, members } when anything folded
 */
export function foldSlices(items, max = MAX_SLICES) {
  const sorted = items.filter((x) => x.amount > 0).sort((a, b) => b.amount - a.amount);
  if (sorted.length <= max) return sorted;
  const keep = sorted.slice(0, max - 1);
  const rest = sorted.slice(max - 1);
  keep.push({
    id: 'other',
    name: 'Other (' + rest.length + ')',
    amount: rest.reduce((a, x) => a + x.amount, 0),
    other: true,
    members: rest.map((x) => x.name)
  });
  return keep;
}

/**
 * Stable color slot per category (follows the entity, never its rank): its position in summary.rows,
 * 1 to 8, wrapping after 8.
 * @param {object} summary from buildSummary
 * @returns {Object<string, number>} category id to slot 1 to 8
 */
export function colorSlots(summary) {
  const slots = {};
  summary.rows.forEach((r, i) => {
    slots[r.id] = (i % 8) + 1;
  });
  return slots;
}

/**
 * Spending by category for the donut: each slice's basis and its share of total spending.
 * @param {object} summary from buildSummary
 * @returns {{total: ?number, slices: object[]}} total in dollars a month; share a ratio 0 to 1 (null when the
 *   total is unknown); savings categories are left out
 */
export function spendingDonut(summary) {
  const spend = summary.totals.spending;
  const slices = foldSlices(
    summary.rows.filter((r) => !r.savings && r.basis !== null).map((r) => ({ id: r.id, name: r.name, amount: r.basis }))
  );
  return { total: spend, slices: slices.map((s) => ({ ...s, share: ratio(s.amount, spend) })) };
}

/**
 * Take-home on the left; categories, savings, and surplus on the right. A shortfall (surplus below 0)
 * shows up as a second source on the left.
 * @param {object} summary from buildSummary
 * @returns {?{left: object[], right: object[], total: ?number}} dollars a month; each right node's share is
 *   of take-home; null until take-home and the outflow are both known
 */
export function sankeyData(summary) {
  const t = summary.totals;
  if (t.takeHome === null || t.outflow === null) return null;
  const right = foldSlices(
    summary.rows
      .filter((r) => !r.savings && r.basis !== null)
      .map((r) => ({ id: r.id, name: r.name, amount: r.basis })),
    7
  );
  if (t.savings) right.push({ id: 'savings', name: 'Savings', amount: t.savings, savings: true });
  if (t.surplus > 0) right.push({ id: 'surplus', name: 'Surplus', amount: t.surplus, surplus: true });
  const left = [{ id: 'take-home', name: 'Take-home', amount: t.takeHome }];
  if (t.surplus < 0) left.push({ id: 'shortfall', name: 'Shortfall', amount: -t.surplus, shortfall: true });
  const total = sumKnown(left.map((x) => x.amount)).total;
  return { left, right: right.map((x) => ({ ...x, share: ratio(x.amount, t.takeHome) })), total };
}

/**
 * The 50/30/20 lens for the bar: needs, wants, savings, and what is not assigned (the surplus).
 * @param {object} summary from buildSummary
 * @returns {{takeHome: ?number, parts: object[]}} amounts in dollars a month; share a ratio of take-home;
 *   target the benchmark ratio (0.5, 0.3, 0.2 from src/data/benchmarks.json), null for "not assigned"
 */
export function needsWantsSavings(summary) {
  const l = summary.lenses.fiftyThirtyTwenty;
  const parts = l.rows.map((r) => ({
    id: r.key,
    name: r.key[0].toUpperCase() + r.key.slice(1),
    amount: r.amount,
    share: r.share,
    target: r.target
  }));
  if (l.unassigned > 0)
    parts.push({
      id: 'unassigned',
      name: 'Not assigned',
      amount: l.unassigned,
      share: l.unassignedShare,
      target: null
    });
  return { takeHome: l.takeHome, parts };
}

/**
 * Fixed vs variable spending.
 * @param {object} summary from buildSummary
 * @returns {object[]} two rows, dollars a month; share is of spending (not take-home)
 */
export function fixedVariable(summary) {
  const t = summary.totals;
  return [
    { id: 'fixed', name: 'Fixed', amount: t.fixed, share: t.fixedPct },
    { id: 'variable', name: 'Variable', amount: t.variable, share: t.variablePct }
  ];
}

const hasAny = (r) => r.estimate !== null || r.actual !== null;

/**
 * Estimate, plan, and actual per category (also used for the overlap chart). Categories marked not for
 * me, with nothing entered, or with both estimate and actual at 0 are left out.
 * @param {object} summary from buildSummary
 * @returns {object[]} dollars a month, each with its share of take-home; plan is null when the month has
 *   no plan
 */
export function threeColumns(summary) {
  const th = summary.totals.takeHome;
  return summary.rows
    .filter((r) => !r.notForMe && hasAny(r) && !(r.estimate === 0 && r.actual === 0))
    .map((r) => ({
      id: r.id,
      name: r.name,
      savings: r.savings,
      estimate: r.estimate,
      plan: r.plan === undefined ? null : r.plan,
      actual: r.actual,
      estimateShare: ratio(r.estimate, th),
      planShare: ratio(r.plan === undefined ? null : r.plan, th),
      actualShare: ratio(r.actual, th)
    }));
}

/**
 * Actual minus estimate per category, biggest overage first. Debt and "not for me" categories are left out.
 * @param {object} summary from buildSummary
 * @returns {object[]} amount in dollars a month (positive = spent more than estimated); share is the gap
 *   as a ratio of the estimate
 */
export function variance(summary) {
  return summary.rows
    .filter((r) => r.gaps.actualMinusEstimate !== null && !r.isDebt && !r.notForMe)
    .map((r) => ({
      id: r.id,
      name: r.name,
      amount: r.gaps.actualMinusEstimate,
      share: r.gaps.actualMinusEstimatePct,
      savings: r.savings
    }))
    .sort((a, b) => b.amount - a.amount);
}

/**
 * How close each estimate was: actual / estimate per spending category (debt left out), furthest over first.
 * @param {object} summary from buildSummary
 * @returns {object[]} ratio (1 = exact, 2 = twice the estimate), with estimate and actual in dollars a month
 */
export function accuracyData(summary) {
  return summary.rows
    .filter((r) => r.accuracy !== null && !r.isDebt && !r.savings)
    .map((r) => ({ id: r.id, name: r.name, ratio: r.accuracy, estimate: r.estimate, actual: r.actual }))
    .sort((a, b) => b.ratio - a.ratio);
}

/**
 * The gut check: the one number guessed for all spending, the sum of the estimates, and the actual. The
 * actual bar is the basis, so an estimate stands in where nothing is logged yet
 * (gutCheck.actualUsesEstimateFor says which categories).
 * @param {object} summary from buildSummary
 * @returns {object[]} three bars, dollars a month, each with its share of take-home
 */
export function gutBars(summary) {
  const g = summary.gutCheck;
  const th = summary.totals.takeHome;
  return [
    { id: 'gut', name: 'Gut number', amount: g.gut, share: ratio(g.gut, th) },
    { id: 'estimates', name: 'Sum of estimates', amount: g.estimates, share: ratio(g.estimates, th) },
    { id: 'actual', name: 'Actual', amount: g.actual, share: ratio(g.actual, th) }
  ];
}

/**
 * Estimate vs actual per past month for one category (closed months, and open ones that already have
 * actuals), plus the current month (flagged current).
 * @param {object} summary from buildSummary
 * @param {string} catId
 * @returns {{id: string, name: string, points: object[]}} points by month key 'YYYY-MM', oldest first, dollars a month
 */
export function trendData(summary, catId) {
  const pts = (summary.history.byCategory[catId] || []).map((p) => ({
    key: p.key,
    estimate: p.estimate,
    actual: p.actual
  }));
  const row = summary.rows.find((r) => r.id === catId);
  if (row) pts.push({ key: summary.month, estimate: row.estimate, actual: row.actual, current: true });
  pts.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return { id: catId, name: row ? row.name : catId, points: pts };
}

/**
 * The categories that have any history, named from the current row, or from the history when the
 * category is gone.
 * @param {object} summary from buildSummary
 * @returns {Array<{id: string, name: string}>}
 */
export function trendCategories(summary) {
  return Object.keys(summary.history.byCategory).map((id) => {
    const row = summary.rows.find((r) => r.id === id);
    return { id, name: row ? row.name : summary.history.byCategory[id][0].name };
  });
}

/**
 * Each past month's total gap, actual minus estimate, over the spending categories (history.js leaves
 * savings out of these totals).
 * @param {object} summary from buildSummary
 * @returns {Array<{key: string, share: ?number, amount: ?number}>} key 'YYYY-MM'; amount in dollars a month;
 *   share is the gap as a ratio of the estimate
 */
export function varianceByMonth(summary) {
  return summary.history.totals.map((m) => ({ key: m.key, share: m.variancePct, amount: minus(m.actual, m.estimate) }));
}

/**
 * Spending vs joy, one point per rated spending line, for the four-quadrant chart. Unrated lines and
 * lines with nothing spent have no point.
 * @param {object} summary from buildSummary
 * @returns {{points: object[], splitSpend: ?number, splitJoy: number}} spend in dollars a month; joy 1 to 10.
 *   The quadrants split at the average spend of the rated lines and at 5.5, the middle of the scale.
 */
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

/**
 * What the lines tagged "mistake" add up to.
 * @param {object} summary from buildSummary
 * @returns {{monthly: number, yearly: number}} dollars a month, and dollars a year (monthly times 12)
 */
export function mistakeData(summary) {
  const t = summary.totals;
  return { monthly: t.mistakeMonthly, yearly: t.mistakeYearly };
}

/**
 * The two gauges: housing as a share of take-home against its band, and the savings rate against the
 * 50/30/20 target.
 * @param {object} summary from buildSummary
 * @param {object} refs reference data; refs.benchmarks is src/data/benchmarks.json
 * @returns {{housing: object, savings: object}} value and target are ratios 0 to 1 (housing band 0.35,
 *   savings target 0.2); over and under are null until the share is known. The savings rate counts pre-tax
 *   retirement deductions on both sides of the ratio (totals.js)
 */
export function gauges(summary, refs) {
  const t = summary.totals;
  return {
    housing: { value: t.housingShare, band: t.housingBand, over: t.housingOver },
    savings: {
      value: t.savingsRate,
      target: refs.benchmarks.fiftyThirtyTwenty.savings,
      under: t.savingsRate === null ? null : t.savingsRate < refs.benchmarks.fiftyThirtyTwenty.savings
    }
  };
}
