// Today (S-106): where the month stands, and what to do next. The Plan, Track,
// Review strip (the step for now highlighted), the first-session checklist
// until it is done, the Next card, the next 30 days of cash with safe to spend
// and Quick entry, four headline tiles, and a link to each chart tab. Numbers only (lesson 7, S-116):
// every chart is one tap away, in Insights or on Track.

import { h } from '../dom.js';
import { money, pct, signedMoney, todayIso, dayLabel, dateLabel } from '../format.js';
import { statusChip } from '../components/status.js';
import { nextCard } from '../components/cards.js';
import { loopStripCard } from '../components/loop.js';
import { jumpLink } from '../components/jump.js';
import { INSIGHT_TABS } from '../nav.js';
import { firstSession, staleBalances, loopStep, loopStrip, accountTypeNudges } from '../../calc/loop.js';
import { promoWarnings } from '../../calc/debts.js';
import { explain } from '../../calc/explain.js';
import { howButton, howPanel } from '../components/how.js';
import { quickEntryButton } from '../components/quick-entry.js';

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
  // So far and expected by month end (S-128) went with the cash calendar (S-209): SLAM's Spending page and
  // the Dashboard carry them now, so the third tile here is always the surplus.
  const open = ['takeHome', 'spending', 'surplus', 'savingsRate'].includes(ctx.ui.how) ? ctx.ui.how : null;
  return h('div', {},
    h('div', { class: 'strip four', id: 'headline' },
      tile('Take-home', hb('takeHome', money(t.takeHome)), inc.takeHomeIsGuess ? h('span', {}, statusChip('guess'), ' state tax not included') : 'per month'),
      tile('Spending', hb('spending', money(t.spending)), t.basisUsesEstimate.length ? 'uses estimates for ' + t.basisUsesEstimate.length : 'actuals'),
      tile(t.surplus !== null && t.surplus < 0 ? 'Shortfall' : 'Surplus', hb('surplus', signedMoney(t.surplus)),
          h('span', { 'data-key': 'surplus-rate' }, (t.surplusRate === null ? '' : pct(t.surplusRate) + ' of take-home') + (since && since.surplus !== null ? (t.surplusRate === null ? '' : ', ') + signedMoney(since.surplus) + ' since last time' : '')),
          t.surplus === null ? '' : t.surplus < 0 ? 'bad' : 'good'),
      // Only what is allocated counts (S-138); the surplus not allocated yet is shown as a boost.
      tile('Savings rate', hb('savingsRate', pct(t.savingsRate)), h('span', { 'data-key': 'savings-boost' }, 'incl. pre-tax' +
        (summary.allocation.boost === null ? '' : '. Up to +' + pct(summary.allocation.boost) + ' if you allocate your surplus')))),
    open ? howPanel(ctx, explain(summary, open)) : null);
}

function firstSessionCard(ctx, summary) {
  const fs = firstSession(ctx.doc, summary);
  if (fs.done) return null;
  return h('div', { class: 'card', id: 'first-session' },
    h('h2', { style: 'margin-top:0' }, 'First session (' + (fs.items.filter((i) => !i.optional).length - fs.left) + ' of ' + fs.items.filter((i) => !i.optional).length + ')'),
    h('ul', { class: 'plain' }, fs.items.map((i) => h('li', { class: 'small', 'data-key': 'first-' + i.key },
      h('span', {}, h('span', { class: 'chip ' + (i.done ? 'st-known' : i.optional ? 'st-roughly' : 'st-dont-know') }, i.done ? 'Done' : i.optional ? 'Optional' : 'To do'), ' ', i.label),
      i.done ? null : jumpLink(ctx, i.where, 'Do it', 'first-go-' + i.key)))));
}

// At month end, balances that have not been updated join the Next card (S-114).
function staleExtra(ctx, summary) {
  const today = todayIso();
  if (loopStep(loopStrip(ctx.doc, summary, today), today) !== 'review') return null;
  const stale = staleBalances(ctx.doc, today);
  if (!stale.length) return null;
  return { key: 'stale', label: 'Update balances: ' + stale.map((x) => x.name).join(', '), why: stale.map((x) => (x.last ? 'not since ' + dayLabel(x.last) : 'never')).join(', '), where: 'balances' };
}

// Accounts with no specific type (S-116): one item per account.
function typeExtras(ctx) {
  return accountTypeNudges(ctx.doc).map((x) => ({ key: 'type:' + x.id, label: x.label, why: x.why, where: 'balances' }));
}

// A promo ending within 60 days (S-127): "Your 0% promo on Visa ends May 31, 2026. $13,360 still on it."
function promoExtras(ctx) {
  return promoWarnings(ctx.doc, todayIso()).map((x) => ({ key: 'promo:' + x.debt.id,
    label: 'Your ' + x.debt.promoApr.amount + '% promo on ' + x.debt.label + ' ends ' + dateLabel(x.ends) + '.' + (x.balance === null ? '' : ' ' + money(x.balance, !Number.isInteger(x.balance)) + ' still on it.'),
    why: x.days === 0 ? 'today' : x.days + (x.days === 1 ? ' day' : ' days') + ' left', where: 'setup:debts' }));
}

// The Next card's extra items, numbered after the first.
function extras(ctx, summary) {
  return [...promoExtras(ctx), staleExtra(ctx, summary), ...typeExtras(ctx)].filter(Boolean).map((x, i) => ({ ...x, label: (i + 2) + '. ' + x.label }));
}

export function renderToday(ctx, summary) {
  return h('div', {},
    h('h1', {}, 'Today'),
    loopStripCard(ctx, summary),
    firstSessionCard(ctx, summary),
    nextCard(ctx, summary, extras(ctx, summary)),
    spineLinks(ctx),
    headlineTiles(ctx, summary),
    chartLinks(ctx));
}

// Every chart one tap from Today (lesson 7): one link per Insights tab.
function chartLinks(ctx) {
  return h('div', { class: 'card', id: 'today-charts' }, h('h3', {}, 'Charts'),
    h('div', { class: 'row' }, INSIGHT_TABS.map(([id, name]) => h('button', { class: 'btn small', 'data-key': 'today-chart:' + id, onclick: () => ctx.jump('insights:' + id) }, name))));
}

// Where the cash calendar, safe to spend and the check-in live now (S-209): the SLAM pages next to this app.
function spineLinks(ctx) {
  return h('div', { class: 'card', id: 'cash-moved' },
    h('div', { class: 'spread' }, h('h2', {}, 'Cash calendar, safe to spend, check-in'), quickEntryButton(ctx)),
    h('p', { class: 'muted' }, 'These moved to SLAM, which reads the same household and feeds this log back. Open them in a new tab:'),
    h('p', {}, h('a', { class: 'btn', href: 'calendar.html', target: '_blank', rel: 'noopener', 'data-key': 'slam-calendar' }, 'Cash calendar'), ' ', h('a', { class: 'btn', href: 'spending.html', target: '_blank', rel: 'noopener', 'data-key': 'slam-spending' }, 'Spending and check-in'), ' ', h('a', { class: 'btn ghost', href: 'plan.html', target: '_blank', rel: 'noopener', 'data-key': 'slam-plan' }, 'Plan')));
}
