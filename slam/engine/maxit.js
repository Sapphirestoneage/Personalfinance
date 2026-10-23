// "How much to max it?" (S-211): for each tax-advantaged account and each tax
// year still open, the year's limit plus the catch-up for the owner's age, less
// what is already in for that year across every account that shares the limit,
// is the room left. IRA room is capped at the owner's earned income for the year
// (engine/tax.js earnedIncome; under married filing jointly, for the spouse who
// earns less, the couple's, less what the other spouse put into IRAs) and a Roth
// IRA's at the income phase-out on modified AGI. Conversions and rollovers never
// count against a limit (a 529 rolled into a Roth IRA does). Each account type's
// last day is a rule (DEADLINE_* in data/rules-<year>.json, found by the types it
// lists), so a date changes in data, not here.
//
// What already goes in keeps going in: a monthly amount on the account puts more
// in for the year on the owner's paydays (money from pay, through December 31)
// or in each month left in the year (money from take-home). Every amount here is
// new money on top of that: a lump sum today (the room less what is still set to
// go in), a month (to the deadline; for a payroll-only account, the months that
// hold a paycheck) and a paycheck (the owner's real pay dates before the
// deadline). A payroll-only account also says what to set its deferral to: the
// new money a paycheck plus what already comes out of each. maxItCash runs the
// new money through engine/cashsim.js and says whether the cash floor breaks and
// whether a card or loan payoff moves.
//
// Limits are pools that accounts share: the owner's IRAs (ira:<person>); the
// owner's elective deferrals to 401(k), Roth 401(k), 403(b), TSP, SIMPLE and the
// Solo 401(k)'s employee part (deferral:<person>, the 402(g) limit); a 457(b)
// apart (k457b:<person>); the self-employed employer part of a SEP and a Solo
// 401(k) (employer:<person>, and with the Solo's deferrals one 415(c) total); an
// HSA per person, or with family coverage anywhere in the household one family
// limit (hsa:family) plus each spouse's own age-55 catch-up (hsa55:<person>); the
// household's NY 529 deduction (ny529). A row says how much of its room sits in
// each pool (parts), so the totals count each pool once.
//
// maxIt(spine, rules, { asOf, sim, years }) -> { asOf, rows, accounts, pools, window, totals, kind, from, rough, missing, rules }
// maxItCash(spine, rules, mx, { rows, sim }) -> { floor, before, after, breaks, payoff, words, ... }

import { valueOf as v, tracker, round2, ageOn, addMonths, monthKey, daysBetween, dayIn, monthStart, monthEnd } from './spine.js';
import { PRESETS, PER_YEAR } from './schema.js';
import { earnedIncome, yearTax } from './tax.js';
import { activeDays, streamWeight } from './cashflow.js';
import { cashsim } from './cashsim.js';
import * as C from './vendor/cashcal.js';
import { money as fmt } from '../src/ui/format.js';
import { labelFor } from './labels.js';

// Whole dollars read as whole dollars, anything else to the cent.
const money = (x) => (x === null || x === undefined ? 'missing' : fmt(x, Math.round(x) !== Math.round(x * 100) / 100));
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const longDay = (iso) => MONTHS[+iso.slice(5, 7) - 1] + ' ' + (+iso.slice(8, 10)) + ', ' + iso.slice(0, 4);
const ceil2 = (x) => Math.ceil(Math.round(x * 1000) / 10) / 100;
const round4 = (x) => Math.round(x * 10000) / 10000;
const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const pad = (n) => String(n).padStart(2, '0');
// "9 months", "9.5 months of pay".
const nMonths = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1)) + ' month' + (n === 1 ? '' : 's');

const IRA = ['traditional_ira', 'roth_ira', 'spousal_ira'];
const DEFERRAL = ['k401', 'roth_k401', 'k403b', 'tsp'];
// Plans filled only from a paycheck (an HSA with pay is too, else from take-home; a Solo 401(k) and a SEP never are).
const FROM_PAY = [...DEFERRAL, 'k457b', 'simple_ira', 'after_tax_k401'];
const SUPER = { K401_CU50: 'K401_CU6063', SIMPLE_CU50: 'SIMPLE_CU6063' };
// Entries in a contributions list: rollovers and conversions never count; a 529 rolled into a Roth IRA does; employer marks a Solo 401(k)'s or SEP's employer part.
export const CONTRIBUTION_KINDS = ['contribution', 'rollover', 'conversion', 'from529', 'employer'];
const counts = (c, year) => c.year === year && c.kind !== 'rollover' && c.kind !== 'conversion';

// ---------------------------------------------------------------- whose, and which pools
const people = (spine) => spine.household.people || [];
// The partner's account when its owner says so and there is a partner; a spousal IRA with no owner set is the
// partner's (it is the IRA of the spouse who earns less); everything else is the first person's.
export const ownerOf = (spine, a) => {
  const ps = people(spine), o = a.owner ? v(a.owner) : null;
  return (o === 'partner' || (o === null && a.type === 'spousal_ira')) && ps[1] ? ps[1] : ps[0];
};
const lineOwner = (spine, s) => s.personId || (people(spine)[0] || {}).id;
const coverage = (a) => (a.coverageLevel ? v(a.coverageLevel) : null);
// Whether an account has a yearly limit to fill here: a 529 only in New York (its deduction; a blank state is
// missing, not outside New York), an HSA unless its plan is not eligible.
export const appliesTo = (spine, a) => (a.type === 'k529' ? [null, 'NY'].includes(v(spine.household.state)) : !(a.type === 'hsa' && a.planEligible && v(a.planEligible) === 'no'));
// Family coverage on any HSA in the household puts every HSA under the family limit (a spouse with family coverage
// makes both spouses family, Publication 969).
const familyHsa = (spine) => (spine.accounts || []).some((x) => x.type === 'hsa' && appliesTo(spine, x) && coverage(x) === 'family');
export function poolsOf(spine, a) {
  const p = (ownerOf(spine, a) || {}).id;
  if (IRA.includes(a.type)) return [{ key: 'ira:' + p, part: 'all' }];
  if (DEFERRAL.includes(a.type) || a.type === 'simple_ira') return [{ key: 'deferral:' + p, part: 'all' }];
  if (a.type === 'solo_k401') return [{ key: 'deferral:' + p, part: 'employee' }, { key: 'employer:' + p, part: 'employer' }];
  if (a.type === 'sep_ira') return [{ key: 'employer:' + p, part: 'all' }];
  if (a.type === 'k457b') return [{ key: 'k457b:' + p, part: 'all' }];
  if (a.type === 'hsa') return [{ key: familyHsa(spine) ? 'hsa:family' : 'hsa:' + p, part: 'all' }];
  if (a.type === 'k529') return [{ key: 'ny529', part: 'all' }];
  return [];
}

// ---------------------------------------------------------------- deadlines (rules, not code)
// The DEADLINE_* rule whose types list holds this account type, or null.
export function deadlineRuleFor(rules, type, year) {
  for (const id of rules.ids(year)) if (id.startsWith('DEADLINE_')) { const m = rules.meta(id, year); if ((m.types || []).includes(type)) return id; }
  return null;
}
// Every account type a deadline rule covers: the accounts that get "How much to max it?".
export const maxItTypes = (rules, year) => rules.ids(year).filter((id) => id.startsWith('DEADLINE_')).flatMap((id) => rules.meta(id, year).types || []);
export const canMaxIt = (rules, account, year) => !!(account && deadlineRuleFor(rules, account.type, year));

// A tax year's last day for an account type: { date, rule, words, when, main, payrollOnly, elect? }. The words are
// the rule's own; when says the date for this tax year.
export function deadlineOf(rules, type, taxYear) {
  const id = deadlineRuleFor(rules, type, taxYear);
  if (!id) return null;
  const m = rules.meta(id, taxYear);
  const date = (taxYear + (m.yearOffset || 0)) + '-' + m.value;
  // A filing-day deadline (the year after) that lands on a weekend moves to the next business day; the date stays, the words say so.
  const dow = new Date(date + 'T00:00:00Z').getUTCDay();
  const weekend = m.yearOffset && (dow === 0 || dow === 6) ? ' ' + longDay(date) + ' is a ' + (dow === 6 ? 'Saturday' : 'Sunday') + ', so the IRS deadline is the next business day; the amounts here count to ' + longDay(date) + '.' : '';
  const out = { date, rule: id, words: m.notes + weekend, weekend: !!weekend, when: longDay(date) + ' for ' + taxYear, label: m.rule, main: m.main || 'month', payrollOnly: !!m.payrollOnly, verified: m.verified, source: m.source };
  // A Solo 401(k)'s employee deferral is elected by December 31, funded later (DEADLINE_SOLO_ELECT).
  if (type === 'solo_k401' && rules.has('DEADLINE_SOLO_ELECT', taxYear)) { const e = rules.meta('DEADLINE_SOLO_ELECT', taxYear); const d = (taxYear + (e.yearOffset || 0)) + '-' + e.value; out.elect = { date: d, rule: 'DEADLINE_SOLO_ELECT', words: e.notes, when: longDay(d) + ' for ' + taxYear }; }
  return out;
}

