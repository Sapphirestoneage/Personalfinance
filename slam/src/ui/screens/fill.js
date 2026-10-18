// Screen 2, Fill in: the guided passes in the order used on calls.
// Gut, Profile, Rough, Actual (then Cash flow, Next stage, Eras). Every pass is skippable.
// The dream life moved to Eras (S-097).

import { h } from '../dom.js';
import { money } from '../format.js';
import { question } from '../components/value-input.js';
import { renderProfile, incomeSection } from './fill-basics.js';
import { renderEstimates } from './fill-estimates.js';
import { renderActual } from './fill-actual.js';

export const PASSES = [
  ['gut', '1 Gut'], ['profile', '2 Profile'], ['rough', '3 Rough'], ['actual', '4 Actual']
];

export function passForPath(path) {
  const [a, , c] = path;
  if (a === 'gut') return 'gut';
  // Income (S-104): take-home is asked in Rough; the rest of the paycheck is worked out in Actual.
  if (a === 'income') return c === undefined || path[2] === 'takeHome' ? 'rough' : 'actual';
  if (a === 'profile' || a === 'household') return 'profile';
  // A dream (category or line) is typed in Eras, Your dream life (S-097).
  if ((a === 'categories' || a === 'line') && (c === 'dream' || c === 'dreamLong')) return 'eras';
  if (a === 'categories') return 'rough';
  if (a === 'line' || a === 'debts') return 'actual';
  if (a === 'balances') return 'profile';
  if (a === 'transactions') return 'cashflow';
  if (a === 'nextStage') return 'next';
  if (a === 'eras') return 'eras';
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
  // Eras opens with the dream life, so its bar follows the dream being typed (S-097).
  if (pass === 'eras') pass = 'dream';
  if (pass === 'cashflow' || pass === 'next') pass = 'actual';
  const colLabel = pass === 'dream' ? (ctx.ui.dreamTerm === 'long' ? 'Long-term dream' : 'Short-term dream') : pass === 'actual' ? 'Spending + savings' : 'Estimates';
  const fill = (s) => {
    const t = s.totals;
    take.textContent = money(t.takeHome);
    if (pass === 'dream') { const e = s.dreamLife.entry[ctx.ui.dreamTerm === 'long' ? 'dreamLong' : 'dream']; col.textContent = money(e.outflow); left.textContent = money(e.left); }
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
    profile: () => renderProfile(ctx, summary),
    // Income first in both money passes (S-104): a rough take-home in Rough, the full paycheck in Actual.
    rough: () => h('div', {}, ctx.ui.blind ? null : incomeSection(ctx, summary, 'rough'), renderEstimates(ctx, summary, 'estimate')),
    actual: () => h('div', {}, incomeSection(ctx, summary, 'actual'), renderActual(ctx, summary))
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
