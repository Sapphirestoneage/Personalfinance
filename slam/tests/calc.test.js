// Phase 2 unit tests for the pure math engines: cadences (normalize.js), federal tax (tax.js), income
// and paycheck deductions (income.js), the budget model (model.js), guesses, lenses, compare, money,
// rent share (totals.js), the allocation and buildSummary (summary.js). Expected numbers are worked by
// hand in the comments. Builds households from store/schema.js, store/edits.js and store/value.js, runs
// one old shape through store/migrate.js, reads the reference data (tax-constants.json and the rest)
// through helpers.js, and loads the Luis demo household and the October fixture for two tests.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toMonthly } from '../src/engines/normalize.js';
import { bracketTax, estimateAnnualTax } from '../src/engines/tax.js';
import { incomeSummary } from '../src/engines/income.js';
import { budgetModel } from '../src/engines/model.js';
import { buildSummary } from '../src/engines/summary.js';
import { guessFor } from '../src/engines/guesses.js';
import { hoursOfWork, inUnit } from '../src/engines/lenses.js';
import { gaps } from '../src/engines/compare.js';
import { sumKnown, ratio } from '../src/engines/money.js';
import { newHousehold, newIncome } from '../src/store/schema.js';
import { migrate } from '../src/store/migrate.js';
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
  // 10% of the first 12,400 = 1,240; 12% of the other 31,500 = 3,780 (tax-constants.json, single brackets).
  assert.equal(Math.round(bracketTax(43900, refs.tax.brackets.single) * 100) / 100, 5020);
  assert.equal(bracketTax(0, refs.tax.brackets.single), 0);
});

test('1099 estimate: self-employment tax, half deducted, nothing withheld', () => {
  // gross 40,000: SE base 36,940; SE tax 36,940 x 15.3% = 5,651.82
  // AGI 40,000 - 2,825.91 = 37,174.09; taxable 21,074.09
  // income tax 1,240 + 8,674.09 x 12% = 2,280.8908; take-home 40,000 - 2,280.8908 - 5,651.82 = 32,067.2892
  const r = estimateAnnualTax({ gross: 40000, type: '1099', filingStatus: 'single', stdDeduction: 16100 }, refs.tax);
  assert.ok(near(r.seTax, 5651.82));
  assert.ok(near(r.incomeTax, 2280.89));
  assert.ok(near(r.takeHome, 32067.29));
  assert.equal(r.fica, 0);
  assert.equal(r.withheld, false);
});

test('unemployment: income tax but no FICA; not-taxable: none', () => {
  // 20,000 - 16,100 = 3,900 taxable x 10% = 390
  const u = estimateAnnualTax({ gross: 20000, type: 'unemployment', filingStatus: 'single', stdDeduction: 16100 }, refs.tax);
  assert.equal(u.takeHome, 19610);
  assert.equal(u.fica + u.seTax, 0);
  const n = estimateAnnualTax({ gross: 12000, type: 'not-taxable', filingStatus: 'single', stdDeduction: 16100 }, refs.tax);
  assert.equal(n.takeHome, 12000);
});

test('standard deduction is used once: a known paycheck uses it before a gross-only source', () => {
  const d = newHousehold('Two jobs');
  d.income.push({ id: 'a', type: 'w2', label: 'Main', payFrequency: 'monthly', takeHome: v(3000), gross: makeValue(), deductions: [], hoursPerWeek: null, state: 'active' });
  d.income.push({ id: 'b', type: 'unemployment', label: 'Second', payFrequency: 'monthly', takeHome: makeValue(), gross: v(12000, 'year'), deductions: [], hoursPerWeek: null, state: 'active' });
  const inc = incomeSummary(d, refs.tax);
  // Unemployment lands in full (nothing withheld): 12,000 / 12 = 1,000 a month.
  // It gets no standard deduction: 12,000 x 10% = 1,200 tax, set aside 1,200 / 52 = 23.076923 a week.
  assert.equal(inc.sources[1].takeHomeMonthly, 1000);
  assert.notEqual(inc.sources[1].takeHomeStatus, 'guess');
  assert.equal(inc.sources[1].unemployment.owedAtTaxTime, 1200);
  assert.ok(near(inc.sources[1].unemployment.setAsideWeekly, 23.076923));
  assert.equal(inc.takeHome, 4000);
});

