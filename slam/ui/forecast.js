// The one cash forecast every screen reads (audit, 2026-10-27): the same run, over the window picked (Spending and the
// Calendar share it; Today and the Plan read it too), and its one story (engine/spending.js cashStory): the lowest
// point, the floor, and the fix when checking goes under. Figured once per version of the household.

import { cashsim } from '../engine/cashsim.js';
import { cashStory } from '../engine/spending.js';
import { pickedWindow } from './window.js';
import { h, money, shortDate, ledgerHref } from './view.js';

let memo = { spine: null, rules: null, months: null, sim: null, story: null };
export function forecast(spine, rules, months = pickedWindow()) {
  if (memo.spine !== spine || memo.rules !== rules || memo.months !== months) {
    const sim = cashsim(spine, rules, { months, maybeMode: 'weighted' });
    memo = { spine, rules, months, sim, story: cashStory(sim) };
  }
  return memo;
}

// The fix as a button: "Move $219 from High-yield savings by Nov 11". It opens the savings account in My numbers.
export function fixButton(story, cls = 'btn primary small') {
  const f = story && story.fix;
  if (!f) return null;
  if (!f.from) return h('a', { class: cls, href: 'ledger.html#/assets' }, 'Add savings to cover ' + money(f.amount) + ' by ' + shortDate(f.by));
  return h('a', { class: cls, href: ledgerHref('accounts.' + f.from.id + '.balance') }, 'Move ' + money(f.amount) + ' from ' + f.from.name + ' by ' + shortDate(f.by));
}
// The floor, named one way on every page: "Your floor is $1,000."
export const floorWords = (story) => 'Your floor is ' + (story.floor === 0 ? 'zero' : money(story.floor)) + '.';
// The one floor warning (Home and the Plan draw the same card): a title, the lowest day and the floor in one line,
// the fix as its button; nothing while checking stays above the floor. last: a row the page adds under the button.
export function cashCard(spine, rules, last = null) {
  const { story } = forecast(spine, rules);
  if (!story || !story.under) return null;
  return h('section', { class: 'card flag flag-red cash-first', id: 'cash-low', 'aria-labelledby': 'cash-low-h' },
    h('h2', { id: 'cash-low-h' }, 'Checking goes under your floor'),
    h('p', { class: 'flag-line' }, lowWords(story) + '. ' + floorWords(story)),
    h('div', { class: 'flag-actions' }, fixButton(story, 'btn small')),
    last);
}
// One line: "Lowest: $812 on Nov 14" or "You stay above your floor through Nov 15".
export const lowWords = (story) => (!story ? null : story.under ? 'Lowest: ' + money(story.low.amount) + ' on ' + shortDate(story.low.date) + (story.low.beforePayday ? ', the day before payday' : '') : 'Lowest: ' + money(story.low.amount) + ' on ' + shortDate(story.low.date) + '. You stay above your floor through ' + shortDate(story.through) + '.');
