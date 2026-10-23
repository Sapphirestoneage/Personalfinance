// A name you can tap and retype in place (categories, lines, tags), so the
// budget reads in the client's own words. An empty name keeps the old one.
// Saving goes through ctx.update with the caller's save(doc, name), a store edit. Built with dom.js.

import { h } from '../dom.js';

export function nameEdit(ctx, value, key, save, label = 'Name') {
  return h('input', {
    type: 'text', class: 'name-edit', value, 'aria-label': label, 'data-key': key, title: 'Tap to rename',
    onchange: (e) => {
      const v = e.target.value.trim();
      if (!v) { e.target.value = value; return; }
      if (v !== value) ctx.update('Rename', (d) => save(d, v));
    }
  });
}
