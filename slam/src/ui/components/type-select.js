// "Counts as" for a category and "Type" for a line: the standard type the
// math and tracking follow, while the name stays the client's own (S-068).

import { h, options } from '../dom.js';
import { CATEGORY_TYPES, LINE_TYPES } from '../../store/types.js';
import { findCategory, setLineType } from '../../store/edits.js';

export function categoryTypeSelect(ctx, cat, opts = {}) {
  return h('label', { class: 'field type-field' }, h('span', { class: 'lbl' }, opts.label || 'Counts as'),
    h('select', { 'data-key': 'cat:' + cat.id + ':type', onchange: (e) => ctx.update('Counts as', (d) => { findCategory(d, cat.id).type = e.target.value; }) },
      options(CATEGORY_TYPES, cat.type)));
}

export function lineTypeSelect(ctx, line, opts = {}) {
  return h('label', { class: 'field type-field' }, h('span', { class: 'lbl' }, opts.label || 'Type (for tracking)'),
    h('select', { 'data-key': 'line:' + line.id + ':type', onchange: (e) => ctx.update('Line type', (d) => setLineType(d, line.id, e.target.value)) },
      options(LINE_TYPES.map(([id, label]) => [id, label]), line.type)));
}

// Small grey label under a name when the name does not already say it.
export function typeHint(label, name) {
  return label && label.toLowerCase() !== String(name).toLowerCase() ? h('div', { class: 'xs muted' }, label) : null;
}
