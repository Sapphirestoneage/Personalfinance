// The command bar (Krug pass search, then overnight Track B): finds any account, debt, bill, income, goal, person,
// setting or screen by name and opens it; a line in plain words ("visa 2700", "add netflix 15.99 on the 12th", "go to
// plan", "mark rent happened", "undo", "amex gold 2000 24%") is read by engine/command.js and said before Enter makes
// it, through change(), so Undo takes it back. A box in the header (S-285); "/" or Ctrl/Cmd+K puts the cursor in it.
// Formatting only: the names come from the household as it stands.

import { h, ledgerHref } from './view.js';
import { parseCommand } from '../engine/command.js';
import { sharerNames } from '../engine/owed.js';
import { ledgerRows } from '../engine/ledger.js';

// The screens a person might look for by name, with where each opens.
const SCREENS = [
  ['Home', 'dashboard.html'], ['Guide me', 'ledger.html?guide=1'], ['Numbers', 'ledger.html'], ['Calendar', 'calendar.html'],
  ['Spending', 'spending.html'], ['Plan', 'plan.html'], ['Profile', 'profile.html'], ['Preferences', 'profile.html#/prefs'],
  ['Assumptions', 'assumptions.html'], ['One-pager', 'onepager.html'], ['Before our first call', 'before.html'],
  ['Debt', 'ledger.html#/debt'], ['Assets', 'ledger.html#/assets'], ['Taxes', 'ledger.html#/taxes'], ['Income', 'ledger.html#/income'],
  ['Needs', 'ledger.html#/needs'], ['Goals', 'ledger.html#/goals'], ['Subscriptions', 'ledger.html#/needs/subscriptions'],
  ['Still guessing', 'ledger.html#/still-guessing'], ['Extra money', 'windfall.html'], ['Builder', 'builder.html'],
  ['Protection', 'ledger.html#/protection'], ['Plan: Debt', 'plan.html#/debt'], ['Plan: Retirement', 'plan.html#/retirement'], ['When can I stop working?', 'plan.html#/retirement'], ['Pay off my debt', 'plan.html#/debt'], ['Can I afford this?', 'spending.html#/ask'], ['Plan: Protection', 'plan.html#/protection'], ['End call', 'dashboard.html#/end'],
  ['Rules', 'rules.html'], ['House defaults', 'house.html'], ['All formulas', 'math.html'], ['Where each number came from', 'plan.html#/sources']
];
// Settings a person might look for by name.
const SETTINGS = [['Dark mode or light', 'profile.html#/prefs'], ['Week starts on', 'profile.html#/prefs'], ['What Home shows', 'profile.html#/prefs'], ['Show money as hours of work', 'profile.html#/prefs'],
  ['Too small to matter', 'assumptions.html#/APP_MATERIALITY'], ['Your floor', 'calendar.html'], ['FI assumptions', 'profile.html#/goals'], ['Where to find', 'where.html'], ['House defaults', 'house.html']];
const nameOf = (x) => (x && x.name && typeof x.name === 'object' ? x.name.value : x && x.name) || (x && x.label) || null;

