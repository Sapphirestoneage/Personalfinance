/* The shell: one record, one computed result, hash routes, the Coach/Client
   toggle, autosave with a visible "Saved", undo/redo, quick notes and the
   keyboard shortcuts. Views mount into <main> and get update() calls;
   they never do math. */

import { createStore } from '../engine/store.js';
import * as Rec from '../engine/record.js';
import { h, clear, qs, debounce, download, readFile } from './dom.js';
import { routes, navItems } from './routes.js';

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
  removeRow(rowId) {
    const line = this.change(rec => Rec.removeRow(rec, rowId, { session: this.session }), { reason: 'rows' });
    if (line) this.toast('Row removed', { label: 'Undo', action: () => this.undo() });
    return line;
  },
  undo() { const l = this.change(rec => Rec.undo(rec), { reason: 'rows' }); if (l) this.toast('Undone'); return l; },
  redo() { const l = this.change(rec => Rec.redo(rec), { reason: 'rows' }); if (l) this.toast('Redone'); return l; },
  addQuickNote(text) { return this.change(rec => Rec.addQuickNote(rec, text, { screen: this.route.name, session: this.session }), { reason: 'notes' }); },
  mutate(fn, reason) { return this.change(rec => { fn(rec); return true; }, { reason }); },

  recompute() {
    if (!this.record) { this.result = null; return; }
    this.result = this.compute ? this.compute(this.record, this.data) : null;
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
    const def = routes[this.route.name];
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
    }
    this.renderNav();
    document.title = (def.title || 'Home') + (this.record ? ' - ' + (clientName(this.record) || 'Client') : '') + ' - Money Rooms';
    window.scrollTo(0, 0);
  },
  rerender() { this.render(); },
  update(reason) {
    if (this.mounted && this.mounted.update) this.mounted.update(reason);
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
        it.label,
        it.fill !== undefined && it.fill !== null ? h('span', { class: 'fill', title: Math.round(it.fill * 100) + '% confidence' }, h('span', { style: { width: Math.round(it.fill * 100) + '%' } })) : null,
        it.fill !== undefined && it.fill !== null ? h('span', { class: 'fill-text' }, Math.round(it.fill * 100) + '%') : null,
        it.key ? h('span', { class: 'kbd' }, it.key) : null);
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
  openDrawer(node) {
    closeOverlay();
    const d = h('aside', { class: 'drawer', role: 'dialog', 'aria-label': 'Details' },
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
      h('p', { class: 'small muted' }, 'c Client, l Looked up, y Looked up (verify), i Inferred, e Estimated')));
  },
};

const SHORTCUTS = [
  ['`', 'Toggle Coach and Client view'],
  ['Ctrl+Z', 'Undo'], ['Ctrl+Shift+Z', 'Redo'],
  ['Ctrl+.', 'Quick note'],
  ['Alt+1 to Alt+8', 'Go to a screen'],
  ['Enter', 'In a table: move down a row'], ['Tab', 'Next field'],
  ['Alt+N', 'Add a row to the open table'],
  ['Alt+Delete', 'Remove the row you are in (undoable)'],
  ['Esc', 'Close a drawer or note bar'],
  ['?', 'This panel'],
];

export function clientName(rec) { return rec && rec.sun && rec.sun.f.name ? (rec.sun.f.name.v || '') : ''; }

export function closeOverlay() { clear(qs('#overlay')); }

function inInput(e) {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}

function boot() {
  document.body.dataset.view = app.view;
  qs('#view-coach').setAttribute('aria-pressed', String(app.view === 'coach'));
  qs('#view-client').setAttribute('aria-pressed', String(app.view === 'client'));
  qs('#view-coach').addEventListener('click', () => app.setView('coach'));
  qs('#view-client').addEventListener('click', () => app.setView('client'));
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
    if (e.altKey && /^[1-8]$/.test(e.key)) {
      const items = navItems(app).filter(i => !i.group || true);
      const it = items[parseInt(e.key, 10) - 1];
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

import('./compute-bridge.js').then(m => { m.attach(app); boot(); });
