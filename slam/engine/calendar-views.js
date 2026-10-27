// Readings of the one day-by-day run for the calendar's views (S-204): weeks
// (in, out, ending balance), the next-14-days agenda, the year strip with the
// tight months, each paycheck with what it covers and the bonus paychecks (a
// third biweekly or fifth weekly pay in a month), the milestones, and a text
// search over the events. Views only format what comes back.

import { round2, addDays, daysBetween, monthKey, monthEnd } from './spine.js';
import { cashsim } from './cashsim.js';
import { windfall } from './windfall.js';
import { longDate } from './flags.js';
import { payDatesIn, calendar } from './calendar.js';
import * as C from './vendor/cashcal.js';
import { maxItDeadlines } from './maxit.js';
import { setAsideWords, setAsideNote } from './networth.js';

const weekdayOf = (iso) => new Date(iso + 'T00:00:00Z').getUTCDay();
const PER_MONTH = { weekly: 52 / 12, biweekly: 26 / 12 };

// Weeks (Sunday to Saturday) across the simulation: what came in, what went
// out, where checking ends, and the week's lowest day.
// startsOn: 0 for Sunday (the default), 1 for Monday (Preferences).
export function weeks(sim, { startsOn = 0 } = {}) {
  const out = [];
  let i = 0;
  const days = sim.daily;
  while (i < days.length) {
    const first = days[i];
    const span = 7 - ((weekdayOf(first.date) - startsOn + 7) % 7);
    const slice = days.slice(i, i + span);
    const last = slice[slice.length - 1];
    const lowest = slice.reduce((a, d) => (d.primary < a.primary ? d : a), slice[0]);
    out.push({
      from: first.date, to: last.date,
      in: round2(slice.reduce((x, d) => x + d.in, 0)), out: round2(slice.reduce((x, d) => x + d.out, 0)),
      start: round2(i > 0 ? days[i - 1].primary : sim.checking.known ? sim.checking.open : first.primary),
      end: last.primary, low: { date: lowest.date, amount: lowest.primary }, underFloor: lowest.primary < sim.floor.amount,
      hasLow: slice.some((d) => d.date === sim.low.date),
      events: slice.flatMap((d) => d.events.filter((e) => e.kind !== 'everyday' && e.kind !== 'statement').map((e) => ({ date: d.date, ...e })))
    });
    i += span;
  }
  return out;
}

// The next N days, each with what lands (everyday spending folded into one line) and where checking ends.
export function agenda(sim, n = 14) {
  // By date (S-209, the Budget's list): every movement with checking after it and where it came from:
  // scheduled (the plan), happened (a scheduled item the log confirmed), logged (from the log), maybe.
  const primary = sim.model.accounts.find((a) => a.primary) || null;
  const pid = primary ? primary.id : null;
  const tagged = (date, label, list) => (list || []).some((x) => x.date === date && x.label === label);
  let prev = primary && sim.checking.known ? sim.checking.open : null;
  const out = [];
  for (const d of sim.daily.slice(0, n)) {
    const cashDaily = round2(d.events.filter((e) => e.kind === 'everyday' && !e.card).reduce((x, e) => x + e.amount, 0));
    const cardDaily = round2(d.events.filter((e) => e.kind === 'everyday' && e.card).reduce((x, e) => x + e.amount, 0));
    const events = d.events.filter((e) => e.kind !== 'everyday');
    if (cashDaily) events.push({ kind: 'everyday', label: 'Everyday spending, spread by day', amount: cashDaily, account: pid });
    if (cardDaily) events.push({ kind: 'everyday', label: 'Everyday spending on cards, spread by day', amount: cardDaily, card: true });
    let run = prev;
    const rows = events.map((e) => {
      const onChecking = run !== null && e.kind !== 'shortfall' && e.kind !== 'statement' && sim.checking.ids.includes(e.account) && !e.card && typeof e.amount === 'number';
      if (onChecking) run = round2(run + e.amount);
      const source = e.kind === 'log' || tagged(d.date, e.label, (sim.fromLog || []).filter((x) => x.kind === 'income')) ? 'logged' : tagged(d.date, e.label, (sim.claims || []).filter((c) => c.inRun)) ? 'happened' : e.kind === 'maybe-in' ? 'maybe' : 'scheduled';
      return { ...e, after: onChecking ? run : null, source };
    });
    prev = d.primary;
    if (rows.length) out.push({ date: d.date, events: rows, end: d.primary, isLow: d.date === sim.low.date, underFloor: d.primary < sim.floor.amount });
  }
  return out;
}

