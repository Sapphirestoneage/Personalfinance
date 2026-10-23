// Plan (S-106): what the month should look like. The gut number (first for a new client, then one line with
// the answer), the start of the month, next month's plan (moved here from Analyze), and the client's own
// estimates (the Rough pass, plan-estimates.js). A toggle shows the plan or the estimates, so each stays short.
// Reads summary.totals and summary.dreamLife.entry from buildSummary; the plan cards are plan-table.js
// reviewCards with month-picker.js. runningBar is exported for the Future screen.

import { h } from '../dom.js';
import { money } from '../format.js';
import { question } from '../components/value-input.js';
import { statusChip } from '../components/status.js';
import { monthPicker } from '../components/month-picker.js';
import { reviewCards } from '../components/plan-table.js';
import { renderEstimates } from './plan-estimates.js';

function gutCard(ctx) {
  const g = ctx.doc.gut;
  // Answered means a status was set: "don't know" counts, so the big question steps aside for any answer, not only a number.
  const answered = g.status !== null;
  if (answered && !ctx.ui.gutOpen) {
    return h('div', { class: 'card gut-line', id: 'gut-card' }, h('div', { class: 'spread' },
      h('span', {}, 'Gut number: ', h('b', { class: 'num' }, g.amount === null ? '' : money(g.amount)), ' a month ', statusChip(g.status)),
      h('button', { class: 'btn small ghost', 'data-key': 'gut-open', onclick: () => { ctx.ui.gutOpen = true; ctx.rerender(); } }, 'Change')));
  }
  return h('div', { class: 'card', id: 'gut-card' },
    h('h2', { style: 'margin-top:0' }, 'About how much do you spend a month?'),
    h('p', { class: 'muted small' }, 'Asked before any detail, on purpose. Just a gut number. We will compare it with everything else later.'),
    question(ctx, 'Gut number', 'Everything, in a typical month', ['gut'], g, { big: true }),
    answered ? h('button', { class: 'btn small', 'data-key': 'gut-done', onclick: () => { ctx.ui.gutOpen = false; ctx.rerender(); } }, 'Done') : null);
}

// Sticky bar with live totals while typing estimates (or a dream, on Future).
export function runningBar(ctx, summary, pass) {
  const take = h('b', {});
  const col = h('b', {});
  const left = h('b', {});
  // Eras opens with the dream life, so its bar follows the dream being typed (S-097).
  if (pass === 'eras') pass = 'dream';
  // Next stage has no column being typed, so its bar shows spending and savings as they stand.
  if (pass === 'next') pass = 'actual';
  const colLabel = pass === 'dream' ? (ctx.ui.dreamTerm === 'long' ? 'Long-term dream' : 'Short-term dream') : pass === 'actual' ? 'Spending + savings' : 'Estimates';
  const fill = (s) => {
    const t = s.totals;
    take.textContent = money(t.takeHome);
    if (pass === 'dream') { const e = s.dreamLife.entry[ctx.ui.dreamTerm === 'long' ? 'dreamLong' : 'dream']; col.textContent = money(e.outflow); left.textContent = money(e.left); }
    else if (pass === 'actual') { col.textContent = money(t.outflow); left.textContent = money(t.surplus); }
    else { col.textContent = money(t.estimateOutflow); left.textContent = money(t.estimateLeft); }
  };
  fill(summary);
  // While a value box is being typed, ctx.preview (app.js) runs buildSummary on a scratch copy and hands it here, so
  // the bar moves on every keystroke without a rerender and nothing is saved until the change commits.
  ctx.ui.previewHandler = fill;
  return h('div', { class: 'running', 'aria-live': 'polite' }, h('div', { class: 'running-inner' },
    h('span', {}, 'Take-home ', take, ' / month'),
    h('span', {}, colLabel + ' ', col),
    h('span', {}, 'Left over ', left)));
}

// A new client starts on the estimates; once there is a month or a plan, on the plan.
function viewOf(ctx) {
  if (ctx.ui.planView === 'plan' || ctx.ui.planView === 'estimates') return ctx.ui.planView;
  return ctx.doc.months.length || Object.keys(ctx.doc.plans || {}).length ? 'plan' : 'estimates';
}

export function renderPlan(ctx, summary) {
  const view = viewOf(ctx);
  const toggle = h('div', { class: 'toggle', role: 'group', 'aria-label': 'Show' },
    [['plan', 'Next month\'s plan'], ['estimates', 'Your estimates']].map(([id, label]) => h('button', { 'aria-pressed': view === id ? 'true' : 'false', 'data-key': 'plan-view-' + id,
      onclick: () => { ctx.ui.planView = id; ctx.rerender(); } }, label)));
  return h('div', {},
    h('h1', {}, 'Plan'),
    gutCard(ctx),
    h('div', { class: 'spread', style: 'margin-bottom:12px' }, toggle),
    view === 'plan'
      ? h('div', {}, monthPicker(ctx, summary, { copyFixed: true }),
        h('section', { id: 'sec-plan' }, h('h2', {}, 'Next month\'s plan'), h('div', { class: 'grid' }, reviewCards(ctx, summary))))
      : h('section', { id: 'estimates' }, renderEstimates(ctx, summary, 'estimate'), runningBar(ctx, summary, 'rough')));
}