// The tax years still open on asOf: started (not after asOf's year) and not past the deadline.
export function openYears(rules, type, asOf) {
  const y = +asOf.slice(0, 4);
  return [y - 1, y].filter((ty) => { const d = deadlineOf(rules, type, ty); return d && d.date >= asOf; });
}

// ---------------------------------------------------------------- pay dates and months
// A stream's pay dates from `from` to `to` by its schedule, as the day-by-day run lays them out
// (engine/cashsim.js): weekly and biweekly from the start date, semimonthly from the pay day, the rest on the pay day.
export function payDatesOf(s, from, to) {
  const lo = s.start && s.start > from ? s.start : from, hi = s.end && s.end < to ? s.end : to;
  if (lo > hi || s.cadence === 'once') return s.cadence === 'once' && s.start >= from && s.start <= to ? [s.start] : [];
  const day = s.payDay ? v(s.payDay) : null;
  if (s.cadence === 'weekly' || s.cadence === 'biweekly') return s.start ? C.paydays(s.cadence, s.start, lo, hi) : [];
  if (s.cadence === 'semimonthly') return C.paydays('semimonthly', dayIn(monthKey(lo), day || 15), lo, hi);
  return C.paydays('monthly', dayIn(monthKey(lo), day || 1), lo, hi);
}
const earningFor = (spine, pid, types = ['w2', 'tips']) => (spine.income || []).filter((s) => types.includes(s.type) && lineOwner(spine, s) === pid && streamWeight(s, 'committed') !== 0);
// Whether the owner has a W-2 or tips line at all (payroll saving needs pay to come out of).
const hasPay = (spine, pid) => earningFor(spine, pid).length > 0;
// Money that goes in from the owner's pay: a payroll-only plan always, an HSA while the owner has pay.
const fromPayOf = (spine, a, pid) => FROM_PAY.includes(a.type) || (a.type === 'hsa' && hasPay(spine, pid));
// The share of a month's pay (the owner's W-2 and tips paydays) on days that pass `keep`; null when pay runs that
// month but its days are not known (a weekly or biweekly line with no first pay date).
function payShare(spine, pid, ym, keep) {
  const runs = earningFor(spine, pid).filter((s) => activeDays(s.start, s.end, ym) > 0);
  if (!runs.length) return 0;
  const days = runs.flatMap((s) => payDatesOf(s, monthStart(ym), monthEnd(ym)));
  return days.length ? days.filter(keep).length / days.length : null;
}
// Months of the owner's pay in a year before asOf: payroll saving is in for paydays before asOf (a payday on asOf is
// still to come). An earlier month with pay counts whole; the as-of month counts the share of its paydays gone by.
function payMonthsBefore(spine, pid, year, asOf) {
  let n = 0;
  for (let m = 1; m <= 12; m++) {
    const ym = year + '-' + pad(m);
    if (ym > monthKey(asOf)) break;
    n += ym < monthKey(asOf) ? (payShare(spine, pid, ym, () => true) === 0 ? 0 : 1) : payShare(spine, pid, ym, (d) => d < asOf) || 0;
  }
  return round4(n);
}
// Months of the owner's pay from asOf through December 31 of the year: what payroll saving already set up still puts in.
function payMonthsFrom(spine, pid, year, asOf) {
  let n = 0;
  for (let m = 1; m <= 12; m++) {
    const ym = year + '-' + pad(m);
    if (ym < monthKey(asOf)) continue;
    const share = payShare(spine, pid, ym, (d) => d >= asOf);
    n += share === null ? (ym === monthKey(asOf) ? 0 : 1) : share;
  }
  return round4(n);
}
// Months of a year through asOf (money from take-home goes in every month), and the months after this one to
// December (money put in from January on counts for the new year unless it is assigned to the old one).
const monthsIn = (year, asOf) => (year < +asOf.slice(0, 4) ? 12 : year > +asOf.slice(0, 4) ? 0 : +asOf.slice(5, 7));
const monthsAfter = (year, asOf) => (year === +asOf.slice(0, 4) ? 12 - +asOf.slice(5, 7) : 0);

// One contribution a month from asOf (the same day of the month) through the deadline.
export function monthlyDates(asOf, deadline) {
  const out = [];
  for (let i = 0; i < 24; i++) {
    const ym = addMonths(monthKey(asOf), i);
    const last = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).getUTCDate();
    const d = ym + '-' + String(Math.min(+asOf.slice(8, 10), last)).padStart(2, '0');
    if (d > deadline) break;
    out.push(d);
  }
  return out;
}

// ---------------------------------------------------------------- what is in, and what is still set to go in
// What is already in for the year on one account, for one part of it (a Solo
// 401(k)'s employee or employer money): the contributions list's entries for the
// year, else the monthly amount for the months gone by (a guess, rough), else
// nothing recorded (rough). A monthly amount that is blank is named as missing.
// Only entries that count replace the guess (a rollover alone leaves it).
function contributedOn(spine, a, year, asOf, t, part = 'all') {
  const base = 'accounts.' + a.id;
  const list = a.contributions ? t.useFact(base + '.contributions', a.contributions) : null;
  const mine = (c) => part === 'all' || (part === 'employer') === (c.kind === 'employer');
  const entries = (list || []).filter((c) => counts(c, year) && mine(c));
  const name = v(a.name) || a.id;
  if (entries.length) { const x = round2(entries.reduce((s, c) => s + c.amount, 0)); return { id: a.id, name, value: x, words: money(x) + ' recorded for ' + year, path: base + '.contributions', estimated: false, kind: a.contributions.kind }; }
  if ((list || []).some((c) => counts(c, year))) return { id: a.id, name, value: 0, words: 'nothing recorded for ' + year + (part === 'employer' ? ' as the employer part' : ' as the employee deferral'), path: base + '.contributions', estimated: false, kind: a.contributions.kind };
  const pid = (ownerOf(spine, a) || {}).id;
  const payroll = fromPayOf(spine, a, pid);
  // A plan filled only from pay has had nothing come out of pay that never came.
  const n = payroll ? (hasPay(spine, pid) ? payMonthsBefore(spine, pid, year, asOf) : 0) : monthsIn(year, asOf);
  if (part !== 'employer' && a.monthlyContribution && n > 0) {
    const m = t.useFact(base + '.monthlyContribution', a.monthlyContribution);
    if (m === null) return { id: a.id, name, value: 0, words: 'the monthly amount is not entered, so nothing is counted as in', path: base + '.monthlyContribution', estimated: true, kind: 'missing' };
    t.addRough(base + '.contributions');
    return { id: a.id, name, value: round2(m * n), words: 'about ' + money(m * n) + ' (' + money(m) + ' a month for ' + nMonths(n) + (payroll ? ' of pay' : '') + ' in ' + year + ', a guess until it is recorded)', path: base + '.contributions', estimated: true, monthly: m, months: n, kind: 'rough' };
  }
  const past = year <= +asOf.slice(0, 4);
  if (past) t.addRough(base + '.contributions');
  return { id: a.id, name, value: 0, words: 'nothing recorded for ' + year, path: base + '.contributions', estimated: past, kind: past ? 'rough' : 'computed' };
}
// What the account's monthly amount still puts in for the year from asOf: on the owner's paydays through December 31
// for money from pay, in each month after this one to December for money from take-home. Null when nothing will.
function stillOn(spine, a, year, asOf, t, part = 'all') {
  if (part === 'employer' || !a.monthlyContribution) return null;
  const m = t.useFact('accounts.' + a.id + '.monthlyContribution', a.monthlyContribution);
  if (!m) return null;
  const pid = (ownerOf(spine, a) || {}).id;
  const payroll = fromPayOf(spine, a, pid);
  const n = payroll ? (hasPay(spine, pid) ? payMonthsFrom(spine, pid, year, asOf) : 0) : monthsAfter(year, asOf);
  if (!(n > 0)) return null;
  return { id: a.id, name: v(a.name) || a.id, monthly: m, months: n, value: round2(m * n), fromPay: payroll, path: 'accounts.' + a.id + '.monthlyContribution', words: money(m) + ' a month' + (payroll ? ' from pay' : '') + ' for ' + nMonths(n) + ' more of ' + year };
}
// Everything in for the year in one pool, across every account in it, and what the pool's monthly amounts still put
// in. An HSA's employer money counts against its limit.
function poolIn(spine, accts, key, year, asOf, t) {
  const parts = [];
  for (const a of accts) for (const p of poolsOf(spine, a)) {
    if (p.key !== key) continue;
    parts.push(contributedOn(spine, a, year, asOf, t, p.part));
    if (a.type === 'hsa' && a.employerSeed && year <= +asOf.slice(0, 4)) { const e = t.useFact('accounts.' + a.id + '.employerSeed', a.employerSeed); if (e) parts.push({ id: a.id, name: (v(a.name) || a.id) + ', employer money', value: e, words: money(e) + ' from the employer (it counts against the limit)', path: 'accounts.' + a.id + '.employerSeed', estimated: false, kind: a.employerSeed.kind }); }
  }
  return { value: round2(parts.reduce((s, p) => s + p.value, 0)), parts };
}
function poolStill(spine, accts, key, year, asOf, t) {
  const parts = [];
  for (const a of accts) for (const p of poolsOf(spine, a)) if (p.key === key) { const s = stillOn(spine, a, year, asOf, t, p.part); if (s) parts.push(s); }
  return { value: round2(parts.reduce((s, p) => s + p.value, 0)), parts };
}

