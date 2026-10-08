/* Home: the clients panel, the Sun's own facts, and the recent history.
   Level 2 adds the solar system drawing above these. */
import { h, clear, qs, todayIso } from '../dom.js';
import { stateChip, sourceChip } from '../chips.js';
import { exportClient, importFile, clientName } from '../app.js';
import { SUN_FIELDS, SUN_ASKED, SUN_MORE, WORK_SITUATIONS, PLANETS, PLANET_LABELS, PLANET_SHORT, FILING_STATUSES } from '../../engine/sun.js';
import * as F from '../../engine/format.js';
import { hasValue } from '../../engine/states.js';
import { orbitMap, mapPanel } from '../orbit.js';
import { datePicker } from '../datepicker.js';
import { renderShelf } from '../shelf.js';
import { lowerFirst, holdsBack } from './ledger.js';
import { overallConfidence } from './onepager.js';
import { nextWins } from './goals.js';
import { programOf, nextSessionNumber } from '../../engine/program.js';
import * as Rec from '../../engine/record.js';
import { ledgerTable } from '../table.js';
import { sessionCount } from '../../engine/curriculum.js';
import { renderHomeUnlockCard } from '../unlocks.js';

/* One line under the shelf (Level 11, MR-051): the next win, with the timeline a tap away. */
function goalsLine(app) {
  const wins = nextWins(app, 1); const first = wins[0];
  return h('p', { class: 'small goals-line' }, first ? first.text + '. ' : 'Your goals, all at once. ', h('a', { class: 'next', href: '#/goals' }, app.view === 'coach' ? 'Goal timeline' : 'See your goals'));
}

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
  if (!f || !f.v) return '';
  return f.state === 'rough' ? ' (about ' + F.ageAt(f.v, today) + ')' : ' (age ' + F.ageAt(f.v, today) + ')';
}

let moreOpen = false;
/* Level 10 (MR-053): where each client is in the program, and the next date. */
function sessionCell(app, c) {
  const rec = app.record && app.record.id === c.id ? app.record : app.store.load(c.id); if (!rec) return '';
  const total = sessionCount(app.data); const n = nextSessionNumber(rec); const P = programOf(rec);
  const where = n > total ? 'Graduated' : rec.discovery || Object.keys(P.sessions).length ? 'Session ' + n + ' of ' + total : 'Before the first call';
  return h('span', null, where, P.nextDate ? h('span', { class: 'muted' }, ', next ' + F.dateLong(P.nextDate)) : null);
}
const WORK_LABELS = { employed: 'Employed', 'self-employed': 'Self-employed', 'between-jobs': 'Between jobs', student: 'Student', retired: 'Retired', mixed: 'Mixed' };

export function mount(host, app) {
  const header = h('header', null, h('h1', null, app.record ? (clientName(app.record) || 'Household') : 'Home'), h('span', { class: 'sub' }, app.record ? 'Tap a planet to open it.' : 'Open a client to begin.'));
  const clients = h('section', { class: 'panel coach-only' });
  const sun = h('section', { class: 'panel sun-panel' });
  const history = h('section', { class: 'panel coach-only' });
  const mapHost = h('div', { class: 'maphost' });
  const bar = h('div', { class: 'mapbar-host' });
  const shelf = h('section', { class: 'panel shelf-panel' });
  const unlockCard = h('section', { class: 'panel unlock-card' });
  host.appendChild(header);
  host.appendChild(h('div', { class: 'grid home-grid' }, h('div', { class: 'stack' }, app.record ? mapHost : null, app.record ? bar : null, sun, app.record ? shelf : null, app.record ? unlockCard : null), h('div', { class: 'stack coach-only' }, clients, history)));
  if (app.record) { renderShelf(shelf, app, { compact: true }); shelf.appendChild(goalsLine(app)); renderHomeUnlockCard(unlockCard, app); }
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
      if (app.record) { renderShelf(shelf, app, { compact: true }); shelf.appendChild(goalsLine(app)); renderHomeUnlockCard(unlockCard, app); }
      if (reason === 'clients') renderClients(clients, app);
    },
  };
}

