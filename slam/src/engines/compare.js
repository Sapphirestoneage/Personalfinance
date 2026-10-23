// The heart of the tool: estimate vs actual (and the plan). Gaps, accuracy ratios,
// blind spot, biggest culprits, back to your own words, gut check, the
// personal correction factor, and proof of cash. Inputs are the budget model
// (model.js), its totals (totals.js) and the month history (history.js); helpers
// come from money.js (null-safe ratio and minus) and normalize.js (toMonthly).
// All amounts are dollars a month; a ratio is actual over estimate (1 = spot on).

import { ratio, minus } from './money.js';
import { toMonthly } from './normalize.js';

/**
 * How far an actual landed from its estimate.
 * @param {number|null} estimate dollars a month (null = not entered).
 * @param {number|null} actual dollars a month.
 * @returns {{actualMinusEstimate: number|null, actualMinusEstimatePct: number|null}} the gap in dollars a month and
 *   as a share of the estimate (0.1 = 10% over); null when either side is missing.
 */
export function gaps(estimate, actual) {
  const vsEst = minus(actual, estimate);
  return { actualMinusEstimate: vsEst, actualMinusEstimatePct: ratio(vsEst, estimate) };
}

/**
 * Accuracy ratio: actual over estimate (1.2 = spent 20% more than guessed).
 * @param {number|null} estimate dollars a month.
 * @param {number|null} actual dollars a month.
 * @returns {number|null} the ratio, or null when either side is missing or the estimate is 0.
 */
export function accuracy(estimate, actual) {
  return ratio(actual, estimate);
}

// Everything here is about spending; savings categories are never a gap or a culprit.
const spendingCats = (model) => model.categories.filter((c) => !c.savings);

/**
 * Blind spot: the share of actual spending that the client's estimates did not account
 * for, the overage in each category (or the whole actual where no estimate exists).
 * @param {object} model the budget model (budgetModel in model.js), dollars a month.
 * @returns {{unaccounted: number, actual: number, pct: number|null}} dollars a month, and unaccounted over actual (0
 *   to 1); pct is null when nothing real was measured.
 */
