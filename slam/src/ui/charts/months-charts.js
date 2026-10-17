// Analyze, Months (S-089): pick any closed month and see its saved review
// (never recomputed), any revisions next to it, and its budget-to-cash bridge.

import { h, options } from '../dom.js';
import { monthLabel } from '../format.js';
import { card } from './catalog.js';
import { reviewCard } from '../components/loop.js';
import { bridgeCard } from './bridge-charts.js';
import { lines } from './svg.js';
import { chartWidth } from './catalog.js';
import { money, dayLabel } from '../format.js';
import { estimateHistory } from '../../calc/estimates.js';

// Estimate at each close, plan, and actual for one category, month by month (S-090).
function estimateCard(ctx, s) {
  const cats = s.rows.filter((r) => !r.isDebt);
  const catId = cats.some((c) => c.id === ctx.ui.estCat) ? ctx.ui.estCat : (cats.find((c) => c.id === 'food') || cats[0]).id;
  const eh = estimateHistory(ctx.doc, s.history, catId);
  const xs = eh.rows.map((r) => monthLabel(r.key).slice(0, 3) + " '" + r.key.slice(2, 4));
  const series = [
    { name: 'Estimate at close', color: 'var(--series-estimate)', values: eh.rows.map((r) => r.estimate) },
    { name: 'Plan', color: 'var(--series-dream)', dashed: true, values: eh.rows.map((r) => r.plan) },
    { name: 'Actual', color: 'var(--series-actual)', values: eh.rows.map((r) => r.actual) }
  ];
  const last = eh.rows.filter((r) => r.actual !== null).slice(-1)[0];
  return card(ctx, {
    id: 'estimate-history', title: 'Guesses, plans, and actuals',
    svg: eh.rows.length ? lines({ series, xs, width: chartWidth(true), fmt: money, label: 'Estimate, plan, and actual by month' }) : null,
    legendItems: series.map((x) => [x.name, x.color]),
    extra: h('div', {}, h('select', { 'aria-label': 'Category', 'data-key': 'est-cat', onchange: (e) => { ctx.ui.estCat = e.target.value; ctx.rerender(); } }, options(cats.map((c) => [c.id, c.name]), catId)),
      eh.changes.length ? h('ul', { class: 'plain' }, eh.changes.slice(-6).map((c) => h('li', { class: 'xs' }, h('span', {}, c.what + ', ' + dayLabel(c.at.slice(0, 10)) + ' (' + monthLabel(c.month) + ')'), h('b', { class: 'num' }, money(c.from) + ' to ' + money(c.to))))) : null),
    reading: !eh.rows.length ? 'Close a month to see this.' : last ? 'Last month with an actual (' + monthLabel(last.key) + '): estimate ' + money(last.estimate) + ', plan ' + money(last.plan) + ', actual ' + money(last.actual) + '. ' + eh.changes.length + ' estimate change' + (eh.changes.length === 1 ? '' : 's') + ' on file.' : 'No actuals yet.'
  });
}

export function monthsCards(ctx, s) {
  const closed = ctx.doc.months.slice().reverse();
  if (!closed.length) return [card(ctx, { id: 'months-none', title: 'Months', reading: 'Close a month (Budget, Close month) to see its review here.' })];
  const key = closed.some((m) => m.key === ctx.ui.monthsPick) ? ctx.ui.monthsPick : closed[0].key;
  const rec = closed.find((m) => m.key === key);
  const picker = h('div', { class: 'card' }, h('label', { class: 'row' }, h('b', {}, 'Closed month'),
    h('select', { 'data-key': 'months-pick', onchange: (e) => { ctx.ui.monthsPick = e.target.value; ctx.rerender(); } }, options(closed.map((m) => [m.key, monthLabel(m.key)]), key))));
  return [picker, reviewCard(ctx, rec, { id: 'months-review' }), bridgeCard(ctx, s, key, { picker: false, id: 'months-bridge' }), estimateCard(ctx, s)];
}