// The section of Numbers a household path sits in, for the "This section" chip.
const SECTION_OF = { debts: 'debt', accounts: 'assets', expenses: 'needs', income: 'income', goals: 'goals', policies: 'protection', household: 'profile', taxYears: 'income' };
const sectionOfHref = (href) => { const m = href.match(/^ledger\.html#\/([\w-]+)/); return m ? m[1] : null; };
// Everything findable (S-285: clients and every field too): [{ words, kind, href | pick, section, mine }].
export function searchIndex(spine, { clients = [] } = {}) {
  const out = SCREENS.map(([words, href]) => ({ words, kind: 'Screen', href, page: href.split('#')[0], section: sectionOfHref(href) }));
  const item = (kind, coll, path) => ({ kind, href: ledgerHref(path), page: 'ledger.html', section: SECTION_OF[coll], mine: true });
  const add = (list, kind, coll, field) => { for (const x of list || []) { const n = nameOf(x); if (n) out.push({ words: n, ...item(kind, coll, coll + '.' + x.id + '.' + field(x)) }); } };
  add(spine.accounts, 'Account', 'accounts', () => 'balance');
  add(spine.debts, 'Debt', 'debts', () => 'balance');
  add(spine.expenses, 'Bill', 'expenses', () => 'amount');
  add(spine.income, 'Income', 'income', () => 'amount');
  add(spine.goals, 'Goal', 'goals', (g) => (g.target ? 'target' : 'annualSpending'));
  // Every field on every item ("Visa: interest rate"), so a field opens its own screen with its box open.
  for (const r of ledgerRows(spine).flatMap((g) => g.rows)) if (r.label && r.label.includes(': ')) out.push({ words: r.label, ...item('Field', r.path.split('.')[0], r.path) });
  // People: the household's own (their Profile) and anyone who owes them (Owed to you).
  for (const p of (spine.household && spine.household.people) || []) if (p.name) out.push({ words: p.name, kind: 'Person', href: 'profile.html', page: 'profile.html', mine: true });
  for (const n of sharerNames(spine)) out.push({ words: n, kind: 'Shares bills', href: 'ledger.html#/assets/owed-to-you', page: 'ledger.html', section: 'assets', mine: true });
  for (const [words, href] of SETTINGS) out.push({ words, kind: 'Setting', href, page: href.split('#')[0] });
  // Other clients: picking one switches to them.
  for (const c of clients) out.push({ words: c.name, kind: 'Client', pick: c.id });
  return out;
}
// Every match, names that start with the words first. The box shows 8; past 8, the scope chips appear.
export function searchFind(index, q) {
  const t = q.trim().toLowerCase();
  if (!t) return [];
  const starts = index.filter((x) => x.words.toLowerCase().startsWith(t));
  const has = index.filter((x) => !starts.includes(x) && x.words.toLowerCase().includes(t));
  // Then the words in any order ("visa rate" finds "Visa: interest rate").
  const ws = t.split(/\s+/);
  const every = ws.length > 1 ? index.filter((x) => !starts.includes(x) && !has.includes(x) && ws.every((w) => x.words.toLowerCase().includes(w))) : [];
  return [...starts, ...has, ...every];
}
export const SHOWN = 8;
// The two scopes, offered only when there are more than 8 matches: this client's own things, or this section.
export function scoped(hits, scope, here) {
  if (scope === 'client') return hits.filter((x) => x.mine);
  if (scope === 'section') return hits.filter((x) => x.page === here.page && (!here.section || x.section === here.section));
  return hits;
}

// A magnifier, drawn as an outline in the text color.
function magnifier() {
  const NS = 'http://www.w3.org/2000/svg', el = (tag, at) => { const x = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(at)) x.setAttribute(k, v); return x; };
  const svg = el('svg', { viewBox: '0 0 24 24', width: '18', height: '18', 'aria-hidden': 'true', focusable: 'false', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' });
  svg.append(el('circle', { cx: '11', cy: '11', r: '6' }), el('line', { x1: '16', y1: '16', x2: '21', y2: '21' }));
  return svg;
}
// "/" puts the cursor in the header search on any page with one; Ctrl/Cmd+K too, even from inside a box.
if (typeof document !== 'undefined') document.addEventListener('keydown', (e) => {
  const box = document.getElementById('top-search');
  if (!box) return;
  if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') { e.preventDefault(); box.focus(); box.select(); return; }
  if (e.key !== '/' || (e.target && /input|textarea|select/i.test(e.target.tagName))) return;
  e.preventDefault(); box.focus();
});
// Clicking anywhere else closes the list (what was typed stays).
if (typeof document !== 'undefined') document.addEventListener('pointerdown', (e) => {
  const wrap = document.querySelector('.site-head .search-wrap');
  if (wrap && !wrap.contains(e.target)) { const p = wrap.querySelector('.search-panel'); if (p) p.hidden = true; document.getElementById('top-search')?.setAttribute('aria-expanded', 'false'); }
});
// The libraries quick add picks from (cards, funds, bills people have), loaded the first time the box is used.
let lib = null;
const loadLibrary = (spine) => import('./libraries.js').then((m) => { lib = { cards: m.LIB.cards && m.LIB.cards.cards, funds: m.LIB.funds, expenses: m.expenseEntries(spine).filter((e) => e.from === 'library') }; }).catch(() => {});
// What the box holds, kept across a header redraw (null when closed).
let openNow = null;
// The search box (S-285): always there, its label the icon. spineOf() reads the household when typing starts.
// run(cmd): the shell makes the command (a change in words, a screen, or undo). library: what quick add picks from.
export function searchButton(spineOf, { rulesOf = () => null, run = () => {}, today = () => new Date().toISOString().slice(0, 10), clients = () => [], pickClient = () => {} } = {}) {
  const box = h('input', { type: 'search', id: 'top-search', autocomplete: 'off', placeholder: 'Search or add, e.g. rent 2400', 'aria-label': 'Search or add', role: 'combobox', 'aria-expanded': 'false', 'aria-controls': 'search-results' });
  // On a phone the box is about 100px of text, so the placeholder is two short words (the example would be cut mid-word).
  try { const mq = matchMedia('(max-width: 479px)'); const fit = () => { box.placeholder = mq.matches ? 'Find or add' : 'Search or add, e.g. rent 2400'; }; fit(); mq.addEventListener('change', fit); } catch { /* no matchMedia: the full placeholder stays */ }
  const list = h('ul', { class: 'search-results', id: 'search-results', role: 'listbox', 'aria-label': 'Matches' });
  const chips = h('div', { class: 'search-scope', role: 'group', 'aria-label': 'Search in' });
  const panel = h('div', { class: 'search-panel', hidden: true }, chips, list);
  let index = [], scope = 'all', cmd = null, shown = [];
  const here = () => ({ page: location.pathname.split('/').pop() || 'dashboard.html', section: sectionOfHref('ledger.html' + location.hash) });
  const close = () => { panel.hidden = true; box.setAttribute('aria-expanded', 'false'); openNow = null; };
  const doIt = () => { const c = cmd; close(); box.value = ''; if (c && c.kind !== 'none') run(c); };
  const follow = (x) => { close(); box.value = ''; if (x.pick) pickClient(x.pick); else location.href = x.href; };
  const chip = (id, words) => h('button', { type: 'button', class: 'btn small chip-btn', 'aria-pressed': scope === id ? 'true' : 'false', onclick: () => { scope = scope === id ? 'all' : id; show(); box.focus(); } }, words);
  const show = () => {
    if (!box.value.trim()) { close(); return; }
    panel.hidden = false; box.setAttribute('aria-expanded', 'true');
    const all = searchFind(index, box.value);
    const hits = scoped(all, scope, here());
    shown = hits.slice(0, SHOWN);
    try { cmd = parseCommand(spineOf(), rulesOf(), box.value, { today: today(), screens: SCREENS, library: lib }); } catch { cmd = null; }
    chips.replaceChildren(...(all.length > SHOWN ? [chip('client', 'This client'), chip('section', 'This section')] : []));
    // What Enter will do, said first (a command or a new item), then what matches by name.
    const top = cmd ? [h('li', {}, h('button', { type: 'button', class: 'search-hit search-cmd', disabled: cmd.kind === 'none', onclick: doIt }, h('span', {}, cmd.words), h('span', { class: 'search-kind' }, cmd.kind === 'none' ? '' : 'Enter')))] : [];
    list.replaceChildren(...top, ...(!shown.length && !cmd ? [h('li', { class: 'muted' }, 'Nothing by that name. Try "rent 2400" or "go to plan".')] : shown.map((x) => h('li', {}, x.pick
      ? h('button', { type: 'button', class: 'search-hit', onclick: () => follow(x) }, h('span', {}, x.words), h('span', { class: 'search-kind' }, x.kind))
      : h('a', { class: 'search-hit', href: x.href, onclick: close }, h('span', {}, x.words), h('span', { class: 'search-kind' }, x.kind))))),
      ...(hits.length > SHOWN ? [h('li', { class: 'muted search-more' }, (hits.length - SHOWN) + ' more: type more of the name' + (all.length > SHOWN && scope === 'all' ? ', or pick where to look' : ''))] : []));
  };
  box.addEventListener('focus', () => { index = searchIndex(spineOf(), { clients: clients() }); if (!lib) loadLibrary(spineOf()).then(() => { if (box.value.trim()) show(); }); });
  box.addEventListener('input', () => { openNow = { value: box.value }; show(); });
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); box.value = ''; box.blur(); }
    if (e.key === 'ArrowDown') { const f = list.querySelector('a, button:not([disabled])'); if (f) { e.preventDefault(); f.focus(); } }
    if (e.key === 'Enter') { if (cmd && cmd.kind !== 'none') { e.preventDefault(); doIt(); return; } if (shown[0]) { e.preventDefault(); follow(shown[0]); } }
  });
  list.addEventListener('keydown', (e) => {
    const items = [...list.querySelectorAll('a, button:not([disabled])')], i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' && i < items.length - 1) { e.preventDefault(); items[i + 1].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); (i > 0 ? items[i - 1] : box).focus(); }
    if (e.key === 'Escape') { e.preventDefault(); close(); box.focus(); }
  });
  const wrap = h('div', { class: 'search-wrap' }, h('label', { class: 'search-box' }, h('span', { class: 'search-icon' }, magnifier()), box), panel);
  // A page redraw (a late number arriving, a change) builds a new header: what was typed stays, the list open.
  if (openNow) queueMicrotask(() => { if (box.isConnected && openNow) { box.value = openNow.value; index = searchIndex(spineOf(), { clients: clients() }); show(); box.focus({ preventScroll: true }); } });
  return wrap;
}
