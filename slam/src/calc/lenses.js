// Lenses re-read the same numbers in different ways. No new data comes in here.
// 50/30/20, DRAFTT, hours of work, the personal income statement, and joy.

import { ratio, sumKnown } from './money.js';
import { joyPer100 } from './happiness.js';

export function fiftyThirtyTwenty(totals, targets) {
  const row = (key, amount, target) => ({ key, amount, share: ratio(amount, totals.takeHome), target });
  return {
    takeHome: totals.takeHome,
    rows: [
      row('needs', totals.needs, targets.needs),
      row('wants', totals.wants, targets.wants),
      row('savings', totals.savingsAmount, targets.savings)
    ],
    unassigned: totals.surplus,
    unassignedShare: ratio(totals.surplus, totals.takeHome)
  };
}

// DRAFTT, descriptive (S-072): what the letters are, how big they are next to
// each other, and next to everything else in the budget. No bands, no verdicts.
// Letters: Debt, Retirement, Accommodation, Food, Transportation, plus Therapy
// when a therapy line has an amount. Base = take-home + pre-tax retirement, so
// DRAFTT + everything else + left over = 100% of the base exactly.
const LETTERS = [
  ['debt', 'Debt', 'D'], ['retirement', 'Retirement', 'R'], ['accommodation', 'Accommodation', 'A'],
  ['food', 'Food', 'F'], ['transportation', 'Transportation', 'T'], ['therapy', 'Therapy', 'Th']
];
const TYPE_OF = { debt: 'debt', accommodation: 'housing', food: 'food', transportation: 'transport' };
const LETTER_TYPES = Object.values(TYPE_OF);

// The pieces a category's estimate column is made of (mirrors basisFor in totals.js).
function estimateParts(c) {
  if (c.estimate.amount === null) return [];
  if (c.estimate.from === 'lines') return c.lines.filter((l) => l.estimate !== null).map((l) => ({ type: l.type, amount: l.estimate }));
  return [{ type: 'cat:' + c.type, amount: c.estimate.amount }];
}

// One letter's amount from a set of category pieces: a category type, or a line
// type (retirement, therapy) outside the D, A, F, T categories so nothing counts twice.
function letterAmount(model, key, partsOf) {
  if (TYPE_OF[key]) {
    const cats = model.categories.filter((c) => c.type === TYPE_OF[key]);
    if (!cats.length) return { amount: null, usesEstimate: false };
    const vals = cats.map((c) => partsOf(c).amount);
    return { amount: sumKnown(vals).total, usesEstimate: cats.some((c) => partsOf(c).from === 'estimate') };
  }
  const cats = model.categories.filter((c) => !LETTER_TYPES.includes(c.type));
  const hits = cats.flatMap((c) => partsOf(c).parts.filter((p) => p.type === key).map((p) => ({ ...p, from: partsOf(c).from })));
  return { amount: hits.length ? sumKnown(hits.map((p) => p.amount)).total : null, usesEstimate: hits.some((p) => p.from === 'estimate') };
}

export function draftt(model, totals, income) {
  const pretax = income.retirementDeductions || 0;
  const th = totals.takeHome;
  const base = th === null ? null : th + pretax;
  const basisOf = (c) => totals.bases[c.id];
  const estOf = (c) => ({ amount: c.estimate.amount, from: 'estimate', parts: estimateParts(c) });
  const hasTherapy = model.categories.some((c) => c.lines.some((l) => l.type === 'therapy' && ((l.actual !== null && l.actual > 0) || (l.estimate !== null && l.estimate > 0))));

  const rows = LETTERS.filter(([key]) => key !== 'therapy' || hasTherapy).map(([key, label, letter]) => {
    let act = letterAmount(model, key, basisOf);
    let est = letterAmount(model, key, estOf);
    if (key === 'retirement') {
      // After-tax retirement line plus pre-tax retirement taken out of the paycheck.
      act = { amount: (act.amount || 0) + pretax, usesEstimate: act.usesEstimate };
      est = { amount: (est.amount || 0) + pretax, usesEstimate: false };
    }
    return { key, label, letter, amount: act.amount, usesEstimate: act.usesEstimate, estimateAmount: est.amount };
  });

  const total = sumKnown(rows.map((r) => r.amount)).total;
  // Everything else: all other spending and saving. Pre-tax retirement is not in outflow, so it is left out here.
  const inOutflow = sumKnown(rows.map((r) => (r.key === 'retirement' ? (r.amount === null ? null : r.amount - pretax) : r.amount))).total;
  const everythingElse = totals.outflow === null ? null : totals.outflow - (inOutflow || 0);
  const leftOver = totals.surplus;
  for (const r of rows) {
    r.share = ratio(r.amount, base);
    r.shareOfDraftt = ratio(r.amount, total);
    r.estimateShare = ratio(r.estimateAmount, base);
    r.actualShare = r.share;
    r.change = r.actualShare === null || r.estimateShare === null ? null : r.actualShare - r.estimateShare;
  }
  const taxes = income.gross !== null && th !== null ? income.gross - income.deductions - th : null;
  return {
    rows,
    total, totalShare: ratio(total, base),
    everythingElse, everythingElseShare: ratio(everythingElse, base),
    leftOver, leftOverShare: ratio(leftOver, base),
    base: { amount: base, takeHome: th, pretaxRetirement: pretax, label: pretax > 0 ? 'take-home plus pre-tax retirement' : 'take-home' },
    // Taxes are not in the base: shown on their own, as a share of gross, only when gross is known.
    taxes: taxes === null ? null : { amount: taxes, shareOfGross: ratio(taxes, income.gross) }
  };
}

