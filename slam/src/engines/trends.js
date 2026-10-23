// Trends (S-092): everything in Analyze, Trends, worked out here so the cards only draw. By
// merchant, by category or line, by time period, and small one-line stats. Months come from a
// range: the last 3, 6, or 12 (ending at the month being worked on), or all months with data.
// Dollars for the month, rounded to the cent; null where nothing was entered. Depends on plan.js
// (a month's actuals and plan), log.js (counted entries), tx-analysis.js (price creep), bridge.js
// (the cash bridge), calendar.js (forecast check, days in a month), loop.js (sortByPlan), money.js.

import { actualsFor, planView, prevMonthKey } from './plan.js';
import { counted } from './log.js';
import { detect } from './tx-analysis.js';
import { bridgeFor } from './bridge.js';
import { forecastCheck, daysInMonth } from './calendar.js';
import { sortByPlan } from './loop.js';
import { ratio, r2OrNull as r2 } from './money.js';

const monthOf = (d) => d.slice(0, 7);
// PURCHASE is money out at a merchant; SPEND also nets refunds and reimbursements (negative amounts).
const PURCHASE = new Set(['spend', 'fee']);
const SPEND = new Set(['spend', 'fee', 'refund', 'reimbursement']);
const mean = (xs) => (xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : null);

/**
 * The months a range covers, oldest first.
 * @param {object} doc the household file
 * @param {object} history what monthHistory returns (summary.history)
 * @param {string|number} range 'all', or how many months ending at doc.currentMonth (the picker offers 3, 6, or 12); a non-numeric or zero range reads as 12
 * @returns {string[]} months 'YYYY-MM'
 */
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

// Counted entries dated in these months. Opening adjustments (written by migration to keep a typed
// actual) are not real purchases and stay out.
const spendEntries = (doc, months) => {
  const set = new Set(months);
  // Money moved to savings (a Roth IRA, say) is not spending.
  const sav = new Set(doc.categories.filter((c) => c.savings).flatMap((c) => c.lines.map((l) => l.id)));
  return counted(doc.transactions).filter((t) => set.has(monthOf(t.date)) && !t.adjust && !sav.has(t.lineId));
};

// ---- By entry or merchant ----

/**
 * Every charge at one merchant in the range, with the price-creep flag when there is one.
 * @param {object} doc the household file
 * @param {string} merchant the merchant key (tx-import.js merchantKey)
 * @param {string[]} months 'YYYY-MM', from trendMonths
 * @returns {{merchant: string, charges: Array<{date: string, amount: number}>, creep: ?object}} dollars per charge;
 *   creep is the detect() priceCreep row ({ from, to, monthly, yearly, date }) or null
 */
export function merchantPrices(doc, merchant, months) {
  const list = spendEntries(doc, months).filter((t) => t.merchant === merchant && t.kind === 'spend' && t.amount > 0).map((t) => ({ date: t.date, amount: t.amount }));
  // Creep is detected over the whole log, not just the range, so a rise seen earlier still shows.
  const creep = detect(doc.transactions).priceCreep.find((p) => p.merchant === merchant) || null;
  return { merchant, charges: list, creep };
}

/**
 * Visits per month at one merchant and the average ticket.
 * @param {object} doc the household file
 * @param {string} merchant the merchant key
 * @param {string[]} months 'YYYY-MM'
 * @returns {Array<{month: string, visits: number, total: number, average: ?number}>} dollars for the month; average is null with no visits
 */
export function merchantVisits(doc, merchant, months) {
  const es = spendEntries(doc, months).filter((t) => t.merchant === merchant && PURCHASE.has(t.kind) && t.amount > 0);
  return months.map((m) => {
    const inM = es.filter((t) => monthOf(t.date) === m);
    const total = r2(inM.reduce((a, t) => a + t.amount, 0));
    return { month: m, visits: inM.length, total, average: inM.length ? r2(total / inM.length) : null };
  });
}

/**
 * The whole range for one merchant, added up from merchantVisits.
 * @param {Array<{visits: number, total: number}>} visits what merchantVisits returns
 * @returns {{visits: number, total: number, averageTicket: ?number}} dollars over the range; averageTicket is null with no visits
 */
