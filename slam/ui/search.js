// Search in the header (Krug pass): finds any account, debt, bill, income, goal or screen by name and opens it.
// The magnifier opens a box under the header; typing lists what matches, Enter opens the first, Esc closes.
// Formatting only: the names come from the household as it stands.

import { h, ledgerHref } from './view.js';

// The screens a person might look for by name, with where each opens.
const SCREENS = [
  ['Today', 'dashboard.html'], ['Session', 'session.html'], ['My numbers', 'ledger.html'], ['Calendar', 'calendar.html'],
  ['Spending', 'spending.html'], ['Plan', 'plan.html'], ['Profile', 'profile.html'], ['Preferences', 'profile.html#/prefs'],
  ['Assumptions', 'assumptions.html'], ['One-pager', 'onepager.html'], ['Before our first call', 'before.html'],
  ['Debt', 'ledger.html#/debt'], ['Assets', 'ledger.html#/assets'], ['Taxes', 'ledger.html#/taxes'], ['Income', 'ledger.html#/income'],
  ['Needs', 'ledger.html#/needs'], ['Goals', 'ledger.html#/goals'], ['Subscriptions', 'ledger.html#/needs/subscriptions'],
  ['Still guessing', 'ledger.html#/still-guessing'], ['Got extra money?', 'windfall.html'], ['Builder', 'builder.html']
];
const nameOf = (x) => (x && x.name && typeof x.name === 'object' ? x.name.value : x && x.name) || (x && x.label) || null;

// Everything findable: [{ words, kind, href }].
export function searchIndex(spine) {
  const out = SCREENS.map(([words, href]) => ({ words, kind: 'Screen', href }));
  const add = (list, kind, field) => { for (const x of list || []) { const n = nameOf(x); if (n) out.push({ words: n, kind, href: ledgerHref(field(x)) }); } };
  add(spine.accounts, 'Account', (a) => 'accounts.' + a.id + '.balance');
  add(spine.debts, 'Debt', (d) => 'debts.' + d.id + '.balance');
  add(spine.expenses, 'Bill', (e) => 'expenses.' + e.id + '.amount');
  add(spine.income, 'Income', (i) => 'income.' + i.id + '.amount');
  add(spine.goals, 'Goal', (g) => 'goals.' + g.id + '.' + (g.target ? 'target' : 'annualSpending'));
  return out;
}
export function searchFind(index, q) {
  const t = q.trim().toLowerCase();
  if (!t) return [];
  const starts = index.filter((x) => x.words.toLowerCase().startsWith(t));
  const has = index.filter((x) => !starts.includes(x) && x.words.toLowerCase().includes(t));
  return [...starts, ...has].slice(0, 8);
}

// A magnifier, drawn as an outline in the text color.
function magnifier() {
  const NS = 'http://www.w3.org/2000/svg', el = (tag, at) => { const x = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(at)) x.setAttribute(k, v); return x; };
  const svg = el('svg', { viewBox: '0 0 24 24', width: '18', height: '18', 'aria-hidden': 'true', focusable: 'false', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' });
  svg.append(el('circle', { cx: '11', cy: '11', r: '6' }), el('line', { x1: '16', y1: '16', x2: '21', y2: '21' }));
  return svg;
}
// "/" opens the header search on any page with one (S-168, now in the header).
if (typeof document !== 'undefined') document.addEventListener('keydown', (e) => {
  if (e.key !== '/' || (e.target && /input|textarea|select/i.test(e.target.tagName))) return;
  const b = document.querySelector('.search-wrap > button');
  if (b) { e.preventDefault(); b.click(); }
});
// The magnifier button and its box. spineOf() reads the household when the box opens.
export function searchButton(spineOf) {
  const box = h('input', { type: 'search', id: 'top-search', autocomplete: 'off', placeholder: 'Find an account, bill or screen', 'aria-label': 'Search' });
  const list = h('ul', { class: 'search-results', role: 'listbox', 'aria-label': 'Matches' });
  const panel = h('div', { class: 'search-panel', hidden: true }, box, list);
  let index = [];
  const close = () => { panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
  const show = () => {
    const hits = searchFind(index, box.value);
    list.replaceChildren(...(box.value.trim() && !hits.length ? [h('li', { class: 'muted' }, 'Nothing by that name.')] : hits.map((x) => h('li', {}, h('a', { class: 'search-hit', href: x.href, onclick: close }, h('span', {}, x.words), h('span', { class: 'search-kind' }, x.kind))))));
  };
  box.addEventListener('input', show);
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); btn.focus(); }
    if (e.key === 'Enter') { const first = list.querySelector('a'); if (first) { e.preventDefault(); close(); location.href = first.href; } }
  });
  const btn = h('button', { type: 'button', class: 'btn small icon-btn', 'aria-label': 'Search', 'aria-expanded': 'false', title: 'Search', onclick: () => {
    if (!panel.hidden) { close(); return; }
    index = searchIndex(spineOf()); panel.hidden = false; btn.setAttribute('aria-expanded', 'true'); box.value = ''; show(); box.focus({ preventScroll: true });
  } }, magnifier());
  return h('div', { class: 'search-wrap' }, btn, panel);
}
