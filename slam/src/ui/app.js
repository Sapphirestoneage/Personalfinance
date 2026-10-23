// SLAM app shell: loads reference data, opens the store, routes between the
// screens of the monthly loop (S-106: Today, Plan, Track, Review, Insights,
// Setup, plus Clients), and re-renders after every change. Undo and redo live here.
// Depends on the store (store, storage, edits, visibility, session), two engines (summary
// for every number on screen, model for the pay frequency), and the ui helpers: dom, nav,
// format, refs, the components, and one render function per screen.

import { createStore } from '../store/store.js';
import { createStorage, localStorageBackend } from '../store/storage.js';
import { setField } from '../store/edits.js';
import { viewFor, say } from '../store/visibility.js';
import { displayRole, setDisplayRole } from '../store/session.js';
import { buildSummary } from '../engines/summary.js';
import { primaryPayFrequency } from '../engines/model.js';
import { loadRefs } from './refs.js';
import { h } from './dom.js';
import { SCREENS, OLD_HASHES, INSIGHT_TABS, SETUP_SECTIONS, destination, whereFor, nameFor, screenLabel } from './nav.js';
import { searchBox } from './components/search.js';
import { monthLabel } from './format.js';
import { renderClients } from './screens/clients.js';
import { renderToday } from './screens/today.js';
import { renderPlan } from './screens/plan.js';
import { renderTrack } from './screens/track.js';
import { renderReview } from './screens/review.js';
import { renderInsights } from './screens/insights.js';
import { renderSetup } from './screens/setup.js';
import { renderAccounts } from './screens/accounts.js';
import { renderFuture } from './screens/future.js';
import { quickEntrySheet } from './components/quick-entry.js';

const root = document.getElementById('app');
const storage = createStorage(localStorageBackend());
const store = createStore(storage);
let refs = null;
let renderQueued = false;
// Future tools (S-105): parked behind a setting on this device, off by default.
const futureOn = () => storage.getSetting('futureTools') === 'on';
const screensNow = () => (futureOn() ? [...SCREENS, ['future', 'Future']] : SCREENS);
const known = (id) => id === 'clients' || screensNow().some(([k]) => k === id);

// Screen state that is never saved: which screen is open, what to focus after a render, open drawers, sort, lens.
const ui = {
  screen: 'clients', focusPath: null, focusKey: null, dreamTerm: 'short', expanded: new Set(), sort: { key: null, dir: -1 },
  lens: 'dollars', blind: false, units: {}, previewHandler: null, toast: null,
  anchor: null, more: false, nameMenu: false
};

function summaryOf(doc) { return doc ? buildSummary(doc, refs) : null; }

// What the person on screen sees (S-096): the coach sees everything; "View as client" hides coach-only fields.
let viewCache = { doc: null, role: null, view: null };
function viewed() {
  const doc = store.doc;
  const role = displayRole();
  if (viewCache.doc !== doc || viewCache.role !== role) viewCache = { doc, role, view: viewFor(doc, role) };
  return viewCache.view;
}

