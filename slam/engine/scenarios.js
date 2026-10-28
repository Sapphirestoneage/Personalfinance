// Assumption sets (S-183, Batch 3) for every FI number and the projection. Your own (best) is the household's own
// real return and withdrawal rate; the others come from the rules registry (house assumptions). A set is
// chosen, not guessed, so its values are known Facts whose source is the rule.

import { fact } from './spine.js';

// Batch 3: the sets read Conservative, Standard and Optimistic (the default since 2026-10-28), then Your own (the household's own
// assumptions, the old "best"). The stored ids stay, so a pick saved in a browser still reads.
export const SCENARIOS = ['worst', 'likely', 'optimistic', 'best'];
// The default set is Optimistic (owner, 2026-10-28, from a live session).
export const SCENARIO_DEFAULT = 'optimistic';
export const SCENARIO_WORDS = { worst: 'Conservative', likely: 'Standard', optimistic: 'Optimistic', best: 'Your own' };
const RULE_IDS = {
  likely: { realReturn: 'SCENARIO_LIKELY_RETURN', withdrawalRate: 'SCENARIO_LIKELY_WR' },
  optimistic: { realReturn: 'SCENARIO_OPT_RETURN', withdrawalRate: 'SCENARIO_OPT_WR' },
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
