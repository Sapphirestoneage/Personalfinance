/* The fill tracker strip (MR-035): a bar, "N of M in", and the one thing to
   do now with a Go button that lands in that cell. Coach view only. */
import { h, clear } from './dom.js';
import { trackerSteps } from '../engine/tracker.js';
import { markTypeNone } from './table.js';
import { closeOverlay } from './app.js';

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
      h('button', { class: 'count linklike', title: 'See everything still to enter', 'aria-label': t.done + ' of ' + t.total + ' in, see the whole list', onClick: () => openQueue(app, t) }, t.done + ' of ' + t.total + ' in'),
      t.next ? h('span', { class: 'next' }, h('span', { class: 'muted' }, 'Now: '), t.next.label, h('span', { class: 'muted small' }, ' (' + t.next.where + ')')) : h('span', { class: 'next' }, 'Everything the numbers need is in.'),
      t.next ? h('a', { class: 'btn small primary', href: t.next.href, onClick: () => { if (t.next.rowId && t.next.field) app.focusAfterRender = { rowId: t.next.rowId, field: t.next.field }; } }, 'Go') : null,
      t.next && t.next.kind === 'rows' ? h('button', { class: 'btn small', title: 'None of these for this household', onClick: () => markTypeNone(app, t.next.planet, t.next.typeId) }, 'None') : null,
      t.next ? h('button', { class: 'btn small quiet', onClick: () => openQueue(app, t) }, 'All ' + left + ' left') : null,
      t.next && t.headlineOpen + t.detailOpen ? h('span', { class: 'small muted hide-narrow' }, (t.headlineOpen ? t.headlineOpen + ' headline' + (t.headlineOpen === 1 ? '' : 's') : '') + (t.headlineOpen && t.detailOpen ? ', ' : '') + (t.detailOpen ? t.detailOpen + ' detail' + (t.detailOpen === 1 ? '' : 's') : '') + ' left') : null)));
}
