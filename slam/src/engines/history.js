// Closed months: the snapshot taken at close, late revisions applied on top,
// variance per month, the trend, and the snapshot builder used at close.
// Depends on money.js (ratio, sumKnown, minus) and model.js (budgetModel, to shape open months).
// Dollars a month: a snapshot holds each category's and line's estimate and actual for its month;
// a variance is (actual - estimate) / estimate, a ratio.

import { ratio, sumKnown, minus } from './money.js';
import { budgetModel } from './model.js';

// Category actual for a closed month, with any revised line actuals applied.
function revisedCategoryActual(rec, catId) {
  const base = rec.snapshot.categories[catId].actual;
  let delta = 0;
  let touched = false;
  for (const [lineId, rev] of Object.entries(rec.revised.lines || {})) {
    const line = rec.snapshot.lines[lineId];
    if (!line || line.categoryId !== catId) continue;
    // A revision replaces the line's actual; a line that had none (null) adds its whole revised amount.
    delta += rev.amount - (line.actual === null ? 0 : line.actual);
    touched = true;
  }
  // Only a revision turns a category with no actual into a number; untouched, "not entered" stays null.
  if (!touched) return base;
  return (base === null ? 0 : base) + delta;
}

// The last two months with an actual: a move past 5% either way is a trend, less is flat.
function trendOf(points) {
  const vals = points.map((p) => p.actual).filter((x) => x !== null);
  if (vals.length < 2) return 'not enough months';
  const last = vals[vals.length - 1];
  const prev = vals[vals.length - 2];
  const change = ratio(last - prev, prev);
  if (change === null) return 'flat';
  if (change > 0.05) return 'up';
  if (change < -0.05) return 'down';
  return 'flat';
}

/**
 * Open months (not closed, not the one being worked on) as snapshot-shaped
 * records, so trends use every month that has actuals.
 * @param {object} doc the household file.
 * @returns {Array<{key: string, open: true, snapshot: object, revised: {lines: {}}}>} oldest first; key is 'YYYY-MM';
 *   snapshot as monthSnapshot builds it, with takeHome null (no income is kept for an open month).
 */
export function openMonthRecords(doc) {
  const closed = new Set(doc.months.map((m) => m.key));
  // A line with no stored actual for the month is blank (null), never 0.
  const blank = { amount: null, cadence: 'month', status: null, source: 'client', asOf: null, note: '' };
  // A month with only log entries is open too (S-087): its actuals come from the log.
  const keys = new Set([
    ...Object.keys(doc.monthActuals || {}),
    ...(doc.transactions || []).map((t) => t.date.slice(0, 7))
  ]);
  // The model is rebuilt as if that month were current, so its lines carry that month's actuals.
  return [...keys]
    .filter((k) => !closed.has(k) && k !== doc.currentMonth)
    .sort()
    .map((key) => [key, (doc.monthActuals || {})[key] || {}])
    .map(([key, actuals]) => {
      const copy = {
        ...doc,
        currentMonth: key,
        categories: doc.categories.map((c) => ({
          ...c,
          lines: c.lines.map((l) => ({ ...l, actual: actuals[l.id] || blank }))
        }))
      };
      return {
        key,
        open: true,
        snapshot: monthSnapshot(budgetModel(copy), { takeHome: null }),
        revised: { lines: {} }
      };
    });
}

/**
 * Every month, closed and open, side by side: per category and in total, with a trend per category.
 * @param {object} doc the household file.
 * @returns {{keys: string[], openKeys: string[], allKeys: string[], byCategory: Object<string, object[]>, totals: object[], trends: Object<string, string>}}
 *   keys are closed months, openKeys open ones, allKeys both ('YYYY-MM', oldest first); byCategory[catId] and totals hold
 *   { key, open, estimate, actual, variancePct } in dollars a month (variancePct = (actual - estimate) / estimate, a ratio);
 *   trends[catId] is 'up', 'down', 'flat' or 'not enough months'.
 */
