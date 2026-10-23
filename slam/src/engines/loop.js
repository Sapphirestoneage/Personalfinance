// The monthly loop on screen (S-089): Plan, Track, Review for the month being
// worked on; the month-end checklist; and the month in review, computed at
// close and saved inside the locked snapshot so it never changes.
// Dollars for the month, rounded to the cent where summed. Depends on plan.js (plans and the review
// table), log.js (counted entries), calendar.js (scheduled items), balances.js, bridge.js,
// tx-analysis.js, happiness.js, pareto.js, income-month.js, debts.js, and money.js.

import { planView, actualsFor, prevMonthKey, reviewSummary } from './plan.js';
import { counted, isPending, monthLog } from './log.js';
import { cashCalendar, forecastCheck } from './calendar.js';
import { balancesFor, kindOf, lastUpdated } from './balances.js';
import { bridgeFor } from './bridge.js';
import { detect, topMerchants } from './tx-analysis.js';
import { happySpendShare } from './happiness.js';
import { ratio, minus, r2OrNull as r2 } from './money.js';
import { paretoLevels } from './pareto.js';
import { incomeMonth } from './income-month.js';
import { promoEnded } from './debts.js';

const monthOf = (d) => d.slice(0, 7);
const whole = (x) => '$' + Math.round(Math.abs(x)).toLocaleString('en-US');
const exactMoney = (x) => '$' + Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/**
 * The last day of a month.
 * @param {string} m a month 'YYYY-MM'
 * @returns {string} a date 'YYYY-MM-DD'
 */
const lastDay = (m) => { const [y, mm] = m.split('-').map(Number); return m + '-' + String(new Date(Date.UTC(y, mm, 0)).getUTCDate()).padStart(2, '0'); };

/**
 * The plan for a month: not started, started, or reviewed (every line ticked off).
 * @param {object} doc the household file
 * @param {object} summary what buildSummary returns
 * @param {string} month 'YYYY-MM'
 * @returns {string} 'not started' | 'started' | 'reviewed'
 */
export function planState(doc, summary, month) {
  const p = (doc.plans || {})[month];
  if (!p) return 'not started';
  // Reviewed means every plannable line in the review table (the month before, next to this plan) is
  // ticked off; a plan with nothing plannable is only started.
  const r = reviewSummary(doc, summary, prevMonthKey(month), month);
  return r.checklist.total && r.checklist.reviewed === r.checklist.total ? 'reviewed' : 'started';
}

/**
 * Lines with a plan or an estimate (on the line or its category) and nothing yet this month.
 * @param {object} summary what buildSummary returns
 * @returns {Array<{id: string, name: string, catId: string, category: string}>} the empty lines
 */
export function gapLines(summary) {
  const out = [];
  for (const c of summary.model.categories) {
    // Debt payments are computed, "doesn't apply" needs nothing, and the single total has no lines to fill.
    if (c.isDebt || c.notForMe || c.isEverything) continue;
    const pc = summary.plan ? summary.plan.cats[c.id] : null;
    // Expected: a number on the line, a category-level estimate, or a plan amount (the category planned as
    // one number, or this line planned). Empty: no actual and no actual status at all, so a typed 0 or
    // "doesn't apply" is an answer, and a premium covered elsewhere is not a gap.
    const expected = (l) => l.estimate !== null || (c.estimate.from === 'category' && c.estimate.amount !== null) || (pc && (pc.byCategory ? pc.amount !== null : pc.lines[l.id] !== null && pc.lines[l.id] !== undefined));
    for (const l of c.lines) if (l.actual === null && l.status.actual === null && !l.covered && expected(l)) out.push({ id: l.id, name: l.name, catId: c.id, category: c.name });
  }
  return out;
}

/**
 * Plan, Track, Review for the month being worked on.
 * @param {object} doc the household file
 * @param {object} summary what buildSummary returns
 * @param {string} today 'YYYY-MM-DD'
 * @returns {object} { month, plan: {state}, track: {entries, last, confirmed, scheduled}, review: {empty,
 *   balancesMissing, balancesTotal, ties, unexplained}, nextPlan }; unexplained in dollars, the rest counts
 */
