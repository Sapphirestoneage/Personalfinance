// Fill in, pass 5 Accounts (S-103): every account in one place (bank and cash,
// credit cards, investments and retirement, other), with what you have against
// what you owe, and each account's balances for the month being worked on.
// Numbers come from calc (accountsOverview); this screen only lays them out.

import { h } from '../dom.js';
import { money, monthLabel } from '../format.js';
import { accountsCard } from '../components/accounts.js';
import { accountsOverview } from '../../calc/balances.js';

function overviewCard(ctx) {
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
    h('p', { class: 'xs muted' }, 'Other debts (loans and the rest) are in Basics. Latest balance: the month\'s end, or its start until the end is in.'));
}

export function renderAccounts(ctx) {
  return h('div', {}, overviewCard(ctx), accountsCard(ctx, ctx.doc.currentMonth));
}