function renderMap(mapHost, bar, app) {
  if (!app.record) return;
  clear(mapHost); clear(bar);
  const r = app.result;
  const items = PLANETS.map(p => ({ id: p, label: PLANET_LABELS[p], count: r.rowCounts[p], fill: r.fills[p] === null ? 0 : r.fills[p], attention: (r.needs[p] || []).length > 0, badge: r.fills[p] === null ? (isDerived(app, p) && computes(app, p) ? 'computed' : 'no rows') : r.rowCounts[p] + (r.rowCounts[p] === 1 ? ' row, ' : ' rows, ') + Math.round(r.fills[p] * 100) + '%' }));
  const name = clientName(app.record) || 'Household';
  mapHost.appendChild(orbitMap({
    compact: mapHost.clientWidth > 0 && mapHost.clientWidth < 560,
    ariaLabel: 'The household and its seven planets',
    center: { title: name, sub: Math.round(overallConfidence(r) * 100) + '% confident', fill: r.fills.sun },
    items,
    onOpen: id => { location.hash = '#/ledger/' + id; },
    onFocus: id => describePlanet(bar, app, id),
  }));
  mapHost.appendChild(h('p', { class: 'small orbit-caption' }, h('a', { href: '#/scoreboard' }, 'Open the scoreboard'), ' \u00b7 ', h('a', { href: '#/money-date' }, app.view === 'client' ? 'Monthly check' : 'Money date')));
  mapHost.appendChild(h('p', { class: 'small muted orbit-caption' }, 'Each circle is a room. The number is how many rows it holds, the ring is how sure those numbers are. Tap one to open it.'));
  describePlanet(bar, app, null);
}

