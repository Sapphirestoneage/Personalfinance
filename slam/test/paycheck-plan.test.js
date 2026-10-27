// Every dollar of each paycheck (overnight Track D): jobs add up; a short paycheck is carried by the one before it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { paycheckPlan } from '../engine/plan.js';

const pc = (date, amount, bills, everyday = 0) => ({ date, label: 'Pay', amount, setAside: 0, envelopes: bills.map((b, i) => ({ date, label: 'Bill ' + i, amount: b })), everyday, free: amount - bills.reduce((a, b) => a + b, 0) - everyday });

test('each paycheck is fully assigned, with a carry to a short one', () => {
  const alloc = { paychecks: [pc('2026-11-01', 2000, [500], 300), pc('2026-11-15', 2000, [1900], 400), pc('2026-12-01', 2000, [200], 300)], bonusMonths: [] };
  const p = paycheckPlan(alloc, { step: { id: 'reserves', label: 'Emergency reserves' } });
  const [a, b, c] = p.paychecks;
  assert.equal(b.free, -300);
  assert.equal(a.carryOut, 300); assert.equal(a.carryTo, '2026-11-15');
  assert.equal(b.carryIn, 300); assert.equal(b.carryInFrom, '2026-11-01'); assert.equal(b.left, 0);
  for (const x of p.paychecks) assert.equal(x.assigned, Math.round((x.amount + x.carryIn) * 100) / 100, 'every dollar has a job');
  assert.equal(a.jobs[a.jobs.length - 1].label, 'Emergency reserves');
  assert.equal(a.jobs.find((j) => j.kind === 'plan').amount, 900);
  assert.equal(c.carryIn, 0);
  assert.equal(p.fromChecking, 0);
});

test('two short paychecks in a row pull from the one before both; a short first comes from checking', () => {
  const p = paycheckPlan({ paychecks: [pc('a', 3000, [1000]), pc('b', 1000, [1200]), pc('c', 1000, [1100])], bonusMonths: [] });
  assert.deepEqual(p.paychecks.map((x) => [x.carryIn, x.carryOut]), [[0, 300], [300, 100], [100, 0]]);
  assert.equal(p.paychecks[0].jobs.find((j) => j.kind === 'plan').label, 'Left to assign');
  const q = paycheckPlan({ paychecks: [pc('a', 500, [800]), pc('b', 2000, [100])], bonusMonths: [] });
  assert.equal(q.fromChecking, 300);
  assert.equal(q.paychecks[0].carryInFrom, 'checking');
  assert.equal(q.paychecks[0].assigned, 800);
  assert.equal(paycheckPlan({ paychecks: [pc('a', 500, [800]), pc('b', 2000, [100])], bonusMonths: [] }, { checking: 120 }).shortBy, 180, 'checking holds $120 of the $300 needed');
  assert.equal(paycheckPlan({ paychecks: [pc('a', 500, [800])], bonusMonths: [] }, { checking: 1000 }).shortBy, 0);
});
