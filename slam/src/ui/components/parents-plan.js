// "On a parent's health insurance" for the Health category. Offered only while
// the client is 25 or younger; premiums then count as doesn't apply (S-073).

import { h } from '../dom.js';
import { parentsPlan, PARENTS_PLAN_MAX_AGE, PARENTS_PLAN_LINE_TYPES } from '../../calc/coverage.js';

export function parentsPlanToggle(ctx) {
  const p = parentsPlan(ctx.doc);
  if (p.agedOut) return h('p', { class: 'small muted' }, 'Aged off a parent\'s health plan (' + p.age + ' this year), so premiums count again.');
  if (p.age === null) return h('p', { class: 'xs muted' }, 'On a parent\'s health insurance? Add a birth year in Profile (offered through age ' + PARENTS_PLAN_MAX_AGE + ').');
  if (!p.eligible) return null;
  return h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: p.chosen, 'data-key': 'parents-plan',
    onchange: (e) => ctx.update(e.target.checked ? 'On a parent\'s plan' : 'Own health plan', (d) => { d.household.parentsPlan = e.target.checked; }) }),
  'On a parent\'s health insurance (premiums don\'t apply)');
}

// True when this line is paid by a parent's plan right now.
export function coveredByParents(doc, line) {
  return parentsPlan(doc).on && PARENTS_PLAN_LINE_TYPES.includes(line.type);
}

export function coveredNote() {
  return h('span', { class: 'small muted' }, 'Covered by a parent\'s plan');
}
