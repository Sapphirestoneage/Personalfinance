// The progress tracker for a run of steps (owner, 2026-10-27, S-265): the Plan's steps and the Session's steps.
// "Step 2 of 9" and how many are done, a bar of one segment per step (done, now, waiting on an answer, ahead; each a
// link to its step, its state also said in words for screen readers), and Back and Next naming the steps either side.
// Formatting only.

import { h } from './view.js';

const STATE_WORDS = { done: 'done', current: 'you are here', question: 'waiting on an answer', todo: 'not started' };

// steps: [{ label, href, state: 'done'|'current'|'question'|'todo' }]; at: the index of the step on screen.
export function stepper(steps, at, { title = 'Step', nav = true } = {}) {
  const done = steps.filter((x) => x.state === 'done').length;
  const prev = steps[at - 1], next = steps[at + 1];
  return h('nav', { class: 'stepper', 'aria-label': 'Progress' },
    h('div', { class: 'stepper-head' },
      h('span', { class: 'stepper-at' }, title + ' ' + (at + 1) + ' of ' + steps.length),
      h('span', { class: 'stepper-done' }, done + ' of ' + steps.length + ' done')),
    h('ol', { class: 'stepper-bar' }, steps.map((x, i) => h('li', { class: 'stepper-seg is-' + x.state + (i === at ? ' is-at' : '') },
      h('a', { href: x.href, 'aria-current': i === at ? 'step' : null, 'aria-label': (i + 1) + '. ' + x.label + ', ' + STATE_WORDS[x.state] },
        h('span', { class: 'stepper-mark', 'aria-hidden': 'true' }, x.state === 'done' ? '✓' : x.state === 'question' ? '?' : String(i + 1)))))),
    nav ? h('div', { class: 'stepper-nav' },
      prev ? h('a', { class: 'btn small', href: prev.href }, '‹ ' + prev.label) : h('span'),
      next ? h('a', { class: 'btn small', href: next.href }, next.label + ' ›') : null) : null);
}
