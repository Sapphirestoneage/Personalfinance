// Cash flow on screen (S-086): the inputs the calendar needs (pay dates, due
// days, the cushion; all in Setup, S-106), scheduled items waiting on "It
// happened" and a real balance check (Track), and the compact 30-day strip on Today.
// Every number comes from engines/calendar.js (cashCalendar, calendarReading, safeReading); paid-ahead.js,
// balances.js, coverage.js, debts.js, and explain.js feed the rows around it. This file only lays it out.
// Writes go through store/cashflow.js. Builds on dom, format, value-input, quick-entry, jump, and how.

import { h, options } from '../dom.js';
import { money, todayIso, dayLabel, monthLabel } from '../format.js';
import { paidAheadSchedules, firstMonth } from '../../engines/paid-ahead.js';
import { valueInput, parseAmount } from './value-input.js';
import { quickEntryButton } from './quick-entry.js';
import { jumpLink, emptyState } from './jump.js';
import { howButton, howPanel, sourceLink } from './how.js';
import { explain } from '../../engines/explain.js';
import { liabilities } from '../../engines/balances.js';
import { PREMIUM_LINE_TYPES, premiumFor } from '../../engines/coverage.js';
import { linkedLine } from '../../engines/debts.js';
import { cashCalendar, calendarReading, safeReading } from '../../engines/calendar.js';
import {
  setNextPayDate,
  setPayDays,
  setItemAccount,
  setDebtPayWith,
  moveItem,
  clearMove,
  addBalanceCheck,
  confirmScheduled
} from '../../store/cashflow.js';
import { makeValue } from '../../store/value.js';

// One calendar per render and horizon, from today.
// Keyed on the document itself (every edit makes a new one), not its timestamp: two edits in
// the same millisecond would otherwise show the older calendar.
export function calendarFor(ctx, summary, horizon = 30) {
  const key = horizon + ':' + todayIso();
  const c = ctx.ui.calCache;
  if (!c || c.doc !== ctx.doc || c.key !== key)
    ctx.ui.calCache = { doc: ctx.doc, key, cal: cashCalendar(ctx.doc, summary.income, { today: todayIso(), horizon }) };
  return ctx.ui.calCache.cal;
}

function accountSelect(ctx, key, value, onPick, label) {
  const live = ctx.doc.accounts.filter((a) => a.state !== 'archived');
  return h(
    'select',
    { 'aria-label': label, 'data-key': key, onchange: (e) => onPick(e.target.value) },
    options([['', 'Checking (default)'], ...live.map((a) => [a.id, a.name])], value || '')
  );
}

const ANNUAL = (cat, line) => cat.type === 'annual' || line.estimate.cadence === 'year';