// ---------------------------------------------------------------- limits
// The catch-up for an age on December 31.
function catchUp(rules, rid, age, year, t) {
  if (!rid || age === null) return { amount: 0, rule: null };
  if (rid === 'HSA_CU55') return age >= t.rule(rules, 'HSA_CATCHUP_AGE', year) ? { amount: t.rule(rules, rid, year), rule: rid } : { amount: 0, rule: null };
  const [lo, hi] = t.rule(rules, 'SUPER_CATCHUP_AGES', year);
  if (SUPER[rid] && age >= lo && age <= hi) return { amount: t.rule(rules, SUPER[rid], year), rule: SUPER[rid] };
  if (age >= t.rule(rules, 'CATCHUP_AGE', year)) return { amount: t.rule(rules, rid, year), rule: rid };
  return { amount: 0, rule: null };
}
const ageOf = (spine, person, year, t) => {
  const birth = person ? t.useFact('household.people.' + person.id + '.birthDate', person.birthDate) : null;
  return birth ? ageOn(birth, year + '-12-31') : null;
};
// The limit for an account type and year, with the catch-up for the owner's age on December 31. A year with no rules
// file of its own: a later year reads the latest limits, rough and said so; an earlier year's limits are missing (the
// later year's are larger, and missing never shows as a number).
function limitOf(spine, rules, a, year, t, se) {
  const preset = PRESETS[a.type] || {};
  const person = ownerOf(spine, a);
  const age = ageOf(spine, person, year, t);
  const out = { value: null, base: null, baseRule: null, catchUp: 0, catchUpRule: null, age, birthPath: person ? 'household.people.' + person.id + '.birthDate' : null, words: [] };
  if (a.type === 'k529') {
    const st = t.read(spine, 'household.state');
    if (st === null) return { ...out, missing: 'the state (only New York\'s 529 deduction is a limit to fill)', missingPath: 'household.state' };
    const fs = t.read(spine, 'household.filingStatus');
    if (fs === null) return { ...out, missing: 'the filing status (it sets the New York deduction cap)', missingPath: 'household.filingStatus' };
    out.baseRule = fs === 'mfj' ? 'NY_529_DED_J' : 'NY_529_DED_S';
    out.words.push('the New York deduction cap (' + (fs === 'mfj' ? 'married filing jointly' : 'one taxpayer') + ')');
  } else if (a.type === 'hsa') {
    const level = coverage(a), fam = familyHsa(spine);
    t.useFact('accounts.' + a.id + '.coverageLevel', a.coverageLevel);
    if (level === null && !fam) t.addRough('accounts.' + a.id + '.coverageLevel');
    out.baseRule = fam ? 'HSA_FAM' : 'HSA_SELF';
    out.family = fam;
    out.words.push(fam ? (level === 'family' ? 'family coverage' : 'family coverage (an HSA in the household has family coverage, so every HSA is under the family limit)') : level === 'self' ? 'self-only coverage' : 'self-only coverage (a guess: the coverage is not entered)');
    const cu = catchUp(rules, 'HSA_CU55', age, year, t);
    Object.assign(out, { catchUp: cu.amount, catchUpRule: cu.rule });
    const months = a.monthsEligible ? t.useFact('accounts.' + a.id + '.monthsEligible', a.monthsEligible) : null;
    if (months !== null && months < 12) { out.months = months; out.words.push(months + ' of 12 months eligible'); }
  } else if (a.type === 'sep_ira') {
    out.baseRule = 'SEP_MAX';
  } else {
    if (!preset.limitRule) return out;
    out.baseRule = preset.limitRule;
    const cu = catchUp(rules, preset.catchUpRule, age, year, t);
    Object.assign(out, { catchUp: cu.amount, catchUpRule: cu.rule });
  }
  const fb = rules.meta(out.baseRule, year);
  if (fb.fallback && year < fb.year) return { ...out, catchUp: 0, catchUpRule: null, missing: 'the ' + year + ' limits (the rules file starts at ' + fb.year + ')', missingPath: 'rule:' + out.baseRule };
  if (fb.fallback) { t.addRough('rule:' + out.baseRule); out.fallback = fb.year; }
  out.base = t.rule(rules, out.baseRule, year);
  if (a.type === 'sep_ira') {
    out.max = out.base;
    out.share = t.rule(rules, 'SE_EMPLOYER_SHARE', year);
    if (se.value === null) return { ...out, base: null, missing: se.label, earnedMissing: true };
    out.se = se.value;
    out.base = round2(Math.min(out.max, out.share * se.value));
    out.words.push(Math.round(out.share * 100) + '% of ' + money(se.value) + ' net self-employment earnings, at most ' + money(out.max));
  }
  if (out.catchUp) out.words.push('the age ' + (out.catchUpRule === 'HSA_CU55' ? '55' : Object.values(SUPER).includes(out.catchUpRule) ? '60 to 63' : '50') + ' catch-up');
  let value = out.base + out.catchUp;
  if (out.months !== undefined) value = round2(value * Math.max(0, out.months) / 12);
  if (out.fallback) out.words.push('the ' + year + ' limits are not out yet, so ' + out.fallback + '\'s are used');
  return { ...out, value };
}
// The 401(k) deferral limit (402(g)) for a person and year, which SIMPLE and Solo 401(k) deferrals share.
function deferralLimit(rules, age, year, t) {
  const cu = catchUp(rules, 'K401_CU50', age, year, t);
  return { value: t.rule(rules, 'K401_DEF', year) + cu.amount, rule: 'K401_DEF', catchUpRule: cu.rule, catchUp: cu.amount };
}