export function blindSpot(model) {
  let unaccounted = 0;
  let actual = 0;
  let real = false; // computed debt lines and "doesn't apply" zeros alone measure nothing
  for (const c of spendingCats(model)) {
    const a = c.actual.amount;
    // No actual (null) measures nothing; a category folded into a single total is counted below, against the total.
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

/**
 * Biggest culprits: the top categories by dollars over the client's own estimate,
 * with the cut that brings each back to what they originally said.
 * @param {object} model the budget model.
 * @param {number} [n=3] how many to return.
 * @returns {Array<{id: string, name: string, estimate: number, actual: number, gap: number, ratio: number,
 *   cutMonthly: number, cutYearly: number}>} dollars a month, except cutYearly (dollars a year, the gap x 12) and ratio
 *   (actual over estimate); only categories with both numbers and the actual above the estimate, biggest gap first.
 */
export function culprits(model, n = 3) {
  // A single-total household's "everything" row has no actual of its own: what was found inside the total stands in.
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

/**
 * Gut check: the number the client thinks they spend, against the estimates and the actual.
 * @param {object} doc the household document; doc.gut is a Value (amount, cadence, status).
 * @param {object} totals budget totals (budgetTotals in totals.js), dollars a month.
 * @returns {object} gut, estimates, actual and their differences in dollars a month; actualVsGutRatio is actual over
 *   gut; actualUsesEstimateFor names the categories whose actual fell back to the estimate.
 */
export function gutCheck(doc, totals) {
  const gut = toMonthly(doc.gut, 'monthly');
  return {
    gut,
    estimates: totals.estimateTotal,
    // totals.spending is the basis: the actual where one exists, else the estimate. The caller is told which.
    actual: totals.spending,
    actualUsesEstimateFor: totals.basisUsesEstimate,
    actualVsGut: minus(totals.spending, gut),
    actualVsGutRatio: ratio(totals.spending, gut),
    estimatesVsGut: minus(totals.estimateTotal, gut)
  };
}

/**
 * Personal correction factor: the suggested next estimate per category = estimate x average
 * accuracy ratio, across closed months plus the current month. Applied only with one click.
 * @param {object} model the budget model.
 * @param {object} history month history (monthHistory in history.js); byCategory[id] lists each month's estimate and
 *   actual in dollars a month.
 * @returns {Array<object>} one row per category with an estimate and at least one ratio: factor (average actual over
 *   estimate), suggested (dollars a month), suggestedWhole (to the dollar), months (ratios averaged), worthOffering.
 */
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
    const suggested = c.estimate.amount * avg;
    // Offered in whole dollars; a suggestion that rounds to the current estimate is not worth showing.
    out.push({
      id: c.id, name: c.name, estimate: c.estimate.amount, factor: avg, suggested, months: ratios.length,
      suggestedWhole: Math.round(suggested), worthOffering: Math.round(suggested) !== Math.round(c.estimate.amount)
    });
  }
  return out;
}

/**
 * Proof of cash: take-home minus savings minus debt payments implies a spending number.
 * If entered spending (excluding debt payments) is more than 15% away from it, flag it
 * gently. The base is the implied number (what the paycheck says).
 * @param {object} totals budget totals, dollars a month (takeHome, spending, savings, bases.debt).
 * @param {number} [threshold=0.15] how far off counts as a mismatch, as a share of the implied number (0 to 1).
 * @returns {{available: boolean, implied?: number, entered?: number, diff?: number, pct?: number|null, flagged?:
 *   boolean, threshold?: number}} dollars a month; pct is |diff| over implied, null when nothing is implied.
 */
export function proofOfCash(totals, threshold = 0.15) {
  // Only take-home and spending are required. Savings or debt payments not entered count as none
  // here, so the check still runs on a thin picture (it is a gentle flag, not a total).
  const debt = totals.bases.debt ? totals.bases.debt.amount : null;
  const debtAmt = debt === null ? 0 : debt;
  const savings = totals.savings === null ? 0 : totals.savings;
  if (totals.takeHome === null || totals.spending === null) return { available: false };
  const implied = totals.takeHome - savings - debtAmt;
  // Debt payments sit inside spending (the Debt payments category), so they come out of both sides.
  const entered = totals.spending - debtAmt;
  const diff = entered - implied;
  const pct = implied > 0 ? Math.abs(diff) / implied : null;
  return {
    available: true, implied, entered, diff, pct,
    // With nothing left to spend after savings and debt, any entered spending at all is a mismatch.
    flagged: pct === null ? entered > 0 : pct > threshold,
    threshold
  };
}


/**
 * Blind guess vs the original estimate, measured against the actual.
 * @param {object} doc the household document; doc.blindRounds holds each round's guesses by category id, as Values.
 * @param {object} model the budget model; its payFrequency converts a guess typed per paycheck.
 * @param {string} roundId which blind round to read.
 * @returns {{id: string, date: string, rows: Array<object>}|null} per category, dollars a month: original, blind,
 *   actual, change (blind minus original) and closer, which guess landed nearer the actual ('blind', 'original', 'tie',
 *   or null without an actual). Null when the round is not found.
 */
export function blindCompare(doc, model, roundId) {
  const round = doc.blindRounds.find((r) => r.id === roundId);
  if (!round) return null;
  const rows = [];
  for (const c of model.categories) {
    const v = round.estimates[c.id];
    // Debt payments are computed from the debts, never guessed.
    if (!v || c.isDebt) continue;
    const blind = toMonthly(v, model.payFrequency);
    if (blind === null) continue;
    const orig = c.estimate.amount;
    const act = c.actual.amount;
    const dBlind = act === null ? null : Math.abs(act - blind);
    const dOrig = act === null || orig === null ? null : Math.abs(act - orig);
    rows.push({
      id: c.id, name: c.name, original: orig, blind, actual: act, change: minus(blind, orig),
      closer: dBlind === null || dOrig === null ? null : dBlind < dOrig ? 'blind' : dBlind > dOrig ? 'original' : 'tie'
    });
  }
  return { id: round.id, date: round.date, rows };
}