// Paydays (Setup, Income and paychecks): put paychecks on the calendar.
// Twice a month means two day boxes, each clamped to 1 to 31 (blank or junk becomes the 1st); every other
// frequency takes one next pay date and the calendar repeats it.
export function paydaysCard(ctx) {
  const incomes = ctx.doc.income.filter((i) => i.state !== 'archived');
  return h(
    'div',
    { class: 'card', id: 'paydays-card' },
    h('h2', {}, 'Paydays'),
    h(
      'p',
      { class: 'muted small' },
      'Optional. These put paychecks on the calendar. Each lands in checking unless you pick another account.'
    ),
    incomes.length
      ? incomes.map((inc) =>
          h(
            'div',
            { class: 'qa' },
            h(
              'div',
              { class: 'q' },
              h('div', {}, inc.label),
              h(
                'div',
                { class: 'hint' },
                inc.payFrequency === 'semimonthly'
                  ? 'Paid twice a month on these days'
                  : 'Next pay date; the rest follow every ' +
                      ({ weekly: 'week', biweekly: 'two weeks', monthly: 'month' }[inc.payFrequency] || 'pay period') +
                      (inc.type === 'unemployment' && inc.benefitWeeksLeft !== null
                        ? ', for ' + inc.benefitWeeksLeft + ' more weeks'
                        : '')
              )
            ),
            h(
              'div',
              { class: 'row' },
              inc.payFrequency === 'semimonthly'
                ? [0, 1].map((i) =>
                    h('input', {
                      type: 'number',
                      min: 1,
                      max: 31,
                      class: 'day-box',
                      'aria-label': inc.label + ' pay day ' + (i + 1),
                      'data-key': 'payday:' + inc.id + ':' + i,
                      value: String((inc.payDays || [1, 15])[i]),
                      onchange: (e) => {
                        const days = [...(inc.payDays || [1, 15])];
                        days[i] = Math.min(31, Math.max(1, Math.round(Number(e.target.value) || 1)));
                        ctx.update('Pay days', (d) => setPayDays(d, inc.id, days));
                      }
                    })
                  )
                : h('input', {
                    type: 'date',
                    'aria-label': inc.label + ' next pay date',
                    'data-key': 'nextpay:' + inc.id,
                    value: inc.nextPayDate.date || '',
                    onchange: (e) => ctx.update('Next pay date', (d) => setNextPayDate(d, inc.id, e.target.value))
                  }),
              accountSelect(
                ctx,
                'acct-inc:' + inc.id,
                inc.accountId,
                (v) => ctx.update('Pay goes to', (d) => setItemAccount(d, 'income', inc.id, v)),
                inc.label + ' account'
              )
            )
          )
        )
      : h('p', { class: 'muted small' }, 'Add an income above first.')
  );
}

// Bills and debt payments (Setup, Bills and due dates): when each lands and from which account.
export function billsCard(ctx) {
  const doc = ctx.doc;
  const dayBox = (line, field, max, label) =>
    valueInput({ ...ctx, preview: null }, ['line', line.id, field], line[field], {
      label,
      cadence: false,
      placeholder: max === 12 ? 'month' : 'day'
    });
  const bills = [];
  for (const c of doc.categories) {
    // Savings has no due date and the Debt category is covered by the debts listed below, so neither is a bill.
    if (c.state === 'archived' || c.savings || c.id === 'debt') continue;
    // A premium is a bill only when it is paid directly (S-117); a loan's line is its bill (S-116).
    for (const l of c.lines)
      if (
        l.state !== 'archived' &&
        (l.kind === 'fixed' || ANNUAL(c, l)) &&
        !(PREMIUM_LINE_TYPES.includes(l.type) && premiumFor(doc).from !== 'direct')
      )
        bills.push({ c, l, annual: ANNUAL(c, l) });
  }
  const debts = doc.debts.filter((x) => x.state !== 'archived' && !linkedLine(doc, x));
  return h(
    'div',
    { class: 'card', id: 'bills-card' },
    h(
      'p',
      { class: 'muted small' },
      'Optional. These put bills on the calendar. Anything without a date is spread across the month.'
    ),
    bills.length
      ? bills.map(({ l, annual }) => [
          h(
            'div',
            { class: 'qa' },
            h(
              'div',
              { class: 'q' },
              h('div', {}, l.name),
              h(
                'div',
                { class: 'hint' },
                annual ? 'Once a year: due month (1 to 12) and day' : 'Due day of the month (1 to 31)'
              )
            ),
            h(
              'div',
              { class: 'row' },
              annual ? dayBox(l, 'dueMonth', 12, l.name + ' due month') : null,
              dayBox(l, 'dueDay', 31, l.name + ' due day'),
              accountSelect(
                ctx,
                'acct-line:' + l.id,
                l.accountId,
                (v) => ctx.update('Paid from', (d) => setItemAccount(d, 'line', l.id, v)),
                l.name + ' account'
              )
            )
          ),
          annual ? openingAheadRow(ctx, l) : null
        ])
      : emptyState(
          ctx,
          'No fixed or yearly lines yet. Mark a line fixed to give it a due date.',
          'setup:categories',
          'Categories and lines',
          'bills-empty'
        ),
    debts.length ? h('h3', {}, 'Debt payments') : null,
    debts.map((debt) =>
      h(
        'div',
        { class: 'qa' },
        h(
          'div',
          { class: 'q' },
          h('div', {}, debt.label),
          h('div', { class: 'hint' }, 'Due day ' + (debt.dueDay.amount || 'not set yet (Debts)'))
        ),
        h(
          'div',
          { class: 'row' },
          debt.type === 'credit-card'
            ? h(
                'select',
                {
                  'aria-label': debt.label + ' pays',
                  'data-key': 'paywith:' + debt.id,
                  onchange: (e) => ctx.update('Card payment', (d) => setDebtPayWith(d, debt.id, e.target.value))
                },
                options(
                  [
                    ['minimum', 'Pays the minimum'],
                    ['statement', 'Pays the statement balance']
                  ],
                  debt.payWith || 'minimum'
                )
              )
            : null,
          accountSelect(
            ctx,
            'acct-debt:' + debt.id,
            debt.payFrom,
            (v) => ctx.update('Paid from', (d) => setItemAccount(d, 'debt', debt.id, v)),
            debt.label + ' account'
          )
        )
      )
    )
  );
}