export function merchantRange(visits) {
  const count = visits.reduce((a, x) => a + x.visits, 0);
  const total = visits.reduce((a, x) => a + x.total, 0);
  return { visits: count, total, averageTicket: count ? total / count : null };
}

/**
 * Every charge in one category across the range (a dot plot).
 * @param {object} doc the household file
 * @param {string} catId the category id
 * @param {string[]} months 'YYYY-MM'
 * @returns {Array<{date: string, amount: number, label: string}>} dollars per charge, in log order; label is the description or note
 */
export function categoryCharges(doc, catId, months) {
  const cat = doc.categories.find((c) => c.id === catId);
  const ids = new Set(cat ? cat.lines.map((l) => l.id) : []);
  return spendEntries(doc, months).filter((t) => ids.has(t.lineId) && PURCHASE.has(t.kind) && t.amount > 0).map((t) => ({ date: t.date, amount: t.amount, label: t.description || t.note || '' }));
}

/**
 * Merchants with purchases in the range, biggest total first (the focus picker's list).
 * @param {object} doc the household file
 * @param {string[]} months 'YYYY-MM'
 * @returns {string[]} merchant keys
 */
export function merchantsIn(doc, months) {
  const g = {};
  for (const t of spendEntries(doc, months)) if (t.merchant && PURCHASE.has(t.kind)) g[t.merchant] = (g[t.merchant] || 0) + t.amount;
  return Object.entries(g).sort((a, b) => b[1] - a[1]).map(([m]) => m);
}

// ---- By category or line ----

/**
 * One category or line month by month: the actual, the estimate as it stood at each close, the plan,
 * and a rolling 3-month average of the actual, plus the same month a year earlier when it has an actual.
 * @param {object} doc the household file
 * @param {object} history what monthHistory returns
 * @param {{kind: 'category'|'line', id: string}} focus what to follow
 * @param {string[]} months 'YYYY-MM'
 * @returns {{focus: object, rows: Array<{month: string, actual: ?number, estimate: ?number, plan: ?number, rolling3: ?number}>,
 *   sameMonthLastYear: ?{month: string, now: number, then: number, change: number}}} dollars a month; null = not entered
 */
export function monthlySeries(doc, history, focus, months) {
  const rows = months.map((m) => {
    const a = actualsFor(doc, history, m);
    const rec = (doc.months || []).find((x) => x.key === m);
    const plan = planView(doc, m);
    let actual; let estimate = null; let planAmt = null;
    // The estimate comes from the closed month's snapshot, so an open month has none yet.
    if (focus.kind === 'category') {
      actual = a.cats[focus.id] === undefined ? null : a.cats[focus.id];
      if (rec && rec.snapshot.categories[focus.id]) estimate = rec.snapshot.categories[focus.id].estimate;
      if (plan && plan.cats[focus.id]) planAmt = plan.cats[focus.id].amount;
    } else {
      actual = a.lines[focus.id] === undefined ? null : a.lines[focus.id];
      if (rec && rec.snapshot.lines[focus.id]) estimate = rec.snapshot.lines[focus.id].estimate;
      // The plan keys lines under their category, so every category is checked for this line.
      if (plan) for (const c of Object.values(plan.cats)) if (c.lines[focus.id] !== undefined) planAmt = c.lines[focus.id];
    }
    return { month: m, actual, estimate, plan: planAmt };
  });
  // This month and the two before it; a month not entered is skipped, never counted as zero.
  rows.forEach((r, i) => {
    const win = rows.slice(Math.max(0, i - 2), i + 1).map((x) => x.actual).filter((x) => x !== null);
    r.rolling3 = win.length ? r2(mean(win)) : null;
  });
  const last = rows.filter((r) => r.actual !== null).slice(-1)[0] || null;
  // The year-ago month is usually outside the range, so it is read straight from actualsFor then.
  const yearAgo = last ? rows.find((r) => r.month === lastYear(last.month)) || { month: lastYear(last.month), actual: actualsFor(doc, history, lastYear(last.month))[focus.kind === 'category' ? 'cats' : 'lines'][focus.id] ?? null } : null;
  return { focus, rows, sameMonthLastYear: last && yearAgo && yearAgo.actual !== null && yearAgo.actual !== undefined ? { month: last.month, now: last.actual, then: yearAgo.actual, change: r2(last.actual - yearAgo.actual) } : null };
}

