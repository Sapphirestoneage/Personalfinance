// Readings of the one day-by-day run for the calendar's views (S-204): weeks
// (in, out, ending balance), the next-14-days agenda, the year strip with the
// tight months, each paycheck with what it covers and the bonus paychecks (a
// third biweekly or fifth weekly pay in a month), the milestones, and a text
// search over the events. Views only format what comes back.

import { round2, addDays, daysBetween, monthKey } from './spine.js';
import { cashsim } from './cashsim.js';
import { windfall } from './windfall.js';
import { longDate } from './flags.js';
import { payDatesIn } from './calendar.js';

const weekdayOf = (iso) => new Date(iso + 'T00:00:00Z').getUTCDay();
const PER_MONTH = { weekly: 52 / 12, biweekly: 26 / 12 };

// Weeks (Sunday to Saturday) across the simulation: what came in, what went
// out, where checking ends, and the week's lowest day.
export function weeks(sim) {
  const out = [];
  let i = 0;
  const days = sim.daily;
  while (i < days.length) {
    const first = days[i];
    const span = 7 - weekdayOf(first.date);
    const slice = days.slice(i, i + span);
    const last = slice[slice.length - 1];
    const lowest = slice.reduce((a, d) => (d.primary < a.primary ? d : a), slice[0]);
    out.push({
      from: first.date, to: last.date,
      in: round2(slice.reduce((x, d) => x + d.in, 0)), out: round2(slice.reduce((x, d) => x + d.out, 0)),
      start: round2(i > 0 ? days[i - 1].primary : sim.model.accounts.find((a) => a.primary) ? sim.model.accounts.find((a) => a.primary).balance / 100 : first.primary),
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
  return sim.daily.slice(0, n).map((d) => {
    const everyday = round2(d.events.filter((e) => e.kind === 'everyday').reduce((x, e) => x + e.amount, 0));
    const events = d.events.filter((e) => e.kind !== 'everyday');
    if (everyday) events.push({ kind: 'everyday', label: 'Everyday spending, spread by day', amount: everyday });
    return { date: d.date, events, end: d.primary, isLow: d.date === sim.low.date, underFloor: d.primary < sim.floor.amount };
  }).filter((d) => d.events.length);
}

// Twelve months at a glance: in, out, net, the lowest day, and whether the month is tight
// (the lowest day within a week of everyday spending of the floor).
export function yearStrip(spine, rules, { asOf = spine.meta.asOf, maybeMode = 'weighted', sim = null } = {}) {
  const r = sim && sim.days >= 365 ? sim : cashsim(spine, rules, { asOf, months: 12, maybeMode });
  const week = (r.everydayPerDay || 0) * 7;
  const months = Object.keys(r.monthly).sort().slice(0, 12).map((ym) => { const m = r.monthly[ym]; return { ym, in: m.in, out: m.out, net: m.net, low: m.low, interest: m.interest, tight: m.low < r.floor.amount + week, underFloor: m.low < r.floor.amount }; });
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
  const add = (date, label, kind, path = null, note = null) => { if (date && date >= sim.start) out.push({ date, label, kind, path, note }); };
  for (const [id, d] of Object.entries(sim.clearDates.perCard)) { const c = sim.cards[id]; if (d && d > sim.start) add(d, (c ? c.name : id) + ' cleared', 'cleared', c ? c.path : null, 'stopped revolving: the statement was paid in full'); }
  for (const [id, l] of Object.entries(sim.loans)) if (l.paidOff) add(l.paidOff, l.name + ' paid off', 'paidOff', l.path);
  if (sim.clearDates.cardsFree && sim.clearDates.cardsFree > sim.start) add(sim.clearDates.cardsFree, 'Every card clear', 'cardsFree');
  if (sim.clearDates.hiFree && sim.clearDates.hiFree > sim.start) add(sim.clearDates.hiFree, 'High-interest free (nothing above ' + Math.round(sim.clearDates.hiRate * 100) + '%)', 'hiFree');
  if (sim.clearDates.allFree && sim.clearDates.allFree > sim.start) add(sim.clearDates.allFree, 'Debt free', 'allFree');
  if (sim.dryDate) add(sim.dryDate, 'Cash under the floor', 'dry', null, 'every cash account added up falls under the floor');
  for (const m of months) for (const e of m.events) if (['promoEnds', 'incomeStarts', 'incomeEnds', 'expenseStarts', 'expenseEnds', 'coverage', 'situation', 'taxReturn'].includes(e.kind) && e.date) add(e.date, e.label, e.kind, e.path);
  const seen = new Set();
  return out.filter((m) => { const k = m.date + '|' + m.label; if (seen.has(k)) return false; seen.add(k); return true; }).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// Events whose words match a search, across the months given.
export function searchEvents(months, q) {
  const needle = String(q || '').trim().toLowerCase();
  if (!needle) return [];
  return months.flatMap((m) => m.events.filter((e) => (e.label + ' ' + (e.note || '') + ' ' + e.kind).toLowerCase().includes(needle)).map((e) => ({ ...e, ym: m.ym })));
}

// Pills on an event (S-204): sub, plan, repeat, locked, done, maybe.
export function pillsFor(e, asOf, cal = {}) {
  const pills = [];
  if (e.kind === 'subscription') pills.push('sub');
  if (e.kind === 'debt' && e.plan) pills.push('plan');
  if (e.repeats) pills.push('repeat');
  if (e.key && cal.locks && cal.locks[e.key]) pills.push('locked');
  if (e.date && e.date < asOf) pills.push('done');
  if (e.kind === 'maybe') pills.push('maybe');
  return pills;
}

export { daysBetween, addDays };
