// How a number was worked out (S-108): the inputs behind each headline number,
// read straight from the summary, so the panel and the number can never
// disagree. (Safe to spend, so far and expected went with the cash calendar to
// SLAM, S-209; the third argument is kept so callers keep their places.) No new math: every amount here is one calc made.
// `where` is a place in the app (ui/nav.js) or a field path, so each input links to its source.

// nw: a net worth at a day (networth.js), for the three net worths.
export function explain(summary, which, _retired, nw) {
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
  if (nw && (which === 'nwTotal' || which === 'nwFI')) {
    const fi = which === 'nwFI';
    const assets = nw.assets.filter((a) => !fi || a.fi).map((a) => ({ label: a.name, amount: a.amount, where: 'balances', asOf: a.asOf }));
    const debts = nw.debts.filter((d) => !fi || d.counts).map((d) => ({ label: 'Less ' + d.name, amount: d.amount === null ? null : -d.amount, where: d.debtType === 'credit-card' ? 'balances' : 'balances', asOf: d.asOf }));
    return {
      title: fi ? 'FI net worth' : 'Net worth',
      steps: [...assets, ...debts],
      result: { label: fi ? 'FI net worth' : 'Net worth', amount: fi ? nw.fi : nw.total },
      note: fi ? 'Assets that count toward FI, less every debt not tied to a home or car that does not count.' : 'Every account, less everything owed. Each at its latest balance.'
    };
  }
  if (nw && which === 'nwLocked') {
    return {
      title: 'Locked in things you use',
      steps: nw.lockedRows.map((r) => ({ label: r.name + (r.debtNames.length ? ', less ' + r.debtNames.join(', ') : ''), amount: r.equity, where: 'balances' })),
      result: { label: 'Locked in', amount: nw.locked },
      note: 'Each thing that does not count toward FI: its value less the debt it secures.'
    };
  }
  return null;
}