// The Roth IRA limit at the year's modified AGI (AGI less Roth conversion income): the lesser of the limit and
// compensation (Worksheet 2-2 line 6), reduced in the phase-out range, rounded up to the next $10, and never under
// $200 while above $0 (Publication 590-A).
function rothLimit(spine, rules, year, limit, t, path) {
  const status = v(spine.household.filingStatus);
  let tx = yearTax(spine, rules, year);
  // Conversions are not in modified AGI, so a conversion with no amount does not stop the check: the AGI without them is.
  const mp = tx.missingPaths || {};
  const only = (mp.income || []).length && (mp.income || []).every((p) => p.endsWith('.conversions')) && !(mp.wages || []).length && !(mp.other || []).length;
  if (only) tx = yearTax({ ...spine, accounts: spine.accounts.map((a) => (a.conversions ? { ...a, conversions: undefined } : a)) }, rules, year);
  const agi = tx.lines.agi ? tx.lines.agi.value : null;
  if (agi === null) { t.addRough(path); return { limit, unknown: true, words: 'whether income is under the Roth phase-out cannot be checked until the year\'s tax can be figured' }; }
  t.absorb({ ...tx.lines.agi, value: undefined });
  const magi = round2(agi - (tx.inputs.conversions || 0));
  const key = { single: 'ROTH_PO_S', hoh: 'ROTH_PO_S', mfj: 'ROTH_PO_J' }[status];
  const lo = status === 'mfs' ? 0 : key ? t.rule(rules, key + '_LO', year) : null, hi = status === 'mfs' ? t.rule(rules, 'ROTH_PO_MFS', year) : key ? t.rule(rules, key + '_HI', year) : null;
  if (hi === null) { t.addRough(path); return { limit, unknown: true, magi, words: 'the phase-out needs the filing status' }; }
  const conv = tx.inputs.conversions ? ' (AGI less ' + money(tx.inputs.conversions) + ' of Roth conversions)' : '';
  if (magi <= lo) return { limit, magi, words: null };
  if (magi >= hi) return { limit: 0, magi, lo, hi, words: 'modified AGI of ' + money(magi) + conv + ' is over the ' + money(hi) + ' phase-out, so there is no Roth room (a backdoor Roth is not modeled)' };
  const step = t.rule(rules, 'ROTH_PO_ROUND', year), floor = t.rule(rules, 'ROTH_PO_MIN', year);
  let reduced = Math.ceil((limit - limit * (magi - lo) / (hi - lo)) / step - 1e-9) * step;
  if (reduced > 0 && reduced < floor) reduced = floor;
  return { limit: Math.min(limit, reduced), base: limit, magi, lo, hi, words: 'modified AGI of ' + money(magi) + conv + ' is inside the ' + money(lo) + ' to ' + money(hi) + ' phase-out, so the Roth limit is ' + money(Math.min(limit, reduced)) + ' (' + money(limit) + ' reduced, rounded up to $' + step + ', never under $' + floor + ')' };
}

// Why a year's earned income cannot be figured, naming each blank it waits on: an earning line's amount, or the
// pre-tax saving taken off the pay (S-211).
function eiGap(spine, e) {
  if (e.none) return 'no income is in the Ledger yet';
  if (!e.missing.length) return 'the earnings cannot be figured';
  const names = e.missing.map((p) => labelFor(spine, p));
  return (names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] + ' are' : names[0] + ' is') + ' not entered';
}
// What over the limit means, by kind of money: an excess IRA, HSA or SEP contribution pays 6% a year until it is
// taken out; an excess deferral is paid back by the plan by April 15 of the next year or it is taxed twice.
function overWords(type, year, over) {
  const head = 'Over the ' + year + ' limit by ' + money(over) + ': ';
  return [...FROM_PAY, 'solo_k401'].includes(type) ? head + 'an excess deferral. Have the plan pay it back, with what it earned, by April 15, ' + (year + 1) + ', or it is taxed twice.' : head + 'an excess contribution. Take it out, with what it earned, by the deadline to avoid the 6% tax on it.';
}

