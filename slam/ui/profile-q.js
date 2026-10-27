// One Profile question, drawn the same way on the client's "Before our first call" page and on the coach's Profile
// page (Phase 2.5 B3). Taps only: one choice, several, or a picker for a year, a state or a date; "Not sure" is always
// there. onAnswer(value) gets the new answer (null clears it). Formatting only: the questions are engine/profile.js.

import { h } from './view.js';
import { NOT_SURE, STATES } from '../engine/profile.js';

const ns = (q, value, onAnswer) => h('button', { type: 'button', class: 'seg-btn q-notsure', 'aria-pressed': String(value === NOT_SURE), onclick: () => onAnswer(value === NOT_SURE ? null : NOT_SURE) }, h('span', { class: 'seg-label' }, 'Not sure'));

export function questionEl(q, value, onAnswer, { idPrefix = 'pq' } = {}) {
  const id = idPrefix + '-' + q.id;
  const label = h('p', { class: 'q-label', id: id + '-l' }, q.label);
  let body;
  if (q.kind === 'one') {
    body = h('div', { class: 'segmented q-seg' }, ...q.options.map(([k, w]) => h('button', { type: 'button', id: id + '-' + k, class: 'seg-btn', 'aria-pressed': String(value === k), onclick: () => onAnswer(value === k ? null : k) }, h('span', { class: 'seg-label' }, w))), ns(q, value, onAnswer));
  } else if (q.kind === 'many') {
    const list = Array.isArray(value) ? value : [];
    const flip = (k) => {
      if ((q.exclusive || []).includes(k)) return onAnswer(list.includes(k) ? null : [k]);
      let next = list.filter((x) => !(q.exclusive || []).includes(x));
      next = next.includes(k) ? next.filter((x) => x !== k) : [...next, k];
      if (q.max && next.length > q.max) next = next.slice(next.length - q.max);
      onAnswer(next.length ? next : null);
    };
    body = h('div', { class: 'segmented q-seg q-many' }, ...q.options.map(([k, w]) => h('button', { type: 'button', id: id + '-' + k, class: 'seg-btn', 'aria-pressed': String(list.includes(k)), onclick: () => flip(k) }, h('span', { class: 'seg-label' }, w))), ns(q, value, onAnswer));
  } else if (q.kind === 'text') {
    // A long answer (Why now) is a few lines; a short one is a name.
    const box = q.long ? h('textarea', { id, rows: '2', 'aria-labelledby': id + '-l', maxlength: '400' }) : h('input', { id, type: 'text', autocomplete: 'given-name', 'aria-labelledby': id + '-l', maxlength: '40' });
    box.value = typeof value === 'string' && value !== NOT_SURE ? value : '';
    box.addEventListener('change', () => onAnswer(box.value.trim() || null));
    body = h('div', { class: 'q-field' }, box);
  } else {
    const opts = q.kind === 'year' ? Array.from({ length: 2015 - 1920 + 1 }, (_, i) => 2015 - i).map((y) => [String(y), String(y)]) : q.kind === 'state' ? STATES.map((x) => [x, x]) : null;
    let input;
    if (opts) {
      input = h('select', { id, class: 'pick-box', 'aria-labelledby': id + '-l', onchange: () => onAnswer(input.value === '' ? null : q.kind === 'year' ? +input.value : input.value) }, h('option', { value: '' }, 'Pick one'), ...opts.map(([k, w]) => h('option', { value: k, selected: String(value) === k }, w)));
    } else {
      input = h('input', { id, type: 'date', 'aria-labelledby': id + '-l' });
      input.value = typeof value === 'string' && value !== NOT_SURE ? value : '';
      input.addEventListener('change', () => onAnswer(input.value || null));
    }
    body = h('div', { class: 'q-field' }, input, h('div', { class: 'segmented q-seg' }, ns(q, value, onAnswer)));
  }
  return h('div', { class: 'q', role: 'group', 'aria-labelledby': id + '-l' }, label, body);
}
