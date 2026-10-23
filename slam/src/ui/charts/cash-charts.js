// The cash calendar (S-086), on Track (S-106): the full calendar chart (past and future on one line,
// today marked, paydays and big bills labeled, days under the cushion shaded), pay-later flags, the
// list by date, a month grid, and this month so far. The forecast check is in Insights, Cash; the
// what-if (move a bill's due day) is in Setup, Bills and due dates. Data from src/engines/calendar.js
// (cashCalendar through components/cashflow.js calendarFor, monthSoFar, forecastCheck, and the readings);
// the what-if's save goes through store/edits.js and store/value.js. Builds on dom, format, svg, catalog, jump, quick-entry.

import { h, options } from '../dom.js';
import { money, dayLabel, monthLabel, todayIso } from '../format.js';
import { dayLine, hbars } from './svg.js';
import { card, chartWidth } from './catalog.js';
import { calendarFor } from '../components/cashflow.js';
import { emptyState } from '../components/jump.js';
import { quickEntryButton } from '../components/quick-entry.js';
import {
  cashCalendar,
  calendarReading,
  safeReading,
  monthSoFar,
  daysInMonth,
  forecastCheck
} from '../../engines/calendar.js';
import { findLine } from '../../store/edits.js';
import { makeValue } from '../../store/value.js';

const SOURCE = { manual: 'Logged', scheduled: 'Scheduled', import: 'Bank' };

// Labels along the line: a payday takes the day; otherwise the biggest cash bill of $100 or more,
// first word only, so the labels do not crowd each other.
function markersOf(cal, days) {
  const out = [];
  days.forEach((d, i) => {
    const pay = d.items.find((x) => x.kind === 'paycheck' && x.flow > 0);
    const big = d.items
      .filter((x) => (x.kind === 'bill' || x.kind === 'debt') && x.cash && x.flow < 0)
      .sort((a, b) => a.flow - b.flow)[0];
    if (pay) out.push({ i, label: 'Payday' });
    else if (big && -big.flow >= 100) out.push({ i, label: big.name.split(' ')[0] });
  });
  return out;
}

function chartCard(ctx, cal, id, title, extraReading) {
  // From the 1st of this month by default; the whole history (back to the first month with balances) on request.
  const whole = !!ctx.ui.cfWhole;
  const from = cal.today.slice(0, 7) + '-01';
  const days = whole ? cal.days : cal.days.filter((x) => x.date >= from);
  const ti = days.findIndex((x) => x.today);
  const horizon = ctx.ui.cfHorizon || 30;
  return card(ctx, {
    id,
    title,
    svg: dayLine({
      days: days.map((x) => ({ date: x.date, v: x.cash, s: x.savings })),
      width: chartWidth(false),
      fmt: money,
      todayIndex: ti >= 0 ? ti : null,
      cushion: cal.cushion || null,
      markers: markersOf(cal, days),
      height: 220,
      label: title
    }),
    extra: h(
      'div',
      { class: 'row' },
      h(
        'div',
        { class: 'toggle', role: 'group', 'aria-label': 'Days ahead' },
        [30, 60, 90].map((n) =>
          h(
            'button',
            {
              'aria-pressed': horizon === n ? 'true' : 'false',
              'data-key': 'horizon-' + n,
              onclick: () => {
                ctx.ui.cfHorizon = n;
                ctx.rerender();
              }
            },
            n + ' days'
          )
        )
      ),
      cal.start < from
        ? h(
            'label',
            { class: 'check' },
            h('input', {
              type: 'checkbox',
              checked: whole,
              'data-key': 'cf-whole',
              onchange: (e) => {
                ctx.ui.cfWhole = e.target.checked;
                ctx.rerender();
              }
            }),
            'Back to ' + cal.start.slice(0, 7)
          )
        : null,
      quickEntryButton(ctx)
    ),
    legendItems: [
      ['Checking (the cash line)', 'var(--series-actual)'],
      ['Savings, shown apart', 'var(--series-dream)']
    ],
    reading:
      calendarReading(cal) +
      ' ' +
      safeReading(cal) +
      (extraReading || '') +
      (cal.unknownStart.length ? ' No starting balance for ' + cal.unknownStart.join(', ') + ' (counted from $0).' : '')
  });
}

