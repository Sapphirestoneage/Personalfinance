// How a number was worked out (S-108): the inputs behind each headline number,
// read straight from the summary and the cash calendar, so the panel and the
// number can never disagree. No new math: every amount here is one calc made.
// `where` is a place in the app (ui/nav.js) or a field path, so each input links to its source.

export function explain(summary, which, cal) {
  const t = summary.totals;
  const inc = summary.income;
  if (which === 'takeHome') {
    return {
      title: 'Take-home, a month',
      steps: inc.sources.filter((s) => s.takeHomeMonthly !== null).map((s) => ({ label: s.label, amount: s.takeHomeMonthly, path: ['income', s.id, 'takeHome'] })),
      result: { label: 'Take-home', amount: t.takeHome },
      note: inc.takeHomeIsGuess ? 'Some take-home is worked out from gross pay (a guess; state tax not included).' : 'Each source\'s take-home, a month.'
    };
  }
  if (which === 'spending') {
    return {
      title: 'Spending, a month',
      steps: summary.rows.filter((r) => !r.savings && !r.notForMe && r.basis !== null).map((r) => ({ label: r.name + (r.basisFrom === 'estimate' ? ' (estimate)' : ''), amount: r.basis, where: r.isDebt ? 'setup:debts' : r.basisFrom === 'estimate' ? 'estimates' : 'actual', open: r.isDebt ? null : 'rv-cat:' + r.id })),
      result: { label: 'Spending', amount: t.spending },
      note: t.basisUsesEstimate.length ? 'Actuals, with estimates standing in for ' + t.basisUsesEstimate.join(', ') + '.' : 'Actuals for every category.'
    };
  }
  if (which === 'surplus') {
    return {
      title: t.surplus !== null && t.surplus < 0 ? 'Shortfall, a month' : 'Surplus, a month',
      steps: [
        { label: 'Take-home', amount: t.takeHome, where: 'setup:income' },
        { label: 'Less spending', amount: t.spending === null ? null : -t.spending, where: 'actual' },
        { label: 'Less savings', amount: t.savings === null ? null : -t.savings, where: 'actual' }
      ],
      result: { label: t.surplus !== null && t.surplus < 0 ? 'Shortfall' : 'Surplus', amount: t.surplus, signed: true },
      note: 'Take-home less spending and savings.'
    };
  }
  if (which === 'savingsRate') {
    return {
      title: 'Savings rate',
      steps: [
        { label: 'Savings, a month', amount: t.savings, where: 'actual', open: 'rv-cat:savings' },
        { label: 'Retirement taken out of the paycheck', amount: inc.retirementDeductions, where: 'setup:income' },
        { label: 'Take-home', amount: t.takeHome, where: 'setup:income' }
      ],
      result: { label: 'Savings rate', amount: t.savingsRate, pct: true },
      note: '(savings + retirement from the paycheck) / (take-home + retirement from the paycheck).'
    };
  }
  if (which === 'safeToSpend' && cal) {
    return {
      title: 'Safe to spend',
      steps: [
        { label: 'In checking today', amount: cal.todayCash, where: 'checks' },
        { label: 'Lowest point ahead' + (cal.lowest ? ' (' + cal.lowest.date + ')' : ''), amount: cal.lowest ? cal.lowest.amount : null, where: 'calendar' },
        { label: 'Less your cushion', amount: -cal.cushion, where: 'setup:coach' }
      ],
      result: { label: 'Safe to spend', amount: cal.safeToSpend },
      note: 'The lower of today\'s checking and the lowest point ahead less the cushion, never below $0.'
    };
  }
  return null;
}
