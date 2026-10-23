// The cash flow calendar (S-086): cash day by day, past and future, on one line. Past days (up to today)
// show the log; future days show what is scheduled: paychecks from each income's next pay date and frequency,
// bills on their due days, card and loan payments on the debt's due day, and the rest of each month's plan
// spread evenly over the days left ("spread across the month"), shrinking as real entries for those lines
// come in. A typed month start, month end, or balance check resets an account to that real number. Cash here
// is checking only (S-094); cards are what is owed. Short range only (days); Eras is the long view.
// Dollars on each day. Depends on plan.js (the month's model and plan), log.js (counted entries, amountClose),
// balances.js (isCashAccount), normalize.js (toMonthly), debts.js (linkedLine, cardInterest), money.js (r2).

import { modelForMonth, planView } from './plan.js';
import { counted } from './log.js';
import { amountClose } from './log.js';
import { isCashAccount } from './balances.js';

// The calendar's cash is checking only (S-094): savings is not spending money day to day.
const inCalendar = (a) => a.type === 'checking';
import { toMonthly } from './normalize.js';
import { linkedLine, cardInterest } from './debts.js';
import { r2 } from './money.js';

const DAY = 86400000;
// Paychecks a year by frequency, and the days between paychecks for the two that repeat on a fixed step
// (semimonthly uses its two pay days, monthly the day of the month).
const PER_YEAR = { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12 };
const STEP_DAYS = { weekly: 7, biweekly: 14 };
// Entry kinds that count as spending on a line, net of refunds and reimbursements (negative amounts).
const COUNTS = new Set(['spend', 'fee', 'refund', 'reimbursement']);

/**
 * The day n days after a day (n may be negative), in UTC so a time zone never skips a day.
 * @param {string} iso 'YYYY-MM-DD'
 * @param {number} n days
 * @returns {string} 'YYYY-MM-DD'
 */
export function addDays(iso, n) {
  return new Date(Date.parse(iso + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);
}
/**
 * Days from a to b, negative when b is earlier.
 * @param {string} a 'YYYY-MM-DD'
 * @param {string} b 'YYYY-MM-DD'
 * @returns {number} whole days
 */
export function daysBetween(a, b) {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / DAY);
}
/**
 * How many days a month has (day 0 of the next month is this month's last).
 * @param {string} month 'YYYY-MM'
 * @returns {number} 28 to 31
 */
export function daysInMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
const monthOf = (iso) => iso.slice(0, 7);
const dateIn = (month, day) => month + '-' + String(Math.min(day, daysInMonth(month))).padStart(2, '0');
// Every month from a to b, both included. The 28th plus 7 days always lands in the next month.
function monthsBetween(a, b) {
  const out = [];
  for (let m = a; m <= b; m = addDays(dateIn(m, 28), 7).slice(0, 7)) out.push(m);
  return out;
}

/**
 * The account a scheduled item or an entry with no account lands in: the first checking account, else the
 * first cash account, else the first account of any kind.
 * @param {object} doc the household file
 * @returns {?string} an account id, or null with no live accounts
 */
export function defaultAccount(doc) {
  const live = (doc.accounts || []).filter((a) => a.state !== 'archived');
  const a = live.find((x) => x.type === 'checking') || live.find(isCashAccount) || live[0];
  return a ? a.id : null;
}

// The number in a value, or null: not entered and "not for me" both give no amount.
const amountOfValue = (v) => (v && v.amount !== null && v.amount !== undefined && v.status !== 'not-for-me' ? v.amount : null);

// One month's planned amount per line (monthly), from the plan, else the estimate.
function lineAmounts(doc, month) {
  const model = modelForMonth(doc, month);
  const plan = planView(doc, month);
  const units = [];
  const byLine = {};
  for (const c of model.categories) {
    // Savings lines stay in your accounts (no cash leaves), debt payments are scheduled from the debt
    // itself, and a "not for me" category has nothing to spread.
    if (c.savings || c.isDebt || c.notForMe) continue;
    const pc = plan ? plan.cats[c.id] : null;
    const catLevel = pc ? pc.byCategory : c.estimate.from === 'category';
    for (const l of c.lines) {
      const planned = pc && !pc.byCategory ? pc.lines[l.id] : null;
      byLine[l.id] = planned !== null && planned !== undefined ? planned : l.estimate;
    }
    units.push({ catId: c.id, name: c.name, catLevel, amount: catLevel ? (pc ? pc.amount : c.estimate.amount) : null, lines: c.lines.map((l) => ({ id: l.id, name: l.name, kind: l.kind })) });
  }
  return { units, byLine };
}

