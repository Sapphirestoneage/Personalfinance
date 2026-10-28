// Couples on screen (Batch 7, S-277): the made-up NYC couple (fixtures/demo-couple.json), worked by hand.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRules, readJson } from './spine-helpers.js';
import { readHousehold } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';
import { summarize } from '../engine/summary.js';
import { yearTax } from '../engine/tax.js';
import { validate } from '../engine/schema.js';
import { isCouple, addPartner, whoseOf, setWhose, splitOf, personView, splitTotals } from '../engine/couple.js';
import { getAt, valueOf as v } from '../engine/spine.js';

const R = loadRules();
const couple = () => applyDefaults(readHousehold(readJson('fixtures/demo-couple.json'), { today: '2026-10-26' }).spine, R);
const single = () => applyDefaults(readHousehold(readJson('fixtures/demo.json'), { today: '2026-10-26' }).spine, R);

test('the example couple is valid and made up', () => {
  const raw = readJson('fixtures/demo-couple.json');
  assert.equal(raw.meta.demo, true);
  assert.deepEqual(validate(raw).errors, []);
  assert.ok(isCouple(couple()));
});

test('NYC, filing jointly: 139,800 gross, 32,200 standard deduction, 107,600 taxable, federal 13,096', () => {
  const t = yearTax(couple(), R, 2026).lines;
  assert.equal(t.grossIncome.value, (7500 + 5200) * 12 - 12 * (750 + 300), 'both salaries a year, less what goes to the 401(k) and 403(b) before tax');
  assert.equal(t.taxable.value, 139800 - 32200);
  // 10% of 24,800 + 12% of (100,800 - 24,800) + 22% of (107,600 - 100,800)
  assert.equal(t.federalIncomeTax.value, 2480 + 9120 + 1496);
  assert.ok(t.localTax.value > 0, 'New York City tax is charged');
});

test('each person\'s own numbers add up to the household\'s', () => {
  const sp = couple(), s = summarize(sp, R);
  const a = personView(sp, s, 0), b = personView(sp, s, 1);
  assert.equal(Math.round((a.takeHome + b.takeHome) * 100) / 100, s.cashflow.income.takeHome.value);
  assert.equal(Math.round((a.left + b.left) * 100) / 100, s.cashflow.monthlySurplus.value);
  assert.equal(a.netWorth + b.netWorth, s.sheet.netWorth.value);
  // Half each, but Sam's gym (60) is Sam's: Jordan 0.5 x (5,424 - 60) = 2,682; Sam 2,682 + 60 = 2,742.
  assert.equal(a.spending, 2682); assert.equal(b.spending, 2742);
  // Jordan: 62,000 + half of 24,000 joint cash - half of the 1,800 joint card = 73,100.
  assert.equal(a.netWorth, 73100);
  // Sam: 24,000 + 9,000 + 12,000 - 28,000 - 900 = 16,100.
  assert.equal(b.netWorth, 16100);
});

test('by take-home, the split follows pay; the household\'s numbers do not move', () => {
  const sp = couple(), before = summarize(sp, R);
  const by = { ...sp, household: { ...sp.household, coupleSplit: { ...sp.household.coupleSplit, value: 'income' } } };
  const s = summarize(by, R);
  assert.equal(s.cashflow.monthlySurplus.value, before.cashflow.monthlySurplus.value);
  const a = personView(by, s, 0), b = personView(by, s, 1);
  assert.ok(a.spending > b.spending, 'Jordan takes home more, so pays more');
  assert.equal(Math.round((a.spending + b.spending) * 100) / 100, 5424);
  assert.equal(splitOf(by, sp.expenses.find((e) => e.id === 'gym')), 'partner', 'a line\'s own split wins');
});

test('yours, theirs and joint for the one-pager', () => {
  const t = splitTotals(couple());
  assert.deepEqual(t.me, { netWorth: 62000, retirement: 62000, debts: 0 });
  assert.deepEqual(t.partner, { netWorth: 5000, retirement: 33000, debts: 28000 });
  assert.deepEqual(t.joint, { netWorth: 22200, retirement: 0, debts: 1800 });
});

test('adding a partner: a second person, the filing status, whose', () => {
  let sp = addPartner(single(), { name: 'Robin Ash', birthDate: '1995-02-02', filing: 'mfj' }, '2026-10-26');
  assert.ok(isCouple(sp));
  assert.equal(sp.household.people[1].name, 'Robin Ash');
  assert.equal(v(sp.household.filingStatus), 'mfj');
  assert.equal(addPartner(sp, { name: 'Again' }, '2026-10-26'), sp, 'only one partner');
  sp = setWhose(sp, 'debts', 'sl', 'partner', '2026-10-26');
  assert.equal(whoseOf(sp, 'debts', sp.debts.find((d) => d.id === 'sl')), 'partner');
  sp = setWhose(sp, 'accounts', 'hysa', 'joint', '2026-10-26');
  assert.equal(v(getAt(sp, 'accounts.hysa.owner')), 'joint');
  const notMarried = addPartner(single(), { name: 'Kit', filing: 'single' }, '2026-10-26');
  assert.equal(v(notMarried.household.filingStatus), 'single', 'not married: each files on their own');
});
