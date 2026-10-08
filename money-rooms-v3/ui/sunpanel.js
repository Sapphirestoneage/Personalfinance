/* Household facts (moved from Home in Level 14, MR-072): the Sun's own
   fields as a short form, with the two profile forms (Retirement and FI,
   the credit score) under it. Lives on the Plan overview now. */
import { h, clear, todayIso } from './dom.js';
import { stateChip, sourceChip } from './chips.js';
import { SUN_FIELDS, SUN_ASKED, SUN_MORE, WORK_SITUATIONS, PLANETS, FILING_STATUSES } from '../engine/sun.js';
import * as F from '../engine/format.js';
import { hasValue } from '../engine/states.js';
import { datePicker } from './datepicker.js';
import { ledgerTable } from './table.js';

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
const WORK_LABELS = { employed: 'Employed', 'self-employed': 'Self-employed', 'between-jobs': 'Between jobs', student: 'Student', retired: 'Retired', mixed: 'Mixed' };
export const SUN_LABELS = { name: 'Name', birthDate: 'Birth date', state: 'State', city: 'City', workSituation: 'Work situation', dependents: 'Dependents', filingStatus: 'Filing status', bigGoal: 'Big goal' };
let moreOpen = false;

export function renderSun(panel, app) {
  clear(panel);
  if (!app.record) { panel.appendChild(h('h2', null, 'Household facts')); panel.appendChild(h('p', { class: 'muted small' }, 'Open a client first.')); return; }
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
      into.appendChild(h('div', { class: 'fieldrow sun', dataset: { field: id } }, h('label', null, SUN_LABELS[id]), h('div', { class: 'control' }, displayValue(id, f, states))));
      return;
    }
    let control;
    const commit = (value, state) => {
      const live = rec.sun.f[id] || f;
      const st = state || (value === null || value === '' ? 'unknown' : (live.state === 'unknown' ? 'known' : live.state));
      const src = value !== live.v && live.source === 'estimated' ? 'client' : (live.source || 'client');
      app.setField('sun', id, value === '' ? null : value, st, src);
    };
    if (id === 'birthDate') {
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
      control = h('select', { class: 'select', 'aria-label': SUN_LABELS[id], onChange: e => commit(e.target.value) }, h('option', { value: '' }, 'Not entered'), states.map(s => h('option', { value: s[0], selected: f.v === s[0] }, s[1])));
    } else if (id === 'workSituation') {
      control = h('select', { class: 'select', 'aria-label': SUN_LABELS[id], onChange: e => commit(e.target.value) }, h('option', { value: '' }, 'Not entered'), WORK_SITUATIONS.map(w => h('option', { value: w, selected: f.v === w }, WORK_LABELS[w])));
    } else if (id === 'filingStatus') {
      control = h('select', { class: 'select', 'aria-label': SUN_LABELS[id], onChange: e => commit(e.target.value) }, h('option', { value: '' }, 'Not entered'), FILING_STATUSES.map(w => h('option', { value: w[0], selected: f.v === w[0] }, w[1])));
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
  renderProfileForm(panel, app, 'life', 'retirement', app.view === 'coach' ? 'Retirement and FI' : 'When work becomes a choice', 'Life plan');
  renderProfileForm(panel, app, 'debt', 'score', app.view === 'coach' ? 'Credit score' : 'Your credit score', 'Debt and credit');
}

/* A profile form (MR-060, MR-064): a single-row type flagged `form` sits under Household facts; the room keeps a read-only link. */
function renderProfileForm(panel, app, planet, type, title, roomLabel) {
  const fields = app.data.fields; const tdef = fields.planets[planet].types[type];
  const row = app.record.planets[planet].rows.find(r => r.type === type);
  if (!row) return;
  const sec = h('div', { class: 'retire-form' }, h('h3', { class: 'facts-sub' }, title, h('a', { class: 'small', href: '#/ledger/' + planet + '/' + type, style: { marginLeft: '8px' } }, roomLabel)));
  const table = ledgerTable(h('div'), app, planet, type, { formOnly: true });
  sec.appendChild(table.detailsBody(row, { inline: true }));
  panel.appendChild(sec);
}

export function updateSunValues(panel, app) {
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
  if (focusedChip) { const again = panel.querySelector('.fieldrow[data-field="' + focusedChip.field + '"] select[aria-label="' + focusedChip.which + '"]'); if (again) again.focus(); }
}

function displayValue(id, f, states) {
  const v = f.v;
  if (!hasValue(f) || v === '') return h('span', { class: 'value empty-token' }, 'Not entered');
  if (id === 'birthDate') return h('span', { class: 'value' }, f.state === 'rough' ? v.slice(0, 4) + ' (about ' + F.ageAt(v, todayIso()) + ')' : F.dateLong(v) + ' (age ' + F.ageAt(v, todayIso()) + ')');
  if (id === 'state') { const s = states.find(x => x[0] === v); return h('span', { class: 'value' }, s ? s[1] : v); }
  if (id === 'workSituation') return h('span', { class: 'value' }, WORK_LABELS[v] || v);
  if (id === 'filingStatus') { const s = FILING_STATUSES.find(x => x[0] === v); return h('span', { class: 'value' }, s ? s[1] : v); }
  return h('span', { class: 'value' }, String(v));
}
export { PLANETS };
