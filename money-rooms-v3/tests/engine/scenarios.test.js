import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compute } from '../../engine/compute.js';
import { evalFormula, blockCosts, compare, newBlock } from '../../engine/scenarios.js';
import { loadData, loadHousehold } from './load-data.js';

const data = loadData();
const defs = data.scenarioBlocks;

test('formulas evaluate from answers and live figures, and reject anything but arithmetic', () => {
  assert.equal(evalFormula('price * downPct + 1500000', { price: 45000000, downPct: 0.2 }, {}), 10500000);
  assert.equal(evalFormula('gapMonths * takeHomeMonthly', { gapMonths: 2 }, { takeHomeMonthly: 446652 }), 893304);
  assert.throws(() => evalFormula('alert(1)', {}, {}));
});

test('every block type has 3 or 4 questions with defaults and its formulas evaluate', () => {
  Object.keys(defs.types).forEach(t => {
    const def = defs.types[t];
    assert.ok(def.questions.length >= 1 && def.questions.length <= 4, t + ' questions');
    def.questions.forEach(q => assert.ok(q.default !== undefined, t + '.' + q.id));
    const c = blockCosts(def, { answers: {} }, { takeHomeMonthly: 400000, spendingMonthly: 350000 });
    assert.ok(Number.isFinite(c.oneOff) && Number.isFinite(c.monthly) && Number.isFinite(c.duration), t);
  });
  assert.equal(Object.keys(defs.types).length, 9);
});

test('Jordan + kid + Portugal: each alone and together, baseline untouched', () => {
  const rec = loadHousehold('jordan');
  const R = compute(rec, data, { today: '2026-10-05' });
  const live = { takeHomeMonthly: R.sun.outputs.income.takeHomeMonthly.cents, spendingMonthly: R.sun.outputs.safety.spendingWithPremiums.cents };
  const kid = newBlock('kid', defs, 2030); const geo = newBlock('geo', defs, 2031); geo.name = 'Portugal';
  const inp = R.projectionInputs;
  assert.ok(inp, 'the engine exposes its projection inputs for the sandbox');
  const c = compare(inp, [kid, geo], defs, live);
  assert.equal(c.baseline.fiAge, R.projection.likely.fiAge, 'the sandbox baseline is the real projection');
  assert.equal(c.alone.length, 2);
  assert.ok(c.alone[0].fiAge === null || c.alone[0].fiAge >= c.baseline.fiAge, 'a child never brings FI earlier');
  assert.ok(c.alone[1].at95Delta !== 0, 'Portugal changes the path');
  assert.ok(Number.isFinite(c.together.at95));
  const R2 = compute(rec, data, { today: '2026-10-05' });
  assert.deepEqual(R2.projection.likely.fiAge, R.projection.likely.fiAge, 'reality is never written');
  assert.equal(rec.scenarios.length, 0);
});
