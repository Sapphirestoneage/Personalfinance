// What goes into a tax-advantaged account in a year (S-211, S-214): what is
// already in (the recorded total for the year, plus what the monthly amount has
// put in since it was recorded, plus money rolled in from a 529; else the monthly
// amount for the months, or the owner's pay months, gone by) and what the monthly
// amount still puts in, on the owner's real paydays. engine/maxit.js (the room,
// the cash check) and engine/tax.js (pay taken off wages, the HSA deduction)
// both read it, so they count one amount.

import { valueOf as v, round2, monthKey, dayIn, monthStart, monthEnd, addDays, accountOwner, incomeOwner, ageOn } from './spine.js';
import { activeDays, streamWeight, payLinesFor } from './cashflow.js';
import * as C from './vendor/cashcal.js';
import { PER_YEAR, PRESETS, throughPayroll } from './schema.js';
import { money as fmt } from '../src/ui/format.js';

// Whole dollars read as whole dollars, anything else to the cent.
const money = (x) => (x === null || x === undefined ? 'missing' : fmt(x, Math.round(x) !== Math.round(x * 100) / 100));
const round4 = (x) => Math.round(x * 10000) / 10000;
const pad = (n) => String(n).padStart(2, '0');
// "9 months", "9.5 months of pay".
export const nMonths = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1)) + ' month' + (n === 1 ? '' : 's');

export const DEFERRAL = ['k401', 'roth_k401', 'k403b', 'tsp'];
// Plans filled only from a paycheck (an HSA set to go through payroll is too, else from take-home, answer 47; a Solo
// 401(k) and a SEP never are).
export const FROM_PAY = [...DEFERRAL, 'k457b', 'simple_ira', 'after_tax_k401'];
// The ones the tax figures take off W-2 wages (pre-tax from pay; a SIMPLE IRA too, for income tax, not FICA, answer
// 50): their new money is not pay an IRA can count either.
export const OFF_WAGES = FROM_PAY.filter((t) => PRESETS[t].taxTreatment === 'pretax' && (PRESETS[t].family === 'employerRetirement' || t === 'simple_ira'));
// Entries in a contributions list: rollovers and conversions never count; a 529 rolled into a Roth IRA does; employer marks a Solo 401(k)'s or SEP's employer part.
export const CONTRIBUTION_KINDS = ['contribution', 'rollover', 'conversion', 'from529', 'employer'];
export const counts = (c, year) => c.year === year && c.kind !== 'rollover' && c.kind !== 'conversion';
// A total for the year (contributions, or the employer part) as against an event added on top (a 529 rolled in).
const isTotal = (c) => !c.kind || c.kind === 'contribution' || c.kind === 'employer';