export function loopStrip(doc, summary, today) {
  const month = doc.currentMonth;
  const log = monthLog(doc, month);
  // The calendar is read from the month's first day when today is still before it. A horizon of 0 is
  // cashCalendar's default (30 days); the filter on the next line is what keeps this month's items only.
  const cal = cashCalendar(doc, summary.income, { today: today < month + '-01' ? month + '-01' : today, horizon: 0 });
  const items = cal.scheduled.filter((i) => monthOf(i.planned) === month && !i.skipped);
  const bal = balancesFor(doc, month);
  const br = bridgeFor(doc, summary.income, month);
  return {
    month,
    plan: { state: planState(doc, summary, month) },
    track: { entries: log.count, last: log.last, confirmed: items.filter((i) => i.confirmed).length, scheduled: items.length },
    // Each required account (cash and cards) needs two balances, a start and an end.
    review: { empty: gapLines(summary).length, balancesMissing: bal.missing.length, balancesTotal: bal.required.length * 2, ties: br.ties, unexplained: br.unexplained },
    nextPlan: planState(doc, summary, nextKey(month))
  };
}

/**
 * Review, fill gaps (S-106): one summary row per category (debts too). Its actual, how
 * many log entries it came from, and how many of its lines are from the log, a yearly
 * share, typed, covered, or still empty. A category with an empty line opens by itself.
 * @param {object} summary what buildSummary returns
 * @returns {Array<object>} { id, name, isDebt, actual (dollars a month), lines, entries, fromLog, shares,
 *   typed, covered, empty }: all counts except actual
 */
export function reviewRows(summary) {
  const gaps = gapLines(summary);
  return summary.model.categories.filter((c) => !c.isEverything && !c.notForMe).map((c) => {
    const by = (from) => c.lines.filter((l) => l.actualFrom === from).length;
    const empty = gaps.filter((g) => g.catId === c.id).length;
    return {
      id: c.id, name: c.name, isDebt: c.isDebt, actual: c.actual.amount, lines: c.lines.length,
      entries: c.lines.reduce((n, l) => n + (l.logCount || 0), 0),
      fromLog: by('log'), shares: by('share'), typed: by('typed'), covered: c.lines.filter((l) => l.covered).length,
      empty
    };
  });
}

/**
 * Balances that have not been updated for a while (S-114), for the Next card at month end: every
 * investment and thing you own last given a balance more than 35 days before today (or never).
 * @param {object} doc the household file
 * @param {string} today 'YYYY-MM-DD'
 * @param {number} [days=35] how many days old counts as stale
 * @returns {Array<{id: string, name: string, last: ?string}>} last is the day of the latest balance, 'YYYY-MM-DD'
 */
export function staleBalances(doc, today, days = 35) {
  // Whole days back in UTC, so the local time zone cannot shift the cutoff by a day.
  const cutoff = new Date(Date.parse(today + 'T00:00:00Z') - days * 86400000).toISOString().slice(0, 10);
  return (doc.accounts || []).filter((a) => a.state !== 'archived' && (kindOf(a) === 'invested' || kindOf(a) === 'valued'))
    .map((a) => ({ id: a.id, name: a.name, last: lastUpdated(doc, a.id, today) }))
    .filter((x) => x.last === null || x.last < cutoff);
}

/**
 * Which step of the loop is now (S-106), for the strip on Today: Review from the month's
 * third-to-last day (or once the month is over), Plan while the month has no plan and
 * nothing logged, otherwise Track.
 * @param {object} strip what loopStrip returns
 * @param {string} today 'YYYY-MM-DD'
 * @returns {string} 'plan' | 'track' | 'review'
 */
