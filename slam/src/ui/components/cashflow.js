// Cash flow on screen (S-086): the inputs the calendar needs (pay dates, due
// days, accounts, the cushion), scheduled items waiting on "It happened", a
// real balance check, and the compact 30-day strip on the Budget screen.
// Every number comes from calc/calendar.js; this file only lays it out.

import { h, options } from '../dom.js';
import { money, todayIso, dayLabel } from '../format.js';
import { valueInput, parseAmount } from './value-input.js';
import { dayLine } from '../charts/svg.js';
import { quickEntryButton } from './quick-entry.js';
import { cashCalendar, calendarReading } from '../../calc/calendar.js';
import { setNextPayDate, setPayDays, setItemAccount, setDebtPayWith, moveItem, clearMove, addBalanceCheck, confirmScheduled } from '../../store/cashflow.js';
import { makeValue } from '../../store/value.js';

// One calendar per render and horizon, from today.
export function calendarFor(ctx, summary, horizon = 30) {
  const key = summary.householdId + ':' + ctx.doc.updatedAt + ':' + horizon + ':' + todayIso();
  ctx.ui.calCache = ctx.ui.calCache || {};
  if (!ctx.ui.calCache[key]) ctx.ui.calCache = { [key]: cashCalendar(ctx.doc, summary.income, { today: todayIso(), horizon }) };
  return ctx.ui.calCache[key];
}

function accountSelect(ctx, key, value, onPick, label) {
  const live = ctx.doc.accounts.filter((a) => a.state !== 'archived');
  return h('select', { 'aria-label': label, 'data-key': key, onchange: (e) => onPick(e.target.value) },
    options([['', 'Checking (default)'], ...live.map((a) => [a.id, a.name])], value || ''));
}

const ANNUAL = (cat, line) => cat.type === 'annual' || line.estimate.cadence === 'year';

// Paydays, bill dates, debt payments, and the cushion. Only what is missing is asked.
export function scheduleCard(ctx) {
  const doc = ctx.doc;
  const dayBox = (line, field, max, label) => valueInput({ ...ctx, preview: null }, ['line', line.id, field], line[field], { label, cadence: false, placeholder: max === 12 ? 'month' : 'day' });
  const incomes = doc.income.filter((i) => i.state !== 'archived');
  const bills = [];
  for (const c of doc.categories) {
    if (c.state === 'archived' || c.savings || c.id === 'debt') continue;
    for (const l of c.lines) if (l.state !== 'archived' && (l.kind === 'fixed' || ANNUAL(c, l))) bills.push({ c, l, annual: ANNUAL(c, l) });
  }
  return h('div', { class: 'card', id: 'schedule-card' },
    h('h2', {}, 'Paydays and bill dates'),
    h('p', { class: 'muted small' }, 'Optional. These put paychecks and bills on the calendar. Anything without a date is spread across the month. Each lands in checking unless you pick another account.'),
    h('h3', {}, 'Paydays'),
    incomes.length ? incomes.map((inc) => h('div', { class: 'qa' },
      h('div', { class: 'q' }, h('div', {}, inc.label), h('div', { class: 'hint' }, inc.payFrequency === 'semimonthly' ? 'Paid twice a month on these days' : 'Next pay date; the rest follow every ' + ({ weekly: 'week', biweekly: 'two weeks', monthly: 'month' }[inc.payFrequency] || 'pay period') + (inc.type === 'unemployment' && inc.benefitWeeksLeft !== null ? ', for ' + inc.benefitWeeksLeft + ' more weeks' : ''))),
      h('div', { class: 'row' },
        inc.payFrequency === 'semimonthly'
          ? [0, 1].map((i) => h('input', { type: 'number', min: 1, max: 31, class: 'day-box', 'aria-label': inc.label + ' pay day ' + (i + 1), 'data-key': 'payday:' + inc.id + ':' + i, value: String((inc.payDays || [1, 15])[i]),
            onchange: (e) => { const days = [...(inc.payDays || [1, 15])]; days[i] = Math.min(31, Math.max(1, Math.round(Number(e.target.value) || 1))); ctx.update('Pay days', (d) => setPayDays(d, inc.id, days)); } }))
          : h('input', { type: 'date', 'aria-label': inc.label + ' next pay date', 'data-key': 'nextpay:' + inc.id, value: inc.nextPayDate.date || '', onchange: (e) => ctx.update('Next pay date', (d) => setNextPayDate(d, inc.id, e.target.value)) }),
        accountSelect(ctx, 'acct-inc:' + inc.id, inc.accountId, (v) => ctx.update('Pay goes to', (d) => setItemAccount(d, 'income', inc.id, v)), inc.label + ' account')))) : h('p', { class: 'muted small' }, 'No income yet (Basics).'),
    h('h3', {}, 'Bills'),
    bills.length ? bills.map(({ l, annual }) => h('div', { class: 'qa' },
      h('div', { class: 'q' }, h('div', {}, l.name), h('div', { class: 'hint' }, annual ? 'Once a year: due month (1 to 12) and day' : 'Due day of the month (1 to 31)')),
      h('div', { class: 'row' }, annual ? dayBox(l, 'dueMonth', 12, l.name + ' due month') : null, dayBox(l, 'dueDay', 31, l.name + ' due day'),
        accountSelect(ctx, 'acct-line:' + l.id, l.accountId, (v) => ctx.update('Paid from', (d) => setItemAccount(d, 'line', l.id, v)), l.name + ' account')))) : h('p', { class: 'muted small' }, 'No fixed or yearly lines yet.'),
    doc.debts.filter((x) => x.state !== 'archived').length ? h('h3', {}, 'Debt payments') : null,
    doc.debts.filter((x) => x.state !== 'archived').map((debt) => h('div', { class: 'qa' },
      h('div', { class: 'q' }, h('div', {}, debt.label), h('div', { class: 'hint' }, 'Due day ' + (debt.dueDay.amount || 'not set yet (Actual pass)'))),
      h('div', { class: 'row' },
        debt.type === 'credit-card' ? h('select', { 'aria-label': debt.label + ' pays', 'data-key': 'paywith:' + debt.id, onchange: (e) => ctx.update('Card payment', (d) => setDebtPayWith(d, debt.id, e.target.value)) },
          options([['minimum', 'Pays the minimum'], ['statement', 'Pays the statement balance']], debt.payWith || 'minimum')) : null,
        accountSelect(ctx, 'acct-debt:' + debt.id, debt.payFrom, (v) => ctx.update('Paid from', (d) => setItemAccount(d, 'debt', debt.id, v)), debt.label + ' account')))),
    h('h3', {}, 'Cushion'),
    h('div', { class: 'qa' }, h('div', { class: 'q' }, h('div', {}, 'Keep at least this much in cash'), h('div', { class: 'hint' }, 'Days under it are shaded. Blank means $0.')),
      valueInput({ ...ctx, preview: null }, ['cashflow', 'cushion'], doc.cashflow.cushion, { label: 'Cushion', cadence: false })));
}

