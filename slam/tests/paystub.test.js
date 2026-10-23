// Paystub order: gross, pre-tax deductions, taxes withheld, post-tax deductions,
// take-home. Withheld is checked against the estimate of the real tax. Uses incomeSummary in
// engines/income.js, the store (schema, value, validate, migrate), and the helpers, which load the
// reference data in src/data; the tax constants (src/data/tax-constants.json) supply the brackets,
// standard deduction and FICA rates the hand numbers below use.
//
// Hand numbers (the same pay as Tal's screen): $35/hour x 30 hours x 52 = 54,600 a year,
// paid every two weeks: 2,100 a paycheck, 4,550 a month. Retirement 3% = 63 a paycheck, 1,638 a year.
// Estimate: 54,600 - 1,638 = 52,962; - 16,100 = 36,862 taxable;
//   income tax 1,240 + (36,862 - 12,400) x 12% = 1,240 + 2,935.44 = 4,175.44
//   FICA (retirement does not lower it) 54,600 x 7.65% = 4,176.90
//   total 8,352.34 = 321.243846 a paycheck; rate 8,352.34 / 54,600 = 15.297%

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newHousehold, newIncome, newDeduction } from '../src/store/schema.js';
import { makeValue } from '../src/store/value.js';
import { incomeSummary } from '../src/engines/income.js';
import { validateHousehold } from '../src/store/validate.js';
import { migrate } from '../src/store/migrate.js';
import { loadRefs, near } from './helpers.js';

const refs = loadRefs();
const pc = (n) => makeValue(n, { cadence: 'paycheck' });

function tal() {
  const d = newHousehold('Tal (demo)');
  const inc = newIncome({ id: 'job', type: 'w2', payFrequency: 'biweekly', payBasis: 'hourly' });
  inc.hourlyRate = makeValue(35);
  inc.hoursPerWeek = 30;
  inc.deductions.push({ ...newDeduction({ id: 'ret', kind: 'retirement' }), percent: 3 });
  d.income.push(inc);
  return { d, inc };
}

test('typed take-home: withheld is worked out and checked against the estimate', () => {
  const { d, inc } = tal();
  inc.takeHome = pc(2000);
  const r = incomeSummary(d, refs.tax).sources[0];
  const t = r.taxCheck;
  // withheld = 2,100 - 63 - 2,000 = 37 a paycheck = 962 a year
  assert.ok(near(r.withheldPerPaycheck, 37));
  assert.equal(t.withheldFrom, 'take-home');
  assert.ok(near(t.estTotalAnnual, 8352.34));
  assert.ok(near(t.estRate, 0.152973, 5));
  // 962 - 8,352.34 = -7,390.34: likely owed, or the take-home is too high
  assert.ok(near(t.gapAnnual, -7390.34));
});

test('paystub lines: take-home is what they leave, and the gap leaves state out', () => {
  const { d, inc } = tal();
  Object.assign(inc.withheld, { federal: pc(150), socialSecurity: pc(130.2), medicare: pc(30.45), state: pc(80) });
  const r = incomeSummary(d, refs.tax).sources[0];
  // 2,100 - 63 - 150 - 130.20 - 30.45 - 80 = 1,646.35 a paycheck; x 26 / 12 = 3,567.091667 a month
  assert.ok(near(r.takeHomePerPaycheck, 1646.35));
  assert.ok(near(r.takeHomeMonthly, 3567.091667));
  assert.equal(r.takeHomeStatus, 'computed');
  assert.ok(near(r.withheldPerPaycheck, 390.65));
  // federal part 310.65 x 26 = 8,076.90; - 8,352.34 = -275.44 likely owed
  assert.ok(near(r.taxCheck.gapAnnual, -275.44));
  assert.ok(near(r.preTaxPerPaycheck, 63));
  assert.equal(r.postTaxMonthly, 0);
  assert.deepEqual(validateHousehold(d), []);
});