export function loopStep(strip, today) {
  const end = lastDay(strip.month);
  // Dates compare as strings, so a day in a later month is also past reviewFrom: a month left open stays in Review.
  const reviewFrom = strip.month + '-' + String(Number(end.slice(8)) - 2).padStart(2, '0');
  if (today >= reviewFrom) return 'review';
  if (strip.plan.state === 'not started' && strip.track.entries === 0) return 'plan';
  return 'track';
}

/**
 * The first session (S-106): five things, each done once, shown on Today until all are done.
 * "Done" is a question answered, never a number typed: a blank is not done, a typed 0 is.
 * @param {object} doc the household file
 * @param {object} summary what buildSummary returns
 * @returns {{items: Array<object>, left: number, done: boolean}} items { key, label, done, where, optional? };
 *   left and done count the required items only
 */
export function firstSession(doc, summary) {
  const live = (xs) => xs.filter((x) => x.state !== 'archived');
  const p = doc.profile;
  // Debt payments and Savings (what is left over, S-123) are computed, never asked. A single-total
  // household answers only the Everything else row; every other household answers each category.
  const rows = summary.rows.filter((r) => !r.isDebt && r.id !== 'savings' && (doc.settings.singleTotal ? r.isEverything : !r.isEverything));
  const items = [
    { key: 'gut', label: 'Gut number', done: doc.gut.status !== null, where: 'gut' },
    { key: 'basics', label: 'Basics: birth year, state, situation, who you live with', done: p.birthYear !== null && p.birthYear !== undefined && !!p.state && doc.situation.length > 0 && !!doc.household.livingWith, where: 'setup:basics' },
    { key: 'income', label: 'Income: at least one paycheck', done: live(doc.income).some((i) => i.takeHome.status !== null || i.gross.status !== null || (i.hourlyRate && i.hourlyRate.status !== null)), where: 'estimates' },
    { key: 'rough', label: 'Rough estimates for every category', done: rows.length > 0 && rows.every((r) => r.status.estimate !== null), where: 'estimates' },
    { key: 'accounts', label: 'Accounts: at least one', done: live(doc.accounts).length > 0, where: 'setup:accounts' },
    // Optional (S-130): a yearly bill paid before the first month, typed once as an opening Paid ahead.
    // Answered by an amount or "doesn't apply" on any line; never needed for the session to be done.
    { key: 'paid-ahead', label: 'Any yearly bills already paid?', optional: true, where: 'setup:bills',
      done: doc.categories.some((c) => c.lines.some((l) => l.openingAhead && l.openingAhead.status !== null)) }
  ];
  const needed = items.filter((i) => !i.optional);
  return { items, left: needed.filter((i) => !i.done).length, done: needed.every((i) => i.done) };
}

function nextKey(key) {
  let [y, m] = key.split('-').map(Number);
  m += 1;
  if (m > 12) { m = 1; y += 1; }
  return y + '-' + String(m).padStart(2, '0');
}

/**
 * Reimbursements still owed to the client: entries not yet paid back, and typed reimbursable lines not received.
 * @param {object} doc the household file
 * @param {string} month 'YYYY-MM'; entries dated in or before it count
 * @returns {{count: number, amount: number, list: Array<{name: string, amount: number, date?: string}>}} dollars
 */
export function owedToClient(doc, month) {
  const all = counted(doc.transactions);
  // A purchase stays owed until a reimbursement entry that settles it is dated in or before this month;
  // a reimbursable line counts its owed-back amount until it is marked received.
  const settled = new Set(all.filter((t) => t.kind === 'reimbursement' && t.settles && monthOf(t.date) <= month).map((t) => t.settles));
  const entries = all.filter((t) => t.owed && monthOf(t.date) <= month && !settled.has(t.id)).map((t) => ({ name: t.description || t.note || 'purchase', amount: t.owed, date: t.date }));
  const lines = doc.categories.flatMap((c) => c.lines).filter((l) => l.state !== 'archived' && l.path === 'reimbursable' && !l.owedBackReceived && l.owedBack && l.owedBack.amount).map((l) => ({ name: l.name, amount: l.owedBack.amount }));
  const list = [...entries, ...lines];
  return { count: list.length, amount: r2(list.reduce((a, x) => a + x.amount, 0)), list };
}