/**
 * The paydays of one income in a month, from its pay schedule (S-117: a biweekly month can have 3).
 * @param {object} inc an income record: payFrequency, nextPayDate, payDays, and benefitWeeksLeft for unemployment
 * @param {string} month 'YYYY-MM'
 * @returns {?string[]} days 'YYYY-MM-DD' in order; null when the schedule is not known yet (no next pay date)
 */
export function payDates(inc, month) {
  const first = month + '-01';
  const last = dateIn(month, 31);
  const dates = [];
  if (inc.payFrequency === 'semimonthly') {
    // Semimonthly needs no next pay date: its two pay days, the 1st and 15th unless typed.
    const days = inc.payDays && inc.payDays.length === 2 ? inc.payDays : [1, 15];
    for (const d of days) dates.push(dateIn(month, d));
    return dates.sort();
  }
  const d0 = inc.nextPayDate && inc.nextPayDate.date;
  if (!d0) return null;
  // Monthly: the same day of the month as the next pay date (dateIn clamps a 31st to a shorter month).
  if (inc.payFrequency === 'monthly') dates.push(dateIn(month, Number(d0.slice(8))));
  else {
    const step = STEP_DAYS[inc.payFrequency];
    if (!step) return null;
    // Step back from the next pay date in whole periods to before the month, then walk forward through it.
    let d = addDays(d0, -step * Math.ceil(Math.max(0, daysBetween(first, d0)) / step));
    while (d < first) d = addDays(d, step);
    for (; d <= last; d = addDays(d, step)) dates.push(d);
  }
  // Unemployment stops when the weeks left run out, counted from the next pay date.
  if (inc.type === 'unemployment' && inc.benefitWeeksLeft !== null && inc.benefitWeeksLeft !== undefined) {
    const end = addDays(d0, inc.benefitWeeksLeft * 7);
    for (let i = dates.length - 1; i >= 0; i--) if (dates[i] >= end) dates.splice(i, 1);
  }
  return dates.sort();
}

/**
 * Every scheduled item in one month: paychecks, bills, debt payments. key = kind:id:original date. A move
 * (doc.cashflow.moves[key]) changes the date or skips it.
 * @param {object} doc the household file
 * @param {string} month 'YYYY-MM'
 * @param {object} income the income summary (summary.income); takeHomeMonthly per source in dollars a month
 * @returns {{items: object[], amounts: object}} items by date, each { key, kind, dir 'in' or 'out', amount in
 *   dollars (null when unknown), account, planned, date, moved, skipped }; amounts is the month's plan per line
 */
