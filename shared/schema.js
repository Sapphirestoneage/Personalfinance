/* ==========================================================================
   shared/schema.js — THE canonical household data model.
   --------------------------------------------------------------------------
   SPEC.md §3, §4. Read this before writing any tool. Do not invent field
   names; do not assume flat keys. Everything a room reads or writes lives
   somewhere in the household object described here.

   Root is a HOUSEHOLD, not a person:

     household = {
       schemaVersion, people[], filingStatus, state,
       assets[], debts[], expenses, assumptions, assumptionOverrides, meta
     }

   Ownership: every shared item carries `ownerIds` (an array). One id = owned
   individually. Two or more = jointly owned. There is no "individual" vs
   "joint" bucket. Income is the exception — a paycheck has exactly one
   earner — so an income source carries `personId`, not `ownerIds`.

   Units, locked (SPEC.md §4):
     • every …Cents field is INTEGER CENTS
     • every …Rate / …Percent field is a DECIMAL FRACTION (0.07 === 7%)
     • every expense figure is MONTHLY; every income figure is ANNUAL
     • null/undefined === "not entered"; 0 === "user entered zero"
   ========================================================================== */
(function (root, factory) {
  var Money = (typeof module === 'object' && module.exports)
    ? require('./money.js')
    : (root.SLAF && root.SLAF.Money);
  var api = factory(Money);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Schema = api; }
})(typeof self !== 'undefined' ? self : null, function (Money) {
  'use strict';

  var SCHEMA_VERSION = 2;

  /* ======================================================================
     System assumption defaults — SPEC.md §12.2 (RESOLVED: 7% return, 4% SWR)
     Assumption-class fields. Never inline these numbers in a formula; read
     them off the household so one setting is globally tunable.
     ====================================================================== */

  var WORK_DEFAULTS = { weeksPerYear: 48 };

  var ASSUMPTION_DEFAULTS = {
    /* The brief's two (D-094): a real return for the lens and the plan,
       inflation for anything that reads a nominal figure forward. */
    returnReal: 0.05,
    inflation: 0.03,
    expectedReturnRate: 0.07,   // nominal annual, decimal fraction
    swrRate: 0.04,             // safe withdrawal rate, decimal fraction
    /* Real discount rate for human capital — the present value of the pay
       still to come before the stop age. A planning assumption, overridable
       like the others. BRIEF §4.1, DECISIONS.md D-079. */
    humanCapitalDiscountRate: 0.02,
    /* What a home's equity is worth when you would have to sell in a hurry
       — the shadow runway counts it at this fraction. BRIEF §4.3, D-081. */
    homeEquityHaircut: 0.8,
    /* Deliberately NULL. A marginal rate depends on bracket, state and
       filing status, and this app has an EFFECTIVE-rate table, not a
       marginal one — deriving one from the other would be a fabricated
       number people act on (D-036). It is asked for once, in Where It Goes,
       and every room that needs it reads that answer. DECISIONS.md D-052. */
    marginalRate: null
  };

  /* ======================================================================
     Field dictionary — SPEC.md §4.
     One entry per field used by more than one tool. `class` is the data
     class from SPEC.md §3. This exists so a second tool cannot quietly
     invent `grossIncome` when the first already wrote `grossAnnualIncome`.
     ====================================================================== */

  var FIELDS = {
    'household.filingStatus':                    { class: 'raw',        unit: 'enum',    values: ['single', 'married_joint', 'married_separate', 'head_of_household'] },
    'household.state':                           { class: 'raw',        unit: 'usps',    note: '2-letter state code' },
    'household.capturingFullMatch':              { class: 'raw',        unit: 'bool',    note: 'null = not answered; needed by FOO step 2. DECISIONS.md D-008' },
    'household.dependents':                      { class: 'raw',        unit: 'list',    note: 'null = not asked; [] = nobody; else [{ age }]. Nobody: term life is not a gap. D-092, D-094' },
    'household.community.daySchool':             { class: 'raw',        unit: 'bool',    note: 'a day school in the picture; asked only when there are dependents. D-094' },
    'incomeSource.variableLowCents':             { class: 'raw',        unit: 'cents',   note: 'a low month and (variableHighCents) a high one, for variable income; owner\'s pay reads the low end. D-094' },
    'insurance.health.type':                     { class: 'raw',        unit: 'enum',    values: ['employer', 'marketplace', 'cobra', 'medicaid', 'parent', 'none'], note: 'with monthlyCents. D-094' },
    'estate.beneficiariesSet':                   { class: 'raw',        unit: 'bool',    note: 'with willExists and poaExists: three yes/no facts, null until asked. D-094' },
    'giving.pctOfIncome':                        { class: 'raw',        unit: 'rate',    note: 'annualTargetCents when typed over the share. D-094' },
    'assumptions.returnReal':                    { class: 'assumption', unit: 'rate',    default: 0.05, note: 'the real return the lens and the plan use. D-094' },
    'assumptions.inflation':                     { class: 'assumption', unit: 'rate',    default: 0.03, note: 'D-094' },
    'meta.undoStack':                            { class: 'raw',        unit: 'list',    note: 'the command log: { label, ts, changes[{ path, before, after }] }, capped at 100; redoStack likewise. D-094' },
    'household.oneOffs[].cents':                 { class: 'raw',        unit: 'cents',   note: 'a one-off coming, in (direction in) or out; `on` is the month. From the one-pager. D-094' },
    'person.unemployment.expectedSearchMonths':  { class: 'raw',        unit: 'months',  note: 'how long you expect the search to take; floorMonthlyCents is the bare-minimum month. Owned by Between Jobs. D-098' },
    'household.decumulation.stockShare':         { class: 'raw',        unit: 'ratio',   note: 'share of investments in stocks, for the VPW table; with plannedAnnualDrawCents and socialSecurityAt. Owned by Decumulation. D-098' },
    'household.tax.otherPreTaxAnnualCents':      { class: 'raw',        unit: 'cents',   note: 'pre-tax money beyond the workplace plan (HSA, traditional IRA), a year; withheldAnnualCents is what has been withheld. Owned by Tax. D-098' },
    'household.career.offer.grossAnnualCents':   { class: 'raw',        unit: 'cents',   note: 'an offer being weighed: with hoursPerWeek, commuteHoursPerWeek, workCostsMonthlyCents, signOnCents. Owned by Career Move. D-099' },
    'household.partner.splitMode':               { class: 'raw',        unit: 'enum',    values: ['equal', 'proportional', 'pooled'], note: 'how shared costs are split; sharedMonthlyCents is the shared month. Owned by Partner. D-099' },
    'household.kids.tuitionTargetCents':         { class: 'raw',        unit: 'cents',   note: 'a tuition target per child; tuitionSavedCents so far, tuitionMonthlyCents going in. Owned by Kids and Tuition. D-099' },
    'household.housing.priceCents':              { class: 'raw',        unit: 'cents',   note: 'a place being weighed: with rentMonthlyCents (what renting costs), downPct (0–1), rate (mortgage, decimal). Owned by Housing Decision. D-099' },
    'household.purchase.priceCents':             { class: 'raw',        unit: 'cents',   note: 'a big purchase: with monthsAway, financeRate (decimal, null = cash), label. Owned by Big Purchase. D-099' },
    'household.variableIncome.bufferMonths':     { class: 'raw',        unit: 'months',  note: 'months of the low-to-average gap held as a buffer. Owned by Variable Income. D-099' },
    'meta.guessed':                              { class: 'raw',        unit: 'map',     note: '{ fieldId: true } for figures the one-pager committed as guesses; cleared per field the moment a real number is written. D-094' },
    'meta.noRent':                               { class: 'raw',        unit: 'bool',    note: 'no rent to pay; lowers the spending guess. D-094' },
    'person.unemployment.benefitStatus':         { class: 'raw',        unit: 'enum',    values: ['receiving', 'applied', 'notApplied', 'ineligible'], note: 'between jobs: whether unemployment is coming. With benefitWeeklyCents, benefitWeeksLeft, severanceCents, lastGrossAnnualCents and since. Owned by Start Here. D-092' },
    'person.dob':                                { class: 'raw',        unit: 'iso-date' },
    'person.role':                               { class: 'raw',        unit: 'enum',    values: ['adult', 'child', 'dependent', 'other'] },
    'person.work.contractedHoursPerWeek':        { class: 'raw',        unit: 'hours',   period: 'weekly' },
    'person.work.unpaidOvertimeHoursPerWeek':    { class: 'raw',        unit: 'hours',   period: 'weekly' },
    'person.work.commuteHoursPerWeek':           { class: 'raw',        unit: 'hours',   period: 'weekly' },
    'person.work.prepHoursPerWeek':              { class: 'raw',        unit: 'hours',   period: 'weekly' },
    'person.work.decompressHoursPerWeek':        { class: 'raw',        unit: 'hours',   period: 'weekly' },
    'person.work.workCostsMonthlyCents':         { class: 'raw',        unit: 'cents',   period: 'monthly' },
    'person.work.weeksPerYear':                  { class: 'assumption', unit: 'weeks',   default: WORK_DEFAULTS.weeksPerYear },
    'computed.realHourlyWageCents':              { class: 'computed',   unit: 'cents',   note: 'per hour of life the job actually costs' },
    'person.employmentStatus':                   { class: 'raw',        unit: 'enum',    values: ['employed', 'selfEmployed', 'both', 'notWorking', 'retired'], note: 'null means not asked. Decides whether an employer match is even a question \u2014 see EMPLOYMENT_STATUSES and DECISIONS.md D-055' },
    'incomeSource.grossAnnualIncomeCents':       { class: 'raw',        unit: 'cents',   period: 'annual', note: 'THE annual figure every room reads. Derived from rateCents x frequency when those are set \u2014 see engines/income.js and DECISIONS.md D-047' },
    'incomeSource.frequency':                    { class: 'raw',        unit: 'enum',    values: ['annual', 'monthly', 'semimonthly', 'fortnightly', 'weekly', 'hourly'], note: 'how the person is actually paid; semimonthly is 24 a year and fortnightly is 26 \u2014 they are not the same' },
    'incomeSource.rateCents':                    { class: 'raw',        unit: 'cents',   note: 'pay at `frequency`. Null means the annual figure was entered directly' },
    'incomeSource.hoursPerWeek':                 { class: 'raw',        unit: 'hours',   period: 'weekly', note: 'hourly pay only' },
    'incomeSource.monthsWorked':                 { class: 'raw',        unit: 'months',  note: 'how much of the last 12 months this job covered; absent means all of it' },
    'incomeSource.ongoing':                      { class: 'raw',        unit: 'bool',    note: 'still the job \u2014 drives the run-rate figure beside the earned one' },
    'household.incomeBasis':                     { class: 'raw',        unit: 'enum',    values: ['earned', 'runRate'], note: 'which of the two annual figures feeds the model. DECISIONS.md D-047' },
    'retirement.contributionPercent':            { class: 'raw',        unit: 'percent', note: 'what you put into the workplace plan, as a % of salary. Owned by Where It Goes' },
    'retirement.rothContributedCents':           { class: 'raw',        unit: 'cents',   period: 'annual', note: 'into a Roth IRA so far this year' },
    'retirement.hsaContributedCents':            { class: 'raw',        unit: 'cents',   period: 'annual', note: 'into an HSA so far this year' },
    'retirement.onHdhp':                         { class: 'raw',        unit: 'bool',    note: 'high-deductible plan, so HSA-eligible' },
    'retirement.hsaFamilyPlan':                  { class: 'raw',        unit: 'bool',    note: 'family HSA coverage, which changes the limit' },
    'insurance.highestDeductibleCents':          { class: 'raw',        unit: 'cents',   note: 'the largest single deductible a cash cushion has to cover. Owned by Sleep At Night' },
    'assumptions.marginalRate':                  { class: 'assumption', unit: 'rate',    default: null, note: 'NO default \u2014 asked once, never derived from the effective-rate table' },
    'incomeSource.type':                         { class: 'raw',        unit: 'enum',    values: ['w2', '1099'] },
    'incomeSource.employerMatch.matchPercent':          { class: 'raw', unit: 'rate',    note: '0.5 === employer matches 50 cents on the dollar' },
    'incomeSource.employerMatch.matchCapPercentOfSalary': { class: 'raw', unit: 'rate',  note: '0.06 === capped at the first 6% of salary' },
    'asset.valueCents':                          { class: 'raw',        unit: 'cents' },
    'asset.taxCharacter':                        { class: 'raw',        unit: 'enum',    values: ['pretax', 'roth', 'taxable', 'hsa', '529', 'daf', 'cash', 'property', 'business', 'other', 'unknown'], note: 'how the account is taxed. null means not asked; unknown means the person entered only a total. BRIEF §3.1, D-061' },
    'meta.hasDebt':                              { class: 'raw',        unit: 'bool',    note: 'null not asked; false means "no debt" as an answer, which takes Debt Payoff off the path. D-061' },
    'asset.category':                            { class: 'raw',        unit: 'enum',    values: ['cash', 'investment', 'retirement', 'real_estate', 'vehicle', 'other'] },
    'asset.liquid':                              { class: 'raw',        unit: 'bool',    note: 'reachable this month. Kept for every reader that already uses it; written from `liquidity` when that is set (liquid === liquidity <= 2). D-066' },
    'asset.liquidity':                           { class: 'raw',        unit: 'enum',    values: [1, 2, 3, 4], note: '1 today · 2 within 30 days · 3 within 12 months · 4 cannot/will not sell. null = not rated; the access_rules default is then PROPOSED, never stored. D-066' },
    'asset.confidence':                          { class: 'raw',        unit: 'enum',    values: [1, 2, 3, 4], note: '1 guaranteed · 2 85%+ · 3 real but do not count on it · 4 probably zero. null = not rated and excluded from the weighted total. D-066' },
    'asset.costBasisCents':                      { class: 'raw',        unit: 'cents',   note: 'optional; what was paid in. For Roth it is the part reachable before 59½' },
    'asset.hassle':                              { class: 'raw',        unit: 'enum',    values: [1, 2, 3], note: '1 easy · 2 moderate · 3 annoying — for anything income-producing' },
    'asset.cashFlowMonthlyCents':                { class: 'raw',        unit: 'cents',   period: 'monthly', note: 'net monthly cash the asset throws off; null for one that does not' },
    'asset.accessAgeOverride':                   { class: 'raw',        unit: 'years',   note: 'overrides the access age derived from access_rules (e.g. a rule-of-55 plan). null = derived' },
    'futureIncome.monthlyCents':                 { class: 'raw',        unit: 'cents',   period: 'monthly', note: 'a pension, Social Security, an annuity, an inheritance you would rather not count. Owned by the Statement' },
    'futureIncome.confidence':                   { class: 'raw',        unit: 'enum',    values: [1, 2, 3, 4] },
    'property.rentMonthlyCents':                 { class: 'raw',        unit: 'cents',   period: 'monthly', note: 'gross rent. The value itself lives on the linked real_estate asset — one number, one owner' },
    'property.vacancyRate':                      { class: 'assumption', unit: 'rate',    default: 0.08, note: 'PROPOSED at 8%, a landlord convention; overridable per property' },
    'insurance.oopMaxCents':                     { class: 'raw',        unit: 'cents',   note: 'health out-of-pocket maximum. Owned by Sleep At Night' },
    'insurance.termLifeCents':                   { class: 'raw',        unit: 'cents',   note: 'term life cover in force' },
    'insurance.disabilityMonthlyCents':          { class: 'raw',        unit: 'cents',   period: 'monthly', note: 'long-term disability benefit' },
    'insurance.umbrella':                        { class: 'raw',        unit: 'bool',    note: 'an umbrella liability policy exists' },
    'allocation.stocks':                         { class: 'raw',        unit: 'rate',    note: 'target share; stocks + bonds + cash = 1. Owned by Where It Goes' },
    'allocation.rebalanceBand':                  { class: 'raw',        unit: 'rate',    note: 'how far a slice may drift before rebalancing, e.g. 0.05' },
    'targets.retireAge':                         { class: 'raw',        unit: 'years',   note: 'the age you intend to stop. Owned by FIRE' },
    'targets.coastAge':                          { class: 'raw',        unit: 'years',   note: 'the age the coast variant grows to. Owned by FIRE; replaces the unstored preview knob. D-066' },
    'incomeSource.hassle':                       { class: 'raw',        unit: 'enum',    values: [1, 2, 3], note: 'Return on Hassle applied to the job itself' },
    'scenario.diff':                             { class: 'raw',        unit: 'object',  note: 'a named, dated overlay consumed by the life-events engine (T6). Nothing reads it yet' },
    'debt.balanceCents':                         { class: 'raw',        unit: 'cents' },
    'debt.rate':                                 { class: 'raw',        unit: 'rate',    period: 'annual' },
    'debt.minPaymentCents':                      { class: 'raw',        unit: 'cents',   period: 'monthly' },
    'debt.type':                                 { class: 'raw',        unit: 'enum',    values: ['credit_card', 'student_loan', 'auto', 'mortgage', 'personal', 'medical', 'other'] },
    'debt.creditLimitCents':                     { class: 'raw',        unit: 'cents',   note: 'revolving debt only \u2014 the limit the balance is a share of. Owned by Debt Payoff. DECISIONS.md D-045' },
    'debt.promoEndsOn':                          { class: 'raw',        unit: 'iso-date', note: 'when a 0%/promotional rate ends. Null means the rate is not promotional' },
    'debt.postPromoRate':                        { class: 'raw',        unit: 'rate',    period: 'annual', note: 'the rate the balance reverts to when the promo ends' },
    'expenses.monthlyEssential.estimatedValueCents': { class: 'raw',    unit: 'cents',   period: 'monthly', source: 'estimated' },
    'expenses.monthlyEssential.trackedValueCents':   { class: 'raw',    unit: 'cents',   period: 'monthly', source: 'tracked' },
    'expenses.monthlyEssential.divergenceCents':     { class: 'computed', unit: 'cents', period: 'monthly', note: 'tracked − estimated; SPEC.md §12.3' },
    'expenses.entries[].categoryId':             { class: 'raw',        unit: 'enum',    note: 'an id from data/expense_categories.json' },
    'expenses.entries[].amountCents':            { class: 'raw',        unit: 'cents' },
    'expenses.entries[].period':                 { class: 'raw',        unit: 'enum',    values: ['monthly', 'once'] },
    'expenses.entries[].source':                 { class: 'raw',        unit: 'enum',    values: ['manual', 'imported', 'rerank'], note: 'SPEC.md §12.5; rerank = a custom cost line typed on The Rerank, D-085' },
    'rerank.rows[].id':                          { class: 'raw',        unit: 'id',      note: 'a categoryId, or an expense entry id for a custom line. D-085' },
    'rerank.rows[].miss':                        { class: 'raw',        unit: 'enum',    values: ['yes', 'some', 'no'], note: 'would you miss it? null = not asked' },
    'rerank.rows[].who':                         { class: 'raw',        unit: 'enum',    values: ['me', 'both', 'show'], note: 'who is it really for: me, both of us, or for show' },
    'rerank.rows[].valueRank':                   { class: 'raw',        unit: 'count',   note: '1 = most valuable, set by hand on the rerank stage; null = not reranked, ordered by joy' },
    'skills[id].state':                          { class: 'raw',        unit: 'enum',    values: ['locked', 'available', 'trial', 'practicing', 'habit', 'done'], note: 'the Skill Stacker\'s standing per catalogue skill. Owned by the Stacker. D-090' },
    'skills[id].kind':                           { class: 'raw',        unit: 'enum',    values: ['once', 'habit', 'periodic'], note: 'copied from the catalogue when equipped, so the state can be read without it' },
    'skills[id].log[]':                          { class: 'raw',        unit: 'date',    note: 'ISO days the habit was done; misses[] the days it was explicitly not. A day in neither is unanswered' },
    'skills[id].valuePerDayCents':               { class: 'computed',   unit: 'cents',   note: 'the annual effect ÷ 365 at the last log, kept so the ledger row is reproducible' },
    'skills[id].automated':                      { class: 'raw',        unit: 'bool',    note: 'runs without you — the automation ratio counts these. D-090' },
    'skills[id].dueOn':                          { class: 'raw',        unit: 'date',    note: 'periodic skills: lastDone + everyDays' },
    'skills[id].verifiedBy':                     { class: 'raw',        unit: 'enum',    values: ['household', 'self'], note: 'household = marked done from a fact the model already holds, and un-marked if the fact stops holding' },
    'practiceLedger[].cents':                    { class: 'raw',        unit: 'cents',   note: 'one row per skill per logged day: what that day\'s practice is worth. Feedback, not points. D-090' },
    'expenses.entries[].fixed':                  { class: 'raw',        unit: 'bool',    note: 'null not asked; true = could not be cut next month. Feeds the minimum viable month and cuttability. D-082' },
    'goals[].targetDate':                        { class: 'raw',        unit: 'iso-date' },
    'goals[].savedCents':                        { class: 'raw',        unit: 'cents' },
    'goals[].monthlyContributionCents':          { class: 'raw',        unit: 'cents',   period: 'monthly' },
    'goals[].lineItems[].amountCents':           { class: 'raw',        unit: 'cents' },
    'computed.goalRequiredMonthlyCents':         { class: 'computed',   unit: 'cents',   period: 'monthly' },
    'swan.basis':                                { class: 'raw',        unit: 'enum',    values: ['amount', 'months'], note: 'which of the two below the person actually named' },
    'swan.targetCents':                          { class: 'raw',        unit: 'cents',   note: 'SWAN Number as a flat cash figure. SPEC.md §13 Tier 1.5' },
    'swan.targetMonths':                         { class: 'raw',        unit: 'months',  note: 'SWAN Number expressed as months of expenses' },
    'swan.note':                                 { class: 'raw',        unit: 'text',    note: 'why that number — the feeling the figure stands for' },
    'computed.swanTargetCents':                  { class: 'computed',   unit: 'cents',   note: 'the resolved target, whichever basis was used' },
    'valuesProfile.stated[]':                    { class: 'raw',        unit: 'enum',    note: 'value ids from data/values.json, in the order named — index 0 is the top one' },
    'valuesProfile.assignments':                 { class: 'raw',        unit: 'map',     note: 'expenseCategoryId -> value id, or null for deliberately unclaimed' },
    'ratings.<scope>.<itemId>':                  { class: 'raw',        unit: 'rating',  note: 'integer 1-10, or absent for not rated. One store for every 1-10 rating in the app — SPEC.md §13 Tier 1.5' },
    'worthChecks[].costCents':                   { class: 'raw',        unit: 'cents' },
    'worthChecks[].hoursSpent':                  { class: 'raw',        unit: 'hours' },
    'worthChecks[].predictedRating':             { class: 'raw',        unit: 'rating',  note: 'what you thought it would be worth, 1-10, before' },
    'worthChecks[].actualRating':                { class: 'raw',        unit: 'rating',  note: 'what it turned out to be worth, 1-10, after' },
    'assumptions.expectedReturnRate':            { class: 'assumption', unit: 'rate',    default: ASSUMPTION_DEFAULTS.expectedReturnRate },
    'assumptions.swrRate':                       { class: 'assumption', unit: 'rate',    default: ASSUMPTION_DEFAULTS.swrRate },
    'assumptions.humanCapitalDiscountRate':      { class: 'assumption', unit: 'rate',    default: ASSUMPTION_DEFAULTS.humanCapitalDiscountRate, note: 'real discount on pay still to come, for human capital. D-079' },
    'assumptions.homeEquityHaircut':             { class: 'assumption', unit: 'rate',    default: ASSUMPTION_DEFAULTS.homeEquityHaircut, note: 'the fraction of home equity the shadow runway counts. D-081' },

    /* Computed — never stored on the household, never user-editable.
       Recomputed from raw inputs on every read. Listed here so a tool can
       check that it is not about to write to one. */
    'computed.netWorthCents':                    { class: 'computed', unit: 'cents' },
    'computed.totalAssetsCents':                 { class: 'computed', unit: 'cents' },
    'computed.totalDebtCents':                   { class: 'computed', unit: 'cents' },
    'computed.savingsRateExcludingMatch':        { class: 'computed', unit: 'rate', note: 'SPEC.md §12.1 — both variants always available' },
    'computed.savingsRateIncludingMatch':        { class: 'computed', unit: 'rate' },
    'computed.emergencyFundMonths':              { class: 'computed', unit: 'months' },
    'computed.debtToIncomeRatio':                { class: 'computed', unit: 'rate' },
    'computed.fireNumberCents':                  { class: 'computed', unit: 'cents' },
    'computed.fireProgress':                     { class: 'computed', unit: 'rate' },
    'computed.netWorthPercentile':               { class: 'computed', unit: 'percentile' },
    'computed.retirementMultiple':               { class: 'computed', unit: 'multiple' },
    'computed.fooPlacement':                     { class: 'computed', unit: 'step' }
  };

  /** True if a field path is Computed — i.e. writing to it is a bug.
   *  SPEC.md §11 q2: tools write raw inputs only. */
  function isComputedField(path) {
    return !!FIELDS[path] && FIELDS[path].class === 'computed';
  }

  /* ======================================================================
     Constructors. Every field starts null — "not entered" — never 0.
     SPEC.md §5 rule 1.
     ====================================================================== */

  var idCounter = 0;
  function newId(prefix) {
    idCounter += 1;
    return prefix + '_' + Date.now().toString(36) + '_' + idCounter.toString(36);
  }

  /* variableLowCents / variableHighCents: a month at the low and high end,
     for self-employed and mixed income (D-094). Owner's pay is read from
     the low end; nothing here averages them into a steady figure. */
  function createIncomeSource(fields) {
    var f = fields || {};
    return {
      id: f.id || newId('inc'),
      personId: f.personId || null,
      source: f.source || null,                    // free text, e.g. "Day job"
      grossAnnualIncomeCents: f.grossAnnualIncomeCents === undefined ? null : f.grossAnnualIncomeCents,
      /* How this person is ACTUALLY paid. engines/income.js turns the pair
         of (frequency, rateCents) into the annual figure above — which
         stays the canonical stored number, so every other room is
         unaffected. A source with no rateCents falls back to whatever
         grossAnnualIncomeCents already says, which is how every household
         saved before this keeps working. DECISIONS.md D-047. */
      frequency: f.frequency || 'annual',
      rateCents: f.rateCents === undefined ? null : f.rateCents,
      /* Hourly only. There is no honest hourly-to-yearly figure without it. */
      hoursPerWeek: f.hoursPerWeek === undefined ? null : f.hoursPerWeek,
      /* How much of the last twelve months this job covered. Absent means
         all of it. Across several jobs these may total more than twelve
         (two at once) or fewer (a gap); neither is corrected. */
      monthsWorked: f.monthsWorked === undefined ? null : f.monthsWorked,
      /* Is this still the job? Drives the run-rate figure. */
      ongoing: f.ongoing === undefined ? true : !!f.ongoing,
      variableLowCents: Money.isEntered(f.variableLowCents) ? f.variableLowCents : null,
      variableHighCents: Money.isEntered(f.variableHighCents) ? f.variableHighCents : null,
      type: f.type || 'w2',
      /* Return on Hassle applied to the job: 1 easy · 2 moderate · 3
         annoying. null until rated. D-066. */
      hassle: f.hassle === undefined ? null : f.hassle,
      employerMatch: f.employerMatch || {
        matchPercent: null,                        // 0.5 === 50 cents on the dollar
        matchCapPercentOfSalary: null              // 0.06 === up to first 6% of salary
      }
    };
  }

  /**
   * What a job actually costs in time and money, beyond the paycheque.
   * Lives on the person because it is a fact about them, not about a room —
   * SPEC.md §9 item 7 makes the Real Hourly Wage engine a prerequisite for
   * the Side Hustle and Prospective Worth calcs, and all three read this.
   * Hours are per week; costs are monthly cents.
   */
  function createWorkProfile(fields) {
    var f = fields || {};
    return {
      contractedHoursPerWeek: f.contractedHoursPerWeek === undefined ? null : f.contractedHoursPerWeek,
      unpaidOvertimeHoursPerWeek: f.unpaidOvertimeHoursPerWeek === undefined ? null : f.unpaidOvertimeHoursPerWeek,
      commuteHoursPerWeek: f.commuteHoursPerWeek === undefined ? null : f.commuteHoursPerWeek,
      prepHoursPerWeek: f.prepHoursPerWeek === undefined ? null : f.prepHoursPerWeek,
      decompressHoursPerWeek: f.decompressHoursPerWeek === undefined ? null : f.decompressHoursPerWeek,
      workCostsMonthlyCents: f.workCostsMonthlyCents === undefined ? null : f.workCostsMonthlyCents,
      /* Assumption-class: weeks actually worked after leave. */
      weeksPerYear: f.weeksPerYear === undefined ? WORK_DEFAULTS.weeksPerYear : f.weeksPerYear
    };
  }

  /**
   * Are you working, and for whom?
   *
   * This exists because the app was asking everybody about their employer
   * match. If you are between jobs, self-employed, or retired, there is no
   * employer, so that question has no true answer \u2014 and worse, leaving it
   * blank left the room permanently reading "1 thing left".
   *
   *   earning    \u2014 is money expected to be coming in from work
   *   hasEmployer\u2014 is there a company that could match contributions
   *
   * `hasEmployer: false` does not mean "no retirement plan". A self-employed
   * person has a solo 401(k) with no match; a retiree may be drawing from
   * one. It means exactly one thing: the employer-match pair of questions is
   * not applicable, and is therefore not counted as missing.
   * DECISIONS.md D-055.
   */
  var EMPLOYMENT_STATUSES = [
    { id: 'employed',     label: 'Working for an employer',
      short: 'Employed',      earning: true,  hasEmployer: true },
    { id: 'selfEmployed', label: 'Self-employed or freelance',
      short: 'Self-employed', earning: true,  hasEmployer: false },
    { id: 'both',         label: 'Both \u2014 a job and my own work',
      short: 'Both',          earning: true,  hasEmployer: true },
    /* Between jobs is its own answer, not a shade of "not working": it
       has a sequence of its own — benefits, severance, a runway against a
       search — and the income question stops being the gate. D-092. */
    { id: 'unemployed',   label: 'Unemployed \u2014 looking for work',
      short: 'Unemployed',    earning: false, hasEmployer: false, seeking: true },
    /* On disability: not working, and the benefit is income — it goes on
       the income card like a pension does. D-092. */
    { id: 'disabled',     label: 'On disability',
      short: 'On disability', earning: false, hasEmployer: false, benefits: true },
    { id: 'notWorking',   label: 'Not working, and not looking right now',
      short: 'Not working',   earning: false, hasEmployer: false },
    { id: 'retired',      label: 'Retired',
      short: 'Retired',       earning: false, hasEmployer: false },
    /* A student: maybe a part-time job, no employer plan to speak of, and
       loans are the usual debt. The one-pager's gate (D-094). */
    { id: 'student',      label: 'Student',
      short: 'Student',       earning: true,  hasEmployer: false }
  ];

  function employmentStatus(id) {
    for (var i = 0; i < EMPLOYMENT_STATUSES.length; i++) {
      if (EMPLOYMENT_STATUSES[i].id === id) return EMPLOYMENT_STATUSES[i];
    }
    return null;
  }

  /**
   * householdEmployment(h) \u2014 the primary person's status, as a row.
   * Returns null when it has not been answered. A caller that treats null
   * as "no employer" is wrong: unanswered is not an answer, and the whole
   * point of this field is that the two are different.
   */
  function householdEmployment(household) {
    var p = primaryPerson(household || {});
    return p ? employmentStatus(p.employmentStatus) : null;
  }

  /** The primary person said they are between jobs. */
  function isUnemployed(household) {
    var row = householdEmployment(household);
    return !!(row && row.seeking);
  }
  function unemploymentOf(household) {
    var p = primaryPerson(household || {});
    return p ? createUnemployment(p.unemployment) : createUnemployment(null);
  }
  /**
   * The benefit as a monthly figure while it lasts: weekly × 52 ÷ 12, with
   * the months it runs. Only while receiving or applied, and only with an
   * amount typed — "haven't applied" is an answer worth nothing a month.
   */
  function benefitMonthlyCents(household) {
    if (!isUnemployed(household)) return Money.incomplete('Not between jobs.', ['employmentStatus']);
    var u = unemploymentOf(household);
    if (u.benefitStatus === null) return Money.incomplete('Say whether you are getting unemployment.', ['unemployment']);
    if (u.benefitStatus === 'notApplied' || u.benefitStatus === 'ineligible') {
      return Money.ok(0, { benefitStatus: u.benefitStatus, months: 0, weeksLeft: 0 });
    }
    if (!Money.isEntered(u.benefitWeeklyCents)) return Money.incomplete('Add what the benefit pays a week.', ['unemployment']);
    var weeks = Money.isEntered(u.benefitWeeksLeft) ? u.benefitWeeksLeft : null;
    return Money.ok(Math.round(u.benefitWeeklyCents * 52 / 12), {
      benefitStatus: u.benefitStatus, weeksLeft: weeks, months: weeks === null ? null : Math.round(weeks / (52 / 12) * 10) / 10
    });
  }

  /**
   * Could this household have an employer match at all?
   *
   * UNANSWERED COUNTS AS YES, deliberately \u2014 every household saved before
   * this field existed has no status, and silently deciding they have no
   * employer would hide a question they have already answered. So does an
   * already-entered match, whatever the status now says: a figure someone
   * typed is never hidden by a later answer to a different question.
   */
  function couldHaveEmployerMatch(household) {
    var row = householdEmployment(household);
    if (!row) return true;
    if (row.hasEmployer) return true;
    var p = primaryPerson(household || {});
    var sources = (p && p.incomeSources) || [];
    for (var i = 0; i < sources.length; i++) {
      var m = sources[i].employerMatch || {};
      if (Money.isEntered(m.matchPercent) || Money.isEntered(m.matchCapPercentOfSalary)) return true;
    }
    return false;
  }

  /**
   * Is "are you contributing enough to get all of it?" a live question?
   *
   * Yes whenever a match COULD exist and is not known to be zero. It used
   * to appear only once a non-zero match had been typed, which made the
   * intake's count grow from 9 to 10 halfway through — "1 of 9" on the
   * first screen, "all 10 answered" on the last. A count that only ever
   * shrinks as you answer is one people can trust. BRIEF §1.1 item 3.
   */
  function capturingQuestionApplies(household) {
    if (!couldHaveEmployerMatch(household)) return false;
    var p = primaryPerson(household || {});
    var s = p && p.incomeSources && p.incomeSources[0];
    var m = (s && s.employerMatch) || {};
    var entered = Money.isEntered(m.matchPercent) && Money.isEntered(m.matchCapPercentOfSalary);
    if (entered && (m.matchPercent === 0 || m.matchCapPercentOfSalary === 0)) return false;
    return true;
  }

  /**
   * capturingFullMatchDerived(h) — is the person contributing at least the
   * match cap? A FACT that follows from two others (contributionPercent and
   * the cap), so once both are known it is never asked. Returns a Result:
   * ok(true/false) when both are known, incomplete otherwise. The stored
   * household.capturingFullMatch answer is the fallback for a household
   * that answered the old question before contributionPercent existed.
   * D-061.
   */
  function capturingFullMatchDerived(household) {
    var h = household || {};
    var contribution = (h.retirement || {}).contributionPercent;
    var p = primaryPerson(h);
    var s = p && p.incomeSources && p.incomeSources[0];
    var m = (s && s.employerMatch) || {};
    if (Money.isEntered(contribution) && Money.isEntered(m.matchCapPercentOfSalary)) {
      return Money.ok(contribution / 100 >= m.matchCapPercentOfSalary - 1e-9, {
        derived: true, contributionPercent: contribution, matchCapPercentOfSalary: m.matchCapPercentOfSalary
      });
    }
    if (h.capturingFullMatch === true) return Money.ok(true, { derived: false });
    if (h.capturingFullMatch === false) return Money.ok(false, { derived: false });
    return Money.incomplete('Add what you contribute to see this.', ['contributionPercent']);
  }

  function hasDebtAnswered(household) {
    var m = (household && household.meta) || {};
    return m.hasDebt === true || m.hasDebt === false;
  }

  /**
   * Between jobs (D-092). Every field is null until answered; a benefit
   * status of 'notApplied' or 'ineligible' is an answer with no amount.
   *   since              'YYYY-MM-01' — the month the job ended
   *   benefitStatus      'receiving' | 'applied' | 'notApplied' | 'ineligible'
   *   benefitWeeklyCents what the state pays a week (yours to look up; the
   *                      state cap is proposed, never assumed)
   *   benefitWeeksLeft   how many weeks of it remain
   *   severanceCents     a payout or final pay still in hand
   *   lastGrossAnnualCents what the last job paid a year, for the benchmarks
   */
  var BENEFIT_STATUSES = ['receiving', 'applied', 'notApplied', 'ineligible'];
  function createUnemployment(fields) {
    var f = fields || {};
    return {
      since: typeof f.since === 'string' && f.since ? f.since : null,
      benefitStatus: BENEFIT_STATUSES.indexOf(f.benefitStatus) >= 0 ? f.benefitStatus : null,
      benefitWeeklyCents: Money.isEntered(f.benefitWeeklyCents) ? f.benefitWeeklyCents : null,
      benefitWeeksLeft: Money.isEntered(f.benefitWeeksLeft) ? f.benefitWeeksLeft : null,
      severanceCents: Money.isEntered(f.severanceCents) ? f.severanceCents : null,
      lastGrossAnnualCents: Money.isEntered(f.lastGrossAnnualCents) ? f.lastGrossAnnualCents : null,
      /* The Between Jobs room's two (D-098): how long you expect the
         search to take, and the bare-minimum month you could drop to. */
      expectedSearchMonths: Money.isEntered(f.expectedSearchMonths) ? f.expectedSearchMonths : null,
      floorMonthlyCents: Money.isEntered(f.floorMonthlyCents) ? f.floorMonthlyCents : null
    };
  }

  function createPerson(fields) {
    var f = fields || {};
    return {
      id: f.id || newId('p'),
      label: f.label || null,
      role: f.role || 'adult',
      dob: f.dob === undefined ? null : f.dob,     // ISO 'YYYY-MM-DD'
      /* Whether there is a job at all, and what kind. This is not derivable
         from the income sources: "no rate entered" means the question was
         skipped, "not earning" is a pay basis, and neither of them tells you
         whether there is an EMPLOYER — which is the only thing that makes an
         employer match a real question. null means not asked yet, and that
         is deliberately different from every answer below.
         See EMPLOYMENT_STATUSES and DECISIONS.md D-055. */
      employmentStatus: f.employmentStatus === undefined ? null : f.employmentStatus,
      /* Between jobs, when the status says so. D-092. */
      unemployment: createUnemployment(f.unemployment),
      incomeSources: f.incomeSources || [],
      work: createWorkProfile(f.work)
    };
  }

  function createAsset(fields) {
    var f = fields || {};
    return {
      id: f.id || newId('a'),
      label: f.label || null,
      category: f.category || 'other',
      valueCents: f.valueCents === undefined ? null : f.valueCents,
      liquid: f.liquid === undefined ? false : f.liquid,
      ownerIds: f.ownerIds || [],
      /* How the money is taxed on the way out. Asked in three boxes by
         Start Here (pre-tax / Roth / taxable); a lump typed as one total is
         'unknown', which is an answer — null is "never asked". D-061. */
      taxCharacter: f.taxCharacter === undefined ? null : f.taxCharacter,
      /* The 10x Statement's per-asset facts (D-066). Every one starts null:
         liquidity and confidence are rated, not guessed — the access_rules
         default is proposed in the box, never written. */
      liquidity: f.liquidity === undefined ? null : f.liquidity,
      confidence: f.confidence === undefined ? null : f.confidence,
      costBasisCents: f.costBasisCents === undefined ? null : f.costBasisCents,
      hassle: f.hassle === undefined ? null : f.hassle,
      cashFlowMonthlyCents: f.cashFlowMonthlyCents === undefined ? null : f.cashFlowMonthlyCents,
      accessAgeOverride: f.accessAgeOverride === undefined ? null : f.accessAgeOverride
    };
  }

  /**
   * assetRule(asset, rules) — the access_rules row for an asset: by its
   * taxCharacter, else by its category. Always returns a row, so a caller
   * never has to guess a bucket.
   */
  function assetRule(asset, rules) {
    var a = asset || {};
    var by = (rules && rules.byTaxCharacter) || {};
    var key = a.taxCharacter && by[a.taxCharacter] ? a.taxCharacter
      : (rules && rules.byCategory && rules.byCategory[a.category]) || 'other';
    return Object.assign({ key: key }, by[key] || { bucket: 'nonFinancial', liquidity: 3, accessAge: null, basisAccessAge: null });
  }

  /** The age this asset can be reached without penalty; the person's
   *  override wins over the rule. null = no age gate. */
  function assetAccessAge(asset, rules) {
    if (asset && Money.isEntered(asset.accessAgeOverride)) return asset.accessAgeOverride;
    return assetRule(asset, rules).accessAge;
  }

  /** Effective liquidity 1-4: the rating if given, else the rule's default —
   *  and says which. */
  function assetLiquidity(asset, rules) {
    if (asset && Money.isEntered(asset.liquidity)) return { value: asset.liquidity, rated: true };
    return { value: assetRule(asset, rules).liquidity, rated: false };
  }

  function createFutureIncome(fields) {
    var f = fields || {};
    return {
      id: f.id || newId('fi'),
      label: f.label || null,
      monthlyCents: f.monthlyCents === undefined ? null : f.monthlyCents,
      startsOn: f.startsOn === undefined ? null : f.startsOn,     /* ISO date, or an age via startsAtAge */
      startsAtAge: f.startsAtAge === undefined ? null : f.startsAtAge,
      endsOn: f.endsOn === undefined ? null : f.endsOn,
      confidence: f.confidence === undefined ? null : f.confidence,
      inflationAdjusted: f.inflationAdjusted === undefined ? null : !!f.inflationAdjusted,
      ownerIds: f.ownerIds || []
    };
  }

  /* A rental. Its VALUE is the linked real_estate asset's (one number, one
     owner); this record carries what the building does, not what it is. */
  function createProperty(fields) {
    var f = fields || {};
    return {
      id: f.id || newId('prop'),
      assetId: f.assetId || null,
      mortgageId: f.mortgageId || null,
      rentMonthlyCents: f.rentMonthlyCents === undefined ? null : f.rentMonthlyCents,
      pitiMonthlyCents: f.pitiMonthlyCents === undefined ? null : f.pitiMonthlyCents,
      opexMonthlyCents: f.opexMonthlyCents === undefined ? null : f.opexMonthlyCents,
      vacancyRate: f.vacancyRate === undefined ? null : f.vacancyRate,
      hassle: f.hassle === undefined ? null : f.hassle,
      prospects: f.prospects === undefined ? null : f.prospects
    };
  }

  function createAllocation(fields) {
    var f = fields || {};
    return {
      stocks: f.stocks === undefined ? null : f.stocks,
      bonds: f.bonds === undefined ? null : f.bonds,
      cash: f.cash === undefined ? null : f.cash,
      rebalanceBand: f.rebalanceBand === undefined ? null : f.rebalanceBand
    };
  }

  /** The target mix, checked: which slices are entered, what they add to,
   *  and whether that is 100%. One function so the room, the ownership
   *  chip and the tests agree on what "balanced" means. D-071. */
  function allocationStatus(household) {
    var a = (household && household.allocation) || {};
    var slices = ['stocks', 'bonds', 'cash'];
    var entered = slices.filter(function (k) { return Money.isEntered(a[k]); });
    if (!entered.length) return Money.incomplete('No target mix yet.', ['allocation']);
    var sum = entered.reduce(function (t, k) { return t + a[k]; }, 0);
    return Money.ok(sum, {
      complete: entered.length === slices.length,
      missing: slices.filter(function (k) { return !Money.isEntered(a[k]); }),
      balanced: entered.length === slices.length && Math.abs(sum - 1) < 1e-9
    });
  }

  /* The Rerank's answers beside each cost line (D-085). The 1-10 joy lives
     in ratings.rerank like every other rating; this holds the rest. */
  function createRerankRow(fields) {
    var f = fields || {};
    return {
      id: f.id || null,
      miss: f.miss === undefined ? null : f.miss,
      who: f.who === undefined ? null : f.who,
      valueRank: f.valueRank === undefined ? null : f.valueRank
    };
  }
  function createRerank(fields) {
    var f = fields || {};
    return { rows: (f.rows || []).filter(function (r) { return r && r.id; }).map(createRerankRow) };
  }

  /* One skill's standing in the Skill Stacker (D-090). `state` is the only
     field every kind uses; the rest fill in as the kind needs them. Empty
     lists and null dates are "nothing yet", never zero. */
  var SKILL_STATES = ['locked', 'available', 'trial', 'practicing', 'habit', 'done'];
  var SKILL_KINDS = ['once', 'habit', 'periodic'];
  function createSkillState(fields) {
    var f = fields || {};
    function iso(v) { return typeof v === 'string' && v ? v : null; }
    return {
      state: SKILL_STATES.indexOf(f.state) >= 0 ? f.state : 'available',
      kind: SKILL_KINDS.indexOf(f.kind) >= 0 ? f.kind : null,
      startedOn: iso(f.startedOn),
      /* Days it was done, and days it was explicitly not. A day in neither
         list was not answered, which is the third state. */
      log: Array.isArray(f.log) ? f.log.filter(function (d) { return typeof d === 'string'; }) : [],
      misses: Array.isArray(f.misses) ? f.misses.filter(function (d) { return typeof d === 'string'; }) : [],
      last30: Money.isEntered(f.last30) ? f.last30 : 0,
      secondMisses: Money.isEntered(f.secondMisses) ? f.secondMisses : 0,
      lapses: Money.isEntered(f.lapses) ? f.lapses : 0,
      valuePerDayCents: Money.isEntered(f.valuePerDayCents) ? f.valuePerDayCents : null,
      valueSource: f.valueSource === undefined ? null : f.valueSource,
      automated: f.automated === true,
      dueOn: iso(f.dueOn),
      lastDone: iso(f.lastDone),
      verifiedOn: iso(f.verifiedOn),
      verifiedBy: f.verifiedBy === undefined ? null : f.verifiedBy
    };
  }
  function createSkills(fields) {
    var out = {};
    var src = fields || {};
    Object.keys(src).forEach(function (id) { if (src[id]) out[id] = createSkillState(src[id]); });
    return out;
  }
  /* A day's practice, in cents: feedback, not points. One row per skill
     per day; the Stacker replaces a day's row rather than adding to it. */
  function createPracticeEntry(fields) {
    var f = fields || {};
    return {
      on: typeof f.on === 'string' ? f.on : null,
      skill: f.skill || null,
      cents: Money.isEntered(f.cents) ? f.cents : 0
    };
  }

  /* Who depends on this income: null not asked, [] nobody, else one entry
     an age (null when unknown). A household saved with the old yes/no
     reads as [{age: null}] or []. D-094. */
  function createDependent(fields) {
    var f = fields || {};
    return { age: Money.isEntered(f.age) ? f.age : null };
  }
  function createDependents(v) {
    if (v === true) return [createDependent(null)];
    if (v === false) return [];
    if (Array.isArray(v)) return v.map(createDependent);
    return null;
  }
  /* Protection beyond the deductible (D-094): health cover as a kind and a
     monthly cost, beside the checkup's four facts. */
  var HEALTH_TYPES = ['employer', 'marketplace', 'cobra', 'medicaid', 'parent', 'none'];
  function createHealth(fields) {
    var f = fields || {};
    return {
      type: HEALTH_TYPES.indexOf(f.type) >= 0 ? f.type : null,
      monthlyCents: Money.isEntered(f.monthlyCents) ? f.monthlyCents : null
    };
  }
  /* Decumulation (D-098): how a retiree draws. A stock share for the VPW
     table, a planned yearly draw when typed over the computed one, and the
     age Social Security (or a pension) starts. */
  function createDecumulation(fields) {
    var f = fields || {};
    return {
      stockShare: Money.isEntered(f.stockShare) ? f.stockShare : null,
      plannedAnnualDrawCents: Money.isEntered(f.plannedAnnualDrawCents) ? f.plannedAnnualDrawCents : null,
      socialSecurityAt: Money.isEntered(f.socialSecurityAt) ? f.socialSecurityAt : null
    };
  }
  /* Tax facts the Tax room asks (D-098): pre-tax money beyond the workplace
     contribution (HSA, a traditional IRA), and what has been withheld this
     year, for a refund-or-owe estimate. */
  function createTaxFacts(fields) {
    var f = fields || {};
    return {
      otherPreTaxAnnualCents: Money.isEntered(f.otherPreTaxAnnualCents) ? f.otherPreTaxAnnualCents : null,
      withheldAnnualCents: Money.isEntered(f.withheldAnnualCents) ? f.withheldAnnualCents : null
    };
  }
  /* The second wave of tranche rooms (D-099): each a small branch the room
     owns. Nothing here is derived; every field is what the person typed. */
  function createCareer(fields) {
    var f = fields || {}; var o = f.offer || {};
    function c(v) { return Money.isEntered(v) ? v : null; }
    return { offer: { grossAnnualCents: c(o.grossAnnualCents), hoursPerWeek: c(o.hoursPerWeek), commuteHoursPerWeek: c(o.commuteHoursPerWeek), workCostsMonthlyCents: c(o.workCostsMonthlyCents), signOnCents: c(o.signOnCents) } };
  }
  var SPLIT_MODES = ['equal', 'proportional', 'pooled'];
  function createPartnerPlan(fields) {
    var f = fields || {};
    return { splitMode: SPLIT_MODES.indexOf(f.splitMode) >= 0 ? f.splitMode : null, sharedMonthlyCents: Money.isEntered(f.sharedMonthlyCents) ? f.sharedMonthlyCents : null };
  }
  function createKidsPlan(fields) {
    var f = fields || {};
    function c(v) { return Money.isEntered(v) ? v : null; }
    return { tuitionTargetCents: c(f.tuitionTargetCents), tuitionSavedCents: c(f.tuitionSavedCents), tuitionMonthlyCents: c(f.tuitionMonthlyCents) };
  }
  function createHousingPlan(fields) {
    var f = fields || {};
    function c(v) { return Money.isEntered(v) ? v : null; }
    return { rentMonthlyCents: c(f.rentMonthlyCents), priceCents: c(f.priceCents), downPct: c(f.downPct), rate: c(f.rate) };
  }
  function createPurchasePlan(fields) {
    var f = fields || {};
    function c(v) { return Money.isEntered(v) ? v : null; }
    return { priceCents: c(f.priceCents), monthsAway: c(f.monthsAway), financeRate: c(f.financeRate), label: typeof f.label === 'string' && f.label ? f.label : null };
  }
  function createVariableIncomePlan(fields) {
    var f = fields || {};
    return { bufferMonths: Money.isEntered(f.bufferMonths) ? f.bufferMonths : null };
  }
  /* Estate basics: three yes/no facts. */
  function createEstate(fields) {
    var f = fields || {};
    function tri(v) { return typeof v === 'boolean' ? v : null; }
    return { beneficiariesSet: tri(f.beneficiariesSet), willExists: tri(f.willExists), poaExists: tri(f.poaExists) };
  }
  /* Giving: a share of income, and a yearly target when typed over. */
  function createGiving(fields) {
    var f = fields || {};
    return {
      pctOfIncome: Money.isEntered(f.pctOfIncome) ? f.pctOfIncome : null,
      annualTargetCents: Money.isEntered(f.annualTargetCents) ? f.annualTargetCents : null
    };
  }

  /* A one-off in or out — a bonus, a tax bill, a car — that the one-pager
     takes in one line so the dashboard and Runway can see it coming. D-094. */
  function createOneOff(fields) {
    var f = fields || {};
    return {
      id: f.id || newId('one'),
      label: f.label === undefined ? null : f.label,
      cents: Money.isEntered(f.cents) ? f.cents : null,
      direction: f.direction === 'in' ? 'in' : 'out',   // unknown reads as leaving
      on: typeof f.on === 'string' && f.on ? f.on : null
    };
  }

  function createTargets(fields) {
    var f = fields || {};
    return {
      retireAge: f.retireAge === undefined ? null : f.retireAge,
      coastAge: f.coastAge === undefined ? null : f.coastAge
    };
  }

  function createScenario(fields) {
    var f = fields || {};
    return {
      id: f.id || newId('scn'),
      name: f.name || null,
      startsOn: f.startsOn === undefined ? null : f.startsOn,
      diff: f.diff || {}
    };
  }

  /* The three characters Start Here asks for. The fuller list in
     FIELD_CLASSES is what the 10x Statement (T3) will use. */
  var TAX_CHARACTERS = [
    { id: 'pretax',  label: 'Pre-tax',  hint: '401(k), traditional IRA, 403(b)' },
    { id: 'roth',    label: 'Roth',     hint: 'Roth IRA, Roth 401(k)' },
    { id: 'taxable', label: 'Taxable',  hint: 'brokerage, anything with no tax wrapper' }
  ];

  function createDebt(fields) {
    var f = fields || {};
    return {
      id: f.id || newId('d'),
      label: f.label || null,
      balanceCents: f.balanceCents === undefined ? null : f.balanceCents,
      rate: f.rate === undefined ? null : f.rate,
      minPaymentCents: f.minPaymentCents === undefined ? null : f.minPaymentCents,
      type: f.type || 'other',
      /* Only meaningful on revolving debt — a mortgage has no limit to be a
         share of. Absent means "not entered", never "no limit", which is
         why credit utilisation stays unavailable rather than assuming one.
         DECISIONS.md D-045. */
      creditLimitCents: f.creditLimitCents === undefined ? null : f.creditLimitCents,
      /* A 0% promotional period, and the rate the balance reverts to when it
         ends. `rate` above is the rate you are paying TODAY; these two say
         when that stops being true. Without them a 0% card looks free
         forever, which is the single most expensive thing this app could
         get wrong about a card. DECISIONS.md D-053. */
      promoEndsOn: f.promoEndsOn === undefined ? null : f.promoEndsOn,
      postPromoRate: f.postPromoRate === undefined ? null : f.postPromoRate,
      emotionalTag: f.emotionalTag === undefined ? null : f.emotionalTag,
      ownerIds: f.ownerIds || []
    };
  }

  /** An estimated/tracked pair. SPEC.md §12.3: tracked NEVER overwrites
   *  estimated. Both persist; the divergence between them is a feature. */
  function createEstimatedTrackedPair(fields) {
    var f = fields || {};
    return {
      estimatedValueCents: f.estimatedValueCents === undefined ? null : f.estimatedValueCents,
      trackedValueCents: f.trackedValueCents === undefined ? null : f.trackedValueCents,
      source: f.trackedValueCents !== undefined && f.trackedValueCents !== null ? 'tracked' : 'estimated'
    };
  }

  /**
   * One expense record. Two shapes, one store:
   *   manual monthly total  { categoryId, amountCents, period: 'monthly',
   *                           source: 'manual' }
   *   imported transaction  { categoryId, amountCents, period: 'once',
   *                           date, descriptor, source: 'imported' }
   * The roll-up in engines/cashflow.js normalises both to a monthly figure,
   * so adding import later changes no aggregation code — SPEC.md §12.5.
   */
  function createExpenseEntry(fields) {
    var f = fields || {};
    return {
      id: f.id || newId('e'),
      categoryId: f.categoryId || null,
      amountCents: f.amountCents === undefined ? null : f.amountCents,
      period: f.period || 'monthly',            // 'monthly' | 'once'
      date: f.date === undefined ? null : f.date,        // ISO, dated entries only
      descriptor: f.descriptor === undefined ? null : f.descriptor,
      source: f.source || 'manual',             // 'manual' | 'imported'
      categorizedBy: f.categorizedBy === undefined ? null : f.categorizedBy,
      /* Could this line be cut next month? null = not asked; true = fixed
         (rent, insurance, a minimum); false = cuttable. D-082. */
      fixed: f.fixed === undefined ? null : f.fixed
    };
  }

  /**
   * A thing you are saving for. SPEC.md §9 item 6 puts the Goal Costing
   * Engine before Wedding, Dream and any other goal calculator, because they
   * are the same shape: a dated target, made of line items, funded monthly.
   * Building them separately would mean building this three times.
   */
  function createGoal(fields) {
    var f = fields || {};
    return {
      id: f.id || newId('goal'),
      name: f.name === undefined ? null : f.name,
      templateId: f.templateId === undefined ? null : f.templateId,
      targetDate: f.targetDate === undefined ? null : f.targetDate,   // ISO 'YYYY-MM-DD'
      savedCents: f.savedCents === undefined ? null : f.savedCents,
      monthlyContributionCents: f.monthlyContributionCents === undefined ? null : f.monthlyContributionCents,
      /* Either itemise it or name one lump figure — never both silently. */
      lineItems: f.lineItems || [],
      lumpTargetCents: f.lumpTargetCents === undefined ? null : f.lumpTargetCents
    };
  }

  function createGoalLineItem(fields) {
    var f = fields || {};
    return {
      id: f.id || newId('gli'),
      label: f.label === undefined ? null : f.label,
      amountCents: f.amountCents === undefined ? null : f.amountCents
    };
  }

  /**
   * The SWAN Number — SPEC.md §13, Tier 1.5. A self-reported "sleep well at
   * night" liquid-savings target, stored STANDALONE and never conflated with
   * computed Emergency Fund Coverage: one is a feeling, the other is
   * arithmetic, and the room shows both side by side.
   *
   * Two ways to name it, one authoritative at a time:
   *   basis 'amount' — a flat cash figure, in targetCents
   *   basis 'months' — a multiple of monthly expenses, in targetMonths
   * Whichever the person used is the one stored in `basis`; the other stays
   * null rather than being back-filled, so re-reading it never silently
   * pins a figure that was derived from an expense number that has since
   * changed.
   */
  function createSwanTarget(fields) {
    var f = fields || {};
    return {
      basis: f.basis === undefined ? null : f.basis,        // 'amount' | 'months' | null
      targetCents: f.targetCents === undefined ? null : f.targetCents,
      targetMonths: f.targetMonths === undefined ? null : f.targetMonths,
      note: f.note === undefined ? null : f.note,
      setAt: f.setAt === undefined ? null : f.setAt         // ISO timestamp
    };
  }

  /**
   * What someone says matters, and which of their spending they say serves
   * it. SPEC.md §13, Tier 2 — Values vs. Spending Audit.
   *
   * `stated` is an ORDERED list of value ids: index 0 is what they put
   * first. Rank is position, not a stored number, so there is no way for the
   * two to disagree.
   *
   * `assignments` maps an expense category id to ONE value id — at most one,
   * because a category counted under two values would double-count the
   * money and the shares would stop adding up. An explicit null means "this
   * serves nothing I named", which is a real answer and different from a
   * category nobody has looked at yet (absent from the map entirely).
   */
  function createValuesProfile(fields) {
    var f = fields || {};
    return {
      stated: f.stated || [],
      assignments: f.assignments || {}
    };
  }

  /**
   * Every 1-10 rating in the app, in one store, keyed by scope then item.
   *
   *   ratings = { joy: { dining_out: 8, housing: 4 }, hassle: { … } }
   *
   * SPEC.md §13 Tier 1.5 is explicit that the 1-10 mechanism is shared
   * infrastructure across the Fulfillment Curve, the Category Tracker, the
   * Dating Cost calc and Retroactive Worth — "build one reusable rating
   * component, not four". One store is the data half of that; the control
   * in shared/rating.js is the other half.
   *
   * An absent key means NOT RATED. There is no zero on this scale, so a
   * missing rating can never be confused with a low one.
   */
  function createRatings(fields) {
    var out = {};
    var src = fields || {};
    Object.keys(src).forEach(function (scope) {
      var items = src[scope] || {};
      var kept = {};
      Object.keys(items).forEach(function (itemId) {
        var v = items[itemId];
        if (typeof v === 'number' && Number.isFinite(v)) kept[itemId] = v;
      });
      out[scope] = kept;
    });
    return out;
  }

  /**
   * One thing you spent money on, predicted before and rated after.
   *
   * SPEC.md §13 Tier 1 asks for Prospective Worth and Retroactive Worth as a
   * "before/after pair", with "Prospective's prediction storable and later
   * compared against Retroactive's actual outcome if wired together with a
   * shared ID". So they are ONE record with two ratings, not two records
   * that have to be matched up afterwards — a shared id you have to maintain
   * is a shared id that drifts.
   *
   * `predictedRating` is set before, `actualRating` after. Either may be
   * absent: a thing predicted and not yet lived, or a thing rated in
   * hindsight that nobody predicted. Both are real states.
   */
  function createWorthCheck(fields) {
    var f = fields || {};
    return {
      id: f.id || newId('worth'),
      label: f.label === undefined ? null : f.label,
      costCents: f.costCents === undefined ? null : f.costCents,
      hoursSpent: f.hoursSpent === undefined ? null : f.hoursSpent,
      predictedRating: f.predictedRating === undefined ? null : f.predictedRating,
      predictedAt: f.predictedAt === undefined ? null : f.predictedAt,
      actualRating: f.actualRating === undefined ? null : f.actualRating,
      ratedAt: f.ratedAt === undefined ? null : f.ratedAt
    };
  }

  /* Every field here is null-when-unanswered, never zero. A contribution of
     0% is a real answer ("I contribute nothing") and must stay separable
     from "I have not said". */
  function createRetirement(fields) {
    var f = fields || {};
    return {
      contributionPercent: f.contributionPercent === undefined ? null : f.contributionPercent,
      rothContributedCents: f.rothContributedCents === undefined ? null : f.rothContributedCents,
      hsaContributedCents: f.hsaContributedCents === undefined ? null : f.hsaContributedCents,
      /* Eligibility facts, not amounts: they change which limit applies. */
      onHdhp: f.onHdhp === undefined ? null : !!f.onHdhp,
      hsaFamilyPlan: f.hsaFamilyPlan === undefined ? null : !!f.hsaFamilyPlan
    };
  }

  function createInsurance(fields) {
    var f = fields || {};
    return {
      highestDeductibleCents: f.highestDeductibleCents === undefined
        ? null : f.highestDeductibleCents,
      /* The Coverage Checkup (D-066): what a bad year can cost and what
         stands behind you. All null until asked in Sleep At Night. */
      oopMaxCents: f.oopMaxCents === undefined ? null : f.oopMaxCents,
      termLifeCents: f.termLifeCents === undefined ? null : f.termLifeCents,
      disabilityMonthlyCents: f.disabilityMonthlyCents === undefined ? null : f.disabilityMonthlyCents,
      umbrella: f.umbrella === undefined ? null : f.umbrella,
      health: createHealth(f.health)
    };
  }

  function createHousehold(fields) {
    var f = fields || {};
    return {
      schemaVersion: SCHEMA_VERSION,
      people: f.people || [],
      filingStatus: f.filingStatus === undefined ? null : f.filingStatus,
      state: f.state === undefined ? null : f.state,
      /* Raw, and nullable in three states: true / false / not answered.
         Needed by FOO step 2, which Tier 0's ten inputs cannot otherwise
         judge. See DECISIONS.md D-008. Listed here rather than only being
         attached ad hoc, so it survives a save/load round trip. */
      capturingFullMatch: f.capturingFullMatch === undefined ? null : f.capturingFullMatch,
      /* Does anyone depend on your income? null not asked, true, or a
         deliberate false — which takes term life off the coverage checkup
         and off every list of needs. D-092. */
      dependents: createDependents(f.dependents),
      /* The household's community: a day school changes what tuition is. */
      community: { daySchool: f.community && typeof f.community.daySchool === 'boolean' ? f.community.daySchool : null },
      assets: f.assets || [],
      debts: f.debts || [],
      expenses: {
        monthlyEssential: createEstimatedTrackedPair(
          (f.expenses && f.expenses.monthlyEssential) || {}
        ),
        /* Cash Flow calc (Tier 1) fills this. ONE store, transaction-shaped
           from day one — SPEC.md §12.5. A hand-typed monthly total and an
           imported transaction are the same record with different fields
           filled in, so the categoriser and the roll-up never need a second
           code path when import lands. See createExpenseEntry(). */
        entries: (f.expenses && (f.expenses.entries || f.expenses.categories)) || []
      },
      /* Which annual income figure feeds everything else: what was actually
         earned across the year, or the current job annualised. They differ
         only when a job changed mid-year. DECISIONS.md D-047. */
      incomeBasis: f.incomeBasis === 'runRate' ? 'runRate' : 'earned',
      /* Facts about your retirement setup. These used to be typed into the
         FOO ladder and into Where It Goes separately, and kept by neither —
         so the same question was asked twice and forgotten twice.
         Owned by Where It Goes. DECISIONS.md D-052. */
      retirement: createRetirement(f.retirement),
      /* Your largest insurance deductible: the first thing a cash cushion
         has to cover, which is why Sleep At Night owns it. */
      insurance: createInsurance(f.insurance),
      /* Things predicted before and rated after. SPEC.md §13 Tier 1. */
      worthChecks: (f.worthChecks || []).map(createWorthCheck),
      /* Every 1-10 rating in the app. See createRatings(). */
      ratings: createRatings(f.ratings),
      /* Stated values and what spending serves them. Owned by the What
         Matters room. SPEC.md §13 Tier 2. */
      valuesProfile: createValuesProfile(f.valuesProfile),
      /* The SWAN Number — a standalone self-reported target, owned by the
         Sleep At Night room. Never derived from, and never written by, the
         Emergency Fund Coverage calculation. SPEC.md §13 Tier 1.5. */
      swan: createSwanTarget(f.swan),
      /* Goals — SPEC.md §9 item 6. Owned by the Goals room. */
      goals: (f.goals || []).map(createGoal),
      /* The 10x Statement's records (D-066). Money that is coming — a
         pension, Social Security, an annuity — is not net worth and is not
         income yet; it is its own list. */
      futureIncome: (f.futureIncome || []).map(createFutureIncome),
      /* What a rental does, linked to the asset that says what it is. */
      property: (f.property || []).map(createProperty),
      /* Target split, one screen, owned by Where It Goes. */
      allocation: createAllocation(f.allocation),
      /* The Rerank's miss / who / value order per cost line. D-085. */
      rerank: createRerank(f.rerank),
      /* When you mean to stop, and when the coast variant grows to. Owned
         by FIRE; the unstored preview knob is gone. */
      targets: createTargets(f.targets),
      /* Named, dated diffs for the life-events engine (T6). */
      scenarios: (f.scenarios || []).map(createScenario),
      /* One-offs coming, in or out (D-094). */
      oneOffs: (f.oneOffs || []).map(createOneOff),
      estate: createEstate(f.estate),
      giving: createGiving(f.giving),
      decumulation: createDecumulation(f.decumulation),
      tax: createTaxFacts(f.tax),
      career: createCareer(f.career),
      partner: createPartnerPlan(f.partner),
      kids: createKidsPlan(f.kids),
      housing: createHousingPlan(f.housing),
      purchase: createPurchasePlan(f.purchase),
      variableIncome: createVariableIncomePlan(f.variableIncome),
      /* The Skill Stacker's standing per skill, keyed by catalogue id, and
         the practice ledger it writes a row to each logged day. D-090. */
      skills: createSkills(f.skills),
      practiceLedger: (f.practiceLedger || []).map(createPracticeEntry).filter(function (e) { return e.on && e.skill; }),
      assumptions: Object.assign({}, ASSUMPTION_DEFAULTS, f.assumptions || {}),
      /* User overrides persist SEPARATELY from the defaults so "reset to
         default" is always possible — SPEC.md §3, assumption class. */
      assumptionOverrides: f.assumptionOverrides || {},
      meta: Object.assign({
        visitedRooms: [],
        createdAt: null,
        updatedAt: null,
        /* { fieldId: ISO } — when each owned field was last set or
           re-confirmed. Absent for every field until it is next written,
           which is what "unknown" looks like. DECISIONS.md D-056. */
        confirmedAt: {},
        /* "Any debt?" — null not asked, true yes, false a deliberate no that
           takes Debt Payoff off the path and its figures off every room's
           list of needs. D-061. */
        hasDebt: null,
        /* The command log: what changed, before and after, so any write can
           be undone and redone. Capped at 100 by the spine. D-094. */
        undoStack: [],
        redoStack: [],
        /* { fieldId: true } — figures the one-pager filled in as guesses
           that were never typed over. Read as real numbers everywhere and
           shown as guesses everywhere, until replaced. D-094. */
        guessed: {},
        /* { fieldId: roomId } — the room that last changed the field, so
           the one-pager can show "from The Statement" beside a number it
           did not enter itself. D-095. */
        source: {},
        /* "I don't pay rent" — living with family, or a paid-off place;
           lowers the spending guess and nothing else. D-094. */
        noRent: null
      }, f.meta || {})
    };
  }

  /**
   * A copy of the household with monthly spending moved by `deltaCents`
   * (negative spends less). Used for "what if I saved more" — the point is
   * that the SAME engines then run against it, so a hypothetical is never a
   * second copy of a formula with the number changed. SPEC.md §8, §12.2:
   * a what-if is local and is never written back.
   *
   * The delta lands on whichever figure `monthlyExpensesCents()` would
   * actually read — tracked if a month has been categorised, the estimate
   * otherwise — so the hypothetical answers the same question the real one
   * does. Spending cannot go below zero.
   */
  function withMonthlyExpensesDeltaCents(household, deltaCents) {
    var copy = JSON.parse(JSON.stringify(household || {}));
    copy.expenses = copy.expenses || {};
    var pair = copy.expenses.monthlyEssential = createEstimatedTrackedPair(
      copy.expenses.monthlyEssential || {});
    if (!Money.isEntered(deltaCents)) return copy;

    var key = Money.isEntered(pair.trackedValueCents) ? 'trackedValueCents'
      : Money.isEntered(pair.estimatedValueCents) ? 'estimatedValueCents'
      : null;
    if (!key) return copy;                       // nothing entered to move
    pair[key] = Math.max(0, pair[key] + deltaCents);
    return copy;
  }

  /* ======================================================================
     Resolved assumptions: default, overridden by the user's stored override.
     A room testing a "what if" value passes it as a LOCAL override to the
     calculator instead of writing it here — SPEC.md §12.2, §6.
     ====================================================================== */

  function resolveAssumptions(household, localOverrides) {
    return Object.assign(
      {},
      ASSUMPTION_DEFAULTS,
      (household && household.assumptions) || {},
      (household && household.assumptionOverrides) || {},
      localOverrides || {}
    );
  }

  /* ======================================================================
     Aggregation — SPEC.md §3.
     • Household totals count every item EXACTLY ONCE regardless of how many
       ownerIds it carries. A jointly-owned asset is not double counted.
     • Items owned solely by someone with role 'child' are excluded by
       default. An unowned item (empty ownerIds) still counts — Tier 0 lump
       sums are entered before people are named.
     ====================================================================== */

  /** The work profile of a person, filled in for anything stored before this
   *  block existed. Never returns undefined. */
  function workProfile(person) {
    return createWorkProfile((person && person.work) || {});
  }

  function personById(household, personId) {
    var people = (household && household.people) || [];
    for (var i = 0; i < people.length; i++) {
      if (people[i].id === personId) return people[i];
    }
    return null;
  }

  function adults(household) {
    return ((household && household.people) || []).filter(function (p) {
      return p.role === 'adult';
    });
  }

  /** Should this item count toward household-level totals? */
  function isAggregatable(item, household) {
    var ids = (item && item.ownerIds) || [];
    if (ids.length === 0) return true;              // unattributed lump sum
    for (var i = 0; i < ids.length; i++) {
      var p = personById(household, ids[i]);
      if (!p || p.role !== 'child') return true;    // at least one non-child owner
    }
    return false;                                   // owned only by children
  }

  /** Items belonging to one specific person — for per-person views. */
  function ownedBy(items, personId) {
    return (items || []).filter(function (it) {
      return ((it.ownerIds) || []).indexOf(personId) !== -1;
    });
  }

  function aggregatableAssets(household) {
    return ((household && household.assets) || []).filter(function (a) {
      return isAggregatable(a, household);
    });
  }

  function aggregatableDebts(household) {
    return ((household && household.debts) || []).filter(function (d) {
      return isAggregatable(d, household);
    });
  }

  /** Every income source across every adult. Children's income is excluded. */
  function allIncomeSources(household) {
    var out = [];
    adults(household).forEach(function (p) {
      (p.incomeSources || []).forEach(function (src) {
        out.push(Object.assign({}, src, { personId: src.personId || p.id }));
      });
    });
    return out;
  }

  /* ---- Summed roll-ups. Each returns a Money Result, not a bare number,
         so "nothing entered" stays distinguishable from "$0".           */

  function sumAssetsByCategory(household, categories) {
    var list = aggregatableAssets(household).filter(function (a) {
      return !categories || categories.indexOf(a.category) !== -1;
    });
    var summed = Money.sumCents(list.map(function (a) { return a.valueCents; }));
    if (summed.counted === 0) {
      return Money.incomplete('Add an amount to see this.', ['assets']);
    }
    return Money.ok(summed.total);
  }

  function totalAssetsCents(household) {
    return sumAssetsByCategory(household, null);
  }

  /* The asset categories Start Here asks about, and everything else. The
     split matters because they have different owners under
     shared/ownership.js — Start Here owns the first two, the Net Worth room
     owns the rest. */
  var INTAKE_ASSET_CATEGORIES = ['cash', 'investment', 'retirement'];
  var ITEMISED_ASSET_CATEGORIES = ['real_estate', 'vehicle', 'other'];

  function otherAssetsCents(household) {
    return sumAssetsByCategory(household, ITEMISED_ASSET_CATEGORIES);
  }

  /** Cash only — Emergency Fund Coverage and Liquidity use cash, not cash +
   *  investments. SPEC.md §13, Tier 0 input spec. */
  function cashCents(household) {
    return sumAssetsByCategory(household, ['cash']);
  }

  /** Investments + retirement — the FIRE / retirement-benchmark numerator. */
  function investmentsCents(household) {
    return sumAssetsByCategory(household, ['investment', 'retirement']);
  }

  /* "No debt" (meta.hasDebt === false, D-061) is an answer: with nothing
     listed it reads as zero owed and zero a month, not as a blank. Left
     unanswered, an empty list is still incomplete — empty is not zero. */
  function saidNoDebt(household) {
    return !!(household && household.meta && household.meta.hasDebt === false);
  }
  function totalDebtCents(household) {
    var summed = Money.sumCents(aggregatableDebts(household).map(function (d) { return d.balanceCents; }));
    if (summed.counted === 0) {
      if (saidNoDebt(household)) return Money.ok(0, { none: true });
      return Money.incomplete('Add your debt balances to see this.', ['debts']);
    }
    return Money.ok(summed.total);
  }

  function monthlyDebtPaymentsCents(household) {
    var summed = Money.sumCents(aggregatableDebts(household).map(function (d) { return d.minPaymentCents; }));
    if (summed.counted === 0) {
      if (saidNoDebt(household)) return Money.ok(0, { none: true });
      return Money.incomplete('Add your monthly minimum payments to see this.', ['monthlyDebtPayments']);
    }
    return Money.ok(summed.total);
  }

  function grossAnnualIncomeCents(household) {
    var summed = Money.sumCents(allIncomeSources(household).map(function (s) {
      return s.grossAnnualIncomeCents;
    }));
    if (summed.counted === 0) {
      return Money.incomplete('Add your income to see this.', ['grossAnnualIncome']);
    }
    return Money.ok(summed.total);
  }

  /**
   * Employer match dollars across every W2 income source.
   * "50% up to 6% of salary" needs both numbers: the dollar value is
   *   salary × matchCapPercentOfSalary × matchPercent.
   * A source with no match configured contributes nothing but does not make
   * the whole roll-up incomplete — "no match" is a real answer.
   */
  function employerMatchCents(household) {
    var sources = allIncomeSources(household);
    var total = 0, counted = 0;
    for (var i = 0; i < sources.length; i++) {
      var s = sources[i];
      var m = s.employerMatch || {};
      if (!Money.isEntered(s.grossAnnualIncomeCents)) continue;
      if (!Money.isEntered(m.matchPercent) || !Money.isEntered(m.matchCapPercentOfSalary)) continue;
      total += Math.round(s.grossAnnualIncomeCents * m.matchCapPercentOfSalary * m.matchPercent);
      counted++;
    }
    if (counted === 0) return Money.incomplete('Add your employer match to see this.', ['employerMatch']);
    return Money.ok(total);
  }

  /* ---- Expenses ---------------------------------------------------------
     SPEC.md §12.3: tracked wins for "current", estimated stays queryable
     forever, divergence is its own computed field.                       */

  /** The figure any calculator should use as "monthly expenses" today. */
  function monthlyExpensesCents(household) {
    var e = (household && household.expenses && household.expenses.monthlyEssential) || {};
    if (Money.isEntered(e.trackedValueCents)) {
      return Money.ok(e.trackedValueCents, { source: 'tracked' });
    }
    if (Money.isEntered(e.estimatedValueCents)) {
      return Money.ok(e.estimatedValueCents, { source: 'estimated' });
    }
    return Money.incomplete('Add your monthly expenses to see this.', ['monthlyExpenses']);
  }

  /** tracked − estimated. Incomplete until both exist. */
  function expenseDivergenceCents(household) {
    var e = (household && household.expenses && household.expenses.monthlyEssential) || {};
    if (!Money.isEntered(e.trackedValueCents) || !Money.isEntered(e.estimatedValueCents)) {
      return Money.incomplete('Track a month of spending to compare it against your estimate.',
        ['trackedValue', 'estimatedValue']);
    }
    return Money.ok(e.trackedValueCents - e.estimatedValueCents);
  }

  /* ======================================================================
     Age.
     SPEC.md §13 says "derive age server-side, never trust client-calculated
     age." There is no server in this build — it is a static, client-only
     app — so age is derived here. It is centralised in ONE function so that
     when a server exists this is the single call site to swap. Logged as
     assumption A-004 in DECISIONS.md.
     ====================================================================== */

  /* The oldest age this app will treat as real. Above it, a date is far more
     likely to be a mistyped year than a supercentenarian, and every
     age-keyed reference table stops long before here anyway. */
  var MAX_PLAUSIBLE_AGE = 120;

  function rawAgeFromDob(dob, asOf) {
    if (!dob) return null;
    var birth = new Date(dob + 'T00:00:00Z');
    if (isNaN(birth.getTime())) return null;
    var now = asOf ? new Date(asOf + 'T00:00:00Z') : new Date();
    var age = now.getUTCFullYear() - birth.getUTCFullYear();
    var m = now.getUTCMonth() - birth.getUTCMonth();
    if (m < 0 || (m === 0 && now.getUTCDate() < birth.getUTCDate())) age--;
    return age >= 0 ? age : null;
  }

  /**
   * Age, or null if the date is missing, unreadable or implausible. Callers
   * that need to explain WHY it is null ask checkDob() instead — this one
   * exists so no lookup table is ever handed an age of 151.
   */
  function ageFromDob(dob, asOf) {
    var age = rawAgeFromDob(dob, asOf);
    if (age === null || age > MAX_PLAUSIBLE_AGE) return null;
    return age;
  }

  /**
   * Is this date of birth usable? Returns a Result rather than a bare
   * boolean, because "not answered" and "answered with something
   * impossible" are different states and the room needs to say which.
   *
   * Without this, a typo read as silence: a future date came back as null
   * from ageFromDob() and every age-based output went blank with no reason,
   * looking exactly like an unanswered question. And a year typo the other
   * way was worse — 1875 produced an age of 151, which the percentile table
   * and the retirement milestones accepted as a real number and answered
   * confidently.
   */
  function checkDob(dob, asOf) {
    if (!dob) return Money.incomplete('Not answered yet.', ['dob']);
    var birth = new Date(dob + 'T00:00:00Z');
    if (isNaN(birth.getTime())) {
      return Money.incomplete('That date isn’t one we can read.', ['dob']);
    }
    var now = asOf ? new Date(asOf + 'T00:00:00Z') : new Date();
    if (birth.getTime() > now.getTime()) {
      return Money.incomplete('That date is in the future.', ['dob']);
    }
    var age = rawAgeFromDob(dob, asOf);
    if (age === null) return Money.incomplete('That date isn’t one we can read.', ['dob']);
    if (age > MAX_PLAUSIBLE_AGE) {
      return Money.incomplete(
        'That works out to ' + age + ' years old — worth checking the year.', ['dob']);
    }
    return Money.ok(age);
  }

  /**
   * Whole months from now until an ISO date. Positive only — a date that has
   * passed is not "minus three months", it is a date that has passed, and
   * every caller has something different to say about that.
   *
   * Lives here rather than in a calculator because two of them need it
   * (a goal's target date, and a 0% promo's end date) and two copies of
   * calendar arithmetic is exactly how they drift apart. SPEC.md §8.
   */
  function monthsUntil(isoDate, asOf, opts) {
    var o = opts || {};
    var field = o.field || 'date';
    if (!isoDate) return Money.incomplete(o.missingReason || 'Add a date.', [field]);
    var target = new Date(isoDate + 'T00:00:00Z');
    if (isNaN(target.getTime())) {
      return Money.incomplete('That date can’t be read.', [field]);
    }
    var now = asOf ? new Date(asOf + 'T00:00:00Z') : new Date();
    var months = (target.getUTCFullYear() - now.getUTCFullYear()) * 12
      + (target.getUTCMonth() - now.getUTCMonth());
    /* Part of the current month still counts if the day hasn't passed. */
    if (target.getUTCDate() < now.getUTCDate()) months -= 1;
    if (months <= 0) {
      return Money.incomplete(o.passedReason || 'That date has passed, or is this month.',
        [field]);
    }
    return Money.ok(months);
  }

  /** Age of the primary adult — the person Tier 0 benchmarks against. */
  function primaryAge(household, asOf) {
    var a = adults(household);
    if (!a.length) return null;
    return ageFromDob(a[0].dob, asOf);
  }

  function primaryPerson(household) {
    var a = adults(household);
    return a.length ? a[0] : null;
  }

  return {
    SCHEMA_VERSION: SCHEMA_VERSION,
    ASSUMPTION_DEFAULTS: ASSUMPTION_DEFAULTS,
    FIELDS: FIELDS,
    isComputedField: isComputedField,
    newId: newId,
    createHousehold: createHousehold,
    createPerson: createPerson,
    EMPLOYMENT_STATUSES: EMPLOYMENT_STATUSES,
    employmentStatus: employmentStatus,
    householdEmployment: householdEmployment,
    BENEFIT_STATUSES: BENEFIT_STATUSES,
    createUnemployment: createUnemployment,
    isUnemployed: isUnemployed,
    unemploymentOf: unemploymentOf,
    benefitMonthlyCents: benefitMonthlyCents,
    couldHaveEmployerMatch: couldHaveEmployerMatch,
    capturingQuestionApplies: capturingQuestionApplies,
    capturingFullMatchDerived: capturingFullMatchDerived,
    hasDebtAnswered: hasDebtAnswered,
    TAX_CHARACTERS: TAX_CHARACTERS,
    createWorkProfile: createWorkProfile,
    WORK_DEFAULTS: WORK_DEFAULTS,
    createAsset: createAsset,
    createDebt: createDebt,
    createIncomeSource: createIncomeSource,
    createEstimatedTrackedPair: createEstimatedTrackedPair,
    createExpenseEntry: createExpenseEntry,
    createGoal: createGoal,
    createGoalLineItem: createGoalLineItem,
    createSwanTarget: createSwanTarget,
    createValuesProfile: createValuesProfile,
    createRatings: createRatings,
    createWorthCheck: createWorthCheck,
    createRetirement: createRetirement,
    createInsurance: createInsurance,
    createFutureIncome: createFutureIncome,
    createProperty: createProperty,
    createAllocation: createAllocation,
    createTargets: createTargets,
    createRerank: createRerank,
    createRerankRow: createRerankRow,
    createOneOff: createOneOff,
    createDependent: createDependent,
    createDependents: createDependents,
    HEALTH_TYPES: HEALTH_TYPES,
    createHealth: createHealth,
    createEstate: createEstate,
    createDecumulation: createDecumulation,
    createTaxFacts: createTaxFacts,
    createCareer: createCareer,
    createPartnerPlan: createPartnerPlan,
    createKidsPlan: createKidsPlan,
    createHousingPlan: createHousingPlan,
    createPurchasePlan: createPurchasePlan,
    createVariableIncomePlan: createVariableIncomePlan,
    SPLIT_MODES: SPLIT_MODES,
    createGiving: createGiving,
    SKILL_STATES: SKILL_STATES,
    SKILL_KINDS: SKILL_KINDS,
    createSkillState: createSkillState,
    createSkills: createSkills,
    createPracticeEntry: createPracticeEntry,
    allocationStatus: allocationStatus,
    createScenario: createScenario,
    assetRule: assetRule,
    assetAccessAge: assetAccessAge,
    assetLiquidity: assetLiquidity,
    resolveAssumptions: resolveAssumptions,
    withMonthlyExpensesDeltaCents: withMonthlyExpensesDeltaCents,
    personById: personById,
    primaryPerson: primaryPerson,
    workProfile: workProfile,
    adults: adults,
    isAggregatable: isAggregatable,
    ownedBy: ownedBy,
    aggregatableAssets: aggregatableAssets,
    aggregatableDebts: aggregatableDebts,
    allIncomeSources: allIncomeSources,
    totalAssetsCents: totalAssetsCents,
    otherAssetsCents: otherAssetsCents,
    INTAKE_ASSET_CATEGORIES: INTAKE_ASSET_CATEGORIES,
    ITEMISED_ASSET_CATEGORIES: ITEMISED_ASSET_CATEGORIES,
    cashCents: cashCents,
    investmentsCents: investmentsCents,
    totalDebtCents: totalDebtCents,
    monthlyDebtPaymentsCents: monthlyDebtPaymentsCents,
    grossAnnualIncomeCents: grossAnnualIncomeCents,
    employerMatchCents: employerMatchCents,
    monthlyExpensesCents: monthlyExpensesCents,
    expenseDivergenceCents: expenseDivergenceCents,
    MAX_PLAUSIBLE_AGE: MAX_PLAUSIBLE_AGE,
    ageFromDob: ageFromDob,
    monthsUntil: monthsUntil,
    checkDob: checkDob,
    primaryAge: primaryAge
  };
});