test('unemployment: one benefit number, set-aside when not withheld, 10% option', () => {
  const d = newHousehold('Benefits');
  d.currentMonth = '2026-10';
  d.income.push({ ...newIncome({ id: 'u', type: 'unemployment', payFrequency: 'weekly' }), gross: v(869, 'week'), benefitWeeksLeft: 10 });
  let u = incomeSummary(d, refs.tax).sources[0];
  // 869 x 52 = 45,188 a year = 3,765.666667 a month, all of it lands.
  assert.ok(near(u.takeHomeMonthly, 3765.666667));
  // 45,188 - 16,100 = 29,088 taxable: 1,240 + (29,088 - 12,400) x 12% = 3,242.56; / 52 = 62.356923 a week.
  assert.ok(near(u.unemployment.estTaxAnnual, 3242.56));
  assert.ok(near(u.unemployment.setAsideWeekly, 62.356923));
  // 10 weeks from Oct 15 is Dec 24: ends around December 2026; 869 x 10 = 8,690 still to come.
  assert.equal(u.unemployment.endsAround, 'December 2026');
  assert.ok(near(u.unemployment.stillToCome, 8690));
  d.income[0].withholding = 'ten-percent';
  u = incomeSummary(d, refs.tax).sources[0];
  // 10% withheld: 3,765.666667 x 0.9 = 3,389.10 lands; 4,518.80 withheld >= 3,242.56 owed, refund about 1,276.24.
  assert.ok(near(u.takeHomeMonthly, 3389.1));
  assert.equal(u.unemployment.owedAtTaxTime, 0);
  assert.ok(near(u.unemployment.refundLikely, 1276.24));
});

test('unemployment compat: old take-home moves to the benefit; equal take-home and gross means none withheld', () => {
  const old = newHousehold('Old');
  old.income.push({ ...newIncome({ id: 'a', type: 'unemployment', payFrequency: 'weekly' }), takeHome: v(869, 'paycheck'), gross: v(869, 'week') });
  old.income.push({ ...newIncome({ id: 'b', type: 'unemployment', payFrequency: 'weekly' }), takeHome: v(400, 'paycheck') });
  old.income.push({ ...newIncome({ id: 'c', type: 'unemployment', payFrequency: 'weekly' }), takeHome: v(450, 'week'), gross: v(500, 'week') });
  const m = migrate(JSON.parse(JSON.stringify(old)));
  assert.equal(m.income[0].gross.amount, 869);
  assert.equal(m.income[0].takeHome.amount, null);
  assert.equal(m.income[0].withholding, 'none');
  assert.deepEqual([m.income[1].gross.amount, m.income[1].gross.cadence], [400, 'week']);
  assert.equal(m.income[2].withholding, 'ten-percent');
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
  // 2,000 - 600 for food = 1,400 left in "everything".
  assert.equal(ev.estimate.amount, 1400);
  assert.equal(ev.estimate.total, 2000);
  assert.equal(findCategory(d, 'everything').estimate.amount, 2000, 'stored total unchanged');
});

test('debt minimums flow into Debt payments as computed lines', () => {
  const d = newHousehold('Debts');
  d.debts.push({ id: 'd1', label: 'Card', type: 'credit-card', balance: v(1000), apr: v(20), minimum: v(35), dueDay: makeValue(), state: 'active' });
  d.debts.push({ id: 'd2', label: 'Old', type: 'other', balance: v(0), apr: v(0), minimum: v(50), dueDay: makeValue(), state: 'archived' });
  const debt = budgetModel(d).categories.find((c) => c.id === 'debt');
  // The minimum 35, plus the card's interest as soon as its details are in (S-133): 1,000 x 20 / 1,200 =
  // 16.666..., 16.67. 35 + 16.67 = 51.67. The archived debt adds nothing.
  assert.equal(debt.estimate.amount, 51.67);
  assert.equal(debt.lines[0].status.actual, 'computed');
  assert.deepEqual(debt.lines.map((l) => [l.id, l.estimate]), [['debt:d1', 35], ['interest:d1', 16.67]]);
});