// Scheduled items on or before today: It happened (with the amount, editable) or Didn't happen / moved.
export function waitingCard(ctx, summary) {
  const cal = calendarFor(ctx, summary);
  if (!cal.waiting.length) return null;
  const st = ctx.ui.waitEdit = ctx.ui.waitEdit || {};
  return h('div', { class: 'card flag', id: 'waiting-card' },
    h('h2', {}, 'Scheduled, on or before today (' + cal.waiting.length + ')'),
    h('ul', { class: 'plain' }, cal.waiting.map((it) => {
      const s = st[it.key] = st[it.key] || { amount: it.amount === null ? '' : String(it.amount), moving: false, to: todayIso() };
      return h('li', {},
        h('div', { style: 'flex:1 1 200px' }, h('b', {}, it.name), h('div', { class: 'xs muted' }, (it.dir === 'in' ? 'Paycheck, ' : 'Due ') + dayLabel(it.date) + (it.moved ? ' (moved)' : ''))),
        h('input', { type: 'text', inputmode: 'decimal', class: 'amount', style: 'width:7em', 'aria-label': it.name + ' amount', 'data-key': 'wait-amt:' + it.key, value: s.amount, oninput: (e) => { s.amount = e.target.value; } }),
        h('button', { class: 'btn small primary', 'data-key': 'happened:' + it.key, onclick: () => {
          const a = parseAmount(s.amount);
          if (a === null || a === undefined) return ctx.toast('Type the amount');
          ctx.update('It happened', (d) => confirmScheduled(d, it, a));
          ctx.toast('Logged ' + it.name);
        } }, 'It happened'),
        s.moving ? h('span', { class: 'row' },
          h('input', { type: 'date', 'aria-label': 'New date', 'data-key': 'move-to:' + it.key, value: s.to, onchange: (e) => { s.to = e.target.value; } }),
          h('button', { class: 'btn small', onclick: () => ctx.update('Moved', (d) => moveItem(d, it.key, s.to, new Date().toISOString())) }, 'Move'),
          h('button', { class: 'btn small ghost', 'data-key': 'skip:' + it.key, onclick: () => ctx.update('Skipped this month', (d) => moveItem(d, it.key, null, new Date().toISOString())) }, 'Skip this month'))
          : h('button', { class: 'btn small ghost', 'data-key': 'didnt:' + it.key, onclick: () => { s.moving = true; ctx.rerender(); } }, "Didn't happen / moved"),
        it.moved ? h('button', { class: 'btn small ghost', onclick: () => ctx.update('Back to its date', (d) => clearMove(d, it.key)) }, 'Undo move') : null);
    })));
}

