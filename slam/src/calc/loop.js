// The monthly loop on screen (S-089): Plan, Track, Review for the month being
// worked on; the month-end checklist; and the month in review, computed at
// close and saved inside the locked snapshot so it never changes.

import { planView, actualsFor, prevMonthKey, reviewSummary } from './plan.js';
import { counted, isPending, monthLog } from './log.js';
import { forecastCheck } from './dates.js';
import { balancesFor, kindOf, lastUpdated } from './balances.js';
import { bridgeFor } from './bridge.js';
import { detect, topMerchants } from './tx-analysis.js';
import { happySpendShare } from './happiness.js';
import { ratio, minus } from './money.js';
import { paretoLevels } from './pareto.js';
import { incomeMonth } from './income-month.js';
import { promoEnded } from './debts.js';

const r2 = (x) => (x === null || x === undefined ? null : Math.round(x * 100) / 100 + 0);
const monthOf = (d) => d.slice(0, 7);
const whole = (x) => '$' + Math.round(Math.abs(x)).toLocaleString('en-US');
const exactMoney = (x) => '$' + Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const lastDay = (m) => { const [y, mm] = m.split('-').map(Number); return m + '-' + String(new Date(Date.UTC(y, mm, 0)).getUTCDate()).padStart(2, '0'); };

// The plan for a month: not started, started, or reviewed (every line ticked off).
export function planState(doc, summary, month) {
  const p = (doc.plans || {})[month];
  if (!p) return 'not started';
  const r = reviewSummary(doc, summary, prevMonthKey(month), month);
  return r.checklist.total && r.checklist.reviewed === r.checklist.total ? 'reviewed' : 'started';
}

// Lines with a plan or an estimate (on the line or its category) and nothing yet this month.
export function gapLines(summary) {
  const out = [];
  for (const c of summary.model.categories) {
    if (c.isDebt || c.notForMe || c.isEverything) continue;
    const pc = summary.plan ? summary.plan.cats[c.id] : null;
    const expected = (l) => l.estimate !== null || (c.estimate.from === 'category' && c.estimate.amount !== null) || (pc && (pc.byCategory ? pc.amount !== null : pc.lines[l.id] !== null && pc.lines[l.id] !== undefined));
    for (const l of c.lines) if (l.actual === null && l.status.actual === null && !l.covered && expected(l)) out.push({ id: l.id, name: l.name, catId: c.id, category: c.name });
  }
  return out;
}

// Plan, Track, Review for the month being worked on.
export function loopStrip(doc, summary, today) {
  const month = doc.currentMonth;
  const log = monthLog(doc, month);
  const bal = balancesFor(doc, month);
  const br = bridgeFor(doc, summary.income, month);
  return {
    month,
    plan: { state: planState(doc, summary, month) },
    // The scheduled-item counts went with the cash calendar (S-209): the calendar lives in SLAM now.
    track: { entries: log.count, last: log.last },
    review: { empty: gapLines(summary).length, balancesMissing: bal.missing.length, balancesTotal: bal.required.length * 2, ties: br.ties, unexplained: br.unexplained },
    nextPlan: planState(doc, summary, nextKey(month))
  };
}

// Review, fill gaps (S-106): one summary row per category (debts too). Its actual, how
// many log entries it came from, and how many of its lines are from the log, a yearly
// share, typed, covered, or still empty. A category with an empty line opens by itself.
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

// Balances that have not been updated for a while (S-114), for the Next card at month end: every
// investment and thing you own last given a balance more than 35 days before today (or never).
export function staleBalances(doc, today, days = 35) {
  const cutoff = new Date(Date.parse(today + 'T00:00:00Z') - days * 86400000).toISOString().slice(0, 10);
  return (doc.accounts || []).filter((a) => a.state !== 'archived' && (kindOf(a) === 'invested' || kindOf(a) === 'valued'))
    .map((a) => ({ id: a.id, name: a.name, last: lastUpdated(doc, a.id, today) }))
    .filter((x) => x.last === null || x.last < cutoff);
}

// Which step of the loop is now (S-106), for the strip on Today: Review from the month's
// third-to-last day (or once the month is over), Plan while the month has no plan and
// nothing logged, otherwise Track.
export function loopStep(strip, today) {
  const end = lastDay(strip.month);
  const reviewFrom = strip.month + '-' + String(Number(end.slice(8)) - 2).padStart(2, '0');
  if (today >= reviewFrom) return 'review';
  if (strip.plan.state === 'not started' && strip.track.entries === 0) return 'plan';
  return 'track';
}

