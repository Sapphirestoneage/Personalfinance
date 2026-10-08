import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compute } from '../../engine/compute.js';
import { createRecord, setField } from '../../engine/record.js';
import { MORE_CHARTS } from '../../engine/chartdata-more.js';
import { ALL_CHARTS, chartMeta, HERO_ORDER } from '../../engine/charts-all.js';
import { loadData, loadHousehold } from './load-data.js';

const data = loadData(); const TODAY = '2026-10-08';
const leah = compute(loadHousehold('leah'), data, { today: TODAY });
const jordan = compute(loadHousehold('jordan'), data, { today: TODAY });
const blank = (() => { const r = createRecord(); setField(r, 'sun', 'name', 'x', 'known', 'client'); return compute(r, data, { today: TODAY }); })();
const walk = (o, seen) => { seen = seen || new Set(); if (o === null || typeof o !== 'object' || seen.has(o)) return; seen.add(o); Object.keys(o).forEach(k => { const v = o[k]; if (typeof v === 'number') assert.ok(Number.isFinite(v), k + ' is finite'); else walk(v, seen); }); };

test('22 new charts, each with a coach name, a client sentence, a planet, a stage, its metrics and a builder; 49 in all with no duplicate ids', () => {
  assert.equal(MORE_CHARTS.length, 22);
  MORE_CHARTS.forEach(c => { assert.ok(c.id && c.name && c.client && c.planet && c.stage >= 1 && c.stage <= 5 && Array.isArray(c.metrics) && typeof c.build === 'function', c.id); c.metrics.forEach(m => assert.ok(data.metrics.metrics.some(x => x.id === m), c.id + ' metric ' + m)); });
  assert.equal(ALL_CHARTS.length, 49);
  assert.equal(new Set(ALL_CHARTS.map(c => c.id)).size, 49);
  HERO_ORDER.forEach(id => assert.ok(ALL_CHARTS.some(c => c.id === id), 'hero ' + id));
  assert.equal(chartMeta('sankey', data).stage, 1); assert.equal(chartMeta('coastCurve', data).stage, 5);
});

test('on full Leah every chart but the two that wait on anchors or the sensitivity run builds, with finite numbers only', () => {
  MORE_CHARTS.forEach(c => {
    const d = c.build(leah, {});
    if (c.id === 'tornado') { assert.ok(d.needs && d.waiting, 'tornado waits for the sensitivity run'); return; }
    if (c.id === 'gutDreamActual') { assert.ok(d.needs, 'locked until an anchor exists'); return; }
    assert.ok(d && !d.needs, c.id + ' builds: ' + JSON.stringify(d && d.needs));
    walk(d);
  });
});

test('on a blank client every chart says what it needs, and every needs phrase maps to a Ledger input', async () => {
  const { targetFor } = await import('../../engine/unlocks.js');
  const rec = createRecord();
  MORE_CHARTS.forEach(c => { const d = c.build(blank, {}); assert.ok(d && d.needs && d.needs.length, c.id + ' needs'); const mapped = d.needs.some(n => targetFor(n, rec, data)); assert.ok(mapped || c.id === 'tornado', c.id + ' needs map to an input: ' + d.needs.join('; ')); });
});

test('the curves agree with the metrics they sit beside', () => {
  const M = leah.metrics;
  const sr = MORE_CHARTS.find(c => c.id === 'savingsRateCurve').build(leah);
  assert.equal(sr.own.rate, M.savingsRateTakeHome.value.value); assert.equal(sr.own.years, M.fiDate.yearsToFi);
  assert.ok(sr.points.every((p, i) => i === 0 || p.years === null || p.years <= sr.points[i - 1].years + 1e-9), 'more saving never means more years');
  const coast = MORE_CHARTS.find(c => c.id === 'coastCurve').build(leah);
  assert.equal(coast.points[0].needed, M.coastFi.value.cents, 'the curve starts at the Coast FI number');
  assert.equal(coast.points[coast.points.length - 1].needed, M.fiNumber.value.cents, 'and ends at the FI number at the retirement age');
  const fee = MORE_CHARTS.find(c => c.id === 'feeDrag').build(leah);
  assert.ok(fee.costAt95 > 0 && fee.years.every(y => y.without >= y.withFees), 'fees only ever cost');
  const ms = MORE_CHARTS.find(c => c.id === 'milestones').build(leah);
  assert.ok(ms.items.find(i => i.key === 'fi').age === M.fiDate.ages.likely);
  assert.ok(ms.items.every((it, i) => i === 0 || it.age >= ms.items[i - 1].age), 'milestones are in age order');
  const dc = MORE_CHARTS.find(c => c.id === 'debtCompared').build(leah);
  assert.equal(dc.orders.length, 3); assert.ok(dc.best === 'avalanche', 'highest rate first costs the least interest for Leah: ' + dc.best);
  const tm = MORE_CHARTS.find(c => c.id === 'spendingTreemap').build(leah);
  assert.equal(tm.needs_ + tm.wants, tm.total);
  const wf = MORE_CHARTS.find(c => c.id === 'paycheckWaterfall').build(leah);
  assert.equal(wf.steps[0].cents, leah.sun.outputs.income.grossMonthly.cents * 12);
  const g = MORE_CHARTS.find(c => c.id === 'ruleOf5Gauge').build(jordan);
  assert.ok(g.target > 0 && g.pct !== null);
});