// A real balance on any day resets the projection from that day.
export function checkBalancesCard(ctx) {
  const live = ctx.doc.accounts.filter((a) => a.state !== 'archived');
  if (!live.length) return null;
  const st = ctx.ui.check = ctx.ui.check || { account: live[0].id, date: todayIso(), amount: '' };
  return h('details', { class: 'card', id: 'check-balances' }, h('summary', {}, 'Check balances'),
    h('p', { class: 'muted small' }, 'Type a real balance from the bank for any account and day. The calendar starts again from it.'),
    h('div', { class: 'row' },
      h('select', { 'aria-label': 'Account', 'data-key': 'check-acct', onchange: (e) => { st.account = e.target.value; } }, options(live.map((a) => [a.id, a.name]), st.account)),
      h('input', { type: 'date', 'aria-label': 'Day', 'data-key': 'check-date', value: st.date, onchange: (e) => { st.date = e.target.value || todayIso(); } }),
      h('input', { type: 'text', inputmode: 'decimal', class: 'amount', style: 'width:8em', placeholder: '$', 'aria-label': 'Balance', 'data-key': 'check-amt', value: st.amount, oninput: (e) => { st.amount = e.target.value; } }),
      h('button', { class: 'btn small primary', 'data-key': 'check-save', onclick: () => {
        const a = parseAmount(st.amount);
        if (a === null || a === undefined) return ctx.toast('Type the balance');
        ctx.update('Balance checked', (d) => addBalanceCheck(d, st.account, st.date, makeValue(a, { cadence: 'one-off' })));
        st.amount = '';
      } }, 'Save balance')));
}

// The Budget screen's compact strip: the next 30 days, today, the lowest point,
// the next payday, and safe to spend until payday.
export function budgetCashStrip(ctx, summary) {
  const cal = calendarFor(ctx, summary, 30);
  const go = () => { ctx.go('analyze'); setTimeout(() => { const el = document.getElementById('sec-cashflow'); if (el) el.scrollIntoView(); }, 60); };
  if (!cal.lowest || cal.unknownStart.length === ctx.doc.accounts.filter((a) => a.state !== 'archived').length) {
    return h('div', { class: 'card cash-strip' }, h('div', { class: 'spread' }, h('b', {}, 'Cash, next 30 days'), quickEntryButton(ctx)),
      h('p', { class: 'muted small' }, 'Add an account balance in Fill in, Cash flow, to see cash by day.'));
  }
  const days = cal.days.filter((x) => x.date >= cal.today);
  const iPay = cal.nextPayday ? days.findIndex((x) => x.date === cal.nextPayday) : -1;
  const iLow = days.findIndex((x) => x.date === cal.lowest.date);
  const markers = [iPay >= 0 ? { i: iPay, label: 'Payday' } : null, iLow >= 0 ? { i: iLow, label: 'Lowest' } : null].filter(Boolean);
  const w = Math.min(560, Math.max(260, document.documentElement.clientWidth - 70));
  return h('div', { class: 'card cash-strip', id: 'cash-strip' },
    h('div', { class: 'spread' }, h('b', {}, 'Cash, next 30 days'), quickEntryButton(ctx)),
    h('div', { class: 'chart', html: dayLine({ days: days.map((x) => ({ date: x.date, v: x.cash })), width: w, height: 90, fmt: money, todayIndex: 0, cushion: cal.cushion || null, markers, compact: true, label: 'Cash for the next 30 days' }) }),
    h('div', { class: 'strip three' },
      h('div', { class: 'tile' }, h('div', { class: 'label' }, 'Today'), h('div', { class: 'value', 'data-key': 'cash-today' }, money(cal.todayCash))),
      h('div', { class: 'tile' }, h('div', { class: 'label' }, 'Lowest point'), h('div', { class: 'value', 'data-key': 'cash-lowest' }, money(cal.lowest.amount)), h('div', { class: 'sub' }, dayLabel(cal.lowest.date))),
      h('div', { class: 'tile' }, h('div', { class: 'label' }, 'Safe to spend until payday'), h('div', { class: 'value', 'data-key': 'safe-to-spend' }, money(cal.safeToSpend)), h('div', { class: 'sub' }, cal.nextPayday ? 'payday ' + dayLabel(cal.nextPayday) : 'no payday in 30 days'))),
    h('p', { class: 'reading', 'data-key': 'cash-reading' }, calendarReading(cal), ' ', h('a', { href: '#analyze', onclick: (e) => { e.preventDefault(); go(); } }, 'See the calendar')));
}

