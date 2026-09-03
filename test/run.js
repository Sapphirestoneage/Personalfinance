#!/usr/bin/env node
/* ==========================================================================
   test/run.js — re-derives the maths outside the browser.
   --------------------------------------------------------------------------
   SPEC.md §14: "re-run the core math outside the browser against demo inputs
   to confirm formulas are correct (not just 'doesn't crash')."

   Expected values here are worked out independently from the spec's stated
   formulas and written as literals or as a second implementation. They are
   NOT copied from what the engine printed. When an expectation and the
   engine disagree, at least one of them is wrong and the run fails.

   Also checks the rules that are easy to regress: empty never becomes zero,
   a zero denominator never becomes Infinity, and every deep-link anchor
   declared in the registry exists in its room.

   Run:  node test/run.js
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const Money = require(path.join(ROOT, 'shared/money.js'));
const Schema = require(path.join(ROOT, 'shared/schema.js'));
const Registry = require(path.join(ROOT, 'shared/registry.js'));
const Demo = require(path.join(ROOT, 'shared/demo-persona.js'));
const Tier0 = require(path.join(ROOT, 'engines/tier0.js'));
const Foo = require(path.join(ROOT, 'engines/foo.js'));

const TABLES = {
  effectiveTaxRates: require(path.join(ROOT, 'data/effective_tax_rates_2026.json')),
  retirementMilestones: require(path.join(ROOT, 'data/retirement_milestones.json')),
  netWorthPercentiles: require(path.join(ROOT, 'data/net_worth_percentiles_scf_2022.json')),
  irsLimits: require(path.join(ROOT, 'data/irs_limits_2026.json')),
  fooRules: require(path.join(ROOT, 'data/foo_rules.json'))
};

/* ---- Tiny harness ------------------------------------------------------ */

let passed = 0;
const failures = [];

function check(name, actual, expected, tolerance) {
  const tol = tolerance === undefined ? 0 : tolerance;
  const near = typeof actual === 'number' && typeof expected === 'number'
    ? Math.abs(actual - expected) <= tol
    : actual === expected;
  if (near) { passed++; return; }
  failures.push(`${name}\n      expected: ${JSON.stringify(expected)}\n      actual:   ${JSON.stringify(actual)}`);
}

function checkTrue(name, condition, detail) {
  if (condition) { passed++; return; }
  failures.push(`${name}${detail ? '\n      ' + detail : ''}`);
}

function section(title) { console.log('\n' + title); }

/* ==========================================================================
   1. The demo persona, hand-derived.
   Robin Sparks: $72,000 gross, single, $9,500 cash, $48,000 invested,
   $18,400 @ 5.5% + $3,200 @ 22.9%, $305/mo minimums, $3,150/mo expenses,
   50% match on the first 6%, not currently capturing it. Age 32.
   ========================================================================== */

section('Demo persona — Tier 0 outputs');

const h = Demo.build();
/* Age is derived from a real clock, so pin the reference date the
   expectations were worked out against. */
const AS_OF = '2026-09-03';
check('age', Schema.ageFromDob(Demo.VALUES.dob, AS_OF), 32);

/* -- Net worth: (9,500 + 48,000) − (18,400 + 3,200) = 35,900 ------------- */
const nw = Tier0.netWorth(h);
check('netWorth.status', nw.status, 'ok');
check('netWorth cents', nw.value, 3590000);
check('totalAssets cents', nw.totalAssetsCents, 5750000);
check('totalDebt cents', nw.totalDebtCents, 2160000);

/* -- Estimated tax: $72,000 lands in the single filer's ≤$75,000 band,
      effective rate 0.19 -> $13,680 ------------------------------------- */
const tax = Tier0.estimatedAnnualTaxCents(h, TABLES);
check('effective tax rate', tax.effectiveRate, 0.19);
check('estimated annual tax cents', tax.value, 1368000);