// ---------------------------------------------------------------- pay dates and months
// A stream's pay dates from `from` to `to` by its schedule, as the day-by-day run lays them out
// (engine/cashsim.js): weekly and biweekly from the start date, semimonthly from the pay day, the rest on the pay day.
export function payDatesOf(s, from, to) {
  const lo = s.start && s.start > from ? s.start : from, hi = s.end && s.end < to ? s.end : to;
  if (lo > hi || s.cadence === 'once') return s.cadence === 'once' && s.start >= from && s.start <= to ? [s.start] : [];
  const day = s.payDay ? v(s.payDay) : null;
  if (s.cadence === 'weekly' || s.cadence === 'biweekly') return s.start ? C.paydays(s.cadence, s.start, lo, hi) : [];
  if (s.cadence === 'semimonthly') return semimonthlyDates(s, lo, hi);
  return C.paydays('monthly', dayIn(monthKey(lo), day || 1), lo, hi);
}
// Twice a month (S-226): with both days entered, those two days each month (the 1st and the 15th; a day past the
// month's end is its last day); else the run's rule from the one day (cashcal.js paydays: a day before the 15th and 15
// days later, the 16th to the 27th and 15 days earlier, else the 15th and the last day). The calendar, the day-by-day
// run and the pay counts all place the two days with this, so their keys match.
export const payDay2Of = (s) => (s.cadence === 'semimonthly' && s.payDay && v(s.payDay) && s.payDay2 && v(s.payDay2) && v(s.payDay2) !== v(s.payDay) ? v(s.payDay2) : null);
export function semimonthlyDates(s, from, to) {
  const day = s.payDay ? v(s.payDay) : null, day2 = payDay2Of(s);
  if (day2 === null) return C.paydays('semimonthly', dayIn(monthKey(from), day || 15), from, to);
  return [...new Set([day, day2].flatMap((d) => C.occurrences({ cadence: 'month', day: d }, from, to)))].sort();
}
// The owner's pay lines of these types that pay something (a line known to pay $0 holds no deferral). plan (optional): a
// plan from pay, which fills only from the pay it is paid through (engine/cashflow.js payLinesFor, answer 60).
export const earningFor = (spine, pid, types = ['w2', 'tips'], plan = null) => { const only = plan ? new Set(payLinesFor(spine, plan).map((s) => s.id)) : null; return (spine.income || []).filter((s) => types.includes(s.type) && incomeOwner(spine, s) === pid && streamWeight(s, 'committed') !== 0 && !(s.amount && v(s.amount) === 0) && (!only || only.has(s.id))); };
// A line's pay dates from `from` to `to` as the calendar has them: by its schedule, less the ones skipped, with the
// moved ones on their new day, and one logged as happened on the day it happened (a payday moved in from up to two
// months away counts; one moved out does not).
export const paydaysOf = (spine, s, from, to) => {
  const ov = (spine.calendar && spine.calendar.overrides) || {};
  const at = (d) => ov[s.id + '|' + d] || {};
  const key = 'sched:' + s.id + '|';
  const logged = new Map((spine.log || []).filter((x) => x.importKey && x.importKey.startsWith(key) && x.date).map((x) => [x.importKey.slice(key.length), x.date]));
  // A paycheck the day-by-day run matched to a logged or imported deposit (engine/cashsim.js claims), when the caller
  // passed the run's claims along (spine.payClaims, a Map of '<line>|<date>' to the day it came).
  if (spine.payClaims) for (const [k, d] of spine.payClaims) if (k.startsWith(s.id + '|') && !logged.has(k.slice(s.id.length + 1))) logged.set(k.slice(s.id.length + 1), d);
  // A paycheck logged as come has been paid, even when it is logged on the as-of day: it counts as the day before.
  const today = spine.meta && spine.meta.asOf;
  const paid = (d) => (today && d >= today ? addDays(today, -1) : d);
  return [...new Set(payDatesOf(s, addDays(from, -62), addDays(to, 62)).filter((d) => !at(d).skip).map((d) => (logged.has(d) ? paid(logged.get(d)) : at(d).date || d)).filter((d) => d >= from && d <= to))].sort();
};
// Whether the owner has a W-2 or tips line that pays (payroll saving needs pay to come out of).
export const hasPay = (spine, pid, plan = null) => earningFor(spine, pid, undefined, plan).length > 0;
// Whether the owner has a paycheck after `date` (within a year of it): a payroll plan can still be filled then.
export const paysAfter = (spine, pid, date) => { const end = (+date.slice(0, 4) + 1) + date.slice(4); return earningFor(spine, pid).some((s) => paydaysOf(spine, s, date, end).some((d) => d > date)); };
// Money that goes in from the owner's pay: a payroll-only plan always, an HSA set to go through payroll while the owner
// has pay (answer 47: off by default, so an HSA is paid in from take-home).
export const fromPayOf = (spine, a, pid) => FROM_PAY.includes(a.type) || (a.type === 'hsa' && throughPayroll(a) && hasPay(spine, pid, a));
// A pay line that pays in the year (a one-time line on its date in it).
const paysIn = (s, year) => !(s.start && s.start > year + '-12-31') && !(s.end && s.end < year + '-01-01') && (s.cadence !== 'once' || (!!s.start && s.start.slice(0, 4) === String(year)));
// The share of a month's pay (the owner's W-2 and tips paydays by schedule) on days that pass `keep` and are not
// skipped on the calendar; null when pay runs that month but its days are not known (a weekly or biweekly line with
// no first pay date).
function payShare(spine, pid, ym, keep, plan = null) {
  const runs = earningFor(spine, pid, undefined, plan).filter((s) => activeDays(s.start, s.end, ym) > 0);
  if (!runs.length) return 0;
  const all = runs.flatMap((s) => payDatesOf(s, monthStart(ym), monthEnd(ym)));
  // No payday this month: unknown only for a weekly or biweekly line with no first pay date, else none (a line that
  // ends before its payday in the month pays nothing that month).
  if (!all.length) return runs.some((s) => (s.cadence === 'weekly' || s.cadence === 'biweekly') && !s.start) ? null : 0;
  return runs.flatMap((s) => paydaysOf(spine, s, monthStart(ym), monthEnd(ym))).filter(keep).length / all.length;
}
// The months of payroll saving a set of the owner's paychecks in the year holds: each paycheck carries its line's
// share of the month's saving (by gross, as engine/cashflow.js payrollShares splits it) over that line's paychecks a
// month, so 26 biweekly paychecks hold 12 months and three in one month hold more than one (S-219). Null when a line's
// amount or schedule is not known (the month count stands in then).
// The share of a month's days some pay line of the owner runs, from `from` to `to` (either open).
function daysShare(spine, pid, ym, from, to, plan = null) {
  const days = activeDays(null, null, ym);
  return round4(Math.max(0, ...earningFor(spine, pid, undefined, plan).map((s) => activeDays(from && (!s.start || from > s.start) ? from : s.start, to && (!s.end || to < s.end) ? to : s.end, ym))) / days);
}
function payChecks(spine, pid, year, plan = null) {
  const lines = earningFor(spine, pid, undefined, plan).filter((s) => paysIn(s, year));
  if (!lines.length) return [];
  if (lines.some((s) => !PER_YEAR[s.cadence] || !s.amount || v(s.amount) === null || ((s.cadence === 'weekly' || s.cadence === 'biweekly') && !s.start))) return null;
  const g = (s) => v(s.amount) * PER_YEAR[s.cadence] / 12;
  const out = [];
  for (const s of lines) for (const d of paydaysOf(spine, s, year + '-01-01', year + '-12-31')) {
    const ym = monthKey(d);
    const G = lines.filter((x) => activeDays(x.start, x.end, ym) > 0).reduce((a, x) => a + g(x), 0);
    // A quarterly or yearly line is spread over the months, as payDatesOf and the tax figures have it: monthly dates.
    if (G) out.push({ date: d, w: (g(s) / G) * 12 / (s.cadence === 'quarterly' || s.cadence === 'yearly' ? 12 : PER_YEAR[s.cadence]) });
  }
  return out;
}
function payCheckMonths(spine, pid, year, keep, plan = null) {
  const cs = payChecks(spine, pid, year, plan);
  return cs === null ? null : round4(cs.filter((c) => keep(c.date)).reduce((a, c) => a + c.w, 0));
}
// What a monthly amount from pay puts in on the owner's paychecks that pass `keep`: each paycheck its own amount to the
// cent (as the day-by-day run deducts it). Null when a line's amount or schedule is not known.
export function payAmount(spine, pid, year, monthly, keep, plan = null) {
  const cs = payChecks(spine, pid, year, plan);
  return cs === null ? null : round2(cs.filter((c) => keep(c.date)).reduce((a, c) => a + round2(monthly * c.w), 0));
}
// Months of the owner's pay in a year before asOf: payroll saving is in for paydays before asOf (a payday on asOf is
// still to come), counted by the paychecks; with a line not known, an earlier month with pay counts whole and the as-of
// month the share of its paydays gone by.
export function payMonthsBefore(spine, pid, year, asOf, plan = null) {
  const byChecks = payCheckMonths(spine, pid, year, (d) => d < asOf, plan);
  if (byChecks !== null) return byChecks;
  let n = 0;
  for (let m = 1; m <= 12; m++) {
    const ym = year + '-' + pad(m);
    if (ym > monthKey(asOf)) break;
    n += ym < monthKey(asOf) ? (payShare(spine, pid, ym, () => true, plan) === 0 ? 0 : 1) : payShare(spine, pid, ym, (d) => d < asOf, plan) ?? daysShare(spine, pid, ym, null, addDays(asOf, -1), plan);
  }
  return round4(n);
}
// Months of the owner's pay from asOf through December 31 of the year: what payroll saving already set up still puts in.
export function payMonthsFrom(spine, pid, year, asOf, plan = null) {
  const byChecks = payCheckMonths(spine, pid, year, (d) => d >= asOf, plan);
  if (byChecks !== null) return byChecks;
  let n = 0;
  for (let m = 1; m <= 12; m++) {
    const ym = year + '-' + pad(m);
    if (ym < monthKey(asOf)) continue;
    // A month whose paydays are not known: whole, the as-of month by the days its pay runs from asOf (payMonthsBefore
    // counts the days before), so an ended line has none still to come.
    const share = payShare(spine, pid, ym, (d) => d >= asOf, plan);
    n += share !== null ? share : ym === monthKey(asOf) ? daysShare(spine, pid, ym, asOf, null, plan) : 1;
  }
  return round4(n);
}
// Months of a year through asOf (money from take-home goes in every month), and the months after this one to
// December (money put in from January on counts for the new year unless it is assigned to the old one).
export const monthsIn = (year, asOf) => (year < +asOf.slice(0, 4) ? 12 : year > +asOf.slice(0, 4) ? 0 : +asOf.slice(5, 7));
export const monthsAfter = (year, asOf) => (year === +asOf.slice(0, 4) ? 12 - +asOf.slice(5, 7) : year > +asOf.slice(0, 4) ? 12 : 0);

