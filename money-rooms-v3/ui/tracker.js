/* The fill tracker strip (MR-035): a bar, "N of M in", and the one thing to
   do now with a Go button that lands in that cell. Coach view only. */
import { h, clear } from './dom.js';
import { trackerSteps } from '../engine/tracker.js';

export function renderTracker(host, app) {
  clear(host);
  if (!app.record || app.view !== 'coach') return;
  const t = trackerSteps(app.record, app.data.fields);
  const pct = t.total ? Math.round(t.done / t.total * 100) : 100;
  host.appendChild(h('div', { class: 'tracker' + (t.next ? '' : ' complete'), role: 'status' },
    h('div', { class: 'bar', 'aria-hidden': 'true' }, h('div', { class: 'fill', style: { width: pct + '%' } })),
    h('div', { class: 'row tracker-row' },
      h('span', { class: 'count' }, t.done + ' of ' + t.total + ' in'),
      t.next ? h('span', { class: 'next' }, h('span', { class: 'muted' }, 'Now: '), t.next.label, h('span', { class: 'muted small' }, ' (' + t.next.where + ')')) : h('span', { class: 'next' }, 'Everything the numbers need is in.'),
      t.next ? h('a', { class: 'btn small primary', href: t.next.href, onClick: () => { if (t.next.rowId && t.next.field) app.focusAfterRender = { rowId: t.next.rowId, field: t.next.field }; } }, 'Go') : null,
      t.next && t.headlineOpen + t.detailOpen ? h('span', { class: 'small muted hide-narrow' }, (t.headlineOpen ? t.headlineOpen + ' headline' + (t.headlineOpen === 1 ? '' : 's') : '') + (t.headlineOpen && t.detailOpen ? ', ' : '') + (t.detailOpen ? t.detailOpen + ' detail' + (t.detailOpen === 1 ? '' : 's') : '') + ' left') : null)));
}
