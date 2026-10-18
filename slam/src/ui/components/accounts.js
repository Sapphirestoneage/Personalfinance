// Accounts and their balances for one month (S-084): name, type, start, end.
// A start that was not typed shows last month's end, "carried from last
// month", and typing a number replaces it. Used in Fill in, Cash flow, and at
// month-end. Numbers come from calc/balances.js; this file only lays them out.

import { h, options } from '../dom.js';
import { money, monthLabel } from '../format.js';
import { valueInput } from './value-input.js';
import { nameEdit } from './name-edit.js';
import { addAccount, setBalance, setAccountField, setBalanceDate } from '../../store/accounts.js';
import { balancesFor } from '../../calc/balances.js';

export const ACCOUNT_TYPE_OPTIONS = [['checking', 'Checking'], ['savings', 'Savings'], ['credit-card', 'Credit card'], ['cash', 'Cash'], ['other', 'Other']];

// A balance box writes through setBalance (the month and account may be new).
function balanceInput(ctx, month, acct, which, stored, label) {
  const sub = { ...ctx, preview: null, commit: (path, value, l) => ctx.update(l || label, (d) => setBalance(d, month, acct.id, which, value)) };
  return valueInput(sub, ['balances', month, acct.id, which], stored, { label, cadence: false });
}

// The day a balance was read (S-100): the month's first or last day unless another is picked.
function balanceDate(ctx, month, a, which) {
  const b = (ctx.doc.balances[month] || {})[a.id] || {};
  const last = month + '-' + String(new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate()).padStart(2, '0');
  const plain = which === 'start' ? month + '-01' : last;
  return h('label', { class: 'xs muted balance-date' }, 'on ',
    h('input', { type: 'date', min: month + '-01', max: last, value: b[which + 'On'] || plain, 'data-key': 'acct:' + a.id + ':' + which + 'On', 'aria-label': a.name + ' ' + which + ' balance date',
      onchange: (e) => ctx.update('Balance date', (d) => setBalanceDate(d, month, a.id, which, !e.target.value || e.target.value === plain ? null : e.target.value)) }));
}

