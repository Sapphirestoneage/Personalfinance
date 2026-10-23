// "How much to max it?" (S-211): for each tax-advantaged account and each tax
// year still open, the year's limit plus the catch-up for the owner's age, less
// what is already in for that year across every account that shares the limit,
// is the room left. IRA room is capped at the owner's earned income for the year
// (engine/tax.js earnedIncome; under married filing jointly, the couple's, less
// what the other spouse put into IRAs) and a Roth IRA's at the income phase-out
// on modified AGI. Conversions and rollovers never count against a limit (a 529
// rolled into a Roth IRA does). Each account type's last day is a rule
// (DEADLINE_* in data/rules-<year>.json, found by the types it lists), so a date
// changes in data, not here. Three amounts: a lump sum today, per month (one
// contribution a month from today to the deadline; for a payroll-only account,
// the months that hold a paycheck) and per paycheck (the owner's real pay dates
// before the deadline). maxItCash runs the amounts through engine/cashsim.js and
// says whether the cash floor breaks and whether a card or loan payoff moves.
//
// Limits are pools that accounts share: the owner's IRAs (ira:<person>); the
// owner's elective deferrals to 401(k), Roth 401(k), 403(b), TSP, SIMPLE and the
// Solo 401(k)'s employee part (deferral:<person>, the 402(g) limit); a 457(b)
// apart (k457b:<person>); the self-employed employer part of a SEP and a Solo
// 401(k) (employer:<person>); an HSA per person, or one for family coverage
// (hsa:<person> or hsa:family); the household's NY 529 deduction (ny529). A row
// says how much of its room sits in each pool (parts), so the totals count each
// pool once.
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
const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const IRA = ['traditional_ira', 'roth_ira', 'spousal_ira'];
const DEFERRAL = ['k401', 'roth_k401', 'k403b', 'tsp'];
const SUPER = { K401_CU50: 'K401_CU6063', SIMPLE_CU50: 'SIMPLE_CU6063' };
// Entries in a contributions list: rollovers and conversions never count; a 529 rolled into a Roth IRA does; employer marks a Solo 401(k)'s or SEP's employer part.
export const CONTRIBUTION_KINDS = ['contribution', 'rollover', 'conversion', 'from529', 'employer'];

// ---------------------------------------------------------------- whose, and which pools
const people = (spine) => spine.household.people || [];
// The partner's account when its owner says so and there is a partner; everything else is the first person's.
export const ownerOf = (spine, a) => (v(a.owner) === 'partner' && people(spine)[1] ? people(spine)[1] : people(spine)[0]);
const lineOwner = (spine, s) => s.personId || (people(spine)[0] || {}).id;
const coverage = (a) => (a.coverageLevel ? v(a.coverageLevel) : null);
export function poolsOf(spine, a) {
  const p = (ownerOf(spine, a) || {}).id;
  if (IRA.includes(a.type)) return [{ key: 'ira:' + p, part: 'all' }];
  if (DEFERRAL.includes(a.type) || a.type === 'simple_ira') return [{ key: 'deferral:' + p, part: 'all' }];
  if (a.type === 'solo_k401') return [{ key: 'deferral:' + p, part: 'employee' }, { key: 'employer:' + p, part: 'employer' }];
  if (a.type === 'sep_ira') return [{ key: 'employer:' + p, part: 'all' }];
  if (a.type === 'k457b') return [{ key: 'k457b:' + p, part: 'all' }];
  if (a.type === 'hsa') return [{ key: coverage(a) === 'family' ? 'hsa:family' : 'hsa:' + p, part: 'all' }];
  if (a.type === 'k529') return [{ key: 'ny529', part: 'all' }];
  return [];
}

// ---------------------------------------------------------------- deadlines (rules, not code)
// Whether an account has a yearly limit to fill here: a 529 only in New York (its deduction), an HSA unless its plan is not eligible.
export const appliesTo = (spine, a) => (a.type === 'k529' ? v(spine.household.state) === 'NY' : !(a.type === 'hsa' && a.planEligible && v(a.planEligible) === 'no'));
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
// Months of a year, through asOf, in which the owner was paid from a W-2 or tips (payroll saving comes out of those):
// the as-of month counts only once its first payday has passed.
function payrollMonths(spine, pid, year, asOf) {
  let n = 0;
  for (let m = 1; m <= 12; m++) {
    const ym = year + '-' + String(m).padStart(2, '0');
    if (ym > monthKey(asOf)) break;
    const runs = earningFor(spine, pid).filter((s) => activeDays(s.start, s.end, ym) > 0);
    if (!runs.length) continue;
    if (ym < monthKey(asOf) || runs.some((s) => payDatesOf(s, monthStart(ym), monthEnd(ym)).some((d) => d <= asOf))) n++;
  }
  return n;
}
// Months of a year, through asOf (money from take-home goes in every month).
const monthsIn = (year, asOf) => (year < +asOf.slice(0, 4) ? 12 : year > +asOf.slice(0, 4) ? 0 : +asOf.slice(5, 7));

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

