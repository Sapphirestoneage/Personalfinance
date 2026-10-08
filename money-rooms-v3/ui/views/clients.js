/* Clients (Level 14, MR-072): every client in this browser, two visible
   buttons (Start a discovery call, Open a client), the rest under More, and
   the open client's details with the history journal that used to sit on
   Home. Coach view only. Views never do math. */
import { h, clear } from '../dom.js';
import * as F from '../../engine/format.js';
import { exportClient, importFile, clientName, closeOverlay } from '../app.js';
import { PLANET_SHORT } from '../../engine/sun.js';
import { programOf, nextSessionNumber } from '../../engine/program.js';
import { sessionCount } from '../../engine/curriculum.js';
import * as Rec from '../../engine/record.js';

export const DEMO_IDS = ['maya-discovery', 'leah', 'maya-zero'];

export function mount(host, app) {
  const sub = app.route.params.id || null;
  host.appendChild(h('header', null, h('h1', null, 'Clients'), h('span', { class: 'sub' }, 'Everything stays in this browser. Example numbers only.')));
  const list = h('section', { class: 'panel' }); const details = h('section', { class: 'panel' });
  host.appendChild(h('div', { class: 'grid grid-2 clients-grid' }, list, details));
  function draw() { renderList(list, app); renderDetails(details, app, sub); }
  draw();
  return { update() { draw(); } };
}

function sessionCell(app, c) {
  const rec = app.record && app.record.id === c.id ? app.record : app.store.load(c.id); if (!rec) return '';
  const total = sessionCount(app.data); const n = nextSessionNumber(rec); const P = programOf(rec);
  const where = n > total ? 'Graduated' : rec.discovery || Object.keys(P.sessions).length ? 'Session ' + n + ' of ' + total : 'Before the first call';
  return h('span', null, where, P.nextDate ? h('span', { class: 'muted' }, ', next ' + F.dateLong(P.nextDate)) : null);
}

export function renderList(panel, app) {
  clear(panel);
  const list = app.store.list();
  panel.appendChild(h('h2', null, 'Clients', h('span', { class: 'tag' }, list.length + (list.length === 1 ? ' client' : ' clients'))));
  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', class: 'sr-only', 'aria-label': 'Import a client file', onChange: async e => { const f = e.target.files[0]; if (!f) return; try { await importFile(f); } catch (err) { app.toast(err.message); } e.target.value = ''; } });
  const openSel = list.length ? h('select', { class: 'select', 'aria-label': 'Open a client', onChange: e => { if (e.target.value) { app.open(e.target.value); location.hash = '#/home'; } } }, h('option', { value: '' }, 'Open a client'), list.map(c => h('option', { value: c.id }, c.name || 'Unnamed client'))) : null;
  const more = h('details', { class: 'more-menu' }, h('summary', { class: 'btn', 'aria-label': 'More client actions' }, 'More'),
    h('div', { class: 'more-list' },
      h('button', { class: 'btn', 'aria-label': 'New client', onClick: () => { more.removeAttribute('open'); newClientDrawer(app); } }, 'New client without a call'),
      h('button', { class: 'btn', onClick: () => { more.removeAttribute('open'); fileInput.click(); } }, 'Import a client file'),
      h('button', { class: 'btn', title: 'Maya, the Jersey City client, as she stood after her first call', onClick: () => { more.removeAttribute('open'); loadDemo(app, 'maya-discovery'); } }, 'Load demo client (Maya)'),
      h('button', { class: 'btn', title: 'Leah, Oakland: a full example household with every room filled', onClick: () => { more.removeAttribute('open'); loadDemo(app, 'leah'); } }, 'Load the full example (Leah)'),
      h('button', { class: 'btn', title: 'A copy of Maya with nothing filled in', onClick: () => { more.removeAttribute('open'); startFromZero(app); } }, 'Start demo from zero'),
      list.some(c => DEMO_IDS.includes(c.id)) ? h('button', { class: 'btn quiet', onClick: () => { more.removeAttribute('open'); resetDemo(app); } }, 'Reset the demo clients') : null,
      fileInput));
  panel.appendChild(h('div', { class: 'row clients-actions' }, h('a', { class: 'btn primary', href: '#/discovery' }, 'Start a discovery call'), openSel, more));
  if (!list.length) {
    panel.appendChild(h('div', { class: 'empty first-visit' }, h('h3', null, 'No clients yet'),
      h('p', null, 'The first call makes the client: start a discovery call and type what you hear. Or load Maya to look around.'),
      h('div', { class: 'row', style: { marginTop: '12px' } }, h('button', { class: 'btn', onClick: () => loadDemo(app, 'maya-discovery') }, 'Load demo client (Maya)'))));
    return;
  }
  const tbl = h('table', { class: 'data clients-table' },
    h('thead', null, h('tr', null, h('th', null, 'Client'), h('th', null, 'Session'), h('th', null, ''))),
    h('tbody', null, list.map(c => {
      const open = app.record && app.record.id === c.id;
      return h('tr', { class: open ? 'selected' : null },
        h('td', null, h('a', { href: '#/clients/' + c.id, onClick: e => { e.preventDefault(); app.open(c.id); location.hash = '#/clients/' + c.id; } }, c.name || 'Unnamed client'), open ? h('span', { class: 'chip src', style: { marginLeft: '8px' } }, 'Open') : null, h('div', { class: 'muted small' }, 'Saved ' + F.dateLocal(c.updatedAt))),
        h('td', { class: 'small' }, sessionCell(app, c)),
        h('td', { class: 'num' }, h('a', { class: 'btn small primary', href: '#/home', onClick: () => { app.open(c.id); } }, 'Open')));
    })));
  panel.appendChild(h('div', { class: 'tablewrap' }, tbl));
}

