/* ==========================================================================
   engines/housing.js — the Housing Decision room's comparison.
   DECISIONS.md D-099 (the second wave of tranche rooms on the template).
   --------------------------------------------------------------------------
   Rent against buying, this place, this rate, a month:

     own          the level mortgage payment on price × (1 − down) at the
                  rate over the conventions' term (engines/projection.js's
                  levelPaymentCents — the one amortisation formula in the
                  repo, P·r(1+r)^n ÷ ((1+r)^n − 1) with r monthly), plus
                  property tax, insurance and maintenance from the
                  conventions, each a yearly share of price ÷ 12
     unrecoverable the part of owning that buys nothing: year one's
                  interest ÷ 12, plus tax, insurance and maintenance.
                  The principal part is the payment less that interest.
     rent         what renting costs a month; $0 when Start Here's
                  "no rent" answer is true and no rent is entered
     priceToRent  price ÷ (rent × 12), read against data/price_to_rent.json's
                  bands (under the low edge buying is favoured, over the
                  high edge renting is; between, neutral)
     housingRatio own ÷ gross a month, read against the 28% front-end band
                  in data/ratio_benchmarks.json through Ratios.verdict —
                  the same band the Ratios room reads
     down         price × down share; closing = price × the closing share;
                  cash after closing = cash − down − closing, against the
                  conventions' emergency-fund floor (months of spending)
     yearsToDown  (down − cash) ÷ a year of savings, linear — the savings
                  are the lens's basis (Tier0.savingsRate, including the
                  match when it is known). Cash in hand ≥ down → 0 years;
                  nothing saved → never at this pace, said rather than
                  divided.

   The number is own − rent a month. Every figure that is not the person's
   is read from the tables; a missing table is a reason, not a fallback.
   The price is held still and the rent does not rise — the room says so.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('../shared/money.js'), Schema: require('../shared/schema.js'), Projection: require('./projection.js'), Tier0: require('./tier0.js'), Ratios: require('./ratios.js') };
  } else {
    var S = root.SLAF || {};
    deps = { Money: S.Money, Schema: S.Schema, Projection: S.Projection, Tier0: S.Tier0, Ratios: S.Ratios };
  }
  var api = factory(deps.Money, deps.Schema, deps.Projection, deps.Tier0, deps.Ratios);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Housing = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Projection, Tier0, Ratios) {
  'use strict';

  var MONTHS = 12;

  /* The conventions, with the table's own numbers or nothing. */
  function conventions(tables) {
    var t = tables && tables.housingConventions;
    if (!t) return null;
    var keys = ['propertyTaxRate', 'insuranceRate', 'maintenanceRate', 'closingCostRate', 'termMonths'];
    for (var i = 0; i < keys.length; i++) if (!Money.isEntered(t[keys[i]])) return null;
    return t;
  }

  /**
   * The level monthly payment on `principalCents` at `annualRate` over
   * `years`: P·r(1+r)^n ÷ ((1+r)^n − 1), r = annualRate ÷ 12, n = years × 12.
   * Delegates to Projection.levelPaymentCents so the repo has one
   * amortisation formula; this is the housing-shaped door to it (years,
   * not months). A rate of 0 is the principal split evenly.
   */
  function monthlyPayment(principalCents, annualRate, years) {
    if (!Money.isEntered(principalCents) || !Money.isEntered(annualRate) || !Money.isEntered(years)) {
      return Money.incomplete('Need a principal, a rate and a term in years.', Money.missingFrom({ principalCents: principalCents, annualRate: annualRate, years: years }));
    }
    return Projection.levelPaymentCents({ principalCents: principalCents, annualRate: annualRate, months: Math.round(years * MONTHS) });
  }

  /** Interest paid in the first `months` of a level-payment loan. */
  function interestInFirstMonths(principalCents, annualRate, paymentCents, months) {
    var r = annualRate / MONTHS, balance = principalCents, interest = 0;
    for (var m = 0; m < months && balance > 0; m++) {
      var i = balance * r;
      interest += i;
      balance -= Math.min(balance, paymentCents - i);
    }
    return interest;
  }

  /** Which side of the price-to-rent bands a ratio falls: buying | neutral | renting | none. */
  function priceToRentBand(ratio, table) {
    var b = table && table.bands;
    if (!Money.isEntered(ratio) || !b || !Money.isEntered(b.buyingFavouredBelow) || !Money.isEntered(b.rentingFavouredAbove)) return 'none';
    if (ratio < b.buyingFavouredBelow) return 'buying';
    if (ratio > b.rentingFavouredAbove) return 'renting';
    return 'neutral';
  }

  /**
   * compare(h, T) → Result. value = own − rent, cents a month.
   */
  function compare(household, tables) {
    var h = household || {};
    var plan = h.housing || {};
    var c = conventions(tables);
    if (!c) return Money.incomplete('The housing conventions table (data/housing_conventions.json) is not loaded.', ['housingConventions']);

    var noRent = !!(h.meta && h.meta.noRent === true);
    var price = plan.priceCents, down = plan.downPct, rate = plan.rate, rent = plan.rentMonthlyCents;
    var missing = [];
    if (!Money.isEntered(price)) missing.push('priceCents');
    if (!Money.isEntered(down)) missing.push('downPct');
    if (!Money.isEntered(rate)) missing.push('rate');
    if (!Money.isEntered(rent) && !noRent) missing.push('rentMonthlyCents');
    if (missing.length) {
      var words = { priceCents: 'the place’s price', downPct: 'the down payment share', rate: 'the mortgage rate', rentMonthlyCents: 'what renting costs a month' };
      return Money.incomplete('Enter ' + missing.map(function (k) { return words[k]; }).join(', ') + ' to compare.', missing);
    }
    if (price <= 0) return Money.incomplete('A price of zero is not a place to weigh.', ['priceCents']);
    if (down < 0 || down > 1) return Money.incomplete('The down payment is a share of the price, between 0% and 100%.', ['downPct']);
    if (rate < 0) return Money.incomplete('A mortgage rate below zero is not a rate.', ['rate']);

    var rentUsed = Money.isEntered(rent) ? rent : 0;
    var rentIsNone = !Money.isEntered(rent) && noRent;

    /* The loan. */
    var downCents = Math.round(price * down);
    var principal = price - downCents;
    var years = c.termMonths / MONTHS;
    var pay = monthlyPayment(principal, rate, years);
    if (!Money.isOk(pay)) return pay;
    var paymentCents = pay.value;
    var interestMonthly = principal > 0 ? Math.round(interestInFirstMonths(principal, rate, paymentCents, MONTHS) / MONTHS) : 0;
    var principalMonthly = paymentCents - interestMonthly;

    /* The carrying costs, each a yearly share of price ÷ 12. */
    var taxCents = Math.round(price * c.propertyTaxRate / MONTHS);
    var insuranceCents = Math.round(price * c.insuranceRate / MONTHS);
    var maintenanceCents = Math.round(price * c.maintenanceRate / MONTHS);
    var ownCents = paymentCents + taxCents + insuranceCents + maintenanceCents;
    var unrecoverableCents = interestMonthly + taxCents + insuranceCents + maintenanceCents;

    /* Price-to-rent. */
    var priceToRent = rentUsed > 0 ? price / (rentUsed * MONTHS) : null;
    var ptrBand = priceToRentBand(priceToRent, tables && tables.priceToRent);

    /* The housing ratio, against the front-end band. */
    var gross = Schema.grossAnnualIncomeCents(h);
    var grossMonthly = Money.isOk(gross) && gross.value > 0 ? gross.value / MONTHS : null;
    var housingRatio = grossMonthly !== null ? ownCents / grossMonthly : null;
    var verdict = Ratios && Ratios.verdict ? Ratios.verdict('housingRatio', housingRatio, tables && tables.ratioBenchmarks) : { zone: 'none', band: null };
    var ratioReason = grossMonthly === null ? (Money.isOk(gross) ? 'A gross income of zero gives no housing ratio.' : 'Add your income to read the housing ratio.') : null;

    /* Cash: the down payment, closing, what is left, the floor. */
    var closingCents = Math.round(price * c.closingCostRate);
    var cash = Schema.cashCents(h);
    var cashCents = Money.isOk(cash) ? cash.value : null;
    var cashAfterCents = cashCents === null ? null : cashCents - downCents - closingCents;
    var spend = Schema.monthlyExpensesCents(h);
    var floorMonths = c.guardrails && Money.isEntered(c.guardrails.emergencyFundMonths) ? c.guardrails.emergencyFundMonths : null;
    var floorCents = Money.isOk(spend) && floorMonths !== null ? spend.value * floorMonths : null;
    var belowFloor = cashAfterCents !== null && floorCents !== null ? cashAfterCents < floorCents : null;

    /* Years to the down payment at this pace. */
    var shortfallCents = cashCents === null ? null : Math.max(0, downCents - cashCents);
    var rates = Tier0.savingsRate(h, tables);
    var basis = Money.isOk(rates.includingMatch) ? rates.includingMatch : rates.excludingMatch;
    var annualSavingsCents = Money.isOk(basis) ? basis.annualSavingsCents : null;
    var yearsToDown = null, yearsReason = null, never = false;
    if (cashCents === null) yearsReason = 'Add your cash to see how far the down payment is.';
    else if (shortfallCents === 0) yearsToDown = 0;
    else if (annualSavingsCents === null) yearsReason = basis.reason || 'Add your income and spending to see how fast the down payment comes.';
    else if (annualSavingsCents <= 0) { never = true; yearsReason = 'Nothing is being saved, so the down payment never arrives at this pace.'; }
    else yearsToDown = shortfallCents / annualSavingsCents;

    return Money.ok(ownCents - rentUsed, {
      ownCents: ownCents,
      rentCents: rentUsed,
      rentIsNone: rentIsNone,
      noRent: noRent,
      unrecoverableCents: unrecoverableCents,
      paymentCents: paymentCents,
      principalMonthlyCents: principalMonthly,
      interestMonthlyCents: interestMonthly,
      taxCents: taxCents,
      insuranceCents: insuranceCents,
      maintenanceCents: maintenanceCents,
      principalCents: principal,
      downCents: downCents,
      closingCents: closingCents,
      termYears: years,
      priceToRent: priceToRent,
      priceToRentBand: ptrBand,
      housingRatio: housingRatio,
      housingZone: verdict.zone,
      housingBand: verdict.band || null,
      ratioReason: ratioReason,
      cashCents: cashCents,
      cashAfterCents: cashAfterCents,
      floorCents: floorCents,
      floorMonths: floorMonths,
      belowFloor: belowFloor,
      shortfallCents: shortfallCents,
      annualSavingsCents: annualSavingsCents,
      yearsToDown: yearsToDown,
      neverAtThisPace: never,
      yearsReason: yearsReason,
      zone: verdict.zone === 'none' ? null : verdict.zone
    });
  }

  return {
    monthlyPayment: monthlyPayment,
    interestInFirstMonths: interestInFirstMonths,
    priceToRentBand: priceToRentBand,
    compare: compare
  };
});
