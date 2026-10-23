import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compute } from '../../engine/compute.js';
import { createRecord, createRow, addRow, setField } from '../../engine/record.js';
import { freshFacts, askedOnRow } from '../../engine/fields.js';
import { loadData, loadHousehold } from './load-data.js';

const data = loadData(); const TODAY = '2026-10-12';
const set = (rec, id, fid, v, cad) => setField(rec, id, fid, v, 'known', 'client', { session: null, cad });
function benefit(rec, kind, cents, cad) {
  const row = createRow('income', 'benefits', { nickname: kind, f: freshFacts(data.fields, 'income', 'benefits') }); addRow(rec, row, { session: null });
  set(rec, row.id, 'benefitKind', kind); if (cents !== null) set(rec, row.id, 'benefitValue', cents, cad || 'month'); return row;
}

test('the common benefits are reference data: every kind says how to add it, what to collect and how it counts', () => {
  const B = data.benefits; assert.ok(B && B.kinds.length >= 12);
  B.kinds.forEach(k => { assert.ok(k.id && k.label && k.add && k.details && k.quantify, k.id); assert.ok(['match', 'worth', 'cash'].includes(k.counts), k.id); assert.ok(['month', 'year'].includes(k.cadence), k.id); });
  assert.deepEqual(data.fields.fields.benefitKind.options.map(o => o[0]), B.kinds.map(k => k.id), 'the kind field lists the same kinds');
  assert.equal(data.fields.planets.income.types.benefits.nameField, 'benefitKind'); assert.equal(data.fields.planets.income.types.benefits.picks, 'benefits');
});

test('facts are asked by kind: the match formula for a match, what the employer pays for the rest, the old stipend only while no kind is picked', () => {
  const rec = createRecord(); const row = benefit(rec, 'health', null);
  assert.ok(askedOnRow(data.fields, row, 'benefitValue')); assert.ok(!askedOnRow(data.fields, row, 'matchRate')); assert.ok(!askedOnRow(data.fields, row, 'otherBenefit'));
  set(rec, row.id, 'benefitKind', 'match');
  assert.ok(askedOnRow(data.fields, row, 'matchRate')); assert.ok(!askedOnRow(data.fields, row, 'benefitValue'));
  const old = createRow('income', 'benefits', { nickname: 'Old', f: freshFacts(data.fields, 'income', 'benefits') }); addRow(rec, old, { session: null });
  assert.ok(askedOnRow(data.fields, old, 'otherBenefit') && askedOnRow(data.fields, old, 'matchRate') && askedOnRow(data.fields, old, 'benefitValue'), 'no kind yet: everything is asked');
});

test('worth kinds count as benefits worth and in total compensation; cash kinds count as income; the match row still computes the match', () => {
  const rec = loadHousehold('leah'); const R0 = compute(rec, data, { today: TODAY });
  const gross0 = R0.metrics.gross.value.cents; const match0 = R0.sun.outputs.income.matchMonthly.cents; const cash0 = R0.sun.outputs.income.byType.benefits;
  assert.ok(match0 > 0, 'Leah has a match'); assert.equal(R0.metrics.benefitsWorth.value.cents, 0); assert.equal(R0.metrics.totalComp.value.cents, gross0 + match0);
  benefit(rec, 'health', 40000, 'month'); benefit(rec, 'hsa', 120000, 'year'); benefit(rec, 'commuter', 10000, 'month');
  const R = compute(rec, data, { today: TODAY });
  assert.equal(R.sun.outputs.income.benefitsWorthMonthly.cents, 40000 + 10000);
  assert.equal(R.metrics.benefitsWorth.value.cents, 50000);
  assert.equal(R.metrics.gross.value.cents, gross0 + 10000, 'the commuter subsidy is cash income');
  assert.equal(R.sun.outputs.income.byType.benefits, cash0 + 10000);
  assert.equal(R.metrics.totalComp.value.cents, gross0 + 10000 + R.sun.outputs.income.matchMonthly.cents + 50000);
  assert.equal(R.sun.outputs.income.matchMonthly.cents, match0, 'the older match row keeps computing');
  assert.ok(data.glossary.metrics.benefitsWorth && data.glossary.metrics.totalComp);
});
