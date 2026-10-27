import test from 'node:test';
import assert from 'node:assert/strict';
import { loadHousehold } from '../engine/normalize.js';
import { validate } from '../engine/schema.js';
import { cardCharges } from '../engine/ledger.js';
import { chargeTo } from '../engine/edits.js';
import { getAt } from '../engine/spine.js';
import { readJson } from './spine-helpers.js';

const demo = () => loadHousehold(readJson('fixtures/demo.json'));
const T = '2026-10-27';

// Expenses attached to a card (owner's ask, 2026-10-27): the link is the expense's Paid from.
test('attach expenses to a card, list them with a monthly total, and take one off', () => {
  let s = demo();
  assert.deepEqual(cardCharges(s, 'visa'), { items: [], total: null });
  s = chargeTo(s, 'streaming', 'visa', T);
  s = chargeTo(s, 'gym', 'visa', T);
  const c = cardCharges(s, 'visa');
  assert.deepEqual(c.items.map((x) => [x.id, x.monthly, x.path]), [['streaming', 40, 'expenses.streaming.amount'], ['gym', 50, 'expenses.gym.amount']]);
  assert.equal(c.total, 90);
  s = chargeTo(s, 'gym', null, T);
  assert.deepEqual(getAt(s, 'expenses.gym.paidFrom'), { value: null, kind: 'missing', asOf: T, source: 'ledger' }, 'taken off: not given, never a silent account');
  assert.equal(cardCharges(s, 'visa').total, 40);
  assert.ok(validate(s).ok);
});
