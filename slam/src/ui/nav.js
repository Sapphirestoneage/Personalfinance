// Where everything lives (S-106). The menu follows the monthly loop: Today, Plan,
// Track, Review, Insights, Setup (plus Clients, and Future when it is on). Every
// section has exactly one home; this file is the only map of them, so a link,
// the Next card, a checklist "Fix", a search result, and a field path all land
// in the same place.

export const SCREENS = [['today', 'Today'], ['plan', 'Plan'], ['track', 'Track'], ['review', 'Review'], ['insights', 'Insights'], ['setup', 'Setup']];
// Old addresses (bookmarks, earlier links) still open the screen that took their place.
export const OLD_HASHES = { budget: 'today', fill: 'plan', analyze: 'insights' };

export const INSIGHT_TABS = [['where', 'Where it goes'], ['compared', 'Compared'], ['time', 'Over time'], ['cash', 'Cash'], ['you', 'You']];
export const SETUP_SECTIONS = [
  ['basics', 'Basics'], ['income', 'Income and paychecks'], ['accounts', 'Accounts'], ['debts', 'Debts'], ['bills', 'Bills and due dates'],
  ['categories', 'Categories and lines'], ['tags', 'Tags'], ['coach', 'Cushion and coach settings'], ['notes', 'Coach notes'], ['future', 'Future tools (parked)']
];

// Named destinations: [screen, ui changes, element id to scroll to].
const DESTS = {
  today: ['today', {}, null],
  gut: ['plan', { planView: 'estimates', gutOpen: true }, 'gut-card'],
  estimates: ['plan', { planView: 'estimates' }, 'estimates'],
  plan: ['plan', { planView: 'plan' }, 'sec-plan'],
  'start-month': ['plan', {}, 'start-month'],
  track: ['track', {}, null],
  cashflow: ['track', {}, null],
  log: ['track', {}, 'log-card'],
  calendar: ['track', {}, 'chart-cf-chart'],
  import: ['track', {}, 'import-card'],
  checks: ['track', {}, 'check-balances'],
  review: ['review', {}, null],
  actual: ['review', {}, 'gaps-card'],
  checklist: ['review', { closing: true }, 'checklist'],
  months: ['review', {}, 'months-review'],
  mistakes: ['review', {}, 'mistakes'],
  bridge: ['insights', { insightsTab: 'cash' }, 'chart-bridge'],
  balances: ['setup', { setupSection: 'accounts' }, 'accounts-card'],
  clients: ['clients', {}, null]
};
for (const [id] of INSIGHT_TABS) DESTS['insights:' + id] = ['insights', { insightsTab: id }, null];
for (const [id] of SETUP_SECTIONS) DESTS['setup:' + id] = ['setup', { setupSection: id }, null];
DESTS['future:eras'] = ['future', { futureTab: 'eras' }, null];
DESTS['future:next'] = ['future', { futureTab: 'next' }, null];

export function destination(where) {
  return DESTS[where] || DESTS.today;
}

// A field path to its one home. Returns [destination, ui to open on the way (expanded keys)].
export function whereFor(doc, path) {
  const [a, id, c] = path;
  const catOf = (lineId) => (doc.categories.find((x) => x.lines.some((l) => l.id === lineId)) || {}).id;
  const dream = c === 'dream' || c === 'dreamLong';
  if (a === 'gut') return ['gut', []];
  if (a === 'profile') return ['setup:basics', []];
  if (a === 'household') return ['setup:basics', id === 'filingStatus' || id === 'livingWith' ? [] : ['basics-more']];
  if (a === 'income') return ['setup:income', []];
  if (a === 'debts' || a === 'noDebts') return ['setup:debts', []];
  if (a === 'balances') return ['balances', []];
  if (a === 'transactions') return ['log', []];
  if (a === 'cashflow') return ['setup:coach', []];
  if (a === 'nextStage') return ['future:next', []];
  if (a === 'eras') return ['future:eras', []];
  if ((a === 'categories' || a === 'line') && dream) return ['future:eras', []];
  if (a === 'categories' || a === 'blindRounds') return ['estimates', []];
  if (a === 'line' && c === 'actual') return ['actual', ['rv-cat:' + catOf(id)]];
  if (a === 'line' && c === 'estimate') return ['estimates', []];
  if (a === 'line' && (c === 'dueDay' || c === 'dueMonth')) return ['setup:bills', []];
  if (a === 'line') return ['setup:categories', ['line:' + id]];
  return ['estimates', []];
}