// ---------------------------------------------------------------- one account, one tax year
// sim (optional) is a day-by-day run long enough to reach the deadline; its pay dates make the per-paycheck amount.
export function maxItRow(spine, rules, a, year, { asOf = spine.meta.asOf, sim = null, all = null } = {}) {
  const t = tracker();
  const name = v(a.name) || (PRESETS[a.type] || {}).label || a.id;
  const typeLabel = (PRESETS[a.type] || {}).label || a.type;
  const deadline = deadlineOf(rules, a.type, year);
  if (deadline) t.rule(rules, deadline.rule, year);
  if (deadline && deadline.elect) t.rule(rules, deadline.elect.rule, year);
  const person = ownerOf(spine, a) || {};
  const pid = person.id;
  const accts = (all || spine.accounts || []).filter((x) => canMaxIt(rules, x, year));
  const pools = poolsOf(spine, a);
  const group = pools[0] ? pools[0].key : a.type + ':' + a.id;
  const peers = accts.filter((x) => x.id !== a.id && poolsOf(spine, x).some((p) => pools.some((q) => q.key === p.key)));
  const row = { id: a.id + ':' + year, accountId: a.id, name, type: a.type, typeLabel, year, group, pools: pools.map((p) => p.key), parts: {}, still: { value: 0, parts: [], byPool: {} }, sharedWith: peers.map((x) => v(x.name) || x.id), applies: true, fillable: true, deadline, passed: deadline ? deadline.date < asOf : null, person: pid || null, main: deadline ? deadline.main : 'month',
    lump: null, perMonth: null, months: { count: 0, dates: [], last: null }, paychecks: null, cap: null, phase: null, over: null, overWords: null, aboveCap: null, missingLabel: null, notes: [] };
  const done = (extra) => { const snap = t.snapshot(); const r = { ...row, ...extra }; const kind = r.room === null || r.room === undefined ? 'missing' : snap.missing.length ? 'incomplete' : snap.rough.length ? 'rough' : 'computed'; return { ...r, kind, from: snap.from, rough: snap.rough, missing: snap.missing, rules: snap.rules }; };

  // A 529 has a yearly limit to fill only where a state deduction is modeled (New York); an HSA only on an eligible plan.
  if (!appliesTo(spine, a) && a.type === 'k529') { const state = t.read(spine, 'household.state'); return done({ applies: false, room: null, why: 'A 529 has no yearly limit to fill; the state deduction for ' + state + ' is not modeled (only New York\'s is).' }); }
  if (!appliesTo(spine, a)) { t.useFact('accounts.' + a.id + '.planEligible', a.planEligible); return done({ applies: false, room: 0, why: 'Not eligible: the health plan on this account is not HSA-eligible, so nothing can go in for ' + year + '.' }); }

  // Earned income: the owner's, and under married filing jointly the couple's for the spouse who earns less (the spousal IRA rule).
  const ei = earnedIncome(spine, rules, year, { personId: pid });
  // The Show the math id of a person's earned income for the year (no person part with one person).
  const earnedId = (e) => 'earned:' + year + (people(spine).length > 1 && e.personId ? ':' + e.personId : '');
  const se = { value: ei.value === null ? null : ei.seEarnings, label: ei.label };
  const lim = limitOf(spine, rules, a, year, t, se);
  row.limit = lim;
  if (lim.value === null) { if (lim.missingPath) t.useFact(lim.missingPath, null); if (lim.earnedMissing) t.absorb({ ...ei, value: undefined }); return done({ room: null, why: lim.earnedMissing ? 'A SEP IRA for the self-employed is a share of the year\'s 1099 profit, and ' + eiGap(spine, ei) + '.' : 'The limit cannot be figured without ' + lim.missing + '.', missingLabel: 'missing: ' + lim.missing, ei, eiMetric: lim.earnedMissing ? earnedId(ei) : null }); }
  // A plan filled only from pay, in a household of two where no pay line is the owner's: whose pay it is, is missing.
  const payLines = (spine.income || []).filter((s) => (s.type === 'w2' || s.type === 'tips') && streamWeight(s, 'committed') !== 0);
  if (deadline && deadline.payrollOnly && people(spine).length > 1 && !hasPay(spine, pid) && payLines.length) {
    t.useFact('income.' + payLines[0].id + '.personId', null);
    return done({ room: null, why: 'A ' + typeLabel + ' fills only through pay, and no W-2 or tips line in the Ledger is ' + (person.name || 'the owner') + '\'s. Open the pay line that is ' + (person.name || 'theirs') + ' and choose whose pay it is.', missingLabel: 'missing: whose pay is ' + (person.name || 'the owner') + '\'s' });
  }
  const mine = poolIn(spine, accts, pools[0].key, year, asOf, t);
  const own = mine.parts.filter((p) => p.id === a.id);
  const contributed = { value: mine.value, parts: mine.parts, estimated: mine.parts.some((p) => p.estimated) };
  row.contributed = contributed;
  const words = [];
  let room = null, ceiling = null, cap = null, phase = null, over = 0;

  if (IRA.includes(a.type)) {
    const other = people(spine).find((x) => x.id !== pid) || null;
    const fs = other ? t.read(spine, 'household.filingStatus') : v(spine.household.filingStatus);
    t.absorb({ ...ei, value: undefined });
    if (other && fs === null) return done({ room: null, why: 'Two people are in the household, and whether an IRA can use the couple\'s earned income (married filing jointly) turns on the filing status.', missingLabel: 'missing: the filing status' });
    const eo = fs === 'mfj' && other ? earnedIncome(spine, rules, year, { personId: other.id }) : null;
    if (eo) t.absorb({ ...eo, value: undefined });
    const missingEi = ei.value === null ? ei : eo && eo.value === null ? eo : null;
    if (missingEi) return done({ room: null, why: 'An IRA contribution can be no more than the year\'s earned income (W-2, tips and 1099; unemployment does not count), and ' + eiGap(spine, missingEi) + '.', missingLabel: 'missing: ' + missingEi.label, ei: missingEi, eiMetric: earnedId(missingEi) });
    // Under married filing jointly the spouse who earns less may count the couple's earned income, less what the
    // other spouse put into IRAs (IRC 219(c)); the one who earns more is held to their own.
    const joint = !!eo && eo.value > ei.value;
    const otherIn = joint ? poolIn(spine, accts, 'ira:' + other.id, year, asOf, t).value : 0;
    const comp = joint ? round2(ei.value + eo.value - otherIn) : ei.value;
    cap = { value: comp, kind: ei.kind, label: joint ? 'the couple\'s ' + year + ' earned income, less ' + money(otherIn) + ' ' + other.name + ' put into IRAs' : ei.label, metric: joint ? 'earned:' + year : earnedId(ei), joint };
    if (a.type === 'spousal_ira' && !joint) words.push(fs === 'mfj' ? 'A spousal IRA counts the couple\'s earned income only for the spouse who earns less; here its owner\'s own earned income is the cap.' : 'A spousal IRA rests on married filing jointly; without it, its owner\'s own earned income is the cap.');
    ceiling = Math.min(lim.value, comp);
    if (a.type === 'roth_ira') {
      // The Roth limit is reduced by the phase-out from the lesser of the limit and compensation; every IRA
      // contribution still counts against the full limit.
      phase = rothLimit(spine, rules, year, ceiling, t, 'accounts.' + a.id + '.contributions');
      const rothIn = round2(mine.parts.filter((p) => (accts.find((x) => x.id === p.id) || {}).type === 'roth_ira').reduce((s, p) => s + p.value, 0));
      room = round2(Math.max(0, Math.min(phase.limit - rothIn, ceiling - contributed.value)));
      if (!phase.unknown) over = Math.max(over, rothIn - phase.limit);
    } else room = round2(Math.max(0, ceiling - contributed.value));
    over = Math.max(over, contributed.value - ceiling);
    if (comp < lim.value) words.push('Capped at ' + cap.label + ' (' + money(comp) + ').');
    if (phase && phase.words) words.push(cap1(phase.words) + '.');
  } else if (a.type === 'hsa' && lim.family) {
    // Family coverage: one family limit for the household, and each spouse's own age-55 catch-up on top. Money a spouse
    // puts in fills their own catch-up first (Publication 969).
    const fam = round2(lim.base * (lim.months ?? 12) / 12);
    const ownerIds = [...new Set(accts.filter((x) => x.type === 'hsa' && appliesTo(spine, x)).map((x) => (ownerOf(spine, x) || {}).id))];
    const spouses = ownerIds.map((o) => {
      const p = people(spine).find((x) => x.id === o) || {};
      const inn = round2(mine.parts.filter((q) => (ownerOf(spine, accts.find((x) => x.id === q.id) || {}) || {}).id === o).reduce((s, q) => s + q.value, 0));
      const cu = o === pid ? lim.catchUp : catchUp(rules, 'HSA_CU55', ageOf(spine, p, year, t), year, t).amount;
      return { id: o, name: p.name || o, in: inn, catch: cu, used: round2(Math.max(0, inn - cu)) };
    });
    const me = spouses.find((x) => x.id === pid) || { in: 0, catch: lim.catchUp, used: 0 };
    const usedAll = round2(spouses.reduce((s, x) => s + x.used, 0));
    const famRoom = round2(Math.max(0, fam - usedAll));
    const ownCatch = round2(Math.max(0, me.catch - me.in));
    room = round2(famRoom + ownCatch);
    ceiling = round2(fam + me.catch);
    row.parts['hsa:family'] = famRoom;
    if (me.catch) row.parts['hsa55:' + pid] = ownCatch;
    row.family = { limit: fam, spouses };
    // Over: what this spouse used of the family limit past what the other left (never a share below zero).
    over = round2(me.used - Math.max(0, fam - (usedAll - me.used)));
    if (spouses.length > 1) words.push('One family limit of ' + money(fam) + ' for the household (' + spouses.map((x) => x.name + ' ' + money(x.in) + ' in' + (x.catch ? ', with a ' + money(x.catch) + ' age 55 catch-up of their own' : '')).join('; ') + ').');
  } else if (DEFERRAL.includes(a.type) || a.type === 'k457b' || a.type === 'hsa' || a.type === 'k529' || a.type === 'sep_ira') {
    ceiling = lim.value;
    if (a.type === 'sep_ira') {
      cap = { value: lim.se, kind: ei.kind, label: year + ' self-employment earnings', metric: earnedId(ei) };
      t.absorb({ ...ei, value: undefined });
      // The employer share is one limit with a Solo 401(k)'s employer part on the same earnings, and the Solo's
      // deferrals count toward the same 415(c) total and the same 100% of earnings.
      const sepOwn = round2(own.reduce((s, p) => s + p.value, 0));
      const solos = accts.filter((x) => x.type === 'solo_k401' && (ownerOf(spine, x) || {}).id === pid);
      const soloEmp = round2(solos.reduce((s, x) => s + contributedOn(spine, x, year, asOf, t, 'employee').value, 0));
      const total = Math.min(t.rule(rules, 'ADD_415C', year), lim.se);
      cap.soloEmp = soloEmp;
      room = round2(Math.max(0, Math.min(lim.max - sepOwn, lim.base - contributed.value, total - contributed.value - soloEmp)));
      over = Math.max(contributed.value - lim.base, contributed.value + soloEmp - total);
      const others = contributed.parts.filter((p) => p.id !== a.id);
      if (others.length) words.push('The employer share is one limit with ' + [...new Set(others.map((p) => p.name))].join(' and ') + ' on the same earnings.');
      if (soloEmp) words.push('With ' + money(soloEmp) + ' of Solo 401(k) deferrals, the total is at most ' + money(total) + '.');
    } else {
      room = round2(Math.max(0, ceiling - contributed.value));
      if (a.type === 'k529') { if (contributed.value - ceiling > 0.005) row.aboveCap = round2(contributed.value - ceiling); }
      else over = contributed.value - ceiling;
    }
  } else if (a.type === 'simple_ira') {
    // A SIMPLE has its own lower limit, and its deferrals share the 401(k) limit too (402(g)).
    const dl = deferralLimit(rules, lim.age, year, t);
    const simpleIn = round2(own.reduce((s, p) => s + p.value, 0));
    ceiling = lim.value;
    room = round2(Math.max(0, Math.min(lim.value - simpleIn, dl.value - contributed.value)));
    cap = { value: dl.value, label: 'the 401(k) deferral limit it shares', rule: 'K401_DEF' };
    over = Math.max(simpleIn - lim.value, contributed.value - dl.value);
    if (dl.value - contributed.value < lim.value - simpleIn) words.push('Capped by the 401(k) deferral limit it shares (' + money(dl.value) + ' across every plan).');
  } else if (a.type === 'solo_k401') {
    t.absorb({ ...ei, value: undefined });
    if (ei.value === null) return done({ room: null, why: 'A Solo 401(k) is figured on self-employment earnings, and ' + eiGap(spine, ei) + '.', missingLabel: 'missing: ' + ei.label, ei, eiMetric: earnedId(ei) });
    const seAmt = ei.seEarnings;
    const share = t.rule(rules, 'SE_EMPLOYER_SHARE', year);
    const emp = poolIn(spine, accts, 'employer:' + pid, year, asOf, t);
    const soloAll = round2(contributedOn(spine, a, year, asOf, t, 'all').value);
    // A SEP for the same owner and earnings shares the 415(c) total and the 100% of earnings.
    const sepIn = round2(emp.parts.filter((p) => (accts.find((x) => x.id === p.id) || {}).type === 'sep_ira').reduce((s, p) => s + p.value, 0));
    const employee = round2(Math.max(0, lim.value - contributed.value));
    const employer = round2(Math.max(0, share * seAmt - emp.value));
    const total = round2(t.rule(rules, 'ADD_415C', year) + lim.catchUp);
    const electGone = deadline.elect && deadline.elect.date < asOf;
    const emplCounted = electGone ? 0 : employee;
    room = round2(Math.max(0, Math.min(emplCounted + employer, total - soloAll - sepIn, seAmt - soloAll - sepIn)));
    ceiling = total;
    cap = { value: seAmt, kind: ei.kind, label: year + ' self-employment earnings', metric: earnedId(ei), employee, employer, employeeCounted: emplCounted, total, share, employerIn: emp.value, sepIn, soloAll, electGone };
    // The employer part first: no other plan can take it, while a W-2 401(k) can take the deferral.
    row.parts['employer:' + pid] = Math.min(employer, room);
    row.parts['deferral:' + pid] = round2(room - row.parts['employer:' + pid]);
    over = Math.max(contributed.value - lim.value, soloAll + sepIn - Math.min(total, seAmt));
    words.push('Employee deferral up to ' + money(employee) + (contributed.value ? ' (after ' + money(contributed.value) + ' of deferrals this year across every plan)' : '') + ', employer part up to ' + money(employer) + ' (' + Math.round(share * 100) + '% of ' + money(seAmt) + '), in all at most ' + money(Math.min(total, seAmt)) + (sepIn ? ' with the ' + money(sepIn) + ' in a SEP' : '') + '.');
    if (electGone) words.push('The employee deferral had to be elected by ' + longDay(deadline.elect.date) + '; only if it was can up to ' + money(employee) + ' more go in, so the room here is the employer part.');
  }
  if (room === null) room = 0;
  if (!Object.keys(row.parts).length) row.parts[pools[0].key] = room;
  if (over > 0.005) { row.over = round2(over); row.overWords = overWords(a.type, year, row.over); }

  // What is still set to go in for the year, per pool: the amounts below are new money on top of it.
  const passed = !deadline || deadline.date < asOf;
  const still = { value: 0, parts: [], byPool: {} };
  let toFill = 0;
  for (const [key, part] of Object.entries(row.parts)) {
    const s = key.startsWith('hsa55:') ? { value: 0, parts: [] } : poolStill(spine, accts, key, year, asOf, t);
    still.byPool[key] = s.value;
    still.parts.push(...s.parts.map((p) => ({ ...p, pool: key })));
    toFill += Math.max(0, part - s.value);
  }
  toFill = round2(toFill);
  still.value = round2(room - toFill);
  row.still = still;

  // The three amounts.
  const payrollOnly = deadline && deadline.payrollOnly;
  let dates = passed ? [] : monthlyDates(asOf, deadline.date);
  let paychecks = null;
  if (!passed) {
    // The owner's pay dates before the deadline: from the run (moved and skipped ones as the calendar has them) when
    // the line is in it, else by its schedule. A payroll-only account reads the owner's W-2 and tips only.
    const types = payrollOnly ? ['w2', 'tips'] : ['w2', 'tips', '1099'];
    let streams = earningFor(spine, pid, types);
    if (!streams.length && !payrollOnly) streams = (spine.income || []).filter((s) => lineOwner(spine, s) === pid && streamWeight(s, 'committed') !== 0);
    const end = deadline.date;
    const reach = sim && sim.daily.length ? sim.daily[sim.daily.length - 1].date : null;
    const list = [];
    let blank = null;
    for (const s of streams) {
      const inRun = sim ? sim.run.items.filter((i) => i.kind === 'income' && !i.maybe && i.sourceId === s.id && i.date >= asOf && i.date <= end) : [];
      const sched = payDatesOf(s, asOf, end);
      const runs = !s.end || s.end >= asOf;
      // A weekly or biweekly line with no first pay date has no dates to count from; a line with no amount pays nothing in the run.
      if (runs && (s.cadence === 'weekly' || s.cadence === 'biweekly') && !s.start) blank = blank || { label: s.label, what: 'first pay date', path: 'income.' + s.id + '.payDay' };
      if (sched.length && (!s.amount || v(s.amount) === null)) blank = blank || { label: s.label, what: 'amount', path: 'income.' + s.id + '.amount' };
      const ds = inRun.length && reach && reach >= end ? inRun.map((i) => ({ date: i.date, cents: i.cents, s })) : sched.map((d) => ({ date: d, cents: null, s }));
      list.push(...ds);
    }
    const byDate = [...new Set(list.map((x) => x.date))].sort();
    const landedList = list.filter((x) => x.cents !== null).map((x) => x.cents / 100);
    const landed = landedList.length ? round2(Math.min(...landedList)) : null;
    const main = streams.find((s) => list.some((x) => x.s === s)) || null;
    const perYear = main && PER_YEAR[main.cadence] ? PER_YEAR[main.cadence] : 12;
    const nowPer = payrollOnly && a.monthlyContribution && v(a.monthlyContribution) ? round2(v(a.monthlyContribution) * 12 / perYear) : 0;
    const n = byDate.length;
    const extra = n ? ceil2(toFill / n) : null;
    const extraLast = n ? round2(toFill - extra * (n - 1)) : null;
    // A payroll-only account: the deferral to set is the new money a paycheck plus what already comes out of it.
    const per = extra === null ? null : payrollOnly ? round2(extra + nowPer) : extra;
    paychecks = { count: n, dates: byDate, streams: [...new Set(list.map((x) => x.s.label))], perPaycheck: per, extra, last: extraLast === null ? null : payrollOnly ? round2(extraLast + nowPer) : extraLast, current: nowPer, perYear, landed, holds: landed === null ? null : round2(landed + nowPer), tooBig: payrollOnly && extra !== null && landed !== null && extra > landed, blank };
    if (blank && payrollOnly) t.useFact(blank.path, null);
    // A payroll-only account fills only on paydays: its months are the months that hold one.
    if (payrollOnly) dates = [...new Set(byDate.map((d) => monthKey(d)))].map((ym) => byDate.find((d) => monthKey(d) === ym));
    if (payrollOnly && !n && !blank) row.fillable = false;
  }
  const fillable = row.fillable && !passed;
  const perMonth = fillable && dates.length ? ceil2(toFill / dates.length) : null;
  const monthly = a.monthlyContribution ? v(a.monthlyContribution) : null;
  words.unshift('The ' + year + ' limit is ' + money(lim.value) + (lim.words.length ? ' (' + lim.words.join(', ') + ')' : '') + '.', 'In for ' + year + ' so far: ' + contributed.parts.map((p) => (contributed.parts.length > 1 ? p.name + ' ' : '') + p.words).join('; ') + '.');
  if (row.over) words.push(row.overWords);
  else words.push(room > 0 ? money(room) + ' of room is left for ' + year + '.' : 'The ' + year + ' room is full.');
  if (row.aboveCap) words.push(money(row.aboveCap) + ' is above the New York deduction cap: that part is not deductible (it can stay in the 529).');
  const stillNames = [...new Map(still.parts.map((p) => [p.id, p])).values()];
  if (room > 0 && still.value > 0) words.push(money(still.value) + ' of it is already set to go in (' + stillNames.map((p) => (stillNames.length > 1 ? p.name + ' ' : '') + p.words).join('; ') + '), so ' + (toFill > 0 ? money(toFill) + ' is new money.' : 'no new money is needed.'));
  if (!row.fillable && !passed) words.push('No paycheck from ' + (person.name || 'the owner') + '\'s pay lands before ' + longDay(deadline.date) + ', and this account only takes money through payroll, so the ' + year + ' room cannot be filled.');
  return done({ room, ceiling, cap, phase, toFill, lump: fillable ? toFill : null, months: { count: dates.length, dates, last: perMonth === null ? null : round2(toFill - perMonth * (dates.length - 1)) }, perMonth, paychecks, current: monthly, why: words.join(' '), missingLabel: null, ei });
}