export function scheduledItems(doc, month, income) {
  const items = [];
  const first = month + '-01';
  const last = dateIn(month, 31);
  const def = defaultAccount(doc);
  const moves = (doc.cashflow && doc.cashflow.moves) || {};
  const push = (it) => {
    const mv = moves[it.key];
    if (mv && mv.to === null) return items.push({ ...it, skipped: true, date: it.planned });
    items.push({ ...it, date: mv ? mv.to : it.planned, moved: !!mv });
  };
  // Paychecks
  for (const inc of doc.income) {
    if (inc.state === 'archived') continue;
    const src = (income.sources || []).find((s) => s.id === inc.id);
    // One paycheck = monthly take-home * 12 / paychecks a year; null until the frequency is known.
    const per = src && src.takeHomeMonthly !== null && PER_YEAR[inc.payFrequency] ? r2((src.takeHomeMonthly * 12) / PER_YEAR[inc.payFrequency]) : null;
    const acct = inc.accountId || def;
    const dates = payDates(inc, month);
    if (dates === null) continue;
    for (const d of dates) push({ key: 'pay:' + inc.id + ':' + d, kind: 'paycheck', dir: 'in', name: inc.label, incomeId: inc.id, amount: per, account: acct, planned: d });
  }
  // Bills: a due day every month, or a due month and day once a year.
  const amts = lineAmounts(doc, month);
  for (const c of doc.categories) {
    if (c.state === 'archived' || c.savings || c.id === 'debt') continue;
    for (const l of c.lines) {
      if (l.state === 'archived' || amts.byLine[l.id] === undefined) continue;
      const day = amountOfValue(l.dueDay);
      const dm = amountOfValue(l.dueMonth);
      if (!day) continue;
      const yearly = dm !== null;
      if (yearly && Number(month.slice(5)) !== dm) continue;
      // A yearly bill is the monthly share times 12, placed in its due month.
      const monthly = amts.byLine[l.id];
      const amount = monthly === null ? null : r2(yearly ? monthly * 12 : monthly);
      const d = dateIn(month, day);
      push({ key: 'bill:' + l.id + ':' + d, kind: 'bill', dir: 'out', name: l.name, lineId: l.id, yearly, amount, account: l.accountId || def, planned: d });
    }
  }
  // Debt payments from checking on the debt's due day: the minimum, or the card's
  // statement balance (last month's end) when the coach picked that and it is known.
  for (const debt of doc.debts) {
    // A debt a budget line pays is scheduled as that line (S-116).
    if (debt.state === 'archived' || linkedLine(doc, debt)) continue;
    const day = amountOfValue(debt.dueDay);
    if (!day) continue;
    const card = (doc.accounts || []).find((a) => a.debtId === debt.id && a.state !== 'archived');
    let amount = toMonthly(debt.minimum, 'monthly');
    let basis = 'minimum';
    if (debt.payWith === 'statement' && card) {
      const prev = monthOf(addDays(first, -1));
      const end = (((doc.balances || {})[prev] || {})[card.id] || {}).end;
      if (end && end.amount !== null) { amount = end.amount; basis = 'statement'; }
    }
    const d = dateIn(month, day);
    push({ key: 'debt:' + debt.id + ':' + d, kind: 'debt', dir: 'out', name: debt.label, debtId: debt.id, basis, amount: amount === null ? null : r2(amount), account: debt.payFrom || def, card: card ? card.id : null, planned: d });
  }
  return { items: items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)), amounts: amts };
}

// A scheduled item counts as done when an entry carries its key, or a log entry
// on the same line (or income, or a card payment) lands within 3 days at about the amount.
function confirmItems(items, entries) {
  const used = new Set();
  for (const it of items) {
    if (it.skipped) continue;
    let hit = entries.find((e) => e.scheduleKey === it.key);
    // Income entries are negative (money in), so a paycheck matches on the negated amount.
    if (!hit && it.amount !== null) {
      hit = entries.find((e) => !used.has(e.id) && !e.scheduleKey && Math.abs(daysBetween(e.date, it.date)) <= 3 && (
        (it.kind === 'bill' && e.lineId === it.lineId && amountClose(e.amount, it.amount)) ||
        (it.kind === 'paycheck' && e.kind === 'income' && (!e.incomeId || e.incomeId === it.incomeId) && amountClose(-e.amount, it.amount)) ||
        (it.kind === 'debt' && e.kind === 'card-payment' && e.amount > 0 && amountClose(e.amount, it.amount))));
    }
    if (hit) { used.add(hit.id); it.confirmed = hit.id; }
  }
}

// Logged so far this month (up to and including today) per line, net of refunds.
function loggedByLine(entries, month, today) {
  const out = {};
  for (const e of entries) {
    if (monthOf(e.date) !== month || e.date > today || !e.lineId || !COUNTS.has(e.kind)) continue;
    out[e.lineId] = (out[e.lineId] || 0) + e.amount;
  }
  return out;
}