/**
 * The month-end checklist: each item with a count, its state, and where to fix it.
 * @param {object} doc the household file
 * @param {object} summary what buildSummary returns
 * @param {string} today 'YYYY-MM-DD'
 * @returns {{month: string, items: Array<object>, open: number, summary: string}} items { key, label, count,
 *   open, short, fix, names?, state?, amount? (dollars), stale? }; summary is the sentence saved at close
 */
export function monthEndChecklist(doc, summary, today) {
  const month = doc.currentMonth;
  const gaps = gapLines(summary);
  // The calendar day is clamped inside the month, so a month closed late (or early) is judged on its own days.
  const cal = cashCalendar(doc, summary.income, { today: today > lastDay(month) ? lastDay(month) : today < month + '-01' ? month + '-01' : today, horizon: 0 });
  const waiting = cal.waiting.filter((i) => monthOf(i.planned) === month);
  const bal = balancesFor(doc, month);
  const br = bridgeFor(doc, summary.income, month);
  const inMonth = doc.transactions.filter((t) => monthOf(t.date) === month);
  // Unmapped: imported spending with no line yet. Manual entries were typed to a line, a pending import
  // is still waiting on "same or different?", and a one-off is listed apart on purpose.
  const unmapped = inMonth.filter((t) => (t.source || 'import') === 'import' && !isPending(t) && !t.lineId && !t.oneOff && ['spend', 'fee', 'refund'].includes(t.kind));
  const possible = inMonth.filter(isPending);
  const dups = detect(inMonth).duplicates;
  const owed = owedToClient(doc, month);
  const incomeLoose = incomeMonth(doc, summary.income, month).unassigned;
  const next = planState(doc, summary, nextKey(month));
  const items = [
    { key: 'gaps', label: 'Lines in the plan with no actual and no entries', count: gaps.length, open: gaps.length > 0, short: gaps.length + ' line' + (gaps.length === 1 ? '' : 's') + ' empty', fix: 'actual', names: gaps.map((g) => g.name) },
    { key: 'waiting', label: 'Scheduled items still waiting on It happened or Didn\'t happen', count: waiting.length, open: waiting.length > 0, short: waiting.length + ' scheduled item' + (waiting.length === 1 ? '' : 's') + ' waiting', fix: 'cashflow', names: waiting.map((w) => w.name) },
    { key: 'balances', label: 'Start and end balances missing', count: bal.missing.length, open: bal.missing.length > 0 || !bal.rows.length, short: bal.rows.length ? bal.missing.length + ' balance' + (bal.missing.length === 1 ? '' : 's') + ' missing' : 'no accounts', fix: 'balances', names: bal.missing.map((m) => m.name + ' ' + m.which),
      // Investments and things you own are optional at month-end (S-110): listed with their last update, never open items.
      stale: bal.stale },
    // The bridge is open unless it ties outright: null (balances missing) is open too.
    { key: 'bridge', label: 'Bridge from budget to cash', count: br.ties ? 0 : 1, open: br.ties !== true, state: br.ties === null ? 'needs balances' : br.ties ? 'ties' : 'off by ' + whole(br.unexplained), short: br.ties === null ? 'bridge needs balances' : 'off by ' + whole(br.unexplained || 0), fix: 'bridge' },
    // Income entries with no source (S-118): the money counts, but it should say whose it is.
    { key: 'income-source', label: 'Income entries with no source', count: incomeLoose.count, open: incomeLoose.count > 0, short: incomeLoose.count + ' income entr' + (incomeLoose.count === 1 ? 'y' : 'ies') + ' with no source', fix: 'actual' },
    { key: 'unmapped', label: 'Imported entries with no line, and possible matches to confirm', count: unmapped.length + possible.length, open: unmapped.length + possible.length > 0, short: unmapped.length + ' unmapped, ' + possible.length + ' possible match' + (possible.length === 1 ? '' : 'es'), fix: 'cashflow' },
    { key: 'duplicates', label: 'Likely duplicates not resolved', count: dups.length, open: dups.length > 0, short: dups.length + ' likely duplicate' + (dups.length === 1 ? '' : 's'), fix: 'cashflow' },
    { key: 'owed', label: 'Reimbursements still owed to the client', count: owed.count, open: owed.count > 0, short: owed.count + ' reimbursement' + (owed.count === 1 ? '' : 's') + ' owed', amount: owed.amount, fix: 'cashflow', names: owed.list.map((o) => o.name) },
    { key: 'next-plan', label: 'Next month\'s plan', count: next === 'not started' ? 1 : 0, open: next === 'not started', state: next, short: 'next month\'s plan not started', fix: 'plan' }
  ];
  const open = items.filter((i) => i.open);
  return { month, items, open: open.length, summary: open.length ? 'Closed with ' + open.length + ' open item' + (open.length === 1 ? '' : 's') + ': ' + open.map((i) => i.short).join(', ') : 'Closed with nothing open' };
}

