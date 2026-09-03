/* ==========================================================================
   shared/demo-persona.js — the one demo household, defined once.
   --------------------------------------------------------------------------
   SPEC.md §5.1. Every room's "Try with example numbers" action fills from
   THIS persona, so the example salary a visitor sees in one room is the same
   salary the household model shows in the next. Rooms must not hardcode
   their own demo numbers.

   These are the values logged in DECISIONS.md (D-005). Changing one here
   changes it everywhere — update that entry too.

   This repo is public. Robin Sparks is fictional; every figure below is
   invented for demonstration.
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
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.DemoPersona = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema) {
  'use strict';

  /* Plain-dollar figures — the numbers a person would type into the form.
     Rooms read these to populate their inputs; build() converts to cents. */
  var VALUES = {
    label: 'Robin Sparks',
    dob: '1994-04-12',
    state: 'NC',
    filingStatus: 'single',

    grossAnnualIncome: 72000,
    incomeType: 'w2',
    employerMatchPercent: 0.5,              // matches 50 cents on the dollar
    employerMatchCapPercentOfSalary: 0.06,  // up to the first 6% of salary
    capturingFullMatch: false,              // deliberately NOT capturing it —
                                            // makes the demo surface a real flag

    cashSavings: 9500,
    investmentsAndRetirement: 48000,

    debts: [
      { label: 'Student loan', balance: 18400, rate: 0.055, minPayment: 210, type: 'student_loan' },
      { label: 'Credit card',  balance: 3200,  rate: 0.229, minPayment: 95,  type: 'credit_card' }
    ],

    monthlyEssentialExpenses: 3150
  };

  /* Convenience roll-ups for rooms whose Tier 0 form takes lump sums. */
  VALUES.totalDebtBalance = VALUES.debts.reduce(function (s, d) { return s + d.balance; }, 0);
  VALUES.totalMonthlyDebtPayments = VALUES.debts.reduce(function (s, d) { return s + d.minPayment; }, 0);

  /** Build a complete household object from the persona. */
  function build() {
    var person = Schema.createPerson({
      id: 'demo_person_robin',
      label: VALUES.label,
      role: 'adult',
      dob: VALUES.dob
    });

    person.incomeSources.push(Schema.createIncomeSource({
      id: 'demo_income_primary',
      personId: person.id,
      source: 'Day job',
      grossAnnualIncomeCents: Money.toCents(VALUES.grossAnnualIncome),
      type: VALUES.incomeType,
      employerMatch: {
        matchPercent: VALUES.employerMatchPercent,
        matchCapPercentOfSalary: VALUES.employerMatchCapPercentOfSalary
      }
    }));

    var household = Schema.createHousehold({
      people: [person],
      filingStatus: VALUES.filingStatus,
      state: VALUES.state,
      assets: [
        Schema.createAsset({
          id: 'demo_asset_cash', label: 'Savings account', category: 'cash',
          valueCents: Money.toCents(VALUES.cashSavings), liquid: true, ownerIds: [person.id]
        }),
        Schema.createAsset({
          id: 'demo_asset_invest', label: 'Investments + retirement', category: 'investment',
          valueCents: Money.toCents(VALUES.investmentsAndRetirement), liquid: false, ownerIds: [person.id]
        })
      ],
      debts: VALUES.debts.map(function (d, i) {
        return Schema.createDebt({
          id: 'demo_debt_' + i,
          label: d.label,
          balanceCents: Money.toCents(d.balance),
          rate: d.rate,
          minPaymentCents: Money.toCents(d.minPayment),
          type: d.type,
          ownerIds: [person.id]
        });
      }),
      expenses: {
        monthlyEssential: {
          estimatedValueCents: Money.toCents(VALUES.monthlyEssentialExpenses),
          trackedValueCents: null
        }
      },
      meta: { isDemo: true }
    });

    household.capturingFullMatch = VALUES.capturingFullMatch;
    return household;
  }

  return { VALUES: VALUES, build: build };
});
