// Cash flow engine: one calendar month of income (gross and take-home),
// expenses, debt minimums, saving, surplus and savings rates. Dated income and
// expense changes are handled month by month.

import { matchTiersOf, matchOn } from './match.js';
import { premiumMonthly, premiumCovers, policyName } from './protection.js';
import { valueOf, tracker, round2, toDay, daysInMonth, monthStart, monthEnd, addDays, monthKey, accountOwner, incomeOwner } from './spine.js';
import { PER_YEAR, fromPaycheck, isEarmarked } from './schema.js';
import { minimumsTotal, debtSchedule, paysDebtOf } from './debt.js';
import { taxSetAside } from './tax.js';
import { shareOf } from './sharing.js';
import { hiddenLine } from './profile.js';

const v = valueOf;

// Days of month ym (YYYY-MM) inside [start, end] (either may be null).
export function activeDays(start, end, ym) {
  const a = Math.max(toDay(monthStart(ym)), start ? toDay(start) : -Infinity);
  const b = Math.min(toDay(monthEnd(ym)), end ? toDay(end) : Infinity);
  return Math.max(0, b - a + 1);
}

// The amount an item comes to in month ym. Periodic cadences are a rate:
// a full month is the yearly figure / 12, a partial month is prorated by days.
// total spreads the amount evenly over start..end; once pays on start.
export function monthlyAmount(amount, cadence, start, end, ym) {
  if (amount === null) return null;
  const days = activeDays(start, end, ym);
  if (!days) return 0;
  if (cadence === 'once') return start && start.slice(0, 7) === ym ? amount : 0;
  if (cadence === 'total') return amount * days / (toDay(end) - toDay(start) + 1);
  const dim = daysInMonth(+ym.slice(0, 4), +ym.slice(5, 7));
  return amount * PER_YEAR[cadence] / 12 * days / dim;
}

// Money actually paid from the first day of one month to the last day of
// another (both dates month-aligned). Weekly and biweekly streams with a start
// date count their pay dates (26 weeks of unemployment is 26 payments);
// everything else sums its monthly amounts.
export function paidBetween(amount, cadence, start, end, from, to) {
  if (amount === null) return null;
  if ((cadence === 'weekly' || cadence === 'biweekly') && start) {
    const step = cadence === 'weekly' ? 7 : 14;
    const lo = toDay(from), hi = Math.min(toDay(to), end ? toDay(end) : Infinity);
    let n = 0;
    for (let d = toDay(start); d <= hi; d += step) if (d >= lo) n++;
    return amount * n;
  }
  let sum = 0;
  for (let ym = from.slice(0, 7); ym <= to.slice(0, 7); ym = nextYm(ym)) sum += monthlyAmount(amount, cadence, start, end, ym);
  return sum;
}
const nextYm = (ym) => (ym.slice(5) === '12' ? +ym.slice(0, 4) + 1 + '-01' : ym.slice(0, 5) + String(+ym.slice(5) + 1).padStart(2, '0'));

// Whether a stream counts in a mode. committed: only certain streams (no
// likelihood, or likelihood 1). expected: every stream, weighted by likelihood.
export function streamWeight(s, mode, t) {
  if (!s.likelihood) return 1;
  const lk = t ? t.useFact('income.' + s.id + '.likelihood', s.likelihood) : v(s.likelihood);
  if (mode === 'committed') return lk === 1 ? 1 : 0;
  return lk;
}

const isActive = (item, ym) => activeDays(item.start, item.end, ym) > 0 && (item.cadence !== 'once' || (item.start || '').slice(0, 7) === ym);


// The people whose payroll saving comes only out of their own pay: everyone with a W-2 or tips line, whatever it
// pays, and the first person (a line no one is named on is theirs, so every line not theirs names someone else).
// Only a later person with no such line has it come out of the household's pay (S-213, S-214, S-216).
const payOwners = (spine) => new Set([...(spine.income || []).filter((s) => s.type === 'w2' || s.type === 'tips').map((s) => incomeOwner(spine, s)), (((spine.household && spine.household.people) || [])[0] || {}).id].filter(Boolean));

