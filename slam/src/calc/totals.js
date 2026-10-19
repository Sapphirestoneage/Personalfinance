// Totals and shares: spending, savings, surplus, fixed vs variable,
// needs vs wants vs savings, savings rate, housing share, roommate worst case,
// mistake cost, and money others owe back.
// "Basis" = the actual when one exists, otherwise the estimate (and we say so).

import { sumKnown, ratio, minus } from './money.js';
import { incomeMonth } from './income-month.js';
import { toMonthly } from './normalize.js';

export const FAT_CATEGORIES = ['food', 'housing', 'transport'];

function part(src, amount, cat) {
  return {
    lineId: src === cat ? null : src.id, name: src.name, amount,
    // A category-level answer (no lines) is tracked by what the category counts as.
    type: src === cat ? 'cat:' + (cat.type || 'other') : (src.type || 'other'),
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

// month: the month the model is for (the month being worked on unless given).
export function budgetTotals(model, income, doc, housingBand = 0.35, month = doc.currentMonth) {
  const cats = model.categories.map((c) => ({ cat: c, basis: basisFor(c) }));
  const spending = cats.filter((x) => !x.cat.savings);
  const saving = cats.filter((x) => x.cat.savings);

  const spendingBasis = sumKnown(spending.map((x) => x.basis.amount)).total;
  const savingsBasis = sumKnown(saving.map((x) => x.basis.amount)).total;
  const outflow = sumKnown([spendingBasis, savingsBasis]).total;
  const takeHome = income.takeHome;
  const incomeMonthOf = incomeMonth(doc, income, month);
  const spendParts = spending.flatMap((x) => x.basis.parts);
  const allParts = cats.flatMap((x) => x.basis.parts);

  const fixed = addUp(spendParts, (p) => p.kind === 'fixed');
  const variable = addUp(spendParts, (p) => p.kind !== 'fixed');
  const needs = addUp(spendParts, (p) => p.need);
  const wants = addUp(spendParts, (p) => !p.need);
  const savings = savingsBasis === null ? 0 : savingsBasis;

  // FAT is strict: Food + Accommodation (Housing) + Transportation, by what each
  // category counts as (its type), whatever it is called (S-068).
  const fat = sumKnown(cats.filter((x) => FAT_CATEGORIES.includes(x.cat.type)).map((x) => x.basis.amount)).total;
  // Totals by category type: several categories can count as the same thing.
  const typeBases = {};
  for (const x of cats) {
    const k = x.cat.type;
    if (x.basis.amount === null) { if (!(k in typeBases)) typeBases[k] = null; continue; }
    typeBases[k] = (typeBases[k] || 0) + x.basis.amount;
  }

  const housingCats = cats.filter((x) => x.cat.type === 'housing');
  const housingBasis = housingCats.length ? typeBases.housing : null;
  // Your share of the rent is the rent line itself (never asked twice).
  const rm = doc.household.roommates;
  const totalRent = toMonthly(rm.totalRent, 'monthly');
  const rentLine = housingCats.flatMap((x) => x.cat.lines).find((l) => l.type === 'rent') || null;
  const yourShare = rentLine ? (rentLine.actual !== null ? rentLine.actual : rentLine.estimate) : null;
  const roommateWorstCase = doc.household.livingWith === 'roommates' && rm.count > 0 && housingBasis !== null && totalRent !== null && yourShare !== null
    ? housingBasis - yourShare + totalRent : null;

  const mistakeMonthly = addUp(allParts, (p) => p.tag === 'mistake');
  const owedBack = model.categories.reduce((a, c) => a + c.lines.reduce((b, l) => b + l.owedOutstanding, 0), 0);

  const totals = {
    takeHome,
    estimateTotal: answeredTotal(spending, 'estimate'),
    actualTotal: answeredTotal(spending, 'actual'),
    savingsEstimate: sumKnown(saving.map((x) => x.cat.estimate.amount)).total,
    spending: spendingBasis,
    spendingShare: ratio(spendingBasis, takeHome),
    savings: savingsBasis,
    outflow,
    // Surplus (S-118): actual income from the log when the month's income is tracked, else the
    // budgeted take-home ("income not tracked this month"), less spending and savings.
    income: incomeMonthOf,
    incomeTracked: incomeMonthOf.tracked,
    incomeBasis: incomeMonthOf.tracked ? incomeMonthOf.actual : takeHome,
    surplus: minus(incomeMonthOf.tracked ? incomeMonthOf.actual : takeHome, outflow),
    // The month's gap as a share of what came in (S-135): surplus / income (or take-home).
    surplusRate: ratio(minus(incomeMonthOf.tracked ? incomeMonthOf.actual : takeHome, outflow), incomeMonthOf.tracked ? incomeMonthOf.actual : takeHome),
    // The estimate column as a whole budget, and what it would leave.
    estimateOutflow: sumKnown([answeredTotal(spending, 'estimate'), sumKnown(saving.map((x) => x.cat.estimate.amount)).total]).total,
    basisUsesEstimate: cats.filter((x) => x.basis.from === 'estimate').map((x) => x.cat.name),
    basisMissing: cats.filter((x) => x.basis.from === null).map((x) => x.cat.name),
    fixed, variable,
    fixedPct: ratio(fixed, spendingBasis), variablePct: ratio(variable, spendingBasis),
    needs, wants, savingsAmount: savings,
    fat, fatShare: ratio(fat, takeHome),
    needsPct: ratio(needs, takeHome), wantsPct: ratio(wants, takeHome), savingsPct: ratio(savings, takeHome),
    // Retirement taken out of the paycheck counts as saving.
    savingsRate: ratio(savings + income.retirementDeductions, takeHome === null ? null : takeHome + income.retirementDeductions),
    retirementDeductions: income.retirementDeductions,
    housing: housingBasis,
    housingShare: ratio(housingBasis, takeHome),
    housingBand,
    housingOver: housingBasis !== null && takeHome ? housingBasis / takeHome > housingBand : null,
    roommateWorstCase,
    roommateWorstCaseShare: ratio(roommateWorstCase, takeHome),
    mistakeMonthly, mistakeYearly: mistakeMonthly * 12,
    owedBack,
    bases: Object.fromEntries(cats.map((x) => [x.cat.id, x.basis])),
    typeBases,
    // Spending by standard type, like Rocket Money's categories: line types, or
    // the category's type where a category was answered as one number.
    spendByType: Object.entries(spendParts.reduce((acc, p) => { acc[p.type] = acc[p.type] || { amount: 0, names: [] }; acc[p.type].amount += p.amount; acc[p.type].names.push(p.name); return acc; }, {}))
      .map(([type, x]) => ({ type, amount: x.amount, names: x.names, share: ratio(x.amount, spendingBasis) }))
      .filter((x) => x.amount > 0).sort((a, b) => b.amount - a.amount)
  };
  totals.estimateLeft = minus(takeHome, totals.estimateOutflow);
  return totals;
}

// Total rent, then your share (S-123). The total is asked in Basics; your share is the Rent line in
// Housing (its one owner). An even split is offered while your share is blank:
//   even split = total rent / (roommates + 1), to the cent.
export function rentShare(doc) {
  const rm = doc.household.roommates;
  const total = toMonthly(rm.totalRent, 'monthly');
  const line = (doc.categories || []).filter((c) => c.type === 'housing').flatMap((c) => c.lines).find((l) => l.type === 'rent' && l.state !== 'archived') || null;
  const yours = line ? toMonthly(line.estimate, 'monthly') : null;
  const even = total === null || !(rm.count > 0) ? null : Math.round((total / (rm.count + 1)) * 100) / 100;
  return { total, line, lineId: line ? line.id : null, yours, even };
}

// Surplus first, then allocate it (S-132). Surplus = take-home - every spending estimate (Debt payments
// included). It can go four ways: spending (already counted), saving, investing, or extra on debt. The
// last three are the Savings lines, grouped by type; what is not allocated yet stays surplus.
//   allocated = the Savings estimates; not allocated yet = surplus - allocated
// Blank (null) until take-home and at least one spending estimate are in (empty is not zero).
const ALLOCATE = { 'emergency-fund': 'saving', 'savings-goal': 'saving', retirement: 'investing', investing: 'investing', 'extra-debt': 'debt' };
export function surplusAllocation(model, totals) {
  const lines = model.categories.filter((c) => c.savings).flatMap((c) => c.lines.map((l) => ({ id: l.id, name: l.name, to: ALLOCATE[l.type] || 'saving', amount: l.estimate })));
  const sum = (to) => sumKnown(lines.filter((l) => l.to === to).map((l) => l.amount)).total;
  const spending = totals.estimateTotal;
  const surplus = totals.takeHome === null || spending === null ? null : Math.round((totals.takeHome - spending) * 100) / 100;
  const allocated = totals.savingsEstimate;
  const unallocated = surplus === null ? null : allocated === null ? surplus : Math.round((surplus - allocated) * 100) / 100;
  const base = totals.takeHome === null ? null : totals.takeHome + totals.retirementDeductions;
  return {
    surplus, spending, takeHome: totals.takeHome,
    groups: { saving: sum('saving'), investing: sum('investing'), debt: sum('debt') }, lines,
    // Nothing allocated yet (blank): all of the surplus is still to allocate.
    allocated, unallocated,
    // The gap, as a share of take-home (S-135): surplus rate = surplus / take-home; left over rate = not
    // allocated yet / take-home.
    surplusRate: ratio(surplus, totals.takeHome), unallocatedRate: ratio(unallocated, totals.takeHome),
    // Only what is allocated counts as saving (S-138). The planned savings rate is the allocations plus
    // pre-tax retirement, over take-home plus pre-tax retirement; the boost is what the rest of the
    // surplus would add if it went to saving too:
    //   boost = not allocated yet / (take-home + pre-tax retirement), only while some is left over.
    savingsRate: ratio((allocated === null ? 0 : allocated) + totals.retirementDeductions, base),
    boost: unallocated !== null && unallocated > 0 ? ratio(unallocated, base) : null,
    //   possible savings rate = (allocated + not allocated yet + pre-tax retirement) / the same base
    possibleSavingsRate: unallocated !== null && unallocated > 0 ? ratio((allocated === null ? 0 : allocated) + unallocated + totals.retirementDeductions, base) : null
  };
}
