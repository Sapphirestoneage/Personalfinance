// "Show the math" (S-177): a button that opens a panel with the formula in
// words, the same formula with the numbers plugged in, every input as a link
// (a Ledger field opens it; a computed number opens its own math; a rule opens
// math.html), the inputs grouped by DAITE with subtotals, kind chips, and why
// the number is rough. Everything shown comes from engine/math.js.

import { explainMetric, showNumber } from '../engine/math.js';
import { h, chip, ledgerHref } from './view.js';

const KIND_TEXT = { known: 'known', rough: 'rough', missing: 'missing', computed: 'computed', incomplete: 'incomplete', notForMe: 'not for me' };

function termEl(t, ctx, depth) {
  const value = h('span', { class: 'math-value' }, (t.role === 'minus' ? '- ' : '') + showNumber(t.value, t.unit, t.kind));
  const label = t.path ? h('a', { href: ledgerHref(t.path), title: 'Open it in My numbers' }, t.label)
    : t.rule ? h('a', { href: 'math.html#rule-' + t.rule, title: 'See this rule' }, t.label) : h('span', {}, t.label);
  const li = h('li', { class: 'math-term' }, chip(t.kind), ' ', label, ' ', value);
  if (t.metric && depth < 6) li.append(mathButton([t.metric], ctx, depth + 1, 'Show the math for ' + t.label));
  return li;
}

function panel(ids, ctx, depth) {
  return h('div', { class: 'math-panel depth-' + depth },
    ...ids.map((id) => {
      const e = explainMetric(id, ctx);
      if (!e) return null;
      return h('section', { class: 'math-metric', 'aria-label': e.label },
        h('p', { class: 'math-head' }, h('strong', {}, e.label), ' ', chip(e.kind === 'computed' ? 'known' : e.kind)),
        h('p', { class: 'math-formula' }, e.formula),
        h('p', { class: 'math-plugged' }, h('code', {}, e.plugged)),
        e.note ? h('p', { class: 'math-note' }, e.note) : null,
        e.roughBecause.length ? h('p', { class: 'math-why' }, 'This number is rough because: ' + e.roughBecause.join(', ') + '.') : null,
        e.missingBecause.length ? h('p', { class: 'math-why missing' }, 'Missing or incomplete: ' + e.missingBecause.join(', ') + '.') : null,
        ...e.groups.map((g) => h('div', { class: 'math-group' },
          h('p', { class: 'math-group-head' }, g.label, g.subtotal !== null && e.groups.length > 1 ? h('span', { class: 'math-value' }, showNumber(g.subtotal, e.unit)) : null),
          h('ul', { class: 'math-terms' }, g.terms.map((t) => termEl(t, ctx, depth))))),
        e.rules.length ? h('p', { class: 'math-rules' }, 'Rules: ', ...e.rules.flatMap((r, i) => [i ? ', ' : '', h('a', { href: 'math.html#rule-' + r }, r)])) : null,
        h('p', { class: 'math-more' }, h('a', { href: 'math.html#metric-' + e.id.split(':')[0] }, 'This formula on the math page')));
    }));
}

// The button: a real button that says what it does and whether it is open.
export function mathButton(ids, ctx, depth = 0, label = 'Show the math') {
  const wrap = h('div', { class: 'math' });
  const btn = h('button', { type: 'button', class: 'btn math-btn', 'aria-expanded': 'false' }, h('span', { class: 'math-icon', 'aria-hidden': 'true' }, '='), ' ', label);
  let shown = null;
  btn.addEventListener('click', () => {
    const open = btn.getAttribute('aria-expanded') === 'true';
    btn.setAttribute('aria-expanded', String(!open));
    btn.lastChild.textContent = ' ' + (open ? label : label.replace(/^Show/, 'Hide'));
    if (open) { shown && shown.remove(); shown = null; } else { shown = panel(ids, typeof ctx === 'function' ? ctx() : ctx, depth); wrap.append(shown); }
  });
  wrap.append(btn);
  return wrap;
}

export { KIND_TEXT };
