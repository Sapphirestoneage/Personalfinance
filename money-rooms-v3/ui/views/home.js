/* Home: the clients panel, the Sun's own facts, and the recent history.
   Level 2 adds the solar system drawing above these. */
import { h, clear, qs, todayIso } from '../dom.js';
import { stateChip, sourceChip } from '../chips.js';
import { exportClient, importFile, clientName } from '../app.js';
import { SUN_FIELDS, WORK_SITUATIONS, PLANETS, PLANET_LABELS, PLANET_SHORT, FILING_STATUSES } from '../../engine/sun.js';
import * as F from '../../engine/format.js';
import { hasValue } from '../../engine/states.js';
import { orbitMap, mapPanel } from '../orbit.js';
import { lowerFirst, holdsBack } from './ledger.js';

export function parseDateText(t) {
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (m) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (m) return m[3] + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0');
  return null;
}

const WORK_LABELS = { employed: 'Employed', 'self-employed': 'Self-employed', 'between-jobs': 'Between jobs', student: 'Student', retired: 'Retired', mixed: 'Mixed' };

export function mount(host, app) {
  const header = h('header', null, h('h1', null, app.record ? (clientName(app.record) || 'Household') : 'Home'), h('span', { class: 'sub' }, app.record ? 'Pick a planet to open it.' : 'Open a client to begin.'));
  const clients = h('section', { class: 'panel coach-only' });
  const sun = h('section', { class: 'panel' });
  const history = h('section', { class: 'panel coach-only' });
  const mapHost = h('div', { class: 'maphost' });
  const bar = h('div');
  host.appendChild(header);
  host.appendChild(h('div', { class: 'grid home-grid' }, h('div', { class: 'stack' }, app.record ? mapHost : null, app.record ? bar : null, sun), h('div', { class: 'stack coach-only' }, clients, history)));
  renderClients(clients, app);
  renderMap(mapHost, bar, app);
  renderSun(sun, app);
  renderHistory(history, app);
  return {
    update(reason) {
      if (reason === 'rows' || reason === 'clients') renderSun(sun, app);
      renderMap(mapHost, bar, app);
      renderHistory(history, app);
      updateSunValues(sun, app);
      if (reason === 'clients') renderClients(clients, app);
    },
  };
}

function renderMap(mapHost, bar, app) {
  if (!app.record) return;
  clear(mapHost); clear(bar);
  const r = app.result;
  const items = PLANETS.map(p => ({ id: p, label: PLANET_LABELS[p], count: r.rowCounts[p], fill: r.fills[p] === null ? 0 : r.fills[p], attention: (r.needs[p] || []).length > 0, badge: r.fills[p] === null ? 'empty' : Math.round(r.fills[p] * 100) + '%' + ((r.needs[p] || []).length ? ', needs ' + r.needs[p].length : '') }));
  const name = clientName(app.record) || 'Household';
  mapHost.appendChild(orbitMap({
    compact: mapHost.clientWidth > 0 && mapHost.clientWidth < 560,
    ariaLabel: 'The household and its seven planets',
    center: { title: name, sub: Math.round(r.fills.sun * 100) + '% complete', fill: r.fills.sun },
    items,
    onOpen: id => { location.hash = '#/ledger/' + id; },
    onFocus: id => describePlanet(bar, app, id),
  }));
  describePlanet(bar, app, null);
}

