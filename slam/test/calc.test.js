// Phase 2 unit tests for the pure math functions. Expected numbers are
// worked by hand in the comments.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toMonthly } from '../src/calc/normalize.js';
import { bracketTax, estimateAnnualTax } from '../src/calc/tax.js';
import { incomeSummary } from '../src/calc/income.js';
import { budgetModel } from '../src/calc/model.js';
import { buildSummary } from '../src/calc/summary.js';
import { guessFor, colTierFor } from '../src/calc/guesses.js';
import { hoursOfWork, inUnit } from '../src/calc/lenses.js';
import { gaps } from '../src/calc/compare.js';
import { sumKnown, ratio } from '../src/calc/money.js';
import { newHousehold } from '../src/store/schema.js';
import { makeValue } from '../src/store/value.js';
import { useSingleTotal, findLine, findCategory } from '../src/store/edits.js';
import { loadRefs, near } from './helpers.js';

const refs = loadRefs();
const v = (amount, cadence = 'month', status) => makeValue(amount, { cadence, status });

test('toMonthly handles every cadence', () => {
  assert.equal(toMonthly(v(1200), 'biweekly'), 1200);
  assert.equal(toMonthly(v(120, 'week')), 520); // 120 x 52 / 12
  assert.equal(toMonthly(v(1200, 'year')), 100);
  assert.equal(toMonthly(v(1000, 'paycheck'), 'biweekly'), 1000 * 26 / 12);
  assert.equal(toMonthly(v(1000, 'paycheck'), 'semimonthly'), 2000);
  assert.equal(toMonthly(v(1000, 'paycheck'), 'weekly'), 1000 * 52 / 12);
  assert.equal(toMonthly(v(1000, 'paycheck'), null), null, 'paycheck with no pay frequency is unknown, not zero');
  assert.equal(toMonthly(v(500, 'one-off')), 0, 'one-offs stay out of the monthly total');
  assert.equal(toMonthly(v(null)), null, 'empty is not zero');
  assert.equal(toMonthly(v(null, 'month', 'not-for-me')), 0, 'not for me counts as zero');
});

test('money helpers keep empty separate from zero', () => {
  assert.deepEqual(sumKnown([null, null]), { total: null, missing: 2 });
  assert.deepEqual(sumKnown([0, null, 5]), { total: 5, missing: 1 });
  assert.equal(ratio(5, 0), null);
  assert.equal(ratio(null, 5), null);
});

test('bracket tax: single, 43,900 taxable = 1,240 + 3,780 = 5,020', () => {
  assert.equal(Math.round(bracketTax(43900, refs.tax.brackets.single) * 100) / 100, 5020);
  assert.equal(bracketTax(0, refs.tax.brackets.single), 0);
});

test('1099 estimate: self-employment tax, half deducted, nothing withheld', () => {
  // gross 40,000: SE base 36,940; SE tax 36,940 x 15.3% = 5,651.82
  // AGI 40,000 - 2,825.91 = 37,174.09; taxable 21,074.09
  // income tax 1,240 + 8,674.09 x 12% = 2,280.8908; take-home 40,000 - 2,280.8908 - 5,651.82 = 32,067.2892
  const r = estimateAnnualTax({ gross: 40000, pretax: 0, type: '1099', filingStatus: 'single', stdDeduction: 16100 }, refs.tax);
  assert.ok(near(r.seTax, 5651.82));
  assert.ok(near(r.incomeTax, 2280.89));
  assert.ok(near(r.takeHome, 32067.29));
  assert.equal(r.fica, 0);
  assert.equal(r.withheld, false);
});

test('unemployment: income tax but no FICA; not-taxable: none', () => {
  // 20,000 - 16,100 = 3,900 taxable x 10% = 390
  const u = estimateAnnualTax({ gross: 20000, pretax: 0, type: 'unemployment', filingStatus: 'single', stdDeduction: 16100 }, refs.tax);
  assert.equal(u.takeHome, 19610);
  assert.equal(u.fica + u.seTax, 0);
  const n = estimateAnnualTax({ gross: 12000, pretax: 0, type: 'not-taxable', filingStatus: 'single', stdDeduction: 16100 }, refs.tax);
  assert.equal(n.takeHome, 12000);
});

