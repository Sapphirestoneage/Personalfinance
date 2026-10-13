import { test } from 'node:test';
import assert from 'node:assert/strict';
import { yearPlan, setFocus, focusOf, canFocus, movesFor } from '../../engine/thisyear.js';
import { compute } from '../../engine/compute.js';
import { FLOOR_IDS } from '../../engine/goals.js';
import { monthsBetween } from '../../engine/debtsim.js';
import { loadData, loadHousehold } from './load-data.js';

const data = loadData(); const TODAY = '2026-10-12';
const fresh = () => loadHousehold('leah');

test('no focus, no year plan; a floor or a long rung cannot be the focus', () => {
  const rec = fresh(); const R = compute(rec, data, { today: TODAY });
  assert.equal(focusOf(rec), null); assert.equal(yearPlan(rec, R, null), null);
  const items = R.goalPlan.input.items;
  FLOOR_IDS.forEach(id => assert.ok(!canFocus(items.find(i => i.id === id)), id));
  assert.ok(!canFocus(items.find(i => i.type === 'long-term')));
  assert.ok(canFocus(items.find(i => i.type === 'dated')));
});

test('a dated goal as the focus: the gap, the months left and the number for now come from the goal plan', () => {
  const rec = fresh(); let R = compute(rec, data, { today: TODAY });
  const goal = R.goalPlan.input.items.find(i => i.type === 'dated');
  setFocus(rec, { id: goal.id }, { session: null });
  assert.deepEqual(focusOf(rec), { id: goal.id, months: null });
  assert.ok(rec.journal[rec.journal.length - 1].kind === 'goals', 'journaled');
  R = compute(rec, data, { today: TODAY });
  const Y = yearPlan(rec, R, null);
  assert.ok(Y); assert.equal(Y.item.id, goal.id); assert.equal(Y.target, goal.targetCents); assert.equal(Y.by, goal.targetDate);
  assert.equal(Y.monthsLeft, Math.max(1, monthsBetween(R.goalPlan.input.from, goal.targetDate)));
  assert.equal(Y.gap, Math.max(0, goal.targetCents - (goal.balanceCents || 0)));
  assert.equal(Y.perMonth, Math.ceil(Y.gap / Y.monthsLeft));
  assert.equal(Y.where.surplus, R.goalPlan.input.surplusMonthly);
  assert.equal(Y.where.lean, R.goalPlan.base.targets.step1);
  assert.equal(Y.moves, null, 'no sensitivity run yet, so no moves');
  assert.equal(Y.enough, Y.where.surplus >= Y.perMonth ? 'surplus' : null);
});

test('the cushion as the focus, typed as lean months: the target is months times the lean month', () => {
  const rec = fresh(); let R = compute(rec, data, { today: TODAY });
  setFocus(rec, { id: 'full', months: 6 }, { session: null });
  R = compute(rec, data, { today: TODAY });
  const Y = yearPlan(rec, R, null);
  assert.ok(Y.targetFromMonths); assert.equal(Y.target, Math.round(6 * Y.where.lean)); assert.equal(Y.leanMonths, 6);
  assert.equal(Y.by, '2027-10'); assert.equal(Y.monthsLeft, 12);
  setFocus(rec, null, { session: null }); assert.equal(focusOf(rec), null);
});

test('the three moves come from the sensitivity run: in-year families only, largest first, with the row and field they live in', () => {
  const sens = { ranked: { impact: [
    { id: 'a|amount', rowId: 'a', rootId: 'amount', row: 'Rent', label: 'Amount', planet: 'spending', family: 'spend', realistic: { cents: 22500, months: 19, why: 'A tenth of the line.' } },
    { id: 'asm', label: 'Return +1 point', assumption: true, family: 'assume', realistic: { cents: 0, months: 20 } },
    { id: 'spending|all', aggregate: true, label: 'All spending lines', planet: 'spending', family: 'spend', realistic: { cents: 42200, months: 36 } },
    { id: 'b|grossPay', rowId: 'b', rootId: 'grossPay', row: 'Job', label: 'Gross pay', planet: 'income', family: 'earn', realistic: { cents: 16300, months: 7 } },
    { id: 'c|contribAmount', rowId: 'c', rootId: 'contribAmount', row: 'Roth', label: 'Contribution', planet: 'invest', family: 'grow', realistic: { cents: 10000, months: 7 } },
    { id: 'd|amount', rowId: 'd', rootId: 'amount', row: 'Travel', label: 'Amount', planet: 'spending', family: 'spend', realistic: { cents: 2200, months: 1.8 } },
    { id: 'e|amount', rowId: 'e', rootId: 'amount', row: 'Gym', label: 'Amount', planet: 'spending', family: 'spend', realistic: { cents: 1000, months: 0.8 } },
  ] } };
  const moves = movesFor(sens, 3);
  assert.deepEqual(moves.map(m => m.id), ['a|amount', 'b|grossPay', 'd|amount']);
  assert.equal(moves[0].field, 'amount'); assert.equal(moves[0].row, 'Rent'); assert.equal(moves[0].cents, 22500);
  const rec = fresh(); let R = compute(rec, data, { today: TODAY });
  const goal = R.goalPlan.input.items.find(i => i.type === 'dated');
  setFocus(rec, { id: goal.id }, { session: null }); R = compute(rec, data, { today: TODAY });
  const Y = yearPlan(rec, R, sens);
  assert.equal(Y.movesTotal, 22500 + 16300 + 2200); assert.equal(Y.withMoves, Y.where.surplus + Y.movesTotal);
});