test('guesses: the national average for the household size, labeled Guess with its source', () => {
  const d = newHousehold('Guess');
  d.profile.state = 'CA';
  d.household.filingStatus = 'married-joint';
  d.household.dependents.count = 1;
  // household of 3 = you + spouse + 1 dependent; spending-averages.json size 3 food = 1,000, used as is
  const g = guessFor(d, 'food', refs);
  assert.equal(g.amount, 1000);
  assert.equal(g.status, 'guess');
  assert.match(g.note, /^Guess: national average, household of 3, source .*BLS Consumer Expenditure Survey 2023$/);
  assert.equal(guessFor(d, 'savings', refs), null);
  d.profile.state = 'MI';
  assert.equal(guessFor(d, 'food', refs).amount, 1000, 'the state does not change a guess');
});

test('hours of work and the lens toggle', () => {
  // 450 / 22.5 an hour = 20 hours; 400 / 4,000 take-home = 0.1; 400 / 20 an hour = 20 hours; no rate, no answer.
  assert.equal(hoursOfWork(450, 22.5), 20);
  const totals = { takeHome: 4000 };
  assert.equal(inUnit(400, 'percent', totals, { hourlyTakeHome: 20 }), 0.1);
  assert.equal(inUnit(400, 'hours', totals, { hourlyTakeHome: 20 }), 20);
  assert.equal(inUnit(400, 'hours', totals, { hourlyTakeHome: null }), null);
});

// Gaps are actual vs estimate (S-097; actual vs plan is in the plan view).
test('gaps in dollars and percent', () => {
  const g = gaps(500, 800);
  // 800 - 500 = 300; 300 / 500 = 0.6
  assert.deepEqual(g, { actualMinusEstimate: 300, actualMinusEstimatePct: 0.6 });
  assert.equal(gaps(null, 800).actualMinusEstimate, null);
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
  d.income.push({ id: 'a', type: 'w2', label: 'Job', payFrequency: 'monthly', takeHome: v(3000), gross: makeValue(), deductions: [], hoursPerWeek: null, state: 'active' });
  d.snapshots.push({ date: '2026-08-01', takeHome: 2500, spending: null, surplus: null, savingsRate: null, blindSpot: null, completion: 0 });
  const s = buildSummary(d, refs);
  // 3,000 now - 2,500 in the August snapshot = 500; spending is blank in both, so no change to report.
  assert.equal(s.sinceLast.takeHome, 500);
  assert.equal(s.sinceLast.spending, null);
});

