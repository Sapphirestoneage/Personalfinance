// Accounts (S-136): the foundation, first step. Cash accounts (checking, savings, cash), each with its
// current balance, the day it was read, and an Update box; tap one for its details and history. When every
// cash account has a balance from the last 30 days the step is done and folds to one line, with Review to
// open it again. Numbers come from calc/balances.js accountsStatus; this file only lays them out.
// Credit and debt (S-137) comes next: every card and loan, with what is owed, and for a card its limit,
// what is available, and how much is used; a paid-off card is still credit. Investments and things you own
// (step 4) sit below, folded, until their step.

import { h, options } from '../dom.js';
import { money, pct, todayIso, dayLabel, dateLabel } from '../format.js';
import { valueInput } from '../components/value-input.js';
import { nameEdit } from '../components/name-edit.js';
import { jumpLink } from '../components/jump.js';
import { accountsCard, bankInput } from '../components/accounts.js';
import { accountsStatus, creditStatus, FRESH_DAYS, lastDayOf } from '../../calc/balances.js';
import { netWorthAt, LABELS as NW_LABELS } from '../../calc/networth.js';
import { addAccount, updateBalance, setAccountField } from '../../store/accounts.js';
import { addDebt } from '../../store/edits.js';
import { debtCard } from '../components/lines.js';
import { interestChart } from '../charts/interest-chart.js';
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

// Credit and debt (S-137): one row per card or loan. The Today box is the same Update as cash; the
// details are the debt itself (APR, minimum, promo, limit, due day).
function owedText(r) {
  if (r.owed === null) return 'No balance yet';
  if (r.revolving && r.owed === 0) return 'No balance' + (r.available !== null ? ': ' + money(r.available, true) + ' available' : '');
  return money(r.owed, true) + ' owed' + (r.revolving && r.available !== null ? ', ' + money(r.available, true) + ' available of ' + money(r.limit, true) + ' (' + pct(r.used) + ' used)' : '');
}

function creditRow(ctx, summary, r, today) {
  const key = 'credit-open:' + r.key;
  const open = ctx.ui.expanded.has(key);
  const debt = r.debtId ? ctx.doc.debts.find((x) => x.id === r.debtId) : null;
  const x = { id: r.key, name: r.name, latest: r.latest };
  return h('div', { class: 'acct-cash' + (r.fresh ? '' : ' stale'), 'data-key': 'credit-row:' + r.key },
    h('div', { class: 'qa' },
      h('div', { class: 'q' },
        h('button', { class: 'row-tap acct-name', 'data-key': key, 'aria-expanded': open ? 'true' : 'false', onclick: () => { if (open) ctx.ui.expanded.delete(key); else ctx.ui.expanded.add(key); ctx.rerender(); } },
          (open ? '\u25be ' : '\u25b8 ') + r.name),
        h('div', { class: 'hint', 'data-key': 'credit-latest:' + r.key }, (r.revolving ? 'Credit' : 'Loan') + '. ' + owedText(r) + '. ' + ago(r) + (r.fresh ? '' : ': update it'))),
      h('div', { class: 'row' }, h('span', { class: 'xs muted' }, 'Today'), updateBox(ctx, x, today))),
    open && debt ? h('div', { class: 'acct-detail' }, debtCard(ctx, debt, summary)) : null);
}