test('standard deduction is used once: a known paycheck uses it before a gross-only source', () => {
  const d = newHousehold('Two jobs');
  d.income.push({ id: 'a', type: 'w2', label: 'Main', payFrequency: 'monthly', takeHome: v(3000), gross: makeValue(), pretaxRetirement: makeValue(), hoursPerWeek: null, state: 'active' });
  d.income.push({ id: 'b', type: 'unemployment', label: 'Second', payFrequency: 'monthly', takeHome: makeValue(), gross: v(12000, 'year'), pretaxRetirement: makeValue(), hoursPerWeek: null, state: 'active' });
  const inc = incomeSummary(d, refs.tax);
  // second source gets no deduction: 12,000 x 10% = 1,200 tax -> 10,800 a year = 900 a month
  assert.equal(inc.sources[1].takeHomeMonthly, 900);
  assert.equal(inc.sources[1].takeHomeStatus, 'guess');
  assert.equal(inc.takeHome, 3900);
});

test('reimbursable lines count fully until received, then only your share', () => {
  const d = newHousehold('Split');
  const { line } = findLine(d, 'eating-out');
  line.path = 'reimbursable';
  line.actual = v(120);
  line.owedBack = v(60);
  let food = budgetModel(d).categories.find((c) => c.id === 'food');
  assert.equal(food.actual.amount, 120);
  assert.equal(food.lines.find((l) => l.id === 'eating-out').owedOutstanding, 60);
  line.owedBackReceived = true;
  food = budgetModel(d).categories.find((c) => c.id === 'food');
  assert.equal(food.actual.amount, 60);
  assert.equal(food.lines.find((l) => l.id === 'eating-out').owedOutstanding, 0);
});

test('one-off amounts are listed separately and kept out of monthly totals', () => {
  const d = newHousehold('One-off');
  findLine(d, 'maintenance').line.actual = v(900, 'one-off');
  findLine(d, 'gas').line.actual = v(150);
  const m = budgetModel(d);
  assert.equal(m.categories.find((c) => c.id === 'transport').actual.amount, 150);
  assert.deepEqual(m.oneOffs.map((o) => [o.lineId, o.amount]), [['maintenance', 900]]);
});

test('archived lines stop counting; hidden lines still count', () => {
  const d = newHousehold('States');
  findLine(d, 'groceries').line.actual = v(400);
  findLine(d, 'eating-out').line.actual = v(100);
  findLine(d, 'eating-out').line.state = 'hidden';
  assert.equal(budgetModel(d).categories.find((c) => c.id === 'food').actual.amount, 500);
  findLine(d, 'eating-out').line.state = 'archived';
  assert.equal(budgetModel(d).categories.find((c) => c.id === 'food').actual.amount, 400);
});

test('single total is carved by later category estimates without losing the total', () => {
  const d = newHousehold('Carve');
  useSingleTotal(d).estimate = v(2000);
  findCategory(d, 'food').estimate = v(600);
  const ev = budgetModel(d).categories.find((c) => c.id === 'everything');
  assert.equal(ev.estimate.amount, 1400);
  assert.equal(ev.estimate.total, 2000);
  assert.equal(findCategory(d, 'everything').estimate.amount, 2000, 'stored total unchanged');
});

test('debt minimums flow into Debt payments as computed lines', () => {
  const d = newHousehold('Debts');
  d.debts.push({ id: 'd1', label: 'Card', type: 'credit-card', balance: v(1000), apr: v(20), minimum: v(35), dueDay: makeValue(), state: 'active' });
  d.debts.push({ id: 'd2', label: 'Old', type: 'other', balance: v(0), apr: v(0), minimum: v(50), dueDay: makeValue(), state: 'archived' });
  const debt = budgetModel(d).categories.find((c) => c.id === 'debt');
  assert.equal(debt.estimate.amount, 35);
  assert.equal(debt.lines[0].status.actual, 'computed');
  assert.equal(debt.lines.length, 1);
});

