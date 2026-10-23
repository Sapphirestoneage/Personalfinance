// What the transactions say: actuals per line for a month (with double counting removed),
// detections (subscriptions, duplicates, free trials that converted, price creep, fees, buy now
// pay later), and chart data (top merchants, day of week, size vs count). Dollars, rounded to the
// cent: a month's actuals are dollars for that month; a subscription's yearly figure is dollars a
// year. Depends on money.js (ratio, r2) and log.js (counted: no pending or deleted entries).

import { ratio, r2 } from './money.js';
import { counted } from './log.js';

// COUNTS: kinds that land on a budget line (refunds and reimbursements are negative and net out).
// PURCHASE: money out at a merchant.
const COUNTS = new Set(['spend', 'fee', 'refund', 'reimbursement']);
const PURCHASE = new Set(['spend', 'fee']);
const monthOf = (d) => d.slice(0, 7);
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

/**
 * The months that have at least one entry, oldest first.
 * @param {object[]} txs log entries
 * @returns {string[]} 'YYYY-MM'
 */
export function txMonths(txs) {
  return [...new Set(txs.map((t) => monthOf(t.date)))].sort();
}

/**
 * One month's actuals per line from the log. Card payments, transfers, and income are not spending.
 * Refunds and reimbursements (Venmo, Zelle, work) reduce the line they are mapped to; unmapped ones
 * change nothing. A purchase someone will pay back counts only the client's share (amount - owed), and
 * the reimbursement that settles it then changes nothing. A one-off entry is listed apart, like a one-off actual (S-088).
 * @param {object[]} txs log entries (doc.transactions); pending and deleted ones are dropped here
 * @param {string} month 'YYYY-MM'
 * @returns {{month: string, byLine: Object<string, number>, counts: Object<string, number>, unmapped: number, unmappedCount: number}}
 *   dollars for the month per line id, entries per line, and purchases with no line (their total and count)
 */
export function actualsFromTransactions(txs, month) {
  const byLine = {};
  const counts = {};
  let unmapped = 0;
  let unmappedCount = 0;
  for (const t of counted(txs)) {
    if (monthOf(t.date) !== month || !COUNTS.has(t.kind) || t.oneOff || (t.kind === 'reimbursement' && t.settles))
      continue;
    if (!t.lineId) {
      // Only purchases count as unmapped money: an unmapped refund has no line to reduce.
      if (PURCHASE.has(t.kind)) {
        unmapped += t.amount;
        unmappedCount += 1;
      }
      continue;
    }
    byLine[t.lineId] = (byLine[t.lineId] || 0) + t.amount - (t.owed || 0);
    counts[t.lineId] = (counts[t.lineId] || 0) + 1;
  }
  for (const k of Object.keys(byLine)) byLine[k] = r2(byLine[k]);
  return { month, byLine, counts, unmapped: r2(unmapped), unmappedCount };
}

function groupByMerchant(txs) {
  const g = {};
  for (const t of txs) (g[t.merchant] = g[t.merchant] || []).push(t);
  for (const k of Object.keys(g)) g[k].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return g;
}

// A first charge of $1 or less reads as a trial. Subscription charges may differ by up to 20% month
// to month (tax, a small price change) and still match.
const TRIAL_MAX = 1.0;
const SUB_TOLERANCE = 0.2;

/**
 * Patterns in the whole log. Monthly subscriptions: charges in 2+ months, at most one a month, 25 to
 * 35 days apart, amounts within 20% of each other. BNPL merchants are excluded (they are flagged
 * separately). Trials of $1 or less are ignored for the subscription test.
 * @param {object[]} all log entries (doc.transactions)
 * @returns {{subscriptions: object[], subscriptionsYearly: number, duplicates: object[], trials: object[], priceCreep: object[],
 *   fees: object[], feesTotal: number, bnpl: object[], bnplTotal: number}} amounts per charge in dollars; yearly = monthly x 12;
 *   subscriptions biggest yearly first
 */