function creditSection(ctx, summary, today) {
  const doc = ctx.doc;
  const st = creditStatus(doc, today);
  const reviewing = ctx.ui.expanded.has('credit-review');
  if (st.done && !reviewing) {
    return h('div', { class: 'card spread', id: 'credit-card', 'data-key': 'credit-done' },
      h('span', {}, h('span', { class: 'chip st-known' }, 'Done'), ' Credit and debt: ' + (st.rows.length ? st.rows.length + (st.rows.length === 1 ? ' card or loan, ' : ' cards and loans, ') + money(st.owed, true) + ' owed' +
        (st.available !== null ? ', ' + money(st.available, true) + ' of credit available' : '') + '.' : 'no debts.')),
      h('button', { class: 'btn small', 'data-key': 'credit-review', onclick: () => { ctx.ui.expanded.add('credit-review'); ctx.rerender(); } }, 'Review'));
  }
  return h('div', { class: 'card', id: 'credit-card' },
    h('div', { class: 'spread' }, h('h2', { style: 'margin:0' }, 'Credit and debt'), st.owed !== null ? h('b', { class: 'num', 'data-key': 'credit-owed' }, money(st.owed, true) + ' owed') : null),
    h('p', { class: 'muted small' }, 'Every card, line of credit, and loan. A card with nothing owed is still credit you have. Type each balance as of today; the minimums add up to Debt payments.' +
      (st.available !== null ? ' Available on your cards: ' + money(st.available, true) + ' of ' + money(st.limit, true) + ' (' + pct(st.used) + ' used).' : '') +
      (st.stale.length && st.rows.length ? ' Out of date: ' + st.stale.join(', ') + '.' : '')),
    st.rows.length ? null : h('label', { class: 'check', 'data-path': JSON.stringify(['debts']) }, h('input', { type: 'checkbox', checked: !!doc.noDebts, 'data-key': 'no-debts',
      'data-path': JSON.stringify(['debts']), onchange: (e) => ctx.update('No debts', (d) => { d.noDebts = e.target.checked; }) }), 'No cards or loans (counts as complete)'),
    interestChart(ctx, summary),
    st.rows.map((r) => creditRow(ctx, summary, r, today)),
    h('div', { class: 'row' },
      // A card is made with its account (S-126): the debt keeps APR, minimum, promo, and limit; the account its balances.
      h('button', { class: 'btn small', 'data-key': 'add-card', onclick: () => {
        let id;
        ctx.update('Add credit card', (d) => {
          const debt = addDebt(d, { label: 'Credit card ' + (d.debts.filter((x) => x.type === 'credit-card').length + 1), type: 'credit-card' });
          id = addAccount(d, { name: debt.label, type: 'credit-card', debtId: debt.id }).id;
        });
        if (id) { ctx.ui.expanded.add('credit-open:' + id); ctx.rerender(); }
      } }, '+ Credit card'),
      h('button', { class: 'btn small', 'data-key': 'add-debt', onclick: () => {
        let id;
        ctx.update('Add debt', (d) => { id = addDebt(d, { label: 'Loan ' + (d.debts.length + 1), type: 'student-loan' }).id; });
        if (id) { ctx.ui.expanded.add('credit-open:' + id); ctx.rerender(); }
      } }, '+ Loan or other debt'),
      st.done ? h('button', { class: 'btn small ghost', 'data-key': 'credit-fold', onclick: () => { ctx.ui.expanded.delete('credit-review'); ctx.rerender(); } }, 'Done') : null));
}

function detail(ctx, x) {
  const a = ctx.doc.accounts.find((y) => y.id === x.id);
  return h('div', { class: 'acct-detail', 'data-key': 'acct-detail:' + x.id },
    h('div', { class: 'row' },
      nameEdit(ctx, a.name, 'acct:' + a.id + ':name', (d, v) => setAccountField(d, a.id, 'name', v), 'Account name'),
      bankInput(ctx, a, 'Bank', 'Bank'),
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
  const cashCard = st.done && !reviewing
    ? h('div', { class: 'card spread', id: 'cash-card', 'data-key': 'cash-done' },
      h('span', {}, h('span', { class: 'chip st-known' }, 'Done'), ' Cash: ' + st.cash.length + (st.cash.length === 1 ? ' account, ' : ' accounts, ') + money(st.cashTotal, true) + ', all updated in the last ' + FRESH_DAYS + ' days.'),
      h('button', { class: 'btn small', 'data-key': 'accounts-review', onclick: () => { ctx.ui.expanded.add('accounts-review'); ctx.rerender(); } }, 'Review'))
    : h('div', { class: 'card', id: 'cash-card' },
      h('div', { class: 'spread' }, h('h2', { style: 'margin:0' }, 'Cash'),
        st.cashTotal !== null ? h('b', { class: 'num', 'data-key': 'cash-total' }, money(st.cashTotal, true)) : null),
      h('p', { class: 'muted small' }, 'Checking, savings (high-yield too), and cash on hand. Type each balance as of today; the history builds by itself.' +
        (st.stale.length && st.cash.length ? ' Out of date: ' + st.stale.join(', ') + '.' : '')),
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
    creditSection(ctx, summary, today),
    h('details', { class: 'card', id: 'other-accounts', open: others.length && ctx.ui.expanded.has('other-accounts') ? true : null, ontoggle: (e) => { if (e.target.open) ctx.ui.expanded.add('other-accounts'); else ctx.ui.expanded.delete('other-accounts'); } },
      h('summary', {}, 'Investments, retirement, and things you own (' + others.length + ')'),
      accountsCard(ctx, doc.currentMonth, { skip: CASH_ACCOUNT_TYPES, title: 'Investments and things you own, by month' })));
}
