/* Level 14 (MR-072): one name per number. The glossary mirrors every metric's
   coach and client label from data/metrics.json, the removed variants never
   come back, and client labels stay short plain words. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from './load-data.js';

const data = loadData();

test('every metric has one coach label and one client label, and the glossary carries the same pair', () => {
  const g = data.glossary.metrics; assert.ok(g && Object.keys(g).length === data.metrics.metrics.length, 'one glossary entry per metric');
  data.metrics.metrics.forEach(m => {
    assert.ok(g[m.id], 'glossary entry for ' + m.id);
    assert.equal(g[m.id].coach, m.name, m.id + ' coach label');
    assert.equal(g[m.id].client, m.clientLabel, m.id + ' client label');
    assert.ok(m.clientLabel.split(' ').length <= 7, m.id + ' client label is plain and short: ' + m.clientLabel);
  });
});

test('the removed variants are gone from every label and gentle sentence', () => {
  const removed = data.glossary.removed || [];
  assert.ok(removed.length >= 3);
  data.metrics.metrics.forEach(m => removed.forEach(r => { assert.ok(m.clientLabel.indexOf(r) === -1, m.id + ' uses removed ' + r); assert.ok(!(m.gentleCopy || '').toLowerCase().includes(r.toLowerCase()), m.id + ' gentle copy uses ' + r); }));
  ['netWorth', 'fiDate', 'fiNumber', 'savingsRateTakeHome', 'safeToSpend', 'pctToFi'].forEach(id => { const m = data.metrics.metrics.find(x => x.id === id); assert.ok(['Net worth', 'FI date', 'FI number', 'Savings rate', 'Safe to spend', 'FI progress'].includes(m.clientLabel), id + ': ' + m.clientLabel); });
  data.metrics.metrics.forEach(m => { if (m.gentleCopy) assert.ok(!/^Your (the|when|what|how) /.test(m.gentleCopy), m.id + ' gentle copy reads badly: ' + m.gentleCopy); });
});

test('the plain terms the client sees each have a one-line meaning', () => {
  const t = data.glossary.terms;
  ['FI date', 'Safe to spend', 'Cushion', 'Net worth', 'Savings rate'].forEach(k => assert.ok(t[k] && t[k].length > 10, k));
});
