// Expenses attached to a card (owner's ask, 2026-10-27): the card's screen lists what is charged to it, with Remove,
// and attaches another expense; a Spending line picks what it is paid with. Both write the expense's Paid from
// (engine/edits.js chargeTo), the one field that owns the link. Formatting only.

import { change } from './shell.js';
import { chargeTo } from '../engine/edits.js';
import { linkOptions, cardCharges } from '../engine/ledger.js';
import { valueOf as v } from '../engine/spine.js';
import { h, money, ledgerHref } from './view.js';

const today = () => new Date().toISOString().slice(0, 10);
const nameOf = (spine, id) => { const x = [...(spine.accounts || []), ...(spine.debts || [])].find((a) => a.id === id); return x ? v(x.name) || id : id; };
const perMonth = (m) => (m === null ? 'no amount yet' : money(m) + ' a month');

// The card screen's section: each attached expense on one line, then a picker to attach another. What is open stays
// open when a change redraws the screen.
const openNow = new Set();
export function chargesCard(spine, cardId) {
  const card = nameOf(spine, cardId);
  const { items: on, total } = cardCharges(spine, cardId);
  const off = (spine.expenses || []).filter((e) => !on.some((x) => x.id === e.id));
  const pick = h('select', { id: 'charge-pick', class: 'pick-box', 'aria-label': 'Expense to put on ' + card },
    h('option', { value: '' }, 'Pick an expense'),
    off.map((e) => h('option', { value: e.id }, e.label + (e.paidFrom && v(e.paidFrom) ? ' (now ' + nameOf(spine, v(e.paidFrom)) + ')' : ''))));
  const attach = () => { const id = pick.value; if (!id) return; const e = off.find((x) => x.id === id); change((s) => chargeTo(s, id, cardId, today()), e.label + ' now charged to ' + card); };
  // One line that opens (Krug pass): how many and how much a month; the list and the picker inside.
  return h('details', { class: 'card charges done-group', open: openNow.has(cardId) || null, ontoggle: (e) => { if (e.target.open) openNow.add(cardId); else openNow.delete(cardId); } },
    h('summary', { id: 'charges-h' }, h('span', {}, 'Charged to this card'), h('span', { class: 'count' }, on.length ? on.length + (total === null ? '' : ', ' + money(total) + ' a month') : 'none')),
    on.length ? h('p', { class: 'muted' }, total === null ? 'No amounts entered yet.' : money(total) + ' a month of planned spending goes on it.') : h('p', { class: 'muted' }, 'Nothing attached yet. Attach the bills and spending you put on this card.'),
    on.length ? h('ul', { class: 'charge-list' }, on.map((e) => h('li', { class: 'charge-line' },
      h('a', { class: 'charge-name', href: ledgerHref(e.path) }, e.label),
      h('span', { class: 'charge-amt' }, perMonth(e.monthly)),
      h('button', { type: 'button', class: 'btn small', 'aria-label': 'Take ' + e.label + ' off ' + card, onclick: () => change((s) => chargeTo(s, e.id, null, today()), e.label + ' taken off ' + card) }, 'Remove')))) : null,
    off.length ? h('div', { class: 'charge-add' }, h('label', { for: 'charge-pick', class: 'edit-label' }, 'Attach an expense'), h('div', { class: 'charge-add-row' }, pick, h('button', { type: 'button', class: 'btn small primary', onclick: attach }, 'Attach'))) : null);
}

// A Spending line's "Paid with": an account or a card, changed in place.
export function paidWithBox(spine, expenseId) {
  const e = (spine.expenses || []).find((x) => x.id === expenseId);
  if (!e) return null;
  const now = e.paidFrom ? v(e.paidFrom) : null;
  const opts = linkOptions(spine, 'link:cash|card');
  const groups = [...new Set(opts.map((o) => o.group))];
  const box = h('select', { id: 'paid-with', class: 'pick-box', onchange: () => change((s) => chargeTo(s, e.id, box.value || null, today()), box.value ? e.label + ' now paid with ' + nameOf(spine, box.value) : e.label + ': paid with cleared') },
    h('option', { value: '', selected: now === null }, 'Not given yet'),
    groups.map((g) => h('optgroup', { label: g }, opts.filter((o) => o.group === g).map((o) => h('option', { value: o.value, selected: o.value === now }, o.label)))));
  return h('div', { class: 'paid-with' }, h('label', { for: 'paid-with', class: 'edit-label' }, 'Paid with'), box);
}