// Opening Paid ahead (S-130): a yearly bill paid before the client's first month. One tap opens it; the
// amount left and the months left, as of the first month, both "roughly" unless said otherwise.
function openingAheadRow(ctx, l) {
  const key = 'opening:' + l.id;
  const m0 = firstMonth(ctx.doc);
  const answered = l.openingAhead.status !== null || l.openingAheadMonths.status !== null;
  if (!answered && !ctx.ui.expanded.has(key)) {
    return h(
      'div',
      { class: 'row' },
      h(
        'button',
        {
          class: 'btn small ghost',
          'data-key': key,
          onclick: () => {
            ctx.ui.expanded.add(key);
            ctx.rerender();
          }
        },
        'Already paid before ' + monthLabel(m0) + '?'
      )
    );
  }
  const sched = paidAheadSchedules(ctx.doc).find((x) => x.id === 'opening:' + l.id);
  const box = (field, label, placeholder) =>
    valueInput({ ...ctx, preview: null }, ['line', l.id, field], l[field], {
      label,
      cadence: false,
      placeholder,
      typed: 'roughly'
    });
  return h(
    'div',
    { class: 'qa', 'data-key': 'opening-row:' + l.id },
    h(
      'div',
      { class: 'q' },
      h('div', { class: 'small' }, 'Paid ahead as of ' + monthLabel(m0)),
      h(
        'div',
        { class: 'hint', 'data-key': 'opening-hint:' + l.id },
        sched
          ? money(sched.share, true) + ' a month, $0 after ' + monthLabel(sched.through) + '.'
          : 'What is left of it, and for how many more months.'
      )
    ),
    h(
      'div',
      { class: 'row' },
      box('openingAhead', l.name + ' paid ahead, left', '$ left'),
      box('openingAheadMonths', l.name + ' paid ahead, months left', 'months')
    )
  );
}

// The cushion is the coach's setting (S-096): the calendar uses it in both views, only the coach edits it.
export function cushionRow(ctx) {
  if (ctx.role === 'client') return null;
  return h(
    'div',
    { class: 'qa', 'data-key': 'cushion-row' },
    h(
      'div',
      { class: 'q' },
      h('div', {}, 'Cushion: keep at least this much in checking'),
      h('div', { class: 'hint' }, 'Days under it are shaded on the calendar. Blank means $0.')
    ),
    valueInput({ ...ctx, preview: null }, ['cashflow', 'cushion'], ctx.doc.cashflow.cushion, {
      label: 'Cushion',
      cadence: false
    })
  );
}

