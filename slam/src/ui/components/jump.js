// A link to the one home of something (S-106): a screen, a tab, a section, or a
// field. Every "Change this in Plan" and "Fix" uses it, so they all land the same way.
// destination (nav.js) names the screen behind a place; ctx.jump does the landing, opening and scrolling on the way.

import { h } from '../dom.js';
import { destination } from '../nav.js';

// The href is the real screen hash, so the link reads right when hovered or copied; a click goes through ctx.jump instead.
export function jumpLink(ctx, where, text, key) {
  return h(
    'a',
    {
      href: '#' + destination(where)[0],
      'data-key': key || 'go-' + where,
      onclick: (e) => {
        e.preventDefault();
        ctx.jump(where);
      }
    },
    text
  );
}

export function jumpButton(ctx, where, text, key, cls = 'btn small') {
  return h('button', { class: cls, 'data-key': key || 'go-' + where, onclick: () => ctx.jump(where) }, text);
}

// "Change this in Plan": under a read-only chart whose numbers are edited elsewhere.
export function changeIn(ctx, where, label) {
  return h('p', { class: 'xs muted change-in' }, jumpLink(ctx, where, 'Change this in ' + label));
}

// An empty state: what to do next, in one sentence, with a button.
export function emptyState(ctx, sentence, where, button, key) {
  return h(
    'div',
    { class: 'empty-state row' },
    h('span', { class: 'small' }, sentence),
    jumpButton(ctx, where, button, key)
  );
}
