/* The shell: one record, one computed result, hash routes, the Coach/Client
   toggle, autosave with a visible "Saved", undo/redo, quick notes and the
   keyboard shortcuts. Views mount into <main> and get update() calls;
   they never do math. */

import { createStore } from '../engine/store.js';
import * as Rec from '../engine/record.js';
import { h, clear, qs, debounce, download, readFile } from './dom.js';
import { getSensitivity } from './levers-bridge.js';
import { installUnlockWatch } from './unlocks.js';
import { routes, navItems } from './routes.js';
import { renderTracker } from './tracker.js';
import { applyDiscovery, applyGuesses } from '../engine/discovery.js';
import { setAnchor as anchorSet, reanchor as anchorAgain } from '../engine/anchors.js';
import { markStop } from '../engine/callpath.js';
import { setTarget as targetSet } from '../engine/targets.js';
import { recordStress, captureBaseline } from '../engine/program.js';
import { snapshotValues } from '../engine/outcomes.js';

const store = createStore();
const settings = store.settings();

export const app = {
  store,
  record: null,
  result: null,
  view: settings.view === 'client' ? 'client' : 'coach',
  route: { name: 'home', params: {} },
  mounted: null,
  listeners: new Set(),
  saveState: 'saved',
  session: null,
  data: null,

  /* ---- clients ---- */
  open(id) {
    const rec = store.load(id);
    if (!rec) return false;
    this.record = rec;
    settings.lastClient = id;
    store.saveSettings(settings);
    this.recompute();
    /* MR-057: the levers' sensitivity run starts now, off the main thread, so #/levers opens with its numbers */
    if (this.result && this.result.metrics && this.result.metrics.fiDate && this.result.metrics.fiDate.status === 'ok') getSensitivity(this, () => {});
    this.renderChrome();
    this.go(this.route.name === 'home' ? '#/home' : location.hash || '#/home', true);
    return true;
  },
  close() {
    this.record = null; this.result = null;
    settings.lastClient = null; store.saveSettings(settings);
    this.renderChrome();
    this.go('#/home', true);
  },
  newClient(name) {
    const rec = store.newRecord();
    if (name) Rec.setField(rec, 'sun', 'name', name, 'known', 'client');
    Rec.setField(rec, 'sun', 'state', 'NY', 'known', 'estimated'); /* MR-025: New York until the client says otherwise */
    store.save(rec);
    this.open(rec.id);
    return rec;
  },
  remove(id) {
    store.remove(id);
    if (this.record && this.record.id === id) this.close(); else this.rerender();
  },

  /* ---- changes: every one goes through here ---- */
  change(fn, opts) {
    if (!this.record) return null;
    const line = fn(this.record);
    if (line === null) return null;
    this.markUnsaved();
    this.recompute();
    if (!(opts && opts.silent)) this.update(opts && opts.reason);
    this.autosave();
    return line;
  },
  setField(rowId, fieldId, value, state, source, cad) {
    return this.change(rec => Rec.setField(rec, rowId, fieldId, value, state, source, { session: this.session, cad }));
  },
  setColumn(rowId, column, value) {
    return this.change(rec => Rec.setColumn(rec, rowId, column, value, { session: this.session }));
  },
  addRow(row) { return this.change(rec => Rec.addRow(rec, row, { session: this.session }), { reason: 'rows' }); },
  removeRows(ids) {
    let n = 0;
    const line = this.change(rec => { let last = null; ids.forEach(id => { const l = Rec.removeRow(rec, id, { session: this.session }); if (l) { last = l; n++; } }); return last; }, { reason: 'rows' });
    if (line) this.toast(n + (n === 1 ? ' row removed' : ' rows removed'), { label: 'Undo', action: () => { for (let i = 0; i < n; i++) this.undo(); } });
    return line;
  },
  removeRow(rowId) {
    const line = this.change(rec => Rec.removeRow(rec, rowId, { session: this.session }), { reason: 'rows' });
    if (line) this.toast('Row removed', { label: 'Undo', action: () => this.undo() });
    return line;
  },
  undo() { const l = this.change(rec => Rec.undo(rec), { reason: 'rows' }); if (l) this.toast('Undone'); return l; },
  redo() { const l = this.change(rec => Rec.redo(rec), { reason: 'rows' }); if (l) this.toast('Redone'); return l; },
  addQuickNote(text) { return this.change(rec => Rec.addQuickNote(rec, text, { screen: this.route.name, session: this.session }), { reason: 'notes' }); },
  mutate(fn, reason) { return this.change(rec => { fn(rec); return true; }, { reason }); },
  /* ---- Level 8 (MR-045 to MR-049): the discovery call, the household, the tier, anchors, call progress and targets ---- */
  setFieldWhy(rowId, fieldId, value, state, source, cad, why) { return this.change(rec => Rec.setField(rec, rowId, fieldId, value, state, source, { session: this.session, cad, why })); },
  discovery(form) { const line = this.change(rec => { applyDiscovery(rec, form, this.data, { session: this.session || 'discovery' }); if (form.mindset && form.mindset.stress) recordStress(rec, 'discovery', form.mindset.stress, { session: 'discovery' }); return true; }, { reason: 'rows' }); /* the scorecard's first-call numbers (Level 10, MR-056) */ this.change(rec => { captureBaseline(rec, snapshotValues(rec, this.result), {}); return true; }, { reason: 'program', silent: true }); return line; },
  household(hh, why) { return this.change(rec => { Rec.setHousehold(rec, hh, { session: this.session, why: why === undefined ? null : why }); applyGuesses(rec, this.data, { session: this.session }); return true; }, { reason: 'rows' }); },
  colTier(tier) { return this.change(rec => { Rec.setColTier(rec, tier, { session: this.session }); applyGuesses(rec, this.data, { session: this.session }); return true; }, { reason: 'rows' }); },
  refillGuesses() { return this.change(rec => { applyGuesses(rec, this.data, { session: this.session }); return true; }, { reason: 'rows' }); },
  anchor(set, key, value, meta) { return this.change(rec => { const a = anchorSet(rec, set, key, value, Object.assign({ session: this.session, source: 'call' }, meta || {})); return a ? true : null; }, { reason: 'anchors' }); },
  reanchor(set, key, value, meta) { return this.change(rec => { anchorAgain(rec, set, key, value, Object.assign({ session: this.session, source: 'call' }, meta || {})); return true; }, { reason: 'anchors' }); },
  callStop(stopId, status) { return this.change(rec => { markStop(rec, this.session || 'current', stopId, status); return true; }, { reason: 'call', silent: true }); },
  confirmDiscovery(key) { return this.change(rec => { rec.discovery = rec.discovery || { confirmed: {} }; rec.discovery.confirmed = rec.discovery.confirmed || {}; rec.discovery.confirmed[key] = new Date().toISOString(); return true; }, { reason: 'call', silent: true }); },
  target(key, choice, cents, actualAt, label) { return this.change(rec => { targetSet(rec, key, choice, cents, { session: this.session, actualAt, label, owner: (clientName(rec) || 'Client').split(' ')[0] }); return true; }, { reason: 'targets' }); },
  setMode(mode) { return this.change(rec => { rec.sessionMode = mode; return true; }, { reason: 'mode' }); },
  goals(patch) { return this.change(rec => Rec.setGoals(rec, patch, { session: this.session }), { reason: 'goals' }); },

  recompute() {
    if (!this.record) { this.result = null; return; }
    const t0 = performance.now();
    this.result = this.compute ? this.compute(this.record, this.data) : null;
    this.lastComputeMs = performance.now() - t0;
  },
  compute: null,

  /* ---- saving ---- */
  markUnsaved() { this.saveState = 'unsaved'; this.renderSaved(); },
  autosave: debounce(function () { app.saveNow(); }, 300),
  saveNow() {
    if (!this.record) return;
    this.saveState = 'saving'; this.renderSaved();
    store.save(this.record);
    this.saveState = 'saved'; this.renderSaved();
  },
  renderSaved() {
    const el = qs('#saved');
    if (!el) return;
    if (!this.record) { el.textContent = ''; el.dataset.state = ''; return; }
    el.dataset.state = this.saveState;
    el.textContent = this.saveState === 'saved' ? 'Saved' : this.saveState === 'saving' ? 'Saving' : 'Editing';
  },

  /* ---- view toggle ---- */
  setView(v) {
    this.view = v === 'client' ? 'client' : 'coach';
    document.body.dataset.view = this.view;
    settings.view = this.view; store.saveSettings(settings);
    qs('#view-coach').setAttribute('aria-pressed', String(this.view === 'coach'));
    qs('#view-client').setAttribute('aria-pressed', String(this.view === 'client'));
    this.rerender();
  },
  toggleView() { this.setView(this.view === 'coach' ? 'client' : 'coach'); },

  /* ---- theme (MR-028): follows the system until the switch picks one ---- */
  applyTheme() {
    const t = settings.theme === 'dark' || settings.theme === 'light' ? settings.theme : null;
    if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
    const dark = t ? t === 'dark' : (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const btn = qs('#theme-btn'); if (btn) { btn.textContent = dark ? 'Light' : 'Dark'; btn.setAttribute('aria-pressed', String(dark)); }
    return dark;
  },
  toggleTheme() {
    const dark = this.applyTheme();
    settings.theme = dark ? 'light' : 'dark'; store.saveSettings(settings);
    this.applyTheme();
  },

  /* ---- routing ---- */
  parseHash(hash) {
    const parts = (hash || '#/home').replace(/^#\/?/, '').split('/').filter(Boolean);
    const name = parts[0] || 'home';
    return { name: routes[name] ? name : 'home', params: { id: parts[1] || null, sub: parts[2] || null } };
  },
  go(hash, replace) {
    if (replace) history.replaceState(null, '', hash); else location.hash = hash;
    this.render();
  },
  render() {
    this.route = this.parseHash(location.hash);
    let def = routes[this.route.name];
    if (def.coachOnly && this.view === 'client') { history.replaceState(null, '', '#/measure'); this.route = this.parseHash('#/measure'); def = routes.measure; }
    const main = qs('#main');
    clear(main);
    closeOverlay();
    if (def.needsClient && !this.record) {
      main.appendChild(h('div', { class: 'empty' },
        h('h2', null, 'No client open'),
        h('p', null, 'Open a client or make a new one on the home screen first.'),
        h('p', null, h('a', { class: 'next', href: '#/home' }, 'Go to home'))));
      this.mounted = null;
    } else {
      this.mounted = def.mount(main, this);
      if (this.record && this.view === 'coach' && (this.route.name === 'home' || this.route.name === 'ledger')) { const tr = h('div', { id: 'tracker' }); main.prepend(tr); renderTracker(tr, this); }
    }
    this.renderNav();
    if (this.focusAfterRender) { const f = this.focusAfterRender; this.focusAfterRender = null; const el = main.querySelector('tr[data-row="' + f.rowId + '"] [data-col="' + f.field + '"], .fieldrow[data-field="' + f.field + '"] .control input, .fieldrow[data-field="' + f.field + '"] .control select'); if (el) { el.focus(); if (el.scrollIntoView) el.scrollIntoView({ block: 'center' }); } else if (this.mounted && this.mounted.openDetails) this.mounted.openDetails(f.rowId, f.field); }
    document.title = (def.title || 'Home') + (this.record ? ' - ' + (clientName(this.record) || 'Client') : '') + ' - Money Rooms';
    window.scrollTo(0, 0);
  },
  rerender() { this.render(); },
  update(reason) {
    if (this.mounted && this.mounted.update) this.mounted.update(reason);
    const tr = qs('#tracker'); if (tr) renderTracker(tr, this);
    this.renderNav();
    this.renderChrome();
  },
  renderNav() {
    const nav = qs('#sidenav');
    clear(nav);
    const items = navItems(this);
    let group = null;
    items.forEach(it => {
      if (it.group && it.group !== group) { group = it.group; nav.appendChild(h('h3', { class: 'group' }, group)); }
      const a = h('a', { href: it.href, 'aria-current': it.active(this.route) ? 'page' : null, class: it.coachOnly ? 'coach-only' : null },
        h('span', { class: 'navlabel' }, it.label),
        it.fill !== undefined && it.fill !== null ? h('span', { class: 'fill-text', title: 'confidence' }, Math.round(it.fill * 100) + '%') : null,
        it.key ? h('span', { class: 'kbd coach-only' }, it.key) : null);
      nav.appendChild(a);
    });
  },
  renderChrome() {
    qs('#topbar-client').textContent = this.record ? (clientName(this.record) || 'Unnamed client') : '';
    qs('#undo').disabled = !this.record || !Rec.canUndo(this.record);
    qs('#redo').disabled = !this.record || !Rec.canRedo(this.record);
    this.renderSaved();
  },

  /* ---- notices ---- */
  toast(text, opts) {
    const overlay = qs('#overlay');
    const old = qs('.toast', overlay); if (old) old.remove();
    const t = h('div', { class: 'toast', role: 'status' }, text,
      opts && opts.action ? h('button', { onClick: () => { opts.action(); t.remove(); } }, opts.label || 'Undo') : null);
    overlay.appendChild(t);
    setTimeout(() => { if (t.parentNode) t.remove(); }, opts && opts.ms ? opts.ms : 4000);
  },
  openDrawer(node, opts) {
    closeOverlay();
    const o = opts || {};
    const before = document.activeElement;
    overlayOnClose = () => { if (o.onClose) o.onClose(); else if (before && before.isConnected && before.focus) before.focus(); };
    const d = h('aside', { class: 'drawer' + (o.cls ? ' ' + o.cls : ''), role: 'dialog', 'aria-label': o.label || 'Details' },
      h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, h('button', { class: 'btn small', onClick: closeOverlay }, 'Close')),
      node);
    qs('#overlay').appendChild(d);
    d.querySelector('button').focus();
  },
  quickNoteBar() {
    if (!this.record) return;
    closeOverlay();
    const input = h('input', { class: 'input', type: 'text', 'aria-label': 'Quick note' });
    const bar = h('div', { class: 'quicknote' }, input,
      h('button', { class: 'btn primary', onClick: save }, 'Add'),
      h('button', { class: 'btn', onClick: closeOverlay }, 'Cancel'));
    const self = this;
    function save() {
      const t = input.value.trim();
      if (t) { self.addQuickNote(t); self.toast('Note added to my plate'); }
      closeOverlay();
    }
    input.addEventListener('keydown', e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') closeOverlay(); });
    qs('#overlay').appendChild(bar);
    input.focus();
  },
  helpPanel() {
    this.openDrawer(h('div', null,
      h('h2', null, 'Keyboard'),
      h('table', { class: 'data', style: { marginTop: '8px' } },
        h('tbody', null, SHORTCUTS.map(s => h('tr', null, h('td', null, h('span', { class: 'kbd' }, s[0])), h('td', null, s[1]))))),
      h('h2', { style: { marginTop: '16px' } }, 'Answer states (one key in a state chip)'),
      h('p', { class: 'small muted' }, 'v Verified, k Known, r Rough, w Will send, u Unknown, n None, a Not applicable, x Not for me'),
      h('h2', { style: { marginTop: '16px' } }, 'Sources'),
      h('p', { class: 'small muted' }, 'c Client, l Looked up, y Looked up (verify), i Inferred, e Guess, d What you said')));
  },
};

const SHORTCUTS = [
  ['Alt+D', 'Open the Details of the row you are in'],
  ['~ ? send 0', 'Typed before a number in any cell: ~ rough, ? unknown, send (the client will send it), 0 is a real zero, 1500-2000 is a range'],
  ['`', 'Toggle Coach and Client view'],
  ['Ctrl+Z', 'Undo'], ['Ctrl+Shift+Z', 'Redo'],
  ['Ctrl+.', 'Quick note'],
  ['Alt+1 to Alt+8', 'Go to a screen'],
  ['Enter', 'In a table: move down a row'], ['Tab', 'Next field'],
  ['Alt+N', 'Add a row to the open table'],
  ['Alt+S / Alt+O', 'In a cell: set its state / its source with one more key'],
  ['Alt+Delete', 'Remove the row you are in (undoable)'],
  ['Esc', 'Close a drawer or note bar'],
  ['?', 'This panel'],
];

export function clientName(rec) { return rec && rec.sun && rec.sun.f.name ? (rec.sun.f.name.v || '') : ''; }

let overlayOnClose = null;
export function closeOverlay() {
  const had = qs('#overlay').firstChild;
  clear(qs('#overlay'));
  const fn = overlayOnClose; overlayOnClose = null;
  if (had && fn) fn();
}

function inInput(e) {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}

function boot() {
  installUnlockWatch(app); /* MR-059: every save is compared before and after for what it opened up */
  document.body.dataset.view = app.view;
  qs('#view-coach').setAttribute('aria-pressed', String(app.view === 'coach'));
  qs('#view-client').setAttribute('aria-pressed', String(app.view === 'client'));
  qs('#view-coach').addEventListener('click', () => app.setView('coach'));
  qs('#view-client').addEventListener('click', () => app.setView('client'));
  qs('#theme-btn').addEventListener('click', () => app.toggleTheme());
  app.applyTheme();
  qs('#undo').addEventListener('click', () => app.undo());
  qs('#redo').addEventListener('click', () => app.redo());
  qs('#quicknote-btn').addEventListener('click', () => app.quickNoteBar());
  qs('#help-btn').addEventListener('click', () => app.helpPanel());
  window.addEventListener('hashchange', () => app.render());
  window.addEventListener('keydown', e => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.shiftKey && e.key.toLowerCase() === 'z' && !inInput(e)) { e.preventDefault(); app.undo(); return; }
    if (mod && e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); app.redo(); return; }
    if (mod && e.key === '.') { e.preventDefault(); app.quickNoteBar(); return; }
    if (e.key === 'Escape') { closeOverlay(); return; }
    if (e.altKey && (e.key === 'n' || e.key === 'N') && app.mounted && app.mounted.addRow && !inInput(e)) { e.preventDefault(); app.mounted.addRow(); return; }
    if (e.altKey && /^[0-9]$/.test(e.key)) {
      const items = navItems(app);
      const n = e.key === '0' ? 10 : parseInt(e.key, 10);
      const it = items[n - 1];
      if (it) { e.preventDefault(); location.hash = it.href; }
      return;
    }
    if (inInput(e)) return;
    if (e.key === '`') { e.preventDefault(); app.toggleView(); return; }
    if (e.key === '?') { e.preventDefault(); app.helpPanel(); }
  });
  window.addEventListener('beforeunload', () => { if (app.saveState !== 'saved') app.saveNow(); });

  const ready = app.loadData ? app.loadData() : Promise.resolve();
  ready.then(() => {
    if (settings.lastClient && store.load(settings.lastClient)) app.open(settings.lastClient);
    else app.render();
    app.renderChrome();
  });
}

/* Export and import live on the home screen but the helpers are shared. */
export function exportClient(rec) {
  const name = (clientName(rec) || 'client').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  download('money-rooms-' + name + '-' + new Date().toISOString().slice(0, 10) + '.json', store.exportJson(rec));
}
export async function importFile(file) {
  const text = await readFile(file);
  const { record, snapshotKey } = store.importJson(text);
  app.open(record.id);
  if (snapshotKey) {
    app.toast('Imported over the saved copy', { label: 'Undo import', ms: 10000, action: () => { const r = store.undoImport(snapshotKey); if (r) app.open(r.id); } });
  } else {
    app.toast('Imported ' + (clientName(record) || 'client'));
  }
  return record;
}

globalThis.mr3 = app;
import('./compute-bridge.js').then(m => { m.attach(app); boot(); });
