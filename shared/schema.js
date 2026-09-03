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

  var ASSUMPTION_DEFAULTS = {
    expectedReturnRate: 0.07,   // nominal annual, decimal fraction
    swrRate: 0.04              // safe withdrawal rate, decimal fraction
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
    'incomeSource.grossAnnualIncomeCents':       { class: 'raw',        unit: 'cents',   period: 'annual' },
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
    'expenses.monthlyEssential.estimatedValueCents': { class: 'raw',    unit: 'cents',   period: 'monthly', source: 'estimated' },
    'expenses.monthlyEssential.trackedValueCents':   { class: 'raw',    unit: 'cents',   period: 'monthly', source: 'tracked' },
    'expenses.monthlyEssential.divergenceCents':     { class: 'computed', unit: 'cents', period: 'monthly', note: 'tracked − estimated; SPEC.md §12.3' },
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
      frequency: f.frequency || 'annual',          // stored annual; converted at the edge
      type: f.type || 'w2',
      employerMatch: f.employerMatch || {
        matchPercent: null,                        // 0.5 === 50 cents on the dollar
        matchCapPercentOfSalary: null              // 0.06 === up to first 6% of salary
      }
    };
  }

  function createPerson(fields) {
    var f = fields || {};
    return {
      id: f.id || newId('p'),
      label: f.label || null,
      role: f.role || 'adult',
      dob: f.dob === undefined ? null : f.dob,     // ISO 'YYYY-MM-DD'
      incomeSources: f.incomeSources || []
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
        /* Cash Flow calc (Tier 1) fills this. Shaped for imported
           transactions from day one — SPEC.md §12.5. Each entry:
           { id, category, amountCents, period, source: 'manual'|'imported' } */
        categories: (f.expenses && f.expenses.categories) || []
      },
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

  function ageFromDob(dob, asOf) {
    if (!dob) return null;
    var birth = new Date(dob + 'T00:00:00Z');
    if (isNaN(birth.getTime())) return null;
    var now = asOf ? new Date(asOf + 'T00:00:00Z') : new Date();
    var age = now.getUTCFullYear() - birth.getUTCFullYear();
    var m = now.getUTCMonth() - birth.getUTCMonth();
    if (m < 0 || (m === 0 && now.getUTCDate() < birth.getUTCDate())) age--;
    return age >= 0 ? age : null;
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
    createAsset: createAsset,
    createDebt: createDebt,
    createIncomeSource: createIncomeSource,
    createEstimatedTrackedPair: createEstimatedTrackedPair,
    resolveAssumptions: resolveAssumptions,
    personById: personById,
    primaryPerson: primaryPerson,
    adults: adults,
    isAggregatable: isAggregatable,
    ownedBy: ownedBy,
    aggregatableAssets: aggregatableAssets,
    aggregatableDebts: aggregatableDebts,
    allIncomeSources: allIncomeSources,
    totalAssetsCents: totalAssetsCents,
    cashCents: cashCents,
    investmentsCents: investmentsCents,
    totalDebtCents: totalDebtCents,
    monthlyDebtPaymentsCents: monthlyDebtPaymentsCents,
    grossAnnualIncomeCents: grossAnnualIncomeCents,
    employerMatchCents: employerMatchCents,
    monthlyExpensesCents: monthlyExpensesCents,
    expenseDivergenceCents: expenseDivergenceCents,
    ageFromDob: ageFromDob,
    primaryAge: primaryAge
  };
});
