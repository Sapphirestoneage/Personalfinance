// What the transactions say: actuals per line for a month (with double
// counting removed), detections (subscriptions, duplicates, free trials that
// converted, price creep, fees, buy now pay later), and chart data.

import { ratio } from './money.js';
import { counted } from './log.js';

const COUNTS = new Set(['spend', 'fee', 'refund', 'reimbursement']);
const PURCHASE = new Set(['spend', 'fee']);
const r2 = (x) => Math.round(x * 100) / 100 + 0;
const monthOf = (d) => d.slice(0, 7);
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

export function txMonths(txs) {
  return [...new Set(txs.map((t) => monthOf(t.date)))].sort();
}

// Card payments, transfers, and income are not spending. Refunds and
// reimbursements (Venmo, Zelle, work) reduce the line they are mapped to;
// unmapped ones change nothing.
export function actualsFromTransactions(txs, month) {
  const byLine = {};
  const counts = {};
  let unmapped = 0;
  let unmappedCount = 0;
  for (const t of counted(txs)) {
    if (monthOf(t.date) !== month || !COUNTS.has(t.kind)) continue;
    if (!t.lineId) {
      if (PURCHASE.has(t.kind)) { unmapped += t.amount; unmappedCount += 1; }
      continue;
    }
    byLine[t.lineId] = (byLine[t.lineId] || 0) + t.amount;
    counts[t.lineId] = (counts[t.lineId] || 0) + 1;
  }
  for (const k of Object.keys(byLine)) byLine[k] = r2(byLine[k]);
  return { month, byLine, counts, unmapped: r2(unmapped), unmappedCount };
}

// Compare with what was typed, so the client can confirm before anything is replaced.
export function actualsProposal(model, txs, month) {
  const a = actualsFromTransactions(txs, month);
  const rows = [];
  for (const c of model.categories) {
    for (const l of c.lines) {
      if (a.byLine[l.id] === undefined) continue;
      rows.push({ lineId: l.id, name: l.name, category: c.name, typed: l.actual, fromTransactions: a.byLine[l.id], count: a.counts[l.id], changes: l.actual !== a.byLine[l.id] });
    }
  }
  return { ...a, rows };
}

function groupByMerchant(txs) {
  const g = {};
  for (const t of txs) (g[t.merchant] = g[t.merchant] || []).push(t);
  for (const k of Object.keys(g)) g[k].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return g;
}

const TRIAL_MAX = 1.0;
const SUB_TOLERANCE = 0.2;

// Monthly subscriptions: in 2+ months, at most one charge a month, 25 to 35
// days apart, amounts within 20% of each other. BNPL payments are excluded
// (they are flagged separately). Trials of $1 or less are ignored here.
export function detect(all) {
  const txs = counted(all);
  const purchases = txs.filter((t) => t.kind === 'spend');
  const groups = groupByMerchant(purchases);
  const subscriptions = [];
  const priceCreep = [];
  const trials = [];
  const duplicates = [];
  for (const [merchant, list] of Object.entries(groups)) {
    // duplicates: same amount within a day
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1];
      const b = list[i];
      if (a.amount === b.amount && a.amount > 0 && Math.abs(daysBetween(a.date, b.date)) <= 1 && !(a.notDuplicate && b.notDuplicate)) duplicates.push({ merchant, date: b.date, amount: b.amount, ids: [a.id, b.id] });
    }
    // free trial that converted
    const first = list[0];
    if (first.amount <= TRIAL_MAX) {
      const paid = list.find((t) => t.amount > TRIAL_MAX && daysBetween(first.date, t.date) <= 45);
      if (paid) trials.push({ merchant, trialDate: first.date, trialAmount: first.amount, paidDate: paid.date, amount: paid.amount, yearly: r2(paid.amount * 12) });
    }
    if (list.some((t) => t.bnpl)) continue;
    const charges = list.filter((t) => t.amount > TRIAL_MAX);
    const months = charges.map((t) => monthOf(t.date));
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
    subscriptions.push({ merchant, amount: last.amount, yearly: r2(last.amount * 12), since: charges[0].date, lineId: last.lineId });
    if (last.amount > prev.amount * 1.005) {
      priceCreep.push({ merchant, from: prev.amount, to: last.amount, monthly: r2(last.amount - prev.amount), yearly: r2((last.amount - prev.amount) * 12), date: last.date });
    }
  }
  // converted trials count as subscriptions too
  for (const t of trials) {
    if (!subscriptions.some((s) => s.merchant === t.merchant)) subscriptions.push({ merchant: t.merchant, amount: t.amount, yearly: t.yearly, since: t.paidDate, fromTrial: true });
  }
  subscriptions.sort((a, b) => b.yearly - a.yearly);
  const fees = txs.filter((t) => t.kind === 'fee');
  const bnpl = txs.filter((t) => t.bnpl && t.kind === 'spend');
  return {
    subscriptions, subscriptionsYearly: r2(subscriptions.reduce((a, s) => a + s.yearly, 0)),
    duplicates, trials, priceCreep,
    fees, feesTotal: r2(fees.reduce((a, t) => a + t.amount, 0)),
    bnpl, bnplTotal: r2(bnpl.reduce((a, t) => a + t.amount, 0))
  };
}

// Spending by merchant, net of refunds. Top 5 and their share.
export function topMerchants(txs, n = 5) {
  const totals = {};
  for (const t of counted(txs)) {
    if (!(PURCHASE.has(t.kind) || t.kind === 'refund')) continue;
    totals[t.merchant] = (totals[t.merchant] || 0) + t.amount;
  }
  const total = Object.values(totals).reduce((a, x) => a + x, 0);
  const rows = Object.entries(totals).map(([merchant, amount]) => ({ merchant, amount: r2(amount), share: ratio(amount, total) }))
    .sort((a, b) => b.amount - a.amount);
  const top = rows.slice(0, n);
  return { total: r2(total), top, topShare: ratio(top.reduce((a, x) => a + x.amount, 0), total) };
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Purchases (not refunds) by day of week, Monday first, plus the weekend split.
export function weekdaySpending(txs) {
  const sums = [0, 0, 0, 0, 0, 0, 0];
  for (const t of counted(txs)) {
    if (!PURCHASE.has(t.kind)) continue;
    const [y, m, d] = t.date.split('-').map(Number);
    sums[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] += t.amount;
  }
  const order = [1, 2, 3, 4, 5, 6, 0];
  const total = sums.reduce((a, x) => a + x, 0);
  const weekend = sums[0] + sums[6];
  const weekday = total - weekend;
  return {
    days: order.map((i) => ({ label: DAYS[i], amount: r2(sums[i]), share: ratio(sums[i], total) })),
    total: r2(total), weekend: r2(weekend), weekday: r2(weekday),
    weekendShare: ratio(weekend, total),
    perWeekendDay: r2(weekend / 2), perWeekday: r2(weekday / 5)
  };
}

// Per merchant: how often and how big (small-and-frequent vs big-and-rare).
export function sizeVsCount(txs) {
  const g = {};
  for (const t of counted(txs)) {
    if (!PURCHASE.has(t.kind) || t.amount <= 0) continue;
    const x = (g[t.merchant] = g[t.merchant] || { merchant: t.merchant, count: 0, total: 0 });
    x.count += 1;
    x.total += t.amount;
  }
  return Object.values(g).map((x) => ({ merchant: x.merchant, count: x.count, total: r2(x.total), average: r2(x.total / x.count) }))
    .sort((a, b) => b.total - a.total);
}
