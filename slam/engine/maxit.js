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

import { valueOf as v, tracker, round2, ageOn, addMonths, monthKey, daysBetween, dayIn, monthStart, monthEnd, accountOwner, incomeOwner } from './spine.js';
import { PRESETS, PER_YEAR } from './schema.js';
import { earnedIncome, yearTax } from './tax.js';
import { activeDays, streamWeight } from './cashflow.js';
import { cashsim } from './cashsim.js';
import * as C from './vendor/cashcal.js';
import { money as fmt } from '../src/ui/format.js';
import { labelFor } from './labels.js';
import { DEFERRAL, FROM_PAY, CONTRIBUTION_KINDS, payDatesOf, earningFor, paydaysOf, contributedOn, stillOn, coverageOf as coverage, familyHsa, hsaLimit } from './contrib.js';
export { payDatesOf, CONTRIBUTION_KINDS };

// Whole dollars read as whole dollars, anything else to the cent.
const money = (x) => (x === null || x === undefined ? 'missing' : fmt(x, Math.round(x) !== Math.round(x * 100) / 100));
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const longDay = (iso) => MONTHS[+iso.slice(5, 7) - 1] + ' ' + (+iso.slice(8, 10)) + ', ' + iso.slice(0, 4);
const ceil2 = (x) => Math.ceil(Math.round(x * 1000) / 10) / 100;
const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const IRA = ['traditional_ira', 'roth_ira', 'spousal_ira'];
const SUPER = { K401_CU50: 'K401_CU6063', SIMPLE_CU50: 'SIMPLE_CU6063' };

