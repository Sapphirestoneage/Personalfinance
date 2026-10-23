// Insights, Over time (S-106): guesses, plans, and actuals for one category,
// and the 80/20 for a range. A closed month's saved review is on Review.
// Numbers from src/engines/estimates.js (estimateHistory) and src/engines/pareto.js (paretoLevels,
// rangeMonths); this file only lays them out. Builds on dom, format, svg (paretoChart), and catalog.

import { h } from '../dom.js';
import { monthLabel } from '../format.js';
import { card } from './catalog.js';
import { paretoChart } from './svg.js';
import { paretoLevels, rangeMonths } from '../../engines/pareto.js';
import { chartWidth } from './catalog.js';
import { money, dayLabel } from '../format.js';
import { estimateHistory } from '../../engines/estimates.js';

// When a category's estimate changed (S-090). The estimate, plan, and actual by month
// are drawn once, in the focus series above (S-106); this card lists the changes for
// the category in focus (Food when the focus is a line or a merchant).
export function estimateCard(ctx, s, focusKey) {
  const cats = s.rows.filter((r) => !r.isDebt);
  const fromFocus = focusKey && focusKey.startsWith('cat:') ? focusKey.slice(4) : null;
  const catId = cats.some((c) => c.id === fromFocus) ? fromFocus : (cats.find((c) => c.id === 'food') || cats[0]).id;
  const eh = estimateHistory(ctx.doc, s.history, catId);
  const name = cats.find((c) => c.id === catId).name;
  return card(ctx, {
    id: 'estimate-history', title: 'When the estimate changed',
    extra: eh.changes.length ? h('ul', { class: 'plain' }, eh.changes.slice(-6).map((c) => h('li', { class: 'xs' }, h('span', {}, c.what + ', ' + dayLabel(c.at.slice(0, 10)) + ' (' + monthLabel(c.month) + ')'), h('b', { class: 'num' }, money(c.from) + ' to ' + money(c.to))))) : null,
    reading: !eh.rows.length ? 'Close a month to see this.' : name + ': ' + eh.changes.length + ' estimate change' + (eh.changes.length === 1 ? '' : 's') + ' on file.'
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