const ctx = {
  store, ui,
  get refs() { return refs; },
  get doc() { return viewed(); },
  get role() { return displayRole(); },
  say: (key) => say(key, displayRole()),
  get payFrequency() { return store.doc ? primaryPayFrequency(store.doc) : null; },
  // One history entry per screen change, so the browser's Back button walks screens (see popstate below).
  go(screen, opts = {}) {
    ui.crumbItem = null;
    Object.assign(ui, opts);
    ui.screen = screen;
    ui.more = false;
    ui.nameMenu = false;
    if (location.hash !== '#' + screen) history.pushState(null, '', '#' + screen);
    queueRender();
    window.scrollTo(0, 0);
  },
  // A named place (nav.js): its screen, the tab or section to open, and what to scroll to.
  jump(where, extra = {}) {
    if (where.startsWith('future') && !futureOn()) return ctx.toast('That is a parked Future tool. Turn it on in Setup.');
    const [screen, opts, anchor] = destination(where);
    ui.anchor = extra.anchor || anchor;
    ctx.go(screen, { ...opts, ...extra.ui });
  },
  get future() { return futureOn(); },
  setFuture(on) {
    storage.setSetting('futureTools', on ? 'on' : 'off');
    ctx.toast(on ? 'Future tools are on: see the Future screen' : 'Future tools are parked');
  },
  goToField(path) {
    const [where, open] = whereFor(store.doc, path);
    for (const k of open) ui.expanded.add(k);
    if (path.includes('dreamLong')) ui.dreamTerm = 'long';
    else if (path.includes('dream')) ui.dreamTerm = 'short';
    ui.focusPath = path;
    ctx.jump(where, { ui: { crumbItem: nameFor(store.doc, path) } });
  },
  update(label, fn) {
    try { store.update(label, fn); } catch (e) { ctx.toast(e.message); }
  },
  commit(path, value, label) {
    ctx.update(label || 'Edit', (d) => setField(d, path, value));
  },
  // Live running totals while typing: compute on a scratch copy, never saved.
  preview(path, value) {
    if (!ui.previewHandler || !store.doc) return;
    const draft = JSON.parse(JSON.stringify(viewed()));
    try { setField(draft, path, value); } catch (e) { return; }
    ui.previewHandler(summaryOf(draft));
  },
  toast(msg) {
    ui.toast = msg;
    queueRender();
    setTimeout(() => { if (ui.toast === msg) { ui.toast = null; queueRender(); } }, 2600);
  },
  rerender: () => queueRender()
};

store.subscribe((doc, label) => {
  // A different client: drop per-client screen state (open drawers, pending imports, closed-month view).
  if (label === 'open' || label === 'close') { ui.qe = null; ui.closing = false; ui.justClosed = null; ui.txImport = null; ui.expanded = new Set(); ui.monthView = 'current'; ui.blind = false; ui.txMonth = null; }
  queueRender();
});

// Render after the browser has moved focus, then put focus back on the same field.
function queueRender() {
  if (renderQueued) return;
  renderQueued = true;
  setTimeout(() => { renderQueued = false; render(); }, 0);
}

function render() {
  const active = document.activeElement;
  const key = active && active.getAttribute ? active.getAttribute('data-key') : null;
  const sel = key && typeof active.selectionStart === 'number' ? [active.selectionStart, active.selectionEnd] : null;
  const scroll = window.scrollY;

  if (!store.doc && ui.screen !== 'clients') ui.screen = 'clients';
  if (!known(ui.screen)) ui.screen = 'today';
  // The client list is the coach's; a client never sees it.
  if (displayRole() === 'client' && ui.screen === 'clients') ui.screen = store.doc ? 'today' : 'clients';
  if (!store.doc && displayRole() === 'client') setDisplayRole('coach');
  document.documentElement.setAttribute('data-view', displayRole());
  const summary = summaryOf(viewed());
  ui.previewHandler = null;
  const screen = { clients: renderClients, today: renderToday, accounts: renderAccounts, plan: renderPlan, track: renderTrack, review: renderReview, insights: renderInsights, setup: renderSetup, future: renderFuture }[ui.screen];
  const body = screen(ctx, summary);

  const parts = [topbar(), store.doc && ui.screen !== 'clients' ? crumbs() : null, h('main', { id: 'main', 'data-screen': ui.screen }, body)].filter(Boolean);
  if (store.doc) parts.push(bottomBar());
  // Quick entry floats over any screen (S-085); it is a sheet, not a fifth screen.
  const qe = quickEntrySheet(ctx);
  if (qe) parts.push(qe);
  if (ui.toast) parts.push(h('div', { class: 'toast', role: 'status' }, ui.toast));
  root.replaceChildren(...parts);
  window.scrollTo(0, scroll);

  // Focus, in this order: a place to scroll to (jump), a requested key (a button or field), a requested
  // field path (goToField), else whatever had focus before the render, with its text selection.
  if (ui.anchor) {
    const el = document.getElementById(ui.anchor);
    ui.anchor = null;
    if (el) el.scrollIntoView({ block: 'start' });
  }
  if (ui.focusKey) {
    const el = root.querySelector('[data-key="' + CSS.escape(ui.focusKey) + '"]');
    ui.focusKey = null;
    if (el) { el.scrollIntoView({ block: 'center' }); el.focus(); if (el.select) el.select(); }
  } else if (ui.focusPath) {
    const el = root.querySelector('[data-path="' + CSS.escape(JSON.stringify(ui.focusPath)) + '"]');
    ui.focusPath = null;
    if (el) { el.scrollIntoView({ block: 'center' }); el.focus(); }
  } else if (key) {
    const el = root.querySelector('[data-key="' + CSS.escape(key) + '"]');
    if (el) {
      el.focus({ preventScroll: true });
      if (sel && typeof el.setSelectionRange === 'function') { try { el.setSelectionRange(sel[0], sel[1]); } catch (e) { /* not a text box */ } }
    }
  }
}