// ---------------------------------------------------------------- every account
// The accounts a deadline rule covers, each with its open tax years. From January 1
// to the IRA and HSA deadline two tax years are open side by side (window.both).
export function maxIt(spine, rules, { asOf = spine.meta.asOf, sim = null, years = null } = {}) {
  const all = tracker();
  const y = +asOf.slice(0, 4);
  const accts = (spine.accounts || []).filter((a) => canMaxIt(rules, a, y));
  const rows = [];
  const accounts = accts.map((a) => {
    const ys = years || openYears(rules, a.type, asOf);
    const rs = ys.map((ty) => maxItRow(spine, rules, a, ty, { asOf, sim, all: accts }));
    for (const r of rs) { rows.push(r); all.absorb({ value: 0, from: r.from, rough: r.rough, missing: r.missing, rules: r.rules }); }
    return { id: a.id, name: v(a.name) || a.id, type: a.type, rows: rs };
  });
  // The January 1 to April 15 overlap is the IRA's and the HSA's (a SEP's prior year stays open to October 15 on its own).
  const both = accounts.some((x) => x.rows.length > 1 && (IRA.includes(x.type) || x.type === 'hsa'));
  const ira = deadlineOf(rules, 'roth_ira', y - 1);
  const window = { both, years: [...new Set(rows.map((r) => r.year))].sort(), words: both && ira ? 'From January 1 to ' + longDay(ira.date) + ', money put into an IRA or HSA can count for ' + (y - 1) + ' or ' + y + '. Say which year when you put it in; the account records it for that year.' : null };
  const pools = poolTotals(spine, rules, rows, { asOf });
  const missingRows = rows.filter((r) => r.applies && r.room === null);
  const unfillable = rows.filter((r) => r.applies && r.room !== null && !r.passed && !r.fillable);
  const snap = all.snapshot();
  return { asOf, rows, accounts, pools: pools.list, window, totals: { room: pools.room, lump: pools.lump, perMonth: pools.perMonth, steps: pools.steps, groups: pools.list.length, missing: missingRows.map((r) => r.id), unfillable: unfillable.map((r) => r.id), short: pools.short, over: rows.filter((r) => r.over).map((r) => r.id) }, simDays: sim ? sim.days : null, kind: missingRows.length || snap.missing.length ? 'incomplete' : snap.rough.length ? 'rough' : 'computed', ...snap };
}

