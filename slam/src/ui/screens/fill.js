// Screen 2, Fill in: the guided passes in the order used on calls.
// Gut, Basics, Rough, Dream, Actual (and Transactions). Every pass is skippable.

import { h } from '../dom.js';
import { money } from '../format.js';
import { question } from '../components/value-input.js';
import { renderBasics } from './fill-basics.js';
import { renderEstimates } from './fill-estimates.js';
import { renderActual } from './fill-actual.js';

export const PASSES = [
  ['gut', '1 Gut'], ['basics', '2 Basics'], ['rough', '3 Rough'], ['dream', '4 Dream'], ['actual', '5 Actual']
];

export function passForPath(path) {
  const [a, , c] = path;
  if (a === 'gut') return 'gut';
  if (a === 'income' || a === 'profile' || a === 'household') return 'basics';
  if (a === 'categories') return c === 'dream' ? 'dream' : 'rough';
  if (a === 'line' || a === 'debts') return 'actual';
  if (a === 'transactions') return 'transactions';
  return 'rough';
}

function renderGut(ctx) {
  const doc = ctx.doc;
  return h('div', { class: 'card' },
    h('h2', {}, 'About how much do you spend a month?'),
    h('p', { class: 'muted small' }, 'Asked before any detail, on purpose. Just a gut number. We will compare it with everything else later.'),
    question(ctx, 'Gut number', 'Everything, in a typical month', ['gut'], doc.gut, { big: true }));
}

// Sticky bar with live totals for the current pass. Updated while typing.
function runningBar(ctx, summary, pass) {
  const take = h('b', {});
  const col = h('b', {});
  const left = h('b', {});
  if (pass === 'transactions') pass = 'actual';
  const colLabel = pass === 'dream' ? 'Dreams' : pass === 'actual' ? 'Spending + savings' : 'Estimates';
  const fill = (s) => {
    const t = s.totals;
    take.textContent = money(t.takeHome);
    if (pass === 'dream') { col.textContent = money(t.dreamOutflow); left.textContent = money(t.dreamLeft); }
    else if (pass === 'actual') { col.textContent = money(t.outflow); left.textContent = money(t.surplus); }
    else { col.textContent = money(t.estimateOutflow); left.textContent = money(t.estimateLeft); }
  };
  fill(summary);
  ctx.ui.previewHandler = fill;
  return h('div', { class: 'running', 'aria-live': 'polite' }, h('div', { class: 'running-inner' },
    h('span', {}, 'Take-home ', take, ' / month'),
    h('span', {}, colLabel + ' ', col),
    h('span', {}, 'Left over ', left),
    pass === 'actual' && summary.totals.basisUsesEstimate.length ? h('span', { class: 'muted' }, '(uses estimates where actuals are missing)') : null));
}

export function renderFill(ctx, summary) {
  const pass = ctx.ui.pass || 'gut';
  const extra = ctx.fillExtras || [];
  const passes = [...PASSES, ...extra.map((x) => [x.id, x.label])];
  const idx = passes.findIndex(([id]) => id === pass);
  const body = {
    gut: () => renderGut(ctx),
    basics: () => renderBasics(ctx, summary),
    rough: () => renderEstimates(ctx, summary, 'estimate'),
    dream: () => renderEstimates(ctx, summary, 'dream'),
    actual: () => renderActual(ctx, summary)
  }[pass] || (() => extra.find((x) => x.id === pass).render(ctx, summary));

  return h('div', {},
    h('h1', {}, 'Fill in'),
    h('div', { class: 'passes', role: 'tablist' }, passes.map(([id, label]) => h('button', {
      'aria-current': id === pass ? 'step' : null, onclick: () => ctx.go('fill', { pass: id })
    }, label))),
    body(),
    h('div', { class: 'spread', style: 'margin-top:16px' },
      idx > 0 ? h('button', { class: 'btn', onclick: () => ctx.go('fill', { pass: passes[idx - 1][0] }) }, 'Back') : h('span'),
      idx < passes.length - 1
        ? h('button', { class: 'btn primary', onclick: () => ctx.go('fill', { pass: passes[idx + 1][0] }) }, 'Next pass (or skip)')
        : h('button', { class: 'btn primary', onclick: () => ctx.go('budget') }, 'See the budget')),
    runningBar(ctx, summary, pass));
}
