// Accounts and their balances for one month (S-084): name, type, start, end.
// A start that was not typed shows last month's end, "carried from last
// month", and typing a number replaces it. Used in Fill in, Cash flow, and at
// month-end. Numbers come from calc/balances.js; this file only lays them out.

import { h, options } from '../dom.js';
import { money, monthLabel } from '../format.js';
import { valueInput } from './value-input.js';
import { nameEdit } from './name-edit.js';
import { addAccount, setBalance, setAccountField, setBalanceDate, addCardAccounts } from '../../store/accounts.js';
import { balancesFor, cardMap, accountsOverview, ACCOUNT_GROUPS } from '../../calc/balances.js';

export const ACCOUNT_TYPE_OPTIONS = [['checking', 'Checking'], ['savings', 'Savings'], ['credit-card', 'Credit card'], ['cash', 'Cash'],
  ['investment', 'Investment (brokerage)'], ['retirement', 'Retirement (401(k), IRA)'], ['hsa', 'HSA'], ['other', 'Other']];

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

// One account: name, bank, type, the debt a card pays down, and its start and end balances with their days.
function accountRow(ctx, month, r, stored) {
  const doc = ctx.doc;
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
          options([['', 'Not linked to a debt'], ...doc.debts.filter((x) => x.state !== 'archived').map((x) => {
            const other = doc.accounts.find((o) => o.id !== a.id && o.debtId === x.id && o.state !== 'archived');
            return [x.id, 'Debt: ' + x.label + (other ? ' (on ' + other.name + ')' : '')];
          })], a.debtId || '')) : null,
        h('button', { class: 'btn small ghost', 'data-key': 'acct:' + a.id + ':archive', onclick: () => ctx.update('Archive account', (d) => setAccountField(d, a.id, 'state', 'archived')) }, 'Archive')),
      linked ? h('div', { class: 'hint' }, 'APR, minimum, and due day stay on the debt "' + linked.label + '".') : null),
    h('div', { class: 'balance-pair' },
      h('div', {}, h('div', { class: 'xs muted' }, 'Start balance'), balanceInput(ctx, month, a, 'start', stored(a.id, 'start'), a.name + ' start'), balanceDate(ctx, month, a, 'start'),
        r.start.from === 'carried' ? h('div', { class: 'xs muted', 'data-key': 'carried:' + a.id }, 'Carried from last month: ' + money(r.start.amount, true)) : null),
      h('div', {}, h('div', { class: 'xs muted' }, 'End balance'), balanceInput(ctx, month, a, 'end', stored(a.id, 'end'), a.name + ' end'), balanceDate(ctx, month, a, 'end'))));
}

export function accountsCard(ctx, month, opts = {}) {
  const doc = ctx.doc;
  const b = balancesFor(doc, month);
  const stored = (id, which) => (((doc.balances[month] || {})[id] || {})[which]) || { amount: null, cadence: 'one-off', status: null, source: 'client', asOf: null, note: '' };
  const archived = doc.accounts.filter((a) => a.state === 'archived');
  return h('div', { class: 'card', id: 'accounts-card' },
    h('h2', {}, opts.title || 'Accounts and balances, ' + monthLabel(month)),
    h('p', { class: 'muted small' }, 'Bank accounts, cash, credit cards, investments, and anything else that holds money. A card\'s balance is what is owed. A start you leave blank is last month\'s end.'),
    // Grouped (S-103): bank and cash, cards, investments and retirement, other; empty groups are left out.
    ACCOUNT_GROUPS.map(([gid, glabel, types]) => {
      const rows = b.rows.filter((r) => types.includes(r.type));
      return rows.length ? [h('h3', { 'data-key': 'acct-group:' + gid }, glabel), rows.map((r) => accountRow(ctx, month, r, stored))] : null;
    }),
    b.rows.length ? h('p', { class: 'small' }, 'Cash (checking, savings, cash): start ', h('b', { class: 'num' }, money(b.cashStart)), ', end ', h('b', { class: 'num' }, money(b.cashEnd)),
      b.rows.some((r) => r.card) ? h('span', {}, '. Cards owed: start ', h('b', { class: 'num' }, money(b.cardsStart)), ', end ', h('b', { class: 'num' }, money(b.cardsEnd))) : null) : h('p', { class: 'muted small' }, 'No accounts yet.'),
    cardsBlock(ctx, month),
    h('div', { class: 'row' }, ACCOUNT_TYPE_OPTIONS.map(([type, label]) => h('button', { class: 'btn small', 'data-key': 'add-acct-' + type, onclick: () => {
      let id;
      ctx.update('Add account', (d) => { id = addAccount(d, { name: label.replace(/ \(.*\)$/, ''), type }).id; });
      if (id) { ctx.ui.focusKey = 'acct:' + id + ':name'; ctx.rerender(); }
    } }, '+ ' + label.replace(/ \(.*\)$/, '')))),
    archived.length ? h('details', {}, h('summary', { class: 'xs muted' }, 'Archived accounts (' + archived.length + ')'),
      archived.map((a) => h('div', { class: 'spread small' }, a.name, h('button', { class: 'btn small ghost', onclick: () => ctx.update('Restore account', (d) => setAccountField(d, a.id, 'state', 'active')) }, 'Restore')))) : null);
}

