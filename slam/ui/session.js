// Session (S-230): the first call, in the order it runs: Needs, Debt, Income, Assets, Goals, each with its DATING
// letter and one total from the engine (engine/summary.js sessionSteps). Each row opens My numbers at that section.
// Batch 3 builds the guided flow here; until then the tab is never a dead click. Formatting only.

import { startPage, numbersHref } from './shell.js';
import { summarize, sessionSteps } from '../engine/summary.js';
import { h, chip, money } from './view.js';

// How each total reads: what the number is, in a client's words.
const WORDS = { needs: ' a month', debt: ' owed', income: ' a month before tax', assets: ' in what you own', goals: ' in goals' };
const EMPTY = { needs: 'No spending entered yet', debt: 'No debts entered yet', income: 'No income entered yet', assets: 'Nothing you own entered yet', goals: 'No goals yet' };

function row(step) {
  const r = step.result;
  // Missing reads missing, never $0 (empty is not zero).
  const total = r.value === null
    ? h('span', { class: 'empty' }, step.id === 'goals' && r.count ? 'Goals with no amount yet' : EMPTY[step.id])
    : h('span', {}, h('span', { class: 'go-total' }, money(r.value)), WORDS[step.id]);
  return h('li', {}, h('a', { class: 'go-row', href: numbersHref(step.id) },
    h('span', { class: 'go-mark', 'aria-hidden': 'true' }, step.letter),
    h('span', { class: 'go-name' }, step.label),
    h('span', { class: 'go-sub' }, total, r.value !== null && (r.kind === 'rough' || r.kind === 'incomplete') ? chip(r.kind) : null)));
}

function render({ spine, rules }) {
  const steps = sessionSteps(spine, summarize(spine, rules, { flags: false }));
  return [
    h('p', { class: 'lede' }, 'Your first session, step by step: tap a step to fill in that part of your numbers.'),
    h('ol', { class: 'go-list', 'aria-label': 'The steps, in order' }, steps.map(row))
  ];
}

startPage({ tab: 'session', title: 'Session', render });