// ---------------------------------------------------------------- what is in
// What is already in for the year on one account, for one part of it (a Solo
// 401(k)'s employee or employer money): the contributions list's entries for the
// year, else the monthly amount for the months gone by (a guess, rough), else
// nothing recorded (rough). A monthly amount that is blank is named as missing.
function contributedOn(spine, a, year, asOf, t, part = 'all') {
  const base = 'accounts.' + a.id;
  const list = a.contributions ? t.useFact(base + '.contributions', a.contributions) : null;
  const counts = (c) => c.year === year && c.kind !== 'rollover' && c.kind !== 'conversion' && (part === 'all' || (part === 'employer') === (c.kind === 'employer'));
  const entries = (list || []).filter(counts);
  const name = v(a.name) || a.id;
  if (entries.length) { const x = round2(entries.reduce((s, c) => s + c.amount, 0)); return { id: a.id, name, value: x, words: money(x) + ' recorded for ' + year, path: base + '.contributions', estimated: false, kind: a.contributions.kind }; }
  if (list && list.some((c) => c.year === year)) return { id: a.id, name, value: 0, words: 'nothing that counts recorded for ' + year, path: base + '.contributions', estimated: false, kind: a.contributions.kind };
  // Money through payroll goes in on paydays (a SIMPLE IRA is filed with the IRAs but filled from pay).
  const payroll = ['employerRetirement', 'hsaFsa'].includes(a.family) || a.type === 'simple_ira';
  const pid = (ownerOf(spine, a) || {}).id;
  const n = payroll ? payrollMonths(spine, pid, year, asOf) : monthsIn(year, asOf);
  if (part !== 'employer' && a.monthlyContribution && n > 0) {
    const m = t.useFact(base + '.monthlyContribution', a.monthlyContribution);
    if (m === null) return { id: a.id, name, value: 0, words: 'the monthly amount is not entered, so nothing is counted as in', path: base + '.monthlyContribution', estimated: true, kind: 'missing' };
    t.addRough(base + '.contributions');
    return { id: a.id, name, value: round2(m * n), words: 'about ' + money(m * n) + ' (' + money(m) + ' a month for ' + n + ' month' + (n === 1 ? '' : 's') + (payroll ? ' of pay' : '') + ' in ' + year + ', a guess until it is recorded)', path: base + '.contributions', estimated: true, monthly: m, months: n, kind: 'rough' };
  }
  const past = year <= +asOf.slice(0, 4);
  if (past) t.addRough(base + '.contributions');
  return { id: a.id, name, value: 0, words: 'nothing recorded for ' + year, path: base + '.contributions', estimated: past, kind: past ? 'rough' : 'computed' };
}
// Everything in for the year in one pool, across every account in it. An HSA's employer money counts against its limit.
function poolIn(spine, accts, key, year, asOf, t) {
  const parts = [];
  for (const a of accts) for (const p of poolsOf(spine, a)) {
    if (p.key !== key) continue;
    parts.push(contributedOn(spine, a, year, asOf, t, p.part));
    if (a.type === 'hsa' && a.employerSeed && year <= +asOf.slice(0, 4)) { const e = t.useFact('accounts.' + a.id + '.employerSeed', a.employerSeed); if (e) parts.push({ id: a.id, name: (v(a.name) || a.id) + ', employer money', value: e, words: money(e) + ' from the employer (it counts against the limit)', path: 'accounts.' + a.id + '.employerSeed', estimated: false, kind: a.employerSeed.kind }); }
  }
  return { value: round2(parts.reduce((s, p) => s + p.value, 0)), parts };
}