test('guesses: HCOL household of 3 (married, 1 dependent) scales by 1.25 and says so', () => {
  const d = newHousehold('Guess');
  d.profile.state = 'CA';
  d.household.filingStatus = 'married-joint';
  d.household.dependents.count = 1;
  const g = guessFor(d, 'food', refs);
  assert.equal(g.amount, 1250); // 1,000 x 1.25
  assert.equal(g.status, 'guess');
  assert.match(g.note, /HCOL x1.25/);
  assert.equal(guessFor(d, 'savings', refs), null);
  assert.equal(colTierFor({ state: null, colTier: null }, refs.colTiers).tier, 'MCOL');
  assert.equal(colTierFor({ state: 'CA', colTier: 'LCOL' }, refs.colTiers).tier, 'LCOL', 'coach override wins');
});

test('hours of work and the lens toggle', () => {
  assert.equal(hoursOfWork(450, 22.5), 20);
  const totals = { takeHome: 4000 };
  assert.equal(inUnit(400, 'percent', totals, { hourlyTakeHome: 20 }), 0.1);
  assert.equal(inUnit(400, 'hours', totals, { hourlyTakeHome: 20 }), 20);
  assert.equal(inUnit(400, 'hours', totals, { hourlyTakeHome: null }), null);
});

test('gaps in dollars and percent', () => {
  const g = gaps(500, 400, 800);
  assert.equal(g.actualMinusEstimate, 300);
  assert.equal(g.actualMinusEstimatePct, 0.6);
  assert.equal(g.actualMinusDream, 400);
  assert.equal(g.actualMinusDreamPct, 1);
  assert.equal(g.dreamMinusEstimate, -100);
  assert.equal(g.dreamMinusEstimatePct, -0.2);
  assert.equal(gaps(null, 400, 800).actualMinusEstimate, null);
});

test('a brand new household computes without errors and points at take-home first', () => {
  const s = buildSummary(newHousehold('Empty'), refs);
  assert.equal(s.totals.surplus, null);
  assert.equal(s.completion.pct, 0);
  assert.equal(s.next[0].label, 'Take-home pay');
  assert.equal(s.blindSpot.pct, null);
});

test('since last time compares with the latest stored snapshot', () => {
  const d = newHousehold('Since');
  d.income.push({ id: 'a', type: 'w2', label: 'Job', payFrequency: 'monthly', takeHome: v(3000), gross: makeValue(), pretaxRetirement: makeValue(), hoursPerWeek: null, state: 'active' });
  d.snapshots.push({ date: '2026-08-01', takeHome: 2500, spending: null, surplus: null, savingsRate: null, blindSpot: null, completion: 0 });
  const s = buildSummary(d, refs);
  assert.equal(s.sinceLast.takeHome, 500);
  assert.equal(s.sinceLast.spending, null);
});

test('blind guess round compares against the original estimate and the actual', async () => {
  const { blindCompare } = await import('../src/calc/compare.js');
  const { startBlindRound } = await import('../src/store/edits.js');
  const d = newHousehold('Blind');
  findCategory(d, 'food').estimate = v(500);
  findLine(d, 'groceries').line.actual = v(800);
  const r = startBlindRound(d, '2026-10-15T10:00:00.000Z');
  r.estimates.food = v(700);
  const cmp = blindCompare(d, budgetModel(d), r.id);
  // original misses by 300, blind misses by 100 -> blind is closer; change = +200
  assert.deepEqual(cmp.rows.map((x) => [x.id, x.original, x.blind, x.actual, x.change, x.closer]), [['food', 500, 700, 800, 200, 'blind']]);
});

test('estimate and dream "left over" for the running total', () => {
  const d = newHousehold('Left');
  d.income.push({ id: 'a', type: 'w2', label: 'Job', payFrequency: 'monthly', takeHome: v(3000), gross: makeValue(), pretaxRetirement: makeValue(), hoursPerWeek: null, state: 'active' });
  d.noDebts = true;
  findCategory(d, 'housing').estimate = v(1200);
  findCategory(d, 'savings').estimate = v(300);
  findCategory(d, 'food').dream = v(400);
  const t = buildSummary(d, refs).totals;
  assert.equal(t.estimateLeft, 1500); // 3,000 - (1,200 + 0 debt) - 300
  assert.equal(t.dreamLeft, 2600); // 3,000 - (400 + 0 debt); no savings dream
});
