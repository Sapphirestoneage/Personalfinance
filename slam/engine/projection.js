// Projection: month by month from the month after asOf, reported monthly for
// APP_PROJ_MONTHS and then by calendar year until the first person reaches
// the life expectancy assumption. Dated changes come from the spine itself
// (income and expense start and end dates, promo end dates, loans running to
// zero). Everything is in today's dollars: invested money grows at the real
// return; debts keep their stated rates (a simplification, see S-147).
//
// Each year's tax balance (taxForYear) is paid or refunded in April of the
// next year. A year whose tax is missing is left out and the fields it needs
// are named in missing.
// Only minimum payments are made; extra goes to cash (debt.js runs payoff orders).

import { valueOf, tracker, round2, monthKey, monthStart, addMonths, ageOn } from './spine.js';
import { INVESTED_FAMILIES } from './schema.js';
import { cashflow } from './cashflow.js';
import { debtSchedule } from './debt.js';
import { yearTax } from './tax.js';
import { hiddenLine } from './profile.js';
import { shadowedEstimate } from './needs.js';

const v = valueOf;

// investSurplus: a month's positive surplus goes to invested money (used for
// years to FI); otherwise it stays in cash. stopAt: stop once invested reaches it.
export function project(spine, rules, { asOf = spine.meta.asOf, mode = 'expected', endYm = null, investSurplus = false, stopAt = null } = {}) {
  const t = tracker();
  const year0 = +asOf.slice(0, 4);
  const monthsShown = rules.get('APP_PROJ_MONTHS', year0);
  const person = spine.household.people[0];
  const birth = t.useFact('household.people.' + person.id + '.birthDate', person.birthDate);
  const life = t.read(spine, 'assumptions.lifeExpectancy');
  const r = t.read(spine, 'assumptions.realReturn');
  const last = endYm || (birth && life ? (+birth.slice(0, 4) + life) + '-12' : addMonths(monthKey(asOf), monthsShown));
  const growth = r === null ? 0 : Math.pow(1 + r, 1 / 12) - 1;

  let cash = 0, invested = 0;
  const others = [];
  for (const a of spine.accounts || []) {
    const b = t.useFact('accounts.' + a.id + '.balance', a.balance) ?? 0;
    if (a.family === 'cash') cash += b;
    else if (INVESTED_FAMILIES.includes(a.family)) invested += b;
    else {
      // Read as a Fact, so a rough rate (the house car default) makes the projection rough.
      const rate = a.appreciationRate ? t.useFact('accounts.' + a.id + '.appreciationRate', a.appreciationRate) : null;
      if (a.family === 'otherAssets' && rate === null) t.addRough('accounts.' + a.id + '.appreciationRate');
      others.push({ id: a.id, value: b, monthly: rate === null ? 0 : Math.pow(1 + rate, 1 / 12) - 1 });
    }
  }
  // One debt schedule for the whole run (S-170), shared with cash flow.
  const schedule = debtSchedule(spine, rules, asOf, last);
  t.absorb({ value: 0, from: schedule.from, rough: schedule.rough, missing: schedule.missing, rules: schedule.rules });

  // Tax: set aside monthly into a reserve per tax year (S-172); each April the
  // year before is settled from its reserve: the balance due is paid and what
  // is left (or short) goes back to (or comes out of) cash.
  const taxCache = new Map();
  const reserve = new Map();
  const taxFor = (y) => {
    const tx = yearTax(spine, rules, y, mode, taxCache);
    if (tx.balanceDue.value === null) for (const list of Object.values(tx.missingPaths)) for (const p of list) t.addMissing(p);
    return tx;
  };

  const months = [], years = [], events = [];
  let ym = monthKey(asOf), firstShortfall = null, reached = null;
  let yearAcc = null;
  const startYear = () => ({ year: null, gross: 0, takeHome: 0, expenses: 0, debtPaid: 0, interest: 0, tax: 0, saved: 0, surplus: 0 });
  yearAcc = startYear();
  while (ym < last) {
    ym = addMonths(ym, 1);
    const iso = monthStart(ym);
    void iso;
    const cf = cashflow(spine, rules, ym, { mode, schedule, taxCache });
    t.absorb({ ...cf.income.takeHome, value: undefined });
    t.absorb({ ...cf.expenses.total, value: undefined });
    t.absorb({ ...cf.taxSetAside.total, value: undefined });

    const mo = schedule.months.get(ym);
    const debtPaid = mo.paid, interest = mo.interest;
    const payments = mo.payments.map((p) => ({ id: p.id, date: p.dueDate, amount: p.amount }));
    for (const id of mo.paidOff) { const d = spine.debts.find((x) => x.id === id); events.push({ ym, kind: 'debtPaidOff', label: (v(d.name) || id) + ' paid off', path: 'debts.' + id + '.balance' }); }

    // This month's set-aside goes into its tax year's reserve.
    for (const l of cf.taxSetAside.lines) reserve.set(l.taxYear, (reserve.get(l.taxYear) || 0) + l.amount);
    const setAside = cf.taxSetAside.total.value ?? 0;
    // April settles last year's tax from its reserve. A year whose tax cannot be
    // figured keeps its reserve as the payment (and names what is missing).
    let tax = 0;
    if (ym.slice(5) === rules.get('TAX_RETURN_DUE', +ym.slice(0, 4)).slice(0, 2)) {
      const y = +ym.slice(0, 4) - 1;
      const due = taxFor(y).balanceDue.value;
      const held = reserve.get(y) || 0;
      tax = due === null ? 0 : due - held;
      reserve.delete(y);
    }

    const saved = cf.saving.payroll.value + cf.saving.afterTax.value;
    const surplus = cf.income.takeHome.value - cf.expenses.total.value - cf.saving.afterTax.value - debtPaid - setAside - tax;
    const toInvest = investSurplus && surplus > 0 ? surplus : 0;
    cash += surplus - toInvest;
    invested = invested * (1 + growth) + saved + toInvest;
    for (const o of others) o.value *= 1 + o.monthly;
    if (cash < 0 && !firstShortfall) { firstShortfall = ym; events.push({ ym, kind: 'shortfall', label: 'Cash runs out', path: null }); }

    const debt = mo.debt;
    const other = others.reduce((a, o) => a + o.value, 0);
    const row = {
      ym, age: birth ? ageOn(birth, monthStart(ym)) : null,
      gross: round2(cf.income.gross.value), takeHome: round2(cf.income.takeHome.value), expenses: round2(cf.expenses.total.value),
      debtPaid: round2(debtPaid), interest: round2(interest), taxSetAside: round2(setAside), tax: round2(tax), saved: round2(saved + toInvest), surplus: round2(surplus),
      cash: round2(cash), invested: round2(invested), otherAssets: round2(other), debt: round2(debt), netWorth: round2(cash + invested + other - debt)
    };
    // Monthly rows list each minimum on its due day (date null when none is entered).
    if (months.length < monthsShown) months.push({ ...row, payments: payments.sort((a, b) => String(a.date).localeCompare(String(b.date))) });
    const y = ym.slice(0, 4);
    yearAcc.year = +y;
    for (const k of ['gross', 'takeHome', 'expenses', 'debtPaid', 'interest', 'taxSetAside', 'tax', 'saved', 'surplus']) yearAcc[k] = (yearAcc[k] || 0) + row[k];
    if (stopAt !== null && invested >= stopAt && !reached) reached = ym;
    if (reached && stopAt !== null) { if (months.length < monthsShown) months.push({ ...row, payments }); break; }
    if (ym.slice(5) === '12' || ym === last) {
      years.push({ ...Object.fromEntries(Object.entries(yearAcc).map(([k, x]) => [k, k === 'year' ? x : round2(x)])), age: row.age, cash: row.cash, invested: row.invested, otherAssets: row.otherAssets, debt: row.debt, netWorth: row.netWorth });
      yearAcc = startYear();
    }
  }

  // Dated changes from the spine, inside the horizon.
  const inHorizon = (d) => d && d > asOf && monthKey(d) <= last;
  for (const s of spine.income || []) {
    if (inHorizon(s.start) && s.cadence !== 'once') events.push({ ym: monthKey(s.start), date: s.start, kind: 'incomeStarts', label: s.label + ' starts', path: 'income.' + s.id + '.amount' });
    if (inHorizon(s.end)) events.push({ ym: monthKey(s.end), date: s.end, kind: 'incomeEnds', label: s.label + ' ends', path: 'income.' + s.id + '.amount' });
  }
  for (const e of spine.expenses || []) {
    if (hiddenLine(spine, e) || shadowedEstimate(spine, e)) continue;
    if (inHorizon(e.start)) events.push({ ym: monthKey(e.start), date: e.start, kind: 'expenseStarts', label: e.label + ' starts', path: 'expenses.' + e.id + '.amount' });
    if (inHorizon(e.end)) events.push({ ym: monthKey(e.end), date: e.end, kind: 'expenseEnds', label: e.label + ' ends', path: 'expenses.' + e.id + '.amount' });
  }
  for (const d of spine.debts || []) if (inHorizon(v(d.promoEnds))) events.push({ ym: monthKey(v(d.promoEnds)), date: v(d.promoEnds), kind: 'promoEnds', label: (v(d.name) || d.id) + ' promo rate ends', path: 'debts.' + d.id + '.promoEnds' });
  for (const k of ['situation', 'healthCoverage']) for (const e of spine.household[k] || []) if (inHorizon(e.from)) events.push({ ym: monthKey(e.from), date: e.from, kind: k + 'Changes', label: (k === 'situation' ? 'Situation becomes ' : 'Health coverage becomes ') + String(v(e.value)).replace(/_/g, ' '), path: 'household.' + k + '.' + e.id + '.value' });
  events.sort((a, b) => (a.ym < b.ym ? -1 : a.ym > b.ym ? 1 : 0));

  const snap = t.snapshot();
  return { mode, asOf, months, years, events, firstShortfall, reached, from: snap.from, rough: snap.rough, missing: snap.missing, rules: snap.rules, kind: snap.missing.length ? 'incomplete' : snap.rough.length ? 'rough' : 'computed' };
}
