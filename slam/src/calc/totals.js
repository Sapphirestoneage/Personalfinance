// Totals and shares: spending, savings, surplus, fixed vs variable,
// needs vs wants vs savings, savings rate, housing share, roommate worst case,
// mistake cost, and money others owe back.
// "Basis" = the actual when one exists, otherwise the estimate (and we say so).

import { sumKnown, ratio, minus } from './money.js';
import { toMonthly } from './normalize.js';

export const FAT_CATEGORIES = ['food', 'housing', 'transport'];

function part(src, amount, cat) {
  return {
    lineId: src === cat ? null : src.id, name: src.name, amount,
    kind: src.kind, need: src.need, savings: cat.savings, tag: src.tag, joy: src.joy === undefined ? null : src.joy
  };
}

export function basisFor(cat) {
  if (cat.insideTotal && cat.actual.amount === null) return { amount: null, from: 'in-total', parts: [] };
  if (cat.isEverything && cat.actual.amount === null && cat.estimate.amount !== null) {
    // What is left of the single total after actuals found inside it.
    const amount = Math.max(0, cat.estimate.amount - (cat.insideActual || 0));
    return { amount, from: 'estimate', parts: [part(cat, amount, cat)] };
  }
  if (cat.actual.amount !== null) {
    return { amount: cat.actual.amount, from: 'actual', parts: cat.lines.filter((l) => l.actual !== null).map((l) => part(l, l.actual, cat)) };
  }
  if (cat.estimate.amount !== null) {
    const parts = cat.estimate.from === 'lines'
      ? cat.lines.filter((l) => l.estimate !== null).map((l) => part(l, l.estimate, cat))
      : [part(cat, cat.estimate.amount, cat)];
    return { amount: cat.estimate.amount, from: 'estimate', parts };
  }
  return { amount: null, from: null, parts: [] };
}

// Sum of a column over spending categories. null when nobody answered it
// (zeros from "doesn't apply" and computed debt lines alone do not count).
function answeredTotal(list, key) {
  const vals = list.map((x) => x.cat[key].amount);
  const real = list.some((x) => x.cat[key].amount !== null && !x.cat.notForMe && !x.cat.isDebt);
  return real ? sumKnown(vals).total : null;
}

function addUp(parts, test) {
  return parts.filter(test).reduce((a, p) => a + p.amount, 0);
}

export function budgetTotals(model, income, doc, housingBand = 0.35) {
  const cats = model.categories.map((c) => ({ cat: c, basis: basisFor(c) }));
  const spending = cats.filter((x) => !x.cat.savings);
  const saving = cats.filter((x) => x.cat.savings);

  const spendingBasis = sumKnown(spending.map((x) => x.basis.amount)).total;
  const savingsBasis = sumKnown(saving.map((x) => x.basis.amount)).total;
  const outflow = sumKnown([spendingBasis, savingsBasis]).total;
  const takeHome = income.takeHome;
  const spendParts = spending.flatMap((x) => x.basis.parts);
  const allParts = cats.flatMap((x) => x.basis.parts);

  const fixed = addUp(spendParts, (p) => p.kind === 'fixed');
  const variable = addUp(spendParts, (p) => p.kind !== 'fixed');
  const needs = addUp(spendParts, (p) => p.need);
  const wants = addUp(spendParts, (p) => !p.need);
  const savings = savingsBasis === null ? 0 : savingsBasis;

  // FAT is strict: Food + Accommodation (Housing) + Transportation, by category.
  const fat = sumKnown(cats.filter((x) => FAT_CATEGORIES.includes(x.cat.id)).map((x) => x.basis.amount)).total;

  const housing = cats.find((x) => x.cat.id === 'housing');
  const housingBasis = housing ? housing.basis.amount : null;
  // Your share of the rent is the rent line itself (never asked twice).
  const rm = doc.household.roommates;
  const totalRent = toMonthly(rm.totalRent, 'monthly');
  const rentLine = housing ? housing.cat.lines.find((l) => l.id === 'rent') : null;
  const yourShare = rentLine ? (rentLine.actual !== null ? rentLine.actual : rentLine.estimate) : null;
  const roommateWorstCase = rm.count > 0 && housingBasis !== null && totalRent !== null && yourShare !== null
    ? housingBasis - yourShare + totalRent : null;

  const mistakeMonthly = addUp(allParts, (p) => p.tag === 'mistake');
  const owedBack = model.categories.reduce((a, c) => a + c.lines.reduce((b, l) => b + l.owedOutstanding, 0), 0);

  const totals = {
    takeHome,
    estimateTotal: answeredTotal(spending, 'estimate'),
    dreamTotal: answeredTotal(spending, 'dream'),
    actualTotal: answeredTotal(spending, 'actual'),
    savingsEstimate: sumKnown(saving.map((x) => x.cat.estimate.amount)).total,
    savingsDream: sumKnown(saving.map((x) => x.cat.dream.amount)).total,
    spending: spendingBasis,
    spendingShare: ratio(spendingBasis, takeHome),
    savings: savingsBasis,
    outflow,
    surplus: minus(takeHome, outflow),
    // The estimate and dream columns as a whole budget, and what each would leave.
    estimateOutflow: sumKnown([answeredTotal(spending, 'estimate'), sumKnown(saving.map((x) => x.cat.estimate.amount)).total]).total,
    dreamOutflow: sumKnown([answeredTotal(spending, 'dream'), sumKnown(saving.map((x) => x.cat.dream.amount)).total]).total,
    basisUsesEstimate: cats.filter((x) => x.basis.from === 'estimate').map((x) => x.cat.name),
    basisMissing: cats.filter((x) => x.basis.from === null).map((x) => x.cat.name),
    fixed, variable,
    fixedPct: ratio(fixed, spendingBasis), variablePct: ratio(variable, spendingBasis),
    needs, wants, savingsAmount: savings,
    fat, fatShare: ratio(fat, takeHome),
    needsPct: ratio(needs, takeHome), wantsPct: ratio(wants, takeHome), savingsPct: ratio(savings, takeHome),
    savingsRate: ratio(savings + income.pretax, takeHome === null ? null : takeHome + income.pretax),
    housing: housingBasis,
    housingShare: ratio(housingBasis, takeHome),
    housingBand,
    housingOver: housingBasis !== null && takeHome ? housingBasis / takeHome > housingBand : null,
    roommateWorstCase,
    roommateWorstCaseShare: ratio(roommateWorstCase, takeHome),
    mistakeMonthly, mistakeYearly: mistakeMonthly * 12,
    owedBack,
    bases: Object.fromEntries(cats.map((x) => [x.cat.id, x.basis]))
  };
  totals.estimateLeft = minus(takeHome, totals.estimateOutflow);
  totals.dreamLeft = minus(takeHome, totals.dreamOutflow);
  return totals;
}
