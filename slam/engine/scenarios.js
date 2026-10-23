// Triple D (S-183): three assumption sets for every FI number and the
// projection. Best is the household's own real return and withdrawal rate;
// likely and worst come from the rules registry (house assumptions). A set is
// chosen, not guessed, so its values are known Facts whose source is the rule.

import { fact } from './spine.js';

export const SCENARIOS = ['best', 'likely', 'worst'];
export const SCENARIO_DEFAULT = 'likely';
export const SCENARIO_WORDS = { best: 'Best', likely: 'Likely', worst: 'Worst' };
const RULE_IDS = {
  likely: { realReturn: 'SCENARIO_LIKELY_RETURN', withdrawalRate: 'SCENARIO_LIKELY_WR' },
  worst: { realReturn: 'SCENARIO_WORST_RETURN', withdrawalRate: 'SCENARIO_WORST_WR' }
};

// The real return and withdrawal rate of a set, each a Fact, with the rules it reads.
export function scenarioAssumptions(spine, rules, id) {
  const A = spine.assumptions || {};
  if (!RULE_IDS[id]) return { id: 'best', realReturn: A.realReturn, withdrawalRate: A.withdrawalRate, rules: [] };
  const year = +spine.meta.asOf.slice(0, 4);
  const F = (rid) => fact(rules.get(rid, year), { kind: 'known', asOf: spine.meta.asOf, source: rid });
  return { id, realReturn: F(RULE_IDS[id].realReturn), withdrawalRate: F(RULE_IDS[id].withdrawalRate), rules: Object.values(RULE_IDS[id]) };
}

// The household with a set's assumptions in place; best returns it unchanged.
export function withScenario(spine, rules, id) {
  const a = scenarioAssumptions(spine, rules, id);
  if (a.id === 'best') return spine;
  return { ...spine, assumptions: { ...spine.assumptions, realReturn: a.realReturn, withdrawalRate: a.withdrawalRate } };
}

// The rule behind an assumption Fact when a set put it there, else null.
export const scenarioRule = (f) => (f && typeof f.source === 'string' && /^SCENARIO_/.test(f.source) ? f.source : null);