function lastYear(m) { return (Number(m.slice(0, 4)) - 1) + m.slice(4); }

/**
 * Spending categories by month: a heatmap and one sparkline each.
 * @param {object} doc the household file
 * @param {object} history what monthHistory returns
 * @param {string[]} months 'YYYY-MM'
 * @returns {{months: string[], rows: Array<{id: string, name: string, values: Array<?number>, total: number}>, max: number, top: ?object}}
 *   dollars a month; a value is null where not entered; max is the biggest single cell (the heatmap's scale); top is the row
 *   with the biggest total over the range
 */
export function categoryGrid(doc, history, months) {
  const cats = doc.categories.filter((c) => c.state !== 'archived' && !c.savings);
  const cols = months.map((m) => actualsFor(doc, history, m));
  // A category blank or zero across the whole range is left out. The total only ranks rows, so a
  // month not entered adds nothing to it; the cells themselves keep their null.
  const rows = cats.map((c) => ({ id: c.id, name: c.name, values: cols.map((a) => (a.cats[c.id] === undefined ? null : a.cats[c.id])) })).filter((r) => r.values.some((v) => v !== null && v !== 0))
    .map((r) => ({ ...r, total: r.values.reduce((a, v) => a + (v || 0), 0) }));
  const all = rows.flatMap((r) => r.values).filter((v) => v !== null);
  // The darkest row: the biggest total over the range (a tie keeps the category order).
  const top = rows.slice().sort((a, b) => b.total - a.total)[0] || null;
  return { months, rows, max: all.length ? Math.max(...all) : 0, top };
}

// ---- By time period ----

/**
 * Month over month: last month's spending total, each category's change, this month's total.
 * @param {object} doc the household file
 * @param {object} history what monthHistory returns
 * @param {string} month 'YYYY-MM', the later of the two months
 * @returns {{from: string, to: string, before: ?number, after: ?number, steps: Array<{id: string, name: string, change: number}>, change: number}}
 *   dollars a month; steps biggest change first, under half a cent dropped; before and after are null when a month has no actuals
 */
export function monthOverMonth(doc, history, month) {
  const prev = prevMonthKey(month);
  const a = actualsFor(doc, history, prev);
  const b = actualsFor(doc, history, month);
  const cats = doc.categories.filter((c) => !c.savings);
  // A category entered in only one of the two months steps from or to zero, so the steps add up to the change in total.
  const steps = cats.map((c) => ({ id: c.id, name: c.name, change: r2((b.cats[c.id] || 0) - (a.cats[c.id] || 0)) })).filter((x) => Math.abs(x.change) >= 0.005)
    .sort((x, y) => Math.abs(y.change) - Math.abs(x.change));
  return { from: prev, to: month, before: r2(a.spending), after: r2(b.spending), steps, change: r2((b.spending || 0) - (a.spending || 0)) };
}

/**
 * The month-over-month steps as a waterfall: the first `limit` steps in order, each with its running
 * start and end, and the rest folded into one step.
 * @param {object} mom what monthOverMonth returns
 * @param {number} [limit=8] how many steps get a bar of their own
 * @returns {{before: number, steps: Array<{id: string, name: string, change: number, from: number, to: number}>,
 *   rest: ?{change: number, from: number, to: number}, after: number}} dollars a month; rest is null when nothing is folded;
 *   a month with no total draws from 0
 */
export function waterfallSteps(mom, limit = 8) {
  const steps = [];
  let run = mom.before || 0;
  for (const x of mom.steps.slice(0, limit)) { steps.push({ id: x.id, name: x.name, change: x.change, from: run, to: run + x.change }); run += x.change; }
  let rest = null;
  if (mom.steps.length > limit) { const change = mom.steps.slice(limit).reduce((a, x) => a + x.change, 0); rest = { change, from: run, to: run + change }; run += change; }
  return { before: mom.before || 0, steps, rest, after: mom.after || 0 };
}

/**
 * Cumulative spending by day: this month, the same days last month, and the plan spread evenly.
 * @param {object} doc the household file
 * @param {string} month 'YYYY-MM'
 * @param {?number} planSpending the month's planned spending in dollars (summary.totals.planSpending); null without a plan
 * @returns {{month: string, days: number, now: number[], last: number[], plan: ?number[]}} dollars, one running total per day of the month
 */
