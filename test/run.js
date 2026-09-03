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
  seTax: require(path.join(ROOT, 'data/se_tax_2026.json'))
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
   10. Field ownership. Every shared number is editable in exactly one room,
   and is a working link everywhere else.
   ========================================================================== */

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
  /* Every table carries the version/as-of stamp SPEC.md §6 requires. */
  onDisk.forEach(function (file) {
    const t = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', file), 'utf8'));
    checkTrue(`data/${file} declares a version`, typeof t.version === 'string' && t.version.length > 0);
    checkTrue(`data/${file} declares an asOf date`, typeof t.asOf === 'string' && t.asOf.length > 0);
    checkTrue(`data/${file} names its source`, typeof t.source === 'string' && t.source.length > 0);
  });
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
