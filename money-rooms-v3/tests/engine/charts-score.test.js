/* The seven Scoreboard charts (Level 12, MR-063): each builder needs the right inputs on a blank client and returns
   plain numbers on Maya; the calendar helper reads paydays and bills from the hand-written CSV. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compute } from '../../engine/compute.js';
import { createRecord, setField } from '../../engine/record.js';
import { SCORE_CHARTS } from '../../engine/chartdata-score.js';
import { ALL_CHARTS, chartMeta } from '../../engine/charts-all.js';
import { takeSnapshot } from '../../engine/momentum.js';
import { recordStress } from '../../engine/program.js';
import { parseCsv, guessMapping, normalize, categorize, clean, detect, calendarOf } from '../../engine/transactions.js';
import { loadData, loadHousehold } from './load-data.js';
import { CSV } from '../households/maya-transactions.mjs';

const data = loadData(); const TODAY = '2026-10-08';

test('seven charts join the list, each with a coach name, a client sentence, a planet, a stage and real metric ids', () => {
  assert.equal(SCORE_CHARTS.length, 7); assert.equal(ALL_CHARTS.length, 38);
  SCORE_CHARTS.forEach(c => { assert.ok(c.id && c.name && c.client && c.planet && c.stage >= 1 && c.stage <= 5 && typeof c.build === 'function', c.id); c.metrics.forEach(m => assert.ok(data.metrics.metrics.some(x => x.id === m), c.id + ' metric ' + m)); assert.equal(chartMeta(c.id, data).stage, c.stage); });
});

test('on a blank client every one of the seven says what it needs, in words the needs map knows', () => {
  const rec = createRecord(); setField(rec, 'sun', 'name', 'Blank', 'known', 'client');
  const R = compute(rec, data, { today: TODAY });
  SCORE_CHARTS.forEach(c => { const d = c.build(R, {}); assert.ok(d.needs && d.needs.length, c.id + ' should need inputs'); d.needs.forEach(n => assert.ok(data.unlocks.needsMap[n], c.id + ' needs phrase unmapped: ' + n)); });
});

test('on Maya with a snapshot, a stress score and a market move, the builders return drawable shapes', () => {
  const maya = loadHousehold('maya');
  let R = compute(maya, data, { today: '2026-09-20' });
  takeSnapshot(maya, R, 'session', { now: '2026-09-20T16:00:00.000Z', session: 's2' });
  maya.program = Object.assign(maya.program || {}, {}); recordStress(maya, 'discovery', 7, { now: '2026-08-20T16:00:00.000Z' }); recordStress(maya, 's4', 5, { now: '2026-10-05T16:00:00.000Z' });
  const b = maya.planets.invest.rows.find(r => r.f.accountBalance && r.f.accountBalance.v > 1000000);
  setField(maya, b.id, 'accountBalance', b.f.accountBalance.v - 150000, 'known', 'client', { now: '2026-10-05T10:00:00.000Z', why: 'move' });
  R = compute(maya, data, { today: TODAY });
  const by = {}; SCORE_CHARTS.forEach(c => { by[c.id] = c.build(R, {}); });
  const cr = by.crossover; assert.ok(cr.years.length > 30 && cr.years[0].spending > 0 && cr.years[0].assetIncome >= 0, 'crossover years');
  assert.ok(cr.crossYear === null || cr.crossAge >= 30, 'crossover age');
  const wf = by.fiDateWaterfall; assert.ok(!wf.needs, 'waterfall built: ' + JSON.stringify(wf.needs)); assert.equal(wf.since, '2026-09-20T16:00:00.000Z'); assert.ok(Array.isArray(wf.steps) && Array.isArray(wf.sentences) && wf.sentences.length);
  assert.deepEqual(by.cashflowCalendar.needs, ['transactions imported']);
  const pp = by.pictureVsProgress; assert.equal(pp.points.length, 2); assert.equal(pp.yId, 'pctToFi'); assert.ok(pp.points[1].label === 'Today' && pp.points[0].label === 'Session 2');
  const em = by.effortVsMarket; assert.ok(em.years.length > 20); assert.ok(em.years.every(y => y.contrib >= 0 && y.growth >= 0)); assert.ok(em.years[em.years.length - 1].cumContrib > 0);
  const st = by.stressTrend; assert.equal(st.points.length, 2); assert.equal(st.first, 7); assert.equal(st.last, 5); assert.equal(st.change, -2); assert.equal(st.points[0].label, 'First call');
  const dc = by.debtCurves; assert.ok(!dc.needs, 'debt curves built: ' + JSON.stringify(dc.needs)); assert.equal(dc.curves.length, 2); assert.ok(dc.curves[0].series.length > 6 && dc.curves[1].series.length > 6); assert.ok(dc.curves.every(c => c.debtFree && c.interest > 0)); assert.ok(typeof dc.reliefCostCents === 'number');
  /* the waterfall is memoised per record version: a second build is the same object */
  assert.equal(SCORE_CHARTS.find(c => c.id === 'fiDateWaterfall').build(R, {}), wf);
});

test('the calendar reads paydays with their amounts and bills with their days from the transactions', () => {
  const rules = data.merchantRules; const parsed = parseCsv(CSV); const map = guessMapping(parsed.headers, rules);
  const txs = categorize(normalize(parsed, map), rules, {}); const cl = clean(txs, {}); const det = detect(cl.kept, rules);
  const cal = calendarOf(cl.kept, det);
  assert.ok(cal.paydays.length >= 1, 'a payday'); cal.paydays.forEach(p => { assert.ok(p.cents > 0 && p.days.length >= 1 && p.days.every(d => d >= 1 && d <= 31), JSON.stringify(p)); });
  assert.ok(cal.bills.length >= 2, 'bills'); cal.bills.forEach(b => assert.ok(b.cents > 0 && b.day >= 1 && b.day <= 31 && b.label, JSON.stringify(b)));
  assert.ok(cal.bills.every((b, i, a) => i === 0 || a[i - 1].day <= b.day), 'bills in day order');
  /* stored on the program, the calendar chart draws it */
  const maya = loadHousehold('maya'); maya.program = { stress: [], transactions: { calendar: cal } };
  const R = compute(maya, data, { today: TODAY }); const d = SCORE_CHARTS.find(c => c.id === 'cashflowCalendar').build(R, {});
  assert.equal(d.days.length, 31); assert.ok(d.totalIn > 0 && d.totalOut > 0); assert.ok(typeof d.low.day === 'number');
});
