/* ==========================================================================
   engines/tax.js — a federal income tax in named steps, and what it means
   for the next dollar.
   --------------------------------------------------------------------------
   Until now the app had one tax number: the effective-rate LOOKUP in
   data/effective_tax_rates_2026.json, a blend of income tax and FICA by
   gross band. It is honest about being a blend and it stays: Tier0's
   take-home and savings rate read it, and it is the fallback here when the
   income lines a real computation needs are missing.

   This is the computation. Each step is its own function with its own
   Result, so a room can show the working and a test can pin each line:

     ordinaryTax        taxable income walked up the bracket ladder
     capitalGainsTax    long-term gains stacked ON TOP of ordinary income,
                        taxed at 0 / 15 / 20 by where the stack lands
     fica               the employee's 7.65%, Social Security capped at the
                        wage base, plus additional Medicare over the threshold
     selfEmploymentTax  engines/selfemployed.js — reused, never re-derived
     stateTax           none / flat / graduated, on federal taxable income as
                        a stated stand-in for state taxable income
     acaCliff           where MAGI sits against 400% of the poverty level

   and estimate() adds them up and says what it did not model. Every table
   it reads is marked unverified except the SE mechanics; the Result carries
   that so a room can print it beside the number. DECISIONS.md D-067.

   Money is integer cents. A missing input is incomplete, never zero.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = {
      Money: require('../shared/money.js'),
      Schema: require('../shared/schema.js'),
      SelfEmployed: require('./selfemployed.js')
    };
  } else {
    deps = {
      Money: root.SLAF && root.SLAF.Money,
      Schema: root.SLAF && root.SLAF.Schema,
      SelfEmployed: root.SLAF && root.SLAF.SelfEmployed
    };
  }
  var api = factory(deps.Money, deps.Schema, deps.SelfEmployed);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Tax = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, SelfEmployed) {
  'use strict';

  function dollars(cents) { return cents / 100; }
  function cents(d) { return Math.round(d * 100); }

  /* Walk an amount up a ladder of { upTo*, rate } rows, taxing the slice
     that falls in each. `floorDollars` lets gains stack on top of ordinary
     income: the ladder is entered at the floor rather than at zero. */
  function walk(ladder, amountDollars, topKey, floorDollars) {
    var floor = floorDollars || 0;
    var remaining = amountDollars, prevTop = 0, tax = 0, slices = [];
    for (var i = 0; i < ladder.length && remaining > 0; i++) {
      var top = ladder[i][topKey];
      var lo = Math.max(prevTop, floor);
      var hi = top === null ? Infinity : top;
      var width = Math.max(0, Math.min(hi, floor + amountDollars) - lo);
      if (width > 0) {
        var slice = width * ladder[i].rate;
        tax += slice; remaining -= width;
        slices.push({ rate: ladder[i].rate, dollars: width, taxDollars: slice });
      }
      prevTop = hi;
    }
    return { taxDollars: tax, slices: slices, marginalRate: slices.length ? slices[slices.length - 1].rate : (ladder[0] ? ladder[0].rate : 0) };
  }

  /* ---- 1. Ordinary income --------------------------------------------------- */

  /**
   * ordinaryTax(table, grossCents, filingStatus, opts)
   *   opts.deductionCents  itemised deductions, if larger than the standard
   *   opts.aboveTheLineCents  pre-tax 401(k), HSA, the SE tax half, etc.
   * Returns taxable income, the tax, the slices and the marginal rate.
   */
  function ordinaryTax(table, grossCents, filingStatus, opts) {
    var o = opts || {};
    if (!table) return Money.incomplete('Federal bracket table is not loaded.', ['federalBrackets']);
    if (!Money.isEntered(grossCents)) return Money.incomplete('Add your gross income to compute tax.', ['grossAnnualIncome']);
    if (!filingStatus || !table.brackets[filingStatus]) {
      return Money.incomplete('Choose a filing status to compute tax.', ['filingStatus']);
    }
    var standard = table.standardDeduction[filingStatus];
    var deduction = Math.max(standard, Money.isEntered(o.deductionCents) ? dollars(o.deductionCents) : 0);
    var above = Money.isEntered(o.aboveTheLineCents) ? dollars(o.aboveTheLineCents) : 0;
    var agi = Math.max(0, dollars(grossCents) - above);
    var taxable = Math.max(0, agi - deduction);
    var w = walk(table.brackets[filingStatus], taxable, 'upToTaxableIncome', 0);
    return Money.ok(cents(w.taxDollars), {
      agiCents: cents(agi),
      taxableIncomeCents: cents(taxable),
      deductionCents: cents(deduction),
      deductionKind: deduction > standard ? 'itemised' : 'standard',
      aboveTheLineCents: cents(above),
      marginalRate: w.marginalRate,
      slices: w.slices,
      referenceVersion: table.version,
      confidence: table.confidence
    });
  }

  /* ---- 2. Long-term capital gains, stacked ---------------------------------- */

  function capitalGainsTax(table, gainsCents, ordinaryTaxableCents, filingStatus) {
    if (!table || !table.capitalGains) return Money.incomplete('Capital-gains brackets are not loaded.', ['federalBrackets']);
    if (!Money.isEntered(gainsCents)) return Money.incomplete('Add your long-term gains to compute this.', ['capitalGains']);
    var ladder = table.capitalGains[filingStatus];
    if (!ladder) return Money.incomplete('Choose a filing status to compute tax.', ['filingStatus']);
    if (gainsCents <= 0) return Money.ok(0, { slices: [], marginalRate: 0, stackedOnCents: ordinaryTaxableCents || 0 });
    var floor = dollars(Money.isEntered(ordinaryTaxableCents) ? ordinaryTaxableCents : 0);
    var w = walk(ladder, dollars(gainsCents), 'upToTaxableIncome', floor);
    return Money.ok(cents(w.taxDollars), {
      slices: w.slices, marginalRate: w.marginalRate,
      stackedOnCents: cents(floor),
      referenceVersion: table.version, confidence: table.confidence
    });
  }

  /* ---- 3. FICA on wages ------------------------------------------------------ */

  function fica(seTable, wagesCents, filingStatus) {
    if (!seTable) return Money.incomplete('Payroll tax table is not loaded.', ['seTax']);
    if (!Money.isEntered(wagesCents)) return Money.incomplete('Add your wages to compute payroll tax.', ['grossAnnualIncome']);
    var wages = Math.max(0, dollars(wagesCents));
    var ssRate = seTable.socialSecurityRate / 2;      /* the employee half */
    var medRate = seTable.medicareRate / 2;
    var ss = Math.min(wages, seTable.socialSecurityWageBase) * ssRate;
    var med = wages * medRate;
    var addl = 0;
    var threshold = seTable.additionalMedicare && seTable.additionalMedicare.thresholds[filingStatus];
    if (Money.isEntered(threshold) && wages > threshold) addl = (wages - threshold) * seTable.additionalMedicare.rate;
    return Money.ok(cents(ss + med + addl), {
      socialSecurityCents: cents(ss), medicareCents: cents(med), additionalMedicareCents: cents(addl),
      cappedAtWageBase: wages > seTable.socialSecurityWageBase,
      employeeRate: seTable.employeeFicaRate,
      referenceVersion: seTable.version, confidence: seTable.confidence
    });
  }

  /* ---- 4. State --------------------------------------------------------------- */

  function stateTax(table, stateCode, taxableCents, filingStatus) {
    if (!table) return Money.incomplete('State tax table is not loaded.', ['stateBrackets']);
    if (!stateCode) return Money.incomplete('Choose a state to estimate state tax.', ['state']);
    var row = table.states[stateCode];
    if (!row) {
      return Money.unavailable ? Money.unavailable('No state schedule for ' + stateCode + '.')
        : Money.incomplete('No state schedule for ' + stateCode + '.', ['state']);
    }
    if (!Money.isEntered(taxableCents)) return Money.incomplete('Add your income to estimate state tax.', ['grossAnnualIncome']);
    var taxable = Math.max(0, dollars(taxableCents));
    var meta = { type: row.type, stateCode: stateCode, referenceVersion: table.version, confidence: table.confidence,
      approximation: 'applied to federal taxable income; local taxes, state deductions and credits ignored' };
    if (row.type === 'none') return Money.ok(0, Object.assign({ marginalRate: 0 }, meta));
    if (row.type === 'flat') return Money.ok(cents(taxable * row.rate), Object.assign({ marginalRate: row.rate }, meta));
    var mult = filingStatus === 'married_joint' ? (table.jointMultiplier || 1) : 1;
    var ladder = row.single.map(function (b) { return { upTo: b.upTo === null ? null : b.upTo * mult, rate: b.rate }; });
    var w = walk(ladder, taxable, 'upTo', 0);
    return Money.ok(cents(w.taxDollars), Object.assign({ marginalRate: w.marginalRate, slices: w.slices }, meta));
  }

  /* ---- 5. The ACA cliff ------------------------------------------------------ */

  /**
   * acaCliff(table, magiCents, householdSize) — where MAGI sits against the
   * subsidy ceiling. Flags and distance only; it never prices a plan.
   */
  function acaCliff(table, magiCents, householdSize) {
    if (!table) return Money.incomplete('ACA table is not loaded.', ['aca']);
    if (!Money.isEntered(magiCents)) return Money.incomplete('Add your income to check the subsidy ceiling.', ['grossAnnualIncome']);
    var size = Math.max(1, householdSize || 1);
    var fpl = table.fpl.base + table.fpl.perAdditionalPerson * (size - 1);
    var multiple = dollars(magiCents) / fpl;
    var cliffDollars = fpl * table.cliffMultiple;
    var pct = null;
    for (var i = 0; i < table.applicablePercentage.length; i++) {
      if (multiple <= table.applicablePercentage[i].upToFplMultiple) { pct = table.applicablePercentage[i].percent; break; }
    }
    return Money.ok(multiple, {
      fplDollars: fpl, householdSize: size,
      cliffCents: cents(cliffDollars),
      roomBeforeCliffCents: cents(Math.max(0, cliffDollars - dollars(magiCents))),
      overCliff: multiple > table.cliffMultiple,
      applicablePercentage: pct,
      expectedContributionCents: pct === null ? null : cents(dollars(magiCents) * pct),
      referenceVersion: table.version, confidence: table.confidence
    });
  }

  /* ---- 6. The whole thing, in one go ----------------------------------------- */

  /**
   * estimate(household, tables, opts)
   *   opts.wagesCents          W-2 wages (default: the household's gross)
   *   opts.selfEmploymentCents net profit from self-employment
   *   opts.otherOrdinaryCents  ordinary income with no payroll tax on it
   *                            (unemployment benefit, D-129)
   *   opts.capitalGainsCents   long-term gains / qualified dividends
   *   opts.deferralCents       pre-tax 401(k) / HSA / traditional IRA
   *   opts.deductionCents      itemised, if larger than the standard
   * Returns the total with every component; `notModelled` lists what is
   * deliberately left out so the number is never mistaken for a return.
   */
  function estimate(household, tables, opts) {
    var o = opts || {};
    var t = tables || {};
    var gross = Schema.grossAnnualIncomeCents(household);
    var wages = Money.isEntered(o.wagesCents) ? o.wagesCents : (Money.isOk(gross) ? gross.value : null);
    var se = Money.isEntered(o.selfEmploymentCents) ? o.selfEmploymentCents : 0;
    var gains = Money.isEntered(o.capitalGainsCents) ? o.capitalGainsCents : 0;
    var other = Money.isEntered(o.otherOrdinaryCents) ? o.otherOrdinaryCents : 0;
    var fs = household && household.filingStatus;
    if (!Money.isEntered(wages) && se === 0 && other === 0) {
      return Money.incomplete('Add your income to estimate tax.', ['grossAnnualIncome']);
    }
    if (!fs) return Money.incomplete('Choose a filing status to estimate tax.', ['filingStatus']);

    var seTax = se > 0 ? SelfEmployed.selfEmploymentTax(se, fs, t.seTax, { priorWagesCents: wages || 0 })
      : Money.ok(0, { deductibleHalfCents: 0 });
    if (!Money.isOk(seTax)) return seTax;

    var above = (Money.isEntered(o.deferralCents) ? o.deferralCents : 0) + (seTax.deductibleHalfCents || 0);
    var ordinaryGross = (wages || 0) + se + other;
    var ord = ordinaryTax(t.federalBrackets, ordinaryGross, fs, { deductionCents: o.deductionCents, aboveTheLineCents: above });
    if (!Money.isOk(ord)) return ord;

    var cg = gains > 0 ? capitalGainsTax(t.federalBrackets, gains, ord.taxableIncomeCents, fs) : Money.ok(0, { marginalRate: 0 });
    if (!Money.isOk(cg)) return cg;

    var payroll = Money.isEntered(wages) && wages > 0 ? fica(t.seTax, wages, fs) : Money.ok(0, {});
    if (!Money.isOk(payroll)) return payroll;

    var st = household && household.state && t.stateBrackets
      ? stateTax(t.stateBrackets, household.state, ord.taxableIncomeCents + gains, fs) : null;
    var stateCents = st && Money.isOk(st) ? st.value : 0;

    var magi = ord.agiCents + gains;
    var aca = t.aca ? acaCliff(t.aca, magi, Schema.adults(household).length) : null;

    var federal = ord.value + cg.value;
    var total = federal + payroll.value + seTax.value + stateCents;
    var totalGross = ordinaryGross + gains;
    return Money.ok(total, {
      federalOrdinaryCents: ord.value,
      federalCapitalGainsCents: cg.value,
      federalIncomeTaxCents: federal,
      ficaCents: payroll.value,
      selfEmploymentTaxCents: seTax.value,
      otherOrdinaryCents: other,
      stateCents: stateCents,
      stateIncluded: !!(st && Money.isOk(st)),
      taxableIncomeCents: ord.taxableIncomeCents,
      agiCents: ord.agiCents,
      magiCents: magi,
      marginalRate: ord.marginalRate,
      capitalGainsRate: cg.marginalRate,
      effectiveRate: totalGross > 0 ? total / totalGross : null,
      takeHomeAnnualCents: totalGross - total,
      components: { ordinary: ord, capitalGains: cg, fica: payroll, selfEmployment: seTax, state: st, aca: aca },
      notModelled: ['credits (child, EITC, education)', 'itemised deductions beyond the one figure passed in',
        'state deductions, exemptions and local taxes', 'AMT', 'NIIT', 'the qualified business income deduction'],
      confidence: (t.federalBrackets && t.federalBrackets.confidence) || 'unverified'
    });
  }

  return {
    ordinaryTax: ordinaryTax,
    capitalGainsTax: capitalGainsTax,
    fica: fica,
    stateTax: stateTax,
    acaCliff: acaCliff,
    estimate: estimate,
    _walk: walk
  };
});
