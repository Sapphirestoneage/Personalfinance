/* The shell: one record, one computed result, hash routes, the Coach/Client
   toggle, autosave with a visible "Saved", undo/redo, quick notes and the
   keyboard shortcuts. Views mount into <main> and get update() calls;
   they never do math. */

import { createStore } from '../engine/store.js';
import * as Rec from '../engine/record.js';
import { h, clear, qs, debounce, download, readFile } from './dom.js';
import { getSensitivity } from './levers-bridge.js';
import { installUnlockWatch } from './unlocks.js';
import { routes, navItems, searchTargets } from './routes.js';
import { progressTabs } from './progress.js';
import { renderTracker } from './tracker.js';
import { applyDiscovery, applyGuesses } from '../engine/discovery.js';
import { setAnchor as anchorSet, reanchor as anchorAgain } from '../engine/anchors.js';
import { markStop } from '../engine/callpath.js';
import { setTarget as targetSet } from '../engine/targets.js';
import { recordStress, captureBaseline } from '../engine/program.js';
import { snapshotValues } from '../engine/outcomes.js';
import { takeSnapshot, seedCelebrations } from '../engine/momentum.js';
import { setRough } from '../engine/format.js';

const store = createStore();
const settings = store.settings();

export const app = {
  store,
  record: null,
  result: null,
  view: settings.presenting || settings.view === 'client' ? 'client' : 'coach',
  presenting: !!settings.presenting, /* MR-072: locked to Client view while sharing a screen */
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
    if (this.data) Rec.ensureProfileRows(rec, this.data.fields, { session: this.session }); /* MR-064: the profile forms have their rows before any screen draws */
    settings.lastClient = id;
    store.saveSettings(settings);
    this.recompute();
    /* MR-057: the levers' sensitivity run starts now, off the main thread, so #/levers opens with its numbers */
    if (this.result && this.result.metrics && this.result.metrics.fiDate && this.result.metrics.fiDate.status === 'ok') getSensitivity(this, () => {});
    this.renderChrome();
    this.go(this.parseHash(location.hash).name === 'home' ? '#/home' : location.hash, true); /* stay where the address bar says, a reload on the Plan included */
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
  discovery(form) { const line = this.change(rec => { applyDiscovery(rec, form, this.data, { session: this.session || 'discovery' }); if (form.mindset && form.mindset.stress) recordStress(rec, 'discovery', form.mindset.stress, { session: 'discovery' }); return true; }, { reason: 'rows' }); /* the scorecard's first-call numbers (Level 10, MR-056) */ this.change(rec => { captureBaseline(rec, snapshotValues(rec, this.result), {}); if (this.result && !(rec.snapshots || []).length) { seedCelebrations(rec, this.result, this.data, { session: 'discovery' }); takeSnapshot(rec, this.result, 'discovery', { session: 'discovery' }); } return true; }, { reason: 'program', silent: true }); return line; },
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
    if (this.presenting && v !== 'client') { this.toast('Presenting is on. Turn it off first.'); return; }
    this.view = v === 'client' ? 'client' : 'coach';
    setRough(this.view === 'client' ? 'about' : 'tilde');
    document.body.dataset.view = this.view;
    settings.view = this.view; store.saveSettings(settings);
    qs('#view-coach').setAttribute('aria-pressed', String(this.view === 'coach'));
    qs('#view-client').setAttribute('aria-pressed', String(this.view === 'client'));
    this.rerender();
  },
  toggleView() { this.setView(this.view === 'coach' ? 'client' : 'coach'); },

  /* ---- Presenting (MR-072): one switch locks the app to Client view and hides every other client's name, notes and coach-only panel ---- */
  setPresenting(on, opts) {
    const o = opts || {};
    if (!on && this.presenting && !o.confirmed) { this.confirm('Stop presenting? The coach view, the client list and your notes come back on screen.', { label: 'Stop presenting', onConfirm: () => this.setPresenting(false, { confirmed: true }) }); return; }
    this.presenting = !!on;
    settings.presenting = this.presenting; store.saveSettings(settings);
    document.body.dataset.presenting = String(this.presenting);
    const btn = qs('#present-btn'); if (btn) { btn.setAttribute('aria-pressed', String(this.presenting)); btn.textContent = this.presenting ? 'Presenting' : 'Present'; btn.title = this.presenting ? 'Presenting: locked to Client view. Click to stop.' : 'Presenting mode: lock the app to Client view while you share the screen'; }
    if (this.presenting) { this.setView('client'); if (!o.quiet) this.toast('Presenting: only the client view shows until you turn it off.'); }
    else { this.setView('coach'); if (!o.quiet) this.toast('Presenting is off.'); }
  },
  /* an in-page confirmation (MR-072): no browser dialogs; the big actions ask here and offer Undo after */
  confirm(text, opts) {
    const o = opts || {};
    const body = h('div', { class: 'confirm-body' }, h('h2', null, o.title || 'Are you sure?'), h('p', { class: 'readaloud' }, text),
      h('div', { class: 'row', style: { marginTop: '12px' } }, h('button', { class: 'btn primary', onClick: () => { closeOverlay(); o.onConfirm(); } }, o.label || 'Yes, do it'), h('button', { class: 'btn', onClick: closeOverlay }, 'Cancel')));
    this.openDrawer(body, { label: o.title || 'Confirm', cls: 'confirm-drawer' });
  },

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
    if (this.presenting && this.view !== 'client') { this.view = 'client'; setRough('about'); }
    if (def.coachOnly && this.view === 'client') { history.replaceState(null, '', '#/scoreboard'); this.route = this.parseHash('#/scoreboard'); def = routes.scoreboard; }
    const main = qs('#main');
    clear(main);
    closeOverlay();
    document.body.dataset.section = def.section || '';
    const t0 = performance.now();
    if (def.needsClient && !this.record) {
      main.appendChild(h('div', { class: 'empty' },
        h('h1', null, def.title),
        h('p', null, 'Open a client first.'),
        h('p', null, h('a', { class: 'btn primary', href: this.view === 'coach' ? '#/clients' : '#/home' }, this.view === 'coach' ? 'Open a client' : 'Home'))));
      this.mounted = null;
    } else {
      this.mounted = def.mount(main, this);
      if (this.record && this.view === 'coach' && this.route.name === 'ledger') { const tr = h('div', { id: 'tracker' }); main.prepend(tr); renderTracker(tr, this); }
      if (this.record && ['scoreboard', 'measure', 'map', 'onepager'].includes(this.route.name)) main.prepend(progressTabs(this, this.route.name));
    }
    this.lastRenderMs = performance.now() - t0;
    stackTables(main);
    if (this.route.name === 'call' && this.view === 'client' && !this.presenting) this.setPresenting(true, { quiet: true });
    this.renderNav();
    if (this.focusAfterRender) { const f = this.focusAfterRender; this.focusAfterRender = null; const el = main.querySelector('tr[data-row="' + f.rowId + '"] [data-col="' + f.field + '"], .fieldrow[data-field="' + f.field + '"] .control input, .fieldrow[data-field="' + f.field + '"] .control select'); if (el) { el.focus(); if (el.scrollIntoView) el.scrollIntoView({ block: 'center' }); } else if (this.mounted && this.mounted.openDetails) this.mounted.openDetails(f.rowId, f.field); }
    document.title = (def.title || 'Today') + (this.record ? ' - ' + (clientName(this.record) || 'Client') : '') + ' - Money Rooms';
    window.scrollTo(0, 0);
  },
  rerender() { this.render(); },
  update(reason) {
    if (this.mounted && this.mounted.update) this.mounted.update(reason);
    stackTables(qs('#main'));
    const tr = qs('#tracker'); if (tr) renderTracker(tr, this);
    this.renderNav();
    this.renderChrome();
  },
  renderNav() {
    const nav = qs('#sidenav');
    clear(nav);
    const items = navItems(this);
    /* MR-072: type to jump anywhere; slash focuses the box */
    const q = h('input', { class: 'input nav-search', type: 'search', 'aria-label': 'Search screens, rows, numbers and calculators', title: 'Type to jump (/)', value: this.navQuery || '' });
    const results = h('div', { class: 'nav-results', hidden: 'hidden' });
    const paintResults = () => {
      clear(results); const text = q.value.trim().toLowerCase(); this.navQuery = q.value;
      if (!text) { results.setAttribute('hidden', 'hidden'); nav.querySelectorAll('.group, .group-items').forEach(el => { el.style.display = ''; }); return; }
      results.removeAttribute('hidden'); nav.querySelectorAll('.group, .group-items').forEach(el => { el.style.display = 'none'; });
      const hits = searchTargets(this).filter(t => t.label.toLowerCase().indexOf(text) !== -1).slice(0, 12);
      if (!hits.length) { results.appendChild(h('p', { class: 'small muted nav-none' }, 'Nothing called that.')); return; }
      hits.forEach(t => results.appendChild(h('a', { href: t.href, class: 'nav-hit', onClick: () => { q.value = ''; this.navQuery = ''; document.body.classList.remove('nav-open'); } }, h('span', { class: 'navlabel' }, t.label), h('span', { class: 'small muted nav-where' }, t.where))));
    };
    q.addEventListener('input', paintResults);
    q.addEventListener('keydown', e => { if (e.key === 'Escape') { q.value = ''; paintResults(); q.blur(); } if (e.key === 'Enter') { const first = results.querySelector('a'); if (first) { location.hash = first.getAttribute('href'); q.value = ''; paintResults(); } } });
    nav.appendChild(h('div', { class: 'nav-search-wrap' }, h('label', { class: 'small muted nav-search-label', for: 'nav-search' }, 'Jump to'), q));
    q.id = 'nav-search';
    nav.appendChild(results);
    const folded = settings.navFolded || {};
    let group = null; let box = nav;
    items.forEach(it => {
      if (it.group && it.group !== group) {
        group = it.group; const open = !folded[group] || items.some(x => x.group === group && x.active(this.route));
        const btn = h('button', { class: 'group', 'aria-expanded': String(open), onClick: () => { settings.navFolded = Object.assign({}, settings.navFolded || {}, { [group]: open }); store.saveSettings(settings); this.renderNav(); } }, h('span', null, group), h('span', { class: 'caret', 'aria-hidden': 'true' }, open ? '\u25BE' : '\u25B8'));
        box = h('div', { class: 'group-items', hidden: open ? null : 'hidden' });
        nav.appendChild(btn); nav.appendChild(box);
      }
      const a = h('a', { href: it.href, 'aria-current': it.active(this.route) ? 'page' : null, class: it.coachOnly ? 'coach-only' : null, onClick: () => { document.body.classList.remove('nav-open'); const nb = qs('#nav-btn'); if (nb) nb.setAttribute('aria-expanded', 'false'); } },
        h('span', { class: 'navlabel' }, it.label),
        it.fill !== undefined && it.fill !== null ? h('span', { class: 'fill-text', title: 'confidence' }, Math.round(it.fill * 100) + '%') : null,
        it.key ? h('span', { class: 'kbd coach-only' }, it.key) : null);
      box.appendChild(a);
    });
    if (this.navQuery) paintResults();
  },
  toggleNav(force) {
    const open = force === undefined ? !document.body.classList.contains('nav-open') : !!force;
    document.body.classList.toggle('nav-open', open);
    const nb = qs('#nav-btn'); if (nb) nb.setAttribute('aria-expanded', String(open));
  },
  renderChrome() {
    qs('#topbar-client').textContent = this.record ? (clientName(this.record) || 'Unnamed client') : '';
    document.body.dataset.presenting = String(!!this.presenting);
    const pb = qs('#present-btn'); if (pb) { pb.setAttribute('aria-pressed', String(!!this.presenting)); pb.textContent = this.presenting ? 'Presenting' : 'Present'; }
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
      h('div', { class: 'row drawer-top' }, o.title ? h('strong', { class: 'drawer-title' }, o.title) : null, h('span', { class: 'spacer' }), h('button', { class: 'btn small', onClick: closeOverlay }, 'Close')),
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
    const def = routes[this.route.name] || routes.home;
    const keys = h('div', { class: 'help-keys', hidden: 'hidden' });
    const more = h('button', { class: 'btn small', 'aria-expanded': 'false', onClick: () => { const open = keys.hasAttribute('hidden'); if (open) keys.removeAttribute('hidden'); else keys.setAttribute('hidden', 'hidden'); more.setAttribute('aria-expanded', String(open)); more.textContent = open ? 'Hide the keyboard shortcuts' : 'Keyboard shortcuts'; } }, 'Keyboard shortcuts');
    keys.appendChild(h('h2', { style: { marginTop: '16px' } }, 'Keyboard'));
    keys.appendChild(h('table', { class: 'data', style: { marginTop: '8px' } },
      h('tbody', null, SHORTCUTS.map(s => h('tr', null, h('td', null, h('span', { class: 'kbd' }, s[0])), h('td', null, s[1]))))));
    keys.appendChild(h('h2', { style: { marginTop: '16px' } }, 'Answer states (one key in a state chip)'));
    keys.appendChild(h('p', { class: 'small muted' }, 'v Verified, k Known, r Rough, w Will send, u Unknown, n None, a Not applicable, x Not for me'));
    keys.appendChild(h('h2', { style: { marginTop: '16px' } }, 'Sources'));
    keys.appendChild(h('p', { class: 'small muted' }, 'c Client, l Looked up, y Looked up (verify), i Inferred, e Guess, d What you said'));
    this.openDrawer(h('div', { class: 'help-body' },
      h('h2', null, 'This screen: ' + def.title),
      h('p', { class: 'readaloud' }, def.help || 'One screen of the money picture.'),
      h('p', { class: 'small' }, h('a', { href: '#/learn', onClick: closeOverlay }, 'The full guide'), this.view === 'coach' ? [' ', String.fromCharCode(0xb7), ' ', more] : null),
      this.view === 'coach' ? keys : null), { label: 'Help for this screen', title: 'Help' });
  },
};

