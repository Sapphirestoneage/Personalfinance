// Accounts and their balances for one month (S-084): name, type, start, end.
// A start that was not typed shows last month's end, "carried from last
// month", and typing a number replaces it. Set up once and updated at
// month-end (Setup, Accounts). Numbers come from calc/balances.js; this file only lays them out.

import { h, options } from '../dom.js';
import { money, monthLabel, todayIso, dayLabel } from '../format.js';
import { valueInput } from './value-input.js';
import { nameEdit } from './name-edit.js';
import { addAccount, setBalance, setAccountField, setBalanceDate, addCardAccounts, setPurchase, setAlternative, setAccountNotes } from '../../store/accounts.js';
import { balancesFor, cardMap, ACCOUNT_GROUPS, liabilities, monthBalance, kindOf, balanceAt } from '../../calc/balances.js';
import { netWorthAt, LABELS as NW_LABELS } from '../../calc/networth.js';
import { jumpLink } from './jump.js';
import { ACCOUNT_TYPE_INFO, ACCOUNT_TYPES, SECURED_TYPES, ALTERNATIVES } from '../../store/schema.js';

export const ACCOUNT_TYPE_OPTIONS = ACCOUNT_TYPES.map((t) => [t, ACCOUNT_TYPE_INFO[t].label]);
const TIER_OPTIONS = [['1', '1: cash now'], ['2', '2: can sell within days'], ['3', '3: retirement, with a penalty or rules'], ['4', '4: not liquid (a home, a car)']];
// The quick ones get a button; every other type is one pick away (S-110).
const QUICK_TYPES = ['checking', 'savings', 'credit-card'];

// A balance box writes through setBalance (the month and account may be new).
function balanceInput(ctx, month, acct, which, stored, label) {
  const sub = { ...ctx, preview: null, commit: (path, value, l) => ctx.update(l || label, (d) => setBalance(d, month, acct.id, which, value)) };
  // A home's or vehicle's value is "roughly" unless said otherwise (S-110): it comes from an estimate.
  return valueInput(sub, ['balances', month, acct.id, which], stored, { label, cadence: false, typed: acct.type && kindOf(acct) === 'valued' ? 'roughly' : undefined });
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
      latestLine(ctx, a.id),
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
      linked ? h('div', { class: 'hint' }, 'APR, minimum, and due day stay on the debt "' + linked.label + '".') : null,
      a.type === 'credit-card' ? null : accountDetails(ctx, a)),
    h('div', { class: 'balance-pair' },
      h('div', {}, h('div', { class: 'xs muted' }, 'Start balance'), balanceInput(ctx, month, a, 'start', stored(a.id, 'start'), a.name + ' start'), balanceDate(ctx, month, a, 'start'),
        r.start.from === 'carried' ? h('div', { class: 'xs muted', 'data-key': 'carried:' + a.id }, 'Carried from last month: ' + money(r.start.amount, true)) : null),
      h('div', {}, h('div', { class: 'xs muted' }, 'End balance'), balanceInput(ctx, month, a, 'end', stored(a.id, 'end'), a.name + ' end'), balanceDate(ctx, month, a, 'end'))));
}

