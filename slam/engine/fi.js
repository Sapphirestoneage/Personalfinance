// FI engine: the FI number (a direct goal, or goal spending / withdrawal
// rate, else current spending / withdrawal rate), FI percent, years to FI,
// Lean FI (yearly FAT spending x 25), Coast FI, and the FI number implied by
// current spending so a gap with the goal is visible.

import { valueOf, tracker, round2, ageOn } from './spine.js';
import { project } from './projection.js';

const v = valueOf;

// Years for P growing at r with C added a year to reach F. null when never.
export function yearsToTarget(P, C, F, r) {
  if (P >= F) return 0;
  if (r === 0) return C > 0 ? (F - P) / C : null;
  const num = F * r + C, den = P * r + C;
  if (den <= 0 || num / den <= 0) return null;
  const n = Math.log(num / den) / Math.log(1 + r);
  return n >= 0 ? n : null;
}

// fromProjection: years to FI from the month-by-month projection (income
// ending and starting, debts paid off, tax set aside), with positive surplus
// invested (S-173). Off, it uses this month's saving a year (the still-guessing
// ranking turns it off to stay fast).
export function fiReport(spine, rules, cf, sheet, asOf = spine.meta.asOf, { fromProjection = true } = {}) {
  const year = +asOf.slice(0, 4);
  const A = spine.assumptions;
  const base = tracker();
  const wr = base.read(spine, 'assumptions.withdrawalRate');
  const r = base.read(spine, 'assumptions.realReturn');

  // What current spending implies: monthly expenses (no debt payments) x 12 / rate.
  const imp = tracker();
  imp.absorb(cf.expenses.total); imp.read(spine, 'assumptions.withdrawalRate');
  const implied = imp.out(wr ? round2(cf.expenses.total.value * 12 / wr) : null);
  // Today's FI number (B2): today's yearly spending, debt payments included, / the withdrawal rate.
  const td = tracker();
  td.absorb(cf.expenses.total); td.absorb(cf.debtMinimums.total); td.read(spine, 'assumptions.withdrawalRate');
  const yearlyToday = cf.expenses.total.value === null ? null : round2((cf.expenses.total.value + (cf.debtMinimums.total.value ?? 0)) * 12);
  const today = td.out(wr && yearlyToday !== null ? round2(yearlyToday / wr) : null);

  // The goal: a direct FI number wins, else goal spending / rate.
  const goalRec = (spine.goals || []).find((g) => g.type === 'fi');
  const gt = tracker();
  let goal = null, goalSource = null;
  if (goalRec) {
    const p = 'goals.' + goalRec.id;
    const direct = goalRec.fiNumber ? gt.useFact(p + '.fiNumber', goalRec.fiNumber) : null;
    if (direct !== null) { goal = direct; goalSource = 'direct'; }
    else if (goalRec.annualSpending) {
      const s = gt.useFact(p + '.annualSpending', goalRec.annualSpending);
      gt.read(spine, 'assumptions.withdrawalRate');
      if (s !== null && wr) { goal = s / wr; goalSource = 'spending'; }
    }
  }
  const goalR = gt.out(goal === null ? null : round2(goal));
  // The one target years-to-FI and Coast FI aim at: the goal when there is one, else today's FI number.
  const fiNumber = goal !== null ? goalR : today;

  // FI % (B2) = invested assets / today's FI number.
  const pct = tracker();
  pct.absorb(sheet.invested); pct.absorb(today);
  const fiPercent = pct.out(today.value ? round2(sheet.invested.value / today.value * 1e6) / 1e6 : null);

  // Fat FI = dream yearly spending / withdrawal rate; Barista FI = (today's yearly spending - part-time income a
  // year) / withdrawal rate. Both read the FI goal's own fields; blank is missing, never $0.
  const ft = tracker(), bt = tracker();
  const dream = goalRec && goalRec.dreamSpending ? ft.useFact('goals.' + goalRec.id + '.dreamSpending', goalRec.dreamSpending) : (ft.addMissing('goals.' + (goalRec ? goalRec.id : 'fi') + '.dreamSpending'), null);
  ft.read(spine, 'assumptions.withdrawalRate');
  const fatFi = ft.out(dream === null || !wr ? null : round2(dream / wr));
  bt.absorb(today);
  const partTime = goalRec && goalRec.partTimeIncome ? bt.useFact('goals.' + goalRec.id + '.partTimeIncome', goalRec.partTimeIncome) : (bt.addMissing('goals.' + (goalRec ? goalRec.id : 'fi') + '.partTimeIncome'), null);
  const baristaFi = bt.out(partTime === null || !wr || yearlyToday === null ? null : round2(Math.max(0, yearlyToday - partTime) / wr));

  // Lean FI: yearly food, housing and transportation that are needs (eating
  // out is a want), at the same withdrawal rate as every other FI number (S-173).
  const lean = tracker();
  lean.absorb(cf.expenses.lean); lean.read(spine, 'assumptions.withdrawalRate');
  const leanFi = lean.out(wr ? round2(cf.expenses.lean.value * 12 / wr) : null);

  // Coast FI: what invested today grows into the FI number by the coast age.
  const person = spine.household.people[0];
  const ct = tracker();
  ct.absorb(fiNumber);
  const birth = ct.useFact('household.people.' + person.id + '.birthDate', person.birthDate);
  let coastAge = A.coastAge ? ct.read(spine, 'assumptions.coastAge') : null;
  if (coastAge === null) { coastAge = ct.rule(rules, 'APP_COAST_AGE', year); ct.addRough('assumptions.coastAge'); }
  ct.read(spine, 'assumptions.realReturn');
  const age = birth ? ageOn(birth, asOf) : null;
  const coast = ct.out(age === null || r === null || !fiNumber.value ? null : round2(fiNumber.value / Math.pow(1 + r, Math.max(0, coastAge - age))));

  // Years to FI at today's saving rate (surplus plus contributions, a year).
  const yt = tracker();
  yt.absorb(sheet.invested); yt.absorb(fiNumber); yt.absorb(cf.surplus); yt.absorb(cf.saving.payroll); yt.absorb(cf.saving.afterTax);
  yt.read(spine, 'assumptions.realReturn');
  const annualSaving = (cf.surplus.value + cf.saving.payroll.value + cf.saving.afterTax.value) * 12;
  let years = null, projectionNote = null;
  if (r !== null && fiNumber.value) {
    if (fromProjection) {
      const p = project(spine, rules, { asOf, mode: 'expected', investSurplus: true, stopAt: fiNumber.value });
      yt.absorb({ value: 0, from: p.from, rough: p.rough, missing: p.missing, rules: p.rules });
      const anySaving = p.years.some((y) => y.saved > 0) || p.months.some((m) => m.saved > 0);
      if (sheet.invested.value >= fiNumber.value) years = 0;
      else if (p.reached) { const [y, m] = p.reached.split('-').map(Number); const [y0, m0] = asOf.slice(0, 7).split('-').map(Number); years = ((y - y0) * 12 + (m - m0)) / 12; }
      else projectionNote = anySaving ? 'The projection does not reach the FI number by the life expectancy assumption.' : 'The projection has no month with positive saving.';
    } else years = yearsToTarget(sheet.invested.value, annualSaving, fiNumber.value, r);
  }

  const mis = tracker();
  mis.absorb(goalR); mis.absorb(implied);
  return {
    // Yearly spending the FI number rests on (Batch 3): the goal's own when it has one, else today's spending.
    // A direct FI number rests on no spending, so there is none to show.
    yearlySpending: goalSource === 'direct' ? { value: null, kind: 'notForMe' } : goalSource === 'spending' ? { value: round2(goal * wr), kind: goalR.kind } : { value: cf.expenses.total.value === null ? null : round2(cf.expenses.total.value * 12), kind: cf.expenses.total.kind },
    fiNumber, goal: goalR, goalSource, implied, today, yearlyToday, fatFi, baristaFi,
    // The three FI numbers side by side (B2): today's spending, the goal's, and today's without debt payments.
    threeWays: [{ id: 'today', label: 'Today\'s spending', result: today }, { id: 'goal', label: 'Your goal', result: goalR }, { id: 'noDebt', label: 'Without debt payments', result: implied }],
    goalBelowImplied: mis.out(goal === null || implied.value === null ? null : goal < implied.value),
    fiPercent, leanFi, coastFi: coast, coastAge, coastReached: coast.value === null ? null : sheet.invested.value >= coast.value,
    annualSaving: round2(annualSaving),
    yearsToFi: yt.out(years === null ? null : Math.round(years * 10) / 10, { note: projectionNote }),
    neverAtThisRate: years === null && fiNumber.value !== null && sheet.invested.value < fiNumber.value
  };
}

