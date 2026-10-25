// Assumption sets (S-183, Batch 3) for every FI number and the projection. Your own (best) is the household's own
// real return and withdrawal rate; the others come from the rules registry (house assumptions). A set is
// chosen, not guessed, so its values are known Facts whose source is the rule.

import { fact } from './spine.js';

// Batch 3: the sets read Conservative, Standard (the default) and Optimistic, then Your own (the household's own
// assumptions, the old "best"). The stored ids stay, so a pick saved in a browser still reads.
export const SCENARIOS = ['worst', 'likely', 'optimistic', 'best'];
export const SCENARIO_DEFAULT = 'likely';
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

// Your own assumptions past the optimistic set: words for a small warning, or null.
export function beyondOptimistic(spine, rules) {
  const own = scenarioAssumptions(spine, rules, 'best'), opt = scenarioAssumptions(spine, rules, 'optimistic');
  const r = own.realReturn && own.realReturn.value, w = own.withdrawalRate && own.withdrawalRate.value;
  const over = [r !== null && r !== undefined && r > opt.realReturn.value ? 'a return above ' + Math.round(opt.realReturn.value * 1000) / 10 + '%' : null, w !== null && w !== undefined && w > opt.withdrawalRate.value ? 'a withdrawal rate above ' + Math.round(opt.withdrawalRate.value * 1000) / 10 + '%' : null].filter(Boolean);
  return over.length ? 'Careful: ' + over.join(' and ') + ' is more hopeful than the optimistic set.' : null;
}

// The rule behind an assumption Fact when a set put it there, else null.
export const scenarioRule = (f) => (f && typeof f.source === 'string' && /^SCENARIO_/.test(f.source) ? f.source : null);