// Liquidity tier, counts toward FI, and for a home or vehicle its purchase and the debt it secures (S-110).
function accountDetails(ctx, a) {
  const key = 'acct-more:' + a.id;
  const open = ctx.ui.expanded.has(key);
  const secured = a.securedDebtId ? ctx.doc.debts.find((d) => d.id === a.securedDebtId) : null;
  const toggle = h('button', { class: 'btn small ghost', 'data-key': key, 'aria-expanded': open ? 'true' : 'false', onclick: () => { if (open) ctx.ui.expanded.delete(key); else ctx.ui.expanded.add(key); ctx.rerender(); } },
    (open ? 'Fewer details' : 'Details') + ': tier ' + a.tier + ', ' + (a.countsForFI ? 'counts' : 'does not count') + ' toward FI' + (secured ? ', ' + secured.label : ''));
  if (!open) return toggle;
  const sub = { ...ctx, preview: null };
  return h('div', { class: 'acct-details' }, toggle,
    h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'How fast it becomes cash'),
      h('select', { 'data-key': 'acct:' + a.id + ':tier', onchange: (e) => ctx.update('Liquidity tier', (d) => setAccountField(d, a.id, 'tier', Number(e.target.value))) }, options(TIER_OPTIONS, String(a.tier)))),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: a.countsForFI, 'data-key': 'acct:' + a.id + ':fi',
      onchange: (e) => ctx.update('Counts toward FI', (d) => setAccountField(d, a.id, 'countsForFI', e.target.checked)) }), 'Counts toward FI net worth (money that can fund your life)'),
    SECURED_TYPES.includes(a.type) ? h('div', {},
      h('label', { class: 'field' }, h('span', { class: 'lbl' }, a.type === 'home' ? 'The mortgage on it' : 'The loan on it'),
        h('select', { 'data-key': 'acct:' + a.id + ':secured', onchange: (e) => ctx.update('Secured debt', (d) => setAccountField(d, a.id, 'securedDebtId', e.target.value || null)) },
          options([['', 'None'], ...ctx.doc.debts.filter((x) => x.state !== 'archived').map((x) => [x.id, x.label])], a.securedDebtId || ''))),
      h('div', { class: 'xs muted' }, 'What is owed, the APR, and the payment stay on the debt; the ' + (a.type === 'home' ? 'home' : 'vehicle') + ' keeps its value.'),
      h('div', { class: 'row' }, h('span', { class: 'small' }, 'Bought for (optional)'),
        valueInput({ ...sub, commit: (path, value) => ctx.update('Purchase price', (d) => setPurchase(d, a.id, 'price', value)) }, ['accounts', a.id, 'purchasePrice'], a.purchasePrice, { label: a.name + ' purchase price', cadence: false }),
        h('input', { type: 'date', 'aria-label': a.name + ' purchase date', 'data-key': 'acct:' + a.id + ':bought', value: a.purchaseDate.date || '',
          onchange: (e) => ctx.update('Purchase date', (d) => setPurchase(d, a.id, 'date', e.target.value || null)) }))) : null,
    // The alternative to owning it, a month (S-113), for "Owning vs the alternative" in Insights.
    ALTERNATIVES[a.type] ? h('div', {}, h('div', { class: 'field-label' }, a.type === 'home' ? 'The alternative: renting a similar place' : 'The alternative: your trips without it'),
      ALTERNATIVES[a.type].map((k) => h('div', { class: 'row' }, h('span', { class: 'small' }, ALT_LABELS[k]),
        valueInput({ ...sub, commit: (path, value) => ctx.update(ALT_LABELS[k], (d) => setAlternative(d, a.id, k, value)) }, ['accounts', a.id, k], a[k], { label: a.name + ' ' + ALT_LABELS[k].toLowerCase(), cadence: false, placeholder: '$ / month' })))) : null,
    a.notes !== undefined && ctx.role !== 'client' ? h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Coach notes (only you see these)'),
      h('textarea', { 'data-key': 'acct:' + a.id + ':notes', value: a.notes, onchange: (e) => ctx.update('Notes', (d) => setAccountNotes(d, a.id, e.target.value)) })) : null);
}
const ALT_LABELS = { rentAlt: 'Rent a month', rideshareAlt: 'Rideshare a month', transitAlt: 'Transit a month', rentalAlt: 'An occasional rental, a month' };

// A debt with no card account keeps its own dated balances (S-110): what is owed at the start and end.
function debtRow(ctx, month, l, stored) {
  const r = monthBalance(ctx.doc, month, l.key);
  const fake = { id: l.key, name: l.name };
  return h('div', { class: 'qa account-row', 'data-key': 'debt-row:' + l.key },
    h('div', { class: 'q' }, h('div', {}, l.name), latestLine(ctx, l.key), h('div', { class: 'hint' }, 'What is owed. APR and payment are in Setup, Debts.')),
    h('div', { class: 'balance-pair' },
      h('div', {}, h('div', { class: 'xs muted' }, 'Start balance'), balanceInput(ctx, month, fake, 'start', stored(l.key, 'start'), l.name + ' start'), balanceDate(ctx, month, fake, 'start'),
        r.start.from === 'carried' ? h('div', { class: 'xs muted' }, 'Carried from last month: ' + money(r.start.amount, true)) : null),
      h('div', {}, h('div', { class: 'xs muted' }, 'End balance'), balanceInput(ctx, month, fake, 'end', stored(l.key, 'end'), l.name + ' end'), balanceDate(ctx, month, fake, 'end'))));
}

