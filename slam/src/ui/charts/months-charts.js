// Analyze, Months (S-089): pick any closed month and see its saved review
// (never recomputed), any revisions next to it, and its budget-to-cash bridge.

import { h, options } from '../dom.js';
import { monthLabel } from '../format.js';
import { card } from './catalog.js';
import { reviewCard } from '../components/loop.js';
import { bridgeCard } from './bridge-charts.js';

export function monthsCards(ctx, s) {
  const closed = ctx.doc.months.slice().reverse();
  if (!closed.length) return [card(ctx, { id: 'months-none', title: 'Months', reading: 'Close a month (Budget, Close month) to see its review here.' })];
  const key = closed.some((m) => m.key === ctx.ui.monthsPick) ? ctx.ui.monthsPick : closed[0].key;
  const rec = closed.find((m) => m.key === key);
  const picker = h('div', { class: 'card' }, h('label', { class: 'row' }, h('b', {}, 'Closed month'),
    h('select', { 'data-key': 'months-pick', onchange: (e) => { ctx.ui.monthsPick = e.target.value; ctx.rerender(); } }, options(closed.map((m) => [m.key, monthLabel(m.key)]), key))));
  return [picker, reviewCard(ctx, rec, { id: 'months-review' }), bridgeCard(ctx, s, key, { picker: false, id: 'months-bridge' })];
}