// What is left of each unscheduled line (or one-number category) this month, spread per day.
function spreadFor(doc, month, today, sched, entries) {
  const scheduledLines = new Set(sched.items.filter((i) => i.kind === 'bill').map((i) => i.lineId));
  const yearlyLines = new Set();
  for (const c of doc.categories) for (const l of c.lines) if (amountOfValue(l.dueDay) && amountOfValue(l.dueMonth) !== null) yearlyLines.add(l.id);
  const logged = loggedByLine(entries, month, today);
  const first = month + '-01';
  // The spread starts tomorrow (today's spending is in the log), or on the 1st of a month still ahead;
  // a month already over has no days left and spreads nothing.
  const startDay = today >= first ? addDays(today, 1) : first;
  const daysLeft = monthOf(startDay) === month ? daysInMonth(month) - Number(startDay.slice(8)) + 1 : 0;
  const def = defaultAccount(doc);
  const out = [];
  for (const u of sched.amounts.units) {
    // A category planned as one number spreads what is left after its scheduled bills; a line-level one
    // spreads each unscheduled line. Yearly bills never spread.
    const parts = u.catLevel
      ? [{ name: u.name, ids: u.lines.filter((l) => !scheduledLines.has(l.id) && !yearlyLines.has(l.id)).map((l) => l.id), plan: u.amount === null ? null : Math.max(0, u.amount - u.lines.filter((l) => scheduledLines.has(l.id)).reduce((a, l) => a + (sched.amounts.byLine[l.id] || 0), 0)), account: def }]
      : u.lines.filter((l) => !scheduledLines.has(l.id) && !yearlyLines.has(l.id)).map((l) => {
        const line = doc.categories.find((c) => c.id === u.catId).lines.find((x) => x.id === l.id);
        return { name: l.name, ids: [l.id], plan: sched.amounts.byLine[l.id], account: (line && line.accountId) || def };
      });
    for (const p of parts) {
      if (p.plan === null || p.plan === undefined || p.plan <= 0) continue;
      const soFar = p.ids.reduce((a, id) => a + (logged[id] || 0), 0);
      // What is left never goes below 0: overspending does not turn into a negative spread.
      const left = Math.max(0, p.plan - soFar);
      out.push({ name: p.name, lineIds: p.ids, plan: p.plan, logged: r2(soFar), left: r2(left), perDay: daysLeft ? left / daysLeft : 0, from: startDay, account: p.account });
    }
  }
  return { units: out, daysLeft, from: startDay };
}

function effect(acct, flow) {
  // flow > 0 is money into the account. A card's balance is owed, so it moves the other way.
  return acct && acct.type === 'credit-card' ? -flow : flow;
}

/**
 * Cash by day, from the first month with a typed balance through today plus the horizon.
 * @param {object} doc the household file
 * @param {object} income the income summary (summary.income)
 * @param {{today: string, horizon: number, cushion: number}} opts today 'YYYY-MM-DD'; horizon in days (30, 60,
 *   or 90; 30 when not given); cushion in dollars, else the file's cushion, else 0
 * @returns {object} { days, todayCash, lowest, safeToSpend, shortfall, nextPayday, paydays, waiting, scheduled,
 *   spreads, payLater, unknownStart, ... }: dollars on each day (cash is checking only, cards what is owed)
 */
