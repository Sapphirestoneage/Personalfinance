/* explain() (Level 12, MR-063): a metric's move between two records, root by root, from the engine's own reruns. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compute } from '../../engine/compute.js';
import { setField } from '../../engine/record.js';
import { buildGraph, explain, through, downstream } from '../../engine/graph.js';
import { numOf } from '../../engine/momentum.js';
import { loadData, loadHousehold } from './load-data.js';

const data = loadData(); const g = buildGraph(data); const TODAY = '2026-10-08';
const run = r => compute(r, data, { today: TODAY, light: true });

test('spending reaches the FI date through both the FI number and the surplus', () => {
  const down = downstream(g, 'amount');
  ['m.fiNumber', 'm.surplus', 'm.fiDate', 'm.savingsRateTakeHome'].forEach(id => assert.ok(down.has(id), 'amount reaches ' + id));
  const path = through(g, 'amount', 'm.fiDate').map(n => n.id);
  assert.ok(path.includes('spending.baselineMonthly') && path.includes('projection'), path.join(' > '));
  assert.ok(through(g, 'amount', 'm.fiNumber').some(n => n.kind === 'slot'));
});

test('a single spending change explains the whole move of the FI number and the savings rate', () => {
  const before = loadHousehold('maya'); const after = JSON.parse(JSON.stringify(before));
  const rent = after.planets.spending.rows.find(r => r.nickname === 'Rent');
  setField(after, rent.id, 'amount', rent.f.amount.v + 20000, 'known', 'client', { cad: 'month', now: '2026-10-07T10:00:00.000Z' });
  const ex = explain(g, 'fiNumber', before, after, { compute: run, numOf });
  assert.ok(ex.total > 0, 'FI number rose: ' + ex.total);
  assert.equal(ex.parts.length, 1); assert.equal(ex.parts[0].root, 'amount'); assert.equal(ex.parts[0].changes, 1);
  assert.equal(ex.parts[0].delta, ex.total); assert.equal(ex.other, 0); assert.equal(ex.rowsAdded, 0);
  assert.equal(ex.parts[0].sign, 1);
  const sr = explain(g, 'savingsRateTakeHome', before, after, { compute: run, numOf });
  assert.ok(sr.total < 0 && Math.abs(sr.parts[0].delta - sr.total) < 1e-6, JSON.stringify(sr));
});

test('two roots share a move, each put back on its own; an added row lands in other', () => {
  const before = loadHousehold('maya'); const after = JSON.parse(JSON.stringify(before));
  const rent = after.planets.spending.rows.find(r => r.nickname === 'Rent'); const job = after.planets.income.rows.find(r => r.type === 'w2');
  setField(after, rent.id, 'amount', rent.f.amount.v + 10000, 'known', 'client', { cad: 'month' });
  setField(after, job.id, 'takeHome', job.f.takeHome.v + 10000, 'known', 'client', { cad: job.f.takeHome.cad });
  const ex = explain(g, 'surplus', before, after, { compute: run, numOf });
  const roots = ex.parts.map(p => p.root).sort(); assert.deepEqual(roots, ['amount', 'takeHome']);
  assert.ok(Math.abs(ex.parts.reduce((s, p) => s + p.delta, 0) + ex.other - ex.total) < 1e-6, 'parts and other add to the total');
  assert.ok(ex.parts.find(p => p.root === 'amount').delta < 0 && ex.parts.find(p => p.root === 'takeHome').delta > 0);
  const same = explain(g, 'surplus', before, before, { compute: run, numOf }); assert.equal(same.total, 0); assert.equal(same.parts.length, 0);
});