function newClientDrawer(app) {
  const name = h('input', { class: 'input', type: 'text', 'aria-label': 'New client name' });
  const make = () => { const n = name.value.trim(); if (!n) { name.focus(); return; } closeOverlay(); app.newClient(n); location.hash = '#/ledger'; /* the household facts live on the Plan screen (MR-072) */ };
  name.addEventListener('keydown', e => { if (e.key === 'Enter') make(); });
  app.openDrawer(h('div', null, h('h2', null, 'New client'), h('p', { class: 'small muted' }, 'A first name is enough. The discovery call is the usual way in; this skips it.'), h('div', { class: 'row', style: { marginTop: '8px' } }, name, h('button', { class: 'btn primary', onClick: make }, 'Create'))), { label: 'New client' });
  setTimeout(() => name.focus(), 0);
}

/* The demo households (MR-057, MR-072): Maya is the Jersey City client right after her discovery call; Leah is the full Oakland example. */
export async function loadDemo(app, which) {
  const file = which === 'leah' ? 'tests/households/leah.json' : 'tests/households/maya-discovery.json';
  try {
    const res = await fetch(file);
    if (!res.ok) throw new Error('demo file not found');
    const text = await res.text();
    const { record } = app.store.importJson(text);
    app.open(record.id);
    app.toast('Loaded ' + (clientName(record) || 'the demo client') + '. Example numbers only.');
    location.hash = '#/home';
  } catch (e) { app.toast('Could not load the demo: ' + e.message); }
}
export function startFromZero(app) {
  if (app.store.load('maya-zero')) app.remove('maya-zero');
  const rec = app.store.newRecord(); const born = rec.id;
  rec.id = 'maya-zero';
  Rec.setField(rec, 'sun', 'name', 'Maya, from zero', 'known', 'client');
  app.store.save(rec); app.store.remove(born);
  app.open(rec.id);
  app.toast('A blank copy of Maya. Enter her numbers one at a time.');
  location.hash = '#/home';
}
export function resetDemo(app) {
  app.confirm('Reset the demo clients? Maya, Leah and the from-zero copy are wiped and Maya is loaded fresh. Your other clients are untouched.', { title: 'Reset the demo', label: 'Reset the demo', onConfirm: () => {
    const snapshots = DEMO_IDS.map(id => { const r = app.store.load(id); return r ? app.store.exportJson(r) : null; }).filter(Boolean);
    DEMO_IDS.forEach(id => { if (app.store.load(id)) app.remove(id); });
    loadDemo(app, 'maya-discovery');
    app.toast('Demo reset.', { label: 'Undo', ms: 10000, action: () => { snapshots.forEach(sn => app.store.importJson(sn)); app.rerender(); } });
  } });
}