// Each pool and year once: its room is the largest part any row puts in it (ties go to the earlier deadline), and
// its new money is that room less what the pool's monthly amounts still put in, filled by that row's own months.
// Under married filing jointly the spouse who counts the couple's earned income gets only what the couple has left.
// A payroll-only pool is held to what its paychecks hold.
export function poolTotals(spine, rules, rows, { asOf = spine.meta.asOf } = {}) {
  const best = new Map();
  for (const r of rows) {
    if (!r.applies || r.passed || r.room === null || !r.fillable) continue;
    for (const [key, part] of Object.entries(r.parts)) {
      const k = key + '|' + r.year, cur = best.get(k);
      if (!cur || part > cur.room || (part === cur.room && r.deadline.date < cur.row.deadline.date)) best.set(k, { key, year: r.year, room: round2(part), row: r });
    }
  }
  const list = [...best.values()];
  for (const year of [...new Set(list.map((p) => p.year))]) {
    const ira = list.filter((p) => p.year === year && p.key.startsWith('ira:'));
    const J = ira.find((p) => p.row.cap && p.row.cap.joint), O = ira.find((p) => p !== J);
    if (!J || !O) continue;
    // Both spouses' IRAs share the couple's earned income: the cap already took out what the other put in; what the
    // joint spouse put in and the other's room come off here.
    const left = Math.max(0, round2(J.row.cap.value - J.row.contributed.value - O.room));
    if (J.room > left) { J.room = left; J.sharedCap = true; }
  }
  const short = [];
  for (const p of list) {
    p.still = round2(Math.min(p.room, (p.row.still.byPool || {})[p.key] || 0));
    p.fill = round2(Math.max(0, p.room - p.still));
    const pc = p.row.paychecks;
    if (p.row.deadline.payrollOnly && pc && pc.landed !== null && pc.count && p.fill > pc.landed * pc.count) { p.fill = round2(pc.landed * pc.count); p.capped = true; short.push(p.row.id); }
    p.perMonth = p.row.months.count ? ceil2(p.fill / p.row.months.count) : null;
    p.deadline = p.row.deadline.date;
  }
  // The total a month changes as deadlines pass: each step runs to a deadline with every pool still open then.
  const ends = [...new Set(list.filter((p) => p.perMonth).map((p) => p.deadline))].sort();
  const steps = ends.map((d) => ({ until: d, perMonth: round2(list.filter((p) => p.perMonth && p.deadline >= d).reduce((s, p) => s + p.perMonth, 0)) }));
  return { list, room: round2(list.reduce((s, p) => s + p.room, 0)), lump: round2(list.reduce((s, p) => s + p.fill, 0)), perMonth: round2(list.reduce((s, p) => s + (p.perMonth || 0), 0)), steps, short };
}

// A pool's steady month: a whole year's room (what the year allows: the room left plus what is in) less what the
// pool's monthly amounts and an HSA's employer money put in over a year, a twelfth of it. The FOO ladder sizes a
// limit with it when its deadline passes before the surplus reaches the rung (at that year's limits).
export function steadyMonth(spine, p) {
  const accts = (spine.accounts || []).filter((x) => poolsOf(spine, x).some((q) => q.key === p.key && q.part !== 'employer'));
  const monthly = accts.reduce((s, x) => s + ((x.monthlyContribution && v(x.monthlyContribution)) || 0) + (x.type === 'hsa' && x.employerSeed && v(x.employerSeed) ? v(x.employerSeed) / 12 : 0), 0);
  // A whole year's room: the room left plus what is in, no more than the year allows (money over the limit is not room).
  const year = round2(Math.min(p.room + (p.row.contributed ? p.row.contributed.value : 0), p.row.ceiling ?? Infinity));
  return round2(Math.max(0, (year - 12 * monthly) / 12));
}

// ---------------------------------------------------------------- the deadlines, for the calendar
// Every account's last day for a tax year that falls from `from` to `to`, as a
// calendar event (kind maxDeadline, never added to a total), with the room left
// for that year in its note. A Solo 401(k) also gets its December 31 election day.
// A deadline that has passed says the year is closed and carries no amount.
export function maxItDeadlines(spine, rules, from, to, { asOf = spine.meta.asOf } = {}) {
  const out = [];
  const y0 = +from.slice(0, 4) - 1, y1 = +to.slice(0, 4);
  for (const a of spine.accounts || []) for (let ty = y0; ty <= y1; ty++) {
    if (!canMaxIt(rules, a, ty) || !appliesTo(spine, a)) continue;
    const d = deadlineOf(rules, a.type, ty);
    const name = v(a.name) || (PRESETS[a.type] || {}).label || a.id;
    const days = [[d.date, d.rule, 'last day for ' + ty + ' contributions'], ...(d.elect ? [[d.elect.date, d.elect.rule, 'elect the ' + ty + ' employee deferral by this day']] : [])];
    for (const [date, rule, what] of days) {
      if (date < from || date > to) continue;
      const passed = date < asOf;
      const r = passed ? null : maxItRow(spine, rules, a, ty, { asOf });
      const room = passed ? (rule === d.rule ? 'The ' + ty + ' year closed on this day' : 'The day to elect the ' + ty + ' employee deferral has passed; the employer part stays open to ' + longDay(d.date)) : r.room === null ? cap1(r.missingLabel || 'missing') : r.over ? 'Over the ' + ty + ' limit by ' + money(r.over) : r.room > 0 ? money(r.room) + ' of room left for ' + ty + (r.kind === 'rough' ? ' (rough)' : '') : 'The ' + ty + ' room is full';
      out.push({ id: 'maxit:' + a.id + ':' + ty + ':' + rule, kind: 'maxDeadline', label: name + ': ' + what, date, amount: !passed && rule === d.rule && r.room ? r.room : null, direction: null, counted: false, rough: !!r && r.kind === 'rough', path: 'accounts.' + a.id + '.contributions', note: room + '. ' + rules.meta(rule, ty).notes, source: rule, accountId: a.id, taxYear: ty, passed, missing: !!r && r.room === null });
    }
  }
  return out.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
}

