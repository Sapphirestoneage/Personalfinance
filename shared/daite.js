/* ==========================================================================
   shared/daite.js — the five families every money number belongs to.
   --------------------------------------------------------------------------
   D · A · I · T · E — debt, assets, income, taxes, expenses. Every shared
   number a room reads or writes is declared as one of these five plus a
   child path; the registry carries the declaration per room, ownership is
   checked against it, and the dashboard shows one tile a letter.

   Storage did not move (see DECISIONS.md D-171 for why): the household is
   still the D-017 shape and every room reads it through the same Schema
   accessors as before. What this file adds is the ONE vocabulary:

     FAMILIES              the five, with letter and label
     CONTEXT               the four non-money families a room may also
                           declare: you, plans, prefs, progress (+ scenarios)
     PATHS                 ownership field id -> declared path
     pathOf(fieldId)       the same, throwing on an unmapped field
     familyOf(path)        'debt' | ... | 'you' | ... | null
     isMoney(path)         under one of the five
     view(h, tables)       the household read as the five families, Results
                           throughout - never a zero for a blank

   A room that needs a number outside these families is a design error; the
   test suite fails on an undeclared path.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('./money.js'), Schema: require('./schema.js') };
  } else {
    deps = { Money: root.SLAF && root.SLAF.Money, Schema: root.SLAF && root.SLAF.Schema };
  }
  var api = factory(deps.Money, deps.Schema);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Daite = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema) {
  'use strict';

  var FAMILIES = [
    { id: 'debt',     letter: 'D', label: 'Debt',     say: 'what you owe' },
    { id: 'assets',   letter: 'A', label: 'Assets',   say: 'what you own' },
    { id: 'income',   letter: 'I', label: 'Income',   say: 'what comes in' },
    { id: 'taxes',    letter: 'T', label: 'Taxes',    say: 'what the state takes' },
    { id: 'expenses', letter: 'E', label: 'Expenses', say: 'what goes out' }
  ];
  var FAMILY_IDS = FAMILIES.map(function (f) { return f.id; });

  /* Not money numbers, and declared as such so nothing hides in them:
       you        who the household is - people, ages, situation, cover
       plans      a decision being weighed, a target being aimed at
       prefs      how to show things; per user, not per household
       progress   what has been learned or walked
       scenarios  hypotheticals layered on the facts (D-176, D-178) */
  var CONTEXT = ['you', 'plans', 'prefs', 'progress', 'scenarios'];

  /* Ownership field id -> the declared path. Kept beside the ownership map
     rather than inside it so this file stays the one list of paths. */
  var PATHS = {
    /* D */
    totalDebt: 'debt.items', monthlyDebtPayments: 'debt.items[].minimumCents', hasDebt: 'debt.none',
    loanPlan: 'debt.items[].plan', loanExtra: 'debt.items[].plan', idrShare: 'debt.items[].plan', forgivenessYears: 'debt.items[].plan',
    /* A */
    cashSavings: 'assets.cashCents', investments: 'assets.invested', otherAssets: 'assets.property',
    netWorth: 'assets', confidenceWeightedNetWorth: 'assets', tuitionSaved: 'assets.invested',
    allocationStocks: 'assets.allocation', allocationBonds: 'assets.allocation', allocationCash: 'assets.allocation',
    rebalanceBand: 'assets.allocation', stockShare: 'assets.allocation',
    rothContributed: 'assets.contributions.roth', hsaContributed: 'assets.contributions.hsa', contributionPercent: 'assets.contributions.pretax',
    /* I */
    grossAnnualIncome: 'income.grossAnnualCents', employerMatch: 'income.sources[].employerMatch', capturingFullMatch: 'income.sources[].employerMatch',
    unemployment: 'income.sources[].benefit', incomeLow: 'income.variable', incomeHigh: 'income.variable', bufferMonths: 'income.variable',
    variableWindow: 'income.variable', futureIncome: 'income.future', ledgerIncome: 'income.ledger',
    payCadence: 'income.cadence', nextPayday: 'income.cadence',
    /* T */
    filingStatus: 'taxes.filingStatus', state: 'taxes.state', zip: 'taxes.zip', marginalRate: 'taxes.marginalRate',
    otherPreTax: 'taxes.otherPreTax', withheld: 'taxes.withheld',
    /* E */
    monthlyExpenses: 'expenses', rentMonthly: 'expenses.needs.accommodation',
    foodMonthly: 'expenses.needs.food', accommodationMonthly: 'expenses.needs.accommodation', transportationMonthly: 'expenses.needs.transportation',
    wantsMonthly: 'expenses.wants', therapyMonthly: 'expenses.wants.therapy', billsMonthly: 'expenses.log', payLaterDue: 'expenses.log',
    monthsClosed: 'expenses.months', givingPct: 'expenses.giving', givingTarget: 'expenses.giving', floorMonthly: 'expenses.floor',
    sharedMonthly: 'expenses.shared', splitMode: 'expenses.shared', healthMonthly: 'expenses.insurance',
    /* you */
    dob: 'you.dob', age: 'you.dob', employmentStatus: 'you.situation', dependents: 'you.dependents', partnerName: 'you.partner', partnerDob: 'you.partner',
    highestDeductible: 'you.cover', oopMax: 'you.cover', termLife: 'you.cover', disabilityMonthly: 'you.cover', umbrella: 'you.cover', healthCover: 'you.cover',
    beneficiariesSet: 'you.estate', willExists: 'you.estate', poaExists: 'you.estate',
    /* plans */
    retireAge: 'plans.targets', coastAge: 'plans.targets', swanTarget: 'plans.swan', expectedSearchMonths: 'plans.betweenJobs',
    offerGross: 'plans.careerMove', offerHours: 'plans.careerMove', offerCommute: 'plans.careerMove', offerCosts: 'plans.careerMove', offerSignOn: 'plans.careerMove',
    tuitionTarget: 'plans.kids', tuitionMonthly: 'plans.kids',
    rentAlternative: 'plans.housing', homePrice: 'plans.housing', downPct: 'plans.housing', mortgageRate: 'plans.housing',
    purchasePrice: 'plans.purchase', purchaseMonths: 'plans.purchase', purchaseRate: 'plans.purchase',
    enoughMonthly: 'plans.enough', designedHours: 'plans.week', bucketsPlanned: 'plans.buckets', dreamsMonthly: 'plans.dreams',
    reversibilityDecision: 'plans.reversibility', unlearningDropped: 'plans.unlearning',
    plannedAnnualDraw: 'plans.decumulation', socialSecurityAt: 'plans.decumulation', rerankCut: 'plans.rerank',
    /* prefs, progress */
    historyCompareTo: 'prefs.history',
    skillsDone: 'progress.learning', exercisesDone: 'progress.learning', practiceLedger: 'progress.learning'
  };

  function pathOf(fieldId) {
    var p = PATHS[fieldId];
    if (!p) throw new Error('No DAITE path declared for field ' + fieldId + ' - add it to shared/daite.js PATHS');
    return p;
  }
  function familyOf(path) {
    var head = String(path || '').split('.')[0].replace(/\[\]$/, '');
    if (FAMILY_IDS.indexOf(head) !== -1 || CONTEXT.indexOf(head) !== -1) return head;
    return null;
  }
  function isMoney(path) { return FAMILY_IDS.indexOf(familyOf(path)) !== -1; }
  function letterOf(path) {
    var fam = FAMILIES.filter(function (f) { return f.id === familyOf(path); })[0];
    return fam ? fam.letter : null;
  }
  /** 'D.items[].minimumCents' <-> 'debt.items[].minimumCents' */
  function short(path) {
    var l = letterOf(path);
    return l ? l + path.slice(familyOf(path).length) : path;
  }

  /* ---- The five families, read off the household --------------------------
     Every figure is a Result from the same accessors the rooms use; a blank
     stays incomplete and names what it wants. `tables` is optional and only
     the tax and take-home figures need it. */
  function orientationOf(asset) {
    var t = asset.taxCharacter;
    if (t === 'pretax' || t === 'roth' || t === 'taxable') return t;
    if (asset.category === 'retirement') return 'pretax';
    return t || 'taxable';
  }
  function view(household, tables) {
    var h = household || {};
    var debts = Schema.aggregatableDebts ? Schema.aggregatableDebts(h) : (h.debts || []);
    var assets = (h.assets || []);
    var invested = assets.filter(function (a) { return a.category === 'investment' || a.category === 'retirement'; });
    var gross = Schema.grossAnnualIncomeCents(h);
    var tax = Schema.estimatedAnnualTaxCents ? Schema.estimatedAnnualTaxCents(h, tables) : Money.incomplete('No tax estimate.', ['effectiveTaxRates']);
    var take = Schema.takeHomeAnnualCents ? Schema.takeHomeAnnualCents(h, tables) : tax;
    var assumptions = Schema.resolveAssumptions(h);
    return {
      debt: {
        items: debts.map(function (d) { return { id: d.id, label: d.label, balanceCents: d.balanceCents, apr: d.rate, minimumCents: d.minPaymentCents, kind: d.type }; }),
        totalCents: Schema.totalDebtCents(h),
        minimumsMonthlyCents: Schema.monthlyDebtPaymentsCents(h),
        none: !!Schema.saidNoDebt(h)
      },
      assets: {
        cashCents: Schema.cashCents(h),
        invested: invested.map(function (a) { return { id: a.id, label: a.label, valueCents: a.valueCents, orientation: orientationOf(a) }; }),
        investedCents: Schema.investmentsCents(h),
        property: (h.property || []).slice(),
        totalCents: Schema.totalAssetsCents(h)
      },
      income: {
        grossAnnualCents: gross,
        takeHomeAnnualCents: take,
        sources: (Schema.allIncomeSources ? Schema.allIncomeSources(h) : []).map(function (s) { return { id: s.id, label: s.source, grossAnnualCents: s.grossAnnualIncomeCents, type: s.type }; })
      },
      taxes: {
        filingStatus: h.filingStatus || null,
        state: h.state || null,
        effectiveRate: Money.isOk(tax) ? Money.ok(tax.effectiveRate) : tax,
        marginalRate: Money.isEntered(assumptions.marginalRate) ? Money.ok(assumptions.marginalRate) : Money.incomplete('Not asked yet.', ['marginalRate']),
        estimatedAnnualCents: tax
      },
      expenses: (function () {
        var f = Schema.fat ? Schema.fat(h) : null;
        return {
          needs: f ? { food: f.food, accommodation: f.accommodation, transportation: f.transportation } : null,
          wants: f ? { totalCents: f.wants, therapy: f.therapy } : null,
          monthlyCents: Schema.monthlyExpensesCents(h)
        };
      })()
    };
  }

  return { FAMILIES: FAMILIES, FAMILY_IDS: FAMILY_IDS, CONTEXT: CONTEXT, PATHS: PATHS,
    pathOf: pathOf, familyOf: familyOf, isMoney: isMoney, letterOf: letterOf, short: short, view: view };
});