export function cashCalendar(doc, income, opts) {
  const today = opts.today;
  const horizon = opts.horizon || 30;
  const accts = (doc.accounts || []).filter((a) => a.state !== 'archived');
  const byId = Object.fromEntries(accts.map((a) => [a.id, a]));
  const def = defaultAccount(doc);
  const cf = doc.cashflow || {};
  const cushion = opts.cushion !== undefined ? opts.cushion : (cf.cushion && cf.cushion.amount !== null ? cf.cushion.amount : 0);
  // Start the line at the earliest month with any typed balance, so it begins on a real number; else this month.
  const balMonths = Object.keys(doc.balances || {}).filter((m) => Object.entries(doc.balances[m]).some(([id, b]) => byId[id] && ((b.start && b.start.amount !== null) || (b.end && b.end.amount !== null)))).sort();
  const firstMonth = balMonths.length && balMonths[0] < monthOf(today) ? balMonths[0] : monthOf(today);
  const start = firstMonth + '-01';
  const end = addDays(today, horizon);
  // "Kept your typed actual" entries (S-087) are bookkeeping, not money that moved.
  const entries = counted(doc.transactions).filter((e) => !e.adjust);
  const months = monthsBetween(firstMonth, monthOf(end));
  const allItems = [];
  const spreads = {};
  // Card interest (S-127): charged to the card on its due day (the last day without one). It moves what
  // is owed, never checking, so it shows "on the card" and is never waiting to be confirmed.
  const interestOn = {};
  for (const m of months) {
    for (const debt of doc.debts || []) {
      const card = accts.find((a) => a.debtId === debt.id && a.type === 'credit-card');
      const ci = card ? cardInterest(doc, debt, m) : null;
      if (!ci || !ci.amount) continue;
      const d = dateIn(m, amountOfValue(debt.dueDay) || 31);
      (interestOn[d] = interestOn[d] || []).push({ type: 'scheduled', key: 'interest:' + debt.id + ':' + d, kind: 'interest', name: debt.label + ' interest (computed)', card: card.id, amount: ci.amount });
    }
  }
  for (const m of months) {
    const s = scheduledItems(doc, m, income);
    confirmItems(s.items, entries);
    allItems.push(...s.items);
    if (dateIn(m, 31) > today) spreads[m] = spreadFor(doc, m, today, s, entries);
  }
  // Waiting: scheduled on or before today in an open month, not confirmed, not skipped.
  const openFrom = doc.currentMonth < monthOf(today) ? doc.currentMonth : monthOf(today);
  const waiting = allItems.filter((i) => !i.skipped && !i.confirmed && i.date <= today && monthOf(i.planned) >= openFrom);
  const future = allItems.filter((i) => !i.skipped && !i.confirmed && i.date > today && i.date <= end);

  // Starting balances: each account's start for the first month (typed or carried); unknown counts as 0 and is named.
  const bal = {};
  const unknownStart = [];
  const checksOf = (id) => (cf.checks || []).filter((c) => c.accountId === id && c.amount && c.amount.amount !== null);
  for (const a of accts) {
    const b = ((doc.balances[firstMonth] || {})[a.id]) || {};
    const prevEnd = (((doc.balances[monthOf(addDays(start, -1))]) || {})[a.id] || {}).end;
    const s = b.start && b.start.amount !== null ? b.start.amount : prevEnd && prevEnd.amount !== null ? prevEnd.amount : null;
    // A balance read later in the month (S-136, Update on the Accounts tab) is known from its day on.
    const readLater = (b.end && b.end.amount !== null) || checksOf(a.id).some((c) => monthOf(c.date) === firstMonth);
    if (s === null && !readLater) unknownStart.push(a.name);
    bal[a.id] = s === null ? 0 : s;
  }
  const checks = (cf.checks || []).filter((c) => byId[c.accountId] && c.amount && c.amount.amount !== null);
  const days = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const m = monthOf(d);
    const items = [];
    // A month's start balance applies on the day it was read (S-100), the 1st unless another day was picked.
    if (d !== start) {
      for (const a of accts) { const b = (doc.balances[m] || {})[a.id] || {}; if (d === (b.startOn || dateIn(m, 1)) && b.start && b.start.amount !== null) bal[a.id] = b.start.amount; }
    }
    const add = (it, accountId, flow) => {
      const a = byId[accountId] || byId[def];
      if (a) bal[a.id] = bal[a.id] + effect(a, flow);
      items.push({ ...it, account: a ? a.id : null, flow, cash: a ? inCalendar(a) : false });
    };
    // Entry amounts are positive for money out, so the flow into the account is the negative.
    if (d <= today) {
      for (const e of entries) if (e.date === d) add({ type: 'entry', id: e.id, name: e.description || e.note || e.kind, kind: e.kind, source: e.source || 'import', lineId: e.lineId }, e.account || def, -e.amount);
    }
    // Items still waiting are shown on today at their amount: the line assumes they clear now.
    if (d === today) for (const it of waiting) if (it.amount !== null) add({ type: 'waiting', key: it.key, kind: it.kind, name: it.name, date: it.date }, it.account, it.dir === 'in' ? it.amount : -it.amount);
    if (d > today) {
      for (const it of future) {
        if (it.date !== d || it.amount === null) continue;
        add({ type: 'scheduled', key: it.key, kind: it.kind, name: it.name }, it.account, it.dir === 'in' ? it.amount : -it.amount);
        // A card payment from checking also lowers what the card owes: a mirror item on the card, not cash.
        if (it.kind === 'debt' && it.card && it.card !== it.account) add({ type: 'scheduled', key: it.key, kind: 'debt', name: it.name + ' (paid)', mirror: true }, it.card, it.amount);
      }
      for (const it of interestOn[d] || []) add({ type: it.type, key: it.key, kind: it.kind, name: it.name }, it.card, -it.amount);
      const sp = spreads[m];
      if (sp) for (const u of sp.units) if (u.perDay > 0 && d >= sp.from) add({ type: 'spread', kind: 'spread', name: u.name }, u.account, -u.perDay);
    }
    // Real numbers reset the projection: a typed month end, then any balance check that day.
    for (const a of accts) { const b = (doc.balances[m] || {})[a.id] || {}; if (d === (b.endOn || dateIn(m, 31)) && b.end && b.end.amount !== null && d <= today) bal[a.id] = b.end.amount; }
    for (const c of checks) if (c.date === d) bal[c.accountId] = c.amount.amount;
    const cash = accts.filter(inCalendar).reduce((a, x) => a + bal[x.id], 0);
    const cards = accts.filter((x) => x.type === 'credit-card').reduce((a, x) => a + bal[x.id], 0);
    // Savings is shown as its own line, never added into cash (S-095).
    const savings = accts.filter((x) => x.type === 'savings' || x.type === 'hysa').reduce((a, x) => a + bal[x.id], 0);
    const cashItems = items.filter((i) => i.cash && !i.mirror);
    // Cash after each item, in the order the By date list shows them: the day starts at its end cash
    // less everything that moved through cash that day; mirrors and the plan's spread are skipped.
    let run = r2(cash) - cashItems.reduce((a, i) => a + i.flow, 0);
    for (const it of items) {
      if (it.mirror || it.type === 'spread') continue;
      if (it.cash) run += it.flow;
      it.cashAfter = it.cash ? run : null;
    }
    const spreadTotal = items.filter((i) => i.type === 'spread').reduce((a, i) => a + i.flow, 0);
    days.push({
      date: d, past: d < today, today: d === today, cash: r2(cash), savings: r2(savings), cards: r2(cards), perAccount: Object.fromEntries(Object.entries(bal).map(([k, v]) => [k, r2(v)])), items, spreadTotal,
      in: r2(cashItems.filter((i) => i.flow > 0).reduce((a, i) => a + i.flow, 0)), out: r2(-cashItems.filter((i) => i.flow < 0).reduce((a, i) => a + i.flow, 0))
    });
  }
  const ahead = days.filter((x) => x.date >= today);
  const todayRow = days.find((x) => x.today) || null;
  const lowest = ahead.reduce((lo, x) => (lo === null || x.cash < lo.cash ? x : lo), null);
  const nextPay = future.filter((i) => i.kind === 'paycheck' && i.amount !== null).map((i) => i.date).sort()[0] || null;
  // Safe to spend (S-095): money spent today lowers every day after it, so the limit is the lowest
  // point anywhere ahead (through the horizon) less the cushion, never more than today's checking,
  // and never below $0. Below 0, the shortfall and its day are given instead.
  const raw = lowest && todayRow ? r2(Math.min(lowest.cash - cushion, todayRow.cash)) : null;
  const safe = raw === null ? null : Math.max(0, raw);
  const shortfall = raw !== null && raw < 0 ? { amount: r2(cushion - lowest.cash), date: lowest.date } : null;
  return {
    today, horizon, start, end, cushion, days, unknownStart,
    todayCash: todayRow ? todayRow.cash : null,
    lowest: lowest ? { date: lowest.date, amount: lowest.cash } : null,
    belowZero: ahead.filter((x) => x.cash < 0).length,
    belowCushion: ahead.filter((x) => x.cash < cushion).length,
    nextPayday: nextPay,
    paydays: future.filter((i) => i.kind === 'paycheck' && i.amount !== null).map((i) => i.date).sort(),
    safeToSpend: safe,
    shortfall,
    waiting, scheduled: allItems.filter((i) => monthOf(i.planned) >= openFrom),
    spreads,
    payLater: payLaterFlags(days, future, cushion)
  };
}

