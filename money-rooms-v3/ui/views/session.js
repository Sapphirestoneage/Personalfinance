/* The session screen: the next-question card (one big, two smaller), the
   circle-back list, my plate and their plate with a Small Wins tab, the
   follow-up email, session snapshots and what changed since last time.
   Coach view only; nothing here reaches the client view or the one-pager. */
import { h, clear, qs } from '../dom.js';
import * as F from '../../engine/format.js';
import { session as leverage } from '../../engine/leverage.js';
import { followUpEmail } from '../../engine/email.js';
import { sinceLastSession, changeText } from '../../engine/plates.js';
import { PLANET_LABELS, PLANET_SHORT } from '../../engine/sun.js';
import { clientName } from '../app.js';
import { append } from '../../engine/journal.js';
import { STATES, SOURCES } from '../../engine/states.js';

export function mount(host, app) {
  const noteInput = h('input', { class: 'input session-note', type: 'text', 'aria-label': 'Session note' });
  const header = h('header', null, h('h1', null, 'Session'), h('span', { class: 'sub' }, 'The next question is the unsure fact that moves the most money.'), h('div', { class: 'actions' },
    h('label', { class: 'small muted' }, 'Note for this session'), noteInput,
    h('button', { class: 'btn', onClick: () => { snapshot(app, noteInput.value.trim()); noteInput.value = ''; } }, 'Close this session')));
  host.appendChild(header);
  const grid = h('div', { class: 'grid grid-2' });
  const left = h('div', { class: 'stack' }); const right = h('div', { class: 'stack' });
  grid.appendChild(left); grid.appendChild(right);
  host.appendChild(grid);
  let tab = 'all';
  function draw() {
    clear(left); clear(right);
    const s = leverage({ record: app.record, fields: app.data.fields, weights: app.data.weights });
    left.appendChild(nextCard(app, s));
    left.appendChild(plates(app, s, tab, t => { tab = t; draw(); }));
    right.appendChild(sinceLast(app));
    right.appendChild(emailPanel(app, s));
    right.appendChild(sessionsPanel(app));
  }
  draw();
  return { update() { draw(); } };
}

function itemKey(i) { return i.rowId + '|' + i.field; }
function isDone(app, i) { const plate = i.plate === 'mine' ? app.record.myPlate : app.record.theirPlate; return !!(plate.done && plate.done[itemKey(i)]); }
function markDone(app, i, done) {
  app.mutate(rec => { const plate = i.plate === 'mine' ? rec.myPlate : rec.theirPlate; plate.done = plate.done || {}; if (done) plate.done[itemKey(i)] = new Date().toISOString(); else delete plate.done[itemKey(i)]; if (i.note) { const n = rec.quickNotes.find(x => x.id === i.rowId); if (n) n.filed = done; } }, 'plates');
}
/* "Could cut: could cut per month" reads badly; when the fact label already starts with the row name, show the label alone. */
function factLabel(i) {
  const label = i.label.toLowerCase();
  if (i.row && label.indexOf(i.row.toLowerCase()) === 0) return i.label.charAt(0).toUpperCase() + i.label.slice(1);
  return (i.row ? i.row + ': ' : '') + label;
}
function hrefFor(i) { return i.rowId === 'sun' ? '#/home' : '#/ledger/' + i.planet + '/' + (i.rowType || ''); }
function askLink(app, i, label, primary) {
  const row = i.rowId === 'sun' ? null : Object.values(app.record.planets).flatMap(p => p.rows).find(r => r.id === i.rowId);
  const href = i.rowId === 'sun' ? '#/home' : row ? '#/ledger/' + i.planet + '/' + row.type : '#/home';
  return h('a', { class: primary ? 'btn primary' : 'btn', href, onClick: () => { app.focusAfterRender = { rowId: i.rowId, field: i.field }; } }, label || 'Ask it');
}
function stateChipOf(i) {
  if (i.note) return h('span', { class: 'chip src' }, 'Note');
  if (i.source === 'estimated' || i.source === 'lookup-verify') return h('span', { class: 'chip src src-' + i.source }, i.source === 'estimated' ? 'Estimate' : 'Verify');
  return h('span', { class: 'chip state-' + i.state }, STATES[i.state].label);
}

function nextCard(app, s) {
  const panel = h('section', { class: 'panel next-card' });
  panel.appendChild(h('h2', null, 'Next question'));
  if (!s.next.length) { panel.appendChild(h('p', { class: 'muted' }, 'Nothing unsure is left above the materiality line. Open Small wins or the Ledger to add facts.')); return panel; }
  const [big, ...rest] = s.next;
  const stake = i => i.moneyFact && i.dollarsAnnual ? h('span', { class: 'small muted' }, F.dollarsWhole(Math.abs(i.dollarsAnnual), { rough: true }) + ' a year at stake') : null;
  panel.appendChild(h('div', { class: 'ask big' }, h('div', { class: 'ask-text' }, big.question), h('div', { class: 'ask-meta' }, h('span', { class: 'chip src' }, PLANET_SHORT[big.planet] || 'Household'), stateChipOf(big), stake(big), askLink(app, big, 'Ask it', true))));
  rest.forEach(i => panel.appendChild(h('div', { class: 'ask' }, h('div', { class: 'ask-text' }, i.question), h('div', { class: 'ask-meta' }, h('span', { class: 'chip src' }, PLANET_SHORT[i.planet] || 'Household'), stake(i), askLink(app, i, 'Go to row')))));
  return panel;
}