/* MR-057: a planet whose numbers come from other planets (Taxes from Income) is never "empty". */
function isDerived(app, id) { return !!(app.data && app.data.fields && app.data.fields.planets[id] && app.data.fields.planets[id].derived); }
function computes(app, id) {
  const M = app.result && app.result.metrics; if (!M) return false;
  return app.data.metrics.metrics.some(m => m.group === id && M[m.id] && M[m.id].status === 'ok');
}
function describePlanet(bar, app, id) {
  clear(bar);
  const r = app.result;
  if (!id) {
    const total = PLANETS.reduce((s, p) => s + r.rowCounts[p], 0);
    if (!total) { bar.appendChild(mapPanel({ title: 'Nothing entered yet', status: 'Income first: open the Income planet and add the first job.', actions: [h('a', { class: 'btn primary coach-only', href: '#/ledger/income' }, 'Open Income')] })); return; }
    /* default to the weakest planet, so the panel says something without a hover */
    const score = p => (r.fills[p] === null ? (isDerived(app, p) && computes(app, p) ? 2 : -1) : r.fills[p]);
    const weakest = PLANETS.slice().sort((a, b) => score(a) - score(b))[0];
    id = weakest;
  }
  const needs = r.needs[id] || [];
  if (!r.rowCounts[id] && isDerived(app, id)) {
    const ok = computes(app, id);
    bar.appendChild(mapPanel({ title: PLANET_LABELS[id] + (ok ? ' is computed' : ' waits on Income'), status: ok ? 'Federal tax and FICA come from the Income rows. Add a row only for tax paid outside a paycheck, like quarterly estimates.' : 'Federal tax and FICA come from the Income rows once gross pay and the filing status are in.', actions: [h('a', { class: 'btn primary', href: '#/ledger/' + id }, 'Open ' + lowerFirst(PLANET_LABELS[id]))] }));
    return;
  }
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
  const newBtn = h('button', { class: 'btn' + (list.length ? ' primary' : ''), 'aria-label': 'New client', onClick: () => { newRow.style.display = ''; nameInput.focus(); } }, 'New client');
  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', class: 'sr-only', 'aria-label': 'Import a client file', onChange: async e => {
    const f = e.target.files[0]; if (!f) return;
    try { await importFile(f); } catch (err) { app.toast(err.message); }
    e.target.value = '';
  } });
  nameInput.style.width = '176px';
  nameInput.style.flex = 'none';
  panel.appendChild(h('div', { class: 'row', style: { marginBottom: '8px' } },
    newBtn,
    h('a', { class: 'btn', href: '#/discovery', title: 'A one-screen form for the first call; it opens a new client' }, 'New discovery call'),
    app.record ? h('a', { class: 'btn', href: '#/call' }, 'Run the call') : null,
    h('button', { class: 'btn', onClick: () => fileInput.click() }, 'Import'),
    list.length ? h('button', { class: 'btn', title: 'Maya: example numbers only', onClick: () => loadDemo(app) }, 'Load demo client') : null,
    list.length ? h('button', { class: 'btn', title: 'A copy of Maya with nothing filled in', onClick: () => startFromZero(app) }, 'Start demo from zero') : null,
    list.some(c => DEMO_IDS.includes(c.id)) ? h('button', { class: 'btn quiet', title: 'Wipe the demo client and load it fresh', onClick: () => resetDemo(app) }, 'Reset demo') : null,
    fileInput));
  panel.appendChild(newRow);
  if (!list.length) {
    /* the first visit (MR-057): one line on what this is, and the demo as the way in */
    panel.appendChild(h('div', { class: 'empty first-visit' }, h('h2', null, 'No clients yet'),
      h('p', null, 'Money Rooms is one household\'s money in one place: a coach and a client look at the same numbers, and every number opens its math.'),
      h('div', { class: 'row', style: { marginTop: '12px' } }, h('button', { class: 'btn primary', title: 'Maya: example numbers only', onClick: () => loadDemo(app) }, 'Load demo client'), h('button', { class: 'btn', title: 'A copy of Maya with nothing filled in', onClick: () => startFromZero(app) }, 'Start demo from zero')),
      h('p', { class: 'small', style: { marginTop: '12px' } }, 'Or press New client and type a first name. Example numbers only; everything stays in this browser.')));
    return;
  }
  /* MR-057: three columns so the table fits its card; the last save sits under the name, in local time */
  const tbl = h('table', { class: 'data clients-table' },
    h('thead', null, h('tr', null, h('th', null, 'Client'), h('th', null, 'Session'), h('th', null, ''))),
    h('tbody', null, list.map(c => {
      const open = app.record && app.record.id === c.id;
      return h('tr', { class: open ? 'selected' : null },
        h('td', null, h('a', { href: '#/home', onClick: e => { e.preventDefault(); app.open(c.id); app.rerender(); } }, c.name || 'Unnamed client'), open ? h('span', { class: 'chip src', style: { marginLeft: '8px' } }, 'Open') : null, h('div', { class: 'muted small' }, 'Saved ' + F.dateLocal(c.updatedAt))),
        h('td', { class: 'small' }, sessionCell(app, c)),
        h('td', { class: 'num' },
          h('button', { class: 'btn small', onClick: () => { const r = app.store.load(c.id); if (r) exportClient(r); } }, 'Export'),
          ' ',
          h('button', { class: 'btn small quiet', onClick: () => confirmRemove(app, c) }, 'Delete')));
    })));
  panel.appendChild(h('div', { class: 'tablewrap' }, tbl));
}

