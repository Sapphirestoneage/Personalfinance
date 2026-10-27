// Two features FEATURES.md listed with no tests (overnight Track L): the quarterly review of subscriptions, and sorting
// a log entry onto a line with the store learned.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readJson, loadRules } from './spine-helpers.js';
import { loadHousehold } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';
import { summarize } from '../engine/summary.js';
import { markSubscription, putFact } from '../engine/edits.js';
import { sortEntry, setMerchantRule, merchantRules, budgetView } from '../engine/budget.js';
import { addDays } from '../engine/spine.js';

const R = loadRules();
const demo = () => applyDefaults(loadHousehold(readJson('fixtures/demo.json')), R);

test('quarterly review: never looked at is due; looked at recently is not; past the review days it is due again', () => {
  let s = markSubscription(demo(), 'gym', true, '2026-10-01');
  const asOf = s.meta.asOf, days = R.get('SUB_REVIEW_DAYS', +asOf.slice(0, 4));
  const gym = () => summarize(s, R).subs.items.find((i) => i.id === 'gym');
  assert.equal(gym().due, true, 'never looked at');
  s = putFact(s, 'expenses.gym.reviewed', addDays(asOf, -10), 'known', asOf);
  assert.equal(gym().due, false);
  s = putFact(s, 'expenses.gym.reviewed', addDays(asOf, -(days + 1)), 'known', asOf);
  assert.equal(gym().due, true, 'past ' + days + ' days');
});

test('sorting an entry puts it on the line and learns its store; a rule can be removed', () => {
  let s = demo();
  const e = s.log.find((x) => x.kind === 'spend' && !x.expenseId && x.merchant);
  assert.ok(e, 'the demo has an unsorted purchase');
  const before = budgetView(s, R, { ym: e.date.slice(0, 7) }).notSorted.length;
  s = sortEntry(s, e.id, { expenseId: 'groceries' });
  const after = s.log.find((x) => x.id === e.id);
  assert.equal(after.expenseId, 'groceries');
  assert.equal(budgetView(s, R, { ym: e.date.slice(0, 7) }).notSorted.length, before - 1);
  assert.ok(merchantRules(s).some((r) => r.merchant === e.merchant && r.expenseId === 'groceries'));
  s = setMerchantRule(s, e.merchant, null);
  assert.ok(!merchantRules(s).some((r) => r.merchant === e.merchant));
});