// ---------------------------------------------------------------- what is in, and what is still set to go in
// What is already in for the year on one account, for one part of it (a Solo
// 401(k)'s employee or employer money). A recorded total for the year replaces
// the guess, and the monthly amount adds the months (or pay months) after the day
// it was recorded through; a 529 rolled in adds on top. With no total, the monthly
// amount for the months gone by (a guess, rough). A year that has started with
// nothing recorded on the account and no monthly amount is missing, never $0
// (answer 43, S-227): value null, kind missing. A part with nothing of its own on
// an account that has something for the year (an employer part not made yet) is
// none so far (rough). A monthly amount that is blank is named as missing.
export function contributedOn(spine, a, year, asOf, t, part = 'all') {
  const base = 'accounts.' + a.id;
  const list = a.contributions ? t.useFact(base + '.contributions', a.contributions) : null;
  // An HSA with only the employer's total recorded for the year: the owner's own part is still counted (its monthly
  // guess), not hidden by the employer's. (A SEP's employer total is the whole account, its monthly amount included.)
  const yr = (list || []).filter((c) => counts(c, year) && isTotal(c));
  if (part === 'all' && a.type === 'hsa' && yr.length && yr.every((c) => c.kind === 'employer')) {
    const own = contributedOn(spine, a, year, asOf, t, 'own'), emp = contributedOn(spine, a, year, asOf, t, 'employer');
    return { ...own, value: round2(own.value + emp.value), words: own.words + '; from the employer: ' + emp.words, kind: own.kind === 'missing' ? 'missing' : own.estimated || emp.estimated ? 'rough' : emp.kind };
  }
  const mine = (c) => part === 'all' || (part === 'employer') === (c.kind === 'employer');
  const year_ = (list || []).filter((c) => counts(c, year) && mine(c));
  const totals = year_.filter(isTotal), events = year_.filter((c) => !isTotal(c));
  const ev = round2(events.reduce((s, c) => s + c.amount, 0));
  const evWords = ev ? ' and ' + money(ev) + ' rolled in from a 529' : '';
  const name = v(a.name) || a.id;
  const pid = (accountOwner(spine, a) || {}).id;
  const payroll = fromPayOf(spine, a, pid);
  // A plan filled only from pay has had nothing come out of pay that never came.
  const monthsTo = (d) => (payroll ? (hasPay(spine, pid, a) ? payMonthsBefore(spine, pid, year, d, a) : 0) : monthsIn(year, d));
  const monthly = part !== 'employer' && a.monthlyContribution ? a.monthlyContribution : null;
  if (totals.length) {
    const rec = round2(totals.reduce((s, c) => s + c.amount, 0));
    // The total is through the day it was recorded: the monthly amount has put in more since.
    const through = totals.map((c) => c.through).filter(Boolean).sort().pop();
    const more = through && monthly && through < asOf ? round4(monthsTo(asOf) - monthsTo(through)) : 0;
    const m = more > 0 ? t.useFact(base + '.monthlyContribution', monthly) : null;
    // From pay: each paycheck's own amount (to the cent) from the day it was recorded through to asOf.
    const byPay = m && payroll && hasPay(spine, pid, a) ? payAmount(spine, pid, year, m, (d) => d >= through && d < asOf, a) : null;
    const since = m ? (byPay ?? round2(m * more)) : 0;
    if (since) t.addRough(base + '.contributions');
    return { id: a.id, name, value: round2(rec + since + ev), events: ev, words: money(rec) + ' recorded for ' + year + (since ? ' and about ' + money(since) + ' since (' + money(m) + ' a month for ' + nMonths(more) + (payroll ? ' of pay' : '') + ')' : '') + evWords, path: base + '.contributions', estimated: !!since, kind: since ? 'rough' : a.contributions.kind };
  }
  const n = monthsTo(asOf);
  if (monthly && n > 0) {
    const m = t.useFact(base + '.monthlyContribution', monthly);
    if (m === null) return { id: a.id, name, value: ev, events: ev, words: 'the monthly amount is not entered, so nothing is counted as in' + evWords, path: base + '.monthlyContribution', estimated: true, kind: 'missing' };
    t.addRough(base + '.contributions');
    const guess = payroll && hasPay(spine, pid, a) ? payAmount(spine, pid, year, m, (d) => d < asOf, a) ?? round2(m * n) : round2(m * n);
    return { id: a.id, name, value: round2(guess + ev), events: ev, words: 'about ' + money(guess) + ' (' + money(m) + ' a month for ' + nMonths(n) + (payroll ? ' of pay' : '') + ' in ' + year + ', a guess until it is recorded)' + evWords, path: base + '.contributions', estimated: true, monthly: m, months: n, kind: 'rough' };
  }
  const past = year <= +asOf.slice(0, 4);
  const anything = (list || []).some((c) => counts(c, year)) || !!a.monthlyContribution;
  if (past && !anything) { t.addMissing(base + '.contributions'); return { id: a.id, name, value: null, events: 0, words: 'missing: nothing recorded for ' + year, path: base + '.contributions', estimated: false, kind: 'missing', nothing: true }; }
  if (past && !events.length) t.addRough(base + '.contributions');
  return { id: a.id, name, value: ev, events: ev, words: (ev ? money(ev) + ' rolled in from a 529 recorded for ' + year : 'nothing recorded for ' + year), path: base + '.contributions', estimated: past && !events.length, kind: past && !events.length ? 'rough' : a.contributions ? a.contributions.kind : 'computed' };
}
// What the account's monthly amount still puts in for the year from asOf: on the owner's paydays through December 31
// for money from pay, in each month after this one to December for money from take-home. Null when nothing will.
export function stillOn(spine, a, year, asOf, t, part = 'all') {
  if (part === 'employer' || !a.monthlyContribution) return null;
  const m = t.useFact('accounts.' + a.id + '.monthlyContribution', a.monthlyContribution);
  if (!m) return null;
  const pid = (accountOwner(spine, a) || {}).id;
  const payroll = fromPayOf(spine, a, pid);
  const n = payroll ? (hasPay(spine, pid, a) ? payMonthsFrom(spine, pid, year, asOf, a) : 0) : monthsAfter(year, asOf);
  if (!(n > 0)) return null;
  // From pay: each paycheck still to come its own amount, to the cent (as the run deducts it).
  const byPay = payroll && hasPay(spine, pid, a) ? payAmount(spine, pid, year, m, (d) => d >= asOf, a) : null;
  return { id: a.id, name: v(a.name) || a.id, monthly: m, months: n, value: byPay ?? round2(m * n), fromPay: payroll, path: 'accounts.' + a.id + '.monthlyContribution', words: money(m) + ' a month' + (payroll ? ' from pay' : '') + ' for ' + nMonths(n) + ' more of ' + year };
}
// The year's whole amount on one account: what is in plus what is still set to go in.
// Null when nothing is recorded for the year (answer 43).
export const yearAmount = (spine, a, year, asOf, t, part = 'all') => { const i = contributedOn(spine, a, year, asOf, t, part); const s = stillOn(spine, a, year, asOf, t, part); return { value: i.value === null ? null : round2(i.value + (s ? s.value : 0)), in: i, still: s }; };
// Whether a year has a recorded total on the account (then the year's amount comes from the record, not a forecast).
export const hasTotal = (a, year) => !!(a.contributions && Array.isArray(v(a.contributions)) && v(a.contributions).some((c) => counts(c, year) && isTotal(c) && c.kind !== 'employer'));