// The first session (S-106): five things, each done once, shown on Today until all are done.
// "Done" is a question answered, never a number typed: a blank is not done, a typed 0 is.
export function firstSession(doc, summary) {
  const live = (xs) => xs.filter((x) => x.state !== 'archived');
  const p = doc.profile;
  // Debt payments and Savings (what is left over, S-123) are computed, never asked.
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

// Reimbursements still owed to the client: entries not yet paid back, and typed reimbursable lines not received.
export function owedToClient(doc, month) {
  const all = counted(doc.transactions);
  const settled = new Set(all.filter((t) => t.kind === 'reimbursement' && t.settles && monthOf(t.date) <= month).map((t) => t.settles));
  const entries = all.filter((t) => t.owed && monthOf(t.date) <= month && !settled.has(t.id)).map((t) => ({ name: t.description || t.note || 'purchase', amount: t.owed, date: t.date }));
  const lines = doc.categories.flatMap((c) => c.lines).filter((l) => l.state !== 'archived' && l.path === 'reimbursable' && !l.owedBackReceived && l.owedBack && l.owedBack.amount).map((l) => ({ name: l.name, amount: l.owedBack.amount }));
  const list = [...entries, ...lines];
  return { count: list.length, amount: r2(list.reduce((a, x) => a + x.amount, 0)), list };
}

// The month-end checklist: each item with a count, its state, and where to fix it.
export function monthEndChecklist(doc, summary, today) {
  const month = doc.currentMonth;
  const gaps = gapLines(summary);
  const bal = balancesFor(doc, month);
  const br = bridgeFor(doc, summary.income, month);
  const inMonth = doc.transactions.filter((t) => monthOf(t.date) === month);
  const unmapped = inMonth.filter((t) => (t.source || 'import') === 'import' && !isPending(t) && !t.lineId && !t.oneOff && ['spend', 'fee', 'refund'].includes(t.kind));
  const possible = inMonth.filter(isPending);
  const dups = detect(inMonth).duplicates;
  const owed = owedToClient(doc, month);
  const incomeLoose = incomeMonth(doc, summary.income, month).unassigned;
  const next = planState(doc, summary, nextKey(month));
  const items = [
    { key: 'gaps', label: 'Lines in the plan with no actual and no entries', count: gaps.length, open: gaps.length > 0, short: gaps.length + ' line' + (gaps.length === 1 ? '' : 's') + ' empty', fix: 'actual', names: gaps.map((g) => g.name) },
    { key: 'balances', label: 'Start and end balances missing', count: bal.missing.length, open: bal.missing.length > 0 || !bal.rows.length, short: bal.rows.length ? bal.missing.length + ' balance' + (bal.missing.length === 1 ? '' : 's') + ' missing' : 'no accounts', fix: 'balances', names: bal.missing.map((m) => m.name + ' ' + m.which),
      // Investments and things you own are optional at month-end (S-110): listed with their last update, never open items.
      stale: bal.stale },
    { key: 'bridge', label: 'Bridge from budget to cash', count: br.ties ? 0 : 1, open: br.ties !== true, state: br.ties === null ? 'needs balances' : br.ties ? 'ties' : 'off by ' + whole(br.unexplained), short: br.ties === null ? 'bridge needs balances' : 'off by ' + whole(br.unexplained || 0), fix: 'bridge' },
    // Income entries with no source (S-118): the money counts, but it should say whose it is.
    { key: 'income-source', label: 'Income entries with no source', count: incomeLoose.count, open: incomeLoose.count > 0, short: incomeLoose.count + ' income entr' + (incomeLoose.count === 1 ? 'y' : 'ies') + ' with no source', fix: 'actual' },
    { key: 'unmapped', label: 'Imported entries with no line, and possible matches to confirm', count: unmapped.length + possible.length, open: unmapped.length + possible.length > 0, short: unmapped.length + ' unmapped, ' + possible.length + ' possible match' + (possible.length === 1 ? '' : 'es'), fix: 'track' },
    { key: 'duplicates', label: 'Likely duplicates not resolved', count: dups.length, open: dups.length > 0, short: dups.length + ' likely duplicate' + (dups.length === 1 ? '' : 's'), fix: 'track' },
    { key: 'owed', label: 'Reimbursements still owed to the client', count: owed.count, open: owed.count > 0, short: owed.count + ' reimbursement' + (owed.count === 1 ? '' : 's') + ' owed', amount: owed.amount, fix: 'track', names: owed.list.map((o) => o.name) },
    { key: 'next-plan', label: 'Next month\'s plan', count: next === 'not started' ? 1 : 0, open: next === 'not started', state: next, short: 'next month\'s plan not started', fix: 'plan' }
  ];
  const open = items.filter((i) => i.open);
  return { month, items, open: open.length, summary: open.length ? 'Closed with ' + open.length + ' open item' + (open.length === 1 ? '' : 's') + ': ' + open.map((i) => i.short).join(', ') : 'Closed with nothing open' };
}

// Better than planned: under by more than 5% and $10. Worse: over by the same. On plan: within that.
export function sortByPlan(rows, higherIsBetter = false) {
  const out = { better: [], onPlan: [], worse: [], notCompared: [] };
  for (const r of rows) {
    if (r.plan === null || r.plan === undefined || r.actual === null || r.actual === undefined) { out.notCompared.push(r); continue; }
    const diff = r2(r.actual - r.plan);
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

const offBy = (a, e) => { const r = ratio(a, e); return r === null || r <= 0 ? null : r2(r >= 1 ? r : 1 / r); };

// The month in review, computed at close (and saved inside the snapshot).
export function monthReview(doc, summary, today) {
  const month = doc.currentMonth;
  const plan = planView(doc, month);
  const cats = summary.rows.filter((r) => !r.savings && !r.isDebt);
  const lineRows = cats.flatMap((c) => c.lines.map((l) => ({ id: l.id, name: l.name, category: c.name, plan: l.plan, estimate: l.estimate, actual: l.actual })));
  const catRows = cats.map((c) => ({ id: c.id, name: c.name, plan: plan && plan.cats[c.id] ? plan.cats[c.id].amount : null, estimate: c.estimate, actual: c.actual }));
  const vsPlan = { lines: sortByPlan(lineRows), categories: sortByPlan(catRows) };
  const vsEstimate = { lines: sortByPlan(lineRows.map((r) => ({ ...r, plan: r.estimate }))), categories: sortByPlan(catRows.map((r) => ({ ...r, plan: r.estimate }))), culprits: summary.culprits.map((c) => ({ name: c.name, estimate: c.estimate, actual: c.actual, gap: c.gap })) };
  const t = summary.totals;
  const inMonth = counted(doc.transactions).filter((x) => monthOf(x.date) === month && !x.adjust);
  // Income first (S-118): each source's estimate, plan (its real paydays), and actual from the log.
  const im = t.income;
  const income = sortByPlan([{ id: 'income', name: 'Income', plan: im.plan, actual: im.actual }], true);
  const incomeRows = im.sources.map((x) => ({ id: x.id, name: x.label, estimate: x.estimate, plan: x.plan, planNote: x.planNote, actual: x.actual, from: x.from, count: x.count }));
  const br = bridgeFor(doc, summary.income, month);
  const topStep = br.steps.slice().sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))[0] || null;
  const lines = summary.model.categories.filter((c) => !c.isDebt && !c.savings).flatMap((c) => c.lines);
  const fromLog = r2(lines.filter((l) => l.actualFrom === 'log').reduce((a, l) => a + (l.actual || 0), 0));
  const typed = r2(lines.filter((l) => l.actualFrom === 'typed').reduce((a, l) => a + (l.actual || 0), 0));
  const prev = actualsFor(doc, summary.history, prevMonthKey(month));
  const changes = cats.map((c) => ({ id: c.id, name: c.name, now: c.actual, before: prev.cats[c.id] === undefined ? null : prev.cats[c.id], change: minus(c.actual, prev.cats[c.id] === undefined ? null : prev.cats[c.id]) }))
    .filter((c) => c.change !== null && Math.abs(c.change) >= 0.5).sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, 3);
  const lastClosed = (doc.months || []).filter((m) => m.key < month).slice(-1)[0] || null;
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

// Factual sentences, no verdicts.
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

// Accounts that need a specific type (S-116): "Type not set" (the old Investment and Retirement types)
// and "Other money account". Never guessed between a 401(k), an IRA, and a Roth.
export function accountTypeNudges(doc) {
  return (doc.accounts || []).filter((a) => a.state !== 'archived' && (a.type === 'unset' || a.type === 'other')).map((a) => ({
    id: a.id, name: a.name,
    label: a.type === 'unset' ? 'Pick what kind of account this is: ' + a.name : 'Pick a specific type for ' + a.name,
    why: a.type === 'unset' ? 'Its type is not set' : 'It is an "other money account"'
  }));
}
