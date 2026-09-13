/* ==========================================================================
   engines/ownership.js — what a place actually costs to own. Tier 17.
   --------------------------------------------------------------------------
   PUBLISHED AS SLAF.Owning, not SLAF.Ownership (D-250). shared/ownership.js
   is a different module with a different job — which room owns which field —
   and it had this name first. The two never shared a page until Housing took
   The Deal, and then the second one loaded clobbered the first: the rent-or-
   buy reading called Ownership.describe and got a property engine.
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
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Owning = api; }
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

  /**
   * metrics(o) — the four ratios, defined once so every room agrees.
   *   noiAnnualCents, debtServiceAnnualCents, valueCents, cashInvestedCents,
   *   equityCents (optional)
   * Cash-on-cash is the cash flow over the cash you actually put in. It is
   * NOT the return on today's equity: equity grows as the loan is paid and
   * the place is revalued, and dividing by it answers a different question.
   * Both are returned, named apart.
   */
  function metrics(o) {
    var noi = o.noiAnnualCents, ds = o.debtServiceAnnualCents || 0;
    var cashFlow = noi - ds;
    return {
      capRate: entered(o.valueCents) && o.valueCents > 0 ? noi / o.valueCents : null,
      dscr: ds > 0 ? noi / ds : null,
      cashOnCash: entered(o.cashInvestedCents) && o.cashInvestedCents > 0 ? cashFlow / o.cashInvestedCents : null,
      returnOnEquity: entered(o.equityCents) && o.equityCents > 0 ? cashFlow / o.equityCents : null,
      cashFlowAnnualCents: cashFlow
    };
  }

  /**
   * underwrite(opts) — the rental priced the way it actually runs, against
   * the way it is usually advertised.
   *
   * A listing shows the rent less the mortgage and calls the difference
   * cash flow. It is not. Three costs are missing from that number and all
   * three are certain: the months it sits empty, the roof that goes once a
   * decade, and the work of managing it. This returns both figures side by
   * side, because the gap between them is the whole point.
   *
   *   everything cost() takes, plus grossRentMonthlyCents
   *   optional: vacancyRate, capexRate, managementRate, selfManaged
   * value: cashFlowMonthlyCents — after every reserve. Often negative.
   */
  function underwrite(opts) {
    var o = opts || {};
    var base = cost(o);
    if (!Money.isOk(base)) return base;
    if (!entered(o.grossRentMonthlyCents)) return Money.incomplete('Enter the rent it would bring to underwrite it.', ['grossRentMonthlyCents']);
    if (o.grossRentMonthlyCents < 0) return Money.incomplete('Rent below zero is not a rent.', ['grossRentMonthlyCents']);
    var c = conventions(o.tables);
    var assumed = base.assumed.slice(), notes = [];

    var vacRate = entered(o.vacancyRate) ? o.vacancyRate : c.vacancyRate;
    var capexRate = entered(o.capexRate) ? o.capexRate : c.capexRate;
    var mgmtRate = entered(o.managementRate) ? o.managementRate : c.managementRate;
    if (!entered(o.vacancyRate)) assumed.push('empty ' + Math.round(vacRate * 100) + '% of the year');
    if (!entered(o.capexRate)) assumed.push('a capital reserve of ' + (Math.round(capexRate * 10000) / 100) + '% of value a year');
    if (!entered(o.managementRate)) assumed.push('management at ' + Math.round(mgmtRate * 100) + '% of the rent collected');

    var rent = o.grossRentMonthlyCents;
    var vacancyCents = cents(rent * vacRate);
    var collectedCents = rent - vacancyCents;
    var capexCents = cents(base.priceCents * capexRate / 12);
    var mgmtCents = cents(collectedCents * mgmtRate);
    if (o.selfManaged === true) notes.push('Managing it yourself does not make the ' + Math.round(mgmtRate * 100) + '% free. It moves it from your wallet to your evenings; the figure stays in so the deal is judged on the work it needs, not on who does it.');

    var operatingCents = base.propertyTaxMonthlyCents + base.insuranceMonthlyCents
      + base.maintenanceMonthlyCents + base.hoaMonthlyCents + capexCents + mgmtCents;
    var noiMonthlyCents = collectedCents - operatingCents;
    var debtServiceCents = base.paymentCents + base.pmiMonthlyCents;
    var cashFlowCents = noiMonthlyCents - debtServiceCents;

    /* The figure a listing quotes: rent in, mortgage out, nothing else. */
    var advertisedCents = rent - debtServiceCents;
    var missedCents = advertisedCents - cashFlowCents;

    var m = metrics({ noiAnnualCents: noiMonthlyCents * 12, debtServiceAnnualCents: debtServiceCents * 12,
      valueCents: base.priceCents, cashInvestedCents: base.cashToCloseCents });

    /* The two screens investors run first. Neither decides anything. */
    var onePercent = base.priceCents > 0 ? rent / base.priceCents : null;
    var fiftyPercent = rent > 0 ? operatingCents / rent : null;
    var screens = [
      { id: 'onePercent', label: 'The 1% rule', value: onePercent, passes: onePercent !== null && onePercent >= c.onePercentRule,
        say: onePercent === null ? '' : 'The rent is ' + (Math.round(onePercent * 10000) / 100) + '% of the price a month, against the 1% a screen looks for.',
        caveat: 'A screen for which deals are worth an hour, not a test of whether this one works. Cheap places pass it and still lose money.' },
      { id: 'fiftyPercent', label: 'The 50% rule', value: fiftyPercent, passes: fiftyPercent !== null && fiftyPercent <= c.fiftyPercentRule,
        say: fiftyPercent === null ? '' : 'Running costs are ' + Math.round(fiftyPercent * 100) + '% of the rent, against the 50% the rule expects.',
        caveat: 'The rule counts everything except the loan. Coming in under it usually means something has been left out.' }
    ];

    var flags = [];
    if (m.dscr !== null && m.dscr < c.guardrails.dscr) flags.push('The rent covers the loan ' + (Math.round(m.dscr * 100) / 100) + ' times. A lender wants ' + c.guardrails.dscr + ', and so should you.');
    if (cashFlowCents < 0 && advertisedCents >= 0) flags.push('This is the deal that looks like it cash flows and does not. On rent less the mortgage it clears ' + Math.round(advertisedCents / 100) + ' dollars a month; once the empty months, the capital reserve and the management are counted, it costs you ' + Math.round(Math.abs(cashFlowCents) / 100) + '.');
    else if (cashFlowCents < 0) flags.push('It runs at a loss of ' + Math.round(Math.abs(cashFlowCents) / 100) + ' dollars a month before anything goes wrong.');

    return Money.ok(cashFlowCents, {
      grossRentMonthlyCents: rent, vacancyCents: vacancyCents, collectedMonthlyCents: collectedCents,
      lines: [
        { id: 'tax', label: 'Property tax', cents: base.propertyTaxMonthlyCents },
        { id: 'insurance', label: 'Insurance', cents: base.insuranceMonthlyCents },
        { id: 'maintenance', label: 'Repairs', cents: base.maintenanceMonthlyCents },
        { id: 'capex', label: 'Capital reserve', cents: capexCents, note: 'The roof, the boiler, the windows. Not repairs: replacement.' },
        { id: 'management', label: 'Management', cents: mgmtCents, note: 'Counted whether you pay it or do it.' },
        { id: 'hoa', label: 'HOA or condo fee', cents: base.hoaMonthlyCents }
      ].filter(function (l) { return l.cents > 0 || l.id === 'capex' || l.id === 'management'; }),
      operatingMonthlyCents: operatingCents, capexMonthlyCents: capexCents, managementMonthlyCents: mgmtCents,
      noiMonthlyCents: noiMonthlyCents, noiAnnualCents: noiMonthlyCents * 12,
      debtServiceMonthlyCents: debtServiceCents,
      cashFlowMonthlyCents: cashFlowCents, cashFlowAnnualCents: cashFlowCents * 12,
      advertisedCashFlowMonthlyCents: advertisedCents, reservesMissedMonthlyCents: missedCents,
      cashInvestedCents: base.cashToCloseCents, monthlyCostCents: base.totalMonthlyCents,
      capRate: m.capRate, dscr: m.dscr, cashOnCash: m.cashOnCash,
      screens: screens, flags: flags, notes: notes, assumed: assumed,
      verdict: cashFlowCents > 0 ? 'clears' : (cashFlowCents === 0 ? 'breaks even' : 'costs you')
    });
  }

  /**
   * totalReturn(opts) — the four ways a rental pays, never blended into one
   * number without the split.
   *
   *   1. cash flow            what lands, after every reserve
   *   2. principal paydown    the tenant buying the place for you
   *   3. appreciation         only if you assert a rate; never assumed
   *   4. the depreciation shelter   tax deferred, not forgiven
   *
   * opts: everything underwrite() takes, plus years, and optionally
   * appreciationRate and marginalRate (without a marginal rate the shelter
   * is not counted, because its worth depends entirely on your bracket).
   * value: totalCents — the four added up over the years held.
   */
  function totalReturn(opts) {
    var o = opts || {};
    var u = underwrite(o);
    if (!Money.isOk(u)) return u;
    if (!entered(o.years)) return Money.incomplete('Say how many years you would hold it.', ['years']);
    if (o.years <= 0) return Money.incomplete('A holding period is at least a year.', ['years']);
    var c = conventions(o.tables);
    var base = cost(o);
    var assumed = u.assumed.slice(), notes = u.notes.slice();

    var months = Math.round(o.years * 12);
    var am = amortize(base.loanCents, o.annualRate, base.termMonths, base.paymentCents, months);
    var principalCents = base.loanCents - am.balanceCents;

    var cashFlowCents = u.cashFlowMonthlyCents * months;

    var appr = entered(o.appreciationRate) ? o.appreciationRate : 0;
    if (!entered(o.appreciationRate)) assumed.push('no growth in what it is worth: the only return counted is the one the rent and the loan produce');
    var valueCents = cents(base.priceCents * Math.pow(1 + appr, o.years));
    var appreciationCents = valueCents - base.priceCents;

    /* Depreciation shelters rental income at your marginal rate, on the
       building only. It is deferred, not forgiven: it is recaptured when
       you sell. Counted only when a bracket is supplied. */
    var buildingCents = cents(base.priceCents * (1 - c.landShare));
    var annualDepreciationCents = cents(buildingCents / c.depreciationYears);
    var shelterCents = 0;
    if (entered(o.marginalRate)) {
      shelterCents = cents(annualDepreciationCents * o.marginalRate * o.years);
      notes.push('The depreciation shelter is tax deferred, not tax free. Sell, and it is recaptured, at up to 25%. It is counted here because it is real money in the years you hold it, and named because it comes back.');
    } else {
      assumed.push('the depreciation shelter is not counted: its worth depends on your tax bracket, which was not given');
    }

    var totalCents = cashFlowCents + principalCents + appreciationCents + shelterCents;
    var invested = base.cashToCloseCents;
    var onCash = invested > 0 ? totalCents / invested : null;
    var annualised = (onCash !== null && onCash > -1) ? Math.pow(1 + onCash, 1 / o.years) - 1 : null;

    return Money.ok(totalCents, {
      years: o.years, monthsHeld: months,
      parts: [
        { id: 'cashFlow', label: 'Cash flow', cents: cashFlowCents, say: 'What actually landed, after every reserve.' },
        { id: 'principal', label: 'The loan paid down', cents: principalCents, say: 'Paid by the rent, not by you. You cannot spend it until you sell or borrow against it.' },
        { id: 'appreciation', label: 'What it gained in value', cents: appreciationCents, say: appr === 0 ? 'Nothing assumed. Growth is a hope, not a plan.' : 'At ' + (Math.round(appr * 1000) / 10) + '% a year, which you asserted.' },
        { id: 'shelter', label: 'The depreciation shelter', cents: shelterCents, say: shelterCents === 0 ? 'Not counted without a tax bracket.' : 'Deferred, and recaptured when you sell.' }
      ],
      cashFlowCents: cashFlowCents, principalPaidCents: principalCents,
      appreciationCents: appreciationCents, shelterCents: shelterCents,
      annualDepreciationCents: annualDepreciationCents, buildingCents: buildingCents,
      valueAtEndCents: valueCents, balanceCents: am.balanceCents,
      cashInvestedCents: invested, totalCents: totalCents,
      returnOnCash: onCash, annualisedReturn: annualised,
      spendableCents: cashFlowCents,
      lockedCents: principalCents + appreciationCents,
      assumed: assumed, notes: notes
    });
  }

  /**
   * stress(opts) — what breaks it. Every landlord meets at least one of
   * these; the question is whether the deal survives it.
   * value: the number of scenarios it survives.
   */
  function stress(opts) {
    var o = opts || {};
    var live = underwrite(o);
    if (!Money.isOk(live)) return live;
    var c = conventions(o.tables);
    var rent = o.grossRentMonthlyCents;

    function run(label, change, say) {
      var r = underwrite(Object.assign({}, o, change));
      if (!Money.isOk(r)) return null;
      return { label: label, say: say, cashFlowMonthlyCents: r.cashFlowMonthlyCents,
        dscr: r.dscr, survives: r.cashFlowMonthlyCents >= 0,
        swingCents: r.cashFlowMonthlyCents - live.cashFlowMonthlyCents };
    }
    var rows = [
      run('It sits empty twice as often', { vacancyRate: Math.min(1, (entered(o.vacancyRate) ? o.vacancyRate : c.vacancyRate) * 2) }, 'One bad tenant, one slow season.'),
      run('The rent comes in 10% under', { grossRentMonthlyCents: cents(rent * 0.9) }, 'The market softens, or your figure was the top of the range.'),
      run('Both at once', { vacancyRate: Math.min(1, (entered(o.vacancyRate) ? o.vacancyRate : c.vacancyRate) * 2), grossRentMonthlyCents: cents(rent * 0.9) }, 'These arrive together more often than apart.')
    ].filter(Boolean);

    /* A single big repair, priced against the reserve that was set aside. */
    var repairCents = 800000;
    var reserveAfterYear = live.capexMonthlyCents * 12;
    rows.push({ label: 'The roof goes, at $8,000', say: 'A year of the capital reserve is ' + Math.round(reserveAfterYear / 100) + ' dollars, so this is ' + (Math.round(repairCents / Math.max(1, reserveAfterYear) * 10) / 10) + ' years of setting money aside.',
      cashFlowMonthlyCents: live.cashFlowMonthlyCents, dscr: live.dscr,
      survives: reserveAfterYear > 0, oneOffCents: repairCents, yearsOfReserve: repairCents / Math.max(1, reserveAfterYear) });

    var survived = rows.filter(function (r) { return r.survives; }).length;
    var monthsOfReserve = live.cashFlowMonthlyCents > 0 ? null : null;
    return Money.ok(survived, {
      scenarios: rows, survived: survived, total: rows.length,
      baseCashFlowMonthlyCents: live.cashFlowMonthlyCents,
      say: survived === rows.length ? 'It holds through every one of these.'
        : 'It stops paying under ' + (rows.length - survived) + ' of ' + rows.length + ' of the things that reliably happen.',
      monthsOfReserve: monthsOfReserve
    });
  }

  /**
   * houseHack(opts) — live in one unit, let the rest, priced honestly.
   *
   * hack() above is the plain reading: the month less the rent collected.
   * This is the one that survives contact with a real building. It carries
   * the same reserves underwrite() does, because a roof does not care that
   * you live under it, and it answers the question the arithmetic is
   * actually for: against renting a place of your own, what does this free
   * up a month, and what does that become if you keep investing it.
   *
   *   everything cost() takes, plus unitRentsCents: [cents, …]
   *   optional: rentMonthlyCents (what you would otherwise pay to rent),
   *             years and annualReturn (to carry the saving forward),
   *             vacancyRate, capexRate, managementRate
   * value: youPayMonthlyCents — what living there costs you, after the
   *   rent the other units bring. Negative means they cover it and more.
   */
  function houseHack(opts) {
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
    var assumed = base.assumed.slice(), notes = [];

    var vacRate = entered(o.vacancyRate) ? o.vacancyRate : c.vacancyRate;
    var capexRate = entered(o.capexRate) ? o.capexRate : c.capexRate;
    var mgmtRate = entered(o.managementRate) ? o.managementRate : c.managementRate;
    if (!entered(o.vacancyRate)) assumed.push('each let unit empty ' + Math.round(vacRate * 100) + '% of the year');
    if (!entered(o.capexRate)) assumed.push('a capital reserve of ' + (Math.round(capexRate * 10000) / 100) + '% of value a year');
    if (!entered(o.managementRate)) assumed.push('management at ' + Math.round(mgmtRate * 100) + '% of the rent collected');

    var grossCents = rents.reduce(function (s2, r) { return s2 + r; }, 0);
    var vacancyCents = cents(grossCents * vacRate);
    var collectedCents = grossCents - vacancyCents;
    var capexCents = cents(base.priceCents * capexRate / 12);
    var mgmtCents = cents(collectedCents * mgmtRate);

    /* The reserves are the building's, not the tenants'. They are part of
       what living here costs whether or not a unit is let. */
    var fullMonthlyCents = base.totalMonthlyCents + capexCents + mgmtCents;
    var youPayCents = fullMonthlyCents - collectedCents;

    var out = {
      unitsLet: rents.length, grossRentMonthlyCents: grossCents, vacancyCents: vacancyCents,
      collectedMonthlyCents: collectedCents,
      capexMonthlyCents: capexCents, managementMonthlyCents: mgmtCents,
      ownershipMonthlyCents: base.totalMonthlyCents, fullMonthlyCents: fullMonthlyCents,
      youPayMonthlyCents: youPayCents, theyPayYou: youPayCents < 0,
      vacancyRate: vacRate, assumed: assumed, notes: notes
    };

    /* Against renting: the saving is the point of the whole exercise. */
    if (entered(o.rentMonthlyCents)) {
      var savingCents = o.rentMonthlyCents - youPayCents;
      out.rentMonthlyCents = o.rentMonthlyCents;
      out.savingMonthlyCents = savingCents;
      out.savingAnnualCents = savingCents * 12;
      out.beatsRenting = savingCents > 0;
      if (savingCents > 0) notes.push('Living here costs ' + Math.round(youPayCents / 100) + ' dollars a month against ' + Math.round(o.rentMonthlyCents / 100) + ' to rent. The ' + Math.round(savingCents / 100) + ' a month is only a win if it is invested rather than absorbed.');
      else notes.push('This costs more each month than renting does. It can still be the right move, but not on the monthly figure: the case would have to be the loan being paid down, or what the place is worth later.');

      /* What the saving becomes, if it is actually put to work. Growth is
         the caller's assertion; without a rate this is not guessed. */
      if (entered(o.years) && o.years > 0) {
        out.years = o.years;
        var months = Math.round(o.years * 12);
        if (entered(o.annualReturn)) {
          var m2 = o.annualReturn / 12, pot = 0;
          for (var k = 0; k < months; k++) pot = pot * (1 + m2) + savingCents;
          out.savingInvestedCents = cents(pot);
          out.annualReturn = o.annualReturn;
        } else {
          out.savingInvestedCents = savingCents * months;
          assumed.push('the saving set aside and not invested: no return was asserted');
        }
        /* The loan the tenants pay down over the same years. */
        var am = amortize(base.loanCents, o.annualRate, base.termMonths, base.paymentCents, months);
        out.principalPaidCents = base.loanCents - am.balanceCents;
        out.balanceCents = am.balanceCents;
      }
    } else {
      assumed.push('no rent to compare against: what this frees up cannot be said');
    }

    /* The unit that empties. A hack with one let unit has no cushion. */
    var worst = rents.slice().sort(function (a, b) { return b - a; })[0];
    out.ifBiggestUnitEmpties = { rentLostCents: worst, youPayMonthlyCents: fullMonthlyCents - (collectedCents - cents(worst * (1 - vacRate))) };
    if (rents.length === 1) notes.push('One let unit means one tenant between you and the whole payment. Two smaller ones usually beat one larger one for exactly that reason.');

    return Money.ok(youPayCents, out);
  }

  return { cost: cost, hold: hold, rental: rental, hack: hack, amortize: amortize,
    metrics: metrics, underwrite: underwrite, totalReturn: totalReturn, stress: stress,
    houseHack: houseHack };
});
