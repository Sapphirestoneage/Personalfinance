// Screen 4, Analyze: every chart and lens, grouped, each with a one-line reading
// (filled in during Phase 4).

import { h } from '../dom.js';

export function renderAnalyze() {
  return h('div', {}, h('h1', {}, 'Analyze'), h('p', { class: 'muted' }, 'Charts arrive in Phase 4.'));
}