const SHORTCUTS = [
  ['Alt+D', 'Open the Details of the row you are in'],
  ['~ ? send 0', 'Typed before a number in any cell: ~ rough, ? unknown, send (the client will send it), 0 is a real zero, 1500-2000 is a range'],
  ['`', 'Toggle Coach and Client view'],
  ['Ctrl+Z', 'Undo'], ['Ctrl+Shift+Z', 'Redo'],
  ['Ctrl+.', 'Quick note'],
  ['Alt+1 to Alt+9', 'Today, the seven rooms, Progress'],
  ['Enter', 'In a table: move down a row'], ['Tab', 'Next field'],
  ['Alt+N', 'Add a row to the open table'],
  ['Alt+S / Alt+O', 'In a cell: set its state / its source with one more key'],
  ['Alt+Delete', 'Remove the row you are in (undoable)'],
  ['Esc', 'Close a drawer or note bar'],
  ['?', 'This panel'],
];

/* MR-072: a data table with more than three columns stacks its rows on a phone; each cell learns its header's name */
export function stackTables(root) {
  if (!root) return;
  root.querySelectorAll('table.data').forEach(t => {
    const heads = Array.from(t.querySelectorAll('thead th')).map(th => th.textContent.trim());
    if (heads.length <= 3) { t.classList.remove('stack'); return; }
    t.classList.add('stack');
    t.querySelectorAll('tbody tr').forEach(tr => Array.from(tr.children).forEach((td, i) => { if (heads[i] && !td.dataset.label) td.dataset.label = heads[i]; }));
  });
}
export function clientName(rec) { return rec && rec.sun && rec.sun.f.name ? (rec.sun.f.name.v || '') : ''; }

