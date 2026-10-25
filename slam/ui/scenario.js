// The Triple D set this viewer picked (S-183), kept in this browser only; the
// Dashboard and the math page read it, so both show the same numbers.

import { SCENARIOS, SCENARIO_DEFAULT, SCENARIO_WORDS, scenarioAssumptions, beyondOptimistic } from '../engine/scenarios.js';
import { h, showValue } from './view.js';

const KEY = 'slam-scenario:v1';

export function pickedScenario() {
  try { const v = localStorage.getItem(KEY); return SCENARIOS.includes(v) ? v : SCENARIO_DEFAULT; } catch { return SCENARIO_DEFAULT; }
}
export function pick(id) {
  try { localStorage.setItem(KEY, id); } catch { /* storage blocked: the pick lasts until the page closes */ }
}

// "6% real return, 4% withdrawal" for a set.
export function scenarioText(spine, rules, id) {
  const a = scenarioAssumptions(spine, rules, id);
  const p = (f) => (f && f.value !== null && f.value !== undefined ? showValue(f.value, 'rate') : 'not given');
  return p(a.realReturn) + ' real return, ' + p(a.withdrawalRate) + ' withdrawal';
}

// Three real buttons, one pressed; a line says what the picked set uses.
export function scenarioBar(spine, rules, current, onPick) {
  return h('section', { class: 'card scenario', id: 'scenario', 'aria-labelledby': 'scenario-h' },
    h('h2', { id: 'scenario-h', class: 'scenario-h' }, 'Assumptions for the long run'),
    h('div', { class: 'segmented', role: 'group', 'aria-labelledby': 'scenario-h' },
      SCENARIOS.map((id) => h('button', { type: 'button', class: 'seg-btn', 'aria-pressed': String(id === current), onclick: () => { if (id === current) return; pick(id); onPick(id); } },
        h('span', { class: 'seg-label' }, SCENARIO_WORDS[id]),
        h('span', { class: 'seg-sub' }, scenarioText(spine, rules, id))))),
    current === 'best' ? h('p', { class: 'muted scenario-note' }, 'Your own: the return and withdrawal rate in your numbers.') : null,
    current === 'best' && beyondOptimistic(spine, rules) ? h('p', { class: 'scenario-note warn-note' }, beyondOptimistic(spine, rules)) : null);
}
