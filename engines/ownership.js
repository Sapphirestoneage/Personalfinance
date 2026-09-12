/* ==========================================================================
   engines/ownership.js — what a place actually costs to own. Tier 17.
   --------------------------------------------------------------------------
   One arithmetic for every question about owning property, so Rent/Buy, a
   rental analysis and a house hack are three readings of the same figures
   rather than three calculators that drift apart.

     cost(opts)     a month of owning: the payment, the carry, and the part
                    that is not a cost at all because it buys you equity
     hold(opts)     holding it for N years: what you paid, what you keep at
                    the sale, and how that compares with renting instead
     rental(opts)   let out: cash flow, cap rate, cash-on-cash, DSCR
     hack(opts)     live in one unit, let the rest: what you pay to live there

   Every figure is integer cents. Every rate comes from
   data/housing_conventions.json unless the caller overrides it, and every
   figure the caller did not supply is named in `assumed` rather than
   quietly taken as zero. Nothing here reads the household: the rooms hand
   in what they hold, so the same numbers can be asked hypothetically.

   The mortgage itself is Projection.levelPaymentCents — one formula, one
   function. DECISIONS.md D-223.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('../shared/money.js'), Projection: require('./projection.js') };
  } else {
    deps = { Money: root.SLAF && root.SLAF.Money, Projection: root.SLAF && root.SLAF.Projection };
  }
  var api = factory(deps.Money, deps.Projection);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Ownership = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Projection) {
  'use strict';

  function cents(v) { return Math.round(v); }
  function entered(v) { return Money.isEntered(v); }
  function conventions(tables) {
    var c = tables && (tables.housingConventions || tables.housing_conventions);
    return c && entered(c.propertyTaxRate) ? c : null;
  }
  /* A rate the caller gave, else the convention, and say which was used. */
  function rateOf(o, c, key, assumed, label) {
    if (entered(o[key])) return o[key];
    assumed.push(label + ' at the convention’s ' + (Math.round(c[key] * 10000) / 100) + '%');
    return c[key];
  }

  /**
   * cost(opts) — one month of owning.
   *   priceCents, downPct (0..1), annualRate, termMonths
   *   optional: hoaMonthlyCents, propertyTaxRate, insuranceRate,
   *             maintenanceRate, pmiRate, tables
   * value: totalMonthlyCents — everything that leaves the account.
   *   carryMonthlyCents   the part that buys nothing: interest, tax,
   *                       insurance, maintenance, mortgage insurance, HOA
   *   equityMonthlyCents  the part that is yours: the first month's principal
   */
  function cost(opts) {
    var o = opts || {};
    var c = conventions(o.tables);
    if (!c) return Money.incomplete('The housing conventions table (data/housing_conventions.json) is not loaded.', ['housingConventions']);

    var missing = [];
    if (!entered(o.priceCents)) missing.push('priceCents');
    if (!entered(o.downPct)) missing.push('downPct');
    if (!entered(o.annualRate)) missing.push('annualRate');
    if (missing.length) {
      var words = { priceCents: 'the price', downPct: 'the down payment share', annualRate: 'the mortgage rate' };
      return Money.incomplete('Enter ' + missing.map(function (k) { return words[k]; }).join(', ') + ' to price the month.', missing);
    }
    if (o.priceCents <= 0) return Money.incomplete('A price of zero is not a place to price.', ['priceCents']);
    if (o.downPct < 0 || o.downPct > 1) return Money.incomplete('The down payment is a share of the price, between 0% and 100%.', ['downPct']);
    if (o.annualRate < 0) return Money.incomplete('A mortgage rate below zero is not a rate.', ['annualRate']);

    var assumed = [];
    var term = entered(o.termMonths) ? o.termMonths : c.termMonths;
    if (!entered(o.termMonths)) assumed.push('a ' + Math.round(c.termMonths / 12) + '-year term');
    if (term <= 0) return Money.incomplete('A mortgage term needs to be at least a month.', ['termMonths']);

    var taxRate = rateOf(o, c, 'propertyTaxRate', assumed, 'property tax');
    var insRate = rateOf(o, c, 'insuranceRate', assumed, 'insurance');
    var maintRate = rateOf(o, c, 'maintenanceRate', assumed, 'maintenance');
    var pmiRate = entered(o.pmiRate) ? o.pmiRate : c.pmiRate;

    var downCents = cents(o.priceCents * o.downPct);
    var loanCents = o.priceCents - downCents;
    var pay = Projection.levelPaymentCents({ principalCents: loanCents, annualRate: o.annualRate, months: term });
    if (!Money.isOk(pay)) return pay;

    var taxMonthly = cents(o.priceCents * taxRate / 12);
    var insMonthly = cents(o.priceCents * insRate / 12);
    var maintMonthly = cents(o.priceCents * maintRate / 12);
    var hoaMonthly;
    if (entered(o.hoaMonthlyCents)) hoaMonthly = o.hoaMonthlyCents;
    else { hoaMonthly = 0; assumed.push('no HOA or condo fee'); }

    /* Mortgage insurance runs while the loan is above the convention's
       loan-to-value line; it is a cost of a small down payment, not of
       the house, so it is named apart. */
    var ltv = o.priceCents > 0 ? loanCents / o.priceCents : 0;
    var pmiMonthly = ltv > c.pmiEndsAtLoanToValue ? cents(loanCents * pmiRate / 12) : 0;

    var interestFirst = cents(loanCents * o.annualRate / 12);
    var principalFirst = Math.max(0, pay.value - interestFirst);

    var carry = interestFirst + taxMonthly + insMonthly + maintMonthly + pmiMonthly + hoaMonthly;
    var total = pay.value + taxMonthly + insMonthly + maintMonthly + pmiMonthly + hoaMonthly;

    return Money.ok(total, {
      priceCents: o.priceCents, downCents: downCents, loanCents: loanCents, termMonths: term,
      annualRate: o.annualRate, loanToValue: ltv,
      paymentCents: pay.value, interestFirstMonthCents: interestFirst, principalFirstMonthCents: principalFirst,
      propertyTaxMonthlyCents: taxMonthly, insuranceMonthlyCents: insMonthly,
      maintenanceMonthlyCents: maintMonthly, hoaMonthlyCents: hoaMonthly, pmiMonthlyCents: pmiMonthly,
      /* What a lender totals up, and what the money actually does. */
      pitiCents: pay.value + taxMonthly + insMonthly + pmiMonthly + hoaMonthly,
      carryMonthlyCents: carry, equityMonthlyCents: principalFirst,
      totalMonthlyCents: total,
      closingCostCents: cents(o.priceCents * c.closingCostRate),
      cashToCloseCents: downCents + cents(o.priceCents * c.closingCostRate),
      rates: { propertyTax: taxRate, insurance: insRate, maintenance: maintRate, pmi: pmiRate },
      assumed: assumed
    });
  }

  /** The loan balance after n months, and the interest paid getting there. */
  function amortize(loanCents, annualRate, termMonths, paymentCents, months) {
    var bal = loanCents, interest = 0, r = annualRate / 12, n = Math.min(months, termMonths);
    for (var i = 0; i < n && bal > 0; i++) {
      var int = cents(bal * r);
      var prin = Math.min(bal, paymentCents - int);
      if (prin <= 0) { interest += int; continue; }   /* a rate that outruns the payment */
      interest += int;
      bal -= prin;
    }
    return { balanceCents: Math.max(0, bal), interestPaidCents: interest };
  }

  /**
   * hold(opts) — owning it for `years`, against renting instead.
   *   everything cost() takes, plus years, and optionally
   *   rentMonthlyCents (what you would pay to rent instead) and
   *   appreciationRate (left out means the place is worth what you paid).
   * value: costOfOwningCents — what the years actually cost, after the sale.
   */
  function hold(opts) {
    var o = opts || {};
    var base = cost(o);
    if (!Money.isOk(base)) return base;
    if (!entered(o.years)) return Money.incomplete('Say how many years you would hold it.', ['years']);
    if (o.years <= 0) return Money.incomplete('A holding period is at least a year.', ['years']);
    var c = conventions(o.tables);

    var assumed = base.assumed.slice();
    var appr = entered(o.appreciationRate) ? o.appreciationRate : 0;
    if (!entered(o.appreciationRate)) assumed.push('the place is worth what you paid for it (no growth assumed)');

    var months = Math.round(o.years * 12);
    var am = amortize(base.loanCents, o.annualRate, base.termMonths, base.paymentCents, months);
    var valueCents = cents(base.priceCents * Math.pow(1 + appr, o.years));
    var sellingCents = cents(valueCents * c.sellingCostRate);
    var equityCents = valueCents - am.balanceCents;
    var netProceedsCents = valueCents - sellingCents - am.balanceCents;

    /* Everything that left the account: the cash to close, then every
       month of the payment and the carry around it. */
    var monthlyOutlay = base.totalMonthlyCents;
    var paidCents = base.cashToCloseCents + monthlyOutlay * months;
    var costOfOwningCents = paidCents - netProceedsCents;

    var out = {
      years: o.years, monthsHeld: months, valueAtSaleCents: valueCents, appreciationRate: appr,
      balanceCents: am.balanceCents, interestPaidCents: am.interestPaidCents,
      equityCents: equityCents, sellingCostCents: sellingCents, netProceedsCents: netProceedsCents,
      cashToCloseCents: base.cashToCloseCents, paidCents: paidCents,
      monthlyCents: monthlyOutlay, costOfOwningCents: costOfOwningCents,
      costOfOwningMonthlyCents: cents(costOfOwningCents / months),
      assumed: assumed
    };
    if (entered(o.rentMonthlyCents)) {
      out.rentMonthlyCents = o.rentMonthlyCents;
      out.costOfRentingCents = o.rentMonthlyCents * months;
      out.differenceCents = costOfOwningCents - out.costOfRentingCents;
      out.cheaper = out.differenceCents === 0 ? 'the same' : (out.differenceCents < 0 ? 'owning' : 'renting');
    } else {
      assumed.push('no rent to compare against');
    }
    return Money.ok(costOfOwningCents, out);
  }

  /**
   * rental(opts) — let out, at a monthly rent.
   *   everything cost() takes, plus grossRentMonthlyCents.
   * value: cashFlowMonthlyCents — what lands, or leaves, each month.
   * Operating costs exclude the mortgage, the way net operating income is
   * always defined; the loan is debt service and is taken off after.
   */
  function rental(opts) {
    var o = opts || {};
    var base = cost(o);
    if (!Money.isOk(base)) return base;
    if (!entered(o.grossRentMonthlyCents)) return Money.incomplete('Enter the rent it would bring to price it as a rental.', ['grossRentMonthlyCents']);
    if (o.grossRentMonthlyCents < 0) return Money.incomplete('Rent below zero is not a rent.', ['grossRentMonthlyCents']);
    var c = conventions(o.tables);

    var assumed = base.assumed.slice();
    var vacRate = entered(o.vacancyRate) ? o.vacancyRate : c.vacancyRate;
    if (!entered(o.vacancyRate)) assumed.push('an empty stretch of ' + Math.round(vacRate * 100) + '% of the year');

    var vacancyCents = cents(o.grossRentMonthlyCents * vacRate);
    var effectiveRentCents = o.grossRentMonthlyCents - vacancyCents;
    var operatingCents = base.propertyTaxMonthlyCents + base.insuranceMonthlyCents + base.maintenanceMonthlyCents + base.hoaMonthlyCents;
    var noiMonthlyCents = effectiveRentCents - operatingCents;
    var debtServiceCents = base.paymentCents + base.pmiMonthlyCents;
    var cashFlowCents = noiMonthlyCents - debtServiceCents;
    var investedCents = base.cashToCloseCents;

    var noiAnnual = noiMonthlyCents * 12;
    var flags = [];
    var dscr = debtServiceCents > 0 ? noiAnnual / (debtServiceCents * 12) : null;
    if (dscr !== null && dscr < c.guardrails.dscr) flags.push('The rent barely covers the loan: lenders look for ' + c.guardrails.dscr + ' times the payment, and this is ' + (Math.round(dscr * 100) / 100) + '.');
    if (cashFlowCents < 0) flags.push('It costs you ' + Math.abs(cashFlowCents) + ' cents a month to hold, before any repair you did not plan for.');

    return Money.ok(cashFlowCents, {
      grossRentMonthlyCents: o.grossRentMonthlyCents, vacancyCents: vacancyCents,
      effectiveRentMonthlyCents: effectiveRentCents, operatingMonthlyCents: operatingCents,
      noiMonthlyCents: noiMonthlyCents, noiAnnualCents: noiAnnual,
      debtServiceMonthlyCents: debtServiceCents, cashFlowMonthlyCents: cashFlowCents,
      cashFlowAnnualCents: cashFlowCents * 12, investedCents: investedCents,
      capRate: base.priceCents > 0 ? noiAnnual / base.priceCents : null,
      cashOnCash: investedCents > 0 ? (cashFlowCents * 12) / investedCents : null,
      dscr: dscr, vacancyRate: vacRate, flags: flags, assumed: assumed,
      monthlyCostCents: base.totalMonthlyCents
    });
  }

  /**
   * hack(opts) — you live in one unit and let the others.
   *   everything cost() takes, plus unitRentsCents: [cents, …] for the
   *   units you would let. Optionally rentMonthlyCents: what you would
   *   otherwise pay to rent a place of your own.
   * value: youPayMonthlyCents — what living there costs you, after the rent
   *   the other units bring in. It can be negative: they pay you.
   */
  function hack(opts) {
    var o = opts || {};
    var base = cost(o);
    if (!Money.isOk(base)) return base;
    var rents = o.unitRentsCents;
    if (!Array.isArray(rents) || !rents.length) return Money.incomplete('Enter the rent for each unit you would let.', ['unitRentsCents']);
    for (var i = 0; i < rents.length; i++) {
      if (!entered(rents[i])) return Money.incomplete('Unit ' + (i + 1) + ' has no rent yet.', ['unitRentsCents']);
      if (rents[i] < 0) return Money.incomplete('Rent below zero is not a rent.', ['unitRentsCents']);
    }
    var c = conventions(o.tables);
    var assumed = base.assumed.slice();
    var vacRate = entered(o.vacancyRate) ? o.vacancyRate : c.vacancyRate;
    if (!entered(o.vacancyRate)) assumed.push('an empty stretch of ' + Math.round(vacRate * 100) + '% of the year');

    var grossCents = rents.reduce(function (s, r) { return s + r; }, 0);
    var vacancyCents = cents(grossCents * vacRate);
    var collectedCents = grossCents - vacancyCents;
    var youPayCents = base.totalMonthlyCents - collectedCents;

    var out = {
      unitsLet: rents.length, grossRentMonthlyCents: grossCents, vacancyCents: vacancyCents,
      collectedMonthlyCents: collectedCents, monthlyCostCents: base.totalMonthlyCents,
      youPayMonthlyCents: youPayCents, theyPayYou: youPayCents < 0,
      vacancyRate: vacRate, assumed: assumed
    };
    if (entered(o.rentMonthlyCents)) {
      out.rentMonthlyCents = o.rentMonthlyCents;
      out.versusRentingCents = youPayCents - o.rentMonthlyCents;
    }
    return Money.ok(youPayCents, out);
  }

  return { cost: cost, hold: hold, rental: rental, hack: hack, amortize: amortize };
});