const DEMO_IDS = ['maya', 'maya-zero'];
/* Reset demo (MR-057): wipe the demo client, and the from-zero copy, then load Maya fresh. */
function resetDemo(app) {
  DEMO_IDS.forEach(id => { if (app.store.load(id)) app.remove(id); });
  loadDemo(app);
}
/* Start demo from zero (MR-057): a copy of Maya with nothing filled in but her name, for the unlock walk. */
function startFromZero(app) {
  if (app.store.load('maya-zero')) app.remove('maya-zero');
  const rec = app.store.newRecord(); const born = rec.id;
  rec.id = 'maya-zero';
  Rec.setField(rec, 'sun', 'name', 'Maya, from zero', 'known', 'client');
  app.store.save(rec); app.store.remove(born);
  app.open(rec.id);
  app.toast('A blank copy of Maya. Enter her numbers one at a time.');
  app.rerender();
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
      /* a calendar for the date (MR-038); an age box beside it when only the age or the year is known */
      const picker = datePicker({ value: f.v && f.state !== 'rough' ? f.v : null, precision: 'day', label: SUN_LABELS[id], min: '1900-01-01', max: todayIso(), onCommit: iso => { if (iso === null) commit(null); else { commit(iso, 'known'); age.value = ''; } } });
      const age = h('input', { class: 'input num age', type: 'text', inputmode: 'numeric', value: f.v && f.state === 'rough' ? String(F.ageAt(f.v, todayIso())) : '', 'aria-label': 'Age or birth year, if the date is unknown', title: 'An age (27) or a year (1999) is enough', onChange: e => {
        const t = e.target.value.trim();
        if (t === '') return;
        const p = parseBirthText(t, todayIso());
        if (!p) { app.toast('An age (27) or a birth year (1999) is enough here.'); e.target.value = ''; return; }
        picker.value = ''; e.target.value = p.state === 'rough' ? String(F.ageAt(p.iso, todayIso())) : ''; commit(p.iso, p.state);
        if (p.state === 'known') picker.value = p.iso;
      } });
      control = h('span', { class: 'picker birth' }, picker, h('span', { class: 'or' }, 'or age'), age);
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
  /* MR-060: Retirement and FI is part of the profile; the same form as the Life plan page */
  renderProfileForm(panel, app, 'life', 'retirement', app.view === 'coach' ? 'Retirement and FI' : 'When work becomes a choice', 'Life plan');
  renderProfileForm(panel, app, 'debt', 'score', app.view === 'coach' ? 'Credit score' : 'Your credit score', 'Debt and credit');
  const fill = app.result ? app.result.fills.sun : 0;
  const withRows = PLANETS.filter(p => app.result.rowCounts[p] > 0).length;
  const asked = SUN_ASKED.filter(id => rec.sun.f[id] && rec.sun.f[id].v !== null && rec.sun.f[id].v !== undefined && rec.sun.f[id].v !== '').length;
  panel.appendChild(h('p', { class: 'hint coach-only sun-confidence', style: { marginTop: '8px' } }, asked + ' of ' + SUN_ASKED.length + ' facts in. ' + withRows + ' of 7 planets have rows.'));
}

/* A profile form (MR-060, MR-064): a single-row type flagged `form` (Retirement and FI, the credit score) sits under Household facts; the room keeps a read-only link. */
function renderProfileForm(panel, app, planet, type, title, roomLabel) {
  const fields = app.data.fields; const tdef = fields.planets[planet].types[type];
  const row = app.record.planets[planet].rows.find(r => r.type === type);
  if (!row) return; /* made when the client opened (engine/record.js ensureProfileRows) */
  const sec = h('div', { class: 'retire-form' }, h('h3', { class: 'facts-sub' }, title, h('a', { class: 'small', href: '#/ledger/' + planet + '/' + type, style: { marginLeft: '8px' } }, roomLabel)));
  const table = ledgerTable(h('div'), app, planet, type, { formOnly: true });
  sec.appendChild(table.detailsBody(row, { inline: true }));
  panel.appendChild(sec);
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
    h('thead', null, h('tr', null, h('th', null, 'When'), h('th', null, 'What'), h('th', null, 'Now'))),
    h('tbody', null, lines.map(l => h('tr', null,
      h('td', { class: 'muted small when' }, F.dateTimeLocal(l.ts)),
      h('td', { class: 'what' }, whereChip(l), ' ', describe(l, fieldsData)),
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