// ---------------------------------------------------------------- an HSA's limit
export const coverageOf = (a) => (a.coverageLevel ? v(a.coverageLevel) : null);
export const hsaEligible = (a) => !(a.planEligible && v(a.planEligible) === 'no');
// Family coverage on any HSA in the household puts every HSA under the family limit (a spouse with family coverage
// makes both spouses family, Publication 969).
export const familyHsa = (spine) => (spine.accounts || []).some((x) => x.type === 'hsa' && hsaEligible(x) && coverageOf(x) === 'family');
// An HSA's yearly limit for its owner: self-only or family, the age 55 catch-up by the age on December 31, a share for
// the months eligible. t records the rules and the facts read.
export function hsaLimit(spine, rules, a, year, t) {
  const family = familyHsa(spine);
  const person = accountOwner(spine, a);
  const birth = person ? t.useFact('household.people.' + person.id + '.birthDate', person.birthDate) : null;
  const age = birth ? ageOn(birth, year + '-12-31') : null;
  const baseRule = family ? 'HSA_FAM' : 'HSA_SELF';
  const base = t.rule(rules, baseRule, year);
  const catchUp = age !== null && age >= t.rule(rules, 'HSA_CATCHUP_AGE', year) ? t.rule(rules, 'HSA_CU55', year) : 0;
  const months = a.monthsEligible ? t.useFact('accounts.' + a.id + '.monthsEligible', a.monthsEligible) : null;
  const share = months !== null && months < 12 ? Math.max(0, months) / 12 : 1;
  return { family, baseRule, base, catchUp, catchUpRule: catchUp ? 'HSA_CU55' : null, age, months: months !== null && months < 12 ? months : undefined, value: round2((base + catchUp) * share), share };
}
