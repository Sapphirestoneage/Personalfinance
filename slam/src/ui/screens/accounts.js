// Accounts (S-136): the foundation, first step. Cash accounts (checking, savings, cash), each with its
// current balance, the day it was read, and an Update box; tap one for its details and history. When every
// cash account has a balance from the last 30 days the step is done and folds to one line, with Review to
// open it again. Numbers come from calc/balances.js accountsStatus; this file only lays them out.
// Credit cards and loans (steps 2 and 3) are in Setup, Credit and debt; investments and things you own
// (step 4) sit below, folded, until their step.

import { h, options } from '../dom.js';
import { money, todayIso, dayLabel, dateLabel } from '../format.js';
import { valueInput } from '../components/value-input.js';
import { nameEdit } from '../components/name-edit.js';
import { jumpLink } from '../components/jump.js';
import { accountsCard } from '../components/accounts.js';
import { accountsStatus, FRESH_DAYS, lastDayOf } from '../../calc/balances.js';
import { netWorthAt, LABELS as NW_LABELS } from '../../calc/networth.js';
import { addAccount, updateBalance, setAccountField } from '../../store/accounts.js';
import { ACCOUNT_TYPE_INFO, CASH_ACCOUNT_TYPES } from '../../store/schema.js';

const CASH_OPTIONS = CASH_ACCOUNT_TYPES.map((t) => [t, ACCOUNT_TYPE_INFO[t].label]);
const blank = { amount: null, cadence: 'one-off', status: null, source: 'client', asOf: null, note: '' };

function ago(x) {
  if (!x.latest) return 'No balance yet';
  if (!x.latest.date) return 'Balance has no date';
  return (x.days === 0 ? 'Today' : x.days === 1 ? 'Yesterday' : x.days + ' days ago') + ', ' + dayLabel(x.latest.date);
}

// The Update box: today's balance. It writes this month's end, read today (store/accounts.js updateBalance).
function updateBox(ctx, x, today) {
  const month = today.slice(0, 7);
  const b = ((ctx.doc.balances || {})[month] || {})[x.id] || {};
  // Shown only when this month's end was read today; otherwise the box is empty and the latest is its hint.
  const todays = b.end && (b.endOn || lastDayOf(month)) === today ? b.end : blank;
  const sub = { ...ctx, preview: null, commit: (path, value) => ctx.update('Update ' + x.name, (d) => updateBalance(d, x.id, today, value)) };
  return valueInput(sub, ['balances', month, x.id, 'end'], todays, { label: x.name + ' balance today', cadence: false, placeholder: x.latest ? String(x.latest.amount) : '$ today' });
}

function detail(ctx, x) {
  const a = ctx.doc.accounts.find((y) => y.id === x.id);
  return h('div', { class: 'acct-detail', 'data-key': 'acct-detail:' + x.id },
    h('div', { class: 'row' },
      nameEdit(ctx, a.name, 'acct:' + a.id + ':name', (d, v) => setAccountField(d, a.id, 'name', v), 'Account name'),
      h('input', { type: 'text', class: 'institution', list: 'institutions', placeholder: 'Bank', 'aria-label': a.name + ' bank', 'data-key': 'acct:' + a.id + ':institution', value: a.institution || '',
        onchange: (e) => ctx.update('Bank', (d) => setAccountField(d, a.id, 'institution', e.target.value.trim())) }),
      h('select', { 'aria-label': 'Account type', 'data-key': 'acct:' + a.id + ':type', onchange: (e) => ctx.update('Account type', (d) => setAccountField(d, a.id, 'type', e.target.value)) }, options(CASH_OPTIONS, a.type)),
      h('button', { class: 'btn small ghost', 'data-key': 'acct:' + a.id + ':archive', onclick: () => ctx.update('Archive account', (d) => setAccountField(d, a.id, 'state', 'archived')) }, 'Archive')),
    h('h4', {}, 'Balance history'),
    x.history.length ? h('ul', { class: 'plain', 'data-key': 'acct-history:' + x.id }, x.history.slice().reverse().slice(0, 12).map((o) =>
      h('li', { class: 'small' }, h('span', {}, dateLabel(o.date)), h('b', { class: 'num' }, money(o.amount, true))))) : h('p', { class: 'xs muted' }, 'No balances yet. Type today\'s balance above.'));
}

