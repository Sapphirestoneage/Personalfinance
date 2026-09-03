/* ==========================================================================
   engines/selfemployed.js — SE tax, W2 vs 1099, quarterly estimates.
   --------------------------------------------------------------------------
   SPEC.md §13 flags this area twice, and both warnings shape the code:

     "SE tax calc (15.3% on net earnings, employer-equivalent half
      deductible) is a common source of off-by-a-factor errors"
     "Include the safe harbor rule (pay 100-110% of prior year's liability) —
      most DIY calculators skip it"

   So self-employment tax is computed in named steps rather than as one
   multiplication, and every step is reported back:

     1. net earnings   = net profit × 92.35%
     2. Social Security = net earnings up to the wage base × 12.4%
     3. Medicare        = all net earnings × 2.9%
     4. additional Medicare on earnings above a filing-status threshold
     5. half of (2 + 3) is deductible against income tax

   The classic off-by-a-factor is applying 15.3% to net profit instead of to
   net earnings, or forgetting the deductible half. Both are tested against a
   worked $100,000 example.

   All rates and thresholds come from data/se_tax_2026.json.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = {
      Money: require('../shared/money.js'),
      Schema: require('../shared/schema.js'),
      Reference: require('../shared/reference.js')
    };
  } else {
    deps = {
      Money: root.SLAF && root.SLAF.Money,
      Schema: root.SLAF && root.SLAF.Schema,
      Reference: root.SLAF && root.SLAF.Reference
    };
  }
  var api = factory(deps.Money, deps.Schema, deps.Reference);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.SelfEmployed = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Reference) {
  'use strict';

  /* ---- Self-employment tax ----------------------------------------------- */

  /**
   * selfEmploymentTax(netProfitCents, filingStatus, table)
   * Returns a Result whose value is the total SE tax in cents, with every
   * intermediate step in the meta so a room can show the working.
   */
  function selfEmploymentTax(netProfitCents, filingStatus, table) {
    if (!table) return Money.incomplete('Self-employment tax table is not loaded.', ['seTax']);
    if (!Money.isEntered(netProfitCents)) {
      return Money.incomplete('Add your self-employment profit to see this.', ['netProfit']);
    }
    if (netProfitCents <= 0) {
      return Money.ok(0, {
        netEarningsCents: 0, socialSecurityCents: 0, medicareCents: 0,
        additionalMedicareCents: 0, deductibleHalfCents: 0,
        noTaxBecause: 'There is no self-employment profit to tax.',
        referenceVersion: table.version
      });
    }

    /* 1. Only 92.35% of net profit is subject to the tax. Skipping this is
          the single most common error in the whole calculation. */
    var netEarnings = Math.round(netProfitCents * table.netEarningsFactor);

    /* 2. Social Security stops at the wage base. */
    var wageBaseCents = Math.round(table.socialSecurityWageBase * 100);
    var ssBase = Math.min(netEarnings, wageBaseCents);
    var socialSecurity = Math.round(ssBase * table.socialSecurityRate);

    /* 3. Medicare has no cap. */
    var medicare = Math.round(netEarnings * table.medicareRate);

    /* 4. An extra levy above a threshold, which is NOT deductible. */
    var addl = table.additionalMedicare;
    var threshold = addl.thresholds[filingStatus];
    var additionalMedicare = 0;
    if (Money.isEntered(threshold)) {
      var over = netEarnings - Math.round(threshold * 100);
      if (over > 0) additionalMedicare = Math.round(over * addl.rate);
    }

    /* 5. Half of the ordinary SE tax — not the additional Medicare — is
          deductible, standing in for the half an employer would have paid. */
    var ordinary = socialSecurity + medicare;
    var deductibleHalf = Math.round(ordinary / 2);

    return Money.ok(ordinary + additionalMedicare, {
      netProfitCents: netProfitCents,
      netEarningsCents: netEarnings,
      netEarningsFactor: table.netEarningsFactor,
      socialSecurityCents: socialSecurity,
      socialSecurityCappedAt: ssBase === wageBaseCents ? wageBaseCents : null,
      medicareCents: medicare,
      additionalMedicareCents: additionalMedicare,
      additionalMedicareThresholdCents: Money.isEntered(threshold) ? Math.round(threshold * 100) : null,
      ordinaryCents: ordinary,
      deductibleHalfCents: deductibleHalf,
      effectiveRateOnProfit: ordinary + additionalMedicare > 0
        ? (ordinary + additionalMedicare) / netProfitCents : 0,
      filingStatusKnown: Money.isEntered(threshold),
      referenceVersion: table.version
    });
  }

  /* ---- W2 vs 1099 ---------------------------------------------------------
     §13: "normalizes take-home pay accounting for SE tax and lost benefits."
     The number people actually want is the one at the end: what a contract
     rate has to be to leave you no worse off than the salary.            */

  function compareW2vs1099(household, tables, opts) {
    var o = opts || {};
    var seTable = tables && tables.seTax;
    var taxTable = tables && tables.effectiveTaxRates;
    if (!seTable || !taxTable) {
      return Money.incomplete('Tax reference tables are not loaded.', ['seTax']);
    }
    var filingStatus = o.filingStatus || (household && household.filingStatus);
    if (!filingStatus) {
      return Money.incomplete('Choose a filing status to compare these.', ['filingStatus']);
    }
    var missing = Money.missingFrom({
      w2SalaryCents: o.w2SalaryCents, contractIncomeCents: o.contractIncomeCents
    });
    if (missing.length) {
      return Money.incomplete('Add both the salary and the contract income to compare them.', missing);
    }

    var benefits = Money.isEntered(o.w2BenefitsValueCents) ? o.w2BenefitsValueCents : 0;
    var expenses = Money.isEntered(o.businessExpensesCents) ? o.businessExpensesCents : 0;

    /* --- The W2 side. FICA is the employee half only; the employer pays the
           matching half, which is exactly what the 1099 side loses. */
    var w2Fica = Math.round(o.w2SalaryCents * seTable.employeeFicaRate);
    var w2IncomeRate = Reference.lookupEffectiveTaxRate(taxTable, o.w2SalaryCents / 100, filingStatus);
    if (!Money.isOk(w2IncomeRate)) return w2IncomeRate;
    /* The effective table already blends income tax and the employee FICA
       half, so subtracting FICA again would double-count it. Income tax
       alone is the table rate less the FICA share. */
    var w2IncomeTaxRate = Math.max(0, w2IncomeRate.value - seTable.employeeFicaRate);
    var w2IncomeTax = Math.round(o.w2SalaryCents * w2IncomeTaxRate);
    var w2Net = o.w2SalaryCents - w2Fica - w2IncomeTax + benefits;

    /* --- The 1099 side. */
    var netProfit = o.contractIncomeCents - expenses;
    var se = selfEmploymentTax(netProfit, filingStatus, seTable);
    if (!Money.isOk(se)) return se;
    var taxableAfterSeDeduction = Math.max(0, netProfit - se.deductibleHalfCents);
    var c1099Rate = Reference.lookupEffectiveTaxRate(taxTable, taxableAfterSeDeduction / 100, filingStatus);
    if (!Money.isOk(c1099Rate)) return c1099Rate;
    var c1099IncomeTaxRate = Math.max(0, c1099Rate.value - seTable.employeeFicaRate);
    var c1099IncomeTax = Math.round(taxableAfterSeDeduction * c1099IncomeTaxRate);
    var c1099Net = netProfit - se.value - c1099IncomeTax;

    /* --- The answer people want: what the contract rate would have to be.
           The 1099 side loses the employer FICA half and the benefits, and
           gets back the deduction, so scale the gap up by the ratio the
           current comparison implies rather than guessing a multiplier. */
    var ratio = c1099Net > 0 ? o.contractIncomeCents / c1099Net : null;
    var equivalentContractCents = ratio ? Math.round(w2Net * ratio) : null;

    return Money.ok(c1099Net - w2Net, {
      filingStatus: filingStatus,
      w2: {
        grossCents: o.w2SalaryCents, ficaCents: w2Fica, incomeTaxCents: w2IncomeTax,
        benefitsCents: benefits, netCents: w2Net, effectiveRate: w2IncomeRate.value
      },
      contract: {
        grossCents: o.contractIncomeCents, businessExpensesCents: expenses,
        netProfitCents: netProfit, seTaxCents: se.value,
        seDeductibleHalfCents: se.deductibleHalfCents,
        taxableAfterDeductionCents: taxableAfterSeDeduction,
        incomeTaxCents: c1099IncomeTax, netCents: c1099Net, se: se
      },
      differenceCents: c1099Net - w2Net,
      contractIsBetter: c1099Net > w2Net,
      equivalentContractCents: equivalentContractCents,
      extraNeededCents: Money.isEntered(equivalentContractCents)
        ? equivalentContractCents - o.contractIncomeCents : null,
      referenceVersion: seTable.version
    });
  }

  /* ---- Quarterly estimated tax -------------------------------------------
     §13: include the safe harbor, "most DIY calculators skip it". The
     required annual payment is the LESSER of a share of this year's
     liability and a share of last year's — which is the whole point, since
     last year's is a number you actually know.                           */

  function quarterlyEstimated(household, tables, opts) {
    var o = opts || {};
    var seTable = tables && tables.seTax;
    var taxTable = tables && tables.effectiveTaxRates;
    if (!seTable || !taxTable) {
      return Money.incomplete('Tax reference tables are not loaded.', ['seTax']);
    }
    var filingStatus = o.filingStatus || (household && household.filingStatus);
    if (!filingStatus) return Money.incomplete('Choose a filing status.', ['filingStatus']);
    if (!Money.isEntered(o.expectedNetProfitCents)) {
      return Money.incomplete('Add what you expect to make this year.', ['expectedNetProfit']);
    }

    var se = selfEmploymentTax(o.expectedNetProfitCents, filingStatus, seTable);
    if (!Money.isOk(se)) return se;
    var taxable = Math.max(0, o.expectedNetProfitCents - se.deductibleHalfCents);
    var rate = Reference.lookupEffectiveTaxRate(taxTable, taxable / 100, filingStatus);
    if (!Money.isOk(rate)) return rate;
    var incomeTaxRate = Math.max(0, rate.value - seTable.employeeFicaRate);
    var incomeTax = Math.round(taxable * incomeTaxRate);
    var thisYearLiability = se.value + incomeTax;

    var withheldElsewhere = Money.isEntered(o.taxAlreadyWithheldCents) ? o.taxAlreadyWithheldCents : 0;

    var harbor = seTable.safeHarbor;
    var currentYearTarget = Math.round(thisYearLiability * harbor.currentYearShare);

    var priorYearTarget = null, priorYearShare = null, highIncome = null;
    if (Money.isEntered(o.priorYearLiabilityCents)) {
      var agiThresholdDollars = filingStatus === 'married_separate'
        ? harbor.highIncomeAgiThresholdMarriedSeparate : harbor.highIncomeAgiThreshold;
      highIncome = Money.isEntered(o.priorYearAgiCents)
        && o.priorYearAgiCents > Math.round(agiThresholdDollars * 100);
      priorYearShare = highIncome ? harbor.priorYearShareHighIncome : harbor.priorYearShare;
      priorYearTarget = Math.round(o.priorYearLiabilityCents * priorYearShare);
    }

    /* The safe harbour is the LESSER of the two, when both are known. */
    var required = Money.isEntered(priorYearTarget)
      ? Math.min(currentYearTarget, priorYearTarget)
      : currentYearTarget;
    var afterWithholding = Math.max(0, required - withheldElsewhere);
    var perQuarter = Math.round(afterWithholding / 4);

    return Money.ok(perQuarter, {
      thisYearLiabilityCents: thisYearLiability,
      seTaxCents: se.value,
      incomeTaxCents: incomeTax,
      se: se,
      currentYearTargetCents: currentYearTarget,
      currentYearShare: harbor.currentYearShare,
      priorYearTargetCents: priorYearTarget,
      priorYearShare: priorYearShare,
      priorYearIsHighIncome: highIncome,
      requiredAnnualCents: required,
      basedOn: !Money.isEntered(priorYearTarget) ? 'current-year-only'
        : (priorYearTarget < currentYearTarget ? 'prior-year safe harbour' : 'current-year estimate'),
      withheldElsewhereCents: withheldElsewhere,
      payableAcrossQuartersCents: afterWithholding,
      perQuarterCents: perQuarter,
      dueDates: seTable.quarterlyDueDates,
      referenceVersion: seTable.version
    });
  }

  return {
    selfEmploymentTax: selfEmploymentTax,
    compareW2vs1099: compareW2vs1099,
    quarterlyEstimated: quarterlyEstimated
  };
});
