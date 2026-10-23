// Today (S-106): where the month stands, and what to do next. The Plan, Track,
// Review strip (the step for now highlighted), the first-session checklist
// until it is done, the Next card, the next 30 days of cash with safe to spend
// and Quick entry, four headline tiles, and a link to each chart tab. Numbers only (lesson 7, S-116):
// every chart is one tap away, in Insights or on Track. Depends on the engines (loop, debts, calendar,
// explain), nav.js for the chart tabs, and the ui helpers (dom, format, the cards, cashflow, loop, jump, status, and how components).

import { h } from '../dom.js';
import { money, pct, signedMoney, todayIso, dayLabel, dateLabel } from '../format.js';
import { statusChip } from '../components/status.js';
import { nextCard } from '../components/cards.js';
import { budgetCashStrip } from '../components/cashflow.js';
import { loopStripCard } from '../components/loop.js';
import { jumpLink } from '../components/jump.js';
import { INSIGHT_TABS } from '../nav.js';
import { firstSession, staleBalances, loopStep, loopStrip, accountTypeNudges } from '../../engines/loop.js';
import { promoWarnings } from '../../engines/debts.js';
import { monthOutlook } from '../../engines/calendar.js';
import { explain } from '../../engines/explain.js';
import { howButton, howPanel } from '../components/how.js';

function tile(label, value, sub, cls) {
  return h(
    'div',
    { class: 'tile' },
    h('div', { class: 'label' }, label),
    h('div', { class: 'value ' + (cls || '') }, value),
    sub ? h('div', { class: 'sub' }, sub) : null
  );
}

// At most four headline numbers (S-106): take-home, spending, surplus, savings rate.
// Each one opens how it was worked out (S-108).
export function headlineTiles(ctx, summary) {
  const t = summary.totals;
  const inc = summary.income;
  const since = summary.sinceLast;
  const hb = (key, text) => howButton(ctx, key, text);
  // An open month (S-128): so far and expected by month end, never money that has not arrived as actual.
  const o = monthOutlook(ctx.doc, inc, todayIso());
  // ui.how is shared by every how button on every screen; only a key from these tiles opens a panel here.
  const open = ['takeHome', 'spending', 'surplus', 'savingsRate', ...(o ? ['soFar', 'expected'] : [])].includes(
    ctx.ui.how
  )
    ? ctx.ui.how
    : null;
  return h(
    'div',
    {},
    h(
      'div',
      { class: 'strip four', id: 'headline' },
      tile(
        'Take-home',
        hb('takeHome', money(t.takeHome)),
        inc.takeHomeIsGuess ? h('span', {}, statusChip('guess'), ' state tax not included') : 'per month'
      ),
      tile(
        'Spending',
        hb('spending', money(t.spending)),
        t.basisUsesEstimate.length ? 'uses estimates for ' + t.basisUsesEstimate.length : 'actuals'
      ),
      o
        ? tile(
            'So far this month',
            hb('soFar', signedMoney(o.soFar)),
            h('span', {}, 'Expected by month end ', hb('expected', signedMoney(o.expected))),
            o.soFar < 0 ? 'bad' : 'good'
          )
        : tile(
            t.surplus !== null && t.surplus < 0 ? 'Shortfall' : 'Surplus',
            hb('surplus', signedMoney(t.surplus)),
            h(
              'span',
              { 'data-key': 'surplus-rate' },
              (t.surplusRate === null ? '' : pct(t.surplusRate) + ' of take-home') +
                (since && since.surplus !== null
                  ? (t.surplusRate === null ? '' : ', ') + signedMoney(since.surplus) + ' since last time'
                  : '')
            ),
            t.surplus === null ? '' : t.surplus < 0 ? 'bad' : 'good'
          ),
      // Only what is allocated counts (S-138); the surplus not allocated yet is shown as a boost.
      tile(
        'Savings rate',
        hb('savingsRate', pct(t.savingsRate)),
        h(
          'span',
          { 'data-key': 'savings-boost' },
          'incl. pre-tax' +
            (summary.allocation.boost === null
              ? ''
              : '. Up to +' + pct(summary.allocation.boost) + ' if you allocate your surplus')
        )
      )
    ),
    open ? howPanel(ctx, explain(summary, open, o)) : null
  );
}