// The day-by-day run long enough to reach every open deadline, and three years for a card or loan payoff.
export function maxItSim(spine, rules, { asOf = spine.meta.asOf } = {}) {
  const y = +asOf.slice(0, 4);
  const last = (spine.accounts || []).filter((a) => canMaxIt(rules, a, y)).flatMap((a) => openYears(rules, a.type, asOf).map((ty) => deadlineOf(rules, a.type, ty).date)).sort().pop() || asOf;
  return cashsim(spine, rules, { asOf, days: Math.max(1096, daysBetween(asOf, last) + 31) });
}

// ---------------------------------------------------------------- the cash check
// The new money run through the day-by-day simulation: each pool's once (what
// the pool's monthly amounts already put in is in the run already), a
// payroll-only pool's on its paydays and the rest one payment a month, the last
// payment what is left so the payments add up to it. Compared with the same run
// without them: the lowest day of cash across every account against the floor
// (the stage 1 month), payments that fall short, money pulled from the cushion,
// and each card and loan's payoff date.
export function maxItCash(spine, rules, mx, { rows = null, sim = null, asOf = mx.asOf } = {}) {
  const chosen = rows ? poolTotals(spine, rules, rows, { asOf }).list : mx.pools;
  const before = sim || maxItSim(spine, rules, { asOf });
  const flows = [];
  for (const p of chosen) {
    const r = p.row;
    if (!p.fill || !r.fillable) continue;
    const pc = r.paychecks;
    const dates = r.deadline.payrollOnly ? (pc ? pc.dates : []) : r.months.dates;
    if (!dates.length) continue;
    const per = ceil2(p.fill / dates.length);
    dates.forEach((d, i) => { const amt = i === dates.length - 1 ? round2(p.fill - per * (dates.length - 1)) : per; if (amt > 0) flows.push({ pool: p.key, row: r.id, date: d, amount: amt, label: 'More into ' + r.name + (r.deadline.payrollOnly ? ' from pay' : '') }); });
  }
  flows.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
  const after = cashsim(spine, rules, { asOf, days: before.days, adjust: (model) => {
    const pid = (model.accounts.find((x) => x.primary) || model.accounts[0] || {}).id;
    flows.forEach((f, i) => model.transfers.push({ id: 'maxit:' + i, label: f.label, cents: Math.round(f.amount * 100), cadence: 'once', date: f.date, from: pid, to: 'goals', kind: 'savings', path: null }));
  } });
  const lowOf = (s) => s.daily.reduce((m, d) => (m === null || d.cash < m.cash ? { date: d.date, cash: d.cash } : m), null);
  const pullOf = (s) => round2(s.daily.reduce((x, d) => x + d.events.filter((e) => e.kind === 'auto-cover').reduce((y, e) => y + Math.abs(e.amount || 0), 0), 0));
  const shortOf = (s) => round2(s.shortfalls.reduce((x, f) => x + Math.abs(f.amount || 0), 0));
  const b = { low: lowOf(before), checking: before.low, shortfalls: before.shortfalls.length, short: shortOf(before), pull: pullOf(before), dry: before.dryDate };
  const f = { low: lowOf(after), checking: after.low, shortfalls: after.shortfalls.length, short: shortOf(after), pull: pullOf(after), dry: after.dryDate };
  const floor = before.floor.target;
  const under = floor === null || f.low === null ? null : round2(Math.max(0, floor - f.low.cash));
  const underBefore = floor === null || b.low === null ? null : round2(Math.max(0, floor - b.low.cash));
  const newShort = Math.max(0, f.shortfalls - b.shortfalls);
  const shortMore = round2(Math.max(0, f.short - b.short));
  const breaks = floor === null ? null : (under > 0 && under > underBefore) || newShort > 0;
  // Payoff dates: every card and loan, inside the run.
  const nameOf = (id) => { const d = spine.debts.find((x) => x.id === id); return d ? v(d.name) || id : id; };
  const end = before.daily.length ? before.daily[before.daily.length - 1].date : asOf;
  const payoff = [...Object.entries(before.clearDates.perCard).map(([id, d]) => ({ id, before: d, after: after.clearDates.perCard[id] ?? null })), ...Object.entries(before.loans).map(([id, l]) => ({ id, before: l.paidOff, after: after.loans[id] ? after.loans[id].paidOff : null }))]
    .map((p) => ({ ...p, name: nameOf(p.id), path: 'debts.' + p.id + '.balance', days: p.before && p.after ? daysBetween(p.before, p.after) : p.before && !p.after ? daysBetween(p.before, end) : p.after && !p.before ? -daysBetween(p.after, end) : null, pushedPast: !!(p.before && !p.after) }));
  const moved = payoff.filter((p) => p.days !== null && p.days !== 0);
  const worst = moved.length ? moved.reduce((m, p) => (p.days > m.days ? p : m)) : null;
  const measurable = payoff.some((p) => p.before || p.after);
  const total = round2(flows.reduce((x, fl) => x + fl.amount, 0));
  // Payroll money whose pay amount or pay dates are blank is not in the run: the check says so and is incomplete.
  const blank = chosen.filter((p) => p.row.deadline.payrollOnly && p.row.paychecks && p.row.paychecks.blank).map((p) => p.row.paychecks.blank);
  const capped = chosen.filter((p) => p.capped);
  const words = [];
  if (blank.length && flows.length) words.push('Incomplete: ' + [...new Set(blank.map((x) => x.label + (x.what === 'amount' ? ' has no amount' : ' has no first pay date')))].join(' and ') + ', so that pay is not in the run.');
  if (!flows.length) words.push('Nothing more leaves checking: what already goes in covers it.');
  else {
    words.push(money(total) + ' more leaves checking by ' + longDay(flows[flows.length - 1].date) + (capped.length ? ' (' + capped.map((p) => p.row.name).join(' and ') + ' only what a paycheck holds)' : '') + '.');
    if (floor === null) words.push('The cash floor cannot be figured until monthly spending is known.');
    else if (breaks) {
      const shortWords = newShort + ' payment' + (newShort === 1 ? '' : 's') + ' (' + money(shortMore) + ') could not be made in full, because checking cannot go under its floor';
      words.push('It breaks the cash floor: ' + (under > underBefore ? 'cash across every account dips to ' + money(f.low.cash) + ' on ' + longDay(f.low.date) + ', ' + money(under) + ' under the floor of ' + money(floor) + (newShort ? ', and ' + shortWords : '') : shortWords + ' (the lowest day of cash across every account is ' + money(f.low.cash) + ' on ' + longDay(f.low.date) + ', against a floor of ' + money(floor) + ')') + '.');
    } else words.push('It keeps the cash floor: the lowest day of cash across every account is ' + money(f.low.cash) + ' on ' + longDay(f.low.date) + ' (' + money(b.low.cash) + ' without it), against a floor of ' + money(floor) + '.');
    if (f.pull > b.pull) words.push(money(f.pull - b.pull) + ' more comes out of the cushion to keep checking above its floor.');
    if (worst && worst.days > 0) words.push(worst.pushedPast ? worst.name + ' was paid off on ' + longDay(worst.before) + '; with this it is not paid off inside the run (to ' + longDay(end) + '), at least ' + worst.days + ' days later.' : 'It pushes the ' + worst.name + ' payoff from ' + longDay(worst.before) + ' to ' + longDay(worst.after) + ', ' + worst.days + ' days later.');
    else if (measurable) words.push('No card or loan payoff date moves.');
    else if (payoff.length) words.push('Whether a payoff date moves cannot be measured: no card or loan is paid off inside the run (to ' + longDay(end) + ') either way.');
  }
  return { floor, floorSource: before.floor.source, pools: chosen.map((p) => p.key + '|' + p.year), flows, total, before: b, after: f, under, underBefore, newShortfalls: newShort, shortMore, pulled: round2(Math.max(0, f.pull - b.pull)), lowDrop: b.low && f.low ? round2(b.low.cash - f.low.cash) : null, breaks, payoff, measurable, pushed: worst && worst.days > 0 ? worst : null, end, words: words.join(' '), kind: blank.length ? 'incomplete' : before.kind, from: before.from, rough: before.rough, missing: [...new Set([...before.missing, ...blank.map((x) => x.path)])], rules: [...new Set([...before.rules, 'STAGE_RUNWAY_RED_MONTHS'])] };
}