// Twelve months at a glance: in, out, net, the lowest day, and whether the month is tight
// (the lowest day within a week of everyday spending of the floor).
export function yearStrip(spine, rules, { asOf = spine.meta.asOf, maybeMode = 'weighted', sim = null } = {}) {
  const r = sim && sim.days >= 365 ? sim : cashsim(spine, rules, { asOf, months: 12, maybeMode });
  const week = (r.everydayPerDay || 0) * 7;
  // Each month's account deadlines (S-211) ride along, so the strip shows them as chips with a link each.
  // The first month starts partway when the numbers do ("from Oct 22"): the days before are left out of it.
  const months = Object.keys(r.monthly).sort().slice(0, 12).map((ym, i) => { const m = r.monthly[ym]; return { ym, from: i === 0 && r.start.slice(0, 7) === ym && r.start.slice(8) !== '01' ? r.start : null, in: m.in, out: m.out, net: m.net, low: m.low, interest: m.interest, tight: m.low < r.floor.amount + week, underFloor: m.low < r.floor.amount, deadlines: maxItDeadlines(spine, rules, ym + '-01', monthEnd(ym), { asOf, claims: r.claims }) }; });
  return { months, floor: r.floor.amount, tightWeek: round2(week), tightCount: months.filter((m) => m.tight).length, kind: r.kind, from: r.from, rough: r.rough, missing: r.missing, rules: r.rules };
}

// Each paycheck, what it has to cover until the next one, and what is left. A
// bonus paycheck is the third biweekly or the fifth weekly pay of one stream
// in a month; what it could do is the first step of the windfall order that
// takes money (the house order, S-201).
export function paychecks(spine, rules, sim, s) {
  const streams = spine.income || [];
  // Which pay of the month this is, counted over every pay date in the calendar month (the ones before the as-of date too).
  const list = sim.paychecks.map((p) => {
    const src = streams.find((x) => x.label === p.label || p.label.startsWith(x.label));
    const ym = monthKey(p.date);
    const all = src && (src.cadence === 'weekly' || src.cadence === 'biweekly') ? payDatesIn(src.start, src.cadence, src.end, ym) : [];
    const n = all.length ? all.indexOf(p.date) + 1 : null;
    return { ...p, streamId: src ? src.id : null, cadence: src ? src.cadence : null, ym, n: n || null, of: all.length || null, path: src ? 'income.' + src.id + '.amount' : null };
  });
  for (const p of list) {
    p.bonus = (p.cadence === 'biweekly' && p.n === 3) || (p.cadence === 'weekly' && p.n === 5);
    p.bonusWhy = p.bonus ? 'The ' + (p.cadence === 'biweekly' ? 'third biweekly' : 'fifth weekly') + ' paycheck in ' + longDate(p.date).replace(/ \d+,/, ',') + ': monthly bills are already covered by the others.' : null;
    if (p.bonus && s) {
      const w = windfall(spine, rules, s, { amount: p.amount, taxed: true });
      const first = w.steps.find((x) => x.amount > 0);
      p.couldDo = first ? { step: first.id, label: first.label, amount: first.amount, why: first.why } : null;
    }
    p.coverage = p.amount ? round2(p.bills.reduce((x, b) => x + b.amount, 0) / p.amount) : null;
    p.short = p.left < 0;
  }
  return list;
}

