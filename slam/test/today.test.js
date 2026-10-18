// Today (S-106): which step of the loop is now, and the first-session checklist.
// Every expected answer is worked out by hand in the comments.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newHousehold } from '../src/store/schema.js';
import { migrate } from '../src/store/migrate.js';
import { makeValue } from '../src/store/value.js';
import { addIncome, findCategory } from '../src/store/edits.js';
import { addAccount } from '../src/store/accounts.js';
import { loopStep, firstSession } from '../src/calc/loop.js';
import { buildSummary } from '../src/calc/summary.js';
import { loadRefs } from './helpers.js';

const refs = loadRefs();
const strip = (state, entries) => ({ month: '2026-10', plan: { state }, track: { entries } });

test('the loop step: plan, then track, then review in the last three days', () => {
  // October has 31 days, so Review starts on the 29th (31 - 2).
  assert.equal(loopStep(strip('not started', 0), '2026-10-02'), 'plan');
  // One entry logged: tracking has started even with no plan.
  assert.equal(loopStep(strip('not started', 1), '2026-10-02'), 'track');
  assert.equal(loopStep(strip('started', 0), '2026-10-17'), 'track');
  assert.equal(loopStep(strip('started', 12), '2026-10-28'), 'track');
  assert.equal(loopStep(strip('started', 12), '2026-10-29'), 'review');
  // The month is over but not closed yet: review it.
  assert.equal(loopStep(strip('reviewed', 40), '2026-11-03'), 'review');
  // February 2026 has 28 days: Review from the 26th.
  assert.equal(loopStep({ month: '2026-02', plan: { state: 'started' }, track: { entries: 3 } }, '2026-02-25'), 'track');
  assert.equal(loopStep({ month: '2026-02', plan: { state: 'started' }, track: { entries: 3 } }, '2026-02-26'), 'review');
});

test('the first session: five things, each done by an answer, not a number', () => {
  const d = migrate(newHousehold('First'));
  const fs = () => firstSession(d, buildSummary(d, refs));
  // A new client: nothing answered. Filing status has a default, so it is not one of the five.
  assert.deepEqual(fs().items.map((i) => [i.key, i.done]), [['gut', false], ['basics', false], ['income', false], ['rough', false], ['accounts', false]]);
  assert.equal(fs().left, 5);

  d.gut = makeValue(3000);
  Object.assign(d.profile, { birthYear: 1995, state: 'OH' });
  d.situation = ['employed'];
  // Basics needs who you live with too.
  assert.equal(fs().items[1].done, false);
  d.household.livingWith = 'alone';
  assert.deepEqual(fs().items.map((i) => i.done), [true, true, false, false, false]);

  addIncome(d, { type: 'w2', label: 'Job' });
  // An income with nothing typed is not done (blank is not zero).
  assert.equal(fs().items[2].done, false);
  d.income[0].takeHome = makeValue(2000);
  assert.equal(fs().items[2].done, true);

  // Rough: all 10 categories other than Debt payments (computed) need an answer.
  // Nine answered, one left blank: not done.
  const ids = ['housing', 'food', 'transport', 'health', 'bills', 'fun', 'annual', 'fees', 'giving', 'savings'];
  for (const id of ids.slice(0, 9)) findCategory(d, id).estimate = makeValue(100);
  assert.equal(fs().items[3].done, false);
  // "Doesn't apply" is an answer, and so is a typed 0.
  findCategory(d, 'savings').estimate = makeValue(0);
  findCategory(d, 'giving').estimate = makeValue(null, { status: 'not-for-me' });
  assert.equal(fs().items[3].done, true);

  addAccount(d, { name: 'Checking', type: 'checking' });
  assert.equal(fs().done, true);
  assert.equal(fs().left, 0);
});
