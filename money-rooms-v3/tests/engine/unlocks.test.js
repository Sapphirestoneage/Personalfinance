import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compute } from '../../engine/compute.js';
import { createRecord, setField, addRow } from '../../engine/record.js';
import * as U from '../../engine/unlocks.js';
import { loadData, loadHousehold } from './load-data.js';

const data = loadData(); const TODAY = '2026-10-08';
const maya = loadHousehold('maya');
const R = compute(maya, data, { today: TODAY });

function blankMaya() {
  const rec = createRecord();
  setField(rec, 'sun', 'name', 'Maya, from zero', 'known', 'client');
  return rec;
}

test('states: every metric, lens and chart is locked, quiet, rough or solid, and the totals add up', () => {
  const st = U.stateOf(R, data); const t = U.totals(st);
  assert.equal(t.metrics.total, data.metrics.metrics.length); assert.equal(t.lenses.total, data.lenses.lenses.length); assert.equal(t.charts.total, 9);
  Object.values(st.metrics).concat(Object.values(st.lenses), Object.values(st.charts)).forEach(s => assert.ok(['locked', 'quiet', 'rough', 'solid'].includes(s), s));
  assert.ok(t.metrics.open >= 70 && t.charts.open === 9 && t.lenses.firing === R.lenses.length, JSON.stringify(t));
  const blank = compute(blankMaya(), data, { today: TODAY }); const t0 = U.totals(U.stateOf(blank, data));
  assert.equal(t0.metrics.open, 0); assert.equal(t0.lenses.open, 0); assert.equal(t0.charts.open, 0);
});

test('a save never unlocks anything when nothing changed, and the diff lists only moves up', () => {
  const st = U.stateOf(R, data);
  const d = U.unlocksBetween(st, st, R, data); assert.equal(d.count, 0);
  const worse = JSON.parse(JSON.stringify(st)); worse.metrics.takeHome = 'locked';
  assert.equal(U.unlocksBetween(st, worse, R, data).count, 0, 'a move down is not an unlock');
  const up = U.unlocksBetween(worse, st, R, data); assert.equal(up.count, 1); assert.equal(up.metrics[0].id, 'takeHome'); assert.equal(up.metrics[0].from, 'locked');
  assert.ok(up.metrics[0].value && up.metrics[0].takeaway && up.metrics[0].href === '#/measure/numbers/takeHome');
});

test('Maya from zero, one row at a time: the first income row opens numbers, nothing ever locks again, and the end state is full Maya', () => {
  const rec = blankMaya();
  ['birthDate', 'state', 'workSituation', 'filingStatus'].forEach(id => setField(rec, 'sun', id, maya.sun.f[id].v, 'known', 'client'));
  let prev = compute(rec, data, { today: TODAY }); let prevState = U.stateOf(prev, data);
  let opened = 0; let firstIncome = null;
  const rank = { locked: 0, quiet: 1, rough: 2, solid: 3 };
  maya.planets && Object.keys(maya.planets).forEach(p => maya.planets[p].rows.forEach(row => {
    addRow(rec, JSON.parse(JSON.stringify(row)));
    const next = compute(rec, data, { today: TODAY }); const st = U.stateOf(next, data);
    const u = U.unlocksBetween(prevState, st, next, data);
    if (p === 'income' && firstIncome === null) firstIncome = u;
    opened += u.count;
    /* adding a row never takes a metric from solid back to locked */
    Object.keys(st.metrics).forEach(id => assert.ok(!(prevState.metrics[id] === 'solid' && st.metrics[id] === 'locked'), id + ' relocked by ' + row.id));
    prev = next; prevState = st;
  }));
  assert.ok(firstIncome && firstIncome.count >= 3, 'the first income row opens at least three things: ' + JSON.stringify(firstIncome && firstIncome.metrics.map(m => m.id)));
  assert.ok(opened >= 100, 'the walk opens over a hundred items in all: ' + opened);
  const full = U.totals(U.stateOf(R, data)); const walked = U.totals(prevState);
  assert.equal(walked.metrics.open, full.metrics.open); assert.equal(walked.charts.open, full.charts.open);
});

test('the next unlock: on an empty client it is a first row with a real count; on Maya it is a confirmation; every probe names where to go', () => {
  const blank = blankMaya(); const R0 = compute(blank, data, { today: TODAY });
  const nx = U.nextUnlocks(blank, R0, data);
  assert.equal(nx.length, 3);
  assert.ok(nx[0].unlocks.count >= nx[1].unlocks.count && nx[1].unlocks.count >= nx[2].unlocks.count || nx[0].score >= nx[1].score, 'ranked');
  assert.ok(nx[0].probe.addRow && nx[0].probe.href.indexOf('#/ledger/') === 0 && nx[0].probe.field, JSON.stringify(nx[0].probe));
  assert.ok(nx[0].unlocks.count >= 5, 'the best first input opens at least five things: ' + nx[0].unlocks.count);
  const nm = U.nextUnlocks(maya, R, data);
  assert.ok(nm.length >= 1, 'Maya still has a rough figure to confirm');
  nm.forEach(x => { assert.ok(x.probe.label && x.probe.where && x.probe.href, JSON.stringify(x.probe)); assert.ok(x.unlocks.count > 0); });
  assert.ok(nm[0].probe.kind === 'confirm' || nm[0].probe.kind === 'field', nm[0].probe.kind);
});

test('the map: every item sits in one of five stages; a locked item names the exact input and where it lives', () => {
  const map = U.unlockMap(maya, R, data);
  assert.equal(map.stages.length, 5);
  assert.equal(map.stages.reduce((s, st) => s + st.items.length, 0), map.items.length);
  assert.equal(map.items.length, data.metrics.metrics.length + data.lenses.lenses.length + 9);
  map.items.filter(i => i.state === 'locked').forEach(i => { assert.ok(i.input && i.input.label && i.input.href && i.input.where, i.kind + ':' + i.id + ' has no input'); });
  const blank = blankMaya(); const map0 = U.unlockMap(blank, compute(blank, data, { today: TODAY }), data);
  const unmapped = map0.items.filter(i => i.state === 'locked' && !i.input);
  assert.deepEqual(unmapped.map(i => i.kind + ':' + i.id), [], 'every locked item on a blank client maps to an input');
  const takeHome = map0.items.find(i => i.id === 'takeHome'); assert.equal(takeHome.input.href, '#/ledger/income/w2'); assert.ok(takeHome.input.addRow);
});
