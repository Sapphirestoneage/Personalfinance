// Screen 3, Budget: the main view. Everything important is visible without
// clicking: top strip, the key charts, the three-column table, and the cards.

import { h, options } from '../dom.js';
import { money, pct, signedMoney, monthLabel } from '../format.js';
import { statusChip } from '../components/status.js';
import { budgetTable, closedMonthTable } from '../components/budget-table.js';
import { nextCard, culpritsCard, gutCard, proofCard, completionCard, roughCard, extrasCard } from '../components/cards.js';
import { closeMonthSnapshot, snapshotOf } from '../../calc/summary.js';
import { monthRows } from '../../calc/history.js';
import { keyCharts } from '../charts/key-charts.js';

function tile(label, value, sub, cls) {
  return h('div', { class: 'tile' }, h('div', { class: 'label' }, label), h('div', { class: 'value ' + (cls || '') }, value), sub ? h('div', { class: 'sub' }, sub) : null);
}

function strip(summary) {
  const t = summary.totals;
  const inc = summary.income;
  const since = summary.sinceLast;
  return h('div', { class: 'strip' },
    tile('Take-home', money(t.takeHome), inc.takeHomeIsGuess ? h('span', {}, statusChip('guess'), ' state tax not included') : 'per month'),
    tile('Spending', money(t.spending), t.basisUsesEstimate.length ? 'uses estimates for ' + t.basisUsesEstimate.length : 'actuals'),
    tile(t.surplus !== null && t.surplus < 0 ? 'Shortfall' : 'Surplus', signedMoney(t.surplus), since && since.surplus !== null ? signedMoney(since.surplus) + ' since last time' : 'per month',
      t.surplus === null ? '' : t.surplus < 0 ? 'bad' : 'good'),
    tile('Savings rate', pct(t.savingsRate), 'incl. pre-tax'),
    tile('Housing', pct(t.housingShare), 'of take-home (band ' + pct(t.housingBand) + ')', t.housingOver ? 'bad' : t.housingOver === false ? 'good' : ''),
    tile('Blind spot', pct(summary.blindSpot.pct), 'of actual spending not in the estimates', summary.blindSpot.pct > 0.1 ? 'warn' : ''));
}

function monthBar(ctx, summary) {
  const doc = ctx.doc;
  const keys = summary.history.keys;
  return h('div', { class: 'card spread' },
    h('div', { class: 'row' },
      h('b', {}, ctx.ui.monthView === 'current' ? monthLabel(doc.currentMonth) : monthLabel(ctx.ui.monthView) + ' (closed)'),
      keys.length ? h('select', { 'aria-label': 'Pick a month', 'data-key': 'month-pick', onchange: (e) => { ctx.ui.monthView = e.target.value; ctx.rerender(); } },
        options([['current', 'Current: ' + monthLabel(doc.currentMonth)], ...keys.slice().reverse().map((k) => [k, monthLabel(k) + ' (closed)'])], ctx.ui.monthView)) : null),
    ctx.ui.monthView === 'current' ? h('button', { class: 'btn small', onclick: () => {
      if (!confirm('Close ' + monthLabel(doc.currentMonth) + '? Its numbers get locked as a snapshot. Late entries can still be added as revisions.')) return;
      ctx.store.closeMonth(closeMonthSnapshot(summary));
      ctx.update('Save snapshot', (d) => { d.snapshots.push(snapshotOf(summary, new Date().toISOString())); });
      ctx.toast(monthLabel(doc.currentMonth) + ' closed');
    } }, 'Close ' + monthLabel(doc.currentMonth)) : null);
}

function lensToggle(ctx) {
  const opts = [['dollars', 'Dollars'], ['percent', '% of take-home'], ['hours', 'Hours of work']];
  return h('div', { class: 'toggle', role: 'group', 'aria-label': 'Show amounts as' }, opts.map(([id, label]) =>
    h('button', { 'aria-pressed': ctx.ui.lens === id ? 'true' : 'false', onclick: () => { ctx.ui.lens = id; ctx.rerender(); } }, label)));
}

export function renderBudget(ctx, summary) {
  const closed = ctx.ui.monthView !== 'current' && summary.history.keys.includes(ctx.ui.monthView);
  const hoursMissing = ctx.ui.lens === 'hours' && summary.income.hourlyTakeHome === null;
  return h('div', {},
    h('h1', {}, 'Budget'),
    strip(summary),
    monthBar(ctx, summary),
    nextCard(ctx, summary),
    closed ? null : keyCharts(ctx, summary),
    h('div', { class: 'spread', style: 'margin:16px 0 8px' }, h('h2', { style: 'margin:0' }, closed ? 'Closed month' : 'Estimate, dream, actual'), closed ? null : lensToggle(ctx)),
    hoursMissing ? h('p', { class: 'small warn' }, 'Add hours worked per week to an income source (Basics) to see hours of work.') : null,
    closed ? closedMonthTable(ctx, monthRows(ctx.doc, summary.history, ctx.ui.monthView), ctx.ui.monthView) : budgetTable(ctx, summary),
    h('div', { class: 'grid two', style: 'margin-top:12px' },
      culpritsCard(summary),
      gutCard(summary),
      proofCard(summary),
      completionCard(summary),
      roughCard(ctx, summary),
      extrasCard(summary)));
}