test('paystub lines need the three federal lines before take-home is worked out', () => {
  const { d, inc } = tal();
  inc.withheld.federal = pc(150);
  const r = incomeSummary(d, refs.tax).sources[0];
  assert.equal(r.takeHomeStatus, 'guess', 'Social Security and Medicare still blank: back to the estimate');
});

test('typed take-home and paystub lines that do not add up are flagged', () => {
  const { d, inc } = tal();
  inc.takeHome = pc(1650);
  Object.assign(inc.withheld, { federal: pc(150), socialSecurity: pc(130.2), medicare: pc(30.45), state: pc(80) });
  const r = incomeSummary(d, refs.tax).sources[0];
  // 1,650 - 1,646.35 = 3.65 a paycheck more than the lines leave; x 26 / 12 = 7.908333 a month
  assert.ok(near(r.taxCheck.stubMismatchMonthly, 7.908333));
});

test('post-tax deductions: union dues and Roth come after taxes', () => {
  const { d, inc } = tal();
  inc.deductions.push({ ...newDeduction({ id: 'u', kind: 'union' }), amount: pc(20) });
  inc.deductions.push({ ...newDeduction({ id: 'r', kind: 'roth' }), percent: 2 });
  inc.deductions.push({ ...newDeduction({ id: 'dn', kind: 'dental' }), amount: pc(10) });
  const r = incomeSummary(d, refs.tax).sources[0];
  // pre-tax 63 + 10 = 73; post-tax 20 + 2% of 2,100 = 42 -> 62 a paycheck
  assert.ok(near(r.preTaxPerPaycheck, 73));
  assert.ok(near(r.postTaxPerPaycheck, 62));
  assert.deepEqual(validateHousehold(d), []);
});

test('compat: incomes before paystub taxes, or before the extra tax lines, load with every line blank', () => {
  const { d } = tal();
  const raw = JSON.parse(JSON.stringify(d));
  delete raw.income[0].withheld;
  const m = migrate(raw);
  assert.deepEqual(Object.keys(m.income[0].withheld), [
    'federal',
    'socialSecurity',
    'medicare',
    'state',
    'local',
    'sdi',
    'pfl',
    'sui',
    'other'
  ]);
  assert.equal(m.income[0].withheld.state.amount, null);
});

test('hourly: an estimated paycheck is worked out, and a typed actual paycheck shows what does not add up', () => {
  const { d, inc } = tal();
  let r = incomeSummary(d, refs.tax).sources[0];
  // no take-home typed: estimate = 2,100 - 63 - 321.243846 (8,352.34 / 26) = 1,715.756154 a paycheck
  assert.ok(near(r.estimatedTakeHomePerPaycheck, 1715.756154));
  assert.equal(r.estimatedFrom, 'tax estimate');
  assert.equal(r.paycheckGapMonthly, null, 'nothing to compare yet');
  inc.takeHome = pc(2000);
  r = incomeSummary(d, refs.tax).sources[0];
  // actual 2,000 - estimate 1,715.756154 = 284.243846 a paycheck more than the estimate; x 26 / 12 = 615.861667 a month
  assert.ok(near(r.paycheckGapPerPaycheck, 284.243846));
  assert.ok(near(r.paycheckGapMonthly, 615.861667));
  assert.ok(near(r.estimatedTaxPerPaycheck, 321.243846));
  // with the three federal paystub lines, the estimate uses them: 2,100 - 63 - (150 + 130.20 + 30.45) = 2,037 - 310.65 = 1,726.35
  Object.assign(inc.withheld, { federal: pc(150), socialSecurity: pc(130.2), medicare: pc(30.45) });
  r = incomeSummary(d, refs.tax).sources[0];
  assert.equal(r.estimatedFrom, 'paystub lines');
  assert.ok(near(r.estimatedTakeHomePerPaycheck, 1726.35));
  assert.ok(near(r.paycheckGapPerPaycheck, 273.65)); // 2,000 - 1,726.35
});