/**
 * A bill that lands while cash is below the cushion is really paid by the next paycheck after it:
 * "Rent is due the 1st, paid the 5th". The biggest bill of the day is the one named.
 * @param {object[]} days the calendar's days
 * @param {object[]} future scheduled items still ahead
 * @param {number} cushion dollars
 * @returns {Array<{name: string, key: string, due: string, paidBy: string, gap: number, cashThatDay: number, amount: number}>}
 *   gap in days; amounts in dollars
 */
export function payLaterFlags(days, future, cushion) {
  const pays = future.filter((i) => i.kind === 'paycheck' && i.amount !== null).map((i) => i.date).sort();
  const out = [];
  for (const day of days) {
    const bills = day.items.filter((i) => i.type === 'scheduled' && (i.kind === 'bill' || i.kind === 'debt') && i.cash && i.flow < 0);
    if (!bills.length || day.cash >= cushion) continue;
    const big = bills.reduce((a, b) => (b.flow < a.flow ? b : a));
    const paidBy = pays.find((p) => p > day.date) || null;
    if (!paidBy) continue;
    out.push({ name: big.name, key: big.key, due: day.date, paidBy, gap: daysBetween(day.date, paidBy), cashThatDay: day.cash, amount: -big.flow });
  }
  return out;
}

/**
 * The month's predicted end cash as of the 1st: start cash + paychecks - bills and payments from cash
 * accounts - the whole plan spread (nothing logged yet).
 * @param {object} doc the household file
 * @param {object} income the income summary (summary.income)
 * @param {string} month 'YYYY-MM'
 * @returns {?number} dollars; null when any checking account has neither a typed start for the month nor an
 *   end for the month before (the start carried forward)
 */