/* -- Savings rate ------------------------------------------------------- */
/*    annual expenses  = 3,150 x 12          = 37,800
      saved (ex match) = 72,000 - 37,800 - 13,680 = 20,520
      rate             = 20,520 / 72,000     = 0.285
      match dollars    = 72,000 x 0.06 x 0.5 =  2,160
      saved (inc match)= 22,680  ->  0.315                                */
const rates = Tier0.savingsRate(h, TABLES);
check('savingsRate excludingMatch', rates.excludingMatch.value, 0.285, 1e-12);
check('savingsRate annual saved cents', rates.excludingMatch.annualSavingsCents, 2052000);
check('savingsRate includingMatch', rates.includingMatch.value, 0.315, 1e-12);
check('employer match cents', rates.includingMatch.employerMatchCents, 216000);
checkTrue('the two savings-rate variants differ',
  rates.excludingMatch.value !== rates.includingMatch.value);

/* -- Emergency fund: 9,500 / 3,150 = 3.0158730... months ---------------- */
const ef = Tier0.emergencyFundMonths(h);
check('emergencyFundMonths', ef.value, 9500 / 3150, 1e-12);

/* -- DTI: 305 / (72,000/12 = 6,000) = 0.0508333... ---------------------- */
const dti = Tier0.debtToIncome(h);
check('debtToIncome', dti.value, 305 / 6000, 1e-12);

/* -- FIRE number: 37,800 / 0.04 = 945,000 ------------------------------- */
const fire = Tier0.fireNumber(h);
check('fireNumber cents', fire.value, 94500000);
check('fireNumber uses the 4% SWR assumption', fire.swrRate, 0.04);
/* At the default SWR this must equal the annual-expenses x 25 shorthand. */
check('fireNumber === annual expenses x 25', fire.value, 3780000 * 25);

/* -- FIRE progress: 48,000 / 945,000 = 0.05079365... -------------------- */
const prog = Tier0.fireProgress(h, TABLES);
check('fireProgress', prog.value, 48000 / 945000, 1e-12);

/* -- Years to FIRE: recomputed here with an independent loop ------------- */
(function () {
  const target = 94500000, r = 0.07, contribution = 2268000;
  let balance = 4800000, years = 0;
  while (balance < target && years < 200) { balance = balance * (1 + r) + contribution; years++; }
  check('yearsToFire (independent loop)', prog.timeToFire.value, years);
  check('yearsToFire is 19 at these assumptions', prog.timeToFire.value, 19);
  check('yearsToFire contribution basis', prog.timeToFire.contributionBasis, 'includingMatch');
})();

/* -- Net worth percentile: $35,900, age 32 -> "under 35" band, between the
      p25 ($3,500) and p50 ($39,000) breakpoints ------------------------- */
(function () {
  const t = (35900 - 3500) / (39000 - 3500);
  const expected = 25 + t * (50 - 25);
  const pct = Tier0.netWorthPercentile(h, TABLES);
  check('netWorthPercentile status', pct.status, 'ok');
  check('netWorthPercentile', pct.value, expected, 1e-9);
  check('netWorthPercentile band', pct.bandLabel, 'under 35');
  check('netWorthPercentile records table version', pct.referenceVersion, 'scf-2022');
})();

/* -- Retirement benchmark: 48,000/72,000 = 0.6667x against a 1.4x target
      (age 32, linearly interpolated between 1x@30 and 3x@40) ------------ */
(function () {
  const bench = Tier0.retirementBenchmark(h, TABLES);
  check('retirement actual multiple', bench.value, 48000 / 72000, 1e-12);
  check('retirement target multiple @32', bench.targetMultiple, 1.4, 1e-12);
  check('retirement onTrack', bench.onTrack, false);
  /* shortfall = (1.4 - 0.6667) x 72,000 = $52,800 */
  check('retirement shortfall cents', bench.shortfallCents, 5280000, 1);
})();

/* -- FOO placement ------------------------------------------------------
      step 0 met: net monthly (72,000-13,680)/12 = 4,860 >= 3,150 + 305
      step 1 met: cash 9,500 >= max(1,000, one month 3,150)
      step 2 unmet: a real match exists and capturingFullMatch is false   */
