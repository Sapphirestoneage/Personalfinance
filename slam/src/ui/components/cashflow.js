// Cash flow inputs in Setup (S-086, S-106): the pay schedule (it counts each
// month's paychecks for the income plan), the account each paycheck lands in
// and each bill is paid from, the month a yearly bill is due, and how each card
// is paid. The day-by-day cash calendar these once fed is retired (S-209): it
// lives in SLAM (calendar.html), with due days and the floor in its Ledger. The
// bills' due days, a debt's paid-from account and the cushion fed only that
// calendar, so their inputs are gone; the stored fields are left as they were.

import { h, options } from '../dom.js';
import { money, todayIso, dayLabel, monthLabel } from '../format.js';
import { paidAheadSchedules, firstMonth } from '../../calc/paid-ahead.js';
import { valueInput, parseAmount } from './value-input.js';
import { emptyState } from './jump.js';
import { PREMIUM_LINE_TYPES, premiumFor } from '../../calc/coverage.js';
import { linkedLine } from '../../calc/debts.js';
import { setNextPayDate, setPayDays, setItemAccount, setDebtPayWith } from '../../store/cashflow.js';

function accountSelect(ctx, key, value, onPick, label) {
  const live = ctx.doc.accounts.filter((a) => a.state !== 'archived');
  return h('select', { 'aria-label': label, 'data-key': key, onchange: (e) => onPick(e.target.value) },
    options([['', 'Checking (default)'], ...live.map((a) => [a.id, a.name])], value || ''));
}

const ANNUAL = (cat, line) => cat.type === 'annual' || line.estimate.cadence === 'year';

// Paydays (Setup, Income and paychecks): how many paychecks land in each month, and where.
export function paydaysCard(ctx) {
  const incomes = ctx.doc.income.filter((i) => i.state !== 'archived');
  return h('div', { class: 'card', id: 'paydays-card' },
    h('h2', {}, 'Paydays'),
    h('p', { class: 'muted small' }, 'Optional. These count the paychecks in each month (a month with a third paycheck plans for it). Each lands in checking unless you pick another account.'),
    incomes.length ? incomes.map((inc) => h('div', { class: 'qa' },
      h('div', { class: 'q' }, h('div', {}, inc.label), h('div', { class: 'hint' }, inc.payFrequency === 'semimonthly' ? 'Paid twice a month on these days' : 'Next pay date; the rest follow every ' + ({ weekly: 'week', biweekly: 'two weeks', monthly: 'month' }[inc.payFrequency] || 'pay period') + (inc.type === 'unemployment' && inc.benefitWeeksLeft !== null ? ', for ' + inc.benefitWeeksLeft + ' more weeks' : ''))),
      h('div', { class: 'row' },
        inc.payFrequency === 'semimonthly'
          ? [0, 1].map((i) => h('input', { type: 'number', min: 1, max: 31, class: 'day-box', 'aria-label': inc.label + ' pay day ' + (i + 1), 'data-key': 'payday:' + inc.id + ':' + i, value: String((inc.payDays || [1, 15])[i]),
            onchange: (e) => { const days = [...(inc.payDays || [1, 15])]; days[i] = Math.min(31, Math.max(1, Math.round(Number(e.target.value) || 1))); ctx.update('Pay days', (d) => setPayDays(d, inc.id, days)); } }))
          : h('input', { type: 'date', 'aria-label': inc.label + ' next pay date', 'data-key': 'nextpay:' + inc.id, value: inc.nextPayDate.date || '', onchange: (e) => ctx.update('Next pay date', (d) => setNextPayDate(d, inc.id, e.target.value)) }),
        accountSelect(ctx, 'acct-inc:' + inc.id, inc.accountId, (v) => ctx.update('Pay goes to', (d) => setItemAccount(d, 'income', inc.id, v)), inc.label + ' account')))) : h('p', { class: 'muted small' }, 'Add an income above first.'));
}