export function confirmRemove(app, c) {
  app.confirm('Delete ' + (c.name || 'this client') + '? Everything typed for them goes with it. You can undo for ten seconds after.', { title: 'Delete client', label: 'Delete ' + (c.name || 'client'), onConfirm: () => {
    const snapshot = app.store.exportJson(app.store.load(c.id));
    app.remove(c.id);
    location.hash = '#/clients';
    app.toast('Deleted ' + (c.name || 'client'), { label: 'Undo', ms: 10000, action: () => { app.store.importJson(snapshot); app.open(c.id); app.rerender(); } });
  } });
}

function renderDetails(panel, app, sub) {
  clear(panel);
  const id = sub || (app.record ? app.record.id : null);
  const rec = id ? (app.record && app.record.id === id ? app.record : app.store.load(id)) : null;
  if (!rec) { panel.appendChild(h('h2', null, 'Details')); panel.appendChild(h('p', { class: 'muted small' }, 'Pick a client to see their sessions and the history of every change.')); return; }
  const name = clientName(rec) || 'Unnamed client';
  panel.appendChild(h('h2', null, name, h('span', { class: 'tag' }, 'details')));
  panel.appendChild(h('div', { class: 'row', style: { marginBottom: '8px' } },
    app.record && app.record.id === rec.id ? h('a', { class: 'btn primary', href: '#/home' }, 'Today') : h('button', { class: 'btn primary', onClick: () => { app.open(rec.id); location.hash = '#/clients/' + rec.id; } }, 'Open'),
    h('button', { class: 'btn', onClick: () => exportClient(rec) }, 'Export'),
    h('button', { class: 'btn quiet', onClick: () => confirmRemove(app, { id: rec.id, name }) }, 'Delete')));
  const sessions = rec.sessions || [];
  panel.appendChild(h('h3', null, 'Sessions'));
  panel.appendChild(sessions.length ? h('div', { class: 'tablewrap' }, h('table', { class: 'data' }, h('tbody', null, sessions.slice().reverse().map(sn => h('tr', null, h('td', null, sn.label), h('td', { class: 'small muted' }, F.dateLong(sn.at.slice(0, 10))), h('td', { class: 'small' }, sn.note || '')))))) : h('p', { class: 'muted small' }, 'No session closed yet.'));
  renderHistory(panel, app, rec);
}

/* The journal (moved here from Home, MR-072): the last twelve changes, then the count. */
function renderHistory(panel, app, rec) {
  panel.appendChild(h('h3', { style: { marginTop: '12px' } }, 'History'));
  const lines = rec.journal.slice().reverse().slice(0, 12);
  if (!lines.length) { panel.appendChild(h('p', { class: 'muted small' }, 'No changes yet.')); return; }
  const fieldsData = app.data.fields;
  panel.appendChild(h('div', { class: 'tablewrap' }, h('table', { class: 'data history' },
    h('thead', null, h('tr', null, h('th', null, 'When'), h('th', null, 'What'), h('th', null, 'Now'))),
    h('tbody', null, lines.map(l => h('tr', null,
      h('td', { class: 'muted small when' }, F.dateTimeLocal(l.ts)),
      h('td', { class: 'what' }, whereChip(l), ' ', describe(l, fieldsData)),
      h('td', { class: 'small now' }, side(l.new, l, fieldsData))))))));
  const n = rec.journal.length;
  panel.appendChild(h('p', { class: 'hint', style: { marginTop: '8px' } }, n + (n === 1 ? ' change' : ' changes') + ' in all. Export carries every one.'));
}