export function accountsCard(ctx, month, opts = {}) {
  const doc = ctx.doc;
  const b = balancesFor(doc, month);
  const stored = (id, which) => (((doc.balances[month] || {})[id] || {})[which]) || { amount: null, cadence: 'one-off', status: null, source: 'client', asOf: null, note: '' };
  const archived = doc.accounts.filter((a) => a.state === 'archived');
  const add = (type) => {
    let id;
    ctx.update('Add account', (d) => { id = addAccount(d, { name: ACCOUNT_TYPE_INFO[type].label, type }).id; });
    if (id) { ctx.ui.focusKey = 'acct:' + id + ':name'; ctx.rerender(); }
  };
  return h('div', { class: 'card', id: 'accounts-card' },
    h('h2', {}, opts.title || 'Accounts and balances, ' + monthLabel(month)),
    h('p', { class: 'muted small' }, 'Every account: bank, cash, cards, investments, retirement, and the things you own. A card\'s or loan\'s balance is what is owed. A start you leave blank is last month\'s end.'),
    // Grouped (S-103): bank and cash, cards, investments and retirement, other; empty groups are left out.
    ACCOUNT_GROUPS.map(([gid, glabel, types]) => {
      const rows = b.rows.filter((r) => types.includes(r.type));
      return rows.length ? [h('h3', { 'data-key': 'acct-group:' + gid }, glabel), rows.map((r) => accountRow(ctx, month, r, stored))] : null;
    }),
    (() => {
      const debts = liabilities(doc).filter((l) => !l.account);
      return debts.length ? [h('h3', { 'data-key': 'acct-group:debts' }, 'Loans and other debts'), debts.map((l) => debtRow(ctx, month, l, stored))] : null;
    })(),
    b.rows.length ? h('p', { class: 'small' }, 'Cash (checking, savings, cash): start ', h('b', { class: 'num' }, money(b.cashStart)), ', end ', h('b', { class: 'num' }, money(b.cashEnd)),
      b.rows.some((r) => r.card) ? h('span', {}, '. Cards owed: start ', h('b', { class: 'num' }, money(b.cardsStart)), ', end ', h('b', { class: 'num' }, money(b.cardsEnd))) : null) : h('p', { class: 'muted small' }, 'No accounts yet.'),
    cardsBlock(ctx, month),
    h('div', { class: 'row' }, QUICK_TYPES.map((type) => h('button', { class: 'btn small', 'data-key': 'add-acct-' + type, onclick: () => add(type) }, '+ ' + ACCOUNT_TYPE_INFO[type].label)),
      h('select', { class: 'add-select', 'aria-label': 'Add another kind of account', 'data-key': 'add-acct-type', onchange: (e) => { if (e.target.value) add(e.target.value); } },
        options([['', '+ Another kind'], ...ACCOUNT_TYPE_OPTIONS.filter(([t]) => !QUICK_TYPES.includes(t))], ''))),
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

// One line at the top of Setup, Accounts (S-114): the two net worths, which live in Insights, Net worth.
export function netWorthCard(ctx) {
  if (!ctx.doc.accounts.length && !ctx.doc.debts.length) return null;
  const nw = netWorthAt(ctx.doc, todayIso());
  return h('div', { class: 'card spread', id: 'networth-line' },
    h('span', { class: 'small' }, NW_LABELS.total + ': ', h('b', { class: 'num', 'data-key': 'nw-line-total' }, money(nw.total)), '. ', NW_LABELS.fi + ': ', h('b', { class: 'num', 'data-key': 'nw-line-fi' }, money(nw.fi)), '.'),
    jumpLink(ctx, 'insights:networth', 'See Net worth in Insights', 'nw-line-go'));
}

// The latest balance and the day it was read (S-114), for every account and debt.
function latestLine(ctx, key) {
  const b = balanceAt(ctx.doc, key, todayIso());
  return h('div', { class: 'xs muted', 'data-key': 'latest:' + key }, b ? 'Latest: ' + money(b.amount, true) + (b.date ? ' on ' + dayLabel(b.date) : ' (as given on the debt)') : 'No balance yet');
}

// One line for Next stage and Eras: cash on hand, read-only, with a link to where it is typed.
export function cashOnHandNote(ctx, coh) {
  const go = (e) => { e.preventDefault(); ctx.jump('balances'); };
  if (coh.amount === null) {
    return h('p', { class: 'small', 'data-key': 'cash-on-hand' }, 'Cash on hand: not entered yet. It comes from account balances. ', h('a', { href: '#setup', onclick: go }, 'Enter balances in Setup'));
  }
  return h('p', { class: 'small', 'data-key': 'cash-on-hand' }, 'Cash on hand: ', h('b', { class: 'num' }, money(coh.amount)),
    ' from your balances (' + coh.parts.filter((p) => p.amount !== null).map((p) => p.name + ' ' + money(p.amount)).join(', ') + ')' + (coh.missing.length ? '; missing ' + coh.missing.join(', ') : '') + '. ',
    h('a', { href: '#setup', onclick: go }, 'Change in Setup'));
}
