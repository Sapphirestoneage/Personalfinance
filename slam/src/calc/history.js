// Closed months: the snapshot taken at close, late revisions applied on top,
// variance per month, the trend, and the snapshot builder used at close.

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
    delta += rev.amount - (line.actual === null ? 0 : line.actual);
    touched = true;
  }
  if (!touched) return base;
  return (base === null ? 0 : base) + delta;
}

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

// Open months (not closed, not the one being worked on) as snapshot-shaped
// records, so trends use every month that has actuals.
export function openMonthRecords(doc) {
  const closed = new Set(doc.months.map((m) => m.key));
  const blank = { amount: null, cadence: 'month', status: null, source: 'client', asOf: null, note: '' };
  return Object.entries(doc.monthActuals || {}).filter(([k]) => !closed.has(k) && k !== doc.currentMonth).map(([key, actuals]) => {
    const copy = { ...doc, categories: doc.categories.map((c) => ({ ...c, lines: c.lines.map((l) => ({ ...l, actual: actuals[l.id] || blank })) })) };
    return { key, open: true, snapshot: monthSnapshot(budgetModel(copy), { takeHome: null }), revised: { lines: {} } };
  });
}

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
        key: rec.key, open: !!rec.open, name: c.name, estimate: c.estimate, actual,
        revised: actual !== c.actual, variancePct: ratio(actual === null || c.estimate === null ? null : actual - c.estimate, c.estimate)
      });
      if (!c.savings) { estSum.push(c.estimate); actSum.push(actual); }
    }
    const e = sumKnown(estSum).total;
    const a = sumKnown(actSum).total;
    totals.push({ key: rec.key, open: !!rec.open, estimate: e, actual: a, variancePct: ratio(a === null || e === null ? null : a - e, e) });
  }
  const trends = {};
  for (const [catId, pts] of Object.entries(byCategory)) trends[catId] = trendOf(pts);
  return { keys: months.filter((m) => !m.open).map((m) => m.key), openKeys: months.filter((m) => m.open).map((m) => m.key), allKeys: months.map((m) => m.key), byCategory, totals, trends };
}

// Last closed month's actual for one category (for "use last month's actual").
export function lastActual(history, catId) {
  const pts = history.byCategory[catId] || [];
  for (let i = pts.length - 1; i >= 0; i--) if (pts[i].actual !== null) return { key: pts[i].key, amount: pts[i].actual };
  return null;
}

// What gets locked when a month closes.
export function monthSnapshot(model, income) {
  const categories = {};
  const lines = {};
  for (const c of model.categories) {
    categories[c.id] = { name: c.name, savings: c.savings, estimate: c.estimate.amount, dream: c.dream.amount, actual: c.actual.amount };
    for (const l of c.lines) lines[l.id] = { name: l.name, categoryId: c.id, estimate: l.estimate, actual: l.actual };
  }
  return { takeHome: income.takeHome, categories, lines };
}

// One closed month as table rows: categories with their lines, revisions applied.
export function monthRows(doc, history, key) {
  const rec = doc.months.find((m) => m.key === key);
  if (!rec) return [];
  return Object.entries(rec.snapshot.categories).map(([catId, c]) => {
    const pt = history.byCategory[catId].find((p) => p.key === key);
    const lines = Object.entries(rec.snapshot.lines)
      .filter(([, l]) => l.categoryId === catId)
      .map(([lineId, l]) => {
        const rev = rec.revised.lines[lineId];
        const actual = rev ? rev.amount : l.actual;
        return { id: lineId, name: l.name, estimate: l.estimate, actual, original: l.actual, revised: !!rev, gap: minus(actual, l.estimate), accuracy: ratio(actual, l.estimate) };
      });
    return {
      id: catId, name: c.name, savings: !!c.savings, estimate: c.estimate, dream: c.dream === undefined ? null : c.dream,
      actual: pt.actual, original: c.actual, revised: pt.revised, gap: minus(pt.actual, c.estimate),
      gapPct: pt.variancePct, accuracy: ratio(pt.actual, c.estimate), lines
    };
  });
}