/**
 * Better than planned: under by more than 5% and $10. Worse: over by the same. On plan: within that.
 * @param {Array<object>} rows each with plan and actual in dollars a month (null = not entered)
 * @param {boolean} [higherIsBetter=false] true for income, where coming in over the plan is better
 * @returns {{better: Array<object>, onPlan: Array<object>, worse: Array<object>, notCompared: Array<object>}}
 *   each row with diff = actual - plan (dollars, to the cent); better and worse sorted biggest difference first
 */
export function sortByPlan(rows, higherIsBetter = false) {
  const out = { better: [], onPlan: [], worse: [], notCompared: [] };
  for (const r of rows) {
    if (r.plan === null || r.plan === undefined || r.actual === null || r.actual === undefined) { out.notCompared.push(r); continue; }
    const diff = r2(r.actual - r.plan);
    // Both thresholds must be crossed: $10 keeps small plans from flapping, 5% of the plan keeps big ones from.
    const big = Math.abs(diff) > 10 && Math.abs(diff) > 0.05 * Math.abs(r.plan);
    const row = { ...r, diff };
    if (!big) out.onPlan.push(row);
    else if ((diff < 0) !== higherIsBetter) out.better.push(row);
    else out.worse.push(row);
  }
  out.better.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  out.worse.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  return out;
}

// Accuracy as a multiple: actual over estimate, flipped when under 1 so that half and double are both
// "2x off". Null when either side is missing or the ratio is not positive.
const offBy = (a, e) => { const r = ratio(a, e); return r === null || r <= 0 ? null : r2(r >= 1 ? r : 1 / r); };

/**
 * The month in review, computed at close (and saved inside the snapshot).
 * @param {object} doc the household file
 * @param {object} summary what buildSummary returns for the month being closed
 * @param {string} today 'YYYY-MM-DD', the day of the close
 * @returns {object} { month, closedOn, vsPlan, vsEstimate, income, incomeRows, totals, bridge, forecast,
 *   tracking, changes, topMerchants, pareto, mistakes, happyShare, accuracy, openItems, promoEnded, readings }:
 *   dollars for the month, shares as ratios 0 to 1, accuracy as a multiple (1 = exact)
 */