// Every credit card, both ways (S-102): which debt each card pays down, what it owes, what is
// set to be paid on it, and what was logged on it; card debts with no account get one tap.
function cardsBlock(ctx, month) {
  const m = cardMap(ctx.doc, month);
  if (!m.rows.length && !m.noAccount.length) return null;
  return h('div', { class: 'cards-map', 'data-key': 'cards-map' },
    h('h3', {}, 'Credit cards'),
    m.rows.length ? h('ul', { class: 'plain' }, m.rows.map((r) => h('li', { class: 'small', 'data-key': 'card:' + r.id },
      h('div', { style: 'flex:1 1 100%' },
        h('b', {}, r.name + (r.institution ? ' (' + r.institution + ')' : '')), ' ',
        r.debt ? h('span', {}, 'pays down the debt "' + r.debt.label + '"') : h('span', { class: 'warn' }, 'is not linked to a debt yet: pick one above'),
        r.owed !== null ? h('span', { class: 'muted' }, '. Owes ' + money(r.owed, true) + ' at the end of the month') : null, '.'),
      h('div', { class: 'xs muted', style: 'flex:1 1 100%' },
        (r.paidOn.length ? 'Paid on it: ' + r.paidOn.join(', ') + '. ' : 'No bills set to be paid on it. ') +
        (r.loggedCount ? 'Logged on it this month: ' + r.loggedCount + (r.loggedCount === 1 ? ' entry, ' : ' entries, ') + money(r.loggedAmount, true) + '.' : 'Nothing logged on it this month.'))))) : null,
    m.noAccount.length ? h('div', { class: 'row' },
      h('span', { class: 'small' }, 'Card debts with no account yet: ' + m.noAccount.map((d) => d.label).join(', ') + '.'),
      h('button', { class: 'btn small', 'data-key': 'add-card-accounts', onclick: () => ctx.update('Add card accounts', (d) => addCardAccounts(d)) },
        'Add ' + (m.noAccount.length === 1 ? 'an account for it' : 'an account for each (' + m.noAccount.length + ')'))) : null);
}

// What you have against what you owe (S-103), at the top of the accounts in Profile.
export function accountsOverviewCard(ctx) {
  const o = accountsOverview(ctx.doc, ctx.doc.currentMonth);
  if (!o.count) return null;
  const tile = (label, value, key, sub) => h('div', { class: 'tile', 'data-key': key }, h('div', { class: 'label' }, label), h('div', { class: 'value' }, money(value)), sub ? h('div', { class: 'sub' }, sub) : null);
  return h('div', { class: 'card', id: 'accounts-overview' },
    h('h2', {}, 'What you have and what you owe, ' + monthLabel(o.month)),
    h('div', { class: 'tiles' },
      tile('You have', o.have, 'acct-have', 'bank, cash, investments, other'),
      tile('You owe on cards', o.owe, 'acct-owe', null),
      tile('Net', o.net, 'acct-net', 'have minus cards')),
    h('ul', { class: 'plain' }, o.groups.filter((g) => g.rows.length).map((g) => h('li', { class: 'small' },
      h('span', {}, g.label, h('span', { class: 'xs muted' }, ' (' + g.rows.map((r) => r.name).join(', ') + ')')), h('b', { class: 'num' }, money(g.total))))),
    o.missing.length ? h('p', { class: 'xs muted' }, 'No balance yet for ' + o.missing.join(', ') + ', so those totals wait for it.') : null,
    h('p', { class: 'xs muted' }, 'Other debts (loans and the rest) are in Rough and Actual. Latest balance: the month\'s end, or its start until the end is in.'));
}

// One line for Next stage and Eras: cash on hand, read-only, with a link to where it is typed.
export function cashOnHandNote(ctx, coh) {
  const go = (e) => { e.preventDefault(); ctx.go('fill', { pass: 'profile' }); setTimeout(() => { const el = document.getElementById('accounts-card'); if (el) el.scrollIntoView(); }, 60); };
  if (coh.amount === null) {
    return h('p', { class: 'small', 'data-key': 'cash-on-hand' }, 'Cash on hand: not entered yet. It comes from account balances. ', h('a', { href: '#fill', onclick: go }, 'Enter balances in Profile'));
  }
  return h('p', { class: 'small', 'data-key': 'cash-on-hand' }, 'Cash on hand: ', h('b', { class: 'num' }, money(coh.amount)),
    ' from your balances (' + coh.parts.filter((p) => p.amount !== null).map((p) => p.name + ' ' + money(p.amount)).join(', ') + ')' + (coh.missing.length ? '; missing ' + coh.missing.join(', ') : '') + '. ',
    h('a', { href: '#fill', onclick: go }, 'Change in Profile'));
}
