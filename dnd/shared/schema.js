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
    expectedReturnRate: 0.07,   // nominal annual, decimal fraction
    swrRate: 0.04,             // safe withdrawal rate, decimal fraction
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
    'asset.category':                            { class: 'raw',        unit: 'enum',    values: ['cash', 'investment', 'retirement', 'real_estate', 'vehicle', 'other'] },
    'asset.liquid':                              { class: 'raw',        unit: 'bool' },
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
    'expenses.entries[].source':                 { class: 'raw',        unit: 'enum',    values: ['manual', 'imported'], note: 'SPEC.md §12.5' },
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
      type: f.type || 'w2',
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

  function createPerson(fields) {
    var f = fields || {};
    return {
      id: f.id || newId('p'),
      label: f.label || null,
      role: f.role || 'adult',
      dob: f.dob === undefined ? null : f.dob,     // ISO 'YYYY-MM-DD'
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
      ownerIds: f.ownerIds || []
    };
  }

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
      categorizedBy: f.categorizedBy === undefined ? null : f.categorizedBy
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
        ? null : f.highestDeductibleCents
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
      assumptions: Object.assign({}, ASSUMPTION_DEFAULTS, f.assumptions || {}),
      /* User overrides persist SEPARATELY from the defaults so "reset to
         default" is always possible — SPEC.md §3, assumption class. */
      assumptionOverrides: f.assumptionOverrides || {},
      meta: Object.assign({
        visitedRooms: [],
        createdAt: null,
        updatedAt: null
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

  function totalDebtCents(household) {
    var summed = Money.sumCents(aggregatableDebts(household).map(function (d) { return d.balanceCents; }));
    if (summed.counted === 0) {
      return Money.incomplete('Add your debt balances to see this.', ['debts']);
    }
    return Money.ok(summed.total);
  }

  function monthlyDebtPaymentsCents(household) {
    var summed = Money.sumCents(aggregatableDebts(household).map(function (d) { return d.minPaymentCents; }));
    if (summed.counted === 0) {
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