export function monthReview(doc, summary, today) {
  const month = doc.currentMonth;
  const plan = planView(doc, month);
  // Spending categories only: Savings is what is left over and Debt payments are computed.
  const cats = summary.rows.filter((r) => !r.savings && !r.isDebt);
  const lineRows = cats.flatMap((c) => c.lines.map((l) => ({ id: l.id, name: l.name, category: c.name, plan: l.plan, estimate: l.estimate, actual: l.actual })));
  const catRows = cats.map((c) => ({ id: c.id, name: c.name, plan: plan && plan.cats[c.id] ? plan.cats[c.id].amount : null, estimate: c.estimate, actual: c.actual }));
  const vsPlan = { lines: sortByPlan(lineRows), categories: sortByPlan(catRows) };
  // Against the estimates: the same sort with the estimate standing in for the plan.
  const vsEstimate = { lines: sortByPlan(lineRows.map((r) => ({ ...r, plan: r.estimate }))), categories: sortByPlan(catRows.map((r) => ({ ...r, plan: r.estimate }))), culprits: summary.culprits.map((c) => ({ name: c.name, estimate: c.estimate, actual: c.actual, gap: c.gap })) };
  const t = summary.totals;
  // Opening adjustments are not spending, so they are left out of the merchant list.
  const inMonth = counted(doc.transactions).filter((x) => monthOf(x.date) === month && !x.adjust);
  // Income first (S-118): each source's estimate, plan (its real paydays), and actual from the log.
  const im = t.income;
  const income = sortByPlan([{ id: 'income', name: 'Income', plan: im.plan, actual: im.actual }], true);
  const incomeRows = im.sources.map((x) => ({ id: x.id, name: x.label, estimate: x.estimate, plan: x.plan, planNote: x.planNote, actual: x.actual, from: x.from, count: x.count }));
  const br = bridgeFor(doc, summary.income, month);
  const topStep = br.steps.slice().sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))[0] || null;
  const lines = summary.model.categories.filter((c) => !c.isDebt && !c.savings).flatMap((c) => c.lines);
  // How much of the spending came from the log vs typed over. A line from the log always has an amount;
  // the || 0 only skips a typed status with no number ("don't know").
  const fromLog = r2(lines.filter((l) => l.actualFrom === 'log').reduce((a, l) => a + (l.actual || 0), 0));
  const typed = r2(lines.filter((l) => l.actualFrom === 'typed').reduce((a, l) => a + (l.actual || 0), 0));
  const prev = actualsFor(doc, summary.history, prevMonthKey(month));
  // The three categories that moved most against last month, ignoring changes under 50 cents.
  const changes = cats.map((c) => ({ id: c.id, name: c.name, now: c.actual, before: prev.cats[c.id] === undefined ? null : prev.cats[c.id], change: minus(c.actual, prev.cats[c.id] === undefined ? null : prev.cats[c.id]) }))
    .filter((c) => c.change !== null && Math.abs(c.change) >= 0.5).sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, 3);
  const lastClosed = (doc.months || []).filter((m) => m.key < month).slice(-1)[0] || null;
  // Last month's accuracy, from its snapshot: estimates and actuals summed over the categories that have them.
  const lastAcc = lastClosed ? (() => {
    const cs = Object.values(lastClosed.snapshot.categories).filter((c) => !c.savings);
    const e = cs.reduce((a, c) => (c.estimate === null ? a : a + c.estimate), 0);
    const a = cs.reduce((x, c) => (c.actual === null ? x : x + c.actual), 0);
    return offBy(a, e);
  })() : null;
  const accThis = offBy(t.actualTotal, t.estimateTotal);
  const happy = happySpendShare(lines.map((l) => ({ joy: l.joy, amount: l.actual })), t.actualTotal);
  const checklist = monthEndChecklist(doc, summary, today);
  const out = {
    month, closedOn: today,
    vsPlan, vsEstimate, income, incomeRows,
    totals: { spent: t.actualTotal, plan: plan ? plan.spending : null, estimate: t.estimateTotal, surplus: t.surplus, savingsRate: t.savingsRate, takeHome: t.takeHome,
      income: { estimate: im.estimate, plan: im.plan, actual: im.actual, tracked: im.tracked, unassigned: im.unassigned.amount } },
    bridge: { ties: br.ties, unexplained: br.unexplained, explained: br.explained, actual: br.actual, top: topStep ? { label: topStep.label, short: topStep.short, amount: topStep.amount } : null, reading: br.reading },
    forecast: forecastCheck(doc, month),
    // share: the part of the spending that came from the log, 0 to 1.
    tracking: { fromLog, typed, share: ratio(fromLog, fromLog + typed) },
    changes,
    topMerchants: topMerchants(inMonth).top.map((m) => ({ merchant: m.merchant, amount: m.amount })),
    pareto: reviewPareto(doc, summary, month),
    mistakes: t.mistakeMonthly,
    happyShare: happy,
    accuracy: { now: accThis, last: lastAcc, lastMonth: lastClosed ? lastClosed.key : null },
    openItems: { count: checklist.open, summary: checklist.summary, items: checklist.items.filter((i) => i.open).map((i) => i.short) },
    // The first month after a card's promo (S-127): its interest at the card's own APR.
    promoEnded: promoEnded(doc, month).map((x) => ({ name: x.debt.label, promoApr: x.promoApr, interest: x.interest ? x.interest.amount : null }))
  };
  out.readings = reviewReadings(out);
  return out;
}

