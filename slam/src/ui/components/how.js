// Jump to source (S-108). A number that comes from somewhere else is a link to
// that place; a computed number opens a small "how this was worked out" panel
// listing its inputs (from engines/explain.js), each a link to where it is entered.
// Builds on dom and format. Landing goes through ctx.goToField (a field path) or ctx.jump (a place in nav.js);
// which panel is open lives in ctx.ui.how.

import { h } from '../dom.js';
import { money, pct, signedMoney } from '../format.js';

// target: { where } (a place in nav.js), { path } (a field), and optionally { open } (a row to open on arrival).
// { ui } sets screen state (a tab, a picked month) before the jump. A path wins over a where when both are given.
export function goSource(ctx, target) {
  if (target.open) ctx.ui.expanded.add(target.open);
  if (target.ui) Object.assign(ctx.ui, target.ui);
  if (target.path) return ctx.goToField(target.path);
  ctx.jump(target.where);
}

// No target: the plain text comes back, so a caller can pass null for a value with nothing to open.
export function sourceLink(ctx, text, target, key) {
  if (!target) return text;
  return h('a', { href: '#', class: 'src-link', 'data-key': key || null, title: 'Open where this comes from', onclick: (e) => { e.preventDefault(); goSource(ctx, target); } }, text);
}

// The number itself, as a button that opens (or closes) its panel.
// One panel at a time: ctx.ui.how holds the key of the open one, and tapping the same number again closes it.
export function howButton(ctx, key, text) {
  const open = ctx.ui.how === key;
  return h('button', { class: 'how-btn', 'data-key': 'how:' + key, 'aria-expanded': open ? 'true' : 'false', title: 'How this was worked out',
    onclick: () => { ctx.ui.how = open ? null : key; ctx.rerender(); } }, text);
}

// ex is what explain (engines/explain.js) returns: steps, a result, a note. Steps are plain dollars, a negative one
// with a minus sign in front; the result may be a percent (savings rate) or signed (so far, expected, surplus or
// shortfall). Each step is its own link target, since explain puts where, path, or open on it.
export function howPanel(ctx, ex) {
  if (!ex) return null;
  const fmt = (x, isPct, signed) => (x === null || x === undefined ? 'not entered' : isPct ? pct(x) : signed ? signedMoney(x, true) : (x < 0 ? '-' + money(-x, true) : money(x, true)));
  return h('div', { class: 'card how-panel', id: 'how-panel', role: 'region', 'aria-label': ex.title },
    h('div', { class: 'spread' }, h('b', {}, 'How this was worked out: ' + ex.title), h('button', { class: 'btn small ghost', 'data-key': 'how-close', onclick: () => { ctx.ui.how = null; ctx.rerender(); } }, 'Close')),
    h('ul', { class: 'plain' },
      ex.steps.map((st, i) => h('li', { class: 'small' }, sourceLink(ctx, st.label, st, 'how-step-' + i), h('span', { class: 'num' }, fmt(st.amount)))),
      h('li', { class: 'small total' }, h('b', {}, ex.result.label), h('b', { class: 'num', 'data-key': 'how-result' }, fmt(ex.result.amount, ex.result.pct, ex.result.signed)))),
    h('p', { class: 'xs muted' }, ex.note));
}