section('Demo persona — FOO placement and flags');
(function () {
  const foo = Foo.evaluate(h, TABLES);
  check('foo stopped at step key', foo.stoppedAt.key, 'employer_match');
  check('foo stop status', foo.stoppedAt.status, 'unmet');
  check('foo placement step number', foo.placement.step, 2);
  check('foo walked three gates', foo.steps.length, 3);
  check('foo step 0', foo.steps[0].status, 'met');
  check('foo step 1', foo.steps[1].status, 'met');

  const keys = foo.flags.map(f => f.key).sort();
  check('flag count', foo.flags.length, 2);
  check('flags fired', keys.join(','), 'ef_alongside_high_interest_debt,match_left_on_table');
  /* DTI 5.1% and savings rate 28.5% are both healthy, so their flags must
     stay silent — a flag that always fires is worth nothing. */
  checkTrue('DTI flag silent at 5.1%', !keys.includes('dti_above_ceiling'));
  checkTrue('savings-rate flag silent at 28.5%', !keys.includes('savings_rate_below_benchmark'));
  checkTrue('utilisation flag silent at a 14.8% revolving share',
    !keys.includes('high_utilisation_vs_debt_load'));
})();

/* ==========================================================================
   2. Empty never becomes zero. SPEC.md §5.
   ========================================================================== */

section('Empty state — nothing computes, nothing shows a fake zero');

(function () {
  const empty = Schema.createHousehold();
  const all = Tier0.computeAll(empty, TABLES);
  ['netWorth', 'savingsRateExcludingMatch', 'savingsRateIncludingMatch',
   'emergencyFundMonths', 'debtToIncome', 'fireNumber', 'fireProgress',
   'netWorthPercentile', 'retirementBenchmark'].forEach(function (key) {
    const r = all[key];
    checkTrue(`${key} is incomplete on an empty household`,
      r.status !== 'ok', `got status "${r.status}" value ${r.value}`);
    checkTrue(`${key} has no numeric value`, r.value === null,
      `got ${JSON.stringify(r.value)}`);
    checkTrue(`${key} explains itself`, typeof r.reason === 'string' && r.reason.length > 0);
  });
  checkTrue('empty household yields no FOO flags', all.foo.flags.length === 0);
})();

(function () {
  check('parseMoney("") is not entered', Money.parseMoney(''), null);
  check('parseMoney("0") is an affirmative zero', Money.parseMoney('0'), 0);
  checkTrue('null is not "entered"', Money.isEntered(null) === false);
  checkTrue('0 IS "entered"', Money.isEntered(0) === true);
  check('formatCents(null) renders an em dash', Money.formatCents(null), '—');
  check('formatRate(null) renders an em dash', Money.formatRate(null), '—');
  check('parseRatePercent("7") is a decimal fraction', Money.parseRatePercent('7'), 0.07);
  check('formatRate(0.285) rounds for display', Money.formatRate(0.285, { decimals: 1 }), '28.5%');
})();

/* ==========================================================================
   3. Divide-by-zero and negatives. SPEC.md §6.
   ========================================================================== */

section('Zero denominators and negative values');

