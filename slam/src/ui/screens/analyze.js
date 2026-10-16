// Screen 4, Analyze: every chart and lens, grouped, each with a one-line reading.
// The section bar jumps to a group, so every chart is at most one tap away.

import { h } from '../dom.js';
import * as c from '../charts/catalog.js';

const SECTIONS = [
  ['where', 'Where it goes', (ctx, s) => [c.sankeyCard(ctx, s, true), c.donutCard(ctx, s), c.nwsCard(ctx, s, true), c.fixedVariableCard(ctx, s), c.tagsCard(ctx, s)]],
  ['eva', 'Estimate vs actual', (ctx, s) => [c.threeColumnCard(ctx, s, true), c.overlapCard(ctx, s), c.varianceCard(ctx, s), c.accuracyCard(ctx, s), c.gutCard(ctx, s)]],
  ['time', 'Over time', (ctx, s) => [c.trendCard(ctx, s), c.varianceByMonthCard(ctx, s)]],
  ['lenses', 'Lenses', (ctx, s) => [c.nwsCard(ctx, s, false), c.draftCard(ctx, s), c.gaugesCard(ctx, s), c.joyCard(ctx, s), c.mistakeCard(ctx, s), c.completionCard(ctx, s), c.incomeStatementCard(ctx, s)]]
];

export function renderAnalyze(ctx, summary) {
  const extra = ctx.analyzeExtras || [];
  const all = [...SECTIONS, ...extra];
  return h('div', {},
    h('h1', {}, 'Analyze'),
    h('div', { class: 'passes' }, all.map(([id, label]) => h('button', { onclick: () => {
      const el = document.getElementById('sec-' + id);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } }, label))),
    all.map(([id, label, build]) => h('section', { id: 'sec-' + id, style: 'scroll-margin-top:110px' },
      h('h2', {}, label),
      h('div', { class: 'grid two' }, build(ctx, summary)))));
}