// ---------------------------------------------------------------- whose, and which pools
const people = (spine) => spine.household.people || [];
// Whose an account and a pay line are (engine/spine.js): the partner's when the owner says so, a spousal IRA with no
// owner the partner's, else the first person's.
export const ownerOf = accountOwner;
const lineOwner = incomeOwner;
// Whether an account has a yearly limit to fill here: a 529 only in New York (its deduction; a blank state is
// missing, not outside New York), an HSA unless its plan is not eligible.
export const appliesTo = (spine, a) => (a.type === 'k529' ? [null, 'NY'].includes(v(spine.household.state)) : !(a.type === 'hsa' && a.planEligible && v(a.planEligible) === 'no'));
// An account whose owner is not one person in the household: a child's, a joint one, or a partner's with no partner
// in the household. Its limit is not the first person's, so it shares no pool with theirs (S-217).
export function oddOwner(spine, a) {
  if (a.type === 'k529') return null;
  const o = a.owner ? v(a.owner) : null;
  // A spousal IRA with no owner is the partner's: with no partner in the household, it waits on whose it is.
  if (o === null) return a.type === 'spousal_ira' && people(spine).length < 2 ? 'noPartner' : null;
  if (o === 'child' || o === 'joint') return o;
  return o === 'partner' && people(spine).length < 2 ? 'noPartner' : null;
}
export function poolsOf(spine, a) {
  const p = oddOwner(spine, a) ? 'acct-' + a.id : (ownerOf(spine, a) || {}).id;
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
// The owner's paydays, pay months and what goes in each year are engine/contrib.js's (one count for here and for tax).

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
    // The limit is engine/contrib.js's hsaLimit (the tax engine caps the HSA deduction with the same one).
    const level = coverage(a), L = hsaLimit(spine, rules, a, year, t);
    t.useFact('accounts.' + a.id + '.coverageLevel', a.coverageLevel);
    if (level === null && !L.family) t.addRough('accounts.' + a.id + '.coverageLevel');
    out.baseRule = L.baseRule;
    out.family = L.family;
    out.words.push(L.family ? (level === 'family' ? 'family coverage' : 'family coverage (an HSA in the household has family coverage, so every HSA is under the family limit)') : level === 'self' ? 'self-only coverage' : 'self-only coverage (a guess: the coverage is not entered)');
    Object.assign(out, { catchUp: L.catchUp, catchUpRule: L.catchUpRule });
    if (L.months !== undefined) { out.months = L.months; out.words.push(L.months + ' of 12 months eligible'); }
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
// The Roth limit for a base (the lesser of the limit and pay) at a phase-out already figured: the base under it, $0
// past it, inside it the base reduced in proportion, rounded up to the step, never under the floor (Pub 590-A
// Worksheet 2-2). An unknown phase-out leaves the base.
export function rothReduced(rules, year, base, ph) {
  if (!ph || ph.unknown || ph.lo == null || ph.magi <= ph.lo) return base;
  if (ph.magi >= ph.hi) return 0;
  const step = rules.get('ROTH_PO_ROUND', year), floor = rules.get('ROTH_PO_MIN', year);
  let r = Math.ceil((base - base * (ph.magi - ph.lo) / (ph.hi - ph.lo)) / step - 1e-9) * step;
  if (r > 0 && r < floor) r = floor;
  return Math.max(0, Math.min(base, r)) + 0;
}
// pid: whose Roth it is. Two people who do not file jointly each file their own return, so the phase-out reads that
// person's own income and accounts (S-219); married filing jointly reads the household's.
function rothLimit(spine, rules, year, limit, t, path, pid = null) {
  const status = v(spine.household.filingStatus);
  const ps = people(spine);
  const own = !!pid && ps.length > 1 && status !== 'mfj';
  const sp = own ? { ...spine, income: (spine.income || []).filter((s) => incomeOwner(spine, s) === pid), accounts: (spine.accounts || []).filter((a) => !oddOwner(spine, a) && (ownerOf(spine, a) || {}).id === pid) } : spine;
  const who = own ? ((ps.find((x) => x.id === pid) || {}).name || 'their') + '\'s ' : '';
  let tx = yearTax(sp, rules, year);
  // Conversions are not in modified AGI, so a conversion with no amount does not stop the check: the AGI without them is.
  const mp = tx.missingPaths || {};
  const only = (mp.income || []).length && (mp.income || []).every((p) => p.endsWith('.conversions')) && !(mp.wages || []).length && !(mp.other || []).length;
  if (only) tx = yearTax({ ...sp, accounts: sp.accounts.map((a) => (a.conversions ? { ...a, conversions: undefined } : a)) }, rules, year);
  const agi = tx.lines.agi ? tx.lines.agi.value : null;
  if (agi === null) { t.addRough(path); return { limit, unknown: true, words: 'whether income is under the Roth phase-out cannot be checked until the year\'s tax can be figured' }; }
  t.absorb({ ...tx.lines.agi, value: undefined });
  const magi = round2(agi - (tx.inputs.conversions || 0));
  const key = { single: 'ROTH_PO_S', hoh: 'ROTH_PO_S', mfj: 'ROTH_PO_J' }[status];
  const lo = status === 'mfs' ? 0 : key ? t.rule(rules, key + '_LO', year) : null, hi = status === 'mfs' ? t.rule(rules, 'ROTH_PO_MFS', year) : key ? t.rule(rules, key + '_HI', year) : null;
  if (hi === null) { t.addRough(path); return { limit, unknown: true, magi, words: 'the phase-out needs the filing status' }; }
  const conv = tx.inputs.conversions ? ' (AGI less ' + money(tx.inputs.conversions) + ' of Roth conversions)' : '';
  if (magi <= lo) return { limit, magi, words: null };
  if (magi >= hi) return { limit: 0, magi, lo, hi, words: who + 'modified AGI of ' + money(magi) + conv + ' is over the ' + money(hi) + ' phase-out, so there is no Roth room (a backdoor Roth is not modeled)' };
  const step = t.rule(rules, 'ROTH_PO_ROUND', year), floor = t.rule(rules, 'ROTH_PO_MIN', year);
  const reduced = rothReduced(rules, year, limit, { magi, lo, hi });
  return { limit: reduced, base: limit, magi, lo, hi, words: who + 'modified AGI of ' + money(magi) + conv + ' is inside the ' + money(lo) + ' to ' + money(hi) + ' phase-out, so the Roth limit is ' + money(Math.min(limit, reduced)) + ' (' + money(limit) + ' reduced, rounded up to $' + step + ', never under $' + floor + ')' };
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
// New money in equal amounts rounded up to the cent: the amount, the last one (what is left) and how many it takes,
// fewer than n when it is only a few cents (so no installment is below a cent or below zero).
function split(fill, n) {
  if (!n) return { per: null, last: null, count: 0 };
  const per = ceil2(fill / n);
  const count = per > 0 ? Math.min(n, Math.ceil(Math.round(fill / per * 1e6) / 1e6)) : n;
  return { per, last: round2(fill - per * (count - 1)), count };
}

function overWords(type, year, over) {
  const head = 'Over the ' + year + ' limit by ' + money(over) + ': ';
  return [...FROM_PAY, 'solo_k401'].includes(type) ? head + 'an excess deferral. Have the plan pay it back, with what it earned, by April 15, ' + (year + 1) + ', or it is taxed twice.' : head + 'an excess contribution. Take it out, with what it earned, by the ' + year + ' tax filing due date, extensions included, to avoid the 6% tax on it.';
}

// ---------------------------------------------------------------- one account, one tax year
// sim (optional) is a day-by-day run long enough to reach the deadline; its pay dates make the per-paycheck amount.
// claims (optional): a run's matches of logged or imported deposits to paydays (cashsim claims); the run's own by default.
export function maxItRow(spine, rules, a, year, { asOf = spine.meta.asOf, sim = null, all = null, claims = sim ? sim.claims : null } = {}) {
  // Paychecks the run matched to a logged or imported deposit count on the day they came (engine/contrib.js paydaysOf).
  const payClaims = (claims || []).filter((c) => c.kind === 'income');
  const paidKeys = new Set(payClaims.map((c) => c.key));
  if (payClaims.length) spine = { ...spine, payClaims: new Map(payClaims.map((c) => [c.key, c.date])) };
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

  // A child's account rests on the child's own pay, which the Ledger does not hold; a limit is one person's, so a joint
  // account, or a partner's with no partner in the household, waits on whose it is.
  const odd = oddOwner(spine, a);
  if (odd === 'child') { t.useFact('accounts.' + a.id + '.owner', a.owner); return done({ applies: false, room: null, why: 'A child\'s ' + typeLabel + ' rests on the child\'s own earned income, which is not in the Ledger, so its room is not figured here (it never shares a parent\'s limit).' }); }
  if (odd) { t.useFact('accounts.' + a.id + '.owner', null); return done({ room: null, why: 'A ' + typeLabel + '\'s limit is one person\'s, and ' + (odd === 'joint' ? 'this one is set as joint' : 'it is set as the partner\'s, with no partner in the household') + '. Choose whose it is.', missingLabel: 'missing: whose ' + typeLabel + ' this is' }); }
  // A 529 has a yearly limit to fill only where a state deduction is modeled (New York); an HSA only on an eligible plan.
  if (!appliesTo(spine, a) && a.type === 'k529') { const state = t.read(spine, 'household.state'); return done({ applies: false, room: null, why: 'A 529 has no yearly limit to fill; the state deduction for ' + state + ' is not modeled (only New York\'s is).' }); }
  if (!appliesTo(spine, a)) { t.useFact('accounts.' + a.id + '.planEligible', a.planEligible); return done({ applies: false, room: 0, why: 'Not eligible: the health plan on this account is not HSA-eligible, so nothing can go in for ' + year + '.' }); }

  // What the record form starts at (read on its own, so it never changes this row's facts): the account's own
  // contribution total counted now, without a 529 rolled in (counted on its own), and a Solo's employer part.
  const rc = contributedOn(spine, a, year, asOf, tracker(), 'own');
  row.record = { total: round2(rc.value - (rc.events || 0)), events: rc.events || 0, estimated: !!rc.estimated && rc.kind !== 'missing', employer: a.type === 'solo_k401' ? contributedOn(spine, a, year, asOf, tracker(), 'employer').value : 0 };
  // Earned income: the owner's, and under married filing jointly the couple's for the spouse who earns less (the spousal IRA rule).
  const ei = earnedIncome(spine, rules, year, { personId: pid });
  // The Show the math id of a person's earned income for the year (no person part with one person).
  const earnedId = (e) => 'earned:' + year + (people(spine).length > 1 && e.personId ? ':' + e.personId : '');
  const se = { value: ei.value === null ? null : ei.seEarnings, label: ei.label };
  const lim = limitOf(spine, rules, a, year, t, se);
  row.limit = lim;
  if (lim.value === null) { if (lim.missingPath) t.useFact(lim.missingPath, null); if (lim.earnedMissing) t.absorb({ ...ei, value: undefined }); return done({ room: null, why: lim.earnedMissing ? 'A SEP IRA for the self-employed is a share of the year\'s 1099 profit, and ' + eiGap(spine, ei) + '.' : 'The limit cannot be figured without ' + lim.missing + '.', missingLabel: 'missing: ' + lim.missing, ei, eiMetric: lim.earnedMissing ? earnedId(ei) : null }); }
  // A plan filled only from pay, in a household of two where no pay line is the owner's: whose pay it is, is missing.
  // Any W-2 or tips line counts here, a maybe line or a $0 one too (as in engine/cashflow.js): only a household with no
  // pay line of the owner's at all is asked. The link goes to a line no one is named on, if there is one.
  const payLines = (spine.income || []).filter((s) => s.type === 'w2' || s.type === 'tips');
  // The first person is never asked: a line no one is named on is theirs, so every line not theirs names someone else.
  if (deadline && deadline.payrollOnly && people(spine).length > 1 && pid !== people(spine)[0].id && payLines.length && !payLines.some((s) => incomeOwner(spine, s) === pid)) {
    t.useFact('income.' + (payLines.find((s) => !s.personId) || payLines[0]).id + '.personId', null);
    return done({ room: null, why: 'A ' + typeLabel + ' fills only through pay, and no W-2 or tips line in the Ledger is ' + (person.name || 'the owner') + '\'s. Open the pay line that is ' + (person.name ? person.name + '\'s' : 'theirs') + ' and choose whose pay it is.', missingLabel: 'missing: whose pay is ' + (person.name || 'the owner') + '\'s' });
  }
  const mine = poolIn(spine, accts, pools[0].key, year, asOf, t);
  const own = mine.parts.filter((p) => p.id === a.id);
  const contributed = { value: mine.value, parts: mine.parts, estimated: mine.parts.some((p) => p.estimated) };
  row.contributed = contributed;

  const words = [];
  let room = null, ceiling = null, cap = null, phase = null, over = 0;
  // Each pool's room left for the year across every account in it, where it differs from this row's part. For the
  // spouse who earns more, what counts as set to go over is measured against their own pay (ownLeft, ownPart).
  const left = {}, ownLeft = {}, ownPart = {};

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
    // What the other spouse put in, and what their monthly amounts still put in for the year, both come off.
    const joint = !!eo && eo.value > ei.value;
    const higher = !!eo && eo.value < ei.value;
    const otherIn = eo ? poolIn(spine, accts, 'ira:' + other.id, year, asOf, t).value : 0;
    const otherStill = eo ? poolStill(spine, accts, 'ira:' + other.id, year, asOf, t).value : 0;
    // Self-employment pay counts for an IRA less what goes into that person's own Solo 401(k) or SEP (Pub 590-A,
    // Schedule 1 line 16), never more than that pay: what is in and still set to go in comes off here, new money in the
    // Plan (poolTotals). The couple's pay is each spouse's pay counted that way.
    const seUsedOf = (who, e) => (e.value === null ? 0 : Math.min(e.seEarnings || 0, round2(accts.filter((x) => (x.type === 'solo_k401' || x.type === 'sep_ira') && !oddOwner(spine, x) && (ownerOf(spine, x) || {}).id === who).reduce((x, p) => x + contributedOn(spine, p, year, asOf, t).value + ((stillOn(spine, p, year, asOf, t) || {}).value || 0), 0))));
    const seUsed = seUsedOf(pid, ei), theirSe = eo ? seUsedOf(other.id, eo) : 0;
    const couple = eo ? round2(ei.value - seUsed + eo.value - theirSe) : null;
    // Only what the other spouse may put in counts against the couple's pay: no more than their own dollar limit (and,
    // for the spouse who earns more, their own pay). Money past that is their excess, not this spouse's.
    const theirIra = eo ? accts.find((x) => IRA.includes(x.type) && !oddOwner(spine, x) && (ownerOf(spine, x) || {}).id === other.id) : null;
    const theirLim = theirIra ? limitOf(spine, rules, theirIra, year, t, se).value : null;
    const counted = eo ? Math.min(round2(otherIn + otherStill), theirLim ?? Infinity, joint ? round2(eo.value - theirSe) : Infinity) : 0;
    const comp = joint ? round2(couple - counted) : round2(ei.value - seUsed);
    // The spouse who earns more is held to their own pay, and the two together to the couple's: what the other spouse
    // may put in comes off what this row may add. An excess past their own pay is still measured against their own pay.
    const roomCap = higher ? Math.min(comp, round2(couple - counted)) : comp;
    cap = { value: comp, kind: ei.kind, label: joint ? 'the couple\'s ' + year + ' earned income, less ' + money(counted) + ' ' + other.name + ' put in or has set to go in' : ei.label, metric: joint ? 'earned:' + year + ':' + pid + '+' + other.id : earnedId(ei), joint, couple, seUsed: joint ? 0 : seUsed, seLeft: round2(Math.max(0, (ei.seEarnings || 0) - seUsed)), otherIn: joint ? otherIn : 0, otherStill: joint ? otherStill : 0 };
    // Under married filing jointly with unequal pay, the two spouses' IRAs share the couple's earned income.
    const theirs = eo && eo.value !== ei.value ? accts.filter((x) => IRA.includes(x.type) && !oddOwner(spine, x) && (ownerOf(spine, x) || {}).id === other.id) : [];
    for (const n of theirs.map((x) => v(x.name) || x.id)) if (!row.sharedWith.includes(n)) row.sharedWith.push(n);
    if (a.type === 'spousal_ira' && !joint) words.push(fs === 'mfj' ? 'A spousal IRA counts the couple\'s earned income only for the spouse who earns less; here its owner\'s own earned income is the cap.' : 'A spousal IRA rests on married filing jointly; without it, its owner\'s own earned income is the cap.');
    ceiling = Math.min(lim.value, roomCap);
    left[pools[0].key] = round2(ceiling - contributed.value);
    const rothIn = round2(mine.parts.filter((p) => (accts.find((x) => x.id === p.id) || {}).type === 'roth_ira').reduce((s, p) => s + p.value, 0));
    if (a.type === 'roth_ira') {
      // The Roth limit is reduced by the phase-out from the lesser of the limit and compensation; every IRA
      // contribution still counts against the full limit.
      phase = rothLimit(spine, rules, year, Math.min(lim.value, comp), t, 'accounts.' + a.id + '.contributions', pid);
      room = round2(Math.max(0, Math.min(phase.limit - rothIn, ceiling - contributed.value)));
      if (!phase.unknown) over = Math.max(over, rothIn - phase.limit);
    } else room = round2(Math.max(0, ceiling - contributed.value));
    over = Math.max(over, contributed.value - Math.min(lim.value, comp));
    if (comp < lim.value) words.push('Capped at ' + cap.label + (cap.seUsed ? ', less ' + money(cap.seUsed) + ' into a Solo 401(k) or SEP' : '') + ' (' + money(comp) + ').');
    else if (roomCap < lim.value) words.push('Capped at the couple\'s ' + year + ' earned income, less ' + money(counted) + ' ' + other.name + ' put in or has set to go in (' + money(roomCap) + ').');
    if (higher) {
      const ownCeil = Math.min(lim.value, comp);
      ownLeft[pools[0].key] = round2(ownCeil - contributed.value);
      ownPart[pools[0].key] = round2(Math.max(0, phase ? Math.min(phase.limit - rothIn, ownCeil - contributed.value) : ownCeil - contributed.value));
    }
    if (theirs.length) {
      // What both may still add is the Plan's count for the two IRAs (poolTotals, set by maxIt): this row alone says
      // only whose pay it shares.
      const myStill = poolStill(spine, accts, pools[0].key, year, asOf, t).value;
      const names = theirs.map((x) => v(x.name) || x.id);
      row.couple = { value: couple, with: other.name, withId: other.id, names, bothIn: round2(contributed.value + otherIn), bothStill: round2(myStill + otherStill), together: null, words: 'Shares the couple\'s ' + money(couple) + ' of ' + year + ' earned income with ' + other.name + '\'s ' + (names.length === 1 ? names[0] : 'IRAs') + '.' };
      words.push(row.couple.words);
    }
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
    left['hsa:family'] = famRoom;
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
      left[pools[0].key] = round2(lim.base - contributed.value);
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
    left[pools[0].key] = round2(dl.value - contributed.value);
    cap = { value: dl.value, label: 'the 401(k) deferral limit it shares', rule: 'K401_DEF' };
    over = Math.max(simpleIn - lim.value, contributed.value - dl.value);
    if (dl.value - contributed.value < lim.value - simpleIn) words.push('Capped by the 401(k) deferral limit it shares (' + money(dl.value) + ' across every plan).');
  } else if (a.type === 'solo_k401') {
    t.absorb({ ...ei, value: undefined });
    if (ei.value === null) return done({ room: null, why: 'A Solo 401(k) is figured on self-employment earnings, and ' + eiGap(spine, ei) + '.', missingLabel: 'missing: ' + ei.label, ei, eiMetric: earnedId(ei) });
    const seAmt = ei.seEarnings;
    const share = t.rule(rules, 'SE_EMPLOYER_SHARE', year);
    const emp = poolIn(spine, accts, 'employer:' + pid, year, asOf, t);
    // Everything in this Solo 401(k) for the year: its employee deferrals (recorded or the monthly guess) and its employer part.
    const soloAll = round2(contributedOn(spine, a, year, asOf, t, 'employee').value + contributedOn(spine, a, year, asOf, t, 'employer').value);
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
    left['employer:' + pid] = employer;
    left['deferral:' + pid] = employee;
    over = Math.max(contributed.value - lim.value, soloAll + sepIn - Math.min(total, seAmt));
    words.push('Employee deferral up to ' + money(employee) + (contributed.value ? ' (after ' + money(contributed.value) + ' of deferrals this year across every plan)' : '') + ', employer part up to ' + money(employer) + ' (' + Math.round(share * 100) + '% of ' + money(seAmt) + '), in all at most ' + money(Math.min(total, seAmt)) + (sepIn ? ' with the ' + money(sepIn) + ' in a SEP' : '') + '.');
    if (electGone) words.push('The employee deferral had to be elected by ' + longDay(deadline.elect.date) + '; only if it was can up to ' + money(employee) + ' more go in, so the room here is the employer part.');
  }
  if (room === null) room = 0;
  if (!Object.keys(row.parts).length) row.parts[pools[0].key] = room;
  if (over > 0.005) { row.over = round2(over); row.overWords = overWords(a.type, year, row.over); }

  // What is still set to go in for the year, per pool: the amounts below are new money on top of it.
  const passed = !deadline || deadline.date < asOf;
  // In each pool: new money fits both this row's own part (less its own monthly amount still to come) and the pool's
  // room left (less every account's still to come). Still to come past the room is an excess on the way (overSoon).
  const still = { value: 0, parts: [], byPool: {}, newByPool: {}, soon: 0 };
  let toFill = 0, overSoon = 0;
  for (const [key, part] of Object.entries(row.parts)) {
    const s = key.startsWith('hsa55:') ? { value: 0, parts: [] } : poolStill(spine, accts, key, year, asOf, t);
    const ownStill = round2(s.parts.filter((p) => p.id === a.id).reduce((x, p) => x + p.value, 0));
    const poolLeft = Math.max(0, left[key] ?? part);
    still.byPool[key] = s.value;
    still.parts.push(...s.parts.map((p) => ({ ...p, pool: key })));
    still.newByPool[key] = round2(Math.max(0, Math.min(part - ownStill, poolLeft - s.value)));
    toFill += still.newByPool[key];
    const oLeft = key in ownLeft ? Math.max(0, ownLeft[key]) : poolLeft, oPart = key in ownPart ? ownPart[key] : part;
    overSoon += Math.max(0, s.value - oLeft, ownStill - oPart);
  }
  toFill = round2(toFill);
  still.value = round2(room - toFill);
  still.soon = round2(Object.values(still.byPool).reduce((x, y) => x + y, 0));
  row.still = still;
  // Already over and set to go further over: the year-end excess is both.
  if (overSoon > 0.005 && !passed) {
    row.overSoon = round2(overSoon);
    row.overByYearEnd = round2((row.over || 0) + row.overSoon);
    row.overSoonWords = 'What is set up already puts ' + money(still.soon) + ' more in by December 31, ' + year + ', ' + (row.over ? 'making it ' + money(row.overByYearEnd) : money(row.overSoon)) + ' over the ' + year + ' limit: lower or stop it before then.';
  }

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
    // An account filled from take-home whose owner has no pay of their own (a spousal IRA): the household's paychecks.
    if (!streams.length && !payrollOnly) streams = people(spine).flatMap((x) => earningFor(spine, x.id, types));
    const end = deadline.date;
    const reach = sim && sim.daily.length ? sim.daily[sim.daily.length - 1].date : null;
    const list = [];
    let blank = null;
    for (const s of streams) {
      // A paycheck the run matched to a logged deposit has been paid, whatever its day: it holds no new money.
      const inRun = sim ? sim.run.items.filter((i) => i.kind === 'income' && !i.maybe && (i.sourceId === s.id || String(i.sourceId || '').startsWith('late:' + s.id + '|')) && i.date >= asOf && i.date <= end && !paidKeys.has(i.late || i.sourceId + '|' + i.origDate)) : [];
      const sched = paydaysOf(spine, s, asOf, end);
      const runs = !s.end || s.end >= asOf;
      // A weekly or biweekly line with no first pay date has no dates to count from; a line with no amount pays nothing in the run.
      if (runs && (s.cadence === 'weekly' || s.cadence === 'biweekly') && !s.start) blank = blank || { label: s.label, what: 'first pay date', path: 'income.' + s.id + '.payDay' };
      if (sched.length && (!s.amount || v(s.amount) === null)) blank = blank || { label: s.label, what: 'amount', path: 'income.' + s.id + '.amount' };
      // The run decides when it reaches the deadline and the line has an amount (skipped or moved paydays as the calendar has them).
      const useRun = sim && reach && reach >= end && s.amount && v(s.amount) !== null;
      const ds = useRun ? inRun.map((i) => ({ date: i.date, cents: i.cents, s })) : sched.map((d) => ({ date: d, cents: null, s }));
      list.push(...ds);
    }
    // A plan filled from pay counts every paycheck (two jobs paying on one day are two); the rest count days money comes.
    const lines = [...new Set(list.map((x) => x.s))];
    const multi = payrollOnly && lines.length > 1;
    const byDate = payrollOnly ? list.map((x) => x.date).sort() : [...new Set(list.map((x) => x.date))].sort();
    const landedList = list.filter((x) => x.cents !== null).map((x) => x.cents / 100);
    // What lands from a paycheck, never below $0 (withholding past the pay leaves nothing, not a debt): the smallest,
    // and each one, so two pay lines are held to what each of their paychecks holds, not the smallest times the count.
    const landed = landedList.length ? round2(Math.max(0, Math.min(...landedList))) : null;
    const each = list.filter((x) => x.cents !== null).map((x) => ({ date: x.date, line: x.s.label, landed: round2(Math.max(0, x.cents / 100)) })).sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
    const holdsTotal = each.length && each.length === list.length ? round2(each.reduce((x, y) => x + y.landed, 0)) : null;
    const main = streams.find((s) => list.some((x) => x.s === s)) || null;
    const perYear = main && PER_YEAR[main.cadence] ? PER_YEAR[main.cadence] : 12;
    // What comes out of a paycheck now: one line's monthly amount over its paychecks. With two or more pay lines each
    // paycheck carries a different share, so the amount is new money a paycheck on top of what each holds now.
    const nowPer = multi ? null : payrollOnly && a.monthlyContribution && v(a.monthlyContribution) ? round2(v(a.monthlyContribution) * 12 / perYear) : 0;
    // A few cents over many paydays takes fewer of them (no installment is ever below a cent).
    const sp = split(toFill, byDate.length);
    const n = sp.count, extra = sp.per, extraLast = sp.last;
    if (n < byDate.length) byDate.length = n;
    // Two or more pay lines whose smaller paychecks cannot take an even share, while all of them together can hold the
    // new money: each paycheck takes its share in proportion to what lands from it, so none is asked for more than it
    // holds (the cents left go on the largest).
    // When even all of them cannot hold it, each paycheck gives all that lands from it.
    let plan = null;
    if (multi && toFill > 0 && extra !== null && landed !== null && extra > landed && holdsTotal !== null) {
      const fits = holdsTotal >= toFill;
      const amts = each.map((e) => (fits ? Math.floor(toFill * e.landed / holdsTotal * 100) / 100 : e.landed));
      if (fits) { const big = amts.indexOf(Math.max(...amts)); amts[big] = round2(amts[big] + toFill - amts.reduce((x, y) => x + y, 0)); }
      plan = each.map((e, i) => ({ date: e.date, line: e.line, amount: amts[i], landed: e.landed }));
    }
    const perLine = plan ? [...new Set(plan.map((x) => x.line))].map((line) => { const xs = plan.filter((x) => x.line === line); const low = Math.min(...xs.map((x) => x.landed)); return { line, count: xs.length, per: holdsTotal >= toFill ? Math.floor(toFill * low / holdsTotal * 100) / 100 : low, landed: low }; }).sort((x, y) => y.per - x.per) : null;
    // A payroll-only account: the deferral to set is the new money a paycheck plus what already comes out of it.
    const per = extra === null || plan ? null : payrollOnly ? round2(extra + (nowPer || 0)) : extra;
    paychecks = { count: n, dates: byDate, streams: [...new Set(list.map((x) => x.s.label))], multi, perPaycheck: per, extra, last: extraLast === null ? null : payrollOnly ? round2(extraLast + (nowPer || 0)) : extraLast, current: nowPer, perYear, landed, holds: landed === null ? null : round2(landed + (nowPer || 0)), tooBig: payrollOnly && extra !== null && landed !== null && extra > landed && !(plan && holdsTotal >= toFill), plan, perLine, each: holdsTotal === null ? null : each, holdsTotal, shortLines: payrollOnly && extra !== null ? [...new Set(each.filter((x) => x.landed < extra).map((x) => x.line))] : [], blank };
    if (blank && payrollOnly) { t.useFact(blank.path, null); row.blankLabel = 'missing: ' + blank.label + ' ' + blank.what; }
    // A payroll-only account fills only on paydays: its months are the months that hold one.
    if (payrollOnly) dates = [...new Set(byDate.map((d) => monthKey(d)))].map((ym) => byDate.find((d) => monthKey(d) === ym));
    // No paycheck left matters only when there is new money to put in; a full room is full, not unfillable.
    if (payrollOnly && !n && !blank && toFill > 0) row.fillable = false;
  }
  const fillable = row.fillable && !passed;
  const ms = split(toFill, fillable ? dates.length : 0);
  if (fillable && ms.count < dates.length) dates = dates.slice(0, ms.count);
  const perMonth = ms.per;
  const monthly = a.monthlyContribution ? v(a.monthlyContribution) : null;
  words.unshift('The ' + year + ' limit is ' + money(lim.value) + (lim.words.length ? ' (' + lim.words.join(', ') + ')' : '') + '.', 'In for ' + year + ' so far: ' + contributed.parts.map((p) => (contributed.parts.length > 1 ? p.name + ' ' : '') + p.words).join('; ') + '.');
  if (row.over) words.push(row.overWords);
  else words.push(room > 0 ? money(room) + ' of room is left for ' + year + '.' : 'The ' + year + ' room is full.');
  if (row.aboveCap) words.push(money(row.aboveCap) + ' is above the New York deduction cap: that part is not deductible (it can stay in the 529).');
  const stillNames = [...new Map(still.parts.map((p) => [p.id, p])).values()];
  if (room > 0 && still.value > 0) words.push(money(still.value) + ' of it is already set to go in (' + stillNames.map((p) => (stillNames.length > 1 ? p.name + ' ' : '') + p.words).join('; ') + '), so ' + (toFill > 0 ? money(toFill) + ' is new money.' : 'no new money is needed.'));
  if (!row.fillable && !passed) words.push('No paycheck from ' + (person.name || 'the owner') + '\'s pay lands before ' + longDay(deadline.date) + ', and this account only takes money through payroll, so the ' + year + ' room cannot be filled.');
  return done({ room, ceiling, cap, phase, toFill, lump: fillable ? toFill : null, months: { count: dates.length, dates, last: ms.last }, perMonth, paychecks, current: monthly, why: words.join(' '), missingLabel: null, ei });
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
  // What the Plan counts for each account year when that is less than the account alone could take, and why.
  for (const r of rows) {
    const mine = pools.list.filter((p) => p.row === r);
    if (r.lump === null || !mine.length) continue;
    const fill = round2(mine.reduce((x, p) => x + p.fill, 0));
    if (fill >= r.lump - 0.005) continue;
    const why = mine.some((p) => p.phaseCut) ? 'phase' : mine.some((p) => p.sharedCap) ? 'couple' : mine.some((p) => p.seCut) ? 'se' : mine.some((p) => p.seCapped) ? 'seIra' : mine.some((p) => p.capped) ? 'paycheck' : 'pool';
    r.counted = { fill, why };
  }
  // A spouse's IRA: together, the two spouses may add what the Plan counts for their two IRA pools that year.
  for (const r of rows) {
    if (!r.couple) continue;
    const keys = ['ira:' + r.person, 'ira:' + r.couple.withId];
    const together = round2(pools.list.filter((p) => p.year === r.year && keys.includes(p.key) && !p.spill).reduce((x, p) => x + p.fill, 0));
    const old = r.couple.words, c = r.couple;
    r.couple = { ...c, together, words: old.replace(/\.$/, ': together at most ' + money(together) + ' more' + (c.bothIn + c.bothStill ? ' (' + money(c.bothIn) + ' in, ' + money(c.bothStill) + ' still set to go in)' : '') + '.') };
    r.why = r.why.replace(old, r.couple.words);
  }
  // Missing: no room, or a payroll-only row whose pay amount or pay dates are blank.
  const missingRows = rows.filter((r) => r.applies && !r.passed && (r.room === null || r.blankLabel));
  const unfillable = rows.filter((r) => r.applies && r.room !== null && !r.passed && !r.fillable);
  const snap = all.snapshot();
  return { asOf, rows, accounts, pools: pools.list, window, totals: { room: pools.room, lump: pools.lump, perMonth: pools.perMonth, steps: pools.steps, months: pools.months, groups: pools.list.length, missing: missingRows.map((r) => r.id), unfillable: unfillable.map((r) => r.id), short: pools.short, noMonth: pools.noMonth, over: rows.filter((r) => r.over || r.overSoon).map((r) => r.id) }, simDays: sim ? sim.days : null, kind: missingRows.length || snap.missing.length ? 'incomplete' : snap.rough.length ? 'rough' : 'computed', ...snap };
}

