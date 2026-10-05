/* Home: the clients panel, the Sun's own facts, and the recent history.
   Level 2 adds the solar system drawing above these. */
import { h, clear, qs, todayIso } from '../dom.js';
import { stateChip, sourceChip } from '../chips.js';
import { exportClient, importFile, clientName } from '../app.js';
import { SUN_FIELDS, SUN_ASKED, SUN_MORE, WORK_SITUATIONS, PLANETS, PLANET_LABELS, PLANET_SHORT, FILING_STATUSES } from '../../engine/sun.js';
import * as F from '../../engine/format.js';
import { hasValue } from '../../engine/states.js';
import { orbitMap, mapPanel } from '../orbit.js';
import { lowerFirst, holdsBack } from './ledger.js';
import { overallConfidence } from './onepager.js';

export function parseDateText(t) {
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (m) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (m) return m[3] + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0');
  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  m = /^(\d{1,2})\s+([A-Za-z]{3,})\.?,?\s+(\d{4})$/.exec(t) || /^([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(t);
  if (m) {
    const dayFirst = /^\d/.test(m[1]);
    const day = dayFirst ? m[1] : m[2], mon = MONTHS.indexOf((dayFirst ? m[2] : m[1]).slice(0, 3).toLowerCase());
    if (mon !== -1) return m[3] + '-' + String(mon + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
  }
  return null;
}
/* A birth date the easy way (MR-025): a full date is Known; a year alone, or an age, is Rough and stored as 1 July of that year. */
export function parseBirthText(t, today) {
  const iso = parseDateText(t);
  if (iso) return { iso, state: 'known' };
  const y = parseInt(today.slice(0, 4), 10);
  if (/^\d{4}$/.test(t) && +t > y - 120 && +t <= y) return { iso: t + '-07-01', state: 'rough' };
  if (/^\d{1,3}$/.test(t) && +t > 0 && +t < 120) return { iso: String(y - +t) + '-07-01', state: 'rough' };
  return null;
}
function birthLabel(f, today) {
  if (!f || !f.v) return ' (a year is enough)';
  return f.state === 'rough' ? ' (about ' + F.ageAt(f.v, today) + ')' : ' (age ' + F.ageAt(f.v, today) + ')';
}

let moreOpen = false;
const WORK_LABELS = { employed: 'Employed', 'self-employed': 'Self-employed', 'between-jobs': 'Between jobs', student: 'Student', retired: 'Retired', mixed: 'Mixed' };

export function mount(host, app) {
  const header = h('header', null, h('h1', null, app.record ? (clientName(app.record) || 'Household') : 'Home'), h('span', { class: 'sub' }, app.record ? 'Tap a planet to open it.' : 'Open a client to begin.'));
  const clients = h('section', { class: 'panel coach-only' });
  const sun = h('section', { class: 'panel sun-panel' });
  const history = h('section', { class: 'panel coach-only' });
  const mapHost = h('div', { class: 'maphost' });
  const bar = h('div', { class: 'mapbar-host' });
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
  const items = PLANETS.map(p => ({ id: p, label: PLANET_LABELS[p], count: r.rowCounts[p], fill: r.fills[p] === null ? 0 : r.fills[p], attention: (r.needs[p] || []).length > 0, badge: r.fills[p] === null ? 'no rows' : r.rowCounts[p] + (r.rowCounts[p] === 1 ? ' row, ' : ' rows, ') + Math.round(r.fills[p] * 100) + '%' }));
  const name = clientName(app.record) || 'Household';
  mapHost.appendChild(orbitMap({
    compact: mapHost.clientWidth > 0 && mapHost.clientWidth < 560,
    ariaLabel: 'The household and its seven planets',
    center: { title: name, sub: Math.round(overallConfidence(r) * 100) + '% confident', fill: r.fills.sun },
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
  const makeNew = () => { const n = nameInput.value.trim(); if (!n) { nameInput.focus(); return; } app.newClient(n); };
  nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') makeNew(); if (e.key === 'Escape') { newRow.style.display = 'none'; newBtn.focus(); } });
  const newRow = h('div', { class: 'row new-client', style: { marginBottom: '8px', display: 'none' } }, nameInput, h('button', { class: 'btn primary', onClick: makeNew }, 'Create'));
  const newBtn = h('button', { class: 'btn primary', 'aria-label': 'New client', onClick: () => { newRow.style.display = ''; nameInput.focus(); } }, 'New client');
  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', class: 'sr-only', 'aria-label': 'Import a client file', onChange: async e => {
    const f = e.target.files[0]; if (!f) return;
    try { await importFile(f); } catch (err) { app.toast(err.message); }
    e.target.value = '';
  } });
  nameInput.style.width = '176px';
  nameInput.style.flex = 'none';
  panel.appendChild(h('div', { class: 'row', style: { marginBottom: '8px' } },
    newBtn,
    h('button', { class: 'btn', onClick: () => fileInput.click() }, 'Import'),
    h('button', { class: 'btn', title: 'Maya: example numbers only', onClick: () => loadDemo(app) }, 'Load demo client'),
    fileInput));
  panel.appendChild(newRow);
  if (!list.length) {
    panel.appendChild(h('div', { class: 'empty' }, h('h2', null, 'No clients yet'), h('p', null, 'Press New client and type a first name. Everything stays in this browser.')));
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

async function loadDemo(app) {
  try {
    const res = await fetch('tests/households/maya.json');
    if (!res.ok) throw new Error('demo file not found');
    const text = await res.text();
    const { record } = app.store.importJson(text);
    app.open(record.id);
    app.toast('Loaded the demo client. Example numbers only.');
    app.rerender();
  } catch (e) { app.toast('Could not load the demo: ' + e.message); }
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
    panel.appendChild(h('div', { class: 'empty' }, h('h2', null, 'Household facts'), h('p', null, 'Birth date, state, work situation and filing status live here. Open a client first.')));
    return;
  }
  const rec = app.record;
  panel.appendChild(h('h2', null, 'Household facts'));
  const stateDefault = rec.sun.f.state && rec.sun.f.state.source === 'estimated';
  panel.appendChild(h('p', { class: 'hint coach-only', style: { marginBottom: '8px' } }, 'Four facts to start. A birth year is enough.' + (stateDefault ? ' The state is New York until the client says otherwise.' : '')));
  const states = app.data && app.data.usStates ? app.data.usStates.states : [];
  const readOnly = app.view === 'client';
  const moreHost = h('div', { class: 'more-facts', style: { display: moreOpen ? '' : 'none' } });
  const moreBtn = h('button', { class: 'btn quiet small more-facts-btn', 'aria-label': 'More facts', 'aria-expanded': String(moreOpen), style: { marginTop: '8px' }, onClick: () => { moreOpen = !moreOpen; moreHost.style.display = moreOpen ? '' : 'none'; moreBtn.setAttribute('aria-expanded', String(moreOpen)); moreBtn.textContent = moreOpen ? 'Fewer facts' : 'More facts'; } }, moreOpen ? 'Fewer facts' : 'More facts');
  SUN_ASKED.concat(SUN_MORE).forEach(id => {
    const into = SUN_MORE.indexOf(id) === -1 ? panel : moreHost;
    const f = rec.sun.f[id] || { v: null, state: 'unknown', source: 'client' };
    if (readOnly) {
      into.appendChild(h('div', { class: 'fieldrow sun', dataset: { field: id } },
        h('label', null, SUN_LABELS[id]),
        h('div', { class: 'control' }, displayValue(id, f, states))));
      return;
    }
    let control;
    const commit = (value, state) => {
      const live = rec.sun.f[id] || f;
      const st = state || (value === null || value === '' ? 'unknown' : (live.state === 'unknown' ? 'known' : live.state));
      /* a typed value replaces a default: the source becomes the client */
      const src = value !== live.v && live.source === 'estimated' ? 'client' : (live.source || 'client');
      app.setField('sun', id, value === '' ? null : value, st, src);
    };
    if (id === 'birthDate') {
      const shown = x => x.v ? (x.state === 'rough' ? x.v.slice(0, 4) : F.dateLong(x.v)) : '';
      control = h('input', { class: 'input', type: 'text', inputmode: 'numeric', value: shown(f), 'aria-label': SUN_LABELS[id], title: 'A year (1999), an age (27), or a date (1999-03-14, 3/14/1999, 14 Mar 1999)', onChange: e => {
        const t = e.target.value.trim();
        if (t === '') return commit(null);
        const p = parseBirthText(t, todayIso());
        if (!p) { app.toast('A birth year is enough, for example 1999. Or a date: 1999-03-14, 3/14/1999, 14 Mar 1999.'); e.target.value = shown(f); return; }
        e.target.value = p.state === 'rough' ? p.iso.slice(0, 4) : F.dateLong(p.iso); commit(p.iso, p.state);
      } });
      control.addEventListener('focus', () => { const cur = rec.sun.f.birthDate; control.value = cur && cur.v ? (cur.state === 'rough' ? cur.v.slice(0, 4) : cur.v) : ''; });
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
      h('label', null, SUN_LABELS[id], id === 'birthDate' ? h('span', { class: 'muted small' }, birthLabel(f, todayIso())) : null),
      wrap,
      h('span', { class: 'state coach-only' }, stateChip(f, s => app.setField('sun', id, f.v, s, f.source || 'client'), { exclude: ['not-for-me'] })),
      h('span', { class: 'src coach-only' }, sourceChip(f, s => app.setField('sun', id, f.v, f.state, s))));
    into.appendChild(row);
  });
  if (!readOnly) panel.appendChild(moreBtn);
  panel.appendChild(moreHost);
  const fill = app.result ? app.result.fills.sun : 0;
  const withRows = PLANETS.filter(p => app.result.rowCounts[p] > 0).length;
  const asked = SUN_ASKED.filter(id => rec.sun.f[id] && rec.sun.f[id].v !== null && rec.sun.f[id].v !== undefined && rec.sun.f[id].v !== '').length;
  panel.appendChild(h('p', { class: 'hint coach-only sun-confidence', style: { marginTop: '8px' } }, asked + ' of ' + SUN_ASKED.length + ' facts in. ' + withRows + ' of 7 planets have rows.'));
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
    if (label && id === 'birthDate') label.textContent = birthLabel(f, todayIso());
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
    const asked = SUN_ASKED.filter(id => rec.sun.f[id] && rec.sun.f[id].v !== null && rec.sun.f[id].v !== undefined && rec.sun.f[id].v !== '').length;
    hint.appendChild(document.createTextNode(asked + ' of ' + SUN_ASKED.length + ' facts in. ' + withRows + ' of 7 planets have rows.'));
  }
}

function displayValue(id, f, states) {
  const v = f.v;
  if (!hasValue(f) || v === '' ) return h('span', { class: 'value empty-token' }, 'Not entered');
  if (id === 'birthDate') return h('span', { class: 'value' }, f.state === 'rough' ? v.slice(0, 4) + ' (about ' + F.ageAt(v, todayIso()) + ')' : F.dateLong(v) + ' (age ' + F.ageAt(v, todayIso()) + ')');
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
      h('td', { class: 'muted small when', title: l.ts.slice(11, 16) }, F.dateLong(l.ts.slice(0, 10))),
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
const STATE_LABELS = { 'will-send': 'Will send', 'not-applicable': 'Not applicable', 'not-for-me': 'Not for me', none: 'None' };
