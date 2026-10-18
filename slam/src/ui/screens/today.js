// Today (S-106): where the month stands, and what to do next. The Plan, Track,
// Review strip (the step for now highlighted), the first-session checklist
// until it is done, the Next card, the next 30 days of cash with safe to spend
// and Quick entry, and four headline tiles. No other charts: they live in Insights.

import { h } from '../dom.js';
import { money, pct, signedMoney, todayIso, dayLabel } from '../format.js';
import { statusChip } from '../components/status.js';
import { nextCard } from '../components/cards.js';
import { budgetCashStrip } from '../components/cashflow.js';
import { loopStripCard } from '../components/loop.js';
import { jumpLink } from '../components/jump.js';
import { firstSession, staleBalances, loopStep, loopStrip } from '../../calc/loop.js';
import { explain } from '../../calc/explain.js';
import { howButton, howPanel } from '../components/how.js';

function tile(label, value, sub, cls) {
  return h('div', { class: 'tile' }, h('div', { class: 'label' }, label), h('div', { class: 'value ' + (cls || '') }, value), sub ? h('div', { class: 'sub' }, sub) : null);
}

// At most four headline numbers (S-106): take-home, spending, surplus, savings rate.
// Each one opens how it was worked out (S-108).
export function headlineTiles(ctx, summary) {
  const t = summary.totals;
  const inc = summary.income;
  const since = summary.sinceLast;
  const hb = (key, text) => howButton(ctx, key, text);
  const open = ['takeHome', 'spending', 'surplus', 'savingsRate'].includes(ctx.ui.how) ? ctx.ui.how : null;
  return h('div', {},
    h('div', { class: 'strip four', id: 'headline' },
      tile('Take-home', hb('takeHome', money(t.takeHome)), inc.takeHomeIsGuess ? h('span', {}, statusChip('guess'), ' state tax not included') : 'per month'),
      tile('Spending', hb('spending', money(t.spending)), t.basisUsesEstimate.length ? 'uses estimates for ' + t.basisUsesEstimate.length : 'actuals'),
      tile(t.surplus !== null && t.surplus < 0 ? 'Shortfall' : 'Surplus', hb('surplus', signedMoney(t.surplus)), since && since.surplus !== null ? signedMoney(since.surplus) + ' since last time' : 'per month',
        t.surplus === null ? '' : t.surplus < 0 ? 'bad' : 'good'),
      tile('Savings rate', hb('savingsRate', pct(t.savingsRate)), 'incl. pre-tax')),
    open ? howPanel(ctx, explain(summary, open)) : null);
}

function firstSessionCard(ctx, summary) {
  const fs = firstSession(ctx.doc, summary);
  if (fs.done) return null;
  return h('div', { class: 'card', id: 'first-session' },
    h('h2', { style: 'margin-top:0' }, 'First session (' + (fs.items.length - fs.left) + ' of ' + fs.items.length + ')'),
    h('ul', { class: 'plain' }, fs.items.map((i) => h('li', { class: 'small', 'data-key': 'first-' + i.key },
      h('span', {}, h('span', { class: 'chip ' + (i.done ? 'st-known' : 'st-dont-know') }, i.done ? 'Done' : 'To do'), ' ', i.label),
      i.done ? null : jumpLink(ctx, i.where, 'Do it', 'first-go-' + i.key)))));
}

// At month end, balances that have not been updated join the Next card (S-114).
function staleExtra(ctx, summary) {
  const today = todayIso();
  if (loopStep(loopStrip(ctx.doc, summary, today), today) !== 'review') return null;
  const stale = staleBalances(ctx.doc, today);
  if (!stale.length) return null;
  return { label: '2. Update balances: ' + stale.map((x) => x.name).join(', '), why: stale.map((x) => (x.last ? 'not since ' + dayLabel(x.last) : 'never')).join(', '), where: 'balances' };
}

export function renderToday(ctx, summary) {
  return h('div', {},
    h('h1', {}, 'Today'),
    loopStripCard(ctx, summary),
    firstSessionCard(ctx, summary),
    nextCard(ctx, summary, staleExtra(ctx, summary)),
    budgetCashStrip(ctx, summary),
    headlineTiles(ctx, summary));
}
