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
  /* The product version, major.minor: the major is the shape, the minor a
     pass. version.json at the root carries the same string (a test holds
     them together); every export and share code is stamped with it and
     every room footer prints it. D-131. */
  var APP_VERSION = '2.0';
  /* The build stamp, the date and minute (UTC) of the last change to main: printed
     beside the version in every footer and in every backup, so a phone
     showing an old page can be told apart from a bug. version.json carries
     the same string; `node tools/stamp-build.js` sets both to today. D-202. */
  var BUILD = '2026-09-11 19:29Z';

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
    /* 15.2 (D-181): every engine output is real, today's money. The
       nominal 7% this key once carried is retired; the key stays because
       sixteen readers use it, and resolveAssumptions() always hands them
       the real return (returnReal, the median band). A stored 0.07 from an
       older save is the old default and reads as the real rate too. */
    expectedReturnRate: 0.05,
    LEGACY_NOMINAL_RETURN: 0.07,
    /* Pay grows this much a year over inflation, so a lever's "3% raise"
       is real, not nominal. Editable in Settings only. 15.2. */
    realWageGrowth: 0.01,
    /* Where the return bands come from. Engines never carry their own. */
    returnBands: 'return_bands.json',
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
    'household.filingStatus':                    { class: 'raw',        unit: 'enum',    values: ['single', 'married_joint', 'married_separate', 'head_of_household'], note: 'mfj, mfs and hoh are accepted on the way in and stored as these (Schema.FILING_ALIASES). 15.7, D-181' },
    'person.label':                              { class: 'raw',        unit: 'text',    note: 'the name (the prompt\'s `name`). Shown beside every per-person figure when two adults exist, nothing when one. Owned by Partner for the second adult. 15.7, D-181' },
    'person.birthYear':                          { class: 'computed',   unit: 'year',    note: 'read off dob by Schema.birthYearOf; a person given only a year is dated 1 July of it. 15.7, D-181' },
    'asset.owner':                               { class: 'computed',   unit: 'enum',    note: 'a person id or joint, read off ownerIds by Schema.ownerOf; accepted on the way in. 15.7, D-181' },
    'household.state':                           { class: 'raw',        unit: 'usps',    note: '2-letter state code; keys every column of data/states.json (Schema.stateCell). 15.6, D-181' },
    'household.zip':                             { class: 'raw',        unit: 'text',    note: 'optional five-digit ZIP, asked in Fine-tune; stored for a finer-than-state table, read by nothing yet. 15.6, D-181' },
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
    'household.oneOffs[].cents':                 { class: 'raw',        unit: 'cents',   note: 'a one-off coming, in (direction in) or out; `on` is the month. From the one-pager. D-094. Retired in D-130: the one-pager now writes a dated income entry (id oneoff_in) or a dated log entry (id oneoff_out), date estimated; this list is read only when neither exists (Schema.oneOffEntry)' },
    'person.unemployment.expectedSearchMonths':  { class: 'raw',        unit: 'months',  note: 'how long you expect the search to take; floorMonthlyCents is the bare-minimum month. Owned by Between Jobs. D-098' },
    'household.decumulation.stockShare':         { class: 'raw',        unit: 'ratio',   note: 'share of investments in stocks, for the VPW table; with plannedAnnualDrawCents and socialSecurityAt. Owned by Decumulation. D-098' },
    'household.tax.otherPreTaxAnnualCents':      { class: 'raw',        unit: 'cents',   note: 'pre-tax money beyond the workplace plan (HSA, traditional IRA), a year; withheldAnnualCents is what has been withheld. Owned by Tax. D-098' },
    'household.career.offer.grossAnnualCents':   { class: 'raw',        unit: 'cents',   note: 'an offer being weighed: with hoursPerWeek, commuteHoursPerWeek, workCostsMonthlyCents, signOnCents. Owned by Career Move. D-099' },
    'household.partner.splitMode':               { class: 'raw',        unit: 'enum',    values: ['equal', 'proportional', 'pooled'], note: 'how shared costs are split; sharedMonthlyCents is the shared month. Owned by Partner. D-099' },
    'household.kids.tuitionTargetCents':         { class: 'raw',        unit: 'cents',   note: 'a tuition target per child; tuitionSavedCents so far, tuitionMonthlyCents going in. Owned by Kids and Tuition. D-099' },
    'household.housing.priceCents':              { class: 'raw',        unit: 'cents',   note: 'a place being weighed: with rentMonthlyCents (a place you would rent INSTEAD — the rent you pay is Cash Flow\'s housing line, read through Schema.rentMonthlyCents, D-130), downPct (0–1), rate (mortgage, decimal). Owned by Housing Decision. D-099' },
    'household.purchase.priceCents':             { class: 'raw',        unit: 'cents',   note: 'a big purchase: with monthsAway, financeRate (decimal, null = cash), label. Owned by Big Purchase. D-099' },
    'household.variableIncome.bufferMonths':     { class: 'raw',        unit: 'months',  note: 'months of the low-to-average gap held as a buffer. Owned by Variable Income. D-099' },
    'household.variableIncome.windowMonths':     { class: 'raw',        unit: 'months',  values: [3, 6, 12], note: 'the rolling window the room averages the ledger\'s variable months over. Owned by Variable Income. D-128' },
    'household.enough.monthlyCents':             { class: 'raw',        unit: 'cents',   note: 'what you would live on by choice, a month; source curve|entered. Owned by Enough. D-101' },
    'household.designedWeek.blocks[].hours':     { class: 'raw',        unit: 'hours',   note: 'a block of the designed week; costCents a week; categoryId the expense line. Owned by Designed Week. D-101' },
    'household.timeBuckets[].decade':            { class: 'raw',        unit: 'age',     note: 'a decade (30 = your thirties) with experiences[] {label, costCents, year}. Owned by Time Buckets. D-101' },
    'household.dreams[].monthlyCents':           { class: 'raw',        unit: 'cents',   note: 'a dream priced a month. Owned by Dreamline. D-101' },
    'household.reversibility.decisionId':        { class: 'raw',        unit: 'id',      note: 'the decision being weighed, with given{} answers. Owned by Reversibility. D-101' },
    'household.unlearning.dropped':              { class: 'raw',        unit: 'ids',     note: 'rules from data/unlearning.json you have let go of. Owned by Unlearning. D-101' },
    'household.studentLoans.plan':               { class: 'raw',        unit: 'enum',    values: ['standard', 'income_driven', 'aggressive'], note: 'with extraMonthlyCents, idrShare (0–1 of discretionary income), forgivenessYears. Owned by Student Loan Decision. D-101' },
    'household.calendar.cadence':                { class: 'raw',        unit: 'enum',    values: ['weekly', 'fortnightly', 'semimonthly', 'monthly'], note: 'with nextPaydayDay (1–31), bills[] {label, cents, day}, payLater[] {label, cents, dueDay, instalmentsLeft}. Owned by Money Calendar. D-101' },
    'household.history.compareTo':               { class: 'raw',        unit: 'id',      note: 'the snapshot History compares today against. Owned by History. D-101' },
    'meta.fields':                               { class: 'raw',        unit: 'map',     note: '{ fieldId: { asOf, source, confidence, room } }: when a number was last set or confirmed, how it arrived (typed, pasted, imported, screenshot, migrated, block-default, quote) and how sure the person is (sure, roughly, unsure, unknown). Schema.meta reads it; the spine writes it. D-181' },
    'meta.guessed':                              { class: 'raw',        unit: 'map',     note: '{ fieldId: true } for figures the one-pager committed as guesses; cleared per field the moment a real number is written. D-094' },
    'household.expenses.needs.food.monthlyCents':          { class: 'raw', unit: 'cents', note: 'FAT: food a month. Owned by Expenses (D-192; Cash Flow before it). D-172' },
    'household.expenses.needs.accommodation.monthlyCents': { class: 'raw', unit: 'cents', note: 'FAT: rent, or mortgage plus tax plus insurance, one number a month. Owned by Expenses (D-192; Cash Flow before it). D-172' },
    'household.expenses.needs.transportation.monthlyCents':{ class: 'raw', unit: 'cents', note: 'FAT: getting around, a month. Owned by Expenses (D-192; Cash Flow before it). D-172' },
    'household.expenses.wants.totalCents':                 { class: 'raw', unit: 'cents', note: 'everything else a month, one number - whatever has not been split out. Owned by Expenses (D-192; Cash Flow before it). D-172' },
    'household.expenses.wants.therapy':                    { class: 'raw', unit: 'cents', note: 'OPTIONAL: { monthlyCents } only while "track mental health spending separately" is on; null (absent) when off. Owned by Expenses (D-192; Cash Flow before it). D-172' },
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
    'retirement.has401k':                        { class: 'raw',        unit: 'bool',    note: 'does an employer 401(k) exist to contribute to. null = not asked; the Max 401(k) preset is absent, not disabled, unless true. Asked once, by Budget. D-129' },
    'insurance.highestDeductibleCents':          { class: 'raw',        unit: 'cents',   note: 'the largest single deductible a cash cushion has to cover. Owned by Sleep At Night' },
    'assumptions.marginalRate':                  { class: 'assumption', unit: 'rate',    default: null, note: 'NO default \u2014 asked once, never derived from the effective-rate table' },
    'incomeSource.type':                         { class: 'raw',        unit: 'enum',    values: ['w2', '1099', 'passive', 'benefit', 'pension', 'socialSecurity', 'equity'], note: 'what kind of pay it is; decides the tax rules and whether it survives a job loss. 15.4, D-181' },
    'incomeSource.survivesJobLoss':              { class: 'raw',        unit: 'bool',    note: 'keeps paying if the job goes. null = derived from the type (everything but a W-2 job survives); true/false is the person saying otherwise. Read through Schema.survivesJobLoss. 15.4, D-181' },
    'incomeSource.passiveTreatment':             { class: 'raw',        unit: 'enum',    values: ['ordinary', 'qualified'], note: 'passive income only: ordinary (rent, interest) or qualified (dividends, long-term gains). null reads as ordinary. 15.4, D-181' },
    'incomeSource.employerMatch.matchPercent':          { class: 'raw', unit: 'rate',    note: '0.5 === employer matches 50 cents on the dollar' },
    'incomeSource.employerMatch.matchCapPercentOfSalary': { class: 'raw', unit: 'rate',  note: '0.06 === capped at the first 6% of salary' },
    'asset.valueCents':                          { class: 'raw',        unit: 'cents' },
    'asset.taxCharacter':                        { class: 'raw',        unit: 'enum',    values: ['pretax', 'roth', 'taxable', 'hsa', '529', 'daf', 'cash', 'property', 'business', 'other', 'unknown'], note: 'how the account is taxed. null means not asked; unknown means the person entered only a total. Its orientation (pretax / roth / taxable / hsa, 15.3) is read from it by Schema.orientationOf, never stored twice. BRIEF §3.1, D-061, D-181' },
    'meta.hasDebt':                              { class: 'raw',        unit: 'bool',    note: 'null not asked; false means "no debt" as an answer, which takes Debt Payoff off the path. D-061' },
    'asset.category':                            { class: 'raw',        unit: 'enum',    values: ['cash', 'investment', 'retirement', 'real_estate', 'vehicle', 'other'] },
    'asset.liquid':                              { class: 'raw',        unit: 'bool',    note: 'reachable this month. Kept for every reader that already uses it; written from `liquidity` when that is set (liquid === liquidity <= 2). D-066' },
    'asset.liquidity':                           { class: 'raw',        unit: 'enum',    values: [1, 2, 3, 4], note: '1 today · 2 within 30 days · 3 within 12 months · 4 cannot/will not sell. null = not rated; the access_rules default is then PROPOSED, never stored. D-066' },
    'asset.tier':                                { class: 'raw',        unit: 'enum',    values: ['cash', 'taxable', 'retirement', 'property', 'other'], note: 'which pile it sits in for a runway. null = derived by Schema.tierOf from the tax character, else the category; a stored value is the override the Statement writes. 15.8, D-181' },
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
    'debt.type':                                 { class: 'raw',        unit: 'enum',    values: ['credit_card', 'student_loan', 'auto', 'mortgage', 'personal', 'family', 'medical', 'other'], note: 'family = borrowed from family or a friend, usually interest-free and due by a date. D-124' },
    'debt.interestFree':                         { class: 'raw',        unit: 'bool',    note: 'true = no interest is charged, ever; the rate is stored as 0 alongside so every reader agrees. null not asked. D-124' },
    'debt.archived':                             { class: 'raw',        unit: 'bool',    note: 'true = paid off or set aside; kept for the record, read by nothing that aggregates or plans. Restorable. D-124' },
    'debt.borrowedOn':                           { class: 'raw',        unit: 'iso-date', note: 'when the money was borrowed. Null means not asked' },
    'debt.dueOn':                                { class: 'raw',        unit: 'iso-date', note: 'when it is due back in full. On a family loan with no monthly amount, the minimum is the balance over the months left. D-124' },
    'debt.keepReasons[]':                        { class: 'raw',        unit: 'enum',    values: ['low_rate', 'tax_favoured', 'appreciating', 'building_credit', 'subsidised'], note: 'why this debt might be fine to carry on purpose - the rational axis, independent of emotionalTag. A list: more than one can apply, and an empty list is "no particular reason to keep it". Suggested from the debt\'s own type and rate at entry time, stored only when confirmed. Never changes the payoff order by itself. Owned by Debt Payoff. D-132' },
    'debt.excludeFromAggressive':                { class: 'raw',        unit: 'bool',    note: 'the household\'s decision that this debt is kept on purpose: the payoff plan orders it last and sends it only its minimum. The keep reasons inform this and never set it. Owned by Debt Payoff. D-132' },
    'debt.creditLimitCents':                     { class: 'raw',        unit: 'cents',   note: 'revolving debt only \u2014 the limit the balance is a share of. Owned by Debt Payoff. DECISIONS.md D-045' },
    'debt.promoEndsOn':                          { class: 'raw',        unit: 'iso-date', note: 'when a 0%/promotional rate ends. Null means the rate is not promotional' },
    'debt.postPromoRate':                        { class: 'raw',        unit: 'rate',    period: 'annual', note: 'the rate the balance reverts to when the promo ends' },
    'expenses.monthlyEssential.estimatedValueCents': { class: 'raw',    unit: 'cents',   period: 'monthly', source: 'estimated', note: 'LEGACY, unread since D-172: migrated into wants.totalCents on load, kept for round-trip' },
    'expenses.monthlyEssential.trackedValueCents':   { class: 'raw',    unit: 'cents',   period: 'monthly', source: 'tracked', note: 'LEGACY, unread since D-172' },
    'expenses.monthlyEssential.divergenceCents':     { class: 'computed', unit: 'cents', period: 'monthly', note: 'now the split’s lines minus the four typed numbers (Schema.expenseDivergenceCents, D-172)' },
    'expenses.entries[].categoryId':             { class: 'raw',        unit: 'enum',    note: 'an id from data/expense_categories.json' },
    'expenses.entries[].cadence':                { class: 'computed',   unit: 'enum',    values: ['monthly', 'annual', 'oneoff'], note: 'read off period by Schema.cadenceOf, never stored: monthly, or oneoff for a dated one-off. 15.5, D-181' },
    'expenses.annual[].label':                   { class: 'raw',        unit: 'text',    note: 'a named yearly cost: insurance, gifts, registration. Owned by Cash Flow. 15.5, D-181' },
    'expenses.annual[].bucket':                  { class: 'raw',        unit: 'enum',    values: ['food', 'accommodation', 'transportation', 'wants'], note: 'the bucket it sits inside; a twelfth joins that bucket every month. 15.5, D-181' },
    'expenses.annual[].amountCents':             { class: 'raw',        unit: 'cents',   period: 'annual', note: 'a year of it. 15.5, D-181' },
    'expenses.annual[].monthDue':                { class: 'raw',        unit: 'month',   note: '1 to 12: the month it is paid; the Money Calendar draws it there. null = spread only. 15.5, D-181' },
    'expenses.annual[].cadence':                 { class: 'raw',        unit: 'enum',    values: ['annual'], note: 'always annual. 15.5, D-181' },
    'expenses.entries[].amountCents':            { class: 'raw',        unit: 'cents' },
    'expenses.entries[].period':                 { class: 'raw',        unit: 'enum',    values: ['monthly', 'once'] },
    'expenses.entries[].every':                  { class: 'raw',        unit: 'enum',    values: ['weekly', 'fortnightly', 'monthly', 'quarterly', 'annual'], note: 'how often a named line repeats, as it was known; amountCents is always the month (Schema.monthlyFromEvery). Null on a line typed as a month. D-196' },
    'expenses.entries[].everyCents':             { class: 'raw',        unit: 'cents',   note: 'the amount as typed, per `every`, read back by Expenses so $120 a year shows as $120 a year and not $10 a month. D-196' },
    'expenses.entries[].source':                 { class: 'raw',        unit: 'enum',    values: ['manual', 'imported', 'rerank', 'log'], note: 'SPEC.md §12.5; rerank = a custom cost line typed on The Rerank, D-085; log = a dated occurrence logged in the Expenses section, counted by the budget as an actual and never as the typical month, D-128' },
    'expenses.entries[].linkedIncomeId':         { class: 'raw',        unit: 'id',      note: 'the ledger income entry this expense produces; null = personal. D-128' },
    'expenses.entries[].deductible':             { class: 'raw',        unit: 'bool',    note: 'true only when linkedIncomeId is set — enforced by createExpenseEntry, so a personal expense can never reduce taxable income. D-128' },
    'expenses.entries[].hidden':                 { class: 'raw',        unit: 'bool',    note: 'off the default list, still counted. D-128' },
    'expenses.entries[].active':                 { class: 'raw',        unit: 'bool',    note: 'false = archived: stops counting toward new estimates and actuals; closed months are untouched. D-128' },
    'household.ledger.income[].kind':            { class: 'raw',        unit: 'enum',    values: ['w2', 'se', 'bonus', 'gift', 'side', 'dividend', 'rental', 'other'], note: 'a dated income entry: amountCents, frequency (once, weekly, fortnightly, monthly, annual), receivedOn, taxable, taxMethod (w2, se, none), costs[] for se/side/rental, hidden, active. Owned by Income. D-128' },
    'household.ledger.income[].dateKind':        { class: 'raw',        unit: 'enum',    values: ['exact', 'estimated', 'potential'], note: 'how sure the date is — the same three as an expense: potential income (a bonus that may not come) is drawn, never counted. D-130' },
    'household.ledger.income[].taxMethod':       { class: 'raw',        unit: 'enum',    values: ['w2', 'se', 'unemployment', 'none'], note: 'taxed how: withheld at the source; owed with self-employment tax on the net of costs; owed as ordinary income with no SE tax (unemployment); or not taxable. Four, no catch-all. D-128, D-129' },
    'expenses.entries[].dateKind':               { class: 'raw',        unit: 'enum',    values: ['exact', 'estimated', 'potential'], note: 'how sure the date is: exact (it happened / it is due), estimated (about then), potential (might not happen at all). Actual counts exact and estimated; potential is drawn on the calendar and reported apart, never counted. D-130' },
    'expenses.entries[].produced':               { class: 'raw',        unit: 'enum',    values: ['personal', 'linked', 'reimbursable'], note: 'what the expense produced: nothing (personal, never deductible); an income entry (linkedIncomeId, the only deductible path); or a repayment expected from someone (reimbursable: never deductible, counts in full while pending, a credit in the month received). D-129' },
    'expenses.entries[].reimbursableFrom':       { class: 'raw',        unit: 'text',    note: 'who is paying it back. D-129' },
    'expenses.entries[].expectedAmountCents':    { class: 'raw',        unit: 'cents',   note: 'what is expected back; defaults to the amount. D-129' },
    'expenses.entries[].reimbursementStatus':    { class: 'raw',        unit: 'enum',    values: ['pending', 'received'], note: 'pending counts in full; received posts a credit dated dateReceived, never into the original month. D-129' },
    'expenses.entries[].dateReceived':           { class: 'raw',        unit: 'iso-date', note: 'the day the repayment landed; the credit sits in that month. D-129' },
    'expenses.entries[].receivedAmountCents':    { class: 'raw',        unit: 'cents',   note: 'what actually came back; defaults to expectedAmountCents. D-129' },
    'household.ledger.income[].costs[].category': { class: 'raw',       unit: 'enum',    values: ['mileage', 'home_office', 'equipment', 'contractor_fees', 'licensing', 'platform_fees', 'other'], note: 'the costs of producing this income, on the entry itself; each with amountCents, date, deductible. D-128' },
    'household.ledger.months[].id':              { class: 'raw',        unit: 'id',      note: 'a MonthRecord, YYYY-MM: status closed, estimated and actual per bucket (income, expenses, savings, investments, debt), actualRevised for late entries, closedAt. Append-only; closing twice is refused. Owned by Budget. D-128' },
    'household.budget.estimated':                { class: 'raw',        unit: 'object',  note: 'YYYY-MM → bucket → cents: an open month\'s estimate set by hand (the Estimated-vs-Actual room\'s one write). Absent = last closed month\'s actual, else the onboarding figures. Owned by Budget. D-128' },
    'household.notApplicable':                   { class: 'raw',        unit: 'object',  note: 'key → true: a structural option the household marked Not applicable (a preset id such as max401k or maxIra, or an ownership field id). Excluded from every live figure; ownership rows read it as not applicable, never as missing. Still reachable in the Budget room\'s Hypothetical mode, which never writes. Owned by Budget. D-129' },
    'household.budget.presets':                  { class: 'raw',        unit: 'object',  note: 'YYYY-MM → bucket → [preset id]: the Savings / Investments presets stacked into that month\'s Estimated (ruleOfFive, emergencyFund, maxIra, max401k — engines/presets.js). They stack on a hand-set figure and replace the fallback ones. Owned by Budget. D-129' },
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
    'skillTree.state[id].state':                 { class: 'raw',        unit: 'enum',    values: ['done'], note: 'the Skill Tree\'s standing per skill: only done is stored, with `on` (ISO day) and `by` (proof | self); open, locked, bypassed, fogged and not-yours are derived by engines/skilltree.js every time and never written. Owned by the Skill Tree. D-131' },
    'exercises.done[id]':                        { class: 'raw',        unit: 'date',    note: 'ISO day an exercise was completed; completing one boosts its skill to Open, never to Done. Owned by Exercises. D-131' },
    'exercises.results[id]':                     { class: 'raw',        unit: 'object',  note: 'what a `run` exercise computed when it was completed, kept so it can be compared later. Owned by Exercises. D-131' },
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
    'assumptions.expectedReturnRate':            { class: 'assumption', unit: 'rate',    default: ASSUMPTION_DEFAULTS.expectedReturnRate, note: 'real, and always the median return band unless overridden on purpose; the nominal 7% is retired. 15.2, D-181' },
    'assumptions.realWageGrowth':                { class: 'assumption', unit: 'rate',    default: ASSUMPTION_DEFAULTS.realWageGrowth, note: 'pay growth over inflation a year; a lever raise is real. Settings only. 15.2, D-181' },
    'assumptions.returnBands':                   { class: 'assumption', unit: 'text',    default: ASSUMPTION_DEFAULTS.returnBands, note: 'the file the low / likely / high bands come from; no engine keeps its own rate. 15.2, D-181' },
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
  /* ---- 15.4: income by type (D-181) --------------------------------------
     Six types. What survives a job loss is derived from the type unless the
     person says otherwise: a W-2 job stops; contract work, rent and
     dividends, a benefit, a pension and Social Security keep paying. Every
     job-loss shock (the Long Way Round, Runway, Between Jobs) zeroes only
     the sources that do not survive. */
  /* `equity` (RSUs, stock pay) is the seventh: it is what the situation
     switch equityComp reads (D-180); it is taxed as wages and stops with
     the job. */
  var INCOME_TYPES = ['w2', '1099', 'passive', 'benefit', 'pension', 'socialSecurity', 'equity'];
  var INCOME_TYPE_LABELS = { w2: 'A job (W-2)', '1099': 'Contract or own work (1099)', passive: 'Rent, dividends, royalties', benefit: 'A benefit', pension: 'A pension', socialSecurity: 'Social Security', equity: 'Stock or equity pay' };
  function survivesJobLoss(source) {
    var s = source || {};
    if (s.survivesJobLoss === true || s.survivesJobLoss === false) return s.survivesJobLoss;
    var t = s.type || 'w2';
    return t !== 'w2' && t !== 'equity';
  }
  function survivingIncomeSources(household) {
    return allIncomeSources(household).filter(survivesJobLoss);
  }
  /** The gross a year that keeps coming when the job goes: ok(0) when
      everything stops, incomplete only when no income is known at all. */
  function survivingGrossAnnualIncomeCents(household) {
    var all = grossAnnualIncomeCents(household);
    if (!Money.isOk(all)) return all;
    var summed = Money.sumCents(survivingIncomeSources(household).map(function (s) { return s.grossAnnualIncomeCents; }));
    return Money.ok(summed.counted ? summed.total : 0, { grossAnnualIncomeCents: all.value, share: all.value > 0 ? (summed.counted ? summed.total : 0) / all.value : 0 });
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
      variableLowCents: Money.isEntered(f.variableLowCents) ? f.variableLowCents : null,
      variableHighCents: Money.isEntered(f.variableHighCents) ? f.variableHighCents : null,
      /* 15.4: one of six. A value from before (only w2 and 1099 existed)
         reads as it was; anything else is a job. D-181. */
      type: INCOME_TYPES.indexOf(f.type) >= 0 ? f.type : 'w2',
      /* Keeps paying if the job goes. null means "derived from the type"
         (everything but a W-2 job survives); true or false is the person
         saying otherwise. Read through Schema.survivesJobLoss. 15.4. */
      survivesJobLoss: f.survivesJobLoss === true ? true : f.survivesJobLoss === false ? false : null,
      /* Passive only: ordinary (rent, interest, royalties) or qualified
         (dividends, long-term gains) treatment. null = ordinary. 15.4. */
      passiveTreatment: f.passiveTreatment === 'qualified' ? 'qualified' : f.passiveTreatment === 'ordinary' ? 'ordinary' : null,
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

  /* ---- 15.7: a household of two, natively (D-181) --------------------------
     `people[]` holds one or two adults. The prompt's `name` is the stored
     `label`; its `birthYear` is read off `dob` (Start Here asks month and
     year, so the date is the finer fact and the year a view of it). Given
     only a birth year, the date is taken as 1 July of it, the expected
     midpoint. The prompt's filing words (mfj, mfs, hoh) are accepted and
     stored as the values the bracket tables key on. */
  var FILING_ALIASES = { single: 'single', mfj: 'married_joint', married_joint: 'married_joint', mfs: 'married_separate', married_separate: 'married_separate', hoh: 'head_of_household', head_of_household: 'head_of_household' };
  function filingStatusOf(v) { return v && FILING_ALIASES[v] ? FILING_ALIASES[v] : (v === undefined ? null : v); }
  function birthYearOf(person) {
    var m = /^(\d{4})-\d{2}-\d{2}$/.exec((person && person.dob) || '');
    return m ? parseInt(m[1], 10) : null;
  }
  function personName(person, fallback) {
    return (person && typeof person.label === 'string' && person.label.trim()) ? person.label.trim() : (fallback === undefined ? null : fallback);
  }
  function householdOfTwo(household) { return adults(household).length >= 2; }
  /** The tag beside a per-person figure: the name when two people exist,
      nothing when one. `person` may be a person or an id. */
  function personTag(household, person) {
    if (!householdOfTwo(household)) return '';
    var p = typeof person === 'string' ? personById(household, person) : person;
    var a = adults(household);
    var i = p ? a.map(function (x) { return x.id; }).indexOf(p.id) : -1;
    return personName(p, i === 0 ? 'You' : i === 1 ? 'The other of you' : '') || '';
  }
  /** Who owns an asset or a debt: a person id, or 'joint' (no owner listed,
      or more than one). Read off ownerIds, never stored twice. */
  function ownerOf(record) {
    var ids = (record && record.ownerIds) || [];
    return ids.length === 1 ? ids[0] : 'joint';
  }
  function ownerIdsFrom(f) {
    if (Array.isArray(f.ownerIds)) return f.ownerIds;
    if (typeof f.owner === 'string' && f.owner && f.owner !== 'joint') return [f.owner];
    return [];
  }

  function createPerson(fields) {
    var f = fields || {};
    var dob = f.dob === undefined || f.dob === null ? null : f.dob;
    if (dob === null && Money.isEntered(f.birthYear) && f.birthYear >= 1900 && f.birthYear <= 2100) dob = Math.round(f.birthYear) + '-07-01';
    return {
      id: f.id || newId('p'),
      label: (typeof f.label === 'string' && f.label) ? f.label : (typeof f.name === 'string' && f.name ? f.name : null),
      role: f.role || 'adult',
      dob: dob,     // ISO 'YYYY-MM-DD'
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
      ownerIds: ownerIdsFrom(f),   /* `owner: personId | 'joint'` is accepted (15.7) */
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
      accessAgeOverride: f.accessAgeOverride === undefined ? null : f.accessAgeOverride,
      /* 15.8: which pile it sits in for a runway (TIERS). null = derived
         from the tax character, else the category, by tierOf(); a stored
         value is the owner's override. D-181. */
      tier: TIERS.indexOf(f.tier) >= 0 ? f.tier : null
    };
  }

  /* ---- 15.3: orientation and the value after deferred tax (D-181) --------
     Every invested holding has an orientation: pretax, roth, taxable or
     hsa. It is READ from the tax character the Statement already asks for
     (and from the category when nobody has said), never stored twice. A
     holding that is not invested (cash, property, a business, a fund
     already given away) has no orientation and is worth what it is listed
     at. `assumed` says when the answer is a guess: an uncharacterised lump
     is read as taxable, a retirement account with no character as pre-tax,
     an investment with no character as taxable. */
  var ORIENTATIONS = ['pretax', 'roth', 'taxable', 'hsa'];
  var ORIENTATION_BY_CHARACTER = { pretax: 'pretax', roth: 'roth', taxable: 'taxable', hsa: 'hsa', '529': 'roth' };
  var ORIENTATION_BY_CATEGORY = { retirement: 'pretax', investment: 'taxable' };
  var TAXABLE_BASIS_SHARE = 0.6;
  function orientationOf(asset) {
    var a = asset || {};
    var tc = a.taxCharacter;
    if (tc && ORIENTATION_BY_CHARACTER[tc]) return { orientation: ORIENTATION_BY_CHARACTER[tc], assumed: false };
    if (tc === 'unknown') return { orientation: 'taxable', assumed: true };
    if (tc) return { orientation: null, assumed: false };
    if (ORIENTATION_BY_CATEGORY[a.category]) return { orientation: ORIENTATION_BY_CATEGORY[a.category], assumed: true };
    return { orientation: null, assumed: false };
  }
  /**
   * afterTaxValue(holding, household, rates) → Result
   *   rates: { withdrawalRate, capitalGainsRate } from engines/tax
   *   (the marginal bracket at projected FI spending, never today's).
   *   pretax × (1 − withdrawalRate); roth and hsa × 1; taxable × (1 − the
   *   gains rate on the unrealized gain share), where the gain needs a cost
   *   basis and 60% of the value stands in when there is none, flagged.
   *   Meta: orientation, deferredTaxCents, basisCents, assumed[].
   */
  function afterTaxValue(holding, household, rates) {
    var a = holding || {};
    if (!Money.isEntered(a.valueCents)) return Money.incomplete('Add an amount to see this.', ['assets']);
    var o = orientationOf(a);
    var assumed = o.assumed ? ['orientation'] : [];
    var deferred = 0, basis = null;
    if (o.orientation === 'pretax') {
      if (!rates || !Money.isEntered(rates.withdrawalRate)) return Money.incomplete('The withdrawal rate is not known.', ['withdrawalRate']);
      deferred = Math.round(a.valueCents * rates.withdrawalRate);
    } else if (o.orientation === 'taxable') {
      if (!rates || !Money.isEntered(rates.capitalGainsRate)) return Money.incomplete('The capital gains rate is not known.', ['capitalGainsRate']);
      if (Money.isEntered(a.costBasisCents)) basis = a.costBasisCents;
      else { basis = Math.round(a.valueCents * TAXABLE_BASIS_SHARE); assumed.push('basis'); }
      deferred = Math.round(Math.max(0, a.valueCents - basis) * rates.capitalGainsRate);
    }
    return Money.ok(a.valueCents - deferred, {
      orientation: o.orientation,
      listedCents: a.valueCents,
      deferredTaxCents: deferred,
      basisCents: basis,
      assumed: assumed
    });
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

  /* ---- 15.8: liquidity tiers and the one runway function (D-181) --------
     Every asset sits in one of five piles: cash, taxable, retirement,
     property, other. The pile is READ from the tax character the Statement
     asks for (a lump entered as one total is retirement money until split),
     else from the category, and an owner can override it on the asset
     (`asset.tier`). A runway draws the piles in order — cash, then taxable
     (net of the gains tax on the unrealized gain), then retirement (net of
     the withdrawal tax and the early penalty below the access age) — and
     never property. Runway, Between Jobs, the Long Way Round job loss and
     the Dungeons & Dividends HP all read runwayMonths(); the Statement's
     ladder is a view of the same piles. */
  var TIERS = ['cash', 'taxable', 'retirement', 'property', 'other'];
  var TIER_LABELS = { cash: 'Cash', taxable: 'Taxable investments', retirement: 'Retirement accounts', property: 'Property', other: 'Other' };
  var TIER_BY_CHARACTER = { cash: 'cash', taxable: 'taxable', pretax: 'retirement', roth: 'retirement', hsa: 'retirement', unknown: 'retirement', '529': 'other', daf: 'other', property: 'property', business: 'other', other: 'other' };
  var TIER_BY_CATEGORY = { cash: 'cash', investment: 'taxable', retirement: 'retirement', real_estate: 'property', vehicle: 'other', other: 'other' };
  var DRAWABLE_TIERS = ['cash', 'taxable', 'retirement'];
  var DRAW_ORDER_DEFAULT = ['cash', 'taxable', 'retirement'];
  /* IRC 72(t): 10% below 59½ on pre-tax and on Roth earnings; an HSA spent
     on anything but medical care below 65 pays 20%. Statute, stable. */
  var EARLY_PENALTY = { pretax: 0.10, roth: 0.10, unknown: 0.10, hsa: 0.20 };
  var ACCESS_AGE_DEFAULT = 59.5;
  var ACCESS_AGE_BY_CHARACTER = { hsa: 65 };

  /** tierOf(asset) → { tier, derived, from: 'stored' | 'kind' | 'liquid' | 'category' } */
  function tierOf(asset) {
    var a = asset || {};
    if (a.tier && TIERS.indexOf(a.tier) >= 0) return { tier: a.tier, derived: false, from: 'stored' };
    if (a.taxCharacter && TIER_BY_CHARACTER[a.taxCharacter]) return { tier: TIER_BY_CHARACTER[a.taxCharacter], derived: true, from: 'kind' };
    var byCat = TIER_BY_CATEGORY[a.category] || 'other';
    /* An uncharacterised "other" thing the owner flagged as liquid is
       reachable money, so it draws with the taxable pile. */
    if (byCat === 'other' && a.liquid === true) return { tier: 'taxable', derived: true, from: 'liquid' };
    return { tier: byCat, derived: true, from: 'category' };
  }
  function tierLabel(tier) { return TIER_LABELS[tier] || tier; }

  /* The retirement character a tier-retirement asset draws as: the stated
     one, else pre-tax (assumed). */
  function retirementCharacterOf(asset) {
    var tc = asset && asset.taxCharacter;
    if (tc === 'roth' || tc === 'hsa' || tc === 'pretax') return { character: tc, assumed: false };
    return { character: 'pretax', assumed: tc !== 'unknown' };
  }

  /**
   * drawOf(asset, tier, ctx) — what one asset puts into a runway: its gross
   * value, the tax and penalty on the way out, and the net.
   *   ctx.rates  { withdrawalRate, capitalGainsRate } or null: with no rates
   *              the draw is before tax and says so (taxApplied false)
   *   ctx.rules  access_rules, for the access age; the statute defaults
   *              stand in when the table is not loaded
   *   ctx.age    the primary adult's age; unknown = the gate is assumed shut
   */
  function drawOf(asset, tier, ctx) {
    var a = asset || {}, c = ctx || {};
    var v = a.valueCents, rates = c.rates || null;
    var out = { grossCents: v, taxCents: 0, penaltyCents: 0, netCents: v, gated: false, accessAge: null, basisFreeCents: 0, assumed: [] };
    if (tier === 'cash') return out;
    if (tier === 'taxable') {
      var basis;
      if (Money.isEntered(a.costBasisCents)) basis = a.costBasisCents;
      else { basis = Math.round(v * TAXABLE_BASIS_SHARE); out.assumed.push('basis'); }
      var gain = Math.max(0, v - basis);
      if (rates && Money.isEntered(rates.capitalGainsRate)) out.taxCents = Math.round(gain * rates.capitalGainsRate);
      out.netCents = v - out.taxCents;
      return out;
    }
    if (tier === 'retirement') {
      var rc = retirementCharacterOf(a);
      if (rc.assumed) out.assumed.push('orientation');
      var accessAge = c.rules ? assetAccessAge(a, c.rules)
        : Money.isEntered(a.accessAgeOverride) ? a.accessAgeOverride
        : (ACCESS_AGE_BY_CHARACTER[rc.character] || ACCESS_AGE_DEFAULT);
      out.accessAge = accessAge;
      var ageKnown = Money.isEntered(c.age);
      out.gated = Money.isEntered(accessAge) && (!ageKnown || c.age < accessAge);
      if (!ageKnown && Money.isEntered(accessAge)) out.assumed.push('age');
      var rate = rates && Money.isEntered(rates.withdrawalRate) ? rates.withdrawalRate : 0;
      var taxed = v;
      if (rc.character === 'roth') {
        /* Contributions come out any time, untaxed; the earnings wait. */
        var free = Money.isEntered(a.costBasisCents) ? Math.min(a.costBasisCents, v) : 0;
        if (!Money.isEntered(a.costBasisCents)) out.assumed.push('basis');
        out.basisFreeCents = free;
        taxed = v - free;
        /* Qualified (past the gate) Roth earnings are tax-free too. */
        if (!out.gated) rate = 0;
      }
      out.taxCents = Math.round(taxed * rate);
      out.penaltyCents = out.gated ? Math.round(taxed * (EARLY_PENALTY[rc.character] || 0)) : 0;
      out.netCents = v - out.taxCents - out.penaltyCents;
      return out;
    }
    /* property, other: never drawn. */
    out.netCents = 0;
    return out;
  }

  /**
   * tierDraws(household, drawOrder, opts) — the piles a runway may draw, in
   * order, each with gross, tax, penalty and net, plus the piles it never
   * touches. opts: rates, rules, age, asOf. Does not need the spending.
   */
  function tierDraws(household, drawOrder, opts) {
    var h = household || {}, o = opts || {};
    var order = (Array.isArray(drawOrder) && drawOrder.length ? drawOrder : DRAW_ORDER_DEFAULT)
      .filter(function (t, i, arr) { return DRAWABLE_TIERS.indexOf(t) >= 0 && arr.indexOf(t) === i; });
    var age = Money.isEntered(o.age) ? o.age : primaryAge(h, o.asOf);
    var ctx = { rates: o.rates && Money.isEntered(o.rates.withdrawalRate) ? o.rates : null, rules: o.rules || null, age: age };
    var steps = {};
    order.forEach(function (t) { steps[t] = { tier: t, label: tierLabel(t), grossCents: 0, taxCents: 0, penaltyCents: 0, netCents: 0, gatedCents: 0, count: 0, assets: [] }; });
    var never = { grossCents: 0, byTier: {}, count: 0 };
    var assumed = [], counted = 0, gross = 0, net = 0, tax = 0, penalty = 0;
    aggregatableAssets(h).forEach(function (a) {
      if (!Money.isEntered(a.valueCents)) return;
      var t = tierOf(a).tier;
      if (!steps[t]) { never.grossCents += a.valueCents; never.byTier[t] = (never.byTier[t] || 0) + a.valueCents; never.count++; return; }
      var d = drawOf(a, t, ctx);
      var s = steps[t];
      counted++; s.count++;
      s.grossCents += d.grossCents; s.taxCents += d.taxCents; s.penaltyCents += d.penaltyCents; s.netCents += d.netCents;
      if (d.gated) s.gatedCents += d.grossCents - d.basisFreeCents;
      s.assets.push({ asset: a, draw: d });
      d.assumed.forEach(function (k) { if (assumed.indexOf(k) === -1) assumed.push(k); });
      gross += d.grossCents; net += d.netCents; tax += d.taxCents; penalty += d.penaltyCents;
    });
    return {
      drawOrder: order,
      steps: order.map(function (t) { return steps[t]; }),
      never: never,
      count: counted,
      grossCents: gross, taxCents: tax, penaltyCents: penalty, netCents: net,
      taxApplied: !!ctx.rates,
      taxRate: ctx.rates ? ctx.rates.withdrawalRate : null,
      capitalGainsRate: ctx.rates && Money.isEntered(ctx.rates.capitalGainsRate) ? ctx.rates.capitalGainsRate : null,
      ageKnown: Money.isEntered(age),
      age: Money.isEntered(age) ? age : null,
      assumed: assumed
    };
  }

  /**
   * runwayMonths(household, drawOrder, opts) → Result, months
   *   The one runway: every drawable pile in order, net of tax and penalty,
   *   over a month's spending. opts.monthlyExpensesCents overrides the
   *   household's spending (a room's floor, a scenario's outflow); the rest
   *   is tierDraws' opts. Meta: steps (each with monthsThis and the
   *   cumulative months at its end), cashMonths, beyondCashMonths,
   *   beyondCashCents, weeks, and the tax/penalty/age flags to say on screen.
   */
  function runwayMonths(household, drawOrder, opts) {
    var o = opts || {};
    var spend = Money.isEntered(o.monthlyExpensesCents) ? o.monthlyExpensesCents : null;
    if (spend === null) { var m = monthlyExpensesCents(household || {}); spend = Money.isOk(m) ? m.value : null; }
    if (!Money.isEntered(spend)) return Money.incomplete('Add your monthly spending to see how long the money lasts.', ['monthlyExpenses']);
    if (spend <= 0) return Money.incomplete('Monthly expenses need to be above zero to measure runway.', ['monthlyExpenses']);
    var d = tierDraws(household, drawOrder, o);
    if (!d.count) return Money.incomplete('Add what you have saved to see how long it lasts.', ['cash']);
    var cumulative = 0;
    d.steps.forEach(function (s) {
      s.monthsThis = Math.round(s.netCents / spend * 10) / 10;
      cumulative += s.netCents;
      s.monthsCumulative = Math.round(cumulative / spend * 10) / 10;
    });
    var cashNet = d.steps.length && d.steps[0].tier === 'cash' ? d.steps[0].netCents : 0;
    var months = Math.round(d.netCents / spend * 10) / 10;
    return Money.ok(months, Object.assign(d, {
      months: months,
      weeks: Math.floor(d.netCents / (spend * 12 / 52)),
      monthlyExpensesCents: spend,
      cashMonths: Math.round(cashNet / spend * 10) / 10,
      beyondCashCents: d.netCents - cashNet,
      beyondCashMonths: Math.round((d.netCents - cashNet) / spend * 10) / 10
    }));
  }

  /* Kinds of future period. `other` is the default so every row written
     before D-152 keeps exactly the meaning it had — a kind was not asked
     for, so none is asserted. The kind changes nothing arithmetically; it
     only lets the timeline colour and group what it draws. */
  var FUTURE_KINDS = ['job', 'benefit', 'other'];

  function createFutureIncome(fields) {
    var f = fields || {};
    return {
      id: f.id || newId('fi'),
      label: f.label || null,
      /* What this period is. See FUTURE_KINDS. D-152. */
      kind: FUTURE_KINDS.indexOf(f.kind) >= 0 ? f.kind : 'other',
      monthlyCents: f.monthlyCents === undefined ? null : f.monthlyCents,
      startsOn: f.startsOn === undefined ? null : f.startsOn,     /* ISO date, or an age via startsAtAge */
      startsAtAge: f.startsAtAge === undefined ? null : f.startsAtAge,
      endsOn: f.endsOn === undefined ? null : f.endsOn,
      /* The mirror of startsAtAge: "until I turn 67". Absent means the
         period runs to the horizon, which is a real answer and is labelled
         as one — it is never quietly turned into an end date. D-152. */
      endsAtAge: f.endsAtAge === undefined ? null : f.endsAtAge,
      confidence: f.confidence === undefined ? null : f.confidence,
      inflationAdjusted: f.inflationAdjusted === undefined ? null : !!f.inflationAdjusted,
      ownerIds: ownerIdsFrom(f)
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
  /* The Skill Tree stores only `done` (D-131): every other state is
     derived from the household by engines/skilltree.js, so the tree can
     never disagree with the facts. */
  var SKILL_TREE_BY = ['proof', 'self'];
  function createSkillTree(fields) {
    var f = fields || {};
    var state = {};
    Object.keys(f.state || {}).forEach(function (id) {
      var v = f.state[id];
      if (!v || v.state !== 'done') return;
      state[id] = { state: 'done', on: typeof v.on === 'string' && v.on ? v.on : null, by: SKILL_TREE_BY.indexOf(v.by) >= 0 ? v.by : 'self' };
    });
    return { state: state };
  }
  function createExercisesLog(fields) {
    var f = fields || {};
    var done = {}, results = {};
    Object.keys(f.done || {}).forEach(function (id) { if (typeof f.done[id] === 'string' && f.done[id]) done[id] = f.done[id]; });
    Object.keys(f.results || {}).forEach(function (id) { if (f.results[id] && typeof f.results[id] === 'object') results[id] = f.results[id]; });
    return { done: done, results: results };
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
    return { bufferMonths: Money.isEntered(f.bufferMonths) ? f.bufferMonths : null,
      /* The rolling window the room smooths the ledger's months over: 3, 6 or 12. D-128. */
      windowMonths: [3, 6, 12].indexOf(f.windowMonths) >= 0 ? f.windowMonths : null };
  }
  /* The third wave (D-101 scaffolding): the LATER.md rooms — the T8
     shapes (D-093 draft, now built), the loan decision, the calendar,
     History's compare-to. */
  function createEnough(fields) {
    var f = fields || {};
    return { monthlyCents: Money.isEntered(f.monthlyCents) ? f.monthlyCents : null, source: f.source === 'curve' || f.source === 'entered' ? f.source : null };
  }
  function createWeekBlock(fields) {
    var f = fields || {};
    return { id: f.id || newId('wk'), label: f.label === undefined ? null : f.label, hours: Money.isEntered(f.hours) ? f.hours : null,
      categoryId: f.categoryId === undefined ? null : f.categoryId, costCents: Money.isEntered(f.costCents) ? f.costCents : null };
  }
  function createDesignedWeek(fields) { var f = fields || {}; return { blocks: (f.blocks || []).map(createWeekBlock) }; }
  function createExperience(fields) {
    var f = fields || {};
    return { id: f.id || newId('xp'), label: f.label === undefined ? null : f.label, costCents: Money.isEntered(f.costCents) ? f.costCents : null, year: Money.isEntered(f.year) ? f.year : null };
  }
  function createTimeBucket(fields) {
    var f = fields || {};
    return { decade: Money.isEntered(f.decade) ? f.decade : null, experiences: (f.experiences || []).map(createExperience) };
  }
  function createDream(fields) {
    var f = fields || {};
    return { id: f.id || newId('dr'), label: f.label === undefined ? null : f.label, monthlyCents: Money.isEntered(f.monthlyCents) ? f.monthlyCents : null };
  }
  function createReversibilityPlan(fields) {
    var f = fields || {};
    return { decisionId: typeof f.decisionId === 'string' && f.decisionId ? f.decisionId : null, given: f.given && typeof f.given === 'object' ? f.given : {} };
  }
  function createUnlearning(fields) {
    var f = fields || {};
    return { dropped: (f.dropped || []).filter(function (id) { return typeof id === 'string' && id; }) };
  }
  var LOAN_PLANS = ['standard', 'income_driven', 'aggressive'];
  function createStudentLoanPlan(fields) {
    var f = fields || {};
    return { plan: LOAN_PLANS.indexOf(f.plan) >= 0 ? f.plan : null, extraMonthlyCents: Money.isEntered(f.extraMonthlyCents) ? f.extraMonthlyCents : null,
      idrShare: Money.isEntered(f.idrShare) ? f.idrShare : null, forgivenessYears: Money.isEntered(f.forgivenessYears) ? f.forgivenessYears : null };
  }
  var PAY_CADENCES = ['weekly', 'fortnightly', 'semimonthly', 'monthly'];
  function createBill(fields) {
    var f = fields || {};
    return { id: f.id || newId('bill'), label: f.label === undefined ? null : f.label, cents: Money.isEntered(f.cents) ? f.cents : null, day: Money.isEntered(f.day) ? f.day : null };
  }
  function createPayLater(fields) {
    var f = fields || {};
    return { id: f.id || newId('bnpl'), label: f.label === undefined ? null : f.label, cents: Money.isEntered(f.cents) ? f.cents : null, dueDay: Money.isEntered(f.dueDay) ? f.dueDay : null, instalmentsLeft: Money.isEntered(f.instalmentsLeft) ? f.instalmentsLeft : null };
  }
  function createCalendar(fields) {
    var f = fields || {};
    return { cadence: PAY_CADENCES.indexOf(f.cadence) >= 0 ? f.cadence : null, nextPaydayDay: Money.isEntered(f.nextPaydayDay) ? f.nextPaydayDay : null,
      bills: (f.bills || []).map(createBill), payLater: (f.payLater || []).map(createPayLater) };
  }
  function createHistoryPlan(fields) {
    var f = fields || {};
    return { compareTo: typeof f.compareTo === 'string' && f.compareTo ? f.compareTo : null };
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

  /* The ids data/debt_rules.json defines; the constructor keeps the list
     honest without reading the table, which loads later than the schema. */
  var KEEP_REASONS = ['low_rate', 'tax_favoured', 'appreciating', 'building_credit', 'subsidised'];
  function keepReasonList(v) {
    if (!Array.isArray(v)) return [];
    var out = [];
    v.forEach(function (id) { if (KEEP_REASONS.indexOf(id) >= 0 && out.indexOf(id) < 0) out.push(id); });
    return out;
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
      /* The rational counterpart to emotionalTag, and a separate axis from
         it: why this debt might be fine to carry on purpose. A list, since
         more than one can be true of the same debt; an empty list is
         "None - no particular reason to keep it". Unknown ids are dropped
         and each is kept once. Setting one never touches the other. D-132. */
      keepReasons: keepReasonList(f.keepReasons),
      /* The household's own decision, which the reasons inform and never
         trigger: this debt is kept on purpose, so the payoff plan stops
         aiming the extra at it. Reasons alone change nothing. D-132. */
      excludeFromAggressive: f.excludeFromAggressive === true,
      /* Money borrowed from family or a friend usually carries no interest
         and a date it is due back, not a rate and a statement minimum. A
         debt that is interest-free says so here AND stores rate 0, so a
         reader that only knows about `rate` still gets the right number.
         Archived debts are kept for the record and read by nothing that
         adds up or plans. D-124. */
      interestFree: f.interestFree === undefined ? null : f.interestFree,
      archived: f.archived === true,
      borrowedOn: f.borrowedOn === undefined ? null : f.borrowedOn,
      dueOn: f.dueOn === undefined ? null : f.dueOn,
      ownerIds: ownerIdsFrom(f)
    };
  }

  /** An estimated/tracked pair. SPEC.md §12.3: tracked NEVER overwrites
   *  estimated. Both persist; the divergence between them is a feature. */
  /* ---- Expenses: FAT, wants, and one optional line (D-172) --------------
     Four numbers are the whole budget input: food, accommodation (rent, or
     mortgage plus tax plus insurance, one figure), transportation, and
     everything else. Therapy is a fifth line only while the toggle is on;
     off, it does not exist here. The dated log and the optional category
     breakdown still live in `entries`; they are detail, never a second
     copy of the month. Debt minimums are not expenses - they live under
     debt (D-017) and DRAFTT's D share reads them there. */
  var FAT_NEEDS = ['food', 'accommodation', 'transportation'];
  /* Every category in data/expense_categories.json lands in exactly one
     bucket, or is deliberately not spending: debt payments live under
     debt, savings has not left, an income cost belongs to its entry. */
  var FAT_CATEGORY_MAP = {
    groceries: 'food', dining_out: 'food',
    housing: 'accommodation',
    transportation: 'transportation',
    utilities: 'wants', insurance: 'wants', healthcare: 'wants', childcare: 'wants',
    entertainment: 'wants', subscriptions: 'wants', shopping: 'wants', travel: 'wants',
    personal_care: 'wants', gifts: 'wants', other: 'wants',
    debt_minimums: 'debt', extra_debt_payment: 'savings',
    retirement: 'savings', investments: 'savings', emergency_savings: 'savings',
    mileage: 'costs', home_office: 'costs', equipment: 'costs', contractor_fees: 'costs',
    licensing: 'costs', platform_fees: 'costs'
  };
  function fatBucketOf(categoryId) { return FAT_CATEGORY_MAP[categoryId] || 'wants'; }

  function centsOrNull(v) { return v === undefined ? null : v; }
  function fatLine(fields) { var f = fields || {}; return { monthlyCents: centsOrNull(f.monthlyCents) }; }

  /* ---- 15.6: the state table (D-181) ---------------------------------------
     data/states.json carries one row a state and a sourced cell a column:
     { value, asOf, source, confidence, verify?, stale? }. Every reader
     goes through stateCell so the row shape lives in one place. `OTHER`
     (outside the US) carries no cells and reads as null everywhere. */
  function stateRow(tables, code) {
    var t = tables && tables.states;
    if (!t || !Array.isArray(t.states) || !code) return null;
    var c = String(code).toUpperCase();
    for (var i = 0; i < t.states.length; i++) if (t.states[i].code === c) return t.states[i];
    return null;
  }
  function stateCell(tables, code, column) {
    var row = stateRow(tables, code);
    var cell = row && row[column];
    if (!cell || cell.value === undefined || cell.value === null) return null;
    return { value: cell.value, asOf: cell.asOf || null, source: cell.source || null, confidence: cell.confidence || null, verify: cell.verify === true, stale: cell.stale === true, code: row.code, name: row.name };
  }
  /** Every state's cells as plain values, keyed by code, for the block
      expansions' table lookups ({table: 'statesByCode', path: [code, column]}).
      A view, never stored; `national` carries the index's base. */
  function statesByCode(tables) {
    var t = tables && tables.states;
    var out = { national: { costOfLivingIndex: 100 } };
    if (!t || !Array.isArray(t.states)) return out;
    var cols = Object.keys(t.columns || {});
    t.states.forEach(function (r) {
      var flat = {};
      cols.forEach(function (c) { if (r[c] && r[c].value !== undefined && r[c].value !== null) flat[c] = r[c].value; });
      out[r.code] = flat;
    });
    return out;
  }

  /* ---- 15.5: cadence, and the named yearly lines (D-181) ------------------
     Every line has a cadence: monthly, annual or oneoff. For the four
     buckets and the log it is READ off what is already stored (a monthly
     bucket, a logged entry's period), never stored twice. The one new
     store is `expenses.annual[]`: named yearly costs (insurance, gifts,
     registration) that sit inside the bucket they belong to and are
     pro-rated into the month everywhere but the Money Calendar, which
     draws each on its month. The switch `annualLines` (default on) folds
     them away: off, they count nowhere. */
  var CADENCES = ['monthly', 'annual', 'oneoff'];
  var ANNUAL_BUCKETS = ['food', 'accommodation', 'transportation', 'wants'];
  function createAnnualLine(fields) {
    var f = fields || {};
    var month = Money.isEntered(f.monthDue) ? Math.round(f.monthDue) : null;
    return {
      id: f.id || newId('yr'),
      label: typeof f.label === 'string' && f.label ? f.label : null,
      bucket: ANNUAL_BUCKETS.indexOf(f.bucket) >= 0 ? f.bucket : 'wants',
      amountCents: Money.isEntered(f.amountCents) ? f.amountCents : null,
      monthDue: month !== null && month >= 1 && month <= 12 ? month : null,
      cadence: 'annual'
    };
  }
  /** The cadence of any line: a bucket or a monthly entry is monthly, a
      yearly line is annual, a dated one-off is oneoff. Read, never stored. */
  function cadenceOf(record) {
    var r = record || {};
    if (r.cadence && CADENCES.indexOf(r.cadence) >= 0) return r.cadence;
    if (r.period === 'once' || r.frequency === 'once') return 'oneoff';
    return 'monthly';
  }
  function featuresModule() {
    if (typeof module === 'object' && module.exports) { try { return require('./features.js'); } catch (e) { return null; } }
    var g = (typeof self !== 'undefined') ? self : (typeof window !== 'undefined') ? window : null;
    return g && g.SLAF && g.SLAF.Features ? g.SLAF.Features : null;
  }
  function annualLinesOn(household) {
    var F = featuresModule();
    /* No switch table yet (a room that never loaded it) reads as the
       default, on; a loaded table is the person's answer. */
    if (!F || typeof F.on !== 'function' || typeof F.get !== 'function' || !F.get('annualLines')) return true;
    return !!F.on('annualLines', household);
  }
  function annualLines(household) {
    var e = household && household.expenses;
    return ((e && e.annual) || []).map(createAnnualLine).filter(function (l) { return Money.isEntered(l.amountCents) && l.amountCents > 0; });
  }
  /** The yearly lines as a month: the sum over twelve, by bucket. */
  function annualMonthlyCents(household) {
    var on = annualLinesOn(household);
    var lines = on ? annualLines(household) : [];
    var byBucket = {}; ANNUAL_BUCKETS.forEach(function (b) { byBucket[b] = 0; });
    var total = 0;
    lines.forEach(function (l) { byBucket[l.bucket] += l.amountCents; total += l.amountCents; });
    var monthly = {}; ANNUAL_BUCKETS.forEach(function (b) { monthly[b] = Math.round(byBucket[b] / 12); });
    return { on: on, lines: lines, count: lines.length, annualCents: total, monthlyCents: Math.round(total / 12), byBucketAnnualCents: byBucket, byBucketMonthlyCents: monthly };
  }

  /** The four buckets read off the typical-month lines, when someone has
   *  split the month that far. A bucket with no line is null, not zero. */
  function fatFromLines(entries) {
    var out = { food: null, accommodation: null, transportation: null, wants: null };
    (entries || []).forEach(function (e) {
      if (!e || e.active === false || e.source === 'log' || e.linkedIncomeId) return;
      if (e.period !== 'monthly' || !Money.isEntered(e.amountCents)) return;
      var b = fatBucketOf(e.categoryId);
      if (!Object.prototype.hasOwnProperty.call(out, b)) return;
      out[b] = (out[b] || 0) + e.amountCents;
    });
    return out;
  }

  function createExpenses(fields) {
    var f = fields || {};
    var needs = f.needs || {};
    var wants = f.wants || {};
    var entries = f.entries || f.categories || [];
    var out = {
      needs: { food: fatLine(needs.food), accommodation: fatLine(needs.accommodation), transportation: fatLine(needs.transportation) },
      wants: { totalCents: centsOrNull(wants.totalCents), therapy: wants.therapy ? fatLine(wants.therapy) : null },
      /* Cash Flow's dated log and its optional breakdown. ONE store,
         transaction-shaped (SPEC.md §12.5). See createExpenseEntry(). */
      entries: entries,
      /* Named yearly lines (15.5). See createAnnualLine(). */
      annual: (f.annual || []).map(createAnnualLine)
    };
    /* Migration (D-172): a household saved before the four buckets existed
       carried one monthly figure - tracked over estimated - and maybe a
       month split by category. Lines win when there are any, because they
       are the split the person actually made; else the one figure becomes
       "everything else", which is exactly what an unsplit month is. The
       legacy pair is kept on the record for round-trip only; nothing reads
       it any more. */
    var blank = FAT_NEEDS.every(function (k) { return !Money.isEntered(out.needs[k].monthlyCents); }) && !Money.isEntered(out.wants.totalCents);
    if (blank) {
      var pair = f.monthlyEssential || {};
      var fromLines = fatFromLines(entries);
      var anyLine = Object.keys(fromLines).some(function (k) { return fromLines[k] !== null; });
      if (anyLine) {
        FAT_NEEDS.forEach(function (k) { out.needs[k].monthlyCents = fromLines[k]; });
        out.wants.totalCents = fromLines.wants;
      } else if (Money.isEntered(pair.trackedValueCents)) {
        out.wants.totalCents = pair.trackedValueCents;
      } else if (Money.isEntered(pair.estimatedValueCents)) {
        out.wants.totalCents = pair.estimatedValueCents;
      }
    }
    if (f.monthlyEssential) out.monthlyEssential = createEstimatedTrackedPair(f.monthlyEssential);
    return out;
  }

  /**
   * The four numbers, and the total, as Results. A blank bucket is
   * incomplete and says so; the TOTAL is the sum of what is entered, since
   * "everything else" is by definition whatever has not been split out -
   * it is incomplete only when nothing at all is entered.
   */
  function fat(household) {
    var e = createExpenses(household && household.expenses);
    /* The typed numbers are the month. Only when NONE is typed does the
       split's lines stand in, bucket by bucket - the same rule the
       migration applies, live - and each says so with source 'lines'. Never
       a mix: a typed "everything else" is the whole of what is not split
       out, so adding line-derived needs to it would count twice. */
    /* F, A, T are typed; everything else is what is named (D-197). Once
       any of the three is typed the month has been split, and from then
       on any line in the wants bucket (a subscription, a named line, a
       category box, a yearly cost's twelfth) IS everything else: the
       stored wants total is not read behind it. With no such line the
       stored total still counts, as the remainder Start Here left after
       the three, an import, a block's line, or a household saved before
       the box went, and it says so (source 'typed'). While none of the
       three is typed, a stored total is the one unsplit month and the
       lines are only its split, as before. Nothing already entered goes
       dark. */
    var fatTyped = FAT_NEEDS.some(function (k) { return Money.isEntered(e.needs[k].monthlyCents); });
    var typedAny = fatTyped || Money.isEntered(e.wants.totalCents);
    var allLines = fatFromLines(e.entries);
    var lines = typedAny ? null : allLines;
    function r(v, k, id, what) {
      if (Money.isEntered(v)) return Money.ok(v, { source: 'typed' });
      if (k && lines && lines[k] !== null) return Money.ok(lines[k], { source: 'lines' });
      return Money.incomplete(what + ' is not filled in.', [id]);
    }
    var wantsOut = fatTyped && allLines.wants !== null
      ? Money.ok(allLines.wants, { source: 'lines', named: true })
      : r(e.wants.totalCents, 'wants', 'wantsMonthly', 'Everything else');
    var out = {
      food: r(e.needs.food.monthlyCents, 'food', 'foodMonthly', 'Food'),
      accommodation: r(e.needs.accommodation.monthlyCents, 'accommodation', 'accommodationMonthly', 'Rent or mortgage'),
      transportation: r(e.needs.transportation.monthlyCents, 'transportation', 'transportationMonthly', 'Getting around'),
      wants: wantsOut,
      therapy: e.wants.therapy ? r(e.wants.therapy.monthlyCents, null, 'therapyMonthly', 'Therapy') : null,
      therapyTracked: !!e.wants.therapy
    };
    /* 15.5: the yearly lines sit inside their bucket, a twelfth each month.
       A bucket with only a yearly line is that twelfth, source 'annual'. */
    var yr = annualMonthlyCents(household);
    out.annual = yr;
    if (yr.on && yr.count) {
      ANNUAL_BUCKETS.forEach(function (k) {
        var share = yr.byBucketMonthlyCents[k];
        if (!share) return;
        var cur = out[k];
        out[k] = Money.isOk(cur)
          ? Money.ok(cur.value + share, { source: cur.source, monthlyTypedCents: cur.value, annualMonthlyCents: share })
          : Money.ok(share, { source: 'annual', monthlyTypedCents: null, annualMonthlyCents: share });
      });
    }
    /* Lines a scenario block laid on the month (D-178) - never stored,
       present only on the household Spine.householdAt returns. They join
       the total and are listed apart, so a reader can see them. */
    var applied = (household && household.expenses && Array.isArray(household.expenses.applied)) ? household.expenses.applied.filter(function (l) { return l && Money.isEntered(l.monthlyCents); }) : [];
    out.applied = applied.length ? Money.ok(applied.reduce(function (t, l) { return t + l.monthlyCents; }, 0), { source: 'blocks', lines: applied.slice() }) : null;
    var parts = [out.food, out.accommodation, out.transportation, out.wants].concat(out.therapy ? [out.therapy] : []).concat(out.applied ? [out.applied] : []);
    var entered = parts.filter(function (x) { return Money.isOk(x); });
    out.totalCents = entered.length
      ? Money.ok(entered.reduce(function (t, x) { return t + x.value; }, 0), { entered: entered.length, of: parts.length, source: 'fat' })
      : Money.incomplete('Add what goes out a month to see this.', ['monthlyExpenses']);
    return out;
  }

  /** F plus A plus T (D-197): the essentials, the lean month. Incomplete
   *  until all three are in, naming the missing ones. Lean FIRE reads it. */
  function fatNeedsCents(household) {
    var f = fat(household);
    var missing = FAT_NEEDS.filter(function (k) { return !Money.isOk(f[k]); });
    if (missing.length) return Money.incomplete('Type food, rent or mortgage and getting around in Expenses to see this.', missing.map(function (k) { return k + 'Monthly'; }));
    return Money.ok(f.food.value + f.accommodation.value + f.transportation.value, {
      foodCents: f.food.value, accommodationCents: f.accommodation.value, transportationCents: f.transportation.value
    });
  }

  /** A view of the household whose month is `monthlyCents`, for an engine
   *  pricing a different month with the same formulas. Never a write. */
  function withMonthlySpend(household, monthlyCents) {
    var h = household || {};
    return Object.assign({}, h, { expenses: Object.assign({}, h.expenses || {}, {
      needs: { food: { monthlyCents: null }, accommodation: { monthlyCents: null }, transportation: { monthlyCents: null } },
      wants: { totalCents: monthlyCents, therapy: null }
    }) });
  }

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
  var PRODUCED = ['personal', 'linked', 'reimbursable'];
  /* How often a named line repeats, as it was known (D-196). The stored
     amount is always the month; this is the one place that turns "$120 a
     year" or "$12 a week" into it, so no room carries its own table. */
  var EXPENSE_EVERY = ['weekly', 'fortnightly', 'monthly', 'quarterly', 'annual'];
  var EVERY_PER_YEAR = { weekly: 52, fortnightly: 26, monthly: 12, quarterly: 4, annual: 1 };
  function monthlyFromEvery(cents, every) {
    if (!Money.isEntered(cents)) return null;
    var n = EVERY_PER_YEAR[every] || 12;
    return Math.round(cents * n / 12);
  }
  /* How sure a date is (D-130): exact, estimated (about then), potential
     (might not happen). Unknown reads as exact, the way every older row
     was meant. */
  var DATE_KINDS = ['exact', 'estimated', 'potential'];
  function dateKindOf(v) { return DATE_KINDS.indexOf(v) >= 0 ? v : 'exact'; }
  function createExpenseEntry(fields) {
    var f = fields || {};
    var linked = typeof f.linkedIncomeId === 'string' && f.linkedIncomeId ? f.linkedIncomeId : null;
    /* Three paths, exclusive (D-129). Asked for outright by `produced`, or
       read off the fields: a link makes it linked, a reimbursement makes
       it reimbursable, otherwise personal. A reimbursable expense carries
       no link, so it can never be deductible by the rule below. */
    var produced = PRODUCED.indexOf(f.produced) >= 0 ? f.produced
      : linked ? 'linked'
      : (f.reimbursableFrom || f.reimbursementStatus || f.reimbursable === true) ? 'reimbursable' : 'personal';
    if (produced !== 'linked') linked = null;
    var reimb = produced === 'reimbursable';
    var status = reimb ? (f.reimbursementStatus === 'received' ? 'received' : 'pending') : null;
    return {
      id: f.id || newId('e'),
      categoryId: f.categoryId || null,
      amountCents: f.amountCents === undefined ? null : f.amountCents,
      period: f.period || 'monthly',            // 'monthly' | 'once'
      /* A named line as it was known (D-196): the amount typed and how
         often it comes. amountCents above is always the month. */
      every: EXPENSE_EVERY.indexOf(f.every) >= 0 ? f.every : null,
      everyCents: f.everyCents === undefined || f.everyCents === null ? null : f.everyCents,
      date: f.date === undefined ? null : f.date,        // ISO, dated entries only
      dateKind: dateKindOf(f.dateKind),
      descriptor: f.descriptor === undefined ? null : f.descriptor,
      source: f.source || 'manual',             // 'manual' | 'imported' | 'rerank' | 'log'
      categorizedBy: f.categorizedBy === undefined ? null : f.categorizedBy,
      /* Could this line be cut next month? null = not asked; true = fixed
         (rent, insurance, a minimum); false = cuttable. D-082. */
      fixed: f.fixed === undefined ? null : f.fixed,
      /* The ledger (D-128). An expense either is personal, or it produces
         one income entry; only the second kind can ever be deductible,
         and that is decided HERE, not in a form — a personal expense
         handed deductible: true is stored as false. */
      produced: produced,
      linkedIncomeId: linked,
      deductible: !!(linked && f.deductible === true),
      reimbursableFrom: reimb && typeof f.reimbursableFrom === 'string' && f.reimbursableFrom ? f.reimbursableFrom : null,
      expectedAmountCents: reimb ? (Money.isEntered(f.expectedAmountCents) ? f.expectedAmountCents : (Money.isEntered(f.amountCents) ? f.amountCents : null)) : null,
      reimbursementStatus: status,
      dateReceived: reimb && status === 'received' && typeof f.dateReceived === 'string' && f.dateReceived ? f.dateReceived : null,
      receivedAmountCents: reimb && status === 'received' && Money.isEntered(f.receivedAmountCents) ? f.receivedAmountCents : null,
      hidden: f.hidden === true,
      active: f.active === undefined ? true : f.active !== false
    };
  }

  /* ---- The ledger: dated money in, and the months closed on it (D-128) ----
     An income ENTRY is a dated event — this paycheque, this invoice paid,
     this gift — which is a different thing from an income SOURCE (the
     description of a job, annualised, that every ratio reads). The two
     coexist: the source is the profile, the entry is the record. */
  var INCOME_KINDS = ['w2', 'se', 'bonus', 'gift', 'side', 'dividend', 'rental', 'unemployment', 'other'];
  var INCOME_FREQUENCIES = ['once', 'weekly', 'fortnightly', 'monthly', 'annual'];
  /* Taxed how — exactly four, no catch-all (D-129):
       w2            withheld at the source
       se            owed, not withheld, and subject to self-employment tax
       unemployment  owed, not withheld, ordinary income, NO self-employment tax
       none          not taxable */
  var TAX_METHODS = ['w2', 'se', 'unemployment', 'none'];
  var INCOME_COST_CATEGORIES = ['mileage', 'home_office', 'equipment', 'contractor_fees', 'licensing', 'platform_fees', 'other'];
  /* Which kinds carry the costs of producing them, and how each is netted
     by default. A gift is never taxable; everything else is until unticked. */
  var INCOME_KIND_RULES = {
    w2:       { label: 'W-2 salary or wages',      method: 'w2',   taxable: true,  costs: false },
    se:       { label: '1099 / self-employment',   method: 'se',   taxable: true,  costs: true },
    bonus:    { label: 'Bonus',                    method: 'w2',   taxable: true,  costs: false },
    gift:     { label: 'Gift',                     method: 'none', taxable: false, costs: false },
    side:     { label: 'Side income (cash, not 1099)', method: 'se', taxable: true, costs: true },
    dividend: { label: 'Dividends or interest',    method: 'w2',   taxable: true,  costs: false },
    rental:   { label: 'Rental income',            method: 'se',   taxable: true,  costs: true },
    unemployment: { label: 'Unemployment benefit', method: 'unemployment', taxable: true, costs: false },
    other:    { label: 'Other',                    method: 'w2',   taxable: true,  costs: false }
  };
  function costsAllowed(kind) { return !!(INCOME_KIND_RULES[kind] && INCOME_KIND_RULES[kind].costs); }

  function createIncomeCost(fields) {
    var f = fields || {};
    return {
      id: f.id || newId('ic'),
      label: f.label === undefined ? null : f.label,
      amountCents: Money.isEntered(f.amountCents) ? f.amountCents : null,
      category: INCOME_COST_CATEGORIES.indexOf(f.category) >= 0 ? f.category : 'other',
      date: typeof f.date === 'string' && f.date ? f.date : null,
      deductible: f.deductible === undefined ? true : f.deductible !== false
    };
  }

  function createIncomeEntry(fields) {
    var f = fields || {};
    var kind = INCOME_KINDS.indexOf(f.kind) >= 0 ? f.kind : 'other';
    var rule = INCOME_KIND_RULES[kind];
    var taxable = kind === 'gift' ? false : (f.taxable === undefined ? rule.taxable : f.taxable !== false);
    var method = !taxable ? 'none' : (TAX_METHODS.indexOf(f.taxMethod) >= 0 && f.taxMethod !== 'none' ? f.taxMethod : rule.method);
    /* 'none' as the method IS "not taxable": the two fields agree either way. */
    if (f.taxMethod === 'none' && f.taxable === undefined) { taxable = false; method = 'none'; }
    return {
      id: f.id || newId('in'),
      personId: f.personId || null,
      label: f.label === undefined ? null : f.label,
      kind: kind,
      amountCents: Money.isEntered(f.amountCents) ? f.amountCents : null,
      frequency: INCOME_FREQUENCIES.indexOf(f.frequency) >= 0 ? f.frequency : 'once',
      receivedOn: typeof f.receivedOn === 'string' && f.receivedOn ? f.receivedOn : null,
      /* The last landing of a recurring entry: a contract's end, a job's
         last pay. Null means it runs on; a one-time entry never has one.
         The picture stops drawing it after this date. D-194. */
      endsOn: typeof f.endsOn === 'string' && f.endsOn && f.frequency !== 'once' && INCOME_FREQUENCIES.indexOf(f.frequency) >= 0 ? f.endsOn : null,
      dateKind: dateKindOf(f.dateKind),
      taxable: taxable,
      taxMethod: method,
      /* Tax actually taken before it arrived, off the stub, when the
         person has it. Null means "use the year's blended rate". Only a
         withheld method can carry one. D-194. */
      withheldCents: Money.isEntered(f.withheldCents) && (method === 'w2' || method === 'unemployment') ? f.withheldCents : null,
      /* The costs of producing it live on the entry, so they are always
         traceable to the income they support. Kinds without costs keep
         an empty list, never a hidden one. */
      costs: rule.costs ? (f.costs || []).map(createIncomeCost) : [],
      hidden: f.hidden === true,
      active: f.active === undefined ? true : f.active !== false,
      source: f.source || 'manual',
      note: f.note === undefined ? null : f.note
    };
  }

  var BUDGET_BUCKETS = ['income', 'expenses', 'savings', 'investments', 'debt'];
  function bucketCents(o) {
    var out = {};
    BUDGET_BUCKETS.forEach(function (b) { out[b] = o && Money.isEntered(o[b]) ? o[b] : null; });
    return out;
  }
  function monthLabel(ym) {
    var m = /^(\d{4})-(\d{2})$/.exec(ym || '');
    if (!m) return ym || null;
    return ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][+m[2] - 1] + ' ' + m[1];
  }
  /* A MonthRecord: one closed month, estimated and actual side by side,
     never merged; late entries go to actualRevised and nothing else. */
  function createMonthRecord(fields) {
    var f = fields || {};
    var month = /^\d{4}-\d{2}$/.test(f.month || f.id || '') ? (f.month || f.id) : null;
    return {
      id: month,
      month: month,
      label: f.label || monthLabel(month),
      status: 'closed',
      closedAt: typeof f.closedAt === 'string' ? f.closedAt : null,
      estimated: bucketCents(f.estimated),
      actual: bucketCents(f.actual),
      actualRevised: f.actualRevised ? bucketCents(f.actualRevised) : null,
      lines: f.lines && typeof f.lines === 'object' ? f.lines : {},
      sources: f.sources && typeof f.sources === 'object' ? f.sources : { income: [], expenses: [] },
      note: f.note === undefined ? null : f.note
    };
  }
  function createLedger(fields) {
    var f = fields || {};
    return {
      income: (f.income || []).map(createIncomeEntry),
      months: (f.months || []).map(createMonthRecord).filter(function (m) { return m.id; }),
      /* Archive prompts the person waved away, by entry id. D-128 (7). */
      dismissed: Array.isArray(f.dismissed) ? f.dismissed.slice() : []
    };
  }
  function createBudget(fields) {
    var f = fields || {};
    var est = {};
    Object.keys(f.estimated || {}).forEach(function (ym) {
      if (!/^\d{4}-\d{2}$/.test(ym)) return;
      var row = {};
      BUDGET_BUCKETS.forEach(function (b) { if (Money.isEntered((f.estimated[ym] || {})[b])) row[b] = f.estimated[ym][b]; });
      if (Object.keys(row).length) est[ym] = row;
    });
    /* The presets stacked into a month's Estimated, by bucket (D-129). */
    var presets = {};
    Object.keys(f.presets || {}).forEach(function (ym) {
      if (!/^\d{4}-\d{2}$/.test(ym)) return;
      var row = {};
      BUDGET_BUCKETS.forEach(function (b) {
        var ids = (f.presets[ym] || {})[b];
        if (!Array.isArray(ids)) return;
        var keep = ids.filter(function (id, i) { return BUDGET_PRESETS.indexOf(id) >= 0 && ids.indexOf(id) === i; });
        if (keep.length) row[b] = keep;
      });
      if (Object.keys(row).length) presets[ym] = row;
    });
    return { estimated: est, presets: presets };
  }
  var BUDGET_PRESETS = ['ruleOfFive', 'emergencyFund', 'maxIra', 'max401k'];
  /** Only the keys marked true survive; anything else is "applies". */
  function createNotApplicable(fields) {
    var out = {};
    Object.keys(fields || {}).forEach(function (k) { if (fields[k] === true && /^[A-Za-z0-9_:.-]+$/.test(k)) out[k] = true; });
    return out;
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
      hsaFamilyPlan: f.hsaFamilyPlan === undefined ? null : !!f.hsaFamilyPlan,
      /* An employer 401(k) to contribute to? null = not asked (D-129). */
      has401k: f.has401k === undefined || f.has401k === null ? null : !!f.has401k
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

  /**
   * The Walk-Through's ledger (D-149). Both maps are roomId -> ISO string,
   * and a room appears in at most one of them: marking a step done clears
   * any skip and the other way round, so "have they dealt with this?" is
   * one lookup and can never disagree with itself.
   */
  function createWalk(w) {
    var src = w || {};
    function stamps(o) {
      var out = {};
      Object.keys(o || {}).forEach(function (k) {
        if (typeof o[k] === 'string' && o[k]) out[k] = o[k];
      });
      return out;
    }
    var done = stamps(src.done);
    var skipped = stamps(src.skipped);
    /* A room in both maps is a shape that should not exist. Done wins:
       finishing is the stronger statement, and it is the one the person
       had to reach the room to make. */
    Object.keys(done).forEach(function (k) { delete skipped[k]; });
    return {
      startedAt: typeof src.startedAt === 'string' ? src.startedAt : null,
      finishedAt: typeof src.finishedAt === 'string' ? src.finishedAt : null,
      done: done,
      skipped: skipped
    };
  }

  function createHousehold(fields) {
    var f = fields || {};
    return {
      schemaVersion: SCHEMA_VERSION,
      people: f.people || [],
      filingStatus: filingStatusOf(f.filingStatus),
      state: f.state === undefined ? null : f.state,
      /* 15.6: optional ZIP, five digits, asked in Fine-tune. Nothing reads
         it yet beyond the record; a finer-than-state table would. D-181. */
      zip: typeof f.zip === 'string' && /^\d{5}$/.test(f.zip) ? f.zip : null,
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
      expenses: createExpenses(f.expenses),
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
      enough: createEnough(f.enough),
      designedWeek: createDesignedWeek(f.designedWeek),
      timeBuckets: (f.timeBuckets || []).map(createTimeBucket).filter(function (b) { return b.decade !== null; }),
      dreams: (f.dreams || []).map(createDream),
      reversibility: createReversibilityPlan(f.reversibility),
      unlearning: createUnlearning(f.unlearning),
      studentLoans: createStudentLoanPlan(f.studentLoans),
      calendar: createCalendar(f.calendar),
      history: createHistoryPlan(f.history),
      /* The ledger and the budget's hand-set estimates (D-128). */
      ledger: createLedger(f.ledger),
      budget: createBudget(f.budget),
      /* What the household said does not apply to them (D-129). */
      notApplicable: createNotApplicable(f.notApplicable),
      /* The Skill Stacker's standing per skill, keyed by catalogue id, and
         the practice ledger it writes a row to each logged day. D-090. */
      skills: createSkills(f.skills),
      /* The Skill Tree's standing and the exercise library's log (D-131). */
      skillTree: createSkillTree(f.skillTree),
      exercises: createExercisesLog(f.exercises),
      practiceLedger: (f.practiceLedger || []).map(createPracticeEntry).filter(function (e) { return e.on && e.skill; }),
      assumptions: normaliseAssumptions(f.assumptions),
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
        /* { fieldId: { asOf, source, confidence, room } } — the three facts
           about every owned number (15.1, 15.10; D-181). Filled by the
           spine on every change, by the migration for anything older. */
        fields: {},
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
        /* The household's default lens — '$', 'hours', 'bought' or
           'pushed' — used when the session has not chosen one. D-100. */
        displayUnit: null,
        /* "I don't pay rent" — living with family, or a paid-off place;
           lowers the spending guess and nothing else. D-094. */
        noRent: null,
        /* The Walk-Through's ledger — D-149. Which steps the person has
           said they are finished with, and which they have waved off.
           Deliberately NOT derived from visits or from how full a room is:
           a person deciding "I am done with this one" is a different fact
           from a room having numbers in it, and only they can say it.
           { startedAt: ISO|null, finishedAt: ISO|null,
             done: { roomId: ISO }, skipped: { roomId: ISO } } */
        walk: null,
        /* Which arrangement of the rooms this person chose to browse by —
           a layout id from data/layouts.json, or null for the order the app
           ships (D-153). A VIEW, never a fact: nothing may read this to
           decide what a room needs, what applies, or what anything is worth.
           It changes the shelves and nothing else. */
        frontDoor: null
      }, f.meta || {}, {
        /* Normalised AFTER the spread, not inside the defaults: a raw
           `f.meta.walk` would otherwise win the Object.assign and land in
           the household unchecked — which is how a shape from an old export
           gets in. Every other meta key is a scalar and does not have this
           problem. D-149. */
        walk: createWalk(f.meta && f.meta.walk)
      })
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
    copy.expenses = createExpenses(copy.expenses);
    if (!Money.isEntered(deltaCents)) return copy;
    /* The delta lands on "everything else" while the stored total is the
       one in use, else on the first of F, A, T that is typed - a blank
       month has nothing to move. D-172, D-197 (a wants total behind named
       lines is not read, so a delta there would vanish). */
    var w = copy.expenses.wants;
    var left = deltaCents;
    var wantsInUse = fat(copy).wants.source === 'typed';
    var slots = (wantsInUse ? [w] : []).concat(FAT_NEEDS.map(function (k) { return copy.expenses.needs[k]; }));
    for (var i = 0; i < slots.length && left !== 0; i++) {
      var key = slots[i] === w ? 'totalCents' : 'monthlyCents';
      if (!Money.isEntered(slots[i][key])) continue;
      if (left > 0) { slots[i][key] += left; left = 0; }
      else { var cut = Math.min(slots[i][key], -left); slots[i][key] -= cut; left += cut; }
    }
    return copy;
  }

  /* ======================================================================
     Resolved assumptions: default, overridden by the user's stored override.
     A room testing a "what if" value passes it as a LOCAL override to the
     calculator instead of writing it here — SPEC.md §12.2, §6.
     ====================================================================== */

  /* The stored assumptions: the defaults, with a save's own values over
     them, minus the constant that is not an assumption; a stored 7% is the
     retired nominal default and becomes the real rate (15.2). */
  function normaliseAssumptions(stored) {
    var a = Object.assign({}, ASSUMPTION_DEFAULTS, stored || {});
    if (a.expectedReturnRate === ASSUMPTION_DEFAULTS.LEGACY_NOMINAL_RETURN) a.expectedReturnRate = a.returnReal;
    delete a.LEGACY_NOMINAL_RETURN;
    return a;
  }
  function resolveAssumptions(household, localOverrides, tables) {
    var stored = (household && household.assumptions) || {};
    var over = (household && household.assumptionOverrides) || {};
    var local = localOverrides || {};
    var merged = Object.assign({}, ASSUMPTION_DEFAULTS, stored, over, local);
    /* 15.2: the real median band is the return, from the one file when it
       is at hand; the stored/default expected rate is only kept when
       someone overrode it on purpose (a preview slider, a stored override). */
    var bands = tables && tables.returnBands && tables.returnBands.percentiles;
    if (bands && Money.isEntered(bands.p50) && !('returnReal' in over) && !('returnReal' in local)) merged.returnReal = bands.p50;
    var explicit = ('expectedReturnRate' in local) || ('expectedReturnRate' in over)
      || (Money.isEntered(stored.expectedReturnRate) && stored.expectedReturnRate !== ASSUMPTION_DEFAULTS.LEGACY_NOMINAL_RETURN && stored.expectedReturnRate !== ASSUMPTION_DEFAULTS.expectedReturnRate);
    if (!explicit) merged.expectedReturnRate = merged.returnReal;
    delete merged.LEGACY_NOMINAL_RETURN;
    return merged;
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
      return d && d.archived !== true && isAggregatable(d, household);
    });
  }

  /** The debts set aside: paid off or on hold, kept for the record. D-124. */
  function archivedDebts(household) {
    return ((household && household.debts) || []).filter(function (d) { return d && d.archived === true; });
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
  /* The closed months' average (D-130, MONEY-MAP.md Q10): the expenses
     bucket's actual over the last few closed months — truer than one
     categorised month once a month has actually been closed. */
  var CLOSED_AVERAGE_MONTHS = 3;
  function closedAverageExpensesCents(household) {
    var months = ((household && household.ledger && household.ledger.months) || [])
      .filter(function (m) { return m && m.actual && Money.isEntered(m.actual.expenses) && m.actual.expenses > 0; })
      .sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; })
      .slice(-CLOSED_AVERAGE_MONTHS);
    if (!months.length) return null;
    var total = months.reduce(function (t, m) { return t + m.actual.expenses; }, 0);
    return { cents: Math.round(total / months.length), months: months.map(function (m) { return m.id; }) };
  }
  /**
   * The rent a month, one number (D-130, MONEY-MAP.md Q11). Cash Flow's
   * housing line — a monthly expense entry in the `housing` category, the
   * typical-month line or a recurring one logged on its day — is the
   * fact; the Housing Decision room's
   * own field is only a place you would rent INSTEAD, read when there is
   * no line. Returns { cents, source: 'expenses' | 'housing' | 'none',
   * entryId } — never a guess; the rooms that guess say so themselves.
   */
  function rentMonthlyCents(household) {
    var h = household || {};
    /* The accommodation bucket IS the rent or mortgage a month (D-172).
       Housing Decision's own field is a place you would rent INSTEAD, read
       only when the bucket is blank. */
    var acc = fat(h).accommodation;
    if (Money.isOk(acc) && acc.value > 0) return { cents: acc.value, source: 'expenses', entryId: null, count: 1, from: acc.source };
    /* One rent (D-130): with the bucket blank, a housing line in Cash
       Flow's split is still what is paid - the same room's own, more
       specific figure. */
    var fromLine = fatFromLines((h.expenses || {}).entries).accommodation;
    if (fromLine !== null && fromLine > 0) return { cents: fromLine, source: 'expenses', entryId: null, count: 1, from: 'lines' };
    /* ...or a recurring rent logged on its day (D-130, Q5). */
    var logged = ((h.expenses || {}).entries || []).filter(function (e) {
      return e && e.active !== false && e.source === 'log' && e.categoryId === 'housing' && e.period !== 'once' && Money.isEntered(e.amountCents) && e.amountCents > 0;
    });
    if (logged.length) return { cents: logged.reduce(function (t, e) { return t + e.amountCents; }, 0), source: 'expenses', entryId: logged[0].id, count: logged.length, from: 'log', logged: true };
    var own = (h.housing || {}).rentMonthlyCents;
    if (Money.isEntered(own) && own > 0) return { cents: own, source: 'housing', entryId: null, count: 0 };
    return { cents: null, source: 'none', entryId: null, count: 0 };
  }

  /**
   * The one-pager's one-off, wherever it lives (D-130, MONEY-MAP.md Q5):
   * a dated income entry (`oneoff_in`) or a dated log entry (`oneoff_out`)
   * since D-130, else the legacy `household.oneOffs[0]`. Returns
   * { cents, direction, on: 'YYYY-MM', where: 'ledger'|'log'|'legacy' } or null.
   */
  var ONE_OFF_IN = 'oneoff_in', ONE_OFF_OUT = 'oneoff_out';
  function oneOffEntry(household) {
    var h = household || {};
    var inc = ((h.ledger && h.ledger.income) || []).filter(function (e) { return e && e.id === ONE_OFF_IN && e.active !== false; })[0];
    if (inc && Money.isEntered(inc.amountCents)) return { cents: inc.amountCents, direction: 'in', on: inc.receivedOn ? inc.receivedOn.slice(0, 7) : null, where: 'ledger', id: inc.id };
    var out = ((h.expenses && h.expenses.entries) || []).filter(function (e) { return e && e.id === ONE_OFF_OUT && e.active !== false; })[0];
    if (out && Money.isEntered(out.amountCents)) return { cents: out.amountCents, direction: 'out', on: out.date ? out.date.slice(0, 7) : null, where: 'log', id: out.id };
    var legacy = (h.oneOffs || [])[0];
    if (legacy && Money.isEntered(legacy.cents)) return { cents: legacy.cents, direction: legacy.direction === 'in' ? 'in' : 'out', on: legacy.on || null, where: 'legacy', id: legacy.id };
    return null;
  }

  function monthlyExpensesCents(household) {
    /* Closed months are actuals and beat any typed month (D-130); else the
       four buckets (D-172). Nothing else - the legacy pair is not read. */
    var closed = closedAverageExpensesCents(household);
    if (closed) return Money.ok(closed.cents, { source: 'closed', months: closed.months });
    var f = fat(household);
    if (Money.isOk(f.totalCents)) return Money.ok(f.totalCents.value, { source: 'fat', entered: f.totalCents.entered, of: f.totalCents.of });
    return Money.incomplete('Add your monthly expenses to see this.', ['monthlyExpenses']);
  }

  /* ---- Taxes and take-home: ONE place (D-171) ---------------------------
     Gross minus the estimated tax is the money that can be pointed at
     anything. It used to live in engines/tier0.js and be re-derived in
     rooms as gross minus spending, which forgets the tax entirely. Every
     savings figure now starts here. The lookup needs the effective-rate
     table, so `tables` is passed in; the Reference module is reached at
     call time because it loads after this file. */
  function referenceModule() {
    if (typeof module === 'object' && module.exports) { try { return require('./reference.js'); } catch (e) { return null; } }
    var g = (typeof self !== 'undefined') ? self : (typeof window !== 'undefined') ? window : null;
    return g && g.SLAF && g.SLAF.Reference ? g.SLAF.Reference : null;
  }
  function estimatedAnnualTaxCents(household, tables) {
    var gross = grossAnnualIncomeCents(household);
    if (!Money.isOk(gross)) return gross;
    var R = referenceModule();
    if (!R) return Money.incomplete('Tax reference table is not loaded.', ['effectiveTaxRates']);
    var rate = R.lookupEffectiveTaxRate(tables && tables.effectiveTaxRates, gross.value / 100, household && household.filingStatus);
    if (!Money.isOk(rate)) return rate;
    return Money.ok(Math.round(gross.value * rate.value), {
      effectiveRate: rate.value, referenceVersion: rate.referenceVersion, precision: rate.precision, grossAnnualIncomeCents: gross.value
    });
  }
  function takeHomeAnnualCents(household, tables) {
    var gross = grossAnnualIncomeCents(household);
    if (!Money.isOk(gross)) return gross;
    var tax = estimatedAnnualTaxCents(household, tables);
    if (!Money.isOk(tax)) return tax;
    return Money.ok(gross.value - tax.value, {
      grossAnnualIncomeCents: gross.value, estimatedTaxCents: tax.value, effectiveRate: tax.effectiveRate, referenceVersion: tax.referenceVersion
    });
  }
  function takeHomeMonthlyCents(household, tables) {
    var t = takeHomeAnnualCents(household, tables);
    if (!Money.isOk(t)) return t;
    return Money.ok(Math.round(t.value / 12), {
      grossAnnualIncomeCents: t.grossAnnualIncomeCents, estimatedTaxCents: t.estimatedTaxCents, effectiveRate: t.effectiveRate, referenceVersion: t.referenceVersion
    });
  }

  /** The category lines' month against the four typed numbers - what the
   *  split says minus what was typed. Incomplete until both exist. */
  function expenseDivergenceCents(household) {
    var h = household || {};
    var f = fat(h);
    var lines = fatFromLines((h.expenses || {}).entries);
    /* With F, A, T typed, everything else is the lines themselves (D-197),
       so the only honest comparison is the needs' lines against the three
       numbers; with one unsplit number, every line against it. */
    var split = FAT_NEEDS.some(function (k) { return f[k] && Money.isOk(f[k]) && f[k].source === 'typed'; });
    var keys = (split ? FAT_NEEDS : Object.keys(lines)).filter(function (k) { return lines[k] !== null; });
    var typedKeys = split ? FAT_NEEDS.filter(function (k) { return f[k] && Money.isOk(f[k]) && f[k].source === 'typed'; }) : null;
    var typed = split
      ? (typedKeys.length ? Money.ok(typedKeys.reduce(function (t, k) { return t + (Money.isEntered(f[k].monthlyTypedCents) ? f[k].monthlyTypedCents : f[k].value); }, 0)) : Money.incomplete('', []))
      : f.totalCents;
    if (!keys.length || !Money.isOk(typed)) {
      return Money.incomplete('Split a month into lines to compare it against F, A, T.', ['expenseEntries', 'monthlyExpenses']);
    }
    var sum = keys.filter(function (k) { return !split || typedKeys.indexOf(k) >= 0; }).reduce(function (t, k) { return t + lines[k]; }, 0);
    return Money.ok(sum - typed.value, { linesCents: sum, typedCents: typed.value, split: split });
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

  /* ---- 15.9: age and the inflection dates (D-181) ------------------------
     The ages at which a rule changes: 50 (catch-up), 55 (rule of 55), 59
     and a half (the penalty ends), 62 (Social Security, early), 65
     (Medicare), the full retirement age and the RMD age (both by birth
     year), 70 (delayed credits stop). Rows and sources live in
     data/milestones.json; nothing here knows an age by heart. Every
     timeline draws them as faint markers (milestoneMarks), behind the
     `showMilestones` switch (default on; a missing switch table reads as
     on). */
  var MILESTONES_FEATURE = 'showMilestones';
  function milestoneAgeOf(row, birthYear) {
    if (row.age) return { years: row.age.years, months: row.age.months || 0, assumed: false };
    var rows = row.byBirthYear || [];
    if (!rows.length) return null;
    var hit = null;
    if (Money.isEntered(birthYear)) {
      hit = rows.filter(function (r) {
        return (r.bornFrom === null || r.bornFrom === undefined || birthYear >= r.bornFrom)
          && (r.bornTo === null || r.bornTo === undefined || birthYear <= r.bornTo);
      })[0] || null;
    }
    var assumed = !hit;
    if (!hit) hit = rows[rows.length - 1];   /* the open-ended latest row */
    var years = Money.isEntered(hit.years) ? hit.years : hit.age;
    return { years: years, months: hit.months || 0, assumed: assumed };
  }
  /* ---- Calendar days, on the person's clock (D-204) ----------------------
     toISOString() is UTC. In New York anything saved after 8pm got
     tomorrow's date, and the last evening of a month landed in the next
     month. So: a "today" stamp is ALWAYS localDay() or localMonth(), and
     arithmetic on a YYYY-MM-DD string (a day plus n days, a month later)
     goes through isoDayUTC(), which formats a Date's UTC parts without
     ever touching the clock. test/run.js fails on a UTC slice of the clock. */
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function localDay(when) {
    if (typeof when === 'string' && /^\d{4}-\d{2}-\d{2}/.test(when)) return when.slice(0, 10);
    var d = when === undefined || when === null ? new Date() : new Date(when);
    if (isNaN(d.getTime())) return null;
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function localMonth(when) {
    var day = localDay(when);
    return day ? day.slice(0, 7) : null;
  }
  function isoDayUTC(d) {
    if (!(d instanceof Date) || isNaN(d.getTime())) return null;
    return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
  }
  function addMonthsIso(iso, months) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!m) return null;
    var d = new Date(Date.UTC(+m[1], +m[2] - 1 + months, +m[3]));
    if (isNaN(d.getTime())) return null;
    return isoDayUTC(d);
  }
  /**
   * milestones(person, table, opts) → [{ id, label, age, ageYears,
   *   ageMonths, date, yearsFromNow, rule, source, citation, confidence,
   *   asOf, byBirthYear, assumed }], sorted by age. `date` needs a date of
   *   birth; `yearsFromNow` needs the age today (opts.asOf for tests).
   *   No table, no rows: the list is never invented.
   */
  function milestones(person, table, opts) {
    var p = person || {}, o = opts || {};
    var rows = table && table.milestones ? table.milestones : [];
    var birthYear = birthYearOf(p);
    var ageNow = ageFromDob(p.dob, o.asOf);
    var out = [];
    rows.forEach(function (row) {
      var a = milestoneAgeOf(row, birthYear);
      if (!a || !Money.isEntered(a.years)) return;
      var months = a.years * 12 + a.months;
      var age = Math.round(months / 12 * 100) / 100;
      out.push({
        id: row.id,
        label: row.label,
        age: age,
        ageYears: a.years,
        ageMonths: a.months,
        date: p.dob ? addMonthsIso(p.dob, months) : null,
        yearsFromNow: Money.isEntered(ageNow) ? Math.round((age - ageNow) * 10) / 10 : null,
        rule: row.rule ? row.rule.value : null,
        source: row.rule ? row.rule.source : null,
        citation: row.rule ? row.rule.citation : null,
        confidence: row.rule ? row.rule.confidence : null,
        asOf: row.rule ? row.rule.asOf : null,
        byBirthYear: !!row.byBirthYear,
        assumed: !!a.assumed
      });
    });
    out.sort(function (x, y) { return x.age - y.age || (x.id < y.id ? -1 : 1); });
    return out;
  }
  function milestonesOn(household) {
    var F = featuresModule();
    if (!F || typeof F.get !== 'function' || !F.get(MILESTONES_FEATURE)) return true;
    return !!F.on(MILESTONES_FEATURE, household);
  }
  /**
   * milestoneMarks(household, table, opts) → [{ x, label, title, faint }]
   *   for the primary adult, on a chart whose x axis is opts.axis:
   *   'age' (x = the age), 'years' (years from now; needs the age today)
   *   or 'months' (months from now). opts.from / opts.to clip the range.
   *   Empty when the switch is off, so a room concatenates without asking.
   */
  function milestoneMarks(household, table, opts) {
    var o = opts || {};
    if (!milestonesOn(household)) return [];
    var person = primaryPerson(household || {});
    if (!person) return [];
    var axis = o.axis || 'age';
    var ageNow = ageFromDob(person.dob, o.asOf);
    if (axis !== 'age' && !Money.isEntered(ageNow)) return [];
    var short = { penaltyFree: '59½', fullRetirementAge: 'full SS', ssEarly: 'SS at 62', ssDelayed: 'SS max', rmd: 'RMDs', medicare: 'Medicare', catchup50: 'catch-up', ruleOf55: 'rule of 55', hsaCatchup55: 'HSA catch-up', catchup60to63: 'bigger catch-up' };
    var marks = milestones(person, table, o).map(function (m) {
      var x = axis === 'age' ? m.age : axis === 'months' ? Math.round((m.age - ageNow) * 12) : Math.round((m.age - ageNow) * 10) / 10;
      return { x: x, label: short[m.id] || m.label, title: m.label + ' at ' + (m.ageMonths ? m.ageYears + ' and ' + m.ageMonths + ' months' : m.ageYears) + (m.assumed ? ' (birth year not known, so the latest rule)' : '') + ': ' + (m.rule || ''), faint: true, milestone: m.id, age: m.age };
    }).filter(function (k) {
      return (!Money.isEntered(o.from) || k.x >= o.from) && (!Money.isEntered(o.to) || k.x <= o.to);
    });
    /* Two rules at one age (55: the rule of 55 and the HSA catch-up) share
       one mark, so the labels never sit on top of each other. */
    var merged = [];
    marks.forEach(function (k) {
      var prev = merged[merged.length - 1];
      if (prev && prev.x === k.x) { prev.label += ' · ' + k.label; prev.title += ' | ' + k.title; prev.milestone += ',' + k.milestone; return; }
      merged.push(k);
    });
    return merged;
  }

  /* ==== 15.1 / 15.10: every number is as-of a date, from a source, at a
     confidence (DECISIONS.md D-181). Storage did not move (D-171): the
     leaf stays a bare cent figure the engines read, and the three facts
     about it live beside it in meta.fields[fieldId], keyed by the
     ownership field id whose DAITE path the leaf answers to. Schema.get
     and Schema.meta are the one pair of accessors; the field map (id ->
     read, path -> ids) is registered by shared/ownership.js, which loads
     after this file. */
  /* 'suggested': a value the app guessed (shared/suggest.js) and the person
     confirmed with one tap; it is entered, at confidence roughly. D-205. */
  var SOURCES = ['typed', 'pasted', 'imported', 'screenshot', 'migrated', 'block-default', 'quote', 'suggested'];
  var CONFIDENCES = ['sure', 'roughly', 'unsure', 'unknown'];
  /* Rounding unit in cents for a figure built on inputs at this confidence:
     to the cent when sure, to the hundred when roughly or unsure, to the
     thousand when unknown (15.10). */
  var ROUNDING = { sure: 1, roughly: 10000, unsure: 10000, unknown: 100000 };
  var fieldMap = null;   /* { read(h, fieldId) -> Result, ids() -> [ids], pathOf(id) -> path } */
  function useFieldMap(fn) { fieldMap = fn && typeof fn === 'object' ? fn : null; return fieldMap; }
  function fieldIdsFor(pathOrId) {
    if (!fieldMap) return [];
    var ids = fieldMap.ids();
    if (ids.indexOf(pathOrId) !== -1) return [pathOrId];
    return ids.filter(function (id) { var p = null; try { p = fieldMap.pathOf(id); } catch (e) { p = null; } return p === pathOrId; });
  }
  /** Schema.get(household, pathOrFieldId): the value, or null when not entered. */
  function get(household, pathOrId) {
    var ids = fieldIdsFor(pathOrId);
    if (!ids.length || !fieldMap) return null;
    var r = fieldMap.read(household || {}, ids[0]);
    return r && Money.isOk(r) ? r.value : null;
  }
  /** The legacy stamps (D-056, D-094, D-095) read as the three facts. */
  function legacyMeta(household, fieldId) {
    var m = (household && household.meta) || {};
    var at = m.confirmedAt && m.confirmedAt[fieldId];
    var room = m.source && m.source[fieldId];
    var guessed = !!(m.guessed && m.guessed[fieldId]);
    if (!at) return null;
    return { asOf: at, source: 'typed', confidence: guessed ? 'roughly' : 'sure', room: room || null };
  }
  /**
   * Schema.meta(household, pathOrFieldId) ->
   *   { fieldId, asOf, source, confidence, room, entered }
   * asOf null and confidence 'unknown' when nothing is known about the
   * figure; never a guess at a date.
   */
  function meta(household, pathOrId) {
    var ids = fieldIdsFor(pathOrId);
    var fieldId = ids.length ? ids[0] : (typeof pathOrId === 'string' ? pathOrId : null);
    var m = (household && household.meta) || {};
    var f = (m.fields && m.fields[fieldId]) || legacyMeta(household, fieldId) || {};
    var entered = fieldMap && ids.length ? get(household, fieldId) !== null : null;
    return {
      fieldId: fieldId,
      asOf: f.asOf || null,
      source: SOURCES.indexOf(f.source) !== -1 ? f.source : (f.asOf ? 'typed' : null),
      confidence: CONFIDENCES.indexOf(f.confidence) !== -1 ? f.confidence : 'unknown',
      room: f.room || null,
      entered: entered
    };
  }
  function confidenceOf(household, pathOrId) { return meta(household, pathOrId).confidence; }
  /** The coarsest confidence across several inputs, and the rounding it demands. */
  function precisionOf(household, pathsOrIds) {
    var worst = 'sure', named = [];
    (pathsOrIds || []).forEach(function (p) {
      var mm = meta(household, p);
      if (mm.entered === false) return;               /* a blank is incomplete, not imprecise */
      if (CONFIDENCES.indexOf(mm.confidence) > CONFIDENCES.indexOf(worst)) worst = mm.confidence;
      if (mm.confidence !== 'sure') named.push(mm.fieldId);
    });
    return { confidence: worst, roundToCents: ROUNDING[worst], approximate: worst !== 'sure', fieldIds: named };
  }
  /** Round cents to the unit a confidence justifies; null stays null. */
  function roundForConfidence(cents, confidence) {
    if (!Money.isEntered(cents)) return cents;
    var unit = ROUNDING[confidence] || 1;
    return unit === 1 ? cents : Math.round(cents / unit) * unit;
  }

  return {
    SCHEMA_VERSION: SCHEMA_VERSION,
    SOURCES: SOURCES, CONFIDENCES: CONFIDENCES, ROUNDING: ROUNDING,
    useFieldMap: useFieldMap, get: get, meta: meta, confidenceOf: confidenceOf, precisionOf: precisionOf, roundForConfidence: roundForConfidence,
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
    saidNoDebt: saidNoDebt,
    TAX_CHARACTERS: TAX_CHARACTERS,
    createWorkProfile: createWorkProfile,
    WORK_DEFAULTS: WORK_DEFAULTS,
    createAsset: createAsset,
    createDebt: createDebt,
    createIncomeSource: createIncomeSource,
    createEstimatedTrackedPair: createEstimatedTrackedPair,
    createExpenseEntry: createExpenseEntry,
    createIncomeEntry: createIncomeEntry,
    createIncomeCost: createIncomeCost,
    createMonthRecord: createMonthRecord,
    createLedger: createLedger,
    createBudget: createBudget,
    INCOME_KINDS: INCOME_KINDS,
    INCOME_FREQUENCIES: INCOME_FREQUENCIES,
    INCOME_KIND_RULES: INCOME_KIND_RULES,
    INCOME_COST_CATEGORIES: INCOME_COST_CATEGORIES,
    TAX_METHODS: TAX_METHODS,
    PRODUCED: PRODUCED,
    DATE_KINDS: DATE_KINDS,
    BUDGET_BUCKETS: BUDGET_BUCKETS,
    costsAllowed: costsAllowed,
    monthLabel: monthLabel,
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
    BUDGET_PRESETS: BUDGET_PRESETS,
    createNotApplicable: createNotApplicable,
    KEEP_REASONS: KEEP_REASONS,
    keepReasonList: keepReasonList,
    FUTURE_KINDS: FUTURE_KINDS,
    createSkillTree: createSkillTree,
    createWalk: createWalk,
    APP_VERSION: APP_VERSION,
    BUILD: BUILD,
    localDay: localDay,
    localMonth: localMonth,
    isoDayUTC: isoDayUTC,
    createExercisesLog: createExercisesLog,
    createVariableIncomePlan: createVariableIncomePlan,
    SPLIT_MODES: SPLIT_MODES,
    createEnough: createEnough,
    createWeekBlock: createWeekBlock,
    createDesignedWeek: createDesignedWeek,
    createExperience: createExperience,
    createTimeBucket: createTimeBucket,
    createDream: createDream,
    createReversibilityPlan: createReversibilityPlan,
    createUnlearning: createUnlearning,
    createStudentLoanPlan: createStudentLoanPlan,
    createBill: createBill,
    createPayLater: createPayLater,
    createCalendar: createCalendar,
    createHistoryPlan: createHistoryPlan,
    LOAN_PLANS: LOAN_PLANS,
    PAY_CADENCES: PAY_CADENCES,
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
    TIERS: TIERS,
    TIER_LABELS: TIER_LABELS,
    DRAW_ORDER_DEFAULT: DRAW_ORDER_DEFAULT,
    DRAWABLE_TIERS: DRAWABLE_TIERS,
    EARLY_PENALTY: EARLY_PENALTY,
    tierOf: tierOf,
    tierLabel: tierLabel,
    drawOf: drawOf,
    tierDraws: tierDraws,
    runwayMonths: runwayMonths,
    MILESTONES_FEATURE: MILESTONES_FEATURE,
    milestones: milestones,
    milestonesOn: milestonesOn,
    milestoneMarks: milestoneMarks,
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
    archivedDebts: archivedDebts,
    allIncomeSources: allIncomeSources,
    totalAssetsCents: totalAssetsCents,
    otherAssetsCents: otherAssetsCents,
    INTAKE_ASSET_CATEGORIES: INTAKE_ASSET_CATEGORIES,
    ORIENTATIONS: ORIENTATIONS,
    INCOME_TYPES: INCOME_TYPES,
    CADENCES: CADENCES,
    FILING_ALIASES: FILING_ALIASES,
    filingStatusOf: filingStatusOf,
    birthYearOf: birthYearOf,
    personName: personName,
    householdOfTwo: householdOfTwo,
    personTag: personTag,
    ownerOf: ownerOf,
    stateRow: stateRow,
    stateCell: stateCell,
    statesByCode: statesByCode,
    ANNUAL_BUCKETS: ANNUAL_BUCKETS,
    createAnnualLine: createAnnualLine,
    cadenceOf: cadenceOf,
    annualLines: annualLines,
    annualLinesOn: annualLinesOn,
    annualMonthlyCents: annualMonthlyCents,
    INCOME_TYPE_LABELS: INCOME_TYPE_LABELS,
    survivesJobLoss: survivesJobLoss,
    survivingIncomeSources: survivingIncomeSources,
    survivingGrossAnnualIncomeCents: survivingGrossAnnualIncomeCents,
    orientationOf: orientationOf,
    afterTaxValue: afterTaxValue,
    ITEMISED_ASSET_CATEGORIES: ITEMISED_ASSET_CATEGORIES,
    cashCents: cashCents,
    investmentsCents: investmentsCents,
    totalDebtCents: totalDebtCents,
    monthlyDebtPaymentsCents: monthlyDebtPaymentsCents,
    grossAnnualIncomeCents: grossAnnualIncomeCents,
    estimatedAnnualTaxCents: estimatedAnnualTaxCents,
    takeHomeAnnualCents: takeHomeAnnualCents,
    takeHomeMonthlyCents: takeHomeMonthlyCents,
    employerMatchCents: employerMatchCents,
    monthlyExpensesCents: monthlyExpensesCents,
    FAT_NEEDS: FAT_NEEDS,
    FAT_CATEGORY_MAP: FAT_CATEGORY_MAP,
    fatBucketOf: fatBucketOf,
    fatNeedsCents: fatNeedsCents,
    FAT_NEEDS: FAT_NEEDS,
    EXPENSE_EVERY: EXPENSE_EVERY,
    monthlyFromEvery: monthlyFromEvery,
    fatFromLines: fatFromLines,
    createExpenses: createExpenses,
    fat: fat,
    withMonthlySpend: withMonthlySpend,
    rentMonthlyCents: rentMonthlyCents,
    oneOffEntry: oneOffEntry,
    ONE_OFF_IN: ONE_OFF_IN,
    ONE_OFF_OUT: ONE_OFF_OUT,
    closedAverageExpensesCents: closedAverageExpensesCents,
    CLOSED_AVERAGE_MONTHS: CLOSED_AVERAGE_MONTHS,
    expenseDivergenceCents: expenseDivergenceCents,
    MAX_PLAUSIBLE_AGE: MAX_PLAUSIBLE_AGE,
    ageFromDob: ageFromDob,
    monthsUntil: monthsUntil,
    checkDob: checkDob,
    primaryAge: primaryAge
  };
});