// Bills and debt payments (Setup, Bills and due dates): when each lands and from which account.
export function billsCard(ctx) {
  const doc = ctx.doc;
  const dayBox = (line, field, max, label) => valueInput({ ...ctx, preview: null }, ['line', line.id, field], line[field], { label, cadence: false, placeholder: max === 12 ? 'month' : 'day' });
  const bills = [];
  for (const c of doc.categories) {
    if (c.state === 'archived' || c.savings || c.id === 'debt') continue;
    // A premium is a bill only when it is paid directly (S-117); a loan's line is its bill (S-116).
    for (const l of c.lines) if (l.state !== 'archived' && (l.kind === 'fixed' || ANNUAL(c, l)) && !(PREMIUM_LINE_TYPES.includes(l.type) && premiumFor(doc).from !== 'direct')) bills.push({ c, l, annual: ANNUAL(c, l) });
  }
  const debts = doc.debts.filter((x) => x.state !== 'archived' && !linkedLine(doc, x));
  return h('div', { class: 'card', id: 'bills-card' },
    h('p', { class: 'muted small' }, 'Optional. Which account pays each bill, the month a yearly bill is due, and how each card is paid. Set the day each bill is due in ', h('a', { href: 'ledger.html', target: '_blank', rel: 'noopener' }, 'your numbers'), '.'),
    bills.length ? bills.map(({ l, annual }) => [h('div', { class: 'qa' },
      h('div', { class: 'q' }, h('div', {}, l.name), h('div', { class: 'hint' }, annual ? 'Once a year: the month it is due (1 to 12), and the account it is paid from' : 'The account it is paid from')),
      h('div', { class: 'row' }, annual ? dayBox(l, 'dueMonth', 12, l.name + ' due month') : null,
        accountSelect(ctx, 'acct-line:' + l.id, l.accountId, (v) => ctx.update('Paid from', (d) => setItemAccount(d, 'line', l.id, v)), l.name + ' account'))),
    annual ? openingAheadRow(ctx, l) : null]) : emptyState(ctx, 'No fixed or yearly lines yet. Mark a line fixed to give it a due date.', 'setup:categories', 'Categories and lines', 'bills-empty'),
    debts.some((d) => d.type === 'credit-card') ? h('h3', {}, 'How each card is paid') : null,
    debts.filter((debt) => debt.type === 'credit-card').map((debt) => h('div', { class: 'qa' },
      h('div', { class: 'q' }, h('div', {}, debt.label)),
      h('div', { class: 'row' },
        h('select', { 'aria-label': debt.label + ' pays', 'data-key': 'paywith:' + debt.id, onchange: (e) => ctx.update('Card payment', (d) => setDebtPayWith(d, debt.id, e.target.value)) },
          options([['minimum', 'Pays the minimum'], ['statement', 'Pays the statement balance']], debt.payWith || 'minimum'))))));
}

// Opening Paid ahead (S-130): a yearly bill paid before the client's first month. One tap opens it; the
// amount left and the months left, as of the first month, both "roughly" unless said otherwise.
function openingAheadRow(ctx, l) {
  const key = 'opening:' + l.id;
  const m0 = firstMonth(ctx.doc);
  const answered = l.openingAhead.status !== null || l.openingAheadMonths.status !== null;
  if (!answered && !ctx.ui.expanded.has(key)) {
    return h('div', { class: 'row' }, h('button', { class: 'btn small ghost', 'data-key': key, onclick: () => { ctx.ui.expanded.add(key); ctx.rerender(); } }, 'Already paid before ' + monthLabel(m0) + '?'));
  }
  const sched = paidAheadSchedules(ctx.doc).find((x) => x.id === 'opening:' + l.id);
  const box = (field, label, placeholder) => valueInput({ ...ctx, preview: null }, ['line', l.id, field], l[field], { label, cadence: false, placeholder, typed: 'roughly' });
  return h('div', { class: 'qa', 'data-key': 'opening-row:' + l.id },
    h('div', { class: 'q' }, h('div', { class: 'small' }, 'Paid ahead as of ' + monthLabel(m0)),
      h('div', { class: 'hint', 'data-key': 'opening-hint:' + l.id }, sched ? money(sched.share, true) + ' a month, $0 after ' + monthLabel(sched.through) + '.' : 'What is left of it, and for how many more months.')),
    h('div', { class: 'row' }, box('openingAhead', l.name + ' paid ahead, left', '$ left'), box('openingAheadMonths', l.name + ' paid ahead, months left', 'months')));
}

// Scheduled items on or before today: It happened (with the amount, editable) or Didn't happen / moved.
