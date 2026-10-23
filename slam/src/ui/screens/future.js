// Future (parked, S-105): "what could life look like". The dream life, Eras, and Next stage, exactly as they
// worked before, shown only when the coach turns on "Future tools (parked)" in Setup. Off by default; the
// engines and the stored fields keep working either way, nothing here is deleted. Two tabs: future-eras.js and
// future-next-stage.js, each with its charts (ui/charts/era-charts.js, next-charts.js) and the sticky running
// bar from plan.js underneath. No numbers of its own.

import { h } from '../dom.js';
import { renderEras } from './future-eras.js';
import { renderNextStage } from './future-next-stage.js';
import { eraCards } from '../charts/era-charts.js';
import { nextStageCards } from '../charts/next-charts.js';
import { runningBar } from './plan.js';

const TABS = [['eras', 'Dream life and Eras'], ['next', 'Next stage']];

export function renderFuture(ctx, summary) {
  const tab = TABS.some(([id]) => id === ctx.ui.futureTab) ? ctx.ui.futureTab : 'eras';
  const charts = tab === 'eras' ? eraCards(ctx, summary) : nextStageCards(ctx, summary);
  return h('div', {},
    h('h1', {}, 'Future'),
    h('p', { class: 'muted small' }, 'Parked tools: what life could look like. Turn them off again in Setup.'),
    h('div', { class: 'passes', role: 'tablist' }, TABS.map(([id, label]) => h('button', {
      'aria-current': id === tab ? 'step' : null, 'data-key': 'future-tab-' + id, onclick: () => ctx.go('future', { futureTab: id })
    }, label))),
    tab === 'eras' ? renderEras(ctx, summary) : renderNextStage(ctx, summary),
    h('div', { class: 'grid two', id: 'future-charts', style: 'margin-top:12px' }, charts),
    // The bar follows the tab: Eras types the dream, Next stage reads actuals (runningBar maps the tab names).
    runningBar(ctx, summary, tab));
}
