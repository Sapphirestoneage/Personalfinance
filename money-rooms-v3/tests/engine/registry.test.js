/* The registry (Level 12, MR-063): every metric carries what the Scoreboard needs, and every id it names exists. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph } from '../../engine/graph.js';
import { ALL_CHARTS } from '../../engine/charts-all.js';
import { introduces } from '../../engine/curriculum.js';
import { loadData } from './load-data.js';

const data = loadData(); const g = buildGraph(data); const M = data.metrics.metrics;

test('every metric has a group, a direction, a client visibility, a gentle sentence, a first session and a lens or chart or lever', () => {
  const groups = Object.keys(data.metrics.scoreGroups);
  M.forEach(m => {
    assert.ok(groups.includes(m.scoreGroup), m.id + ' group ' + m.scoreGroup);
    assert.ok(['higher', 'lower', 'neutral'].includes(m.direction), m.id + ' direction');
    assert.ok([true, false, 'coach'].includes(m.clientVisible), m.id + ' clientVisible');
    assert.ok(typeof m.gentleCopy === 'string' && m.gentleCopy.includes('{value}'), m.id + ' gentleCopy');
    assert.ok(Number.isInteger(m.firstSession) && m.firstSession >= 0 && m.firstSession <= 12, m.id + ' firstSession');
    assert.ok((m.levers && m.levers.length) || m.lens || m.chart || m.direction === 'neutral', m.id + ' has no lever, lens or chart');
    if (m.chart) assert.ok(ALL_CHARTS.some(c => c.id === m.chart) || (data.charts.charts[m.chart] && data.charts.charts[m.chart].route), m.id + ' chart ' + m.chart);
    if (m.lens) assert.ok(data.lenses.lenses.some(l => l.id === m.lens), m.id + ' lens ' + m.lens);
    (m.unlock || []).forEach(r => assert.ok(g.nodes.has(r), m.id + ' unlock root ' + r));
    (m.levers || []).forEach(l => assert.ok(g.nodes.has(l.root), m.id + ' lever root ' + l.root));
    if (m.bands) { assert.ok(Array.isArray(m.bands.sources) && m.bands.sources.length, m.id + ' bands'); m.bands.sources.forEach(s => { assert.ok(s.id && s.label && Array.isArray(s.healthy) && s.healthy.length === 2, m.id + ' band source ' + s.id); }); }
    if (m.milestones) { assert.ok(Array.isArray(m.milestones) && m.milestones.length >= 1, m.id + ' ladder'); const sorted = m.milestones.slice().sort((a, b) => m.direction === 'lower' ? b - a : a - b); assert.deepEqual(m.milestones, sorted, m.id + ' ladder runs in the direction of better'); }
  });
});

test('the headline six exist, are client visible, and the groups all have members', () => {
  const six = data.metrics.headlineDefault; assert.equal(six.length, 6);
  six.forEach(id => { const m = M.find(x => x.id === id); assert.ok(m, id); assert.equal(m.clientVisible, true, id + ' client visible'); assert.ok(m.headline, id + ' flagged headline'); });
  assert.deepEqual(M.filter(m => m.headline).map(m => m.id).sort(), six.slice().sort());
  Object.keys(data.metrics.scoreGroups).forEach(gid => assert.ok(M.some(m => m.scoreGroup === gid), 'group ' + gid + ' has a metric'));
  assert.equal(M.length, 88);
});

test('the chart catalog names every built chart with its question and first session; the unbuilt ones carry a route', () => {
  const cat = data.charts.charts;
  ALL_CHARTS.forEach(c => { const e = cat[c.id]; assert.ok(e, 'catalog has ' + c.id); assert.ok(e.question && e.question.endsWith('?'), c.id + ' question'); assert.ok(Number.isInteger(e.firstSession), c.id + ' firstSession'); assert.ok(typeof e.clientVisible === 'boolean'); assert.ok(e.gentle, c.id + ' gentle name'); });
  Object.keys(cat).forEach(id => { if (!ALL_CHARTS.some(c => c.id === id)) assert.ok(cat[id].route, id + ' is not built and has no route'); });
  assert.equal(Object.keys(cat).length, 50);
});

test('most sessions introduce something new, session 1 shows a headline number, and nothing is introduced twice', () => {
  const seen = new Set(); let withNew = 0;
  for (let n = 1; n <= 12; n++) { const i = introduces(data, n); if (i.metrics.length + i.charts.length) withNew++; i.metrics.forEach(x => { assert.ok(!seen.has('m:' + x.id), x.id + ' twice'); seen.add('m:' + x.id); }); i.charts.forEach(x => { assert.ok(!seen.has('c:' + x.id), x.id + ' twice'); seen.add('c:' + x.id); }); }
  assert.ok(withNew >= 9, withNew + ' sessions introduce something');
  assert.ok(introduces(data, 1).metrics.some(m => m.id === 'takeHome'));
  assert.ok(introduces(data, 1).metrics.some(m => m.headline), 'session 1 shows a headline number');
});