(function () {
  /* Expenses affirmatively zero: emergency fund coverage must not be
     Infinity, and the FIRE number must not be $0. */
  const z = Demo.build();
  z.expenses.monthlyEssential.estimatedValueCents = 0;

  const efz = Tier0.emergencyFundMonths(z);
  checkTrue('EF coverage with zero expenses is not Infinity',
    efz.status === 'incomplete' && efz.value === null,
    `got ${efz.status} / ${efz.value}`);

  const firez = Tier0.fireNumber(z);
  checkTrue('FIRE number with zero expenses is zero, not NaN',
    firez.status === 'ok' && firez.value === 0, `got ${firez.status} / ${firez.value}`);

  /* Zero income: every income-denominated ratio must decline to compute. */
  const noIncome = Demo.build();
  noIncome.people[0].incomeSources[0].grossAnnualIncomeCents = 0;
  const dtiZero = Tier0.debtToIncome(noIncome);
  checkTrue('DTI with zero income is incomplete, not Infinity',
    dtiZero.status === 'incomplete' && dtiZero.value === null);
  const srZero = Tier0.savingsRate(noIncome, TABLES);
  checkTrue('savings rate with zero income is incomplete, not NaN',
    srZero.excludingMatch.status === 'incomplete');

  /* Negative net worth: shown plainly, and never given a fake percentile. */
  const underwater = Demo.build();
  underwater.debts[0].balanceCents = 20000000; // $200,000
  const nwNeg = Tier0.netWorth(underwater);
  checkTrue('negative net worth is reported as a negative number',
    nwNeg.status === 'ok' && nwNeg.value < 0, `got ${nwNeg.value}`);
  check('negative net worth formats with a minus sign',
    Money.formatCents(nwNeg.value).startsWith('-$'), true);
  const pctNeg = Tier0.netWorthPercentile(underwater, TABLES);
  check('negative net worth is below the chart', pctNeg.status, 'below_chart');
  check('below-chart carries no percentile', pctNeg.value, null);
})();

/* ==========================================================================
   4. Household aggregation. SPEC.md §3.
   ========================================================================== */

section('Household aggregation — joint items and children');

(function () {
  const a = Schema.createPerson({ id: 'A', label: 'A', role: 'adult' });
  const b = Schema.createPerson({ id: 'B', label: 'B', role: 'adult' });
  const kid = Schema.createPerson({ id: 'K', label: 'Kid', role: 'child' });
  const hh = Schema.createHousehold({
    people: [a, b, kid],
    assets: [
      Schema.createAsset({ category: 'cash', valueCents: 100000, ownerIds: ['A', 'B'] }),
      Schema.createAsset({ category: 'cash', valueCents: 50000, ownerIds: ['A'] }),
      Schema.createAsset({ category: 'cash', valueCents: 25000, ownerIds: ['K'] })
    ]
  });
  /* Jointly owned counts once, not twice; the child's account is excluded. */
  check('joint asset counted exactly once', Schema.totalAssetsCents(hh).value, 150000);
  check('per-person view for A', Schema.ownedBy(hh.assets, 'A').length, 2);
  check('per-person view for B', Schema.ownedBy(hh.assets, 'B').length, 1);

  /* A child's income never lands in the household income roll-up. */
  kid.incomeSources.push(Schema.createIncomeSource({ personId: 'K', grossAnnualIncomeCents: 500000 }));
  a.incomeSources.push(Schema.createIncomeSource({ personId: 'A', grossAnnualIncomeCents: 7000000 }));
  check('child income excluded from household income',
    Schema.grossAnnualIncomeCents(hh).value, 7000000);
})();

/* ==========================================================================
   5. Assumptions are tunable, and a preview never persists. SPEC.md §12.2, §6
   ========================================================================== */

section('Assumptions');

(function () {
  check('default return rate', Schema.ASSUMPTION_DEFAULTS.expectedReturnRate, 0.07);
  check('default SWR', Schema.ASSUMPTION_DEFAULTS.swrRate, 0.04);

  /* A local override changes this view only. */
  const conservative = Tier0.fireNumber(h, { swrRate: 0.035 });
  check('FIRE number at a 3.5% SWR', conservative.value, Math.round(3780000 / 0.035));
  check('stored SWR is untouched by the preview',
    Schema.resolveAssumptions(h).swrRate, 0.04);
  check('default FIRE number unchanged after the preview', Tier0.fireNumber(h).value, 94500000);
})();

/* ==========================================================================
   6. Estimated vs tracked expenses. SPEC.md §12.3
   ========================================================================== */

section('Estimated vs tracked');