function listCard(ctx, cal) {
  // From the 1st of the month being worked on; when that month has not started yet, from today.
  const from = ctx.doc.currentMonth + '-01' < cal.today ? ctx.doc.currentMonth + '-01' : cal.today;
  const acct = (id) => (ctx.doc.accounts.find((a) => a.id === id) || { name: '' }).name;
  const rows = [];
  const row = (date, name, flow, cash, sub, cls) =>
    h(
      'li',
      { class: 'cf-row' + (cls ? ' ' + cls : '') },
      h(
        'div',
        { style: 'flex:1 1 160px;min-width:0' },
        h('div', {}, h('span', { class: 'xs muted' }, dayLabel(date) + '  '), name),
        h('div', { class: 'xs muted' }, sub)
      ),
      h(
        'div',
        { class: 'num', style: 'text-align:right' },
        h(
          'div',
          {},
          flow > 0 ? h('span', { class: 'in' }, '+' + money(flow, true)) : flow < 0 ? '-' + money(-flow, true) : ''
        ),
        h('div', { class: 'xs muted' }, cash)
      )
    );
  for (const d of cal.days) {
    if (d.date < from) continue;
    for (const it of d.items) {
      // Mirrors (the card side of a card payment) are not cash; the plan's spread is one row per day, below.
      if (it.mirror || it.type === 'spread') continue;
      const src =
        it.type === 'entry' ? SOURCE[it.source] || it.source : it.type === 'waiting' ? 'Waiting' : 'Scheduled';
      rows.push(
        row(
          d.date,
          it.name,
          it.flow,
          it.cash ? 'cash ' + money(it.cashAfter) : 'on the card',
          src + ', ' + acct(it.account),
          d.today ? 'today-row' : null
        )
      );
    }
    const spread = d.items.filter((i) => i.type === 'spread');
    if (spread.length)
      rows.push(
        row(
          d.date,
          'Spread across the month',
          d.spreadTotal,
          'cash ' + money(d.cash),
          'Plan, ' + spread.map((i) => i.name).join(', '),
          'muted'
        )
      );
  }
  return h(
    'div',
    { class: 'card', id: 'chart-cf-list' },
    h('h3', { style: 'margin:0' }, 'By date'),
    h('ul', { class: 'plain', style: 'max-height:440px;overflow:auto' }, rows),
    h(
      'p',
      { class: 'reading' },
      'Date, item, in or out, cash after it, source, and account. Past days are the log; later days are what is scheduled, plus the rest of the plan spread across the month.'
    )
  );
}

function payLaterCard(ctx, cal) {
  return card(ctx, {
    id: 'cf-paylater',
    title: 'Bills that land before the paycheck that covers them',
    extra: cal.payLater.length
      ? h(
          'ul',
          { class: 'plain' },
          cal.payLater.map((f) =>
            h(
              'li',
              { class: 'small' },
              h('span', {}, f.name + ' is due ' + dayLabel(f.due) + ', paid ' + dayLabel(f.paidBy)),
              h('b', { class: 'num' }, f.gap + ' days')
            )
          )
        )
      : null,
    reading: cal.payLater.length
      ? cal.payLater.length +
        ' bill' +
        (cal.payLater.length === 1 ? '' : 's') +
        ' land while cash is under ' +
        money(cal.cushion) +
        '.'
      : 'Every bill in this window lands with cash at or above ' + money(cal.cushion) + '.'
  });
}