export function monthHistory(doc) {
  const months = [...doc.months, ...openMonthRecords(doc)].sort((a, b) => (a.key < b.key ? -1 : 1));
  const byCategory = {};
  const totals = [];
  for (const rec of months) {
    const estSum = [];
    const actSum = [];
    for (const [catId, c] of Object.entries(rec.snapshot.categories)) {
      const actual = revisedCategoryActual(rec, catId);
      (byCategory[catId] = byCategory[catId] || []).push({
        key: rec.key,
        open: !!rec.open,
        name: c.name,
        estimate: c.estimate,
        actual,
        revised: actual !== c.actual,
        variancePct: ratio(actual === null || c.estimate === null ? null : actual - c.estimate, c.estimate)
      });
      // Totals are spending only: savings categories stay out, as in the Budget's spending total.
      if (!c.savings) {
        estSum.push(c.estimate);
        actSum.push(actual);
      }
    }
    // A month where nothing was entered totals null, not 0.
    const e = sumKnown(estSum).total;
    const a = sumKnown(actSum).total;
    totals.push({
      key: rec.key,
      open: !!rec.open,
      estimate: e,
      actual: a,
      variancePct: ratio(a === null || e === null ? null : a - e, e)
    });
  }
  const trends = {};
  for (const [catId, pts] of Object.entries(byCategory)) trends[catId] = trendOf(pts);
  return {
    keys: months.filter((m) => !m.open).map((m) => m.key),
    openKeys: months.filter((m) => m.open).map((m) => m.key),
    allKeys: months.map((m) => m.key),
    byCategory,
    totals,
    trends
  };
}

/**
 * The latest month with an actual for one category, closed or open (for "use last month's actual").
 * @param {object} history what monthHistory returns.
 * @param {string} catId the category id.
 * @returns {?{key: string, amount: number}} the month 'YYYY-MM' and dollars a month; null when no month has one.
 */
export function lastActual(history, catId) {
  const pts = history.byCategory[catId] || [];
  for (let i = pts.length - 1; i >= 0; i--)
    if (pts[i].actual !== null) return { key: pts[i].key, amount: pts[i].actual };
  return null;
}

/**
 * What gets locked when a month closes: each category's and line's estimate and actual, and the take-home.
 * @param {object} model the budget model (budgetModel in model.js), dollars a month.
 * @param {{takeHome: number|null}} income the income summary (summary.income), or { takeHome: null } for an open month.
 * @returns {{takeHome: number|null, categories: Object<string, object>, lines: Object<string, object>}} dollars a month;
 *   categories[id] = { name, savings, estimate, actual }, lines[id] = { name, categoryId, estimate, actual }; null = not entered.
 */
export function monthSnapshot(model, income) {
  const categories = {};
  const lines = {};
  for (const c of model.categories) {
    categories[c.id] = { name: c.name, savings: c.savings, estimate: c.estimate.amount, actual: c.actual.amount };
    for (const l of c.lines) lines[l.id] = { name: l.name, categoryId: c.id, estimate: l.estimate, actual: l.actual };
  }
  return { takeHome: income.takeHome, categories, lines };
}

/**
 * One closed month as table rows: categories with their lines, revisions applied.
 * @param {object} doc the household file.
 * @param {object} history what monthHistory returns.
 * @param {string} key the month 'YYYY-MM'.
 * @returns {object[]} per category { id, name, savings, estimate, actual, original, revised, gap, gapPct, accuracy, lines },
 *   dollars a month; gap = actual - estimate, gapPct a ratio of the estimate, accuracy = actual / estimate; [] when not closed.
 */
export function monthRows(doc, history, key) {
  const rec = doc.months.find((m) => m.key === key);
  if (!rec) return [];
  return Object.entries(rec.snapshot.categories).map(([catId, c]) => {
    const pt = history.byCategory[catId].find((p) => p.key === key);
    const lines = Object.entries(rec.snapshot.lines)
      .filter(([, l]) => l.categoryId === catId)
      .map(([lineId, l]) => {
        const rev = rec.revised.lines[lineId];
        // original keeps the actual as it was at close, so a revision stays visible next to it.
        const actual = rev ? rev.amount : l.actual;
        return {
          id: lineId,
          name: l.name,
          estimate: l.estimate,
          actual,
          original: l.actual,
          revised: !!rev,
          gap: minus(actual, l.estimate),
          accuracy: ratio(actual, l.estimate)
        };
      });
    return {
      id: catId,
      name: c.name,
      savings: !!c.savings,
      estimate: c.estimate,
      actual: pt.actual,
      original: c.actual,
      revised: pt.revised,
      gap: minus(pt.actual, c.estimate),
      gapPct: pt.variancePct,
      accuracy: ratio(pt.actual, c.estimate),
      lines
    };
  });
}