(function () {
  const t = Demo.build();
  t.expenses.monthlyEssential.trackedValueCents = 340000; // $3,400 actually spent
  const current = Schema.monthlyExpensesCents(t);
  check('tracked wins as the current figure', current.value, 340000);
  check('current figure is labelled tracked', current.source, 'tracked');
  check('the original estimate survives',
    t.expenses.monthlyEssential.estimatedValueCents, 315000);
  /* divergence = tracked - estimated = 3,400 - 3,150 = $250 over */
  check('divergence cents', Schema.expenseDivergenceCents(t).value, 25000);

  const estOnly = Demo.build();
  check('divergence is incomplete with no tracked figure',
    Schema.expenseDivergenceCents(estOnly).status, 'incomplete');
})();

/* ==========================================================================
   7. Spine contract. SPEC.md §1, §3
   ========================================================================== */

section('Spine');

(function () {
  const Spine = require(path.join(ROOT, 'shared/spine-v2.js'));
  ['getProfile', 'updateProfile', 'onChange', 'registerRoom', 'getVisitedRooms']
    .forEach(function (fn) {
      checkTrue(`spine exposes ${fn}()`, typeof Spine[fn] === 'function');
    });

  Spine.reset();
  check('a fresh profile is a household', Spine.getProfile().schemaVersion, Schema.SCHEMA_VERSION);
  checkTrue('a fresh profile has no flat keys',
    Spine.getProfile().annualSalary === undefined);

  let fired = 0;
  const off = Spine.onChange(() => { fired++; });
  Spine.registerRoom('financial-snapshot');
  check('registerRoom notifies listeners', fired, 1);
  check('visited rooms recorded', Spine.getVisitedRooms().join(','), 'financial-snapshot');
  Spine.registerRoom('financial-snapshot');
  check('registering the same room twice does not duplicate it',
    Spine.getVisitedRooms().length, 1);
  off();
  Spine.registerRoom('foo-ladder');
  check('unsubscribe stops notifications', fired, 1);

  /* getProfile hands back a copy — a room cannot mutate shared state. */
  const copy = Spine.getProfile();
  copy.people.push(Schema.createPerson({ label: 'ghost' }));
  check('getProfile returns a defensive copy', Spine.getProfile().people.length, 0);

  /* Legacy flat blobs migrate into the household shape. */
  const migrated = Spine._migrateLegacy({
    annualSalary: 65000, hoursPerWeek: 40,
    studentLoanBalance: 24000, studentLoanRate: 5.5
  });
  check('legacy salary becomes an income source in cents',
    migrated.people[0].incomeSources[0].grossAnnualIncomeCents, 6500000);
  check('legacy loan becomes an itemised debt', migrated.debts[0].balanceCents, 2400000);
  check('legacy rate 5.5 is read as 5.5%, not 550%', migrated.debts[0].rate, 0.055);
  check('migrated debt carries an owner', migrated.debts[0].ownerIds.length, 1);
  check('migrated debt is typed', migrated.debts[0].type, 'student_loan');

  Spine.reset();
})();

/* ==========================================================================
   8. Registry deep links resolve to real elements.
   ========================================================================== */

section('Registry and rooms');

Registry.all().forEach(function (room) {
  const file = path.join(ROOT, room.href);
  if (!fs.existsSync(file)) {
    failures.push(`room file missing: ${room.href}`);
    return;
  }
  passed++;
  const html = fs.readFileSync(file, 'utf8');
  room.subsections.forEach(function (sub) {
    const found = new RegExp(`id=["']${sub.id}["']`).test(html);
    checkTrue(`${room.id} → #${sub.id} exists in ${room.href}`, found);
  });
  checkTrue(`${room.id} carries at least one filter tag`,
    room.tags.some(t => Registry.FILTER_TAGS.includes(t)));
  checkTrue(`${room.id} registers itself with the spine`,
    html.includes('registerRoom'), 'no registerRoom() call found');
  checkTrue(`${room.id} uses the shared stylesheet, not its own hex values`,
    html.includes('theme.css'));
});

/* ==========================================================================
   Report
   ========================================================================== */

console.log('\n' + '─'.repeat(66));
if (failures.length === 0) {
  console.log(`✓ ${passed} checks passed`);
  process.exit(0);
}
console.log(`✗ ${failures.length} failed, ${passed} passed\n`);
failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
process.exit(1);
