// Trends (S-092): everything in Analyze, Trends, worked out here so the cards
// only draw. By merchant, by category or line, by time period, and small
// one-line stats. Months come from a range: the last 3, 6, or 12 (ending at
// the month being worked on), or all months with data.

import { actualsFor, planView, prevMonthKey } from './plan.js';
import { counted } from './log.js';
import { detect } from './tx-analysis.js';
import { bridgeFor } from './bridge.js';
import { forecastCheck, daysInMonth } from './dates.js';
import { sortByPlan } from './loop.js';
import { ratio } from './money.js';

const r2 = (x) => (x === null || x === undefined ? null : Math.round(x * 100) / 100 + 0);
const monthOf = (d) => d.slice(0, 7);
const PURCHASE = new Set(['spend', 'fee']);
const SPEND = new Set(['spend', 'fee', 'refund', 'reimbursement']);
const mean = (xs) => (xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : null);

export function trendMonths(doc, history, range) {
  const all = [...new Set([...history.allKeys, ...counted(doc.transactions).map((t) => monthOf(t.date)), doc.currentMonth])].sort();
  if (range === 'all') return all;
  const n = Number(range) || 12;
  const out = [];
  let k = doc.currentMonth;
  // Never before the first month with data, so empty months do not show as zeros.
  for (let i = 0; i < n && k >= all[0]; i++) { out.unshift(k); k = prevMonthKey(k); }
  return out;
}

const spendEntries = (doc, months) => {
  const set = new Set(months);
  // Money moved to savings (a Roth IRA, say) is not spending.
  const sav = new Set(doc.categories.filter((c) => c.savings).flatMap((c) => c.lines.map((l) => l.id)));
  return counted(doc.transactions).filter((t) => set.has(monthOf(t.date)) && !t.adjust && !sav.has(t.lineId));
};

// ---- By entry or merchant ----

// Every charge at one merchant, with the price-creep flag when there is one.
export function merchantPrices(doc, merchant, months) {
  const list = spendEntries(doc, months).filter((t) => t.merchant === merchant && t.kind === 'spend' && t.amount > 0).map((t) => ({ date: t.date, amount: t.amount }));
  const creep = detect(doc.transactions).priceCreep.find((p) => p.merchant === merchant) || null;
  return { merchant, charges: list, creep };
}

// Visits per month and the average ticket.
export function merchantVisits(doc, merchant, months) {
  const es = spendEntries(doc, months).filter((t) => t.merchant === merchant && PURCHASE.has(t.kind) && t.amount > 0);
  return months.map((m) => {
    const inM = es.filter((t) => monthOf(t.date) === m);
    const total = r2(inM.reduce((a, t) => a + t.amount, 0));
    return { month: m, visits: inM.length, total, average: inM.length ? r2(total / inM.length) : null };
  });
}

// Every charge in one category across the range (a dot plot).
export function categoryCharges(doc, catId, months) {
  const cat = doc.categories.find((c) => c.id === catId);
  const ids = new Set(cat ? cat.lines.map((l) => l.id) : []);
  return spendEntries(doc, months).filter((t) => ids.has(t.lineId) && PURCHASE.has(t.kind) && t.amount > 0).map((t) => ({ date: t.date, amount: t.amount, label: t.description || t.note || '' }));
}

export function merchantsIn(doc, months) {
  const g = {};
  for (const t of spendEntries(doc, months)) if (t.merchant && PURCHASE.has(t.kind)) g[t.merchant] = (g[t.merchant] || 0) + t.amount;
  return Object.entries(g).sort((a, b) => b[1] - a[1]).map(([m]) => m);
}

// ---- By category or line ----

// focus: { kind: 'category' | 'line', id }. Actual each month, the estimate at each
// close, the plan, and the rolling 3-month average of the actual.
export function monthlySeries(doc, history, focus, months) {
  const rows = months.map((m) => {
    const a = actualsFor(doc, history, m);
    const rec = (doc.months || []).find((x) => x.key === m);
    const plan = planView(doc, m);
    let actual; let estimate = null; let planAmt = null;
    if (focus.kind === 'category') {
      actual = a.cats[focus.id] === undefined ? null : a.cats[focus.id];
      if (rec && rec.snapshot.categories[focus.id]) estimate = rec.snapshot.categories[focus.id].estimate;
      if (plan && plan.cats[focus.id]) planAmt = plan.cats[focus.id].amount;
    } else {
      actual = a.lines[focus.id] === undefined ? null : a.lines[focus.id];
      if (rec && rec.snapshot.lines[focus.id]) estimate = rec.snapshot.lines[focus.id].estimate;
      if (plan) for (const c of Object.values(plan.cats)) if (c.lines[focus.id] !== undefined) planAmt = c.lines[focus.id];
    }
    return { month: m, actual, estimate, plan: planAmt };
  });
  rows.forEach((r, i) => {
    const win = rows.slice(Math.max(0, i - 2), i + 1).map((x) => x.actual).filter((x) => x !== null);
    r.rolling3 = win.length ? r2(mean(win)) : null;
  });
  const last = rows.filter((r) => r.actual !== null).slice(-1)[0] || null;
  const yearAgo = last ? rows.find((r) => r.month === lastYear(last.month)) || { month: lastYear(last.month), actual: actualsFor(doc, history, lastYear(last.month))[focus.kind === 'category' ? 'cats' : 'lines'][focus.id] ?? null } : null;
  return { focus, rows, sameMonthLastYear: last && yearAgo && yearAgo.actual !== null && yearAgo.actual !== undefined ? { month: last.month, now: last.actual, then: yearAgo.actual, change: r2(last.actual - yearAgo.actual) } : null };
}