// Any monthly amount as hours of take-home pay.
export function hoursOfWork(amount, hourlyTakeHome) {
  return ratio(amount, hourlyTakeHome);
}

// Re-expresses an amount in the unit the lens toggle asks for.
export function inUnit(amount, unit, totals, income) {
  if (unit === 'percent') return ratio(amount, totals.takeHome);
  if (unit === 'hours') return hoursOfWork(amount, income.hourlyTakeHome);
  return amount;
}

const STATEMENT_GROUPS = [
  ['needs', 'Essentials (needs)'],
  ['debt', 'Debt service'],
  ['wants', 'Lifestyle (wants)'],
  ['savings', 'Savings and investing']
];

// Income by type, minus taxes and pre-tax deductions, equals take-home,
// minus expenses grouped like an income statement, equals net (surplus).
export function incomeStatement(model, totals, income) {
  const byType = {};
  let taxes = 0;
  let deductions = 0;
  for (const s of income.sources) {
    if (s.takeHomeMonthly === null) continue;
    const revenue = s.grossMonthly !== null ? s.grossMonthly : s.takeHomeMonthly;
    byType[s.type] = (byType[s.type] || 0) + revenue;
    if (s.grossMonthly !== null) {
      deductions += s.deductionsMonthly;
      taxes += s.grossMonthly - s.deductionsMonthly - s.takeHomeMonthly;
    }
  }
  const revenue = Object.values(byType).reduce((a, x) => a + x, 0);
  const groups = { needs: 0, debt: 0, wants: 0, savings: 0 };
  for (const c of model.categories) {
    const basis = totals.bases[c.id];
    for (const p of basis.parts) {
      if (c.savings) groups.savings += p.amount;
      else if (c.isDebt) groups.debt += p.amount;
      else if (p.need) groups.needs += p.amount;
      else groups.wants += p.amount;
    }
  }
  const expenses = groups.needs + groups.debt + groups.wants + groups.savings;
  const monthly = {
    revenueByType: byType, revenue, taxes, deductions,
    takeHome: revenue - taxes - deductions,
    expenses: STATEMENT_GROUPS.map(([key, label]) => ({ key, label, amount: groups[key] })),
    totalExpenses: expenses,
    net: revenue - taxes - deductions - expenses
  };
  const annual = {
    revenueByType: Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, v * 12])),
    revenue: monthly.revenue * 12, taxes: monthly.taxes * 12, deductions: monthly.deductions * 12,
    takeHome: monthly.takeHome * 12, totalExpenses: expenses * 12, net: monthly.net * 12,
    expenses: monthly.expenses.map((e) => ({ ...e, amount: e.amount * 12 }))
  };
  return { monthly, annual, hasGross: income.sources.some((s) => s.grossMonthly !== null), revenueIncludesTakeHomeOnly: income.sources.some((s) => s.grossMonthly === null && s.takeHomeMonthly !== null) };
}

// Joy vs spend per category (spend-weighted joy of rated lines), and the
// categories with the lowest joy per $100 (candidates to cut first).
export function joyLens(model, totals) {
  const rows = [];
  for (const c of model.categories) {
    if (c.savings) continue;
    const parts = totals.bases[c.id].parts.filter((p) => p.joy !== null && p.amount > 0);
    if (!parts.length) continue;
    const spend = sumKnown(parts.map((p) => p.amount)).total;
    const joy = parts.reduce((a, p) => a + p.joy * p.amount, 0) / spend;
    rows.push({ id: c.id, name: c.name, joy, spend, joyPer100: joyPer100(joy, spend) });
  }
  const lowest = [...rows].sort((a, b) => a.joyPer100 - b.joyPer100).slice(0, 3);
  return { rows, lowest };
}

// The plain reading under the DRAFTT charts: what is there, never a verdict.
export function drafttReading(d) {
  const p = (x) => Math.round(x * 100) + '%';
  if (d.totalShare === null) return 'Add take-home to see how DRAFTT sits in the budget.';
  const out = ['DRAFTT is ' + p(d.totalShare) + ' of ' + d.base.label + '.'];
  const known = d.rows.filter((r) => r.amount !== null && r.shareOfDraftt !== null);
  const big = known.slice().sort((a, b) => b.amount - a.amount)[0];
  if (big) out.push(big.label + ' is the biggest letter at ' + p(big.shareOfDraftt) + ' of DRAFTT.');
  const moved = known.filter((r) => !r.usesEstimate && r.change !== null && Math.abs(r.change) >= 0.005).sort((a, b) => Math.abs(b.change) - Math.abs(a.change))[0];
  if (moved) out.push(moved.label + "'s share went from " + p(moved.estimateShare) + ' estimated to ' + p(moved.actualShare) + ' actual.');
  const stand = known.filter((r) => r.usesEstimate).map((r) => r.label);
  if (!moved && stand.length) out.push('Estimates stand in where actuals are missing (' + stand.join(', ') + ').');
  if (d.everythingElseShare !== null && d.leftOverShare !== null) {
    out.push('Everything else is ' + p(d.everythingElseShare) + (d.leftOverShare < 0 ? ' and there is a shortfall of ' + p(-d.leftOverShare) + '.' : ' and left over is ' + p(d.leftOverShare) + '.'));
  }
  if (d.taxes) out.push('Taxes are ' + p(d.taxes.shareOfGross) + ' of gross, outside this picture.');
  return out.join(' ');
}