function cashRow(ctx, x, today) {
  const key = 'acct-open:' + x.id;
  const open = ctx.ui.expanded.has(key);
  return h('div', { class: 'acct-cash' + (x.fresh ? '' : ' stale'), 'data-key': 'acct-row:' + x.id },
    h('div', { class: 'qa' },
      h('div', { class: 'q' },
        h('button', { class: 'row-tap acct-name', 'data-key': key, 'aria-expanded': open ? 'true' : 'false', onclick: () => { if (open) ctx.ui.expanded.delete(key); else ctx.ui.expanded.add(key); ctx.rerender(); } },
          (open ? '▾ ' : '▸ ') + x.name),
        h('div', { class: 'hint', 'data-key': 'acct-latest:' + x.id }, [x.institution, ACCOUNT_TYPE_INFO[x.type].label].filter(Boolean).join(', ') + '. ' +
          (x.latest ? money(x.latest.amount, true) + ', ' : '') + ago(x) + (x.fresh ? '' : ': update it'))),
      h('div', { class: 'row' }, h('span', { class: 'xs muted' }, 'Today'), updateBox(ctx, x, today))),
    open ? detail(ctx, x) : null);
}

export function renderAccounts(ctx, summary) {
  const doc = ctx.doc;
  const today = todayIso();
  const st = accountsStatus(doc, today);
  const nw = netWorthAt(doc, today);
  const reviewing = ctx.ui.expanded.has('accounts-review');
  const add = (type) => {
    let id;
    ctx.update('Add account', (d) => { id = addAccount(d, { name: ACCOUNT_TYPE_INFO[type].label, type }).id; });
    if (id) { ctx.ui.expanded.add('acct-open:' + id); ctx.ui.focusKey = 'acct:' + id + ':name'; ctx.rerender(); }
  };
  const names = [...new Set(doc.accounts.map((a) => (a.institution || '').trim()).filter(Boolean))].sort((x, y) => x.localeCompare(y));
  const cashCard = st.done && !reviewing
    ? h('div', { class: 'card spread', id: 'cash-card', 'data-key': 'cash-done' },
      h('span', {}, h('span', { class: 'chip st-known' }, 'Done'), ' Cash: ' + st.cash.length + (st.cash.length === 1 ? ' account, ' : ' accounts, ') + money(st.cashTotal, true) + ', all updated in the last ' + FRESH_DAYS + ' days.'),
      h('button', { class: 'btn small', 'data-key': 'accounts-review', onclick: () => { ctx.ui.expanded.add('accounts-review'); ctx.rerender(); } }, 'Review'))
    : h('div', { class: 'card', id: 'cash-card' },
      h('div', { class: 'spread' }, h('h2', { style: 'margin:0' }, 'Cash'),
        st.cashTotal !== null ? h('b', { class: 'num', 'data-key': 'cash-total' }, money(st.cashTotal, true)) : null),
      h('p', { class: 'muted small' }, 'Checking, savings, and cash on hand. Type each balance as of today; the history builds by itself.' +
        (st.stale.length && st.cash.length ? ' Out of date: ' + st.stale.join(', ') + '.' : '')),
      h('datalist', { id: 'institutions' }, names.map((n) => h('option', { value: n }))),
      st.cash.map((x) => cashRow(ctx, x, today)),
      h('div', { class: 'row' }, CASH_ACCOUNT_TYPES.map((t) => h('button', { class: 'btn small', 'data-key': 'add-acct-' + t, onclick: () => add(t) }, '+ ' + ACCOUNT_TYPE_INFO[t].label)),
        st.done ? h('button', { class: 'btn small ghost', 'data-key': 'accounts-fold', onclick: () => { ctx.ui.expanded.delete('accounts-review'); ctx.rerender(); } }, 'Done') : null));
  const others = doc.accounts.filter((a) => a.state !== 'archived' && !CASH_ACCOUNT_TYPES.includes(a.type) && a.type !== 'credit-card');
  return h('div', {},
    h('h1', {}, 'Accounts'),
    h('div', { class: 'card spread', id: 'networth-line' },
      h('span', { class: 'small' }, NW_LABELS.total + ': ', h('b', { class: 'num', 'data-key': 'nw-line-total' }, money(nw.total)), '. ', NW_LABELS.fi + ': ', h('b', { class: 'num', 'data-key': 'nw-line-fi' }, money(nw.fi)), '.'),
      jumpLink(ctx, 'insights:networth', 'See Net worth', 'nw-line-go')),
    cashCard,
    h('p', { class: 'small muted', 'data-key': 'accounts-next' }, 'Next: credit cards, then loans (', jumpLink(ctx, 'setup:debts', 'Credit and debt', 'accounts-to-debts'), '), then investments and things you own.'),
    h('details', { class: 'card', id: 'other-accounts', open: others.length && ctx.ui.expanded.has('other-accounts') ? true : null, ontoggle: (e) => { if (e.target.open) ctx.ui.expanded.add('other-accounts'); else ctx.ui.expanded.delete('other-accounts'); } },
      h('summary', {}, 'Investments, retirement, and things you own (' + others.length + ')'),
      accountsCard(ctx, doc.currentMonth, { skip: CASH_ACCOUNT_TYPES, title: 'Investments and things you own, by month' })));
}