function describePlanet(bar, app, id) {
  clear(bar);
  const r = app.result;
  if (!id) {
    const total = PLANETS.reduce((s, p) => s + r.rowCounts[p], 0);
    if (!total) { bar.appendChild(mapPanel({ title: 'Nothing entered yet', status: 'Income first: open the Income planet and add the first job.', actions: [h('a', { class: 'btn primary coach-only', href: '#/ledger/income' }, 'Open Income')] })); return; }
    /* default to the weakest planet, so the panel says something without a hover */
    const weakest = PLANETS.slice().sort((a, b) => ((r.fills[a] === null ? -1 : r.fills[a]) - (r.fills[b] === null ? -1 : r.fills[b])))[0];
    id = weakest;
  }
  const needs = r.needs[id] || [];
  bar.appendChild(mapPanel({ title: PLANET_LABELS[id] + (r.rowCounts[id] ? ' is at ' + Math.round((r.fills[id] || 0) * 100) + '%' : ' is empty'), status: r.rowCounts[id] ? (r.rowCounts[id] + (r.rowCounts[id] === 1 ? ' row. ' : ' rows. ') + (needs.length ? 'Needs ' + needs.slice(0, 3).map(n => lowerFirst(n.label)).join(', ') + (needs.length > 3 ? ' and ' + (needs.length - 3) + ' more' : '') + '.' : holdsBack(app, id))) : 'No rows yet.', actions: [h('a', { class: 'btn primary', href: '#/ledger/' + id }, 'Open ' + lowerFirst(PLANET_LABELS[id]))] }));
}

function renderClients(panel, app) {
  clear(panel);
  const list = app.store.list();
  panel.appendChild(h('h2', null, 'Clients'));
  const nameInput = h('input', { class: 'input', type: 'text', id: 'new-client-name', 'aria-label': 'New client name' });
  const makeNew = () => { const n = nameInput.value.trim(); app.newClient(n || null); };
  nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') makeNew(); });
  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', class: 'sr-only', 'aria-label': 'Import a client file', onChange: async e => {
    const f = e.target.files[0]; if (!f) return;
    try { await importFile(f); } catch (err) { app.toast(err.message); }
    e.target.value = '';
  } });
  nameInput.style.width = '176px';
  nameInput.style.flex = 'none';
  panel.appendChild(h('div', { class: 'row', style: { marginBottom: '8px' } },
    h('label', { class: 'small muted', for: 'new-client-name' }, 'Name'),
    nameInput,
    h('button', { class: 'btn primary', onClick: makeNew }, 'New client'),
    h('button', { class: 'btn', onClick: () => fileInput.click() }, 'Import'),
    fileInput));
  if (!list.length) {
    panel.appendChild(h('div', { class: 'empty' }, h('h2', null, 'No clients yet'), h('p', null, 'Type a first name and press Enter. Everything stays in this browser.')));
    return;
  }
  const tbl = h('table', { class: 'data' },
    h('thead', null, h('tr', null, h('th', null, 'Client'), h('th', { class: 'hide-narrow' }, 'Last saved'), h('th', null, ''))),
    h('tbody', null, list.map(c => {
      const open = app.record && app.record.id === c.id;
      return h('tr', { class: open ? 'selected' : null },
        h('td', null, h('a', { href: '#/home', onClick: e => { e.preventDefault(); app.open(c.id); app.rerender(); } }, c.name || 'Unnamed client'), open ? h('span', { class: 'chip src', style: { marginLeft: '8px' } }, 'Open') : null),
        h('td', { class: 'muted small hide-narrow' }, F.dateLong(c.updatedAt.slice(0, 10))),
        h('td', { class: 'num' },
          h('button', { class: 'btn small', onClick: () => { const r = app.store.load(c.id); if (r) exportClient(r); } }, 'Export'),
          ' ',
          h('button', { class: 'btn small quiet', onClick: () => confirmRemove(app, c) }, 'Delete')));
    })));
  panel.appendChild(h('div', { class: 'tablewrap' }, tbl));
}

function confirmRemove(app, c) {
  const snapshot = app.store.exportJson(app.store.load(c.id));
  app.remove(c.id);
  app.toast('Deleted ' + (c.name || 'client'), { label: 'Undo', ms: 10000, action: () => { app.store.importJson(snapshot); app.open(c.id); app.rerender(); } });
  app.rerender();
}

const SUN_LABELS = { name: 'Name', birthDate: 'Birth date', state: 'State', city: 'City', workSituation: 'Work situation', dependents: 'Dependents', filingStatus: 'Filing status', bigGoal: 'Big goal' };

