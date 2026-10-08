/* The fill tracker strip (MR-035): a bar, "N of M in", and the one thing to
   do now with a Go button that lands in that cell. Coach view only. */
import { h, clear } from './dom.js';
import { trackerSteps } from '../engine/tracker.js';
import { markTypeNone } from './table.js';
import { closeOverlay } from './app.js';
import { stateOf, unlocksBetween, applyProbe } from '../engine/unlocks.js';
import { primaryFieldOf } from '../engine/fields.js';

/* What the next fact opens (owner feedback, MR-062): the engine is run once with a stand-in value in that one
   field, after the card is drawn, and the answer is remembered until the record changes. */
const opensCache = { key: null, text: null };
function probeOf(app, next) {
  if (next.kind === 'sun') return { kind: 'sun', field: next.field };
  if (next.kind === 'rows') { const prim = primaryFieldOf(app.data.fields, next.planet, next.typeId); return { kind: 'type', planet: next.planet, type: next.typeId, field: prim ? prim.id : null, addRow: true }; }
  if (next.rowId && next.field) { const row = Object.values(app.record.planets).flatMap(p => p.rows).find(r => r.id === next.rowId); return row ? { kind: 'field', planet: row.planet, type: row.type, field: next.field, rowId: next.rowId } : null; }
  return null;
}
function opensText(app, next) {
  const key = app.record.id + ':' + app.record.journal.length + ':' + (next.rowId || '') + ':' + (next.field || next.typeId || '');
  if (opensCache.key === key) return opensCache.text;
  let text = null;
  try {
    const probe = probeOf(app, next);
    if (probe) { const R = app.compute(applyProbe(app.record, probe, app.data), app.data); const u = unlocksBetween(stateOf(app.result, app.data), stateOf(R, app.data), R, app.data); const parts = [];
      if (u.metrics.length) parts.push(u.metrics.length + (u.metrics.length === 1 ? ' number' : ' numbers')); if (u.charts.length) parts.push(u.charts.length + (u.charts.length === 1 ? ' chart' : ' charts')); if (u.lenses.length) parts.push(u.lenses.length + (u.lenses.length === 1 ? ' reading' : ' readings'));
      text = parts.length ? 'Opens ' + parts.join(', ') : 'Sharpens what is already there'; }
  } catch (e) { text = null; }
  opensCache.key = key; opensCache.text = text;
  return text;
}

/* MR-060: the whole queue in a drawer. Grouped by where it lives; every line lands in its field. */
function openQueue(app, t) {
  const open = t.steps.filter(s => !s.done);
  const groups = [];
  open.forEach(s => { let g = groups.find(x => x.where === s.where); if (!g) { g = { where: s.where, items: [] }; groups.push(g); } g.items.push(s); });
  const go = s => { if (s.rowId && s.field) app.focusAfterRender = { rowId: s.rowId, field: s.field }; closeOverlay(); location.hash = s.href; };
  const body = h('div', { class: 'queue' },
    h('h2', null, open.length + (open.length === 1 ? ' thing' : ' things') + ' still to enter'),
    h('p', { class: 'small muted' }, t.done + ' of ' + t.total + ' in. Tap a line to land in that cell. Headline figures first, then details.'),
    groups.map(g => h('section', null, h('h3', null, g.where, h('span', { class: 'tag' }, g.items.length)), h('ul', { class: 'queue-list' }, g.items.map(s => h('li', null,
      h('a', { href: s.href, class: 'queue-item kind-' + s.kind, onClick: e => { e.preventDefault(); go(s); } }, h('span', { class: 'queue-label' }, s.label), h('span', { class: 'small muted' }, s.kind === 'rows' ? 'a first row' : s.kind === 'headline' ? 'headline' : s.kind === 'sun' ? 'household fact' : 'detail')),
      s.kind === 'rows' ? h('button', { class: 'btn small quiet', title: 'None of these for this household', onClick: () => { markTypeNone(app, s.planet, s.typeId); closeOverlay(); } }, 'None') : null))))));
  app.openDrawer(body, { label: 'Everything still to enter' });
}

export function renderTracker(host, app) {
  clear(host);
  if (!app.record || app.view !== 'coach') return;
  const t = trackerSteps(app.record, app.data.fields);
  const pct = t.total ? Math.round(t.done / t.total * 100) : 100;
  const left = t.total - t.done;
  host.appendChild(h('div', { class: 'tracker' + (t.next ? '' : ' complete'), role: 'status' },
    h('div', { class: 'bar', 'aria-hidden': 'true' }, h('div', { class: 'fill', style: { width: pct + '%' } })),
    h('div', { class: 'row tracker-row' },
      t.next ? h('span', { class: 'next' }, 'Next: ' + t.next.label + ' (' + t.next.where + ').') : h('span', { class: 'next' }, 'Everything the numbers need is in.'),
      t.next ? h('a', { class: 'btn small primary', href: t.next.href, onClick: () => { if (t.next.rowId && t.next.field) app.focusAfterRender = { rowId: t.next.rowId, field: t.next.field }; } }, 'Go') : null,
      h('span', { class: 'spacer' }),
      left ? h('button', { class: 'linklike small count', title: t.done + ' of ' + t.total + ' facts in; see everything still to enter', 'aria-label': left + ' left, see the whole list', onClick: () => openQueue(app, t) }, left + ' left') : null)));
}
