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
import { minimumPayment, accrueMonth } from './debt.js';
import { taxForYear } from './tax.js';

const v = valueOf;

export function project(spine, rules, { asOf = spine.meta.asOf, mode = 'expected', endYm = null } = {}) {
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
      const rate = a.appreciationRate ? v(a.appreciationRate) : null;
      if (a.family === 'otherAssets' && rate === null) t.addRough('accounts.' + a.id + '.appreciationRate');
      others.push({ id: a.id, value: b, monthly: rate === null ? 0 : Math.pow(1 + rate, 1 / 12) - 1 });
    }
  }
  const debts = (spine.debts || []).map((d) => ({ d, bal: v(d.balance) ?? 0, startBal: v(d.balance) ?? 0, interest: 0, deferredDone: false, paidYm: null }));

  // Tax balances, paid each April for the year before.
  const taxCache = new Map();
  const taxFor = (y) => {
    if (!taxCache.has(y)) {
      const tx = taxForYear(spine, rules, y, { asOf, mode });
      if (tx.balanceDue.value === null) for (const list of Object.values(tx.missingPaths)) for (const p of list) t.addMissing(p);
      taxCache.set(y, tx);
    }
    return taxCache.get(y);
  };

  const months = [], years = [], events = [];
  let ym = monthKey(asOf), firstShortfall = null;
  let yearAcc = null;
  const startYear = () => ({ year: null, gross: 0, takeHome: 0, expenses: 0, debtPaid: 0, interest: 0, tax: 0, saved: 0, surplus: 0 });
  yearAcc = startYear();
  while (ym < last) {
    ym = addMonths(ym, 1);
    const iso = monthStart(ym);
    const cf = cashflow(spine, rules, ym, { mode });
    t.absorb({ ...cf.income.takeHome, value: undefined });
    t.absorb({ ...cf.expenses.total, value: undefined });

    let debtPaid = 0, interest = 0;
    for (const s of debts) {
      if (s.bal <= 0.005) continue;
      interest += accrueMonth(s, iso, asOf, t);
      const m = minimumPayment(s.d, rules, iso, s.bal);
      if (m.value === null) t.addMissing('debts.' + s.d.id + '.minimum');
      if (m.estimated) t.addRough('debts.' + s.d.id + '.minimum');
      const pay = Math.min(s.bal, m.value ?? 0);
      s.bal -= pay; debtPaid += pay;
      if (s.bal <= 0.005 && !s.paidYm) { s.bal = 0; s.paidYm = ym; events.push({ ym, kind: 'debtPaidOff', label: (v(s.d.name) || s.d.id) + ' paid off', path: 'debts.' + s.d.id + '.balance' }); }
    }

    let tax = 0;
    if (ym.slice(5) === '04') { const tx = taxFor(+ym.slice(0, 4) - 1); tax = tx.balanceDue.value ?? 0; }

    const saved = cf.saving.payroll.value + cf.saving.afterTax.value;
    const surplus = cf.income.takeHome.value - cf.expenses.total.value - cf.saving.afterTax.value - debtPaid - tax;
    cash += surplus;
    invested = invested * (1 + growth) + saved;
    for (const o of others) o.value *= 1 + o.monthly;
    if (cash < 0 && !firstShortfall) { firstShortfall = ym; events.push({ ym, kind: 'shortfall', label: 'Cash runs out', path: null }); }

    const debt = debts.reduce((a, s) => a + s.bal, 0);
    const other = others.reduce((a, o) => a + o.value, 0);
    const row = {
      ym, age: birth ? ageOn(birth, monthStart(ym)) : null,
      gross: round2(cf.income.gross.value), takeHome: round2(cf.income.takeHome.value), expenses: round2(cf.expenses.total.value),
      debtPaid: round2(debtPaid), interest: round2(interest), tax: round2(tax), saved: round2(saved), surplus: round2(surplus),
      cash: round2(cash), invested: round2(invested), otherAssets: round2(other), debt: round2(debt), netWorth: round2(cash + invested + other - debt)
    };
    if (months.length < monthsShown) months.push(row);
    const y = ym.slice(0, 4);
    yearAcc.year = +y;
    for (const k of ['gross', 'takeHome', 'expenses', 'debtPaid', 'interest', 'tax', 'saved', 'surplus']) yearAcc[k] += row[k];
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
    if (inHorizon(e.start)) events.push({ ym: monthKey(e.start), date: e.start, kind: 'expenseStarts', label: e.label + ' starts', path: 'expenses.' + e.id + '.amount' });
    if (inHorizon(e.end)) events.push({ ym: monthKey(e.end), date: e.end, kind: 'expenseEnds', label: e.label + ' ends', path: 'expenses.' + e.id + '.amount' });
  }
  for (const d of spine.debts || []) if (inHorizon(v(d.promoEnds))) events.push({ ym: monthKey(v(d.promoEnds)), date: v(d.promoEnds), kind: 'promoEnds', label: (v(d.name) || d.id) + ' promo rate ends', path: 'debts.' + d.id + '.promoEnds' });
  for (const k of ['situation', 'healthCoverage']) for (const e of spine.household[k] || []) if (inHorizon(e.from)) events.push({ ym: monthKey(e.from), date: e.from, kind: k + 'Changes', label: (k === 'situation' ? 'Situation becomes ' : 'Health coverage becomes ') + String(v(e.value)).replace(/_/g, ' '), path: 'household.' + k + '.' + e.id + '.value' });
  events.sort((a, b) => (a.ym < b.ym ? -1 : a.ym > b.ym ? 1 : 0));

  const snap = t.snapshot();
  return { mode, asOf, months, years, events, firstShortfall, from: snap.from, rough: snap.rough, missing: snap.missing, rules: snap.rules, kind: snap.missing.length ? 'incomplete' : snap.rough.length ? 'rough' : 'computed' };
}
