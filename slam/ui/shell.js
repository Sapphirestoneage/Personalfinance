// The shell (S-230): what every page shares, so a page only draws its own screen.
// - Seven tabs (Profile joined on 2026-10-27), the same on every page: at the bottom on a phone, at the top on a computer. Builder pages light none.
// - The header: the title, whose numbers these are, the page's own buttons, then Undo and Redo.
// - Screen by screen: a deeper level (page.html#/debt/credit-cards/amex-blue) is its own screen and a real history
//   entry, with a trail and a Back button. Back, the trail and the browser's back all walk the same entries, and
//   coming back to a screen restores its scroll and what the page kept for it (keep/kept). A deep link gets the
//   levels above it as entries too, so Back always goes up one level.
// - One household history for every page: change() saves the household, records the change in words, redraws and
//   shows the bar ("Rent changed to $1,000. Undo"). The last 25 changes are kept in this browser (household.js).
//   A change outside the household (a rule, a saved scenario: say(words, undo, redo)) is the latest step until the
//   next change: the header's Undo and Ctrl/Cmd+Z undo it first, on Builder pages too.
// - A tab tapped opens its page as it was left in this browser tab: the screen, its scroll and what was open.
// Formatting only: the page's render reads the engines; nothing here figures a number.

import { mountPage, whoseMenu } from './page.js';
import { searchButton } from './search.js';
import { loadAll, openHistory, keepHistory, HISTORY_STEPS, HOUSEHOLD_KEYS, yours } from './household.js';
import { applyDefaults } from '../engine/defaults.js';
import { withClient } from '../engine/assumptions.js';
import { applyPrefs, prefs } from './prefs.js';
import { setDisplay } from './view.js';
import { summarize } from '../engine/summary.js';
import { realHourlyWage } from '../engine/plan.js';
import { savedPerDay } from '../engine/money-as.js';
import { commit, undo, redo, canUndo, canRedo, undoLabel, redoLabel } from '../engine/edits.js';
import { h, said, sentence as end } from './view.js';

// The six tabs, in order: [id, words, page].
export const TABS = [
  ['today', 'Today', 'dashboard.html'],
  ['session', 'Session', 'session.html'],
  ['numbers', 'My numbers', 'ledger.html'],
  ['calendar', 'Calendar', 'calendar.html'],
  ['spending', 'Spending', 'spending.html'],
  ['plan', 'Plan', 'plan.html']
];
// Profile is not a tab (bug sweep): it opens from the household name in every header, a person icon and the name.
// My numbers opens at a section, and deeper, by these words: numbersHref('debt', 'credit-cards').
export const SECTIONS = { needs: 'Needs', debt: 'Debt', assets: 'Assets', taxes: 'Taxes', income: 'Income', goals: 'Goals' };
export const numbersHref = (...levels) => 'ledger.html' + hashOf(levels);

// The words for a change (view.js): said.changed('Rent', '$1,000') is "Rent changed to $1,000".
export { said };

