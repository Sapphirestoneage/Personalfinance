import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compute } from '../../engine/compute.js';
import { createRecord } from '../../engine/record.js';
import { RUNGS, RUNG_LABELS, RUNG_CLIENT } from '../../engine/fiLadder.js';
import { loadData, loadHousehold } from './load-data.js';

const data = loadData(); const TODAY = '2026-10-12';

test('the paycheck rung is take-home a year over the withdrawal rate, with the gross figure beside it', () => {
  const rec = loadHousehold('leah'); const R = compute(rec, data, { today: TODAY });
  const m = R.metrics.paycheckFi; assert.equal(m.status, 'ok');
  const wr = R.asm.withdrawalRate;
  assert.equal(m.value.cents, Math.round(R.metrics.takeHome.value.cents * 12 / wr));
  assert.equal(m.gross, Math.round(R.metrics.gross.value.cents * 12 / wr));
  assert.ok(m.value.cents > R.metrics.regularFi.value.cents, 'with a positive savings rate the paycheck rung sits above the FI rung');
  const ratio = m.value.cents / R.metrics.regularFi.value.cents;
  assert.ok(ratio > 1.3 && ratio < 1.6, 'about 1.4 for the full example: ' + ratio);
  assert.ok(m.math.inputs.some(i => /Take-home a month/.test(i.label)) && m.math.inputs.some(i => /before deductions/.test(i.label)));
});

test('the rung is on the ladder, the chart and every list the ladder feeds', () => {
  const rec = loadHousehold('leah'); const R = compute(rec, data, { today: TODAY });
  assert.ok(RUNGS.includes('paycheckFi')); assert.equal(RUNG_LABELS.paycheckFi, 'Paycheck FI'); assert.ok(RUNG_CLIENT.paycheckFi);
  const rung = R.ladder.rungs.find(r => r.id === 'paycheckFi');
  assert.ok(rung && rung.number === R.metrics.paycheckFi.value.cents);
  assert.ok(typeof rung.pct === 'number');
  assert.ok(data.metrics.metrics.find(d => d.id === 'paycheckFi').scoreGroup === 'fi');
  assert.ok(data.glossary.metrics.paycheckFi);
});

test('without income the rung says what it needs and the rest of the ladder stands', () => {
  const rec = createRecord(); const R = compute(rec, data, { today: TODAY });
  assert.notEqual(R.metrics.paycheckFi.status, 'ok');
  assert.ok(R.metrics.paycheckFi.needs.includes('take-home pay'));
});
