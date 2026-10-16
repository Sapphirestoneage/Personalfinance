// Lenses re-read the same numbers in different ways. No new data comes in here.
// 50/30/20, DRAFTT, hours of work, the personal income statement, and joy.

import { ratio, sumKnown } from './money.js';

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

function judge(share, band) {
  if (share === null || !band) return null;
  if (band.max !== undefined && share > band.max) return 'high';
  if (band.min !== undefined && share < band.min) return 'low';
  return 'healthy';
}

// Every line of one type (Retirement, Therapy), whatever the lines are called.
function lineBasis(model, type) {
  const vals = model.categories.flatMap((c) => c.lines.filter((l) => l.type === type)).map((l) => (l.actual !== null ? l.actual : l.estimate));
  return sumKnown(vals).total;
}

// DRAFTT: Debt, Retirement, Accommodation, Food, Transportation (shares of
// take-home), plus Taxes (share of gross) and Therapy as optional extras.
export function draftt(model, totals, income, benchmarks, sourceId) {
  const src = benchmarks.sources[sourceId] || benchmarks.sources.eli;
  const th = totals.takeHome;
  const b = totals.bases;
  const tb = totals.typeBases;
  const retireLine = lineBasis(model, 'retirement');
  const retirement = (retireLine === null ? 0 : retireLine) + income.retirementDeductions;
  const therapy = lineBasis(model, 'therapy');
  const taxes = income.gross !== null && th !== null ? income.gross - income.deductions - th : null;
  const rows = [
    ['debt', 'Debt', b.debt ? b.debt.amount : null, th],
    ['retirement', 'Retirement', retirement, th],
    ['accommodation', 'Accommodation', tb.housing === undefined ? null : tb.housing, th],
    ['food', 'Food', tb.food === undefined ? null : tb.food, th],
    ['transportation', 'Transportation', tb.transport === undefined ? null : tb.transport, th],
    ['taxes', 'Taxes (of gross)', taxes, income.gross],
    ['therapy', 'Therapy', therapy, th]
  ].map(([key, label, amount, base]) => {
    const share = ratio(amount, base);
    return { key, label, amount, share, band: src.bands[key], verdict: judge(share, src.bands[key]), optional: key === 'taxes' || key === 'therapy' };
  });
  return { source: sourceId, sourceLabel: src.label, placeholder: !!src.placeholder, rows };
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
    rows.push({ id: c.id, name: c.name, joy, spend, joyPer100: joy / (spend / 100) });
  }
  const lowest = [...rows].sort((a, b) => a.joyPer100 - b.joyPer100).slice(0, 3);
  return { rows, lowest };
}
