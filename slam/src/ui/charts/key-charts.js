// The four key charts on the Budget screen, visible without clicking:
// Sankey, estimate / dream / actual bars, spending donut, needs / wants / savings.
// Every other chart is one tap away on Analyze.

import { h } from '../dom.js';
import { sankeyCard, threeColumnCard, donutCard, nwsCard } from './catalog.js';

export function keyCharts(ctx, summary) {
  return h('div', { class: 'charts-key' },
    sankeyCard(ctx, summary, true),
    threeColumnCard(ctx, summary, true),
    donutCard(ctx, summary),
    nwsCard(ctx, summary, true),
    h('div', { style: 'grid-column:1/-1' }, h('a', { href: '#analyze', onclick: (e) => { e.preventDefault(); ctx.go('analyze'); } }, 'Every chart and lens on Analyze')));
}