function plates(app, s, tab, setTab) {
  const panel = h('section', { class: 'panel' });
  const tabs = [['all', 'All, ranked', s.circleBack], ['theirs', 'Their plate', s.theirPlate], ['mine', 'My plate', s.myPlate], ['small', 'Small wins', s.smallWins]];
  panel.appendChild(h('h2', null, 'Everything unsure', h('span', { class: 'tag' }, 'one table, ranked by leverage; the tabs filter it')));
  panel.appendChild(h('div', { class: 'row', style: { marginBottom: '8px' } }, tabs.map(t => h('button', { class: 'btn small' + (tab === t[0] ? ' primary' : ''), 'aria-pressed': String(tab === t[0]), onClick: () => setTab(t[0]) }, t[1] + ' (' + t[2].filter(i => !isDone(app, i)).length + ')'))));
  const list = tabs.find(t => t[0] === tab)[2];
  if (!list.length) { panel.appendChild(h('p', { class: 'muted small' }, tab === 'theirs' ? 'Nothing for the client to bring.' : tab === 'mine' ? 'Nothing to look up. Quick notes you have not filed land here.' : tab === 'small' ? 'No small items.' : 'Nothing else above the line.')); return panel; }
  panel.appendChild(h('div', { class: 'tablewrap' }, h('table', { class: 'data plates' }, h('thead', null, h('tr', null, h('th', null, 'Done'), h('th', null, 'Fact'), h('th', { class: 'hide-narrow' }, 'Where'), h('th', null, 'State'), h('th', { class: 'num' }, 'A year'), h('th', null, ''))),
    h('tbody', null, list.slice(0, 40).map(i => { const done = isDone(app, i); return h('tr', { class: done ? 'muted' : null },
      h('td', null, h('input', { type: 'checkbox', class: 'pick', 'aria-label': 'Mark done: ' + (i.note ? i.label : factLabel(i)), checked: done, onChange: e => markDone(app, i, e.target.checked) })),
      h('td', { class: 'wrap', style: done ? { textDecoration: 'line-through' } : null }, i.note ? i.label : factLabel(i)),
      h('td', { class: 'small muted hide-narrow' }, (PLANET_SHORT[i.planet] || 'Household') + (i.institution ? ', ' + i.institution : '')),
      h('td', null, stateChipOf(i)),
      h('td', { class: 'num' }, i.moneyFact ? F.dollarsWhole(Math.abs(i.dollarsAnnual)) : ''),
      h('td', null, i.note ? '' : askLink(app, i, 'Go', false))); })))));
  return panel;
}

function emailPanel(app, s) {
  const panel = h('section', { class: 'panel' });
  const text = followUpEmail(app.record, app.data.fields, s.theirPlate.filter(i => !isDone(app, i)));
  panel.appendChild(h('h2', null, 'Follow-up email', h('span', { class: 'tag' }, 'by institution')));
  const ta = h('textarea', { class: 'input email', readOnly: true, 'aria-label': 'Follow-up email draft', value: text });
  panel.appendChild(ta);
  panel.appendChild(h('div', { class: 'row', style: { marginTop: '8px' } }, h('button', { class: 'btn', onClick: () => { ta.select(); document.execCommand('copy'); app.toast('Email copied'); } }, 'Copy')));
  return panel;
}

function sessionsPanel(app) {
  const panel = h('section', { class: 'panel' });
  const list = app.record.sessions || [];
  panel.appendChild(h('h2', null, 'Sessions', h('span', { class: 'tag' }, list.length + ' closed')));
  if (!list.length) panel.appendChild(h('p', { class: 'muted small' }, 'Closing a session takes a snapshot; the one-pager then shows what changed since.'));
  else panel.appendChild(h('div', { class: 'tablewrap' }, h('table', { class: 'data' }, h('tbody', null, list.slice().reverse().map(sn => h('tr', null, h('td', null, sn.label), h('td', { class: 'small muted' }, F.dateLong(sn.at.slice(0, 10))), h('td', { class: 'small' }, sn.note || '')))))));
  return panel;
}

function sinceLast(app) {
  const panel = h('section', { class: 'panel' });
  const r = sinceLastSession(app.record, app.data.fields, changeText);
  panel.appendChild(h('h2', null, 'Since last time', r.since ? h('span', { class: 'tag' }, F.dateLong(r.since.slice(0, 10))) : null));
  if (!r.changes.length) { panel.appendChild(h('p', { class: 'muted small' }, r.since ? 'No changes since the last session.' : 'No session closed yet.')); return panel; }
  panel.appendChild(h('div', { class: 'tablewrap' }, h('table', { class: 'data' }, h('tbody', null, r.changes.slice(0, 8).map(c => h('tr', null, h('td', { class: 'wrap' }, c.row + ': ' + c.label.toLowerCase()), h('td', { class: 'small muted' }, c.text)))))));
  return panel;
}

export function snapshot(app, note) {
  const n = (app.record.sessions || []).length + 1;
  app.mutate(rec => {
    const at = new Date().toISOString();
    rec.sessions.push({ id: 's' + n, label: 'Session ' + n, at, note: note || '' });
    append(rec.journal, { kind: 'session', planet: 'sun', rowId: 'sun', field: null, owner: 'sun', old: null, new: 's' + n, source: 'client', state: 'known', session: 's' + n }, at);
  }, 'sessions');
  app.toast('Session ' + n + ' closed. The one-pager now compares against it.');
}
