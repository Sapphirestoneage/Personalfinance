// The command bar (Krug pass search, then overnight Track B): finds any account, debt, bill, income, goal, person,
// setting or screen by name and opens it; a line in plain words ("visa 2700", "add netflix 15.99 on the 12th", "go to
// plan", "mark rent happened", "undo") is read by engine/command.js and said before Enter makes it, through change(),
// so Undo takes it back. The magnifier or Ctrl/Cmd+K opens it under the header; Esc closes.
// Formatting only: the names come from the household as it stands.

import { h, ledgerHref } from './view.js';
import { parseCommand } from '../engine/command.js';
import { sharerNames } from '../engine/owed.js';

// The screens a person might look for by name, with where each opens.
const SCREENS = [
  ['Home', 'dashboard.html'], ['Guide me', 'ledger.html?guide=1'], ['Numbers', 'ledger.html'], ['Calendar', 'calendar.html'],
  ['Spending', 'spending.html'], ['Plan', 'plan.html'], ['Profile', 'profile.html'], ['Preferences', 'profile.html#/prefs'],
  ['Assumptions', 'assumptions.html'], ['One-pager', 'onepager.html'], ['Before our first call', 'before.html'],
  ['Debt', 'ledger.html#/debt'], ['Assets', 'ledger.html#/assets'], ['Taxes', 'ledger.html#/taxes'], ['Income', 'ledger.html#/income'],
  ['Needs', 'ledger.html#/needs'], ['Goals', 'ledger.html#/goals'], ['Subscriptions', 'ledger.html#/needs/subscriptions'],
  ['Still guessing', 'ledger.html#/still-guessing'], ['Extra money', 'windfall.html'], ['Builder', 'builder.html'],
  ['Protection', 'ledger.html#/protection'], ['Plan: Debt', 'plan.html#/debt'], ['Plan: Retirement and tax', 'plan.html#/retirement'], ['Plan: Protection', 'plan.html#/protection'], ['End call', 'dashboard.html#/end'],
  ['Rules', 'rules.html'], ['House defaults', 'house.html'], ['All formulas', 'math.html'], ['Where each number came from', 'plan.html#/sources']
];
// Settings a person might look for by name.
const SETTINGS = [['Dark mode or light', 'profile.html#/prefs'], ['Week starts on', 'profile.html#/prefs'], ['What Today shows', 'profile.html#/prefs'], ['Show money as hours of work', 'profile.html#/prefs'],
  ['Too small to matter', 'assumptions.html#/APP_MATERIALITY'], ['Your floor', 'calendar.html'], ['FI assumptions', 'profile.html#/goals'], ['Where to find', 'where.html'], ['House defaults', 'house.html']];
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
  // People: the household's own (their Profile) and anyone who owes them (Owed to you).
  for (const p of (spine.household && spine.household.people) || []) if (p.name) out.push({ words: p.name, kind: 'Person', href: 'profile.html' });
  for (const n of sharerNames(spine)) out.push({ words: n, kind: 'Shares bills', href: 'ledger.html#/assets/owed-to-you' });
  for (const [words, href] of SETTINGS) out.push({ words, kind: 'Setting', href });
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
// Ctrl/Cmd+K opens it from anywhere, even inside a box.
if (typeof document !== 'undefined') document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') { const b = document.querySelector('.search-wrap > button'); if (b) { e.preventDefault(); if (b.getAttribute('aria-expanded') !== 'true') b.click(); else document.getElementById('top-search')?.focus(); } return; }
  if (e.key !== '/' || (e.target && /input|textarea|select/i.test(e.target.tagName))) return;
  const b = document.querySelector('.search-wrap > button');
  if (b) { e.preventDefault(); b.click(); }
});
// What the open box holds, kept across a header redraw (null when closed).
let openNow = null;
// The magnifier button and its box. spineOf() reads the household when the box opens.
// run(cmd): the shell makes the command (a change in words, a screen, or undo).
export function searchButton(spineOf, { rulesOf = () => null, run = () => {}, today = () => new Date().toISOString().slice(0, 10) } = {}) {
  const box = h('input', { type: 'search', id: 'top-search', autocomplete: 'off', placeholder: 'Find, or type "visa 2700"', 'aria-label': 'Find or do something' });
  const list = h('ul', { class: 'search-results', role: 'listbox', 'aria-label': 'Matches' });
  const panel = h('div', { class: 'search-panel', hidden: true }, box, list);
  let index = [];
  const close = () => { panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); openNow = null; };
  let cmd = null;
  const doIt = () => { const c = cmd; close(); box.value = ''; if (c && c.kind !== 'none') run(c); };
  const show = () => {
    const hits = searchFind(index, box.value);
    try { cmd = parseCommand(spineOf(), rulesOf(), box.value, { today: today(), screens: SCREENS }); } catch { cmd = null; }
    // What Enter will do, said first (a command), then what matches by name.
    const top = cmd ? [h('li', {}, h('button', { type: 'button', class: 'search-hit search-cmd', disabled: cmd.kind === 'none', onclick: doIt }, h('span', {}, cmd.words), h('span', { class: 'search-kind' }, cmd.kind === 'none' ? '' : 'Enter')))] : [];
    list.replaceChildren(...top, ...(box.value.trim() && !hits.length && !cmd ? [h('li', { class: 'muted' }, 'Nothing by that name. Try "go to plan" or "rent 1950".')] : hits.map((x) => h('li', {}, h('a', { class: 'search-hit', href: x.href, onclick: close }, h('span', {}, x.words), h('span', { class: 'search-kind' }, x.kind))))));
  };
  box.addEventListener('input', () => { if (openNow) openNow.value = box.value; show(); });
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); btn.focus(); }
    if (e.key === 'Enter') { if (cmd && cmd.kind !== 'none') { e.preventDefault(); doIt(); return; } const first = list.querySelector('a'); if (first) { e.preventDefault(); close(); location.href = first.href; } }
  });
  const btn = h('button', { type: 'button', class: 'btn small icon-btn', 'aria-label': 'Search', 'aria-expanded': 'false', title: 'Search', onclick: () => {
    if (!panel.hidden) { close(); return; }
    open('');
  } }, magnifier());
  const open = (value) => { index = searchIndex(spineOf()); panel.hidden = false; btn.setAttribute('aria-expanded', 'true'); box.value = value; openNow = { value }; show(); box.focus({ preventScroll: true }); };
  // A page redraw (a late number arriving, a change) builds a new header: an open box stays open with what was typed.
  if (openNow) queueMicrotask(() => { if (box.isConnected) open(openNow.value); });
  return h('div', { class: 'search-wrap' }, btn, panel);
}
