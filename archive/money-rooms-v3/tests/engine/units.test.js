import { test } from 'node:test';
import assert from 'node:assert/strict';
import { q, U, add, sub, sum, scale, toMonthly, toAnnual, ratio, needs, isNeeds, UnitError, cadenceToMonthly, weightedConfidence } from '../../engine/units.js';

test('a quantity carries period, basis and tax', () => {
  const a = q(184700, U.monthlyAfter);
  assert.equal(a.cents, 184700);
  assert.equal(a.period, 'monthly');
  assert.equal(a.basis, 'real');
  assert.equal(a.tax, 'aftertax');
  assert.equal(a.confidence, 1);
  assert.equal(a.rough, false);
});

test('cents must be an integer', () => {
  assert.throws(() => q(12.5, U.monthlyAfter), UnitError);
  assert.throws(() => q(NaN, U.monthlyAfter), UnitError);
  assert.throws(() => q(Infinity, U.monthlyAfter), UnitError);
});

test('adding monthly to annual throws', () => {
  assert.throws(() => add(q(100, U.monthlyAfter), q(100, U.annualAfter)), UnitError);
  assert.throws(() => add(q(100, U.monthlyAfter), q(100, U.monthlyPre)), UnitError);
  assert.throws(() => sub(q(100, U.monthlyAfter), q(100, { period: 'monthly', basis: 'nominal', tax: 'aftertax' })), UnitError);
});

test('same units add, with dollar-weighted confidence', () => {
  const a = q(500000, U.monthlyAfter, { confidence: 1 });
  const b = q(500, U.monthlyAfter, { confidence: 0 });
  const c = add(a, b);
  assert.equal(c.cents, 500500);
  assert.ok(c.confidence > 0.99 && c.confidence < 1);
});

test('needs wins over a number and carries every missing input', () => {
  const r = add(needs(['rent']), add(q(1, U.monthlyAfter), needs('gross pay')));
  assert.ok(isNeeds(r));
  assert.deepEqual(r.needs.slice().sort(), ['gross pay', 'rent']);
});

test('ranges add and subtract conservatively', () => {
  const a = q(175000, U.monthlyAfter, { range: { low: 150000, high: 200000 }, confidence: 0.6 });
  const b = q(100000, U.monthlyAfter);
  assert.deepEqual(add(a, b).range, { low: 250000, high: 300000 });
  assert.deepEqual(sub(b, a).range, { low: -100000, high: -50000 });
  assert.equal(add(a, b).rough, true);
});

test('monthly to annual and back', () => {
  const m = q(100000, U.monthlyAfter);
  assert.equal(toAnnual(m).cents, 1200000);
  assert.equal(toAnnual(m).period, 'annual');
  assert.equal(toMonthly(toAnnual(m)).cents, 100000);
  assert.throws(() => toMonthly(q(5, U.oneoff)), UnitError);
});

test('cadence to monthly', () => {
  assert.equal(cadenceToMonthly(100000, 'month'), 100000);
  assert.equal(cadenceToMonthly(1200000, 'year'), 100000);
  assert.equal(cadenceToMonthly(300000, 'paycheck', 26), 650000);
  assert.equal(cadenceToMonthly(300000, 'paycheck', 24), 600000);
  assert.equal(cadenceToMonthly(999, 'oneoff'), 0);
  assert.throws(() => cadenceToMonthly(1, 'weekly'), UnitError);
});

test('ratio needs the same period and a non-zero denominator', () => {
  const r = ratio(q(50000, U.monthlyAfter), q(200000, U.monthlyAfter));
  assert.equal(r.value, 0.25);
  assert.ok(isNeeds(ratio(q(1, U.monthlyAfter), q(0, U.monthlyAfter))));
  assert.throws(() => ratio(q(1, U.monthlyAfter), q(1, U.annualAfter)), UnitError);
});

test('sum of an empty list is a confident zero', () => {
  const s = sum([], U.monthlyAfter);
  assert.equal(s.cents, 0);
  assert.equal(s.confidence, 1);
});

test('scale keeps units and rounds to cents', () => {
  const s = scale(q(100001, U.monthlyAfter), 0.5);
  assert.equal(s.cents, 50001);
  assert.equal(s.period, 'monthly');
});

test('weighted confidence favours the big dollars', () => {
  assert.equal(weightedConfidence([{ cents: 900000, confidence: 1 }, { cents: 100000, confidence: 0 }]), 0.9);
});