// ---------------------------------------------------------------- limits
// The limit for an account type and year, with the catch-up for the owner's age on December 31.
function catchUp(rules, rid, age, year, t) {
  if (!rid || age === null) return { amount: 0, rule: null };
  if (rid === 'HSA_CU55') return age >= t.rule(rules, 'HSA_CATCHUP_AGE', year) ? { amount: t.rule(rules, rid, year), rule: rid } : { amount: 0, rule: null };
  const [lo, hi] = t.rule(rules, 'SUPER_CATCHUP_AGES', year);
  if (SUPER[rid] && age >= lo && age <= hi) return { amount: t.rule(rules, SUPER[rid], year), rule: SUPER[rid] };
  if (age >= t.rule(rules, 'CATCHUP_AGE', year)) return { amount: t.rule(rules, rid, year), rule: rid };
  return { amount: 0, rule: null };
}
// A year with no rules file of its own reads the nearest one; the row says so and is rough.
function fallbackWords(rules, rid, year, t, path) {
  const m = rules.meta(rid, year);
  if (!m.fallback) return null;
  t.addRough(path);
  return year > m.year ? 'the ' + year + ' limits are not out yet, so ' + m.year + '\'s are used' : 'the ' + year + ' limits are not in the rules file, so ' + m.year + '\'s are used';
}
function limitOf(spine, rules, a, year, t, se) {
  const preset = PRESETS[a.type] || {};
  const person = ownerOf(spine, a);
  const birthPath = person ? 'household.people.' + person.id + '.birthDate' : null;
  const birth = person ? t.useFact(birthPath, person.birthDate) : null;
  const age = birth ? ageOn(birth, year + '-12-31') : null;
  const out = { value: null, base: null, baseRule: null, catchUp: 0, catchUpRule: null, age, birthPath, words: [] };
  if (a.type === 'k529') {
    const fs = t.read(spine, 'household.filingStatus');
    if (fs === null) return { ...out, missing: 'the filing status (it sets the New York deduction cap)', missingPath: 'household.filingStatus' };
    out.baseRule = fs === 'mfj' ? 'NY_529_DED_J' : 'NY_529_DED_S';
    out.base = t.rule(rules, out.baseRule, year);
    out.words.push('the New York deduction cap (' + (fs === 'mfj' ? 'married filing jointly' : 'one taxpayer') + ')');
  } else if (a.type === 'hsa') {
    const level = coverage(a);
    t.useFact('accounts.' + a.id + '.coverageLevel', a.coverageLevel);
    if (level === null) t.addRough('accounts.' + a.id + '.coverageLevel');
    out.baseRule = level === 'family' ? 'HSA_FAM' : 'HSA_SELF';
    out.base = t.rule(rules, out.baseRule, year);
    out.words.push(level === 'family' ? 'family coverage' : level === 'self' ? 'self-only coverage' : 'self-only coverage (a guess: the coverage is not entered)');
    const cu = catchUp(rules, 'HSA_CU55', age, year, t);
    Object.assign(out, { catchUp: cu.amount, catchUpRule: cu.rule });
    const months = a.monthsEligible ? t.useFact('accounts.' + a.id + '.monthsEligible', a.monthsEligible) : null;
    if (months !== null && months < 12) { out.months = months; out.words.push(months + ' of 12 months eligible'); }
  } else if (a.type === 'sep_ira') {
    out.baseRule = 'SEP_MAX';
    out.max = t.rule(rules, 'SEP_MAX', year);
    out.share = t.rule(rules, 'SE_EMPLOYER_SHARE', year);
    if (se.value === null) return { ...out, missing: se.label, earnedMissing: true };
    out.se = se.value;
    out.base = round2(Math.min(out.max, out.share * se.value));
    out.words.push(Math.round(out.share * 100) + '% of ' + money(se.value) + ' net self-employment earnings, at most ' + money(out.max));
  } else {
    if (!preset.limitRule) return out;
    out.baseRule = preset.limitRule;
    out.base = t.rule(rules, preset.limitRule, year);
    const cu = catchUp(rules, preset.catchUpRule, age, year, t);
    Object.assign(out, { catchUp: cu.amount, catchUpRule: cu.rule });
  }
  if (out.catchUp) out.words.push('the age ' + (out.catchUpRule === 'HSA_CU55' ? '55' : Object.values(SUPER).includes(out.catchUpRule) ? '60 to 63' : '50') + ' catch-up');
  let value = out.base + out.catchUp;
  if (out.months !== undefined) value = round2(value * Math.max(0, out.months) / 12);
  const fb = fallbackWords(rules, out.baseRule, year, t, 'accounts.' + a.id + '.contributions');
  if (fb) out.words.push(fb);
  return { ...out, value };
}
// The 401(k) deferral limit (402(g)) for a person and year, which SIMPLE and Solo 401(k) deferrals share.
function deferralLimit(rules, age, year, t) {
  const cu = catchUp(rules, 'K401_CU50', age, year, t);
  return { value: t.rule(rules, 'K401_DEF', year) + cu.amount, rule: 'K401_DEF', catchUpRule: cu.rule, catchUp: cu.amount };
}