function renderSun(panel, app) {
  clear(panel);
  if (!app.record) {
    panel.appendChild(h('div', { class: 'empty' }, h('h2', null, 'Household facts'), h('p', null, 'Name, birth date, state, work situation, dependents and the big goal live here. Open a client first.')));
    return;
  }
  const rec = app.record;
  panel.appendChild(h('h2', null, 'Household facts'));
  panel.appendChild(h('p', { class: 'hint coach-only', style: { marginBottom: '8px' } }, 'Birth date, not age. Fields that do not fit the work situation are absent.'));
  const states = app.data && app.data.usStates ? app.data.usStates.states : [];
  const readOnly = app.view === 'client';
  SUN_FIELDS.forEach(id => {
    const f = rec.sun.f[id] || { v: null, state: 'unknown', source: 'client' };
    if (readOnly) {
      panel.appendChild(h('div', { class: 'fieldrow sun', dataset: { field: id } },
        h('label', null, SUN_LABELS[id]),
        h('div', { class: 'control' }, displayValue(id, f, states))));
      return;
    }
    let control;
    const commit = (value, state) => {
      const st = state || (value === null || value === '' ? 'unknown' : (f.state === 'unknown' ? 'known' : f.state));
      app.setField('sun', id, value === '' ? null : value, st, f.source || 'client');
    };
    if (id === 'birthDate') {
      control = h('input', { class: 'input', type: 'text', inputmode: 'numeric', value: f.v ? F.dateLong(f.v) : '', 'aria-label': SUN_LABELS[id], title: 'YYYY-MM-DD', onChange: e => {
        const t = e.target.value.trim();
        if (t === '') return commit(null);
        const iso = parseDateText(t);
        if (!iso) { app.toast('Birth date as YYYY-MM-DD, for example 1999-03-14'); e.target.value = f.v ? F.dateLong(f.v) : ''; return; }
        e.target.value = F.dateLong(iso); commit(iso);
      } });
      control.addEventListener('focus', () => { control.value = (rec.sun.f.birthDate && rec.sun.f.birthDate.v) || ''; });
    } else if (id === 'state') {
      control = h('select', { class: 'select', 'aria-label': SUN_LABELS[id], onChange: e => commit(e.target.value) },
        h('option', { value: '' }, 'Not entered'), states.map(s => h('option', { value: s[0], selected: f.v === s[0] }, s[1])));
    } else if (id === 'workSituation') {
      control = h('select', { class: 'select', 'aria-label': SUN_LABELS[id], onChange: e => commit(e.target.value) },
        h('option', { value: '' }, 'Not entered'), WORK_SITUATIONS.map(w => h('option', { value: w, selected: f.v === w }, WORK_LABELS[w])));
    } else if (id === 'filingStatus') {
      control = h('select', { class: 'select', 'aria-label': SUN_LABELS[id], onChange: e => commit(e.target.value) },
        h('option', { value: '' }, 'Not entered'), FILING_STATUSES.map(w => h('option', { value: w[0], selected: f.v === w[0] }, w[1])));
    } else if (id === 'dependents') {
      control = h('input', { class: 'input num', type: 'number', min: 0, max: 20, step: 1, value: f.v === null || f.v === undefined ? '' : f.v, 'aria-label': SUN_LABELS[id], onChange: e => commit(e.target.value === '' ? null : parseInt(e.target.value, 10)) });
    } else {
      control = h('input', { class: 'input', type: 'text', value: f.v || '', 'aria-label': SUN_LABELS[id], onChange: e => commit(e.target.value.trim()) });
    }
    control.dataset.field = id;
    const isEmpty = f.v === null || f.v === undefined || f.v === '';
    const wrap = h('div', { class: 'control' + (isEmpty && !(control.tagName === 'SELECT') ? ' is-empty' : '') }, control);
    if (isEmpty) control.classList.add('is-empty');
    control.addEventListener('input', () => { control.classList.toggle('is-empty', control.value === ''); wrap.classList.toggle('is-empty', control.value === '' && control.tagName !== 'SELECT'); });
    control.addEventListener('change', () => { control.classList.toggle('is-empty', control.value === ''); wrap.classList.toggle('is-empty', control.value === '' && control.tagName !== 'SELECT'); });
    const row = h('div', { class: 'fieldrow sun', dataset: { field: id } },
      h('label', null, SUN_LABELS[id], id === 'birthDate' ? h('span', { class: 'muted small' }, f.v ? ' (age ' + F.ageAt(f.v, todayIso()) + ')' : ' (YYYY-MM-DD)') : null),
      wrap,
      h('span', { class: 'state coach-only' }, stateChip(f, s => app.setField('sun', id, f.v, s, f.source || 'client'), { exclude: ['not-for-me'] })),
      h('span', { class: 'src coach-only' }, sourceChip(f, s => app.setField('sun', id, f.v, f.state, s))));
    panel.appendChild(row);
  });
  const fill = app.result ? app.result.fills.sun : 0;
  const withRows = PLANETS.filter(p => app.result.rowCounts[p] > 0).length;
  panel.appendChild(h('p', { class: 'hint coach-only sun-confidence', style: { marginTop: '8px' } }, 'Confidence ', h('strong', null, Math.round(fill * 100) + '%'), ' across the eight facts. ', withRows + ' of 7 planets have rows.'));
}