export function detect(all) {
  const txs = counted(all);
  const purchases = txs.filter((t) => t.kind === 'spend');
  const groups = groupByMerchant(purchases);
  const subscriptions = [];
  const priceCreep = [];
  const trials = [];
  const duplicates = [];
  for (const [merchant, list] of Object.entries(groups)) {
    // duplicates: same amount within a day. Flagged, never removed (a double charge can be real),
    // until the coach marks the pair as not duplicates.
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1];
      const b = list[i];
      if (
        a.amount === b.amount &&
        a.amount > 0 &&
        Math.abs(daysBetween(a.date, b.date)) <= 1 &&
        !(a.notDuplicate && b.notDuplicate)
      )
        duplicates.push({ merchant, date: b.date, amount: b.amount, ids: [a.id, b.id] });
    }
    // free trial that converted: a first charge of $1 or less, then a real one within 45 days.
    // The yearly cost assumes it bills monthly from there.
    const first = list[0];
    if (first.amount <= TRIAL_MAX) {
      const paid = list.find((t) => t.amount > TRIAL_MAX && daysBetween(first.date, t.date) <= 45);
      if (paid)
        trials.push({
          merchant,
          trialDate: first.date,
          trialAmount: first.amount,
          paidDate: paid.date,
          amount: paid.amount,
          yearly: r2(paid.amount * 12)
        });
    }
    // Installments look like a subscription (equal, monthly) but end; they are listed as BNPL instead.
    if (list.some((t) => t.bnpl)) continue;
    const charges = list.filter((t) => t.amount > TRIAL_MAX);
    const months = charges.map((t) => monthOf(t.date));
    // Fewer than two months is not a pattern; two charges in one month is not monthly.
    if (new Set(months).size < 2 || new Set(months).size !== months.length) continue;
    let ok = true;
    for (let i = 1; i < charges.length; i++) {
      const gap = daysBetween(charges[i - 1].date, charges[i].date);
      const change = Math.abs(charges[i].amount - charges[i - 1].amount) / charges[i - 1].amount;
      if (gap < 25 || gap > 35 || change > SUB_TOLERANCE) ok = false;
    }
    if (!ok) continue;
    const last = charges[charges.length - 1];
    const prev = charges[charges.length - 2];
    subscriptions.push({
      merchant,
      amount: last.amount,
      yearly: r2(last.amount * 12),
      since: charges[0].date,
      lineId: last.lineId
    });
    // Half a percent of slack so a rounding cent does not read as a price rise.
    if (last.amount > prev.amount * 1.005) {
      priceCreep.push({
        merchant,
        from: prev.amount,
        to: last.amount,
        monthly: r2(last.amount - prev.amount),
        yearly: r2((last.amount - prev.amount) * 12),
        date: last.date
      });
    }
  }
  // converted trials count as subscriptions too
  for (const t of trials) {
    if (!subscriptions.some((s) => s.merchant === t.merchant))
      subscriptions.push({
        merchant: t.merchant,
        amount: t.amount,
        yearly: t.yearly,
        since: t.paidDate,
        fromTrial: true
      });
  }
  subscriptions.sort((a, b) => b.yearly - a.yearly);
  const fees = txs.filter((t) => t.kind === 'fee');
  const bnpl = txs.filter((t) => t.bnpl && t.kind === 'spend');
  return {
    subscriptions,
    subscriptionsYearly: r2(subscriptions.reduce((a, s) => a + s.yearly, 0)),
    duplicates,
    trials,
    priceCreep,
    fees,
    feesTotal: r2(fees.reduce((a, t) => a + t.amount, 0)),
    bnpl,
    bnplTotal: r2(bnpl.reduce((a, t) => a + t.amount, 0))
  };
}

/**
 * Spending by merchant, net of refunds: the top n and their share of all merchant spending.
 * @param {object[]} txs log entries
 * @param {number} [n=5] how many
 * @returns {{total: number, top: Array<{merchant: string, amount: number, share: ?number}>, topShare: ?number}} dollars over the
 *   whole log; shares are ratios 0 to 1 of the merchant total (not of take-home)
 */
export function topMerchants(txs, n = 5) {
  const totals = {};
  for (const t of counted(txs)) {
    // A refund is the merchant giving money back, so it nets out; a reimbursement is someone else
    // paying and says nothing about the merchant. Opening adjustments have no merchant to speak of.
    if (!(PURCHASE.has(t.kind) || t.kind === 'refund') || !t.merchant || t.adjust) continue;
    totals[t.merchant] = (totals[t.merchant] || 0) + t.amount;
  }
  const total = Object.values(totals).reduce((a, x) => a + x, 0);
  const rows = Object.entries(totals)
    .map(([merchant, amount]) => ({ merchant, amount: r2(amount), share: ratio(amount, total) }))
    .sort((a, b) => b.amount - a.amount);
  const top = rows.slice(0, n);
  return {
    total: r2(total),
    top,
    topShare: ratio(
      top.reduce((a, x) => a + x.amount, 0),
      total
    )
  };
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Purchases (not refunds) by day of week, Monday first, plus the weekend split.
 * @param {object[]} txs log entries
 * @returns {{days: Array<{label: string, amount: number, share: ?number}>, total: number, weekend: number, weekday: number,
 *   weekendShare: ?number, perWeekendDay: number, perWeekday: number}} dollars over the whole log; shares are ratios 0 to 1;
 *   perWeekendDay = weekend / 2 and perWeekday = weekday / 5 (an average day of each kind, not per calendar day)
 */
export function weekdaySpending(txs) {
  const sums = [0, 0, 0, 0, 0, 0, 0];
  for (const t of counted(txs)) {
    if (!PURCHASE.has(t.kind)) continue;
    // The weekday comes from the date alone, in UTC, so a browser's time zone cannot shift a purchase to the day before.
    const [y, m, d] = t.date.split('-').map(Number);
    sums[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] += t.amount;
  }
  const order = [1, 2, 3, 4, 5, 6, 0];
  const total = sums.reduce((a, x) => a + x, 0);
  const weekend = sums[0] + sums[6];
  const weekday = total - weekend;
  return {
    days: order.map((i) => ({ label: DAYS[i], amount: r2(sums[i]), share: ratio(sums[i], total) })),
    total: r2(total),
    weekend: r2(weekend),
    weekday: r2(weekday),
    weekendShare: ratio(weekend, total),
    perWeekendDay: r2(weekend / 2),
    perWeekday: r2(weekday / 5)
  };
}

/**
 * Per merchant: how often and how big (small-and-frequent vs big-and-rare).
 * @param {object[]} txs log entries
 * @returns {Array<{merchant: string, count: number, total: number, average: number}>} dollars over the whole log, biggest total first
 */
export function sizeVsCount(txs) {
  const g = {};
  for (const t of counted(txs)) {
    if (!PURCHASE.has(t.kind) || t.amount <= 0) continue;
    const x = (g[t.merchant] = g[t.merchant] || { merchant: t.merchant, count: 0, total: 0 });
    x.count += 1;
    x.total += t.amount;
  }
  return Object.values(g)
    .map((x) => ({ merchant: x.merchant, count: x.count, total: r2(x.total), average: r2(x.total / x.count) }))
    .sort((a, b) => b.total - a.total);
}