let overlayOnClose = null;
export function closeOverlay() {
  /* drawers and bars close; a toast stays, so an Undo offered just before a screen change survives it (MR-072) */
  const kids = Array.from(qs('#overlay').children).filter(k => !k.classList.contains('toast'));
  const had = kids.length > 0;
  kids.forEach(k => k.remove());
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
  setRough(app.view === 'client' ? 'about' : 'tilde');
  qs('#view-coach').setAttribute('aria-pressed', String(app.view === 'coach'));
  qs('#view-client').setAttribute('aria-pressed', String(app.view === 'client'));
  qs('#view-coach').addEventListener('click', () => app.setView('coach'));
  qs('#view-client').addEventListener('click', () => app.setView('client'));
  qs('#theme-btn').addEventListener('click', () => app.toggleTheme());
  qs('#present-btn').addEventListener('click', () => app.setPresenting(!app.presenting));
  document.body.dataset.presenting = String(app.presenting);
  qs('#nav-btn').addEventListener('click', () => app.toggleNav());
  document.addEventListener('click', e => { if (document.body.classList.contains('nav-open') && !e.target.closest('#sidenav') && !e.target.closest('#nav-btn')) app.toggleNav(false); });
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
    if (e.key === 'Escape') { closeOverlay(); app.toggleNav(false); return; }
    if (e.altKey && (e.key === 'n' || e.key === 'N') && app.mounted && app.mounted.addRow && !inInput(e)) { e.preventDefault(); app.mounted.addRow(); return; }
    if (e.altKey && /^[0-9]$/.test(e.key)) {
      const it = navItems(app).find(i => i.key === 'Alt+' + e.key); /* MR-072: the shortcut is the item's own key, not its position in the grouped list */
      if (it) { e.preventDefault(); location.hash = it.href; }
      return;
    }
    if (inInput(e)) return;
    if (e.key === '/') { const box = qs('#sidenav .nav-search'); if (box) { e.preventDefault(); if (window.innerWidth < 1100) app.toggleNav(true); box.focus(); } return; }
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
  if (location.hash !== '#/home') location.hash = '#/home'; /* MR-072: an import opens the client's Today */
  if (snapshotKey) {
    app.toast('Imported over the saved copy', { label: 'Undo import', ms: 10000, action: () => { const r = store.undoImport(snapshotKey); if (r) app.open(r.id); } });
  } else {
    app.toast('Imported ' + (clientName(record) || 'client'));
  }
  return record;
}

globalThis.mr3 = app;
import('./compute-bridge.js').then(m => { m.attach(app); boot(); });