// ---------------------------------------------------------------- levels and history entries
const decode = (s) => { try { return decodeURIComponent(s); } catch { return s; } };
const levelsOf = (hash) => (String(hash).startsWith('#/') ? String(hash).slice(2).split('/').filter(Boolean).map(decode) : []);
function hashOf(levels) { return levels.length ? '#/' + levels.map(encodeURIComponent).join('/') : ''; }
const toLevels = (x) => (Array.isArray(x) ? x.map(String) : levelsOf('#/' + String(x || '').replace(/^#?\/?/, '')));
// This entry's own part of history.state: { levels, scroll, page }. Anything else in the state is left alone.
const entry = () => (history.state && history.state.shell) || null;
const stateWith = (shell) => ({ ...(history.state || {}), shell });
// A new entry; was: the scroll and what was open when a tab reopens the page where it was left.
const fresh = (levels, was = {}) => ({ shell: { levels, scroll: 0, page: {}, ...was } });
const levelsNow = () => (entry() ? entry().levels : levelsOf(location.hash));
const rootUrl = () => location.pathname + location.search;

// ---------------------------------------------------------------- what the shell holds
const app = document.getElementById('app');
let headLevels = [], headNames = [];
let opts = null, hist = null, rules = null, source = null, institutions = null, notice = null, baseTitle = '';
let pending = null, scrollTimer = null, barTimer = null, reloadTimer = null, onBar = null, drawn = '', headTitle = '';
// A step outside the household (say with an undo): { words, undo, redo, done }. done false: undone, and redo can bring
// it back. The next household change, undo or redo clears it.
let side = null;
// A scroll asked for before the screen was tall enough (its list came later): kept until the page says its content
// landed (restoreScroll), or the person scrolls.
let wantY = null;
const topEl = h('div', { class: 'screen-top' });
const headEl = h('header', { class: 'top' });
const screenEl = h('div', { class: 'screen' });
const barText = h('span', { class: 'undo-text' });
const barBtn = h('button', { type: 'button', class: 'btn small', onclick: () => onBar && onBar() }, 'Undo');
const barEl = h('div', { class: 'undo-bar is-idle', role: 'status', 'aria-live': 'polite' }, barText, barBtn);

// A level's words: the page's name(levels, ctx), else the level itself in words. Null: that level is not there.
function nameOf(levels, ctx) {
  if (!levels.length) return opts.title;
  if (opts.name) return opts.name(levels, ctx) || null;
  const w = levels[levels.length - 1].replace(/-/g, ' ');
  return w.charAt(0).toUpperCase() + w.slice(1);
}
// The rules a page reads: the house defaults with this client's own assumptions laid over (engine/assumptions.js).
const rulesFor = (spine) => withClient(rules, spine);
const context = (levels) => ({ spine: hist ? hist.present : undefined, rules: rulesFor(hist ? hist.present : null), source, institutions, levels, state: (entry() && entry().page) || {} });

// ---------------------------------------------------------------- the page's calls
// startPage({ tab, title, render, name, actions, parent, household }) once, at the top of the page's script.
export async function startPage(o) {
  opts = { household: true, ...o };
  if (opts.tab === undefined) opts.tab = (TABS.find((t) => location.pathname.endsWith('/' + t[2])) || [null])[0];
  baseTitle = document.title;
  applyPrefs();
  try { history.scrollRestoration = 'manual'; } catch { /* an old browser: it restores scroll itself */ }
  mountPage({ app });
  const tabs = tabBar(opts.tab);
  app.parentNode.insertBefore(tabs, app);
  document.body.classList.add('has-tabs');
  measureTabs(tabs);
  document.body.append(barEl);
  if (opts.render) app.replaceChildren(topEl, headEl, screenEl); else app.prepend(topEl);
  listen();
  if (opts.household) {
    try { take(await loadAll()); } catch (err) { app.replaceChildren(h('p', { class: 'card' }, opts.title + ' could not load: ' + err.message)); return; }
  }
  arrive();
}

// Every change goes through here: next is the new household, or a function from the household now to the next one;
// text says what changed, in words (said.*). Saves, records, redraws and shows the bar. False when nothing changed,
// or when the change could not be made (the bar says why).
export const YOURS_NOTE = 'These are your numbers now. Download a copy to keep them safe.';
const NOTE_KEY = 'slam-yours-note:v1';
function seenYoursNote() { try { if (localStorage.getItem(NOTE_KEY)) return true; localStorage.setItem(NOTE_KEY, '1'); } catch { /* storage blocked: say it each time */ } return false; }
export function change(next, text) {
  let doc;
  try { doc = typeof next === 'function' ? next(hist.present) : next; } catch (err) { say(err && err.message ? err.message : String(err)); return false; }
  if (!doc || doc === hist.present) return false;
  // Whose numbers (bug sweep): the first edit to the example makes it theirs. It stops being the example, the header
  // reads the person's name (or "Your household"), and a one-time note says to keep a copy. Undo brings the example
  // back with the rest.
  const mine = !!(hist.present.meta && hist.present.meta.demo === true);
  if (mine) doc = yours(doc);
  hist = commit(hist, applyDefaults(doc, rulesFor(doc)), text, HISTORY_STEPS);
  notice = null; side = null;
  const kept = stored();
  draw();
  const first = mine && !seenYoursNote();
  bar(first ? YOURS_NOTE + ' ' + end(text) : kept ? end(text) : 'This browser will not keep it, so it lasts until the page closes. ' + end(text), 'Undo', doUndo);
  return true;
}

// Open a level as its own screen: go(['debt', 'credit-cards']) or go('debt/credit-cards'); go([]) is the top.
// A link with href="#/debt/credit-cards" on the page does the same.
export function go(target) {
  const to = toLevels(target), from = levelsNow();
  let same = 0;
  while (same < from.length && same < to.length && from[same] === to[same]) same++;
  if (same === from.length && same === to.length) return;
  saveScroll();
  const up = from.length - same;
  // Up first, along the entries already there, then down as new ones: the entries behind a screen are always the
  // levels above it, so Back and the browser's back go up one level.
  if (up) { pending = to.length > same ? to : null; history.go(-up); return; }
  push(from, to.slice(same));
  draw();
  window.scrollTo(0, 0);
}

// What this screen keeps for itself (what is open, a filter, a time picker): restored when it is come back to.
export function keep(patch) { const e = entry(); if (e) { history.replaceState(stateWith({ ...e, page: { ...e.page, ...patch } }), ''); remember(); } }
export const kept = () => (entry() && entry().page) || {};
// Redraw without a change (after a resize, or when something the page fetched arrives).
export function refresh() { if (opts && (hist || !opts.household)) draw(); }
// A message in the bar. With undo, the bar offers Undo (for things outside the household, like a rule or a saved
// scenario), and the header's Undo and Ctrl/Cmd+Z reach it too until the next change; with redo as well, Redo brings
// it back after an undo.
export function say(text, undoFn = null, redoFn = null) {
  if (!undoFn) { bar(end(text), null, null); return; }
  side = { words: end(text), undo: undoFn, redo: redoFn, done: true };
  bar(end(text), 'Undo', doUndo);
  drawHead();
}
// The page's late content landed (a list figured after the first draw): the scroll it was left at, if it could not be
// reached before.
export function restoreScroll() {
  if (wantY === null) return;
  const y = wantY;
  window.scrollTo(0, y);
  if (Math.abs(window.scrollY - y) <= 1) wantY = null;
}
// The household, the rules and where the household came from, for a handler outside render.
export const current = () => ({ spine: hist ? hist.present : undefined, rules: rulesFor(hist ? hist.present : null), source, institutions });
// New house defaults for every client (the Assumptions page's "For everyone"): kept by the page, read from here on.
export function useRules(next) { rules = next; if (hist) hist = { ...hist, present: applyDefaults(hist.present, rulesFor(hist.present)) }; draw(); }
// Open a different household the page read itself (what loadAll or loadMyFile returns): a fresh history, as Load my
// file gives; the bar says text when there is one.
export function reopen(loaded, text) { take({ rules, institutions, ...loaded }); draw(); if (text) say(text); }

// ---------------------------------------------------------------- the tab bar, the trail, the header, the bar
// A tab opens its page as it was left in this browser tab; the lit tab, tapped, goes to its top.
export function tabBar(lit) {
  const tap = (href) => (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (opts && samePage(href)) { e.preventDefault(); if (levelsNow().length) go([]); else window.scrollTo(0, 0); return; }
    saveScroll();
    try { sessionStorage.setItem(RETURN_KEY, new URL(href, location.href).pathname); } catch { /* storage blocked: the page opens at its top */ }
  };
  return h('nav', { class: 'tabbar', 'aria-label': 'Pages' },
    h('ul', {}, TABS.map(([id, words, href]) => h('li', {}, h('a', { class: 'tab', href, 'aria-current': id === lit ? 'page' : null, onclick: tap(href) }, words)))));
}
// The tab bar's own height, as --tabbar-h: the page's bottom padding on a phone (so nothing hides behind the bar) and
// where Back and the trail stick on a computer.
function measureTabs(bar) {
  const set = () => document.documentElement.style.setProperty('--tabbar-h', Math.ceil(bar.getBoundingClientRect().height) + 'px');
  set();
  if (typeof ResizeObserver === 'function') new ResizeObserver(set).observe(bar);
}
const samePage = (href) => { try { return new URL(href, location.href).pathname === location.pathname; } catch { return false; } };

// Did the person come here from the parent page (so Back is the browser's back)?
function fromParent() {
  try { return history.length > 1 && !!document.referrer && new URL(document.referrer).pathname === new URL(opts.parent[1], location.href).pathname; } catch { return false; }
}
// Up to the parent page, from depth levels down: back along the entries when it is behind them, else open it.
function toParent(depth) { saveScroll(); if (fromParent()) history.go(-(depth + 1)); else location.assign(opts.parent[1]); }
// Opened from another page of the app than the parent (All formulas opening a rule): Back at the top goes back there,
// as the browser's back does.
function fromApp() {
  try { return history.length > 1 && !!document.referrer && new URL(document.referrer).origin === location.origin && new URL(document.referrer).pathname !== location.pathname; } catch { return false; }
}

function screenTop(levels, names) {
  const steps = [];
  if (opts.parent) steps.push([opts.parent[0], opts.parent[1], () => toParent(levels.length)]);
  if (levels.length || opts.parent) steps.push([opts.title, rootUrl(), () => go([])]);
  levels.forEach((_, i) => steps.push([names[i], hashOf(levels.slice(0, i + 1)), () => go(levels.slice(0, i + 1))]));
  if (!steps.length) return [];
  const up = steps[steps.length - 2];
  const link = ([words, href, fn]) => h('a', { href, onclick: (e) => { e.preventDefault(); fn(); } }, words);
  const browserBack = levels.length || (!fromParent() && fromApp());
  return [
    h('button', { type: 'button', class: 'btn back-btn', 'aria-label': levels.length || !browserBack ? 'Back to ' + up[0] : 'Back', onclick: () => (browserBack ? (saveScroll(), history.back()) : toParent(0)) }, h('span', { 'aria-hidden': 'true' }, '‹'), 'Back'),
    h('nav', { class: 'trail', 'aria-label': 'Where you are' },
      h('ol', {}, steps.map((s, i) => h('li', i === steps.length - 1 ? { 'aria-current': 'page' } : {}, i === steps.length - 1 ? s[0] : link(s)))))
  ];
}

// What Undo and Redo would do now: the step outside the household first, then the household's own.
const undoWords = () => (side && side.done ? side.words : hist && canUndo(hist) ? undoLabel(hist) : null);
const redoWords = () => (side ? (side.done ? null : side.words) : hist && canRedo(hist) ? redoLabel(hist) : null);
function header(ctx, title) {
  const own = opts.actions ? [].concat(opts.actions(ctx)).filter(Boolean) : [];
  const u = undoWords(), r = redoWords();
  const undoing = opts.household || side ? [
    // Small icons in the header (audit 4); the words are the button's name and its tooltip.
    h('button', { type: 'button', class: 'btn small icon-btn', disabled: !u, 'aria-label': u ? 'Undo: ' + u : 'Undo', title: u ? 'Undo: ' + u : 'Nothing to undo', onclick: doUndo }, h('span', { 'aria-hidden': 'true' }, '\u21B6')),
    h('button', { type: 'button', class: 'btn small icon-btn', disabled: !r, 'aria-label': r ? 'Redo: ' + r : 'Redo', title: r ? 'Redo: ' + r : 'Nothing to redo', onclick: doRedo }, h('span', { 'aria-hidden': 'true' }, '\u21B7'))
  ] : [];
  return [
    h('div', { class: 'top-actions' }, ...own,
      opts.household && hist ? whoseMenu(hist.present, { rules, reopen: (loaded) => { take({ institutions, ...loaded }); draw(); } }) : null,
      opts.household && hist ? searchButton(() => hist.present) : null,
      ...undoing)
  ];
}
// One header line everywhere (Krug pass, 44px): the SLAM wordmark (to Today), Back on a phone or the trail on a
// computer, the title; then whose numbers, search, Undo and Redo.
const wordmark = () => h('a', { class: 'wordmark', href: 'dashboard.html', 'aria-label': 'SLAM: Today' }, 'SLAM');
function headLine(levels, names, ctx, title) {
  return [wordmark(), ...screenTop(levels, names), h('h1', { class: 'top-h1' }, title), ...header(ctx, title)];
}

function bar(text, action, fn) {
  barText.textContent = text;
  barBtn.hidden = !action;
  barBtn.textContent = action || '';
  onBar = fn;
  barEl.classList.remove('is-idle', 'is-fading');
  clearTimeout(barTimer);
  barTimer = setTimeout(fade, 6000);
}
// The bar fades after a few seconds, but never while its button has the focus.
function fade() {
  if (barEl.contains(document.activeElement)) { barTimer = setTimeout(fade, 2000); return; }
  barEl.classList.add('is-fading');
  barTimer = setTimeout(() => { barEl.classList.add('is-idle'); barText.textContent = ''; onBar = null; }, 400);
}

// ---------------------------------------------------------------- undo and redo
function stored() { const ok = keepHistory(hist); if (ok) source = 'saved'; return ok; }
function doUndo() {
  if (side && side.done) {
    const s = side;
    side = null;
    s.undo();
    // Undone, it can come back with Redo, unless the undo was itself a change (that change is the latest step now).
    if (s.redo && !side) side = { ...s, done: false };
    bar('Undone: ' + s.words, side ? 'Redo' : null, side ? doRedo : null);
    drawHead();
    return;
  }
  if (!hist || !canUndo(hist)) return;
  side = null;
  const words = undoLabel(hist);
  hist = undo(hist); notice = null; stored(); draw();
  bar('Undone: ' + end(words), 'Redo', doRedo);
}
function doRedo() {
  if (side) {
    if (side.done) return;
    const s = side;
    side = null;
    s.redo();
    if (!side) side = { ...s, done: true };
    bar('Redone: ' + s.words, 'Undo', doUndo);
    drawHead();
    return;
  }
  if (!hist || !canRedo(hist)) return;
  const words = redoLabel(hist);
  hist = redo(hist); notice = null; stored(); draw();
  bar('Redone: ' + end(words), 'Undo', doUndo);
}

// ---------------------------------------------------------------- drawing
function take(loaded) {
  rules = loaded.rules; source = loaded.source; institutions = loaded.institutions || institutions;
  // A guess from a house default follows this client's own assumption when there is one.
  hist = openHistory(loaded.spine && loaded.spine.assumptionOverrides ? applyDefaults(loaded.spine, rulesFor(loaded.spine)) : loaded.spine);
  notice = loaded.problem || null;
}

// How money and dates read on every page (Preferences): the household's wage and saving pace, once per version.
let rateMemo = { spine: null, rules: null, wage: null, perDay: null };
function display() {
  const p = prefs(), spine = hist ? hist.present : null;
  if (spine && (p.moneyAs === 'hours' || p.moneyAs === 'fiDays') && (rateMemo.spine !== spine || rateMemo.rules !== rules)) {
    let wage = null, perDay = null;
    try { const r = rulesFor(spine), s = summarize(spine, r, { flags: false }); wage = realHourlyWage(spine, r, s).wage; const t = s.cashflow.saving.total; perDay = savedPerDay(t && typeof t === 'object' ? t.value : t); } catch { /* dollars alone */ }
    rateMemo = { spine, rules, wage, perDay };
  }
  setDisplay({ moneyAs: p.moneyAs || 'dollars', wage: rateMemo.wage, perDay: rateMemo.perDay, dateStyle: p.dateStyle || 'words', round: +p.round || 1 });
}

function draw() {
  // Still loading the household (a back or a level link tapped meanwhile): arrive() draws the screen the address names.
  if (opts.household && !hist) return;
  display();
  const levels = levelsNow();
  const ctx = context(levels);
  const names = levels.map((_, i) => nameOf(levels.slice(0, i + 1), ctx));
  // A level that is not there any more (deleted, or a link to something gone): up to the deepest one that is.
  const gone = names.findIndex((n) => !n);
  if (gone >= 0) { go(levels.slice(0, gone)); return; }
  const title = levels.length ? names[names.length - 1] : opts.title;
  drawn = JSON.stringify(levels);
  headTitle = title; headLevels = levels; headNames = names;
  topEl.replaceChildren(...headLine(levels, names, ctx, title).filter(Boolean));
  if (opts.render) {
    const focus = focused();
    headEl.replaceChildren();
    screenEl.replaceChildren(...[notice ? h('p', { class: 'card', role: 'alert' }, notice) : null, ...[].concat(opts.render(ctx))].flat(Infinity).filter((x) => x !== null && x !== undefined && x !== false));
    refocus(focus);
  }
  document.title = levels.length ? title + ' · ' + baseTitle : baseTitle;
}

// Only the header again (Undo and Redo after a step outside the household).
function drawHead() {
  if (!opts || !opts.render || (opts.household && !hist) || !headEl.isConnected) return;
  const focus = focused();
  topEl.replaceChildren(...headLine(headLevels, headNames, context(levelsNow()), headTitle).filter(Boolean));
  refocus(focus);
}

// The box being typed in keeps the focus and its caret across a redraw (found again by its id).
function focused() {
  const a = document.activeElement;
  if (!a || !a.id || !app.contains(a)) return null;
  let start = null, stop = null;
  try { start = a.selectionStart; stop = a.selectionEnd; } catch { /* not a text box */ }
  return { id: a.id, start, stop };
}
function refocus(f) {
  if (!f) return;
  const el = document.getElementById(f.id);
  if (!el || el === document.activeElement) return;
  el.focus({ preventScroll: true });
  if (f.start !== null && f.start !== undefined) try { el.setSelectionRange(f.start, f.stop); } catch { /* not a text box */ }
}

function push(base, down, at = () => ({})) {
  let lv = base;
  for (const seg of down) { lv = [...lv, seg]; history.pushState(fresh(lv, at(lv)), '', hashOf(lv)); }
}

// Each page's screens as last left in this browser tab ({ levels, at: { '<levels>': { scroll, page } } }), so a tab
// tapped opens the page there. Kept for the screen in view and the ones above it.
const SCREENS_KEY = 'slam-screens:v1', RETURN_KEY = 'slam-tab-return:v1';
function remember() {
  const e = entry();
  if (!e) return;
  try {
    const all = JSON.parse(sessionStorage.getItem(SCREENS_KEY) || '{}') || {};
    const was = all[location.pathname] || { levels: [], at: {} };
    const keyOf = (lv) => JSON.stringify(lv);
    const at = {};
    for (let i = 0; i < e.levels.length; i++) { const k = keyOf(e.levels.slice(0, i)); if (was.at && was.at[k]) at[k] = was.at[k]; }
    at[keyOf(e.levels)] = { scroll: e.scroll || 0, page: e.page || {} };
    all[location.pathname] = { levels: e.levels, at };
    sessionStorage.setItem(SCREENS_KEY, JSON.stringify(all));
  } catch { /* storage blocked: a tab opens its page at the top */ }
}
function tabReturn() {
  try {
    const mine = sessionStorage.getItem(RETURN_KEY) === location.pathname;
    sessionStorage.removeItem(RETURN_KEY);
    if (!mine) return null;
    const p = (JSON.parse(sessionStorage.getItem(SCREENS_KEY) || '{}') || {})[location.pathname];
    return p && Array.isArray(p.levels) && p.at && typeof p.at === 'object' ? p : null;
  } catch { return null; }
}

// The first draw. Coming back to an entry (a reload, or back from another page): its scroll after the page is drawn.
// A fresh visit to a level: the levels above it become entries first.
function arrive() {
  const e = entry();
  if (e) { draw(); restore(e.scroll); return; }
  const want = levelsOf(location.hash), ok = [];
  // A tab tapped: the screens this page was left on in this browser tab, each with its scroll and what was open.
  const left = !location.hash ? tabReturn() : null;
  const at = (lv) => (left && left.at[JSON.stringify(lv)]) || {};
  for (const seg of want.length ? want : left ? left.levels : []) { if (!nameOf([...ok, seg], context([...ok, seg]))) break; ok.push(seg); }
  history.replaceState({ ...(history.state || {}), ...fresh([], at([])) }, '', want.length ? rootUrl() : location.href);
  push([], ok, at);
  if (left) { draw(); restore(entry().scroll); return; }
  draw();
  // An old-style link to a part of the page (#tile-networth, #rule-K401_DEF) still lands on it.
  if (!want.length && location.hash.length > 1) document.getElementById(decode(location.hash.slice(1)))?.scrollIntoView({ block: 'start' });
}
const restore = (y) => requestAnimationFrame(() => { window.scrollTo(0, y || 0); wantY = y && Math.abs(window.scrollY - y) > 1 ? y : null; });
function saveScroll() {
  clearTimeout(scrollTimer);
  const e = entry();
  // Still waiting for the content to reach the scroll it was left at: that scroll stays the entry's.
  if (e && wantY === null && Math.abs((e.scroll || 0) - window.scrollY) > 1) history.replaceState(stateWith({ ...e, scroll: Math.round(window.scrollY) }), '');
  remember();
}

// The household again from this browser (another tab changed it, or the page came back from the browser's cache).
async function reload() {
  if (!opts.household || !hist) return;
  const y = window.scrollY;
  try { take(await loadAll()); draw(); window.scrollTo(0, y); } catch (err) { console.warn(err); }
}

const TEXT_TYPES = /^(text|search|email|number|tel|url|password|date|month|week|time|datetime-local)$/i;
const typing = (t) => !!t && (t.isContentEditable || t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && TEXT_TYPES.test(t.type || 'text')));

function listen() {
  window.addEventListener('popstate', (ev) => {
    clearTimeout(scrollTimer);
    const e = ev.state && ev.state.shell;
    if (!e) {
      // A link to a part of the page, or a level typed into the address bar: stamp the entry; a level gets the levels
      // above it as entries, as on a fresh visit.
      const want = levelsOf(location.hash);
      pending = null;
      history.replaceState({ ...(ev.state || {}), ...fresh([]) }, '', want.length ? rootUrl() : location.href);
      if (want.length) { push([], want); draw(); window.scrollTo(0, 0); } else if (drawn !== '[]') draw();
      return;
    }
    if (pending) { const to = pending; pending = null; push(e.levels, to.slice(e.levels.length)); draw(); window.scrollTo(0, 0); return; }
    draw();
    restore(e.scroll);
  });
  window.addEventListener('scroll', () => { clearTimeout(scrollTimer); scrollTimer = setTimeout(saveScroll, 150); }, { passive: true });
  // The person scrolls: a scroll still waiting for the page's content is dropped.
  for (const t of ['wheel', 'touchmove', 'keydown', 'mousedown']) window.addEventListener(t, () => { wantY = null; }, { passive: true, capture: true });
  window.addEventListener('pagehide', saveScroll);
  window.addEventListener('pageshow', (ev) => { if (ev.persisted) reload(); });
  window.addEventListener('storage', (ev) => { if (ev.key === null || HOUSEHOLD_KEYS.includes(ev.key)) { clearTimeout(reloadTimer); reloadTimer = setTimeout(reload, 100); } });
  // A link to a level on this page opens it as its own screen.
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest && e.target.closest('a[href^="#/"]');
    if (!a) return;
    e.preventDefault();
    go(levelsOf(a.getAttribute('href')));
  });
  // Ctrl or Cmd+Z undoes, with Shift redoes, except while typing in a text box (it undoes the typing there).
  document.addEventListener('keydown', (e) => {
    if (!(hist || side) || !(e.ctrlKey || e.metaKey) || e.altKey || String(e.key).toLowerCase() !== 'z' || typing(e.target)) return;
    e.preventDefault();
    if (e.shiftKey) doRedo(); else doUndo();
  });
}