// The month's 80/20 at all three levels, small enough to keep in the snapshot (S-091).
function reviewPareto(doc, summary, month) {
  const p = paretoLevels(doc, summary.history, [month]);
  const keep = (c) => ({ count: c.count, of: c.of, amount: c.amount, amountShare: c.amountShare, items: c.items.map((i) => ({ label: i.label, amount: i.amount })), reading: c.reading });
  return { noEntries: p.noEntries, entries: keep(p.entries), merchants: keep(p.merchants), lines: keep(p.lines), reading: p.noEntries ? p.lines.reading + ' (No log entries, so lines only.)' : p.entries.reading };
}

/**
 * Factual sentences, no verdicts.
 * @param {object} r what monthReview returns (readings not yet set)
 * @returns {Array<string>} one sentence each
 */
export function reviewReadings(r) {
  const out = [];
  for (const p of r.promoEnded || []) out.push('Your ' + p.promoApr + '% promo ended. Interest this month: ' + (p.interest === null ? 'not known yet (needs the balance)' : exactMoney(p.interest)) + '.');
  const bc = r.vsPlan.categories.better[0];
  const wl = r.vsPlan.lines.worse[0];
  if (bc) out.push(bc.name + ' came in ' + whole(bc.diff) + ' under plan.');
  if (wl) out.push(wl.name + ' was ' + whole(wl.diff) + ' over.');
  if (!bc && !wl && r.totals.plan !== null) out.push('Everything came in on plan.');
  if (r.totals.plan === null) out.push('There was no plan this month, so lines are compared with your estimates.');
  const inc = r.income.better[0] || r.income.worse[0];
  if (inc) out.push('Income came in ' + whole(inc.diff) + (inc.diff > 0 ? ' more' : ' less') + ' than planned.');
  if (r.accuracy.now !== null) {
    const a = r.accuracy.now;
    const b = r.accuracy.last;
    // One decimal, unless that would make two different months look the same.
    const d = b !== null && a !== b && a.toFixed(1) === b.toFixed(1) ? 2 : 1;
    out.push(a.toFixed(d) + 'x off this month' + (b !== null ? (a < b ? ', down from ' : a > b ? ', up from ' : ', same as ') + b.toFixed(d) + 'x' : '') + '.');
  }
  return out;
}

export { lastDay };

/**
 * Accounts that need a specific type (S-116): "Type not set" (the old Investment and Retirement types)
 * and "Other money account". Never guessed between a 401(k), an IRA, and a Roth.
 * @param {object} doc the household file
 * @returns {Array<{id: string, name: string, label: string, why: string}>}
 */
export function accountTypeNudges(doc) {
  return (doc.accounts || []).filter((a) => a.state !== 'archived' && (a.type === 'unset' || a.type === 'other')).map((a) => ({
    id: a.id, name: a.name,
    label: a.type === 'unset' ? 'Pick what kind of account this is: ' + a.name : 'Pick a specific type for ' + a.name,
    why: a.type === 'unset' ? 'Its type is not set' : 'It is an "other money account"'
  }));
}
