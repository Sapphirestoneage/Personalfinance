// Owning vs the alternative (S-113): one card per home or vehicle, read-only. Its equity (it counts
// in net worth), what it costs a month that you never get back, and the alternative, side by side.
// Descriptive only: no verdicts, no "you should". Numbers from calc/owning.js; the inputs are in
// Setup, Accounts (each asset's details) and Setup, Cushion and coach settings (the return).

import { h } from '../dom.js';
import { money } from '../format.js';
import { owningCosts } from '../../engines/owning.js';
import { jumpLink } from '../components/jump.js';
import { statusChip } from '../components/status.js';
import { todayIso } from '../format.js';

const FROM = { budget: 'from your budget', guess: 'Guess', debt: 'from the debt', values: 'from its values', assumption: 'assumption' };

function owningCard(ctx, x) {
  const row = (label, amount, from, note, key) => h('li', { class: 'small', 'data-key': key },
    h('span', { style: 'flex:1 1 180px' }, label, h('div', { class: 'xs muted' }, from === 'guess' ? statusChip('guess', note) : null, ' ', from === 'guess' ? note : [FROM[from] || '', note ? ': ' + note : ''].join(''))),
    h('b', { class: 'num' }, amount === null ? 'not set' : money(amount, true)));
  return h('div', { class: 'card', id: 'owning-' + x.id },
    h('h3', {}, x.name + ': owning vs the alternative'),
    h('div', { class: 'strip three' },
      h('div', { class: 'tile' }, h('div', { class: 'label' }, 'Equity (counts in net worth)'), h('div', { class: 'value', 'data-key': 'own-equity:' + x.id }, money(x.equity)), h('div', { class: 'sub' }, 'value ' + money(x.value) + (x.debt ? ' less ' + x.debt.name + ' ' + money(x.debt.balance) : ''))),
      h('div', { class: 'tile' }, h('div', { class: 'label' }, 'Never get back, a month'), h('div', { class: 'value', 'data-key': 'own-never:' + x.id }, money(x.neverBack)), h('div', { class: 'sub' }, x.missing.length ? 'not counting ' + x.missing.join(', ').toLowerCase() : 'every part below')),
      h('div', { class: 'tile' }, h('div', { class: 'label' }, x.type === 'home' ? 'Renting a similar place' : 'Your trips without it'), h('div', { class: 'value', 'data-key': 'own-alt:' + x.id }, x.alternative.set ? money(x.alternative.amount) : 'not set'), h('div', { class: 'sub' }, 'a month'))),
    h('ul', { class: 'plain', 'data-key': 'own-parts:' + x.id }, x.parts.map((p) => row(p.label, p.amount, p.from, p.note, 'own-part:' + x.id + ':' + p.key))),
    x.type === 'home' && x.debt && x.debt.principal !== null ? h('p', { class: 'small' }, 'Of the ' + money(x.debt.payment) + ' payment, ' + money(x.debt.principal) + ' builds equity a month.' + (x.hold && x.hold.total !== null ? ' To hold it in all: ' + money(x.hold.total) + ' a month (every Housing line and the payment).' : '')) : null,
    x.type === 'vehicle' && x.alternative.set ? h('ul', { class: 'plain xs muted' }, x.alternative.parts.filter((p) => p.amount !== null).map((p) => h('li', {}, h('span', {}, p.label), h('span', { class: 'num' }, money(p.amount))))) : null,
    ctx.role !== 'client' && x.notes ? h('p', { class: 'small', 'data-key': 'own-notes:' + x.id }, h('b', {}, 'Coach notes: '), x.notes) : null,
    h('p', { class: 'reading' }, x.reading),
    h('p', { class: 'xs' }, jumpLink(ctx, 'balances', 'Change this in Setup', 'own-go:' + x.id)));
}

export function owningCards(ctx, s) {
  const list = owningCosts(ctx.doc, s, todayIso());
  return list.map((x) => owningCard(ctx, x));
}