export function pacing(doc, month, planSpending) {
  const byDay = (m) => {
    const n = daysInMonth(m);
    const out = new Array(n).fill(0);
    // Refunds and reimbursements (negative amounts) pull the line back down. One-offs stay out, as in
    // the budget, and a purchase someone will pay back counts only the client's share (amount - owed).
    for (const t of spendEntries(doc, [m])) if (SPEND.has(t.kind) && !t.oneOff) out[Number(t.date.slice(8)) - 1] += t.amount - (t.owed || 0);
    let run = 0;
    return out.map((x) => { run += x; return r2(run); });
  };
  const n = daysInMonth(month);
  return { month, days: n, now: byDay(month), last: byDay(prevMonthKey(month)), plan: planSpending === null ? null : Array.from({ length: n }, (_, i) => r2((planSpending * (i + 1)) / n)) };
}

/**
 * Average spending by day of the month over the range.
 * @param {object} doc the household file
 * @param {string[]} months 'YYYY-MM'
 * @returns {Array<{day: number, average: number}>} days 1 to 31, dollars: the sum on that day divided by the months in the range
 */
export function dayOfMonth(doc, months) {
  const sums = new Array(31).fill(0);
  for (const t of spendEntries(doc, months)) if (SPEND.has(t.kind) && !t.oneOff) sums[Number(t.date.slice(8)) - 1] += t.amount - (t.owed || 0);
  // Every day divides by the whole range, so the 29th to 31st read low when short months are in it.
  return sums.map((s, i) => ({ day: i + 1, average: r2(s / months.length) }));
}

// ---- Small stats ----

/**
 * Fixed lines plus debt minimums, and their share of take-home.
 * @param {object} totals budget totals (summary.totals): fixed and takeHome in dollars a month
 * @returns {{amount: number, share: ?number}} dollars a month and a ratio 0 to 1; share is null without take-home
 */
export function fixedFloor(totals) {
  return { amount: r2(totals.fixed), share: ratio(totals.fixed, totals.takeHome) };
}

/**
 * The categories that swing most: standard deviation over the mean of the monthly actuals.
 * @param {object} grid what categoryGrid returns
 * @param {number} [n=3] how many to return
 * @returns {Array<{id: string, name: string, mean: number, sd: number, swing: number}>} mean and sd in dollars a month, swing a
 *   ratio (sd / mean); biggest swing first; needs two months with actuals and some swing
 */
export function volatility(grid, n = 3) {
  return grid.rows.map((r) => {
    const xs = r.values.filter((v) => v !== null);
    const m = mean(xs);
    if (xs.length < 2 || !m) return null;
    // Population deviation (divide by the count, not count - 1): these are all the months there are, not a sample.
    const sd = Math.sqrt(xs.reduce((a, x) => a + (x - m) * (x - m), 0) / xs.length);
    return { id: r.id, name: r.name, mean: r2(m), sd: r2(sd), swing: sd / m };
  }).filter((v) => v && v.sd > 0).sort((a, b) => b.swing - a.swing).slice(0, n);
}

// A snapshot's spending total: savings categories out, a category not entered adds nothing.
const totalOf = (snap) => Object.values(snap.categories).filter((c) => !c.savings).reduce((a, c) => (c.actual === null ? a : a + c.actual), 0);

/**
 * Spending trend vs take-home trend: change per month from the first to the last closed month in the range.
 * @param {object} doc the household file
 * @param {object} history what monthHistory returns
 * @param {string[]} months 'YYYY-MM'
 * @returns {?{from: string, to: string, spendingPerMonth: number, takeHomePerMonth: number}} dollars a month, per month (a slope,
 *   not a total); null with fewer than two closed months that have spending
 */
export function lifestyleCreep(doc, history, months) {
  // Closed months only: take-home comes from the locked snapshot, so both lines use the same months.
  const pts = months.map((m) => ({ m, a: actualsFor(doc, history, m), rec: (doc.months || []).find((x) => x.key === m) })).filter((p) => p.a.spending !== null && p.rec);
  if (pts.length < 2) return null;
  const first = pts[0];
  const last = pts[pts.length - 1];
  const steps = pts.length - 1;
  // Endpoints only, not a fitted line: (last - first) / the months between them.
  return { from: first.m, to: last.m, spendingPerMonth: r2((last.a.spending - first.a.spending) / steps), takeHomePerMonth: r2(((last.rec.snapshot.takeHome || 0) - (first.rec.snapshot.takeHome || 0)) / steps) };
}