function updateSunValues(panel, app) {
  if (!app.record) return;
  const rec = app.record;
  const focused = document.activeElement;
  const focusedChip = focused && focused.tagName === 'SELECT' && focused.closest('.fieldrow') && (focused.getAttribute('aria-label') === 'Answer state' || focused.getAttribute('aria-label') === 'Source') ? { field: focused.closest('.fieldrow').dataset.field, which: focused.getAttribute('aria-label') } : null;
  SUN_FIELDS.forEach(id => {
    const row = panel.querySelector('.fieldrow[data-field="' + id + '"]');
    if (!row) return;
    const f = rec.sun.f[id] || { v: null, state: 'unknown', source: 'client' };
    const label = row.querySelector('label span');
    if (label && id === 'birthDate') label.textContent = f.v ? ' (age ' + F.ageAt(f.v, todayIso()) + ')' : ' (YYYY-MM-DD)';
    const st = row.querySelector('.state'); const src = row.querySelector('.src');
    if (st) { clear(st); st.appendChild(stateChip(f, s => app.setField('sun', id, f.v, s, f.source || 'client'), { exclude: ['not-for-me'] })); }
    if (src) { clear(src); src.appendChild(sourceChip(f, s => app.setField('sun', id, f.v, f.state, s))); }
    const control = row.querySelector('.control input, .control select');
    if (control && control !== focused) {
      const empty = f.v === null || f.v === undefined || f.v === '';
      control.classList.toggle('is-empty', empty);
      control.closest('.control').classList.toggle('is-empty', empty && control.tagName !== 'SELECT');
    }
  });
  if (focusedChip) {
    const again = panel.querySelector('.fieldrow[data-field="' + focusedChip.field + '"] select[aria-label="' + focusedChip.which + '"]');
    if (again) again.focus();
  }
  const hint = panel.querySelector('.sun-confidence');
  if (hint && app.result) {
    const withRows = PLANETS.filter(p => app.result.rowCounts[p] > 0).length;
    clear(hint);
    hint.appendChild(document.createTextNode('Confidence '));
    hint.appendChild(h('strong', null, Math.round(app.result.fills.sun * 100) + '%'));
    hint.appendChild(document.createTextNode(' across the eight facts. ' + withRows + ' of 7 planets have rows.'));
  }
}

function displayValue(id, f, states) {
  const v = f.v;
  if (!hasValue(f) || v === '' ) return h('span', { class: 'value empty-token' }, 'Not entered');
  if (id === 'birthDate') return h('span', { class: 'value' }, F.dateLong(v) + ' (age ' + F.ageAt(v, todayIso()) + ')');
  if (id === 'state') { const s = states.find(x => x[0] === v); return h('span', { class: 'value' }, s ? s[1] : v); }
  if (id === 'workSituation') return h('span', { class: 'value' }, WORK_LABELS[v] || v);
  if (id === 'filingStatus') { const s = FILING_STATUSES.find(x => x[0] === v); return h('span', { class: 'value' }, s ? s[1] : v); }
  return h('span', { class: 'value' }, String(v));
}