// The Roth IRA limit at the year's modified AGI (AGI less Roth conversion income): reduced in the phase-out range,
// rounded up to the next $10, and never under $200 while above $0 (Publication 590-A, Worksheet 2-2).
function rothLimit(spine, rules, year, limit, t, path) {
  const status = v(spine.household.filingStatus);
  const tx = yearTax(spine, rules, year);
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
  return { limit: Math.min(limit, reduced), magi, lo, hi, words: 'modified AGI of ' + money(magi) + conv + ' is inside the ' + money(lo) + ' to ' + money(hi) + ' phase-out, so the Roth limit is ' + money(reduced) + ' (rounded up to $' + step + ', never under $' + floor + ')' };
}

// Why a year's earned income cannot be figured, naming each blank it waits on: an earning line's amount, or the
// pre-tax saving taken off the pay (S-211).
function eiGap(spine, e) {
  if (e.none) return 'no income is in the Ledger yet';
  if (!e.missing.length) return 'the earnings cannot be figured';
  const names = e.missing.map((p) => labelFor(spine, p));
  return (names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] + ' are' : names[0] + ' is') + ' not entered';
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
  const row = { id: a.id + ':' + year, accountId: a.id, name, type: a.type, typeLabel, year, group, pools: pools.map((p) => p.key), parts: {}, sharedWith: peers.map((x) => v(x.name) || x.id), applies: true, fillable: true, deadline, passed: deadline ? deadline.date < asOf : null, person: pid || null, main: deadline ? deadline.main : 'month',
    lump: null, perMonth: null, months: { count: 0, dates: [] }, paychecks: null, cap: null, phase: null, over: null, missingLabel: null, notes: [] };
  const done = (extra) => { const snap = t.snapshot(); const r = { ...row, ...extra }; const kind = r.room === null || r.room === undefined ? 'missing' : snap.missing.length ? 'incomplete' : snap.rough.length ? 'rough' : 'computed'; return { ...r, kind, from: snap.from, rough: snap.rough, missing: snap.missing, rules: snap.rules }; };

  // A 529 has a yearly limit to fill only where a state deduction is modeled (New York); an HSA only on an eligible plan.
  if (!appliesTo(spine, a) && a.type === 'k529') {
    const state = t.read(spine, 'household.state');
    return done({ applies: false, room: null, why: state === null ? 'The state is not entered. A 529\'s limit to fill here is the New York deduction.' : 'A 529 has no yearly limit to fill; the state deduction for ' + state + ' is not modeled (only New York\'s is).', missingLabel: state === null ? 'missing: the state' : null });
  }
  if (!appliesTo(spine, a)) { t.useFact('accounts.' + a.id + '.planEligible', a.planEligible); return done({ applies: false, room: 0, why: 'Not eligible: the health plan on this account is not HSA-eligible, so nothing can go in for ' + year + '.' }); }

  // Earned income: the owner's, and under married filing jointly the couple's (the spousal IRA rule).
  const ei = earnedIncome(spine, rules, year, { personId: pid });
  const se = { value: ei.value === null ? null : ei.seEarnings, label: ei.label };
  // The Show the math id of a person's earned income for the year (no person part with one person).
  const earnedId = (e) => 'earned:' + year + (people(spine).length > 1 && e.personId ? ':' + e.personId : '');
  const lim = limitOf(spine, rules, a, year, t, se);
  row.limit = lim;
  if (lim.value === null) { if (lim.missingPath) t.useFact(lim.missingPath, null); if (lim.earnedMissing) t.absorb({ ...ei, value: undefined }); return done({ room: null, why: lim.earnedMissing ? 'A SEP IRA for the self-employed is a share of the year\'s 1099 profit, and ' + eiGap(spine, ei) + '.' : 'The limit cannot be figured without ' + lim.missing + '.', missingLabel: 'missing: ' + lim.missing, ei, eiMetric: lim.earnedMissing ? earnedId(ei) : null }); }
  const mine = poolIn(spine, accts, pools[0].key, year, asOf, t);
  const own = mine.parts.filter((p) => p.id === a.id);
  const contributed = { value: mine.value, parts: mine.parts, estimated: mine.parts.some((p) => p.estimated) };
  row.contributed = contributed;
  const words = [];
  let room = null, ceiling = null, cap = null, phase = null;

  if (IRA.includes(a.type)) {
    const fs = v(spine.household.filingStatus);
    const other = people(spine).find((x) => x.id !== pid) || null;
    const joint = fs === 'mfj' && other;
    t.absorb({ ...ei, value: undefined });
    const eo = joint ? earnedIncome(spine, rules, year, { personId: other.id }) : null;
    if (eo) t.absorb({ ...eo, value: undefined });
    const missingEi = ei.value === null ? ei : eo && eo.value === null ? eo : null;
    if (missingEi) return done({ room: null, why: 'An IRA contribution can be no more than the year\'s earned income (W-2, tips and 1099; unemployment does not count), and ' + eiGap(spine, missingEi) + '.', missingLabel: 'missing: ' + missingEi.label, ei: missingEi, eiMetric: earnedId(missingEi) });
    // Under married filing jointly the couple's earned income, less what the other spouse put into IRAs, covers both.
    const otherIn = joint ? poolIn(spine, accts, 'ira:' + other.id, year, asOf, t).value : 0;
    const comp = joint ? round2(ei.value + eo.value - otherIn) : ei.value;
    cap = { value: comp, kind: ei.kind, label: joint ? 'the couple\'s ' + year + ' earned income, less ' + money(otherIn) + ' ' + other.name + ' put into IRAs' : ei.label, metric: 'earned:' + year + (people(spine).length > 1 ? ':' + pid : ''), joint: !!joint };
    if (a.type === 'spousal_ira' && !joint) words.push('A spousal IRA rests on married filing jointly; without it, its owner\'s own earned income is the cap.');
    ceiling = Math.min(lim.value, comp);
    if (a.type === 'roth_ira') {
      // The Roth limit is reduced by the phase-out; every IRA contribution still counts against the full limit.
      phase = rothLimit(spine, rules, year, lim.value, t, 'accounts.' + a.id + '.contributions');
      const rothIn = round2(own.reduce((s, p) => s + p.value, 0)) + round2(mine.parts.filter((p) => p.id !== a.id && (accts.find((x) => x.id === p.id) || {}).type === 'roth_ira').reduce((s, p) => s + p.value, 0));
      room = round2(Math.max(0, Math.min(phase.limit - rothIn, ceiling - contributed.value)));
    } else room = round2(Math.max(0, ceiling - contributed.value));
    if (comp < lim.value) words.push('Capped at ' + cap.label + ' (' + money(comp) + ').');
    if (phase && phase.words) words.push(cap1(phase.words) + '.');
  } else if (DEFERRAL.includes(a.type) || a.type === 'k457b' || a.type === 'hsa' || a.type === 'k529' || a.type === 'sep_ira') {
    ceiling = lim.value;
    if (a.type === 'sep_ira') {
      cap = { value: lim.se, kind: ei.kind, label: year + ' self-employment earnings', metric: 'earned:' + year + (people(spine).length > 1 ? ':' + pid : '') };
      t.absorb({ ...ei, value: undefined });
      // The employer share is one limit for a SEP and a Solo 401(k) on the same earnings.
      const sepOwn = round2(own.reduce((s, p) => s + p.value, 0));
      room = round2(Math.max(0, Math.min(lim.max - sepOwn, lim.base - contributed.value)));
      if (contributed.parts.some((p) => p.id !== a.id)) words.push('The employer share is one limit with the Solo 401(k) on the same earnings.');
    } else room = round2(Math.max(0, ceiling - contributed.value));
  } else if (a.type === 'simple_ira') {
    // A SIMPLE has its own lower limit, and its deferrals share the 401(k) limit too (402(g)).
    const dl = deferralLimit(rules, lim.age, year, t);
    const simpleIn = round2(own.reduce((s, p) => s + p.value, 0));
    ceiling = lim.value;
    room = round2(Math.max(0, Math.min(lim.value - simpleIn, dl.value - contributed.value)));
    cap = { value: dl.value, label: 'the 401(k) deferral limit it shares', rule: 'K401_DEF' };
    if (dl.value - contributed.value < lim.value - simpleIn) words.push('Capped by the 401(k) deferral limit it shares (' + money(dl.value) + ' across every plan).');
  } else if (a.type === 'solo_k401') {
    t.absorb({ ...ei, value: undefined });
    if (ei.value === null) return done({ room: null, why: 'A Solo 401(k) is figured on self-employment earnings, and ' + eiGap(spine, ei) + '.', missingLabel: 'missing: ' + ei.label, ei, eiMetric: earnedId(ei) });
    const seAmt = ei.seEarnings;
    const share = t.rule(rules, 'SE_EMPLOYER_SHARE', year);
    const emp = poolIn(spine, accts, 'employer:' + pid, year, asOf, t);
    const soloAll = round2(contributedOn(spine, a, year, asOf, t, 'all').value);
    const employee = round2(Math.max(0, lim.value - contributed.value));
    const employer = round2(Math.max(0, share * seAmt - emp.value));
    const total = round2(t.rule(rules, 'ADD_415C', year) + lim.catchUp);
    const electGone = deadline.elect && deadline.elect.date < asOf;
    const emplCounted = electGone ? 0 : employee;
    room = round2(Math.max(0, Math.min(emplCounted + employer, total - soloAll, seAmt - soloAll)));
    ceiling = total;
    cap = { value: seAmt, kind: ei.kind, label: year + ' self-employment earnings', metric: 'earned:' + year + (people(spine).length > 1 ? ':' + pid : ''), employee, employer, employeeCounted: emplCounted, total, share, employerIn: emp.value, electGone };
    // The employer part first: no other plan can take it, while a W-2 401(k) can take the deferral.
    row.parts['employer:' + pid] = Math.min(employer, room);
    row.parts['deferral:' + pid] = round2(room - row.parts['employer:' + pid]);
    words.push('Employee deferral up to ' + money(employee) + (contributed.value ? ' (after ' + money(contributed.value) + ' of deferrals this year across every plan)' : '') + ', employer part up to ' + money(employer) + ' (' + Math.round(share * 100) + '% of ' + money(seAmt) + '), in all at most ' + money(Math.min(total, seAmt)) + '.');
    if (electGone) words.push('The employee deferral had to be elected by ' + longDay(deadline.elect.date) + '; only if it was can up to ' + money(employee) + ' more go in, so the room here is the employer part.');
  }
  if (room === null) room = 0;
  if (!Object.keys(row.parts).length) row.parts[pools[0].key] = room;
  // Over the limit: what is in passed what the year allows (an excess contribution).
  const allowed = IRA.includes(a.type) ? Math.min(lim.value, cap ? cap.value : lim.value) : ceiling;
  if (allowed !== null && contributed.value - allowed > 0.005 && a.type !== 'solo_k401') row.over = round2(contributed.value - allowed);

  // The three amounts.
  const passed = !deadline || deadline.date < asOf;
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
      if (sched.length && (!s.amount || v(s.amount) === null)) blank = blank || s;
      const ds = inRun.length && reach && reach >= end ? inRun.map((i) => ({ date: i.date, cents: i.cents, s })) : sched.map((d) => ({ date: d, cents: null, s }));
      list.push(...ds);
    }
    const byDate = [...new Set(list.map((x) => x.date))].sort();
    const landedList = list.filter((x) => x.cents !== null).map((x) => x.cents / 100);
    const landed = landedList.length ? round2(Math.min(...landedList)) : null;
    const main = streams.find((s) => list.some((x) => x.s === s)) || null;
    const perYear = main && PER_YEAR[main.cadence] ? PER_YEAR[main.cadence] : 12;
    const nowPer = payrollOnly && a.monthlyContribution && v(a.monthlyContribution) ? round2(v(a.monthlyContribution) * 12 / perYear) : 0;
    const per = byDate.length ? ceil2(room / byDate.length) : null;
    const holds = landed === null ? null : round2(landed + nowPer);
    paychecks = { count: byDate.length, dates: byDate, streams: [...new Set(list.map((x) => x.s.label))], perPaycheck: per, current: nowPer, landed, holds, tooBig: payrollOnly && per !== null && holds !== null && per > holds, blank: blank ? { label: blank.label, path: 'income.' + blank.id + '.amount' } : null };
    if (blank && payrollOnly) t.useFact('income.' + blank.id + '.amount', blank.amount);
    // A payroll-only account fills only on paydays: its months are the months that hold one.
    if (payrollOnly) dates = [...new Set(byDate.map((d) => monthKey(d)))].map((ym) => byDate.find((d) => monthKey(d) === ym));
    if (payrollOnly && !byDate.length) row.fillable = false;
  }
  const fillable = row.fillable && !passed;
  const perMonth = fillable && dates.length ? ceil2(room / dates.length) : null;
  const monthly = a.monthlyContribution ? v(a.monthlyContribution) : null;
  words.unshift('The ' + year + ' limit is ' + money(lim.value) + (lim.words.length ? ' (' + lim.words.join(', ') + ')' : '') + '.', 'In for ' + year + ' so far: ' + contributed.parts.map((p) => (contributed.parts.length > 1 ? p.name + ' ' : '') + p.words).join('; ') + '.');
  if (row.over) words.push('Over the limit by ' + money(row.over) + ': an excess contribution. Take it out, with what it earned, by the deadline to avoid the 6% tax on it.');
  else words.push(room > 0 ? money(room) + ' of room is left for ' + year + '.' : 'The ' + year + ' room is full.');
  if (!row.fillable && !passed) words.push('No paycheck from ' + (person.name || 'the owner') + '\'s pay lands before ' + longDay(deadline.date) + ', and this account only takes money through payroll, so the ' + year + ' room cannot be filled.');
  return done({ room, ceiling, cap, phase, lump: fillable ? room : null, months: { count: dates.length, dates }, perMonth, paychecks, current: monthly, why: words.join(' '), missingLabel: null, ei });
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
  return { asOf, rows, accounts, pools: pools.list, window, totals: { lump: pools.lump, perMonth: pools.perMonth, groups: pools.list.length, missing: missingRows.map((r) => r.id), unfillable: unfillable.map((r) => r.id) }, simDays: sim ? sim.days : null, kind: missingRows.length || snap.missing.length ? 'incomplete' : snap.rough.length ? 'rough' : 'computed', ...snap };
}

