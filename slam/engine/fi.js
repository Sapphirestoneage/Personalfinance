// FI engine: the FI number (a direct goal, or goal spending / withdrawal
// rate, else current spending / withdrawal rate), FI percent, years to FI,
// Lean FI (yearly FAT spending x 25), Coast FI, and the FI number implied by
// current spending so a gap with the goal is visible.

import { valueOf, tracker, round2, ageOn } from './spine.js';

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

export function fiReport(spine, rules, cf, sheet, asOf = spine.meta.asOf) {
  const year = +asOf.slice(0, 4);
  const A = spine.assumptions;
  const base = tracker();
  const wr = base.read(spine, 'assumptions.withdrawalRate');
  const r = base.read(spine, 'assumptions.realReturn');

  // What current spending implies: monthly expenses (no debt payments) x 12 / rate.
  const imp = tracker();
  imp.absorb(cf.expenses.total); imp.read(spine, 'assumptions.withdrawalRate');
  const implied = imp.out(wr ? round2(cf.expenses.total.value * 12 / wr) : null);

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
  const fiNumber = goal !== null ? goalR : implied;

  const pct = tracker();
  pct.absorb(sheet.invested); pct.absorb(fiNumber);
  const fiPercent = pct.out(fiNumber.value ? sheet.invested.value / fiNumber.value : null);

  const lean = tracker();
  lean.absorb(cf.expenses.fat);
  const leanFi = lean.out(round2(cf.expenses.fat.value * 12 * lean.rule(rules, 'APP_LEAN_MULTIPLE', year)));

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
  const years = r === null || !fiNumber.value ? null : yearsToTarget(sheet.invested.value, annualSaving, fiNumber.value, r);

  const mis = tracker();
  mis.absorb(goalR); mis.absorb(implied);
  return {
    fiNumber, goal: goalR, goalSource, implied,
    goalBelowImplied: mis.out(goal === null || implied.value === null ? null : goal < implied.value),
    fiPercent, leanFi, coastFi: coast, coastAge, coastReached: coast.value === null ? null : sheet.invested.value >= coast.value,
    annualSaving: round2(annualSaving),
    yearsToFi: yt.out(years === null ? null : Math.round(years * 10) / 10),
    neverAtThisRate: years === null && fiNumber.value !== null && sheet.invested.value < fiNumber.value
  };
}

