// SLAM app shell: loads reference data, opens the store, routes between the
// four screens, and re-renders after every change. Undo and redo live here.

import { createStore } from '../store/store.js';
import { createStorage, localStorageBackend } from '../store/storage.js';
import { setField } from '../store/edits.js';
import { viewFor, say } from '../store/visibility.js';
import { displayRole, setDisplayRole } from '../store/session.js';
import { buildSummary } from '../calc/summary.js';
import { primaryPayFrequency } from '../calc/model.js';
import { loadRefs } from './refs.js';
import { h } from './dom.js';
import { renderClients } from './screens/clients.js';
import { renderFill, passForPath } from './screens/fill.js';
import { renderBudget } from './screens/budget.js';
import { renderAnalyze } from './screens/analyze.js';
import { renderTransactions } from './screens/fill-transactions.js';
import { transactionCards } from './charts/tx-charts.js';
import { renderNextStage } from './screens/fill-next-stage.js';
import { nextStageCards } from './charts/next-charts.js';
import { eraCards } from './charts/era-charts.js';
import { renderEras } from './screens/fill-eras.js';
import { reviewCards } from './screens/review.js';
import { quickEntrySheet } from './components/quick-entry.js';
import { cashflowCards } from './charts/cash-charts.js';
import { monthsCards } from './charts/months-charts.js';
import { trendCards } from './charts/trend-charts.js';

const SCREENS = [['clients', 'Clients'], ['fill', 'Fill in'], ['budget', 'Budget'], ['analyze', 'Analyze']];
const root = document.getElementById('app');
const storage = createStorage(localStorageBackend());
const store = createStore(storage);
let refs = null;
let renderQueued = false;