export function forecastFor(doc, income, month) {
  const accts = (doc.accounts || []).filter((a) => a.state !== 'archived');
  const byId = Object.fromEntries(accts.map((a) => [a.id, a]));
  const def = defaultAccount(doc);
  let startCash = 0;
  for (const a of accts.filter(inCalendar)) {
    const b = ((doc.balances[month] || {})[a.id] || {}).start;
    const prev = (((doc.balances[monthOf(addDays(month + '-01', -1))]) || {})[a.id] || {}).end;
    const s = b && b.amount !== null ? b.amount : prev && prev.amount !== null ? prev.amount : null;
    if (s === null) return null;
    startCash += s;
  }
  const s = scheduledItems(doc, month, income);
  // The spread as seen from the day before the 1st with an empty log: the whole plan is still ahead.
  const sp = spreadFor(doc, month, addDays(month + '-01', -1), s, []);
  const cashOf = (id) => { const a = byId[id] || byId[def]; return !!a && inCalendar(a); };
  let net = 0;
  for (const it of s.items) if (!it.skipped && it.amount !== null && cashOf(it.account)) net += it.dir === 'in' ? it.amount : -it.amount;
  for (const u of sp.units) if (cashOf(u.account)) net -= u.left;
  return r2(startCash + net);
}

/**
 * Predicted on the 1st (saved in doc.cashflow.forecasts) against the real end balance.
 * @param {object} doc the household file
 * @param {string} month 'YYYY-MM'
 * @returns {{month: string, predicted: ?number, actual: ?number, diff: ?number}} dollars; actual needs every
 *   checking account's month end; diff = actual - predicted
 */
export function forecastCheck(doc, month) {
  const saved = ((doc.cashflow || {}).forecasts || {})[month];
  const accts = (doc.accounts || []).filter((a) => a.state !== 'archived' && inCalendar(a));
  const ends = accts.map((a) => (((doc.balances[month] || {})[a.id] || {}).end || {}).amount);
  const actual = accts.length && ends.every((x) => x !== null && x !== undefined) ? r2(ends.reduce((a, x) => a + x, 0)) : null;
  const predicted = saved ? saved.predicted : null;
  return { month, predicted, actual, diff: predicted === null || actual === null ? null : r2(actual - predicted) };
}

/**
 * This month so far: plan (or estimate) vs logged per category, and what is left.
 * @param {object} doc the household file
 * @param {string} month 'YYYY-MM'
 * @param {string} today 'YYYY-MM-DD'; entries after it do not count
 * @returns {Array<{id: string, name: string, plan: ?number, logged: number, left: ?number}>} dollars a month;
 *   categories with nothing planned and nothing logged are left out
 */
export function monthSoFar(doc, month, today) {
  const { units, byLine } = lineAmounts(doc, month);
  const logged = loggedByLine(counted(doc.transactions), month, today);
  return units.map((u) => {
    // A line-level plan adds the lines that have a number; null when none has one (not 0).
    const plan = u.catLevel ? u.amount : u.lines.reduce((a, l) => (byLine[l.id] === null || byLine[l.id] === undefined ? a : (a === null ? 0 : a) + byLine[l.id]), null);
    const soFar = r2(u.lines.reduce((a, l) => a + (logged[l.id] || 0), 0));
    return { id: u.catId, name: u.name, plan, logged: soFar, left: plan === null ? null : r2(plan - soFar) };
  }).filter((r) => (r.plan !== null && r.plan !== 0) || r.logged !== 0);
}

const dollars = (x) => '$' + Math.round(Math.abs(x)).toLocaleString('en-US');
const nth = (iso) => { const d = Number(iso.slice(8)); const s = d % 10 === 1 && d !== 11 ? 'st' : d % 10 === 2 && d !== 12 ? 'nd' : d % 10 === 3 && d !== 13 ? 'rd' : 'th'; return 'the ' + d + s; };

const shortDay = (iso) => ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(iso.slice(5, 7)) - 1] + ' ' + Number(iso.slice(8));

/**
 * The safe-to-spend line for the screens (S-095).
 * @param {object} cal what cashCalendar returns
 * @returns {string} empty when there is no number yet
 */
export function safeReading(cal) {
  if (cal.safeToSpend === null) return '';
  if (cal.shortfall) return 'Nothing safe to spend right now. You\'ll be ' + dollars(cal.shortfall.amount) + ' under your cushion on ' + shortDay(cal.shortfall.date) + '.';
  return dollars(cal.safeToSpend) + ' is safe to spend: the lowest point ahead stays at or above your cushion.';
}