export function screenLabel(id) {
  if (id === 'clients') return 'Clients';
  if (id === 'future') return 'Future';
  return (SCREENS.find(([k]) => k === id) || [id, id])[1];
}

// Every chart and card worth finding by name (S-108 search): [anchor id, name, where it lives].
export const CHARTS = [
  ['cash-strip', 'Cash, next 30 days', 'today'],
  ['chart-cf-chart', 'Cash by day (the calendar)', 'track'], ['chart-cf-paylater', 'Bills that land before the paycheck', 'track'],
  ['chart-cf-list', 'Cash by date (list)', 'track'], ['chart-cf-grid', 'Month grid', 'track'], ['chart-cf-sofar', 'This month so far', 'track'],
  ['chart-sankey', 'Where the money goes', 'insights:where'], ['chart-donut', 'Spending by category', 'insights:where'], ['chart-nws', 'Needs, wants, savings', 'insights:where'],
  ['chart-fv', 'Fixed vs variable', 'insights:where'], ['chart-types', 'Spending by type', 'insights:where'], ['chart-tags', 'By tag', 'insights:where'],
  ['chart-gauges', 'Housing and savings rate', 'insights:where'],
  ['budget-table', 'Category by category (the budget table)', 'insights:compared'], ['chart-eda', 'Estimate, plan, actual (bars)', 'insights:compared'],
  ['chart-overlap', 'Budget vs actual', 'insights:compared'], ['chart-variance', 'Over and under the estimate', 'insights:compared'],
  ['chart-accuracy', 'Accuracy (actual / estimate)', 'insights:compared'], ['chart-gut', 'Gut check', 'insights:compared'], ['culprits', 'Biggest culprits', 'insights:compared'],
  ['chart-completion', 'How filled in is the picture', 'insights:compared'], ['rough-list', 'Rough and unknown', 'insights:compared'],
  ['chart-vbm', 'Variance by month', 'insights:time'], ['chart-trend-series', 'By month (category, line, or merchant)', 'insights:time'],
  ['chart-trend-heat', 'Categories by month', 'insights:time'], ['chart-trend-mom', 'Month over month', 'insights:time'], ['chart-trend-pacing', 'Pacing', 'insights:time'],
  ['chart-trend-dom', 'Spending by day of the month', 'insights:time'], ['trend-stats', 'Trends in one line each', 'insights:time'],
  ['chart-estimate-history', 'When the estimate changed', 'insights:time'], ['chart-pareto', '80/20', 'insights:time'],
  ['chart-bridge', 'Budget to cash (the bridge)', 'insights:cash'], ['chart-cf-forecast', 'Forecast check', 'insights:cash'], ['chart-tx-top', 'Top 5 merchants', 'insights:cash'],
  ['chart-tx-week', 'Spending by weekday', 'insights:cash'], ['chart-tx-size', 'Small and frequent vs big and rare', 'insights:cash'], ['chart-tx-subs', 'Subscriptions', 'insights:cash'],
  ['chart-tx-findings', 'What the transactions show', 'insights:cash'],
  ['chart-draftt', 'DRAFTT', 'insights:you'], ['chart-joy', 'Joy vs spend', 'insights:you'], ['chart-stress', 'Satisfaction and stress', 'insights:you'],
  ['chart-mistake', 'Mistake cost', 'insights:you'], ['chart-statement', 'Personal income statement', 'insights:you'], ['extras', 'Also worth knowing', 'insights:you'],
  ['chart-cf-whatif', 'What if a bill moved?', 'setup:bills']
];

// The name of what a field path points at, for the breadcrumb (S-108).
export function nameFor(doc, path) {
  const [a, id] = path;
  const line = (x) => doc.categories.flatMap((c) => c.lines).find((l) => l.id === x);
  if (a === 'line') return (line(id) || {}).name || null;
  if (a === 'categories') return (doc.categories.find((c) => c.id === id) || {}).name || null;
  if (a === 'income') return (doc.income.find((i) => i.id === id) || {}).label || null;
  if (a === 'debts') return (doc.debts.find((d) => d.id === id) || {}).label || null;
  if (a === 'gut') return 'Gut number';
  return null;
}
