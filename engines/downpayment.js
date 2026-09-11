/* ==========================================================================
   engines/downpayment.js — the Down Payment Countdown.
   DECISIONS.md D-217 (K6).
   --------------------------------------------------------------------------
   For a home price, what each down payment share (3.5% FHA, 5%, 10%, 20%)
   actually needs in cash: the down payment, closing costs, and the lender's
   reserves, less any family help the person typed (never assumed); the
   monthly payment at each (principal and interest, property tax,
   insurance, and mortgage insurance under 20%); and the date the cash is
   there at the current pace, from engines/countdown.js goalCountdown(), the
   one countdown in the suite. Cash for a house earns nothing real, so the
   countdown runs at 0% and the range collapses; when a date is out of reach
   the monthly saving that would reach it in five years is shown instead.

   Rates come from data/down_payment.json (shares, mortgage insurance,
   reserves), data/housing_conventions.json (closing costs, property tax,
   insurance) and data/mortgage_rates.json (the rate), never inline. The
   payment is engines/housing.js monthlyPayment, never a second formula.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('../shared/money.js'), Housing: require('./housing.js'), Countdown: require('./countdown.js') };
  } else {
    var S = root.SLAF || {};
    deps = { Money: S.Money, Housing: S.Housing, Countdown: S.Countdown };
  }
  var api = factory(deps.Money, deps.Housing, deps.Countdown);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.DownPayment = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Housing, Countdown) {
  'use strict';

  var MONTHS = 12;
  var HONEST_YEARS = 5;

  /**
   * plan(tables, opts) → Result
   *   opts.priceCents         REQUIRED
   *   opts.savedCents         set aside for it (absent: 0)
   *   opts.monthlyCents       saved toward it a month (absent: 0)
   *   opts.familyHelpCents    typed by the person (absent: 0)
   *   opts.rate               the mortgage rate (absent: the table's 30-year)
   *   opts.from               'YYYY-MM' (tests)
   *   value    the 20%-down date, or null
   *   options  [{ pct, label, insurance, downCents, loanCents, closingCents, reservesCents,
   *               neededCents, principalInterestCents, taxCents, insuranceCents, miCents,
   *               paymentCents, months, date, range, reachedNow, neverAtThisPace, monthlyNeededCents }]
   */
  function plan(tables, opts) {
    var T = tables || {}, o = opts || {};
    var D = T.downPayment, H = T.housingConventions, M = T.mortgageRates;
    if (!D || !H) return Money.incomplete('The down payment tables are not loaded.', ['downPayment', 'housingConventions']);
    if (!Money.isEntered(o.priceCents)) return Money.incomplete('Type a home price to count down to it.', ['price']);
    if (o.priceCents <= 0) return Money.incomplete('A price at or below zero is not a home.', ['price']);
    var rate = Money.isEntered(o.rate) ? o.rate : (M ? M.thirtyYearFixed : null);
    if (!Money.isEntered(rate)) return Money.incomplete('The mortgage rate table is not loaded.', ['mortgageRates']);
    var saved = Money.isEntered(o.savedCents) ? o.savedCents : 0;
    var monthly = Money.isEntered(o.monthlyCents) ? o.monthlyCents : 0;
    var family = Money.isEntered(o.familyHelpCents) ? o.familyHelpCents : 0;
    var price = o.priceCents;
    var closing = Math.round(price * H.closingCostRate);
    var tax = Math.round(price * H.propertyTaxRate / MONTHS);
    var ins = Math.round(price * H.insuranceRate / MONTHS);
    var options = (D.options || []).map(function (opt) {
      var down = Math.round(price * opt.pct);
      var loan = price - down;
      var pi = Housing.monthlyPayment(loan, rate, D.termYears || 30);
      if (!Money.isOk(pi)) return null;
      var miRate = opt.insurance === 'fha' ? D.fhaAnnualMipRate : opt.insurance === 'pmi' ? D.pmiAnnualRate : 0;
      var mi = Math.round(loan * miRate / MONTHS);
      var payment = pi.value + tax + ins + mi;
      var reserves = payment * (D.reservesMonths || 0);
      var needed = Math.max(0, down + closing + reserves - family);
      var cd = Countdown.goalCountdown({ targetCents: needed, savedCents: saved, monthlyContributionCents: monthly, annualRate: 0, from: o.from });
      return {
        pct: opt.pct, label: opt.label, insurance: opt.insurance,
        downCents: down, loanCents: loan, closingCents: closing, reservesCents: reserves, familyHelpCents: family, neededCents: needed,
        principalInterestCents: pi.value, taxCents: tax, insuranceCents: ins, miCents: mi, paymentCents: payment,
        months: cd.months, date: cd.date, range: cd.range, reachedNow: cd.reachedNow, neverAtThisPace: cd.neverAtThisPace,
        monthlyNeededCents: cd.neverAtThisPace ? Countdown.monthlyNeededCents(needed, saved, 0, HONEST_YEARS * MONTHS) : null
      };
    }).filter(Boolean);
    var twenty = options.filter(function (x) { return x.pct === 0.2; })[0] || options[options.length - 1];
    return Money.ok(twenty ? twenty.date : null, {
      priceCents: price, rate: rate, savedCents: saved, monthlyCents: monthly, familyHelpCents: family, closingCents: closing,
      options: options, honestYears: HONEST_YEARS,
      referenceVersion: { downPayment: D.version, housingConventions: H.version, mortgageRates: M ? M.version : null }
    });
  }

  return { HONEST_YEARS: HONEST_YEARS, plan: plan };
});
