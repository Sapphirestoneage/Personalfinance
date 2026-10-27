// The subscription audit (overnight Track G): ranked by cost a year, cost per use, cancel candidates add up.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readJson, loadRules } from './spine-helpers.js';
import { loadHousehold } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';
import { summarize } from '../engine/summary.js';
import { subscriptionAudit } from '../engine/subscriptions.js';
import { putFact, markSubscription } from '../engine/edits.js';
import { validate } from '../engine/schema.js';

const R = loadRules();
const demo = () => applyDefaults(loadHousehold(readJson('fixtures/demo.json')), R);

test('ranked by cost a year; uses give cost per use; candidates add up', () => {
  let s = demo();
  for (const id of ['gym', 'phone']) if (s.expenses.some((e) => e.id === id)) s = markSubscription(s, id, true, '2026-10-27');
  const a0 = subscriptionAudit(s, summarize(s, R).subs);
  assert.ok(a0.rows.length >= 2);
  assert.ok(a0.rows.every((r, i) => !i || (r.yearly ?? -1) <= (a0.rows[i - 1].yearly ?? -1)), 'most a year first');
  assert.equal(a0.freedMonthly, 0);
  assert.ok(a0.rows.every((r) => r.uses === null && r.perUse === null), 'old files: not answered');
  const [top, next] = a0.rows;
  s = putFact(s, 'expenses.' + top.id + '.usesPerMonth', 4, 'known', '2026-10-27');
  s = putFact(s, 'expenses.' + top.id + '.cancelCandidate', true, 'known', '2026-10-27');
  s = putFact(s, 'expenses.' + next.id + '.cancelCandidate', true, 'known', '2026-10-27');
  const a = subscriptionAudit(s, summarize(s, R).subs);
  const t = a.rows.find((r) => r.id === top.id);
  assert.equal(t.perUse, Math.round(top.monthly / 4 * 100) / 100);
  assert.equal(a.candidates, 2);
  assert.equal(a.freedMonthly, Math.round((top.monthly + next.monthly) * 100) / 100);
  assert.equal(a.freedYearly, Math.round(a.freedMonthly * 12 * 100) / 100);
  assert.ok(validate(s).ok, validate(s).errors.map((e) => e.path + ' ' + e.message).join('; '));
});

test('the demo marks Streaming and Gym as subscriptions; each stays on its pay day on the Calendar (morning answer 6)', async () => {
  const { calendar } = await import('../engine/calendar.js');
  const s = demo();
  const a = subscriptionAudit(s, summarize(s, R).subs);
  assert.deepEqual(a.rows.map((r) => r.id).sort(), ['gym', 'streaming']);
  const oct = calendar(s, R, { from: '2026-10', months: 1 }).months[0];
  assert.equal(oct.events.find((e) => e.sourceId === 'gym').date, '2026-10-01', 'a guessed renewal date never hides the typed pay day');
  assert.equal(oct.events.find((e) => e.sourceId === 'streaming').date, '2026-10-05');
});