// The pay a plan from pay fills from (S-227, answer 60). A plan takes deferrals only from the pay of the employer that
// sponsors it: its "paid through" job when one is chosen (paidThrough, one of its owner's W-2 jobs); else, with two or
// more jobs (W-2 lines that pay over time), the sponsoring one, the job that pays the most a year (then by id; a job with
// no amount comes last), rough until it is chosen. A one-time W-2 line (a bonus) and tips go with it.
const isJob = (s) => s.type === 'w2' && s.cadence !== 'once';
export function jobsOf(spine, a) {
  const who = (accountOwner(spine, a) || {}).id;
  const yearly = (s) => { const x = valueOf(s.amount); return x === null ? -1 : x * (PER_YEAR[s.cadence] || 1); };
  return (spine.income || []).filter((s) => isJob(s) && incomeOwner(spine, s) === who).sort((x, y) => yearly(y) - yearly(x) || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
}
// The job a plan is paid through: the one chosen, else the sponsoring one; null with no job.
export const paidThroughOf = (spine, a) => { const jobs = jobsOf(spine, a); const pick = a.paidThrough ? valueOf(a.paidThrough) : null; return jobs.find((s) => s.id === pick) || jobs[0] || null; };
// Whether the job is a guess: two or more jobs and none chosen.
export const paidThroughGuess = (spine, a) => { const jobs = jobsOf(spine, a); const pick = a.paidThrough ? valueOf(a.paidThrough) : null; return jobs.length > 1 && !jobs.some((s) => s.id === pick); };
export function payLinesFor(spine, a) {
  const who = (accountOwner(spine, a) || {}).id;
  const mine = (spine.income || []).filter((s) => (s.type === 'w2' || s.type === 'tips') && incomeOwner(spine, s) === who);
  const job = paidThroughOf(spine, a);
  return mine.filter((s) => !isJob(s) || s === job);
}

// Each paycheck's share of the month's payroll saving (S-211): an account's monthly amount comes off the pay it fills
// from (payLinesFor), split by gross; when its owner has no such pay line at all, off all the household's W-2 and tips pay.
// An owner whose pay is not coming this month has nothing taken. cf is this month's cashflow(); the shares add up to
// cf.saving.payroll whenever the pay it comes from has an amount.
export function payrollShares(spine, cf) {
  const pays = cf.income.streams.filter((x) => x.included && (x.type === 'w2' || x.type === 'tips') && x.gross);
  const owner = Object.fromEntries((spine.income || []).map((s) => [s.id, incomeOwner(spine, s)]));
  const lines = payOwners(spine);
  const share = {};
  if (!pays.length) return share;
  for (const a of spine.accounts || []) {
    if (!fromPaycheck(a) || !a.monthlyContribution) continue;
    const m = valueOf(a.monthlyContribution);
    if (!m) continue;
    const who = (accountOwner(spine, a) || {}).id;
    const plan = new Set(payLinesFor(spine, a).map((s) => s.id));
    const mine = pays.filter((x) => owner[x.id] === who && plan.has(x.id));
    const from = mine.length ? mine : lines.has(who) ? [] : pays;
    if (!from.length) continue;
    const g = from.reduce((s, x) => s + x.gross, 0);
    for (const x of from) share[x.id] = (share[x.id] || 0) + m * x.gross / g;
  }
  return share;
}

// schedule: a debtSchedule covering ym (the projection passes its own); a month
// after the as-of month reads its minimums from it (S-170).
// taxCache: shared year-by-year tax results (the projection passes its own).
export function cashflow(spine, rules, ym, { mode = 'committed', schedule = null, taxCache = null } = {}) {
  const year = +ym.slice(0, 4);
  const iso = monthStart(ym);
  const g = tracker(), wh = tracker(), fi = tracker(), th = tracker(), uw = tracker();
  let gross = 0, withheld = 0, fica = 0, unwithheld = 0, w2Active = false;
  const streams = [], paid = new Set();
  for (const s of spine.income || []) {
    if (!isActive(s, ym)) continue;
    const base = 'income.' + s.id;
    const weight = streamWeight(s, mode, g);
    if (weight === 0) { streams.push({ id: s.id, label: s.label, type: s.type, gross: 0, included: false }); continue; }
    const amt = g.useFact(base + '.amount', s.amount);
    const m = monthlyAmount(amt, s.cadence, s.start, s.end, ym);
    const w = weight ?? 1;
    const sg = m === null ? null : m * w;
    if (sg !== null) gross += round2(sg);
    th.useFact(base + '.amount', s.amount);
    // Withholding Facts are in the stream's own cadence.
    let sw = 0;
    for (const k of ['federal', 'state']) {
      const x = wh.useFact(base + '.withholding.' + k, s.withholding && s.withholding[k]);
      th.useFact(base + '.withholding.' + k, s.withholding && s.withholding[k]);
      const mx = monthlyAmount(x, s.cadence, s.start, s.end, ym);
      if (mx !== null) sw += mx * w;
    }
    withheld += sw;
    let sf = 0;
    if (s.type === 'w2' || s.type === 'tips') {
      w2Active = true;
      if (sg !== 0) paid.add(incomeOwner(spine, s));
      if (sg !== null) {
        const ss = Math.min(sg, fi.rule(rules, 'SS_WAGE', year) / 12) * fi.rule(rules, 'FICA_SS_RATE', year);
        sf = ss + sg * fi.rule(rules, 'FICA_MED_RATE', year);
      } else fi.addMissing(base + '.amount');
      fica += sf;
    }
    const noWithholding = s.withholding && v(s.withholding.federal) === 0 && (s.type !== 'w2');
    if (noWithholding && sg !== null) { unwithheld += sg; uw.useFact(base + '.amount', s.amount); }
    streams.push({ id: s.id, label: s.label, type: s.type, gross: round2(sg), withheld: round2(sw), fica: round2(sf), takeHome: sg === null ? null : round2(sg - sw - sf), weight: w, included: true });
  }
  for (const r of fi.snapshot().rules) th.rule(rules, r, year);

  // Saving: payroll contributions (only while its owner's paycheck is coming in, or any paycheck for an owner with
  // no pay line) and after-tax contributions paid from take-home.
  // Also (Phase 2.5 B2, docs/FORMULAS.md): the employer match on what goes in from pay, and saving into a cash account
  // that is not the main checking (a savings account, an emergency fund): both count in the savings rate.
  const pay = tracker(), after = tracker(), cashSave = tracker(), mt = tracker(), lines = payOwners(spine);
  let payroll = 0, afterTax = 0, cashSaving = 0, match = 0;
  // The main checking account, by the same rule as defaults.js mainChecking (never an account set aside for a goal).
  const cashAccts = (spine.accounts || []).filter((a) => a.family === 'cash' && !isEarmarked(a));
  const mainCash = cashAccts.find((a) => a.type === 'checking') || cashAccts[0] || null;
  for (const a of spine.accounts || []) {
    if (!a.monthlyContribution) continue;
    const path = 'accounts.' + a.id + '.monthlyContribution';
    // Out of the paycheck before take-home (engine/schema.js fromPaycheck), else from take-home.
    if (fromPaycheck(a)) {
      const who = (accountOwner(spine, a) || {}).id;
      if (!(lines.has(who) ? paid.has(who) : w2Active)) continue;
      const x = pay.useFact(path, a.monthlyContribution);
      if (x !== null) payroll += x;
      // The match, tier by tier (S-272): each tier matches its share of what goes in, up to its share of the W-2 pay it
      // is paid through. An account with only the old rate and cap reads them as one tier.
      const typed = a.matchTiers ? mt.useFact('accounts.' + a.id + '.matchTiers', a.matchTiers) : a.matchRate ? mt.useFact('accounts.' + a.id + '.matchRate', a.matchRate) : null;
      if (typed && (!Array.isArray(typed) || typed.length)) {
        if (!a.matchTiers) mt.useFact('accounts.' + a.id + '.matchCap', a.matchCap);
        const tiers = matchTiersOf(a);
        const job = new Set(payLinesFor(spine, a).map((l) => l.id));
        const wage = streams.filter((x) => job.has(x.id) && x.gross !== null).reduce((sum, x) => sum + x.gross, 0);
        mt.useFact(path, a.monthlyContribution);
        if (tiers.length && x !== null) match += matchOn(tiers, x, wage);
      }
    } else if (a.family !== 'cash') {
      const x = after.useFact(path, a.monthlyContribution);
      if (x !== null) afterTax += x;
    } else if (a !== mainCash) {
      const x = cashSave.useFact(path, a.monthlyContribution);
      if (x !== null) cashSaving += x;
    }
  }
  // The extra at the debt (debtPlan.extra): payoff above the minimums, which the savings rate counts as saving.
  const xt = tracker();
  const extraDebt = spine.debtPlan && spine.debtPlan.extra ? xt.useFact('debtPlan.extra', spine.debtPlan.extra) ?? 0 : 0;
  th.absorb(pay.out(0));

  // Expenses. One paid by someone else counts $0 (S-171). Needs: expenses
  // tagged need; with none tagged the total is missing, not 0. Lean: food,
  // housing and transportation that are not wants (eating out is a want).
  const ex = tracker(), fat = tracker(), need = tracker(), lean = tracker();
  let total = 0, fatSum = 0, needSum = 0, leanSum = 0, anyNeed = false;
  const items = [];
  for (const e of spine.expenses || []) {
    // A line the profile hides (Phase 2.5 B3: renting, then living with family) is kept, not counted.
    if (!isActive(e, ym) || hiddenLine(spine, e)) continue;
    const base = 'expenses.' + e.id, path = base + '.amount';
    // A line that pays a debt (S-226, answer 35) is counted once, under debt payments below, never also here.
    if (paysDebtOf(spine, e)) { ex.useFact(base + '.paysDebt', e.paysDebt); continue; }
    // A bill a policy's premium already pays (S-275) is counted once, as the policy's own line below.
    if (premiumCovers(spine, e)) continue;
    const covered = !!e.covered && v(e.covered) === true;
    if (covered) { ex.useFact(base + '.covered', e.covered); items.push({ id: e.id, label: e.label, amount: 0, covered: true, fat: e.fat, need: v(e.need), fixed: e.fixed }); continue; }
    const amt = ex.useFact(path, e.amount);
    const full = monthlyAmount(amt, e.cadence, e.start, e.end, ym);
    // A shared bill counts your share (S-175).
    const sh = shareOf(spine, e);
    for (const p of sh.from) ex.useFact(p, null === p ? null : { value: 1, kind: 'known' });
    for (const p of sh.rough || []) ex.addRough(p);
    for (const p of sh.missing || []) ex.addMissing(p);
    const m = full === null || !sh.shared ? full : sh.share === null ? null : full * sh.share;
    if (m !== null) total += round2(m);
    const isNeed = v(e.need);
    if (e.fat) { fat.useFact(path, e.amount); if (m !== null) fatSum += m; }
    if (isNeed === true) { anyNeed = true; need.useFact(path, e.amount); need.useFact(base + '.need', e.need); if (m !== null) needSum += m; }
    else if (isNeed === null) need.addMissing(base + '.need');
    if (e.fat && isNeed !== false) { lean.useFact(path, e.amount); if (isNeed === null) lean.addMissing(base + '.need'); if (m !== null) leanSum += m; }
    items.push({ id: e.id, label: e.label, amount: round2(m), full: round2(full), shared: sh.shared, share: sh.share, people: sh.people, whoPays: sh.whoPays, fat: e.fat, need: isNeed, fixed: e.fixed });
  }

  // Premiums (S-275): each policy's premium is its own Needs line, marked as from Protection; one through work comes out
  // of pay before take-home, like the payroll items.
  let workPremiums = 0;
  for (const x of spine.policies || []) {
    const path = 'policies.' + x.id + '.premium', m = premiumMonthly(x);
    if (m === null) { if (x.premium) ex.addMissing(path); continue; }
    if (x.throughWork && v(x.throughWork) === true) { th.useFact(path, x.premium); workPremiums += m; continue; }
    ex.useFact(path, x.premium); need.useFact(path, x.premium);
    total += m; needSum += m; anyNeed = true;
    items.push({ id: 'policy:' + x.id, label: policyName(x) + ' (from Protection)', amount: m, full: m, fat: null, need: true, fixed: true, fromProtection: true, path });
  }

  // Minimums: this month from today's balances; a later month from the debt
  // schedule, so a loan stops once paid and a promo moves to its rate after.
  const asOfYm = monthKey(spine.meta.asOf);
  let mins;
  if (ym > asOfYm) {
    const sc = schedule && schedule.months.has(ym) ? schedule : debtSchedule(spine, rules, spine.meta.asOf, ym);
    const mo = sc.months.get(ym);
    const st = tracker();
    st.absorb({ value: 0, from: sc.from, rough: sc.rough, missing: sc.missing, rules: sc.rules });
    const due = mo.payments.filter((p) => !p.inFull);
    mins = { total: st.out(round2(due.reduce((a, p) => a + p.amount, 0))), items: due.map((p) => ({ id: p.id, name: p.name, amount: p.amount, estimated: p.estimated, dueDate: p.dueDate, line: p.line, lineLabel: p.lineLabel, path: p.path })) };
  } else mins = minimumsTotal(spine, rules, iso);

  // A line that pays a debt (answer 35) is paid once, under debt payments, and keeps its place for the readers that
  // work by category: its tag, need or want, and fixed (Plan vs actual, needs, Lean FI, the DATING shares, where it
  // goes). `linked` is that payment as the line; it is not added to the expense total, so nothing counts it twice.
  const linked = [];
  for (const m of mins.items) {
    const e = m.line && m.amount !== null ? (spine.expenses || []).find((x) => x.id === m.line) : null;
    if (!e) continue;
    const base = 'expenses.' + e.id, isNeed = v(e.need);
    linked.push({ id: e.id, label: e.label, amount: round2(m.amount), fat: e.fat, need: isNeed, fixed: e.fixed, debt: m.id });
    if (isNeed === true) { anyNeed = true; need.useFact(base + '.amount', e.amount); need.useFact(base + '.need', e.need); needSum += m.amount; }
    else if (isNeed === null) need.addMissing(base + '.need');
    if (e.fat && isNeed !== false) { lean.useFact(base + '.amount', e.amount); if (isNeed === null) lean.addMissing(base + '.need'); leanSum += m.amount; }
  }

  // Tax set-aside (S-172): income with no federal withholding (unemployment,
  // 1099) and this year's Roth conversions set aside tax at the marginal
  // federal plus state rate (plus self-employment tax on 1099 income).
  const setAside = taxSetAside(spine, rules, ym, { mode, streams, cache: taxCache });

  const takeHome = th.out(round2(gross - withheld - fica - payroll - workPremiums));
  const sur = tracker();
  sur.absorb(takeHome); sur.absorb(ex.out(0)); sur.absorb(mins.total); sur.absorb(after.out(0)); sur.absorb(setAside.total);
  // Surplus = take-home - expenses - minimum payments - after-tax saving - tax set-aside.
  const surplus = round2(gross - withheld - fica - payroll - workPremiums - total - mins.total.value - afterTax - (setAside.total.value ?? 0));
  const surplusR = sur.out(surplus);
  // Monthly surplus (B2) = take-home - spending - debt minimums - the tax set-aside on 1099 income: what is free to
  // save, before any saving. `surplus` above is what is left after the saving that is set up.
  const ms = tracker();
  ms.absorb(takeHome); ms.absorb(ex.out(0)); ms.absorb(mins.total); ms.absorb(setAside.total);
  // What goes out (Today's surplus screen): spending + debt minimums + the tax set-aside.
  const go = tracker(); go.absorb(ex.out(0)); go.absorb(mins.total); go.absorb(setAside.total);
  const goesOut = go.out(round2(total + mins.total.value + (setAside.total.value ?? 0)));
  const monthly = ms.out(round2(gross - withheld - fica - payroll - workPremiums - total - mins.total.value - (setAside.total.value ?? 0)));
  const rate = (num, den, ...parts) => { const t = tracker(); for (const p of parts) t.absorb(p); return t.out(den > 0 ? round2(num / den * 1e6) / 1e6 : null); };
  const grossR = g.out(round2(gross));
  // Saving for the savings rate: from take-home (after-tax accounts and cash savings), pre-tax and Roth from the
  // paycheck, the employer match, and the extra at the debt. What is left unassigned is not counted (S-138).
  const fromTakeHome = round2(afterTax + cashSaving);
  const saved = round2(fromTakeHome + payroll + match + extraDebt);
  const savedParts = [after.out(0), cashSave.out(0), pay.out(0), mt.out(0), xt.out(0)];
  return {
    ym, mode,
    income: { gross: grossR, withheld: wh.out(round2(withheld)), fica: fi.out(round2(fica)), takeHome, unwithheld: uw.out(round2(unwithheld)), streams, workPremiums: round2(workPremiums) },
    saving: { payroll: pay.out(round2(payroll)), afterTax: after.out(round2(afterTax)), cash: cashSave.out(round2(cashSaving)), fromTakeHome, match: mt.out(round2(match)), extraDebt: xt.out(round2(extraDebt)), total: saved },
    expenses: { total: ex.out(round2(total)), fat: fat.out(round2(fatSum)), need: need.out(anyNeed ? round2(needSum) : null), lean: lean.out(round2(leanSum)), items, linked },
    debtMinimums: mins,
    taxSetAside: setAside,
    surplus: surplusR, monthlySurplus: monthly, goesOut,
    savingsRate: {
      // The headline (B2): (saving + pre-tax retirement + employer match + extra debt payoff) / (take-home + pre-tax
      // retirement + employer match).
      net: takeHome.value === null ? rate(null, 0, takeHome, ...savedParts) : rate(saved, takeHome.value + payroll + match, takeHome, ...savedParts),
      // Of gross: the same top / (gross income + employer match). Shown beside the headline in Show the math.
      gross: rate(saved, gross + match, grossR, ...savedParts)
    }
  };
}

// The month a date falls in, and the first full month after it.
export const nextMonthOf = (iso) => addDays(monthEnd(iso.slice(0, 7)), 1).slice(0, 7);
