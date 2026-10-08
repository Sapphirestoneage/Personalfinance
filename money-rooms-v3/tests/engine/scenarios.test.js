import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compute } from '../../engine/compute.js';
import { evalFormula, blockCosts, compare, newBlock, adjustments } from '../../engine/scenarios.js';
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
    const c = blockCosts(def, { answers: {} }, { takeHomeMonthly: 400000, spendingMonthly: 350000, grossMonthly: 550000 });
    assert.ok(Number.isFinite(c.oneOff) && Number.isFinite(c.monthly) && Number.isFinite(c.duration), t);
  });
  assert.equal(Object.keys(defs.types).length, 14); /* nine from the spec, New job, Income ending, New expense, Expense ending, Roommate moves out (MR-026, MR-036, MR-047) */
});

test('Jordan + kid + Portugal: each alone and together, baseline untouched', () => {
  const rec = loadHousehold('jordan');
  const R = compute(rec, data, { today: '2026-10-05' });
  const live = { takeHomeMonthly: R.sun.outputs.income.takeHomeMonthly.cents, spendingMonthly: R.sun.outputs.safety.spendingWithPremiums.cents, grossMonthly: R.sun.outputs.income.grossMonthly.cents };
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
  const live = { takeHomeMonthly: 500000, spendingMonthly: 300000, grossMonthly: 650000 };
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

test('a new job compares its salary with today\'s gross and scales to take-home', async () => {
  const def = defs.types.newjob;
  const live = { takeHomeMonthly: 400000, spendingMonthly: 300000, grossMonthly: 500000 };
  const c = blockCosts(def, { answers: { salary: 7200000, gapMonths: 1 } }, live);
  assert.equal(c.oneOff, 400000);
  /* 72,000 a year is 6,000 a month gross, 1,000 more than today; at today's 80% take-home ratio that is 800 a month in */
  assert.equal(c.monthly, -80000);
  assert.ok(blockCosts(def, { answers: {} }, { takeHomeMonthly: 400000, spendingMonthly: null, grossMonthly: null }).needs.includes('gross pay'));
});

/* MR-057: the Simulate audit. Leah's condo and four-day week, each alone and together. */
test('Leah: a pay cut stops with work and never raises the FI target; together is worse than the sum, and the notes say why', () => {
  const rec = loadHousehold('leah');
  const R = compute(rec, data, { today: '2026-10-08' });
  const live = { takeHomeMonthly: R.sun.outputs.income.takeHomeMonthly.cents, spendingMonthly: R.sun.outputs.safety.spendingWithPremiums.cents, grossMonthly: R.sun.outputs.income.grossMonthly.cents };
  const inp = R.projectionInputs;
  const c = compare(inp, rec.scenarios, defs, live);
  const condo = c.alone.find(a => a.id === 'sc-condo'); const four = c.alone.find(a => a.id === 'sc-fourday');
  assert.equal(c.baseline.fiAge, R.projection.likely.fiAge);
  assert.ok(condo.fiDelta > 0 && four.fiDelta > 0, 'each block alone delays FI');
  assert.ok(condo.at95Delta > 0, 'the condo alone raises net worth at 95: more working years');
  assert.ok(c.together.fiAge >= Math.max(condo.fiAge, four.fiAge), 'together is never earlier than the hardest block alone');
  assert.ok(c.together.fiDelta > condo.fiDelta + four.fiDelta, 'together is worse than the blocks added up: savings are drawn down in the overlap');
  assert.equal(c.together.at95, c.together.path[c.together.path.length - 1].netWorth, 'the net worth at 95 column is the last point of the path');
  assert.ok(c.notes.length >= 2 && c.notes.some(n => n.indexOf('more working years') !== -1) && c.notes.some(n => n.indexOf('Together is worse') !== -1), 'the notes under the table');
  /* a pay change is income: it ends with work and does not raise what retirement must cover */
  const ad = adjustments([four.id ? rec.scenarios[1] : rec.scenarios[1]], defs, live);
  assert.ok(ad[2029].pay > 0 && ad[2029].monthly === 0, 'a pay cut is recorded as pay, not spending');
  const spendTwin = Object.assign({}, rec.scenarios[1], { id: 'twin', type: 'newExpense', answers: { amount: four.costs.monthly, years: 30 } });
  const twin = compare(inp, [spendTwin], defs, live).alone[0];
  assert.ok(twin.fiAge > four.fiAge, 'the same dollars as a new expense delay FI more: an expense runs on into retirement and raises the target');
  /* nothing a pay cut does lands after the retirement age */
  const late = Object.assign({}, rec.scenarios[1], { id: 'late', startYear: inp.year + (inp.retirementAge - inp.age) + 1 });
  const lateRun = compare(inp, [late], defs, live).alone[0];
  assert.equal(lateRun.fiAge, c.baseline.fiAge); assert.equal(lateRun.at95, c.baseline.at95);
});
