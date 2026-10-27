// What the client sees first about debt (morning answer 2, S-243), on the Debt screen and the One-pager alike:
// high-interest debt gone (the Plan's high-interest step), all debt gone on the plan, then the comparison with every
// extra dollar at the debt. Each line is [label, words]; the comparison has no label. Formatting only: the months
// are the Plan's (engine/plan.js planPayoff, through engine/debtview.js planClearDates).

import { h, monthWords } from './view.js';

const tag = (id, words) => h('span', { 'data-metric': id }, words);
export function leadLines(cd) {
  if (!cd || cd.none) return [];
  return [
    // The two months are tagged for the agreement check (plan:hiFreeYm, plan:allFreeYm), so every screen shows the same.
    cd.hasHi ? ['High-interest debt gone', cd.hiYm ? tag('plan:hiFreeYm', monthWords(cd.hiYm)) : 'not yet on your plan'] : null,
    ['All debt gone', cd.allYm ? [tag('plan:allFreeYm', monthWords(cd.allYm)), ' on your plan'] : cd.waits ? 'not yet on your plan (' + cd.waits.toLowerCase() + ' waits on a step before it)' : 'not at this pace'],
    cd.everyYm && cd.everyYm !== cd.allYm ? [null, monthWords(cd.everyYm) + ' if every extra dollar went to debt'] : null
  ].filter(Boolean);
}