test('extra tax lines (SDI, paid leave) count with the state and local lines, outside the federal comparison', () => {
  const { d, inc } = tal();
  Object.assign(inc.withheld, {
    federal: pc(150),
    socialSecurity: pc(130.2),
    medicare: pc(30.45),
    state: pc(80),
    sdi: pc(18.9),
    pfl: pc(10)
  });
  const r = incomeSummary(d, refs.tax).sources[0];
  // take-home = 2,100 - 63 - (150 + 130.20 + 30.45 + 80 + 18.90 + 10) = 2,037 - 419.55 = 1,617.45 a paycheck
  assert.ok(near(r.takeHomePerPaycheck, 1617.45));
  // the federal comparison still uses only the federal three: 310.65 x 26 = 8,076.90 - 8,352.34 = -275.44
  assert.ok(near(r.taxCheck.gapAnnual, -275.44));
  // state and local side: (80 + 18.90 + 10) x 26 / 12 = 108.90 x 26 / 12 = 235.95 a month
  assert.ok(near(r.taxCheck.stateWithheldMonthly, 235.95));
});

// Taxes one line per tax (S-099), Tal's pay by hand (see the top of this file), per paycheck (x 26 / 12 = a month):
//   federal income tax 4,175.44 / 26 = 160.593846; taxable 36,862 is in the 12% bracket (50,400 is its top)
//   Social Security 54,600 x 6.2% = 3,385.20 / 26 = 130.20
//   Medicare 54,600 x 1.45% = 791.70 / 26 = 30.45
//   estimate 160.593846 + 130.20 + 30.45 = 321.243846
test('taxes break down: federal income tax at its bracket, Social Security, Medicare, and the rest', () => {
  const { d, inc } = tal();
  inc.takeHome = pc(2000);
  const r = incomeSummary(d, refs.tax).sources[0];
  const line = (k) => r.taxLines.find((l) => l.key === k);
  assert.deepEqual(
    r.taxLines.map((l) => l.key),
    ['federal', 'socialSecurity', 'medicare', 'short']
  );
  assert.ok(near(line('federal').perPaycheck, 160.593846, 5));
  assert.equal(line('federal').bracket, 0.12);
  assert.ok(near(line('socialSecurity').perPaycheck, 130.2));
  assert.ok(near(line('medicare').perPaycheck, 30.45));
  // Withheld 37 a paycheck: 37 - 321.243846 = -284.243846, the gap the "doesn't add up" note names.
  assert.ok(near(line('short').perPaycheck, -284.243846, 5));
  // The lines add up to the taxes row: 160.593846 + 130.20 + 30.45 - 284.243846 = 37
  assert.ok(
    near(
      r.taxLines.reduce((a, l) => a + l.perPaycheck, 0),
      r.taxPerPaycheck
    )
  );
  assert.ok(near(r.taxPerPaycheck, 37));
});

test('taxes break down: with more withheld than the federal estimate, the rest is state and other', () => {
  const { d, inc } = tal();
  // 2,100 - 63 - 1,650 = 387 withheld; 387 - 321.243846 = 65.756154 left for state and other taxes
  inc.takeHome = pc(1650);
  const r = incomeSummary(d, refs.tax).sources[0];
  const rest = r.taxLines.find((l) => l.key === 'rest');
  assert.equal(rest.label, 'State and other taxes');
  assert.ok(near(rest.perPaycheck, 65.756154, 5));
});

test('taxes break down: copied paystub lines are used as they are, one per line', () => {
  const { d, inc } = tal();
  Object.assign(inc.withheld, { federal: pc(150), socialSecurity: pc(130.2), medicare: pc(30.45), state: pc(80) });
  const r = incomeSummary(d, refs.tax).sources[0];
  assert.deepEqual(
    r.taxLines.map((l) => [l.key, Math.round(l.perPaycheck * 100) / 100, l.from]),
    [
      ['federal', 150, 'paystub'],
      ['socialSecurity', 130.2, 'paystub'],
      ['medicare', 30.45, 'paystub'],
      ['state', 80, 'paystub']
    ]
  );
  // 150 + 130.20 + 30.45 + 80 = 390.65, the taxes row
  assert.ok(near(r.taxPerPaycheck, 390.65));
});

