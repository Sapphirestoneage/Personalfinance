// Bug sweep, step 3: every subscription has a day (the house default due day, rough, until one is typed); anything with
// a typed next charge is a subscription wherever it is filed; Paid with groups checking and cards by bank; a day can be
// set for several at once. Every household here is made up.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readJson, loadRules } from './spine-helpers.js';
import { loadHousehold } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';
import { isSubscription } from '../engine/subscriptions.js';
import { setChargeDay, markSubscription, chargeTo } from '../engine/edits.js';
import { linkOptions } from '../engine/ledger.js';
import { calendar } from '../engine/calendar.js';

const R = loadRules();
const T = '2026-10-22';
const demo = () => applyDefaults(loadHousehold(readJson('fixtures/demo.json')), R);

test('a subscription with no next charge lands on the house due day, rough; a typed day replaces it', () => {
  const s = applyDefaults(markSubscription(demo(), 'streaming', true, T), R);
  const e = s.expenses.find((x) => x.id === 'streaming');
  assert.equal(e.renews.kind, 'rough');
  assert.equal(e.renews.source, 'DEFAULT_DUE_DAY');
  assert.equal(+e.renews.value.slice(8, 10), Math.min(28, R.get('DEFAULT_DUE_DAY', 2026)));
  const cal = calendar(s, R, { months: 2 });
  assert.ok(cal.months.some((m) => m.events.some((x) => x.kind === 'subscription' && x.label === e.label && x.date)), 'on the Calendar with a date');
  const typed = applyDefaults(setChargeDay(s, 'streaming', 9, T), R).expenses.find((x) => x.id === 'streaming');
  assert.equal(typed.renews.kind, 'known');
  assert.equal(typed.renews.value, '2026-11-09');
});

test('a typed next charge makes a line a subscription; the default alone does not', () => {
  assert.equal(isSubscription({ renews: { value: '2026-11-03', kind: 'known', source: 'ledger' } }), true);
  assert.equal(isSubscription({ renews: { value: '2026-11-03', kind: 'rough', source: 'DEFAULT_DUE_DAY' } }), false);
  assert.equal(isSubscription({ subscription: { value: false, kind: 'known' }, renews: { value: '2026-11-03', kind: 'known' } }), false);
});

test('Paid with: checking and every card, grouped by bank; a card picked charges the card', () => {
  const s = demo();
  const opts = linkOptions(s, 'link:cash|card');
  for (const d of s.debts.filter((x) => x.type === 'credit_card')) assert.ok(opts.some((o) => o.value === d.id));
  const groups = opts.map((o) => o.group);
  assert.deepEqual(groups, [...groups].sort((a, b) => groups.indexOf(a) - groups.indexOf(b)), 'each bank once, together');
  const on = chargeTo(s, 'streaming', 'visa', T);
  assert.equal(on.expenses.find((x) => x.id === 'streaming').paidFrom.value, 'visa');
});