/**
 * One or two plain sentences on the calendar, no verdicts.
 * @param {object} cal what cashCalendar returns
 * @returns {string}
 */
export function calendarReading(cal) {
  if (!cal.lowest) return 'Add a balance for an account to see cash by day.';
  const out = [];
  const lo = cal.lowest;
  const before = (cal.paydays || []).includes(addDays(lo.date, 1)) ? ', the day before payday' : '';
  out.push('Your lowest point is ' + (lo.amount < 0 ? 'minus ' : '') + dollars(lo.amount) + ' on ' + nth(lo.date) + before + '.');
  for (const f of cal.payLater.slice(0, 2)) out.push(f.name + ' lands ' + f.gap + ' day' + (f.gap === 1 ? '' : 's') + ' before the paycheck that covers it.');
  return out.join(' ');
}

/**
 * So far and expected by month end (S-128), for the open month only. Money that has not arrived is never
 * counted as actual:
 *   so far   = income logged up to today - spending logged up to today (spending lines, not savings)
 *   expected = so far + paychecks still to come this month - bills and loan payments still to come
 *              - the rest of the plan for each spread line (plan - logged, never below 0)
 * "Still to come" is the calendar's own projection (cashCalendar): its waiting and scheduled items and
 * its spread, never a second engine. A card payment is left out: the charges were spending when logged.
 * @param {object} doc the household file
 * @param {object} income the income summary (summary.income)
 * @param {string} today 'YYYY-MM-DD'
 * @returns {?object} dollars for the month: { soFar, expected, incomeSoFar, spentSoFar, paychecks, bills,
 *   planLeft, items, rest, noPayDate }; null for a closed month or a day outside the open month
 */
export function monthOutlook(doc, income, today) {
  const month = monthOf(today);
  if (month !== doc.currentMonth || (doc.months || []).some((m) => m.key === month)) return null;
  const savingsLines = new Set((doc.categories || []).filter((c) => c.savings).flatMap((c) => c.lines.map((l) => l.id)));
  const entries = counted(doc.transactions || []).filter((e) => !e.adjust && monthOf(e.date) === month && e.date <= today);
  // Income entries are negative (money in), so the sum is negated.
  const incomeSoFar = r2(entries.filter((e) => e.kind === 'income').reduce((a, e) => a - e.amount, 0));
  const spentSoFar = r2(entries.filter((e) => COUNTS.has(e.kind) && e.lineId && !savingsLines.has(e.lineId)).reduce((a, e) => a + e.amount, 0));
  const soFar = r2(incomeSoFar - spentSoFar);
  const cal = cashCalendar(doc, income, { today, horizon: Math.max(1, daysBetween(today, dateIn(month, 31))) });
  const toCome = [...cal.waiting, ...cal.scheduled.filter((i) => !i.skipped && !i.confirmed && i.date > today)]
    .filter((i) => monthOf(i.date) === month && i.amount !== null && !(i.kind === 'debt' && i.card) && !(i.lineId && savingsLines.has(i.lineId)));
  const seen = new Set();
  const items = toCome.filter((i) => (seen.has(i.key) ? false : seen.add(i.key))).map((i) => ({ date: i.date, name: i.name, kind: i.kind, amount: i.dir === 'in' ? i.amount : -i.amount }));
  const sp = cal.spreads[month];
  const rest = sp ? sp.units.filter((u) => !u.lineIds.some((id) => savingsLines.has(id))).map((u) => ({ name: u.name, plan: u.plan, logged: u.logged, left: u.left })) : [];
  const paychecks = r2(items.filter((i) => i.amount > 0).reduce((a, i) => a + i.amount, 0));
  const bills = r2(-items.filter((i) => i.amount < 0).reduce((a, i) => a + i.amount, 0));
  const planLeft = r2(rest.reduce((a, u) => a + u.left, 0));
  // An income with no pay date has no paychecks on the calendar, so none are expected: named, not guessed.
  const noPayDate = (doc.income || []).filter((i) => i.state !== 'archived' && payDates(i, month) === null).map((i) => i.label);
  return { month, today, incomeSoFar, spentSoFar, soFar, paychecks, bills, planLeft, items, rest, noPayDate, expected: r2(soFar + paychecks - bills - planLeft) };
}