const SUN_LABELS = { name: 'Name', birthDate: 'Birth date', state: 'State', city: 'City', workSituation: 'Work situation', dependents: 'Dependents', filingStatus: 'Filing status', bigGoal: 'Big goal' };
const COLUMN_LABELS = { nickname: 'Name', institution: 'Institution', asOf: 'As of', followUp: 'Flag', stress: 'Stress', notesPrivate: 'Private note', notesShared: 'Shared note', type: 'Type', lib: 'Library pick' };
function fieldLabelOf(l, fieldsData) {
  if (!l.field) return 'row';
  if (SUN_LABELS[l.field]) return SUN_LABELS[l.field];
  if (fieldsData && fieldsData.fields[l.field]) return fieldsData.fields[l.field].label;
  return COLUMN_LABELS[l.field] || l.field;
}
function whereChip(l) { return h('span', { class: 'chip src' }, l.rowId === 'sun' ? 'Household' : (l.planet ? PLANET_SHORT[l.planet] : '')); }
function lowerFirst(t) { return t && t.length > 1 && t[1] === t[1].toLowerCase() && /[a-z]/.test(t[1]) ? t[0].toLowerCase() + t.slice(1) : t; }
function describe(l, fieldsData) {
  const fieldLabel = fieldLabelOf(l, fieldsData);
  if (l.kind === 'add-row') return 'Row added';
  if (l.kind === 'remove-row') return 'Row removed';
  if (l.kind === 'undo') return 'Undo ' + lowerFirst(fieldLabel);
  if (l.kind === 'redo') return 'Redo ' + lowerFirst(fieldLabel);
  if (l.kind === 'import') return 'Imported file';
  if (l.kind === 'note') return 'Quick note';
  if (l.kind === 'session') return 'Session closed';
  if (l.kind === 'goals') return 'Goal settings';
  if (l.kind === 'section') return 'Settings';
  return fieldLabel;
}
const STATE_LABELS = { 'will-send': 'Will send', 'not-applicable': 'Not applicable', 'not-for-me': 'Not for me', none: 'None' };
function side(v, l, fieldsData) {
  if (v === null || v === undefined) return h('span', { class: 'empty-token' }, 'Not entered');
  if (typeof v === 'object' && 'v' in v) {
    const inner = v.v; const def = fieldsData && l.field ? fieldsData.fields[l.field] : null;
    if (inner === null || inner === undefined) return h('span', { class: 'empty-token' }, v.state === 'unknown' ? 'Not entered' : (STATE_LABELS[v.state] || v.state));
    const rough = v.state === 'rough';
    if (typeof inner === 'object' && typeof inner.low === 'number') return F.range(inner.low, inner.high, { rough: true });
    if (def && def.kind === 'money' && typeof inner === 'number') return F.dollarsWhole(inner, { rough });
    if (def && def.kind === 'percent' && typeof inner === 'number') return F.percent(inner, { rough });
    if (def && def.kind === 'month' && typeof inner === 'string') return F.date(inner);
    if (def && def.kind === 'choice') { const o = (def.options || []).find(x => x[0] === inner); return o ? o[1] : String(inner); }
    if (def && def.kind === 'credits' && typeof inner === 'object') return Object.keys(inner).length + ' credits marked';
    if (typeof inner === 'boolean') return inner ? 'Yes' : 'No';
    return String(inner);
  }
  if (typeof v === 'object') return v.nickname || v.type || 'row';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v);
}
