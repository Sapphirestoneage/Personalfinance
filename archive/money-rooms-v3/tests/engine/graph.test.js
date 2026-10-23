/* The dependency graph (MR-041): acyclic, no orphans, every metric reaches a
   root, every root reaches the FI date or says on purpose why it does not. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph, cycles, orphans, rootsOf, reachesFiDate, pathsToFiDate, netSign, upstream, downstream, metricsFed, isRoot, FAMILIES } from '../../engine/graph.js';
import { loadData } from './load-data.js';

const data = loadData();
const g = buildGraph(data);

test('the graph has every root, slot and metric as a node and no cycles', () => {
  Object.keys(data.fields.fields).forEach(id => assert.ok(g.nodes.has(id), 'field ' + id));
  data.metrics.metrics.forEach(m => assert.ok(g.nodes.has('m.' + m.id), 'metric ' + m.id));
  assert.ok(g.nodes.has('income.takeHomeMonthly') && g.nodes.has('projection') && g.nodes.has('m.fiDate'));
  assert.deepEqual(cycles(g), []);
});
test('no orphans', () => { assert.deepEqual(orphans(g), []); });
test('every metric reaches at least one root', () => {
  data.metrics.metrics.forEach(m => assert.ok(rootsOf(g, m.id).length > 0, m.id + ' has no root'));
});
test('every root reaches the FI date or is marked as not affecting it on purpose', () => {
  const miss = [];
  g.nodes.forEach(n => { if (!isRoot(n)) return; if (!reachesFiDate(g, n.id) && !n.noFiEffect) miss.push(n.id); if (reachesFiDate(g, n.id) && n.noFiEffect) miss.push(n.id + ' (marked but reaches)'); });
  assert.deepEqual(miss, []);
});
test('every root has one lever family and every edge a sign', () => {
  g.nodes.forEach(n => { if (isRoot(n)) assert.ok(FAMILIES.indexOf(n.family) !== -1, n.id + ' family ' + n.family); });
  g.edges.forEach(e => assert.ok(e.sign === 1 || e.sign === -1, e.from + '>' + e.to));
});
test('signs are derivatives: spending raises the FI number and delays the date; contributions pull it in; the withdrawal rate lowers every rung', () => {
  assert.equal(netSign(g, 'amount', 'm.fiNumber'), 1, 'more spending, a bigger number');
  assert.equal(netSign(g, 'amount', 'm.fiDate'), 1, 'more spending, a later date');
  assert.equal(netSign(g, 'grossPay', 'm.takeHome'), 1);
  assert.equal(netSign(g, 'contribAmount', 'm.fiDate'), -1, 'more invested, an earlier date');
  assert.equal(netSign(g, 'baristaIncome', 'm.baristaRegularFi'), -1);
  ['m.leanFi', 'm.regularFi', 'm.fatFi', 'm.baristaRegularFi'].forEach(id => assert.equal(netSign(g, 'asm.withdrawalRate', id), -1, id));
  assert.ok(pathsToFiDate(g, 'amount').length > 0 && pathsToFiDate(g, 'amount').every(p => p.nodes[0] === 'amount' && p.nodes[p.nodes.length - 1] === 'm.fiDate'));
  assert.ok(upstream(g, 'm.fiDate').has('grossPay') && downstream(g, 'grossPay').has('m.fiDate'));
  assert.ok(metricsFed(g, 'baristaIncome').some(m => m.id === 'm.baristaRegularFi'));
});
