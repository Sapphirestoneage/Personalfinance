// How a number was worked out (S-108): the inputs behind each headline number,
// read straight from the summary and the cash calendar, so the panel and the
// number can never disagree. No new math: every amount here is one calc made.
// A step's `where` is a place in the app (ui/nav.js) and its `path` a field path, so each input links to its source.
// No imports. Reads what buildSummary (summary.js), monthOutlook and cashCalendar (calendar.js)
// and the net worth engine (networth.js) return. Dollars a month, except net worth (dollars on a day).

/**
 * The steps behind one headline number, for the "how was this worked out" panel.
 * @param {object} summary what buildSummary returns (summary.js).
 * @param {string} which 'takeHome', 'spending', 'soFar', 'expected', 'surplus', 'savingsRate', 'safeToSpend', 'nwTotal', 'nwFI' or 'nwLocked'.
 * @param {?object} cal monthOutlook for soFar and expected, cashCalendar for safeToSpend (both calendar.js); otherwise unused.
 * @param {?object} nw a net worth at a day (networth.js), for the three net worths.
 * @returns {?{title: string, steps: Array<{label: string, amount: number|null, where?: string, path?: string[], open?: string, asOf?: string}>, result: object, note: string}}
 *   dollars a month (net worth: dollars on a day; savingsRate: a ratio 0 to 1); a step links by where (a place in nav.js) or
 *   path (a field), and a step with neither is plain text; null for an unknown `which` or a missing cal or nw.
 */
export function explain(summary, which, cal, nw) {
  const t = summary.totals;
  const inc = summary.income;
  if (which === 'takeHome') {
    // A source with no take-home yet is left out of the steps, never shown as $0.
    return {
      title: 'Take-home, a month',
      steps: inc.sources.filter((s) => s.takeHomeMonthly !== null).map((s) => ({ label: s.label, amount: s.takeHomeMonthly, path: ['income', s.id, 'takeHome'] })),
      result: { label: 'Take-home', amount: t.takeHome },
      note: inc.takeHomeIsGuess ? 'Some take-home is worked out from gross pay (a guess; state tax not included).' : 'Each source\'s take-home, a month.'
    };
  }
  if (which === 'spending') {
    // Spending is each non-savings category's basis (the actual, else the estimate, totals.js); "doesn't apply"
    // and blank rows are left out. A debt row points at 'setup:debts', which nav.js routes to Credit and debt
    // on the Accounts tab, where the debt itself is entered.
    return {
      title: 'Spending, a month',
      steps: summary.rows.filter((r) => !r.savings && !r.notForMe && r.basis !== null).map((r) => ({ label: r.name + (r.basisFrom === 'estimate' ? ' (estimate)' : ''), amount: r.basis, where: r.isDebt ? 'setup:debts' : r.basisFrom === 'estimate' ? 'estimates' : 'actual', open: r.isDebt ? null : 'rv-cat:' + r.id })),
      result: { label: 'Spending', amount: t.spending },
      note: t.basisUsesEstimate.length ? 'Actuals, with estimates standing in for ' + t.basisUsesEstimate.join(', ') + '.' : 'Actuals for every category.'
    };
  }
  // So far and expected by month end (S-128): `cal` is the month's outlook (calendar.js monthOutlook).
  if (which === 'soFar' && cal) {
    return {
      title: 'So far this month',
      steps: [{ label: 'Income logged', amount: cal.incomeSoFar, where: 'log' }, { label: 'Spending logged', amount: -cal.spentSoFar, where: 'log' }],
      result: { label: 'So far', amount: cal.soFar, signed: true },
      note: 'Only money that has arrived or left, from the log, up to today.'
    };
  }
  if (which === 'expected' && cal) {
    return {
      title: 'Expected by month end',
      steps: [{ label: 'So far', amount: cal.soFar },
        ...cal.items.map((i) => ({ label: i.name + ' (' + i.date.slice(5) + ')', amount: i.amount, where: 'calendar' })),
        ...cal.rest.filter((u) => u.left).map((u) => ({ label: u.name + ': rest of the plan', amount: -u.left, where: 'calendar' }))],
      result: { label: 'Expected by month end', amount: cal.expected, signed: true },
      note: 'So far, plus paychecks and bills still to come on the calendar, less the rest of the plan for lines not yet spent.' +
        (cal.noPayDate.length ? ' No pay date yet for ' + cal.noPayDate.join(', ') + ', so none of its pay is counted.' : '')
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
    // Pre-tax retirement never reaches take-home, so it is added to both the savings and the base (totals.js).
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
  if (nw && (which === 'nwTotal' || which === 'nwFI')) {
    const fi = which === 'nwFI';
    // FI counts only assets that could fund your life, and only debts not secured by a home or car; networth.js sets both flags.
    const assets = nw.assets.filter((a) => !fi || a.fi).map((a) => ({ label: a.name, amount: a.amount, where: 'balances', asOf: a.asOf }));
    // Cards and loans alike point at 'balances' (the cash card on the Accounts tab): with no field path on the step,
    // how.js cannot send a debt on to its own row under Credit and debt.
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