function gridCard(ctx, cal) {
  const month = cal.today.slice(0, 7);
  const n = daysInMonth(month);
  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const byDate = Object.fromEntries(cal.days.map((d) => [d.date, d]));
  const cells = [];
  for (let i = 0; i < first; i++) cells.push(h('td', {}));
  for (let d = 1; d <= n; d++) {
    const iso = month + '-' + String(d).padStart(2, '0');
    const x = byDate[iso];
    cells.push(
      h(
        'td',
        {
          class: (x && x.today ? 'today ' : '') + (x && cal.lowest && x.date === cal.lowest.date ? 'low' : ''),
          title: x
            ? dayLabel(iso) + ': in ' + money(x.in, true) + ', out ' + money(x.out, true) + ', cash ' + money(x.cash)
            : dayLabel(iso)
        },
        // An outflow under half a dollar would show as $0, so the cell leaves it off.
        h('div', { class: 'd' }, String(d)),
        x && x.in ? h('div', { class: 'in' }, '+' + money(x.in)) : null,
        x && x.out >= 0.5 ? h('div', { class: 'out' }, '-' + money(x.out)) : null
      )
    );
  }
  const rows = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(h('tr', {}, cells.slice(i, i + 7)));
  return h(
    'div',
    { class: 'card', id: 'chart-cf-grid' },
    h('h3', { style: 'margin:0' }, monthLabel(month) + ', day by day'),
    h(
      'table',
      { class: 'month-grid' },
      h(
        'thead',
        {},
        h(
          'tr',
          {},
          ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((x) => h('th', {}, x))
        )
      ),
      h('tbody', {}, rows)
    ),
    h('p', { class: 'reading' }, 'Money in and out each day. Today is outlined; the lowest day is shaded.')
  );
}

function soFarCard(ctx, cal) {
  const rows = monthSoFar(ctx.doc, cal.today.slice(0, 7), cal.today);
  const w = chartWidth(true);
  const over = rows.filter((r) => r.left !== null && r.left < 0);
  return card(ctx, {
    id: 'cf-sofar',
    title: 'This month so far',
    svg: rows.length
      ? hbars({
          rows: rows.map((r) => ({
            label: r.name + (r.left === null ? '' : ', ' + money(Math.abs(r.left)) + (r.left < 0 ? ' over' : ' left')),
            values: [
              { v: r.plan, color: 'var(--series-estimate)', tip: 'Plan ' + money(r.plan) },
              { v: r.logged, color: 'var(--series-actual)', tip: 'Logged ' + money(r.logged) }
            ]
          })),
          mode: 'overlay',
          width: w,
          fmt: money
        })
      : null,
    legendItems: [
      ['Plan (outline)', 'var(--series-estimate)'],
      ['Logged so far', 'var(--series-actual)']
    ],
    reading: rows.length
      ? over.length
        ? over.map((r) => r.name + ' is ' + money(-r.left) + ' past its plan').join('. ') + '.'
        : 'Every category is within its plan so far.'
      : 'No plan or estimates yet.'
  });
}