// Off by a factor with the direction dropped: 1.25 whether actual ran 25% over the estimate or the
// estimate ran 25% over actual. Null when either side is missing or zero.
const offBy = (a, e) => { const r = ratio(a, e); return r === null || r <= 0 ? null : r2(r >= 1 ? r : 1 / r); };

/**
 * How far off the estimates were, month by month (closed months only).
 * @param {object} doc the household file
 * @param {string[]} months 'YYYY-MM'
 * @returns {Array<{month: string, offBy: ?number}>} offBy is a factor of 1 or more (1 = exact, 1.25 = 25% off either way);
 *   null when a month's actual or estimate total is missing or zero
 */
export function learningCurve(doc, months) {
  return months.map((m) => (doc.months || []).find((x) => x.key === m)).filter(Boolean).map((rec) => {
    const cs = Object.values(rec.snapshot.categories).filter((c) => !c.savings);
    const e = cs.reduce((a, c) => (c.estimate === null ? a : a + c.estimate), 0);
    return { month: rec.key, offBy: offBy(totalOf(rec.snapshot), e) };
  });
}

/**
 * Lines on plan or better, month by month: the saved review's split when the month is closed, else recomputed.
 * @param {object} doc the household file
 * @param {object} summary what buildSummary returns (its history is used)
 * @param {string[]} months 'YYYY-MM'
 * @returns {Array<{month: string, rate: ?number, hits: number, of: number}>} rate a ratio 0 to 1 (hits / of); null with no plan
 *   or no compared lines
 */
export function planHitRate(doc, summary, months) {
  return months.map((m) => {
    const rec = (doc.months || []).find((x) => x.key === m);
    let g = rec && rec.snapshot.review ? rec.snapshot.review.vsPlan.lines : null;
    if (!g) {
      const plan = planView(doc, m);
      if (!plan) return { month: m, rate: null, hits: 0, of: 0 };
      const a = actualsFor(doc, summary.history, m);
      // Savings and debt categories stay out, as in the review. Lines missing a plan or an actual land
      // in sortByPlan's notCompared and are not counted either way.
      g = sortByPlan(Object.values(plan.cats).filter((c) => !c.savings && !c.isDebt).flatMap((c) => Object.entries(c.lines).map(([id, p]) => ({ id, plan: p, actual: a.lines[id] === undefined ? null : a.lines[id] }))));
    }
    const of = g.better.length + g.onPlan.length + g.worse.length;
    return { month: m, hits: g.better.length + g.onPlan.length, of, rate: of ? (g.better.length + g.onPlan.length) / of : null };
  });
}

/**
 * Cash the budget does not explain over the range: the bridge's leftover, ATM cash, and Venmo, Zelle
 * or Cash App with no line.
 * @param {object} doc the household file
 * @param {object} income the income summary (summary.income), for the bridge
 * @param {string[]} months 'YYYY-MM'
 * @returns {{bridge: number, months: number, atm: number, p2p: number}} dollars over the range; months is how many had a bridge leftover
 */
export function notExplained(doc, income, months) {
  const es = spendEntries(doc, months);
  // A month whose bridge stops at missing balances has no leftover and is skipped, not counted as zero.
  const bridges = months.map((m) => bridgeFor(doc, income, m)).filter((b) => b.unexplained !== null);
  // Found by the description: there is no 'cash' kind. Unmapped payments to people are the ones the budget cannot place.
  const atm = es.filter((t) => /\bATM\b|CASH WITHDRAWAL/i.test(t.description || t.merchant || '') && t.amount > 0);
  const p2p = es.filter((t) => !t.lineId && /VENMO|ZELLE|CASH APP/i.test(t.description || t.merchant || '') && t.amount > 0);
  return { bridge: r2(bridges.reduce((a, b) => a + b.unexplained, 0)), months: bridges.length, atm: r2(atm.reduce((a, t) => a + t.amount, 0)), p2p: r2(p2p.reduce((a, t) => a + t.amount, 0)) };
}

