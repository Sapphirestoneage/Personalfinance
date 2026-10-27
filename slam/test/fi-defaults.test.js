// Owner's ask (2026-10-27): Fat FI and Barista FI figure from house defaults, marked rough, until the FI goal (or a
// scenario) gives a dream spending or a part-time income. The demo household is made up.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readJson, loadRules } from './spine-helpers.js';
import { loadHousehold } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';
import { summarize } from '../engine/summary.js';

const R = loadRules();
const s0 = () => applyDefaults(loadHousehold(readJson('fixtures/demo.json')), R);

test('with nothing typed, Fat FI and Barista FI use the house defaults, rough', () => {
  const fi = summarize(s0(), R).fi, wr = s0().assumptions.withdrawalRate.value;
  assert.equal(fi.dream, Math.round(fi.yearlyToday * R.get('APP_FAT_FI_MULT', 2026) * 100) / 100);
  assert.equal(fi.fatFi.value, Math.round(fi.dream / wr * 100) / 100);
  assert.equal(fi.fatFi.kind, 'rough');
  assert.equal(fi.partTime, Math.round(fi.yearlyToday * R.get('APP_BARISTA_SHARE', 2026) * 100) / 100);
  assert.equal(fi.baristaFi.kind, 'rough');
  assert.ok(fi.fatFi.value > fi.baristaFi.value);
});

test('a dream spending typed on the FI goal replaces the default', () => {
  const s = s0();
  const g = s.goals.find((x) => x.type === 'fi');
  g.dreamSpending = { value: 90000, kind: 'known', asOf: '2026-10-01', source: 'test' };
  const fi = summarize(s, R).fi;
  assert.equal(fi.dreamDefault, false);
  assert.equal(fi.fatFi.value, Math.round(90000 / s.assumptions.withdrawalRate.value * 100) / 100);
});

test('deferred interest: Not sure is kept as not known, never as a no (owner\'s ask)', async () => {
  const { editCardRate } = await import('../engine/edits.js');
  const s = s0();
  const card = s.debts.find((d) => d.type === 'credit_card');
  const out = editCardRate(s, card.id, 'set', { value: { apr: 0.25, intro: { rate: 0, ends: '2027-05-31', deferred: 'notSure' } }, kind: 'known', today: '2026-10-27' });
  const f = out.debts.find((d) => d.id === card.id).deferredInterest;
  assert.equal(f.value, null);
  assert.equal(f.kind, 'missing');
});
