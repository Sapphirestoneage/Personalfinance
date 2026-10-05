/* Home: the clients panel, the Sun's own facts, and the recent history.
   Level 2 adds the solar system drawing above these. */
import { h, clear, qs, todayIso } from '../dom.js';
import { stateChip, sourceChip } from '../chips.js';
import { exportClient, importFile, clientName } from '../app.js';
import { SUN_FIELDS, WORK_SITUATIONS, PLANETS, PLANET_LABELS, FILING_STATUSES } from '../../engine/sun.js';
import * as F from '../../engine/format.js';
import { hasValue } from '../../engine/states.js';

export function parseDateText(t) {
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (m) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (m) return m[3] + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0');
  return null;
}

const WORK_LABELS = { employed: 'Employed', 'self-employed': 'Self-employed', 'between-jobs': 'Between jobs', student: 'Student', retired: 'Retired', mixed: 'Mixed' };

export function mount(host, app) {
  const header = h('header', null, h('h1', null, 'Home'), h('span', { class: 'sub' }, app.record ? 'Who the household is. Everything else hangs off these seven facts.' : 'Open a client to begin.'));
  const clients = h('section', { class: 'panel coach-only' });
  const sun = h('section', { class: 'panel' });
  const history = h('section', { class: 'panel coach-only' });
  host.appendChild(header);
  host.appendChild(h('div', { class: 'grid home-grid' }, sun, h('div', { class: 'stack coach-only' }, clients, history)));
  renderClients(clients, app);
  renderSun(sun, app);
  renderHistory(history, app);
  return {
    update(reason) {
      if (reason === 'rows' || reason === 'clients') renderSun(sun, app);
      renderHistory(history, app);
      updateSunValues(sun, app);
      if (reason === 'clients') renderClients(clients, app);
    },
  };
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
  nameInput.style.width = '240px';
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
  panel.appendChild(h('h2', null, 'Household facts', h('span', { class: 'tag coach-only' }, 'The Sun')));
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
      control = h('input', { class: 'input', type: 'text', inputmode: 'numeric', value: f.v || '', 'aria-label': SUN_LABELS[id], title: 'YYYY-MM-DD', onChange: e => {
        const t = e.target.value.trim();
        if (t === '') return commit(null);
        const iso = parseDateText(t);
        if (!iso) { app.toast('Birth date as YYYY-MM-DD, for example 1999-03-14'); e.target.value = f.v || ''; return; }
        e.target.value = iso; commit(iso);
      } });
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
      h('span', { class: 'state coach-only' }, stateChip(f, s => app.setField('sun', id, f.v, s, f.source || 'client'), { exclude: ['none', 'not-for-me'] })),
      h('span', { class: 'src coach-only' }, sourceChip(f, s => app.setField('sun', id, f.v, f.state, s))));
    panel.appendChild(row);
  });
  const fill = app.result ? app.result.fills.sun : 0;
  const withRows = PLANETS.filter(p => app.result.rowCounts[p] > 0).length;
  panel.appendChild(h('p', { class: 'hint coach-only', style: { marginTop: '8px' } }, 'Confidence ', h('strong', null, Math.round(fill * 100) + '%'), ' across the eight facts. ', withRows + ' of 7 planets have rows.'));
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

function updateSunValues(panel, app) {
  if (!app.record) return;
  renderSun(panel, app);
}

function renderHistory(panel, app) {
  clear(panel);
  panel.appendChild(h('h2', null, 'History'));
  if (!app.record) { panel.appendChild(h('p', { class: 'muted small' }, 'The journal of every change shows here once a client is open.')); return; }
  const lines = app.record.journal.slice().reverse().slice(0, 12);
  if (!lines.length) { panel.appendChild(h('p', { class: 'muted small' }, 'No changes yet. Every edit writes one line here; undo and redo read from it.')); return; }
  panel.appendChild(h('div', { class: 'tablewrap' }, h('table', { class: 'data' },
    h('thead', null, h('tr', null, h('th', null, 'When'), h('th', null, 'What'), h('th', { class: 'hide-narrow' }, 'From'), h('th', null, 'To'))),
    h('tbody', null, lines.map(l => h('tr', null,
      h('td', { class: 'muted small' }, l.ts.slice(11, 19)),
      h('td', null, describe(l)),
      h('td', { class: 'small hide-narrow' }, side(l.old)),
      h('td', { class: 'small' }, side(l.new))))))));
  const n = app.record.journal.length;
  panel.appendChild(h('p', { class: 'hint', style: { marginTop: '8px' } }, n + (n === 1 ? ' line' : ' lines') + ' in the journal. Export carries all of them.'));
}

function describe(l) {
  const where = l.rowId === 'sun' ? 'Household' : (l.planet ? PLANET_LABELS[l.planet] : '');
  const chip = h('span', { class: 'chip src', style: { marginRight: '6px' } }, where);
  const fieldLabel = l.field ? (SUN_LABELS[l.field] || l.field) : 'row';
  if (l.kind === 'add-row') return h('span', null, chip, 'Row added');
  if (l.kind === 'remove-row') return h('span', null, chip, 'Row removed');
  if (l.kind === 'undo') return h('span', null, chip, 'Undo ' + fieldLabel);
  if (l.kind === 'redo') return h('span', null, chip, 'Redo ' + fieldLabel);
  if (l.kind === 'import') return 'Imported file';
  if (l.kind === 'note') return 'Quick note';
  if (l.kind === 'session') return 'Session snapshot';
  return h('span', null, chip, fieldLabel);
}
function side(v) {
  if (v === null || v === undefined) return h('span', { class: 'empty-token' }, 'Not entered');
  if (typeof v === 'object' && 'v' in v) {
    const inner = v.v;
    if (inner === null || inner === undefined) return h('span', { class: 'empty-token' }, v.state === 'unknown' ? 'Not entered' : v.state);
    if (typeof inner === 'object' && typeof inner.low === 'number') return F.range(inner.low, inner.high);
    if (typeof inner === 'number' && Math.abs(inner) >= 100 && /amount|balance|gross|take|pay|limit|cost|value|premium|minimum|fee|basis|gain/i.test('')) return F.dollars(inner);
    return String(inner);
  }
  if (typeof v === 'object') return v.nickname || v.type || 'row';
  return String(v);
}
