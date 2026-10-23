// Status chip (read-only) and status picker (editable). Status is always visible.
// Labels come from STATUS_LABELS in format.js; the chip class st-<status> picks the color. Built with dom.js.

import { h, options } from '../dom.js';
import { STATUS_LABELS } from '../format.js';

export function statusChip(status, title) {
  // Not entered (null, or a missing field) is its own chip, Blank: empty is not zero.
  const key = status === null || status === undefined ? 'blank' : status;
  return h('span', { class: 'chip st-' + key, title: title || null }, STATUS_LABELS[status === undefined ? null : status]);
}

// What a person can pick. Guess (an app average) and Computed (worked out by an engine from the log, a share, or
// the debts) are set by the app, so each is offered only while it is the current status, to keep the select
// showing the right value.
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