function firstSessionCard(ctx, summary) {
  const fs = firstSession(ctx.doc, summary);
  if (fs.done) return null;
  return h(
    'div',
    { class: 'card', id: 'first-session' },
    // The count covers required items only; fs.left and fs.done come from firstSession (engines/loop.js).
    h(
      'h2',
      { style: 'margin-top:0' },
      'First session (' +
        (fs.items.filter((i) => !i.optional).length - fs.left) +
        ' of ' +
        fs.items.filter((i) => !i.optional).length +
        ')'
    ),
    // Chip colors borrow the value statuses: done reads as known, optional as roughly, to do as don't know.
    h(
      'ul',
      { class: 'plain' },
      fs.items.map((i) =>
        h(
          'li',
          { class: 'small', 'data-key': 'first-' + i.key },
          h(
            'span',
            {},
            h(
              'span',
              { class: 'chip ' + (i.done ? 'st-known' : i.optional ? 'st-roughly' : 'st-dont-know') },
              i.done ? 'Done' : i.optional ? 'Optional' : 'To do'
            ),
            ' ',
            i.label
          ),
          i.done ? null : jumpLink(ctx, i.where, 'Do it', 'first-go-' + i.key)
        )
      )
    )
  );
}

// At month end, balances that have not been updated join the Next card (S-114).
function staleExtra(ctx, summary) {
  const today = todayIso();
  if (loopStep(loopStrip(ctx.doc, summary, today), today) !== 'review') return null;
  const stale = staleBalances(ctx.doc, today);
  if (!stale.length) return null;
  return {
    key: 'stale',
    label: 'Update balances: ' + stale.map((x) => x.name).join(', '),
    why: stale.map((x) => (x.last ? 'not since ' + dayLabel(x.last) : 'never')).join(', '),
    where: 'balances'
  };
}

// Accounts with no specific type (S-116): one item per account.
function typeExtras(ctx) {
  return accountTypeNudges(ctx.doc).map((x) => ({
    key: 'type:' + x.id,
    label: x.label,
    why: x.why,
    where: 'balances'
  }));
}

// A promo ending within 60 days (S-127): "Your 0% promo on Visa ends May 31, 2026. $13,360 still on it."
function promoExtras(ctx) {
  return promoWarnings(ctx.doc, todayIso()).map((x) => ({
    key: 'promo:' + x.debt.id,
    label:
      'Your ' +
      x.debt.promoApr.amount +
      '% promo on ' +
      x.debt.label +
      ' ends ' +
      dateLabel(x.ends) +
      '.' +
      (x.balance === null ? '' : ' ' + money(x.balance, !Number.isInteger(x.balance)) + ' still on it.'),
    why: x.days === 0 ? 'today' : x.days + (x.days === 1 ? ' day' : ' days') + ' left',
    where: 'setup:debts'
  }));
}

// The Next card's extra items, numbered after the first.
function extras(ctx, summary) {
  return [...promoExtras(ctx), staleExtra(ctx, summary), ...typeExtras(ctx)]
    .filter(Boolean)
    .map((x, i) => ({ ...x, label: i + 2 + '. ' + x.label }));
}

export function renderToday(ctx, summary) {
  return h(
    'div',
    {},
    h('h1', {}, 'Today'),
    loopStripCard(ctx, summary),
    firstSessionCard(ctx, summary),
    nextCard(ctx, summary, extras(ctx, summary)),
    budgetCashStrip(ctx, summary),
    headlineTiles(ctx, summary),
    chartLinks(ctx)
  );
}

// Every chart one tap from Today (lesson 7): one link per Insights tab.
function chartLinks(ctx) {
  return h(
    'div',
    { class: 'card', id: 'today-charts' },
    h('h3', {}, 'Charts'),
    h(
      'div',
      { class: 'row' },
      INSIGHT_TABS.map(([id, name]) =>
        h(
          'button',
          { class: 'btn small', 'data-key': 'today-chart:' + id, onclick: () => ctx.jump('insights:' + id) },
          name
        )
      )
    )
  );
}