function renderHistory(panel, app) {
  clear(panel);
  panel.appendChild(h('h2', null, 'History'));
  if (!app.record) { panel.appendChild(h('p', { class: 'muted small' }, 'The journal of every change shows here once a client is open.')); return; }
  const lines = app.record.journal.slice().reverse().slice(0, 12);
  if (!lines.length) { panel.appendChild(h('p', { class: 'muted small' }, 'No changes yet. Every edit writes one line here; undo and redo read from it.')); return; }
  const fieldsData = app.data.fields;
  panel.appendChild(h('div', { class: 'tablewrap' }, h('table', { class: 'data history' },
    h('thead', null, h('tr', null, h('th', null, 'When'), h('th', { class: 'where' }, 'Where'), h('th', null, 'What'), h('th', null, 'Now'))),
    h('tbody', null, lines.map(l => h('tr', null,
      h('td', { class: 'muted small when' }, l.ts.slice(0, 10) === todayIso() ? l.ts.slice(11, 16) : F.dateLong(l.ts.slice(0, 10))),
      h('td', { class: 'where' }, whereChip(l)),
      h('td', null, describe(l, fieldsData)),
      h('td', { class: 'small now' }, side(l.new, l, fieldsData))))))));
  const n = app.record.journal.length;
  panel.appendChild(h('p', { class: 'hint', style: { marginTop: '8px' } }, n + (n === 1 ? ' line' : ' lines') + ' in the journal. Export carries all of them.'));
}

const COLUMN_LABELS = { nickname: 'Name', institution: 'Institution', asOf: 'As of', followUp: 'Flag', stress: 'Stress', notesPrivate: 'Private note', notesShared: 'Shared note', type: 'Type', lib: 'Library pick' };
function fieldLabelOf(l, fieldsData) {
  if (!l.field) return 'row';
  if (SUN_LABELS[l.field]) return SUN_LABELS[l.field];
  if (fieldsData && fieldsData.fields[l.field]) return fieldsData.fields[l.field].label;
  return COLUMN_LABELS[l.field] || l.field;
}
function whereChip(l) {
  const where = l.rowId === 'sun' ? 'Household' : (l.planet ? PLANET_SHORT[l.planet] : '');
  return h('span', { class: 'chip src' }, where);
}
function describe(l, fieldsData) {
  const fieldLabel = fieldLabelOf(l, fieldsData);
  if (l.kind === 'add-row') return 'Row added';
  if (l.kind === 'remove-row') return 'Row removed';
  if (l.kind === 'undo') return 'Undo ' + lowerFirst(fieldLabel);
  if (l.kind === 'redo') return 'Redo ' + lowerFirst(fieldLabel);
  if (l.kind === 'import') return 'Imported file';
  if (l.kind === 'note') return 'Quick note';
  if (l.kind === 'session') return 'Session snapshot';
  return fieldLabel;
}
function side(v, l, fieldsData) {
  if (v === null || v === undefined) return h('span', { class: 'empty-token' }, 'Not entered');
  if (typeof v === 'object' && 'v' in v) {
    const inner = v.v;
    const def = fieldsData && l.field ? fieldsData.fields[l.field] : null;
    if (inner === null || inner === undefined) return h('span', { class: 'empty-token' }, v.state === 'unknown' ? 'Not entered' : (STATE_LABELS[v.state] || v.state));
    const rough = v.state === 'rough';
    if (typeof inner === 'object' && typeof inner.low === 'number') return F.range(inner.low, inner.high, { rough: true });
    if (def && def.kind === 'money' && typeof inner === 'number') return F.dollars(inner, { rough });
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
const STATE_LABELS = { 'will-send': 'Will send', 'not-applicable': 'Not applicable', 'not-for-me': 'Not for me', none: 'None' };