// Scheduled items on or before today: It happened (with the amount, editable) or Didn't happen / moved.
export function waitingCard(ctx, summary) {
  const cal = calendarFor(ctx, summary);
  if (!cal.waiting.length) return null;
  // Draft state per item (the typed amount, a new date) lives on ctx.ui so it survives rerenders.
  const st = (ctx.ui.waitEdit = ctx.ui.waitEdit || {});
  return h(
    'div',
    { class: 'card flag', id: 'waiting-card' },
    h('h2', {}, 'Scheduled, on or before today (' + cal.waiting.length + ')'),
    h(
      'ul',
      { class: 'plain' },
      cal.waiting.map((it) => {
        const s = (st[it.key] = st[it.key] || {
          amount: it.amount === null ? '' : String(it.amount),
          moving: false,
          to: todayIso()
        });
        return h(
          'li',
          {},
          h(
            'div',
            { style: 'flex:1 1 200px' },
            h('b', {}, it.name),
            h(
              'div',
              { class: 'xs muted' },
              (it.dir === 'in' ? 'Paycheck, ' : 'Due ') + dayLabel(it.date) + (it.moved ? ' (moved)' : '')
            )
          ),
          h('input', {
            type: 'text',
            inputmode: 'decimal',
            class: 'amount',
            style: 'width:7em',
            'aria-label': it.name + ' amount',
            'data-key': 'wait-amt:' + it.key,
            value: s.amount,
            oninput: (e) => {
              s.amount = e.target.value;
            }
          }),
          h(
            'button',
            {
              class: 'btn small primary',
              'data-key': 'happened:' + it.key,
              onclick: () => {
                const a = parseAmount(s.amount);
                if (a === null || a === undefined) return ctx.toast('Type the amount');
                ctx.update('It happened', (d) => confirmScheduled(d, it, a));
                ctx.toast('Logged ' + it.name);
              }
            },
            'It happened'
          ),
          s.moving
            ? h(
                'span',
                { class: 'row' },
                h('input', {
                  type: 'date',
                  'aria-label': 'New date',
                  'data-key': 'move-to:' + it.key,
                  value: s.to,
                  onchange: (e) => {
                    s.to = e.target.value;
                  }
                }),
                h(
                  'button',
                  {
                    class: 'btn small',
                    onclick: () => ctx.update('Moved', (d) => moveItem(d, it.key, s.to, new Date().toISOString()))
                  },
                  'Move'
                ),
                // A null date tells moveItem the item is skipped this month, not moved.
                h(
                  'button',
                  {
                    class: 'btn small ghost',
                    'data-key': 'skip:' + it.key,
                    onclick: () =>
                      ctx.update('Skipped this month', (d) => moveItem(d, it.key, null, new Date().toISOString()))
                  },
                  'Skip this month'
                )
              )
            : h(
                'button',
                {
                  class: 'btn small ghost',
                  'data-key': 'didnt:' + it.key,
                  onclick: () => {
                    s.moving = true;
                    ctx.rerender();
                  }
                },
                "Didn't happen / moved"
              ),
          it.moved
            ? h(
                'button',
                {
                  class: 'btn small ghost',
                  onclick: () => ctx.update('Back to its date', (d) => clearMove(d, it.key))
                },
                'Undo move'
              )
            : null
        );
      })
    )
  );
}

// A real balance on any day resets the projection from that day.
// Every account and every debt with no account of its own can be checked on any day (S-110).
export function checkBalancesCard(ctx) {
  const live = [
    ...ctx.doc.accounts.filter((a) => a.state !== 'archived'),
    ...liabilities(ctx.doc)
      .filter((l) => !l.account)
      .map((l) => ({ id: l.key, name: l.name }))
  ];
  if (!live.length) return null;
  const st = (ctx.ui.check = ctx.ui.check || { account: live[0].id, date: todayIso(), amount: '' });
  return h(
    'details',
    { class: 'card', id: 'check-balances' },
    h('summary', {}, 'Check balances'),
    h(
      'p',
      { class: 'muted small' },
      'Type a real balance from the bank for any account and day. The calendar starts again from it.'
    ),
    h(
      'div',
      { class: 'row' },
      h(
        'select',
        {
          'aria-label': 'Account',
          'data-key': 'check-acct',
          onchange: (e) => {
            st.account = e.target.value;
          }
        },
        options(
          live.map((a) => [a.id, a.name]),
          st.account
        )
      ),
      h('input', {
        type: 'date',
        'aria-label': 'Day',
        'data-key': 'check-date',
        value: st.date,
        onchange: (e) => {
          st.date = e.target.value || todayIso();
        }
      }),
      h('input', {
        type: 'text',
        inputmode: 'decimal',
        class: 'amount',
        style: 'width:8em',
        placeholder: '$',
        'aria-label': 'Balance',
        'data-key': 'check-amt',
        value: st.amount,
        oninput: (e) => {
          st.amount = e.target.value;
        }
      }),
      h(
        'button',
        {
          class: 'btn small primary',
          'data-key': 'check-save',
          onclick: () => {
            const a = parseAmount(st.amount);
            if (a === null || a === undefined) return ctx.toast('Type the balance');
            ctx.update('Balance checked', (d) =>
              addBalanceCheck(d, st.account, st.date, makeValue(a, { cadence: 'one-off' }))
            );
            st.amount = '';
          }
        },
        'Save balance'
      )
    )
  );
}

