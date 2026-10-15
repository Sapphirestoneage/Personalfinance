// The heart of the tool: estimate vs dream vs actual. Gaps, accuracy ratios,
// blind spot, biggest culprits, back to your own words, gut check, the
// personal correction factor, and proof of cash.

import { ratio, minus } from './money.js';
import { toMonthly } from './normalize.js';

export function gaps(estimate, dream, actual) {
  const vsEst = minus(actual, estimate);
  const vsDream = minus(actual, dream);
  const dreamVsEst = minus(dream, estimate);
  return {
    actualMinusEstimate: vsEst, actualMinusEstimatePct: ratio(vsEst, estimate),
    actualMinusDream: vsDream, actualMinusDreamPct: ratio(vsDream, dream),
    dreamMinusEstimate: dreamVsEst, dreamMinusEstimatePct: ratio(dreamVsEst, estimate)
  };
}

export function accuracy(estimate, actual) {
  return ratio(actual, estimate);
}

const spendingCats = (model) => model.categories.filter((c) => !c.savings);

// Share of actual spending that the client's estimates did not account for:
// the overage in each category (or the whole actual where no estimate exists).
export function blindSpot(model) {
  let unaccounted = 0;
  let actual = 0;
  let real = false; // computed debt lines and "doesn't apply" zeros alone measure nothing
  for (const c of spendingCats(model)) {
    const a = c.actual.amount;
    if (a === null || c.insideTotal) continue;
    if (!c.isDebt && !c.notForMe) real = true;
    actual += a;
    const e = c.estimate.amount;
    unaccounted += e === null ? a : Math.max(0, a - e);
  }
  // Single-total households: actuals inside the total are measured against it.
  const ev = model.categories.find((c) => c.isEverything);
  if (ev && ev.insideActual !== null && ev.insideActual !== undefined) {
    real = true;
    actual += ev.insideActual;
    unaccounted += ev.estimate.amount === null ? ev.insideActual : Math.max(0, ev.insideActual - ev.estimate.amount);
  }
  return { unaccounted, actual, pct: real ? ratio(unaccounted, actual) : null };
}

// Top 3 categories by dollars over the client's own estimate, with the cut
// that brings each back to what they originally said.
export function culprits(model, n = 3) {
  const rows = spendingCats(model).map((c) => (c.isEverything && c.actual.amount === null
    ? { id: c.id, name: c.name + ' (single total)', estimate: c.estimate.amount, actual: c.insideActual === undefined ? null : c.insideActual }
    : { id: c.id, name: c.name, estimate: c.estimate.amount, actual: c.actual.amount }));
  return rows
    .filter((c) => c.actual !== null && c.estimate !== null && c.actual > c.estimate)
    .map((c) => {
      const gap = c.actual - c.estimate;
      return {
        id: c.id, name: c.name, estimate: c.estimate, actual: c.actual,
        gap, ratio: ratio(c.actual, c.estimate), cutMonthly: gap, cutYearly: gap * 12
      };
    })
    .sort((a, b) => b.gap - a.gap)
    .slice(0, n);
}

export function gutCheck(doc, totals) {
  const gut = toMonthly(doc.gut, 'monthly');
  return {
    gut,
    estimates: totals.estimateTotal,
    dreams: totals.dreamTotal,
    actual: totals.spending,
    actualUsesEstimateFor: totals.basisUsesEstimate,
    actualVsGut: minus(totals.spending, gut),
    actualVsGutRatio: ratio(totals.spending, gut),
    estimatesVsGut: minus(totals.estimateTotal, gut)
  };
}

// Suggested next estimate per category = estimate x average accuracy ratio,
// across closed months plus the current month. Applied only with one click.
export function correctionFactors(model, history) {
  const out = [];
  for (const c of spendingCats(model)) {
    const ratios = [];
    for (const m of history.byCategory[c.id] || []) {
      const r = ratio(m.actual, m.estimate);
      if (r !== null) ratios.push(r);
    }
    const now = ratio(c.actual.amount, c.estimate.amount);
    if (now !== null) ratios.push(now);
    if (!ratios.length || c.estimate.amount === null) continue;
    const avg = ratios.reduce((a, r) => a + r, 0) / ratios.length;
    out.push({ id: c.id, name: c.name, estimate: c.estimate.amount, factor: avg, suggested: c.estimate.amount * avg, months: ratios.length });
  }
  return out;
}

// Take-home minus savings minus debt payments implies a spending number.
// If entered spending (excluding debt payments) is more than 15% away from it,
// flag it gently. The base is the implied number (what the paycheck says).
export function proofOfCash(totals, threshold = 0.15) {
  const debt = totals.bases.debt ? totals.bases.debt.amount : null;
  const debtAmt = debt === null ? 0 : debt;
  const savings = totals.savings === null ? 0 : totals.savings;
  if (totals.takeHome === null || totals.spending === null) return { available: false };
  const implied = totals.takeHome - savings - debtAmt;
  const entered = totals.spending - debtAmt;
  const diff = entered - implied;
  const pct = implied > 0 ? Math.abs(diff) / implied : null;
  return {
    available: true, implied, entered, diff, pct,
    flagged: pct === null ? entered > 0 : pct > threshold,
    threshold
  };
}