test('blind guess round compares against the original estimate and the actual', async () => {
  const { blindCompare } = await import('../src/engines/compare.js');
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

test('estimate "left over" for the running total (dreams have their own, in Eras)', () => {
  const d = newHousehold('Left');
  d.income.push({ id: 'a', type: 'w2', label: 'Job', payFrequency: 'monthly', takeHome: v(3000), gross: makeValue(), deductions: [], hoursPerWeek: null, state: 'active' });
  d.noDebts = true;
  findCategory(d, 'housing').estimate = v(1200);
  findCategory(d, 'savings').estimate = v(300);
  findCategory(d, 'food').dream = v(400);
  const s = buildSummary(d, refs);
  assert.equal(s.totals.estimateLeft, 1500); // 3,000 - (1,200 + 0 debt) - 300
  assert.equal(s.dreamLife.entry.dream.left, 2600); // 3,000 - (400 + 0 debt); no savings dream
});

test('hourly pay: gross from rate x hours, take-home guess, and pay in every unit', () => {
  // $25 an hour x 35 hours x 52 weeks = 45,500 a year = 3,791.666667 a month; biweekly paycheck 45,500 / 26 = 1,750.00
  // tax: 45,500 - 16,100 = 29,400 taxable -> 1,240 + 17,000 x 12% = 2,040 -> 3,280; FICA 45,500 x 7.65% = 3,480.75
  // take-home 45,500 - 3,280 - 3,480.75 = 38,739.25 a year = 3,228.270833 a month; paycheck 38,739.25 / 26 = 1,489.971154
  // hours 35 x 52 = 1,820 a year -> take-home per hour 38,739.25 / 1,820 = 21.285302; gross per hour 25
  const d = newHousehold('Hourly');
  d.income.push({ id: 'h', type: 'w2', label: 'Yedei Chesed', payFrequency: 'biweekly', payBasis: 'hourly', hourlyRate: v(25), takeHome: makeValue(), gross: makeValue(), deductions: [], hoursPerWeek: 35, state: 'active' });
  const s = incomeSummary(d, refs.tax).sources[0];
  assert.equal(s.grossFrom, 'hourly');
  assert.ok(near(s.grossAnnual, 45500));
  assert.ok(near(s.grossMonthly, 3791.67));
  assert.ok(near(s.grossPerPaycheck, 1750));
  assert.equal(s.grossPerHour, 25);
  assert.equal(s.takeHomeStatus, 'guess');
  assert.ok(near(s.takeHomeAnnual, 38739.25));
  assert.ok(near(s.takeHomeMonthly, 3228.27));
  assert.ok(near(s.takeHomePerPaycheck, 1489.97));
  assert.ok(near(s.takeHomePerHour, 21.285302, 6));
});

test('hourly pay without hours gives no gross (empty, not zero)', () => {
  const d = newHousehold('No hours');
  d.income.push({ id: 'h', type: 'w2', label: 'Job', payFrequency: 'weekly', payBasis: 'hourly', hourlyRate: v(20), takeHome: makeValue(), gross: makeValue(), deductions: [], hoursPerWeek: null, state: 'active' });
  assert.equal(incomeSummary(d, refs.tax).sources[0].grossMonthly, null);
});

test('family support is not taxed: gross 3,600 a year -> take-home 300 a month', () => {
  const d = newHousehold('Family');
  d.income.push({ id: 'f', type: 'family', label: 'Parents', payFrequency: 'monthly', takeHome: makeValue(), gross: v(3600, 'year'), deductions: [], hoursPerWeek: null, state: 'active' });
  const s = incomeSummary(d, refs.tax).sources[0];
  assert.equal(s.takeHomeMonthly, 300);
  assert.equal(s.taxMonthly, 0);
});

test('paycheck deductions: 401(k) as 5% of gross, health per paycheck, transit per month', () => {
  // gross: $25 x 35 h x 52 = 45,500 a year (3,791.666667 a month), paid every two weeks (26 paychecks)
  // 401(k) 5% = 2,275 a year = 189.583333 a month = 87.50 a paycheck (lowers income tax only)
  // health 80 a paycheck = 2,080 a year (lowers income tax and FICA)
  // transit 60 a month = 720 a year = 27.692308 a paycheck (lowers income tax and FICA)
  // all deductions 2,275 + 2,080 + 720 = 5,075
  // income tax: 45,500 - 5,075 = 40,425; - 16,100 = 24,325 taxable -> 1,240 + 11,925 x 12% = 2,671
  // FICA: (45,500 - 2,080 - 720) = 42,700 x 7.65% = 3,266.55
  // take-home: 45,500 - 5,075 - 2,671 - 3,266.55 = 34,487.45 a year = 2,873.954167 a month = 1,326.440385 a paycheck
  // take-home per hour: 34,487.45 / 1,820 = 18.949148
  const d = newHousehold('Deductions');
  d.income.push({ id: 'h', type: 'w2', label: 'Yedei Chesed', payFrequency: 'biweekly', payBasis: 'hourly', hourlyRate: v(25), takeHome: makeValue(), gross: makeValue(), hoursPerWeek: 35, state: 'active',
    deductions: [
      { id: 'r', kind: 'retirement', label: '', mode: 'percent', percent: 5, amount: makeValue(), pretax: true },
      { id: 'hl', kind: 'health', label: '', mode: 'amount', percent: null, amount: v(80, 'paycheck'), pretax: true },
      { id: 't', kind: 'transportation', label: '', mode: 'amount', percent: null, amount: v(60, 'month'), pretax: true }] });
  const s = incomeSummary(d, refs.tax).sources[0];
  const ret = s.deductions.find((x) => x.id === 'r');
  assert.ok(near(ret.annual, 2275));
  assert.ok(near(ret.monthly, 189.58));
  assert.ok(near(ret.perPaycheck, 87.5));
  assert.equal(ret.status, 'computed');
  assert.ok(near(s.deductions.find((x) => x.id === 't').perPaycheck, 27.69));
  assert.ok(near(s.deductionsAnnual, 5075));
  assert.ok(near(s.takeHomeAnnual, 34487.45));
  assert.ok(near(s.takeHomeMonthly, 2873.95));
  assert.ok(near(s.takeHomePerPaycheck, 1326.44));
  assert.ok(near(s.takeHomePerHour, 18.949148, 6));
  assert.ok(near(incomeSummary(d, refs.tax).retirementDeductions, 189.58));
});

test('a % deduction with no gross pay stays empty, not zero', () => {
  const d = newHousehold('No gross');
  d.income.push({ id: 'a', type: 'w2', label: 'Job', payFrequency: 'monthly', takeHome: v(3000), gross: makeValue(), hoursPerWeek: null, state: 'active',
    deductions: [{ id: 'r', kind: 'retirement', label: '', mode: 'percent', percent: 6, amount: makeValue(), pretax: true }] });
  const s = incomeSummary(d, refs.tax).sources[0];
  assert.equal(s.deductions[0].monthly, null);
  assert.equal(s.deductionsMissing, 1);
});

test('Total rent, then your share (S-123): an even split while your share is blank', async () => {
  const { rentShare } = await import('../src/engines/totals.js');
  const { october } = await import('./fixtures/october.js');
  const { makeValue } = await import('../src/store/value.js');
  const { findLine } = await import('../src/store/edits.js');
  const d = october();
  d.household.livingWith = 'roommates';
  d.household.roommates.count = 1;
  d.household.roommates.totalRent = makeValue(2500);
  // By hand: 2,500 for the place, you and 1 roommate: 2,500 / 2 = 1,250. Your share (the Rent line's
  // estimate) is blank, so it shows as null, never 0.
  assert.deepEqual([rentShare(d).total, rentShare(d).even, rentShare(d).yours, rentShare(d).lineId], [2500, 1250, null, 'rent']);
  // 2 roommates: 2,500 / 3 = 833.333... to the cent, 833.33.
  d.household.roommates.count = 2;
  assert.equal(rentShare(d).even, 833.33);
  // Once typed in Housing, your share is the line's: 1,100.
  findLine(d, 'rent').line.estimate = makeValue(1100);
  assert.equal(rentShare(d).yours, 1100);
});

test('Surplus first, then allocate it (S-132), by hand', async () => {
  const { loadHousehold } = await import('./helpers.js');
  const { addLines } = await import('../src/store/edits.js');
  const refs = loadRefs();
  const d = loadHousehold('luis');
  // Luis: take-home 4,600; spending estimates 3,405 + his cards' computed interest 108.46 (S-133) = 3,513.46
  // (luis.expected.js). Surplus 4,600 - 3,513.46 = 1,086.54.
  // Savings is one number, 300 (no lines typed), so nothing is grouped yet; allocated 300; not allocated
  // 1,086.54 - 300 = 786.54.
  const a = buildSummary(d, refs).allocation;
  assert.deepEqual([a.surplus, a.allocated, a.unallocated, a.groups], [1086.54, 300, 786.54, { saving: null, investing: null, debt: null }]);
  // The gap as a share of take-home (S-135): surplus rate 1,086.54 / 4,600 = 0.23620435; left over rate
  // 786.54 / 4,600 = 0.17098696.
  assert.ok(Math.abs(a.surplusRate - 0.23620435) < 1e-7 && Math.abs(a.unallocatedRate - 0.17098696) < 1e-7);
  // Only what is allocated counts as saving (S-138). Planned savings rate (300 + pre-tax 200) / (4,600 + 200)
  // = 500 / 4,800 = 0.10416667; the 786.54 not allocated yet would add 786.54 / 4,800 = 0.16386250, for
  // (300 + 786.54 + 200) / 4,800 = 1,286.54 / 4,800 = 0.26802917.
  assert.ok(Math.abs(a.savingsRate - 0.10416667) < 1e-7 && Math.abs(a.boost - 0.1638625) < 1e-7 && Math.abs(a.possibleSavingsRate - 0.26802917) < 1e-7);
  // The month (Luis's September): surplus 571.54 / take-home 4,600 = 0.12424783.
  assert.ok(Math.abs(buildSummary(d, refs).totals.surplusRate - 0.12424783) < 1e-7);
  // Broken into lines: emergency fund 200, "Extra on debt" 150 (its type from the name). 200 + 150 = 350
  // allocated; 1,086.54 - 350 = 736.54 not allocated yet.
  d.categories.find((c) => c.id === 'savings').split = true;
  const [extra] = addLines(d, 'savings', [{ name: 'Extra on debt', amount: 150, shared: false }]);
  assert.equal(extra.type, 'extra-debt');
  d.categories.find((c) => c.id === 'savings').lines.find((l) => l.id === 'emergency-fund').estimate = makeValue(200);
  const b = buildSummary(d, refs).allocation;
  assert.deepEqual([b.surplus, b.allocated, b.unallocated, b.groups.saving, b.groups.debt], [1086.54, 350, 736.54, 200, 150]);
});
