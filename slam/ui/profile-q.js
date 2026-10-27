// One Profile question, drawn the same way on the client's "Before our first call" page and on the coach's Profile
// page (Phase 2.5 B3). Taps only: one choice, several, or a picker for a year, a state or a date. "Not sure" is there
// on the client's page only (notSure: true); the Profile asks for an answer (owner's ask, 2026-10-27), and an old "Not
// sure" there reads as not answered yet. onAnswer(value) gets the new answer (null clears it). Formatting only: the questions are engine/profile.js.

import { h } from './view.js';
import { NOT_SURE, STATES } from '../engine/profile.js';

const nsBtn = (q, value, onAnswer) => h('button', { type: 'button', class: 'seg-btn q-notsure', 'aria-pressed': String(value === NOT_SURE), onclick: () => onAnswer(value === NOT_SURE ? null : NOT_SURE) }, h('span', { class: 'seg-label' }, 'Not sure'));

export function questionEl(q, raw, onAnswer, { idPrefix = 'pq', notSure = true } = {}) {
  const value = !notSure && raw === NOT_SURE ? null : raw;
  const ns = notSure ? nsBtn : () => null;
  const id = idPrefix + '-' + q.id;
  const label = h('p', { class: 'q-label', id: id + '-l' }, q.label);
  let body;
  if (q.kind === 'one') {
    // A scale (1 to 10) is five small buttons to a row, not ten rows.
    const tiny = q.options.every(([, w]) => w.length <= 2);
    body = h('div', { class: 'segmented q-seg' + (tiny ? ' q-scale' : '') }, ...q.options.map(([k, w]) => h('button', { type: 'button', id: id + '-' + k, class: 'seg-btn', 'aria-pressed': String(value === k), onclick: () => onAnswer(value === k ? null : k) }, h('span', { class: 'seg-label' }, w))), ns(q, value, onAnswer));
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
    const opts = q.kind === 'state' ? STATES.map((x) => [x, x]) : null;
    let input;
    if (q.kind === 'year') {
      // A year is a number box with a hint (Krug pass), not a 95-line list. Kept as typed; a year outside 1920 to
      // 2015 says so under the box and is not saved.
      input = h('input', { id, type: 'text', inputmode: 'numeric', autocomplete: 'bday-year', maxlength: '4', class: 'year-box', placeholder: 'e.g. 1994', 'aria-labelledby': id + '-l', 'aria-describedby': id + '-m' });
      input.value = typeof value === 'number' ? String(value) : '';
      const msg = h('p', { class: 'edit-msg', id: id + '-m', role: 'alert' });
      input.addEventListener('change', () => {
        const t = input.value.trim();
        if (!t) { msg.textContent = ''; onAnswer(null); return; }
        const y = /^\d{4}$/.test(t) ? +t : NaN;
        if (!(y >= 1920 && y <= 2015)) { msg.textContent = 'Type a year like 1994.'; return; }
        msg.textContent = ''; onAnswer(y);
      });
      body = h('div', { class: 'q-field' }, input, msg, (notSure ? h('div', { class: 'segmented q-seg' }, ns(q, value, onAnswer)) : null));
      return h('div', { class: 'q', role: 'group', 'aria-labelledby': id + '-l' }, label, body);
    }
    if (opts) {
      input = h('select', { id, class: 'pick-box', 'aria-labelledby': id + '-l', onchange: () => onAnswer(input.value === '' ? null : input.value) }, h('option', { value: '' }, 'Pick one'), ...opts.map(([k, w]) => h('option', { value: k, selected: String(value) === k }, w)));
    } else {
      input = h('input', { id, type: 'date', 'aria-labelledby': id + '-l' });
      input.value = typeof value === 'string' && value !== NOT_SURE ? value : '';
      input.addEventListener('change', () => onAnswer(input.value || null));
    }
    body = h('div', { class: 'q-field' }, input, (notSure ? h('div', { class: 'segmented q-seg' }, ns(q, value, onAnswer)) : null));
  }
  return h('div', { class: 'q', role: 'group', 'aria-labelledby': id + '-l' }, label, body);
}