export function accountsCard(ctx, month, opts = {}) {
  const doc = ctx.doc;
  const b = balancesFor(doc, month);
  const stored = (id, which) => (((doc.balances[month] || {})[id] || {})[which]) || { amount: null, cadence: 'one-off', status: null, source: 'client', asOf: null, note: '' };
  const archived = doc.accounts.filter((a) => a.state === 'archived');
  return h('div', { class: 'card', id: 'accounts-card' },
    h('h2', {}, opts.title || 'Accounts and balances, ' + monthLabel(month)),
    h('p', { class: 'muted small' }, 'Checking, savings, cash, and cards. A card\'s balance is what is owed. A start you leave blank is last month\'s end.'),
    b.rows.map((r) => {
      const a = doc.accounts.find((x) => x.id === r.id);
      const linked = a.debtId ? doc.debts.find((d) => d.id === a.debtId) : null;
      return h('div', { class: 'qa account-row' },
        h('div', { class: 'q' },
          h('div', {}, nameEdit(ctx, a.name, 'acct:' + a.id + ':name', (d, v) => setAccountField(d, a.id, 'name', v), 'Account name')),
          h('input', { type: 'text', class: 'institution', placeholder: 'Bank or card company', 'aria-label': a.name + ' bank or card company', 'data-key': 'acct:' + a.id + ':institution', value: a.institution || '',
            onchange: (e) => ctx.update('Bank or card company', (d) => setAccountField(d, a.id, 'institution', e.target.value.trim())) }),
          h('div', { class: 'row' },
            h('select', { 'aria-label': 'Account type', 'data-key': 'acct:' + a.id + ':type', onchange: (e) => ctx.update('Account type', (d) => setAccountField(d, a.id, 'type', e.target.value)) }, options(ACCOUNT_TYPE_OPTIONS, a.type)),
            a.type === 'credit-card' ? h('select', { 'aria-label': 'Linked debt', 'data-key': 'acct:' + a.id + ':debt', onchange: (e) => ctx.update('Link card to debt', (d) => setAccountField(d, a.id, 'debtId', e.target.value)) },
              options([['', 'Not linked to a debt'], ...doc.debts.filter((x) => x.state !== 'archived').map((x) => [x.id, 'Debt: ' + x.label])], a.debtId || '')) : null,
            h('button', { class: 'btn small ghost', 'data-key': 'acct:' + a.id + ':archive', onclick: () => ctx.update('Archive account', (d) => setAccountField(d, a.id, 'state', 'archived')) }, 'Archive')),
          linked ? h('div', { class: 'hint' }, 'APR, minimum, and due day stay on the debt "' + linked.label + '".') : null),
        h('div', { class: 'balance-pair' },
          h('div', {}, h('div', { class: 'xs muted' }, 'Start balance'), balanceInput(ctx, month, a, 'start', stored(a.id, 'start'), a.name + ' start'), balanceDate(ctx, month, a, 'start'),
            r.start.from === 'carried' ? h('div', { class: 'xs muted', 'data-key': 'carried:' + a.id }, 'Carried from last month: ' + money(r.start.amount, true)) : null),
          h('div', {}, h('div', { class: 'xs muted' }, 'End balance'), balanceInput(ctx, month, a, 'end', stored(a.id, 'end'), a.name + ' end'), balanceDate(ctx, month, a, 'end'))));
    }),
    b.rows.length ? h('p', { class: 'small' }, 'Cash (checking, savings, cash): start ', h('b', { class: 'num' }, money(b.cashStart)), ', end ', h('b', { class: 'num' }, money(b.cashEnd)),
      b.rows.some((r) => r.card) ? h('span', {}, '. Cards owed: start ', h('b', { class: 'num' }, money(b.cardsStart)), ', end ', h('b', { class: 'num' }, money(b.cardsEnd))) : null) : h('p', { class: 'muted small' }, 'No accounts yet.'),
    h('div', { class: 'row' }, ACCOUNT_TYPE_OPTIONS.slice(0, 4).map(([type, label]) => h('button', { class: 'btn small', 'data-key': 'add-acct-' + type, onclick: () => {
      let id;
      ctx.update('Add account', (d) => { id = addAccount(d, { name: label, type }).id; });
      if (id) { ctx.ui.focusKey = 'acct:' + id + ':name'; ctx.rerender(); }
    } }, '+ ' + label))),
    archived.length ? h('details', {}, h('summary', { class: 'xs muted' }, 'Archived accounts (' + archived.length + ')'),
      archived.map((a) => h('div', { class: 'spread small' }, a.name, h('button', { class: 'btn small ghost', onclick: () => ctx.update('Restore account', (d) => setAccountField(d, a.id, 'state', 'active')) }, 'Restore')))) : null);
}

// One line for Next stage and Eras: cash on hand, read-only, with a link to where it is typed.
export function cashOnHandNote(ctx, coh) {
  const go = (e) => { e.preventDefault(); ctx.go('fill', { pass: 'cashflow' }); setTimeout(() => { const el = document.getElementById('accounts-card'); if (el) el.scrollIntoView(); }, 60); };
  if (coh.amount === null) {
    return h('p', { class: 'small', 'data-key': 'cash-on-hand' }, 'Cash on hand: not entered yet. It comes from account balances. ', h('a', { href: '#fill', onclick: go }, 'Enter balances in Cash flow'));
  }
  return h('p', { class: 'small', 'data-key': 'cash-on-hand' }, 'Cash on hand: ', h('b', { class: 'num' }, money(coh.amount)),
    ' from your balances (' + coh.parts.filter((p) => p.amount !== null).map((p) => p.name + ' ' + money(p.amount)).join(', ') + ')' + (coh.missing.length ? '; missing ' + coh.missing.join(', ') : '') + '. ',
    h('a', { href: '#fill', onclick: go }, 'Change in Cash flow'));
}
