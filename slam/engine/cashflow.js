// Cash flow engine: one calendar month of income (gross and take-home),
// expenses, debt minimums, saving, surplus and savings rates. Dated income and
// expense changes are handled month by month.

import { valueOf, tracker, round2, toDay, daysInMonth, monthStart, monthEnd, addDays, monthKey } from './spine.js';
import { PER_YEAR } from './schema.js';
import { minimumsTotal, debtSchedule } from './debt.js';
import { taxSetAside } from './tax.js';

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

// Accounts whose monthly contribution comes out of a paycheck before take-home.
const PAYROLL_FAMILIES = ['employerRetirement', 'hsaFsa'];

// schedule: a debtSchedule covering ym (the projection passes its own); a month
// after the as-of month reads its minimums from it (S-170).
// taxCache: shared year-by-year tax results (the projection passes its own).
export function cashflow(spine, rules, ym, { mode = 'committed', schedule = null, taxCache = null } = {}) {
  const year = +ym.slice(0, 4);
  const iso = monthStart(ym);
  const g = tracker(), wh = tracker(), fi = tracker(), th = tracker(), uw = tracker();
  let gross = 0, withheld = 0, fica = 0, unwithheld = 0, w2Active = false;
  const streams = [];
  for (const s of spine.income || []) {
    if (!isActive(s, ym)) continue;
    const base = 'income.' + s.id;
    const weight = streamWeight(s, mode, g);
    if (weight === 0) { streams.push({ id: s.id, label: s.label, type: s.type, gross: 0, included: false }); continue; }
    const amt = g.useFact(base + '.amount', s.amount);
    const m = monthlyAmount(amt, s.cadence, s.start, s.end, ym);
    const w = weight ?? 1;
    const sg = m === null ? null : m * w;
    if (sg !== null) gross += sg;
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

  // Saving: payroll contributions (only while a paycheck is coming in) and
  // after-tax contributions paid from take-home.
  const pay = tracker(), after = tracker();
  let payroll = 0, afterTax = 0;
  for (const a of spine.accounts || []) {
    if (!a.monthlyContribution) continue;
    const path = 'accounts.' + a.id + '.monthlyContribution';
    if (PAYROLL_FAMILIES.includes(a.family)) {
      if (!w2Active) continue;
      const x = pay.useFact(path, a.monthlyContribution);
      if (x !== null) payroll += x;
    } else if (a.family !== 'cash') {
      const x = after.useFact(path, a.monthlyContribution);
      if (x !== null) afterTax += x;
    }
  }
  th.absorb(pay.out(0));

  // Expenses. One paid by someone else counts $0 (S-171). Needs: expenses
  // tagged need; with none tagged the total is missing, not 0. Lean: food,
  // housing and transportation that are not wants (eating out is a want).
  const ex = tracker(), fat = tracker(), need = tracker(), lean = tracker();
  let total = 0, fatSum = 0, needSum = 0, leanSum = 0, anyNeed = false;
  const items = [];
  for (const e of spine.expenses || []) {
    if (!isActive(e, ym)) continue;
    const base = 'expenses.' + e.id, path = base + '.amount';
    const covered = !!e.covered && v(e.covered) === true;
    if (covered) { ex.useFact(base + '.covered', e.covered); items.push({ id: e.id, label: e.label, amount: 0, covered: true, fat: e.fat, need: v(e.need), fixed: e.fixed }); continue; }
    const amt = ex.useFact(path, e.amount);
    const m = monthlyAmount(amt, e.cadence, e.start, e.end, ym);
    if (m !== null) total += m;
    const isNeed = v(e.need);
    if (e.fat) { fat.useFact(path, e.amount); if (m !== null) fatSum += m; }
    if (isNeed === true) { anyNeed = true; need.useFact(path, e.amount); need.useFact(base + '.need', e.need); if (m !== null) needSum += m; }
    else if (isNeed === null) need.addMissing(base + '.need');
    if (e.fat && isNeed !== false) { lean.useFact(path, e.amount); if (isNeed === null) lean.addMissing(base + '.need'); if (m !== null) leanSum += m; }
    items.push({ id: e.id, label: e.label, amount: round2(m), fat: e.fat, need: isNeed, fixed: e.fixed });
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
    mins = { total: st.out(mo.paid), items: mo.payments.map((p) => ({ id: p.id, name: p.name, amount: p.amount, estimated: p.estimated, dueDate: p.dueDate })) };
  } else mins = minimumsTotal(spine, rules, iso);

  // Tax set-aside (S-172): income with no federal withholding (unemployment,
  // 1099) and this year's Roth conversions set aside tax at the marginal
  // federal plus state rate (plus self-employment tax on 1099 income).
  const setAside = taxSetAside(spine, rules, ym, { mode, streams, cache: taxCache });

  const takeHome = th.out(round2(gross - withheld - fica - payroll));
  const sur = tracker();
  sur.absorb(takeHome); sur.absorb(ex.out(0)); sur.absorb(mins.total); sur.absorb(after.out(0)); sur.absorb(setAside.total);
  // Surplus = take-home - expenses - minimum payments - after-tax saving - tax set-aside.
  const surplus = round2(gross - withheld - fica - payroll - total - mins.total.value - afterTax - (setAside.total.value ?? 0));
  const surplusR = sur.out(surplus);
  const rate = (num, den, ...parts) => { const t = tracker(); for (const p of parts) t.absorb(p); return t.out(den > 0 ? num / den : null); };
  const grossR = g.out(round2(gross));
  return {
    ym, mode,
    income: { gross: grossR, withheld: wh.out(round2(withheld)), fica: fi.out(round2(fica)), takeHome, unwithheld: uw.out(round2(unwithheld)), streams },
    saving: { payroll: pay.out(round2(payroll)), afterTax: after.out(round2(afterTax)) },
    expenses: { total: ex.out(round2(total)), fat: fat.out(round2(fatSum)), need: need.out(anyNeed ? round2(needSum) : null), lean: lean.out(round2(leanSum)), items },
    debtMinimums: mins,
    taxSetAside: setAside,
    surplus: surplusR,
    savingsRate: {
      // Gross: everything saved (surplus, payroll and after-tax contributions) out of gross pay.
      gross: rate(surplus + payroll + afterTax, gross, surplusR, grossR, pay.out(0), after.out(0)),
      // Net: what is kept out of take-home (surplus and after-tax contributions).
      net: rate(surplus + afterTax, gross - withheld - fica - payroll, surplusR, takeHome, after.out(0))
    }
  };
}

// The month a date falls in, and the first full month after it.
export const nextMonthOf = (iso) => addDays(monthEnd(iso.slice(0, 7)), 1).slice(0, 7);
