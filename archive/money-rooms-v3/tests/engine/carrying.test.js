import { test } from 'node:test';
import assert from 'node:assert/strict';
import { invisibleSheet, WHOM, KINDS, whomLabel, kindLabel } from '../../engine/carrying.js';
import { compute } from '../../engine/compute.js';
import { setField, createRecord } from '../../engine/record.js';
import { loadData, loadHousehold } from './load-data.js';

const data = loadData(); const TODAY = '2026-10-12';
const fresh = () => loadHousehold('leah');
const set = (rec, id, fid, v) => setField(rec, id, fid, v, 'known', 'client', { session: null });

test('the two tags are choice tags on the goal type and every option has a label in both voices', () => {
  const F = data.fields;
  ['forWhom', 'goalKind'].forEach(id => { const d = F.fields[id]; assert.ok(d && d.tag && d.kind === 'choice' && d.owner === 'life', id); assert.ok(F.planets.life.types.goal.fields.includes(id)); });
  assert.deepEqual(WHOM.map(w => w[0]), F.fields.forWhom.options.map(o => o[0]));
  assert.deepEqual(KINDS.map(k => k[0]), F.fields.goalKind.options.map(o => o[0]));
  WHOM.forEach(([id]) => { assert.ok(whomLabel(id, false) && whomLabel(id, true)); });
  KINDS.forEach(([id]) => { assert.ok(kindLabel(id, false) && kindLabel(id, true)); });
});

test('untagged goals sit under Not yet sorted; nothing is summed until a goal is sorted', () => {
  const rec = fresh(); const R = compute(rec, data, { today: TODAY });
  const S = invisibleSheet(rec, R);
  assert.equal(S.count, 2); assert.equal(S.sorted, 0); assert.deepEqual(S.groups, []); assert.equal(S.unsorted.items.length, 2);
  assert.equal(S.totals.targetCents, 0); assert.equal(S.totals.monthlyNow, 0);
  assert.equal(invisibleSheet(createRecord(), compute(createRecord(), data, { today: TODAY })).count, 0);
});

test('a tagged goal groups under its person with the goal plan\'s own monthly figure and landing month', () => {
  const rec = fresh();
  set(rec, 'm-goal2', 'forWhom', 'family'); set(rec, 'm-goal2', 'goalKind', 'promise');
  set(rec, 'm-goal1', 'forWhom', 'me-later'); set(rec, 'm-goal1', 'goalKind', 'wish');
  const R = compute(rec, data, { today: TODAY }); const S = invisibleSheet(rec, R);
  assert.equal(S.sorted, 2); assert.equal(S.unsorted, null); assert.equal(S.people, 2);
  assert.deepEqual(S.groups.map(g => g.id), ['me-later', 'family'], 'groups follow the WHOM order');
  const fam = S.groups.find(g => g.id === 'family'); const japan = fam.items[0];
  assert.equal(japan.id, 'life:m-goal2'); assert.equal(japan.goalKind, 'promise'); assert.equal(japan.targetCents, 600000);
  assert.equal(japan.monthlyNow, Math.max(0, Math.round(R.goalPlan.run.goals['life:m-goal2'].monthlyNow)));
  assert.equal(japan.finishMonth, R.goalPlan.assessment['life:m-goal2'].finishMonth);
  assert.equal(fam.targetCents, 600000); assert.equal(fam.monthlyNow, japan.monthlyNow);
  assert.equal(S.totals.targetCents, 600000 + 8000000);
  assert.equal(S.totals.forOthersCents, 600000, 'me-later is not another person');
  assert.equal(S.totals.surplusMonthly, R.goalPlan.input.surplusMonthly);
  assert.deepEqual(S.kinds.map(k => [k.id, k.count]), [['promise', 1], ['wish', 1]]);
  /* the life planet and goalsOf carry the tags; a tag changes no number */
  const R0 = compute(fresh(), data, { today: TODAY });
  assert.equal(R.metrics.fiNumber.value.cents, R0.metrics.fiNumber.value.cents);
  assert.equal(R.goalPlan.input.items.find(i => i.id === 'life:m-goal2').forWhom, 'family');
  assert.equal(R.sun.outputs.life.goals.find(g => g.id === 'm-goal2').goalKind, 'promise');
});
