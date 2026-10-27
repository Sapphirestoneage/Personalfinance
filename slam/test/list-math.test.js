// Show the math for lists (overnight Track L): subscriptions, covered by others, owed to you; each adds up to its total.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readJson, loadRules } from './spine-helpers.js';
import { loadHousehold } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';
import { summarize } from '../engine/summary.js';
import { explainMetric } from '../engine/math.js';
import { markSubscription } from '../engine/edits.js';
import { owedToYou, owedTotal } from '../engine/owed.js';

const R = loadRules();
const demo = () => applyDefaults(loadHousehold(readJson('fixtures/demo.json')), R);
const add = (terms) => Math.round(terms.reduce((a, t) => a + (t.value ?? 0), 0) * 100) / 100;

test('subscriptions, covered and owed each add up to the total the screen shows', () => {
  let s = demo();
  for (const id of ['gym', 'phone']) s = markSubscription(s, id, true, '2026-10-27');
  const x = summarize(s, R), ctx = { spine: s, rules: R, s: x };
  const subs = explainMetric('list:subs', ctx);
  assert.equal(subs.value, x.subs.monthly.value);
  assert.equal(add(subs.terms), subs.value);
  const owed = explainMetric('list:owed', ctx);
  assert.equal(owed.value, owedTotal(s, s.meta.asOf));
  const one = owedToYou(s)[0];
  assert.equal(explainMetric('list:owed:' + one.key, ctx).value, one.total);
  const cov = explainMetric('list:covered', ctx);
  assert.equal(add(cov.terms), cov.value ?? 0);
});
