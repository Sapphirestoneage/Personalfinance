// Whose an item is (Batch 7, S-277; on every item screen, S-279): both first names and Joint (income is never joint),
// as one small set of buttons, the one that applies pressed. A couple only; one person sees nothing.

import { h } from './view.js';
import { isCouple, peopleOf, whoseOf } from '../engine/couple.js';

export const firstName = (p) => String((p && p.name) || '').trim().split(/\s+/)[0] || 'Partner';
export function whoseChoices(spine, coll) {
  const [a, b] = peopleOf(spine);
  const o = [['me', firstName(a)], ['partner', firstName(b)]];
  return coll === 'income' ? o : [...o, ['joint', 'Joint']];
}
// onPick(who, words): the page saves it through its change(), so Undo takes it back.
export function whoseControl(spine, coll, item, onPick, { id = 'whose-' + item.id } = {}) {
  if (!isCouple(spine)) return null;
  const now = whoseOf(spine, coll, item);
  return h('div', { class: 'whose-pick' },
    h('p', { class: 'mini-label', id }, 'Whose'),
    h('div', { class: 'segmented whose-seg', role: 'group', 'aria-labelledby': id }, whoseChoices(spine, coll).map(([k, words]) =>
      h('button', { type: 'button', class: 'seg-btn', 'aria-pressed': String(now === k), onclick: () => { if (now !== k) onPick(k, words); } }, h('span', { class: 'seg-label' }, words)))));
}
