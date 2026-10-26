// Emergency fund: the Rule of 5 target (age / 5 months of spending), cash
// runway in two tiers (full spending, FAT only), and the Roth backstop: Roth
// IRA contribution basis that can come out with no tax or penalty, shown on its
// own line and never counted as cash. Conversions carry their own clocks.

import { valueOf, tracker, round2, ageOn } from './spine.js';
import { cushionExtraMonths } from './profile.js';

const v = valueOf;

export function emergency(spine, rules, cf, sheet, asOf = spine.meta.asOf) {
  const year = +asOf.slice(0, 4);
  const person = spine.household.people[0];
  const age = tracker();
  const birth = age.useFact('household.people.' + person.id + '.birthDate', person.birthDate);
  const years = birth ? ageOn(birth, asOf) : null;

  const months = tracker();
  months.absorb(age.out(years));
  const divisor = months.rule(rules, 'APP_RULE_OF_5', year);
  // Income security (Profile Level 2): okay or shaky income adds months (house defaults CUSHION_*_EXTRA).
  const extra = cushionExtraMonths(spine, rules, year);
  if (extra) months.read(spine, 'profile.incomeSecurity');
  const targetMonths = months.out(years === null ? null : years / divisor + extra);

  // Monthly spending for both runway and target: expenses plus minimum payments.
  const burn = (expenses) => { const t = tracker(); t.absorb(expenses); t.absorb(cf.debtMinimums.total); return t.out(expenses.value === null ? null : round2(expenses.value + cf.debtMinimums.total.value)); };
  const full = burn(cf.expenses.total), fat = burn(cf.expenses.fat), needs = burn(cf.expenses.need);
  const runway = (b) => { const t = tracker(); t.absorb(sheet.cash); t.absorb(b); return t.out(b.value > 0 ? sheet.cash.value / b.value : null); };
  // Targets in dollars use the month's spending rounded up to a whole dollar,
  // so reaching a target in dollars always reaches it in months (S-165).
  const monthlyNeed = full.value === null ? null : Math.ceil(full.value);
  const target = tracker();
  target.absorb(targetMonths); target.absorb(full);
  const targetDollars = target.out(targetMonths.value === null || monthlyNeed === null ? null : Math.ceil(targetMonths.value * monthlyNeed));
  const gap = tracker();
  gap.absorb(targetDollars); gap.absorb(sheet.cash);

  // The cushion in three steps (B2, the Rule of 5): a month of needs, then a month of full spending, then age / 5
  // months of full spending. Each step's target, and whether the cash already reaches it.
  const stepOf = (id, label, r) => { const known = r.value !== null && sheet.cash.value !== null; return { id, label, target: r, reached: known ? sheet.cash.value >= r.value : null, toGo: known ? round2(Math.max(0, r.value - sheet.cash.value)) : null }; };
  const cushion = [
    stepOf('needs', 'A month of needs', needs),
    stepOf('month', 'A month of full spending', full),
    stepOf('ruleOf5', 'Age / 5 months of full spending', targetDollars)
  ];
  return {
    age: years, cushion,
    targetMonths,
    targetDollars,
    gap: gap.out(targetDollars.value === null ? null : round2(Math.max(0, targetDollars.value - sheet.cash.value))),
    tiers: {
      full: { burn: full, runway: runway(full) },
      fatOnly: { burn: fat, runway: runway(fat) },
      needsOnly: { burn: needs, runway: runway(needs) }
    },
    monthlyNeed,
    backstop: rothBackstop(spine, rules, asOf, years)
  };
}

// Roth money that can come out early. Contributions (basis): any time, no tax
// or penalty. Each conversion: no tax, but the early withdrawal penalty applies
// before its own five-year clock opens (January 1 of the conversion year plus
// ROTH_5YR) while under EARLY_AGE.
export function rothBackstop(spine, rules, asOf, age) {
  const year = +asOf.slice(0, 4);
  const basis = tracker();
  let contributions = 0;
  const conversions = [];
  const conv = tracker();
  for (const a of spine.accounts || []) {
    if (a.type !== 'roth_ira' && a.type !== 'custodial_roth') continue;
    const p = 'accounts.' + a.id;
    if (a.basis) { const b = basis.useFact(p + '.basis', a.basis); if (b !== null) contributions += b; }
    else if (a.contributions) { const list = basis.useFact(p + '.contributions', a.contributions); for (const c of list || []) contributions += c.amount; }
    for (const c of (a.conversions && conv.useFact(p + '.conversions', a.conversions)) || []) {
      const opens = c.year + conv.rule(rules, 'ROTH_5YR', year) + '-01-01';
      const early = age !== null && age < conv.rule(rules, 'EARLY_AGE', year);
      conversions.push({ accountId: a.id, year: c.year, amount: c.amount, clockOpens: opens, penaltyFree: asOf >= opens || !early, penaltyRate: asOf >= opens || !early ? 0 : conv.rule(rules, 'EARLY_PENALTY', year) });
    }
  }
  const sumConv = conversions.reduce((s, c) => s + c.amount, 0);
  return {
    contributions: basis.out(round2(contributions)),
    conversions,
    conversionsTotal: conv.out(round2(sumConv)),
    countedAsCash: false
  };
}