// Today's compact strip, numbers only: today, the lowest point in the next 30 days, and safe to spend.
export function budgetCashStrip(ctx, summary) {
  const cal = calendarFor(ctx, summary, 30);
  // Nothing to project when there is no lowest point or no live account has a starting balance (unknownStart).
  if (!cal.lowest || cal.unknownStart.length === ctx.doc.accounts.filter((a) => a.state !== 'archived').length) {
    return h(
      'div',
      { class: 'card cash-strip' },
      h('div', { class: 'spread' }, h('b', {}, 'Cash, next 30 days'), quickEntryButton(ctx)),
      emptyState(
        ctx,
        'Add a checking balance to see cash by day and what is safe to spend.',
        'balances',
        'Add a balance'
      )
    );
  }
  return h(
    'div',
    { class: 'card cash-strip', id: 'cash-strip' },
    h('div', { class: 'spread' }, h('b', {}, 'Cash, next 30 days'), quickEntryButton(ctx)),
    // Numbers only on Today (lesson 7, S-116): the chart of these 30 days is the calendar on Track, one tap away.
    h('p', { class: 'xs' }, jumpLink(ctx, 'calendar', 'See cash by day (the calendar)', 'today-calendar')),
    h(
      'div',
      { class: 'strip three' },
      // Jump to source (S-108): today's cash opens the balance check, the lowest point the calendar,
      // and safe to spend how it was worked out.
      h(
        'div',
        { class: 'tile' },
        h('div', { class: 'label' }, 'Today'),
        h(
          'div',
          { class: 'value', 'data-key': 'cash-today' },
          sourceLink(ctx, money(cal.todayCash), { where: 'checks' }, 'src-cash-today')
        )
      ),
      h(
        'div',
        { class: 'tile' },
        h('div', { class: 'label' }, 'Lowest point'),
        h(
          'div',
          { class: 'value', 'data-key': 'cash-lowest' },
          sourceLink(ctx, money(cal.lowest.amount), { where: 'calendar' }, 'src-cash-lowest')
        ),
        h('div', { class: 'sub' }, dayLabel(cal.lowest.date))
      ),
      h(
        'div',
        { class: 'tile' },
        h('div', { class: 'label' }, 'Safe to spend'),
        h(
          'div',
          { class: 'value', 'data-key': 'safe-to-spend' },
          howButton(ctx, 'safeToSpend', money(cal.safeToSpend))
        ),
        h('div', { class: 'sub' }, 'through ' + dayLabel(cal.end))
      )
    ),
    ctx.ui.how === 'safeToSpend' ? howPanel(ctx, explain(summary, 'safeToSpend', cal)) : null,
    cal.shortfall ? h('p', { class: 'small warn', 'data-key': 'safe-short' }, safeReading(cal)) : null,
    h(
      'p',
      { class: 'reading', 'data-key': 'cash-reading' },
      calendarReading(cal),
      ' ',
      jumpLink(ctx, 'calendar', 'See the calendar')
    )
  );
}
