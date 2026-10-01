/* ==========================================================================
   engine/assumptions.js, every assumption the projection runs on,
   declared once and echoed back in run.assumptionsUsed. D-341.
   --------------------------------------------------------------------------
   The household's own assumptions (shared/schema.js resolveAssumptions:
   the real return, inflation, real wage growth, the withdrawal rate) come
   first; the engine's extra settings sit beside them with their defaults;
   whatever the caller passes in `overrides` wins. No room keeps a private
   copy of any of these.

   Dollars: the engine computes in NOMINAL terms (so the tax tables, which
   are nominal, apply as written) and every row carries `deflator`, the
   factor that turns its figures into today's dollars. Rooms display
   today's dollars by default and offer the nominal view as a toggle.
   That is declared here, once, as `dollars` and `displayDefault`.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) deps = { Schema: require('../shared/schema.js'), Money: require('../shared/money.js'), Tables: require('./tables.js') };
  else deps = { Schema: root.SLAF && root.SLAF.Schema, Money: root.SLAF && root.SLAF.Money, Tables: root.SLAF && root.SLAF.Engine && root.SLAF.Engine.Tables };
  var api = factory(deps.Schema, deps.Money, deps.Tables);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Engine = root.SLAF.Engine || {}; root.SLAF.Engine.Assumptions = api; }
})(typeof self !== 'undefined' ? self : null, function (Schema, Money, Tables) {
  'use strict';

  var DEFAULT_CONTRIBUTION_ORDER = ['match', 'hsa', 'rothIra', 'k401', 'taxable'];
  var DEFAULT_WITHDRAWAL_ORDER = ['cash', 'taxable', 'rothBasis', 'seasonedConversions', 'pretax', 'rothEarnings', 'hsa'];

  /* Each default with the one-line reason a show-your-work view prints. */
  var NOTES = {
    baseYear: 'The first projected year: the calendar year of the run date.',
    horizonAge: 'The projection runs until the older adult reaches this age.',
    dollars: 'Every row is computed in nominal dollars; `deflator` on each row turns it into today\'s dollars.',
    displayDefault: 'Rooms show today\'s dollars by default and offer the nominal view as a toggle.',
    inflation: 'Prices, the tax tables, the poverty line and the plan limits grow at this rate a year.',
    returnReal: 'The real return on invested money, the household\'s own assumption (the median planning band).',
    returnNominal: 'The real return compounded with inflation: what the balances actually grow by.',
    wageGrowthReal: 'Pay grows this much a year over inflation (the household\'s own assumption).',
    wageGrowthNominal: 'Wage growth compounded with inflation.',
    cashReturnNominal: 'Cash keeps pace with inflation and no more, unless set.',
    homeAppreciationNominal: 'A home keeps pace with inflation and no more, unless set.',
    dividendYield: 'The share of a taxable account paid out each year as qualified dividends; the rest of the return is unrealised until sold.',
    taxableBasisShare: 'When a taxable account has no cost basis typed, this share of its value stands in.',
    retireAge: 'Earned income stops in the year the primary adult reaches this age (Settings owns it).',
    retireAges: 'One stop age per adult, when they differ.',
    traditionalRetirementAge: 'Coast FI asks whether FI still arrives by this age with no more contributions.',
    swrRate: 'The withdrawal rate behind the FI number and the FI ratio.',
    emergencyFundMonths: 'Cash below this many months of spending is not drawn on before other accounts.',
    socialSecurity: 'Per adult: the monthly benefit at full retirement age in today\'s dollars, and the claim age. A null benefit means none is counted and a warning says so.',
    healthCoverageWhileWorking: 'Where health cover comes from while anyone earns: employer, marketplace, medicaid or none.',
    healthcareMonthlyCents: 'What the household pays for employer cover a month today (from Protection); inflated.',
    acaBenchmarkMonthlyCents: 'The second-lowest-cost silver plan premium a month for the household today. Depends on age and ZIP: look it up at healthcare.gov. The default is a placeholder.',
    medicaidExpansion: 'Whether the state expanded Medicaid (New York did): under 138% of the poverty line the household pays no premium.',
    acaRule: 'Which subsidy rule applies: the 400% cliff (current law for 2026) or the enhanced no-cliff table if Congress restores it.',
    medicareMonthlyPerPersonCents: 'What each adult pays a month for Medicare (Part B, Part D and a supplement) from 65, in today\'s dollars.',
    contributionOrder: 'Where a surplus goes, in order, each to its limit.',
    withdrawalOrder: 'Where a shortfall comes from, in order.',
    conversion: 'The Roth conversion strategy: none, fillBracket (to the top of a bracket), targetMagi (keep MAGI at a figure) or fixed (a set amount a year, today\'s dollars).',
    exceptions: 'Early-access exceptions the household is relying on: the Rule of 55, a 72(t) SEPP, a backdoor Roth.',
    workplaceRothShare: 'The share of workplace plan contributions that go to the Roth side.',
    stateFlatRate: 'For a state with no schedule file: the flat effective rate on income.',
    rothOpenedYear: 'The year the first Roth IRA was opened, for the five-year rule on earnings.',
    indexing: 'Thresholds the IRS indexes are grown smoothly at the inflation rate rather than in $25 to $100 steps.'
  };

  function entered(v) { return Money.isEntered(v); }

  /**
   * resolve(household, overrides, now) -> the full assumption set.
   *   overrides.tables hands the engine its tables in the browser.
   */
  function resolve(household, overrides, now) {
    var h = household || {}, o = overrides || {};
    if (o.tables) Tables.use(o.tables);
    var base = Schema.resolveAssumptions(h, null);
    var date = now instanceof Date ? now : (now ? new Date(now) : new Date());
    var inflation = entered(o.inflation) ? o.inflation : (entered(base.inflation) ? base.inflation : 0.03);
    var returnReal = entered(o.returnReal) ? o.returnReal : base.returnReal;
    var wageReal = entered(o.wageGrowthReal) ? o.wageGrowthReal : (entered(base.realWageGrowth) ? base.realWageGrowth : 0.01);
    var retireAge = entered(o.retireAge) ? o.retireAge : ((h.targets && entered(h.targets.retireAge)) ? h.targets.retireAge : 65);
    var adults = Schema.adults(h);
    var ssClaim = (h.decumulation && entered(h.decumulation.socialSecurityAt)) ? h.decumulation.socialSecurityAt : 67;
    var ss = adults.map(function (p, i) {
      var given = (o.socialSecurity && o.socialSecurity[i]) || {};
      return { personId: p.id, monthlyAtFraCents: entered(given.monthlyAtFraCents) ? given.monthlyAtFraCents : null,
        claimAge: entered(given.claimAge) ? given.claimAge : ssClaim };
    });
    var health = (h.insurance && h.insurance.health) || {};
    var A = {
      baseYear: entered(o.baseYear) ? o.baseYear : date.getFullYear(),
      horizonAge: entered(o.horizonAge) ? o.horizonAge : 95,
      dollars: 'nominal',
      displayDefault: 'today',
      inflation: inflation,
      returnReal: returnReal,
      returnNominal: entered(o.returnNominal) ? o.returnNominal : (1 + returnReal) * (1 + inflation) - 1,
      wageGrowthReal: wageReal,
      wageGrowthNominal: entered(o.wageGrowthNominal) ? o.wageGrowthNominal : (1 + wageReal) * (1 + inflation) - 1,
      cashReturnNominal: entered(o.cashReturnNominal) ? o.cashReturnNominal : inflation,
      homeAppreciationNominal: entered(o.homeAppreciationNominal) ? o.homeAppreciationNominal : inflation,
      dividendYield: entered(o.dividendYield) ? o.dividendYield : 0.02,
      taxableBasisShare: entered(o.taxableBasisShare) ? o.taxableBasisShare : 0.6,
      retireAge: retireAge,
      retireAges: Array.isArray(o.retireAges) ? o.retireAges : adults.map(function () { return retireAge; }),
      traditionalRetirementAge: entered(o.traditionalRetirementAge) ? o.traditionalRetirementAge : 65,
      swrRate: entered(o.swrRate) ? o.swrRate : base.swrRate,
      emergencyFundMonths: entered(o.emergencyFundMonths) ? o.emergencyFundMonths : 6,
      socialSecurity: ss,
      healthCoverageWhileWorking: o.healthCoverageWhileWorking || health.type || 'employer',
      healthcareMonthlyCents: entered(o.healthcareMonthlyCents) ? o.healthcareMonthlyCents : (entered(health.monthlyCents) ? health.monthlyCents : 0),
      acaBenchmarkMonthlyCents: entered(o.acaBenchmarkMonthlyCents) ? o.acaBenchmarkMonthlyCents : 80000 * Math.max(1, adults.length),
      acaBenchmarkHint: 'Look up the second-lowest-cost silver plan for your ages and ZIP at healthcare.gov; the default is a placeholder.',
      acaRule: o.acaRule || null,
      medicaidExpansion: typeof o.medicaidExpansion === 'boolean' ? o.medicaidExpansion : true,
      medicareMonthlyPerPersonCents: entered(o.medicareMonthlyPerPersonCents) ? o.medicareMonthlyPerPersonCents : null,
      contributionOrder: Array.isArray(o.contributionOrder) ? o.contributionOrder.slice() : DEFAULT_CONTRIBUTION_ORDER.slice(),
      withdrawalOrder: Array.isArray(o.withdrawalOrder) ? o.withdrawalOrder.slice() : DEFAULT_WITHDRAWAL_ORDER.slice(),
      conversion: Object.assign({ strategy: 'none', bracketRate: 0.12, targetMagiCents: null, fixedCents: null, fromAge: null, untilAge: null, whileWorking: false }, o.conversion || {}),
      exceptions: Object.assign({ ruleOf55: false, sepp: false, backdoorRoth: false }, o.exceptions || {}),
      workplaceRothShare: entered(o.workplaceRothShare) ? o.workplaceRothShare : 0,
      stateFlatRate: entered(o.stateFlatRate) ? o.stateFlatRate : null,
      rothOpenedYear: entered(o.rothOpenedYear) ? o.rothOpenedYear : null,
      indexing: 'smooth',
      notes: NOTES
    };
    var t = Tables.get();
    if (A.acaRule === null) A.acaRule = t.acaPct ? t.acaPct.currentLaw : 'cliff';
    if (A.medicareMonthlyPerPersonCents === null) A.medicareMonthlyPerPersonCents = t.tax ? Math.round(t.tax.federal.medicare.defaultMonthlyAllPartsPerPerson * 100) : 45000;
    return A;
  }

  return { resolve: resolve, NOTES: NOTES, DEFAULT_CONTRIBUTION_ORDER: DEFAULT_CONTRIBUTION_ORDER, DEFAULT_WITHDRAWAL_ORDER: DEFAULT_WITHDRAWAL_ORDER };
});