/**
 * Charged on cards vs paid to cards from cash, month by month.
 * @param {object} doc the household file
 * @param {string[]} months 'YYYY-MM'
 * @returns {Array<{month: string, charged: number, paid: number, gap: number}>} dollars for the month; gap = charged - paid,
 *   positive when the balance grew
 */
export function cardFloat(doc, months) {
  const kind = Object.fromEntries((doc.accounts || []).map((a) => [a.id, a.type]));
  return months.map((m) => {
    const es = spendEntries(doc, [m]);
    const charged = r2(es.filter((t) => kind[t.account] === 'credit-card' && PURCHASE.has(t.kind) && t.amount > 0).reduce((a, t) => a + t.amount, 0));
    // A payment shows twice when both statements are imported (out of checking, onto the card); only the cash side counts.
    const paid = r2(es.filter((t) => t.kind === 'card-payment' && t.amount > 0 && kind[t.account] !== 'credit-card').reduce((a, t) => a + t.amount, 0));
    return { month: m, charged, paid, gap: r2(charged - paid) };
  });
}

/**
 * 1099 and side income from the log: the low, average, and high month over the range.
 * @param {object} doc the household file
 * @param {string[]} months 'YYYY-MM'
 * @returns {?{low: number, average: number, high: number, months: number}} dollars a month; null with no 1099 or side
 *   income source, or nothing logged for one in the range
 */
export function incomeStability(doc, months) {
  const ids = new Set(doc.income.filter((i) => i.type === '1099' || i.type === 'side').map((i) => i.id));
  if (!ids.size) return null;
  // Income entries are negative (money in), so the sign flips to read as dollars received.
  const per = months.map((m) => r2(-spendEntries(doc, [m]).filter((t) => t.kind === 'income' && ids.has(t.incomeId)).reduce((a, t) => a + t.amount, 0)));
  const got = per.filter((x) => x > 0);
  if (!got.length) return null;
  // Months with nothing received stay in: a dry month is the point of the stat.
  return { low: Math.min(...per), average: r2(mean(per)), high: Math.max(...per), months: per.length };
}

/**
 * Small, frequent charges as a yearly cost: merchants averaging $20 or less a charge, twice a month or more.
 * @param {object} doc the household file
 * @param {string[]} months 'YYYY-MM'
 * @param {number} [n=3] how many to return
 * @returns {Array<{merchant: string, count: number, average: number, yearly: number}>} average per charge in dollars;
 *   yearly = the range's monthly average x 12; biggest yearly first
 */
export function annualizedHabits(doc, months, n = 3) {
  const g = {};
  for (const t of spendEntries(doc, months)) {
    if (!t.merchant || !PURCHASE.has(t.kind) || t.amount <= 0) continue;
    const x = (g[t.merchant] = g[t.merchant] || { merchant: t.merchant, count: 0, total: 0 });
    x.count += 1;
    x.total += t.amount;
  }
  // Twice a month is measured over the whole range (count >= 2 x months), not month by month.
  return Object.values(g).filter((x) => x.total / x.count <= 20 && x.count >= 2 * months.length)
    .map((x) => ({ merchant: x.merchant, count: x.count, average: r2(x.total / x.count), yearly: r2((x.total / months.length) * 12) }))
    .sort((a, b) => b.yearly - a.yearly).slice(0, n);
}

/**
 * Months with a saved cash forecast, and what happened (calendar.js forecastCheck).
 * @param {object} doc the household file
 * @param {string[]} months 'YYYY-MM'
 * @returns {Array<{month: string, predicted: number, actual: ?number, diff: ?number}>} dollars; months with no forecast are left out
 */
export function forecastAccuracy(doc, months) {
  return months.map((m) => forecastCheck(doc, m)).filter((f) => f.predicted !== null);
}

/**
 * Share of spending that came from the log, month by month, from the saved reviews.
 * @param {object} doc the household file
 * @param {string[]} months 'YYYY-MM'
 * @returns {Array<{month: string, share: ?number}>} a ratio 0 to 1 (from the log / (from the log + typed)); closed months
 *   with a review only
 */
export function trackingByMonth(doc, months) {
  return months.map((m) => (doc.months || []).find((x) => x.key === m)).filter((rec) => rec && rec.snapshot.review).map((rec) => ({ month: rec.key, share: rec.snapshot.review.tracking.share }));
}