// The one what-if: move a bill's due day and see the line change. Saving changes the due day itself.
export function whatIfCard(ctx, summary, cal) {
  const bills = [];
  for (const c of ctx.doc.categories)
    for (const l of c.lines) if (l.state !== 'archived' && l.dueDay && l.dueDay.amount) bills.push(l);
  if (!bills.length)
    return card(ctx, {
      id: 'cf-whatif',
      title: 'What if a bill moved?',
      reading: 'Give a bill a due day above to try moving it.'
    });
  // The picked bill and day live on ctx.ui; if that bill is gone, start over on the first one.
  const st = (ctx.ui.whatIf =
    ctx.ui.whatIf && bills.some((b) => b.id === ctx.ui.whatIf.lineId)
      ? ctx.ui.whatIf
      : { lineId: bills[0].id, day: bills[0].dueDay.amount });
  const line = bills.find((b) => b.id === st.lineId);
  const draft = JSON.parse(JSON.stringify(ctx.doc));
  findLine(draft, st.lineId).line.dueDay = makeValue(st.day, { cadence: 'one-off' });
  const alt = cashCalendar(draft, summary.income, { today: todayIso(), horizon: ctx.ui.cfHorizon || 30 });
  const moved = st.day !== line.dueDay.amount;
  return card(ctx, {
    id: 'cf-whatif',
    title: 'What if a bill moved?',
    svg: dayLine({
      days: alt.days.map((x) => ({ date: x.date, v: x.cash })),
      width: chartWidth(true),
      fmt: money,
      todayIndex: alt.days.findIndex((x) => x.today),
      cushion: alt.cushion || null,
      markers: markersOf(alt, alt.days),
      height: 180,
      label: 'What if'
    }),
    extra: h(
      'div',
      { class: 'row' },
      h(
        'select',
        {
          'aria-label': 'Bill',
          'data-key': 'whatif-line',
          onchange: (e) => {
            const b = bills.find((x) => x.id === e.target.value);
            ctx.ui.whatIf = { lineId: b.id, day: b.dueDay.amount };
            ctx.rerender();
          }
        },
        options(
          bills.map((b) => [b.id, b.name]),
          st.lineId
        )
      ),
      h(
        'label',
        { class: 'row small' },
        'Due day',
        h('input', {
          type: 'number',
          min: 1,
          max: 31,
          class: 'day-box',
          'data-key': 'whatif-day',
          value: String(st.day),
          onchange: (e) => {
            st.day = Math.min(31, Math.max(1, Math.round(Number(e.target.value) || 1)));
            ctx.rerender();
          }
        })
      ),
      moved
        ? h(
            'button',
            {
              class: 'btn small primary',
              'data-key': 'whatif-save',
              onclick: () =>
                ctx.update('Due day', (d) => {
                  findLine(d, st.lineId).line.dueDay = makeValue(st.day, { cadence: 'one-off' });
                })
            },
            'Save the new due day'
          )
        : null
    ),
    reading: moved
      ? 'With ' +
        line.name +
        ' due on day ' +
        st.day +
        ' instead of ' +
        line.dueDay.amount +
        ': ' +
        calendarReading(alt) +
        ' (Now: lowest ' +
        money(cal.lowest ? cal.lowest.amount : null) +
        '.)'
      : 'Pick a bill and a new due day to see the line change.'
  });
}

export function forecastCard(ctx) {
  const months = Object.keys(ctx.doc.cashflow.forecasts || {})
    .sort()
    .slice(-6);
  const rows = months.map((m) => forecastCheck(ctx.doc, m));
  return card(ctx, {
    id: 'cf-forecast',
    title: 'Forecast check',
    extra: rows.length
      ? h(
          'ul',
          { class: 'plain' },
          rows.map((r) =>
            h(
              'li',
              { class: 'small' },
              h('span', {}, monthLabel(r.month) + ': predicted ' + money(r.predicted) + ' on the 1st'),
              h(
                'b',
                { class: 'num' },
                r.actual === null
                  ? 'end not in yet'
                  : 'ended ' + money(r.actual) + ' (' + (r.diff >= 0 ? '+' : '') + money(r.diff) + ')'
              )
            )
          )
        )
      : null,
    reading: rows.length
      ? "Each month's predicted end cash, saved on the 1st, against the real end balance."
      : 'A forecast is saved when a month starts (at close). It is compared with the real end balance.'
  });
}

export function cashflowCards(ctx, s) {
  const cal = calendarFor(ctx, s, ctx.ui.cfHorizon || 30);
  if (!ctx.doc.accounts.some((a) => a.state !== 'archived'))
    return [
      h(
        'div',
        { class: 'card', id: 'chart-cf-none' },
        emptyState(ctx, 'Add a checking account and its balance to see cash by day.', 'balances', 'Add an account')
      )
    ];
  return [
    chartCard(ctx, cal, 'cf-chart', 'Cash by day'),
    payLaterCard(ctx, cal),
    listCard(ctx, cal),
    gridCard(ctx, cal),
    soFarCard(ctx, cal)
  ].filter(Boolean);
}
