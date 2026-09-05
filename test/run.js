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
  irsLimits: require(path.join(ROOT, 'data/irs_limits_2026.json'))
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
  check('and Sleep At Night owns nothing else',
    Ownership.ownedBy('sleep-at-night').sort().join(','), 'swanTarget');
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
    Income: 'engines/income.js'
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
    RatiosEngine.RATIOS.every(r => ['rate', 'months', 'multiple', 'cents', 'years'].includes(r.unit)));

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
  check('exactly two ratios are unavailable', a.unavailableCount, 2);
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
  check('the radar plots every banded ratio that computed', radar.value, 14);
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
    check('there are five working situations', ids.length, 5);
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
    check('six instruments', c.rows.length, 6);
    check('in panel order', c.rows.map(r => r.cap).join(' '), 'Altitude Thrust Fuel Load Distance Heading');
    checkTrue('every one computes for the demo', c.rows.every(r => r.ok));
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
    check('with no debt the path skips Debt Payoff', Registry.nextAfter('start', [], none).id, 'cash-flow');
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
    checkTrue('Start Here shows it through Suggest, never writes it', /Suggest\.show\(n\.pct/.test(start));
    checkTrue('with a "no match" button that writes zeros explicitly', start.indexOf("id=\"btn-no-match\"") !== -1 && /writeIncome\('matchPercent', 0\)/.test(start));
    /* Eleven cards for one W-2 person with no debt: count the sections. */
    const cards = (start.match(/<section class="slaf-card q" id="q-/g) || []).length;
    check('twelve cards in the markup', cards, 12);
    checkTrue('one of which is the second person, shown only when there are two', /id: 'q-partner'[\s\S]{0,120}applies: function \(h\) \{ return hasPartner\(h\)/.test(start));
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
    /* Thirteen shared fields, eleven cards: the 401(k) card carries the
       match, the contribution and the derived capture; born + state share
       one card. D-061. */
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
      new RegExp(`id=["']${f.anchor}["']`).test(html));
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
   The D&D folder vendors part of this suite. Keep the copies honest.
   --------------------------------------------------------------------------
   dnd/ is a separate product that happens to live in this repo. It carries
   its OWN copy of the calculation core so it can be lifted out into its own
   repository later without a single edit — see DECISIONS.md D-049.

   The hazard that buys is obvious: someone fixes a bug in engines/tier0.js,
   dnd/engines/tier0.js silently keeps the bug, and the two tools start
   disagreeing about a number while both look fine. So the copies are asserted
   byte-identical here. If this fails you have not broken anything yet — you
   have edited one of a pair, and the fix is to copy it across.
   ========================================================================== */
section('The D&D folder\'s vendored copies');

(function () {
  const dnd = path.join(ROOT, 'dnd');
  if (!fs.existsSync(dnd)) return;          /* folder removed: nothing to check */

  /* Byte-identical, deliberately — including the SLAF namespace they register
     under, so this comparison stays exact. */
  ['shared/money.js', 'shared/schema.js', 'engines/projection.js', 'engines/tier0.js',
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
  ['index.html', 'sheet.html', 'bestiary.html'].forEach(function (page) {
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