function lastYear(m) { return (Number(m.slice(0, 4)) - 1) + m.slice(4); }

// Spending categories by month: a heatmap and one sparkline each.
export function categoryGrid(doc, history, months) {
  const cats = doc.categories.filter((c) => c.state !== 'archived' && !c.savings);
  const cols = months.map((m) => actualsFor(doc, history, m));
  const rows = cats.map((c) => ({ id: c.id, name: c.name, values: cols.map((a) => (a.cats[c.id] === undefined ? null : a.cats[c.id])) })).filter((r) => r.values.some((v) => v !== null && v !== 0));
  const all = rows.flatMap((r) => r.values).filter((v) => v !== null);
  return { months, rows, max: all.length ? Math.max(...all) : 0 };
}

// ---- By time period ----

// Month over month: last month's total, each category's change, this month's total.
export function monthOverMonth(doc, history, month) {
  const prev = prevMonthKey(month);
  const a = actualsFor(doc, history, prev);
  const b = actualsFor(doc, history, month);
  const cats = doc.categories.filter((c) => !c.savings);
  const steps = cats.map((c) => ({ id: c.id, name: c.name, change: r2((b.cats[c.id] || 0) - (a.cats[c.id] || 0)) })).filter((x) => Math.abs(x.change) >= 0.005)
    .sort((x, y) => Math.abs(y.change) - Math.abs(x.change));
  return { from: prev, to: month, before: r2(a.spending), after: r2(b.spending), steps, change: r2((b.spending || 0) - (a.spending || 0)) };
}

// Cumulative spending by day this month vs the same day last month, and vs the plan spread evenly.
export function pacing(doc, month, planSpending) {
  const byDay = (m) => {
    const n = daysInMonth(m);
    const out = new Array(n).fill(0);
    for (const t of spendEntries(doc, [m])) if (SPEND.has(t.kind) && !t.oneOff) out[Number(t.date.slice(8)) - 1] += t.amount - (t.owed || 0);
    let run = 0;
    return out.map((x) => { run += x; return r2(run); });
  };
  const n = daysInMonth(month);
  return { month, days: n, now: byDay(month), last: byDay(prevMonthKey(month)), plan: planSpending === null ? null : Array.from({ length: n }, (_, i) => r2((planSpending * (i + 1)) / n)) };
}

// Average spending by day of the month over the range.
export function dayOfMonth(doc, months) {
  const sums = new Array(31).fill(0);
  for (const t of spendEntries(doc, months)) if (SPEND.has(t.kind) && !t.oneOff) sums[Number(t.date.slice(8)) - 1] += t.amount - (t.owed || 0);
  return sums.map((s, i) => ({ day: i + 1, average: r2(s / months.length) }));
}

// ---- Small stats ----

// Fixed lines plus debt minimums, and their share of take-home.
export function fixedFloor(totals) {
  return { amount: r2(totals.fixed), share: ratio(totals.fixed, totals.takeHome) };
}

// The categories that swing most: standard deviation over the mean of monthly actuals.
export function volatility(grid, n = 3) {
  return grid.rows.map((r) => {
    const xs = r.values.filter((v) => v !== null);
    const m = mean(xs);
    if (xs.length < 2 || !m) return null;
    const sd = Math.sqrt(xs.reduce((a, x) => a + (x - m) * (x - m), 0) / xs.length);
    return { id: r.id, name: r.name, mean: r2(m), sd: r2(sd), swing: sd / m };
  }).filter((v) => v && v.sd > 0).sort((a, b) => b.swing - a.swing).slice(0, n);
}

const totalOf = (snap) => Object.values(snap.categories).filter((c) => !c.savings).reduce((a, c) => (c.actual === null ? a : a + c.actual), 0);

// Spending trend vs take-home trend: change per month from the first to the last month in the range.
export function lifestyleCreep(doc, history, months) {
  const pts = months.map((m) => ({ m, a: actualsFor(doc, history, m), rec: (doc.months || []).find((x) => x.key === m) })).filter((p) => p.a.spending !== null && p.rec);
  if (pts.length < 2) return null;
  const first = pts[0];
  const last = pts[pts.length - 1];
  const steps = pts.length - 1;
  return { from: first.m, to: last.m, spendingPerMonth: r2((last.a.spending - first.a.spending) / steps), takeHomePerMonth: r2(((last.rec.snapshot.takeHome || 0) - (first.rec.snapshot.takeHome || 0)) / steps) };
}