// Milestones inside the window: a card cleared, a loan paid off, every card
// free, high-interest free, debt free, a promo ending, income starting or ending.
export function milestones(spine, rules, sim, months = []) {
  const out = [];
  const add = (date, label, kind, path = null, note = null, accountId = null) => { if (date && date >= sim.start) out.push({ date, label, kind, path, note, ...(accountId ? { accountId } : {}) }); };
  for (const [id, d] of Object.entries(sim.clearDates.perCard)) { const c = sim.cards[id]; if (d && d > sim.start) add(d, (c ? c.name : id) + ' cleared', 'cleared', c ? c.path : null, 'stopped revolving: the statement was paid in full'); }
  for (const [id, l] of Object.entries(sim.loans)) if (l.paidOff) add(l.paidOff, l.name + ' paid off', 'paidOff', l.path);
  if (sim.clearDates.cardsFree && sim.clearDates.cardsFree > sim.start) add(sim.clearDates.cardsFree, 'Every card clear', 'cardsFree');
  if (sim.clearDates.hiFree && sim.clearDates.hiFree > sim.start) add(sim.clearDates.hiFree, 'High-interest free (nothing above ' + Math.round(sim.clearDates.hiRate * 100) + '%)', 'hiFree');
  if (sim.clearDates.allFree && sim.clearDates.allFree > sim.start) add(sim.clearDates.allFree, 'Debt free', 'allFree');
  if (sim.dryDate && sim.checking.known) add(sim.dryDate, 'Cash under the floor', 'dry', null, 'every cash account added up' + (sim.model.accounts.some((a) => a.earmarked) ? ', less money set aside for a goal,' : '') + ' falls under the floor');
  for (const m of months) for (const e of m.events) if (['promoEnds', 'bonusBy', 'incomeStarts', 'incomeEnds', 'expenseStarts', 'expenseEnds', 'coverage', 'situation', 'taxReturn', 'maxDeadline'].includes(e.kind) && e.date) add(e.date, e.label, e.kind, e.path, e.kind === 'maxDeadline' ? e.note : null, e.accountId || null);
  const seen = new Set();
  return out.filter((m) => { const k = m.date + '|' + m.label; if (seen.has(k)) return false; seen.add(k); return true; }).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// Events whose words match a search, across the months given.
export function searchEvents(months, q) {
  const needle = String(q || '').trim().toLowerCase();
  if (!needle) return [];
  return months.flatMap((m) => m.events.filter((e) => (e.label + ' ' + (e.note || '') + ' ' + e.kind).toLowerCase().includes(needle)).map((e) => ({ ...e, ym: m.ym })));
}

// Pay-later flags (S-209, from the Budget calendar's S-095 flag): a bill or payment that lands while checking
// sits under the tight line (the floor plus a week of everyday spending, the year strip's own line), with a
// paycheck still to come after it: it is paid before the paycheck that covers it. The biggest such payment
// on each tight day, with the paycheck that covers it and the gap in days.
export function payLaterFlags(sim) {
  if (!sim.checking.known) return { flags: [], line: null, floor: sim.floor.amount, week: null };
  const week = (sim.everydayPerDay || 0) * 7;
  const line = sim.floor.amount + week;
  const pays = sim.daily.filter((d) => d.events.some((e) => e.kind === 'income')).map((d) => d.date);
  const out = [];
  for (const d of sim.daily) {
    if (d.primary >= line) continue;
    const due = d.events.filter((e) => ['bill', 'card-payment', 'loan-payment', 'paylater'].includes(e.kind) && e.amount < 0 && !e.card);
    if (!due.length) continue;
    const big = due.reduce((a, e) => (e.amount < a.amount ? e : a));
    const paidBy = pays.find((p) => p > d.date) || null;
    if (!paidBy) continue;
    out.push({ label: big.label, due: d.date, amount: Math.abs(big.amount), paidBy, gap: daysBetween(d.date, paidBy), cashThatDay: d.primary, line: Math.round(line * 100) / 100 });
  }
  return { flags: out, line: Math.round(line * 100) / 100, floor: sim.floor.amount, week: Math.round(week * 100) / 100 };
}

// Cash by day (S-209, the Budget calendar's chart): checking every day, past and ahead, with savings
// apart, the floor, paydays and the biggest bill. Ahead is the run from the as-of date. The past is
// read from what the household recorded: each check-in's checking balance, carried day by day with
// the cash entries in the log (income and refunds in, spending out; card spending moves no cash), and
// before the first check-in in range, walked back from it. A day with nothing to read is missing.
// The range around the cash line (Track C): the same days run without any maybe money and with all of it at its
// likely amount, beside the line itself; each day's lowest and highest checking. null when they never differ.
export function cashRange(spine, rules, line, { months = 1, from = null } = {}) {
  if (!line) return null;
  const others = ['ignore', 'likely'].map((maybeMode) => cashLine(spine, cashsim(spine, rules, { months, maybeMode }), { from }));
  const by = (l) => new Map(((l && l.days) || []).map((d) => [d.date, d.checking]));
  const maps = others.map(by);
  const low = [], high = [];
  let differs = false;
  for (const d of line.days) {
    if (d.checking === null || d.checking === undefined) continue;
    const xs = [d.checking, ...maps.map((m) => m.get(d.date)).filter((x) => typeof x === 'number')];
    const lo = Math.min(...xs), hi = Math.max(...xs);
    if (hi - lo >= 1) differs = true;
    low.push({ date: d.date, checking: lo }); high.push({ date: d.date, checking: hi });
  }
  return differs ? { low, high } : null;
}

export function cashLine(spine, sim, { from = null } = {}) {
  if (!sim || !sim.daily.length || !sim.checking.known) return null;
  const asOf = sim.start, primary = sim.model.accounts.find((a) => a.primary);
  if (!primary) return null;
  // Money set aside for a goal is not savings to fall back on (S-228): it is listed apart, by its goal, never in the line.
  const savingsIds = sim.model.accounts.filter((a) => !a.primary && !a.earmarked && (a.cushion || a.type === 'savings' || a.type === 'hysa')).map((a) => a.id);
  const setAside = sim.model.accounts.filter((a) => a.earmarked).map((a) => ({ id: a.id, name: a.name, goal: a.goal || null, words: setAsideWords(a.goal), balance: round2(a.balance / 100) }));
  const cardIds = new Set((spine.debts || []).filter((d) => d.type === 'credit_card').map((d) => d.id));
  const flow = new Map();
  for (const e of spine.log || []) {
    if (e.date >= asOf || (e.paidWith && cardIds.has(e.paidWith))) continue;
    const x = e.kind === 'income' || e.kind === 'refund' ? e.amount : -e.amount;
    flow.set(e.date, round2((flow.get(e.date) || 0) + x));
  }
  // Checking is every checking account together (S-209): a check-in anchors the past only when it has all of them.
  const ids = sim.checking.ids;
  const anchors = [...(spine.checkins || []).filter((c) => c.date < asOf && ids.every((id) => typeof (c.balances || {})[id] === 'number')).map((c) => ({ date: c.date, amount: round2(ids.reduce((x, id) => x + c.balances[id], 0)) })), { date: asOf, amount: sim.checking.open }].sort((a, b) => (a.date < b.date ? -1 : 1));
  const start = from || asOf.slice(0, 7) + '-01';
  const past = [];
  for (let d = start; d < asOf; d = addDays(d, 1)) {
    const a = [...anchors].reverse().find((x) => x.date <= d);
    let end;
    if (a) { end = a.amount; for (let x = a.date; x <= d; x = addDays(x, 1)) end += flow.get(x) || 0; }
    else { const b = anchors.find((x) => x.date > d); end = b.amount; for (let x = addDays(d, 1); x < b.date; x = addDays(x, 1)) end -= flow.get(x) || 0; }
    past.push({ date: d, checking: round2(end), savings: null, debt: null, past: true, payday: (spine.log || []).some((e) => e.date === d && e.kind === 'income'), big: null, under: round2(end) < sim.floor.amount });
  }
  const ahead = sim.daily.map((d) => {
    const outs = d.events.filter((e) => ['bill', 'card-payment', 'loan-payment', 'paylater'].includes(e.kind) && !e.card && e.amount <= -100);
    const big = outs.length ? outs.reduce((m, e) => (e.amount < m.amount ? e : m)) : null;
    // All debt that day (cards and loans), drawn as its own labeled line (Batch 6).
    return { date: d.date, checking: d.primary, debt: d.debt, savings: savingsIds.length ? round2(savingsIds.reduce((x, id) => x + (d.balances[id] || 0), 0)) : null, past: false, payday: d.events.some((e) => e.kind === 'income'), big: big ? { label: big.label, amount: -big.amount } : null, under: d.primary < sim.floor.amount };
  });
  const days = [...past, ...ahead];
  const values = days.flatMap((d) => [d.checking, d.savings, d.debt]).filter((x) => x !== null && x !== undefined);
  const earliest = anchors[0].date;
  const lowDay = ahead.reduce((m, d) => (d.checking < m.checking ? d : m));
  const pays = new Set(ahead.filter((d) => d.payday).map((d) => d.date));
  const cushionNames = sim.model.accounts.filter((a) => a.cushion && !a.earmarked).map((a) => a.name);
  const topped = sim.daily.find((d) => d.events.some((e) => e.kind === 'auto-cover' && cushionNames.some((nm) => e.label.startsWith('From ' + nm))));
  const low = { date: lowDay.date, amount: lowDay.checking, beforePayday: pays.has(addDays(lowDay.date, 1)), toppedFrom: topped ? topped.date : null };
  return { days, low, asOf, floor: sim.floor.amount, min: Math.min(0, sim.floor.amount, ...values), max: Math.max(...values), savingsIds, setAside, setAsideNote: setAsideNote(setAside), earliest, backTo: earliest.slice(0, 7) < asOf.slice(0, 7) ? earliest.slice(0, 7) : null, anchors: anchors.length };
}

// Waiting (S-209, the Budget's "Scheduled, on or before today"): each paycheck, bill and subscription
// dated from the start of the as-of month up to today that is not logged as happened and not skipped.
// Before the as-of date the balance already holds it; asking keeps the log true for estimated vs actual.
export function waiting(spine, rules, { today }) {
  const asOfYm = spine.meta.asOf.slice(0, 7);
  const months = Math.max(1, (+today.slice(0, 4) - +asOfYm.slice(0, 4)) * 12 + (+today.slice(5, 7) - +asOfYm.slice(5, 7)) + 1);
  const c = calendar(spine, rules, { from: asOfYm, months: Math.min(months, 3) });
  return c.months.flatMap((m) => m.events).filter((e) => e.confirmable && !e.logged && !e.skipped && e.date && e.date <= today).sort((a, b) => (a.date < b.date ? -1 : 1));
}

// Accounts the run had to leave out (S-209): none at all (no cash account with a balance), or the
// ones with no balance, named with the field that fills them. Empty is not zero: nothing is guessed.
export function accountGaps(spine, sim) {
  const missing = ((sim && sim.needs) || []).filter((n) => n.path && /^accounts\.[^.]+\.balance$/.test(n.path)).map((n) => ({ path: n.path, name: String(n.what).replace(/: balance$/, '') }));
  const none = !sim || !sim.model.accounts.length;
  const main = (spine.accounts || []).find((a) => a.family === 'cash');
  const noChecking = !(spine.accounts || []).some((a) => a.family === 'cash' && a.type === 'checking');
  return { none, checking: !!(sim && sim.checking.known), noChecking, missing, fix: noChecking ? null : (sim && sim.checking.path) || (main ? 'accounts.' + main.id + '.balance' : null) };
}

// The month's cash reading in words (S-209, the Budget calendar's sentences): checking on the
// as-of day, the lowest day and whether it is the day before a paycheck, and how many days sit
// below zero, under the floor, or are topped up from the cushion. Read from the run, one month.
export function cashReading(sim, ym) {
  if (!sim || !sim.checking.known) return null;
  const days = sim.daily.filter((d) => d.date.slice(0, 7) === ym);
  if (!days.length) return null;
  const cushion = sim.model.accounts.filter((a) => a.cushion && !a.earmarked);
  const low = days.reduce((m, d) => (d.primary < m.primary ? d : m));
  const pays = new Set(sim.daily.filter((d) => d.events.some((e) => e.kind === 'income')).map((d) => d.date));
  const floor = sim.floor.amount;
  const below = days.filter((d) => d.primary < 0), under = days.filter((d) => d.primary < floor), topped = days.filter((d) => d.events.some((e) => e.kind === 'auto-cover' && cushion.some((a) => e.label.startsWith('From ' + a.name))));
  return {
    // Checking as it was checked in, before that day's items (S-209 review), so a fresh check-in reads back as typed.
    ym, today: sim.daily[0].date.slice(0, 7) === ym ? { date: sim.daily[0].date, amount: sim.checking.open } : null,
    low: { date: low.date, amount: low.primary, beforePayday: pays.has(addDays(low.date, 1)) },
    belowZero: { days: below.length, first: below.length ? below[0].date : null },
    underFloor: { days: floor > 0 ? under.length : 0, first: floor > 0 && under.length ? under[0].date : null, floor },
    toppedUp: { days: topped.length, first: topped.length ? topped[0].date : null }
  };
}

// Bill timing (S-209, the Budget calendar's what-if, done the v44 way): for each movable bill and each card,
// the due day that raises the lowest point the most, tried every third day on the same run, with a script
// to ask for it. Only fixes that raise the low are kept, the best three.
export function billTiming(sim, rules) {
  const year = +sim.start.slice(0, 4);
  const r = C.billTimingFixes(sim.model, { maybeMode: sim.mode, penaltyMonths: rules.get('CARD_PENALTY_MONTHS', year) });
  const d = (c) => (c === null || c === undefined ? null : Math.round(c) / 100);
  return { lowNow: { date: r.base.low.date, amount: d(r.base.low.cents) }, tried: r.tried, fixes: r.fixes.map((f) => ({ id: f.id, kind: f.kind, label: f.label, from: f.from, to: f.to, gain: d(f.gain), lowAfter: { date: f.lowAfter.date, amount: d(f.lowAfter.cents) }, shortfallsBefore: f.shortfallsBefore, shortfallsAfter: f.shortfallsAfter, script: f.script, path: f.kind === 'card' ? 'debts.' + f.id + '.dueDay' : 'expenses.' + f.id + '.payDay' })) };
}

// Pills on an event (S-204, S-209): sub, plan, repeat, locked, logged (it happened, in the log) or done (past), maybe.
export function pillsFor(e, asOf, cal = {}) {
  const pills = [];
  if (e.kind === 'subscription') pills.push('sub');
  if (e.kind === 'debt' && e.plan) pills.push('plan');
  if (e.repeats) pills.push('repeat');
  if (e.key && cal.locks && cal.locks[e.key]) pills.push('locked');
  // A paycheck or bill before the as-of date that nobody has marked is waiting, not done (S-209 review).
  if (e.logged) pills.push('logged'); else if (e.date && e.date < asOf) pills.push(e.confirmable ? 'waiting' : 'done');
  if (e.kind === 'maybe') pills.push('maybe');
  return pills;
}

// One calendar item, as its own screen (S-230, the shell): calendar.html#/<day>/<item>. An occurrence goes by its
// key, a maybe item by its id, anything else by its id on its day. itemDay says where the item is now, from what is
// saved: a moved occurrence is on its new day, a maybe item on its own day; null when it was skipped, is back in the
// tray, or is gone. The page opens the day's month and finds it there.
export const itemId = (e) => (e.kind === 'maybe' ? 'maybe:' + e.maybeId : e.key || e.id);
export function itemDay(spine, id, date) {
  const cal = spine.calendar || {};
  const day = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(String(d)) ? d : null);
  if (String(id).startsWith('maybe:')) { const m = (cal.maybe || []).find((x) => 'maybe:' + x.id === id); return m ? day(m.date) : null; }
  if (String(id).includes('|')) { const ov = (cal.overrides || {})[id]; return ov && ov.skip ? null : day(ov && ov.date ? ov.date : String(id).split('|')[1]); }
  return day(date);
}

export { daysBetween, addDays };