test('taxes break down: with only gross pay, the estimate is listed and state tax says it is not estimated', () => {
  const { d } = tal();
  const r = incomeSummary(d, refs.tax).sources[0];
  assert.deepEqual(
    r.taxLines.map((l) => l.key),
    ['federal', 'socialSecurity', 'medicare', 'state']
  );
  assert.equal(r.taxLines[3].monthly, null);
  // taxes row = the estimate, 321.243846 a paycheck
  assert.ok(near(r.taxPerPaycheck, 321.243846, 5));
});

// How the federal estimate is worked out (S-101), Tal by hand (top of this file), for the year:
//   gross 54,600 - pre-tax 1,638 = adjusted gross 52,962; - standard deduction 16,100 = taxable 36,862
//   10% on the first 12,400 = 1,240; 12% on the next 36,862 - 12,400 = 24,462 = 2,935.44; total 4,175.44
//   4,175.44 / 54,600 = 0.0764732 of gross; Social Security on 54,600 (under the 184,500 wage base)
test('the federal estimate, step by step, for the Sankey', () => {
  const { d, inc } = tal();
  inc.takeHome = pc(2000);
  const w = incomeSummary(d, refs.tax).sources[0].taxLines.find((l) => l.key === 'federal').walk;
  assert.deepEqual(
    [w.gross, w.pretax, w.agi, w.std, w.taxable].map((x) => Math.round(x * 100) / 100),
    [54600, 1638, 52962, 16100, 36862]
  );
  assert.deepEqual(
    w.slices.map((s) => [s.rate, Math.round(s.amount * 100) / 100, Math.round(s.tax * 100) / 100]),
    [
      [0.1, 12400, 1240],
      [0.12, 24462, 2935.44]
    ]
  );
  assert.ok(near(w.incomeTax, 4175.44));
  assert.ok(near(w.effectiveRate, 0.0764732, 6));
  assert.equal(w.bracket, 0.12);
  assert.ok(near(w.ssBase, 54600));
  // The Sankey's parts add back to gross: 1,638 + 16,100 + 12,400 + 24,462 = 54,600
  assert.ok(near(w.pretax + w.std + w.slices.reduce((a, s) => a + s.amount, 0), w.gross));
});

// Additional withholding of 50 a paycheck (W-4 step 4c), by hand:
//   with only gross pay: taxes 321.243846 + 50 = 371.243846; take-home 2,100 - 63 - 371.243846 = 1,665.756154
//   with the 2,000 paycheck typed: withheld is still 37, so not taken out = 37 - 321.243846 - 50 = -334.243846
test('additional withholding comes out of each paycheck and shows as its own tax line', () => {
  const { d, inc } = tal();
  inc.extraWithholding = pc(50);
  let r = incomeSummary(d, refs.tax).sources[0];
  assert.ok(near(r.taxPerPaycheck, 371.243846, 5));
  assert.ok(near(r.takeHomePerPaycheck, 1665.756154, 5));
  assert.ok(near(r.taxLines.find((l) => l.key === 'extra').perPaycheck, 50));
  assert.deepEqual(validateHousehold(d), []);
  inc.takeHome = pc(2000);
  r = incomeSummary(d, refs.tax).sources[0];
  assert.ok(near(r.taxLines.find((l) => l.key === 'short').perPaycheck, -334.243846, 5));
  assert.ok(near(r.estimatedTakeHomePerPaycheck, 1665.756154, 5));
  // Kept on save and load; files without it load without it.
  assert.ok(near(migrate(JSON.parse(JSON.stringify(d))).income[0].extraWithholding.amount, 50));
  assert.equal('extraWithholding' in migrate(JSON.parse(JSON.stringify(tal().d))).income[0], false);
});
