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
  assert.equal(Object.keys(defs.types).length, 13); /* nine from the spec plus four Starting soon types (MR-026) */
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

test('a start month pro-rates the first year and parses in four spellings', async () => {
  const { adjustments, parseStart, startLabel } = await import('../../engine/scenarios.js');
  const defs = { types: { x: { questions: [{ id: 'amount', kind: 'money', default: 120000 }], oneOff: 0, monthly: 'amount', duration: 1 } } };
  const live = { takeHomeMonthly: 500000, spendingMonthly: 300000 };
  const full = adjustments([{ type: 'x', startYear: 2030, answers: {} }], defs, live);
  assert.equal(full[2030].monthly, 120000);
  const oct = adjustments([{ type: 'x', startYear: 2030, startMonth: 10, answers: {} }], defs, live);
  assert.equal(oct[2030].monthly, 30000);
  assert.equal(oct[2031].monthly, 90000);
  assert.deepEqual(parseStart('Mar 2027'), { startYear: 2027, startMonth: 3 });
  assert.deepEqual(parseStart('2027-03'), { startYear: 2027, startMonth: 3 });
  assert.deepEqual(parseStart('3/2027'), { startYear: 2027, startMonth: 3 });
  assert.deepEqual(parseStart('2027'), { startYear: 2027, startMonth: null });
  assert.equal(parseStart('soon'), null);
  assert.equal(startLabel({ startYear: 2027, startMonth: 3 }), 'Mar 2027');
});

test('every scenario block names the planets it touches, and presets name real categories', async () => {
  const data = loadData();
  Object.keys(data.scenarioBlocks.types).forEach(t => assert.ok(Array.isArray(data.scenarioBlocks.types[t].planets) && data.scenarioBlocks.types[t].planets.length, t + ' planets'));
  const cats = data.fields.fields.category.options.map(o => o[0]);
  data.presets.groups.forEach(g => g.lines.forEach(([name, cat, nw, fat]) => {
    assert.ok(name && cats.includes(cat), name + ' category ' + cat);
    assert.ok(nw === 'need' || nw === 'want', name + ' need or want');
    assert.equal(typeof fat, 'boolean', name + ' fat flag');
  }));
});
