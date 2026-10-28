// The small typed boxes every fast-entry screen uses (the Session, the count-first rows, onboarding): a money box, a
// whole-number box, a rate box, a text box and a pick list. Blank is missing (never $0). A box saves after the
// browser has moved the focus on (Tab, Enter), so the redraw keeps the focus on the next box; a value it cannot read
// is said in the bar and the box keeps the focus. Formatting only.

import { say } from './shell.js';
import { parseInput, inputText } from '../engine/edits.js';
import { h } from './view.js';

export const later = (fn) => setTimeout(fn, 0);
// What a box holds is selected when the focus lands in it (Tab, Enter, a tap), so typing replaces it.
const selectOnFocus = (box) => { box.addEventListener('focus', () => { if (box.value) box.select(); }); return box; };

export function moneyBox(id, value, label, onSet, placeholder = '$') {
  const box = h('input', { id, class: 'amt', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder, 'aria-label': label });
  box.value = inputText('money', value);
  box.addEventListener('change', () => {
    const t = box.value.trim();
    if (t === '') { later(() => onSet(null)); return; }
    const p = parseInput('money', t);
    if (!p.ok) { say(label + ': ' + p.message); box.focus(); return; }
    later(() => onSet(p.value));
  });
  return selectOnFocus(box);
}
export function intBox(id, value, label, onSet, { placeholder = 'day', min = 1, max = 31 } = {}) {
  const box = h('input', { id, class: 'day-box', type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder, 'aria-label': label });
  box.value = value === null || value === undefined ? '' : String(value);
  box.addEventListener('change', () => {
    const t = box.value.trim();
    if (t === '') { later(() => onSet(null)); return; }
    const p = parseInput('int', t);
    if (!p.ok || p.value < min || p.value > max) { say(label + ': a whole number from ' + min + ' to ' + max); box.focus(); return; }
    later(() => onSet(p.value));
  });
  return selectOnFocus(box);
}
// 25 means 25%.
export function rateBox(id, value, label, onSet) {
  const box = h('input', { id, class: 'rate-box', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '%', 'aria-label': label });
  box.value = inputText('rate', value);
  box.addEventListener('change', () => {
    const t = box.value.trim();
    if (t === '') { later(() => onSet(null)); return; }
    const p = parseInput('rate', t);
    if (!p.ok || p.value > 1) { say(label + ': ' + (p.ok ? 'a percent, like 24.99' : p.message)); box.focus(); return; }
    later(() => onSet(p.value));
  });
  return selectOnFocus(box);
}
export function textBox(id, value, label, onSet, placeholder = '') {
  const box = h('input', { id, class: 'text-box', type: 'text', autocomplete: 'off', placeholder, 'aria-label': label });
  box.value = value === null || value === undefined ? '' : String(value);
  box.addEventListener('change', () => { const t = box.value.trim(); later(() => onSet(t || null)); });
  return selectOnFocus(box);
}
export const pickBox = (id, label, options, value, onPick) => {
  const s = h('select', { id, class: 'pick-box', 'aria-label': label, onchange: () => onPick(s.value) }, options.map(([val, words]) => h('option', { value: val, selected: val === value }, words)));
  return s;
};
