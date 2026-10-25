// "Show the math" (S-177): a button that opens a panel with the formula in
// words, the same formula with the numbers plugged in, every input (a number
// of yours opens it in My numbers; a worked-out number opens its own math),
// the inputs grouped by DATING with subtotals, kind chips, and why the number
// is rough. Everything shown comes from engine/math.js.
// It is on client screens only, so it never names a rule by its id or opens a
// Builder page (S-230): a rule is its words, plain text. The ids and their
// links live on the Builder's All formulas and Rules pages.

import { explainMetric, showNumber } from '../engine/math.js';
import { h, chip, ledgerHref, plainLabel } from './view.js';
import { keep, kept } from './shell.js';

const KIND_TEXT = { known: 'known', rough: 'rough', missing: 'missing', computed: 'worked out', incomplete: 'incomplete', notForMe: 'not for me' };

function termEl(t, ctx, depth) {
  const value = h('span', { class: 'math-value' }, (t.role === 'minus' ? '- ' : '') + showNumber(t.value, t.unit, t.kind));
  const label = t.path ? h('a', { href: ledgerHref(t.path), title: 'Open it in My numbers' }, plainLabel(t.label)) : h('span', {}, plainLabel(t.label));
  const li = h('li', { class: 'math-term' }, chip(t.kind), ' ', label, ' ', value);
  if (t.metric && depth < 6) li.append(mathButton([t.metric], ctx, depth + 1, 'Show the math for ' + plainLabel(t.label)));
  return li;
}

function panel(ids, ctx, depth) {
  return h('div', { class: 'math-panel depth-' + depth },
    ...ids.map((id) => {
      const e = explainMetric(id, ctx);
      if (!e) return null;
      return h('section', { class: 'math-metric', 'aria-label': plainLabel(e.label) },
        h('p', { class: 'math-head' }, h('strong', {}, plainLabel(e.label)), ' ', chip(e.kind === 'computed' ? 'known' : e.kind)),
        h('p', { class: 'math-formula' }, plainLabel(e.formula)),
        h('p', { class: 'math-plugged' }, h('code', {}, plainLabel(e.plugged))),
        e.note ? h('p', { class: 'math-note' }, plainLabel(e.note)) : null,
        e.roughBecause.length ? h('p', { class: 'math-why' }, 'This number is rough because: ' + plainLabel(e.roughBecause.join(', ')) + '.') : null,
        e.missingBecause.length ? h('p', { class: 'math-why missing' }, 'Missing or incomplete: ' + plainLabel(e.missingBecause.join(', ')) + '.') : null,
        ...e.groups.map((g) => h('div', { class: 'math-group' },
          h('p', { class: 'math-group-head' }, plainLabel(g.label), g.subtotal !== null && e.groups.length > 1 ? h('span', { class: 'math-value' }, showNumber(g.subtotal, e.unit)) : null),
          h('ul', { class: 'math-terms' }, g.terms.map((t) => termEl(t, ctx, depth))))));
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

// Show the math kept open when the screen is come back to (Back, the trail, the browser's back, a tab, a reload): key
// names it among the screen's panels (kept with keep({ math: [keys] })).
export function keptMath(key, ids, ctx, label) {
  const el = mathButton(ids, ctx, 0, label);
  const btn = el.querySelector('button');
  if ((kept().math || []).includes(key)) btn.click();
  btn.addEventListener('click', () => { const open = kept().math || []; keep({ math: open.includes(key) ? open.filter((k) => k !== key) : [...open, key] }); });
  return el;
}

export { KIND_TEXT };
