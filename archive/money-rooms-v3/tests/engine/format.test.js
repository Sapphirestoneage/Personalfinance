import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as F from '../../engine/format.js';

test('dollars: commas, no cents at or above $1,000, cents below', () => {
  assert.equal(F.dollars(184700), '$1,847');
  assert.equal(F.dollars(100000), '$1,000');
  assert.equal(F.dollars(99999), '$999.99');
  assert.equal(F.dollars(84750), '$847.50');
  assert.equal(F.dollars(320000000), '$3,200,000');
  assert.equal(F.dollars(0), '$0');
});

test('negatives lead with a hyphen-minus, never $-0', () => {
  assert.equal(F.dollars(-125000), '-$1,250');
  assert.equal(F.dollars(-50), '-$0.50');
  assert.equal(F.dollars(-0), '$0');
});

test('rough gets a tilde; ranges read as "to"', () => {
  assert.equal(F.dollars(180000, { rough: true }), '~$1,800');
  assert.equal(F.range(150000, 200000), '$1,500 to $2,000');
  assert.equal(F.range(150000, 200000, { rough: true }), '~$1,500 to $2,000');
});

test('percent one decimal, months whole, dates like Oct 2026', () => {
  assert.equal(F.percent(0.2345), '23.5%');
  assert.equal(F.percent(0.5), '50.0%');
  assert.equal(F.percent(0.0), '0.0%');
  assert.equal(F.months(7.4), '7 months');
  assert.equal(F.months(1), '1 month');
  assert.equal(F.months(7.6, { bare: true }), '8');
  assert.equal(F.date('2026-10'), 'Oct 2026');
  assert.equal(F.date('2027-03-15'), 'Mar 2027');
  assert.equal(F.dateLong('2026-10-05'), 'Oct 5, 2026'); assert.equal(F.dateShort('2026-10-09'), 'Oct 9');
});

test('null is empty, NaN throws', () => {
  assert.equal(F.dollars(null), '');
  assert.equal(F.percent(undefined), '');
  assert.equal(F.date(null), '');
  assert.throws(() => F.dollars(NaN));
  assert.throws(() => F.percent(Infinity));
  assert.throws(() => F.date('soon'));
});

test('compact for axes', () => {
  assert.equal(F.dollarsCompact(125000000), '$1.3M');
  assert.equal(F.dollarsCompact(45000000), '$450k');
  assert.equal(F.dollarsCompact(80000), '$800');
  assert.equal(F.dollarsCompact(-250000), '-$2.5k');
});

test('parseMoney handles typing in a hurry', () => {
  assert.equal(F.parseMoney('1,847'), 184700);
  assert.equal(F.parseMoney('$1,847.50'), 184750);
  assert.equal(F.parseMoney('2k'), 200000);
  assert.deepEqual(F.parseMoney('1500-2000'), { low: 150000, high: 200000 });
  assert.deepEqual(F.parseMoney('1,500 to 2,000'), { low: 150000, high: 200000 });
  assert.equal(F.parseMoney(''), null);
  assert.throws(() => F.parseMoney('abc'));
});

test('age at a date', () => {
  assert.equal(F.ageAt('1999-03-14', '2026-10-05'), 27);
  assert.equal(F.ageAt('1999-12-14', '2026-10-05'), 26);
});

test('value formats any engine shape', () => {
  assert.equal(F.value({ status: 'ok', cents: 184700, rough: false }), '$1,847');
  assert.equal(F.value({ status: 'ok', cents: 184700, rough: true }), '~$1,847');
  assert.equal(F.value({ status: 'ok', kind: 'ratio', value: 0.123, rough: false }), '12.3%');
  assert.equal(F.value({ status: 'ok', kind: 'count', unit: 'months', value: 6.4 }), '6 months');
  assert.equal(F.value({ status: 'ok', kind: 'date', value: '2041-06' }), 'Jun 2041');
  assert.equal(F.value({ status: 'needs', needs: ['rent'] }), '');
});

test('journal timestamps show in the browser\'s local time, whatever the zone (MR-057)', () => {
  const local = new Date(2026, 9, 7, 21, 45); /* 7 Oct 2026, 9:45 pm where this test runs */
  assert.equal(F.dateTimeLocal(local.toISOString()), 'Oct 7, 2026, 9:45 pm');
  assert.equal(F.dateLocal(local.toISOString()), 'Oct 7, 2026');
  assert.equal(F.dateTimeLocal(new Date(2026, 0, 3, 0, 5).toISOString()), 'Jan 3, 2026, 12:05 am');
  assert.equal(F.dateTimeLocal(''), ''); assert.equal(F.dateLocal('nope'), '');
});
