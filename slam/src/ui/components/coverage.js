// Health coverage (S-117): the Setup section that owns every coverage fact, and the one-line summary
// (with a link) every other screen shows instead of asking.

import { h, options } from '../dom.js';
import { money } from '../format.js';
import { question } from './value-input.js';
import { jumpLink } from './jump.js';
import { coverageSummary, parentsPlan, PARENTS_PLAN_MAX_AGE, HOW_LABELS } from '../../calc/coverage.js';
import { COVERAGE_HOW } from '../../store/schema.js';

// "Covered by a parent's plan. No premium. Change in Setup"
export function coverageNote(ctx, key = 'coverage-summary') {
  return h('p', { class: 'small', 'data-key': key }, h('span', { 'data-key': key + '-text' }, coverageSummary(ctx.doc, ctx.payFrequency)), ' ', jumpLink(ctx, 'setup:coverage', 'Health coverage in Setup', key + '-go'));
}

const pick = (ctx, key, label, value, opts, set) => h('label', { class: 'field' }, h('span', { class: 'lbl' }, label),
  h('select', { 'data-key': key, onchange: (e) => ctx.update(label, (d) => set(d.coverage, e.target.value || null)) }, options(opts, value === null || value === undefined ? '' : String(value))));

export function coverageSection(ctx, summary) {
  const c = ctx.doc.coverage;
  const p = parentsPlan(ctx.doc);
  const noPremium = c.how === 'parent' || c.how === 'none';
  const healthDeds = summary.income.sources.flatMap((s) => s.deductions.filter((d) => d.kind === 'health').map((d) => ({ income: s, d })));
  const fromPay = c.premiumFrom === 'paycheck' ? healthDeds.find((x) => x.income.id === c.premiumIncomeId) : null;
  return h('div', { class: 'card', id: 'coverage-card' },
    h('p', { class: 'small', 'data-key': 'coverage-line' }, coverageSummary(ctx.doc, ctx.payFrequency)),
    // Under 26 (S-123): a parent's plan is one tap. It is the same answer as "A parent's plan" below.
    p.eligible || (p.age === null && c.how === 'parent') ? h('label', { class: 'check', 'data-key': 'coverage-parent-toggle' },
      h('input', { type: 'checkbox', checked: c.how === 'parent', onchange: (e) => ctx.update('On a parent\'s plan', (d) => { d.coverage.how = e.target.checked ? 'parent' : null; }) }),
      'On a parent\'s plan' + (p.age === null ? '' : ' (you are ' + p.age + ' this year; it counts through ' + PARENTS_PLAN_MAX_AGE + ')')) : null,
    pick(ctx, 'coverage-how', 'How are you covered?', c.how, [['', 'Pick one'], ...COVERAGE_HOW.map((k) => [k, HOW_LABELS[k]])], (cv, v) => { cv.how = v; }),
    c.how === 'parent' ? h('p', { class: 'xs muted' }, p.age === null ? 'A parent\'s plan counts through age ' + PARENTS_PLAN_MAX_AGE + ': add a birth year in Basics.'
      : p.on ? 'Premiums are $0 while you are ' + PARENTS_PLAN_MAX_AGE + ' or younger (' + p.age + ' this year).' : 'Aged off at ' + p.age + ' this year: the premium below counts again.') : null,
    // No premium to ask about on a parent's plan (S-131): the question only comes back once the client ages off it.
    c.how === 'none' || p.on ? null : pick(ctx, 'coverage-premium-from', 'The premium is', c.premiumFrom, [['', 'Not answered yet'], ['paycheck', 'Taken out of a paycheck'], ['direct', 'Paid directly']], (cv, v) => { cv.premiumFrom = v; if (v !== 'paycheck') cv.premiumIncomeId = null; }),
    c.premiumFrom === 'paycheck' && !(noPremium && p.on) ? h('div', {},
      pick(ctx, 'coverage-premium-income', 'From which paycheck', c.premiumIncomeId, [['', 'Pick the income'], ...ctx.doc.income.filter((i) => i.state !== 'archived').map((i) => [i.id, i.label])], (cv, v) => { cv.premiumIncomeId = v; }),
      h('p', { class: 'xs muted', 'data-key': 'coverage-deduction' }, fromPay ? 'The amount is the health deduction on ' + fromPay.income.label + ': ' + money(fromPay.d.monthly) + ' a month (Setup, Income). Take-home is already net of it.' : 'The amount is that income\'s health deduction: ', fromPay ? null : jumpLink(ctx, 'setup:income', 'add it in Setup, Income', 'coverage-add-deduction'))) : null,
    c.premiumFrom === 'direct' && !(c.how === 'none') && !p.on ? question(ctx, 'Premium', 'What you pay for the plan yourself. It is the Health insurance line in the budget.', ['coverage', 'premium'], c.premium, { label: 'Premium' }) : null,
    c.how === 'none' ? null : question(ctx, 'Deductible (optional)', null, ['coverage', 'deductible'], c.deductible, { label: 'Deductible' }),
    c.how === 'none' ? null : question(ctx, 'Out-of-pocket max (optional)', null, ['coverage', 'outOfPocketMax'], c.outOfPocketMax, { label: 'Out-of-pocket max' }),
    pick(ctx, 'coverage-hsa', 'An HSA or FSA?', c.hsa === null ? null : c.hsa ? 'yes' : 'no', [['', 'Not answered yet'], ['yes', 'Yes'], ['no', 'No']], (cv, v) => { cv.hsa = v === null ? null : v === 'yes'; if (v !== 'yes') cv.hsaFrom = null; }),
    c.hsa ? pick(ctx, 'coverage-hsa-from', 'Contributions come from', c.hsaFrom, [['', 'Not answered yet'], ['paycheck', 'A paycheck (a deduction in Setup, Income)'], ['direct', 'Paid in directly']], (cv, v) => { cv.hsaFrom = v; }) : null,
    h('p', { class: 'xs muted' }, 'Gym, out of pocket, prescriptions, and therapy are lines under Health in the budget.'));
}