// Each pool and year once: its room is the largest part any row puts in it (ties go to the earlier deadline), and
// its new money is that room less what the pool's monthly amounts still put in, filled by that row's own months.
// A payroll-only row whose pay amount or pay dates are blank is not counted (maxIt names it missing). Under married
// filing jointly with unequal pay, both spouses' IRAs together never pass the couple's earned income less what both
// put in. A payroll-only pool is held to what its paychecks hold, and another account in the same pool filled from
// take-home (a Solo 401(k)'s deferral) takes what is left.
const countable = (r) => r.applies && !r.passed && r.room !== null && r.fillable && !(r.deadline.payrollOnly && r.paychecks && r.paychecks.blank);
// A person's pay for an IRA in a year, as the Plan's count reads it: W-2 pay, self-employment pay left after what is in
// and set to go in their own Solo 401(k) or SEP, and the IRA money in and set to go in (up to their IRA dollar limit).
// Null when their earned income is not known.
function payOf(spine, rules, rows, who, year, asOf) {
  const r = rows.find((x) => x.year === year && x.ei && x.ei.personId === who && x.ei.value !== null);
  const e = r ? r.ei : earnedIncome(spine, rules, year, { personId: who });
  if (!e || e.value === null) return null;
  const t = tracker();
  const mine = (x) => !oddOwner(spine, x) && (ownerOf(spine, x) || {}).id === who;
  const inStill = (xs) => round2(xs.reduce((s, a) => s + contributedOn(spine, a, year, asOf, t).value + ((stillOn(spine, a, year, asOf, t) || {}).value || 0), 0));
  const seEarn = e.seEarnings || 0;
  const seUsed = Math.min(seEarn, inStill((spine.accounts || []).filter((x) => (x.type === 'solo_k401' || x.type === 'sep_ira') && mine(x))));
  const iras = (spine.accounts || []).filter((x) => IRA.includes(x.type) && mine(x));
  const lim = iras.length ? limitOf(spine, rules, iras[0], year, t, { value: null, label: '' }).value || 0 : 0;
  return { w2: round2(Math.max(0, e.value - seEarn)), seLeft: round2(Math.max(0, seEarn - seUsed)), iraUsed: Math.min(lim, inStill(iras)) };
}
export function poolTotals(spine, rules, rows, { asOf = spine.meta.asOf } = {}) {
  const best = new Map();
  for (const r of rows) {
    if (!countable(r)) continue;
    for (const [key, part] of Object.entries(r.parts)) {
      const k = key + '|' + r.year, cur = best.get(k);
      if (!cur || part > cur.room || (part === cur.room && r.deadline.date < cur.row.deadline.date)) best.set(k, { key, year: r.year, room: round2(part), row: r });
    }
  }
  const list = [...best.values()];
  const stillOf = (p) => (p.row.still.byPool || {})[p.key] || 0;
  const short = [];
  // New money: the row's own new money in the pool (its part, less its own still to come, within the pool's room left
  // less every account's still to come), unless the couple's pay cut the room; then the room less the still to come.
  const fillOf = (p) => {
    const nb = (p.row.still.newByPool || {})[p.key];
    if (!p.sharedCap && nb !== undefined) { p.fill = round2(Math.min(p.room, nb)); p.still = round2(p.room - p.fill); }
    else { p.still = round2(Math.min(p.room, stillOf(p))); p.fill = round2(Math.max(0, p.room - p.still)); }
    p.perMonth = p.row.months.count ? ceil2(p.fill / p.row.months.count) : null;
    p.deadline = p.row.deadline.date;
  };
  const monthOf = (p) => { p.perMonth = p.row.months.count ? ceil2(p.fill / p.row.months.count) : null; };
  // 1. What one person's paychecks hold is shared by all their plans filled from pay (a 401(k) and a 457(b) take from
  // the same paychecks); past it, a plan filled from take-home in the same limit takes the rest (a spill).
  const held = new Map();
  for (const p of [...list]) {
    fillOf(p);
    const pc = p.row.paychecks;
    // What a paycheck holds is never below $0 (withholding past the pay leaves nothing, not a debt).
    const all = pc && pc.landed !== null ? (pc.holdsTotal ?? Math.max(0, pc.landed) * pc.count) : null;
    const holds = all === null ? null : round2(Math.max(0, all - (held.get(p.row.person) || 0)));
    if (p.row.deadline.payrollOnly && holds !== null) held.set(p.row.person, round2((held.get(p.row.person) || 0) + Math.min(p.fill, holds)));
    if (!(p.row.deadline.payrollOnly && holds !== null && pc.count && p.fill > holds)) continue;
    p.fill = round2(holds); p.capped = true; short.push(p.row.id);
    monthOf(p);
    const spare = round2(p.room - p.still - p.fill);
    const other = rows.filter((r) => countable(r) && r !== p.row && r.year === p.year && !r.deadline.payrollOnly && (r.parts[p.key] || 0) > 0).sort((x, y) => y.parts[p.key] - x.parts[p.key])[0];
    if (other && spare > 0) { const s = { key: p.key, year: p.year, room: round2(Math.min(spare, other.parts[p.key])), row: other, spill: true }; fillOf(s); s.still = 0; s.fill = s.room; monthOf(s); list.push(s); }
  }
  // 2. Self-employment pay counts for an IRA less what goes into its owner's own Solo 401(k) or SEP (Pub 590-A,
  // Schedule 1 line 16). IRA money already in or set to go in (any IRA year still being counted) keeps the pay it needs,
  // W-2 pay first; the Solo or SEP takes the self-employment pay left after that (the deferral gives way first). A
  // married couple filing jointly is one unit (their IRAs rest on the couple's pay); anyone else is their own.
  const isSE = (q) => q.row.type === 'solo_k401' || q.row.type === 'sep_ira';
  const ps = people(spine);
  const mfj = ps.length > 1 && v(spine.household.filingStatus) === 'mfj';
  const seInfo = new Map();
  for (const year of [...new Set(list.map((p) => p.year))]) {
    for (const unit of mfj ? [ps.map((x) => x.id)] : ps.map((x) => [x.id])) {
      const info = unit.map((who) => payOf(spine, rules, rows, who, year, asOf));
      unit.forEach((who, i) => seInfo.set(year + '|' + who, { seLeft: info[i] ? info[i].seLeft : 0, seNew: 0 }));
      const se = list.filter((q) => q.year === year && isSE(q) && unit.includes(q.row.person));
      if (!se.length || info.some((x) => x === null)) continue;
      const need = Math.max(0, round2(info.reduce((x, y) => x + y.iraUsed, 0) - info.reduce((x, y) => x + y.w2, 0)));
      let over = round2(se.reduce((x, q) => x + q.fill, 0) - Math.max(0, round2(info.reduce((x, y) => x + y.seLeft, 0) - need)));
      for (const q of [...se.filter((x) => x.key.startsWith('deferral:')), ...se.filter((x) => !x.key.startsWith('deferral:'))]) {
        if (over <= 0.005) break;
        const take = Math.min(q.fill, over);
        q.fill = round2(q.fill - take); over = round2(over - take); q.seCapped = true; monthOf(q);
      }
      for (const who of unit) seInfo.get(year + '|' + who).seNew = round2(se.filter((q) => q.row.person === who).reduce((x, q) => x + q.fill, 0));
    }
  }
  // A person's new Solo or SEP money as it lowers their IRA pay (never more than their self-employment pay left).
  const seOff = (year, who) => { const x = seInfo.get(year + '|' + who); return x ? Math.min(x.seNew, x.seLeft) : 0; };
  // 3. A married couple's IRAs (IRC 219(c)).
  for (const year of [...new Set(list.map((p) => p.year))]) {
    const ira = list.filter((p) => p.year === year && p.key.startsWith('ira:') && !p.spill);
    const J = ira.find((p) => p.row.cap && p.row.cap.joint), O = ira.find((p) => p !== J);
    if (!J) continue;
    const otherId = (ps.find((x) => x.id !== J.row.person) || {}).id;
    // The couple's pay less each spouse's new money into their own Solo 401(k) or SEP.
    const couple = round2(J.row.cap.couple - seOff(year, J.row.person) - seOff(year, otherId));
    const jAccts = (spine.accounts || []).filter((x) => IRA.includes(x.type) && !oddOwner(spine, x) && (ownerOf(spine, x) || {}).id === J.row.person);
    const allRoth = jAccts.length > 0 && jAccts.every((x) => x.type === 'roth_ira');
    const ph = J.row.phase && J.row.phase.lo != null ? J.row.phase : (rows.find((r) => r.year === year && r.phase && r.phase.lo != null) || {}).phase;
    const inPhase = ph && !ph.unknown && ph.magi > ph.lo;
    const jOwn = J.room;
    if (!O) {
      // Only the spouse who earns less has an IRA: its pay is the couple's, less the other's IRA money and both spouses'
      // new Solo or SEP money.
      const comp = round2(J.row.cap.value - seOff(year, J.row.person) - seOff(year, otherId));
      let cut = round2(Math.max(0, Math.min(J.row.limit.value, comp) - J.row.contributed.value));
      if (inPhase && allRoth) cut = Math.min(cut, round2(Math.max(0, rothReduced(rules, year, Math.max(0, Math.min(J.row.limit.value, comp)), ph) - J.row.contributed.value)));
      if (J.room > cut) { J.room = cut; J.seCut = true; }
      continue;
    }
    // The spouse who earns more takes their room first (it rests on their own pay), the other what is left, never less
    // than what their own monthly amount still puts in (that gap comes off the first). Each spouse's money counts only
    // up to their own limit (the dollar limit; the higher earner's own pay too).
    const leftAll = round2(Math.max(0, couple - Math.min(J.row.contributed.value, J.row.limit.value) - Math.min(O.row.contributed.value, O.row.limit.value, O.row.cap ? O.row.cap.value : Infinity)));
    // The higher earner's own room first comes down by their own new Solo or SEP money, so the rest goes to the other.
    if (O.row.cap && !O.row.cap.joint) { const own = round2(Math.max(0, Math.min(O.row.limit.value, O.row.cap.value - seOff(year, O.row.person)) - O.row.contributed.value)); if (O.room > own) { O.room = own; O.seCut = true; } }
    if (O.room > leftAll) { O.room = leftAll; O.sharedCap = true; }
    let jr = round2(Math.max(0, leftAll - O.room));
    const need = Math.min(J.room, stillOf(J));
    if (jr < need) { const give = Math.min(need - jr, Math.max(0, O.room - stillOf(O))); O.room = round2(O.room - give); O.sharedCap = true; jr = round2(jr + give); }
    // Inside the Roth phase-out, the lower earner's limit runs on the couple's pay left after the higher earner's year.
    // Their Roth money already in or set to go in must still fit it: the higher earner is cut so it does (the smallest
    // base that holds it, in cents; the reduced limit only grows with the base). With only Roths, the lower earner's
    // own room is what that limit leaves.
    if (inPhase) {
      const roth = new Set(jAccts.filter((x) => x.type === 'roth_ira').map((x) => x.id));
      const sumOf = (parts) => parts.filter((q) => roth.has(q.id)).reduce((x, q) => x + q.value, 0);
      const rothNeed = round2(sumOf(J.row.contributed.parts) + sumOf(J.row.still.parts));
      if (rothNeed > 0) {
        let lo = 0, hi = Math.round(J.row.limit.value * 100);
        while (lo < hi) { const mid = Math.floor((lo + hi) / 2); if (rothReduced(rules, year, mid / 100, ph) >= rothNeed) hi = mid; else lo = mid + 1; }
        const oMax = round2(Math.max(0, couple - lo / 100 - O.row.contributed.value));
        if (O.room > oMax) { O.room = oMax; O.sharedCap = true; O.phaseCut = true; jr = round2(Math.max(jr, leftAll - O.room)); }
      }
    }
    J.room = Math.min(jOwn, jr);
    if (J.room < jOwn) J.sharedCap = true;
    if (inPhase && allRoth) {
      const oYear = Math.min(round2(O.row.contributed.value + O.room), O.row.limit.value, O.row.cap ? O.row.cap.value : Infinity);
      const lim = rothReduced(rules, year, Math.max(0, Math.min(J.row.limit.value, round2(couple - oYear))), ph);
      const cut = round2(Math.max(0, lim - J.row.contributed.value));
      if (J.room > cut) { J.room = cut; J.sharedCap = true; J.phaseCut = true; }
    }
  }
  // 4. Anyone else's IRA (and the higher earner's): their own pay less their own new Solo or SEP money.
  for (const I of list) {
    const c = I.row.cap;
    if (!I.key.startsWith('ira:') || I.spill || !c || c.joint) continue;
    const off = seOff(I.year, I.row.person);
    if (!off) continue;
    const cut = round2(Math.max(0, Math.min(I.row.limit.value, c.value - off) - I.row.contributed.value));
    if (I.room > cut) { I.room = cut; I.seCut = true; }
  }
  // 5. The IRAs' new money from their room as it now stands.
  for (const p of list) {
    if (!p.key.startsWith('ira:') || p.spill) continue;
    const before = p.fill;
    fillOf(p);
    p.fill = round2(Math.min(p.fill, before, Math.max(0, p.room - stillOf(p))));
    monthOf(p);
  }
  // New money with no month to put it in (the paydays are not known) is named, not counted as $0 a month.
  const noMonth = list.filter((p) => p.fill > 0 && p.perMonth === null).map((p) => p.row.id);
  // A month per account year: its pools' new money over its months (one rounding, so it matches the row), to its
  // deadline, or for a plan filled from pay to its last payday.
  const byRow = new Map();
  for (const p of list) {
    if (!p.perMonth) continue;
    const r = p.row, pc = r.paychecks;
    const until = r.deadline.payrollOnly && pc && pc.dates.length ? pc.dates[pc.dates.length - 1] : p.deadline;
    const x = byRow.get(r.id) || { row: r, fill: 0, until, pools: [] };
    x.fill = round2(x.fill + p.fill); x.pools.push(p.key); byRow.set(r.id, x);
  }
  const months = [...byRow.values()].map((x) => ({ ...x, perMonth: ceil2(x.fill / x.row.months.count) }));
  // The total a month changes as deadlines pass: each step runs to an end date with every account still open then.
  const ends = [...new Set(months.map((x) => x.until))].sort();
  const steps = ends.map((d) => ({ until: d, perMonth: round2(months.filter((x) => x.until >= d).reduce((s, x) => s + x.perMonth, 0)) }));
  return { list, months, room: round2(list.reduce((s, p) => s + (p.spill ? 0 : p.room), 0)), lump: round2(list.reduce((s, p) => s + p.fill, 0)), perMonth: noMonth.length && !steps.length ? null : round2(months.reduce((s, x) => s + x.perMonth, 0)), steps, short, noMonth };
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
// claims (optional): a run's matches of deposits to paydays; a paycheck that came early counts on that day (S-219).
export function maxItDeadlines(spine, rules, from, to, { asOf = spine.meta.asOf, claims = null } = {}) {
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
      const r = passed ? null : maxItRow(spine, rules, a, ty, { asOf, claims });
      const room = passed ? (rule === d.rule ? 'The ' + ty + ' year closed on this day' : 'The day to elect the ' + ty + ' employee deferral has passed; the employer part stays open to ' + longDay(d.date)) : r.room === null ? cap1(r.missingLabel || 'missing') : r.over ? 'Over the ' + ty + ' limit by ' + money(r.over) + (r.overByYearEnd ? ', ' + money(r.overByYearEnd) + ' by December 31 if nothing changes' : '') : r.overSoon ? 'Set to go over the ' + ty + ' limit by ' + money(r.overSoon) : !r.fillable ? 'Cannot be filled: no paycheck before ' + longDay(d.date) + ' (' + money(r.room) + ' of room for ' + ty + ')' : r.room > 0 ? money(r.room) + ' of room left for ' + ty + (r.kind === 'rough' ? ' (rough)' : '') : 'The ' + ty + ' room is full';
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
  // One split per account year (its pools' new money together), on its dates, so the amounts match its row.
  const flows = [];
  const byRow = new Map();
  for (const p of chosen) { if (!p.fill || !p.row.fillable) continue; const x = byRow.get(p.row) || { keys: [], fill: 0, capped: false }; x.keys.push(p.key); x.fill = round2(x.fill + p.fill); x.capped = x.capped || !!p.capped; byRow.set(p.row, x); }
  for (const [r, x] of byRow) {
    const pc = r.paychecks;
    // Capped at what the paychecks hold: each paycheck gives what lands from it. Split in proportion to what each lands:
    // each paycheck its own amount (scaled if the Plan counts less).
    if (x.capped && pc && pc.each) { for (const e of pc.each) if (e.landed > 0) flows.push({ pool: x.keys.join('+'), row: r.id, date: e.date, amount: e.landed, label: 'More into ' + r.name + ' from pay' }); continue; }
    if (pc && pc.plan) { const k = r.toFill ? x.fill / r.toFill : 0; for (const e of pc.plan) { const amt = round2(e.amount * k); if (amt > 0) flows.push({ pool: x.keys.join('+'), row: r.id, date: e.date, amount: amt, label: 'More into ' + r.name + ' from pay' }); } continue; }
    const dates = r.deadline.payrollOnly ? (pc ? pc.dates : []) : r.months.dates;
    if (!dates.length) continue;
    const sp = split(x.fill, dates.length);
    dates.slice(0, sp.count).forEach((d, i) => { const amt = i === sp.count - 1 ? sp.last : sp.per; if (amt > 0) flows.push({ pool: x.keys.join('+'), row: r.id, date: d, amount: amt, label: 'More into ' + r.name + (r.deadline.payrollOnly ? ' from pay' : '') }); });
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
  // Payroll money whose pay amount or pay dates are blank cannot be run (that pay is not in the run): it is left out,
  // the check says so and is incomplete.
  const blank = (rows || mx.rows).filter((r) => !r.passed && r.blankLabel).map((r) => r.paychecks.blank);
  // A pay line the run left out (no amount, no first pay date): the run is short that pay, so it gives no verdict.
  const gaps = (before.needs || []).filter((n) => n.path && /^income\.[^.]+\.(amount|payDay)$/.test(n.path)).map((n) => {
    const id = n.path.split('.')[1], line = (spine.income || []).find((x) => x.id === id);
    return { label: line ? line.label : id, what: n.path.endsWith('.amount') ? 'amount' : 'first pay date', path: n.path };
  });
  const capped = chosen.filter((p) => p.capped);
  const words = [];
  const has = (x) => x.label + (x.what === 'amount' ? ' has an amount' : ' has a first pay date');
  const blankWords = [...new Set(blank.map(has))].join(' and ');
  if (gaps.length) {
    words.push('Cannot be checked against cash until ' + [...new Set([...gaps, ...blank].map(has))].join(' and ') + ': that pay is not in the run.');
    if (flows.length) words.push(money(total) + ' more would leave checking by ' + longDay(flows[flows.length - 1].date) + '.');
  } else if (blank.length) words.push((flows.length ? 'Incomplete: the payroll money is left out until ' : 'Cannot be checked against cash until ') + blankWords + '.');
  // A run that is short a paycheck gives no verdict.
  if (!gaps.length && !flows.length) { if (!blank.length) words.push('Nothing more leaves checking: what already goes in covers it.'); }
  else if (!gaps.length) {
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
  return { floor, floorSource: before.floor.source, pools: chosen.map((p) => p.key + '|' + p.year), flows, total, before: b, after: f, under, underBefore, newShortfalls: newShort, shortMore, pulled: round2(Math.max(0, f.pull - b.pull)), lowDrop: b.low && f.low ? round2(b.low.cash - f.low.cash) : null, breaks: gaps.length || (!flows.length && blank.length) ? null : breaks, payoff, measurable, pushed: worst && worst.days > 0 ? worst : null, end, words: words.join(' '), kind: blank.length || gaps.length ? 'incomplete' : before.kind, unchecked: gaps.length > 0 || (!flows.length && blank.length > 0), from: before.from, rough: before.rough, missing: [...new Set([...before.missing, ...blank.map((x) => x.path), ...gaps.map((x) => x.path)])], rules: [...new Set([...before.rules, 'STAGE_RUNWAY_RED_MONTHS'])] };
}
