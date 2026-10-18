// Status chip (read-only) and status picker (editable). Status is always visible.

import { h, options } from '../dom.js';
import { STATUS_LABELS } from '../format.js';

export function statusChip(status, title) {
  const key = status === null || status === undefined ? 'blank' : status;
  return h('span', { class: 'chip st-' + key, title: title || null }, STATUS_LABELS[status === undefined ? null : status]);
}

const PICKABLE = ['known', 'roughly', 'will-email', 'dont-know', 'not-for-me'];

export function statusPicker(status, onChange, key) {
  const list = [[ '', 'Blank' ], ...PICKABLE.map((s) => [s, STATUS_LABELS[s]])];
  if (status === 'guess') list.push(['guess', 'Guess']);
  if (status === 'computed') list.push(['computed', 'Computed']);
  const sel = h('select', {
    class: 'chip st-' + (status || 'blank'), 'aria-label': 'Status, tap to change', title: 'Tap to change', 'data-key': key ? key + ':status' : null,
    onchange: (e) => onChange(e.target.value || null)
  }, options(list, status || ''));
  // A caret says it can be changed (S-121).
  return h('span', { class: 'chip-pick' }, sel);
}