// An id with a colon is a place inside a screen (nav.js), like insights:networth.
function navLinks(list, cls) {
  return list.map(([id, label]) => h('a', { href: '#' + id.split(':')[0], class: cls || null, 'aria-current': !id.includes(':') && ui.screen === id ? 'page' : null, 'data-nav': id,
    onclick: (e) => { e.preventDefault(); if (id !== 'clients' && !store.doc) return ctx.toast('Open or create a client first'); if (id.includes(':')) ctx.jump(id); else ctx.go(id); } }, label));
}

function topbar() {
  const doc = store.doc;
  const asClient = displayRole() === 'client';
  return h('header', { class: 'topbar' }, h('div', { class: 'topbar-inner' },
    h('span', { class: 'brand' }, 'SLAM'),
    // The client name opens all clients and the coach notes (S-106); a client never sees either.
    doc && !asClient
      ? h('span', { class: 'client-wrap' },
        h('button', { class: 'client-name', 'data-key': 'client-name', 'aria-expanded': ui.nameMenu ? 'true' : 'false', title: 'All clients and coach notes',
          onclick: () => { ui.nameMenu = !ui.nameMenu; ui.more = false; queueRender(); } }, doc.profile.name + ' \u25be'),
        ui.nameMenu ? h('div', { class: 'name-menu' },
          h('a', { href: '#clients', 'data-key': 'menu-clients', onclick: (e) => { e.preventDefault(); ui.nameMenu = false; ctx.go('clients'); } }, 'All clients'),
          h('a', { href: '#setup', 'data-key': 'menu-notes', onclick: (e) => { e.preventDefault(); ui.nameMenu = false; ctx.jump('setup:notes'); } }, 'Coach notes')) : null)
      : h('span', { class: 'client-name' }, doc ? doc.profile.name : 'No client open'),
    doc ? h('nav', { class: 'nav', 'aria-label': 'Screens' }, navLinks(screensNow())) : null,
    doc ? searchBox(ctx) : null,
    h('div', { class: 'row' },
      doc ? h('button', { class: 'btn small' + (asClient ? ' primary' : ''), 'data-key': 'view-as-client', 'aria-pressed': asClient ? 'true' : 'false',
        title: asClient ? 'You are seeing what the client sees. Changes are still saved as the coach.' : 'See the budget the way the client sees it',
        onclick: () => { setDisplayRole(asClient ? 'coach' : 'client'); queueRender(); } }, say('view-toggle', displayRole())) : null,
      h('button', { class: 'btn small icon-btn', title: store.canUndo() ? 'Undo: ' + store.undoLabel() : 'Nothing to undo', 'aria-label': 'Undo', disabled: !store.canUndo(), onclick: () => store.undo() }, '\u21b6'),
      h('button', { class: 'btn small icon-btn', title: store.canRedo() ? 'Redo: ' + store.redoLabel() : 'Nothing to redo', 'aria-label': 'Redo', disabled: !store.canRedo(), onclick: () => store.redo() }, '\u21b7'),
      h('button', { class: 'btn small icon-btn', title: 'Light or dark', 'aria-label': 'Switch light or dark', onclick: cycleTheme }, '\u25d0'))));
}

