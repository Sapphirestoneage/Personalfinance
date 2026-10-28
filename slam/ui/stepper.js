// The progress tracker for a run of steps (owner, 2026-10-27, S-265): the Plan's steps and the Session's steps.
// "Step 2 of 9" and how many are done, a bar of one segment per step (done, now, waiting on an answer, ahead; each a
// link to its step, its state also said in words for screen readers), and Back and Next naming the steps either side.
// Formatting only.

import { h } from './view.js';

const STATE_WORDS = { done: 'done', current: 'you are here', question: 'waiting on an answer', todo: 'not started' };

// steps: [{ label, href, state: 'done'|'current'|'question'|'todo', sub }]; at: the index of the step on screen.
// Each segment names its step and, under it, what is in it ("2 debts", "Not started"; owner, 2026-10-28: a bare
// checkmark said nothing). doneMeans: one line on what a checkmark means here, shown under the bar.
export function stepper(steps, at, { title = 'Step', nav = true, doneMeans = null, doneWord = 'done' } = {}) {
  const done = steps.filter((x) => x.state === 'done').length;
  const prev = steps[at - 1], next = steps[at + 1];
  return h('nav', { class: 'stepper', 'aria-label': 'Progress' },
    h('div', { class: 'stepper-head' },
      h('span', { class: 'stepper-at' }, title + ' ' + (at + 1) + ' of ' + steps.length),
      h('span', { class: 'stepper-done' }, done + ' of ' + steps.length + ' ' + doneWord)),
    h('ol', { class: 'stepper-bar' }, steps.map((x, i) => h('li', { class: 'stepper-seg is-' + x.state + (i === at ? ' is-at' : '') },
      h('a', { href: x.href, 'aria-current': i === at ? 'step' : null, 'aria-label': (i + 1) + '. ' + x.label + ', ' + STATE_WORDS[x.state] + (x.sub ? ', ' + x.sub : '') },
        h('span', { class: 'stepper-mark', 'aria-hidden': 'true' }, x.state === 'done' ? '✓' : x.state === 'question' ? '?' : String(i + 1)),
        h('span', { class: 'stepper-name', 'aria-hidden': 'true' }, x.label),
        x.sub ? h('span', { class: 'stepper-sub', 'aria-hidden': 'true' }, x.sub) : null)))),
    doneMeans ? h('p', { class: 'stepper-means' }, doneMeans) : null,
    nav ? h('div', { class: 'stepper-nav' },
      prev ? h('a', { class: 'btn small', href: prev.href }, '‹ ' + prev.label) : h('span'),
      next ? h('a', { class: 'btn small', href: next.href }, next.label + ' ›') : null) : null);
}

// What a step is for (Batch 8, S-278): one collapsed line, "What this step is for  2 of 4", that opens to its purpose
// and a live checkmark for each thing it needs. checks: [{ words, done }].
export function purposeCard(purpose, checks) {
  const n = checks.filter((c) => c.done).length;
  return h('details', { class: 'card done-group purpose-card' },
    h('summary', {}, h('span', { class: 'purpose-title' }, 'What this step is for'), checks.length ? h('span', { class: 'purpose-count' }, n + ' of ' + checks.length + ' in') : null),
    h('p', { class: 'purpose-words' }, purpose),
    checks.length ? h('ul', { class: 'purpose-checks' }, checks.map((c) => h('li', { class: c.done ? 'is-done' : null }, h('span', { class: 'purpose-mark', 'aria-hidden': 'true' }, c.done ? '✓' : '○'), h('span', {}, c.words), h('span', { class: 'sr-only' }, c.done ? ' (in)' : ' (not yet)')))) : null);
}
// The end of a step: what the client has now, and what the next step opens (a link).
export function nowHave(have, unlocks, href) {
  return h('p', { class: 'now-have' }, h('span', {}, 'You now have: ', h('strong', {}, have), '. '), unlocks ? h('span', {}, 'Next this unlocks: ', h('a', { href }, unlocks), '.') : null);
}
