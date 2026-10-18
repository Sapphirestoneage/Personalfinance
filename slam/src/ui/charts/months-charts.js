// Insights, Over time (S-106): guesses, plans, and actuals for one category,
// and the 80/20 for a range. A closed month's saved review is on Review.

import { h, options } from '../dom.js';
import { monthLabel } from '../format.js';
import { card } from './catalog.js';
import { lines, paretoChart } from './svg.js';
import { paretoLevels, rangeMonths } from '../../calc/pareto.js';
import { chartWidth } from './catalog.js';
import { money, dayLabel } from '../format.js';
import { estimateHistory } from '../../calc/estimates.js';

// Estimate at each close, plan, and actual for one category, month by month (S-090).
export function estimateCard(ctx, s) {
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
    extra: h('div', {}, h('select', { 'aria-label': 'Category', 'data-key': 'est-cat', 'data-picker': 'focus', onchange: (e) => { ctx.ui.estCat = e.target.value; ctx.rerender(); } }, options(cats.map((c) => [c.id, c.name]), catId)),
      eh.changes.length ? h('ul', { class: 'plain' }, eh.changes.slice(-6).map((c) => h('li', { class: 'xs' }, h('span', {}, c.what + ', ' + dayLabel(c.at.slice(0, 10)) + ' (' + monthLabel(c.month) + ')'), h('b', { class: 'num' }, money(c.from) + ' to ' + money(c.to))))) : null),
    reading: !eh.rows.length ? 'Close a month to see this.' : last ? 'Last month with an actual (' + monthLabel(last.key) + '): estimate ' + money(last.estimate) + ', plan ' + money(last.plan) + ', actual ' + money(last.actual) + '. ' + eh.changes.length + ' estimate change' + (eh.changes.length === 1 ? '' : 's') + ' on file.' : 'No actuals yet.'
  });
}

const RANGES = [['month', 'This month'], ['3', 'Last 3'], ['12', 'Last 12'], ['all', 'All']];
const LEVELS = [['entries', 'Entries'], ['merchants', 'Merchants'], ['lines', 'Lines']];

// 80/20 for a range, at the level picked; lines only when there is no log (S-091).
export function paretoCard(ctx, s, anchor) {
  const range = ctx.ui.paretoRange || 'month';
  const p = paretoLevels(ctx.doc, s.history, rangeMonths(ctx.doc, s.history, range, anchor));
  const level = p.noEntries ? 'lines' : ctx.ui.paretoLevel || 'entries';
  const cut = p[level];
  const tog = (opts, cur, set, key) => h('div', { class: 'toggle', role: 'group' }, opts.map(([id, label]) => h('button', { 'aria-pressed': cur === id ? 'true' : 'false', 'data-key': key + '-' + id, onclick: () => { set(id); ctx.rerender(); } }, label)));
  return card(ctx, {
    id: 'pareto', title: '80/20',
    svg: cut.of ? paretoChart({ cumulative: cut.cumulative, count: cut.count, width: chartWidth(true), fmt: money, label: '80/20 by ' + level }) : null,
    extra: h('div', {}, h('div', { class: 'row' }, tog(RANGES, range, (v) => { ctx.ui.paretoRange = v; }, 'pareto-range'), p.noEntries ? null : tog(LEVELS, level, (v) => { ctx.ui.paretoLevel = v; }, 'pareto-level')),
      cut.count ? h('ul', { class: 'plain' }, cut.items.slice(0, 10).map((i) => h('li', { class: 'xs' }, h('span', {}, i.label), h('b', { class: 'num' }, money(i.amount, true))))) : null),
    reading: (p.noEntries ? 'No entries in the log for this period, so this is by budget line. ' : '') + cut.reading
  });
}
