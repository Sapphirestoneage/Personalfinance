// Insights (S-106): read only. Every chart and lens appears exactly once, in
// five tabs. The only inputs are range, focus, and unit pickers (marked
// data-picker); anything that edits lives on its own screen, linked from the chart.

import { h } from '../dom.js';
import { pct, monthLabel } from '../format.js';
import * as c from '../charts/catalog.js';
import { INSIGHT_TABS } from '../nav.js';
import { budgetTable } from '../components/budget-table.js';
import { culpritsCard, proofCard, roughCard, extrasCard } from '../components/cards.js';
import { trendCards } from '../charts/trend-charts.js';
import { estimateCard, paretoCard } from '../charts/months-charts.js';
import { bridgeCards } from '../charts/bridge-charts.js';
import { forecastCard } from '../charts/cash-charts.js';
import { transactionCards } from '../charts/tx-charts.js';

function lensToggle(ctx) {
  const opts = [['dollars', 'Dollars'], ['percent', '% of take-home'], ['hours', 'Hours of work']];
  return h('div', { class: 'toggle', role: 'group', 'aria-label': 'Show amounts as' }, opts.map(([id, label]) =>
    h('button', { 'aria-pressed': ctx.ui.lens === id ? 'true' : 'false', onclick: () => { ctx.ui.lens = id; ctx.rerender(); } }, label)));
}

// The table of every category: estimate, plan, actual, shares, happiness, gaps.
function tableCard(ctx, s) {
  const hoursMissing = ctx.ui.lens === 'hours' && s.income.hourlyTakeHome === null;
  return h('div', { class: 'card', id: 'budget-table', style: 'grid-column:1 / -1' },
    h('div', { class: 'spread' }, h('h3', { style: 'margin:0' }, 'Category by category'), lensToggle(ctx)),
    hoursMissing ? h('p', { class: 'small warn' }, 'Add hours worked per week to an income source (Setup, Income) to see hours of work.') : null,
    budgetTable(ctx, s));
}

function blindSpot(s) {
  return h('div', { class: 'strip three', style: 'grid-column:1 / -1' }, h('div', { class: 'tile' }, h('div', { class: 'label' }, 'Blind spot'),
    h('div', { class: 'value ' + (s.blindSpot.pct > 0.1 ? 'warn' : '') }, pct(s.blindSpot.pct)), h('div', { class: 'sub' }, 'of actual spending not in the estimates')));
}

// The 80/20 reads the closed month picked on Review (or the latest one).
function paretoAnchor(ctx) {
  const closed = ctx.doc.months.map((m) => m.key);
  return closed.includes(ctx.ui.monthsPick) ? ctx.ui.monthsPick : closed[closed.length - 1];
}

const TABS = {
  where: (ctx, s) => [c.sankeyCard(ctx, s, true), c.donutCard(ctx, s), c.nwsCard(ctx, s, true), c.fixedVariableCard(ctx, s), c.typesCard(ctx, s), c.tagsCard(ctx, s), c.gaugesCard(ctx, s)],
  compared: (ctx, s) => [blindSpot(s), tableCard(ctx, s), c.threeColumnCard(ctx, s, true), c.overlapCard(ctx, s), c.varianceCard(ctx, s), c.accuracyCard(ctx, s), c.gutCard(ctx, s),
    culpritsCard(ctx, s), proofCard(s), c.completionCard(ctx, s), roughCard(ctx, s)],
  time: (ctx, s) => [c.varianceByMonthCard(ctx, s), ...trendCards(ctx, s), estimateCard(ctx, s, ctx.ui.trendFocus), paretoCard(ctx, s, paretoAnchor(ctx))],
  cash: (ctx, s) => [...bridgeCards(ctx, s), forecastCard(ctx), ...transactionCards(ctx, s)],
  you: (ctx, s) => [c.draftCard(ctx, s), c.joyCard(ctx, s), c.stressCard(ctx, s), c.mistakeCard(ctx, s), c.incomeStatementCard(ctx, s), extrasCard(s, ctx.future)]
};

export function renderInsights(ctx, summary) {
  const tab = TABS[ctx.ui.insightsTab] ? ctx.ui.insightsTab : 'where';
  const anchor = paretoAnchor(ctx);
  return h('div', {},
    h('h1', {}, 'Insights'),
    h('div', { class: 'passes', role: 'tablist' }, INSIGHT_TABS.map(([id, label]) => h('button', {
      role: 'tab', 'aria-selected': id === tab ? 'true' : 'false', 'aria-current': id === tab ? 'step' : null, 'data-key': 'tab-' + id,
      onclick: () => ctx.go('insights', { insightsTab: id })
    }, label))),
    tab === 'time' && anchor ? h('p', { class: 'xs muted' }, 'The 80/20 counts from ' + monthLabel(anchor) + ', the closed month picked on Review.') : null,
    h('div', { class: 'grid two', id: 'tab-' + tab }, TABS[tab](ctx, summary)));
}