const ui = {
  screen: 'clients', pass: 'gut', focusPath: null, focusKey: null, dreamTerm: 'short', expanded: new Set(), sort: { key: null, dir: -1 },
  lens: 'dollars', monthView: 'current', blind: false, units: {}, previewHandler: null, toast: null,
  section: null
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
  go(screen, opts = {}) {
    Object.assign(ui, opts);
    ui.screen = screen;
    if (location.hash !== '#' + screen) history.pushState(null, '', '#' + screen);
    queueRender();
    window.scrollTo(0, 0);
  },
  goToField(path) {
    ui.pass = passForPath(path);
    if (path.includes('dreamLong')) ui.dreamTerm = 'long';
    else if (path.includes('dream')) ui.dreamTerm = 'short';
    ui.focusPath = path;
    ctx.go('fill');
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
  rerender: () => queueRender(),
  // Cash flow (accounts, the log, imports) lives inside Fill in and Analyze, so there are still four screens.
  fillExtras: [{ id: 'cashflow', label: '5 Cash flow', render: renderTransactions }, { id: 'next', label: '6 Next stage', render: renderNextStage }, { id: 'eras', label: '7 Eras', render: renderEras }],
  analyzeExtras: [['cashflow', 'Cash flow', (c, s) => cashflowCards(c, s)], ['transactions', 'Transactions', (c, s) => transactionCards(c, s)], ['next', 'Next stage', (c, s) => nextStageCards(c, s)], ['eras', 'Eras', (c, s) => eraCards(c, s)], ['plan', 'Review and plan', (c, s) => reviewCards(c, s)], ['months', 'Months', (c, s) => monthsCards(c, s)], ['trends', 'Trends', (c, s) => trendCards(c, s)]]
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
  // The client list is the coach's; a client never sees it.
  if (displayRole() === 'client' && ui.screen === 'clients') ui.screen = store.doc ? 'budget' : 'clients';
  if (!store.doc && displayRole() === 'client') setDisplayRole('coach');
  document.documentElement.setAttribute('data-view', displayRole());
  const summary = summaryOf(viewed());
  ui.previewHandler = null;
  const screen = { clients: renderClients, fill: renderFill, budget: renderBudget, analyze: renderAnalyze }[ui.screen];
  const body = screen(ctx, summary);

  const parts = [topbar(), h('main', { id: 'main' }, body)];
  // Quick entry floats over any screen (S-085); it is a sheet, not a fifth screen.
  const qe = quickEntrySheet(ctx);
  if (qe) parts.push(qe);
  if (ui.toast) parts.push(h('div', { class: 'toast', role: 'status' }, ui.toast));
  root.replaceChildren(...parts);
  window.scrollTo(0, scroll);

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

function topbar() {
  const doc = store.doc;
  const asClient = displayRole() === 'client';
  const screens = asClient ? SCREENS.filter(([id]) => id !== 'clients') : SCREENS;
  return h('header', { class: 'topbar' }, h('div', { class: 'topbar-inner' },
    h('span', { class: 'brand' }, 'SLAM'),
    h('span', { class: 'client-name' }, doc ? doc.profile.name : 'No client open'),
    h('nav', { class: 'nav', 'aria-label': 'Screens' }, screens.map(([id, label]) =>
      h('a', { href: '#' + id, 'aria-current': ui.screen === id ? 'page' : null,
        onclick: (e) => { e.preventDefault(); if (id !== 'clients' && !doc) return ctx.toast('Open or create a client first'); ctx.go(id); } }, label))),
    h('div', { class: 'row' },
      doc ? h('button', { class: 'btn small' + (asClient ? ' primary' : ''), 'data-key': 'view-as-client', 'aria-pressed': asClient ? 'true' : 'false',
        title: asClient ? 'You are seeing what the client sees. Changes are still saved as the coach.' : 'See the budget the way the client sees it',
        onclick: () => { setDisplayRole(asClient ? 'coach' : 'client'); queueRender(); } }, say('view-toggle', displayRole())) : null,
      h('button', { class: 'btn small icon-btn', title: store.canUndo() ? 'Undo: ' + store.undoLabel() : 'Nothing to undo', 'aria-label': 'Undo', disabled: !store.canUndo(), onclick: () => store.undo() }, '↶'),
      h('button', { class: 'btn small icon-btn', title: store.canRedo() ? 'Redo: ' + store.redoLabel() : 'Nothing to redo', 'aria-label': 'Redo', disabled: !store.canRedo(), onclick: () => store.redo() }, '↷'),
      h('button', { class: 'btn small icon-btn', title: 'Light or dark', 'aria-label': 'Switch light or dark', onclick: cycleTheme }, '◐'))));
}

function cycleTheme() {
  const order = ['auto', 'light', 'dark'];
  const now = storage.getSetting('theme') || 'auto';
  const next = order[(order.indexOf(now) + 1) % order.length];
  storage.setSetting('theme', next);
  applyTheme();
  ctx.toast('Theme: ' + next);
}

function applyTheme() {
  const t = storage.getSetting('theme') || 'auto';
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && ui.qe) { ui.qe = null; queueRender(); return; }
  const inField = /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName);
  if (inField || !(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;
  e.preventDefault();
  if (e.shiftKey) store.redo(); else store.undo();
});

let resizeTimer = null;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(queueRender, 150); });

window.addEventListener('popstate', () => {
  const s = location.hash.slice(1);
  if (SCREENS.some(([id]) => id === s)) { ui.screen = s; queueRender(); }
});

async function boot() {
  applyTheme();
  try {
    refs = await loadRefs();
  } catch (e) {
    root.textContent = 'SLAM could not load its reference data. Serve this folder with a local web server (see README). ' + e.message;
    return;
  }
  await store.load();
  const last = storage.getSetting('lastOpen');
  if (last && store.list().some((c) => c.id === last)) await store.open(last);
  const s = location.hash.slice(1);
  ui.screen = SCREENS.some(([id]) => id === s) && store.doc ? s : (store.doc ? 'budget' : 'clients');
  render();
}

boot();