// Each pool and year once: its room is the largest part any row puts in it (ties go to the earlier deadline), filled
// by that row's own months. Under married filing jointly the two spouses' IRA pools together never pass the couple's
// earned income less what is in.
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
  const fs = v(spine.household.filingStatus);
  for (const year of [...new Set(list.map((p) => p.year))]) {
    const ira = list.filter((p) => p.year === year && p.key.startsWith('ira:'));
    if (fs !== 'mfj' || ira.length < 2) continue;
    const joint = ira[0].row.cap && ira[0].row.cap.joint ? ira[0].row.cap.value : null;
    if (joint === null) continue;
    // Both spouses' IRAs share the couple's earned income: the first takes its room, the second what is left of it
    // (the cap already took out what the second put in; what the first put in comes off here).
    const left = Math.max(0, round2(joint - ira[0].row.contributed.value - ira[0].room));
    if (ira[1].room > left) { ira[1].room = left; ira[1].sharedCap = true; }
  }
  for (const p of list) p.perMonth = p.row.months.count ? ceil2(p.room / p.row.months.count) : null;
  return { list, lump: round2(list.reduce((s, p) => s + p.room, 0)), perMonth: round2(list.reduce((s, p) => s + (p.perMonth || 0), 0)) };
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
    if (!canMaxIt(rules, a, ty)) continue;
    const d = deadlineOf(rules, a.type, ty);
    const name = v(a.name) || (PRESETS[a.type] || {}).label || a.id;
    const days = [[d.date, d.rule, 'last day for ' + ty + ' contributions'], ...(d.elect ? [[d.elect.date, d.elect.rule, 'elect the ' + ty + ' employee deferral by this day']] : [])];
    for (const [date, rule, what] of days) {
      if (date < from || date > to) continue;
      const passed = date < asOf;
      if (!appliesTo(spine, a)) continue;
      const r = passed ? null : maxItRow(spine, rules, a, ty, { asOf });
      const room = passed ? 'The ' + ty + ' year closed on this day' : r.room === null ? cap1(r.missingLabel || 'missing') : r.over ? 'Over the ' + ty + ' limit by ' + money(r.over) : r.room > 0 ? money(r.room) + ' of room left for ' + ty + (r.kind === 'rough' ? ' (rough)' : '') : 'The ' + ty + ' room is full';
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
// The amounts run through the day-by-day simulation: each pool's money leaves
// checking on its dates (a payroll-only account on its paydays, only the part
// above what already comes out of each paycheck; the rest one payment a month,
// less what already goes into that pool each month, counted once a month even
// when two tax years are open). The last payment is what is left of the room, so
// the payments add up to it. Compared with the same run without them: the lowest
// day of cash across every account against the floor (the stage 1 month),
// payments that fall short, money pulled from the cushion, and each card and
// loan's payoff date.
export function maxItCash(spine, rules, mx, { rows = null, sim = null, asOf = mx.asOf } = {}) {
  const chosen = rows ? poolTotals(spine, rules, rows, { asOf }).list : mx.pools;
  const before = sim || maxItSim(spine, rules, { asOf });
  const flows = [];
  const already = new Map();
  for (const p of chosen) {
    const r = p.row;
    if (!p.room || !r.fillable) continue;
    const a = spine.accounts.find((x) => x.id === r.accountId);
    if (r.deadline.payrollOnly) {
      const pc = r.paychecks;
      if (!pc || !pc.count) continue;
      const per = round2(p.room / pc.count);
      pc.dates.forEach((d, i) => { const amt = round2((i === pc.count - 1 ? round2(p.room - per * (pc.count - 1)) : per) - pc.current); if (amt > 0) flows.push({ pool: p.key, row: r.id, date: d, amount: amt, label: 'More into ' + r.name + ' from pay' }); });
      continue;
    }
    // What already goes into this pool each month (every account in it with a monthly amount the run moves).
    if (!already.has(p.key)) already.set(p.key, round2(spine.accounts.filter((x) => poolsOf(spine, x).some((q) => q.key === p.key) && x.monthlyContribution && v(x.monthlyContribution)).reduce((s, x) => s + v(x.monthlyContribution), 0)));
    const n = r.months.count;
    const per = ceil2(p.room / n);
    r.months.dates.forEach((d, i) => flows.push({ pool: p.key, row: r.id, date: d, amount: i === n - 1 ? round2(p.room - per * (n - 1)) : per, label: 'More into ' + r.name, gross: true }));
  }
  // Net what already goes in once per pool and month.
  const byMonth = new Map();
  for (const f of flows.filter((x) => x.gross)) { const k = f.pool + '|' + monthKey(f.date); if (!byMonth.has(k)) byMonth.set(k, []); byMonth.get(k).push(f); }
  const net = flows.filter((x) => !x.gross);
  for (const [k, fs] of byMonth) {
    let left = already.get(k.split('|')[0]) || 0;
    for (const f of fs.sort((x, y) => (x.date < y.date ? -1 : 1))) { const take = Math.min(left, f.amount); left = round2(left - take); const amt = round2(f.amount - take); if (amt > 0) net.push({ ...f, amount: amt, gross: undefined }); }
  }
  net.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
  const after = cashsim(spine, rules, { asOf, days: before.days, adjust: (model) => {
    const pid = (model.accounts.find((x) => x.primary) || model.accounts[0] || {}).id;
    net.forEach((f, i) => model.transfers.push({ id: 'maxit:' + i, label: f.label, cents: Math.round(f.amount * 100), cadence: 'once', date: f.date, from: pid, to: 'goals', kind: 'savings', path: null }));
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
  const total = round2(net.reduce((x, fl) => x + fl.amount, 0));
  // Payroll money whose pay amount is blank is not in the run: the check says so and is incomplete.
  const blank = chosen.filter((p) => p.row.deadline.payrollOnly && p.row.paychecks && p.row.paychecks.blank).map((p) => p.row.paychecks.blank);
  const words = [];
  if (blank.length && net.length) words.push('Incomplete: ' + [...new Set(blank.map((x) => x.label))].join(' and ') + ' has no amount, so that pay is not in the run.');
  if (!net.length) words.push('Nothing more leaves checking: what already goes in covers it.');
  else {
    words.push(money(total) + ' more leaves checking by ' + longDay(net[net.length - 1].date) + '.');
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
  return { floor, floorSource: before.floor.source, pools: chosen.map((p) => p.key + '|' + p.year), flows: net, total, before: b, after: f, under, underBefore, newShortfalls: newShort, shortMore, pulled: round2(Math.max(0, f.pull - b.pull)), lowDrop: b.low && f.low ? round2(b.low.cash - f.low.cash) : null, breaks, payoff, measurable, pushed: worst && worst.days > 0 ? worst : null, end, words: words.join(' '), kind: blank.length ? 'incomplete' : before.kind, from: before.from, rough: before.rough, missing: [...new Set([...before.missing, ...blank.map((x) => x.path)])], rules: [...new Set([...before.rules, 'STAGE_RUNWAY_RED_MONTHS'])] };
}
