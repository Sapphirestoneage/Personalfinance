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
  liquidityBenchmarks: require(path.join(ROOT, 'data/liquidity_benchmarks.json')),
  values: require(path.join(ROOT, 'data/values.json')),
  hassleDefaults: require(path.join(ROOT, 'data/hassle_defaults.json')),
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
    Ownership.ownedBy('sleep-at-night').join(','), 'swanTarget');
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
    DemoPersona: 'shared/demo-persona.js',
    Tier0: 'engines/tier0.js', Foo: 'engines/foo.js',
    CashFlow: 'engines/cashflow.js', Debt: 'engines/debt.js',
    Fire: 'engines/fire.js', Projection: 'engines/projection.js',
    Hourly: 'engines/hourly.js', QuickMath: 'engines/quickmath.js',
    SelfEmployed: 'engines/selfemployed.js', Goals: 'engines/goals.js',
    Accounts: 'engines/accounts.js', Swan: 'engines/swan.js',
    Values: 'engines/values.js', Fulfillment: 'engines/fulfillment.js',
    Hassle: 'engines/hassle.js', SideHustle: 'engines/sidehustle.js'
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

  fs.readdirSync(path.join(ROOT, 'rooms')).filter(f => f.endsWith('.html')).forEach(function (file) {
    const html = fs.readFileSync(path.join(ROOT, 'rooms', file), 'utf8');
    const loaded = (html.match(/<script src="\.\.\/([^"]+)"><\/script>/g) || [])
      .map(t => t.replace(/.*\.\.\//, '').replace(/"><\/script>/, ''));
    const loadedSet = new Set(loaded);

    /* Everything the room's own inline script reaches for, plus everything
       those modules reach for, transitively. */
    const direct = loaded.filter(f => FILE_TO_GLOBAL[f]);
    const usedInline = Object.keys(GLOBAL_TO_FILE).filter(function (g) {
      return new RegExp('SLAF\\.' + g + '\\b').test(html) || new RegExp('\\b' + g + '\\.').test(html);
    }).map(g => GLOBAL_TO_FILE[g]).filter(Boolean);

    const required = closure(direct.concat(usedInline.filter(f => loadedSet.has(f))));
    const missing = Array.from(required).filter(f => !loadedSet.has(f));

    checkTrue(`rooms/${file} loads everything its modules need`,
      missing.length === 0,
      missing.length ? `missing: ${missing.join(', ')}` : '');
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
  fs.readdirSync(roomsDir).filter(f => f.endsWith('.html')).forEach(function (file) {
    const html = fs.readFileSync(path.join(roomsDir, file), 'utf8');

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
