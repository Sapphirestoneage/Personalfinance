import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STATES, SOURCES, STATE_ORDER, SOURCE_ORDER, confidenceOf, hasValue, numberOf, rangeOf, isRough, needsFollowUp, plateOf, field, stateByKey, sourceByKey } from '../../engine/states.js';

test('eight states, seven sources, one keystroke each and no key shared', () => {
  assert.equal(STATE_ORDER.length, 8);
  assert.equal(SOURCE_ORDER.length, 7); /* discovery joined in Level 8 (MR-045) */
  const keys = STATE_ORDER.map(s => STATES[s].key);
  assert.equal(new Set(keys).size, 8);
  const skeys = SOURCE_ORDER.map(s => SOURCES[s].key);
  assert.equal(new Set(skeys).size, 7);
  assert.equal(stateByKey('r').id, 'rough');
  assert.equal(sourceByKey('e').id, 'estimated');
});

test('confidence by state, capped by source', () => {
  assert.equal(confidenceOf(field(100, 'verified', 'client')), 1.0);
  assert.equal(confidenceOf(field(100, 'known', 'client')), 0.9);
  assert.equal(confidenceOf(field(100, 'rough', 'client')), 0.6);
  assert.equal(confidenceOf(field(100, 'will-send', 'client')), 0.3);
  assert.equal(confidenceOf(field(null, 'unknown', 'client')), 0);
  assert.equal(confidenceOf(field(0, 'none', 'client')), 1.0);
  assert.equal(confidenceOf(field(100, 'known', 'lookup-confirmed')), 0.85);
  assert.equal(confidenceOf(field(100, 'known', 'lookup-verify')), 0.7);
  assert.equal(confidenceOf(field(100, 'known', 'estimated')), 0.5);
  assert.equal(confidenceOf(field(100, 'known', 'inferred'), 0.6), 0.6);
});

test('empty is not zero: unknown has no value, none is a real zero', () => {
  assert.equal(hasValue(field(null, 'unknown', 'client')), false);
  assert.equal(numberOf(field(null, 'unknown', 'client')), null);
  assert.equal(hasValue(field(0, 'none', 'client')), true);
  assert.equal(numberOf(field(0, 'none', 'client')), 0);
  assert.equal(hasValue(field(5, 'not-applicable', 'client')), false);
  assert.equal(hasValue(field(5, 'not-for-me', 'client')), false);
});

test('a range is rough, uses the midpoint and keeps the range', () => {
  const f = field({ low: 150000, high: 200000 }, 'known', 'client');
  assert.equal(f.state, 'rough');
  assert.equal(numberOf(f), 175000);
  assert.deepEqual(rangeOf(f), { low: 150000, high: 200000 });
  assert.equal(isRough(f), true);
});

test('follow-up and plates', () => {
  assert.equal(needsFollowUp(field(1, 'known', 'client')), false);
  assert.equal(plateOf(field(null, 'unknown', 'client')), 'theirs');
  assert.equal(plateOf(field(1, 'rough', 'client')), 'theirs');
  assert.equal(plateOf(field(1, 'known', 'estimated')), 'mine');
  assert.equal(plateOf(field(1, 'known', 'lookup-verify')), 'mine');
  assert.equal(isRough(field(1, 'known', 'estimated')), true);
  assert.equal(isRough(field(1, 'known', 'lookup-verify')), false);
});

test('a typed date (MR-091): slashes, dashes, digits only, two-digit years, and a month on its own', async () => {
  const { parseTypedDate, formatTypedDate } = await import('../../engine/parse.js');
  const T = '2026-10-13';
  ['7/1/2001', '07/01/2001', '7-1-2001', '07012001', '2001-07-01', '2001/7/1', '7/1/01', '070101'].forEach(x => assert.equal(parseTypedDate(x, 'day', T), '2001-07-01', x));
  assert.equal(parseTypedDate('7/1/30', 'day', T), '1930-07-01', 'a two-digit year never lands in the future');
  ['7/2027', '07/2027', '072027', '2027-07', '7/27', '7/1/2027'].forEach(x => assert.equal(parseTypedDate(x, 'month', T), '2027-07', x));
  ['', 'soon', '13/40/2001', '2001', '7/'].forEach(x => assert.equal(parseTypedDate(x, 'day', T), null, x));
  assert.equal(formatTypedDate('2001-07-01', 'day'), '07/01/2001'); assert.equal(formatTypedDate('2027-07', 'month'), '07/2027'); assert.equal(formatTypedDate(null, 'day'), '');
});