const offBy = (a, e) => { const r = ratio(a, e); return r === null || r <= 0 ? null : r2(r >= 1 ? r : 1 / r); };

// How far off the estimates were, month by month (closed months).
export function learningCurve(doc, months) {
  return months.map((m) => (doc.months || []).find((x) => x.key === m)).filter(Boolean).map((rec) => {
    const cs = Object.values(rec.snapshot.categories).filter((c) => !c.savings);
    const e = cs.reduce((a, c) => (c.estimate === null ? a : a + c.estimate), 0);
    return { month: rec.key, offBy: offBy(totalOf(rec.snapshot), e) };
  });
}

// Lines on plan or better, month by month (the saved review when there is one).
export function planHitRate(doc, summary, months) {
  return months.map((m) => {
    const rec = (doc.months || []).find((x) => x.key === m);
    let g = rec && rec.snapshot.review ? rec.snapshot.review.vsPlan.lines : null;
    if (!g) {
      const plan = planView(doc, m);
      if (!plan) return { month: m, rate: null, hits: 0, of: 0 };
      const a = actualsFor(doc, summary.history, m);
      g = sortByPlan(Object.values(plan.cats).filter((c) => !c.savings && !c.isDebt).flatMap((c) => Object.entries(c.lines).map(([id, p]) => ({ id, plan: p, actual: a.lines[id] === undefined ? null : a.lines[id] }))));
    }
    const of = g.better.length + g.onPlan.length + g.worse.length;
    return { month: m, hits: g.better.length + g.onPlan.length, of, rate: of ? (g.better.length + g.onPlan.length) / of : null };
  });
}

// Cash the budget does not explain: the bridge's leftover, ATM cash, and unmapped Venmo or Zelle.
export function notExplained(doc, income, months) {
  const es = spendEntries(doc, months);
  const bridges = months.map((m) => bridgeFor(doc, income, m)).filter((b) => b.unexplained !== null);
  const atm = es.filter((t) => /\bATM\b|CASH WITHDRAWAL/i.test(t.description || t.merchant || '') && t.amount > 0);
  const p2p = es.filter((t) => !t.lineId && /VENMO|ZELLE|CASH APP/i.test(t.description || t.merchant || '') && t.amount > 0);
  return { bridge: r2(bridges.reduce((a, b) => a + b.unexplained, 0)), months: bridges.length, atm: r2(atm.reduce((a, t) => a + t.amount, 0)), p2p: r2(p2p.reduce((a, t) => a + t.amount, 0)) };
}

// Charged on cards vs paid to cards from cash, month by month.
export function cardFloat(doc, months) {
  const kind = Object.fromEntries((doc.accounts || []).map((a) => [a.id, a.type]));
  return months.map((m) => {
    const es = spendEntries(doc, [m]);
    const charged = r2(es.filter((t) => kind[t.account] === 'credit-card' && PURCHASE.has(t.kind) && t.amount > 0).reduce((a, t) => a + t.amount, 0));
    const paid = r2(es.filter((t) => t.kind === 'card-payment' && t.amount > 0 && kind[t.account] !== 'credit-card').reduce((a, t) => a + t.amount, 0));
    return { month: m, charged, paid, gap: r2(charged - paid) };
  });
}

// 1099 and side income: the low, average, and high month from the log.
export function incomeStability(doc, months) {
  const ids = new Set(doc.income.filter((i) => i.type === '1099' || i.type === 'side').map((i) => i.id));
  if (!ids.size) return null;
  const per = months.map((m) => r2(-spendEntries(doc, [m]).filter((t) => t.kind === 'income' && ids.has(t.incomeId)).reduce((a, t) => a + t.amount, 0)));
  const got = per.filter((x) => x > 0);
  if (!got.length) return null;
  return { low: Math.min(...per), average: r2(mean(per)), high: Math.max(...per), months: per.length };
}

// Small, frequent charges as a yearly cost: an average of $20 or less, twice a month or more.
export function annualizedHabits(doc, months, n = 3) {
  const g = {};
  for (const t of spendEntries(doc, months)) {
    if (!t.merchant || !PURCHASE.has(t.kind) || t.amount <= 0) continue;
    const x = (g[t.merchant] = g[t.merchant] || { merchant: t.merchant, count: 0, total: 0 });
    x.count += 1;
    x.total += t.amount;
  }
  return Object.values(g).filter((x) => x.total / x.count <= 20 && x.count >= 2 * months.length)
    .map((x) => ({ merchant: x.merchant, count: x.count, average: r2(x.total / x.count), yearly: r2((x.total / months.length) * 12) }))
    .sort((a, b) => b.yearly - a.yearly).slice(0, n);
}

export function forecastAccuracy(doc, months) {
  return months.map((m) => forecastCheck(doc, m)).filter((f) => f.predicted !== null);
}

// Share of spending that came from the log, month by month.
export function trackingByMonth(doc, months) {
  return months.map((m) => (doc.months || []).find((x) => x.key === m)).filter((rec) => rec && rec.snapshot.review).map((rec) => ({ month: rec.key, share: rec.snapshot.review.tracking.share }));
}