// Where you are (S-108): "Riley > Review > October 2026 > Groceries". The screen step links back
// to the top of its screen when there is a step after it; the other steps are plain text.
function crumbs() {
  const doc = store.doc;
  // Demo names carry a parenthetical, like "Dana (demo, owns a condo)"; the crumb shows just "Dana".
  const name = doc.profile.name.replace(/ \(.*\)$/, '');
  const pick = (list, id) => (list.find(([k]) => k === id) || [null, null])[1];
  const sub = ui.screen === 'insights' ? pick(INSIGHT_TABS, ui.insightsTab || 'where')
    : ui.screen === 'setup' ? pick(SETUP_SECTIONS, ui.setupSection || 'basics')
      : ui.screen === 'track' ? monthLabel(ui.txMonth || doc.currentMonth)
        : ui.screen === 'review' ? monthLabel(doc.currentMonth)
          : ui.screen === 'plan' ? (ui.planView === 'estimates' ? 'Your estimates' : ui.planView === 'plan' ? 'Next month\'s plan' : null)
            : ui.screen === 'future' ? (ui.futureTab === 'next' ? 'Next stage' : 'Dream life and Eras') : null;
  const steps = [name, screenLabel(ui.screen), sub, ui.crumbItem].filter(Boolean);
  return h('nav', { class: 'crumbs', 'aria-label': 'You are here', 'data-key': 'crumbs' }, h('div', { class: 'crumbs-inner' }, steps.map((x, i) => [
    i ? h('span', { class: 'sep', 'aria-hidden': 'true' }, ' > ') : null,
    i === 1 && steps.length > 2 ? h('a', { href: '#' + ui.screen, onclick: (e) => { e.preventDefault(); ctx.go(ui.screen); } }, x) : h('span', { 'aria-current': i === steps.length - 1 ? 'page' : null }, x)])));
}

// Phones (S-106, S-136): Today, Accounts, Plan, Track, and More (Review, Insights, Setup, Clients, and Future when on).
function bottomBar() {
  const asClient = displayRole() === 'client';
  // Net worth is one tap from More (S-114): "what's my FI net worth" in two taps from Today.
  const more = [...SCREENS.slice(4).filter(([id]) => id !== 'insights' && id !== 'setup'), ['insights', 'Insights'], ['insights:networth', 'Net worth'], ['setup', 'Setup'], ...(futureOn() ? [['future', 'Future']] : []), ...(asClient ? [] : [['clients', 'Clients']])];
  const inMore = more.some(([id]) => id === ui.screen);
  return h('nav', { class: 'bottom-bar', 'aria-label': 'Screens' },
    navLinks(SCREENS.slice(0, 4)),
    h('button', { class: 'more-btn', 'data-key': 'more', 'aria-expanded': ui.more ? 'true' : 'false', 'aria-current': inMore ? 'page' : null,
      onclick: () => { ui.more = !ui.more; queueRender(); } }, 'More'),
    ui.more ? h('div', { class: 'more-menu' }, navLinks(more)) : null);
}

function cycleTheme() {
  const order = ['auto', 'light', 'dark'];
  const now = storage.getSetting('theme') || 'auto';
  const next = order[(order.indexOf(now) + 1) % order.length];
  storage.setSetting('theme', next);
  applyTheme();
  ctx.toast('Theme: ' + next);
}

// 'auto' means no data-theme attribute, so the stylesheet follows the system setting.
function applyTheme() {
  const t = storage.getSetting('theme') || 'auto';
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && ui.qe) { ui.qe = null; queueRender(); return; }
  const inField = /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName);
  // "/" jumps to search (S-108), anywhere but a text box.
  if (e.key === '/' && !inField && !ui.qe && store.doc) { const box = document.getElementById('search'); if (box) { e.preventDefault(); box.focus(); } return; }
  // Inside a text box the browser's own undo applies, not the store's.
  if (inField || !(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;
  e.preventDefault();
  if (e.shiftKey) store.redo(); else store.undo();
});

let resizeTimer = null;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(queueRender, 150); });

const fromHash = () => { const s = location.hash.slice(1); return OLD_HASHES[s] || s; };

window.addEventListener('popstate', () => {
  const s = fromHash();
  if (known(s)) { ui.screen = s; queueRender(); }
});

async function boot() {
  applyTheme();
  // fetch() of the JSON files fails on file://, which is the usual reason this message shows.
  try {
    refs = await loadRefs();
  } catch (e) {
    root.textContent = 'SLAM could not load its reference data. Serve this folder with a local web server (see README). ' + e.message;
    return;
  }
  await store.load();
  const last = storage.getSetting('lastOpen');
  if (last && store.list().some((c) => c.id === last)) await store.open(last);
  const s = fromHash();
  ui.screen = known(s) && store.doc ? s : (store.doc ? 'today' : 'clients');
  render();
}

boot();
