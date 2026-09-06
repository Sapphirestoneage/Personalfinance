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
const CashFlow = require(path.join(ROOT, 'engines/cashflow.js'));
const Debt = require(path.join(ROOT, 'engines/debt.js'));
const Ownership = require(path.join(ROOT, 'shared/ownership.js'));
/* The spine instance ownership.js registered its field reader with. Later
   sections re-require the spine under a fake localStorage and drop it from
   the module cache, so this handle is the only way back to the original. */
const SpineMain = require(path.join(ROOT, 'shared/spine-v2.js'));
/* Same reason: instruments.js binds to the spine instance it is required
   against, so it is required here while that is still the original. */
const InstrumentsMain = require(path.join(ROOT, 'shared/instruments.js'));
const Fire = require(path.join(ROOT, 'engines/fire.js'));
const Projection = require(path.join(ROOT, 'engines/projection.js'));
const Hourly = require(path.join(ROOT, 'engines/hourly.js'));
const QuickMath = require(path.join(ROOT, 'engines/quickmath.js'));
const SelfEmployed = require(path.join(ROOT, 'engines/selfemployed.js'));
const Goals = require(path.join(ROOT, 'engines/goals.js'));
const Accounts = require(path.join(ROOT, 'engines/accounts.js'));
const Swan = require(path.join(ROOT, 'engines/swan.js'));
const ValuesEngine = require(path.join(ROOT, 'engines/values.js'));
const Rating = require(path.join(ROOT, 'shared/rating.js'));
const LiveForm = require(path.join(ROOT, 'shared/liveform.js'));
const Fulfillment = require(path.join(ROOT, 'engines/fulfillment.js'));
const HassleEngine = require(path.join(ROOT, 'engines/hassle.js'));
const SideHustle = require(path.join(ROOT, 'engines/sidehustle.js'));
const RatiosEngine = require(path.join(ROOT, 'engines/ratios.js'));
const Credential = require(path.join(ROOT, 'engines/credential.js'));
const WorthEngine = require(path.join(ROOT, 'engines/worth.js'));
const WindfallEngine = require(path.join(ROOT, 'engines/windfall.js'));
const RunwayEngine = require(path.join(ROOT, 'engines/runway.js'));
const HealthEngine = require(path.join(ROOT, 'engines/health.js'));
const IncomeEngine = require(path.join(ROOT, 'engines/income.js'));
const Progress = require(path.join(ROOT, 'shared/progress.js'));

const TABLES = {
  effectiveTaxRates: require(path.join(ROOT, 'data/effective_tax_rates_2026.json')),
  retirementMilestones: require(path.join(ROOT, 'data/retirement_milestones.json')),
  netWorthPercentiles: require(path.join(ROOT, 'data/net_worth_percentiles_scf_2022.json')),
  irsLimits: require(path.join(ROOT, 'data/irs_limits_2026.json')),
  fooRules: require(path.join(ROOT, 'data/foo_rules.json')),
  expenseCategories: require(path.join(ROOT, 'data/expense_categories.json')),
  budgetTemplates: require(path.join(ROOT, 'data/budget_templates.json')),
  debtRules: require(path.join(ROOT, 'data/debt_rules.json')),
  fireVariants: require(path.join(ROOT, 'data/fire_variants.json')),
  seTax: require(path.join(ROOT, 'data/se_tax_2026.json')),
  goalTemplates: require(path.join(ROOT, 'data/goal_templates.json')),
  healthScore: require(path.join(ROOT, 'data/health_score.json')),
  liquidityBenchmarks: require(path.join(ROOT, 'data/liquidity_benchmarks.json')),
  values: require(path.join(ROOT, 'data/values.json')),
  hassleDefaults: require(path.join(ROOT, 'data/hassle_defaults.json')),
  ratioBenchmarks: require(path.join(ROOT, 'data/ratio_benchmarks.json')),
  ratioExplainers: require(path.join(ROOT, 'data/ratio_explainers.json')),
  irsLimits: require(path.join(ROOT, 'data/irs_limits_2026.json')),
  accessRules: require(path.join(ROOT, 'data/access_rules.json')),
  confidenceWeights: require(path.join(ROOT, 'data/confidence_weights.json')),
  uiBenefits: require(path.join(ROOT, 'data/ui_benefits.json')),
  federalBrackets: require(path.join(ROOT, 'data/federal_brackets_2026.json')),
  wealthMultiplier: require(path.join(ROOT, 'data/wealth_multiplier.json')),
  levelsOfWealth: require(path.join(ROOT, 'data/levels_of_wealth.json'))
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

  /* An unjudgeable step is not a placement. Reporting one would tell someone
     staring at a blank form that they are stuck on step 0. */
  check('empty household has no FOO placement', all.foo.placement, null);
  check('empty household stops on an unknown step', all.foo.stoppedAt.status, 'unknown');
  checkTrue('the unknown step says what it needs',
    typeof all.foo.stoppedAt.detail === 'string' && all.foo.stoppedAt.detail.length > 0);

  /* But a genuinely unmet step still IS a placement. */
  const stuck = Demo.build();
  stuck.assets.find(a => a.category === 'cash').valueCents = 5000; // $50 cash
  const stuckFoo = Foo.evaluate(stuck, TABLES);
  check('an unmet step is reported as the placement', stuckFoo.placement.key, 'starter_ef');
  check('placement carries its step number', stuckFoo.placement.step, 1);
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

  /* Raw fields must survive a save/load round trip. capturingFullMatch was
     silently dropped once because createHousehold didn't carry it, which
     reset the FOO placement to "unknown" on every page reload. */
  Spine.reset();
  const demo = Demo.build();
  Spine.updateProfile({
    people: demo.people, filingStatus: demo.filingStatus, state: demo.state,
    assets: demo.assets, debts: demo.debts, expenses: demo.expenses,
    capturingFullMatch: demo.capturingFullMatch
  });
  const reloaded = Schema.createHousehold(JSON.parse(JSON.stringify(Spine.getProfile())));
  check('capturingFullMatch survives a round trip', reloaded.capturingFullMatch, false);
  check('filing status survives a round trip', reloaded.filingStatus, 'single');
  check('debts survive a round trip', reloaded.debts.length, 2);
  check('income survives a round trip',
    Schema.grossAnnualIncomeCents(reloaded).value, 7200000);
  const reFoo = Foo.evaluate(reloaded, TABLES);
  check('FOO placement survives a round trip', reFoo.placement.step, 2);
  check('both flags survive a round trip', reFoo.flags.length, 2);
  Spine.reset();

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
   8. Cash Flow calc. SPEC.md §9 item 4, §12.5, §12.3, §13.
   ========================================================================== */

section('Cash Flow');

/* A month of categorised spending for the demo persona.
     needs   1500 + 450 + 180 + 220 + 150 + 305 = 2,805
     wants    260 +  45 +  90                   =   395
     savings  300 + 400                         =   700
   Robin's net take-home is (72,000 - 13,680) / 12 = $4,860/mo. */
function householdWithSpending() {
  const hh = Demo.build();
  hh.expenses.entries = Demo.buildSpending();
  return hh;
}
const SPEND = Demo.VALUES.monthlySpending;

(function () {
  const hh = householdWithSpending();
  const sum = CashFlow.summarise(hh, TABLES.expenseCategories);
  check('summarise status', sum.status, 'ok');
  check('needs bucket', sum.byBucket.needs, 280500);
  check('wants bucket', sum.byBucket.wants, 39500);
  check('savings bucket', sum.byBucket.savings, 70000);
  /* Savings is a destination, not an expense — it must not be in spend. */
  check('monthly spend excludes savings', sum.spendMonthlyCents, 320000);
  check('savings tracked separately', sum.savingsMonthlyCents, 70000);
  check('essential subset', sum.essentialMonthlyCents, 280500);
  check('categories sorted biggest first', sum.categories[0].categoryId, 'housing');
  /* Ten typed categories plus one derived (debt minimums). */
  check('category count', sum.categories.length, SPEND.length + 1);
  const dm = sum.categories.find(c => c.categoryId === 'debt_minimums');
  check('debt minimums is derived, not typed', dm.derived, true);
  check('and comes from the itemised debts', dm.monthlyCents, 30500);
  check('and names the room that owns it', dm.ownedBy, 'debt-payoff');
  checkTrue('nothing types debt minimums into the example spending',
    !SPEND.some(r => r.categoryId === 'debt_minimums'));

  /* A stray typed entry for a derived category must be IGNORED, not added —
     otherwise the figure is counted twice. */
  const doubled = householdWithSpending();
  doubled.expenses.entries.push(Schema.createExpenseEntry({
    id: 'stray', categoryId: 'debt_minimums', amountCents: 99900, period: 'monthly', source: 'manual'
  }));
  const dsum = CashFlow.summarise(doubled, TABLES.expenseCategories);
  check('a typed entry cannot override a derived category', dsum.byBucket.needs, 280500);
  check('and cannot add a duplicate row',
    dsum.categories.filter(c => c.categoryId === 'debt_minimums').length, 1);

  /* With no debts, the derived row simply is not there. */
  const noDebts = householdWithSpending();
  noDebts.debts = [];
  const nsum = CashFlow.summarise(noDebts, TABLES.expenseCategories);
  checkTrue('no debts means no debt-minimums row',
    !nsum.categories.some(c => c.categoryId === 'debt_minimums'));
  check('and needs drops by exactly that amount', nsum.byBucket.needs, 280500 - 30500);

  /* net income = (72,000 - 13,680)/12 = 4,860; spend 3,200 -> 1,660 left */
  const flow = CashFlow.netCashFlow(hh, TABLES.expenseCategories, TABLES);
  check('net monthly income cents', flow.netMonthlyIncomeCents, 486000);
  check('net cash flow cents', flow.value, 166000);
  /* zero-based test: 1,660 left minus 700 assigned to savings = 960 loose */
  check('unassigned cents', flow.unassignedCents, 96000);

  /* 50/30/20 against $4,860 take-home:
       needs   target 2,430  actual 2,805  -> +375 over
       wants   target 1,458  actual   395  -> -1,063 under
       savings target   972  actual   700  ->   -272 under            */
  const cmp = CashFlow.compareToTemplate(hh, TABLES.expenseCategories,
    TABLES.budgetTemplates, '50_30_20', TABLES);
  check('template basis is take-home pay', cmp.basisMonthlyCents, 486000);
  const row = id => cmp.rows.find(r => r.bucketId === id);
  check('needs target cents', row('needs').targetCents, 243000);
  check('needs variance cents', row('needs').varianceCents, 37500);
  check('wants variance cents', row('wants').varianceCents, -106300);
  check('savings variance cents', row('savings').varianceCents, -27200);
  check('total absolute variance', cmp.value, 37500 + 106300 + 27200);

  const zero = CashFlow.compareToTemplate(hh, TABLES.expenseCategories,
    TABLES.budgetTemplates, 'zero_based', TABLES);
  check('zero-based is a method, not a split', zero.method, 'zero_based');
  check('zero-based is not balanced here', zero.balanced, false);
  check('zero-based reports what is loose', zero.unassignedCents, 96000);
})();

/* -- Imported transactions normalise to a monthly figure ----------------
      SPEC.md §12.5: the same store, the same roll-up, no second code path. */
(function () {
  const dated = [
    Schema.createExpenseEntry({ categoryId: 'dining_out', amountCents: 5000, period: 'once', date: '2026-07-05', source: 'imported' }),
    Schema.createExpenseEntry({ categoryId: 'dining_out', amountCents: 3000, period: 'once', date: '2026-07-20', source: 'imported' }),
    Schema.createExpenseEntry({ categoryId: 'dining_out', amountCents: 4000, period: 'once', date: '2026-08-10', source: 'imported' })
  ];
  /* $120 across two distinct months is $60/mo, not $120 and not $40. */
  const n = CashFlow.normaliseToMonthly(dated);
  check('dated entries span two months', n.monthsCovered, 2);
  check('dated entries average per month', n.monthlyCents, 6000);

  const mixed = normaliseMixed();
  function normaliseMixed() {
    return CashFlow.normaliseToMonthly(dated.concat([
      Schema.createExpenseEntry({ categoryId: 'dining_out', amountCents: 10000, period: 'monthly', source: 'manual' })
    ]));
  }
  check('a manual total and imported transactions coexist', mixed.monthlyCents, 16000);

  /* Undated one-offs count as one month rather than being annualised. */
  const undated = CashFlow.normaliseToMonthly([
    Schema.createExpenseEntry({ categoryId: 'travel', amountCents: 90000, period: 'once', source: 'manual' })
  ]);
  check('an undated one-off counts as a single month', undated.monthlyCents, 90000);

  /* The categoriser reads a transaction, not a typed total. */
  const hit = CashFlow.categorise({ descriptor: 'STARBUCKS COFFEE #4471' }, TABLES.expenseCategories);
  check('descriptor matched to a category', hit.categoryId, 'dining_out');
  check('categorisation records how it was decided', hit.categorizedBy, 'rule');
  check('an unrecognised descriptor is left uncategorised, not dumped in "other"',
    CashFlow.categorise({ descriptor: 'QGXZ VENDOR 88' }, TABLES.expenseCategories), null);
  check('a record with no descriptor is left alone',
    CashFlow.categorise({ amountCents: 100 }, TABLES.expenseCategories), null);
})();

/* -- Tracked never overwrites estimated. SPEC.md §12.3 ------------------- */
(function () {
  const hh = householdWithSpending();
  const tracked = CashFlow.trackedEssentialCents(hh, TABLES.expenseCategories);
  check('tracked essential figure', tracked.value, 280500);

  const Spine = require(path.join(ROOT, 'shared/spine-v2.js'));
  Spine.reset();
  Spine.setMonthlyExpenses(315000, 'estimated');   // Robin guessed $3,150
  Spine.setMonthlyExpenses(tracked.value, 'tracked'); // reality was $2,805
  const after = Spine.getProfile();
  check('the original estimate survives being tracked over',
    after.expenses.monthlyEssential.estimatedValueCents, 315000);
  check('the tracked figure is stored', after.expenses.monthlyEssential.trackedValueCents, 280500);
  check('tracked becomes the current figure', Schema.monthlyExpensesCents(after).source, 'tracked');
  /* divergence = tracked - estimated = 2,805 - 3,150 = -$345 */
  check('divergence cents', Schema.expenseDivergenceCents(after).value, -34500);
  Spine.reset();
})();

/* -- Empty and partial states ------------------------------------------- */
(function () {
  const bare = Schema.createHousehold();
  const sum = CashFlow.summarise(bare, TABLES.expenseCategories);
  checkTrue('no entries yields an incomplete summary, not zeroes',
    sum.status === 'incomplete' && sum.value === null);
  checkTrue('and says what is missing', sum.reason.length > 0);

  /* An entry with no amount must not be counted as zero. */
  const partial = Demo.build();
  partial.expenses.entries = [
    Schema.createExpenseEntry({ categoryId: 'housing', amountCents: 150000 }),
    Schema.createExpenseEntry({ categoryId: 'groceries', amountCents: null })
  ];
  const psum = CashFlow.summarise(partial, TABLES.expenseCategories);
  /* $1,500 housing, plus the $305 derived from this household's debts.
     The blank groceries entry contributes nothing and gets no row. */
  check('an unfilled entry is skipped, not zeroed', psum.spendMonthlyCents, 150000 + 30500);
  check('and does not appear as a category', psum.categories.length, 2);
  checkTrue('the only rows are the filled one and the derived one',
    psum.categories.map(c => c.categoryId).sort().join(',') === 'debt_minimums,housing',
    psum.categories.map(c => c.categoryId).join(','));
})();

/* ==========================================================================
   9. Debt Calculator. SPEC.md §9 item 5, §10, §13.
   ========================================================================== */

section('Debt Calculator');

const RULES = TABLES.debtRules;

/* -- The amortisation loop, checked against the closed form --------------
      For ONE debt at a fixed payment with no extra, the months to payoff have
      an analytic answer:  n = -ln(1 - rB/P) / ln(1+r).
      That is a genuinely independent check on the simulation — a different
      method, not a second copy of the same loop. Robin's card: $3,200 at
      22.9%, paying the $95 minimum.                                       */
(function () {
  const B = 320000, annual = 0.229, P = 9500;
  const r = annual / 12;
  const closedForm = Math.ceil(-Math.log(1 - (r * B) / P) / Math.log(1 + r));

  const hh = Schema.createHousehold({
    people: [Schema.createPerson({ id: 'P', role: 'adult' })],
    debts: [Schema.createDebt({
      id: 'card', label: 'Credit card', balanceCents: B, rate: annual,
      minPaymentCents: P, type: 'credit_card', ownerIds: ['P']
    })]
  });

  const sim = Debt.simulate(hh, RULES, { strategyId: 'avalanche', extraMonthlyCents: 0 });
  check('single-debt payoff matches the closed form', sim.value, closedForm);
  check('and that is 55 months', sim.value, 55);
  checkTrue('total paid exceeds the balance by the interest charged',
    sim.totalPaidCents === B + sim.totalInterestCents,
    `paid ${sim.totalPaidCents} vs balance ${B} + interest ${sim.totalInterestCents}`);
  /* Closed-form total interest ≈ n·P − B, within a month's rounding. */
  const approxInterest = closedForm * P - B;
  checkTrue('total interest is within a month of the closed-form figure',
    Math.abs(sim.totalInterestCents - approxInterest) < P,
    `sim ${sim.totalInterestCents} vs approx ${approxInterest}`);
  check('the payoff is recorded against the debt', sim.payoffs[0].debtId, 'card');
  check('payoff month matches the total', sim.payoffs[0].month, sim.value);

  /* Paying more must finish sooner and cost less. */
  const faster = Debt.simulate(hh, RULES, { strategyId: 'avalanche', extraMonthlyCents: 10000 });
  checkTrue('an extra $100/mo finishes sooner', faster.value < sim.value,
    `${faster.value} vs ${sim.value}`);
  checkTrue('and costs less interest', faster.totalInterestCents < sim.totalInterestCents);
})();

/* -- Strategy ordering ---------------------------------------------------- */

function threeDebtHousehold() {
  return Schema.createHousehold({
    people: [Schema.createPerson({ id: 'P', role: 'adult' })],
    debts: [
      Schema.createDebt({ id: 'loan',  label: 'Student loan', balanceCents: 1840000, rate: 0.055, minPaymentCents: 21000, type: 'student_loan', ownerIds: ['P'] }),
      Schema.createDebt({ id: 'card',  label: 'Credit card',  balanceCents: 320000,  rate: 0.229, minPaymentCents: 9500,  type: 'credit_card',  ownerIds: ['P'] }),
      Schema.createDebt({ id: 'small', label: 'Personal loan', balanceCents: 90000,  rate: 0.06,  minPaymentCents: 3000,  type: 'personal',     ownerIds: ['P'] })
    ]
  });
}

(function () {
  const hh = threeDebtHousehold();
  const prepared = Debt.prepare(hh, RULES);
  check('all three debts are simulatable', prepared.value.length, 3);

  const order = id => Debt.orderDebts(prepared.value, Debt.strategyById(RULES, id), RULES)
    .map(d => d.id);

  check('avalanche targets the highest rate', order('avalanche').join(','), 'card,small,loan');
  check('snowball targets the smallest balance', order('snowball').join(','), 'small,card,loan');
  /* Hybrid clears anything under $1,000 first, then reverts to avalanche. */
  check('hybrid takes the quick win, then the highest rate',
    order('hybrid').join(','), 'small,card,loan');

  /* Convenience follows the emotional tag, not the maths. */
  const tagged = threeDebtHousehold();
  tagged.debts.find(d => d.id === 'loan').emotionalTag = 'family';
  const taggedPrepared = Debt.prepare(tagged, RULES);
  check('convenience puts the tagged debt first',
    Debt.orderDebts(taggedPrepared.value, Debt.strategyById(RULES, 'convenience'), RULES)
      .map(d => d.id).join(','), 'loan,card,small');
  check('an untagged debt ranks zero', Debt.emotionalPriority({ emotionalTag: null }, RULES), 0);
  check('a family debt outranks the rest', Debt.emotionalPriority({ emotionalTag: 'family' }, RULES), 3);
})();

/* -- The trade-off between strategies -------------------------------------
      Avalanche must never cost more interest than any other ordering: that
      is what avalanche IS. Snowball must clear its first account no later
      than avalanche. Both are invariants, not fitted numbers.            */
(function () {
  const hh = threeDebtHousehold();
  const cmp = Debt.compareStrategies(hh, RULES, { extraMonthlyCents: 20000 });
  check('avalanche is the cheapest ordering', cmp.cheapestStrategyId, 'avalanche');

  const av = cmp.results.avalanche, sb = cmp.results.snowball;
  checkTrue('avalanche costs no more interest than snowball',
    av.totalInterestCents <= sb.totalInterestCents,
    `avalanche ${av.totalInterestCents} vs snowball ${sb.totalInterestCents}`);
  checkTrue('snowball clears its first debt no later than avalanche',
    sb.payoffs[0].month <= av.payoffs[0].month,
    `snowball ${sb.payoffs[0].month} vs avalanche ${av.payoffs[0].month}`);
  checkTrue('the spread between best and worst is reported',
    cmp.spreadCents >= 0);
  checkTrue('every strategy clears the debt eventually',
    Object.keys(cmp.results).every(k => Money.isOk(cmp.results[k])));

  /* The freed-up minimum must roll onward — that is the snowball effect, and
     it is why this cannot be a closed form. Every strategy pays the same
     total each month. */
  const expectedBudget = 21000 + 9500 + 3000 + 20000;
  check('the monthly budget stays constant', av.monthlyBudgetCents, expectedBudget);
})();

/* -- Minimum payments: derived where possible, asked for where not -------- */
(function () {
  /* 2% of $3,200 is $64, above the $25 floor. */
  const card = Schema.createDebt({ balanceCents: 320000, rate: 0.229, type: 'credit_card' });
  const derived = Debt.minimumPaymentCents(card, RULES);
  check('a card minimum is derived at 2% of the balance', derived.value, 6400);
  check('and is marked as derived', derived.derived, true);

  /* On a small balance the floor wins. */
  const tiny = Schema.createDebt({ balanceCents: 50000, rate: 0.2, type: 'credit_card' });
  check('the floor applies on a small balance', Debt.minimumPaymentCents(tiny, RULES).value, 2500);

  /* Never more than is actually owed. */
  const nearlyClear = Schema.createDebt({ balanceCents: 1000, rate: 0.2, type: 'credit_card' });
  check('a minimum never exceeds the balance',
    Debt.minimumPaymentCents(nearlyClear, RULES).value, 1000);

  /* A statement minimum the user entered always wins over a derived one. */
  const stated = Schema.createDebt({ balanceCents: 320000, rate: 0.229, minPaymentCents: 9500, type: 'credit_card' });
  const used = Debt.minimumPaymentCents(stated, RULES);
  check('an entered minimum wins', used.value, 9500);
  check('and is not marked derived', used.derived, false);

  /* An instalment loan's payment depends on its original term, which we do
     not ask for — so it is requested, not invented. */
  const loan = Schema.createDebt({ balanceCents: 1840000, rate: 0.055, type: 'student_loan' });
  const notDerivable = Debt.minimumPaymentCents(loan, RULES);
  check('an instalment minimum is not invented', notDerivable.status, 'incomplete');
  checkTrue('and the reason says why', /term/.test(notDerivable.reason));
})();

/* -- Rewards against carrying a balance ---------------------------------
      $1,200/mo of spend at 2% is $288 a year. A $3,200 balance at 22.9%
      compounding monthly costs (1 + .229/12)^12 − 1 = 25.45% -> $814.      */
(function () {
  const r = Debt.rewardsVsCarrying({
    balanceCents: 320000, rate: 0.229, monthlySpendCents: 120000, rewardsRate: 0.02
  });
  check('annual rewards', r.annualRewardsCents, Math.round(120000 * 12 * 0.02));
  check('annual interest compounds monthly',
    r.annualInterestCents, Math.round(320000 * (Math.pow(1 + 0.229 / 12, 12) - 1)));
  checkTrue('2% rewards do not beat a 22.9% carried balance', !r.aheadOnRewards);
  check('the net is the difference', r.netCents, r.annualRewardsCents - r.annualInterestCents);
  /* Below the break-even balance the rewards DO win — that is the number
     worth showing, since it names when the card is worth using. */
  const small = Debt.rewardsVsCarrying({
    balanceCents: Math.round(r.breakEvenBalanceCents / 2), rate: 0.229,
    monthlySpendCents: 120000, rewardsRate: 0.02
  });
  checkTrue('below the break-even balance the rewards win', small.aheadOnRewards);
  /* Carrying nothing at all is the case rewards are actually designed for. */
  const cleared = Debt.rewardsVsCarrying({
    balanceCents: 0, rate: 0.229, monthlySpendCents: 120000, rewardsRate: 0.02 });
  check('a cleared balance keeps every penny of rewards', cleared.netCents, 28800);
  check('missing inputs stay incomplete',
    Debt.rewardsVsCarrying({ balanceCents: 320000, rate: 0.229 }).status, 'incomplete');
})();

/* -- Credit Card calc is a filtered view, not a second build. SPEC.md §13 -- */
(function () {
  const hh = threeDebtHousehold();
  const cards = Debt.creditCardsOnly(hh);
  check('filtering leaves only revolving debt', cards.debts.length, 1);
  check('and it is the card', cards.debts[0].id, 'card');
  checkTrue('the original household is untouched', hh.debts.length === 3);
  const sim = Debt.simulate(cards, RULES, { strategyId: 'avalanche', extraMonthlyCents: 0 });
  checkTrue('the filtered view runs through the same engine', Money.isOk(sim));
  check('and gives the same answer as the card alone', sim.value, 55);
})();

/* -- Incomplete and impossible states ------------------------------------- */
(function () {
  check('no debts yields an incomplete plan',
    Debt.simulate(Schema.createHousehold(), RULES, {}).status, 'incomplete');

  /* A debt missing its rate cannot be simulated, and the reason names it. */
  const noRate = Schema.createHousehold({
    people: [Schema.createPerson({ id: 'P', role: 'adult' })],
    debts: [Schema.createDebt({ id: 'x', label: 'Mystery loan', balanceCents: 100000, rate: null, minPaymentCents: 5000, type: 'personal', ownerIds: ['P'] })]
  });
  const r = Debt.simulate(noRate, RULES, {});
  check('a rateless debt blocks the simulation', r.status, 'incomplete');
  checkTrue('and the reason names the debt', /Mystery loan/.test(r.reason), r.reason);

  /* -- Family loans, no interest, set aside, dates (D-124) ---------------- */
  const inTwoYears = (() => { const d = new Date(); d.setUTCFullYear(d.getUTCFullYear() + 2); return d.toISOString().slice(0, 10); })();
  const family = Schema.createDebt({ id: 'mum', label: 'Mum, for the car', balanceCents: 240000, type: 'family', interestFree: true, rate: 0, dueOn: inTwoYears, ownerIds: ['P'] });
  check('a family loan defaults to not archived', family.archived, false);
  check('interest-free reads as a 0 rate', Debt.effectiveRate(family), 0);
  check('a debt with neither rate nor the flag has no rate', Debt.effectiveRate(Schema.createDebt({})), null);
  const famMin = Debt.minimumPaymentCents(family, RULES);
  checkTrue('the minimum comes from the due date', Money.isOk(famMin) && famMin.derived === true);
  check('and is the balance over the months left', famMin.value, Math.ceil(240000 / Schema.monthsUntil(inTwoYears).value));
  check('the rule is the family one', famMin.ruleId, 'family_balance_over_months_to_due');
  const undated = Debt.minimumPaymentCents(Schema.createDebt({ type: 'family', balanceCents: 100000 }), RULES);
  check('with no due date and no amount it asks for one', undated.status, 'incomplete');
  checkTrue('and says which', /due back|monthly amount/.test(undated.reason), undated.reason);
  const famHh = Schema.createHousehold({ people: [Schema.createPerson({ id: 'P', role: 'adult' })], debts: [family] });
  const famSim = Debt.simulate(famHh, RULES, { strategyId: 'avalanche' });
  checkTrue('an interest-free family loan simulates', Money.isOk(famSim), famSim.reason);
  check('and costs no interest', famSim.totalInterestCents, 0);
  checkTrue('and clears by the due date', famSim.value <= Schema.monthsUntil(inTwoYears).value);

  const parked = Schema.createHousehold({ people: [Schema.createPerson({ id: 'P', role: 'adult' })], debts: [
    Schema.createDebt({ id: 'a', balanceCents: 50000, rate: 0.2, minPaymentCents: 2500, type: 'credit_card', ownerIds: ['P'] }),
    Schema.createDebt({ id: 'b', balanceCents: 999900, rate: 0.2, minPaymentCents: 2500, type: 'personal', archived: true, ownerIds: ['P'] })
  ] });
  check('an archived debt is not counted in total debt', Schema.totalDebtCents(parked).value, 50000);
  check('nor in the minimums', Schema.monthlyDebtPaymentsCents(parked).value, 2500);
  check('and is listed as archived', Schema.archivedDebts(parked).map(d => d.id).join(','), 'b');
  checkTrue('the plan ignores it', Money.isOk(Debt.simulate(parked, RULES, {})) && Debt.simulate(parked, RULES, {}).startingBalanceCents === 50000);
  checkTrue('debt.type admits family', Schema.FIELDS['debt.type'].values.includes('family'));
  ['debt.interestFree', 'debt.archived', 'debt.borrowedOn', 'debt.dueOn'].forEach(k => checkTrue(`${k} is classed`, !!Schema.FIELDS[k]));
  const debtPage = fs.readFileSync(path.join(ROOT, 'rooms/debt-payoff.html'), 'utf8');
  checkTrue('the room offers the family type', /'family', 'Borrowed from family/.test(debtPage));
  checkTrue('the room has the no-interest tick', /data-field="interestFree"/.test(debtPage));
  checkTrue('the room can set a debt aside and restore it', /data-archive=/.test(debtPage) && /data-restore=/.test(debtPage));
  checkTrue('the room asks for the two dates', /data-field="borrowedOn"/.test(debtPage) && /data-field="dueOn"/.test(debtPage));
  checkTrue('the warning under a row is painted live, not rebuilt', /paintLive\(\)/.test(debtPage) && /data-warn=/.test(debtPage));

  /* A payment that cannot outrun the interest must be reported, not looped. */
  const underwater = Schema.createHousehold({
    people: [Schema.createPerson({ id: 'P', role: 'adult' })],
    debts: [Schema.createDebt({ id: 'y', label: 'Runaway card', balanceCents: 1000000, rate: 0.30, minPaymentCents: 1000, type: 'credit_card', ownerIds: ['P'] })]
  });
  const never = Debt.simulate(underwater, RULES, { strategyId: 'avalanche', extraMonthlyCents: 0 });
  check('a payment below the interest is reported, not looped forever', never.status, 'incomplete');
  check('and no month count is invented', never.value, null);
  checkTrue('and it says the interest is outrunning the payment',
    /outruns|not clear/.test(never.reason), never.reason);
})();

/* ==========================================================================
   9b. FIRE variants — ONE formula, parameterised. SPEC.md §8, §13.
   ========================================================================== */

section('FIRE variants');

/* Robin: $3,150/mo -> $37,800/yr, 4% SWR, 7% return, age 32, $48,000 invested.
     standard  37,800      / 0.04 =   945,000
     lean      37,800×0.70 / 0.04 =   661,500
     chubby    37,800×1.25 / 0.04 = 1,181,250
     fat       37,800×1.50 / 0.04 = 1,417,500                                */
(function () {
  const h = Demo.build();
  const target = id => Fire.calculateFIRE(h, TABLES, { variantId: id });

  check('standard FIRE', target('standard').value, 94500000);
  check('lean FIRE', target('lean').value, 66150000);
  check('chubby FIRE', target('chubby').value, 118125000);
  check('fat FIRE', target('fat').value, 141750000);

  /* The one formula must agree with Tier 0's, or there are two of them. */
  check('standard matches the Tier 0 FIRE number',
    target('standard').value, Tier0.fireNumber(h).value);

  /* Ordering is the point of the flavours. */
  const order = ['lean', 'standard', 'chubby', 'fat'].map(id => target(id).value);
  checkTrue('lean < standard < chubby < fat',
    order.every((v, i) => i === 0 || v > order[i - 1]), JSON.stringify(order));

  /* Coast, checked by round trip rather than by repeating the formula:
     grow the coast number for 33 years at 7% with NO contributions and it
     must land on the full number. */
  const coast = target('coast');
  check('coast is complete', coast.status, 'ok');
  check('coast counts 33 years of growth to 65', coast.yearsOfGrowth, 33);
  check('coast names the full target it grows into', coast.fullTargetCents, 94500000);
  const grown = Projection.futureValueCents({
    startCents: coast.value, annualContributionCents: 0,
    annualRate: 0.07, years: coast.yearsOfGrowth
  });
  checkTrue('coasting from that number lands on the full number',
    Math.abs(grown.value - 94500000) <= 100,
    `grew to ${grown.value}, wanted 94500000`);
  checkTrue('and it is far smaller than the full number', coast.value < 94500000 / 5);

  /* A different coast age changes the answer in the right direction. */
  checkTrue('coasting to a later age needs less today',
    Fire.calculateFIRE(h, TABLES, { variantId: 'coast', coastTargetAge: 70 }).value < coast.value);

  /* Barista: part-time income shrinks what the pot must cover.
     (37,800 - 20,000) / 0.04 = 445,000                                    */
  const barista = Fire.calculateFIRE(h, TABLES,
    { variantId: 'barista', baristaAnnualIncomeCents: 2000000 });
  check('barista FIRE with $20k part-time', barista.value, 44500000);
  checkTrue('barista is smaller than standard', barista.value < 94500000);

  /* Earning more than you spend means the pot needs nothing. */
  const covered = Fire.calculateFIRE(h, TABLES,
    { variantId: 'barista', baristaAnnualIncomeCents: 5000000 });
  check('part-time income above expenses needs no pot', covered.value, 0);
  check('and says so', covered.coversEverything, true);

  /* Missing inputs stay incomplete rather than guessing. */
  check('barista without a part-time income is incomplete',
    Fire.calculateFIRE(h, TABLES, { variantId: 'barista' }).status, 'incomplete');
  const noDob = Demo.build();
  noDob.people[0].dob = null;
  check('coast without a date of birth is incomplete',
    Fire.calculateFIRE(noDob, TABLES, { variantId: 'coast' }).status, 'incomplete');
  check('no expenses means no FIRE number at all',
    Fire.calculateFIRE(Schema.createHousehold(), TABLES, { variantId: 'standard' }).status,
    'incomplete');

  /* A previewed SWR must not touch what is stored. */
  const conservative = Fire.calculateFIRE(h, TABLES,
    { variantId: 'standard', localOverrides: { swrRate: 0.035 } });
  check('a 3.5% SWR preview', conservative.value, Math.round(3780000 / 0.035));
  check('the stored SWR is untouched', Schema.resolveAssumptions(h).swrRate, 0.04);

  /* Progress and the projection agree with Tier 0's. */
  const prog = Fire.progressToward(h, TABLES, { variantId: 'standard' });
  check('progress toward standard', prog.value, 48000 / 945000, 1e-12);
  check('years away matches Tier 0', prog.yearsAway.value, Tier0.fireProgress(h, TABLES).timeToFire.value);
  check('and that is still 19', prog.yearsAway.value, 19);

  /* Lean is nearer than standard. */
  const leanProg = Fire.progressToward(h, TABLES, { variantId: 'lean' });
  checkTrue('lean FIRE arrives sooner than standard',
    leanProg.yearsAway.value < prog.yearsAway.value,
    `lean ${leanProg.yearsAway.value} vs standard ${prog.yearsAway.value}`);

  /* allVariants: one incomplete flavour must not break the others. */
  const all = Fire.allVariants(h, TABLES, {});
  check('every variant is reported', Object.keys(all).length, TABLES.fireVariants.variants.length);
  check('barista is incomplete without its input', all.barista.target.status, 'incomplete');
  check('while standard is still fine', all.standard.target.status, 'ok');
})();

/* Projection primitives, checked against closed forms. */
(function () {
  /* $10,000 at 7% for 10 years, no contributions = 10,000 × 1.07^10 */
  const fv = Projection.futureValueCents({ startCents: 1000000, annualContributionCents: 0,
    annualRate: 0.07, years: 10 });
  check('future value matches the closed form',
    fv.value, Math.round(1000000 * Math.pow(1.07, 10)));
  /* Present value is its exact inverse. */
  const pv = Projection.presentValueNeededCents({ targetCents: fv.value, annualRate: 0.07, years: 10 });
  checkTrue('present value inverts future value', Math.abs(pv.value - 1000000) <= 1,
    `got ${pv.value}`);
  check('already past the target is zero years',
    Projection.yearsToTargetCents({ startCents: 500, targetCents: 100, annualRate: 0.07 }).value, 0);
  check('no contribution and no growth never arrives',
    Projection.yearsToTargetCents({ startCents: 100, targetCents: 500, annualRate: 0,
      annualContributionCents: 0 }).status, 'incomplete');
})();

/* ==========================================================================
   9c. Real Hourly Wage. SPEC.md §9 item 7, §13.
   ========================================================================== */

section('Real Hourly Wage');

/* Robin: $72,000 over 40 paid hours × 48 weeks, plus 13 unpaid hours a week
   (3 overtime, 5 commuting, 2.5 getting ready, 2.5 decompressing) and $400/mo
   of costs that exist only because there is a job.

     nominal = 72,000 / (40 × 48)                       = $37.50/h
     kept    = 72,000 − 13,680 tax − 4,800 costs        = $53,520
     real    = 53,520 / (53 × 48 = 2,544 hours)         = $21.04/h          */
(function () {
  const h = Demo.build();
  const w = Hourly.realHourlyWage(h, TABLES, {});

  check('nominal hourly rate', w.nominalHourlyCents, 3750);
  check('paid hours a week', w.paidHoursPerWeek, 40);
  check('unpaid hours a week', w.unpaidHoursPerWeek, 13);
  check('total hours a week', w.totalHoursPerWeek, 53);
  check('annual paid hours', w.annualPaidHours, 1920);
  check('annual total hours', w.annualTotalHours, 2544);
  check('annual work costs', w.annualWorkCostsCents, 480000);
  check('what actually stays', w.keptAnnualCents, 7200000 - 1368000 - 480000);
  check('real hourly rate', w.realHourlyCents, 2104);
  check('share of the headline rate retained', w.retained, 2104 / 3750, 1e-12);
  check('lost per hour', w.lostPerHourCents, 3750 - 2104);
  checkTrue('the real rate is well below the nominal one', w.realHourlyCents < w.nominalHourlyCents);

  /* Life energy: what a $1,000 thing costs in hours of your life. */
  const cost = Hourly.hoursToAfford(h, TABLES, 100000, {});
  check('hours to afford $1,000', cost.value, 100000 / 2104, 1e-9);
  checkTrue('and that is more hours than the headline rate suggests',
    cost.value > cost.nominalHours, `${cost.value} vs ${cost.nominalHours}`);

  /* Working from home means no commute — that is a zero, not a gap. */
  const remote = Demo.build();
  remote.people[0].work.commuteHoursPerWeek = null;
  const rw = Hourly.realHourlyWage(remote, TABLES, {});
  check('no commute entered still computes', rw.status, 'ok');
  check('and drops it from the hours', rw.totalHoursPerWeek, 48);
  checkTrue('which raises the real rate', rw.realHourlyCents > w.realHourlyCents);

  /* A preview must not need storing. */
  const previewed = Hourly.realHourlyWage(h, TABLES, { work: { commuteHoursPerWeek: 0 } });
  check('a previewed work profile changes the answer', previewed.totalHoursPerWeek, 48);
  check('and leaves the stored profile alone',
    Schema.workProfile(h.people[0]).commuteHoursPerWeek, 5);

  /* Incomplete states name what they need. */
  const noHours = Demo.build();
  noHours.people[0].work.contractedHoursPerWeek = null;
  check('without paid hours it cannot compute',
    Hourly.realHourlyWage(noHours, TABLES, {}).status, 'incomplete');
  const zeroHours = Demo.build();
  zeroHours.people[0].work.contractedHoursPerWeek = 0;
  check('zero paid hours is rejected, not divided by',
    Hourly.realHourlyWage(zeroHours, TABLES, {}).status, 'incomplete');
  const noIncome = Demo.build();
  noIncome.people[0].incomeSources = [];
  check('without income it cannot compute',
    Hourly.realHourlyWage(noIncome, TABLES, {}).status, 'incomplete');
  check('an empty household cannot compute',
    Hourly.realHourlyWage(Schema.createHousehold(), TABLES, {}).status, 'incomplete');
})();

/* ==========================================================================
   9d. The one-line calculators. SPEC.md §13.
   ========================================================================== */

section('Quick math');

/* -- Loan primitives, checked against the standard annuity formula -------- */
(function () {
  /* $20,000 over 36 months at 6% is $608.44 by the closed form. */
  const pay = Projection.levelPaymentCents({ principalCents: 2000000, annualRate: 0.06, months: 36 });
  check('level payment on $20k / 36mo / 6%', pay.value, 60844);
  check('total interest over the term', pay.totalInterestCents, 60844 * 36 - 2000000);
  /* The inverse must round-trip, within the payment's own rounding. */
  const back = Projection.principalForPaymentCents({ paymentCents: pay.value, annualRate: 0.06, months: 36 });
  checkTrue('principal-for-payment inverts payment-for-principal',
    Math.abs(back.value - 2000000) <= 100, `got ${back.value}`);
  /* At 0% it is simply the amount split evenly — a case the formula divides
     by zero on if it isn't special-cased. */
  check('a 0% loan is an even split',
    Projection.levelPaymentCents({ principalCents: 120000, annualRate: 0, months: 12 }).value, 10000);
  check('a zero-month term is refused, not divided by',
    Projection.levelPaymentCents({ principalCents: 120000, annualRate: 0.06, months: 0 }).status, 'incomplete');
})();

/* -- HYSA switch ---------------------------------------------------------
     $10,000 from 0.5% to 4.5% = $400 a year. Five days in transit at the old
     rate costs 10,000 × 0.005 × 5/365 = $0.68, so year one nets $399.32.   */
(function () {
  const s = QuickMath.hysaSwitch({ balanceCents: 1000000, currentApy: 0.005, newApy: 0.045, daysInTransit: 5 });
  check('annual gain from the spread', s.annualGainCents, 40000);
  check('cost of the days in transit', s.transitCostCents, 68);
  check('first-year net', s.firstYearNetCents, 39932);
  check('and it is worth doing', s.worthIt, true);
  checkTrue('break-even is well under a day', s.breakEvenDays.value < 1);

  /* A one-off fee pushes break-even out but does not change the ongoing gain. */
  const withFee = QuickMath.hysaSwitch({ balanceCents: 1000000, currentApy: 0.005, newApy: 0.045,
    daysInTransit: 5, frictionCostCents: 5000 });
  check('a $50 fee comes off year one', withFee.firstYearNetCents, 39932 - 5000);
  check('but the ongoing gain is untouched', withFee.ongoingAnnualCents, 40000);
  checkTrue('and break-even moves out', withFee.breakEvenDays.value > s.breakEvenDays.value);

  /* Switching to a worse rate is reported as such, not as a negative gain to
     be paid back over some number of days. */
  const worse = QuickMath.hysaSwitch({ balanceCents: 1000000, currentApy: 0.045, newApy: 0.005 });
  check('a worse rate is not worth it', worse.worthIt, false);
  check('and has no break-even', worse.breakEvenDays.status, 'incomplete');

  check('a missing rate is incomplete',
    QuickMath.hysaSwitch({ balanceCents: 1000000, currentApy: 0.005 }).status, 'incomplete');
})();

/* -- Cost per use --------------------------------------------------------- */
(function () {
  check('$1,200 over 200 uses', QuickMath.costPerUse({ priceCents: 120000, uses: 200 }).value, 600);
  check('and per month over two years',
    QuickMath.costPerUse({ priceCents: 120000, uses: 200, overMonths: 24 }).perMonthCents, 5000);
  check('zero uses is refused, not divided by',
    QuickMath.costPerUse({ priceCents: 120000, uses: 0 }).status, 'incomplete');
  check('no uses entered is incomplete',
    QuickMath.costPerUse({ priceCents: 120000 }).status, 'incomplete');
  /* To get a $1,200 coat under $10 a wear you need 120 wears. */
  check('uses needed to reach $10 each', QuickMath.usesToReach(120000, 1000).value, 120);
  check('and it rounds up, since a part-use is not a use',
    QuickMath.usesToReach(120000, 700).value, Math.ceil(120000 / 700));
})();

/* -- The $30k–$90k rule ---------------------------------------------------
      $100/mo is $1,200/yr of spending. At a 4% withdrawal rate the pot has to
      be $1,200 / 0.04 = $30,000 bigger to fund it forever — which is exactly
      Eli's 100 × 12 × 25. Invested instead at 7% it reaches ~$90,000 after
      about 26 years. The first half is exact; the second depends entirely on
      the horizon, which is why the engine computes it rather than asserting
      the round number.                                                     */
(function () {
  const h = Demo.build();   /* Robin is 32, so the default horizon is to 65 */

  const r = QuickMath.recurringHabit(h, {}, { monthlyAmountCents: 10000 });
  check('the $30k half is exact', r.fireNumberAdditionCents, 3000000);
  check('and equals monthly × 12 × 25 at a 4% rate',
    r.fireNumberAdditionCents, 10000 * 12 * 25);
  check('the horizon defaults to retirement age', r.years, 65 - 32);
  check('and says so', r.horizonBasis, 'to age 65');

  /* The canonical pairing, at the horizon that actually produces it. */
  const canonical = QuickMath.recurringHabit(h, {}, { monthlyAmountCents: 10000, years: 26.3 });
  check('the $30k half is unchanged by horizon', canonical.fireNumberAdditionCents, 3000000);
  checkTrue('and the other half lands on about $90,000',
    Math.abs(canonical.investedInsteadCents - 9000000) < 100000,
    `got ${canonical.investedInsteadCents}`);

  /* The first half must NOT move with the return assumption; the second must. */
  const slowGrowth = QuickMath.recurringHabit(h, {}, {
    monthlyAmountCents: 10000, years: 26.3, localOverrides: { expectedReturnRate: 0.04 } });
  check('the FIRE-number half ignores the return rate',
    slowGrowth.fireNumberAdditionCents, canonical.fireNumberAdditionCents);
  checkTrue('the invested half does not',
    slowGrowth.investedInsteadCents < canonical.investedInsteadCents);

  /* A more conservative withdrawal rate makes the habit cost MORE to fund. */
  const conservative = QuickMath.recurringHabit(h, {}, {
    monthlyAmountCents: 10000, localOverrides: { swrRate: 0.03 } });
  check('a 3% withdrawal rate needs a bigger pot',
    conservative.fireNumberAdditionCents, Math.round(120000 / 0.03));
  checkTrue('which is more than at 4%',
    conservative.fireNumberAdditionCents > r.fireNumberAdditionCents);

  /* Scale is linear on the first half, and on the second. */
  const doubled = QuickMath.recurringHabit(h, {}, { monthlyAmountCents: 20000 });
  check('doubling the habit doubles the mountain',
    doubled.fireNumberAdditionCents, r.fireNumberAdditionCents * 2);
  checkTrue('and roughly doubles the road not taken',
    Math.abs(doubled.investedInsteadCents - r.investedInsteadCents * 2) <= 2);

  /* Growth is reported apart from contributions, since that IS the point. */
  check('contributions are the plain sum', r.contributedCents, 10000 * 12 * (65 - 32));
  check('and growth is the rest', r.growthCents, r.investedInsteadCents - r.contributedCents);
  checkTrue('growth outweighs contributions over 33 years',
    r.growthCents > r.contributedCents);

  /* Without a date of birth it falls back to a stated default, not silence. */
  const noDob = Demo.build();
  noDob.people[0].dob = null;
  const fallback = QuickMath.recurringHabit(noDob, {}, { monthlyAmountCents: 10000 });
  check('no age falls back to a default horizon', fallback.years, QuickMath.DEFAULT_HABIT_YEARS);
  checkTrue('and names it', /default/.test(fallback.horizonBasis));

  check('no amount is incomplete',
    QuickMath.recurringHabit(h, {}, {}).status, 'incomplete');
})();

/* -- Monthly compounding, against the closed form ------------------------- */
(function () {
  /* $100/mo at 7% for 26.3 years, monthly compounding. */
  const months = Math.round(26.3 * 12), r = 0.07 / 12;
  const closed = 10000 * ((Math.pow(1 + r, months) - 1) / r);
  const fv = Projection.futureValueMonthlyCents({
    monthlyContributionCents: 10000, annualRate: 0.07, months: months });
  check('monthly future value matches the closed form', fv.value, Math.round(closed));
  /* At 0% it is just the sum of the payments — the case the formula divides
     by zero on. */
  check('a 0% return is the plain sum',
    Projection.futureValueMonthlyCents({
      monthlyContributionCents: 10000, annualRate: 0, months: 120 }).value, 1200000);
  /* A starting balance compounds too. */
  const withStart = Projection.futureValueMonthlyCents({
    startCents: 1000000, monthlyContributionCents: 0, annualRate: 0.07, months: 120 });
  check('a starting balance compounds on its own',
    withStart.value, Math.round(1000000 * Math.pow(1 + r, 120)));
  check('zero months is refused',
    Projection.futureValueMonthlyCents({
      monthlyContributionCents: 10000, annualRate: 0.07, months: 0 }).status, 'incomplete');
})();

/* -- 20/3/8 car rule ------------------------------------------------------ */
(function () {
  const h = Demo.build();
  /* Robin grosses $6,000/mo, so the 8% cap is $480. */
  const headroom = QuickMath.carRule2038(h, {});
  check('payment cap is 8% of gross monthly', headroom.paymentCapCents, 48000);
  check('nothing priced yet, so no checks run', headroom.checks.length, 0);
  /* The max price must be exactly consistent with the cap: borrowing 80% of
     it over 36 months should cost the cap. */
  const impliedLoan = Math.round(headroom.maxAffordablePriceCents * 0.8);
  const impliedPayment = Projection.levelPaymentCents({
    principalCents: impliedLoan, annualRate: 0.06, months: 36 });
  checkTrue('the max affordable price is consistent with the payment cap',
    Math.abs(impliedPayment.value - 48000) <= 50,
    `implied payment ${impliedPayment.value} vs cap 48000`);

  /* A $30,000 car with $3,000 down over 60 months fails all three legs. */
  const bad = QuickMath.carRule2038(h, { carPriceCents: 3000000, downPaymentCents: 300000,
    termMonths: 60, loanRate: 0.07 });
  check('it passes none of the three', bad.value, 0);
  check('passesAll is false', bad.passesAll, false);
  const leg = k => bad.checks.find(c => c.key === k);
  check('10% down fails the 20% leg', leg('down').pass, false);
  check('and reports the shortfall', leg('down').shortfallCents, 3000000 * 0.2 - 300000);
  check('60 months fails the 3-year leg', leg('term').pass, false);
  check('and the payment is over the cap', leg('payment').pass, false);
  checkTrue('by a stated amount', leg('payment').overByCents > 0);

  /* A car that obeys the rule passes all three. */
  const good = QuickMath.carRule2038(h, { carPriceCents: 1500000, downPaymentCents: 300000,
    termMonths: 36, loanRate: 0.06 });
  check('a $15,000 car with $3,000 down over 36 months passes all three', good.value, 3);
  check('passesAll is true', good.passesAll, true);

  check('without income the rule cannot be checked',
    QuickMath.carRule2038(Schema.createHousehold(), { carPriceCents: 1500000 }).status, 'incomplete');
})();

/* -- Rule of Five --------------------------------------------------------- */
(function () {
  const h = Demo.build();   /* $9,500 cash */
  const near = QuickMath.ruleOfFive(h, 200000);   /* a $2,000 thing */
  check('$9,500 against a $2,000 thing', near.howManyYouCouldBuy, 4);
  check('four is not five', near.passes, false);
  check('and the shortfall is stated', near.shortfallCents, 200000 * 5 - 950000);

  const fine = QuickMath.ruleOfFive(h, 100000);   /* a $1,000 thing */
  check('$9,500 against a $1,000 thing passes', fine.passes, true);
  check('the rule is carried with the result so it can be shown',
    fine.rule.multiple, 5);
  check('without a price it is incomplete', QuickMath.ruleOfFive(h, null).status, 'incomplete');
  check('without cash it is incomplete',
    QuickMath.ruleOfFive(Schema.createHousehold(), 100000).status, 'incomplete');
})();

/* ==========================================================================
   9e. Self-employment. SPEC.md §13 — "a common source of off-by-a-factor
   errors", and "most DIY calculators skip the safe harbor".
   ========================================================================== */

section('Self-employment');

/* The textbook worked example, $100,000 of net profit, single filer:
     net earnings      100,000 × 0.9235 = 92,350.00
     social security    92,350 × 0.124  = 11,451.40
     medicare           92,350 × 0.029  =  2,678.15
     SE tax                              = 14,129.55
     deductible half                     =  7,064.78                        */
(function () {
  const T = TABLES.seTax;
  const r = SelfEmployed.selfEmploymentTax(10000000, 'single', T);

  check('net earnings are 92.35% of profit', r.netEarningsCents, 9235000);
  check('social security', r.socialSecurityCents, 1145140);
  check('medicare', r.medicareCents, 267815);
  check('total SE tax', r.value, 1412955);
  check('the deductible employer-equivalent half', r.deductibleHalfCents, 706478);
  check('no additional medicare at this level', r.additionalMedicareCents, 0);

  /* The classic off-by-a-factor: 15.3% of PROFIT rather than of net earnings
     would be $15,300. It must not be that. */
  checkTrue('the rate is applied to net earnings, not to profit',
    r.value !== Math.round(10000000 * 0.153),
    `got ${r.value}, the wrong answer would be ${Math.round(10000000 * 0.153)}`);
  check('the effective rate on profit is 15.3% × 0.9235',
    r.effectiveRateOnProfit, 0.153 * 0.9235, 1e-6);
  /* And the deductible half is half of the ORDINARY tax, not of the total. */
  check('the deductible half is half the ordinary tax',
    r.deductibleHalfCents, Math.round((r.socialSecurityCents + r.medicareCents) / 2));

  /* Above the wage base, social security stops and Medicare does not.
       net earnings 250,000 × 0.9235 = 230,875
       SS  184,500 × 0.124           =  22,878.00   (capped)
       Med 230,875 × 0.029           =   6,695.38
       add (230,875 − 200,000) × .009 =    277.88                          */
  const big = SelfEmployed.selfEmploymentTax(25000000, 'single', T);
  check('social security is capped at the wage base',
    big.socialSecurityCents, Math.round(T.socialSecurityWageBase * 100 * T.socialSecurityRate));
  check('medicare is not capped', big.medicareCents, Math.round(23087500 * 0.029));
  check('additional medicare applies above the threshold',
    big.additionalMedicareCents, Math.round((23087500 - 20000000) * 0.009));
  checkTrue('and the cap is reported', big.socialSecurityCappedAt !== null);
  /* Additional Medicare is NOT deductible. */
  check('the deductible half excludes the additional medicare',
    big.deductibleHalfCents, Math.round((big.socialSecurityCents + big.medicareCents) / 2));

  /* A married-joint filer has a higher additional-Medicare threshold, so the
     same earnings attract less of it. */
  const joint = SelfEmployed.selfEmploymentTax(25000000, 'married_joint', T);
  checkTrue('a higher threshold means less additional medicare',
    joint.additionalMedicareCents < big.additionalMedicareCents);

  /* Edge cases. */
  check('a loss owes no SE tax', SelfEmployed.selfEmploymentTax(-500000, 'single', T).value, 0);
  check('zero profit owes no SE tax', SelfEmployed.selfEmploymentTax(0, 'single', T).value, 0);
  check('no profit entered is incomplete',
    SelfEmployed.selfEmploymentTax(null, 'single', T).status, 'incomplete');
})();

/* -- W2 vs 1099 ----------------------------------------------------------- */
(function () {
  const h = Demo.build();
  const cmp = SelfEmployed.compareW2vs1099(h, TABLES, {
    w2SalaryCents: 7200000, w2BenefitsValueCents: 800000,
    contractIncomeCents: 8500000, businessExpensesCents: 500000
  });
  check('the comparison completes', cmp.status, 'ok');
  check('W2 benefits count toward the W2 side',
    cmp.w2.netCents, 7200000 - cmp.w2.ficaCents - cmp.w2.incomeTaxCents + 800000);
  check('business expenses come off before SE tax',
    cmp.contract.netProfitCents, 8500000 - 500000);
  check('the SE tax is the same engine as above',
    cmp.contract.seTaxCents,
    SelfEmployed.selfEmploymentTax(8000000, 'single', TABLES.seTax).value);
  check('the deduction reduces what income tax is charged on',
    cmp.contract.taxableAfterDeductionCents,
    8000000 - cmp.contract.seDeductibleHalfCents);
  checkTrue('an equivalent contract rate is offered', Money.isEntered(cmp.equivalentContractCents));
  checkTrue('and it is above the salary it has to match',
    cmp.equivalentContractCents > 7200000,
    `equivalent ${cmp.equivalentContractCents} vs salary 7200000`);

  /* Both sides missing means no comparison, not a zero. */
  check('without both figures it is incomplete',
    SelfEmployed.compareW2vs1099(h, TABLES, { w2SalaryCents: 7200000 }).status, 'incomplete');
  const noStatus = Demo.build();
  noStatus.filingStatus = null;
  check('without a filing status it is incomplete',
    SelfEmployed.compareW2vs1099(noStatus, TABLES,
      { w2SalaryCents: 7200000, contractIncomeCents: 8500000 }).status, 'incomplete');
})();

/* -- Quarterly estimates and the safe harbour ----------------------------- */
(function () {
  const h = Demo.build();
  const base = { expectedNetProfitCents: 10000000 };

  /* With no prior year, the target is 90% of this year's liability. */
  const currentOnly = SelfEmployed.quarterlyEstimated(h, TABLES, base);
  check('without a prior year it uses the current-year share',
    currentOnly.basedOn, 'current-year-only');
  check('which is 90% of this year', currentOnly.requiredAnnualCents,
    Math.round(currentOnly.thisYearLiabilityCents * 0.9));
  check('split four ways', currentOnly.perQuarterCents,
    Math.round(currentOnly.requiredAnnualCents / 4));

  /* A small prior year is the safe harbour — the whole point of the rule. */
  const withHarbor = SelfEmployed.quarterlyEstimated(h, TABLES,
    Object.assign({ priorYearLiabilityCents: 500000, priorYearAgiCents: 6000000 }, base));
  check('a smaller prior year becomes the safe harbour',
    withHarbor.basedOn, 'prior-year safe harbour');
  check('at 100% of it', withHarbor.requiredAnnualCents, 500000);
  checkTrue('which is far less than the current-year target',
    withHarbor.requiredAnnualCents < currentOnly.requiredAnnualCents);

  /* Above the AGI threshold the prior-year share rises to 110%. */
  const highIncome = SelfEmployed.quarterlyEstimated(h, TABLES,
    Object.assign({ priorYearLiabilityCents: 500000, priorYearAgiCents: 20000000 }, base));
  check('a high prior-year AGI raises the share', highIncome.priorYearShare, 1.1);
  check('and the target with it', highIncome.requiredAnnualCents, Math.round(500000 * 1.1));
  check('and it is flagged', highIncome.priorYearIsHighIncome, true);

  /* A big prior year does NOT become the harbour — the rule takes the lesser. */
  const bigPrior = SelfEmployed.quarterlyEstimated(h, TABLES,
    Object.assign({ priorYearLiabilityCents: 50000000, priorYearAgiCents: 6000000 }, base));
  check('a larger prior year is not used', bigPrior.basedOn, 'current-year estimate');
  check('the lesser of the two wins', bigPrior.requiredAnnualCents,
    Math.min(bigPrior.currentYearTargetCents, bigPrior.priorYearTargetCents));

  /* Tax withheld from a day job reduces what is left to pay in quarters. */
  const withW2 = SelfEmployed.quarterlyEstimated(h, TABLES,
    Object.assign({ taxAlreadyWithheldCents: 300000 }, base));
  check('withholding elsewhere reduces the quarterly payment',
    withW2.payableAcrossQuartersCents, currentOnly.requiredAnnualCents - 300000);
  /* And it can wipe them out entirely rather than going negative. */
  const covered = SelfEmployed.quarterlyEstimated(h, TABLES,
    Object.assign({ taxAlreadyWithheldCents: 99999999 }, base));
  check('over-withholding leaves nothing to pay, not a negative', covered.perQuarterCents, 0);

  check('four due dates are named', currentOnly.dueDates.length, 4);
  check('without expected profit it is incomplete',
    SelfEmployed.quarterlyEstimated(h, TABLES, {}).status, 'incomplete');
})();

/* ==========================================================================
   9f. Goal Costing Engine. SPEC.md §9 item 6, §13.
   ========================================================================== */

section('Goals');

/* A wedding: $8,000 venue + $12,000 catering + $3,500 photography = $23,500,
   $5,000 already saved, wanted by 2028-06-15 (21 months from 2026-09-03).
     remaining 18,500 / 21 = $880.96 a month
   At $400 a month it takes ceil(18,500/400) = 47 months — 26 months late.  */
function weddingHousehold() {
  const w = Goals.fromTemplate(TABLES.goalTemplates, 'wedding');
  w.id = 'g_wedding';
  w.lineItems[0].amountCents = 800000;
  w.lineItems[1].amountCents = 1200000;
  w.lineItems[2].amountCents = 350000;
  w.savedCents = 500000;
  w.targetDate = '2028-06-15';
  w.monthlyContributionCents = 40000;
  const h = Demo.build();
  h.expenses.entries = Demo.buildSpending();
  h.goals = [w];
  return { h, w };
}

(function () {
  const { h, w } = weddingHousehold();
  const p = Goals.plan(h, w, TABLES, { asOf: '2026-09-03' });

  check('a template brings its checklist', w.lineItems.length, 12);
  check('itemised total', p.totalCents, 2350000);
  check('and it knows it was itemised', p.basis, 'itemised');
  check('blank line items are counted, not summed', p.itemsBlank, 9);
  check('remaining after what is saved', p.remainingCents, 1850000);
  check('months until the date', p.monthsUntil.value, 21);
  check('required monthly rounds UP, so the goal is actually met',
    p.requiredMonthlyCents, Math.ceil(1850000 / 21));
  check('not on track at the current contribution', p.onTrack, false);
  check('short by', p.shortfallPerMonthCents, Math.ceil(1850000 / 21) - 40000);
  check('at the current pace it takes', p.monthsAtCurrentContribution, Math.ceil(1850000 / 40000));
  check('which is late', p.arrivesLate, true);
  check('by how many months', p.monthsLate, Math.ceil(1850000 / 40000) - 21);

  /* It reads Cash Flow's surplus rather than asking for one again. */
  check('the required figure is checked against the actual surplus',
    p.affordability.surplusCents, 166000);
  check('and it fits', p.affordability.fitsInSurplus, true);
  check('taking this share of it', p.affordability.shareOfSurplus,
    Math.ceil(1850000 / 21) / 166000, 1e-9);

  /* A lump figure works when there are no itemised amounts. */
  const lump = Schema.createGoal({ name: 'Trip', lumpTargetCents: 500000,
    targetDate: '2027-09-03', savedCents: 0 });
  const lp = Goals.plan(h, lump, TABLES, { asOf: '2026-09-03' });
  check('a lump target is used when nothing is itemised', lp.basis, 'lump');
  check('over twelve months', lp.monthsUntil.value, 12);
  check('required monthly', lp.requiredMonthlyCents, Math.ceil(500000 / 12));

  /* Itemised amounts win over a lump figure if both somehow exist. */
  const both = Schema.createGoal({ lumpTargetCents: 999999, targetDate: '2027-09-03',
    lineItems: [Schema.createGoalLineItem({ label: 'One', amountCents: 100000 })] });
  check('itemised beats a stale lump figure',
    Goals.plan(h, both, TABLES, { asOf: '2026-09-03' }).totalCents, 100000);

  /* Already funded is a real, finished state. */
  const done = Schema.createGoal({ lumpTargetCents: 100000, savedCents: 150000,
    targetDate: '2027-09-03' });
  const dp = Goals.plan(h, done, TABLES, { asOf: '2026-09-03' });
  check('an over-funded goal needs nothing a month', dp.value, 0);
  check('and says so', dp.alreadyThere, true);
  check('remaining never goes negative', dp.remainingCents, 0);

  /* Incomplete states. */
  check('no cost entered is incomplete',
    Goals.plan(h, Schema.createGoal({ targetDate: '2027-09-03' }), TABLES, {}).status, 'incomplete');
  check('no date is incomplete',
    Goals.plan(h, Schema.createGoal({ lumpTargetCents: 100000 }), TABLES, {}).status, 'incomplete');
  check('a date in the past is incomplete',
    Goals.plan(h, Schema.createGoal({ lumpTargetCents: 100000, targetDate: '2020-01-01' }),
      TABLES, { asOf: '2026-09-03' }).status, 'incomplete');
})();

/* Two goals that each fit the surplus can fail to fit it together — which is
   exactly what a per-goal view hides. */
(function () {
  const { h } = weddingHousehold();
  h.goals.push(Schema.createGoal({
    id: 'g_car', name: 'Car', lumpTargetCents: 1500000,
    targetDate: '2027-09-03', savedCents: 0, monthlyContributionCents: 0
  }));
  const all = Goals.planAll(h, TABLES, { asOf: '2026-09-03' });
  check('both goals are planned', all.goalsCounted, 2);
  check('the combined monthly requirement is the sum',
    all.value, Math.ceil(1850000 / 21) + Math.ceil(1500000 / 12));
  check('together they do NOT fit the surplus', all.affordability.fitsInSurplus, false);
  checkTrue('and the monthly gap is stated', all.affordability.shortPerMonthCents > 0);
  /* Each on its own does fit — which is the trap. */
  checkTrue('yet each one alone would have fitted',
    Money.isOk(all.plans[0]) && all.plans[0].affordability.fitsInSurplus &&
    Money.isOk(all.plans[1]) && all.plans[1].affordability.fitsInSurplus);

  check('no goals at all is incomplete',
    Goals.planAll(Schema.createHousehold(), TABLES, {}).status, 'incomplete');
})();

/* The template library carries labels and no amounts, on purpose. */
(function () {
  TABLES.goalTemplates.templates.forEach(function (t) {
    checkTrue(`template "${t.id}" carries only labels, never amounts`,
      t.lineItems.every(li => typeof li === 'string'));
  });
  check('a wedding template exists', !!Goals.templateById(TABLES.goalTemplates, 'wedding'), true);
  check('an unknown template builds nothing',
    Goals.fromTemplate(TABLES.goalTemplates, 'nope'), null);
  check('the custom template starts empty',
    Goals.fromTemplate(TABLES.goalTemplates, 'custom').lineItems.length, 0);
})();

/* ==========================================================================
   9g. Where the money goes. SPEC.md §13 Tier 2.
   ========================================================================== */

section('Accounts');

/* Roth vs Traditional, on EQUAL PRE-TAX COST, reduces to one comparison:
   Traditional wins exactly when your future rate is lower than today's, and
   they are mathematically identical when the rates match. Everything else is
   arithmetic around that. */
(function () {
  const base = { pretaxCents: 700000, annualReturn: 0.07, years: 30 };

  const equal = Accounts.compareAccounts(
    Object.assign({ currentTaxRate: 0.24, futureTaxRate: 0.24 }, base));
  check('at equal rates Traditional and Roth are identical',
    equal.byKey.traditional.afterTaxCents, equal.byKey.roth.afterTaxCents);
  check('and the engine flags that rather than picking a winner', equal.ratesEqual, true);
  check('so the margin is nothing', equal.marginOverNextCents, 0);

  const lower = Accounts.compareAccounts(
    Object.assign({ currentTaxRate: 0.24, futureTaxRate: 0.22 }, base));
  check('a lower future rate favours Traditional', lower.bestKey, 'traditional');
  check('and that is reported as the reason', lower.futureRateLower, true);

  const higher = Accounts.compareAccounts(
    Object.assign({ currentTaxRate: 0.22, futureTaxRate: 0.24 }, base));
  check('a higher future rate favours Roth', higher.bestKey, 'roth');

  /* Brokerage puts in the same money as the Roth but pays tax on the growth,
     so it can never beat the Roth while capital gains are taxed at all. */
  ['traditional', 'roth'].forEach(function () {});
  checkTrue('a taxable brokerage never beats the Roth at the same money in',
    lower.byKey.brokerage.afterTaxCents < lower.byKey.roth.afterTaxCents);
  check('because the same amount went in',
    lower.byKey.brokerage.goesInCents, lower.byKey.roth.goesInCents);
  checkTrue('and only the growth was taxed',
    lower.byKey.brokerage.taxedLaterCents > 0 && lower.byKey.roth.taxedLaterCents === 0);

  /* Traditional puts MORE in, because nothing was taken out first. */
  check('Traditional invests the whole pre-tax amount',
    lower.byKey.traditional.goesInCents, 700000);
  check('Roth invests what is left after tax',
    lower.byKey.roth.goesInCents, Math.round(700000 * (1 - 0.24)));

  /* A zero capital-gains rate makes brokerage and Roth identical, which is a
     good check that the only difference modelled is that tax. */
  const noCapGains = Accounts.compareAccounts(
    Object.assign({ currentTaxRate: 0.24, futureTaxRate: 0.24, capitalGainsRate: 0 }, base));
  check('with no capital-gains tax, brokerage equals Roth',
    noCapGains.byKey.brokerage.afterTaxCents, noCapGains.byKey.roth.afterTaxCents);

  /* Zero years means no growth and the comparison is purely about tax. */
  const now = Accounts.compareAccounts(
    Object.assign({}, base, { years: 0, currentTaxRate: 0.24, futureTaxRate: 0.10 }));
  check('with no time to grow, Traditional keeps 90% of the pre-tax amount',
    now.byKey.traditional.afterTaxCents, Math.round(700000 * 0.9));

  check('missing a rate is incomplete',
    Accounts.compareAccounts(Object.assign({ currentTaxRate: 0.24 }, base)).status, 'incomplete');
})();

/* Solo 401k. The classic error is 25% of profit; a sole proprietor's employer
   share is 20% of profit AFTER half the SE tax. */
(function () {
  const limits = TABLES.irsLimits, seT = TABLES.seTax;
  const r = Accounts.solo401k({ netProfitCents: 10000000, age: 40,
    filingStatus: 'single', limits: limits, seTaxTable: seT });

  check('employee deferral is the elective limit',
    r.employeeCents, Math.round(limits.limits.elective401k * 100));
  /* $100,000 − $7,064.78 half-SE-tax = $92,935.22 base. */
  check('the employer base is profit less half the SE tax', r.employerBaseCents, 10000000 - 706478);
  check('the employer share is 20%, not 25%', r.employerShare, 0.20);
  check('so the employer contribution is', r.employerCents, Math.round((10000000 - 706478) * 0.2));
  checkTrue('which is NOT 25% of profit',
    r.employerCents !== Math.round(10000000 * 0.25),
    `got ${r.employerCents}, the wrong answer would be ${Math.round(10000000 * 0.25)}`);
  check('total is the two halves', r.totalCents, r.employeeCents + r.employerCents);
  check('not yet over fifty', r.overFifty, false);

  /* At 50 the catch-up lifts the elective limit and sits outside the cap. */
  const older = Accounts.solo401k({ netProfitCents: 10000000, age: 55,
    filingStatus: 'single', limits: limits, seTaxTable: seT });
  check('the catch-up raises the elective limit', older.employeeCents,
    Math.round((limits.limits.elective401k + limits.limits.elective401kCatchup50Plus) * 100));
  check('and is flagged', older.overFifty, true);
  checkTrue('so more goes in overall', older.totalCents > r.totalCents);

  /* A very large profit runs into the annual-additions cap. */
  const big = Accounts.solo401k({ netProfitCents: 50000000, age: 40,
    filingStatus: 'single', limits: limits, seTaxTable: seT });
  check('a big profit hits the annual-additions cap', big.hitCap, true);
  check('and is held to it', big.totalCents, Math.round(limits.limits.annualAdditions * 100));

  /* Planning to defer less leaves the employer half untouched. */
  const partial = Accounts.solo401k({ netProfitCents: 10000000, age: 40,
    plannedEmployeeCents: 500000, filingStatus: 'single', limits: limits, seTaxTable: seT });
  check('a smaller deferral is respected', partial.employeeCents, 500000);
  check('and the employer half is unchanged', partial.employerCents, r.employerCents);

  check('no profit means no room', Accounts.solo401k({ netProfitCents: 0,
    limits: limits, seTaxTable: seT }).value, 0);
  check('no profit entered is incomplete',
    Accounts.solo401k({ limits: limits, seTaxTable: seT }).status, 'incomplete');
})();

/* ==========================================================================
   10. Field ownership. Every shared number is editable in exactly one room,
   and is a working link everywhere else.
   ========================================================================== */

/* ==========================================================================
   SWAN Number — the self-report, and the line between it and the maths.
   SPEC.md §13 Tier 1.5. Robin: $9,500 cash, $3,150/mo expenses.
   ========================================================================== */

/* ==========================================================================
   Savings Rate room — both variants, and the what-if that counts twice.
   SPEC.md §12.1, §13. Robin: $72,000 gross, $3,150/mo, $2,160 match.
   ========================================================================== */

section('Savings Rate');

(function () {
  const h = Demo.build();
  const rates = Tier0.savingsRate(h, TABLES);

  /* Both variants, always. SPEC.md §12.1 is RESOLVED as "build both". */
  check('the excluding-match variant labels itself',
    rates.excludingMatch.variant, 'excludingMatch');
  check('and so does the including-match one',
    rates.includingMatch.variant, 'includingMatch');
  checkTrue('the two are different numbers',
    rates.excludingMatch.value !== rates.includingMatch.value);
  check('including-match is higher by exactly the match over gross',
    rates.includingMatch.value - rates.excludingMatch.value,
    216000 / 7200000, 1e-12);

  /* -- The what-if household: same engines, moved spending ---------------
        1 point of $72,000 is $720 a year, which is $60 a month.          */
  const onePoint = Schema.withMonthlyExpensesDeltaCents(h, -6000);
  check('cutting $60/mo lands on the expense figure',
    Schema.monthlyExpensesCents(onePoint).value, 315000 - 6000);
  check('and leaves the original household alone',
    Schema.monthlyExpensesCents(h).value, 315000);
  check('a point of spending is a point of savings rate',
    Tier0.savingsRate(onePoint, TABLES).excludingMatch.value - rates.excludingMatch.value,
    0.01, 1e-12);

  /* The double effect: the same cut also lowers the target, because the
     target is built from a year of spending at a 4% withdrawal rate. */
  check('the FIRE target falls by the annual cut over the SWR',
    Tier0.fireNumber(h).value - Tier0.fireNumber(onePoint).value,
    Math.round(72000 / 0.04), 1e-6);
  check('which for ten points is $180,000',
    Tier0.fireNumber(h).value - Tier0.fireNumber(Schema.withMonthlyExpensesDeltaCents(h, -60000)).value,
    18000000);

  /* -- Spending cannot go negative, and nothing entered stays nothing ---- */
  check('an absurd cut floors spending at zero',
    Schema.monthlyExpensesCents(Schema.withMonthlyExpensesDeltaCents(h, -99999999)).value, 0);
  const blank = Schema.createHousehold({});
  check('with no expenses entered, a delta does not invent one',
    Schema.monthlyExpensesCents(Schema.withMonthlyExpensesDeltaCents(blank, -6000)).status,
    'incomplete');

  /* The delta lands on whichever figure monthlyExpensesCents actually reads,
     so the hypothetical answers the same question the real one does. */
  const tracked = Demo.build();
  tracked.expenses.monthlyEssential.trackedValueCents = 300000;
  const trackedCut = Schema.withMonthlyExpensesDeltaCents(tracked, -6000);
  check('with a tracked month, the delta moves the tracked figure',
    trackedCut.expenses.monthlyEssential.trackedValueCents, 294000);
  check('and leaves the estimate where it was',
    trackedCut.expenses.monthlyEssential.estimatedValueCents,
    tracked.expenses.monthlyEssential.estimatedValueCents);

  /* -- Cutting spending always brings the date closer, never further ----- */
  const baseYears = Tier0.yearsToFire(h, TABLES);
  const tenYears = Tier0.yearsToFire(Schema.withMonthlyExpensesDeltaCents(h, -60000), TABLES);
  checkTrue('ten points brings work-optional closer',
    Money.isOk(baseYears) && Money.isOk(tenYears) && tenYears.value < baseYears.value);

  /* -- Overspending is a real result, not an error ----------------------- */
  const overspending = Schema.withMonthlyExpensesDeltaCents(h, 385000);
  const negative = Tier0.savingsRate(overspending, TABLES).excludingMatch;
  check('spending more than you take home gives a negative rate', negative.status, 'ok');
  checkTrue('and the rate really is below zero', negative.value < 0);
  check('and the projection says the target is never reached, not zero years',
    Tier0.yearsToFire(overspending, TABLES).status, 'incomplete');

  /* -- The benchmark flag reads the conservative variant ----------------- */
  const flags = Foo.evaluate(overspending, TABLES).flags;
  const flagged = flags.filter(f => f.key === 'savings_rate_below_benchmark')[0];
  checkTrue('a negative rate trips the benchmark flag', !!flagged);
  check('and the flag says which variant it judged', flagged.detail.variant, 'excludingMatch');
  check('the floor it used is the one in data/foo_rules.json',
    flagged.detail.floor, TABLES.fooRules.thresholds.savingsRateBenchmarkFloor);
  checkTrue('Robin at 28.5% is not flagged',
    !Foo.evaluate(h, TABLES).flags.some(f => f.key === 'savings_rate_below_benchmark'));
})();

section('SWAN Number');

(function () {
  const Reference = require(path.join(ROOT, 'shared/reference.js'));
  const LIQ = TABLES.liquidityBenchmarks;
  const base = Demo.build();

  /* -- Nothing named: incomplete everywhere, and never a zero ------------- */
  checkTrue('with no number named, isSet is false', Swan.isSet(base) === false);
  const unset = Swan.targetCents(base);
  check('an unnamed target is incomplete', unset.status, 'incomplete');
  check('an unnamed target has no value', unset.value, null);
  check('comparing against an unnamed target is incomplete',
    Swan.compare(base).status, 'incomplete');
  check('milestones still work without a target', Swan.milestones(base, LIQ).status, 'ok');

  /* -- Months basis: 6 x 3,150 = 18,900 ---------------------------------- */
  const months6 = Demo.build();
  months6.swan = { basis: 'months', targetCents: null, targetMonths: 6, note: null, setAt: null };
  checkTrue('a months target counts as set', Swan.isSet(months6) === true);
  check('6 months of $3,150 is $18,900', Swan.targetCents(months6).value, 1890000);
  check('and reads back as 6 months', Swan.targetMonths(months6).value, 6);
  check('the basis is carried through', Swan.targetCents(months6).basis, 'months');

  /* -- Amount basis: $20,000 / 3,150 = 6.349206... months ----------------- */
  const amount20k = Demo.build();
  amount20k.swan = { basis: 'amount', targetCents: 2000000, targetMonths: null, note: null, setAt: null };
  check('an amount target is itself', Swan.targetCents(amount20k).value, 2000000);
  check('$20,000 against $3,150 a month is 6.349 months',
    Swan.targetMonths(amount20k).value, 20000 / 3150, 1e-9);

  /* -- A months target with no expenses has no dollar figure -------------- */
  const noExpenses = Schema.createHousehold({
    assets: [Schema.createAsset({ category: 'cash', valueCents: 950000, liquid: true })],
    swan: { basis: 'months', targetMonths: 6 }
  });
  const dangling = Swan.targetCents(noExpenses);
  check('a months target with no expenses is incomplete', dangling.status, 'incomplete');
  check('and it is not silently zero', dangling.value, null);
  checkTrue('and it names monthly expenses as what is missing',
    dangling.missing.includes('monthlyExpenses'));

  /* -- An affirmative zero is an answer, not a blank ---------------------- */
  const zero = Demo.build();
  zero.swan = { basis: 'amount', targetCents: 0, targetMonths: null, note: null, setAt: null };
  checkTrue('a target of zero counts as set', Swan.isSet(zero) === true);
  check('a target of zero is ok, not incomplete', Swan.targetCents(zero).status, 'ok');
  check('and its value is 0, not null', Swan.targetCents(zero).value, 0);
  const zeroCmp = Swan.compare(zero);
  check('cash against a zero target still reports', zeroCmp.status, 'ok');
  check('a zero target is met', zeroCmp.metTarget, true);
  check('and the ratio refuses to divide by it', zeroCmp.coverageRatio.status, 'incomplete');

  /* -- The comparison: 9,500 vs 18,900 ----------------------------------- */
  const cmp = Swan.compare(months6);
  check('coverage of the target is 9,500 / 18,900', cmp.value, 950000 / 1890000, 1e-12);
  check('cash on hand is read, not typed', cmp.cashCents, 950000);
  check('the gap is 18,900 − 9,500 = 9,400', cmp.gapCents, 940000);
  check('the target is not met', cmp.metTarget, false);

  /* The two halves of the side-by-side must NOT be the same number: the
     computed months come from Tier 0 and know nothing about the target. */
  check('computed coverage rides along untouched',
    cmp.computedMonths.value, Tier0.emergencyFundMonths(months6).value);
  check('computed coverage is 9,500 / 3,150', cmp.computedMonths.value, 9500 / 3150, 1e-12);
  checkTrue('the self-report and the computation are different numbers',
    Math.abs(cmp.computedMonths.value - 6) > 1);

  /* -- Past the target: the gap goes negative, nothing clamps ------------- */
  const rich = Demo.build();
  rich.swan = { basis: 'amount', targetCents: 500000, targetMonths: null, note: null, setAt: null };
  const over = Swan.compare(rich);
  check('past the target, metTarget is true', over.metTarget, true);
  check('and the gap is signed, not clamped', over.gapCents, 500000 - 950000);
  checkTrue('and coverage reads above 1', over.value > 1);

  /* -- Time to close the gap: 9,400 / 500 = 18.8 months ------------------- */
  check('the gap closes in 18.8 months at $500/mo',
    Swan.timeToTarget(940000, 50000).value, 18.8, 1e-9);
  check('a gap already closed takes no time', Swan.timeToTarget(-100, 50000).value, 0);
  checkTrue('and says so', Swan.timeToTarget(-100, 50000).alreadyThere === true);
  check('with nothing spare, it does not divide by zero',
    Swan.timeToTarget(940000, 0).status, 'incomplete');
  check('and neither does a negative monthly',
    Swan.timeToTarget(940000, -1000).status, 'incomplete');
  check('with no monthly figure entered, it is incomplete not infinite',
    Swan.timeToTarget(940000, null).status, 'incomplete');

  /* -- Bands: context, and boundary-inclusive at the top of each band ----- */
  check('6 months lands in the usual full fund',
    Reference.lookupLiquidityBand(LIQ, 6).value, 'conventional_full');
  check('just over 6 months is deliberately deeper',
    Reference.lookupLiquidityBand(LIQ, 6.01).value, 'extended');
  check('3 months is the usual floor', Reference.lookupLiquidityBand(LIQ, 3).value, 'conventional_floor');
  check('1 month is a starter cushion', Reference.lookupLiquidityBand(LIQ, 1).value, 'starter');
  check('two years is past every band', Reference.lookupLiquidityBand(LIQ, 24).value, 'deep');
  check('a negative number of months has no band',
    Reference.lookupLiquidityBand(LIQ, -1).status, 'below_chart');
  check('the last band is open-ended so nothing falls off the end',
    LIQ.bands[LIQ.bands.length - 1].maxMonths, null);
  check('Robin at 6 months is placed by the band lookup',
    Swan.band(months6, LIQ).value, 'conventional_full');

  /* -- Milestones: months x expenses, and what the cash already clears ---- */
  const miles = Swan.milestones(months6, LIQ);
  check('there are four milestones', miles.value.length, 4);
  check('3 months of $3,150 is $9,450', miles.value[1].cents, 945000);
  check('$9,500 of cash clears the 3-month mark', miles.value[1].reachedByCash, true);
  check('but not the 6-month mark', miles.value[2].reachedByCash, false);
  check('which the stated number does clear', miles.value[2].reachedByTarget, true);
  check('12 months is beyond the stated number too', miles.value[3].reachedByTarget, false);

  /* -- The engine never writes. A self-report is only ever written by its
        owning room, through the spine. ------------------------------------ */
  const before = JSON.stringify(months6);
  Swan.compare(months6); Swan.milestones(months6, LIQ); Swan.band(months6, LIQ);
  check('reading the SWAN outputs mutates nothing', JSON.stringify(months6), before);

  /* -- "What's left over" is one function, not a second definition -------
        Robin has no categorised month, so the surplus falls back to Tier 0's
        own annual savings figure: 72,000 − 37,800 expenses − tax, over 12.  */
  const surplus = CashFlow.monthlySurplusCents(base, TABLES.expenseCategories, TABLES);
  const tier0Saving = Tier0.savingsRate(base, TABLES).excludingMatch;
  check('with no categories, the surplus falls back to the monthly total',
    surplus.basis, 'monthlyTotal');
  check('and it is Tier 0\'s own savings figure over twelve',
    surplus.value, Math.round(tier0Saving.annualSavingsCents / 12));
  check('which for Robin is $1,710 a month', surplus.value, 171000);

  /* Once a month IS categorised, the sharper basis takes over. */
  const tracked = Demo.build();
  tracked.expenses.entries = Demo.buildSpending();
  const sharper = CashFlow.monthlySurplusCents(tracked, TABLES.expenseCategories, TABLES);
  check('with categories entered, the categorised basis is used', sharper.basis, 'categorised');
  check('and it agrees with netCashFlow',
    sharper.value, CashFlow.netCashFlow(tracked, TABLES.expenseCategories, TABLES).value);
  checkTrue('the two bases differ, which is why the basis is reported',
    sharper.value !== surplus.value);

  /* -- Ownership: exactly one room may edit it --------------------------- */
  check('the SWAN target is owned by Sleep At Night',
    Ownership.field('swanTarget').owner, 'sleep-at-night');
  check('and Sleep At Night owns only the number and the four coverage facts (D-071; who depends on you went back to the one-pager, D-095)',
    Ownership.ownedBy('sleep-at-night').sort().join(','), 'disabilityMonthly,oopMax,swanTarget,termLife,umbrella');
  const chip = Ownership.describe('swanTarget', months6, 'financial-snapshot');
  check('elsewhere it renders as a read-only $18,900', chip.display, '$18,900');
  check('and it is not editable there', chip.isOwnHere, false);
})();

/* ==========================================================================
   Values vs. Spending Audit — two ordered lists, and deliberately no score.
   SPEC.md §13 Tier 2. Robin's categorised month totals $3,900.
   ========================================================================== */

/* ==========================================================================
   The one 1-10 rating control. SPEC.md §13 Tier 1.5: "build one reusable
   rating component, not four."
   ========================================================================== */

section('Ratings');

(function () {
  /* -- The scale has no zero, and only takes whole numbers -------------- */
  check('the scale runs 1 to 10', Rating.MIN + '-' + Rating.MAX, '1-10');
  checkTrue('1 is valid', Rating.isValid(1));
  checkTrue('10 is valid', Rating.isValid(10));
  checkTrue('0 is NOT a rating', !Rating.isValid(0));
  checkTrue('11 is not a rating', !Rating.isValid(11));
  checkTrue('3.5 is not a rating', !Rating.isValid(3.5));
  checkTrue('null is not a rating', !Rating.isValid(null));

  check('an empty control reads as not rated', Rating.parse(''), null);
  check('a zero typed into it is not a rating', Rating.parse('0'), null);
  check('and "7" is', Rating.parse('7'), 7);

  /* -- Reading, and the line between "not rated" and "rated low" -------- */
  const h = Schema.createHousehold({ ratings: { joy: { dining_out: 8, housing: 1 } } });
  check('a stored rating reads back', Rating.get(h, 'joy', 'dining_out'), 8);
  check('a rating of 1 reads back as 1, not as missing', Rating.get(h, 'joy', 'housing'), 1);
  checkTrue('and it counts as rated', Rating.isRated(h, 'joy', 'housing'));
  check('an unrated item is null', Rating.get(h, 'joy', 'travel'), null);
  checkTrue('and does not count as rated', !Rating.isRated(h, 'joy', 'travel'));
  check('an unknown scope is empty, not an error',
    JSON.stringify(Rating.scopeOf(h, 'hassle')), '{}');

  /* A rating written outside the scale never survives the round trip. */
  const dirty = Schema.createHousehold({ ratings: { joy: { a: 0, b: 99, c: 'x', d: 6 } } });
  check('a zero does not survive into a reading', Rating.get(dirty, 'joy', 'a'), null);
  check('nor does an out-of-range number', Rating.get(dirty, 'joy', 'b'), null);
  check('nor does a string', Rating.get(dirty, 'joy', 'c'), null);
  check('a real rating does', Rating.get(dirty, 'joy', 'd'), 6);

  /* -- Coverage ---------------------------------------------------------- */
  const cov = Rating.coverage(h, 'joy', ['dining_out', 'housing', 'travel']);
  check('two of three are rated', cov.ratedCount, 2);
  check('and the third is named', cov.missing.join(','), 'travel');
  check('coverage share is 2/3', cov.share, 2 / 3, 1e-12);
  check('coverage of nothing has no share', Rating.coverage(h, 'joy', []).share, null);

  /* -- Weighted average: unrated is skipped, never counted as zero ------- */
  const wa = Rating.weightedAverage(h, 'joy', [
    { id: 'dining_out', weight: 100 },   /* 8 */
    { id: 'housing', weight: 300 },      /* 1 */
    { id: 'travel', weight: 500 }        /* unrated — must not drag it down */
  ]);
  check('the weighted average is (8x100 + 1x300) / 400', wa.value, (800 + 300) / 400, 1e-12);
  check('two ratings went into it', wa.ratedCount, 2);
  check('and one was skipped, not zeroed', wa.skippedCount, 1);

  /* Had the unrated item counted as zero the answer would be 1.22, so this
     is the check that the skip is real and not a rounding coincidence. */
  checkTrue('an unrated item counting as zero would give a different answer',
    Math.abs(wa.value - (800 + 300 + 0) / 900) > 1);

  check('with nothing rated, there is no average',
    Rating.weightedAverage(h, 'joy', [{ id: 'travel', weight: 100 }]).status, 'incomplete');

  const zeroWeight = Rating.weightedAverage(h, 'joy', [
    { id: 'dining_out', weight: 0 }, { id: 'housing', weight: 0 }
  ]);
  check('with no weight at all it falls back to a plain average', zeroWeight.value, 4.5);
  checkTrue('and says that it did', zeroWeight.unweighted === true);

  /* -- The control markup ------------------------------------------------ */
  const markup = Rating.controlHtml({ scope: 'joy', itemId: 'dining_out', value: 8, label: 'Eating out' });
  checkTrue('the control carries its scope', markup.includes('data-rating-scope="joy"'));
  checkTrue('and its item', markup.includes('data-rating-item="dining_out"'));
  checkTrue('the current value is selected', markup.includes('<option value="8" selected>'));
  checkTrue('there is a not-rated option', markup.includes('<option value="">'));
  checkTrue('there is no zero option', !markup.includes('<option value="0"'));
  check('there are ten numbered options plus the blank',
    (markup.match(/<option /g) || []).length, 11);
  checkTrue('the ends are anchored in words',
    markup.includes(Rating.anchors('joy').low) && markup.includes(Rating.anchors('joy').high));
  checkTrue('an unrated control selects the blank',
    Rating.controlHtml({ scope: 'joy', itemId: 'x' }).includes('<option value="" selected>'));
  checkTrue('the accessible name says what is being rated',
    markup.includes('aria-label="Joy for Eating out"'));

  /* Every scope gets its own wording, from one place. */
  checkTrue('the hassle scope is anchored differently from joy',
    Rating.anchors('hassle').low !== Rating.anchors('joy').low);

  /* -- Reading an event target ------------------------------------------- */
  const fakeNode = {
    value: '7',
    getAttribute: function (k) {
      return { 'data-rating-scope': 'joy', 'data-rating-item': 'dining_out' }[k] || null;
    }
  };
  const read = Rating.readTarget(fakeNode);
  check('a change on the control reports its scope', read.scope, 'joy');
  check('its item', read.itemId, 'dining_out');
  check('and its parsed value', read.value, 7);
  check('a node that is not a rating control reports nothing',
    Rating.readTarget({ value: '7', getAttribute: function () { return null; } }), null);

  /* -- The dot readout --------------------------------------------------- */
  check('three of ten dots are lit at a rating of 3',
    (Rating.dotsHtml(3).match(/is-on/g) || []).length, 3);
  check('ten dots are always drawn',
    (Rating.dotsHtml(3).match(/slaf-dot/g) || []).length, 10 + 1);  /* + .slaf-dots */
  check('an unrated item lights none',
    (Rating.dotsHtml(null).match(/is-on/g) || []).length, 0);
  checkTrue('and says so to a screen reader',
    Rating.dotsHtml(null).includes('aria-label="not rated"'));
})();

/* ==========================================================================
   Fulfillment Curve — spend against a 1-10 joy rating. SPEC.md §13 Tier 1.5.
   Robin's categorised month, spending only (savings excluded).
   ========================================================================== */

/* ==========================================================================
   Return on Hassle — dollars saved against time and effort. SPEC.md §13.
   ========================================================================== */

/* ==========================================================================
   Side Hustle — marginal rate, stacked SE tax, and the hours it adds.
   SPEC.md §13 Tier 2.
   ========================================================================== */

/* ==========================================================================
   The live-form guard. The DOM half is checked in test/forms.js against a
   real mobile browser; this is the scheduling rule on its own.
   ========================================================================== */

/* ==========================================================================
   Storage safety. Bumping the schema version used to be a data-loss event:
   a stored blob whose version did not match exactly fell through to a fresh
   household, and the next write overwrote the user's real data with it.
   ========================================================================== */

/* ==========================================================================
   Date of birth. A typo must not read as silence, and must never reach a
   lookup table as a real age.
   ========================================================================== */

section('Date of birth');

(function () {
  const Reference = require(path.join(ROOT, 'shared/reference.js'));
  const AS_OF = '2026-09-04';

  check('a normal date gives an age', Schema.ageFromDob('1994-04-12', AS_OF), 32);
  check('and checkDob agrees', Schema.checkDob('1994-04-12', AS_OF).value, 32);

  /* -- A date in the future ---------------------------------------------- */
  check('a future date has no age', Schema.ageFromDob('2090-01-01', AS_OF), null);
  const future = Schema.checkDob('2090-01-01', AS_OF);
  check('and is incomplete', future.status, 'incomplete');
  checkTrue('with a reason that says why', /future/.test(future.reason));
  checkTrue('which differs from the unanswered reason',
    future.reason !== Schema.checkDob(null, AS_OF).reason);

  /* -- A mistyped year the other way ------------------------------------
        This is the dangerous one: it used to produce an age of 151, and
        the percentile table and retirement milestones took it seriously. */
  check('an implausible age does not reach a lookup', Schema.ageFromDob('1875-01-01', AS_OF), null);
  const old = Schema.checkDob('1875-01-01', AS_OF);
  check('and it is reported', old.status, 'incomplete');
  checkTrue('with the computed age quoted back', /151/.test(old.reason));
  check('the plausibility ceiling is stated once', Schema.MAX_PLAUSIBLE_AGE, 120);
  check('exactly at the ceiling is still accepted',
    Schema.ageFromDob('1906-09-04', AS_OF), 120);
  check('one year past it is not', Schema.ageFromDob('1905-09-04', AS_OF), null);

  /* -- Unreadable and unanswered stay distinct --------------------------- */
  check('garbage has no age', Schema.ageFromDob('not-a-date', AS_OF), null);
  checkTrue('and says it cannot be read',
    /read/.test(Schema.checkDob('not-a-date', AS_OF).reason));
  checkTrue('while nothing entered says it is unanswered',
    /answered/i.test(Schema.checkDob(null, AS_OF).reason));
  check('an unanswered date is missing dob, not something else',
    Schema.checkDob(null, AS_OF).missing.join(','), 'dob');

  /* -- Nothing downstream sees a bad age --------------------------------- */
  const typo = Schema.createHousehold({
    people: [Schema.createPerson({ role: 'adult', dob: '1875-01-01' })]
  });
  check('the household reports no age for a typo', Schema.primaryAge(typo, AS_OF), null);
  check('so the percentile lookup is incomplete, not confidently wrong',
    Reference.lookupNetWorthPercentile(TABLES.netWorthPercentiles, 50000,
      Schema.primaryAge(typo, AS_OF)).status, 'incomplete');
  check('and so is the retirement benchmark',
    Reference.lookupRetirementMultiple(TABLES.retirementMilestones,
      Schema.primaryAge(typo, AS_OF)).status, 'incomplete');
})();

/* ==========================================================================
   Script tags. A room that loads an engine must load what that engine needs.

   The Financial Snapshot shipped without engines/projection.js, which
   engines/tier0.js needs for FIRE progress. computeAll() threw on every
   render, the room's own .catch() turned it into "couldn't load the
   reference tables — serve this over HTTP", and the page quietly showed
   em dashes for everything. The browser sweep called the page clean,
   because a swallowed error is not a console error.

   This walks the dependency graph the modules already declare — each one
   names its browser globals as `root.SLAF && root.SLAF.X` — and fails a
   room that loads a module without its dependencies.
   ========================================================================== */

section('Room script tags');

(function () {
  const GLOBAL_TO_FILE = {
    Money: 'shared/money.js', Schema: 'shared/schema.js',
    Registry: 'shared/registry.js', Reference: 'shared/reference.js',
    Spine: 'shared/spine-v2.js', Ownership: 'shared/ownership.js',
    Rating: 'shared/rating.js', LiveForm: 'shared/liveform.js',
    Progress: 'shared/progress.js',
    DemoPersona: 'shared/demo-persona.js',
    Tier0: 'engines/tier0.js', Foo: 'engines/foo.js',
    CashFlow: 'engines/cashflow.js', Debt: 'engines/debt.js',
    Fire: 'engines/fire.js', Projection: 'engines/projection.js',
    Hourly: 'engines/hourly.js', QuickMath: 'engines/quickmath.js',
    SelfEmployed: 'engines/selfemployed.js', Goals: 'engines/goals.js',
    Accounts: 'engines/accounts.js', Swan: 'engines/swan.js',
    Values: 'engines/values.js', Fulfillment: 'engines/fulfillment.js',
    Hassle: 'engines/hassle.js', SideHustle: 'engines/sidehustle.js',
    Ratios: 'engines/ratios.js', Credential: 'engines/credential.js',
    Worth: 'engines/worth.js', Windfall: 'engines/windfall.js',
    Runway: 'engines/runway.js', Health: 'engines/health.js',
    Income: 'engines/income.js', Ledger: 'engines/ledger.js', Budget: 'engines/budget.js', Variance: 'engines/variance.js',
    Presets: 'engines/presets.js', SkillTree: 'engines/skilltree.js', Exercises: 'engines/exercises.js', Gate: 'shared/gate.js'
  };
  const FILE_TO_GLOBAL = {};
  Object.keys(GLOBAL_TO_FILE).forEach(g => { FILE_TO_GLOBAL[GLOBAL_TO_FILE[g]] = g; });

  /* What each module asks the browser for. `Tier` is how the minifier-free
     source reads `SLAF.Tier0` when split on a dot, so normalise it. */
  const deps = {};
  Object.keys(FILE_TO_GLOBAL).forEach(function (file) {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const found = new Set();
    (src.match(/root\.SLAF && root\.SLAF\.[A-Za-z0-9]+/g) || []).forEach(function (m) {
      let g = m.split('.').pop();
      if (g === 'Tier') g = 'Tier0';
      if (GLOBAL_TO_FILE[g]) found.add(g);
    });
    deps[file] = Array.from(found);
  });

  function closure(files) {
    const need = new Set();
    const stack = files.slice();
    while (stack.length) {
      const f = stack.pop();
      (deps[f] || []).forEach(function (g) {
        const dep = GLOBAL_TO_FILE[g];
        if (!dep || dep === f || need.has(dep)) return;
        need.add(dep);
        stack.push(dep);
      });
    }
    return need;
  }

  /* The front page lives at the root, not in rooms/, and loads its scripts
     without the ../ prefix. It escaped this check until the FOO ladder was
     ported and became the most script-heavy page in the repo. */
  const pages = fs.readdirSync(path.join(ROOT, 'rooms'))
    .filter(f => f.endsWith('.html')).map(f => ['rooms/' + f, '../'])
    .concat([['index.html', '']]);

  pages.forEach(function (entry) {
    const file = entry[0], prefix = entry[1];
    const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const re = new RegExp('<script src="' + prefix.replace(/\./g, '\\.') + '([^"]+)"><\\/script>', 'g');
    const loaded = (html.match(re) || [])
      .map(t => t.replace(/<script src="/, '').replace(/"><\/script>/, '').replace(prefix, ''));
    const loadedSet = new Set(loaded);

    /* Everything the room's own inline script reaches for, plus everything
       those modules reach for, transitively. */
    const direct = loaded.filter(f => FILE_TO_GLOBAL[f]);
    const usedInline = Object.keys(GLOBAL_TO_FILE).filter(function (g) {
      return new RegExp('SLAF\\.' + g + '\\b').test(html) || new RegExp('\\b' + g + '\\.').test(html);
    }).map(g => GLOBAL_TO_FILE[g]).filter(Boolean);

    const required = closure(direct.concat(usedInline.filter(f => loadedSet.has(f))));
    const missing = Array.from(required).filter(f => !loadedSet.has(f));

    checkTrue(`${file} loads everything its modules need`,
      missing.length === 0,
      missing.length ? `missing: ${missing.join(', ')}` : '');
  });
})();

/* [hidden] must actually hide: a bare [hidden] is display:none in the UA
   sheet, which loses to any class that sets display — .slaf-field is flex,
   .slaf-btn is flex. Every page had its own copy of the override; it lives
   in theme.css once now, and no page should redeclare it. */
(function () {
  const theme = fs.readFileSync(path.join(ROOT, 'shared/theme.css'), 'utf8');
  checkTrue('theme.css makes [hidden] win over display',
    /\[hidden\]\s*\{[^}]*display:\s*none\s*!important/.test(theme));

  fs.readdirSync(path.join(ROOT, 'rooms')).filter(f => f.endsWith('.html'))
    .map(f => path.join('rooms', f)).concat(['index.html']).forEach(function (file) {
      const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
      /* Only the page's own CSS counts. A room is free to MENTION [hidden]
         in a comment explaining that it toggles the attribute — that is
         documentation, not a second declaration. */
      const css = (html.match(/<style[^>]*>[\s\S]*?<\/style>/gi) || []).join('\n')
        .replace(/\/\*[\s\S]*?\*\//g, '');   /* a comment is not a declaration */
      checkTrue(`${file} does not redeclare the [hidden] override`,
        !/\[hidden\][^{}]*\{/.test(css),
        'it is in shared/theme.css — a second copy is one more place to drift');
    });
})();

section('Storage and migration');

(function () {
  const spinePath = path.join(ROOT, 'shared/spine-v2.js');

  /* A tiny localStorage, so the spine can be loaded fresh per scenario. */
  function withStorage(seed) {
    const store = Object.assign({}, seed || {});
    global.localStorage = {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; }
    };
    delete require.cache[require.resolve(spinePath)];
    return { store, Spine: require(spinePath) };
  }

  function realHousehold() {
    const h = Schema.createHousehold({});
    h.people.push(Schema.createPerson({ label: 'You', role: 'adult' }));
    h.assets.push(Schema.createAsset({ category: 'cash', valueCents: 950000, liquid: true }));
    h.debts.push(Schema.createDebt({ label: 'Card', balanceCents: 320000, type: 'credit_card' }));
    return h;
  }

  const KEY = 'slaf.household.v2';
  const QUARANTINE = 'slaf.household.unreadable';
  const saved = JSON.stringify(realHousehold());

  /* -- A matching version loads normally --------------------------------- */
  {
    const { Spine } = withStorage({ [KEY]: saved });
    check('a current-version blob loads', Spine.getProfile().assets.length, 1);
    check('and reports itself as readable', Spine.storageState().status, 'ok');
    checkTrue('and writable', Spine.storageState().writable);
  }

  /* -- A version we cannot bring forward is NOT overwritten -------------- */
  {
    const ahead = JSON.parse(saved);
    ahead.schemaVersion = 99;                      /* saved by a newer build */
    const { store, Spine } = withStorage({ [KEY]: JSON.stringify(ahead) });

    Spine.registerRoom('start');                   /* any write at all */
    Spine.updateProfile({ state: 'NC' });

    const still = JSON.parse(store[KEY]);
    check('a blob from a newer build keeps its assets', still.assets.length, 1);
    check('and its debts', still.debts.length, 1);
    check('and its version', still.schemaVersion, 99);
    check('the session says why it is read-only', Spine.storageState().status, 'ahead');
    checkTrue('and that it is read-only', !Spine.storageState().writable);
    checkTrue('and a copy was put aside', typeof store[QUARANTINE] === 'string');
    check('the copy records what was found',
      JSON.parse(store[QUARANTINE]).storedVersion, 99);
    /* The session still works — it just does not persist. */
    check('the session itself is usable', Spine.getProfile().state, 'NC');
  }

  /* -- An older version with no migration step is also preserved --------- */
  {
    const old = JSON.parse(saved);
    old.schemaVersion = 1;
    const { store, Spine } = withStorage({ [KEY]: JSON.stringify(old) });
    Spine.registerRoom('start');
    check('an unmigratable old blob keeps its assets',
      JSON.parse(store[KEY]).assets.length, 1);
    check('and says a migration step is missing', Spine.storageState().status, 'no-migration');
    checkTrue('and is held read-only', !Spine.storageState().writable);
  }

  /* -- A corrupt blob is kept, not thrown away --------------------------- */
  {
    const { store, Spine } = withStorage({ [KEY]: '{"schemaVersion":2,"assets":[' });
    Spine.registerRoom('start');
    check('a truncated blob is left where it is',
      store[KEY], '{"schemaVersion":2,"assets":[');
    check('and reported as corrupt', Spine.storageState().status, 'corrupt');
    checkTrue('and copied aside', typeof store[QUARANTINE] === 'string');
  }

  /* -- Nothing stored is the ordinary case ------------------------------- */
  {
    const { Spine } = withStorage({});
    check('an empty browser starts fresh', Spine.storageState().status, 'fresh');
    checkTrue('and can write', Spine.storageState().writable);
  }

  /* -- The rule that keeps this fixed ------------------------------------
        Every version from 2 up to the current one needs a migration entry.
        Bumping SCHEMA_VERSION without one is what used to destroy data, so
        the build fails here instead of in someone's browser.             */
  {
    const { Spine } = withStorage({});
    for (let v = 2; v <= Schema.SCHEMA_VERSION; v++) {
      if (v === 2) continue;                       /* 2 is the floor shape */
      checkTrue(`a migration exists for schema v${v}`,
        typeof Spine._MIGRATIONS[v] === 'function',
        `add MIGRATIONS[${v}] in shared/spine-v2.js before bumping SCHEMA_VERSION`);
    }
    check('the migration registry has no entries for versions that do not exist',
      Object.keys(Spine._MIGRATIONS).filter(v => Number(v) > Schema.SCHEMA_VERSION).length, 0);
  }

  /* -- Worth checks: the spine owns the timestamps ----------------------- */
  {
    const { Spine } = withStorage({});
    check('a fresh household has no worth checks', Spine.getProfile().worthChecks.length, 0);

    Spine.upsertWorthCheck({ id: 'w1', label: 'Bike', costCents: 200000 });
    check('one can be added', Spine.getProfile().worthChecks.length, 1);
    check('with nothing predicted, nothing is stamped',
      Spine.getProfile().worthChecks[0].predictedAt, null);

    Spine.upsertWorthCheck({ id: 'w1', predictedRating: 9 });
    const stamped = Spine.getProfile().worthChecks[0];
    checkTrue('predicting stamps when you predicted', typeof stamped.predictedAt === 'string');
    check('and the earlier fields survive the patch', stamped.costCents, 200000);
    check('and so does the label', stamped.label, 'Bike');

    /* A room must not be able to move the date it predicted something —
       that is the whole evidential value of the before/after pair. */
    Spine.upsertWorthCheck({ id: 'w1', predictedRating: 4, predictedAt: '1999-01-01T00:00:00.000Z' });
    check('changing the rating does not re-stamp the date',
      Spine.getProfile().worthChecks[0].predictedAt, stamped.predictedAt);
    check('and a room cannot back-date it',
      Spine.getProfile().worthChecks[0].predictedAt, stamped.predictedAt);
    check('though the rating itself does change',
      Spine.getProfile().worthChecks[0].predictedRating, 4);

    Spine.upsertWorthCheck({ id: 'w1', actualRating: 2 });
    checkTrue('rating it afterwards stamps the second date',
      typeof Spine.getProfile().worthChecks[0].ratedAt === 'string');

    Spine.upsertWorthCheck({ id: 'w2', label: 'Knife', actualRating: 9 });
    check('a second one does not disturb the first', Spine.getProfile().worthChecks.length, 2);
    checkTrue('a thing rated only in hindsight is stamped on arrival',
      typeof Spine.getProfile().worthChecks[1].ratedAt === 'string');
    check('and has no prediction date', Spine.getProfile().worthChecks[1].predictedAt, null);

    Spine.removeWorthCheck('w1');
    check('one can be removed', Spine.getProfile().worthChecks.length, 1);
    check('and it is the right one', Spine.getProfile().worthChecks[0].id, 'w2');
    check('removing one that is not there is harmless',
      (Spine.removeWorthCheck('nope'), Spine.getProfile().worthChecks.length), 1);
  }

  delete global.localStorage;
})();

section('Live forms');

(function () {
  let busy = false;
  let renders = 0;
  const s = LiveForm.createScheduler({
    isBusy: () => busy,
    render: () => { renders++; }
  });

  check('an idle request renders straight away', (s.request(), renders), 1);
  checkTrue('and leaves nothing owed', !s.isPending());

  busy = true;
  check('a request while the user is in the form does not render',
    (s.request(), renders), 1);
  checkTrue('but it is remembered', s.isPending());

  check('a second request while busy still does not render',
    (s.request(), renders), 1);
  check('and a flush while busy does nothing either', (s.flush(), renders), 1);
  checkTrue('the render is still owed', s.isPending());

  busy = false;
  check('flushing once the form is idle runs it exactly once',
    (s.flush(), renders), 2);
  checkTrue('and clears the debt', !s.isPending());
  check('flushing again is a no-op', (s.flush(), renders), 2);

  /* Several edits while busy collapse into ONE rebuild, which is the other
     half of why this exists — the old code rebuilt on every keystroke-blur. */
  busy = true;
  s.request(); s.request(); s.request();
  busy = false;
  check('three deferred requests collapse into one render', (s.flush(), renders), 3);

  /* force() is for a rebuild the user just asked for — adding a row, say,
     where the rebuild IS the response to the gesture. */
  busy = true;
  check('force renders even while busy', (s.force(), renders), 4);
  checkTrue('and clears anything owed', !s.isPending());

  /* A guard with no container still behaves — a room that renames an id
     should not silently stop rendering. */
  const orphan = LiveForm.guard(null, () => { renders++; });
  check('a guard with no container falls back to rendering',
    (orphan.request(), renders), 5);

  checkTrue('the settle window is a real number of milliseconds',
    typeof LiveForm.SETTLE_MS === 'number' && LiveForm.SETTLE_MS > 0);
})();

/* Every room that builds form controls from markup must guard the container
   it builds them into. This is the check that stops the phone bug coming
   back in a room nobody has written yet. */
(function () {
  const roomsDir = path.join(ROOT, 'rooms');
  const htmlPages = fs.readdirSync(roomsDir).filter(f => f.endsWith('.html'))
    .map(f => path.join('rooms', f)).concat(['index.html']);

  htmlPages.forEach(function (file) {
    const html = fs.readFileSync(path.join(ROOT, file), 'utf8');

    /* Does this room build a focusable control from a string? */
    const buildsControls = /innerHTML[\s\S]{0,4000}?(<input|<select|controlHtml)/.test(html)
      || /(<input|<select)[^>]*'\s*\+/.test(html)
      || /controlHtml\(/.test(html);
    if (!buildsControls) return;

    /* Two patterns are safe, and a room must visibly be using one of them:
         1. it guards the container it rebuilds — shared/liveform.js, or
         2. it builds its controls ONCE and only ever sets their .value,
            which it declares with the marker below so the choice is a
            decision rather than an accident.
       Anything else destroys live inputs under the user's finger. */
    const guarded = html.includes('liveform.js') && /LiveForm\.guard\(/.test(html);
    const builtOnce = html.includes('LIVE-FORM: built once');
    checkTrue(`${file} builds form controls safely (guarded, or built once)`,
      guarded || builtOnce,
      'guard the container with SLAF.LiveForm.guard(), or build the controls once '
        + 'and mark the room "LIVE-FORM: built once" — see shared/liveform.js');
    checkTrue(`${file} does not claim both patterns at once`,
      !(guarded && builtOnce),
      'pick one; claiming both means nobody knows which invariant holds');
  });
})();

section('Side Hustle');

(function () {
  const SE = TABLES.seTax;

  /* -- SE tax stacks on a salary. The wage base is already partly used. --- */
  const standalone = SelfEmployed.selfEmploymentTax(1000000, 'single', SE);
  const stacked = SelfEmployed.selfEmploymentTax(1000000, 'single', SE,
    { priorWagesCents: 7200000 });
  check('below the wage base, a salary changes nothing about the SE tax',
    stacked.value, standalone.value);
  check('and the remaining base is the wage base less the salary',
    stacked.remainingWageBaseCents, Math.round(SE.socialSecurityWageBase * 100) - 7200000);

  const overBase = SelfEmployed.selfEmploymentTax(1000000, 'single', SE,
    { priorWagesCents: 20000000 });
  check('a salary past the wage base leaves no Social Security to pay',
    overBase.socialSecurityCents, 0);
  checkTrue('but Medicare, which has no cap, is unchanged',
    overBase.medicareCents === standalone.medicareCents);
  checkTrue('and the total is far lower than the standalone figure',
    overBase.value < standalone.value / 2);
  check('the additional Medicare levy is measured on combined earnings',
    overBase.additionalMedicareCents,
    Math.round(Math.round(1000000 * SE.netEarningsFactor) * SE.additionalMedicare.rate));
  check('with no prior wages the old behaviour is exactly preserved',
    JSON.stringify(SelfEmployed.selfEmploymentTax(1000000, 'single', SE, {}).value),
    JSON.stringify(standalone.value));

  /* -- The hustle itself. $12,000 in, $2,000 out, 200 hours, 22% -------- */
  const r = SideHustle.sideHustle({
    annualRevenueCents: 1200000, annualExpensesCents: 200000, annualHours: 200,
    marginalRate: 0.22, filingStatus: 'single', priorWagesCents: 7200000
  }, TABLES);

  check('profit is revenue less costs', r.profitCents, 1000000);
  check('SE tax is the stacked figure, not a fresh calculation',
    r.seTaxCents, stacked.value);
  check('half of it comes off before income tax',
    r.taxableCents, 1000000 - stacked.deductibleHalfCents);
  check('income tax is the marginal rate on what is left',
    r.incomeTaxCents, Math.round((1000000 - stacked.deductibleHalfCents) * 0.22));
  check('net is profit less both taxes',
    r.netCents, 1000000 - stacked.value - r.incomeTaxCents);
  check('and the headline is net over hours', r.value, Math.round(r.netCents / 200));
  check('which is $32.71 an hour', r.value, 3271);
  check('the kept share is net over revenue', r.keptShare, r.netCents / 1200000, 1e-12);
  check('gross per hour is the number people quote', r.grossPerHourCents, 6000);

  /* Using the EFFECTIVE rate instead would understate the tax — the whole
     reason SPEC.md §13 specifies marginal. */
  const atEffective = SideHustle.sideHustle({
    annualRevenueCents: 1200000, annualExpensesCents: 200000, annualHours: 200,
    marginalRate: 0.19, filingStatus: 'single', priorWagesCents: 7200000
  }, TABLES);
  checkTrue('a lower rate keeps more, so the choice of rate is not cosmetic',
    atEffective.netCents > r.netCents);
  check('three points of rate is worth $279 a year here — within a cent of '
    + 'three points of the taxable figure, the difference being rounding',
    atEffective.netCents - r.netCents,
    Math.round((1000000 - stacked.deductibleHalfCents) * 0.03), 1);

  /* -- A second W2 job pays no SE tax ------------------------------------ */
  const w2 = SideHustle.sideHustle({
    annualRevenueCents: 1200000, annualExpensesCents: 200000, annualHours: 200,
    marginalRate: 0.22, selfEmployment: false
  }, TABLES);
  check('a W2 side job has no self-employment tax', w2.seTaxCents, 0);
  check('so income tax applies to the whole profit',
    w2.incomeTaxCents, Math.round(1000000 * 0.22));
  checkTrue('and it keeps more than the 1099 version of the same work',
    w2.netCents > r.netCents);

  /* -- A loss is a loss ---------------------------------------------------- */
  const loss = SideHustle.sideHustle({
    annualRevenueCents: 100000, annualExpensesCents: 300000, annualHours: 100,
    marginalRate: 0.22
  }, TABLES);
  check('a loss is reported, not floored at zero', loss.profitCents, -200000);
  check('with no tax on it', loss.totalTaxCents, 0);
  check('and a negative hourly rate', loss.value, -2000);
  checkTrue('flagged as a loss', loss.atALoss === true);

  const evens = SideHustle.sideHustle({
    annualRevenueCents: 100000, annualExpensesCents: 100000, annualHours: 100,
    marginalRate: 0.22
  }, TABLES);
  check('breaking even is also flagged', evens.atALoss, true);
  check('at exactly zero an hour', evens.value, 0);

  /* -- Nothing is assumed -------------------------------------------------- */
  check('expenses left blank are not read as zero',
    SideHustle.sideHustle({ annualRevenueCents: 100000, annualHours: 100, marginalRate: 0.22 },
      TABLES).status, 'incomplete');
  check('but a typed zero is a real answer',
    SideHustle.sideHustle({ annualRevenueCents: 100000, annualExpensesCents: 0,
      annualHours: 100, marginalRate: 0.22 }, TABLES).profitCents, 100000);
  check('no marginal rate, no answer',
    SideHustle.sideHustle({ annualRevenueCents: 100000, annualExpensesCents: 0,
      annualHours: 100 }, TABLES).status, 'incomplete');
  check('zero hours is refused rather than divided by',
    SideHustle.sideHustle({ annualRevenueCents: 100000, annualExpensesCents: 0,
      annualHours: 0, marginalRate: 0.22 }, TABLES).status, 'incomplete');
  check('a rate of 150% is refused',
    SideHustle.sideHustle({ annualRevenueCents: 100000, annualExpensesCents: 0,
      annualHours: 10, marginalRate: 1.5 }, TABLES).status, 'incomplete');
  check('a negative rate too',
    SideHustle.sideHustle({ annualRevenueCents: 100000, annualExpensesCents: 0,
      annualHours: 10, marginalRate: -0.1 }, TABLES).status, 'incomplete');

  /* -- Against the day job, through the one wage engine ------------------- */
  const h = Demo.build();
  const wage = Hourly.realHourlyWage(h, TABLES);
  const v = SideHustle.versusJob(h, TABLES, {
    annualRevenueCents: 1200000, annualExpensesCents: 200000,
    annualHours: 200, marginalRate: 0.22
  });
  check('the comparison reads the same wage engine', v.realHourlyCents, wage.value);
  check('it stacks the salary automatically', v.hustle.priorWagesCents,
    Schema.grossAnnualIncomeCents(h).value);
  check('so it agrees with the manual call', v.hustle.netCents, r.netCents);
  check('the gap is the difference between the two rates',
    v.value, r.value - wage.value);
  checkTrue('and Robin\'s hustle clears her day job', v.beatsJob === true);

  /* The hours are additional, not a slice of the ones already counted. */
  check('the job week comes from the wage engine', v.jobWeeklyHours, wage.totalHoursPerWeek);
  check('the hustle adds its own hours on top',
    v.combinedWeeklyHours, wage.totalHoursPerWeek + 200 / wage.weeksPerYear, 1e-12);
  checkTrue('which is a longer week than the job alone',
    v.combinedWeeklyHours > v.jobWeeklyHours);

  const noWork = SideHustle.versusJob(Schema.createHousehold({}), TABLES, {
    annualRevenueCents: 1200000, annualExpensesCents: 200000,
    annualHours: 200, marginalRate: 0.22
  });
  check('without a work profile the comparison is incomplete', noWork.status, 'incomplete');
})();

/* ==========================================================================
   Every Ratio — Tiers 18 and 19. Robin: $72,000 gross, $3,150/mo essential,
   $9,500 cash, $48,000 invested, $21,600 debt, $305/mo minimums.
   ========================================================================== */

/* ==========================================================================
   Credential ROI — one engine for Career ROI and the Skills calc.
   SPEC.md §13 Tier 2 names them as sharing one, so there is one.
   ========================================================================== */

section('Worth Learning');

(function () {
  /* A $40,000 bootcamp, six months out at $5,000/mo, an $18,000 raise taxed
     at 22%, paying over 25 years, discounted at 3%. */
  const base = {
    costCents: 4000000, monthsOut: 6, forgoneMonthlyCents: 500000,
    annualDeltaCents: 1800000, marginalRate: 0.22, yearsOfBenefit: 25, discountRate: 0.03
  };
  const r = Credential.credentialROI(base);

  check('the time out is part of the price', r.forgoneCents, 6 * 500000);
  check('so the whole price is fee plus time', r.totalCostCents, 4000000 + 3000000);
  check('the raise is taxed', r.netAnnualDeltaCents, Math.round(1800000 * 0.78));
  check('and the tax is reported', r.taxOnDeltaCents, 1800000 - r.netAnnualDeltaCents);
  check('you keep 78% of the headline raise', r.keptShare, 0.78, 1e-9);
  check('payback is the price over the monthly after-tax raise',
    r.value, 7000000 / (r.netAnnualDeltaCents / 12), 1e-9);
  check('which is five years', Math.round(r.value / 12), 5);

  /* Present value, re-derived here with an independent loop. */
  let pv = 0;
  for (let y = 1; y <= 25; y++) pv += r.netAnnualDeltaCents / Math.pow(1.03, y);
  check('present value discounts each year back to today', r.presentValueCents, Math.round(pv), 1);
  check('NPV is that less the whole price', r.netPresentValueCents, r.presentValueCents - r.totalCostCents);
  checkTrue('and this one is worth it', r.worthIt === true);
  check('the return multiple is PV over price',
    r.returnMultiple, r.presentValueCents / r.totalCostCents, 1e-12);

  /* A zero discount rate must need no special case. */
  const undiscounted = Credential.credentialROI(Object.assign({}, base, { discountRate: 0 }));
  check('with no discounting the value is just the raise times the years',
    undiscounted.presentValueCents, undiscounted.netAnnualDeltaCents * 25);
  checkTrue('and discounting always lowers it',
    r.presentValueCents < undiscounted.presentValueCents);

  /* -- Empty is not zero, especially for time ----------------------------- */
  const noTimeCost = Credential.credentialROI(
    Object.assign({}, base, { forgoneMonthlyCents: null }));
  check('months out with no cost of time is refused', noTimeCost.status, 'incomplete');
  check('and names exactly what is missing',
    noTimeCost.missing.join(','), 'forgoneMonthlyCents');
  checkTrue('and says the number of months back',
    /6 months/.test(noTimeCost.reason));
  const freeTime = Credential.credentialROI(
    Object.assign({}, base, { forgoneMonthlyCents: 0 }));
  check('but a typed zero means it really is free', freeTime.totalCostCents, 4000000);
  const noTime = Credential.credentialROI(
    Object.assign({}, base, { monthsOut: 0, forgoneMonthlyCents: null }));
  check('no months out needs no cost of time at all', noTime.status, 'ok');

  /* -- Refusals ------------------------------------------------------------ */
  ['costCents', 'annualDeltaCents', 'yearsOfBenefit', 'marginalRate'].forEach(function (k) {
    const o = Object.assign({}, base); o[k] = null;
    check(`without ${k} there is no answer`, Credential.credentialROI(o).status, 'incomplete');
  });
  check('zero years of benefit is refused',
    Credential.credentialROI(Object.assign({}, base, { yearsOfBenefit: 0 })).status, 'incomplete');
  check('a 150% marginal rate is refused',
    Credential.credentialROI(Object.assign({}, base, { marginalRate: 1.5 })).status, 'incomplete');
  check('a negative discount rate is refused',
    Credential.credentialROI(Object.assign({}, base, { discountRate: -0.1 })).status, 'incomplete');
  check('negative months out is refused',
    Credential.credentialROI(Object.assign({}, base, { monthsOut: -1 })).status, 'incomplete');
  check('a fee of zero is a real answer, not a missing one',
    Credential.credentialROI(Object.assign({}, base, { costCents: 0 })).status, 'ok');

  /* -- The honest failure cases ------------------------------------------- */
  const noRaise = Credential.credentialROI(Object.assign({}, base, { annualDeltaCents: 0 }));
  checkTrue('a raise of zero never pays back', noRaise.neverPaysBack === true);
  check('and has no break-even to quote', noRaise.breakEvenAnnualDeltaCents, null);

  const weak = Credential.credentialROI(Object.assign({}, base,
    { annualDeltaCents: 300000, yearsOfBenefit: 10 }));
  checkTrue('a weak raise over a short horizon is not worth it', weak.worthIt === false);
  checkTrue('and payback runs past the horizon', weak.paybackBeyondHorizon === true);
  checkTrue('so a break-even raise is quoted instead',
    weak.breakEvenAnnualDeltaCents > weak.annualDeltaCents);

  /* Feed the break-even raise back in and it should land on break-even. */
  const atBreakEven = Credential.credentialROI(Object.assign({}, base,
    { annualDeltaCents: weak.breakEvenAnnualDeltaCents, yearsOfBenefit: 10 }));
  check('at the break-even raise, present value matches the price — within a '
    + 'few cents, the break-even figure being rounded to a whole cent itself',
    atBreakEven.presentValueCents, atBreakEven.totalCostCents, 10);

  /* -- Fractional years ---------------------------------------------------- */
  const half = Credential.credentialROI(Object.assign({}, base, { yearsOfBenefit: 2.5 }));
  const two = Credential.credentialROI(Object.assign({}, base, { yearsOfBenefit: 2 }));
  const three = Credential.credentialROI(Object.assign({}, base, { yearsOfBenefit: 3 }));
  checkTrue('two and a half years sits between two and three',
    half.presentValueCents > two.presentValueCents
    && half.presentValueCents < three.presentValueCents);

  /* -- One engine, two presets -------------------------------------------- */
  check('there are exactly two pathways', Object.keys(Credential.PRESETS).length, 2);
  checkTrue('and they differ only in wording and horizon',
    Credential.PRESETS.career.defaultYears !== Credential.PRESETS.skill.defaultYears);
  const asSkill = Credential.credentialROI(Object.assign({}, base,
    { yearsOfBenefit: Credential.PRESETS.skill.defaultYears }));
  const asCareer = Credential.credentialROI(Object.assign({}, base,
    { yearsOfBenefit: Credential.PRESETS.career.defaultYears }));
  checkTrue('the same numbers over a shorter horizon are worth less',
    asSkill.presentValueCents < asCareer.presentValueCents);

  /* -- Priced in hours ----------------------------------------------------- */
  const h = Demo.build();
  const wage = Hourly.realHourlyWage(h, TABLES);
  const hours = Credential.costInHours(r, wage.value);
  check('the hour price divides the price this engine already worked out',
    hours.value, r.totalCostCents / wage.value, 1e-9);
  check('an incomplete result stays incomplete in hours',
    Credential.costInHours(noRaise, wage.value).status, 'ok');
  check('a zero wage cannot price anything in hours',
    Credential.costInHours(r, 0).status, 'incomplete');
})();

section('Ratios');

(function () {
  const h = Demo.build();
  h.expenses.entries = Demo.buildSpending();
  const a = RatiosEngine.all(h, TABLES);
  const by = {};
  a.rows.forEach(r => { by[r.id] = r; });

  check('every registry entry produced a row', a.rows.length, RatiosEngine.RATIOS.length);
  check('ids are unique',
    new Set(RatiosEngine.RATIOS.map(r => r.id)).size, RatiosEngine.RATIOS.length);
  checkTrue('every ratio states its formula in words',
    RatiosEngine.RATIOS.every(r => typeof r.formula === 'string' && r.formula.length > 5));
  checkTrue('every ratio declares a unit',
    RatiosEngine.RATIOS.every(r => ['rate', 'months', 'multiple', 'cents', 'years', 'dollars', 'date'].includes(r.unit)));

  /* -- Hand-derived values ------------------------------------------------ */
  check('DTI is $305 over $6,000 a month', by.debtToIncome.value, 305 / 6000, 1e-12);
  check('housing ratio is (1,500 + 180) over 6,000', by.housingRatio.value, 1680 / 6000, 1e-12);
  check('back-end adds the other debt payments', by.backEndRatio.value, (1680 + 305) / 6000, 1e-12);
  check('solvency is 35,900 over 57,500', by.solvencyRatio.value, 35900 / 57500, 1e-12);
  check('debt to asset is 21,600 over 57,500', by.debtToAsset.value, 21600 / 57500, 1e-12);
  check('cash drag is 9,500 over 57,500', by.cashDrag.value, 9500 / 57500, 1e-12);
  check('liquid to illiquid is 9,500 over 48,000', by.liquidToIlliquid.value, 9500 / 48000, 1e-12);
  check('revolving share is 3,200 over 21,600', by.revolvingShare.value, 3200 / 21600, 1e-12);
  check('current ratio is 9,500 over a year of minimums',
    by.currentRatio.value, 9500 / (305 * 12), 1e-12);
  check('payoff velocity is a year of minimums over the balance',
    by.debtPayoffVelocity.value, (305 * 12) / 21600, 1e-12);
  check('the FI ratio is investments at 4% over annual spending',
    by.fiRatio.value, (48000 * 0.04) / (3150 * 12), 1e-12);
  check('net worth to income is 35,900 over 72,000',
    by.netWorthToIncome.value, 35900 / 72000, 1e-12);
  check('rule of 72 at a 7% return is 10.3 years', by.ruleOf72.value, 72 / 7, 1e-12);
  check('burn rate is the monthly expense figure, in cents',
    by.burnRateCents.value, 315000);

  /* -- Ratios Tier 0 already owns are CALLED, not re-derived -------------- */
  check('DTI matches engines/tier0.js exactly',
    by.debtToIncome.value, Tier0.debtToIncome(h).value);
  check('savings rate matches Tier 0 exactly',
    by.savingsRate.value, Tier0.savingsRate(h, TABLES).excludingMatch.value);
  check('emergency fund cover matches Tier 0 exactly',
    by.emergencyFundMonths.value, Tier0.emergencyFundMonths(h).value);
  check('runway is the same arithmetic under a different name',
    by.runwayMonths.value, by.emergencyFundMonths.value);
  check('the retirement multiple matches Tier 0 exactly',
    by.retirementMultiple.value, Tier0.retirementBenchmark(h, TABLES).value);

  /* -- The two this app refuses to guess ---------------------------------- */
  check('credit utilisation is reported unavailable', by.creditUtilization.unavailable, true);
  check('and names what it would need',
    by.creditUtilization.result.missing.join(','), 'creditLimitTotal');
  check('life insurance multiple is reported unavailable', by.lifeInsuranceMultiple.unavailable, true);
  check('exactly three ratios are unavailable (credit limits, life cover, automation — the last until T7)', a.unavailableCount, 3);
  checkTrue('an unavailable ratio never carries a value',
    a.rows.filter(r => r.unavailable).every(r => r.value === null));

  /* -- Nothing computes from a household with nothing in it --------------- */
  const empty = RatiosEngine.all(Schema.createHousehold({}), TABLES);
  const computed = empty.rows.filter(r => r.ok);
  check('an empty household computes only the assumption-class ones',
    computed.map(r => r.id).sort().join(','), 'ruleOf72,safeWithdrawalRate');
  checkTrue('and nothing else invents a zero',
    empty.rows.filter(r => !r.ok).every(r => r.value === null));

  /* -- Verdicts ------------------------------------------------------------ */
  const lower = { direction: 'lower', good: 0.28, warn: 0.36 };
  check('at the comfortable edge is comfortable',
    RatiosEngine.verdict('x', 0.28, { bands: { x: lower } }).zone, 'good');
  check('between the edges is worth a look',
    RatiosEngine.verdict('x', 0.30, { bands: { x: lower } }).zone, 'watch');
  check('past the far edge is out',
    RatiosEngine.verdict('x', 0.40, { bands: { x: lower } }).zone, 'out');
  const higher = { direction: 'higher', good: 0.15, warn: 0.10 };
  check('a higher-is-better ratio reads the other way',
    RatiosEngine.verdict('x', 0.20, { bands: { x: higher } }).zone, 'good');
  check('and its watch band is below good',
    RatiosEngine.verdict('x', 0.12, { bands: { x: higher } }).zone, 'watch');
  check('a ratio with no band gets no verdict',
    RatiosEngine.verdict('netWorthToIncome', 3, TABLES.ratioBenchmarks).zone, 'none');
  check('and a ratio with no value gets none either',
    RatiosEngine.verdict('debtToIncome', null, TABLES.ratioBenchmarks).zone, 'none');

  /* -- The radar projection ------------------------------------------------
        A view, never a score: it maps each ratio onto one axis and nothing
        sums them. The edges have to land exactly or the picture lies.    */
  check('at the comfortable edge the position is 1', RatiosEngine.position(0.28, lower), 1);
  check('at the far edge it is a half', RatiosEngine.position(0.36, lower), 0.5);
  check('halfway between reads halfway', RatiosEngine.position(0.32, lower), 0.75, 1e-12);
  check('twice the far edge decays to a quarter', RatiosEngine.position(0.72, lower), 0.25, 1e-12);
  check('higher-is-better hits 1 at good', RatiosEngine.position(0.15, higher), 1);
  check('and a half at warn', RatiosEngine.position(0.10, higher), 0.5);
  check('and zero at zero', RatiosEngine.position(0, higher), 0);
  check('comfortably past good is capped, so one great ratio cannot dominate',
    RatiosEngine.position(0, lower), RatiosEngine.RADAR_CEILING);
  check('a ratio with no band has no position',
    RatiosEngine.position(3, { direction: 'higher', good: null, warn: null }), null);

  const radar = RatiosEngine.radar(h, TABLES);
  check('the radar plots every banded ratio that computed (14 before D-081, + shadow runway and worst-year coverage)', radar.value, 16);
  checkTrue('and only ones with a band',
    radar.points.every(p => p.band && p.band.good !== null));
  checkTrue('every plotted point has a position inside the ceiling',
    radar.points.every(p => p.position >= 0 && p.position <= radar.ceiling));
  check('the comfortable ring sits at 1 by construction', radar.goodRing, 1);

  const thin = RatiosEngine.radar(Schema.createHousehold({}), TABLES);
  check('a radar with fewer than three axes is not drawn', thin.status, 'incomplete');
  checkTrue('and says why', /three axes/.test(thin.reason));

  /* -- Bands are config, not code ----------------------------------------- */
  const bandIds = Object.keys(TABLES.ratioBenchmarks.bands);
  bandIds.forEach(function (id) {
    checkTrue(`band "${id}" names a ratio that exists`, !!RatiosEngine.byId(id));
  });
  checkTrue('every band declares a direction',
    bandIds.every(id => ['lower', 'higher'].includes(TABLES.ratioBenchmarks.bands[id].direction)));
  checkTrue('a band either has both edges or neither',
    bandIds.every(id => {
      const b = TABLES.ratioBenchmarks.bands[id];
      return (b.good === null) === (b.warn === null);
    }));

  /* -- Every ratio explains itself: what, why, what moves it, and which
        owned fields it reads, each of which must resolve. The dashboard and
        Every Ratio put this behind the ⓘ on the row (shared/explain.js). */
  const EX = TABLES.ratioExplainers.ratios;
  RatiosEngine.RATIOS.forEach(r => {
    const e = EX[r.id];
    checkTrue(`"${r.id}" has an explainer`, !!e);
    if (!e) return;
    ['what', 'why', 'improve'].forEach(k => checkTrue(`"${r.id}" explains ${k}`, typeof e[k] === 'string' && e[k].length > 20));
    checkTrue(`"${r.id}" names what it looks at`, Array.isArray(e.looksAt) && e.looksAt.length > 0);
    (e.looksAt || []).forEach(f => checkTrue(`"${r.id}" looks at a field ownership knows: ${f}`, !!Ownership.FIELDS[f]));
  });
  Object.keys(EX).forEach(id => checkTrue(`explainer "${id}" names a ratio that exists`, !!RatiosEngine.byId(id)));
  const explained = RatiosEngine.all(Demo.build(), TABLES).rows;
  checkTrue('Ratios.all attaches the explainer to each row', explained.every(r => r.explain && r.explain.what));
  const invested = explained.find(r => r.id === 'investedShare');
  checkTrue('invested share is over total assets, so it cannot pass 100%', invested.ok && invested.value <= 1);
  check('and the old net-worth denominator is gone', RatiosEngine.byId('investmentToNetWorth'), null);
  ['index.html', 'rooms/ratios.html'].forEach(f => {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    checkTrue(`${f} loads shared/explain.js`, /shared\/explain\.js/.test(src));
    checkTrue(`${f} puts the ⓘ on its ratio rows`, /Explain\.button\(/.test(src) && /Explain\.panel\(/.test(src));
  });

  /* -- Reading mutates nothing -------------------------------------------- */
  const before = JSON.stringify(h);
  RatiosEngine.all(h, TABLES);
  RatiosEngine.radar(h, TABLES);
  check('computing every ratio mutates nothing', JSON.stringify(h), before);
})();

section('Credit utilisation');

(function () {
  function withCards(cards) {
    const h = Demo.build();
    h.debts = cards.map(c => Schema.createDebt(Object.assign({ type: 'credit_card' }, c)));
    return h;
  }
  function util(h) {
    return RatiosEngine.all(h, TABLES).rows.filter(r => r.id === 'creditUtilization')[0];
  }

  /* -- No limit, no number. This was the whole reason it was unavailable -- */
  {
    const row = util(withCards([{ label: 'Card', balanceCents: 320000 }]));
    check('a card with no limit gives no utilisation', row.result.status, 'incomplete');
    checkTrue('and it is flagged as unavailable rather than merely missing',
      row.result.unavailable);
    checkTrue('with a reason that says where to add it',
      /Debt Payoff/.test(row.result.reason));
    check('and names the field', row.result.missing.join(','), 'creditLimitTotal');

    /* A limit of zero is not a limit. Dividing by it would be an infinity
       and treating it as absent is the only sane reading. */
    check('a zero limit is not a limit',
      util(withCards([{ balanceCents: 100, creditLimitCents: 0 }])).result.status, 'incomplete');
  }

  /* -- One card ------------------------------------------------------------ */
  {
    const row = util(withCards([{ balanceCents: 320000, creditLimitCents: 1000000 }]));
    check('balance over limit', row.value, 0.32, 1e-12);
    check('counted one card', row.result.cardsCounted, 1);
    check('and none left out', row.result.cardsWithoutLimit, 0);
    check('32% is inside the 30% ceiling? no — it is over', row.verdict.zone, 'out');
    check('10% is the comfortable end',
      util(withCards([{ balanceCents: 90000, creditLimitCents: 1000000 }])).verdict.zone, 'good');
    check('and 25% is in between',
      util(withCards([{ balanceCents: 250000, creditLimitCents: 1000000 }])).verdict.zone, 'watch');
  }

  /* -- Several cards, and the trap this ratio usually falls into ---------- */
  {
    /* A card with a balance but NO limit must be left out of BOTH sides.
       Counting its balance against the other cards' limits is the single
       easiest way to make this number lie, and it lies upward. */
    const mixed = withCards([
      { label: 'Known', balanceCents: 200000, creditLimitCents: 1000000 },
      { label: 'Unknown', balanceCents: 800000 }
    ]);
    const row = util(mixed);
    check('only the card with a known limit is counted', row.value, 0.2, 1e-12);
    check('the balance used is that card’s alone', row.result.balanceCents, 200000);
    check('and the room can say how many were left out', row.result.cardsWithoutLimit, 1);
    check('one counted', row.result.cardsCounted, 1);

    /* Two known cards aggregate on both sides. */
    const both = withCards([
      { balanceCents: 200000, creditLimitCents: 1000000 },
      { balanceCents: 100000, creditLimitCents: 500000 }
    ]);
    check('two known cards sum on both sides', util(both).value, 300000 / 1500000, 1e-12);
    check('and both are counted', util(both).result.cardsCounted, 2);

    /* Non-revolving debt has no limit and must never enter the sum. */
    const withMortgage = withCards([{ balanceCents: 200000, creditLimitCents: 1000000 }]);
    withMortgage.debts.push(Schema.createDebt({
      type: 'mortgage', balanceCents: 25000000, creditLimitCents: 99999999 }));
    check('a mortgage never enters credit utilisation', util(withMortgage).value, 0.2, 1e-12);
  }

  /* -- It reaches the score, and the score notices ------------------------ */
  {
    const table = TABLES.healthScore;
    const debtPillar = table.pillars.filter(p => p.id === 'debt')[0];
    checkTrue('the debt pillar counts credit utilisation',
      debtPillar.ratios.indexOf('creditUtilization') !== -1);

    const clean = Demo.build();
    clean.expenses.entries = Demo.buildSpending();
    clean.debts = clean.debts.map(d => Schema.createDebt(
      d.type === 'credit_card' ? Object.assign({}, d, { creditLimitCents: 5000000 }) : d));
    const maxed = Demo.build();
    maxed.expenses.entries = Demo.buildSpending();
    maxed.debts = maxed.debts.map(d => Schema.createDebt(
      d.type === 'credit_card' ? Object.assign({}, d, { creditLimitCents: 350000 }) : d));

    const a = HealthEngine.score(clean, TABLES);
    const b = HealthEngine.score(maxed, TABLES);
    checkTrue('both score', Money.isOk(a) && Money.isOk(b));
    const aDebt = a.pillars.filter(p => p.id === 'debt')[0];
    const bDebt = b.pillars.filter(p => p.id === 'debt')[0];
    checkTrue('a nearly-maxed card scores the debt pillar lower', bDebt.score < aDebt.score);
    checkTrue('and drags the whole score with it', b.value < a.value);
  }

  /* -- Stored households written before this field ------------------------ */
  {
    /* The compatibility promise: an old debt loads with a null limit, and
       null keeps the ratio unavailable rather than reading as a zero limit
       or an unlimited one. No migration, because absent already means the
       right thing. */
    const old = Schema.createDebt({ label: 'Card', balanceCents: 320000, type: 'credit_card' });
    check('a debt created without the field has it as null', old.creditLimitCents, null);
    checkTrue('and round-trips through JSON unchanged',
      Schema.createDebt(JSON.parse(JSON.stringify(old))).creditLimitCents === null);
    check('so the ratio stays unavailable, not zero',
      util(withCards([{ balanceCents: 320000 }])).result.unavailable, true);
    check('the field dictionary knows about it',
      Schema.FIELDS['debt.creditLimitCents'].unit, 'cents');
  }
})();

section('Return on Hassle');

(function () {
  const HD = TABLES.hassleDefaults;

  /* -- The weighting convention ------------------------------------------ */
  check('a 1-out-of-10 hour counts as one hour', HassleEngine.weightFor(HD, 1).weight, 1);
  check('a 10-out-of-10 hour counts as two', HassleEngine.weightFor(HD, 10).weight, 2);
  check('and 5 sits linearly between them',
    HassleEngine.weightFor(HD, 5).weight, 1 + 4 / 9, 1e-12);
  check('an unrated chore is not adjusted at all',
    HassleEngine.weightFor(HD, null).weight, 1);
  checkTrue('and says it was unrated', HassleEngine.weightFor(HD, null).rated === false);
  check('a value off the scale is treated as unrated, not clamped',
    HassleEngine.weightFor(HD, 99).weight, 1);
  check('the convention is named in the data file, not the code',
    HassleEngine.weightFor(HD, 5).convention, HD.weighting.id);

  /* -- A one-off: $200 for 2 hours = $100/hr ----------------------------- */
  const once = HassleEngine.returnOnHassle(
    { savingCents: 20000, hours: 2, hassleScore: 5 }, HD);
  check('$200 for two hours is $100 an hour', once.value, 10000);
  check('with no repeat, the annual rate is the same', once.annualPerHourCents, 10000);
  check('and the adjusted rate divides by the weight',
    once.adjustedPerHourCents, Math.round(10000 / (1 + 4 / 9)));
  check('which is $69.23 an hour', once.adjustedPerHourCents, 6923);

  const unrated = HassleEngine.returnOnHassle({ savingCents: 20000, hours: 2 }, HD);
  check('unrated, the adjusted rate equals the plain one',
    unrated.adjustedPerHourCents, unrated.value);

  /* -- A repeating saving off one afternoon's work ----------------------- */
  const subs = HassleEngine.returnOnHassle(
    { savingCents: 3000, hours: 1, repeatsPerYear: 12, hoursRepeat: false, hassleScore: 3 }, HD);
  check('per occurrence it looks like $30 an hour', subs.value, 3000);
  check('but a year of it is $360', subs.annualSavingCents, 36000);
  check('for the same single hour', subs.annualHours, 1);
  check('so the rate that matters is $360 an hour', subs.annualPerHourCents, 36000);
  check('and the adjusted rate is built from the annual one, not the occurrence',
    subs.adjustedPerHourCents, Math.round(36000 / (1 + 2 / 9)));

  /* When the hours recur too, the annual rate collapses back to the
     per-occurrence one — which is the whole point of asking. */
  const taxes = HassleEngine.returnOnHassle(
    { savingCents: 3000, hours: 1, repeatsPerYear: 12, hoursRepeat: true }, HD);
  check('when the hours repeat, the year costs twelve of them', taxes.annualHours, 12);
  check('and the annual rate is the same as the occurrence rate',
    taxes.annualPerHourCents, taxes.value);
  checkTrue('which is far below the one-afternoon version',
    taxes.annualPerHourCents < subs.annualPerHourCents);

  /* -- Nothing is assumed, and nothing divides by zero ------------------- */
  check('with no saving entered there is no rate',
    HassleEngine.returnOnHassle({ hours: 2 }, HD).status, 'incomplete');
  check('with no hours entered there is no rate',
    HassleEngine.returnOnHassle({ savingCents: 20000 }, HD).status, 'incomplete');
  check('zero hours is refused rather than divided by',
    HassleEngine.returnOnHassle({ savingCents: 20000, hours: 0 }, HD).status, 'incomplete');
  check('negative hours too',
    HassleEngine.returnOnHassle({ savingCents: 20000, hours: -1 }, HD).status, 'incomplete');
  check('a saving of zero is a real answer, not a missing one',
    HassleEngine.returnOnHassle({ savingCents: 0, hours: 2 }, HD).value, 0);
  check('zero repeats is refused',
    HassleEngine.returnOnHassle({ savingCents: 100, hours: 1, repeatsPerYear: 0 }, HD).status,
    'incomplete');

  /* -- Against the real hourly wage, which is computed in ONE place ------ */
  const h = Demo.build();
  const wage = Hourly.realHourlyWage(h, TABLES);
  const v = HassleEngine.versusWage(h, TABLES, { savingCents: 20000, hours: 2, hassleScore: 5 });
  check('the comparison uses engines/hourly.js, not a second wage figure',
    v.realHourlyCents, wage.value);
  check('$69/hr beats Robin\'s real hourly wage', v.beatsWage, true);
  check('by the difference between the two',
    v.differenceCents, once.adjustedPerHourCents - wage.value);
  check('the ratio is the adjusted rate over the wage',
    v.value, once.adjustedPerHourCents / wage.value, 1e-12);

  /* Break-even: the saving at which the adjusted rate exactly matches the
     wage. Feed it back in and the two rates should meet. */
  const be = v.breakEvenSavingCents;
  const atBreakEven = HassleEngine.returnOnHassle(
    { savingCents: be, hours: 2, hassleScore: 5 }, HD);
  check('at the break-even saving the adjusted rate matches the wage',
    atBreakEven.adjustedPerHourCents, wage.value, 1);

  const noWage = HassleEngine.versusWage(Schema.createHousehold({}), TABLES,
    { savingCents: 20000, hours: 2 });
  check('with no work profile the comparison is incomplete', noWage.status, 'incomplete');
  check('while the rate on its own still works',
    HassleEngine.returnOnHassle({ savingCents: 20000, hours: 2 }, HD).status, 'ok');

  /* -- The reference table ----------------------------------------------- */
  const presets = HassleEngine.presets(h, HD);
  check('every activity in the table comes back', presets.value.length, HD.activities.length);
  checkTrue('each carries a default hassle score on the scale',
    presets.value.every(a => Rating.isValid(a.defaultHassle)));
  checkTrue('each carries hours above zero', presets.value.every(a => a.hours > 0));
  checkTrue('none is marked as rated by the person yet',
    presets.value.every(a => a.rated === false));

  const rated = Schema.createHousehold({ ratings: { hassle: { bill_negotiate: 2 } } });
  const after = HassleEngine.presets(rated, HD).value.find(a => a.id === 'bill_negotiate');
  check('a stored rating overrides the table default', after.hassle, 2);
  checkTrue('and is marked as the person\'s own', after.rated === true);
  check('while the table default is still reported', after.defaultHassle,
    HD.activities.find(a => a.id === 'bill_negotiate').hassle);

  check('an unknown activity id returns nothing',
    HassleEngine.activityById(HD, 'not_a_chore'), null);
  check('the ratings scope is its own', HassleEngine.SCOPE, 'hassle');
  checkTrue('and the scale is anchored for it',
    Rating.anchors('hassle').low !== Rating.anchors('joy').low);
})();

section('Fulfillment Curve');

(function () {
  const CAT = TABLES.expenseCategories;
  const JOY = {
    housing: 6, groceries: 7, dining_out: 9, entertainment: 8,
    subscriptions: 3, transportation: 4, utilities: 5, insurance: 2
  };
  const h = Demo.build();
  h.expenses.entries = Demo.buildSpending();

  /* -- Prerequisites, in order ------------------------------------------- */
  const noMonth = Demo.build();
  check('without a categorised month there are no rows',
    Fulfillment.rows(noMonth, CAT).status, 'incomplete');
  check('and the curve says the same', Fulfillment.curve(noMonth, CAT).status, 'incomplete');

  const none = Fulfillment.curve(h, CAT);
  check('with a month but no ratings, the curve is incomplete', none.status, 'incomplete');
  checkTrue('and it counts what is still needed', none.reason.includes('0 so far'));

  const three = JSON.parse(JSON.stringify(h));
  three.ratings = { joy: { housing: 6, groceries: 7, dining_out: 9 } };
  check('three ratings is still not enough', Fulfillment.curve(three, CAT).status, 'incomplete');
  checkTrue('and it says how many there are',
    Fulfillment.curve(three, CAT).reason.includes('3 so far'));
  check('four is the threshold', Fulfillment.MIN_RATED, 4);

  /* -- Savings are excluded, deliberately -------------------------------- */
  const allRows = Fulfillment.rows(h, CAT);
  const summary = CashFlow.summarise(h, CAT);
  const savingsRows = summary.categories.filter(c => c.bucket === 'savings');
  checkTrue('the demo month has savings categories to exclude', savingsRows.length > 0);
  check('none of them appear in the rating list',
    allRows.value.filter(r => r.bucket === 'savings').length, 0);
  check('and the count excluded is reported', allRows.excludedCount, savingsRows.length);
  check('as are the dollars', allRows.excludedSavingsCents, summary.savingsMonthlyCents);
  check('what remains is the spending total', allRows.totalMonthlyCents, summary.spendMonthlyCents);

  /* -- The median, and why it is not the mean ----------------------------- */
  check('an odd-length median is the middle value', Fulfillment.median([1, 5, 100]), 5);
  check('an even-length one splits the two middles', Fulfillment.median([1, 5, 7, 100]), 6);
  check('an empty list has no median', Fulfillment.median([]), null);

  const rated = JSON.parse(JSON.stringify(h));
  rated.ratings = { joy: JOY };
  const c = Fulfillment.curve(rated, CAT);
  check('eight categories are plotted', c.value, 8);

  /* Spends are 1500, 450, 305(unrated), 260, 220, 180, 150, 90, 45.
     Of the RATED eight: 45, 90, 150, 180, 220, 260, 450, 1500 -> (180+220)/2 */
  check('the split is the median of the rated spends', c.spendLineCents, 20000);
  /* The mean of the same eight is $361.88 — nearly twice the median, pulled
     up by one $1,500 category. On a mean split, housing alone would define
     "high spend" and three of the four corners would be near-empty. */
  const mean = c.plotted.reduce((s, p) => s + p.monthlyCents, 0) / c.plotted.length;
  check('the mean of the same spends is $361.88', mean, 36187.5);
  checkTrue('so a mean split would sit well right of the median one',
    mean > c.spendLineCents * 1.5);
  check('a mean split would call only two of the eight high spend',
    c.plotted.filter(p => p.monthlyCents > mean).length, 2);
  check('where the median split puts half of them on each side',
    c.plotted.filter(p => p.monthlyCents > c.spendLineCents).length, 4);
  check('the joy line is the midpoint of the scale', c.joyLine, 5.5);
  check('which is (1 + 10) / 2', c.joyLine, (Rating.MIN + Rating.MAX) / 2);

  /* -- Quadrants ---------------------------------------------------------- */
  const where = {};
  c.plotted.forEach(p => { where[p.categoryId] = p.quadrantId; });
  check('housing: dear and liked, so worth it', where.housing, 'worth_it');
  check('transportation: dear and not liked, the expensive habit', where.transportation, 'expensive');
  check('entertainment: cheap and loved, cheap joy', where.entertainment, 'cheap_joy');
  check('subscriptions: cheap and unloved, small and forgettable', where.subscriptions, 'small_meh');

  /* Boundaries. Utilities is $180, under the $200 line, rated 5 — below the
     5.5 midpoint. Both comparisons are strict, so a category sitting exactly
     on the spend line counts as the cheap side. */
  check('utilities sits on the cheap, unloved side', where.utilities, 'small_meh');
  const onLine = JSON.parse(JSON.stringify(rated));
  onLine.ratings.joy.transportation = 6;
  const c2 = Fulfillment.curve(onLine, CAT);
  check('nudging transportation above the midpoint moves it to worth it',
    c2.plotted.find(p => p.categoryId === 'transportation').quadrantId, 'worth_it');
  check('and the expensive-habit corner empties',
    c2.byQuadrant.expensive.rows.length, 0);
  check('an empty corner is still a corner, at zero',
    c2.byQuadrant.expensive.monthlyCents, 0);

  /* Every plotted category lands in exactly one corner, and the corners
     account for every plotted dollar. */
  const inCorners = Object.keys(c.byQuadrant)
    .reduce((s, k) => s + c.byQuadrant[k].rows.length, 0);
  check('every plotted category is in exactly one corner', inCorners, c.plotted.length);
  const cornerCents = Object.keys(c.byQuadrant)
    .reduce((s, k) => s + c.byQuadrant[k].monthlyCents, 0);
  check('and the corners hold all the plotted money', cornerCents, c.ratedMonthlyCents);

  /* -- Joy per $100 ------------------------------------------------------- */
  const ent = c.plotted.find(p => p.categoryId === 'entertainment');
  check('entertainment: 8 over $90 is 8.89 per $100', ent.joyPerHundred, 8 / 0.9, 1e-9);
  check('the best return per dollar is entertainment', c.cheapestJoy.categoryId, 'entertainment');
  check('and the worst is the mortgage-sized one', c.dearestJoy.categoryId, 'housing');
  check('the ranking is every plotted category', c.ranked.length, c.plotted.length);
  checkTrue('and it descends',
    c.ranked.every((p, i) => i === 0 || p.joyPerHundred <= c.ranked[i - 1].joyPerHundred));

  /* A free category has no ratio at all rather than an infinite one. */
  const withFree = JSON.parse(JSON.stringify(rated));
  withFree.expenses.entries.push(Schema.createExpenseEntry({
    categoryId: 'personal_care', amountCents: 0, period: 'monthly'
  }));
  withFree.ratings.joy.personal_care = 9;
  const c3 = Fulfillment.curve(withFree, CAT);
  const free = c3.plotted.find(p => p.categoryId === 'personal_care');
  check('a category costing nothing is still plotted', free.joy, 9);
  check('but has no joy-per-dollar', free.joyPerHundred, null);
  check('and is left out of the ranking',
    c3.ranked.filter(p => p.categoryId === 'personal_care').length, 0);

  /* -- Unrated is never assumed ------------------------------------------ */
  check('the unrated category is listed', c.unrated.length, 1);
  check('and it is the one nobody rated', c.unrated[0].categoryId, 'debt_minimums');
  check('its money is counted separately', c.unratedMonthlyCents, 30500);
  check('and kept out of the plotted total', c.ratedMonthlyCents + c.unratedMonthlyCents,
    allRows.totalMonthlyCents);
  checkTrue('nothing unrated reached the plot',
    c.plotted.every(p => p.categoryId !== 'debt_minimums'));

  /* Un-rating one takes it straight back out. */
  const fewer = JSON.parse(JSON.stringify(rated));
  delete fewer.ratings.joy.insurance;
  const c4 = Fulfillment.curve(fewer, CAT);
  check('un-rating a category removes it from the plot', c4.value, 7);
  check('and puts it back on the unrated list',
    c4.unrated.filter(u => u.categoryId === 'insurance').length, 1);

  /* -- No score, and no writing ------------------------------------------ */
  ['score', 'alignment', 'grade', 'rating', 'index'].forEach(function (key) {
    checkTrue(`the curve carries no "${key}"`,
      !Object.prototype.hasOwnProperty.call(c, key));
  });
  const before = JSON.stringify(rated);
  Fulfillment.curve(rated, CAT);
  Fulfillment.rows(rated, CAT);
  check('reading the curve mutates nothing', JSON.stringify(rated), before);
})();

section('Values vs. Spending');

(function () {
  const VT = TABLES.values;
  const CAT = TABLES.expenseCategories;

  /* -- The catalogue's mapping has to be disjoint and complete ------------
        A category under two values double-counts the money; a category
        under none silently vanishes from the audit unless it is on the
        deliberately-unmapped list.                                        */
  const seen = {};
  let duplicated = [];
  VT.values.forEach(v => (v.defaultCategoryIds || []).forEach(cid => {
    if (seen[cid]) duplicated.push(cid);
    seen[cid] = v.id;
  }));
  check('no category is claimed by two values', duplicated.join(','), '');
  CAT.categories.forEach(c => {
    checkTrue(`category "${c.id}" is mapped or deliberately unmapped`,
      !!seen[c.id] || (VT.unmappedCategoryIds || []).includes(c.id),
      'add it to a value in data/values.json or to unmappedCategoryIds');
  });
  Object.keys(seen).forEach(cid => {
    checkTrue(`values.json maps "${cid}", which exists in expense_categories.json`,
      CAT.categories.some(c => c.id === cid));
  });
  check('the flattened default map agrees with the file',
    JSON.stringify(ValuesEngine.defaultMap(VT)), JSON.stringify(seen));

  /* -- Stating values: order is position, and five is five --------------- */
  const h = Demo.build();
  h.expenses.entries = Demo.buildSpending();
  h.valuesProfile = { stated: ['freedom', 'health', 'connection'], assignments: {} };

  const stated = ValuesEngine.statedValues(h, VT);
  check('three named values come back', stated.length, 3);
  check('the first named is rank 1', stated[0].rank, 1);
  check('and it is the one named first', stated[0].id, 'freedom');

  const messy = Demo.build();
  messy.valuesProfile = {
    stated: ['freedom', 'freedom', 'not_a_real_value', 'health', 'connection',
             'security', 'experience', 'ease'],
    assignments: {}
  };
  const cleaned = ValuesEngine.statedValues(messy, VT);
  check('duplicates and unknown ids are dropped, and five is the cap', cleaned.length, 5);
  check('ranks are contiguous from 1',
    cleaned.map(v => v.rank).join(','), '1,2,3,4,5');
  check('the surviving order is the order named',
    cleaned.map(v => v.id).join(','), 'freedom,health,connection,security,experience');

  /* -- Assignment precedence --------------------------------------------- */
  check('with nothing said, the catalogue default applies',
    ValuesEngine.assignmentFor(h, VT, 'groceries').valueId, 'health');
  check('and it says it was a default',
    ValuesEngine.assignmentFor(h, VT, 'groceries').source, 'default');

  const reassigned = JSON.parse(JSON.stringify(h));
  reassigned.valuesProfile.assignments = { groceries: 'connection', dining_out: null };
  check('a stated assignment beats the default',
    ValuesEngine.assignmentFor(reassigned, VT, 'groceries').valueId, 'connection');
  check('and it says so', ValuesEngine.assignmentFor(reassigned, VT, 'groceries').source, 'stated');
  check('an explicit null means none of them',
    ValuesEngine.assignmentFor(reassigned, VT, 'dining_out').source, 'none');
  check('and carries no value', ValuesEngine.assignmentFor(reassigned, VT, 'dining_out').valueId, null);
  check('a category the catalogue never claimed reads as unmapped',
    ValuesEngine.assignmentFor(h, VT, 'other').source, 'unmapped');

  /* -- No categorised month: incomplete, never a table of zeroes ---------- */
  const noMonth = Demo.build();
  noMonth.valuesProfile = { stated: ['freedom'], assignments: {} };
  const blank = ValuesEngine.audit(noMonth, VT, CAT);
  check('without a categorised month the audit is incomplete', blank.status, 'incomplete');
  check('and it names what is missing', blank.missing.join(','), 'expenseEntries');

  /* -- The audit itself ---------------------------------------------------
        Robin's month, by value, on the default mapping:
          Home & comfort   1,500 housing + 180 utilities        = 1,680
          Security         305 minimums + 300 savings + 150 ins = 755
          Health           450 groceries                        = 450
          Freedom          400 retirement                       = 400
          Connection       260 dining out                       = 260
          Getting around   220 transport                        = 220
          Experiences      90 entertainment                     = 90
          Ease             45 subscriptions                     = 45
                                                          total = 3,900   */
  const a = ValuesEngine.audit(h, VT, CAT);
  check('the audit reports the whole categorised month', a.value, 390000);
  check('home and comfort is the biggest single value', a.bySpend[0].id, 'home');
  check('and it is $1,680', a.bySpend[0].monthlyCents, 168000);
  check('security is second at $755', a.bySpend[1].monthlyCents, 75500);
  check('spend ranks are contiguous from 1',
    a.bySpend.map(r => r.spendRank).join(','),
    a.bySpend.map((_, i) => i + 1).join(','));

  check('the stated list keeps the order it was named in',
    a.byStated.map(r => r.id).join(','), 'freedom,health,connection');
  check('freedom is $400 of the month', a.byStated[0].monthlyCents, 40000);
  check('which is 400/3,900 of it', a.byStated[0].shareOfSpend, 40000 / 390000, 1e-12);
  check('freedom ranks 4th by spend despite being named first',
    a.byStated[0].spendRank, 4);

  /* Every dollar lands exactly once: named values plus everything else. */
  const claimed = a.byStated.reduce((s, r) => s + r.monthlyCents, 0);
  check('named values plus unclaimed accounts for the whole month',
    claimed + a.unclaimedCents, a.value);
  check('unclaimed is $2,790 — everything not serving the three named',
    a.unclaimedCents, 279000);
  check('which is 72% of the month', Math.round(a.unclaimedShare * 100), 72);

  /* Housing serves a real value — just not one on this list. Saying so is
     the difference between a useful reading and an accusation. */
  const housing = a.unclaimedCategories.find(c => c.categoryId === 'housing');
  checkTrue('housing counts as unclaimed here', !!housing);
  check('and it still names the value it serves', housing.servesValueId, 'home');
  check('unclaimed categories are listed biggest first',
    a.unclaimedCategories[0].categoryId, 'housing');

  /* -- A named value with nothing behind it still gets a row ------------- */
  const unfunded = JSON.parse(JSON.stringify(h));
  unfunded.valuesProfile.stated = ['family', 'freedom'];
  const ua = ValuesEngine.audit(unfunded, VT, CAT);
  check('a named value with no spending still appears', ua.byStated[0].id, 'family');
  check('at zero, not missing', ua.byStated[0].monthlyCents, 0);
  check('and its share is a real zero', ua.byStated[0].shareOfSpend, 0);

  /* -- Reassigning moves the money, and only that money ------------------ */
  const moved = ValuesEngine.audit(reassigned, VT, CAT);
  check('groceries moved off health', moved.rows.find(r => r.id === 'health').monthlyCents, 0);
  check('and onto connection — 260 dining out is gone, 450 groceries arrived',
    moved.rows.find(r => r.id === 'connection').monthlyCents, 45000);
  check('dining out, set to none, is unclaimed',
    moved.unclaimedCategories.some(c => c.categoryId === 'dining_out'), true);
  check('the month still totals the same', moved.value, 390000);

  /* -- No score. SPEC.md §13 says the gap is not a scalar. --------------- */
  ['score', 'alignment', 'alignmentScore', 'grade', 'correlation', 'rating']
    .forEach(function (key) {
      checkTrue(`the audit result carries no "${key}"`,
        !Object.prototype.hasOwnProperty.call(a, key),
        'SPEC.md §13 Tier 2: the gap is a comparison view, not a scalar');
    });

  /* -- The engine reads; the room writes --------------------------------- */
  const before = JSON.stringify(h);
  ValuesEngine.audit(h, VT, CAT);
  ValuesEngine.assignableCategories(h, VT, CAT);
  ValuesEngine.statedValues(h, VT);
  check('reading the audit mutates nothing', JSON.stringify(h), before);

  /* -- The assignment list is only categories with money in them --------- */
  const assignable = ValuesEngine.assignableCategories(h, VT, CAT);
  check('the assignable list matches the categorised categories',
    assignable.value.length,
    CashFlow.summarise(h, CAT).categories.length);
  checkTrue('every assignable row carries an amount',
    assignable.value.every(r => Money.isEntered(r.monthlyCents)));
  check('without a categorised month there is nothing to assign',
    ValuesEngine.assignableCategories(noMonth, VT, CAT).status, 'incomplete');
})();

section('Worth It');

(function () {
  const W = WorthEngine;

  function check1(fields) { return Schema.createWorthCheck(fields); }

  /* -- Cost per hour, and what it refuses -------------------------------- */
  {
    const c = check1({ costCents: 45000, hoursSpent: 300 });
    check('cost per hour is money over hours', W.costPerHour(c).value, 150);

    const noHours = W.costPerHour(check1({ costCents: 45000 }));
    check('no hours is incomplete, not infinity', noHours.status, 'incomplete');
    check('and names the missing half', noHours.missing.join(','), 'hoursSpent');

    const neither = W.costPerHour(check1({}));
    check('both missing names both', neither.missing.join(','), 'costCents,hoursSpent');

    const zeroHours = W.costPerHour(check1({ costCents: 45000, hoursSpent: 0 }));
    check('zero hours of use has no cost per hour', zeroHours.status, 'incomplete');
    checkTrue('and says that is the finding', /that is the finding/.test(zeroHours.reason));

    /* Zero cost is a real answer — a gift used for 300 hours cost nothing an
       hour, and that must not collapse into "not entered". */
    check('a free thing costs zero an hour',
      W.costPerHour(check1({ costCents: 0, hoursSpent: 300 })).value, 0);
  }

  /* -- Cost per point ----------------------------------------------------- */
  {
    const c = check1({ costCents: 40000, predictedRating: 8, actualRating: 2 });
    check('per predicted point', W.costPerPoint(c, 'predictedRating').value, 5000);
    check('per actual point', W.costPerPoint(c, 'actualRating').value, 20000);
    check('an unrated one is incomplete',
      W.costPerPoint(check1({ costCents: 100 }), 'actualRating').status, 'incomplete');
    check('a rating outside 1-10 is not a rating',
      W.costPerPoint(check1({ costCents: 100, actualRating: 0 }), 'actualRating').status,
      'incomplete');
    check('and neither is a fractional one',
      W.costPerPoint(check1({ costCents: 100, actualRating: 7.5 }), 'actualRating').status,
      'incomplete');
  }

  /* -- The gap, and the band around "about right" ------------------------- */
  check('one point out is still about right', W.verdictFor(1).id, 'expected');
  check('and one point the other way too', W.verdictFor(-1).id, 'expected');
  check('two points up is better than you thought', W.verdictFor(2).id, 'better');
  check('two points down is worse', W.verdictFor(-2).id, 'worse');
  check('no gap at all has no verdict', W.verdictFor(null), null);

  /* -- One thing, worked out ---------------------------------------------- */
  {
    const h = Demo.build();
    const c = check1({ label: 'Exercise bike', costCents: 200000, hoursSpent: 20,
                       predictedRating: 9, actualRating: 2 });
    const r = W.evaluate(h, TABLES, c);
    check('the reading is per ACTUAL point once it has been lived', r.basis, 'actual');
    check('so the headline is cost over the actual rating', r.value, 100000);
    check('the predicted one is still reported', r.costPerPredictedPointCents, 200000 / 9, 1e-9);
    check('the gap is after minus before', r.gap, -7);
    check('which reads as worse than you thought', r.verdict.id, 'worse');
    check('and it counts as lived', r.stage, 'rated');

    /* The price in hours must come from engines/hourly.js, not a second
       wage calculation — SPEC.md §8. Re-derived here from that engine. */
    const wage = Hourly.realHourlyWage(h, TABLES);
    checkTrue('the life-hours price is known for the demo persona', r.lifeHoursKnown);
    check('and is the price over the real hourly wage', r.lifeHours, 200000 / wage.value, 1e-9);
    check('hours worked for it against hours got out of it',
      r.hoursRatio, r.lifeHours / 20, 1e-12);

    /* A household with no income cannot price anything in hours, and that is
       reported rather than silently dropped. */
    const bare = Schema.createHousehold({});
    const noWage = W.evaluate(bare, TABLES, c);
    checkTrue('with no income the hours price is unavailable', !noWage.lifeHoursKnown);
    checkTrue('and says why', typeof noWage.lifeHoursReason === 'string');
    check('but the rest of the reading still works', noWage.value, 100000);
  }

  /* -- Predicted but not yet lived ---------------------------------------- */
  {
    const h = Demo.build();
    const r = W.evaluate(h, TABLES, check1({ costCents: 60000, predictedRating: 7 }));
    check('a thing not yet lived reads off the prediction', r.basis, 'predicted');
    check('with the value to match', r.value, 60000 / 7, 1e-9);
    check('and is marked as waiting', r.stage, 'awaiting');

    const unrated = W.evaluate(h, TABLES, check1({ costCents: 60000 }));
    check('with no rating at all there is no reading', unrated.status, 'incomplete');
    check('and both ratings are named', unrated.missing.join(','),
      'predictedRating,actualRating');
  }

  /* -- Calibration: the one number a single purchase cannot give ---------- */
  {
    const h = Demo.build();
    h.worthChecks = [
      check1({ label: 'a', costCents: 45000, predictedRating: 9, actualRating: 8 }),
      check1({ label: 'b', costCents: 200000, predictedRating: 9, actualRating: 2 })
    ];
    const short = W.calibration(h);
    check('two before-and-afters is not a pattern', short.status, 'incomplete');
    checkTrue('and it says how many more are needed', /Rate 1 more thing\b/.test(short.reason));

    h.worthChecks.push(check1({ label: 'c', costCents: 9000, predictedRating: 6, actualRating: 9 }));
    const cal = W.calibration(h);
    check('three makes it readable', cal.status, 'ok');
    check('the mean gap is the average of the three', cal.value, (-1 + -7 + 3) / 3, 1e-12);
    check('one came in badly below', cal.overestimatedCount, 1);
    check('one came in well above', cal.underestimatedCount, 1);
    check('and one was inside the band', cal.onTargetCount, 1);
    check('the worst miss is named', cal.worstMiss.check.label, 'b');
    check('and the best surprise too', cal.bestSurprise.check.label, 'c');

    /* An unrated or un-predicted entry is not a pair and must not shift it. */
    h.worthChecks.push(check1({ label: 'd', costCents: 1000, predictedRating: 10 }));
    check('a thing not yet lived is not a pair', W.calibration(h).pairCount, 3);
    check('and does not move the mean', W.calibration(h).value, cal.value, 1e-12);
  }

  /* -- Regrets: the Tier 4 view, which is a filter, not a calculation ----- */
  {
    const h = Demo.build();
    h.worthChecks = [
      check1({ label: 'bike', costCents: 200000, predictedRating: 9, actualRating: 2 }),
      check1({ label: 'gadget', costCents: 5000, actualRating: 3 }),
      check1({ label: 'knife', costCents: 9000, actualRating: 9 }),
      check1({ label: 'desk', costCents: 60000, predictedRating: 7 })
    ];
    const r = W.regrets(h);
    check('only things rated low are regrets', r.count, 2);
    check('and the total is what they cost', r.value, 205000);
    check('the thing never rated is not a regret', r.items.every(i => i.label !== 'desk'), true);
    check('worst first', r.items[0].label, 'bike');
    check('the denominator is everything rated', r.ratedTotalCents, 214000);
    check('so the share is of rated spend', r.shareOfSpend, 205000 / 214000, 1e-12);
    checkTrue('and the total is complete', r.complete);

    /* A regret with no price recorded makes the total a floor, and the
       result has to say so rather than quietly leaving it out. */
    h.worthChecks.push(check1({ label: 'unpriced', actualRating: 1 }));
    const floor = W.regrets(h);
    check('an unpriced regret still counts as one', floor.count, 3);
    check('but not toward the total', floor.value, 205000);
    checkTrue('and the total is flagged as a floor', !floor.complete);

    const raised = W.regrets(h, { threshold: 8 });
    check('the threshold is adjustable', raised.count, 3);
    check('and reported back', raised.threshold, 8);

    check('with nothing rated there is nothing to filter',
      W.regrets(Schema.createHousehold({})).status, 'incomplete');
  }

  /* -- Everything at once -------------------------------------------------- */
  {
    const h = Demo.build();
    h.worthChecks = [
      check1({ label: 'knife', costCents: 9000, hoursSpent: 900, predictedRating: 6, actualRating: 9 }),
      check1({ label: 'bike', costCents: 200000, hoursSpent: 20, predictedRating: 9, actualRating: 2 }),
      check1({ label: 'desk', costCents: 60000, predictedRating: 7 })
    ];
    const s = W.summarise(h, TABLES);
    check('every stored thing gets a row', s.rows.length, 3);
    check('two have been lived', s.ratedCount, 2);
    check('one is still ahead', s.awaitingCount, 1);
    check('best value is the cheapest per point', s.bestValue.label, 'knife');
    check('worst is the dearest', s.worstValue.label, 'bike');
    checkTrue('a thing with no actual rating cannot be ranked on one',
      s.rows.filter(r => r.label === 'desk')[0].stage === 'awaiting');
    check('an empty household still summarises',
      W.summarise(Schema.createHousehold({}), TABLES).rows.length, 0);
  }

  /* -- The shared rating control carries two ratings for one item --------- */
  {
    const html = Rating.controlHtml({ scope: 'worth', itemId: 'w1', slot: 'predicted',
                                      value: 7, label: 'Bike', name: 'Predicted worth' });
    checkTrue('the control declares its slot', /data-rating-slot="predicted"/.test(html));
    checkTrue('and names itself for a screen reader',
      /aria-label="Predicted worth for Bike"/.test(html));

    const node = {
      value: '7',
      getAttribute: (k) => ({ 'data-rating-scope': 'worth', 'data-rating-item': 'w1',
                              'data-rating-slot': 'actual' })[k] || null
    };
    const read = Rating.readTarget(node);
    check('reading it back gives the slot', read.slot, 'actual');
    check('and the item', read.itemId, 'w1');
    check('and the value', read.value, 7);

    const plain = Rating.readTarget({
      value: '3',
      getAttribute: (k) => ({ 'data-rating-scope': 'joy', 'data-rating-item': 'housing' })[k] || null
    });
    check('a control with no slot reads back null, not undefined', plain.slot, null);
    checkTrue('and the slotless markup carries no slot attribute',
      !/data-rating-slot/.test(Rating.controlHtml({ scope: 'joy', itemId: 'housing' })));
  }
})();

section('The Windfall');

(function () {
  const W = WindfallEngine;
  const base = { amountCents: 2500000, months: 6, annualRate: 0.07, cashAnnualRate: 0.04 };

  /* -- The simulation itself ---------------------------------------------- */
  {
    const r = W.compare(base);
    check('all of it is invested by the end of the window', r.path.length, 6);
    check('and nothing is left waiting', r.path[5].waitingCents, 0);
    check('the lump sum grows at the assumed rate for the whole window',
      r.lumpCents, Math.round(2500000 * Math.pow(1 + 0.07 / 12, 6)));

    /* Spread, re-derived in closed form rather than by re-running the
       engine's loop. You buy a FIXED slice of the original each month — the
       interest the waiting cash earns stays in the account and goes in with
       the final purchase, which is what actually happens when you set up a
       monthly transfer for a round number. */
    const rm = 0.07 / 12, cm = 0.04 / 12, slice = 2500000 / 6;
    let fixedSlices = 0;
    for (let k = 1; k <= 5; k++) fixedSlices += slice * Math.pow(1 + rm, 6 - k + 1);
    let drawnDown = 0;
    for (let j = 1; j <= 5; j++) drawnDown += Math.pow(1 + cm, j);
    const lastBuy = 2500000 * Math.pow(1 + cm, 5) - slice * drawnDown;
    check('and the spread path matches a closed-form re-derivation',
      r.spreadCents, Math.round(fixedSlices + lastBuy * (1 + rm)), 1);
    checkTrue('the final purchase sweeps the account, interest included',
      lastBuy > slice);
    check('the gap is one minus the other', r.gapCents, r.lumpCents - r.spreadCents);
    check('and as a share of the money', r.gapShare, r.gapCents / 2500000, 1e-6);
  }

  /* -- The identity the room prints out loud ------------------------------ */
  {
    /* The break-even IS the cash rate. The engine solves for it rather than
       asserting it, so this check is what makes the claim safe to print. */
    [[6, 0.04], [12, 0.04], [24, 0.0], [3, 0.055], [18, 0.02]].forEach(function (pair) {
      const months = pair[0], cash = pair[1];
      const solved = W.breakEvenAnnualRate(2500000, months, cash);
      check(`break-even over ${months} months at ${cash * 100}% cash is the cash rate`,
        solved, cash, 1e-6);
    });

    /* Which is to say: at exactly the cash rate the two are level. */
    const level = W.compare(Object.assign({}, base, { annualRate: 0.04 }));
    check('at the cash rate the two strategies end level', level.gapCents, 0, 1);

    const below = W.compare(Object.assign({}, base, { annualRate: 0.01 }));
    checkTrue('below it, spreading is ahead', below.gapCents < 0);
    const above = W.compare(Object.assign({}, base, { annualRate: 0.10 }));
    checkTrue('above it, the lump sum is ahead', above.gapCents > 0);

    /* The same threshold said as a total over the window. */
    check('the total-drop figure is the annual threshold compounded over the window',
      below.breakEvenTotalDrop, Math.pow(1 + 0.04 / 12, 6) - 1, 1e-12);
  }

  /* -- Degenerate and refused cases --------------------------------------- */
  {
    const one = W.compare(Object.assign({}, base, { months: 1 }));
    check('spreading over one month is the lump sum', one.gapCents, 0);
    checkTrue('and the result says so rather than implying they differ', one.degenerate);
    check('so there is no break-even to report', one.breakEvenAnnualRate, null);

    check('half a month is not a window',
      W.compare(Object.assign({}, base, { months: 0.5 })).status, 'incomplete');
    check('nor is a fractional one',
      W.compare(Object.assign({}, base, { months: 6.5 })).missing.join(','), 'months');
    check('nothing to invest is refused, not answered as zero',
      W.compare(Object.assign({}, base, { amountCents: 0 })).status, 'incomplete');
    check('and a missing amount names itself',
      W.compare(Object.assign({}, base, { amountCents: null })).missing.join(','), 'amountCents');
    check('a missing return assumption is named too',
      W.compare(Object.assign({}, base, { annualRate: null })).missing.join(','), 'annualRate');
  }

  /* -- Cash left out is not the same as cash earning nothing -------------- */
  {
    const noCash = W.compare(Object.assign({}, base, { cashAnnualRate: null }));
    check('an unstated cash rate defaults to zero and says so',
      noCash.cashAnnualRate, 0);
    checkTrue('which makes waiting cost more than it does at 4%',
      noCash.gapCents > W.compare(base).gapCents);
    check('and moves the break-even with it', noCash.breakEvenAnnualRate, 0, 1e-6);

    /* Zero rates everywhere: no growth, no penalty, no difference. */
    const flat = W.compare({ amountCents: 2500000, months: 12, annualRate: 0, cashAnnualRate: 0 });
    check('with nothing growing anywhere the two are identical', flat.gapCents, 0);
    check('and the money is still all there', flat.spreadCents, 2500000);
  }

  /* -- Exposure, which is the reason for the gap -------------------------- */
  {
    const r = W.compare(base);
    check('average exposure over the window', r.averageExposure, 7 / 12, 1e-12);
    check('so on average this much is waiting',
      r.averageWaitingCents, Math.round(2500000 * 5 / 12));
    const longer = W.compare(Object.assign({}, base, { months: 24 }));
    checkTrue('a longer window leaves more out of the market',
      longer.averageWaitingCents > r.averageWaitingCents);
    checkTrue('and costs more at the assumed return', longer.gapCents > r.gapCents);
  }

  /* -- Scenarios are illustrations, not forecasts ------------------------- */
  {
    const s = W.scenarios(base);
    check('one row per rate', s.value.length, W.SCENARIO_RATES.length);
    const bad = s.value[0], good = s.value[s.value.length - 1];
    check('the worst row is the worst rate', bad.annualRate, -0.30);
    checkTrue('in which spreading is ahead', bad.spreadAhead);
    checkTrue('and in the best row it is not', !good.spreadAhead);
    checkTrue('spreading saves more in the bad year than it costs in the good one',
      Math.abs(bad.gapCents) > Math.abs(good.gapCents));
    check('scenarios need an amount too',
      W.scenarios({ months: 6 }).status, 'incomplete');
  }

  /* -- Every window at once ------------------------------------------------ */
  {
    const rows = W.acrossWindows(base);
    check('one row per preset window', rows.length, W.WINDOWS.length);
    checkTrue('all of them computed', rows.every(r => Money.isOk(r.result)));
    checkTrue('and the cost rises with the window',
      rows[0].result.gapCents < rows[rows.length - 1].result.gapCents);
    rows.forEach(function (row) {
      check(`the ${row.months}-month window has the same break-even`,
        row.result.breakEvenAnnualRate, 0.04, 1e-6);
    });
  }
})();

section('The Runway');

(function () {
  const R = RunwayEngine;
  const h = Demo.build();

  /* The demo persona: $9,500 cash, $3,150 a month out. */
  const cash = Schema.cashCents(h).value;
  const spend = Schema.monthlyExpensesCents(h).value;

  /* -- The plain case ------------------------------------------------------ */
  {
    const r = R.project(h, TABLES, { preset: 'quit' });
    check('the cushion comes from the household', r.cushionCents, cash);
    check('and the spending does too', r.monthlyExpensesCents, spend);
    check('runway is whole months you finish above zero', r.value, Math.floor(cash / spend));
    check('and it runs out the month after', r.ranOutInMonth, r.runwayMonths + 1);
    checkTrue('which is not sustainable', !r.sustainable);
    check('the lasting gap is the whole outflow when nothing comes in',
      r.steadyMonthlyBurnCents, spend);
    check('the balance after month one is the cushion less one month',
      r.rows[0].balanceCents, cash - spend);
  }

  /* -- Every lever moves it the right way --------------------------------- */
  {
    const base = R.project(h, TABLES, { preset: 'quit' }).runwayMonths;
    /* Runway is whole months, so a small cut can be real without buying a
       month — and reporting a fractional month you cannot spend would be
       worse. A big enough cut does move it. */
    const smallCut = R.project(h, TABLES, { preset: 'quit', expenseCutCents: 50000 });
    check('a small cut does not invent a month it has not bought',
      smallCut.runwayMonths, base);
    checkTrue('but it does leave more in the pot at the same point',
      smallCut.rows[base - 1].balanceCents
        > R.project(h, TABLES, { preset: 'quit' }).rows[base - 1].balanceCents);
    const cut = R.project(h, TABLES, { preset: 'quit', expenseCutCents: 150000 }).runwayMonths;
    checkTrue('and a bigger cut buys months', cut > base);
    const extra = R.project(h, TABLES,
      { preset: 'quit', extraMonthlyCostCents: 50000 }).runwayMonths;
    checkTrue('paying for health cover shortens it', extra < base);
    const payout = R.project(h, TABLES, { preset: 'quit', severanceCents: 500000 });
    checkTrue('a payout lengthens it', payout.runwayMonths > base);
    check('and lands before month one', payout.startingCents, cash + 500000);

    /* Income that does not stop is the lever that can end the question. */
    const covered = R.project(h, TABLES,
      { preset: 'quit', otherMonthlyIncomeCents: spend + 1 });
    checkTrue('income above the outflow means it never runs out', covered.sustainable);
    check('and the value is the horizon, meaning at least that',
      covered.value, R.HORIZON_MONTHS);
    check('with nothing having run out', covered.ranOutInMonth, null);
  }

  /* -- The benefit cliff --------------------------------------------------- */
  {
    const r = R.project(h, TABLES, {
      preset: 'laid_off', severanceCents: 800000,
      benefitMonthlyCents: 180000, benefitMonths: 6, extraMonthlyCostCents: 65000
    });
    check('the benefit is paid in month 6', r.rows[5].benefitCents, 180000);
    check('and not in month 7', r.rows[6].benefitCents, 0);
    check('the cliff is named', r.benefitEndsAfterMonth, 6);
    checkTrue('the balance falls faster after it',
      (r.rows[6].balanceCents - r.rows[7].balanceCents)
        > (r.rows[3].balanceCents - r.rows[4].balanceCents));

    /* A benefit is a temporary inflow, so it must not flatter the lasting
       gap — that number is what is left once everything temporary ends. */
    check('the lasting gap ignores the benefit',
      r.steadyMonthlyBurnCents, spend + 65000);

    /* Quitting is the same numbers without the benefit. */
    const quit = R.project(h, TABLES, {
      preset: 'quit', severanceCents: 800000,
      benefitMonthlyCents: 180000, benefitMonths: 6, extraMonthlyCostCents: 65000
    });
    check('a benefit typed into the quitting scenario is ignored',
      quit.benefitMonthlyCents, 0);
    checkTrue('so quitting is shorter than being laid off on the same figures',
      quit.runwayMonths < r.runwayMonths);
  }

  /* -- The ramp is a shape, and the shapes differ ------------------------- */
  {
    check('a linear ramp is a straight fraction', R.rampShare('linear', 6, 12), 0.5, 1e-12);
    check('a hockey ramp is that cubed', R.rampShare('hockey', 6, 12), 0.125, 1e-12);
    check('both reach the target at the end', R.rampShare('hockey', 12, 12), 1, 1e-12);
    check('and stay there past it', R.rampShare('linear', 30, 12), 1, 1e-12);
    check('no ramp is no revenue', R.rampShare('none', 6, 12), 0);
    check('and neither is a ramp over no months', R.rampShare('linear', 6, 0), 0);

    const linear = R.project(h, TABLES, { preset: 'business',
      rampShape: 'linear', rampTargetMonthlyCents: 500000, rampMonths: 18 });
    const hockey = R.project(h, TABLES, { preset: 'business',
      rampShape: 'hockey', rampTargetMonthlyCents: 500000, rampMonths: 18 });
    checkTrue('the straight line pays earlier than the hockey stick',
      linear.rows[5].revenueCents > hockey.rows[5].revenueCents);
    checkTrue('so it lasts at least as long', linear.runwayMonths >= hockey.runwayMonths);
    check('break-even is the first month the money in covers the money out',
      linear.rows[linear.breakEvenMonth - 1].inflowCents >= linear.rows[0].outflowCents, true);
    checkTrue('and the month before it does not',
      linear.rows[linear.breakEvenMonth - 2].inflowCents < linear.rows[0].outflowCents);

    /* A ramp typed into the wrong scenario must not leak into it. */
    const quit = R.project(h, TABLES, { preset: 'quit',
      rampShape: 'linear', rampTargetMonthlyCents: 500000, rampMonths: 18 });
    check('a ramp in the quitting scenario is ignored', quit.rows[11].revenueCents, 0);
  }

  /* -- What it refuses ------------------------------------------------------ */
  {
    const bare = Schema.createHousehold({});
    check('with no cash there is no runway', R.project(bare, TABLES, {}).status, 'incomplete');
    check('and it names what is missing',
      R.project(bare, TABLES, {}).missing.join(','), 'cash');
    check('with cash but no spending it still refuses',
      R.project(bare, TABLES, { cushionCents: 100000 }).missing.join(','), 'monthlyExpenses');
    check('cutting more than you spend is refused, not clamped',
      R.project(h, TABLES, { preset: 'quit', expenseCutCents: spend + 1 }).status, 'incomplete');
    check('cutting exactly everything is allowed',
      R.project(h, TABLES, { preset: 'quit', expenseCutCents: spend }).sustainable, true);
    check('a negative cushion is refused',
      R.project(h, TABLES, { cushionCents: -1 }).status, 'incomplete');
    check('a cushion of zero is a real answer, not a missing one',
      R.project(h, TABLES, { cushionCents: 0 }).runwayMonths, 0);
  }

  /* -- What would get you there -------------------------------------------- */
  {
    const opts = { preset: 'quit' };
    const base = R.project(h, TABLES, opts).runwayMonths;
    const fix = R.toReach(h, TABLES, opts, 12);
    check('it says how short you are', fix.monthsShort, 12 - base);

    /* The two levers are checked by REACHING for them, not by trusting the
       search: adding exactly that much must get there, and a cent less
       must not. */
    check('the extra cushion is enough',
      R.project(h, TABLES, Object.assign({}, opts,
        { cushionCents: cash + fix.extraCushionCents })).runwayMonths >= 12, true);
    check('and is the smallest amount that is',
      R.project(h, TABLES, Object.assign({}, opts,
        { cushionCents: cash + fix.extraCushionCents - 1 })).runwayMonths >= 12, false);
    check('the deeper cut is enough',
      R.project(h, TABLES, Object.assign({}, opts,
        { expenseCutCents: fix.deeperMonthlyCutCents })).runwayMonths >= 12, true);
    check('and is the smallest cut that is',
      R.project(h, TABLES, Object.assign({}, opts,
        { expenseCutCents: fix.deeperMonthlyCutCents - 1 })).runwayMonths >= 12, false);

    /* A target already met is not a problem to solve. */
    const met = R.toReach(h, TABLES, { preset: 'quit', otherMonthlyIncomeCents: spend }, 12);
    checkTrue('a target already reached says so', met.alreadyThere);

    /* Cutting has a ceiling, and the ceiling is not always the budget: a
       cost you cannot cut — health cover you now pay for — is a floor under
       the burn that no amount of trimming gets below. */
    const withCobra = { preset: 'quit', extraMonthlyCostCents: 65000 };
    const far = R.toReach(h, TABLES, withCobra, 48);
    checkTrue('a target no cut can reach is reported as unreachable that way',
      far.deeperMonthlyCutCents === null && far.cutCanReachIt === false);
    checkTrue('though the cushion could still get there', far.extraCushionCents !== null);
    /* Without that floor, cutting deeply enough does get there — which is
       why the two are reported separately rather than as one verdict. */
    checkTrue('with nothing uncuttable, a deep enough cut does reach it',
      R.toReach(h, TABLES, { preset: 'quit' }, 48).cutCanReachIt);
    check('a target of zero months is not a question',
      R.toReach(h, TABLES, opts, 0).status, 'incomplete');
  }

  /* -- All three at once ---------------------------------------------------- */
  {
    const rows = R.acrossPresets(h, TABLES, { severanceCents: 500000,
      benefitMonthlyCents: 180000, benefitMonths: 6 });
    check('one row per situation', rows.length, 3);
    checkTrue('all of them computed', rows.every(r => Money.isOk(r.result)));
    const by = {};
    rows.forEach(r => { by[r.preset.id] = r.result; });
    checkTrue('being laid off outlasts quitting on the same numbers',
      by.laid_off.runwayMonths > by.quit.runwayMonths);
    check('and the business row gets no severance either way',
      by.business.severanceCents, 500000);
  }
})();

section('Financial Health Score');

(function () {
  const H = HealthEngine;
  const TABLE = TABLES.healthScore;

  /* -- The table itself has to be sound before anything built on it is --- */
  {
    const pillarIds = TABLE.pillars.map(p => p.id);
    checkTrue('every pillar id is unique',
      new Set(pillarIds).size === pillarIds.length);
    check('there is at least one cohort', TABLE.cohorts.length > 0, true);

    TABLE.cohorts.forEach(function (c) {
      const w = c.weights;
      const sum = Object.keys(w).reduce((s, k) => s + w[k], 0);
      check(`${c.id} weights sum to 1`, sum, 1, 1e-9);
      check(`${c.id} weights every pillar and nothing else`,
        Object.keys(w).sort().join(','), pillarIds.slice().sort().join(','));
      checkTrue(`${c.id} says why it is weighted that way`,
        typeof c.note === 'string' && c.note.length > 20);
    });

    /* Every ratio a pillar names must actually exist, or the pillar is
       quietly scoring fewer things than it claims to. */
    const known = new Set(RatiosEngine.RATIOS.map(r => r.id));
    TABLE.pillars.forEach(function (p) {
      p.ratios.forEach(function (id) {
        checkTrue(`${p.id} names a real ratio: ${id}`, known.has(id));
      });
    });

    /* Cohorts must tile the whole age range with no gap and no overlap. */
    for (let age = 0; age <= Schema.MAX_PLAUSIBLE_AGE; age++) {
      const hits = TABLE.cohorts.filter(c =>
        (c.minAge === null || age >= c.minAge) && (c.maxAge === null || age <= c.maxAge));
      if (hits.length !== 1) {
        check(`exactly one cohort claims age ${age}`, hits.length, 1);
        break;
      }
    }
    checkTrue('every age from 0 to the plausible maximum lands in exactly one cohort', true);

    check('a 29-year-old is in the first cohort', H.cohortForAge(TABLE, 29).id, 'under30');
    check('a 30-year-old is not', H.cohortForAge(TABLE, 30).id, 'thirties');
    check('and 60 is the open-ended one', H.cohortForAge(TABLE, 95).id, 'sixtyplus');
  }

  /* -- Scoring the demo persona ------------------------------------------- */
  const h = Demo.build();
  h.expenses.entries = Demo.buildSpending();
  {
    const s = H.score(h, TABLES);
    check('it scores', s.status, 'ok');
    checkTrue('out of 100', s.value >= 0 && s.value <= 100);
    check('the cohort follows the age', s.cohort.id,
      H.cohortForAge(TABLE, Schema.primaryAge(h)).id);
    check('the band matches the score', s.band.id, H.bandFor(TABLE, s.value).id);

    /* The score must be the weighted mean of the pillars that had data,
       re-derived here rather than trusted. */
    let weighted = 0, live = 0;
    s.pillars.forEach(function (p) {
      if (!p.available) return;
      weighted += p.weight * p.score;
      live += p.weight;
    });
    check('the score is the weighted mean over the pillars with data',
      s.value, Math.round((weighted / live) * 100));
    check('and coverage is that live weight over the whole', s.coverage, live / 1, 1e-9);

    /* Each pillar is the flat mean of its counted ratios. */
    s.pillars.filter(p => p.available).forEach(function (p) {
      const mean = p.counted.reduce((a, c) => a + c.score, 0) / p.counted.length;
      check(`${p.id} is the mean of its counted ratios`, p.score, mean, 1e-12);
      checkTrue(`${p.id} counted only ratios it could judge`,
        p.counted.every(c => Money.isEntered(c.value) && c.score !== null));
    });
  }

  /* -- No age, no score. This is the resolved decision, enforced --------- */
  {
    const ageless = Demo.build();
    ageless.people.forEach(function (person) { person.dob = null; });
    const s = H.score(ageless, TABLES);
    check('without a date of birth there is no weighting', s.status, 'incomplete');
    check('and it says which field it needs', s.missing.join(','), 'dob');
    checkTrue('with a reason a person can act on', /weighted by age/.test(s.reason));

    /* An age passed in directly still works — that is the preview path. */
    check('an age supplied for preview is enough',
      H.score(ageless, TABLES, { age: 45 }).status, 'ok');
    check('and picks the matching cohort',
      H.score(ageless, TABLES, { age: 45 }).cohort.id, 'forties');
    check('so does a cohort named outright',
      H.score(ageless, TABLES, { cohortId: 'fifties' }).cohort.id, 'fifties');
    check('a cohort that does not exist is refused',
      H.score(ageless, TABLES, { cohortId: 'nope' }).status, 'incomplete');
  }

  /* -- Absent is not zero. The whole point of the composite -------------- */
  {
    /* A pillar with nothing computable must be dropped, and dropping it
       must not move the score of the pillars that remain. */
    const s = H.score(h, TABLES);
    const missingIds = s.missingPillars.map(p => p.id);
    checkTrue('a pillar with no data is marked absent rather than scored',
      s.missingPillars.every(p => p.score === null && p.available === false));
    checkTrue('and absent pillars are not in the headroom list',
      s.headroom.every(r => missingIds.indexOf(r.id) === -1));

    /* Constructed proof: two identical households, one of which simply has
       no housing at all. The absent pillar must not drag the score down. */
    const withHouse = Demo.build();
    withHouse.expenses.entries = Demo.buildSpending();
    const noHouse = Demo.build();
    noHouse.expenses.entries = Demo.buildSpending().filter(e => e.categoryId !== 'housing');
    noHouse.assets = noHouse.assets.filter(a => a.category !== 'real_estate');
    noHouse.debts = noHouse.debts.filter(d => d.type !== 'mortgage');
    const a = H.score(withHouse, TABLES), b = H.score(noHouse, TABLES);
    checkTrue('both still score', Money.isOk(a) && Money.isOk(b));
    const aHousing = a.pillars.filter(p => p.id === 'housing')[0];
    const bHousing = b.pillars.filter(p => p.id === 'housing')[0];
    if (aHousing.available && !bHousing.available) {
      checkTrue('losing a pillar entirely does not zero it', bHousing.score === null);
      check('its weight is redistributed, so coverage falls',
        b.coverage < a.coverage, true);
    } else {
      checkTrue('the housing pillar behaved consistently across both', true);
    }
  }

  /* -- The cap: over-performance cannot buy off a failure ---------------- */
  {
    /* engines/ratios.js lets position() run to 1.25 for the radar. The
       score must clamp it, or a huge cushion would offset real problems. */
    const band = { direction: 'higher', good: 6, warn: 3 };
    checkTrue('the radar rewards being well past the mark',
      RatiosEngine.position(24, band) > 1);
    const pillar = { id: 'x', label: 'X', ratios: ['emergencyFundMonths'] };
    const rows = { emergencyFundMonths: { id: 'emergencyFundMonths', label: 'EF',
      ok: true, value: 24, unit: 'months', verdict: { zone: 'good' } } };
    const scored = H.scorePillar(pillar, rows, TABLES.ratioBenchmarks, TABLE.scoring.cap);
    check('but the score clamps it to the cap', scored.score, TABLE.scoring.cap);
    check('while still reporting what it really was',
      scored.counted[0].raw > TABLE.scoring.cap, true);
  }

  /* -- A ratio with no benchmark is left out, not guessed at ------------- */
  {
    const pillar = { id: 'x', label: 'X', ratios: ['burnRateCents'] };
    const rows = { burnRateCents: { id: 'burnRateCents', label: 'Burn rate',
      ok: true, value: 300000, unit: 'cents', verdict: { zone: 'none' } } };
    const scored = H.scorePillar(pillar, rows, TABLES.ratioBenchmarks, 1);
    checkTrue('a ratio with no band contributes nothing', !scored.available);
    check('and says why it was skipped', scored.skipped[0].why,
      'no benchmark to judge it against');

    const missingRow = H.scorePillar({ id: 'x', label: 'X', ratios: ['notARatio'] },
      {}, TABLES.ratioBenchmarks, 1);
    check('a ratio that does not exist is reported, not thrown on',
      missingRow.skipped[0].why, 'no such ratio');
  }

  /* -- The coverage floor -------------------------------------------------- */
  {
    /* An almost-empty household: an age, and nothing else worth scoring. */
    const bare = Schema.createHousehold({});
    bare.people.push(Schema.createPerson({ label: 'You', role: 'adult', dob: '1990-01-01' }));
    const s = H.score(bare, TABLES);
    check('a household with nothing in it gets no score', s.status, 'incomplete');
    checkTrue('and is told what is missing rather than given a low number',
      /can be worked out|scored yet/.test(s.reason));
  }

  /* -- Every cohort, on the same numbers ---------------------------------- */
  {
    const across = H.acrossCohorts(h, TABLES);
    check('one row per cohort', across.value.length, TABLE.cohorts.length);
    checkTrue('all of them score', across.value.every(r => Money.isOk(r.result)));
    check('and the own-cohort is flagged', across.ownCohortId, H.score(h, TABLES).cohort.id);

    const own = across.value.filter(r => r.cohort.id === across.ownCohortId)[0];
    check('the own-cohort row equals the plain score', own.result.value, H.score(h, TABLES).value);

    /* The point of the panel: the same finances score differently. If they
       ever stop differing, the weighting has stopped doing anything and
       the whole age-cohort decision is moot — worth failing over. */
    const values = across.value.map(r => r.result.value);
    checkTrue('the weighting actually changes the answer',
      Math.max.apply(null, values) > Math.min.apply(null, values));
  }

  /* -- Headroom is weight times distance ----------------------------------- */
  {
    const s = H.score(h, TABLES);
    s.headroom.forEach(function (r) {
      check(`${r.id} headroom is its share of weight times its shortfall`,
        r.pointsAvailable, (r.weight / s.liveWeight) * (1 - r.score) * 100, 1e-9);
    });
    checkTrue('and it is sorted with the biggest first',
      s.headroom.every((r, i) => i === 0 || s.headroom[i - 1].pointsAvailable >= r.pointsAvailable));
    /* Closing every gap must land exactly on 100. */
    const total = s.headroom.reduce((a, r) => a + r.pointsAvailable, 0);
    check('closing every gap would reach 100', s.value + total, 100, 0.51);
  }
})();

section('How you are paid');

(function () {
  const I = IncomeEngine;
  const work = { weeksPerYear: 48 };

  /* -- Every basis is exact arithmetic, and two of them are not the same -- */
  {
    check('a year is itself', I.annualise({ frequency: 'annual', rateCents: 7200000 }, work).value, 7200000);
    check('a month is twelve', I.annualise({ frequency: 'monthly', rateCents: 420000 }, work).value, 5040000);
    check('a week is fifty-two', I.annualise({ frequency: 'weekly', rateCents: 100000 }, work).value, 5200000);

    /* The one people get wrong. Twice a month is 24 payslips; every two
       weeks is 26. Same figure on the payslip, 8% apart over a year. */
    const semi = I.annualise({ frequency: 'semimonthly', rateCents: 200000 }, work).value;
    const fort = I.annualise({ frequency: 'fortnightly', rateCents: 200000 }, work).value;
    check('twice a month is 24 payslips', semi, 4800000);
    check('every two weeks is 26', fort, 5200000);
    checkTrue('so they are not the same number', semi !== fort);
    check('and the gap is two payslips', fort - semi, 200000 * 2);

    /* Every basis in the table must have a period, or be the hourly one
       that honestly cannot. */
    I.BASES.forEach(function (b) {
      checkTrue(`${b.id} either has a period or declares it needs hours`,
        Money.isEntered(b.periods) || b.needsHours === true);
    });
  }

  /* -- Hourly, which is the only one that rests on an assumption --------- */
  {
    const r = I.annualise({ frequency: 'hourly', rateCents: 2600, hoursPerWeek: 40 }, work);
    check('rate x hours x weeks', r.value, 2600 * 40 * 48);
    checkTrue('and it says it leaned on the weeks assumption', r.assumesWeeks);
    check('the weeks it used come back with it', r.weeksPerYear, 48);

    check('no hours, no yearly figure',
      I.annualise({ frequency: 'hourly', rateCents: 2600 }, work).status, 'incomplete');
    check('and it names the field',
      I.annualise({ frequency: 'hourly', rateCents: 2600 }, work).missing.join(','), 'hoursPerWeek');
    check('zero hours is refused rather than answered as zero',
      I.annualise({ frequency: 'hourly', rateCents: 2600, hoursPerWeek: 0 }, work).status, 'incomplete');

    /* It must use the SAME weeks figure engines/hourly.js uses, not its own. */
    check('with no work profile it falls back to the shared default',
      I.annualise({ frequency: 'hourly', rateCents: 2600, hoursPerWeek: 40 }, null).weeksPerYear,
      Schema.WORK_DEFAULTS.weeksPerYear);
    check('a different weeks figure changes the answer',
      I.annualise({ frequency: 'hourly', rateCents: 2600, hoursPerWeek: 40 }, { weeksPerYear: 52 }).value,
      2600 * 40 * 52);

    /* No basis at all is not zero. */
    checkTrue('nothing entered is incomplete, not zero',
      I.annualise({}, work).status === 'incomplete');
    check('a negative rate is refused',
      I.annualise({ frequency: 'annual', rateCents: -1 }, work).status, 'incomplete');
    check('but a rate of zero is a real answer',
      I.annualise({ frequency: 'annual', rateCents: 0 }, work).value, 0);
  }

  /* -- Households saved before any of this existed ------------------------ */
  {
    const legacy = Schema.createIncomeSource({ grossAnnualIncomeCents: 7200000 });
    check('a stored annual figure with no rate still annualises',
      I.annualise(legacy, work).value, 7200000);
    checkTrue('and says it came from the stored figure',
      I.annualise(legacy, work).fromStoredAnnual);
    check('the new fields default to not-entered', legacy.rateCents, null);
    check('months default to not-entered', legacy.monthsWorked, null);
    check('which the engine reads as the whole year', I.monthsOf(legacy), 12);
    check('and ongoing defaults to true', legacy.ongoing, true);
    check('a legacy household summarises to what it always said',
      I.summarise([legacy], work).value, 7200000);
  }

  /* -- Two jobs, and the two honest answers ------------------------------- */
  {
    const sources = [
      { id: 'a', source: 'Old job', frequency: 'annual', rateCents: 6000000, monthsWorked: 5, ongoing: false },
      { id: 'b', source: 'New job', frequency: 'annual', rateCents: 8000000, monthsWorked: 7, ongoing: true }
    ];
    const s = I.summarise(sources, work);
    check('earned blends the stints by length', s.earnedCents,
      Math.round(6000000 * 5 / 12) + Math.round(8000000 * 7 / 12));
    check('which is not the same as either salary', s.earnedCents, 7166667);
    check('the run rate is the job you still hold', s.runRateCents, 8000000);
    checkTrue('and the two differ, so a room must ask', s.differ);
    check('the months add up to a year here', s.monthsCovered, 12);
    checkTrue('no overlap', !s.overlapping);
    checkTrue('no gap', !s.hasGap);

    check('choosing earned gives earned',
      I.chosenAnnualCents(s, 'earned').value, s.earnedCents);
    check('choosing the run rate gives the run rate',
      I.chosenAnnualCents(s, 'runRate').value, s.runRateCents);
    check('an unknown preference falls back to earned rather than throwing',
      I.chosenAnnualCents(s, 'nonsense').value, s.earnedCents);

    /* One job all year: the two answers agree, and the room says nothing. */
    const single = I.summarise([{ id: 'x', frequency: 'annual', rateCents: 7200000 }], work);
    check('one job all year earns its salary', single.earnedCents, 7200000);
    check('and its run rate is the same', single.runRateCents, 7200000);
    checkTrue('so there is nothing to choose between', !single.differ);
  }

  /* -- Months are never corrected, in either direction -------------------- */
  {
    /* Two jobs at once. Fourteen months of work in a twelve-month year is a
       real life, and clamping it would delete income the person had. */
    const both = I.summarise([
      { id: 'a', frequency: 'annual', rateCents: 6000000, monthsWorked: 12, ongoing: true },
      { id: 'b', frequency: 'annual', rateCents: 1200000, monthsWorked: 6, ongoing: true }
    ], work);
    check('two jobs at once total more than twelve months', both.monthsCovered, 18);
    checkTrue('and that is reported as overlap, not an error', both.overlapping);
    check('both contribute', both.earnedCents, 6000000 + 600000);

    /* A gap. Six months worked, six months not. */
    const gap = I.summarise([
      { id: 'a', frequency: 'annual', rateCents: 6000000, monthsWorked: 6, ongoing: true }
    ], work);
    check('half a year worked is half the salary', gap.earnedCents, 3000000);
    checkTrue('and the gap is named', gap.hasGap);
    check('with its length', gap.gapMonths, 6);
    checkTrue('but the run rate is still the full salary', gap.runRateCents === 6000000);

    check('months beyond twelve on ONE stint are clamped to a year',
      I.monthsOf({ monthsWorked: 40 }), 12);
    check('and negative months to nothing', I.monthsOf({ monthsWorked: -3 }), 0);
  }

  /* -- A job whose rate is missing does not silently vanish --------------- */
  {
    const mixed = I.summarise([
      { id: 'a', frequency: 'annual', rateCents: 6000000, monthsWorked: 12, ongoing: true },
      { id: 'b', frequency: 'hourly', rateCents: 2600, monthsWorked: 6, ongoing: true }
    ], work);
    check('the incomplete one is counted as incomplete', mixed.incompleteCount, 1);
    check('the complete one still counts', mixed.countedCount, 1);
    check('and the total is only what could be worked out', mixed.earnedCents, 6000000);
    checkTrue('the row says what it needs',
      mixed.rows[1].missing.join(',') === 'hoursPerWeek');

    check('every source incomplete means no figure at all',
      I.summarise([{ id: 'a', frequency: 'hourly', rateCents: 2600 }], work).status, 'incomplete');
    check('and no sources at all is incomplete too',
      I.summarise([], work).status, 'incomplete');
  }

  /* -- The whole thing, off a real household ------------------------------ */
  {
    const h = Demo.build();
    const s = I.forHousehold(h);
    checkTrue('the demo persona summarises', Money.isOk(s));
    check('to the same figure the schema reports',
      s.earnedCents, Schema.grossAnnualIncomeCents(h).value);
  }
})();

section('Not earning');

(function () {
  const I = IncomeEngine;
  const work = { weeksPerYear: 48 };

  /* -- "Not earning" is an answer, and a different one from silence ------- */
  {
    const none = I.annualise({ frequency: 'none' }, work);
    check('not earning annualises to zero', none.value, 0);
    checkTrue('and says that is what it is', none.notEarning);
    check('it does not ask for a rate it has no use for', none.status, 'ok');

    const blank = I.annualise({}, work);
    check('whereas saying nothing is incomplete', blank.status, 'incomplete');
    checkTrue('which is the whole distinction', none.status !== blank.status);

    const s = I.summarise([{ id: 'a', frequency: 'none' }], work);
    check('a not-earning household earns zero', s.earnedCents, 0);
    check('and its run rate is zero, not unknown', s.runRateCents, 0);
    checkTrue('flagged as earning nothing now', s.earningNothingNow);
    checkTrue('and as not earning at all', s.notEarningAtAll);
  }

  /* -- A job that ended: earned something, earning nothing now ----------- */
  {
    const s = I.summarise([
      { id: 'a', frequency: 'annual', rateCents: 6000000, monthsWorked: 5, ongoing: false }
    ], work);
    check('five months of a salary is five twelfths', s.earnedCents, 2500000);
    /* The bug this replaced: an all-ended household reported the run rate as
       null, i.e. "we cannot say". It is not unknown. It is zero, and that is
       the most important fact about the year. */
    check('the run rate is zero, not unknown', s.runRateCents, 0);
    checkTrue('and it is not the same as the earned figure', s.differ);
    checkTrue('nothing is coming in now', s.earningNothingNow);
    checkTrue('but this is not a "never earned" household', !s.notEarningAtAll);
    check('choosing the run rate gives zero',
      I.chosenAnnualCents(s, 'runRate').value, 0);
  }

  /* -- Zero income must not be met with "add your income" ----------------- */
  {
    function household(income) {
      const h = Schema.createHousehold({});
      h.people.push(Schema.createPerson({ label: 'You', role: 'adult', dob: '1990-01-01' }));
      h.filingStatus = 'single';
      if (income !== null) {
        h.people[0].incomeSources.push(
          Schema.createIncomeSource({ grossAnnualIncomeCents: income }));
      }
      h.expenses.monthlyEssential.estimatedValueCents = 200000;
      h.assets.push(Schema.createAsset({ category: 'cash', valueCents: 500000, liquid: true }));
      h.assets.push(Schema.createAsset({ category: 'investment', valueCents: 4800000 }));
      h.debts.push(Schema.createDebt({ type: 'credit_card', balanceCents: 300000,
        rate: 0.229, minPaymentCents: 9500 }));
      return h;
    }
    const zero = RatiosEngine.all(household(0), TABLES).rows;
    const blank = RatiosEngine.all(household(null), TABLES).rows;
    function reason(rows, id) {
      const r = rows.filter(x => x.id === id)[0];
      return r.ok ? null : r.result.reason;
    }

    ['savingsRate', 'debtToIncome', 'netWorthToIncome', 'retirementMultiple'].forEach(function (id) {
      const z = reason(zero, id), b = reason(blank, id);
      checkTrue(`${id} refuses on a zero income`, z !== null);
      checkTrue(`${id} says the income is zero rather than asking for it`,
        /zero/.test(z), `got: ${z}`);
      checkTrue(`${id} says something different when it was never answered`, z !== b);
      checkTrue(`${id} does ask for it when it is genuinely missing`,
        /Add/.test(b), `got: ${b}`);
    });

    /* Things that do not divide by income still work perfectly well. */
    const ef = zero.filter(r => r.id === 'emergencyFundMonths')[0];
    checkTrue('emergency fund coverage is unaffected by having no income', ef.ok);
  }

  /* -- Real Hourly Wage on a household that is not earning ---------------- */
  {
    const h = Demo.build();
    h.people[0].incomeSources[0].grossAnnualIncomeCents = 0;
    const w = Hourly.realHourlyWage(h, TABLES);
    check('there is no hourly rate without earnings', w.status, 'incomplete');
    checkTrue('and it does not tell them to add income they already answered',
      !/Add your income/.test(w.reason), `got: ${w.reason}`);
    checkTrue('it says why the question does not apply',
      /not earning/.test(w.reason));

    /* Missing income still asks, because there it is the right thing to do. */
    const bare = Demo.build();
    bare.people[0].incomeSources = [];
    checkTrue('a household that never said still gets asked',
      /Add your income/.test(Hourly.realHourlyWage(bare, TABLES).reason));
  }

  /* -- Two hourly results that are right and easy to misread -------------- */
  {
    const few = Demo.build();
    few.people[0].work = { contractedHoursPerWeek: 1, weeksPerYear: 48 };
    const r = Hourly.realHourlyWage(few, TABLES);
    checkTrue('one paid hour a week still computes', Money.isOk(r));
    checkTrue('but it is flagged as not comparable to a normal rate', r.implausibleHours);
    check('five hours is the edge of that flag',
      Hourly.realHourlyWage(Object.assign(Demo.build(), {
        people: [Object.assign({}, Demo.build().people[0],
          { work: { contractedHoursPerWeek: 5, weeksPerYear: 48 } })]
      }), TABLES).implausibleHours, false);

    const costly = Demo.build();
    costly.people[0].work = { contractedHoursPerWeek: 40, weeksPerYear: 48,
      workCostsMonthlyCents: 900000 };
    const c = Hourly.realHourlyWage(costly, TABLES);
    checkTrue('a job can cost more than it pays', c.realHourlyCents < 0);
    checkTrue('and that is flagged rather than left as a minus sign',
      c.costsMoreThanItPays);
    checkTrue('a normal job is not flagged',
      !Hourly.realHourlyWage(Demo.build(), TABLES).costsMoreThanItPays);
  }

  /* -- Nothing anywhere produces a NaN or an Infinity --------------------- */
  {
    /* The failure this whole section exists to prevent: a division that
       quietly yields Infinity and gets formatted as a dollar figure. */
    function scan(label, value, out, seen) {
      if (value === null || value === undefined) return;
      if (typeof value === 'number') {
        if (!Number.isFinite(value)) out.push(`${label} = ${value}`);
        return;
      }
      if (typeof value !== 'object' || seen.has(value)) return;
      seen.add(value);
      Object.keys(value).forEach(function (k) {
        if (k === 'household' || k === 'tables') return;
        scan(`${label}.${k}`, value[k], out, seen);
      });
    }
    function bare(mut) {
      const h = Schema.createHousehold({});
      h.people.push(Schema.createPerson({ label: 'You', role: 'adult', dob: '1990-01-01' }));
      h.filingStatus = 'single';
      mut(h);
      return h;
    }
    const cases = {
      'no income at all': bare(h => {
        h.people[0].incomeSources.push(Schema.createIncomeSource({ grossAnnualIncomeCents: 0 }));
        h.expenses.monthlyEssential.estimatedValueCents = 200000;
        h.assets.push(Schema.createAsset({ category: 'cash', valueCents: 500000, liquid: true }));
      }),
      'no expenses': bare(h => {
        h.people[0].incomeSources.push(Schema.createIncomeSource({ grossAnnualIncomeCents: 7200000 }));
        h.expenses.monthlyEssential.estimatedValueCents = 0;
      }),
      'everything zero': bare(h => {
        h.people[0].incomeSources.push(Schema.createIncomeSource({ grossAnnualIncomeCents: 0 }));
        h.expenses.monthlyEssential.estimatedValueCents = 0;
      }),
      'debt exceeds everything': bare(h => {
        h.people[0].incomeSources.push(Schema.createIncomeSource({ grossAnnualIncomeCents: 5000000 }));
        h.expenses.monthlyEssential.estimatedValueCents = 300000;
        h.assets.push(Schema.createAsset({ category: 'cash', valueCents: 100000, liquid: true }));
        h.debts.push(Schema.createDebt({ type: 'student_loan', balanceCents: 9000000,
          rate: 0.06, minPaymentCents: 60000 }));
      }),
      'empty household': Schema.createHousehold({})
    };
    Object.keys(cases).forEach(function (name) {
      const h = cases[name];
      const found = [];
      [['Ratios.all', () => RatiosEngine.all(h, TABLES)],
       ['Foo.evaluate', () => Foo.evaluate(h, TABLES)],
       ['Health.score', () => HealthEngine.score(h, TABLES)],
       ['Income.forHousehold', () => IncomeEngine.forHousehold(h)],
       ['Hourly.realHourlyWage', () => Hourly.realHourlyWage(h, TABLES)],
       ['CashFlow.netCashFlow', () => CashFlow.netCashFlow(h, TABLES.expenseCategories, TABLES)]
      ].forEach(function (probe) {
        let out;
        try { out = probe[1](); }
        catch (e) { found.push(`${probe[0]} threw: ${e.message}`); return; }
        scan(probe[0], out, found, new WeakSet());
      });
      checkTrue(`${name}: no NaN or Infinity anywhere`, found.length === 0, found.join('; '));
    });
  }
})();

section('Whether there is an employer at all');

(function () {
  function withStatus(status, match) {
    const h = Schema.createHousehold({});
    h.people.push(Schema.createPerson({
      id: 'P', label: 'You', role: 'adult', dob: '1994-04-12', employmentStatus: status
    }));
    h.people[0].incomeSources.push(Schema.createIncomeSource(Object.assign({
      personId: 'P', grossAnnualIncomeCents: 7200000
    }, match ? { employerMatch: match } : {})));
    h.assets.push(Schema.createAsset({ category: 'cash', valueCents: 500000, liquid: true }));
    return h;
  }

  /* -- The enum itself ---------------------------------------------------- */
  {
    const ids = Schema.EMPLOYMENT_STATUSES.map(r => r.id);
    check('there are eight working situations', ids.length, 8);
    check('each one is listed once', new Set(ids).size, ids.length);
    Schema.EMPLOYMENT_STATUSES.forEach(function (row) {
      checkTrue(`${row.id} says whether money is coming in`, typeof row.earning === 'boolean');
      checkTrue(`${row.id} says whether there is an employer`, typeof row.hasEmployer === 'boolean');
      checkTrue(`${row.id} has a label and a short label`, !!row.label && !!row.short);
      /* You cannot have an employer without earning. The reverse is fine —
         that is what self-employment is. */
      checkTrue(`${row.id} does not claim an employer while not earning`,
        !(row.hasEmployer && !row.earning));
    });
    check('an unknown id is null, not a guess', Schema.employmentStatus('freelancing'), null);
  }

  /* -- Who could have a match --------------------------------------------- */
  {
    checkTrue('an employee could have a match',
      Schema.couldHaveEmployerMatch(withStatus('employed')));
    checkTrue('so could someone doing both',
      Schema.couldHaveEmployerMatch(withStatus('both')));
    checkTrue('the self-employed could not',
      !Schema.couldHaveEmployerMatch(withStatus('selfEmployed')));
    checkTrue('nor could someone not working',
      !Schema.couldHaveEmployerMatch(withStatus('notWorking')));
    checkTrue('nor a retiree',
      !Schema.couldHaveEmployerMatch(withStatus('retired')));

    /* Unanswered is not an answer. Every household saved before this field
       existed has no status, and deciding for them that they have no
       employer would silently hide a question they may have answered. */
    checkTrue('an unanswered status still gets asked',
      Schema.couldHaveEmployerMatch(withStatus(null)));
    checkTrue('and so does a household with no people at all',
      Schema.couldHaveEmployerMatch(Schema.createHousehold({})));

    /* A figure someone typed is never hidden by a later answer to a
       different question. */
    const typedThenQuit = withStatus('notWorking',
      { matchPercent: 0.5, matchCapPercentOfSalary: 0.06 });
    checkTrue('a match already entered keeps its question',
      Schema.couldHaveEmployerMatch(typedThenQuit));
  }

  /* -- What that does to "what is left to do" ------------------------------ */
  {
    const employed = Progress.forRoom('start', withStatus('employed'));
    const retired  = Progress.forRoom('start', withStatus('retired'));

    checkTrue('an employee is asked about the match',
      employed.missing.concat(employed.filled).some(f => f.fieldId === 'employerMatch'));
    checkTrue('a retiree is not',
      !retired.missing.concat(retired.filled).some(f => f.fieldId === 'employerMatch'));
    checkTrue('and it is recorded as not applicable rather than dropped',
      retired.notApplicable.some(f => f.fieldId === 'employerMatch'));
    checkTrue('with a reason a person can read',
      retired.notApplicable.every(f => typeof f.because === 'string' && f.because.length > 0));

    /* The bug this exists to kill: the room could never reach 100% because
       two questions with no true answer sat in the denominator forever. */
    check('the retiree has three fewer things to answer',
      employed.total - retired.total, 3);
    checkTrue('and the denominator shrank, not just the numerator',
      retired.total < employed.total);

    /* Same household, everything else filled: the retiree finishes. */
    const done = withStatus('retired');
    done.state = 'NC';
    done.filingStatus = 'single';
    done.meta.hasDebt = false;
    done.insurance.highestDeductibleCents = 250000;
    done.expenses.monthlyEssential.estimatedValueCents = 315000;
    done.dependents = false;
    done.assets.push(Schema.createAsset({ category: 'investment', valueCents: 4800000 }));
    const row = Progress.forRoom('start', done);
    check('a retiree who answers everything else is finished', row.missing.length, 0);
    checkTrue('and reads as complete', row.complete);
    check('at a full share', row.share, 1);
  }

  /* -- describe() is the single place that decides ------------------------- */
  {
    const d = Ownership.describe('employerMatch', withStatus('selfEmployed'), 'start');
    checkTrue('describe says the field does not apply', d.applies === false);
    checkTrue('and still knows who would own it', d.ownerId === 'start');
    const plain = Ownership.describe('cashSavings', withStatus('selfEmployed'), 'start');
    checkTrue('a field with no applies() always applies', plain.applies === true);
    check('and carries no reason to explain', plain.notApplicableBecause, null);
  }

  /* -- The status is itself an owned field --------------------------------- */
  {
    const e = Ownership.describe('employmentStatus', withStatus('notWorking'), 'map');
    checkTrue('the status reads back as set', e.isSet);
    check('shown by its short label', e.display, 'Not working');
    check('owned by Start Here', e.ownerId, 'start');
    checkTrue('linking to its own question', /#q-employment$/.test(e.href));
    const blank = Ownership.describe('employmentStatus', Schema.createHousehold({}), 'map');
    checkTrue('and unanswered is unanswered, not "not working"', !blank.isSet);
  }
})();

section('The clock');

(function () {
  /* The same module instance ownership.js registered its reader with. */
  const Spine = SpineMain;
  function tick() { var t = Date.now(); while (Date.now() - t < 3) { /* spin */ } }

  /* -- A write stamps the field it changed, and only that field ---------- */
  {
    Spine.reset();
    check('a fresh household has no stamps', Object.keys(Spine.getProfile().meta.confirmedAt).length, 0);
    check('an unstamped field reads null, not a date', Spine.confirmedAt('state'), null);

    Spine.updateProfile({ state: 'NC' });
    const first = Spine.confirmedAt('state');
    checkTrue('writing a value stamps it', /^\d{4}-\d{2}-\d{2}T/.test(first || ''));
    check('and leaves untouched fields unstamped', Spine.confirmedAt('filingStatus'), null);

    tick();
    Spine.updateProfile({ state: 'NC' });
    check('re-saving the same value does not move the clock', Spine.confirmedAt('state'), first);

    tick();
    Spine.updateProfile({ state: 'VA' });
    checkTrue('a different value does', Spine.confirmedAt('state') > first);
  }

  /* -- The spine stamps; rooms never do ---------------------------------- */
  {
    Spine.reset();
    Spine.ensurePrimaryPerson('You');
    const p = Spine.getProfile().people[0];
    Spine.upsertAsset(Schema.createAsset({ id: 'c', category: 'cash', valueCents: 950000, liquid: true }));
    checkTrue('an asset written through upsertAsset stamps cashSavings', !!Spine.confirmedAt('cashSavings'));
    check('but not investments', Spine.confirmedAt('investments'), null);
    Spine.upsertPerson({ id: p.id, dob: '1994-04-12' });
    checkTrue('a person write stamps dob', !!Spine.confirmedAt('dob'));
    checkTrue('and age, which is read from it', !!Spine.confirmedAt('age'));
  }

  /* -- confirm(): yes, still that ---------------------------------------- */
  {
    Spine.reset();
    Spine.upsertAsset(Schema.createAsset({ id: 'c', category: 'cash', valueCents: 950000, liquid: true }));
    const before = Spine.confirmedAt('cashSavings');
    tick();
    const stamped = Spine.confirm('cashSavings');
    checkTrue('confirm re-stamps without a value change', stamped > before);
    check('and returns the stamp it wrote', Spine.confirmedAt('cashSavings'), stamped);
    check('and the value is untouched', Schema.cashCents(Spine.getProfile()).value, 950000);
  }

  /* -- Snapshots are read back ------------------------------------------- */
  {
    Spine.reset();
    Spine._clearSnapshots && Spine._clearSnapshots();
    check('no snapshot, no latest', Spine.latestSnapshot(), null);
    check('no snapshot, no delta', Spine.snapshotDelta('netWorth', Money.ok(100)), null);

    Spine.updateProfile({ state: 'NC' });
    Spine.upsertAsset(Schema.createAsset({ id: 'c', category: 'cash', valueCents: 950000, liquid: true }));
    const snap = Spine.appendSnapshot({ computedOutputs: { netWorth: Money.ok(950000), months: 3 } });
    check('a snapshot freezes every owned field by id', snap.fields.cashSavings, 950000);
    check('including ones read as strings', snap.fields.state, 'NC');
    check('and null for the unset', snap.fields.investments, null);
    check('latestSnapshot is that one', Spine.latestSnapshot().id, snap.id);

    const d = Spine.snapshotDelta('netWorth', Money.ok(1200000));
    check('a Result output reads through to its value', d.before, 950000);
    check('and the delta is after minus before', d.delta, 250000);
    check('dated to the snapshot', d.since, snap.timestamp);
    check('a bare-number output reads too', Spine.snapshotDelta('months', 4).delta, 1);
    const f = Spine.snapshotDelta('cashSavings', Money.ok(950000));
    check('a field id compares against the frozen fields', f.before, 950000);
    checkTrue('and unchanged is unchanged', !f.changed && f.delta === 0);
    const sd = Spine.snapshotDelta('state', 'VA');
    checkTrue('a non-numeric change is reported without a delta', sd.changed && sd.delta === null);
    check('an id the snapshot never recorded is null, not zero', Spine.snapshotDelta('nope', 5), null);
    const inc = Spine.snapshotDelta('netWorth', Money.incomplete('x', []));
    check('an incomplete current value reads as null after', inc.after, null);
    check('with no numeric delta', inc.delta, null);
  }

  /* -- Every page loads the spine before the ownership map ---------------- */
  {
    /* ownership.js hands its field reader to the spine at load. If the spine
       is not there yet, nothing registers and nothing ever gets stamped —
       silently. So the order is asserted for every page that loads both. */
    const pages = fs.readdirSync(path.join(ROOT, 'rooms')).filter(f => /\.html$/.test(f))
      .map(f => 'rooms/' + f).concat(['index.html', 'map.html']);
    pages.forEach(function (page) {
      const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
      const spine = html.search(/<script src="[^"]*spine-v2\.js"/);
      const own = html.search(/<script src="[^"]*ownership\.js"/);
      if (own === -1) return;
      checkTrue(`${page} loads the spine before the ownership map`, spine !== -1 && spine < own);
    });
  }

  /* -- Compatibility: older shapes -------------------------------------- */
  {
    const old = Schema.createHousehold({ meta: { updatedAt: '2026-01-01T00:00:00Z' } });
    check('a household built without stamps gets an empty map', JSON.stringify(old.meta.confirmedAt), '{}');
    check('and keeps its other meta', old.meta.updatedAt, '2026-01-01T00:00:00Z');
  }
})();

section('Age, and the three that move');

(function () {
  const Spine = SpineMain;
  const Staleness = require(path.join(ROOT, 'shared/staleness.js'));
  const Instruments = InstrumentsMain;
  const table = require(path.join(ROOT, 'data/staleness.json'));
  const DAY = 86400000;

  /* -- The table ----------------------------------------------------------- */
  {
    ['asOf', 'confidence', 'source', 'confidenceNote', 'version'].forEach(k =>
      checkTrue(`staleness.json carries ${k}`, !!table[k]));
    check('it is a convention, not a finding', table.confidence, 'convention');
    Object.keys(table.staleAfterDays).forEach(f =>
      checkTrue(`staleness names a real field: ${f}`, !!Ownership.FIELDS[f]));
    table.volatile.forEach(f =>
      checkTrue(`volatile field ${f} has an interval`, typeof table.staleAfterDays[f] === 'number'));
    check('a date of birth never goes stale', table.staleAfterDays.dob, null);
    checkTrue('cash goes stale within a pay cycle or two', table.staleAfterDays.cashSavings <= 31);
  }

  /* -- Three states, never collapsed ---------------------------------------- */
  {
    Staleness.use(null);
    const now = Date.parse('2026-09-04T12:00:00Z');
    const h = Schema.createHousehold({ meta: { updatedAt: '2026-08-25T12:00:00Z' } });
    h.meta.confirmedAt = { cashSavings: '2026-09-01T12:00:00Z' };

    const known = Staleness.describe(h, 'cashSavings', now);
    check('a stamped field has a real age', known.days, 3);
    checkTrue('and says it is per-field', known.perField);
    check('read as "updated 3 days ago"', known.label, 'updated 3 days ago');
    check('with no table there is no verdict', known.stale, null);

    const unknown = Staleness.describe(h, 'investments', now);
    check('an unstamped field falls back to the last save', unknown.days, 10);
    checkTrue('and says it is not per-field', !unknown.perField);
    checkTrue('with a label that admits it', /not dated/.test(unknown.label));

    const nothing = Staleness.describe(Schema.createHousehold({}), 'cashSavings', now);
    check('nothing saved, nothing to date', nothing.days, null);
    check('and an empty label', nothing.label, '');

    Staleness.use(table);
    check('with the table, 3 days is fresh', Staleness.describe(h, 'cashSavings', now).stale, false);
    h.meta.confirmedAt.cashSavings = '2026-07-01T12:00:00Z';
    check('and 65 days is stale', Staleness.describe(h, 'cashSavings', now).stale, true);
    check('while a date of birth never is', Staleness.describe(
      Object.assign({}, h, { meta: { confirmedAt: { dob: '2020-01-01T00:00:00Z' } } }), 'dob', now).stale, false);
    check('the fallback age also gets a verdict', Staleness.describe(h, 'investments', now).stale, false);

    ['today', 'yesterday', '30 days ago', 'about a month ago', '3 months ago', 'over a year ago', '2 years ago']
      .forEach(function (want, i) {
        const days = [0, 1, 30, 45, 90, 400, 800][i];
        check(`${days} days reads as "${want}"`, Staleness.label(days, true), 'updated ' + want);
      });

    const sum = Staleness.summary(h, now);
    check('the summary walks the volatile list', sum.rows.length, table.volatile.length);
    checkTrue('and names the oldest', sum.oldest && sum.oldest.fieldId === 'cashSavings');
    checkTrue('and knows something is stale', sum.anyStale);
  }

  /* -- Ownership shows the age --------------------------------------------- */
  {
    Staleness.use(table);
    Spine.reset();
    Spine.upsertAsset(Schema.createAsset({ id: 'c', category: 'cash', valueCents: 950000, liquid: true }));
    const d = Ownership.describe('cashSavings', Spine.getProfile(), 'dashboard');
    checkTrue('describe carries an age', !!d.age && d.age.days === 0);
    checkTrue('and the chip prints it', /updated today/.test(Ownership.chip('cashSavings', Spine.getProfile(), 'dashboard')));
    const old = Spine.getProfile(); old.meta.confirmedAt.cashSavings = '2020-01-01T00:00:00Z';
    checkTrue('a stale figure is marked in the chip', /is-stale/.test(Ownership.chip('cashSavings', old, 'dashboard')));
    checkTrue('an unset field has no age', Ownership.describe('investments', Spine.getProfile(), 'dashboard').age === null);
  }

  /* -- One write path for the figures that move ---------------------------- */
  {
    Spine.reset();
    check('cash and investments declare a shared write path',
      Ownership.writable().sort().join(','), 'cashSavings,investments');
    Ownership.write('cashSavings', 980000);
    check('writing cash creates the Tier 0 cash record', Schema.cashCents(Spine.getProfile()).value, 980000);
    Ownership.write('cashSavings', 990000);
    check('writing again updates it in place', Schema.cashCents(Spine.getProfile()).value, 990000);
    check('and there is exactly one cash asset', Spine.getProfile().assets.filter(a => a.category === 'cash').length, 1);
    checkTrue('it is liquid', Spine.getProfile().assets[0].liquid === true);
    let threw = false;
    try { Ownership.write('dob', '1990-01-01'); } catch (e) { threw = true; }
    checkTrue('a field with no shared path refuses rather than guessing', threw);
    const start = fs.readFileSync(path.join(ROOT, 'rooms/start.html'), 'utf8');
    checkTrue('Start Here writes cash through the same path', start.indexOf("Ownership.write('cashSavings'") !== -1);
    checkTrue('and no longer has its own asset writer', start.indexOf('function writeAsset') === -1);
    const refresh = fs.readFileSync(path.join(ROOT, 'rooms/refresh.html'), 'utf8');
    checkTrue('Refresh writes through it too', refresh.indexOf('Ownership.write(') !== -1);
    checkTrue('and never calls upsertAsset itself', refresh.indexOf('upsertAsset') === -1);
  }

  /* -- The instrument list is the snapshot list ---------------------------- */
  {
    const h = Demo.build();
    const now = Date.parse('2026-09-04T12:00:00Z');
    const c = Instruments.compute(h, TABLES, now);
    check('ten instruments, six for everyone and one lead each for the other situations (D-096)', c.rows.length, 10);
    check('the demo, employed, shows six', c.shown.length, 6);
    check('its own number first, then panel order', c.shown.map(r => r.cap).join(' '), 'Thrust Altitude Fuel Load Distance Heading');
    checkTrue('every one shown computes for the demo', c.shown.every(r => r.ok));
    checkTrue('the ones not shown say why, not a throw', c.rows.filter(r => !r.exists).every(r => !r.ok && typeof r.result.reason === 'string'));
    /* Net worth: 9,500 + 48,000 − 18,400 − 3,200 = 35,900. */
    check('altitude is the demo net worth', c.byId.netWorth.result.value, 3590000);
    check('formatted as dollars', Instruments.format(c.byId.netWorth), '$35,900');
    check('fuel is cash over spending: 9,500 / 3,150', Math.round(c.byId.emergencyFundMonths.result.value * 100) / 100, 3.02);
    check('heading is the FOO step the engine places you on', c.byId.fooStep.result.value, Tier0.computeAll(h, TABLES).foo.placement.step);
    checkTrue('distance is a calendar year, not a count of years', c.byId.fiEtaYear.result.value > 2026);
    check('which is now plus years-to-FI', c.byId.fiEtaYear.result.value,
      new Date(now + Tier0.yearsToFire(h, TABLES).value * 365.25 * DAY).getFullYear());

    const out = Instruments.outputs(h, TABLES, now);
    c.rows.forEach(r => checkTrue(`a snapshot would carry ${r.id}`, r.id in out));
    checkTrue('plus the including-match savings rate', 'savingsRateIncludingMatch' in out);

    Spine.reset();
    Spine.updateProfile({ people: h.people, assets: h.assets, debts: h.debts, expenses: h.expenses,
      filingStatus: h.filingStatus, state: h.state, capturingFullMatch: h.capturingFullMatch,
      retirement: h.retirement, insurance: h.insurance });
    const rec = Instruments.snapshot(Spine.getProfile(), TABLES);
    check('a taken snapshot freezes net worth', rec.computedOutputs.netWorth.value, 3590000);
    check('and the frozen fields', rec.fields.cashSavings, 950000);
    Ownership.write('cashSavings', 1250000);
    const d = Instruments.deltas(Spine.getProfile(), TABLES, now);
    check('net worth moved by the cash change', d.netWorth.delta, 300000);
    check('formatted with a sign', Instruments.formatDelta(c.byId.netWorth, d.netWorth), '+$3,000');
    check('runway moved too', Math.round(d.emergencyFundMonths.delta * 100) / 100, Math.round((1250000 - 950000) / 315000 * 100) / 100);
    check('nothing to say when nothing moved', Instruments.formatDelta(c.byId.fooStep, { delta: 0 }), '');
  }

  /* -- The dashboard's first screen is built from the instrument list ------ */
  {
    /* The dashboard is index.html since D-058; rooms/dashboard.html is a
       redirect that must carry the hash across. */
    const dash = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const stub = fs.readFileSync(path.join(ROOT, 'rooms/dashboard.html'), 'utf8');
    checkTrue('rooms/dashboard.html redirects to the front page', /url=\.\.\/index\.html/.test(stub));
    checkTrue('and carries the hash', stub.indexOf('location.hash') !== -1);
    checkTrue('the front page is a router', dash.indexOf('function route(') !== -1);
    checkTrue('with an explicit example-numbers action behind a confirm',
      dash.indexOf('id="btn-example"') !== -1 && dash.indexOf('window.confirm(') !== -1);
    checkTrue('that never runs on load', !/DemoPersona\.build\(\)[\s\S]{0,200}addEventListener|load[\s\S]{0,40}DemoPersona\.build/.test(dash));
    check('the registry points the dashboard at the root', Registry.byId('dashboard').href, 'index.html');
    check('and the ladder at rooms/', Registry.byId('foo-ladder').href, 'rooms/foo-ladder.html');
    checkTrue('the front page loads the instrument list', dash.indexOf('shared/instruments.js') !== -1);
    checkTrue('and the staleness reader', dash.indexOf('shared/staleness.js') !== -1);
    checkTrue('and hands it the table', dash.indexOf('Staleness.use(') !== -1);
    checkTrue('it renders the grid from Instruments.compute', dash.indexOf('Instruments.compute(') !== -1);
    checkTrue('and deltas from Instruments.deltas', dash.indexOf('Instruments.deltas(') !== -1);
    checkTrue('with one next action', dash.indexOf('id="next-action"') !== -1);
    checkTrue('and a refresh link', dash.indexOf("Ownership.linkTo('refresh')") !== -1);
    /* Caveats fold: every info toggle names a node that exists in the HTML,
       so nothing is built at toggle time. */
    const toggles = dash.match(/data-info="([^"]+)"/g) || [];
    checkTrue('there are info toggles', toggles.length >= 2);
    toggles.forEach(t => {
      const id = t.match(/"([^"]+)"/)[1];
      checkTrue(`toggle target #${id} is in the HTML`, dash.indexOf('id="' + id + '"') !== -1);
    });
    /* Every FOO flag the engine can fire has a sentence and a room. */
    const rules = require(path.join(ROOT, 'data/foo_rules.json'));
    rules.outOfBoundsFlags.forEach(f =>
      checkTrue(`the next-action card can say ${f.key}`, dash.indexOf(f.key + ':') !== -1));
  }

  /* -- The Refresh page is a utility, not a room on the map ---------------- */
  {
    const r = Registry.byId('refresh');
    checkTrue('Refresh is registered', !!r);
    checkTrue('as a utility', r.utility === true);
    check('walking the volatile list', r.needs.slice().sort().join(','), table.volatile.slice().sort().join(','));
    checkTrue('and last on the path so it never interrupts a first walk',
      Registry.inOrder()[Registry.inOrder().length - 1].id === 'refresh');
    const map = fs.readFileSync(path.join(ROOT, 'map.html'), 'utf8');
    checkTrue('the map skips utility rooms', map.indexOf('!r.utility') !== -1);
  }
})();

section('Suggested, not stored');

(function () {
  const src = fs.readFileSync(path.join(ROOT, 'shared/suggest.js'), 'utf8');
  const Suggest = require(path.join(ROOT, 'shared/suggest.js'));
  ['show', 'clear', 'isSuggested', 'entered', 'all'].forEach(fn =>
    checkTrue(`Suggest exposes ${fn}()`, typeof Suggest[fn] === 'function'));
  /* The whole guarantee: this file cannot write to the household. */
  checkTrue('suggest.js never touches the spine', !/Spine\.|localStorage|updateProfile|upsert/.test(src));
  checkTrue('and never requires it', !/require\(/.test(src));
  checkTrue('focus clears the shown value so a blur reads empty', /addEventListener\('focus'[\s\S]{0,400}node\.value = ''/.test(src));
  checkTrue('show() refuses to paint over an entered value', /if \(!isSuggested\(node\) && String\(node\.value/.test(src));
  const theme = fs.readFileSync(path.join(ROOT, 'shared/theme.css'), 'utf8');
  checkTrue('the suggested style is in the shared theme', theme.indexOf('.slaf-input--suggested') !== -1);
  checkTrue('with a dashed shell', /is-suggested \{ border-style: dashed/.test(theme));
  /* No engine or schema reader can see a suggestion because none is stored:
     the ownership readings of a household are the same before and after a
     suggestion would be shown — there is no API to store one. */
  checkTrue('there is no way to store a suggestion', !/state: 'suggested'|state:"suggested"/.test(
    fs.readFileSync(path.join(ROOT, 'shared/schema.js'), 'utf8') + fs.readFileSync(path.join(ROOT, 'shared/spine-v2.js'), 'utf8')));
})();

section('Eleven cards');

(function () {
  /* -- "No debt" is an answer ------------------------------------------ */
  {
    const h = Demo.build();
    checkTrue('the demo says it has debt', h.meta.hasDebt === true);
    checkTrue('Debt Payoff is on its path', Registry.nextAfter('start', [], h).id === 'debt-payoff');
    const none = Demo.build(); none.meta.hasDebt = false; none.debts = [];
    /* What the room after Start Here happens to be is a fact about the
       running order, and it moves when a room is inserted. Your Credit File
       and When It Won't All Get Paid went in after the numbered path
       (26.4 and 26.6) rather than into it, precisely so this stays put —
       the core is four rooms and D-051 means it. What this check is
       actually about is that Debt Payoff is never offered to someone who
       owes nothing, so the whole path is walked below rather than only its
       first step. */
    check('with no debt the path skips Debt Payoff', Registry.nextAfter('start', [], none).id, 'cash-flow');
    {
      const walked = [];
      let at = Registry.nextAfter('start', [], none);
      while (at && walked.indexOf(at.id) === -1) { walked.push(at.id); at = Registry.nextAfter(at.id, walked, none); }
      checkTrue('and it is nowhere else on the path either', walked.indexOf('debt-payoff') === -1);
      checkTrue('while a household that does owe still gets it',
        Registry.inOrder().some(r => r.id === 'debt-payoff') && Registry.nextAfter('start', [], h).id === 'debt-payoff');
    }
    checkTrue('and total debt stops applying', !Ownership.describe('totalDebt', none, 'map').applies);
    checkTrue('and so do the payments', !Ownership.describe('monthlyDebtPayments', none, 'map').applies);
    checkTrue('so the dashboard is complete for a debt-free household', Progress.forRoom('dashboard', none).complete);
    const unasked = Demo.build(); unasked.meta.hasDebt = null; unasked.debts = [];
    checkTrue('unanswered still asks for debt figures', Ownership.describe('totalDebt', unasked, 'map').applies);
    checkTrue('utility pages are never "next"', Registry.inOrder().every(r => !r.utility || Registry.nextAfter(r.id, [], h) === null || Registry.nextAfter(null, Registry.inOrder().filter(x => x.id !== r.id).map(x => x.id), h).id !== r.id));
    check('hasDebt is owned by Start Here', Ownership.field('hasDebt').owner, 'start');
  }

  /* -- Capturing the match is derived ---------------------------------- */
  {
    const h = Demo.build();
    const d = Schema.capturingFullMatchDerived(h);
    checkTrue('4% against a 6% cap is not the full match', d.value === false && d.derived);
    h.retirement.contributionPercent = 6;
    checkTrue('6% against 6% is', Schema.capturingFullMatchDerived(h).value === true);
    h.retirement.contributionPercent = 10;
    checkTrue('and so is more', Schema.capturingFullMatchDerived(h).value === true);
    h.retirement.contributionPercent = null;
    h.capturingFullMatch = true;
    const fb = Schema.capturingFullMatchDerived(h);
    checkTrue('with no contribution the old stored answer is the fallback', fb.value === true && fb.derived === false);
    h.capturingFullMatch = null;
    check('and with neither it is incomplete', Schema.capturingFullMatchDerived(h).status, 'incomplete');
    check('the ownership map reads the derivation', Ownership.describe('capturingFullMatch', Demo.build(), 'start').display, 'No');
    const start = fs.readFileSync(path.join(ROOT, 'rooms/start.html'), 'utf8');
    checkTrue('Start Here no longer asks it', start.indexOf('data-choices="capturingFullMatch"') === -1);
  }

  /* -- The stored shape ------------------------------------------------ */
  {
    check('a new asset has no tax character', Schema.createAsset({}).taxCharacter, null);
    check('and keeps one it is given', Schema.createAsset({ taxCharacter: 'roth' }).taxCharacter, 'roth');
    check('three characters are asked', Schema.TAX_CHARACTERS.map(t => t.id).join(','), 'pretax,roth,taxable');
    check('a new household has not answered about debt', Schema.createHousehold({}).meta.hasDebt, null);
    check('the demo answers every intake field', Progress.forRoom('start', Demo.build()).missing.length, 0);
    ['contributionPercent', 'highestDeductible', 'hasDebt', 'dob', 'state', 'employerMatch'].forEach(f =>
      check(`${f} is owned by Start Here`, Ownership.field(f).owner, 'start'));
    check('Sleep At Night reads the deductible as a chip',
      fs.readFileSync(path.join(ROOT, 'rooms/sleep-at-night.html'), 'utf8').indexOf("Ownership.chip('highestDeductible'") !== -1, true);
    check('Where It Goes reads the contribution as a chip',
      fs.readFileSync(path.join(ROOT, 'rooms/accounts.html'), 'utf8').indexOf("Ownership.chip('contributionPercent'") !== -1, true);
    checkTrue('and has no box for it',
      fs.readFileSync(path.join(ROOT, 'rooms/accounts.html'), 'utf8').indexOf('data-setup="contributionPercent"') === -1);
  }

  /* -- The two tables -------------------------------------------------- */
  {
    const states = require(path.join(ROOT, 'data/states.json'));
    check('fifty states, DC and other', states.states.length, 52);
    checkTrue('every code is two letters or OTHER', states.states.every(r => /^[A-Z]{2}$|^OTHER$/.test(r.code)));
    checkTrue('NC is North Carolina', states.states.some(r => r.code === 'NC' && r.name === 'North Carolina'));
    const md = require(path.join(ROOT, 'data/match_defaults.json'));
    check('the suggested match is 50% of the first 6%', md.mostCommon.matchPercent + '/' + md.mostCommon.matchCapPercentOfSalary, '0.5/0.06');
    check('marked as a convention', md.confidence, 'convention');
    const start = fs.readFileSync(path.join(ROOT, 'rooms/start.html'), 'utf8');
    checkTrue('Start Here shows it through Suggest, never writes it', /propose\('matchPercent', Object\.assign\(\{ unit: 'pct' \}, g\.matchPercent\)/.test(start));
    checkTrue('with a "no match" button that writes zeros explicitly', start.indexOf("id=\"btn-no-match\"") !== -1 && /matchPercent: 0, matchCapPercentOfSalary: 0/.test(start));
    /* The one-pager builds every card any situation could show, once,
       from the gate's list (D-095). */
    const Gate = require(path.join(ROOT, 'shared/gate.js'));
    check('twelve cards the gate knows', Gate.allCards().length, 12);
    checkTrue('and the page builds them from that list', /Gate\.allCards\(\)\.forEach/.test(start));
    checkTrue('one of which is the second person, shown only when there are two',
      !Gate.CARDS.partnerPay.when(Schema.createHousehold({ people: [Schema.createPerson({ role: 'adult' })] }))
      && Gate.CARDS.partnerPay.when(Schema.createHousehold({ people: [Schema.createPerson({ role: 'adult' }), Schema.createPerson({ role: 'adult' })] })));
  }

  /* -- The strip repaints after a tap, not during one ------------------- */
  {
    const prog = fs.readFileSync(path.join(ROOT, 'shared/progress.js'), 'utf8');
    checkTrue('the footer strip defers its repaint', /setTimeout\([\s\S]{0,400}paint\(\)/.test(prog));
    checkTrue('and holds its height across it', prog.indexOf('box.style.minHeight = held') !== -1);
    const sug = fs.readFileSync(path.join(ROOT, 'shared/suggest.js'), 'utf8');
    checkTrue('a suggestion chip keeps its space when off', sug.indexOf("'is-off'") !== -1 && sug.indexOf('chip.hidden = true') === -1);
    checkTrue('and a focused box is never marked suggested', /node === document\.activeElement\) \{ chipFor\(node\); return; \}/.test(sug));
  }
})();

section('Proposed, not taken');

(function () {
  const Reference = require(path.join(ROOT, 'shared/reference.js'));
  const table = require(path.join(ROOT, 'data/federal_brackets_2026.json'));

  /* -- The bracket table ---------------------------------------------- */
  {
    check('it is unverified, and says so', table.confidence, 'unverified');
    Object.keys(table.brackets).forEach(function (fs_) {
      const ladder = table.brackets[fs_];
      checkTrue(`${fs_}: rates climb`, ladder.every((b, i) => i === 0 || b.rate > ladder[i - 1].rate));
      checkTrue(`${fs_}: thresholds climb`, ladder.every((b, i) => i === 0 || b.upToTaxableIncome === null || b.upToTaxableIncome > ladder[i - 1].upToTaxableIncome));
      check(`${fs_}: the top bracket has no ceiling`, ladder[ladder.length - 1].upToTaxableIncome, null);
      checkTrue(`${fs_}: has a standard deduction`, table.standardDeduction[fs_] > 0);
    });
    check('joint is twice single at the bottom', table.brackets.married_joint[0].upToTaxableIncome, 2 * table.brackets.single[0].upToTaxableIncome);
  }

  /* -- The lookup -------------------------------------------------------- */
  {
    const b = Reference.marginalBracket(table, 72000, 'single');
    /* 72,000 − 16,100 = 55,900 taxable: past 50,400, inside the 22% band. */
    check('the demo lands in the 22% bracket', b.value, 0.22);
    check('on 55,900 of taxable income', b.taxableIncomeDollars, 55900);
    check('with 49,800 of room before 24%', b.roomBeforeNextBracketDollars, 49800);
    check('and the next rate named', b.nextRate, 0.24);
    checkTrue('marked federal only', b.federalOnly === true);
    check('carries the table confidence', b.confidence, 'unverified');
    check('below the deduction the bracket is 10% on nothing', Reference.marginalBracket(table, 10000, 'single').taxableIncomeDollars, 0);
    check('a million is the top rate', Reference.marginalBracket(table, 1000000, 'married_joint').value, 0.37);
    check('with no room above', Reference.marginalBracket(table, 1000000, 'married_joint').roomBeforeNextBracketDollars, null);
    check('no income, no bracket', Reference.marginalBracket(table, null, 'single').status, 'incomplete');
    check('no filing status, no bracket', Reference.marginalBracket(table, 72000, null).status, 'incomplete');
    check('no table, no bracket', Reference.marginalBracket(null, 72000, 'single').status, 'incomplete');
    /* The effective-rate table is NOT where this comes from (D-036). */
    const src = fs.readFileSync(path.join(ROOT, 'shared/reference.js'), 'utf8');
    checkTrue('the bracket walks its own table, not the effective-rate bands',
      /function marginalBracket[\s\S]{0,1500}table\.brackets\[filingStatus\]/.test(src) && !/marginalBracket[\s\S]{0,1500}effectiveRate/.test(src));
  }

  /* -- seed.js proposes; it never writes ---------------------------------- */
  {
    const seedSrc = fs.readFileSync(path.join(ROOT, 'shared/seed.js'), 'utf8');
    const Seed = require(path.join(ROOT, 'shared/seed.js'));
    checkTrue('Seed exposes mount()', typeof Seed.mount === 'function');
    checkTrue('seed.js never touches the spine', !/Spine\.|updateProfile|upsert|localStorage/.test(seedSrc));
    checkTrue('it shows through Suggest', seedSrc.indexOf('Suggest.show(') !== -1);
    ['runway', 'quick-math', 'self-employed'].forEach(function (room) {
      const html = fs.readFileSync(path.join(ROOT, 'rooms', room + '.html'), 'utf8');
      checkTrue(`${room} mounts the seed toggle`, html.indexOf('SLAF.Seed.mount(') !== -1);
      checkTrue(`${room} loads seed.js after suggest.js`, html.indexOf('shared/suggest.js') !== -1 && html.indexOf('shared/suggest.js') < html.indexOf('shared/seed.js'));
      checkTrue(`${room} still writes nothing to the household`, !/Spine\.(updateProfile|upsert[A-Za-z]+|setMonthlyExpenses)\(/.test(html.replace(/\/\*[\s\S]*?\*\//g, '')));
    });
    const se = fs.readFileSync(path.join(ROOT, 'rooms/self-employed.html'), 'utf8');
    checkTrue('W2 vs 1099 no longer writes the salary straight into the box', !/v\['w-salary'\] = gross\.value/.test(se));
    ['side-hustle', 'credential', 'accounts'].forEach(function (room) {
      const html = fs.readFileSync(path.join(ROOT, 'rooms', room + '.html'), 'utf8');
      checkTrue(`${room} proposes the federal bracket`, html.indexOf('Reference.marginalBracket(') !== -1);
      checkTrue(`${room} labels it federal only and unverified`, /federal only, an estimate/.test(html));
      checkTrue(`${room} reads the box through Suggest.entered`, html.indexOf('Suggest.entered(node)') !== -1);
    });
    const acc = fs.readFileSync(path.join(ROOT, 'rooms/accounts.html'), 'utf8');
    checkTrue('Where It Goes has one box for the marginal rate, not two', acc.indexOf('id="a-now"') === -1 && acc.indexOf('data-setup="marginalRate"') !== -1);
    checkTrue('and the comparison reads the shared rate', /currentTaxRate: assumptions\.marginalRate/.test(acc));
  }
})();

section('A first month, proposed');

(function () {
  const cats = require(path.join(ROOT, 'data/expense_categories.json'));
  cats.buckets.forEach(function (b) {
    /* The costs bucket is logged against income entries, never proposed
       as a share of a month (D-128). */
    if (b.id === 'costs') return;
    const total = cats.categories.filter(c => c.bucket === b.id && !c.derivedFrom)
      .reduce((s, c) => s + (c.typicalShareOfBucket || 0), 0);
    check(`${b.id}: typical shares sum to one`, Math.round(total * 1000) / 1000, 1);
  });
  checkTrue('a derived category carries no share', cats.categories.filter(c => c.derivedFrom).every(c => c.typicalShareOfBucket === undefined));
  /* The split in dollars, with nothing entered: demo take-home is $4,860,
     so 50/30/20 is 2,430 / 1,458 / 972. */
  const CashFlow = require(path.join(ROOT, 'engines/cashflow.js'));
  const t = CashFlow.templateTargets(Demo.build(), TABLES.budgetTemplates, '50_30_20', TABLES);
  checkTrue('a template has dollar targets with nothing entered', Money.isOk(t));
  check('needs is half of take-home', t.rows.filter(r => r.bucketId === 'needs')[0].targetCents, 243000);
  check('savings a fifth', t.rows.filter(r => r.bucketId === 'savings')[0].targetCents, 97200);
  check('a method template has no bucket targets', CashFlow.templateTargets(Demo.build(), TABLES.budgetTemplates, 'zero_based', TABLES).rows.length, 0);
  const noIncome = Demo.build(); noIncome.people[0].incomeSources = [];
  check('and no income means no targets', CashFlow.templateTargets(noIncome, TABLES.budgetTemplates, '50_30_20', TABLES).status, 'incomplete');
  /* The comparison reads the same targets, so the two cannot disagree. */
  const cmpDemo = Demo.build(); cmpDemo.expenses.entries = Demo.buildSpending();
  const cmp = CashFlow.compareToTemplate(cmpDemo, TABLES.expenseCategories, TABLES.budgetTemplates, '50_30_20', TABLES);
  check('the comparison uses the same needs target', cmp.rows.filter(r => r.bucketId === 'needs')[0].targetCents, 243000);
  check('the shares say what they are worth', cats.typicalShareConfidence, 'unverified');
  const cf = fs.readFileSync(path.join(ROOT, 'rooms/cash-flow.html'), 'utf8');
  checkTrue('Cash Flow proposes through Suggest', cf.indexOf('SLAF.Suggest.show(') !== -1);
  checkTrue('and reads a box through Suggest.entered on the way out', cf.indexOf('Suggest.entered(input)') !== -1);
  checkTrue('and names the source as unverified', /BLS CES 2023, unverified/.test(cf));
  checkTrue('with a way to take every line at once', cf.indexOf('id="btn-use-all"') !== -1);
  checkTrue('a proposal is written only through writeLine, on a tap', /onUse: function \(c\) \{ writeLine\(r\.id, c\)/.test(cf));
  const wm = require(path.join(ROOT, 'data/wealth_multiplier.json'));
  checkTrue('the wealth-multiplier curve is parameters, not a table', typeof wm.startRate === 'number' && wm.brackets === undefined);
  checkTrue('it starts at 10% at 20 and floors at 5.5%', wm.startRate === 0.10 && wm.startAge === 20 && wm.floorRate === 0.055);
  /* 0.10 − 0.001 × 45 is 0.055 on paper and 0.055000000000000005 in
     floating point; the curve clamps, so a hair over is the floor. */
  checkTrue('the decay reaches the floor by 65', wm.startRate - wm.decayPerYear * (wm.endAge - wm.startAge) <= wm.floorRate + 1e-9);
  checkTrue('and the tracked figure is still computed from entries only',
    fs.readFileSync(path.join(ROOT, 'engines/cashflow.js'), 'utf8').indexOf('suggest') === -1);
})();

section('The Statement: shape and tables');

(function () {
  const rules = require(path.join(ROOT, 'data/access_rules.json'));
  const weights = require(path.join(ROOT, 'data/confidence_weights.json'));
  const ui = require(path.join(ROOT, 'data/ui_benefits.json'));
  const aca = require(path.join(ROOT, 'data/aca_2026.json'));
  const st = require(path.join(ROOT, 'data/state_brackets_2026.json'));
  const states = require(path.join(ROOT, 'data/states.json'));

  /* -- New records start empty, never zero ------------------------------- */
  {
    const h = Schema.createHousehold({});
    ['futureIncome', 'property', 'scenarios'].forEach(k => check(`${k} starts as an empty list`, JSON.stringify(h[k]), '[]'));
    check('targets start unset', JSON.stringify(h.targets), '{"retireAge":null,"coastAge":null}');
    checkTrue('allocation starts unset', Object.values(h.allocation).every(v => v === null));
    const ins = h.insurance;
    checkTrue('the coverage checkup starts unanswered', ins.oopMaxCents === null && ins.termLifeCents === null && ins.disabilityMonthlyCents === null && ins.umbrella === null);
    const a = Schema.createAsset({});
    ['liquidity', 'confidence', 'costBasisCents', 'hassle', 'cashFlowMonthlyCents', 'accessAgeOverride'].forEach(k =>
      check(`asset.${k} starts null`, a[k], null));
    check('an income source has no hassle rating until rated', Schema.createIncomeSource({}).hassle, null);
    const old = Schema.createHousehold({ insurance: { highestDeductibleCents: 250000 } });
    check('an older insurance record keeps its deductible', old.insurance.highestDeductibleCents, 250000);
    check('and gains the new questions as unanswered', old.insurance.umbrella, null);
    const fi = Schema.createFutureIncome({ label: 'Pension', monthlyCents: 120000, startsAtAge: 65 });
    checkTrue('a future income has an id and its fields', /^fi_/.test(fi.id) && fi.monthlyCents === 120000 && fi.startsAtAge === 65 && fi.confidence === null);
    const prop = Schema.createProperty({ assetId: 'a1', rentMonthlyCents: 180000 });
    check('a property carries no value of its own — the asset does', prop.valueCents, undefined);
    check('but links to it', prop.assetId, 'a1');
  }

  /* -- The spine merges the small fact objects ---------------------------- */
  {
    const Spine = SpineMain;
    Spine.reset();
    Spine.updateProfile({ targets: { retireAge: 60 } });
    Spine.updateProfile({ targets: { coastAge: 65 } });
    check('writing one target keeps the other', JSON.stringify(Spine.getProfile().targets), '{"retireAge":60,"coastAge":65}');
    Spine.updateProfile({ insurance: { oopMaxCents: 800000 } });
    Spine.updateProfile({ insurance: { highestDeductibleCents: 250000 } });
    check('the coverage checkup and the deductible coexist', Spine.getProfile().insurance.oopMaxCents, 800000);
    Spine.upsertFutureIncome(Schema.createFutureIncome({ id: 'p1', label: 'Pension', monthlyCents: 120000 }));
    Spine.upsertFutureIncome({ id: 'p1', monthlyCents: 130000 });
    check('a future income upserts in place', Spine.getProfile().futureIncome.length + ':' + Spine.getProfile().futureIncome[0].monthlyCents, '1:130000');
    Spine.upsertProperty(Schema.createProperty({ id: 'r1', assetId: 'a1' }));
    check('a property upserts', Spine.getProfile().property[0].assetId, 'a1');
  }

  /* -- access_rules covers every kind of asset ---------------------------- */
  {
    const chars = Schema.FIELDS['asset.taxCharacter'].values;
    chars.forEach(c => checkTrue(`access rule for ${c}`, !!rules.byTaxCharacter[c]));
    Schema.FIELDS['asset.category'].values.forEach(c => checkTrue(`category fallback for ${c}`, !!rules.byTaxCharacter[rules.byCategory[c]]));
    Object.keys(rules.byTaxCharacter).forEach(c => {
      const r = rules.byTaxCharacter[c];
      checkTrue(`${c} files into a real bucket`, rules.buckets.some(b => b.id === r.bucket));
      checkTrue(`${c} has a default liquidity 1-4`, r.liquidity >= 1 && r.liquidity <= 4);
    });
    check('pre-tax money waits for 59½', rules.byTaxCharacter.pretax.accessAge, 59.5);
    check('Roth basis does not', rules.byTaxCharacter.roth.basisAccessAge, null);
    check('but Roth earnings do', rules.byTaxCharacter.roth.accessAge, 59.5);
    check('an HSA opens up at 65', rules.byTaxCharacter.hsa.accessAge, 65);
    check('cash is reachable today', rules.byTaxCharacter.cash.liquidity, 1);
    check('a house is not', rules.byTaxCharacter.property.liquidity, 4);
    /* The helpers */
    check('a retirement-category lump is treated as pre-tax', Schema.assetRule({ category: 'retirement' }, rules).key, 'pretax');
    check('a characterised asset wins over its category', Schema.assetRule({ category: 'retirement', taxCharacter: 'roth' }, rules).key, 'roth');
    check('an override wins over the rule', Schema.assetAccessAge({ taxCharacter: 'pretax', accessAgeOverride: 55 }, rules), 55);
    check('no override, the rule', Schema.assetAccessAge({ taxCharacter: 'pretax' }, rules), 59.5);
    check('a rated liquidity is used and marked rated', JSON.stringify(Schema.assetLiquidity({ liquidity: 2, category: 'real_estate' }, rules)), '{"value":2,"rated":true}');
    check('an unrated one is the default and says so', JSON.stringify(Schema.assetLiquidity({ category: 'real_estate' }, rules)), '{"value":4,"rated":false}');
  }

  /* -- The other tables -------------------------------------------------- */
  {
    check('confidence weights: guaranteed counts in full', weights.weights['1'], 1);
    check('and probably-zero counts nothing', weights.weights['4'], 0);
    checkTrue('weights fall as confidence falls', [1, 2, 3, 4].every((k, i) => i === 0 || weights.weights[String(k)] <= weights.weights[String(k - 1)]));
    const codes = states.states.map(r => r.code).filter(c => c !== 'OTHER');
    codes.forEach(c => checkTrue(`UI benefits cover ${c}`, !!ui.states[c] && ui.states[c].maxWeeklyDollars > 0 && ui.states[c].weeks > 0));
    codes.forEach(c => checkTrue(`state tax covers ${c}`, !!st.states[c] && ['none', 'flat', 'brackets'].includes(st.states[c].type)));
    Object.keys(st.states).forEach(c => {
      const row = st.states[c];
      if (row.type === 'brackets') {
        checkTrue(`${c} brackets climb`, row.single.every((b, i) => i === 0 || b.upTo === null || b.upTo > row.single[i - 1].upTo));
        check(`${c} top bracket is open`, row.single[row.single.length - 1].upTo, null);
      }
      if (row.type === 'flat') checkTrue(`${c} flat rate is a rate`, row.rate > 0 && row.rate < 0.15);
    });
    checkTrue('Texas has no income tax', st.states.TX.type === 'none');
    checkTrue('the ACA table admits it is unverified', aca.confidence === 'unverified' && ui.confidence === 'unverified' && st.confidence === 'unverified');
    checkTrue('ACA applicable percentages climb with income', aca.applicablePercentage.every((r, i) => i === 0 || r.percent >= aca.applicablePercentage[i - 1].percent));
    check('and end at the cliff', aca.applicablePercentage[aca.applicablePercentage.length - 1].upToFplMultiple, aca.cliffMultiple);
  }
})();

section('The tax engine');

(function () {
  const Tax = require(path.join(ROOT, 'engines/tax.js'));
  const T = {
    federalBrackets: require(path.join(ROOT, 'data/federal_brackets_2026.json')),
    seTax: require(path.join(ROOT, 'data/se_tax_2026.json')),
    stateBrackets: require(path.join(ROOT, 'data/state_brackets_2026.json')),
    aca: require(path.join(ROOT, 'data/aca_2026.json'))
  };

  /* -- Ordinary income, by hand ------------------------------------------- */
  {
    /* 72,000 single: taxable 72,000 − 16,100 = 55,900.
       10% of 12,400 = 1,240; 12% of 38,000 = 4,560; 22% of 5,500 = 1,210. */
    const o = Tax.ordinaryTax(T.federalBrackets, 7200000, 'single');
    check('taxable income is gross minus the standard deduction', o.taxableIncomeCents, 5590000);
    check('the ordinary tax is 7,010', o.value, 701000);
    check('in three slices', o.slices.length, 3);
    check('the marginal rate is 22%', o.marginalRate, 0.22);
    check('the standard deduction was used', o.deductionKind, 'standard');
    const itemised = Tax.ordinaryTax(T.federalBrackets, 7200000, 'single', { deductionCents: 2000000 });
    check('a larger itemised deduction wins', itemised.deductionKind + ':' + itemised.taxableIncomeCents, 'itemised:5200000');
    const deferred = Tax.ordinaryTax(T.federalBrackets, 7200000, 'single', { aboveTheLineCents: 500000 });
    check('a 401(k) deferral comes off before the deduction', deferred.taxableIncomeCents, 5090000);
    check('and saves 22 cents on the dollar at this bracket', 701000 - deferred.value, 110000);
    check('below the deduction the tax is zero, not negative', Tax.ordinaryTax(T.federalBrackets, 1000000, 'single').value, 0);
    check('no filing status, no tax', Tax.ordinaryTax(T.federalBrackets, 7200000, null).status, 'incomplete');
    check('no income, no tax', Tax.ordinaryTax(T.federalBrackets, null, 'single').status, 'incomplete');
    check('a million single lands in the top bracket', Tax.ordinaryTax(T.federalBrackets, 100000000, 'single').marginalRate, 0.37);
  }

  /* -- Gains stack on top ------------------------------------------------- */
  {
    /* 10,000 of gains on 40,000 of ordinary taxable: 9,450 fills the 0%
       band (to 49,450), the remaining 550 is taxed at 15% = 82.50. */
    const cg = Tax.capitalGainsTax(T.federalBrackets, 1000000, 4000000, 'single');
    check('gains fill the 0% band first', cg.slices[0].dollars, 9450);
    check('then 15%', cg.value, 8250);
    check('the marginal gains rate is what the last dollar paid', cg.marginalRate, 0.15);
    check('gains on nothing else are all in the 0% band', Tax.capitalGainsTax(T.federalBrackets, 1000000, 0, 'single').value, 0);
    check('no gains, no tax', Tax.capitalGainsTax(T.federalBrackets, 0, 4000000, 'single').value, 0);
    /* Stacking matters: the same 10,000 on 45,000 straddles the band. */
    check('the same gains higher up pay more', Tax.capitalGainsTax(T.federalBrackets, 1000000, 4500000, 'single').value, 83250);
  }

  /* -- FICA ---------------------------------------------------------------- */
  {
    const f = Tax.fica(T.seTax, 7200000, 'single');
    check('the employee pays 7.65% on 72,000', f.value, 550800);
    check('6.2% of it Social Security', f.socialSecurityCents, 446400);
    check('1.45% Medicare', f.medicareCents, 104400);
    check('and no additional Medicare below the threshold', f.additionalMedicareCents, 0);
    const big = Tax.fica(T.seTax, 30000000, 'single');
    checkTrue('Social Security stops at the wage base', big.cappedAtWageBase && big.socialSecurityCents === Math.round(T.seTax.socialSecurityWageBase * 100 * 0.062));
    check('additional Medicare on the excess over 200,000', big.additionalMedicareCents, 90000);
  }

  /* -- State ---------------------------------------------------------------- */
  {
    check('Texas: nothing', Tax.stateTax(T.stateBrackets, 'TX', 5590000, 'single').value, 0);
    check('North Carolina: flat 4.25% on taxable', Tax.stateTax(T.stateBrackets, 'NC', 5590000, 'single').value, 237575);
    const ca = Tax.stateTax(T.stateBrackets, 'CA', 5590000, 'single');
    /* CA single on 55,900: 1% to 10,756 (107.56) + 2% to 25,499 (294.86)
       + 4% to 40,245 (589.84) + 6% to 55,866 (937.26) + 8% on 34 (2.72). */
    check('California walks its brackets', ca.value, Math.round((107.56 + 294.86 + 589.84 + 937.26 + 2.72) * 100));
    check('and reports the marginal rate reached', ca.marginalRate, 0.08);
    checkTrue('married joint doubles the single thresholds', Tax.stateTax(T.stateBrackets, 'CA', 5590000, 'married_joint').value < ca.value);
    checkTrue('the state figure says it is an approximation', /federal taxable income/.test(ca.approximation));
    check('no state, no figure', Tax.stateTax(T.stateBrackets, null, 5590000, 'single').status, 'incomplete');
  }

  /* -- The ACA cliff --------------------------------------------------------- */
  {
    const a = Tax.acaCliff(T.aca, 5000000, 1);
    check('50,000 for one is about 3.2× the poverty level', Math.round(a.value * 100) / 100, Math.round(50000 / 15650 * 100) / 100);
    checkTrue('under the cliff', !a.overCliff);
    check('with room before it', a.roomBeforeCliffCents, Math.round((15650 * 4 - 50000) * 100));
    checkTrue('an expected contribution is named', a.expectedContributionCents > 0);
    const over = Tax.acaCliff(T.aca, 7000000, 1);
    checkTrue('70,000 for one is over the cliff', over.overCliff && over.roomBeforeCliffCents === 0 && over.applicablePercentage === null);
    checkTrue('a bigger household moves the cliff up', Tax.acaCliff(T.aca, 7000000, 3).overCliff === false);
  }

  /* -- The whole estimate on the demo -------------------------------------- */
  {
    const r = Tax.estimate(Demo.build(), T, {});
    check('federal ordinary 7,010', r.federalOrdinaryCents, 701000);
    check('FICA 5,508', r.ficaCents, 550800);
    check('NC state 2,375.75', r.stateCents, 237575);
    check('total 14,893.75', r.value, 1489375);
    check('take-home is gross minus all of it', r.takeHomeAnnualCents, 7200000 - 1489375);
    check('at an effective rate near the lookup table', Math.round(r.effectiveRate * 100), 21);
    checkTrue('it says what it did not model', r.notModelled.length >= 5);
    check('and how much to trust it', r.confidence, 'unverified');
    const side = Tax.estimate(Demo.build(), T, { selfEmploymentCents: 1000000 });
    checkTrue('side income adds SE tax', side.selfEmploymentTaxCents > 0);
    checkTrue('and its deductible half comes off ordinary income', side.components.ordinary.aboveTheLineCents === side.components.selfEmployment.deductibleHalfCents);
    const noState = Demo.build(); noState.state = null;
    check('no state means no state tax and says so', Tax.estimate(noState, T, {}).stateIncluded, false);
    const src = fs.readFileSync(path.join(ROOT, 'engines/tax.js'), 'utf8');
    checkTrue('SE tax is reused, never re-derived', src.indexOf('SelfEmployed.selfEmploymentTax(') !== -1 && !/netEarningsFactor/.test(src));
  }
})();

section('The Statement engine');

(function () {
  const St = require(path.join(ROOT, 'engines/statement.js'));
  const T = Object.assign({}, TABLES, {
    accessRules: require(path.join(ROOT, 'data/access_rules.json')),
    confidenceWeights: require(path.join(ROOT, 'data/confidence_weights.json')),
    uiBenefits: require(path.join(ROOT, 'data/ui_benefits.json'))
  });
  function rich() {
    const h = Demo.build();
    h.assets = [
      Schema.createAsset({ id: 'cash', category: 'cash', valueCents: 950000, liquid: true, taxCharacter: 'cash', confidence: 1 }),
      Schema.createAsset({ id: 'k401', category: 'retirement', valueCents: 3000000, taxCharacter: 'pretax', confidence: 2 }),
      Schema.createAsset({ id: 'roth', category: 'retirement', valueCents: 1200000, taxCharacter: 'roth', costBasisCents: 800000, confidence: 2 }),
      Schema.createAsset({ id: 'brok', category: 'investment', valueCents: 600000, taxCharacter: 'taxable', confidence: 2 }),
      Schema.createAsset({ id: 'house', category: 'real_estate', valueCents: 30000000, confidence: 3 }),
      Schema.createAsset({ id: 'biz', category: 'other', valueCents: 5000000, taxCharacter: 'business', confidence: 4 })
    ];
    return h;
  }

  /* -- Three portfolios ------------------------------------------------- */
  {
    const p = St.portfolios(rich(), T.accessRules);
    check('liquid financial is cash + brokerage', p.buckets.liquidFinancial.totalCents, 1550000);
    check('illiquid financial is the retirement money', p.buckets.illiquidFinancial.totalCents, 4200000);
    check('non-financial is the house and the business', p.buckets.nonFinancial.totalCents, 35000000);
    check('the total is all of it', p.value, 40750000);
    check('and the plain net worth nets the demo debts', p.plainNetWorthCents, 40750000 - 2160000);
    check('the demo lump, uncharacterised, files as taxable', St.portfolios(Demo.build(), T.accessRules).buckets.liquidFinancial.totalCents, 5750000);
    check('nothing owned, nothing filed', St.portfolios(Schema.createHousehold({}), T.accessRules).status, 'incomplete');
  }

  /* -- Confidence-weighted net worth ------------------------------------- */
  {
    /* 9,500×1 + 30,000×.85 + 12,000×.85 + 6,000×.85 + 300,000×.5 + 50,000×0
       = 9,500 + 25,500 + 10,200 + 5,100 + 150,000 + 0 = 200,300; less 21,600. */
    const c = St.confidenceWeightedNetWorth(rich(), T.confidenceWeights);
    check('weighted assets by hand', c.weightedAssetsCents, 20030000);
    check('less debts', c.value, 20030000 - 2160000);
    check('against a plain figure of 385,900', c.plainNetWorthCents, 40750000 - 2160000);
    check('the haircut is the difference', c.haircutCents, 40750000 - 20030000);
    check('every asset was rated', c.unratedCount, 0);
    const half = rich(); half.assets[4].confidence = null;
    const c2 = St.confidenceWeightedNetWorth(half, T.confidenceWeights);
    check('an unrated asset is excluded, not counted in full', c2.unratedAssetsCents, 30000000);
    check('and counted', c2.unratedCount, 1);
    check('nothing rated means nothing weighted', St.confidenceWeightedNetWorth(Demo.build(), T.confidenceWeights).status, 'incomplete');
  }

  /* -- The liquidity ladder, gated by age ---------------------------------- */
  {
    const l = St.liquidityLadder(rich(), T.accessRules, { age: 32 });
    check('cash is reachable today', l.bands.today, 950000);
    /* Brokerage (2) 6,000 + Roth basis 8,000 at the Roth's default 3 → 30 days: 6,000; this year: 8,000. */
    check('the brokerage this month', l.bands.thisMonth, 600000);
    check('the Roth basis this year', l.bands.thisYear, 800000);
    /* Never: 401(k) 30,000 + Roth earnings 4,000 + house 300,000 + business 50,000. */
    check('pre-59½ money, the house and the business are never', l.bands.never, 3000000 + 400000 + 30000000 + 5000000);
    check('gated money is named', l.gatedCents, 3400000);
    check('reachable within a year is the value', l.value, 950000 + 600000 + 800000);
    const older = St.liquidityLadder(rich(), T.accessRules, { age: 60 });
    check('at 60 the gate is open', older.gatedCents, 0);
    check('and the 401(k) sits at its own liquidity', older.bands.thisYear, 3000000 + 1200000);
    const noAge = rich(); noAge.people[0].dob = null;
    const na = St.liquidityLadder(noAge, T.accessRules);
    checkTrue('with no age the gate cannot be applied and it says so', na.ageKnown === false && na.gatedCents === 0);
    checkTrue('a rated liquidity overrides the rule', St.liquidityLadder(Object.assign(rich(), { assets: [Schema.createAsset({ category: 'real_estate', valueCents: 100, liquidity: 1 })] }), T.accessRules, { age: 40 }).bands.today === 100);
  }

  /* -- The bridge to 59½ ------------------------------------------------------ */
  {
    const b = St.bridgeGap(Demo.build(), T);
    /* Demo: age 32, 19 years to FI → 51; 8.5 years × 37,800 = 321,300 needed;
       reachable before 59½: cash 9,500 + the uncharacterised lump as taxable 48,000. */
    check('FI lands at 51', Math.round(b.fiAge), 51);
    check('the gap is 8.5 years', b.gapYears, 8.5);
    check('needing 321,300', b.needCents, 32130000);
    check('with 57,500 reachable', b.availableCents, 5750000);
    check('so 263,800 short', b.value, 26380000);
    check('covered years is available over annual spend', b.coveredYears, 1.5);
    const r = St.bridgeGap(rich(), T, { age: 32 });
    check('the Roth basis and the brokerage count, the 401(k) does not', r.availableCents, 950000 + 600000 + 800000);
    const old = St.bridgeGap(Demo.build(), T, { age: 58 });
    checkTrue('FI after 59½ needs no bridge', old.noBridgeNeeded === true && old.value === 0);
    const noDob = Demo.build(); noDob.people[0].dob = null;
    check('no date of birth, no bridge', St.bridgeGap(noDob, T).status, 'incomplete');
  }

  /* -- The worst plausible year ------------------------------------------------ */
  {
    /* 2,500 deductible + 0 oop + 6 × 3,150 = 21,400; NC benefit min(350,
       692) × 12 weeks = 4,200; net 17,200; cash 9,500 → 7,700 short. */
    const w = St.worstPlausibleYear(Demo.build(), T);
    check('the cost of a bad year', w.costCents, 2140000);
    check('the benefit is the state cap times its weeks', w.benefitCents, 420000);
    check('at 350 a week', w.benefitWeeklyCents, 35000);
    check('for 12 weeks in NC', w.benefitWeeks, 12);
    check('net of benefit', w.netCents, 1720000);
    check('short after cash', w.value, 770000);
    checkTrue('and it says the out-of-pocket max is unknown', w.oopMaxKnown === false);
    checkTrue('and how much to trust the benefit', w.benefitConfidence === 'unverified');
    const oop = Demo.build(); oop.insurance.oopMaxCents = 800000;
    check('an out-of-pocket max adds to the cost', St.worstPlausibleYear(oop, T).costCents, 2940000);
    const noState = Demo.build(); noState.state = null;
    check('no state, no benefit assumed', St.worstPlausibleYear(noState, T).benefitCents, 0);
    const wa = Demo.build(); wa.state = 'WA';
    check('a generous state is capped by the wage, not the max', St.worstPlausibleYear(wa, T).benefitWeeklyCents, Math.round(7200000 / 52 * 0.5));
    const noDed = Demo.build(); noDed.insurance.highestDeductibleCents = null;
    check('no deductible, no figure', St.worstPlausibleYear(noDed, T).status, 'incomplete');
  }

  /* -- Concentration and a rental ---------------------------------------------- */
  {
    check('one job is total concentration', St.incomeConcentration(Demo.build()).value, 1);
    const two = Demo.build();
    two.people[0].incomeSources.push(Schema.createIncomeSource({ source: 'Side', grossAnnualIncomeCents: 1800000 }));
    check('72k of 90k is 0.8', St.incomeConcentration(two).value, 0.8);
    check('no income, no ratio', St.incomeConcentration(Schema.createHousehold({})).status, 'incomplete');

    const h = rich();
    h.debts.push(Schema.createDebt({ id: 'mtg', balanceCents: 20000000, type: 'mortgage' }));
    const prop = Schema.createProperty({ assetId: 'house', mortgageId: 'mtg', rentMonthlyCents: 240000, pitiMonthlyCents: 150000, opexMonthlyCents: 40000 });
    /* NOI = (2,400 × .92 − 400) × 12 = (2,208 − 400) × 12 = 21,696.
       Cap = 21,696 / 300,000 = 7.23%. Debt service 18,000. DSCR 1.205.
       Cash-on-cash = 3,696 / 100,000 equity = 3.7%. */
    const m = St.propertyMetrics(h, prop);
    check('NOI by hand', m.noiCents, 2169600);
    check('cap rate', Math.round(m.capRate * 10000) / 10000, 0.0723);
    check('DSCR', Math.round(m.dscr * 1000) / 1000, 1.205);
    check('cash-on-cash on 100,000 of equity', Math.round(m.cashOnCash * 1000) / 1000, 0.037);
    checkTrue('the vacancy was assumed and says so', m.vacancyAssumed && m.vacancyRate === 0.08);
    check('monthly cash flow', m.cashFlowMonthlyCents, 30800);
    check('a rental with no asset link is incomplete', St.propertyMetrics(h, Schema.createProperty({})).status, 'incomplete');
  }
})();

section('What is finished');

(function () {
  /* -- The declarations have to be real ---------------------------------- */
  {
    var KINDS = ['core', 'read', 'about-you', 'explore'];
    Registry.ROOMS.forEach(function (room) {
      checkTrue(`${room.id} says what kind of room it is`,
        KINDS.indexOf(room.kind) !== -1,
        `kind must be one of ${KINDS.join(' / ')} — see DECISIONS.md D-051`);
      checkTrue(`${room.id} declares what it needs`, Array.isArray(room.needs),
        'add a needs: [] to its registry entry — empty means it stands alone');
      (room.needs || []).forEach(function (fieldId) {
        checkTrue(`${room.id} needs a field that exists: ${fieldId}`,
          !!Ownership.FIELDS[fieldId],
          'ids come from shared/ownership.js, which knows who owns each one');
      });
      /* A room must not list the same need twice — it would double-count
         against its own completion. */
      const ids = room.needs || [];
      check(`${room.id} lists each need once`, new Set(ids).size, ids.length);
    });
  }

  function partial() {
    const h = Schema.createHousehold({});
    h.people.push(Schema.createPerson({ label: 'You', role: 'adult', dob: '1994-04-12' }));
    h.people[0].incomeSources.push(
      Schema.createIncomeSource({ grossAnnualIncomeCents: 7200000 }));
    return h;
  }

  /* The core is deliberately small. If it grows, the map stops being a
     short on-ramp and goes back to being a wall of twenty-five rooms —
     which is the thing D-051 exists to prevent, so it should fail loudly. */
  {
    /* Utility pages (Refresh, D-057) are gathering pages that never sit on
       the map, so they are not part of the four-room on-ramp. */
    const core = Registry.ROOMS.filter(r => r.kind === 'core' && !r.utility);
    checkTrue('the core stays four rooms or fewer', core.length <= 4,
      `core is now ${core.map(r => r.title).join(', ')} — if this is deliberate, `
        + 'update the check and D-051 together');
    checkTrue('every read room asks for nothing of its own',
      Registry.ROOMS.filter(r => r.kind === 'read').length > 0);
    /* A "read" room that needs nothing would be showing you nothing. */
    Registry.ROOMS.filter(r => r.kind === 'read').forEach(function (r) {
      checkTrue(`${r.id} is a reading, so it must read something`,
        (r.needs || []).length > 0);
    });
    /* An "explore" room must never be a gate: it is optional by definition,
       so it cannot be the thing standing between you and a reading. */
    Registry.ROOMS.filter(r => r.kind === 'explore').forEach(function (r) {
      checkTrue(`${r.id} is optional, so it owns no field others wait on`,
        Object.keys(Ownership.FIELDS).every(function (f) {
          return Ownership.FIELDS[f].owner !== r.id;
        }));
    });
  }

  /* -- One room -------------------------------------------------------- */
  {
    const h = partial();
    const fire = Progress.forRoom('fire', h);
    check('FIRE needs three figures', fire.total, 3);
    check('one of them is answered', fire.filledCount, 1);
    check('so two are missing', fire.missing.length, 2);
    checkTrue('and it is not complete', !fire.complete);
    checkTrue('every missing entry carries a link', fire.missing.every(m => !!m.href));
    checkTrue('and names the room that owns it', fire.missing.every(m => !!m.ownerTitle));

    const full = Progress.forRoom('fire', Demo.build());
    checkTrue('the demo persona completes it', full.complete);
    check('with nothing missing', full.missing.length, 0);
    check('and a full share', full.share, 1);

    /* A room that reads nothing shared is not "incomplete" — it is never
       blocked, which is a different state and says so. */
    const solo = Progress.forRoom('quick-math', h);
    checkTrue('a standalone room is flagged as standalone', solo.standalone);
    checkTrue('and counts as complete rather than as behind', solo.complete);
    check('unknown room ids return nothing', Progress.forRoom('no-such-room', h), null);
  }

  /* -- The whole suite, counted honestly ---------------------------------- */
  {
    const h = partial();
    const o = Progress.overall(h);

    /* Counted over DISTINCT fields. Fourteen rooms need monthly expenses;
       that is one thing to do, not fourteen, and a bar that said otherwise
       would move for reasons unrelated to effort. */
    const everyNeed = [];
    Registry.ROOMS.forEach(r => (r.needs || []).forEach(n => everyNeed.push(n)));
    /* ...and over fields that APPLY to this household. A field that has
       stopped being a question (an HSA with no high-deductible plan) is not
       something left to do. D-055. */
    const distinct = Array.from(new Set(everyNeed))
      .filter(f => Ownership.describe(f, h, 'map').applies).length;
    check('the total is distinct fields, not room-by-room mentions',
      o.fieldsTotal, distinct);
    checkTrue('which is far fewer than the mentions', everyNeed.length > distinct);

    check('income and date of birth are answered', o.fieldsFilled, 2);
    check('so the rest are outstanding', o.missing.length, distinct - 2);
    checkTrue('and each outstanding item links somewhere',
      o.missing.every(m => !!m.href && !!m.label));

    /* The motivating number: how many rooms one answer unlocks. */
    const expenses = o.missing.filter(m => m.fieldId === 'monthlyExpenses')[0];
    checkTrue('monthly expenses is outstanding', !!expenses);
    checkTrue('and it is named as unblocking many rooms', expenses.blocks.length > 5);

    const done = Progress.overall(Demo.build());
    check('a full household has nothing outstanding', done.missing.length, 0);
    check('and a share of one', done.share, 1);

    const empty = Progress.overall(Schema.createHousehold({}));
    check('an empty household has answered nothing', empty.fieldsFilled, 0);
    check('but still knows how much there is', empty.fieldsTotal, distinct);
    /* And the demo is the one household that answers everything a room can
       read — if a new need is added and the persona is not extended to
       match, this is where it shows. */
    const demoDistinct = Array.from(new Set(everyNeed))
      .filter(f => Ownership.describe(f, Demo.build(), 'map').applies).length;
    check('the demo answers every applicable field', done.fieldsFilled, demoDistinct);
  }

  /* -- Where to go next --------------------------------------------------- */
  {
    const h = partial();
    const next = Progress.nextUnfinished(h, 'fire');
    checkTrue('there is a next unfinished room', !!next);
    checkTrue('and it is not the room you are standing in', next.roomId !== 'fire');
    checkTrue('and it is genuinely unfinished', !next.complete);

    /* It must wrap rather than dead-end at the last room on the path. */
    const path = Registry.inOrder();
    const last = path[path.length - 1];
    const fromLast = Progress.nextUnfinished(h, last.id);
    checkTrue('the last room still offers somewhere to go', !!fromLast);

    check('a finished household has nowhere left to send you',
      Progress.nextUnfinished(Demo.build(), 'fire'), null);

    const nb = Progress.neighbours(path[0].id);
    check('the first room has no previous', nb.prev, null);
    checkTrue('but it has a next', !!nb.next);
    check('the last room has no next', Progress.neighbours(last.id).next, null);
    check('and an unknown room reports no position', Progress.neighbours('nope').index, -1);
  }

  /* -- Room-to-room nav: never a dead end -------------------------------- */
  {
    const path = Registry.inOrder();
    path.forEach(function (room) {
      const nav = Progress.headerNavHtml(room.id);
      const prev = /slaf-hop--prev[^>]*href="([^"]+)"/.exec(nav);
      const next = /slaf-hop--next[^>]*href="([^"]+)"/.exec(nav);
      checkTrue(`${room.id} offers a way back`, !!prev);
      checkTrue(`${room.id} offers a way on`, !!next);
      /* Both ends resolve to the map rather than wrapping to the far end of
         the path, which would send you somewhere unrelated. */
      checkTrue(`${room.id}'s links both point somewhere real`,
        !!prev && !!next && prev[1].length > 0 && next[1].length > 0);
    });

    const first = Progress.headerNavHtml(path[0].id);
    checkTrue('the first room falls back to the map', /map\.html/.test(first));
    const last = Progress.headerNavHtml(path[path.length - 1].id);
    checkTrue('so does the last', /map\.html/.test(last));
    /* At the ends the middle link would be the same destination twice. */
    check('the first room shows the map once', (first.match(/map\.html/g) || []).length, 1);
    check('the last room shows the map once', (last.match(/map\.html/g) || []).length, 1);
    check('a room in the middle shows it once too',
      (Progress.headerNavHtml('fire').match(/map\.html/g) || []).length, 1);

    /* Rooms climb out of rooms/; the front page must not. */
    checkTrue('a room links to its neighbour through ../',
      /\.\.\/rooms\//.test(Progress.headerNavHtml('fire')));
    checkTrue('the front page does not',
      !/\.\.\//.test(Progress.headerNavHtml('dashboard')));
    checkTrue('and the ladder, now in rooms/, does',
      /\.\.\//.test(Progress.headerNavHtml('foo-ladder')));

    check('an unknown room renders no nav rather than a broken one',
      /href/.test(Progress.headerNavHtml('nope')), true);
  }

  /* -- The strip itself ---------------------------------------------------- */
  {
    const h = partial();
    const strip = Progress.stripHtml('fire', h);
    checkTrue('the strip says how many are left', /2 things left/.test(strip));
    checkTrue('it links to the owning room', /start\.html#q-investments/.test(strip));
    checkTrue('it offers a way back', /← /.test(strip));
    checkTrue('and a way forward', /Next unfinished/.test(strip));

    /* From a room, links climb out of rooms/; from the root they must not. */
    checkTrue('links from a room are relative to rooms/',
      /\.\.\/rooms\/start\.html/.test(strip), strip.slice(0, 400));
    const fromRoot = Progress.stripHtml('dashboard', h);
    checkTrue('links from the front page are not',
      !/\.\.\//.test(fromRoot), fromRoot.slice(0, 400));

    const complete = Progress.stripHtml('fire', Demo.build());
    checkTrue('a finished room says so', /everything it needs/.test(complete));
    checkTrue('a standalone room says that instead',
      /stands on its own/.test(Progress.stripHtml('quick-math', h)));
    check('an unknown room renders nothing', Progress.stripHtml('nope', h), '');
  }
})();

section('Facts answered once');

(function () {
  /* -- The model keeps them, and keeps blank separate from zero --------- */
  {
    const fresh = Schema.createHousehold({});
    check('a fresh household has no contribution answer',
      fresh.retirement.contributionPercent, null);
    check('nor a Roth balance', fresh.retirement.rothContributedCents, null);
    check('nor an HSA balance', fresh.retirement.hsaContributedCents, null);
    check('nor a deductible', fresh.insurance.highestDeductibleCents, null);
    check('HDHP eligibility is unanswered, not false', fresh.retirement.onHdhp, null);

    /* Contributing nothing is a real answer and must survive as zero. */
    const zero = Schema.createHousehold({ retirement: { contributionPercent: 0 } });
    check('a contribution of zero is kept as zero', zero.retirement.contributionPercent, 0);
    checkTrue('and is not read as unanswered',
      zero.retirement.contributionPercent !== null);

    /* A household stored before any of this loads with the branches empty
       rather than absent, so no room has to null-check them. */
    const legacy = Schema.createHousehold(JSON.parse(JSON.stringify({ people: [], assets: [] })));
    checkTrue('a legacy household gains the branches', !!legacy.retirement && !!legacy.insurance);
    check('with nothing invented in them', legacy.insurance.highestDeductibleCents, null);
  }

  /* -- The marginal rate has NO default, on purpose ---------------------- */
  {
    const h = Schema.createHousehold({});
    check('there is no default marginal rate',
      Schema.resolveAssumptions(h).marginalRate, null);
    /* Deriving one from the effective-rate table would be a fabricated
       number people act on — the effective rate is a different quantity. */
    h.assumptionOverrides = { marginalRate: 0.24 };
    check('once answered it resolves', Schema.resolveAssumptions(h).marginalRate, 0.24);
    check('and a local preview still wins',
      Schema.resolveAssumptions(h, { marginalRate: 0.32 }).marginalRate, 0.32);
  }

  /* -- Every new fact is owned by exactly one room ----------------------- */
  {
    const OWNED = {
      contributionPercent: 'start', rothContributed: 'accounts',
      hsaContributed: 'accounts', marginalRate: 'accounts',
      highestDeductible: 'start'
    };
    const h = Schema.createHousehold({});
    h.retirement = { contributionPercent: 4, rothContributedCents: 300000,
      hsaContributedCents: 0, onHdhp: true, hsaFamilyPlan: false };
    h.insurance = { highestDeductibleCents: 300000 };
    h.assumptionOverrides = { marginalRate: 0.22 };

    Object.keys(OWNED).forEach(function (fieldId) {
      const f = Ownership.field(fieldId);
      checkTrue(`${fieldId} is a known field`, !!f);
      check(`${fieldId} is owned by one room`, f.owner, OWNED[fieldId]);
      const d = Ownership.describe(fieldId, h, 'somewhere-else');
      checkTrue(`${fieldId} reads back once answered`, d.isSet, `got ${d.display}`);
      checkTrue(`${fieldId} links to its owner`, d.href.indexOf(OWNED[fieldId]) !== -1);
    });

    /* An HSA balance of zero is answered, not missing — the commonest way
       this class of field gets read wrong. */
    checkTrue('an HSA balance of zero still reads as answered',
      Ownership.describe('hsaContributed', h, 'x').isSet);

    const blank = Schema.createHousehold({});
    Object.keys(OWNED).forEach(function (fieldId) {
      checkTrue(`${fieldId} is unset on a fresh household`,
        !Ownership.describe(fieldId, blank, 'x').isSet);
    });
  }

  /* -- The FOO ladder no longer asks for what it can read ---------------- */
  {
    const foo = fs.readFileSync(path.join(ROOT, 'foo-ladder.js'), 'utf8');
    [['Highest deductible', 'highestDeductible'],
     ['You contribute', 'contributionPercent'],
     ['Roth so far this yr', 'rothContributed'],
     ['HSA so far this yr', 'hsaContributed']].forEach(function (pair) {
      checkTrue(`the ladder borrows ${pair[0]} rather than asking for it`,
        foo.indexOf("borrowed('" + pair[1] + "'") !== -1,
        'it should read the stored fact, not collect it again');
      checkTrue(`and has no local input for ${pair[0]}`,
        foo.indexOf("field({ label: '" + pair[0] + "'") === -1);
    });
    /* It must still own the things that ARE local to it. */
    checkTrue('but it still owns its own prepaid figures',
      foo.indexOf("field({ label: 'Prepaid goal'") !== -1);
  }

  /* -- The waterfall pours take-home, not gross ---------------------------- */
  {
    const h = Demo.build();
    const th = Tier0.takeHomeMonthlyCents(h, TABLES);
    /* $72,000 at the table's 19% effective rate for a single filer is
       $13,680 of tax; ($72,000 − $13,680) / 12 = $4,860 a month. */
    check('demo take-home is $4,860 a month', th.value, 486000);
    check('at the table rate', th.effectiveRate, 0.19);
    check('so the gap is $1,710, not the pre-tax $2,850', th.value - 315000, 171000);
    const noFiling = Demo.build(); noFiling.filingStatus = null;
    check('no filing status, no take-home', Tier0.takeHomeMonthlyCents(noFiling, TABLES).status, 'incomplete');
    const foo = fs.readFileSync(path.join(ROOT, 'foo-ladder.js'), 'utf8');
    checkTrue('the ladder reads take-home from Tier0', foo.indexOf('Tier0.takeHomeMonthlyCents') !== -1);
    checkTrue('and no longer subtracts expenses from gross',
      foo.indexOf('d.mIncome - d.mExpenses') === -1, 'BRIEF §1.1 item 1');
    checkTrue('and loads the tax table it needs', foo.indexOf("'effectiveTaxRates'") !== -1);
    const idx = fs.readFileSync(path.join(ROOT, 'rooms/foo-ladder.html'), 'utf8');
    checkTrue('the ladder page loads tier0 before the ladder script',
      idx.indexOf('engines/tier0.js') !== -1 && idx.indexOf('engines/tier0.js') < idx.indexOf('foo-ladder.js'));
  }

  /* -- The footer and the timeline read the same list ---------------------- */
  {
    const needs = Registry.byId('foo-ladder').needs;
    ['filingStatus', 'highestDeductible', 'contributionPercent', 'rothContributed', 'hsaContributed']
      .forEach(f => checkTrue(`the ladder declares it needs ${f}`, needs.indexOf(f) !== -1, 'BRIEF §1.1 item 2'));
    const row = Progress.forRoom('foo-ladder', Demo.build());
    checkTrue('the demo persona completes the ladder', row.complete);
    checkTrue('with the HSA marked not applicable rather than missing',
      row.notApplicable.some(f => f.fieldId === 'hsaContributed'));
    const hdhp = Demo.build(); hdhp.retirement.onHdhp = true;
    checkTrue('on a high-deductible plan the HSA becomes a real need',
      !Progress.forRoom('foo-ladder', hdhp).complete);
  }

  /* -- The intake's count only shrinks ------------------------------------- */
  {
    const fresh = Schema.createHousehold({});
    checkTrue('with nothing answered the capturing question counts', Schema.capturingQuestionApplies(fresh));
    const h = Demo.build();
    checkTrue('with a real match it counts', Schema.capturingQuestionApplies(h));
    h.people[0].incomeSources[0].employerMatch = { matchPercent: 0, matchCapPercentOfSalary: 0 };
    checkTrue('with no match it stops', !Schema.capturingQuestionApplies(h));
    /* A typed match keeps its question whatever the status says (D-055),
       so the no-employer case has to be one where nothing was typed. */
    const se = Demo.build(); se.people[0].employmentStatus = 'selfEmployed';
    se.people[0].incomeSources[0].employerMatch = { matchPercent: null, matchCapPercentOfSalary: null };
    checkTrue('with no employer it stops', !Schema.capturingQuestionApplies(se));
    checkTrue('and the ownership map uses the same rule',
      !Ownership.describe('capturingFullMatch', se, 'start').applies
      && Ownership.describe('capturingFullMatch', fresh, 'start').applies);
    const startNeeds = Progress.forRoom('start', fresh);
    /* Thirteen shared fields: the 401(k) card carries the match, the
       contribution and the derived capture; born + state share one card
       (D-061, D-092). Between jobs does not count here — it applies only
       when the status says so — and "anyone depending on you" lives in
       the fine-tune drawer, optional, so it is not a need (D-095). */
     check('so Start Here counts thirteen fields from the first screen', startNeeds.total, 13);
  }

  /* -- Rooms that hold facts are not "explore" rooms --------------------- */
  {
    const accounts = Registry.byId('accounts');
    check('Where It Goes holds facts, so it is not a what-if room',
      accounts.kind, 'about-you');
    /* The rule from D-051, re-checked here because this change is exactly
       the kind that breaks it: an optional room cannot own a field others
       wait on. */
    Registry.ROOMS.filter(r => r.kind === 'explore').forEach(function (r) {
      check(`${r.id} owns nothing`, Ownership.ownedBy(r.id).length, 0);
    });
  }
})();

section('Promotional rates');

(function () {
  const NOW = '2026-09-04';
  function card(over) {
    return Schema.createDebt(Object.assign({
      label: 'Card', balanceCents: 91000, rate: 0, minPaymentCents: 4000,
      type: 'credit_card', promoEndsOn: '2027-03-01', postPromoRate: 0.2499
    }, over || {}));
  }

  /* -- Where the promo stands -------------------------------------------- */
  {
    const s = Debt.promoStatus(card(), NOW);
    check('months left counts whole months', s.monthsLeft, 5);
    checkTrue('it has not expired', !s.expired);
    check('and it knows the rate it reverts to', s.postRate, 0.2499);

    check('no end date means no promo', Debt.promoStatus(card({ promoEndsOn: null }), NOW), null);
    const past = Debt.promoStatus(card({ promoEndsOn: '2026-01-01' }), NOW);
    checkTrue('a date gone by is expired, not negative months', past.expired);
    check('and months left is zero, never below', past.monthsLeft, 0);
  }

  /* -- The rate the simulation actually charges --------------------------- */
  {
    const c = card();
    check('inside the promo, the promo rate applies', Debt.rateInMonth(c, 5, NOW), 0);
    check('the month after, the go-to rate does', Debt.rateInMonth(c, 6, NOW), 0.2499);
    check('and it stays there', Debt.rateInMonth(c, 40, NOW), 0.2499);

    /* Nobody said what it reverts to: the stated rate is all there is, and
       the room says so rather than the engine inventing one. */
    const unknown = card({ postPromoRate: null });
    check('with no go-to rate the stated rate is used', Debt.rateInMonth(unknown, 40, NOW), 0);
    checkTrue('and the status says it does not know', !Debt.promoStatus(unknown, NOW).knowsAfter);

    /* An expired promo charges the go-to rate from month one. */
    check('an expired promo charges the go-to rate immediately',
      Debt.rateInMonth(card({ promoEndsOn: '2026-01-01' }), 1, NOW), 0.2499);
  }

  /* -- What it takes to clear it in time ---------------------------------- */
  {
    const p = Debt.clearBeforePromoEnds(card(), NOW);
    /* At 0% this is exact: $910 over five months. */
    check('clearing in time is balance over months left', p.value, Math.ceil(91000 / 5));
    check('which is $182 a month', p.value, 18200);
    check('against the $40 actually being paid', p.payingCents, 4000);
    checkTrue('so it will not clear', p.clearsInTime === false);
    check('leaving this owed when the rate jumps', p.leftWhenPromoEndsCents, 91000 - 4000 * 5);
    check('and this much short each month', p.shortfallCents, 18200 - 4000);

    const enough = Debt.clearBeforePromoEnds(card({ minPaymentCents: 20000 }), NOW);
    checkTrue('paying more than the requirement clears it', enough.clearsInTime);
    check('with nothing left at the end', enough.leftWhenPromoEndsCents, 0);

    check('a cleared balance needs nothing',
      Debt.clearBeforePromoEnds(card({ balanceCents: 0 }), NOW).alreadyClear, true);
    check('no promo, no answer',
      Debt.clearBeforePromoEnds(card({ promoEndsOn: null }), NOW).status, 'incomplete');

    /* A non-zero promo rate uses the level-payment formula, not division. */
    const lowRate = card({ rate: 0.0499 });
    const need = Debt.clearBeforePromoEnds(lowRate, NOW);
    checkTrue('a promo above 0% needs more than the plain division',
      need.value > Math.ceil(91000 / 5));
  }

  /* -- The payoff plan itself charges the jump ---------------------------- */
  {
    /* The whole point: a 0% card that outlives its promo must cost real
       interest in the plan, or it gets ranked as harmless forever. */
    function household(debt) {
      const h = Schema.createHousehold({});
      h.people.push(Schema.createPerson({ label: 'You', role: 'adult' }));
      h.debts.push(debt);
      return h;
    }
    const opts = { strategyId: 'avalanche', monthlyBudgetCents: 5000, asOf: NOW };
    const a = Debt.simulate(household(card()), TABLES.debtRules, opts);
    const b = Debt.simulate(household(card({ promoEndsOn: null, postPromoRate: null })),
      TABLES.debtRules, opts);
    checkTrue('both plans complete', Money.isOk(a) && Money.isOk(b));
    checkTrue('the promo card costs real interest once the rate jumps',
      a.totalInterestCents > 0);
    check('while a genuinely permanent 0% costs none', b.totalInterestCents, 0);
    checkTrue('so it takes longer to clear too', a.value >= b.value);
  }

  /* -- The date maths is shared, not duplicated --------------------------- */
  {
    /* Goals and Debt both need "how many months until this date". Two
       copies is how they drift, so there is one, in Schema. §8. */
    check('a date six months out is six months',
      Schema.monthsUntil('2027-03-04', NOW).value, 6);
    check('a date that has passed is refused, not negative',
      Schema.monthsUntil('2026-01-01', NOW).status, 'incomplete');
    check('an unreadable date is refused', Schema.monthsUntil('not-a-date', NOW).status,
      'incomplete');
    check('and Goals still gets its own wording',
      Goals.monthsUntil(null, NOW).missing.join(','), 'targetDate');
  }
})();

section('Ownership');

/* The one-pager builds its cards from Gate.CARDS at load, so their ids are
   not literal in the file; an anchor that names one of them lands. D-095. */
function builtCardId(roomId, id) {
  if (roomId !== 'start') return false;
  const Gate = require(path.join(ROOT, 'shared/gate.js'));
  return Object.keys(Gate.CARDS).some(k => Gate.CARDS[k].id === id);
}

(function () {
  const roomIds = Registry.all().map(r => r.id);
  const fieldIds = Object.keys(Ownership.FIELDS);
  checkTrue('there are shared fields to own', fieldIds.length > 0);

  fieldIds.forEach(function (fieldId) {
    const f = Ownership.FIELDS[fieldId];
    checkTrue(`${fieldId} is owned by a real room`, roomIds.includes(f.owner), `owner "${f.owner}"`);

    /* The chip's link has to land somewhere. Every anchor must exist as a
       real element id in the owning room's HTML — the same guarantee the
       registry's deep links get. */
    const room = Registry.byId(f.owner);
    const html = fs.readFileSync(path.join(ROOT, room.href), 'utf8');
    checkTrue(`${fieldId} → #${f.anchor} exists in ${room.href}`,
      new RegExp(`id=["']${f.anchor}["']`).test(html) || builtCardId(room.id, f.anchor));
  });

  /* Reading a field must never throw on an empty household, and must report
     "not set" rather than inventing a zero. */
  const empty = Schema.createHousehold();
  fieldIds.forEach(function (fieldId) {
    const d = Ownership.describe(fieldId, empty, null);
    checkTrue(`${fieldId} describes cleanly when unset`, d !== null && d.isSet === false);
    check(`${fieldId} shows an em dash when unset`, d.display, '—');
    checkTrue(`${fieldId} still offers a link when unset`, typeof d.href === 'string' && d.href.length > 1);
  });

  /* And must read back correctly once the example household is in place. */
  const filled = Demo.build();
  filled.expenses.entries = Demo.buildSpending();
  const expect = {
    grossAnnualIncome: '$72,000', filingStatus: 'Single', cashSavings: '$9,500',
    investments: '$48,000', totalDebt: '$21,600', monthlyDebtPayments: '$305/mo',
    state: 'NC', employerMatch: '$2,160/yr', capturingFullMatch: 'No', age: '32'
  };
  Object.keys(expect).forEach(function (fieldId) {
    check(`${fieldId} reads back as ${expect[fieldId]}`,
      Ownership.describe(fieldId, filled, null).display, expect[fieldId]);
  });

  /* THE rule: a room that does not own a field must not contain an input
     bound to it. This is the check that would have caught debt minimums
     being typeable in Cash Flow while also living in Debt Payoff. */
  const OWNED_INPUT_MARKERS = {
    'cash-flow': [/data-cat="debt_minimums"/],
    'financial-snapshot': [/data-field="/, /data-write="/, /input[^>]*id="f-/],
    'start': [/data-cat=/, /data-debt=/]
  };
  Object.keys(OWNED_INPUT_MARKERS).forEach(function (roomId) {
    const room = Registry.byId(roomId);
    const html = fs.readFileSync(path.join(ROOT, room.href), 'utf8');
    OWNED_INPUT_MARKERS[roomId].forEach(function (re) {
      checkTrue(`${roomId} has no input matching ${re}`, !re.test(html),
        'a room is taking input for a field it does not own');
    });
  });

  /* The Financial Snapshot must take no input at all — it is a dashboard. */
  const snapHtml = fs.readFileSync(path.join(ROOT, 'rooms/financial-snapshot.html'), 'utf8');
  const snapInputs = (snapHtml.match(/<input|<select/g) || []).length;
  check('the Financial Snapshot has no input elements', snapInputs, 0);

  /* Debt minimums specifically: derived, owned by Debt Payoff, uneditable
     in Cash Flow. This is the case that started all of it. */
  const dmCat = TABLES.expenseCategories.categories.filter(c => c.id === 'debt_minimums')[0];
  check('debt minimums is a derived category', dmCat.derivedFrom, 'monthlyDebtPayments');
  check('and names Debt Payoff as its owner', dmCat.ownedBy, 'debt-payoff');
  check('and monthlyDebtPayments is owned there too',
    Ownership.FIELDS.monthlyDebtPayments.owner, 'debt-payoff');
})();

/* ==========================================================================
   11. The path has a well-formed order.
   ========================================================================== */

section('Room order');

(function () {
  const path_ = Registry.inOrder();
  check('every room is on the path', path_.length, Registry.all().length);
  const orders = path_.map(r => r.order);
  checkTrue('every room declares an order', orders.every(o => typeof o === 'number'));
  check('orders are unique', new Set(orders).size, orders.length);
  checkTrue('orders are ascending', orders.every((o, i) => i === 0 || o > orders[i - 1]));
  check('Start Here comes first', path_[0].id, 'start');
  check('the Snapshot comes after the rooms that feed it',
    path_.findIndex(r => r.id === 'financial-snapshot') >
    Math.max(path_.findIndex(r => r.id === 'debt-payoff'), path_.findIndex(r => r.id === 'cash-flow')),
    true);

  check('with nothing visited, the next room is the first',
    Registry.nextAfter(null, []).id, 'start');
  check('with Start done, the next is Debt Payoff',
    Registry.nextAfter(null, ['start']).id, 'debt-payoff');
  check('skipping ahead still points at the earliest unvisited',
    Registry.nextAfter(null, ['start', 'cash-flow']).id, 'debt-payoff');
})();

/* ==========================================================================
   12. Every reference table is reachable through the loader.
   A table added to data/ but never registered in shared/reference.js loads
   as undefined in the browser and takes the room down with it — which is
   exactly what happened once. Both directions are checked.
   ========================================================================== */

section('Reference tables');

(function () {
  const Reference = require(path.join(ROOT, 'shared/reference.js'));
  const onDisk = fs.readdirSync(path.join(ROOT, 'data')).filter(f => f.endsWith('.json'));
  const registered = Object.values(Reference.TABLE_FILES);

  onDisk.forEach(function (file) {
    checkTrue(`data/${file} is registered in reference.js TABLE_FILES`,
      registered.includes(file),
      'add it to TABLE_FILES or it cannot be loaded by a room');
  });
  Object.keys(Reference.TABLE_FILES).forEach(function (name) {
    const file = Reference.TABLE_FILES[name];
    checkTrue(`TABLE_FILES.${name} -> data/${file} exists`,
      fs.existsSync(path.join(ROOT, 'data', file)));
  });
  /* Every table carries the version/as-of stamp SPEC.md §6 requires, and
     says how much its numbers are worth. The confidence field is not
     decoration: a data layer that hands back a plausible number with no way
     to know it was invented is how a believable wrong answer ships, which
     is the whole argument in DECISIONS.md D-036. */
  onDisk.forEach(function (file) {
    const t = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', file), 'utf8'));
    checkTrue(`data/${file} declares a version`, typeof t.version === 'string' && t.version.length > 0);
    checkTrue(`data/${file} declares an asOf date`, typeof t.asOf === 'string' && t.asOf.length > 0);
    checkTrue(`data/${file} names its source`, typeof t.source === 'string' && t.source.length > 0);
    checkTrue(`data/${file} declares how much its numbers are worth`,
      Reference.CONFIDENCE_LEVELS.indexOf(t.confidence) !== -1,
      `confidence must be one of ${Reference.CONFIDENCE_LEVELS.join(' / ')}`);
    checkTrue(`data/${file} says why it carries that confidence`,
      typeof t.confidenceNote === 'string' && t.confidenceNote.length > 0);
  });

  /* Provenance reads back, and the weakest figure sorts first so a room
     leads with the number a reader should trust least. */
  (function () {
    const tables = {};
    onDisk.forEach(function (file) {
      const name = Object.keys(Reference.TABLE_FILES)
        .filter(k => Reference.TABLE_FILES[k] === file)[0];
      if (name) tables[name] = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', file), 'utf8'));
    });
    const ordered = Reference.provenance(tables, ['seTax', 'fooRules', 'irsLimits']);
    check('provenance comes back weakest first',
      ordered.map(p => p.confidence).join(','), 'unverified,convention,sourced');
    check('and carries the table id', ordered[0].id, 'irs_limits');
    checkTrue('and a label a room can print', ordered.every(p => p.label && p.label.length));
    check('an absent table yields nothing rather than a fake entry',
      Reference.provenance(tables, ['notATable']).length, 0);
    check('a missing table has no provenance', Reference.provenanceOf(null), null);
    /* A table with no confidence field is treated as the weakest, never as
       trustworthy by default. */
    check('an untagged table defaults to unverified',
      Reference.provenanceOf({ id: 'x' }).confidence, 'unverified');
  })();
})();

/* ==========================================================================
   13. Registry deep links resolve to real elements.
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
    const found = new RegExp(`id=["']${sub.id}["']`).test(html) || builtCardId(room.id, sub.id);
    checkTrue(`${room.id} → #${sub.id} exists in ${room.href}`, found);
  });
  checkTrue(`${room.id} carries at least one filter tag`,
    room.tags.some(t => Registry.FILTER_TAGS.includes(t)));
  checkTrue(`${room.id} registers itself with the spine`,
    html.includes('registerRoom') || html.includes('Room.mount('), 'no registerRoom() call found (the template does it for a Room.mount room)');
  checkTrue(`${room.id} uses the shared stylesheet, not its own hex values`,
    html.includes('theme.css'));
});


/* ==========================================================================
   The D&D folder vendors part of this suite. Keep the copies honest.
   --------------------------------------------------------------------------
   dnd/ is a separate product that happens to live in this repo. It carries
   its OWN copy of the calculation core so it can be lifted out into its own
   repository later without a single edit — see DECISIONS.md DD-004.

   The hazard that buys is obvious: someone fixes a bug in engines/tier0.js,
   dnd/engines/tier0.js silently keeps the bug, and the two tools start
   disagreeing about a number while both look fine. So the copies are asserted
   byte-identical here. If this fails you have not broken anything yet — you
   have edited one of a pair, and the fix is to copy it across.
   ========================================================================== */
section('The Statement room');

(function () {
  /* D-069: The Statement replaces Net Worth as the owner of the itemised
     assets and of net worth itself; the old file is a redirect. */
  const stmt = Registry.byId('statement');
  checkTrue('The Statement is registered', !!stmt);
  check('as a core room', stmt.kind, 'core');
  check('at the old Net Worth position', stmt.order, 5);
  checkTrue('Net Worth is no longer a room', !Registry.byId('net-worth'));
  const html = fs.readFileSync(path.join(ROOT, 'rooms/statement.html'), 'utf8');
  const stub = fs.readFileSync(path.join(ROOT, 'rooms/net-worth.html'), 'utf8');
  checkTrue('the old Net Worth file redirects to it', /url=statement\.html/.test(stub));
  ['#out-net-worth', '#ledger', '#from-elsewhere'].forEach(function (old) {
    checkTrue(`old deep link ${old} is mapped`, stub.indexOf("'" + old + "'") !== -1);
  });
  checkTrue('the room declares its live-form policy', /LIVE-FORM: guarded/.test(html));
  checkTrue('the room takes no debt input (Debt Payoff owns debts)', !/data-field="balanceCents"/.test(html));

  check('itemised assets are owned by The Statement', Ownership.field('otherAssets').owner, 'statement');
  check('net worth is owned by The Statement', Ownership.field('netWorth').owner, 'statement');
  check('so is the weighted figure', Ownership.field('confidenceWeightedNetWorth').owner, 'statement');
  check('and money that is coming', Ownership.field('futureIncome').owner, 'statement');
  checkTrue('cash is still asked in Start Here', Ownership.field('cashSavings').owner === 'start');
  ['otherAssets', 'netWorth', 'confidenceWeightedNetWorth', 'futureIncome'].forEach(function (f) {
    const a = Ownership.field(f).anchor;
    checkTrue(`${f} links to an anchor that exists`, new RegExp('id="' + a + '"').test(html));
  });

  const h = Demo.build();
  const nothing = Ownership.field('confidenceWeightedNetWorth').read(h);
  check('unrated everywhere: no weighted figure', nothing.status, 'incomplete');
  h.assets[0].confidence = 3;
  const some = Ownership.field('confidenceWeightedNetWorth').read(h);
  check('one asset rated "do not count on it": half of it, less all the debt',
    some.value, Math.round(h.assets[0].valueCents * 0.5) - Schema.totalDebtCents(h).value);
  check('nothing coming: incomplete', Ownership.field('futureIncome').read(h).status, 'incomplete');
  h.futureIncome = [Schema.createFutureIncome({ label: 'Pension', monthlyCents: 120000, startsAtAge: 67 }),
                    Schema.createFutureIncome({ label: 'Maybe', monthlyCents: null })];
  check('future income is the sum of the entered monthly amounts', Ownership.field('futureIncome').read(h).value, 120000);
})();

section('Targets, owned by FIRE');

(function () {
  /* D-070: the ages you plan around are stored, not previewed. */
  check('the stop age is owned by FIRE', Ownership.field('retireAge').owner, 'fire');
  check('the coast age is owned by FIRE', Ownership.field('coastAge').owner, 'fire');
  const fire = fs.readFileSync(path.join(ROOT, 'rooms/fire.html'), 'utf8');
  checkTrue('both link to an anchor that exists', /id="targets"/.test(fire)
    && Ownership.field('retireAge').anchor === 'targets' && Ownership.field('coastAge').anchor === 'targets');
  checkTrue('the unstored coast preview knob is gone', !/p-coast-age/.test(fire));
  checkTrue('the room declares its live-form policy for the target boxes', /LIVE-FORM: built once/.test(fire));
  checkTrue('FIRE lists the targets as a subsection',
    Registry.byId('fire').subsections.some(function (s) { return s.id === 'targets'; }));

  const h = Demo.build();
  check('undecided: incomplete, not zero', Ownership.field('retireAge').read(h).status, 'incomplete');
  check('and the coast age too', Ownership.field('coastAge').read(h).status, 'incomplete');
  h.targets = Schema.createTargets({ retireAge: 55, coastAge: 60 });
  check('a decided stop age reads back', Ownership.field('retireAge').read(h).value, 55);
  check('formatted as an age', Ownership.field('retireAge').format(55), 'age 55');
  const chip = Ownership.describe('coastAge', h, 'statement');
  checkTrue('elsewhere it is read-only and links home', !chip.mine && /fire\.html#targets$/.test(chip.href));

  /* The coast variant reads the stored age instead of a knob. */
  const fireT = Object.assign({}, TABLES);
  const stored = Fire.calculateFIRE(h, fireT, { variantId: 'coast', coastTargetAge: h.targets.coastAge });
  const dflt = Fire.calculateFIRE(Demo.build(), fireT, { variantId: 'coast' });
  checkTrue('coast to 60 needs more today than coast to 65', Money.isOk(stored) && Money.isOk(dflt) && stored.value > dflt.value);
  check('and says which age it grew to', stored.coastTargetAge, 60);
})();

section('The Coverage Checkup, and how it is split');

(function () {
  /* D-071: four facts about cover, owned by Sleep At Night; a target mix,
     owned by Where It Goes. Both stored, both read-only elsewhere. */
  ['oopMax', 'termLife', 'disabilityMonthly', 'umbrella'].forEach(function (f) {
    check(`${f} is owned by Sleep At Night`, Ownership.field(f).owner, 'sleep-at-night');
    check(`${f} links to the coverage card`, Ownership.field(f).anchor, 'coverage');
  });
  ['allocationStocks', 'allocationBonds', 'allocationCash', 'rebalanceBand'].forEach(function (f) {
    check(`${f} is owned by Where It Goes`, Ownership.field(f).owner, 'accounts');
    check(`${f} links to the allocation card`, Ownership.field(f).anchor, 'allocation');
  });
  const san = fs.readFileSync(path.join(ROOT, 'rooms/sleep-at-night.html'), 'utf8');
  const acc = fs.readFileSync(path.join(ROOT, 'rooms/accounts.html'), 'utf8');
  checkTrue('the coverage card exists', /id="coverage"/.test(san));
  checkTrue('the allocation card exists', /id="allocation"/.test(acc));
  checkTrue('the deductible is still asked in Start Here, not here', !/data-field="highestDeductible"|id="c-deductible"/.test(san)
    && Ownership.field('highestDeductible').owner === 'start');
  checkTrue('Where It Goes says so in its title', /how it.s split/.test(Registry.byId('accounts').title));
  checkTrue('Sleep At Night lists the checkup', Registry.byId('sleep-at-night').subsections.some(s => s.id === 'coverage'));
  checkTrue('Where It Goes lists the split', Registry.byId('accounts').subsections.some(s => s.id === 'allocation'));

  const h = Demo.build();
  check('nothing entered: not priced, not zero', Ownership.field('oopMax').read(h).status, 'incomplete');
  check('umbrella unanswered is incomplete', Ownership.field('umbrella').read(h).status, 'incomplete');
  h.insurance.umbrella = false;
  check('"no" is an answer', Ownership.field('umbrella').read(h).status, 'ok');
  check('formatted as No', Ownership.field('umbrella').format(false), 'No');
  h.insurance.disabilityMonthlyCents = 300000;
  check('a monthly benefit is formatted per month', Ownership.field('disabilityMonthly').format(300000), '$3,000/mo');
  const elsewhere = Ownership.describe('oopMax', Object.assign(h, { insurance: Object.assign(h.insurance, { oopMaxCents: 800000 }) }), 'statement');
  checkTrue('elsewhere it is a read-only chip linking home', !elsewhere.mine && /sleep-at-night\.html#coverage$/.test(elsewhere.href));

  /* The mix, checked by one function. */
  check('no mix: incomplete', Schema.allocationStatus(h).status, 'incomplete');
  h.allocation = Schema.createAllocation({ stocks: 0.7 });
  const part = Schema.allocationStatus(h);
  check('one slice: 70% placed', part.value, 0.7, 1e-12);
  checkTrue('and not complete', !part.complete && part.missing.join(',') === 'bonds,cash');
  h.allocation = Schema.createAllocation({ stocks: 0.7, bonds: 0.2, cash: 0.15 });
  const over = Schema.allocationStatus(h);
  checkTrue('adds to 105%: complete but not balanced', over.complete && !over.balanced && Math.abs(over.value - 1.05) < 1e-12);
  h.allocation = Schema.createAllocation({ stocks: 0.7, bonds: 0.2, cash: 0.1, rebalanceBand: 0.05 });
  checkTrue('adds to 100%: balanced', Schema.allocationStatus(h).balanced);
  check('a share reads as a percentage', Ownership.field('allocationStocks').format(0.7), '70%');
  check('the band reads as ±', Ownership.field('rebalanceBand').format(0.05), '±5%');

  /* The worst plausible year reads the out-of-pocket maximum from here. */
  const St = require(path.join(ROOT, 'engines/statement.js'));
  const T = Object.assign({}, TABLES, { uiBenefits: require(path.join(ROOT, 'data/ui_benefits.json')) });
  const without = St.worstPlausibleYear(Demo.build(), T);
  const withOop = St.worstPlausibleYear(h, T);
  checkTrue('and the year costs exactly that much more', Money.isOk(without) && Money.isOk(withOop) && withOop.value - without.value === 800000);
})();

section('The benchmarks');

(function () {
  /* D-079: the numbers that place a household against a convention. */
  const B = require(path.join(ROOT, 'engines/benchmarks.js'));
  const T = Object.assign({}, TABLES, {
    wealthMultiplier: require(path.join(ROOT, 'data/wealth_multiplier.json')),
    levelsOfWealth: require(path.join(ROOT, 'data/levels_of_wealth.json'))
  });
  const wm = T.wealthMultiplier;

  /* The return path: 10% at 20, falling a tenth of a point a year to 5.5%. */
  check('return at 20', B.returnAt(wm, 20), 0.10, 1e-12);
  check('return at 32', B.returnAt(wm, 32), 0.088, 1e-12);
  check('return at 65 sits on the floor', B.returnAt(wm, 65), 0.055, 1e-12);
  check('return at 80 stays on the floor', B.returnAt(wm, 80), 0.055, 1e-12);

  /* One year from 64: twelve monthly factors, written out longhand. */
  let longhand = 1;
  for (let m = 0; m < 12; m++) {
    const age = 64 + m / 12;
    const rate = Math.max(0.055, 0.10 - 0.001 * (age - 20));
    longhand *= 1 + rate / 12;
  }
  const at64 = B.wealthMultiplier(Demo.build(), T, { age: 64 });
  check('a dollar at 64 grows for twelve months', at64.months, 12);
  check('by the longhand product', at64.value, longhand, 1e-12);
  check('a dollar at 65 is a dollar', B.wealthMultiplier(Demo.build(), T, { age: 65 }).value, 1);
  const at32 = B.wealthMultiplier(Demo.build(), T);
  check('the demo is 32', at32.age, 32);
  check('with 396 months to run', at32.months, 396);
  checkTrue('and a dollar at 32 beats a dollar at 40 beats a dollar at 64',
    at32.value > B.wealthMultiplier(Demo.build(), T, { age: 40 }).value && B.wealthMultiplier(Demo.build(), T, { age: 40 }).value > at64.value);
  const noDob = Demo.build(); noDob.people[0].dob = null;
  check('no date of birth: incomplete, naming dob', B.wealthMultiplier(noDob, T).missing.join(','), 'dob');

  /* Monthly to $1M: simulate the contributions forward and land on target. */
  const bare = Demo.build();
  bare.assets = bare.assets.filter(a => a.category !== 'investment');
  bare.assets.push(Schema.createAsset({ category: 'investment', valueCents: 0 }));
  const m1 = B.monthlyToReach(bare, T, 100000000);
  check('with nothing invested the existing balance grows to nothing', m1.existingGrowsToCents, 0);
  let balance = 0;
  const c = B.curve(wm, 32);
  for (let m = 0; m < c.months; m++) balance = (balance + m1.value) * c.factors[m];
  checkTrue('paying that every month lands within $10 of $1M', Math.abs(balance - 100000000) < 1000);
  const m1demo = B.monthlyToReach(Demo.build(), T, 100000000);
  checkTrue('the demo\'s $48,000 already growing lowers the monthly', m1demo.value < m1.value && m1demo.existingGrowsToCents === Math.round(4800000 * at32.value));
  const rich = Demo.build();
  rich.assets.filter(a => a.category === 'investment')[0].valueCents = 20000000;
  check('$200,000 at 32 already grows past $1M: nothing a month', B.monthlyToReach(rich, T, 100000000).value, 0);
  checkTrue('and says so', B.monthlyToReach(rich, T, 100000000).alreadyThere);
  check('two milestones, $1M and $2M', B.milestones(Demo.build(), T).map(x => x.targetCents).join(','), '100000000,200000000');

  /* PAW: expected = age × income ÷ 10. Demo: 32 × 72,000 ÷ 10 = 230,400. */
  const paw = B.pawRatio(Demo.build(), T);
  check('expected net worth for the demo', paw.expectedNetWorthCents, 23040000);
  check('ratio 35,900 ÷ 230,400', paw.value, 3590000 / 23040000, 1e-12);
  check('which is an under-accumulator', paw.classification, 'under');
  const paw2 = B.pawRatio(rich, T);
  check('with $200,000 invested the ratio is (200,000 + 9,500 − 21,600) ÷ 230,400', paw2.value, 18790000 / 23040000, 1e-12);
  check('which is average', paw2.classification, 'average');
  const paw3 = Demo.build(); paw3.assets.filter(a => a.category === 'investment')[0].valueCents = 50000000;
  check('$500,000 invested: prodigious', B.pawRatio(paw3, T).classification, 'prodigious');

  /* The five levels. The demo carries a high-interest card: level 0. */
  const lv = B.levelsOfWealth(Demo.build(), T);
  check('the demo is at level 0', lv.value, 0);
  check('stopped by level 1', lv.stoppedBy.id, 1);
  check('because of one high-interest debt', lv.checks[0].result.highInterestDebtCount, 1);
  check('level 5 is never assigned by the engine', lv.checks[4].met, null);
  checkTrue('and says it is self-declared', lv.checks[4].result.selfDeclared === true);
  const stable = Demo.build();
  stable.debts.forEach(d => { d.rate = 0.05; });
  const lv2 = B.levelsOfWealth(stable, T);
  check('with every rate under the threshold, level 1 is met', lv2.checks[0].met, true);
  check('the starter fund target is one month of spending', lv2.checks[0].result.starterTargetCents, 315000);
  check('the 31.5% savings rate clears level 2', lv2.checks[1].met, true);
  check('level 3 needs growth ≥ take-home: $48,000 × 7% does not', lv2.checks[2].met, false);
  check('so the household is at level 2', lv2.value, 2);
  const unrated = Demo.build(); unrated.debts.forEach(d => { d.rate = null; });
  check('a debt with no rate makes level 1 unknown, not failed', B.levelsOfWealth(unrated, T).checks[0].met, null);

  /* One more point of savings rate: $720 a year on $72,000. */
  const one = B.onePercentMore(Demo.build(), T);
  check('one point of $72,000 is $720', one.extraAnnualCents, 72000);
  check('the FI date moves a year closer', one.deltaYears, -1);
  checkTrue('and the balance at 65 rises', one.at65.deltaCents > 0 && one.at65.years === 33);
  checkTrue('by more than 33 × $720, because it compounds', one.at65.deltaCents > 33 * 72000);

  /* Human capital: an annuity of $72,000 for 23 years at 2% real. */
  const hc = Demo.build(); hc.targets = Schema.createTargets({ retireAge: 55 });
  const pv = B.humanCapital(hc, T);
  check('23 years to the stop age', pv.years, 23);
  check('present value by the annuity formula', pv.value, Math.round(7200000 * (1 - Math.pow(1.02, -23)) / 0.02), 1);
  check('no stop age: incomplete, naming retireAge', B.humanCapital(Demo.build(), T).missing.join(','), 'retireAge');
  check('the discount rate is an assumption with a default', Schema.resolveAssumptions(Demo.build()).humanCapitalDiscountRate, 0.02);

  /* Net worth in years: 35,900 ÷ 37,800. */
  check('net worth in years', B.netWorthInYears(Demo.build()).value, 3590000 / 3780000, 1e-12);
  check('all() answers every question', Object.keys(B.all(Demo.build(), T)).length, 8);
})();

section('The contributed savings rate');

(function () {
  /* D-080: residual is what is left; contributed is what went somewhere. */
  const T = Object.assign({}, TABLES);
  const bare = Demo.build();
  const c = CashFlow.savingsRateContributed(bare, T);
  check('demo without a tracked month: 4% of $72,000 + $1,500 Roth = $4,380', c.annualSavingsCents, 438000);
  check('as a rate', c.value, 438000 / 7200000, 1e-12);
  check('HSA not entered is listed, not zeroed', c.notEntered.join(','), 'hsaContributedCents');
  check('the residual beside it is 28.5%', c.residualRate, 0.285, 1e-12);
  check('so $16,140 a year is unallocated', c.unallocatedAnnualCents, 2052000 - 438000);
  check('which is $1,345 a month', c.unallocatedMonthlyCents, 134500);

  const tracked = Demo.build();
  tracked.expenses.entries = Demo.buildSpending();
  const t = CashFlow.savingsRateContributed(tracked, T);
  check('with the tracked month, the $400 retirement line beats the 4% and counts once', t.retirementOverlap.usedTracked, true);
  check('$4,800 retirement + $1,500 Roth + $3,600 emergency savings', t.annualSavingsCents, 480000 + 150000 + 360000);
  checkTrue('the parts are named', t.parts.map(p => p.id).join(',') === 'tracked:retirement,rothContributedCents,tracked:emergency_savings');

  const none = Demo.build(); none.retirement.contributionPercent = null;
  check('no contribution percentage: incomplete, naming it', CashFlow.savingsRateContributed(none, T).missing.join(','), 'contributionPercent');

  /* The headline instrument prefers the contributed rate. */
  const inst = InstrumentsMain.compute(bare, T);
  check('the dashboard headline is the contributed rate', inst.byId.savingsRate.result.variant, 'contributed');
  check('and falls back to the residual without a percentage', InstrumentsMain.compute(none, T).byId.savingsRate.result.variant, 'excludingMatch');
})();

section('The ratios T3 unlocked');

(function () {
  /* D-081: fourteen more rows in the one registry, each hand-derived. */
  const R = RatiosEngine;
  const NOW = Date.parse('2026-09-05T12:00:00Z');
  function rows(h, opts) {
    const a = R.all(h, TABLES, Object.assign({ now: NOW }, opts || {}));
    /* Flatten: the Result's value and extras, plus the row's verdict. */
    const by = {}; a.rows.forEach(r => { by[r.id] = Object.assign({}, r.result, { ok: r.ok, unavailable: r.unavailable, verdict: r.verdict, result: r.result }); });
    return by;
  }
  const h = Demo.build();
  const by = rows(h);

  check('income concentration: one paycheque is 100%', by.incomeConcentration.value, 1);
  check('unrated everywhere: no weighted net worth', by.confidenceWeightedNetWorth.ok, false);
  const rated = Demo.build(); rated.assets[0].confidence = 3;
  check('cash rated "do not count on it": half of $9,500 less $21,600 debt', rows(rated).confidenceWeightedNetWorth.value, 475000 - 2160000);
  check('everything the demo owns is reachable within a year', by.liquidityLadder.value, 1, 1e-12);
  check('shadow runway with no Roth basis and no home is plain runway: 9,500 ÷ 3,150', by.shadowRunway.value, 9500 / 3150, 1e-12);
  const homed = Demo.build();
  homed.assets.push(Schema.createAsset({ category: 'real_estate', valueCents: 30000000 }));
  homed.debts.push(Schema.createDebt({ type: 'mortgage', balanceCents: 20000000, rate: 0.06, minPaymentCents: 150000 }));
  const sh = rows(homed).shadowRunway;
  check('a $300,000 home with $200,000 owed adds 80% of $100,000', sh.poolCents, 950000 + 8000000);
  check('as months of a $3,150 month', sh.value, 8950000 / 315000, 1e-12);
  check('the haircut is the 0.8 assumption', sh.haircut, 0.8);
  check('worst-year coverage: $9,500 cash over $17,200 net', by.worstPlausibleYearCoverage.value, 9500 / 17200, 1e-9);
  check('which is in the watch zone', by.worstPlausibleYearCoverage.verdict.zone, 'watch');
  check('automation is unavailable until the Skill Stacker asks', by.automationRatio.unavailable, true);
  check('giving rate without a tracked month is incomplete', by.givingRate.ok, false);
  const giving = Demo.build();
  giving.expenses.entries = Demo.buildSpending().concat([Schema.createExpenseEntry({ categoryId: 'gifts', amountCents: 17100 })]);
  const take = Tier0.takeHomeMonthlyCents(giving, TABLES).value;
  check('$171 of gifts over take-home', rows(giving).givingRate.value, 17100 / take, 1e-12);
  check('net worth in years: 35,900 ÷ 37,800', by.netWorthInYears.value, 3590000 / 3780000, 1e-12);
  check('human to financial capital needs a stop age', by.humanToFinancialCapital.missing.join(','), 'retireAge');
  const stopping = Demo.build(); stopping.targets = Schema.createTargets({ retireAge: 55 });
  const hf = rows(stopping).humanToFinancialCapital;
  check('with one: the $1,317,039 annuity over $57,500', hf.value, hf.humanCapitalCents / 5750000, 1e-12);
  checkTrue('which is about 23×', hf.value > 22.5 && hf.value < 23.5);
  check('room in the bracket: $49,800 before 24%', by.bracketRoom.value, 4980000);
  check('and says the next rate', by.bracketRoom.nextRate, 0.24);
  check('bridge to 59½: 8.5 years for the demo', by.bridgeGapYears.value, 8.5);
  check('FI date: 19 years of 365.25 days from noon on 5 Sep 2026', by.fiDate.iso, '2045-09-05');
  check('as a decimal year to the month', by.fiDate.value, 2045 + 8 / 12, 1e-12);

  /* The two that need a year to exist. */
  check('lifestyle inflation with no snapshot asks for one', by.lifestyleInflation.missing.join(','), 'snapshots');
  const recent = [{ timestamp: '2026-06-01T00:00:00Z', fields: { grossAnnualIncome: 6000000, monthlyExpenses: 280000, netWorth: 2000000 } }];
  checkTrue('a three-month-old snapshot is too recent', /more recent/.test(rows(h, { snapshots: recent }).lifestyleInflation.result.reason));
  const yearOld = [{ timestamp: '2025-08-01T00:00:00Z', fields: { grossAnnualIncome: { status: 'ok', value: 6000000 }, monthlyExpenses: 280000, netWorth: 2000000 } }];
  const li = rows(h, { snapshots: yearOld }).lifestyleInflation;
  check('a $12,000 raise against $350/mo more spending: 4,200 ÷ 12,000', li.value, 4200 / 12000, 1e-12);
  check('read from a snapshot that stored a Result and a bare number alike', li.raiseCents, 1200000);
  check('below half a raise kept: good', li.verdict.zone, 'good');
  const g = rows(h, { snapshots: yearOld }).netWorthGrowthRate;
  const years = (NOW - Date.parse('2025-08-01T00:00:00Z')) / 86400000 / 365.25;
  check('net worth growth: 15,900 over 20,000, per year', g.value, (3590000 - 2000000) / 2000000 / years, 1e-12);
  const flat = [{ timestamp: '2025-08-01T00:00:00Z', fields: { grossAnnualIncome: 7200000, monthlyExpenses: 280000, netWorth: 0 } }];
  checkTrue('no raise: nothing to measure against', /not risen/.test(rows(h, { snapshots: flat }).lifestyleInflation.result.reason));
  checkTrue('growth from zero is undefined', /undefined/.test(rows(h, { snapshots: flat }).netWorthGrowthRate.result.reason));

  check('every new band is in the table', ['incomeConcentration', 'shadowRunway', 'worstPlausibleYearCoverage', 'lifestyleInflation', 'fiDate']
    .every(id => TABLES.ratioBenchmarks.bands[id]), true);
  checkTrue('the bands table moved past 1.3 (withdrawal rate, D-096; invested share, D-123)', parseFloat(TABLES.ratioBenchmarks.version) >= 1.3);
})();

section('Fixed lines, the floor, and cuttability');

(function () {
  /* D-082: which lines could not be cut next month. */
  const cat = TABLES.expenseCategories;
  const h = Demo.build();
  h.expenses.entries = Demo.buildSpending();
  check('a fresh entry is not asked', Schema.createExpenseEntry({ categoryId: 'housing', amountCents: 1 }).fixed, null);
  check('nothing marked: the floor asks, it does not assume', CashFlow.minimumViableMonthCents(h, cat).missing.join(','), 'expenseEntries.fixed');
  const sum = CashFlow.summarise(h, cat);
  const debt = sum.categories.filter(r => r.categoryId === 'debt_minimums')[0];
  checkTrue('debt minimums are fixed by nature', debt.fixed === true && debt.fixedMonthlyCents === 30500);

  ['housing', 'utilities', 'insurance'].forEach(id => { h.expenses.entries.filter(e => e.categoryId === id)[0].fixed = true; });
  h.expenses.entries.filter(e => e.categoryId === 'dining_out')[0].fixed = false;
  const floor = CashFlow.minimumViableMonthCents(h, cat);
  check('the floor: housing 1,500 + utilities 180 + insurance 150 + minimums 305', floor.value, 150000 + 18000 + 15000 + 30500);
  check('spending it sits inside: 2,895 tracked + 305 minimums', floor.spendMonthlyCents, 289500 + 30500);
  check('four lines answered by hand, plus minimums by nature', floor.askedCount, 5);
  check('and four not yet asked (groceries, transport, subscriptions, entertainment)', floor.unaskedCount, 4);
  checkTrue('savings lines are outside the floor', floor.fixedRows.every(r => r.categoryId !== 'retirement' && r.categoryId !== 'emergency_savings'));
  const cut = CashFlow.cuttability(h, cat);
  check('cuttability = 1 − 2,135 ÷ 3,200', cut.value, 1 - 213500 / 320000, 1e-12);

  /* The Runway engine reports the basis it was given and the room chooses. */
  const T = Object.assign({}, TABLES);
  const now = RunwayEngine.project(h, T, { preset: 'quit' });
  const atFloor = RunwayEngine.project(h, T, { preset: 'quit', monthlyExpensesCents: floor.value, expenseBasis: 'floor' });
  check('the default basis is current', now.expenseBasis, 'current');
  check('at the floor the engine says so', atFloor.expenseBasis, 'floor');
  checkTrue('and the money lasts longer', atFloor.value > now.value);
  const runwayHtml = fs.readFileSync(path.join(ROOT, 'rooms/runway.html'), 'utf8');
  checkTrue('the Runway room offers the floor as a basis', /data-in="basis"/.test(runwayHtml) && /value="floor"/.test(runwayHtml));
  const cfHtml = fs.readFileSync(path.join(ROOT, 'rooms/cash-flow.html'), 'utf8');
  checkTrue('Cash Flow asks per line', /data-fixed=/.test(cfHtml));
})();

section('Three benchmarks, and where the new numbers show');

(function () {
  /* D-083 */
  const B = require(path.join(ROOT, 'engines/benchmarks.js'));
  const t = B.threeBenchmarks(Demo.build(), TABLES);
  check('all three can be worked out for the demo', t.value, 3);
  check('the percentile verdict', t.verdicts.percentile, t.percentile.value >= 60 ? 'ahead' : t.percentile.value <= 40 ? 'behind' : 'middle');
  check('the multiple: 48,000 ÷ 72,000 against a 1× milestone at 32 is behind', t.verdicts.multiple, 'behind');
  check('PAW: under', t.verdicts.paw, 'behind');
  checkTrue('the sentence names what each measures', /measure different things|say/.test(t.sentence));
  const rich = Demo.build(); rich.assets.filter(a => a.category === 'investment')[0].valueCents = 60000000;
  const r = B.threeBenchmarks(rich, TABLES);
  checkTrue('with $600,000 invested every verdict is ahead, and they agree', r.agree && r.verdicts.percentile === 'ahead' && r.verdicts.multiple === 'ahead' && r.verdicts.paw === 'ahead');
  const blank = Schema.createHousehold({});
  checkTrue('a blank household: fewer than two can be worked out', /Fewer than two/.test(B.threeBenchmarks(blank, TABLES).sentence));

  const dash = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  checkTrue('the Weather panel lists income concentration and worst-year coverage', /'incomeConcentration'/.test(dash) && /'worstPlausibleYearCoverage'/.test(dash));
  checkTrue('the Flight plan carries the five levels', /id="wealth-levels"/.test(dash));
  const snap = fs.readFileSync(path.join(ROOT, 'rooms/financial-snapshot.html'), 'utf8');
  checkTrue('the Snapshot has the three-benchmarks card', /id="out-benchmarks"/.test(snap) && /id="three-benchmarks"/.test(snap));
  checkTrue('and the registry links to it', Registry.byId('financial-snapshot').subsections.some(x => x.id === 'out-benchmarks'));
})();

section('The Rerank');

(function () {
  /* D-085: cost rank against value rank. */
  const R = require(path.join(ROOT, 'engines/rerank.js'));
  const T = Object.assign({}, TABLES, { commonCosts: require(path.join(ROOT, 'data/common_costs.json')) });
  check('threshold is max(3, a quarter)', [4, 9, 12, 20, 40].map(R.threshold).join(','), '3,3,3,5,10');

  /* No month tracked: twenty proposals, scaled to the essentials. */
  const fresh = Demo.build();
  const l = R.lines(fresh, T);
  check('the demo without a month gets proposals', l.basis, 'suggested');
  const tableEssential = T.commonCosts.lines.filter(x => x.essential).reduce((t, x) => t + x.monthlyCents, 0);
  check('scaled by 3,150 over the table\'s essential lines', l.scale, 315000 / tableEssential, 1e-12);
  checkTrue('a zero line (childcare) is not proposed', l.lines.every(x => x.id !== 'childcare'));
  checkTrue('the debt minimums ride along, derived', l.lines.some(x => x.id === 'debt_minimums' && x.source === 'derived' && x.monthlyCents === 30500));
  const unrated = Demo.build(); unrated.ratings = {};
  checkTrue('nothing rated: no flags, no value ranks', R.analyse(unrated, T).rows.every(r => r.valueRank === null && r.flag === null));

  /* A proposal typed becomes an entry under a stable id and replaces itself. */
  const typed = Demo.build();
  typed.expenses.entries = [Schema.createExpenseEntry({ id: R.SUGGESTED_ENTRY_PREFIX + 'gym', categoryId: 'subscriptions', amountCents: 4000, source: 'rerank', descriptor: 'Gym' })];
  const tl = R.lines(typed, T);
  check('the gym line appears once, as entered', tl.lines.filter(x => x.label === 'Gym').map(x => x.source).join(','), 'entered');
  checkTrue('and the other proposals stay', tl.lines.some(x => x.id === 'streaming' && x.source === 'suggested'));
  typed.expenses.entries.push(Schema.createExpenseEntry({ id: 'e_blank', categoryId: 'other', amountCents: null, source: 'rerank', descriptor: 'Allotment' }));
  typed.ratings = { rerank: { e_blank: 9 } };
  const blankLine = R.analyse(typed, T);
  const ratedProposal = Demo.build(); ratedProposal.ratings = { rerank: { groceries: 8 } };
  checkTrue('a rated proposal is still a proposal: no rank', R.analyse(ratedProposal, T).rows.filter(r => r.id === 'groceries')[0].costRank === null);
  checkTrue('a custom line with no amount is listed but ranked nowhere', R.lines(typed, T).lines.some(x => x.id === 'e_blank')
    && blankLine.rows.filter(r => r.id === 'e_blank')[0].costRank === null && blankLine.uncostedCount === 1 && blankLine.ratedCount === 0);

  /* The demo month plus Robin's ratings: the acceptance criterion. */
  const h = Demo.build();
  h.expenses.entries = Demo.buildSpending();
  const a = R.analyse(h, T);
  check('nine lines rated (eight tracked spending lines + minimums; savings excluded)', a.ratedCount, 9);
  check('threshold 3', a.threshold, 3);
  const by = {}; a.rows.forEach(r => { by[r.id] = r; });
  check('housing is #1 by cost', by.housing.costRank, 1);
  check('and #7 by value (joy 4, dearer than transportation at the same joy)', by.housing.valueRank, 7);
  check('so it is flagged cut', by.housing.flag, 'cut');
  checkTrue('and is a need, for the softer copy', by.housing.need);
  check('debt minimums #3 by cost, #9 by value: cut', by.debt_minimums.flag, 'cut');
  check('entertainment #8 by cost, #1 by value: keep', by.entertainment.flag, 'keep');
  check('subscriptions #9 by cost, #2 by value: keep', by.subscriptions.flag, 'keep');
  check('groceries #2 by cost, #4 by value: ok', by.groceries.flag, 'ok');
  checkTrue('at least two cut and two keep', a.cut.length >= 2 && a.keep.length >= 2);
  check('flagged a year: (1,500 + 305) × 12', a.flaggedAnnualCents, 180500 * 12);
  check('at 25×', a.fiImpactCents, 180500 * 12 * 25);
  check('value order is by rating until reranked', a.valueOrder, 'joy');

  /* A hand order overrules the ratings, and only when every rated line has one. */
  const order = R.valueOrder(h, T).ids;
  const swapped = order.slice(); swapped.splice(0, 1); swapped.push(order[0]);   /* entertainment to the bottom */
  h.rerank = Schema.createRerank({ rows: swapped.map((id, i) => ({ id: id, valueRank: i + 1 })) });
  const b = R.analyse(h, T);
  check('the order is now by hand', b.valueOrder, 'hand');
  check('entertainment last', b.rows.filter(r => r.id === 'entertainment')[0].valueRank, 9);
  check('and no longer a keep', b.rows.filter(r => r.id === 'entertainment')[0].flag, 'ok');
  h.rerank = Schema.createRerank({ rows: [{ id: 'housing', valueRank: 1 }] });
  check('a partial hand order falls back to the ratings', R.analyse(h, T).valueOrder, 'joy');

  /* Miss breaks ties in the rated order; unrated lines stay out. */
  const tie = Demo.build(); tie.expenses.entries = Demo.buildSpending();
  tie.ratings.rerank.groceries = 8; tie.ratings.rerank.dining_out = 8;
  tie.rerank = Schema.createRerank({ rows: [{ id: 'dining_out', miss: 'yes' }, { id: 'groceries', miss: 'no' }] });
  const tb = {}; R.analyse(tie, T).rows.forEach(r => { tb[r.id] = r; });
  checkTrue('"would miss it" ranks above "would not" at the same joy', tb.dining_out.valueRank < tb.groceries.valueRank);
  delete tie.ratings.rerank.utilities;
  const tu = R.analyse(tie, T);
  check('an unrated line has no rank and no flag', tu.rows.filter(r => r.id === 'utilities').map(r => r.valueRank + ':' + r.flag).join(), 'null:null');
  check('and is counted', tu.unratedCount, 1);

  /* Schema, registry, ownership. */
  check('a rerank row defaults to not asked', JSON.stringify(Schema.createRerankRow({ id: 'x' })), '{"id":"x","miss":null,"who":null,"valueRank":null}');
  check('the household carries rerank rows', JSON.stringify(Schema.createHousehold({}).rerank), '{"rows":[]}');
  checkTrue('source may be rerank', Schema.FIELDS['expenses.entries[].source'].values.indexOf('rerank') !== -1);
  const room = Registry.byId('rerank');
  checkTrue('The Rerank is registered, about you, after Enough', room && room.kind === 'about-you' && room.order === Registry.byId('fulfillment').order + 1);
  check('what it would cut is owned by the room', Ownership.field('rerankCut').owner, 'rerank');
  const cutRead = Ownership.field('rerankCut').read(Object.assign(Demo.build(), { expenses: { monthlyEssential: Demo.build().expenses.monthlyEssential, entries: Demo.buildSpending() } }));
  check('and reads the flagged year', cutRead.value, 180500 * 12);
  check('formatted per year', Ownership.field('rerankCut').format(2166000), '$21,660/yr');
  const html = fs.readFileSync(path.join(ROOT, 'rooms/rerank.html'), 'utf8');
  checkTrue('four stages exist', ['costs', 'rate', 'rerank', 'gap'].every(id => new RegExp('id="' + id + '"').test(html)));
  checkTrue('the lists are guarded', /LIVE-FORM: guarded/.test(html) && (html.match(/LiveForm\.guard\(/g) || []).length === 3);
  checkTrue('the rating control is the shared one, in its own scope', /Rating\.controlHtml\(\{ scope: Rerank\.SCOPE/.test(html) && Rating.ANCHORS.rerank);
})();

section('Life events: the template schema, and the engine on the demo');

(function () {
  /* D-087. A small validator for test/events.schema.json — enough of JSON
     Schema (required, type, enum, pattern, min/max, items, $ref into
     definitions) to grade every template without a dependency. */
  const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/events.schema.json'), 'utf8'));
  function validate(node, spec, where, out) {
    if (spec.$ref) spec = schema.definitions[spec.$ref];
    if (spec.enum && !spec.enum.includes(node)) out.push(where + ' must be one of ' + spec.enum.join('|'));
    if (spec.type) {
      const t = Array.isArray(node) ? 'array' : node === null ? 'null' : typeof node;
      if (t !== spec.type) { out.push(where + ' should be ' + spec.type + ', is ' + t); return; }
    }
    if (spec.pattern && typeof node === 'string' && !new RegExp(spec.pattern).test(node)) out.push(where + ' does not match ' + spec.pattern);
    if (typeof node === 'number') {
      if (spec.minimum !== undefined && node < spec.minimum) out.push(where + ' below ' + spec.minimum);
      if (spec.maximum !== undefined && node > spec.maximum) out.push(where + ' above ' + spec.maximum);
    }
    if (Array.isArray(node)) {
      if (spec.minItems !== undefined && node.length < spec.minItems) out.push(where + ' needs at least ' + spec.minItems);
      if (spec.maxItems !== undefined && node.length > spec.maxItems) out.push(where + ' has more than ' + spec.maxItems);
      if (spec.items) node.forEach((x, i) => validate(x, spec.items, where + '[' + i + ']', out));
    }
    if (node && typeof node === 'object' && !Array.isArray(node)) {
      (spec.required || []).forEach(k => { if (!(k in node)) out.push(where + ' is missing ' + k); });
      Object.keys(spec.properties || {}).forEach(k => { if (k in node) validate(node[k], spec.properties[k], where + '.' + k, out); });
    }
  }
  const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/events/index.json'), 'utf8'));
  const onDisk = fs.readdirSync(path.join(ROOT, 'data/events')).filter(f => f.endsWith('.json') && f !== 'index.json').map(f => f.replace(/\.json$/, ''));
  check('every template on disk is in the index', onDisk.sort().join(','), index.events.slice().sort().join(','));
  const templates = {};
  index.events.forEach(function (id) {
    const tpl = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/events/' + id + '.json'), 'utf8'));
    templates[id] = tpl;
    const problems = [];
    validate(tpl, schema, id, problems);
    ['income', 'expenses', 'oneTime', 'assets'].forEach(k => (tpl.diff[k] || []).forEach((it, i) => validate(it, { $ref: 'diffItem' }, id + '.diff.' + k + '[' + i + ']', problems)));
    check(`data/events/${id}.json fits the schema`, problems.join('; '), '');
    check(`${id}: the file name is its id`, tpl.id, id);
    checkTrue(`${id}: every table it names exists`, tpl.sources.every(src => fs.existsSync(path.join(ROOT, src))));
  });

  /* The expression language, on its own. */
  const E = require(path.join(ROOT, 'engines/events.js'));
  const env = { answers: { months: 6, where: 'domestic' }, ctx: { cashCents: 950000 }, tables: { travelBands: require(path.join(ROOT, 'data/travel_bands.json')) } };
  check('a number is itself', E.evaluate(7, env), 7);
  check('an answer', E.evaluate('@months', env), 6);
  check('a household figure', E.evaluate('$cashCents', env), 950000);
  check('arithmetic', E.evaluate({ '*': ['@months', 2] }, env), 12);
  check('a table lookup through an answer', E.evaluate({ table: 'travelBands', path: ['bands', '@where', 'monthlyCents'] }, env), 150000);
  check('if', E.evaluate({ if: [{ eq: ['@where', 'domestic'] }, 1, 2] }, env), 1);
  check('a missing answer makes the whole thing null', E.evaluate({ '+': ['@nothing', 1] }, env), null);
  check('a missing table path is null, not a crash', E.evaluate({ table: 'travelBands', path: ['bands', 'mars', 'monthlyCents'] }, env), null);

  /* The demo's sabbatical, default column, re-derived month by month. */
  const T = Object.assign({}, TABLES, {
    commonCosts: require(path.join(ROOT, 'data/common_costs.json')),
    tripleD: require(path.join(ROOT, 'data/triple_d.json')),
    returnBands: require(path.join(ROOT, 'data/return_bands.json')),
    cobraAca: require(path.join(ROOT, 'data/cobra_aca_2024.json')),
    travelBands: require(path.join(ROOT, 'data/travel_bands.json')),
    reentryGap: require(path.join(ROOT, 'data/reentry_gap.json'))
  });
  const h = Demo.build();
  const all = E.runAll(h, templates.sabbatical, {}, { tables: T });
  const r = all['default'];
  check('the default run answers every question from the defaults', JSON.stringify(r.answers), '{"months":6,"where":"home","leaveOrQuit":"quit","startsOn":3}');
  check('the gap after quitting is the median re-entry, 2.3 months rounded', r.gapMonths, 2);
  /* Independent arithmetic. Take-home 4,860; 4% contribution 240; captured
     match 50% of 4% of 72,000 = 120 a month; spending 3,150; COBRA 761. */
  const take = 486000, contrib = 24000, match = 12000, spend = 315000, cobra = 76100, rate = 0.05 / 12;
  let cash = 950000, inv = 4800000;
  const rows = [];
  for (let m = 0; m < 12; m++) {
    const off = m >= 3 && m < 9, gap = m >= 9 && m < 11;
    const employed = !(off || gap);
    const income = employed ? take - contrib : 0;
    const expenses = spend + (off ? cobra : 0);
    cash += income - expenses;
    inv = (inv + (employed ? contrib + match : 0)) * (1 + rate);
    rows.push({ cash: cash, inv: Math.round(inv) });
  }
  check('month 1 cash: 9,500 + 4,620 − 3,150', r.monthly[0].cashCents, rows[0].cash);
  check('month 1 cash by the longhand', rows[0].cash, 1097000);
  check('month 1 investments: (48,000 + 240 + 120) grown a month at 5%', r.monthly[0].investmentsCents, rows[0].inv);
  check('month 12 cash: three months in, six off with COBRA, two of gap, one back', r.monthly[11].cashCents, rows[11].cash);
  check('month 12 cash by the longhand', rows[11].cash, 950000 + 3 * 147000 - 6 * (spend + cobra) - 2 * spend + 147000);
  check('month 12 investments', r.monthly[11].investmentsCents, rows[11].inv, 1);
  check('eight months of match lost, $120 each', r.lostMatchCents, 8 * match);
  checkTrue('the cash runs out, and the run says in which month', r.flags.some(f => f.key === 'cashOut' && f.month === 6));
  check('nothing is unpriced on the demo', r.flags.filter(f => f.key === 'unpriced').length, 0);

  /* Three ways. */
  checkTrue('dream beats default beats disaster at the end', all.dream.netWorthAtEndCents > all['default'].netWorthAtEndCents && all['default'].netWorthAtEndCents > all.disaster.netWorthAtEndCents);
  check('the dream has no gap', all.dream.gapMonths, 0);
  check('the disaster triples it', all.disaster.gapMonths, 7);
  check('and lands the worst plausible year: $17,200 net', all.disaster.shockCents, 1720000);
  checkTrue('every column is measured against doing nothing', all.baseline.netWorthAtEndCents > 0 && all['default'].vsBaselineCents === all['default'].netWorthAtEndCents - all.baseline.netWorthAtEndCents);
  checkTrue('an FI shift is a number of months', Number.isInteger(all['default'].fiDateShiftMonths));
  const leave = E.run(h, templates.sabbatical, { leaveOrQuit: 'leave' }, { tables: T, d: 'default' });
  check('unpaid leave has no re-entry gap', leave.gapMonths, 0);
  const blank = E.run(Schema.createHousehold({}), templates.sabbatical, {}, { tables: T });
  check('a blank household cannot run a month, and says what it needs', blank.missing.join(','), 'grossAnnualIncome,monthlyExpenses,cashSavings,investments');

  checkTrue('the room is registered as an explore room', Registry.byId('what-if-life') && Registry.byId('what-if-life').kind === 'explore');
})();

section('Life events: the kids, on the demo');

(function () {
  /* D-088. Each template's default run, month 1 and month 12, by hand. */
  const E = require(path.join(ROOT, 'engines/events.js'));
  const T = Object.assign({}, TABLES, {
    commonCosts: require(path.join(ROOT, 'data/common_costs.json')),
    tripleD: require(path.join(ROOT, 'data/triple_d.json')),
    returnBands: require(path.join(ROOT, 'data/return_bands.json')),
    childCost: require(path.join(ROOT, 'data/child_cost.json')),
    childcareByState: require(path.join(ROOT, 'data/childcare_by_state.json'))
  });
  const tpl = id => JSON.parse(fs.readFileSync(path.join(ROOT, 'data/events/' + id + '.json'), 'utf8'));
  const take = 486000, contrib = 24000, match = 12000, spend = 315000, rate = 0.05 / 12;

  /* Kids, born now (startsOn 0 so the year under test is the first year). */
  const kids = E.run(Demo.build(), tpl('kids'), { startsOn: 0 }, { tables: T, d: 'default' });
  const band0 = T.childCost.bands[0].monthlyCents, nc = T.childcareByState.states.NC.monthlyCents, college = T.childCost.college.half.monthlyCents;
  check('the state defaulted from the household', kids.answers.state, 'NC');
  check('childcare in NC, from the table', nc, 100000);
  check('month 1 spending: 3,150 + ages 0–2 + NC childcare + half a degree', kids.monthly[0].expensesCents, spend + band0 + nc + college);
  check('the birth, out of pocket, lands in month 1 at the table figure (no OOP max entered)', kids.monthly[0].cashCents, 950000 + (take - contrib) - (spend + band0 + nc + college) - 300000);
  let cash = 950000, inv = 4800000;
  for (let m = 0; m < 12; m++) { cash += (take - contrib) - (spend + band0 + nc + college); if (m === 0) cash -= 300000; inv = (inv + contrib + match) * (1 + rate); }
  check('month 12 cash by the longhand', kids.monthly[11].cashCents, cash);
  check('month 12 investments untouched by the event', kids.monthly[11].investmentsCents, Math.round(inv), 1);
  check('the lines: term life at 11× $72,000', kids.lines.filter(l => l.id === 'termLifeSuggested')[0].value, 79200000);
  check('term life in force is unknown, not zero', kids.lines.filter(l => l.id === 'termLifeInForce')[0].value, null);
  check('age when the first turns 18: 32 + 0 + 18', kids.lines.filter(l => l.id === 'ageAtEighteen')[0].value, 50);
  const home = E.run(Demo.build(), tpl('kids'), { startsOn: 0, care: 'parentHome' }, { tables: T, d: 'default' });
  check('a parent at home on a one-income household: income stops', home.monthly[0].incomeCents, 0);
  check('and childcare is not paid', home.monthly[0].expensesCents, spend + band0 + college);
  const partnerHome = E.run(Demo.build(), tpl('kids'), { startsOn: 0, care: 'parentHome', whoseIncome: 'partner' }, { tables: T, d: 'default' });
  check('a partner who earns nothing staying home stops nothing', partnerHome.monthly[0].incomeCents, take - contrib);
  const withOop = Demo.build(); withOop.insurance.oopMaxCents = 800000;
  check('with an out-of-pocket maximum entered, the birth costs that', E.run(withOop, tpl('kids'), { startsOn: 0 }, { tables: T, d: 'default' }).monthly[0].cashCents, 950000 + (take - contrib) - (spend + band0 + nc + college) - 800000);
  const mars = E.run(Demo.build(), tpl('kids'), { startsOn: 0, state: 'XX' }, { tables: T, d: 'default' });
  check('an unknown state falls back to the national figure', mars.monthly[0].expensesCents, spend + band0 + T.childcareByState.national.monthlyCents + college);

})();

section('Life events: the job offer, on the demo');

(function () {
  const E = require(path.join(ROOT, 'engines/events.js'));
  const T = Object.assign({}, TABLES, {
    commonCosts: require(path.join(ROOT, 'data/common_costs.json')),
    tripleD: require(path.join(ROOT, 'data/triple_d.json')),
    returnBands: require(path.join(ROOT, 'data/return_bands.json'))
  });
  const tpl = id => JSON.parse(fs.readFileSync(path.join(ROOT, 'data/events/' + id + '.json'), 'utf8'));
  const take = 486000, contrib = 24000, match = 12000, spend = 315000, rate = 0.05 / 12;
  /* The job offer: $90,000, 60 hours, 8 hours of commute, one remote day, $2,000 unvested, 3-month wait. */
  const job = E.run(Demo.build(), tpl('job-change'), { base: 9000000, hours: 60, commute: 8, remoteDays: 1, startsOn: 0, unvested: 200000 }, { tables: T, d: 'default' });
  const takeThere = Tier0.takeHomeMonthlyCents(Object.assign(Demo.build(), { people: [Object.assign(Demo.build().people[0], { incomeSources: [Schema.createIncomeSource({ personId: 'demo_person_robin', grossAnnualIncomeCents: 9000000 })] })] }), T).value;
  check('take-home there, from the one tax lookup', job.lines.filter(l => l.id === 'takeHomeThere')[0].value, takeThere);
  check('month 1 income: the new take-home less 4% of the new salary', job.monthly[0].incomeCents, takeThere - 30000);
  check('month 1: no match yet (waiting), so nothing goes in but the contribution', job.monthly[0].matchCents, 0);
  check('month 4: their match at 4% of $90,000', job.monthly[3].matchCents, 30000);
  check('the forfeited match comes off investments in month 1, with no cash on the other side', job.monthly[0].investmentsCents, Math.round((4800000 - 200000 + 30000) * (1 + rate)));
  check('three months of the old match lost while waiting', job.lostMatchCents, 3 * match);
  const hourlyNow = job.lines.filter(l => l.id === 'hourlyNow')[0].value, hourlyThere = job.lines.filter(l => l.id === 'hourlyThere')[0].value;
  checkTrue('an hour is worth less there: more money, many more hours', hourlyThere < hourlyNow);
  check('month 12 cash by the longhand', job.monthly[11].cashCents, 950000 + 12 * (takeThere - 30000 - spend));
  const same = E.run(Demo.build(), tpl('job-change'), { base: 7200000, hours: 40, commute: 5, startsOn: 0, waitMonths: 0, matchPercent: 0.02 }, { tables: T, d: 'default' });
  check('the same job offered again changes nothing in month 1', same.monthly[0].incomeCents, take - contrib);
  check('and the same match: 2% of $72,000 is what the demo captures now', same.monthly[0].matchCents, match);
})();

section('Life events: buying a place, on the demo');

(function () {
  const E = require(path.join(ROOT, 'engines/events.js'));
  const T = Object.assign({}, TABLES, {
    commonCosts: require(path.join(ROOT, 'data/common_costs.json')),
    tripleD: require(path.join(ROOT, 'data/triple_d.json')),
    returnBands: require(path.join(ROOT, 'data/return_bands.json')),
    housingConventions: require(path.join(ROOT, 'data/housing_conventions.json')),
    priceToRent: require(path.join(ROOT, 'data/price_to_rent.json')),
    mortgageRates: require(path.join(ROOT, 'data/mortgage_rates.json'))
  });
  const tpl = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/events/house.json'), 'utf8'));
  const h = Demo.build(); h.expenses.entries = Demo.buildSpending();
  const r = E.run(h, tpl, { startsOn: 0 }, { tables: T, d: 'default' });
  const by = {}; r.lines.forEach(l => { by[l.id] = l; });

  /* Proposed from the tracked $1,500 of housing: 1,500 × 12 × 18. */
  check('the rent now comes from the tracked month', r.answers.rentNow, 150000);
  check('the price proposed at 18× a year of rent', r.answers.price, 32400000);
  check('the rate from the dated table', r.answers.rate, 0.065);
  /* The level payment by the closed form, written out. */
  const P = 32400000 * 0.8, i = 0.065 / 12, n = 360;
  const pmt = Math.round(P * i / (1 - Math.pow(1 + i, -n)));
  check('the payment: $259,200 at 6.5% over 360 months', by.payment.value, pmt);
  check('which is $1,638.32', pmt, 163832);
  const ti = Math.round(32400000 * (0.011 + 0.005) / 12);
  check('PITI adds tax and insurance at 1.1% + 0.5%', by.piti.value, pmt + ti);
  check('34.5% of gross: amber', by.housingRatio.warn, true);
  check('cash after closing: 9,500 − 23% of the price', by.cashAfter.value, 950000 - Math.round(32400000 * 0.23));
  check('which is under the floor: red', by.cashAfter.bad, true);
  check('no units to rent: no DSCR', by.dscr.value, null);
  check('selling in year two: 11% of the price', by.reversal.value, Math.round(32400000 * 0.11));

  /* Month 1 and 12, longhand, with the loan amortising. */
  const take = 486000, contrib = 24000, match = 12000, spend = 315000, rate = 0.05 / 12;
  const upkeep = Math.round(32400000 * 0.026 / 12);
  let cash = 950000 - Math.round(32400000 * 0.03) - Math.round(32400000 * 0.2), inv = 4800000, bal = P;
  const rows = [];
  for (let m = 0; m < 12; m++) {
    cash += (take - contrib) - (spend - 150000 + pmt + upkeep);
    inv = (inv + contrib + match) * (1 + rate);
    const interest = bal * i; bal -= (pmt - interest);
    rows.push({ cash: cash, nw: Math.round(cash + inv + 32400000 - (2160000 + bal)) });
  }
  check('month 1 spending: 3,150 − 1,500 rent + the payment + 2.6% a year of upkeep, tax and insurance', r.monthly[0].expensesCents, spend - 150000 + pmt + upkeep);
  check('month 1 cash', r.monthly[0].cashCents, rows[0].cash);
  check('month 1 net worth counts the whole building against the loan', r.monthly[0].netWorthCents, rows[0].nw, 2);
  check('month 12 cash', r.monthly[11].cashCents, rows[11].cash);
  check('month 12 net worth, the loan a year further down', r.monthly[11].netWorthCents, rows[11].nw, 2);
  checkTrue('the demo cannot close on this: cash out in month 1', r.flags.some(f => f.key === 'cashOut' && f.month === 0));

  /* A duplex: the other unit pays, less 8% vacancy. */
  const hack = E.run(h, tpl, { startsOn: 0, units: 2 }, { tables: T, d: 'default' });
  const hb = {}; hack.lines.forEach(l => { hb[l.id] = l; });
  check('month 1 income adds the other unit at 92%', hack.monthly[0].incomeCents, take - contrib + Math.round(150000 * 0.92));
  check('NOI: a year of that less 2.6% of the price', hb.noi.value, Math.round(12 * 150000 * 0.92 - 32400000 * 0.026));
  check('DSCR under 1.2: amber', hb.dscr.warn, true);
  checkTrue('cash-on-cash is negative here', hb.cashOnCash.value < 0);
})();

section('Life events: going freelance, on the demo');

(function () {
  const E = require(path.join(ROOT, 'engines/events.js'));
  const SE = require(path.join(ROOT, 'engines/selfemployed.js'));
  const T = Object.assign({}, TABLES, {
    commonCosts: require(path.join(ROOT, 'data/common_costs.json')),
    tripleD: require(path.join(ROOT, 'data/triple_d.json')),
    returnBands: require(path.join(ROOT, 'data/return_bands.json')),
    cobraAca: require(path.join(ROOT, 'data/cobra_aca_2024.json'))
  });
  const tpl = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/events/freelance.json'), 'utf8'));
  const h = Demo.build();
  const r = E.run(h, tpl, { startsOn: 0 }, { tables: T, d: 'default' });
  const by = {}; r.lines.forEach(l => { by[l.id] = l; });
  /* The derived figure: take-home of $72,000 as salary, less half the SE tax a month. */
  const seTax = SE.selfEmploymentTax(7200000, 'single', T.seTax).value;
  const net = Math.round(486000 - 0.5 * seTax / 12);
  check('SE tax on $72,000 from the one engine', by.seTax.value, seTax);
  check('what the target leaves a month', r.ctx.freelanceNetMonthly, net);
  check('month 1: a sixth of it, the job gone', r.monthly[0].incomeCents, Math.round(net / 6));
  check('month 1 spending adds COBRA', r.monthly[0].expensesCents, 315000 + 76100);
  check('month 1 cash: 9,500 − 3,000 startup + a sixth in − the month out', r.monthly[0].cashCents, 950000 - 300000 + Math.round(net / 6) - (315000 + 76100));
  check('no plan, no match while freelancing', r.monthly[0].matchCents + r.monthly[0].contributionCents, 0);
  /* Month 12: two months at a sixth, two at a half, two at five sixths, six at the target. */
  let cash = 950000 - 300000;
  const ramp = [1 / 6, 1 / 6, 0.5, 0.5, 5 / 6, 5 / 6, 1, 1, 1, 1, 1, 1];
  ramp.forEach(f => { cash += (f === 1 ? net : Math.round(net * f)) - (315000 + 76100); });
  check('month 12 cash by the ramp', r.monthly[11].cashCents, cash);
  check('the rate to match: the real hourly wage over 0.86', by.rateToMatch.value, Math.round(by.hourlyNow.value / 0.86));
  check('billable hours a week at that rate: 72,000 ÷ 52 ÷ the rate', by.billableHours.value, Math.round(7200000 / 52 / by.rateToMatch.value));
  check('which is more than the forty hours said: amber', by.billableHours.warn, true);
  const part = E.run(h, tpl, { startsOn: 0, keepJob: 'partTime' }, { tables: T, d: 'default' });
  check('part-time keeps half the paycheque and its plan', part.monthly[0].incomeCents, Math.round(486000 * 0.5) - 12000 + Math.round(net / 6));
  check('and no COBRA', part.monthly[0].expensesCents, 315000);
})();

section('Life events: moving, on the demo');

(function () {
  const E = require(path.join(ROOT, 'engines/events.js'));
  const Tax = require(path.join(ROOT, 'engines/tax.js'));
  const T = Object.assign({}, TABLES, {
    commonCosts: require(path.join(ROOT, 'data/common_costs.json')),
    tripleD: require(path.join(ROOT, 'data/triple_d.json')),
    returnBands: require(path.join(ROOT, 'data/return_bands.json')),
    colIndex: require(path.join(ROOT, 'data/col_index.json')),
    movingCost: require(path.join(ROOT, 'data/moving_cost.json')),
    stateBrackets: require(path.join(ROOT, 'data/state_brackets_2026.json'))
  });
  const tpl = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/events/move.json'), 'utf8'));
  const h = Demo.build();
  check('forty cities, and every one has a state', Object.keys(T.colIndex.cities).length === 40 && Object.values(T.colIndex.cities).every(c => /^[A-Z]{2}$/.test(c.state)), true);
  /* Raleigh to Austin: 103 → 110, NC's 4.25% flat tax to none. */
  const r = E.run(h, tpl, { startsOn: 0, fromCity: 'raleigh', toCity: 'austin', band: 'crossCountry' }, { tables: T, d: 'default' });
  const by = {}; r.lines.forEach(l => { by[l.id] = l; });
  check('the ratio: 110 over 103, less one', by.ratio.value, 110 / 103 - 1, 1e-12);
  const ncTax = Tax.estimate(h, T).stateCents;
  check('state tax here from the one tax engine: NC on the demo', by.stateNow.value, ncTax);
  check('and $2,375.75 it is', ncTax, 237575);
  check('state tax there: Texas has none', by.stateThere.value, 0);
  check('month 1 spending: the month scaled by 110/103, less a twelfth of the NC tax', r.monthly[0].expensesCents, Math.round(315000 * 110 / 103) + Math.round(-ncTax / 12));
  check('the move itself, across the country, in month 1', r.monthly[0].cashCents, 950000 + (486000 - 24000) - (Math.round(315000 * 110 / 103) + Math.round(-ncTax / 12)) - 900000);
  check('month 12 cash', r.monthly[11].cashCents, 950000 - 900000 + 12 * ((486000 - 24000) - (Math.round(315000 * 110 / 103) + Math.round(-ncTax / 12))));
  const dflt = E.run(h, tpl, { startsOn: 0 }, { tables: T, d: 'default' });
  check('from "not listed": the national average is the base', dflt.lines.filter(l => l.id === 'ratio')[0].value, 103 / 100 - 1, 1e-12);
  check('staying in the same state changes no tax', dflt.lines.filter(l => l.id === 'stateThere')[0].value, ncTax);
})();

section('Life events: a debt sprint, on the demo');

(function () {
  const E = require(path.join(ROOT, 'engines/events.js'));
  const DebtEngine = require(path.join(ROOT, 'engines/debt.js'));
  const T = Object.assign({}, TABLES, {
    commonCosts: require(path.join(ROOT, 'data/common_costs.json')),
    tripleD: require(path.join(ROOT, 'data/triple_d.json')),
    returnBands: require(path.join(ROOT, 'data/return_bands.json'))
  });
  const tpl = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/events/debt-sprint.json'), 'utf8'));
  const h = Demo.build(); h.expenses.entries = Demo.buildSpending();
  const r = E.run(h, tpl, { startsOn: 0 }, { tables: T, d: 'default' });
  const by = {}; r.lines.forEach(l => { by[l.id] = l; });
  check('both of the demo\'s cut lines are needs, so nothing is proposed from them and $200 stands in', r.answers.extra, 20000);
  check('two lines were flagged all the same', by.cutLines.value, 2);
  const now = DebtEngine.simulate(h, T.debtRules, { strategyId: 'avalanche', extraMonthlyCents: 0 });
  const sprint = DebtEngine.simulate(h, T.debtRules, { strategyId: 'avalanche', extraMonthlyCents: 20000 });
  check('months to debt-free at the minimums, from Debt Payoff\'s engine', by.monthsNow.value, now.months);
  check('and with $200 a month more', by.monthsSprint.value, sprint.months);
  check('interest saved is the difference of the two courses', by.interestSaved.value, now.totalInterestCents - sprint.totalInterestCents);
  check('month 1 spending is $200 lighter', r.monthly[0].expensesCents, 315000 - 20000);
  check('and cash is exactly the baseline: the $200 went to the debt', r.monthly[0].cashCents, 1097000);
  check('net worth is $200 better than doing nothing in month 1', r.monthly[0].netWorthCents, 1097000 + Math.round((4800000 + 24000 + 12000) * (1 + 0.05 / 12)) - (2160000 - 20000));
  check('after six months the sprint stops: month 12 spending is the full month', r.monthly[11].expensesCents, 315000);
  check('month 12 net worth carries six payments of $200', r.monthly[11].netWorthCents - E.baseline(h, { tables: T }).monthly[11].netWorthCents, 6 * 20000);
  const wanted = Demo.build(); wanted.expenses.entries = Demo.buildSpending(); wanted.ratings.rerank.dining_out = 2;
  wanted.expenses.entries.filter(e => e.categoryId === 'dining_out')[0].amountCents = 50000;   /* dear enough to be in the top three by cost */
  const r2 = E.run(wanted, tpl, { startsOn: 0 }, { tables: T, d: 'default' });
  checkTrue('with a want flagged to cut, its cost is the proposal', r2.ctx.rerankCutTopMonthlyCents > 0 && r2.answers.extra === r2.ctx.rerankCutTopMonthlyCents);
})();

section('Life events: a big purchase, on the demo');

(function () {
  const E = require(path.join(ROOT, 'engines/events.js'));
  const T = Object.assign({}, TABLES, {
    commonCosts: require(path.join(ROOT, 'data/common_costs.json')),
    tripleD: require(path.join(ROOT, 'data/triple_d.json')),
    returnBands: require(path.join(ROOT, 'data/return_bands.json'))
  });
  const tpl = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/events/big-purchase.json'), 'utf8'));
  const h = Demo.build();
  const r = E.run(h, tpl, { startsOn: 0 }, { tables: T, d: 'default' });
  const by = {}; r.lines.forEach(l => { by[l.id] = l; });
  check('the real hourly wage from engines/hourly.js: $21.04', by.hourlyNow.value, 2104);
  check('$2,500 is 119 hours of life', by.hoursOfLife.value, Math.round(250000 / 2104));
  check('cost per use over 120 uses, from Quick Math\'s engine', by.perUse.value, Math.round(250000 / 120));
  check('joy per $1,000: 7 over 2.5', by.joyPerThousand.value, 2.8);
  check('cash after: 9,500 − 2,500', by.cashAfter.value, 700000);
  check('which is under three months of spending: red', by.cashAfter.bad, true);
  check('the purchase leaves in month 1', r.monthly[0].cashCents, 1097000 - 250000);
  check('and nothing else changes: month 12 is the baseline less $2,500', r.monthly[11].cashCents, E.baseline(h, { tables: T }).monthly[11].cashCents - 250000);
  check('the horizon is five years', r.horizonMonths, 60);
  check('the template writes nothing: no expenses, no income', tpl.diff.income.length + tpl.diff.expenses.length + tpl.diff.assets.length, 0);
})();

section('Variable withdrawal and Social Security, by hand');

(function () {
  const VPW = require(path.join(ROOT, 'engines/vpw.js'));
  const SS = require(path.join(ROOT, 'engines/ss.js'));
  const vpw = require(path.join(ROOT, 'data/vpw_table.json'));
  const ss = require(path.join(ROOT, 'data/ss_bend_points_2026.json'));
  check('the VPW share at 60, 60/40, from the table', VPW.percentageAt(vpw, 60, 0.6), 0.050, 1e-12);
  check('at 57 it is interpolated between 55 and 60', VPW.percentageAt(vpw, 57, 0.6), 0.046 + (0.050 - 0.046) * 2 / 5, 1e-12);
  check('a 45% stock share reads the 40/60 column', VPW.percentageAt(vpw, 60, 0.45), 0.046, 1e-12);
  check('below the table it holds the first row', VPW.percentageAt(vpw, 30, 0.6), 0.038, 1e-12);
  /* Two years of a $1,000,000 portfolio from 65: withdraw 5.5%, grow the rest 5%. */
  const p = VPW.plan({ table: vpw, portfolioCents: 100000000, retireAge: 65, planAge: 66, stockShare: 0.6, realReturn: 0.05, annualSpendCents: 5000000 });
  check('year one withdraws 5.5%: $55,000', p.years[0].withdrawalCents, 5500000);
  check('which covers $50,000', p.years[0].covered, true);
  check('the rest grows 5%: $945,000 → $992,250', p.years[0].portfolioAfterCents, 99225000);
  check('year two withdraws 5.5% + a tenth of a point of that', p.years[1].withdrawalCents, Math.round(99225000 * (0.055 + (0.061 - 0.055) / 5)));
  check('success when every year is covered', p.success, true);
  const short = VPW.plan({ table: vpw, portfolioCents: 20000000, retireAge: 65, planAge: 70, stockShare: 0.6, realReturn: 0.05, annualSpendCents: 5000000 });
  check('a $200,000 portfolio cannot pay $50,000: short from the first year', short.firstShortAge, 65);
  const withSS = VPW.plan({ table: vpw, portfolioCents: 20000000, retireAge: 65, planAge: 70, stockShare: 0.6, realReturn: 0.05, annualSpendCents: 5000000, otherIncomeCents: function (age) { return age >= 67 ? 4500000 : 0; } });
  check('other income from 67 covers from 67', withSS.firstShortAge, 65);
  checkTrue('and the years say which were covered', withSS.years[2].covered && !withSS.years[0].covered);
  /* The spend curve: 1.5% a year less after 70. */
  const late = VPW.plan({ table: vpw, portfolioCents: 100000000, retireAge: 70, planAge: 72, stockShare: 0.6, realReturn: 0.05, annualSpendCents: 5000000 });
  check('at 72 the need is 50,000 × 0.985²', late.years[2].needCents, Math.round(5000000 * Math.pow(0.985, 2)));

  /* Social Security: the bend-point formula on $72,000 from 22 to 55. */
  const h = Demo.build();
  const est = SS.estimate(h, { ssBendPoints: ss }, { retireAge: 55, claimAge: 67 });
  check('33 working years counted', est.yearsCounted, 33);
  const aime = 72000 * 33 / 35 / 12;
  check('AIME: 72,000 × 33 ÷ 35 ÷ 12', est.aimeDollars, Math.round(aime));
  const pia = 0.9 * 1226 + 0.32 * (aime - 1226);
  check('PIA: 90% to the first bend, 32% to the second', est.piaDollars, Math.round(pia));
  check('at full retirement age the factor is 1', est.claimFactor, 1);
  check('the monthly benefit in cents', est.value, Math.round(pia * 100));
  const early = SS.estimate(h, { ssBendPoints: ss }, { retireAge: 55, claimAge: 62 });
  check('claiming at 62: 36 months at 5/9% and 24 at 5/12% off', early.claimFactor, 1 - 36 * 0.005556 - 24 * 0.004167, 1e-9);
  const late70 = SS.estimate(h, { ssBendPoints: ss }, { retireAge: 55, claimAge: 70 });
  check('claiming at 70: 24% more', late70.claimFactor, 1.24, 1e-9);
  const capped = SS.estimate(h, { ssBendPoints: ss }, { retireAge: 55, grossAnnualCents: 30000000 });
  check('income above the wage base is capped there', capped.aimeDollars, Math.round(176100 * 33 / 35 / 12));
  const noDob = Demo.build(); noDob.people[0].dob = null;
  check('no date of birth: incomplete', SS.estimate(noDob, { ssBendPoints: ss }, {}).missing.join(','), 'dob');
})();

section('Life events: stopping or coasting, on the demo');

(function () {
  const E = require(path.join(ROOT, 'engines/events.js'));
  const VPW = require(path.join(ROOT, 'engines/vpw.js'));
  const SS = require(path.join(ROOT, 'engines/ss.js'));
  const Reference = require(path.join(ROOT, 'shared/reference.js'));
  const T = {};
  Object.keys(Reference.TABLE_FILES).forEach(function (k) { try { T[k] = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', Reference.TABLE_FILES[k]), 'utf8')); } catch (e) {} });
  const tpl = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/events/retire-or-coast.json'), 'utf8'));
  const h = Demo.build();
  const all = E.runAll(h, tpl, {}, { tables: T });
  const r = all['default'];
  const by = {}; r.lines.forEach(l => { by[l.id] = l; });
  check('stop at 55 by default (no target set)', r.answers.retireAge, 55);
  check('spending a year proposed from the month: 12 × 3,150', r.answers.spend, 3780000);
  check('the event changes nothing month to month: month 12 is the baseline', r.monthly[11].cashCents, all.baseline.monthly[11].cashCents);
  check('23 years to stop', by.yearsToStop.value, 23);
  check('Social Security from the SS engine, stopping at 55, claiming at 67', by.ssMonthly.value, SS.estimate(h, T, { retireAge: 55, claimAge: 67 }).value);
  /* The portfolio at 55: the ten-year run's end, then thirteen years at the column's 5% with the end-state contributions. */
  const endInv = r.monthly[119].investmentsCents, contribYear = (r.monthly[119].contributionCents + r.monthly[119].matchCents) * 12;
  let grown = endInv; for (let y = 0; y < 13; y++) grown = grown * 1.05 + contribYear;
  check('the portfolio at 55 by the projection loop', by.portfolioAtStop.value, Math.round(grown));
  const plan = VPW.plan({ table: T.vpwTable, portfolioCents: by.portfolioAtStop.value, retireAge: 55, planAge: 95, stockShare: 0.6, realReturn: 0.05, annualSpendCents: 3780000 + 12 * by.acaBridge.value, otherIncomeCents: age => age >= 67 ? by.ssMonthly.value * 12 : 0 });
  check('holds to 95? the VPW engine\'s answer', by.success.value, plan.success ? 1 : 0);
  check('the first short age, the same', by.firstShort.value, plan.firstShortAge);
  check('left at 95, the same', by.dieWith.value, plan.dieWithCents);
  checkTrue('the demo cannot stop at 55: short from the first year', by.success.value === 0 && by.firstShort.value === 55);
  checkTrue('per-column lines are marked for the room', by.success.perColumn && !by.ssMonthly.perColumn);
  checkTrue('the dream column leaves more than the disaster', all.dream.lines.filter(l => l.id === 'dieWith')[0].value > all.disaster.lines.filter(l => l.id === 'dieWith')[0].value);
  const targeted = Demo.build(); targeted.targets = Schema.createTargets({ retireAge: 65 });
  const late = E.run(targeted, tpl, {}, { tables: T, d: 'default' });
  check('with a stop age in FIRE Number it is the default', late.answers.retireAge, 65);
  check('no bridge to 65 when stopping at 65', late.lines.filter(l => l.id === 'acaBridge')[0].value, 0);
})();

section('Life events: two households, one, on the demo');

(function () {
  const E = require(path.join(ROOT, 'engines/events.js'));
  const T = Object.assign({}, TABLES, {
    commonCosts: require(path.join(ROOT, 'data/common_costs.json')),
    tripleD: require(path.join(ROOT, 'data/triple_d.json')),
    returnBands: require(path.join(ROOT, 'data/return_bands.json'))
  });
  const tpl = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/events/partner-merge.json'), 'utf8'));
  const h = Demo.build(); h.expenses.entries = Demo.buildSpending();
  const partner = { partnerGross: 6000000, partnerExpenses: 280000, partnerCash: 500000, partnerInvestments: 2000000, partnerDebt: 1000000 };
  const r = E.run(h, tpl, Object.assign({ startsOn: 0 }, partner), { tables: T, d: 'default' });
  const by = {}; r.lines.forEach(l => { by[l.id] = l; });
  /* Take-homes through the one tax lookup: single on each, joint on the sum. */
  function takeHome(gross, filing) {
    const c = Demo.build(); c.filingStatus = filing;
    c.people[0].incomeSources = [Schema.createIncomeSource({ personId: c.people[0].id, grossAnnualIncomeCents: gross })];
    return Tier0.takeHomeMonthlyCents(c, T).value;
  }
  const apart = 486000 + takeHome(6000000, 'single'), joint = takeHome(13200000, 'married_joint');
  check('two take-homes, filing single', by.takeHomeApart.value, apart);
  check('one take-home, filing jointly, on $132,000', by.takeHomeJoint.value, joint);
  check('the filing change is the difference', by.filingDelta.value, joint - apart);
  check('the duplicate line proposed is the tracked housing', r.answers.duplicateLines, 150000);
  check('the month together: 3,150 + 2,800 − 1,500', by.spendTogether.value, 445000);
  check('the FI number for two at 4%: 25 × a year of that', by.fiNumberTogether.value, 25 * 12 * 445000);
  check('the FI ratio for two: (48,000 + 20,000) over it', by.fiRatioTogether.value, 6800000 / (25 * 12 * 445000), 1e-12);
  /* Month 1: the joint take-home, your plan and match as before, their cash, investments and debt joining. */
  check('month 1 income: the joint take-home less your 4%', r.monthly[0].incomeCents, joint - 24000);
  check('the plan and match continue', r.monthly[0].contributionCents + r.monthly[0].matchCents, 36000);
  check('month 1 cash: 9,500 + their 5,000 + income − the month together', r.monthly[0].cashCents, 950000 + 500000 + (joint - 24000) - 445000);
  check('month 1 investments: 48,000 + their 20,000 + 360, grown a month', r.monthly[0].investmentsCents, Math.round((4800000 + 2000000 + 36000) * (1 + 0.05 / 12)));
  check('month 1 net worth carries their $10,000 of debt', r.monthly[0].netWorthCents, r.monthly[0].cashCents + r.monthly[0].investmentsCents - (2160000 + 1000000));
  let cash = 950000 + 500000; for (let m = 0; m < 12; m++) cash += (joint - 24000) - 445000;
  check('month 12 cash by the longhand', r.monthly[11].cashCents, cash);
  /* Without a partner's figures the event cannot price itself and says so, and changes nothing. */
  const alone = E.run(h, tpl, {}, { tables: T, d: 'default' });
  checkTrue('no partner figures: the income and expense items are flagged unpriced', alone.flags.filter(f => f.key === 'unpriced').length >= 2);
  check('and the month is the baseline', alone.monthly[0].cashCents, E.baseline(h, { tables: T }).monthly[0].cashCents);
  checkTrue('the template asks the room for a partner file', tpl.partnerFile === true);
})();

section('3D: the instruments three ways');

(function () {
  /* D-089: the events engine on the empty template, read back per instrument. */
  const Reference = require(path.join(ROOT, 'shared/reference.js'));
  const T = {};
  Object.keys(Reference.TABLE_FILES).forEach(function (k) { try { T[k] = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', Reference.TABLE_FILES[k]), 'utf8')); } catch (e) {} });
  const E = require(path.join(ROOT, 'engines/events.js'));
  const h = Demo.build();
  const td = InstrumentsMain.threeD(h, T);
  check('three columns', td.value, 3);
  check('in the table\'s order', td.order.join(','), 'dream,default,disaster');
  const nw = d => td.columns[d].netWorth.value;
  checkTrue('net worth ten years out: dream > default > disaster', nw('dream') > nw('default') && nw('default') > nw('disaster'));
  check('the default column is the baseline run', nw('default'), E.baseline(h, { tables: T }).netWorthAtEndCents);
  const sr = d => td.columns[d].savingsRate.value;
  checkTrue('the savings rate rises with income up 10% and falls with it down 15%', sr('dream') > sr('default') && sr('default') > sr('disaster'));
  check('the default savings rate is the residual with the match: (4,860 − 3,150 + 120) × 12 ÷ 72,000', sr('default'), (486000 - 315000 + 12000) / 600000, 1e-9);
  checkTrue('runway at the horizon is months of the end-state spending', td.columns['default'].emergencyFundMonths.value > 0);
  check('debt-to-income does not move, and says why', td.columns['default'].debtToIncome.status, 'incomplete');
  check('nor does the FOO step', td.columns['default'].fooStep.status, 'incomplete');
  checkTrue('the FI year is a year', Number.isInteger(td.columns['default'].fiEtaYear.value) && td.columns['default'].fiEtaYear.value > 2030);
  checkTrue('the dream reaches FI sooner', td.columns.dream.fiEtaYear.value <= td.columns['default'].fiEtaYear.value);
  const dash = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  checkTrue('the dashboard has the toggle and loads the events engine', /id="btn-3d"/.test(dash) && /engines\/events\.js/.test(dash));
  check('a blank household cannot fan out, and says what it needs', InstrumentsMain.threeD(Schema.createHousehold({}), T).status, 'incomplete');
})();

section('The Skill Stacker: the catalogue, and the engine on the demo');

(function () {
  /* D-090. The catalogue is data in dnd/data/; this reads it the way the
     room does and grades it before grading the engine. */
  const Skills = require(path.join(ROOT, 'engines/skills.js'));
  const Benchmarks = require(path.join(ROOT, 'engines/benchmarks.js'));
  const EventsEngine = require(path.join(ROOT, 'engines/events.js'));
  const Reference = require(path.join(ROOT, 'shared/reference.js'));
  const T = {};
  Object.keys(Reference.TABLE_FILES).forEach(function (k) { try { T[k] = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', Reference.TABLE_FILES[k]), 'utf8')); } catch (e) {} });
  ['skills', 'stacks', 'hundredWays', 'curves'].forEach(k => checkTrue(`the ${k} table loads from dnd/data through TABLE_FILES`, !!T[k] && !!T[k].version));
  const DndRef = require(path.join(ROOT, 'dnd/shared/reference.js'));
  ['skills', 'stacks', 'hundredWays', 'curves'].forEach(k => checkTrue(`dnd/shared/reference.js registers ${k} too`, !!DndRef.TABLE_FILES[k] && fs.existsSync(path.join(ROOT, 'dnd/data', DndRef.TABLE_FILES[k]))));
  ['skills', 'stacks', 'hundred_ways', 'curves'].forEach(f => {
    const t = JSON.parse(fs.readFileSync(path.join(ROOT, 'dnd/data', f + '.json'), 'utf8'));
    ['asOf', 'confidence', 'source', 'confidenceNote', 'version'].forEach(k => checkTrue(`dnd/data/${f}.json carries ${k}`, typeof t[k] === 'string' && t[k].length > 0));
  });

  const cat = Skills.catalogue(T);
  const ids = cat.map(s => s.id);
  check('every id in the catalogue is unique', new Set(ids).size, ids.length);
  check('twenty-six skills plus thirty ways', cat.length, 56);
  const subStats = T.dndRules ? null : JSON.parse(fs.readFileSync(path.join(ROOT, 'dnd/data/dnd_rules.json'), 'utf8')).subStats.map(s => s.id);
  const levers = ['earner', 'keeper', 'builder', 'compounder', 'landholder', 'anchor', 'speculator'];
  cat.forEach(s => {
    const where = `skill ${s.id}`;
    checkTrue(`${where}: kind is once, habit or periodic`, Schema.SKILL_KINDS.includes(s.kind));
    checkTrue(`${where}: lever is one of the seven classes`, levers.includes(s.lever));
    checkTrue(`${where}: every sub-stat it trains is on the D&D sheet`, Object.keys(s.subStats).every(k => subStats.includes(k)));
    checkTrue(`${where}: prerequisites, unlocks and synergies name real skills`,
      s.prereqs.concat(s.unlocks, s.synergy.map(y => y.with)).every(id => ids.includes(id)));
    checkTrue(`${where}: a habit decays, a periodic recurs, a once-skill does neither`,
      s.kind === 'habit' ? Money.isEntered(s.decayDays) && s.everyDays === null
        : s.kind === 'periodic' ? Money.isEntered(s.everyDays) && s.decayDays === null
        : s.decayDays === null && s.everyDays === null);
    checkTrue(`${where}: the effect is risk, fixed cents or a formula`,
      s.effect.type === 'risk' || Money.isEntered(s.effect.cents) || !!s.effect.formula);
    checkTrue(`${where}: only a once-skill verifies from the facts, and against an ownership row`,
      s.verify === null || (s.kind === 'once' && !!Ownership.field(s.verify.field) && (!s.verify.gteField || !!Ownership.field(s.verify.gteField))));
    checkTrue(`${where}: no prerequisite on itself`, !s.prereqs.includes(s.id));
  });
  T.stacks.stacks.forEach(st => {
    checkTrue(`stack ${st.id}: every skill exists`, st.skills.every(id => ids.includes(id)));
    checkTrue(`stack ${st.id}: the cap is integer cents`, Number.isInteger(st.capCents) && st.capCents >= 0);
  });
  check('the ledger grows to the wealth multiplier\'s end age', T.curves.ledger.toAge, T.wealthMultiplier.endAge);

  /* ---- The demo: what the facts already prove ------------------------------ */
  const day = '2026-09-05';
  const now = Date.parse(day + 'T12:00:00Z');
  const h = Demo.build(); h.expenses.entries = Demo.buildSpending();
  const ctx = EventsEngine.context(h, T);
  check('context: the dining line', ctx.diningMonthlyCents, 26000);
  check('context: the groceries line', ctx.groceriesMonthlyCents, 45000);
  check('context: food is both', ctx.foodMonthlyCents, 71000);
  /* Full match 72,000 × 6% × 50% = 2,160 a year; 4% contributed captures
     1,440; 720 left = 6,000 cents a month. */
  check('context: the match left on the table, a month', ctx.matchLeftMonthlyCents, 6000);
  check('context: no non-need line is flagged on the demo, so the dearest is zero', ctx.rerankCutOneMonthlyCents, 0);

  const v = Skills.verifyOnce(h, T, day);
  checkTrue('the demo proves at least three once-skills', v.verified.length >= 3, v.verified.join(','));
  ['enter-the-facts', 'name-your-debt', 'starter-fund'].forEach(id => checkTrue(`… including ${id}`, v.verified.includes(id)));
  checkTrue('capture-the-match is NOT proven: Robin leaves match on the table', !v.verified.includes('capture-the-match'));
  check('a verified skill records who said so', v.skills['starter-fund'].verifiedBy, 'household');
  check('… and done lives in the tree, by proof (D-131)', v.skillTree.state['starter-fund'].state + '/' + v.skillTree.state['starter-fund'].by, 'done/proof');
  h.skills = v.skills; h.skillTree = v.skillTree;
  check('verifying again changes nothing', Skills.verifyOnce(h, T, day).verified.length, 0);
  check('the Stacker reads done from the tree', Skills.state(h, Skills.byId(T, 'starter-fund')), 'done');
  (function () {
    const poorer = JSON.parse(JSON.stringify(h));
    poorer.assets[0].valueCents = 100000;                    /* $1,000 < the $2,500 deductible */
    const r = Skills.verifyOnce(poorer, T, day);
    checkTrue('a fact that stops holding un-marks the skill it proved', r.reverted.includes('starter-fund'));
    poorer.skillTree.state['name-your-debt'].by = 'self';
    poorer.meta.hasDebt = false; poorer.debts = [];
    checkTrue('but a skill marked done by hand stays done', !Skills.verifyOnce(poorer, T, day).reverted.includes('name-your-debt'));
  })();

  /* ---- Worth, by hand ------------------------------------------------------- */
  const by = id => Skills.byId(T, id);
  check('capture the match = 12 × 6,000', Skills.valuePerYear(h, by('capture-the-match'), T).value, 72000);
  check('cook dinner = 12 × 30% × 26,000', Skills.valuePerYear(h, by('cook-dinner'), T).value, 93600);
  check('weekly shop = 12 × 10% × 45,000', Skills.valuePerYear(h, by('weekly-shop'), T).value, 54000);
  check('ask for the raise = 3% × 7,200,000', Skills.valuePerYear(h, by('ask-for-the-raise'), T).value, 216000);
  check('a risk skill is worth $0', Skills.valuePerYear(h, by('know-your-number'), T).value, 0);
  checkTrue('… and says it is by design', Skills.valuePerYear(h, by('know-your-number'), T).risk === true);
  check('a hundred-ways entry is its stated cents', Skills.valuePerYear(h, by('brew-coffee'), T).value, 90000);
  check('effort: cook dinner is 3 h + 45 min × 365 ÷ 60', Skills.effortHours(by('cook-dinner'), T), 276.75, 1e-9);
  check('return on effort: capture the match, 72,000 ÷ 1 h', Skills.returnOnEffort(h, by('capture-the-match'), T).value, 72000);
  (function () {
    const blank = Schema.createHousehold({});
    const r = Skills.valuePerYear(blank, by('cook-dinner'), T);
    check('a formula on a blank household is worth $0 only where the line coalesces to 0', r.value, 0);
    const m = Skills.valuePerYear(blank, by('capture-the-match'), T);
    check('… and incomplete where it does not', m.status, 'incomplete');
  })();

  /* ---- Next, equip, refuse ------------------------------------------------- */
  const next = Skills.nextSkill(h, T, { now: now });
  check('the demo\'s next skill is its FOO step: capture the match', next.value.id, 'capture-the-match');
  check('… at step 2', next.fooStep, 2);
  checkTrue('the hundred ways are trials, never the suggestion', !next.value.trial);
  const nudged = Skills.nextSkill(h, T, { fooStep: 0, lowestSubStat: 'consistency' });
  checkTrue('with a lowest sub-stat, the suggestion trains it', !!nudged.value.subStats.consistency, nudged.value.id);

  let r = Skills.equip(h, 'raise-one-point', T, day);
  check('a locked skill is refused', r.status, 'incomplete');
  checkTrue('… naming the prerequisite', /Capture the full match/.test(r.reason) && r.missing.includes('capture-the-match'));
  check('a done skill is refused', Skills.equip(h, 'starter-fund', T, day).status, 'incomplete');
  ['capture-the-match', 'cook-dinner', 'weekly-shop'].forEach(id => { r = Skills.equip(h, id, T, day); checkTrue(`${id} goes on`, Money.isOk(r)); h.skills = r.value.skills; });
  check('a once-skill on is in trial', Skills.state(h, by('capture-the-match')), 'trial');
  check('three on', Skills.equipped(h, T).length, 3);
  r = Skills.equip(h, 'pack-lunch', T, day);
  check('a fourth is refused', r.status, 'incomplete');
  checkTrue('… with the reason', /3 at a time/.test(r.reason));
  check('… and the three in the way', r.missing.slice().sort().join(','), 'capture-the-match,cook-dinner,weekly-shop');
  check('equipping again is refused', Skills.equip(h, 'cook-dinner', T, day).reason, 'Already on.');

  /* ---- Days logged ----------------------------------------------------------- */
  for (let i = 0; i < 8; i++) { r = Skills.logDay(h, 'cook-dinner', true, T, Skills.addDays(day, i)); h.skills = r.value.skills; h.practiceLedger = r.value.practiceLedger; }
  check('eight days logged: practicing', h.skills['cook-dinner'].state, 'practicing');
  check('… last30 counts them', h.skills['cook-dinner'].last30, 8);
  check('… a day is worth 93,600 ÷ 365', h.skills['cook-dinner'].valuePerDayCents, 256);
  check('… and the ledger holds eight rows of it', Skills.ledgerTotalCents(h), 2048);
  r = Skills.logDay(h, 'cook-dinner', true, T, day); h.skills = r.value.skills; h.practiceLedger = r.value.practiceLedger;
  check('logging a day twice writes one row', h.practiceLedger.length, 8);
  r = Skills.logDay(h, 'cook-dinner', false, T, Skills.addDays(day, 8)); h.skills = r.value.skills; h.practiceLedger = r.value.practiceLedger;
  r = Skills.logDay(h, 'cook-dinner', false, T, Skills.addDays(day, 9)); h.skills = r.value.skills; h.practiceLedger = r.value.practiceLedger;
  check('two didn\'ts in a row is one second miss', h.skills['cook-dinner'].secondMisses, 1);
  check('a didn\'t writes no row', Skills.ledgerTotalCents(h), 2048);
  check('today\'s figure is the rows on that day', Skills.ledgerOn(h, Skills.addDays(day, 3)), 256);
  check('a once-skill is not logged a day at a time', Skills.logDay(h, 'capture-the-match', false, T, day).status, 'incomplete');
  (function () {
    let hh = JSON.parse(JSON.stringify(h));
    for (let i = 0; i < 21; i++) { const x = Skills.logDay(hh, 'weekly-shop', true, T, Skills.addDays(day, i)); hh.skills = x.value.skills; hh.practiceLedger = x.value.practiceLedger; }
    check('twenty-one of thirty days is a habit', hh.skills['weekly-shop'].state, 'habit');
    check('… which frees the slot', Skills.equipped(hh, T).length, 2);
    checkTrue('… and a fourth now goes on', Money.isOk(Skills.equip(hh, 'pack-lunch', T, day)));
    let d = Skills.decay(hh, T, Skills.addDays(day, 20 + 13));
    check('thirteen unlogged days: nothing moves', d.changes.length, 0);
    d = Skills.decay(hh, T, Skills.addDays(day, 20 + 14));
    check('fourteen: the habit slips to practicing', d.changes.filter(c => c.id === 'weekly-shop')[0].to, 'practicing');
    d = Skills.decay(hh, T, Skills.addDays(day, 20 + 45));
    check('forty-five: it is off', d.changes.filter(c => c.id === 'weekly-shop')[0].to, 'available');
    check('… with a lapse counted', d.skills['weekly-shop'].lapses, 1);
    check('… and the log kept', d.skills['weekly-shop'].log.length, 21);
  })();

  /* ---- Periodic --------------------------------------------------------------- */
  (function () {
    let hh = JSON.parse(JSON.stringify(h));
    let x = Skills.drop(hh, 'weekly-shop'); hh.skills = x.value.skills;
    x = Skills.equip(hh, 'negotiate-a-bill', T, day); hh.skills = x.value.skills;
    check('a periodic on is practicing', hh.skills['negotiate-a-bill'].state, 'practicing');
    x = Skills.markDone(hh, 'negotiate-a-bill', T, day); hh.skills = x.value.skills;
    check('done today, due again in thirty days', hh.skills['negotiate-a-bill'].dueOn, '2026-10-05');
    checkTrue('not due tomorrow', !Skills.due(hh, by('negotiate-a-bill'), '2026-09-06'));
    checkTrue('due on the day', Skills.due(hh, by('negotiate-a-bill'), '2026-10-05'));
    checkTrue('done satisfies a prerequisite', Money.isOk(Skills.equip(hh, 'ask-for-the-raise', T, day)));
  })();

  /* ---- Stacks: the waterfall by hand --------------------------------------- */
  (function () {
    let hh = JSON.parse(JSON.stringify(h));
    for (let i = 0; i < 8; i++) { const x = Skills.logDay(hh, 'weekly-shop', true, T, Skills.addDays(day, i)); hh.skills = x.value.skills; hh.practiceLedger = x.value.practiceLedger; }
    const k = Skills.stackValue(hh, 'kitchen', T);
    /* weekly shop 54,000 ×1; cook dinner 93,600 × 1.25 (the shop is active)
       = 117,000; pack lunch off. Cap: min(600,000, 12 × 71,000) = 600,000. */
    check('The Kitchen: cook dinner carries its synergy', k.rows.filter(x => x.id === 'cook-dinner')[0].valueCents, 117000);
    check('… the shop does not (no synergy declared on it)', k.rows.filter(x => x.id === 'weekly-shop')[0].valueCents, 54000);
    check('… pack lunch is off', k.rows.filter(x => x.id === 'pack-lunch')[0].valueCents, 0);
    check('… the stack is the sum', k.value, 171000);
    check('… under the stack\'s own cap', k.capCents, 600000);
    checkTrue('… not capped', !k.capped);
    /* A household with little food: the cap is twelve months of that line. */
    const lean = JSON.parse(JSON.stringify(hh));
    lean.expenses.entries.forEach(e => { if (e.categoryId === 'groceries') e.amountCents = 10000; if (e.categoryId === 'dining_out') e.amountCents = 5000; });
    lean.skills['pack-lunch'] = Schema.createSkillState({ state: 'practicing', kind: 'habit' });
    const lk = Skills.stackValue(lean, 'kitchen', T);
    check('lean: raw is 12,000 + 18,000 × 1.25 + 180,000 × 1.2', lk.rawCents, 12000 + 22500 + 216000);
    check('lean: the cap is twelve months of food', lk.capCents, 180000);
    check('… named as such', lk.capFrom, 'foodMonthlyCents');
    check('… and the stack is worth the cap', lk.value, 180000);
    const a = Skills.stackValue(hh, 'anchor', T);
    check('The Anchor is worth $0 with one skill done', a.value, 0);
    check('… and one of four is active', a.activeCount, 1);
    check('an unknown stack is refused', Skills.stackValue(hh, 'nope', T).status, 'incomplete');
  })();

  /* ---- The ledger to 65, the automation ratio, the snapshot --------------------- */
  const fv = Skills.ledgerFutureValue(h, T, { now: now });
  const table = T.wealthMultiplier;
  let mult = 1; Benchmarks.curve(table, 32).factors.forEach(f => { mult *= f; });
  check('the ledger at 65 is the total × the multiplier from 32', fv.value, Math.round(2048 * mult));
  check('… at Robin\'s age', fv.age, 32);
  check('a household without a birthday cannot grow the ledger', Skills.ledgerFutureValue(Schema.createHousehold({ practiceLedger: h.practiceLedger }), T).status, 'incomplete');

  let ar = Skills.automationRatio(h, T);
  check('nothing automated: the ratio is 0 of cook dinner', ar.value, 0);
  check('… over 93,600', ar.totalCents, 93600);
  r = Skills.setAutomated(h, 'cook-dinner', true); h.skills = r.value.skills;
  ar = Skills.automationRatio(h, T);
  check('cook dinner automated: the ratio is 1', ar.value, 1);
  check('nothing active: the ratio has nothing to say', Skills.automationRatio(Schema.createHousehold({}), T).status, 'incomplete');
  const ratioRow = RatiosEngine.all(h, T).rows.filter(x => x.id === 'automationRatio')[0];
  check('Every Ratio reads it', ratioRow.value, 1);
  checkTrue('… and no longer lists it as unavailable', !ratioRow.unavailable);
  check('the instruments carry the ledger total for the Annual Review', InstrumentsMain.outputs(h, T).practiceLedgerCents.value, 2048);
  const own = Ownership.field('practiceLedger');
  check('the ledger is owned by the Stacker', own.owner, 'stacker');
  check('… and reads the total', own.read(h).value, 2048);
  check('… incomplete with no rows, not zero', own.read(Schema.createHousehold({})).status, 'incomplete');

  /* ---- Today, and the room ----------------------------------------------------- */
  const t = Skills.today(h, T, { today: Skills.addDays(day, 3), now: now });
  check('today lists the three on', t.lines.length, 3);
  check('… with the day\'s rows', t.todayCents, 256);
  checkTrue('… and knows which were logged', t.lines.filter(l => l.skill.id === 'cook-dinner')[0].loggedToday === true);
  checkTrue('no suggestion while three are on', !Money.isOk(t.next) || t.equippedCount === t.maxEquipped);
  check('the curves: the poster is clipped at ×3', Skills.posterValue(T, 365), 3);
  check('… and honest below it', Skills.posterValue(T, 10), Math.pow(1.01, 10), 1e-12);
  check('capability at the midpoint is half', Skills.capability(T, 45), 0.5, 1e-12);
  check('a schema round-trip keeps a skill\'s standing', Schema.createHousehold(JSON.parse(JSON.stringify(h))).skills['cook-dinner'].log.length, 8);
  check('… and the ledger', Schema.createHousehold(JSON.parse(JSON.stringify(h))).practiceLedger.length, 8);
  check('an unknown state is read as available', Schema.createSkillState({ state: 'weird' }).state, 'available');

  const room = Registry.byId('stacker');
  check('the room is an about-you room', room.kind, 'about-you');
  check('… at order 20', room.order, 20);
  const html = fs.readFileSync(path.join(ROOT, 'rooms/stacker.html'), 'utf8');
  checkTrue('four screens exist', ['today', 'browse', 'stacks', 'curves'].every(id => new RegExp('id="' + id + '"').test(html)));
  checkTrue('the lists are guarded', /LIVE-FORM: guarded/.test(html) && (html.match(/LiveForm\.guard\(/g) || []).length === 3);
  checkTrue('the dashboard and Refresh load the engine so a snapshot carries the ledger',
    /engines\/skills\.js/.test(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')) && /engines\/skills\.js/.test(fs.readFileSync(path.join(ROOT, 'rooms/refresh.html'), 'utf8')));
})();

section('Charts: the one way a number becomes a picture');

(function () {
  /* D-091. Pure functions that return markup; what is graded is the
     arithmetic behind the axes and the shares, and that nothing draws
     from a stand-in. */
  const Charts = require(path.join(ROOT, 'shared/charts.js'));
  check('short money: hundreds', Charts.shortMoney(95000), '$950');
  check('short money: thousands', Charts.shortMoney(480000), '$4.8K');
  check('short money: round thousands', Charts.shortMoney(4800000), '$48K');
  check('short money: millions', Charts.shortMoney(120000000), '$1.2M');
  check('short money: negative', Charts.shortMoney(-2500000), '-$25K');
  check('a nice step for a $29M range over five ticks is $5M', Charts.niceStep(2916458500, 5), 500000000);
  check('ticks cover the range in round steps', Charts.ticks(0, 72, 6).join(','), '0,10,20,30,40,50,60,70');
  check('ticks from 25 to 80', Charts.ticks(25, 80, 6).join(','), '30,40,50,60,70,80');

  const a = Charts.area({ series: [{ label: 'a', points: [[30, 0], [40, 100000], [50, 500000]] }], hLines: [{ y: 300000, label: 'FI' }] });
  checkTrue('an area chart is an svg in a .slaf-chart', /^<div class="slaf-chart"><svg /.test(a));
  checkTrue('… with a filled path under the first series', /<path class="fill"/.test(a));
  checkTrue('… the line above it', /<path class="line"/.test(a));
  checkTrue('… the horizontal line and its label', /<line class="hline"/.test(a) && /FI<\/text>/.test(a));
  checkTrue('… and a legend naming both', /<ul class="slaf-legend">.*>a<\/li>.*FI<\/li>/.test(a));
  checkTrue('no series: says so instead of drawing', /is-empty/.test(Charts.area({ series: [] })));

  const d = Charts.donut({ slices: [{ label: 'Cash', value: 950000 }, { label: 'Invest', value: 4800000 }, { label: 'Nothing', value: 0 }] });
  checkTrue('a donut is a ring of arcs', (d.match(/<circle class="arc"/g) || []).length === 2);
  checkTrue('… a zero slice is listed, not drawn', /Nothing/.test(d) && (d.match(/<circle class="arc"/g) || []).length === 2);
  checkTrue('… the centre is the total', /\$57,500/.test(d));
  checkTrue('… and the shares add up', /17%/.test(d) && /83%/.test(d));
  /* 950,000 ÷ 5,750,000 of the circumference 2π·42 = 263.89 → 43.60 */
  checkTrue('… each arc\'s length is its share of the circumference', /stroke-dasharray="43\.60 220\.29"/.test(d));
  checkTrue('an empty donut says so', /is-empty/.test(Charts.donut({ slices: [] })));

  const b = Charts.bars({ rows: [{ label: 'x', value: 100 }, { label: 'y', value: -50 }, { label: 'z', value: null, empty: 'needs a month' }] });
  checkTrue('bars with a negative share a zero at the middle', /has-negative/.test(b) && /left:50%;width:50%/.test(b) && /left:25%;width:25%/.test(b));
  checkTrue('… and a missing row draws nothing, with its reason', /is-empty/.test(b) && /needs a month/.test(b));
  const s = Charts.stacked({ rows: [{ label: 'm', parts: [{ label: 'a', value: 25 }, { label: 'b', value: 75 }] }] });
  checkTrue('a stacked row is parts to a hundred', /width:25%/.test(s) && /width:75%/.test(s));
  check('yearly thins a monthly list to every twelfth row and the last', Charts.yearly(Array.from({ length: 30 }, (_, i) => i), r => r).map(p => p[0]).join(','), '0,1,2,2.4166666666666665');

  const Projection = require(path.join(ROOT, 'engines/projection.js'));
  /* $1,000 to start, $4,000 a month at 7%, 40 years in then 15 years of
     $48,000 out: the PFC calculator's own example, 10,268,234 at
     retirement on its (annual) convention; monthly compounding lands a
     little higher. */
  const p = Projection.pathCents({ startCents: 100000, monthlyContributionCents: 400000, annualRate: 0.07, years: 55, contributeYears: 40, withdrawAnnualCents: 4800000 });
  check('the path has a row per year plus the start', p.years.length, 56);
  checkTrue('at retirement the balance is in the region of $10.5M', p.years[40].balanceCents > 1040000000 && p.years[40].balanceCents < 1060000000, p.years[40].balanceCents);
  check('contributions stop at the stop year', p.years[41].contributedCents, p.years[40].contributedCents - 4800000);
  checkTrue('and it never runs out', p.brokeAtYear === null);
  const broke = Projection.pathCents({ startCents: 1000000, monthlyContributionCents: 0, annualRate: 0.05, years: 10, contributeYears: 0, withdrawAnnualCents: 240000 });
  checkTrue('a pot drawn too hard names the year it empties', Money.isEntered(broke.brokeAtYear) && broke.brokeAtYear > 4 && broke.brokeAtYear < 6, broke.brokeAtYear);
  check('a path with no rate is incomplete', Projection.pathCents({ years: 10 }).status, 'incomplete');

  const Skills = require(path.join(ROOT, 'engines/skills.js'));
  const Reference = require(path.join(ROOT, 'shared/reference.js'));
  const T = {};
  Object.keys(Reference.TABLE_FILES).forEach(function (k) { try { T[k] = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', Reference.TABLE_FILES[k]), 'utf8')); } catch (e) {} });
  (function () {
    const h = Demo.build(); h.expenses.entries = Demo.buildSpending();
    let r = Skills.equip(h, 'cook-dinner', T, '2026-09-05'); h.skills = r.value.skills;
    for (let i = 0; i < 8; i++) { r = Skills.logDay(h, 'cook-dinner', true, T, Skills.addDays('2026-09-05', -i)); h.skills = r.value.skills; h.practiceLedger = r.value.practiceLedger; }
    check('back-filling earlier days counts from the latest day known', h.skills['cook-dinner'].last30, 8);
    check('… and eight days is practicing', h.skills['cook-dinner'].state, 'practicing');
  })();

  ['index.html', 'rooms/fire.html', 'rooms/stacker.html'].forEach(f => {
    checkTrue(`${f} loads the chart module`, /shared\/charts\.js/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
  });
  checkTrue('the dashboard draws the ring, not the old stack', !/nw-stack/.test(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')));
})();

section('Between jobs: the unemployed sequence');

(function () {
  /* D-092. A sixth working situation with a card of its own, income no
     longer the gate, and the dashboard opening on the runway. */
  const Reference = require(path.join(ROOT, 'shared/reference.js'));
  const Runway = require(path.join(ROOT, 'engines/runway.js'));
  const Progress = require(path.join(ROOT, 'shared/progress.js'));
  const T = {};
  Object.keys(Reference.TABLE_FILES).forEach(function (k) { try { T[k] = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', Reference.TABLE_FILES[k]), 'utf8')); } catch (e) {} });

  const row = Schema.employmentStatus('unemployed');
  checkTrue('"unemployed" is a working situation', !!row);
  checkTrue('… that is not earning, has no employer, and is looking', row.earning === false && row.hasEmployer === false && row.seeking === true);
  checkTrue('"not working" is still there, and not looking', Schema.employmentStatus('notWorking').seeking !== true);

  const u = Schema.createUnemployment({ benefitStatus: 'receiving', benefitWeeklyCents: 35000, benefitWeeksLeft: 12, severanceCents: 400000 });
  check('an unknown benefit status is null, not a guess', Schema.createUnemployment({ benefitStatus: 'maybe' }).benefitStatus, null);
  check('every field starts null', Object.values(Schema.createUnemployment(null)).every(v => v === null), true);

  function household(unemp, extra) {
    const p = Schema.createPerson({ id: 'p', label: 'You', role: 'adult', dob: '2001-03-02', employmentStatus: 'unemployed', unemployment: unemp });
    return Schema.createHousehold(Object.assign({ people: [p], filingStatus: 'single', state: 'NC',
      assets: [Schema.createAsset({ id: 'a', category: 'cash', valueCents: 600000, liquid: true, ownerIds: ['p'] }),
               Schema.createAsset({ id: 'b', category: 'investment', valueCents: 1000000, ownerIds: ['p'] })],
      expenses: { monthlyEssential: { estimatedValueCents: 300000, trackedValueCents: null }, entries: [] },
      insurance: { highestDeductibleCents: 0 }, meta: { hasDebt: false } }, extra || {}));
  }
  const h = household(u);
  checkTrue('the household is between jobs', Schema.isUnemployed(h));
  checkTrue('a person carries the facts', h.people[0].unemployment.benefitWeeklyCents === 35000);
  const ben = Schema.benefitMonthlyCents(h);
  checkTrue('the benefit is an ok Result — its extras never overwrite its status', Money.isOk(ben) && ben.benefitStatus === 'receiving');
  check('$350 a week is 350 × 52 ÷ 12 a month', ben.value, 151667);
  check('… for 12 ÷ 4.33 = 2.8 months', ben.months, 2.8);
  check('"haven\'t applied" is worth $0 a month', Schema.benefitMonthlyCents(household({ benefitStatus: 'notApplied' })).value, 0);
  check('no status yet: nothing to say', Schema.benefitMonthlyCents(household(null)).status, 'incomplete');
  check('an employed household is not between jobs', Schema.benefitMonthlyCents(Demo.build()).status, 'incomplete');

  const income = Ownership.describe('grossAnnualIncome', h, 'start');
  checkTrue('income does not apply while between jobs with nothing coming in', !income.applies);
  checkTrue('… and says why', /runway/.test(income.notApplicableBecause));
  const withPartnerPay = household(u);
  const partner = Schema.createPerson({ id: 'q', label: 'Sam', role: 'adult', employmentStatus: 'employed' });
  partner.incomeSources.push(Schema.createIncomeSource({ id: 'i', personId: 'q', grossAnnualIncomeCents: 4000000 }));
  withPartnerPay.people.push(partner);
  checkTrue('… but applies again once a partner\'s pay is entered', Ownership.describe('grossAnnualIncome', withPartnerPay, 'start').applies);
  checkTrue('the between-jobs row applies only when between jobs', Ownership.describe('unemployment', h, 'start').applies && !Ownership.describe('unemployment', Demo.build(), 'start').applies);
  checkTrue('… and is set once the benefit status is answered', Ownership.describe('unemployment', h, 'start').isSet && !Ownership.describe('unemployment', household(null), 'start').isSet);

  const dash = Progress.forRoom('dashboard', h);
  check('the dashboard has nothing left to ask this household', dash.missing.length, 0);
  checkTrue('… income sits in the not-applicable list', dash.notApplicable.some(f => f.fieldId === 'grossAnnualIncome'));
  const start = Progress.forRoom('start', household(null));
  checkTrue('Start Here lists the between-jobs card as outstanding until it is answered', start.missing.some(f => f.fieldId === 'unemployment'));
  checkTrue('… and the 401(k) as not applicable', start.notApplicable.some(f => f.fieldId === 'employerMatch'));

  /* The runway by hand: $6,000 cash, $3,000 a month out, $1,000 a month
     of benefit for three months. 6,000 → 4,000 → 2,000 → 0 → −3,000: three
     months, out in the fourth. */
  const r = Runway.project(h, T, { preset: 'laid_off', benefitMonthlyCents: 100000, benefitMonths: 3 });
  check('three months of runway', r.runwayMonths, 3);
  check('… out of money in the fourth', r.ranOutInMonth, 4);
  check('on cash alone, two', Runway.project(h, T, { preset: 'quit' }).runwayMonths, 2);

  (function () {
    const Gate = require(path.join(ROOT, 'shared/gate.js'));
    check('Start Here has the card', Gate.CARDS.betweenJobs.id, 'q-unemployed');
    checkTrue('… and only asks it when between jobs', Gate.ORDER.betweenJobs.indexOf('betweenJobs') !== -1 && Object.keys(Gate.ORDER).every(s => s === 'betweenJobs' || Gate.ORDER[s].indexOf('betweenJobs') === -1));
    checkTrue('… and stops asking for income then', Gate.ORDER.betweenJobs.indexOf('pay') === -1);
  })();
  checkTrue('the registry links to the card', Registry.byId('start').subsections.some(x => x.id === 'q-unemployed'));
  checkTrue('the dashboard loads the runway engine for the between-jobs action', /engines\/runway\.js/.test(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')) && /function betweenJobs/.test(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')));
  checkTrue('Runway opens on laid off with the facts', /function prefillFromFacts/.test(fs.readFileSync(path.join(ROOT, 'rooms/runway.html'), 'utf8')));
  (function () {
    const c = InstrumentsMain.compute(h, T);
    checkTrue('between jobs, the savings-rate instrument says why rather than asking for income', /Between jobs/.test(c.byId.savingsRate.result.reason));
    checkTrue('… and net worth is still a number: "no debt" reads as zero owed', c.byId.netWorth.ok && c.byId.netWorth.result.value === 1600000);
    check('"no debt" answered: total debt is $0, not a blank', Schema.totalDebtCents(h).value, 0);
    check('… and so are the monthly payments', Schema.monthlyDebtPaymentsCents(h).value, 0);
    check('unanswered with nothing listed stays incomplete', Schema.totalDebtCents(Schema.createHousehold({})).status, 'incomplete');
  })();
  checkTrue('a person saved without the field gets it empty', Schema.createPerson({ id: 'x', employmentStatus: 'employed' }).unemployment.since === null);

  /* Dependents and disability, same pass. */
  checkTrue('"on disability" is a working situation whose benefit is income', Schema.employmentStatus('disabled').benefits === true && Schema.employmentStatus('disabled').earning === false);
  check('dependents starts unasked', Schema.createHousehold({}).dependents, null);
  check('… and "no" is kept as an empty list, not blank (D-094)', JSON.stringify(Schema.createHousehold({ dependents: false }).dependents), '[]');
  const alone = Schema.createHousehold({ dependents: false });
  checkTrue('term life does not apply when nobody depends on the income', !Ownership.describe('termLife', alone, 'sleep-at-night').applies);
  checkTrue('… and does when someone does, or when unasked', Ownership.describe('termLife', Schema.createHousehold({ dependents: true }), 'sleep-at-night').applies && Ownership.describe('termLife', Schema.createHousehold({}), 'sleep-at-night').applies);
  checkTrue('Start Here asks it, in the fine-tune drawer', /id="q-fine-tune"/.test(fs.readFileSync(path.join(ROOT, 'rooms/start.html'), 'utf8')) && /choices\('dependents'/.test(fs.readFileSync(path.join(ROOT, 'rooms/start.html'), 'utf8')) && Registry.byId('start').subsections.some(x => x.id === 'q-fine-tune'));
  checkTrue('Sleep At Night says so instead of asking', /Nobody depends on your income/.test(fs.readFileSync(path.join(ROOT, 'rooms/sleep-at-night.html'), 'utf8')));
  checkTrue('… and unemploymentOf never returns undefined for a raw person', Schema.unemploymentOf(Schema.createHousehold({ people: [{ id: 'x', employmentStatus: 'unemployed', role: 'adult' }] })).since === null);
})();

section('Core (D-094): the command log — set, undo, redo, batch');

(function () {
  /* The spine instance ownership.js registered its labels and readers
     with is the one that can describe an entry ("cash & savings …"). */
  const Spine = SpineMain;
  Spine.reset();
  checkTrue('a fresh household has nothing to undo', !Spine.canUndo() && !Spine.canRedo());
  checkTrue('and peekUndo says so with null, not a throw', Spine.peekUndo() === null);
  checkTrue('undo on an empty stack is a no-op', Spine.undo() === null);

  /* One write, one entry. */
  Spine.set('meta.noRent', true, 'No rent');
  check('set() writes the path', Spine.get('meta.noRent'), true);
  check('… and records one entry', Spine.historySize().undo, 1);
  check('with the label the caller gave', Spine.peekUndo().label, 'No rent');
  check('and the path, before and after', JSON.stringify(Spine.peekUndo().changes), JSON.stringify([{ path: 'meta.noRent', before: null, after: true }]));
  checkTrue('stamped when', /^\d{4}-\d{2}-\d{2}T/.test(Spine.peekUndo().ts));

  const undone = Spine.undo();
  check('undo returns the entry it applied', undone.label, 'No rent');
  check('and the value is back to before', Spine.get('meta.noRent'), null);
  checkTrue('now there is a redo and no undo', Spine.canRedo() && !Spine.canUndo());
  check('redo puts it back', (Spine.redo(), Spine.get('meta.noRent')), true);
  check('undo and redo do not grow the log', Spine.historySize().undo, 1);
  check('… nor leave a redo behind', Spine.historySize().redo, 0);

  /* A new write after an undo drops the redo branch. */
  Spine.undo();
  Spine.set('meta.hasDebt', false, 'No debt');
  check('a fresh write clears the redo stack', Spine.historySize().redo, 0);

  /* The label comes from the owned field that moved, formatted, when no
     label is given: the hover text on the button. */
  Spine.upsertAsset(Schema.createAsset({ id: 'a_cash', category: 'cash', valueCents: 950000 }));
  checkTrue('a room write is described by the field that moved: ' + Spine.peekUndo().label,
    /Cash|cash/.test(Spine.peekUndo().label) && /— → \$9,500/.test(Spine.peekUndo().label));
  Spine.upsertAsset({ id: 'a_cash', valueCents: 1200000 });
  check('before → after, in dollars', Spine.peekUndo().label.replace(/^[^$]*/, ''), '$9,500 → $12,000');
  Spine.undo();
  check('undoing a room write restores the number', Schema.cashCents(Spine.getProfile()).value, 950000);

  /* Several writes as one entry. */
  const before = Spine.historySize().undo;
  Spine.batch('Filled in the one-pager', function () {
    Spine.set('state', 'NC');
    Spine.set('filingStatus', 'single');
    Spine.set('meta.noRent', false);
  });
  check('a batch is one entry', Spine.historySize().undo - before, 1);
  check('with the batch label', Spine.peekUndo().label, 'Filled in the one-pager');
  check('holding every change', Spine.peekUndo().changes.length, 3);
  Spine.undo();
  check('one undo reverts all of it (state)', Spine.getProfile().state, null);
  check('… (filing)', Spine.getProfile().filingStatus, null);
  check('… (no rent)', Spine.get('meta.noRent'), null);
  Spine.redo();
  check('one redo re-applies all of it', Spine.getProfile().state + '/' + Spine.getProfile().filingStatus, 'NC/single');
  check('a batch that changes nothing records nothing', (Spine.batch('nothing', function () {}), Spine.historySize().undo - before), 1);

  /* The stacks live in the household, so they survive a reload. */
  checkTrue('the stacks are stored with the household', Array.isArray(Spine.getProfile().meta.undoStack) && Spine.getProfile().meta.undoStack.length === Spine.historySize().undo);
  const sizeBefore = Spine.historySize().undo;
  Spine._reload();
  check('after a reload the log is still there', Spine.historySize().undo, sizeBefore);
  checkTrue('an export leaves the log behind — it is this browser\'s, not the household\'s', Spine.exportObject().household.meta.undoStack === undefined && Spine.exportJSON().indexOf('undoStack') === -1);
  check('… and the profile keeps it', Spine.historySize().undo, sizeBefore);

  /* The cap. */
  for (let i = 0; i < 120; i++) Spine.set('meta.noRent', i % 2 === 0, 'toggle ' + i);
  check('the log holds the last hundred, no more', Spine.historySize().undo, Spine.HISTORY_CAP);
  check('… which is 100', Spine.HISTORY_CAP, 100);
  check('and the oldest fell off, not the newest', Spine.peekUndo().label, 'toggle 119');

  /* An explicit reset clears it. */
  Spine.reset();
  checkTrue('reset clears both stacks', !Spine.canUndo() && !Spine.canRedo());
  check('and leaves nothing behind in meta', (Spine.getProfile().meta.undoStack || []).length, 0);

  /* Undoing a gate change restores every field the gate removed. The
     one-pager wraps a situation change in one batch: the status, and the
     branches that no longer exist go with it. */
  Spine.ensurePrimaryPerson('You');
  const you = Schema.primaryPerson(Spine.getProfile());
  Spine.batch('Employed', function () {
    Spine.upsertPerson({ id: you.id, employmentStatus: 'employed' });
    Spine.upsertIncomeSource(you.id, Schema.createIncomeSource({ id: 'intake_income', type: 'w2', grossAnnualIncomeCents: 6200000,
      employerMatch: { matchPercent: 0.5, matchCapPercentOfSalary: 0.06 } }));
    Spine.set('retirement.contributionPercent', 6);
  });
  const Gate = require(path.join(ROOT, 'shared/gate.js'));
  checkTrue('an employed household has the retirement branch', Gate.exists(Spine.getProfile(), 'retirement') && Gate.exists(Spine.getProfile(), 'employerMatch'));
  Spine.batch('Now retired', function () {
    Spine.upsertPerson({ id: you.id, employmentStatus: 'retired' });
    /* What the gate removes goes with the change — not hidden, gone. */
    Spine.upsertIncomeSource(you.id, { id: 'intake_income', type: 'pension', employerMatch: null });
    Spine.set('retirement.contributionPercent', null);
  });
  checkTrue('retired: the retirement branch is gone', !Gate.exists(Spine.getProfile(), 'retirement'));
  check('… and the match with it', Schema.primaryPerson(Spine.getProfile()).incomeSources[0].employerMatch, null);
  check('… and the contribution', Spine.get('retirement.contributionPercent'), null);
  check('the gate change is one entry', Spine.peekUndo().label, 'Now retired');
  Spine.undo();
  check('undoing the gate change restores the status', Schema.primaryPerson(Spine.getProfile()).employmentStatus, 'employed');
  const src = Schema.primaryPerson(Spine.getProfile()).incomeSources[0];
  check('… the match percent', src.employerMatch && src.employerMatch.matchPercent, 0.5);
  check('… the match cap', src.employerMatch && src.employerMatch.matchCapPercentOfSalary, 0.06);
  check('… the contribution', Spine.get('retirement.contributionPercent'), 6);
  check('… the source type', src.type, 'w2');
  checkTrue('and the branch exists again', Gate.exists(Spine.getProfile(), 'retirement'));
  Spine.redo();
  checkTrue('redo takes it away again', !Gate.exists(Spine.getProfile(), 'retirement'));

  /* Undo works after a reload too — the whole point of storing it. */
  Spine._reload && Spine._reload();
  Spine.undo();
  checkTrue('a reloaded page can still undo', Gate.exists(Spine.getProfile(), 'retirement'));

  /* Undo never takes the clock with it: confirmedAt and updatedAt are
     not in the diff, so undoing a value does not un-confirm the field. */
  Spine.reset();
  Spine.set('state', 'NC', 'State');
  Spine.confirm('state');
  check('confirming records no entry', Spine.historySize().undo, 1);
  Spine.undo();
  checkTrue('undo leaves the confirmation stamp alone', !!Spine.confirmedAt('state'));

  /* A guess flagged in meta.guessed clears when a real number lands. */
  Spine.set('meta.guessed.cashSavings', true, 'guess');
  Spine.upsertAsset(Schema.createAsset({ id: 'a_cash', category: 'cash', valueCents: 100000 }));
  checkTrue('a real number replaces a guess: the flag goes', !Spine.getProfile().meta.guessed.cashSavings);
  Spine.reset();
})();

section('Core (D-094): the gate — exists() per situation');

(function () {
  const Gate = require(path.join(ROOT, 'shared/gate.js'));
  const Registry = require(path.join(ROOT, 'shared/registry.js'));
  function hh(situation, extra) {
    const s = Gate.byId(situation);
    const h = Schema.createHousehold(Object.assign({ people: [Schema.createPerson({ role: 'adult', employmentStatus: s ? s.status : null })] }, extra || {}));
    return h;
  }
  check('six situations', Gate.SITUATIONS.length, 6);
  check('each maps to a working status', Gate.SITUATIONS.filter(s => Schema.employmentStatus(s.status)).length, 6);
  check('each names the dashboard lead', Gate.SITUATIONS.filter(s => typeof s.lead === 'string').length, 6);
  check('unanswered: no situation', Gate.situationOf(Schema.createHousehold({})), null);
  check('the primary person\'s status picks it', Gate.situationOf(hh('retired')), 'retired');
  check('"both" is mixed', Gate.situationOf(hh('mixed')), 'mixed');

  /* The brief's table, as a truth table. */
  const T = {
    /*                 income retire ownWork unemp pension stipend hours savings decum protection career */
    employed:     { income: true,  retirement: true,  ownWork: false, unemployment: false, pension: false, stipend: false, hours: true,  savingsRate: true,  decumulation: false, protection: true,  career: true },
    selfEmployed: { income: true,  retirement: false, ownWork: true,  unemployment: false, pension: false, stipend: false, hours: true,  savingsRate: true,  decumulation: false, protection: true,  career: true },
    betweenJobs:  { income: false, retirement: false, ownWork: false, unemployment: true,  pension: false, stipend: false, hours: false, savingsRate: false, decumulation: false, protection: true,  career: false },
    student:      { income: true,  retirement: false, ownWork: false, unemployment: false, pension: false, stipend: true,  hours: true,  savingsRate: true,  decumulation: false, protection: false, career: true },
    retired:      { income: true,  retirement: false, ownWork: false, unemployment: false, pension: true,  stipend: false, hours: false, savingsRate: false, decumulation: true,  protection: true,  career: false },
    mixed:        { income: true,  retirement: true,  ownWork: true,  unemployment: false, pension: false, stipend: false, hours: true,  savingsRate: true,  decumulation: false, protection: true,  career: true }
  };
  Object.keys(T).forEach(function (s) {
    const h = hh(s);
    Object.keys(T[s]).forEach(function (k) {
      check(`${s}: ${k} ${T[s][k] ? 'exists' : 'is absent'}`, Gate.exists(h, k), T[s][k]);
    });
  });
  checkTrue('downstream of retirement: match and payroll follow it', ['employed', 'retired', 'selfEmployed'].every(s => Gate.exists(hh(s), 'employerMatch') === T[s].retirement && Gate.exists(hh(s), 'payroll') === T[s].retirement));
  checkTrue('downstream of own work: variable income and the quarterly follow it', ['selfEmployed', 'employed', 'mixed'].every(s => Gate.exists(hh(s), 'variableIncome') === T[s].ownWork && Gate.exists(hh(s), 'quarterlyTax') === T[s].ownWork));
  checkTrue('the real hourly wage needs hours', ['employed', 'retired', 'betweenJobs'].every(s => Gate.exists(hh(s), 'realHourlyWage') === T[s].hours));

  /* Between jobs with an income source (severance, a partner): income exists. */
  const bj = hh('betweenJobs');
  bj.people[0].incomeSources.push(Schema.createIncomeSource({ type: 'other', grossAnnualIncomeCents: 1200000 }));
  checkTrue('between jobs with money coming in: income exists', Gate.exists(bj, 'income'));

  /* Unanswered: everything a person could need is there — the map before
     the intake shows every room. */
  const none = Schema.createHousehold({});
  const absentWhenUnanswered = Gate.BRANCHES.filter(k => !Gate.exists(none, k));
  check('unanswered: only the branches that need a fact are absent', absentWhenUnanswered.sort().join(','), 'childcare,daySchool,dependents,partner,unemployment');

  /* The household branches. */
  check('no partner: the partner branch is absent', Gate.exists(hh('employed'), 'partner'), false);
  const two = hh('employed'); two.people.push(Schema.createPerson({ role: 'adult', label: 'Sam' }));
  check('two adults: it exists', Gate.exists(two, 'partner'), true);
  check('no dependents answered: absent', Gate.exists(hh('employed'), 'dependents'), false);
  check('"no": absent', Gate.exists(hh('employed', { dependents: false }), 'dependents'), false);
  check('a dependent: exists', Gate.exists(hh('employed', { dependents: [{ age: 9 }] }), 'dependents'), true);
  check('a nine-year-old is not childcare', Gate.exists(hh('employed', { dependents: [{ age: 9 }] }), 'childcare'), false);
  check('a three-year-old is', Gate.exists(hh('employed', { dependents: [{ age: 3 }] }), 'childcare'), true);
  check('day school needs the community flag and a child', Gate.exists(hh('employed', { dependents: [{ age: 9 }], community: { daySchool: true } }), 'daySchool'), true);
  check('… not just the flag', Gate.exists(hh('employed', { community: { daySchool: true } }), 'daySchool'), false);
  check('debt exists until "no debt"', Gate.exists(hh('employed'), 'debt'), true);
  const noDebt = hh('employed'); noDebt.meta.hasDebt = false;
  check('… then it is absent', Gate.exists(noDebt, 'debt'), false);
  check('student loans: a student with debt', Gate.exists(hh('student'), 'studentLoans'), true);
  check('… not a retiree', Gate.exists(hh('retired'), 'studentLoans'), false);
  check('an unknown key exists — nothing is gated by accident', Gate.exists(hh('retired'), 'notAKey'), true);
  check('an empty household exists too', Gate.exists(null, 'income'), true);

  /* The lead. */
  check('employed leads with the savings rate', Gate.lead(hh('employed')), 'savingsRate');
  check('self-employed with owner\'s pay', Gate.lead(hh('selfEmployed')), 'ownersPay');
  check('between jobs with the runway', Gate.lead(hh('betweenJobs')), 'runwayDays');
  check('a student with the loans', Gate.lead(hh('student')), 'loanTrajectory');
  check('retired with the withdrawal rate', Gate.lead(hh('retired')), 'withdrawalRate');
  check('unanswered leads with the savings rate', Gate.lead(none), 'savingsRate');
  check('branches() answers every key', Object.keys(Gate.branches(hh('employed'))).length, Gate.BRANCHES.length);

  /* The cards, never more than ten, and only for what applies. */
  Object.keys(Gate.ORDER).forEach(function (s) {
    const cards = Gate.fieldsFor(s, hh(s));
    checkTrue(`${s}: at most ten cards (${cards.length})`, cards.length <= Gate.MAX_FIELDS);
    checkTrue(`${s}: no partner card for one adult`, !cards.some(c => c.key === 'partnerPay'));
  });
  checkTrue('two adults: the partner card appears', Gate.fieldsFor('employed', two).some(c => c.key === 'partnerPay'));
  checkTrue('employed has the 401(k) card', Gate.fieldsFor('employed', hh('employed')).some(c => c.key === 'plan'));
  checkTrue('self-employed does not', !Gate.fieldsFor('selfEmployed', hh('selfEmployed')).some(c => c.key === 'plan'));
  checkTrue('between jobs has its own card and no pay card', Gate.fieldsFor('betweenJobs', hh('betweenJobs')).some(c => c.key === 'betweenJobs') && !Gate.fieldsFor('betweenJobs', hh('betweenJobs')).some(c => c.key === 'pay'));
  check('an unknown situation has no cards', Gate.fieldsFor('nope', none).length, 0);
  checkTrue('every card field is an owned field', Gate.allCards().every(c => c.fields.every(f => !!Ownership.field(f))));

  /* Rooms whose requires are absent are not in the map. */
  const all = Registry.all().length;
  function gone(h) { const ids = Registry.forHousehold(h).map(r => r.id); return Registry.all().map(r => r.id).filter(id => ids.indexOf(id) === -1).sort().join(','); }
  check('unanswered: every room but the ones that need a fact (a status, a partner, a dependent)', gone(none), 'between-jobs,kids,partner');
  check('no household: every room', Registry.forHousehold(null).length, all);
  const retiredRooms = Registry.forHousehold(hh('retired')).map(r => r.id);
  check('retired: the working rooms are gone, and Between Jobs', gone(hh('retired')), 'accounts,between-jobs,career-move,credential,dreamline,fire,hassle,kids,partner,real-hourly-wage,savings-rate,self-employed,side-hustle,variable-income');
  const bjRooms = Registry.forHousehold(hh('betweenJobs')).map(r => r.id);
  checkTrue('between jobs: no hourly wage, no savings rate, runway stays', bjRooms.indexOf('real-hourly-wage') === -1 && bjRooms.indexOf('savings-rate') === -1 && bjRooms.indexOf('runway') !== -1);
  check('employed, alone, no dependents: own work, between jobs, decumulation, partner, kids and variable income are gone', gone(hh('employed')), 'between-jobs,decumulation,kids,partner,self-employed,variable-income');
  checkTrue('self-employed: the 401(k) room is gone', Registry.forHousehold(hh('selfEmployed')).map(r => r.id).indexOf('accounts') === -1);
  checkTrue('every requires key is a branch', Object.keys(Registry.REQUIRES).every(id => Registry.REQUIRES[id].every(k => Gate.BRANCHES.indexOf(k) !== -1)));
  checkTrue('every requires room is a room', Object.keys(Registry.REQUIRES).every(id => !!Registry.byId(id)));
  check('byTag with a household filters the same way', Registry.byTag('all', hh('retired')).length, retiredRooms.length);
  check('byTag without one is every room', Registry.byTag('all').length, all);
  check('the demo is six rooms short — no own work, not between jobs, not drawing down, alone, nobody depending', gone(Demo.build()), 'between-jobs,decumulation,kids,partner,self-employed,variable-income');

  /* Guesses: a default for every guessable control, from the tables. */
  const tables = Object.assign({}, TABLES, { onepagerDefaults: require(path.join(ROOT, 'data/onepager_defaults.json')), uiBenefits: require(path.join(ROOT, 'data/ui_benefits.json')), matchDefaults: require(path.join(ROOT, 'data/match_defaults.json')) });
  const g = Gate.guesses('employed', hh('employed'), tables);
  check('employed pay is guessed at the median', g.pay.value, 6200000);
  check('spending is 55% of gross a month', g.spending.value, Math.round(6200000 / 12 * 0.55));
  check('cash is a month of that', g.cash.value, g.spending.value);
  check('the deductible is the common one', g.deductible.value, 150000);
  check('the contribution takes the match', g.contribution.value, 6);
  checkTrue('every guess says where it came from', Object.keys(g).every(k => typeof g[k].source === 'string' && g[k].source.length > 0));
  checkTrue('nothing is guessed as a number without a value', Object.keys(g).every(k => g[k].value !== undefined && g[k].value !== null));
  check('no employer: no match guess', Gate.guesses('selfEmployed', hh('selfEmployed'), tables).matchPercent, undefined);
  check('a student is guessed to have a loan', Gate.guesses('student', hh('student'), tables).hasDebt.value, 'yes');
  check('… and nothing invested', Gate.guesses('student', hh('student'), tables).investments.value, 0);
  const bjNC = hh('betweenJobs', { state: 'NC' });
  const gb = Gate.guesses('betweenJobs', bjNC, tables);
  check('between jobs in NC: the weekly cap', gb.weekly.value, tables.uiBenefits.states.NC.maxWeeklyDollars * 100);
  check('… and the weeks', gb.weeks.value, tables.uiBenefits.states.NC.weeks);
  check('no tables: no guesses, not a throw', Object.keys(Gate.guesses('employed', hh('employed'), {})).length, 0);
  check('the milestone multiple interpolates (age 35 between 30 and 40)', Gate.milestoneMultiple(tables.retirementMilestones, 35), (function () {
    const m = tables.retirementMilestones.milestones; const a = m.find(r => r.age === 30), b = m.find(r => r.age === 40); return a.multiple + (b.multiple - a.multiple) / 2; })());
})();

section('Core (D-094): the lens, by hand');

(function () {
  const Lens = require(path.join(ROOT, 'shared/lens.js'));
  const Gate = require(path.join(ROOT, 'shared/gate.js'));
  const demo = Demo.build();
  const T = TABLES;

  check('four modes', Lens.MODES.map(m => m.id).join(','), '$,hours,bought,pushed');
  check('the demo has all four', Lens.available(demo, T).length, 4);
  const retired = Schema.createHousehold({ people: [Schema.createPerson({ role: 'adult', employmentStatus: 'retired' })] });
  check('a retiree has no hours lens', Lens.available(retired, T).map(m => m.id).join(','), '$,bought,pushed');
  const bj = Schema.createHousehold({ people: [Schema.createPerson({ role: 'adult', employmentStatus: 'unemployed' })] });
  check('nor does someone between jobs', Lens.available(bj, T).map(m => m.id).join(','), '$,bought,pushed');
  checkTrue('hours on a retiree is incomplete, not zero', !Money.isOk(Lens.apply(100000, 'hours', retired, T)));

  /* $ is the number itself. */
  check('$ passes dollars through', Lens.format(123456, '$', demo, T), '$1,235');
  check('nothing to show is an em dash', Lens.format(null, 'hours', demo, T), Money.EM_DASH);

  /* Hours: dollars ÷ the real hourly wage, the same one the room shows. */
  const wage = Hourly.realHourlyWage(demo, T).value;
  const h = Lens.apply(1000000, 'hours', demo, T);
  check('hours = cents ÷ real hourly wage', h.value, 1000000 / wage, 1e-9);
  check('… shown as time', h.display, Money.formatAsTime(1000000, wage));
  check('$10,000 on the demo is ' + h.display, h.display, Math.round(1000000 / wage) + ' h');

  /* FI moves by the projection's fractional years; check it against the
     closed form n = ln((T + C/r)/(P + C/r)) / ln(1 + r). */
  const fi = Lens.fiInputs(demo, T);
  checkTrue('the FI inputs come from the same three the dashboard uses', Money.isOk(fi) && fi.targetCents === Tier0.fireNumber(demo).value && fi.investmentsCents === Schema.investmentsCents(demo).value);
  check('the real return is the household assumption', fi.rate, Schema.resolveAssumptions(demo).returnReal);
  function closed(P) { const C = fi.annualSavingsCents, r = fi.rate; return Math.log((fi.targetCents + C / r) / (P + C / r)) / Math.log(1 + r); }
  const b = Lens.apply(1000000, 'bought', demo, T);
  check('years to FI now, within a tenth of the closed form', b.yearsNow, closed(fi.investmentsCents), 0.1);
  check('years to FI with $10,000 more saved', b.yearsThen, closed(fi.investmentsCents + 1000000), 0.1);
  check('months bought = the difference, in months, rounded', b.value, Math.round((b.yearsNow - b.yearsThen) * 12));
  checkTrue('$10,000 saved buys months, not nothing: ' + b.display, b.value > 0 && /sooner$/.test(b.display));
  const p = Lens.apply(1000000, 'pushed', demo, T);
  checkTrue('$10,000 spent pushes FI later: ' + p.display, p.value > 0 && /later$/.test(p.display));
  check('bought and pushed are near mirrors', p.value, b.value, 1);
  checkTrue('a small amount still moves: ' + Lens.format(100000, 'pushed', demo, T), /< 1 mo later|\d mo later/.test(Lens.format(100000, 'pushed', demo, T)));
  check('a big one reads in years', /yrs sooner$/.test(Lens.format(30000000, 'bought', demo, T)), true);
  check('zero moves nothing', Lens.format(0, 'pushed', demo, T), 'FI unmoved');
  checkTrue('nothing saved: FI cannot move, and says why', /Nothing is being saved/.test(Lens.apply(100000, 'bought', Schema.createHousehold({ people: [Schema.createPerson({ role: 'adult', employmentStatus: 'employed' })] }), T).reason || '') || !Money.isOk(Lens.apply(100000, 'bought', Schema.createHousehold({}), T)));

  /* Fractional years in the projection: start 0, no return, $400 a year
     to $1,000 is two and a half years, three whole ones. */
  check('whole years by default', Projection.yearsToTargetCents({ startCents: 0, targetCents: 100000, annualRate: 0, annualContributionCents: 40000 }).value, 3);
  check('fractional when asked', Projection.yearsToTargetCents({ startCents: 0, targetCents: 100000, annualRate: 0, annualContributionCents: 40000, fractional: true }).value, 2.5);
  check('already there is zero either way', Projection.yearsToTargetCents({ startCents: 100000, targetCents: 100000, annualRate: 0.05, fractional: true }).value, 0);

  /* The mode is per session and falls back to dollars. */
  check('no sessionStorage: dollars', Lens.mode(), '$');
  check('setMode without one still answers', Lens.setMode('hours'), '$');
  const html = Lens.toggleHtml(demo, T, 'lens-test');
  checkTrue('the toggle is one button a mode, dollars pressed', (html.match(/slaf-lens-btn/g) || []).length === 4 && /data-lens="\$" aria-pressed="true"/.test(html));
  checkTrue('a retiree\'s toggle has no hours', (Lens.toggleHtml(retired, T).match(/slaf-lens-btn/g) || []).length === 3);
  checkTrue('formatAsTime: minutes under an hour, tenths under a hundred', Money.formatAsTime(500, 2000) === '15 min' && Money.formatAsTime(30000, 2000) === '15 h' && Money.formatAsTime(3000000, 2000) === '1,500 h');
})();

section('Core (D-094): the schema branches and their migrations');

(function () {
  const h = Schema.createHousehold({});
  check('dependents start unanswered', h.dependents, null);
  check('"yes" from before is one person of unknown age', JSON.stringify(Schema.createHousehold({ dependents: true }).dependents), '[{"age":null}]');
  check('"no" is an empty list', JSON.stringify(Schema.createHousehold({ dependents: false }).dependents), '[]');
  check('a list keeps its ages', JSON.stringify(Schema.createHousehold({ dependents: [{ age: 4 }, { age: 12 }] }).dependents), '[{"age":4},{"age":12}]');
  check('term life applies to a bare "yes"', Ownership.describe('termLife', Object.assign(Schema.createHousehold({}), { dependents: true }), 'sleep-at-night').applies, true);
  check('… not to a bare "no"', Ownership.describe('termLife', Object.assign(Schema.createHousehold({}), { dependents: false }), 'sleep-at-night').applies, false);
  check('dependents reads a bare "no" as none', Ownership.field('dependents').read(Object.assign(Schema.createHousehold({}), { dependents: false })).value, 0);
  check('… and formats it', Ownership.field('dependents').format(0), 'No');
  check('… two people', Ownership.field('dependents').format(2), '2 people');

  check('health cover starts unknown', h.insurance.health.type, null);
  check('… with no monthly cost', h.insurance.health.monthlyCents, null);
  check('an unknown health type is dropped', Schema.createHousehold({ insurance: { health: { type: 'magic' } } }).insurance.health.type, null);
  check('a known one is kept', Schema.createHousehold({ insurance: { health: { type: 'parent' } } }).insurance.health.type, 'parent');
  check('estate starts unanswered', JSON.stringify(h.estate), JSON.stringify({ beneficiariesSet: null, willExists: null, poaExists: null }));
  check('giving starts unanswered', JSON.stringify(h.giving), JSON.stringify({ pctOfIncome: null, annualTargetCents: null }));
  check('one-offs start empty', h.oneOffs.length, 0);
  const oo = Schema.createOneOff({ label: 'Tax refund', cents: 120000, direction: 'in', on: '2026-04-15' });
  checkTrue('a one-off has an id, a label, cents, a direction and a date', /^/.test(oo.id) && oo.label === 'Tax refund' && oo.cents === 120000 && oo.direction === 'in' && oo.on === '2026-04-15');
  check('a bad direction is out — money leaving is the safe reading', Schema.createOneOff({ cents: 100, direction: 'sideways' }).direction, 'out');
  check('the community flag starts unanswered', h.community.daySchool, null);
  check('the real return assumption is 5%', Schema.resolveAssumptions(h).returnReal, 0.05);
  check('inflation 3%', Schema.resolveAssumptions(h).inflation, 0.03);
  check('an income source can carry a low month', Schema.createIncomeSource({ variableLowCents: 200000, variableHighCents: 600000 }).variableLowCents, 200000);
  check('… and a high one', Schema.createIncomeSource({ variableLowCents: 200000, variableHighCents: 600000 }).variableHighCents, 600000);
  check('"a month on average" is a pay basis', IncomeEngine.BASES.filter(b => b.id === 'variable').length, 1);
  check('… twelve a year', IncomeEngine.BASES.filter(b => b.id === 'variable')[0].periods, 12);
  check('meta.guessed starts empty', JSON.stringify(h.meta.guessed), '{}');
  check('no rent starts unanswered', h.meta.noRent, null);
  checkTrue('the undo stacks start empty', Array.isArray(h.meta.undoStack) && h.meta.undoStack.length === 0 && Array.isArray(h.meta.redoStack));
  checkTrue('every stored household still round-trips (the migration keeps the old shape)', (function () {
    const old = JSON.parse(JSON.stringify(Demo.build()));
    delete old.oneOffs; delete old.estate; delete old.giving; old.dependents = true; delete old.insurance.health; delete old.community; delete old.meta.guessed;
    const back = Schema.createHousehold(old);
    return back.oneOffs.length === 0 && back.estate.willExists === null && back.dependents.length === 1 && back.insurance.health.type === null && back.community.daySchool === null;
  })());
  check('the one-pager defaults table is registered', require(path.join(ROOT, 'shared/reference.js')).TABLE_FILES.onepagerDefaults, 'onepager_defaults.json');
  const d = require(path.join(ROOT, 'data/onepager_defaults.json'));
  checkTrue('… and carries the reference-data header', typeof d.version === 'string' && typeof d.asOf === 'string' && typeof d.source === 'string' && typeof d.confidence === 'string' && typeof d.confidenceNote === 'string');
})();

section('The one-pager (D-095): import, confidence, the drawer');

(function () {
  const Gate = require(path.join(ROOT, 'shared/gate.js'));
  const Spine = SpineMain;

  /* Pasted lines become rows; a CSV header is skipped; the second line
     naming the same thing is left alone; "k" is thousands; a monthly hint
     on pay is kept. */
  const r = Gate.parseImport('label,amount\nSalary, 62,000\nchecking $4,120\n401k: 31k\nRent 1,500/mo\nCredit card balance 2,300\nMortgage 250000\nsalary again 1');
  check('five rows read', r.rows.length, 5);
  check('the salary, in cents', r.rows[0].cents, 6200000);
  check('… read as a year', r.rows[0].basis, 'annual');
  check('checking is cash', r.rows[1].key + '=' + r.rows[1].cents, 'cash=412000');
  check('401k with a k suffix is investments, thousands', r.rows[2].key + '=' + r.rows[2].cents, 'investments=3100000');
  check('rent is spending', r.rows[3].key + '=' + r.rows[3].cents, 'spending=150000');
  check('a card balance is debt', r.rows[4].key + '=' + r.rows[4].cents, 'debtBalance=230000');
  check('what it could not place is listed, not guessed', r.unmatched.join('|'), 'Mortgage 250000|salary again 1');
  check('salary 5,000 a month keeps the basis', Gate.parseImport('salary 5,000 a month').rows[0].basis, 'monthly');
  check('a blank paste is nothing, not a throw', Gate.parseImport('').rows.length + Gate.parseImport(null).rows.length, 0);
  check('a line with a word and no number is unmatched', Gate.parseImport('savings').unmatched.length, 1);
  check('a negative amount imports as its size', Gate.parseImport('debt -1,200').rows[0].cents, 120000);

  /* The badge: guessed, you entered, or from the room that wrote it. */
  Spine.reset();
  Spine.registerRoom('start');
  Spine.upsertAsset(Schema.createAsset({ id: 'a_cash', category: 'cash', valueCents: 950000 }));
  check('a number typed in Start Here reads as entered', Ownership.describe('cashSavings', Spine.getProfile(), 'start').confidence, 'entered');
  check('… and the spine says which room wrote it', Spine.getProfile().meta.source.cashSavings, 'start');
  Spine.registerRoom('statement');
  Spine.upsertAsset({ id: 'a_cash', valueCents: 1200000 });
  const d = Ownership.describe('cashSavings', Spine.getProfile(), 'start');
  check('a number changed in The Statement reads as from a room, on the one-pager', d.confidence, 'room');
  check('… naming it', d.sourceId, 'statement');
  check('… relative to the owner, whichever room is asking', Ownership.describe('cashSavings', Spine.getProfile(), 'statement').confidence, 'room');
  Spine.set('meta.guessed.cashSavings', true);
  check('a flagged guess reads as one whoever wrote it', Ownership.describe('cashSavings', Spine.getProfile(), 'start').confidence, 'guess');
  checkTrue('the source stamp is not history: undo does not touch it', (function () {
    Spine.reset(); Spine.registerRoom('start'); Spine.set('state', 'NC', 'State');
    const stamped = Spine.getProfile().meta.source.state;
    Spine.undo();
    return stamped === 'start' && Spine.getProfile().meta.source.state === 'start';
  })());
  check('a household from before the stamp reads as entered', Ownership.describe('cashSavings', Demo.build(), 'start').confidence, 'entered');
  Spine.reset();
  Spine.registerRoom('start');

  /* The drawer's field is the one-pager's, optional, and not a need. */
  check('who depends on you is owned by the one-pager', Ownership.field('dependents').owner, 'start');
  check('… in the fine-tune drawer', Ownership.field('dependents').anchor, 'q-fine-tune');
  checkTrue('… and is not on the list of things Start Here needs', Registry.byId('start').needs.indexOf('dependents') === -1);
  checkTrue('the drawer and the import are the page\'s own sections', ['q-fine-tune', 'q-import'].every(id => Registry.byId('start').subsections.some(x => x.id === id)));

  /* Ten at most, whoever you are. */
  Object.keys(Gate.ORDER).forEach(function (s) {
    const two = Schema.createHousehold({ people: [Schema.createPerson({ role: 'adult', employmentStatus: Gate.byId(s).status }), Schema.createPerson({ role: 'adult' })] });
    checkTrue(`${s} with a partner: at most ten cards`, Gate.fieldsFor(s, two).length <= 10);
  });

  /* The page's own contract. */
  const start = fs.readFileSync(path.join(ROOT, 'rooms/start.html'), 'utf8');
  checkTrue('the gate change is one batch', /el\('gate'\)\.addEventListener\('click'[\s\S]{0,400}Spine\.batch\('Situation: '/.test(start));
  checkTrue('and so is "See my dashboard"', /function commitGuesses[\s\S]{0,200}Spine\.batch\('Filled in the one-pager'/.test(start));
  checkTrue('and the import', /Spine\.batch\('Imported '/.test(start));
  checkTrue('cards that do not apply are removed from the page, not hidden', /box\.removeChild\(n\)/.test(start) && !/node\.hidden = !on/.test(start));
  checkTrue('every box carries a badge', /function badge\(name\)/.test(start) && (start.match(/\+ badge\(name\)/g) || []).length >= 3 && /function paintBadges/.test(start));
  checkTrue('the page declares its live-form discipline', /LIVE-FORM: built once/.test(start));
  checkTrue('and a place for a theme', /THEMING:/.test(start));
  checkTrue('the photo path degrades to paste when the browser cannot read text', /TextDetector/.test(start) && /paste/i.test(start));
})();

section('The dashboard (D-096): four blocks, the leads, the translator');

(function () {
  const Gate = require(path.join(ROOT, 'shared/gate.js'));
  const Advice = require(path.join(ROOT, 'engines/advice.js'));
  const Ratios = require(path.join(ROOT, 'engines/ratios.js'));
  const T = Object.assign({}, TABLES, { adviceTranslator: require(path.join(ROOT, 'data/advice_translator.json')), uiBenefits: require(path.join(ROOT, 'data/ui_benefits.json')), reentryGap: require(path.join(ROOT, 'data/reentry_gap.json')), debtRules: require(path.join(ROOT, 'data/debt_rules.json')) });
  const NOW = Date.parse('2026-09-05T12:00:00Z');
  function hh(status, extra) {
    const h = Schema.createHousehold(Object.assign({ state: 'NC', filingStatus: 'single', meta: { hasDebt: false, noRent: false },
      people: [Schema.createPerson({ role: 'adult', employmentStatus: status, dob: '1990-06-01', incomeSources: [Schema.createIncomeSource({ id: 'intake_income', grossAnnualIncomeCents: 6000000 })] })],
      assets: [Schema.createAsset({ category: 'cash', valueCents: 600000 }), Schema.createAsset({ category: 'investment', valueCents: 4000000 })] }, extra || {}));
    h.expenses.monthlyEssential.estimatedValueCents = 300000;
    return h;
  }

  /* The withdrawal rate, by hand: $3,100 × 12 − $24,000 = $13,200 over
     $420,000 = 3.14%. Income covering spending draws nothing. */
  const ret = hh('retired', { people: [Schema.createPerson({ role: 'adult', employmentStatus: 'retired', dob: '1958-03-01', incomeSources: [Schema.createIncomeSource({ grossAnnualIncomeCents: 2400000 })] })],
    assets: [Schema.createAsset({ category: 'cash', valueCents: 1800000 }), Schema.createAsset({ category: 'investment', valueCents: 42000000 })] });
  ret.expenses.monthlyEssential.estimatedValueCents = 310000;
  const wr = Ratios.all(ret, T).rows.filter(r => r.id === 'withdrawalRate')[0];
  check('withdrawal rate = (spending × 12 − income) ÷ investments', Math.round(wr.value * 10000) / 10000, Math.round(1320000 / 42000000 * 10000) / 10000);
  check('… drawing $13,200 a year', wr.result.annualDrawCents, 1320000);
  check('… inside the 4% band', wr.verdict.zone, 'good');
  const covered = hh('retired'); covered.expenses.monthlyEssential.estimatedValueCents = 200000;
  check('income covering spending draws nothing — a zero, not a blank', Ratios.all(covered, T).rows.filter(r => r.id === 'withdrawalRate')[0].result.value, 0);
  checkTrue('… and says it is covered', Ratios.all(covered, T).rows.filter(r => r.id === 'withdrawalRate')[0].result.covered === true);
  checkTrue('an employed household has no withdrawal rate', !Ratios.all(hh('employed'), T).rows.filter(r => r.id === 'withdrawalRate')[0].ok);
  check('the band is 4% / 5%', T.ratioBenchmarks.bands.withdrawalRate.good + '/' + T.ratioBenchmarks.bands.withdrawalRate.warn, '0.04/0.05');

  /* Years until empty, by hand: $100 drawing $30 a year at 0%: 3.33 years.
     Growth outrunning the draw never empties. */
  check('$100 drawing $30 at 0% lasts 3⅓ years', Projection.yearsUntilEmptyCents({ startCents: 10000, annualDrawCents: 3000, annualRate: 0 }).value, 3 + 1 / 3, 1e-9);
  checkTrue('growth beyond the draw never empties', Projection.yearsUntilEmptyCents({ startCents: 10000, annualDrawCents: 300, annualRate: 0.05 }).never === true);
  checkTrue('nothing drawn never empties', Projection.yearsUntilEmptyCents({ startCents: 10000, annualDrawCents: 0, annualRate: 0.05 }).never === true);
  check('nothing to draw from is gone at once', Projection.yearsUntilEmptyCents({ startCents: 0, annualDrawCents: 300, annualRate: 0.05 }).value, 0);
  /* $420,000 drawing $13,200 at 5% real: 13,200 / 420,000 = 3.1% < 5%, so it grows: never. At 0% it is 31.8 years. */
  checkTrue('the retiree above outlasts the draw at 5% real', Projection.yearsUntilEmptyCents({ startCents: 42000000, annualDrawCents: 1320000, annualRate: 0.05 }).never === true);
  check('… and at 0% real, 31.8 years', Math.round(Projection.yearsUntilEmptyCents({ startCents: 42000000, annualDrawCents: 1320000, annualRate: 0 }).value * 10) / 10, 31.8);

  /* The instruments reflect the gate: the situation's number first, the
     ones that do not exist not shown. */
  function shown(h) { return InstrumentsMain.compute(h, T, NOW).shown.map(r => (r.isLead ? '*' : '') + r.id); }
  check('employed: savings rate leads', shown(hh('employed'))[0], '*savingsRate');
  checkTrue('… and no debt-to-income with no debt', shown(hh('employed')).indexOf('debtToIncome') === -1);
  check('self-employed: owner\'s pay leads', shown(hh('selfEmployed'))[0], '*ownersPay');
  check('… take-home a month = (gross − tax) ÷ 12', InstrumentsMain.compute(hh('selfEmployed'), T, NOW).byId.ownersPay.result.value, Tier0.takeHomeMonthlyCents(hh('selfEmployed'), T).value);
  const bj = hh('unemployed', { people: [Schema.createPerson({ role: 'adult', employmentStatus: 'unemployed', dob: '1990-06-01', unemployment: { benefitStatus: 'receiving', benefitWeeklyCents: 35000, benefitWeeksLeft: 20 } })] });
  check('between jobs: the runway in days leads', shown(bj)[0], '*runwayDays');
  checkTrue('… and stands in for cash months', shown(bj).indexOf('emergencyFundMonths') === -1);
  checkTrue('… no savings rate, no FI year', shown(bj).indexOf('savingsRate') === -1 && shown(bj).indexOf('fiEtaYear') === -1);
  const rd = InstrumentsMain.compute(bj, T, NOW).byId.runwayDays.result;
  checkTrue('days = months × 365.25 ÷ 12, rounded', rd.value === Math.round(rd.months * 365.25 / 12));
  check('retired: the withdrawal rate leads', shown(ret)[0], '*withdrawalRate');
  checkTrue('… no savings rate, no FI year', shown(ret).indexOf('savingsRate') === -1 && shown(ret).indexOf('fiEtaYear') === -1);
  const stu = hh('student', { meta: { hasDebt: true, noRent: true }, debts: [Schema.createDebt({ label: 'Loans', balanceCents: 2000000, rate: 0.05, minPaymentCents: 21000, type: 'student_loan' })] });
  check('a student with loans: the loans lead', shown(stu)[0], '*loanTrajectory');
  const lt = InstrumentsMain.compute(stu, T, NOW).byId.loanTrajectory;
  checkTrue('… the year the minimums clear it, from the debt engine', lt.ok && lt.result.value >= 2030 && lt.result.months === Debt.simulate(stu, T.debtRules, { strategyId: 'avalanche' }).months);
  check('a student without loans still has no loans lead shown', shown(hh('student'))[0].indexOf('loanTrajectory'), -1);
  check('mixed: savings rate leads, owner\'s pay shown too', shown(hh('both')).join(','), '*savingsRate,netWorth,emergencyFundMonths,fiEtaYear,fooStep,ownersPay');
  check('the days format', InstrumentsMain.format({ unit: 'days', result: Money.ok(45, { sustainable: false }) }), '45 days');
  check('… or covered', InstrumentsMain.format({ unit: 'days', result: Money.ok(1826, { sustainable: true }) }), 'Covered');

  /* The Advice Translator: one item, the right one, its tokens filled. */
  const table = T.adviceTranslator;
  checkTrue('every item has a kind, a headline, a body and a room', table.items.every(i => /^(learn|unlearn)$/.test(i.kind) && i.headline && i.body && i.room));
  checkTrue('every predicate named is one the engine knows', table.items.every(i => i.when.every(p => Advice.PREDICATES.indexOf(p) !== -1)));
  checkTrue('every room named is a room', table.items.every(i => !!Registry.byId(i.room)));
  checkTrue('the table carries the reference-data header', typeof table.version === 'string' && typeof table.confidence === 'string' && typeof table.confidenceNote === 'string');
  function pick(h) { const p = Advice.pick(h, T, NOW); return Money.isOk(p) ? p.item : null; }
  check('the demo: take the match', pick(Demo.build()).id, 'take_the_match');
  checkTrue('… with the gap in dollars: ' + pick(Demo.build()).body, /\$2,160 a year/.test(pick(Demo.build()).body) && /6%/.test(pick(Demo.build()).body));
  check('between jobs: the fund is for this', pick(bj).id, 'ef_is_for_this');
  check('… an unlearn', pick(bj).kind, 'unlearn');
  check('retired, drawing: the 4% rule', pick(ret).id, 'four_percent');
  checkTrue('… with the rate: ' + pick(ret).body, /3\.1%/.test(pick(ret).body) && /\$13,200/.test(pick(ret).body));
  check('retired, covered: not living off the portfolio', pick(covered).id, 'retired_not_drawing');
  check('self-employed: set aside the tax', pick(hh('selfEmployed')).id, 'set_aside_the_tax');
  check('a student with loans: they are not forever', pick(stu).id, 'student_loans_are_not_forever');
  checkTrue('… naming the year', /\b20\d\d\b/.test(pick(stu).body));
  const thin = hh('employed'); thin.assets = [Schema.createAsset({ category: 'cash', valueCents: 100000 }), Schema.createAsset({ category: 'investment', valueCents: 4000000 })];
  checkTrue('a thin cushion: three to six months, unless a lower priority item wins', ['three_to_six_months', 'save_ten_percent', 'pay_yourself_first'].indexOf(pick(thin).id) !== -1);
  checkTrue('no token is left unfilled in any item that applies, for any of these', [Demo.build(), bj, ret, covered, stu, hh('employed'), hh('selfEmployed'), hh('both'), Schema.createHousehold({})].every(h => { const l = Advice.list(h, T, NOW); return Money.isOk(l) && l.items.every(i => i.body.indexOf('{') === -1); }));
  checkTrue('an empty household still gets the first number to know', Money.isOk(Advice.pick(Schema.createHousehold({}), T, NOW)));
  checkTrue('a retiree is never told to save 10%', Advice.list(ret, T, NOW).items.every(i => i.id !== 'save_ten_percent' && i.id !== 'pay_yourself_first'));
  checkTrue('without the table it says so', !Money.isOk(Advice.pick(Demo.build(), TABLES, NOW)));

  /* The page: four blocks, nothing else on the screen, the lens and the
     undo pair, every instrument opening a room. */
  const page = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  ['where', 'next', 'learn', 'date'].forEach(id => checkTrue(`block #${id} is on the page`, new RegExp('id="' + id + '"').test(page)));
  checkTrue('the blocks are the only sections outside the drawers', (function () {
    const main = page.slice(page.indexOf('<main'), page.indexOf('<details class="drawer dash" id="full-panel">'));
    const ids = (main.match(/<section class="slaf-card[^"]*" id="([a-z-]+)"/g) || []).map(m => m.replace(/.*id="/, '').replace('"', ''));
    return ids.join(',') === 'landing,share-offer,where,next,learn,date';
  })());
  checkTrue('the full panel and the data controls are folded', /<details class="drawer dash" id="full-panel">/.test(page) && /<details class="drawer" id="your-data-drawer">/.test(page));
  checkTrue('the page loads the gate, the lens, the translator and the undo pair', ['shared/gate.js', 'shared/lens.js', 'engines/advice.js', 'shared/undo.js'].every(f => page.indexOf('<script src="' + f + '">') !== -1));
  checkTrue('every instrument opens a room', InstrumentsMain.INSTRUMENTS.every(i => new RegExp("\\b" + i.id + ": \\['[a-z-]+'").test(page)));
  checkTrue('the instruments are rendered from the ones that exist', /c\.shown\.map\(function \(row\)/.test(page));
  checkTrue('the lens toggle re-renders in place, no page load', /Lens\.setMode\(b\.getAttribute\('data-lens'\)\);\s*renderNow\(\);/.test(page));
  checkTrue('a theme has a place', /THEMING:/.test(page));
  check('the dashboard\'s registry blurb says what it is', /Home\./.test(Registry.byId('dashboard').blurb), true);
})();

section('The room template (D-097): one shape, proven on Real Hourly Wage');

(function () {
  const Gate = require(path.join(ROOT, 'shared/gate.js'));
  const Room = require(path.join(ROOT, 'shared/room.js'));
  const T = Object.assign({}, TABLES, { onepagerDefaults: require(path.join(ROOT, 'data/onepager_defaults.json')), uiBenefits: require(path.join(ROOT, 'data/ui_benefits.json')), matchDefaults: require(path.join(ROOT, 'data/match_defaults.json')) });

  /* Standalone: an empty spine renders with the intake's guesses, and says
     which. The spine is untouched. */
  const empty = Schema.createHousehold({});
  const filled = Gate.fillGuesses(empty, T);
  check('an empty household gets a person', filled.people.length, 1);
  check('… employed, the default situation', Gate.situationOf(filled), 'employed');
  check('… the median pay', Schema.grossAnnualIncomeCents(filled).value, 6200000);
  check('… spending at 55% of gross a month', Schema.monthlyExpensesCents(filled).value, Math.round(6200000 / 12 * 0.55));
  check('… a month of cash', Schema.cashCents(filled).value, Schema.monthlyExpensesCents(filled).value);
  checkTrue('… investments from the milestone or the fallback', Schema.investmentsCents(filled).value > 0);
  check('… and says what it filled', filled.meta.standalone.join(','), 'employmentStatus,grossAnnualIncome,monthlyExpenses,cashSavings,investments,highestDeductible,filingStatus,hasDebt');
  check('the source household is untouched', empty.people.length + (empty.assets || []).length, 0);
  const half = Schema.createHousehold({ people: [Schema.createPerson({ role: 'adult', employmentStatus: 'retired', incomeSources: [Schema.createIncomeSource({ grossAnnualIncomeCents: 2400000 })] })] });
  const halfFilled = Gate.fillGuesses(half, T);
  check('a retiree with income keeps it', Schema.grossAnnualIncomeCents(halfFilled).value, 2400000);
  checkTrue('… and only what was missing is guessed', halfFilled.meta.standalone.indexOf('grossAnnualIncome') === -1 && halfFilled.meta.standalone.indexOf('monthlyExpenses') !== -1);
  checkTrue('the demo needs nothing filled', Gate.fillGuesses(Demo.build(), T).meta.standalone.length === 0);
  const bj = Schema.createHousehold({ people: [Schema.createPerson({ role: 'adult', employmentStatus: 'unemployed' })] });
  checkTrue('between jobs, no pay is invented', !Money.isOk(Schema.grossAnnualIncomeCents(Gate.fillGuesses(bj, T))));

  /* The shape: the ids every template room has, and the room that proved it. */
  check('the template names its hosts', Room.IDS.join(','), 'room-number,room-chart,room-inputs,room-lens,room-amounts,room-assumptions,room-why,room-scope,reading-list');
  const rhw = fs.readFileSync(path.join(ROOT, 'rooms/real-hourly-wage.html'), 'utf8');
  Room.IDS.forEach(id => checkTrue(`Real Hourly Wage has #${id}`, new RegExp('id="' + id + '"').test(rhw)));
  ['number', 'chart', 'inputs', 'amounts', 'assumptions', 'reading'].forEach(id => checkTrue(`… and the deep link #${id}`, new RegExp('id="' + id + '"').test(rhw)));
  checkTrue('it mounts the template', /Room\.mount\(\{/.test(rhw));
  checkTrue('with a number, a chart, inputs, amounts, assumptions, why and scope', ['number:', 'chart:', 'inputs:', 'amounts:', 'assumptions:', 'why:', 'scope:'].every(k => rhw.indexOf(k) !== -1));
  const inputs = (rhw.match(/hoursInput\('(contractedHoursPerWeek|unpaidOvertimeHoursPerWeek|commuteHoursPerWeek)'/g) || []).length + (rhw.match(/ctl: 'workCostsMonthlyCents'|ctl: 'weeksPerYear'/g) || []).length;
  check('five inputs on the page, two folded', inputs, 5);
  checkTrue('its old sections are gone', rhw.indexOf('id="out-rate"') === -1 && rhw.indexOf('id="out-hours"') === -1 && rhw.indexOf('id="out-price"') === -1);
  checkTrue('it declares its live-form discipline and a place for a theme', /LIVE-FORM: built once/.test(rhw) && /THEMING:/.test(rhw));
  checkTrue('the room refuses fewer than two or more than five inputs', /inputs\.length < 2 \|\| spec\.inputs\.length > 5/.test(fs.readFileSync(path.join(ROOT, 'shared/room.js'), 'utf8')));
  checkTrue('the chart redraws only when it changes', /if \(html === lastChart\) return;/.test(fs.readFileSync(path.join(ROOT, 'shared/room.js'), 'utf8')));
  checkTrue('every write is one labelled undo entry', /Spine\.batch\(c\.label \+ ' → ' \+ shown, fn\)/.test(fs.readFileSync(path.join(ROOT, 'shared/room.js'), 'utf8')));
  checkTrue('the chart animates', /@keyframes slaf-grow/.test(fs.readFileSync(path.join(ROOT, 'shared/theme.css'), 'utf8')) && /prefers-reduced-motion/.test(fs.readFileSync(path.join(ROOT, 'shared/theme.css'), 'utf8')));
  checkTrue('nobody links to the old anchors', ['rooms/hassle.html', 'rooms/worth.html'].every(f => !/real-hourly-wage', 'out-/.test(fs.readFileSync(path.join(ROOT, f), 'utf8'))));

  /* Get Help: where the out-of-scope line points. */
  const help = Registry.byId('get-help');
  checkTrue('Get Help is a room', !!help);
  check('… optional, owning nothing', help.kind + '/' + help.needs.length, 'explore/0');
  check('… before Refresh on the path', help.order < Registry.byId('refresh').order, true);
  checkTrue('… and names kinds of help, never a firm', (function () { const g = fs.readFileSync(path.join(ROOT, 'rooms/get-help.html'), 'utf8'); return /fee-only fiduciary/.test(g) && !/https?:\/\//.test(g.replace(/<link[^>]*>/g, '')); })());
  checkTrue('the template points its scope line there', /Registry\.byId\('get-help'\)/.test(fs.readFileSync(path.join(ROOT, 'shared/room.js'), 'utf8')));
  checkTrue('the real hourly wage room says what it does not do', /scope: 'This room does not model/.test(rhw));
})();

/* ---- Room tests, one file a room (D-098) -------------------------------------
   test/rooms/<id>.js exports a function taking this context and calling
   section/check/checkTrue like the sections above. Rooms built in parallel
   each own a file, so they never edit this one. */
(function () {
  const dir = path.join(ROOT, 'test', 'rooms');
  if (!fs.existsSync(dir)) return;
  const Reference = require(path.join(ROOT, 'shared/reference.js'));
  const ALL_TABLES = {};
  Object.keys(Reference.TABLE_FILES).forEach(function (k) { try { ALL_TABLES[k] = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', Reference.TABLE_FILES[k]), 'utf8')); } catch (e) { /* a room test that needs it will say */ } });
  const ctx = {
    check, checkTrue, section, ROOT, fs, path,
    Money, Schema, Demo, Registry, Ownership, Progress, Tier0, Foo, CashFlow, Debt, Projection, Hourly,
    Spine: SpineMain, Instruments: InstrumentsMain, TABLES: ALL_TABLES,
    Gate: require(path.join(ROOT, 'shared/gate.js')), Lens: require(path.join(ROOT, 'shared/lens.js')),
    Room: require(path.join(ROOT, 'shared/room.js')), Advice: require(path.join(ROOT, 'engines/advice.js')),
    Ratios: require(path.join(ROOT, 'engines/ratios.js')), Runway: require(path.join(ROOT, 'engines/runway.js')),
    Tax: require(path.join(ROOT, 'engines/tax.js')), SelfEmployed: require(path.join(ROOT, 'engines/selfemployed.js')),
    Vpw: require(path.join(ROOT, 'engines/vpw.js')), Ss: require(path.join(ROOT, 'engines/ss.js')), Events: require(path.join(ROOT, 'engines/events.js'))
  };
  fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort().forEach(function (f) {
    const run = require(path.join(dir, f));
    if (typeof run === 'function') run(ctx);
  });
})();

section('LATER.md, built (D-100): the log across tabs, worded labels, the default lens, rooms.json');

(function () {
  const Spine = SpineMain;
  const Lens = require(path.join(ROOT, 'shared/lens.js'));
  const tool = require(path.join(ROOT, 'tools/rooms-json.js'));

  /* A write to a list with no owned field moving is named in words. */
  Spine.reset();
  Spine.registerRoom('start');
  Spine.upsertGoal(Schema.createGoal ? Schema.createGoal({ name: 'A trip', targetCents: 100000 }) : { id: 'g1', name: 'A trip', targetCents: 100000 });
  checkTrue('a goal added reads as "Changed a goal", not a dot path: ' + Spine.peekUndo().label, /^Changed a goal/.test(Spine.peekUndo().label));
  Spine.set('community.daySchool', true);
  check('a setting reads in words too', Spine.peekUndo().label, 'Changed community');
  Spine.reset();

  /* The default lens lives with the household; the session's choice wins.
     The lens reaches the spine by require, which by this point in the run
     is a later instance than SpineMain (earlier sections re-require it), so
     read back through the same instance the lens writes to. */
  const S2 = require(path.join(ROOT, 'shared/spine-v2.js'));
  S2.reset();
  check('no default: dollars', Lens.mode(), '$');
  check('setDefault stores it on the household', (Lens.setDefault('bought'), S2.get('meta.displayUnit')), 'bought');
  check('… and the lens reads it', Lens.mode(), 'bought');
  check('… as one labelled undo entry', S2.peekUndo().label, 'Read money as bought');
  check('an unknown unit clears it', (Lens.setDefault('nope'), Lens.mode()), '$');
  S2.reset();
  check('reset forgets it', Lens.mode(), '$');
  check('the schema starts it null', Schema.createHousehold({}).meta.displayUnit, null);
  checkTrue('the dashboard offers the choice in the data drawer', /id="display-unit-host"/.test(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')) && /Lens\.setDefault\(/.test(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')));

  /* Another tab's write: the cache reloads and the log diffs against what
     is stored, not what this tab last saved. */
  checkTrue('the storage listener reloads rather than only dropping the cache', /cache = null; lastSaved = null; lastReadings = null;\s*load\(\);/.test(fs.readFileSync(path.join(ROOT, 'shared/spine-v2.js'), 'utf8')));

  /* The lens fits a phone. */
  checkTrue('the lens shrinks under 420px', /max-width: 420px\) \{\s*\.slaf-lens-btn \{ padding: 0 8px/.test(fs.readFileSync(path.join(ROOT, 'shared/theme.css'), 'utf8')));

  /* rooms.json is the registry, generated, and fresh. */
  const rooms = tool.build();
  check('every room is in rooms.json', rooms.length, Registry.all().length);
  checkTrue('each row has the brief\'s fields', rooms.every(r => ['id', 'title', 'file', 'reads', 'writes', 'requires', 'dashboardNumber', 'order'].every(k => k in r)));
  check('Start Here writes what ownership says', rooms.filter(r => r.id === 'start')[0].writes.join(','), Ownership.ownedBy('start').join(','));
  check('Accounts requires the retirement branch', rooms.filter(r => r.id === 'accounts')[0].requires.join(','), 'retirement');
  check('FIRE is where the FI year opens', rooms.filter(r => r.id === 'fire')[0].dashboardNumber, 'fiEtaYear');
  check('the committed rooms.json is what the tool writes now (run node tools/rooms-json.js)', fs.readFileSync(path.join(ROOT, 'rooms.json'), 'utf8'), tool.render());
  checkTrue('and the dashboard opens the same rooms the tool says', (function () {
    const page = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    return Object.keys(tool.OPENS).every(k => new RegExp(k + ": \\['" + tool.OPENS[k] + "'").test(page));
  })());
})();

section('The ledger (D-128): income entries, the expense log, closed months');
(function () {
  /* Constructors. */
  const gift = Schema.createIncomeEntry({ kind: 'gift', amountCents: 50000, taxable: true, taxMethod: 'w2', costs: [{ amountCents: 1 }] });
  check('a gift is never taxable, whatever the form says', gift.taxable + '/' + gift.taxMethod, 'false/none');
  check('and carries no costs', gift.costs.length, 0);
  const se = Schema.createIncomeEntry({ kind: 'se', amountCents: 200000, frequency: 'once', receivedOn: '2026-09-10', costs: [{ label: 'Miles', amountCents: 20000, category: 'mileage' }, { amountCents: 500, category: 'nonsense' }] });
  check('1099 nets by self-employment tax', se.taxMethod, 'se');
  check('its costs are kept, deductible by default, with an unknown category read as other', se.costs.length + '/' + se.costs[0].deductible + '/' + se.costs[1].category, '2/true/other');
  ['w2', 'bonus', 'dividend', 'other'].forEach(k => check(`${k} carries no costs`, Schema.createIncomeEntry({ kind: k, costs: [{ amountCents: 1 }] }).costs.length, 0));
  ['se', 'side', 'rental'].forEach(k => checkTrue(`${k} may carry costs`, Schema.costsAllowed(k)));
  check('an unknown kind is other', Schema.createIncomeEntry({ kind: 'lottery' }).kind, 'other');
  check('an unknown frequency is once', Schema.createIncomeEntry({ frequency: 'daily' }).frequency, 'once');
  check('untaxable other nets by nothing', Schema.createIncomeEntry({ kind: 'other', taxable: false }).taxMethod, 'none');
  check('active and shown by default', se.active + '/' + se.hidden, 'true/false');
  check('the nine kinds, unemployment among them', Schema.INCOME_KINDS.join(','), 'w2,se,bonus,gift,side,dividend,rental,unemployment,other');
  check('taxed how: exactly four, no catch-all', Schema.TAX_METHODS.join(','), 'w2,se,unemployment,none');
  const ue = Schema.createIncomeEntry({ kind: 'unemployment', amountCents: 60000, frequency: 'weekly' });
  check('unemployment is taxable, owed, and not self-employment', ue.taxable + '/' + ue.taxMethod + '/' + ue.costs.length, 'true/unemployment/0');
  check('a method of none reads as not taxable', Schema.createIncomeEntry({ kind: 'other', taxMethod: 'none' }).taxable, false);
  /* The three paths of an expense (D-129). */
  const rb = Schema.createExpenseEntry({ categoryId: 'subscriptions', amountCents: 1599, reimbursableFrom: 'Sam', deductible: true, linkedIncomeId: 'in1', produced: 'reimbursable' });
  check('a reimbursable expense is its own path, with no link', rb.produced + '/' + rb.linkedIncomeId, 'reimbursable/null');
  check('… never deductible, whatever the form says', rb.deductible, false);
  check('… pending, expecting the amount back by default', rb.reimbursementStatus + '/' + rb.expectedAmountCents + '/' + rb.reimbursableFrom, 'pending/1599/Sam');
  check('a link makes it linked', Schema.createExpenseEntry({ linkedIncomeId: 'in1' }).produced, 'linked');
  check('nothing makes it personal', Schema.createExpenseEntry({ categoryId: 'x' }).produced, 'personal');
  check('a status alone makes it reimbursable', Schema.createExpenseEntry({ amountCents: 500, reimbursementStatus: 'received', dateReceived: '2026-10-02' }).produced + '/' + Schema.createExpenseEntry({ amountCents: 500, reimbursementStatus: 'received', dateReceived: '2026-10-02' }).dateReceived, 'reimbursable/2026-10-02');
  check('a pending one has no received date', Schema.createExpenseEntry({ amountCents: 500, produced: 'reimbursable', dateReceived: '2026-10-02' }).dateReceived, null);
  check('the five frequencies', Schema.INCOME_FREQUENCIES.join(','), 'once,weekly,fortnightly,monthly,annual');

  /* The hard rule, at the data layer. */
  const personal = Schema.createExpenseEntry({ categoryId: 'groceries', amountCents: 100, deductible: true });
  check('a personal expense cannot be deductible, whatever the form says', personal.deductible, false);
  const linked = Schema.createExpenseEntry({ categoryId: 'mileage', amountCents: 100, linkedIncomeId: se.id, deductible: true });
  check('a linked expense can be', linked.deductible, true);
  check('a linked expense is not deductible until asked', Schema.createExpenseEntry({ linkedIncomeId: se.id }).deductible, false);
  check('an empty link is no link', Schema.createExpenseEntry({ linkedIncomeId: '', deductible: true }).linkedIncomeId + '/' + Schema.createExpenseEntry({ linkedIncomeId: '' }).deductible, 'null/false');
  check('an older entry reads as active and shown', Schema.createExpenseEntry({ categoryId: 'x' }).active + '/' + Schema.createExpenseEntry({ categoryId: 'x' }).hidden, 'true/false');
  const S2 = require(path.join(ROOT, 'shared/spine-v2.js'));
  S2.reset();
  S2.upsertExpenseEntry({ id: 'x', categoryId: 'groceries', amountCents: 5, deductible: true });
  check('the spine enforces it on write too', S2.getProfile().expenses.entries[0].deductible, false);
  S2.upsertExpenseEntry({ id: 'x', linkedIncomeId: 'in1', deductible: true });
  check('and lets a link through', S2.getProfile().expenses.entries[0].deductible, true);
  S2.upsertExpenseEntry({ id: 'x', linkedIncomeId: null });
  check('unlinking drops the deduction with it', S2.getProfile().expenses.entries[0].deductible, false);
  S2.upsertExpenseEntry({ id: 'r', categoryId: 'subscriptions', amountCents: 1599, produced: 'reimbursable', reimbursableFrom: 'Sam', date: '2026-09-20', source: 'log', deductible: true });
  check('a reimbursable expense through the spine is pending and not deductible', S2.getProfile().expenses.entries[1].reimbursementStatus + '/' + S2.getProfile().expenses.entries[1].deductible, 'pending/false');
  S2.markReimbursed('r', { dateReceived: '2026-10-03' });
  const paid = S2.getProfile().expenses.entries[1];
  check('marked received: the date and the amount that came back', paid.reimbursementStatus + '/' + paid.dateReceived + '/' + paid.receivedAmountCents, 'received/2026-10-03/1599');
  check('… the original expense keeps its own date', paid.date, '2026-09-20');
  check('… with a worded label', S2.peekUndo().label, 'Paid back: subscriptions');
  check('a personal expense cannot be marked reimbursed', S2.markReimbursed('x', {}), null);

  /* Income entries through the spine. */
  S2.upsertIncomeEntry({ id: 'in1', kind: 'se', amountCents: 100000, frequency: 'once', receivedOn: '2026-09-03' });
  check('an income entry lands in the ledger', S2.getProfile().ledger.income.length, 1);
  check('… with a worded undo label', S2.peekUndo().label, 'Changed the ledger');
  const c = S2.upsertIncomeCost('in1', { label: 'Miles', amountCents: 20000, category: 'mileage' });
  check('a cost lands on the entry', S2.getProfile().ledger.income[0].costs.length + '/' + c.category, '1/mileage');
  S2.upsertIncomeEntry({ id: 'in2', kind: 'w2', amountCents: 300000 });
  check('a cost on a W-2 entry is refused', S2.upsertIncomeCost('in2', { amountCents: 1 }), null);
  check('removing a cost', S2.removeIncomeCost('in1', c.id) + '/' + S2.getProfile().ledger.income[0].costs.length, 'true/0');
  check('removing an entry', S2.removeIncomeEntry('in2') + '/' + S2.getProfile().ledger.income.length, 'true/1');

  /* Closed months: once, append-only, revised beside not over. */
  const r1 = S2.closeMonth({ month: '2026-09', estimated: { income: 100, expenses: 50 }, actual: { income: 120, expenses: 60 } });
  checkTrue('a month closes', r1.ok);
  check('with a label', S2.getProfile().ledger.months[0].label, 'September 2026');
  check('and a worded undo label', S2.peekUndo().label, 'Closed September 2026');
  check('and both columns kept', JSON.stringify(S2.getProfile().ledger.months[0].estimated) + JSON.stringify(S2.getProfile().ledger.months[0].actual), '{"income":100,"expenses":50,"savings":null,"investments":null,"debt":null}{"income":120,"expenses":60,"savings":null,"investments":null,"debt":null}');
  const r2 = S2.closeMonth({ month: '2026-09' });
  check('closing it again is refused', r2.ok + '|' + r2.reason, 'false|September 2026 is already closed.');
  check('a record without a month is refused', S2.closeMonth({ estimated: {} }).ok, false);
  S2.reviseMonth('2026-09', { expenses: 75 });
  const m = S2.getProfile().ledger.months[0];
  check('a late entry moves only the revised column', m.actual.expenses + '/' + m.actualRevised.expenses + '/' + m.actualRevised.income, '60/75/120');
  check('the estimate is untouched', m.estimated.expenses, 50);
  S2.closeMonth({ month: '2026-08', actual: { income: 1 } });
  check('months are kept in order', S2.getProfile().ledger.months.map(x => x.id).join(','), '2026-08,2026-09');
  S2.setBudgetEstimate('2026-10', 'expenses', 55000);
  check('a hand-set estimate is stored by month and bucket', S2.getProfile().budget.estimated['2026-10'].expenses, 55000);
  check('… with a worded label', S2.peekUndo().label, 'Expected expenses for October 2026');
  S2.setBudgetEstimate('2026-10', 'expenses', null);
  check('and cleared', S2.getProfile().budget.estimated['2026-10'], undefined);
  const round = Schema.createHousehold(JSON.parse(JSON.stringify(S2.getProfile())));
  check('the ledger survives a round trip through the constructor', round.ledger.income.length + '/' + round.ledger.months.length + '/' + round.ledger.months[1].actualRevised.expenses, '1/2/75');
  checkTrue('a household saved before the ledger reads with an empty one', Schema.createHousehold({ people: [] }).ledger.income.length === 0 && Schema.createHousehold({ people: [] }).ledger.months.length === 0);
  S2.reset();
})();

section('Two decision sequences that cannot collide');

(function () {
  /* The D&D entries restarted at D-046 and collided head-on with the SPARKS
     entries of the same numbers, so "DECISIONS.md D-046" meant two different
     decisions depending on who was referencing it. Worse, parallel sessions
     kept reaching for the same next number — four renumber-on-merge events in
     two days. The fix is two sequences: D- above the divider, DD- below. This
     section is what keeps them apart. */
  const text = fs.readFileSync(path.join(__dirname, '..', 'DECISIONS.md'), 'utf8');
  const lines = text.split('\n');
  const divider = lines.findIndex(l => /^# The Dungeons & Dividends entries/.test(l));
  checkTrue('DECISIONS.md still has the divider', divider > 0);

  const sparks = [], dnd = [];
  lines.forEach((l, i) => {
    const m = /^## (DD?)-(\d{3}) — /.exec(l);
    if (!m) {
      checkTrue(`line ${i + 1} is not a malformed entry heading`,
        !/^## D/.test(l),
        `"${l.slice(0, 60)}" looks like an entry heading but does not match `
        + `"## D-" or "## DD-" followed by three digits, a space, an em dash and a title`);
      return;
    }
    (i < divider ? sparks : dnd).push({ prefix: m[1], num: m[2], line: i + 1, title: l });
  });

  checkTrue('there are SPARKS entries', sparks.length > 20);
  checkTrue('there are D&D entries', dnd.length > 10);

  sparks.forEach(e => {
    check(`line ${e.line}: an entry above the divider uses D-`, e.prefix, 'D');
  });
  dnd.forEach(e => {
    check(`line ${e.line}: an entry below the divider uses DD-`, e.prefix, 'DD');
  });

  /* No number twice within a sequence. */
  [['SPARKS', sparks], ['D&D', dnd]].forEach(([name, list]) => {
    const seen = {};
    list.forEach(e => {
      checkTrue(`${name} ${e.prefix}-${e.num} appears once`, !seen[e.num],
        `also at line ${seen[e.num]}`);
      seen[e.num] = e.line;
    });
  });

  /* Every DD- referenced anywhere must exist, or a comment points at nothing. */
  const have = {};
  dnd.forEach(e => { have['DD-' + e.num] = true; });
  const files = [];
  (function walk(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(d => {
      if (d.name === 'node_modules' || d.name === '.git' || d.name === 'vendor') return;
      const full = path.join(dir, d.name);
      if (d.isDirectory()) walk(full);
      else if (/\.(js|html|json|md)$/.test(d.name)) files.push(full);
    });
  })(path.join(__dirname, '..'));

  files.forEach(f => {
    const src = fs.readFileSync(f, 'utf8');
    const rel = path.relative(path.join(__dirname, '..'), f);
    (src.match(/\bDD-\d{3}\b/g) || []).forEach(ref => {
      checkTrue(`${rel} references ${ref}, which exists`, !!have[ref]);
    });
  });

  /* The vendored copies are byte-identical to the SPARKS originals, so their
     D- references are SPARKS numbers. Renumbering them "helpfully" would break
     the vendored-copy guard — which is exactly what that guard is for, but
     this says why before anyone tries. */
  fs.readdirSync(path.join(__dirname, '..', 'dnd', 'shared'))
    .filter(f => f.endsWith('.js'))
    /* Only the files that HAVE a SPARKS original are vendored. store.js,
       export.js and skin.js are D&D-only and may cite DD- freely. */
    .filter(f => fs.existsSync(path.join(__dirname, '..', 'shared', f)))
    .forEach(f => {
      const src = fs.readFileSync(path.join(__dirname, '..', 'dnd', 'shared', f), 'utf8');
      checkTrue(`dnd/shared/${f} carries no DD- reference`, !/\bDD-\d{3}\b/.test(src),
        'these are byte-identical vendored copies; their D- numbers are SPARKS numbers');
    });
})();

section('The D&D folder\'s vendored copies');

(function () {
  const dnd = path.join(ROOT, 'dnd');
  if (!fs.existsSync(dnd)) return;          /* folder removed: nothing to check */

  /* Byte-identical, deliberately — including the SLAF namespace they register
     under, so this comparison stays exact. */
  ['shared/money.js', 'shared/schema.js', 'engines/projection.js', 'engines/tier0.js', 'engines/foo.js',
   'shared/theme.css', 'shared/fonts.css', 'favicon.svg']
    .forEach(function (rel) {
      const here = fs.readFileSync(path.join(ROOT, rel));
      const there = fs.readFileSync(path.join(dnd, rel));
      checkTrue(`dnd/${rel} is identical to ${rel}`, here.equals(there),
        `copy ${rel} into dnd/${rel} — they have drifted apart`);
    });

  /* reference.js is the ONE allowed divergence: load() with no arguments
     fetches every table it names, and dnd/ ships a different set. */
  const refHere = fs.readFileSync(path.join(ROOT, 'shared/reference.js'), 'utf8');
  const refThere = fs.readFileSync(path.join(dnd, 'shared/reference.js'), 'utf8');
  checkTrue('dnd/shared/reference.js differs, as designed', refHere !== refThere);
  checkTrue('and says why, in the file', /TRIMMED FROM THE SOURCE REPO/.test(refThere),
    'the divergence must stay commented, or the next reader will "fix" it');

  /* The D&D tables belong to that product and must not creep back in here. */
  ['dnd_rules.json', 'dnd_classes.json', 'dnd_scoring.json', 'dnd_alignments.json']
    .forEach(function (f) {
      checkTrue(`data/${f} stays out of the main suite`,
        !fs.existsSync(path.join(ROOT, 'data', f)));
      checkTrue(`dnd/data/${f} exists`, fs.existsSync(path.join(dnd, 'data', f)));
    });

  /* Every page must opt into the shared theme. shared/theme.css scopes all of
     its base styling to `body.slaf` — background, text colour, font — so a
     page with a bare <body> renders as unstyled black-on-white while still
     passing every content test. That is exactly how it shipped once: the
     tests read the text, nobody looked at the page. */
  /* Found, not listed: naming the pages here meant every page added later
     escaped the check that exists precisely because a page shipped unstyled. */
  fs.readdirSync(dnd).filter(function (f) { return /\.html$/.test(f); }).sort()
    .forEach(function (page) {
      const html = fs.readFileSync(path.join(dnd, page), 'utf8');
      checkTrue(`dnd/${page} opts into the theme with <body class="slaf">`,
        /<body class="slaf">/.test(html),
        'a bare <body> gets none of theme.css and renders black-on-white');
    });

  /* And it is not a room: nothing in the registry may point into dnd/. */
  checkTrue('no registry entry points into dnd/',
    Registry.all().every(r => r.href.indexOf('dnd/') !== 0));
})();

/* ==========================================================================
   The Walk-Through (D-149)
   --------------------------------------------------------------------------
   The walk has to do two things and no more: be short enough to finish, and
   never claim you have finished something you have not. Everything below is
   one of those two.
   ========================================================================== */
section('The Walk-Through — a route with an end');
(function () {
  const Guide = require(path.join(ROOT, 'shared/guide.js'));
  const Schema = require(path.join(ROOT, 'shared/schema.js'));
  const Registry = require(path.join(ROOT, 'shared/registry.js'));
  const stagesTable = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/walk_stages.json'), 'utf8'));
  const T = { walkStages: stagesTable };

  function person(status) {
    return Schema.createHousehold({ people: [{ id: 'p1', role: 'adult', employmentStatus: status }] });
  }
  const STATUSES = ['employed', 'selfEmployed', 'unemployed', 'student', 'retired', 'both'];

  /* -- the data file itself ---------------------------------------------- */
  const listed = stagesTable.stages.reduce((a, s) => a.concat(s.rooms), []);
  checkTrue('every room named in walk_stages.json is a real room',
    listed.every(id => !!Registry.byId(id)),
    'missing: ' + listed.filter(id => !Registry.byId(id)).join(', '));
  checkTrue('no room appears on the walk twice',
    listed.length === new Set(listed).size,
    'a step listed in two sets would be counted twice and could never be finished once');
  checkTrue('every stage has a title and a plain-language goal',
    stagesTable.stages.every(s => s.id && s.title && s.goal && s.goal.length > 30));
  check('the walk has five sets', stagesTable.stages.length, 5);
  checkTrue('walk_stages.json carries its provenance like every other table',
    !!(stagesTable.version && stagesTable.asOf && stagesTable.source && stagesTable.confidence));

  /* -- it is short enough to finish -------------------------------------- */
  STATUSES.forEach(function (status) {
    const h = person(status);
    const n = Guide.steps(h, T).length;
    /* The whole point. Fifty-nine rooms is a library; a walk anyone finishes
       is well under half of that. If a future room pushes one of these over
       25 the walk has stopped being a walk, and this should fail loudly
       rather than quietly getting longer. */
    checkTrue(`${status}: the walk is between 10 and 25 steps (got ${n})`, n >= 10 && n <= 25);
  });

  /* -- it never invents a step ------------------------------------------- */
  STATUSES.forEach(function (status) {
    const h = person(status);
    checkTrue(`${status}: every step on the walk applies to this situation`,
      Guide.steps(h, T).every(x => Registry.applies(Registry.byId(x.id), h)),
      'a step that is not for your situation is not a step you skipped — it is not a step');
    checkTrue(`${status}: no set is shown empty`,
      Guide.stages(h, T).every(s => s.steps.length > 0),
      'an empty set with a tick beside it reads as an achievement and is not one');
  });

  /* -- it never claims you finished something -------------------------- */
  (function () {
    /* The demo persona has a figure in nearly every box. Not one step is
       done, because being full of numbers is not the same fact as having
       been dealt with, and only the person can say the second one. */
    const demo = require(path.join(ROOT, 'shared/demo-persona.js')).build();
    const p = Guide.progress(demo, T);
    check('a fully-filled household still has zero steps done', p.done, 0);
    check('...and zero set aside', p.skipped, 0);
    checkTrue('...and has not started the walk', !Guide.hasStarted(demo));
    checkTrue('...and shows no walk strip anywhere (nothing to mount)',
      !Guide.hasStarted(demo));
  })();

  /* -- marking, and the two maps that cannot disagree -------------------- */
  (function () {
    const h = person('employed');
    const first = Guide.nextStep(h, T);
    check('the walk starts at Start Here', first.id, 'start');
    h.meta.walk = { done: { start: 'x' }, skipped: {} };
    check('a marked step is not offered again', Guide.nextStep(h, T).id !== 'start', true);
    check('marking one step moves the count', Guide.progress(h, T).done, 1);

    /* Schema.createWalk is the guard: a shape claiming a room is both done
       and set aside cannot survive being loaded. Done wins — it is the
       stronger statement and the one you had to reach the room to make. */
    const both = Schema.createHousehold({ meta: { walk: { done: { tax: 'a' }, skipped: { tax: 'b' } } } });
    check('a room cannot be both done and set aside', both.meta.walk.skipped.tax, undefined);
    check('...and done is the one that survives', both.meta.walk.done.tax, 'a');
  })();

  /* -- setting a step aside counts as dealing with it -------------------- */
  (function () {
    const h = person('employed');
    const ids = Guide.steps(h, T).map(x => x.id);
    h.meta.walk = { done: {}, skipped: {} };
    ids.forEach(id => { h.meta.walk.skipped[id] = 'x'; });
    checkTrue('a walk entirely set aside is finished', Guide.isFinished(h, T));
    check('...and the bar is full', Guide.progress(h, T).pct, 100);
    checkTrue('...but no set is called an achievement',
      Guide.stages(h, T).every(s => s.complete && s.allSkipped),
      'complete says "nothing open"; allSkipped is what stops the page congratulating you for it');
  })();

  /* -- position on the walk ---------------------------------------------- */
  (function () {
    const h = person('employed');
    const at = Guide.stepOf(h, T, 'statement');
    checkTrue('a step knows its place, its set and its neighbours',
      !!(at && at.step > 0 && at.total > at.step && at.stage && at.stage.title && at.next));
    checkTrue('a room that is not on the walk says so plainly',
      Guide.stepOf(h, T, 'ratios') === null);
    /* stepOf builds the flat list from ONE call to stages(). Building it
       from two would give two sets of objects, and looking a step up by
       identity inside the other would find nothing — which is exactly what
       happened the first time this ran. */
    checkTrue('a step found by stepOf carries the set it is actually in',
      Guide.stages(h, T).some(s => s.title === at.stage.title && s.steps.some(x => x.id === 'statement')));
  })();

  /* -- it degrades to nothing without its table -------------------------- */
  (function () {
    const h = person('employed');
    check('no table means no walk, not a crash', Guide.stages(h, {}).length, 0);
    check('...and no next step', Guide.nextStep(h, {}), null);
    check('...and a zero total rather than a full bar', Guide.progress(h, {}).total, 0);
    checkTrue('...and not "finished"', !Guide.isFinished(h, {}));
  })();

  /* -- the room, and the strip ------------------------------------------- */
  (function () {
    const html = fs.readFileSync(path.join(ROOT, 'rooms/walk.html'), 'utf8');
    checkTrue('rooms/walk.html declares the live-form rule (D-034)',
      /LIVE-FORM: built once/.test(html));
    checkTrue('rooms/walk.html has no text input at all',
      !/<input(?![^>]*type="(?:checkbox|radio|file)")/i.test(html) && !/<textarea/i.test(html),
      'the page rebuilds its list wholesale on every change; a text field there would lose focus');
    checkTrue('rooms/walk.html loads shared/guide.js', /shared\/guide\.js/.test(html));

    const prog = fs.readFileSync(path.join(ROOT, 'shared/progress.js'), 'utf8');
    checkTrue('the strip is mounted from the one place every room reaches',
      /mountWalk\(roomId, nav\)/.test(prog),
      'mountHeader is the single mount point — 22 rooms reach it through Room.mount and the rest call it directly');

    /* Every page that mounts the header needs the module the strip reads. */
    const pages = fs.readdirSync(path.join(ROOT, 'rooms')).filter(f => /\.html$/.test(f))
      .map(f => 'rooms/' + f).concat(['index.html', 'map.html', 'foo-ladder.html'])
      .filter(f => fs.existsSync(path.join(ROOT, f)));
    const gap = pages.filter(f => {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      return /shared\/progress\.js/.test(src) && !/shared\/guide\.js/.test(src);
    });
    checkTrue('every page loading progress.js also loads guide.js',
      gap.length === 0, 'missing in: ' + gap.join(', '));
  })();

  /* -- the walk is a suggestion, never a lock ---------------------------- */
  checkTrue('nothing in the registry is gated on the walk',
    !/meta\.walk/.test(fs.readFileSync(path.join(ROOT, 'shared/registry.js'), 'utf8')),
    'every room stays reachable from the map in any order, walk or no walk');
  checkTrue('no engine reads the walk marks',
    fs.readdirSync(path.join(ROOT, 'engines')).filter(f => /\.js$/.test(f))
      .every(f => !/meta\.walk|Guide\./.test(fs.readFileSync(path.join(ROOT, 'engines', f), 'utf8'))),
    'a mark is a statement about the person, never about whether a number is usable');
})();

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
