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
