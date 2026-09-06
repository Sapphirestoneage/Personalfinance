/* ==========================================================================
   engines/statement.js — what the 10x Statement says about a balance sheet.
   --------------------------------------------------------------------------
   Net worth is one number. This is the set of questions a balance sheet
   should also answer, each its own function returning a Result:

     portfolios               three portfolios, not one list — liquid
                              financial · illiquid financial · non-financial
     confidenceWeightedNetWorth  Σ value × how sure you are, beside the plain
     liquidityLadder          reachable today · this month · this year · never,
                              with pre-59½ money gated into "never" except
                              the Roth basis
     bridgeGap                the years between your FI date and 59½, and
                              whether the reachable money covers them
     worstPlausibleYear       every deductible + every out-of-pocket max +
                              six months of essentials − the unemployment
                              benefit, against cash
     incomeConcentration      the largest source over the household total
     propertyMetrics          cap rate, cash-on-cash, DSCR for a rental

   Every input comes from the household or a data/ table; nothing is
   assumed silently. Money is integer cents. DECISIONS.md D-068.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = {
      Money: require('../shared/money.js'),
      Schema: require('../shared/schema.js'),
      Tier0: require('./tier0.js'),
      Fire: require('./fire.js')
    };
  } else {
    deps = {
      Money: root.SLAF && root.SLAF.Money,
      Schema: root.SLAF && root.SLAF.Schema,
      Tier0: root.SLAF && root.SLAF.Tier0,
      Fire: root.SLAF && root.SLAF.Fire
    };
  }
  var api = factory(deps.Money, deps.Schema, deps.Tier0, deps.Fire);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Statement = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Tier0, Fire) {
  'use strict';

  var ACCESS_AGE_DEFAULT = 59.5;
  var WORST_YEAR_MONTHS = 6;
  var MAX_BENEFIT_WEEKS = 26;

  function valued(household) {
    return Schema.aggregatableAssets(household).filter(function (a) {
      return Money.isEntered(a.valueCents);
    });
  }

  /* ---- 1. Three portfolios ------------------------------------------------- */

  function portfolios(household, rules) {
    if (!rules) return Money.incomplete('Access rules are not loaded.', ['accessRules']);
    var assets = valued(household);
    if (!assets.length) return Money.incomplete('Add something you own to see the portfolios.', ['assets']);
    var buckets = {};
    (rules.buckets || []).forEach(function (b) {
      buckets[b.id] = { id: b.id, label: b.label, blurb: b.blurb, assets: [], totalCents: 0, cashFlowMonthlyCents: 0 };
    });
    var total = 0;
    assets.forEach(function (a) {
      var rule = Schema.assetRule(a, rules);
      var b = buckets[rule.bucket] || buckets.nonFinancial;
      b.assets.push({ asset: a, rule: rule });
      b.totalCents += a.valueCents;
      if (Money.isEntered(a.cashFlowMonthlyCents)) b.cashFlowMonthlyCents += a.cashFlowMonthlyCents;
      total += a.valueCents;
    });
    var debts = Schema.totalDebtCents(household);
    return Money.ok(total, {
      buckets: buckets,
      order: (rules.buckets || []).map(function (b) { return b.id; }),
      totalAssetsCents: total,
      totalDebtCents: Money.isOk(debts) ? debts.value : null,
      plainNetWorthCents: Money.isOk(debts) ? total - debts.value : (household.meta && household.meta.hasDebt === false ? total : null)
    });
  }

  /* ---- 2. Confidence-weighted net worth -------------------------------------- */

  function confidenceWeightedNetWorth(household, weights) {
    if (!weights || !weights.weights) return Money.incomplete('Confidence weights are not loaded.', ['confidenceWeights']);
    var assets = valued(household);
    var rated = 0, unrated = 0, weighted = 0, plain = 0, ratedCount = 0, unratedCount = 0;
    assets.forEach(function (a) {
      plain += a.valueCents;
      var w = Money.isEntered(a.confidence) ? weights.weights[String(a.confidence)] : undefined;
      if (w === undefined) { unrated += a.valueCents; unratedCount++; return; }
      rated += a.valueCents; ratedCount++;
      weighted += a.valueCents * w;
    });
    if (ratedCount === 0) {
      return Money.incomplete('Rate how sure you are of at least one asset to see this.', ['confidence']);
    }
    var debts = Schema.totalDebtCents(household);
    var debtCents = Money.isOk(debts) ? debts.value : (household.meta && household.meta.hasDebt === false ? 0 : null);
    if (debtCents === null) return Money.incomplete('Add your debts (or say there are none) to net this.', ['totalDebt']);
    return Money.ok(Math.round(weighted) - debtCents, {
      plainNetWorthCents: plain - debtCents,
      weightedAssetsCents: Math.round(weighted),
      ratedAssetsCents: rated,
      unratedAssetsCents: unrated,
      ratedCount: ratedCount,
      unratedCount: unratedCount,
      haircutCents: rated - Math.round(weighted),
      debtCents: debtCents,
      referenceVersion: weights.version
    });
  }

  /* ---- 3. The liquidity ladder ------------------------------------------------ */

  /**
   * liquidityLadder(household, rules, opts)
   *   opts.age  — overrides the primary person's age (tests)
   * Bands by effective liquidity 1-4. Money behind an access age you have
   * not reached goes to "never" — except a Roth's basis, which is reachable
   * at its own liquidity. With no age the gate cannot be applied and the
   * result says so rather than pretending everything is reachable.
   */
  function liquidityLadder(household, rules, opts) {
    if (!rules) return Money.incomplete('Access rules are not loaded.', ['accessRules']);
    var assets = valued(household);
    if (!assets.length) return Money.incomplete('Add something you own to build the ladder.', ['assets']);
    var age = opts && Money.isEntered(opts.age) ? opts.age : Schema.primaryAge(household);
    var bands = { 1: 0, 2: 0, 3: 0, 4: 0 };
    var gatedCents = 0, unknownCents = 0, unratedCount = 0, rows = [];
    assets.forEach(function (a) {
      var rule = Schema.assetRule(a, rules);
      var liq = Schema.assetLiquidity(a, rules);
      if (!liq.rated) unratedCount++;
      var accessAge = Schema.assetAccessAge(a, rules);
      var gated = Money.isEntered(age) && Money.isEntered(accessAge) && age < accessAge;
      var band = liq.value;
      var reachable = a.valueCents, locked = 0;
      if (gated) {
        /* Roth: contributions come out any time; only the earnings wait. */
        var basisFree = rule.basisAccessAge === null && Money.isEntered(a.costBasisCents);
        reachable = basisFree ? Math.min(a.costBasisCents, a.valueCents) : 0;
        locked = a.valueCents - reachable;
      }
      if (a.taxCharacter === 'unknown') unknownCents += a.valueCents;
      bands[band] += reachable;
      bands[4] += locked;
      gatedCents += locked;
      rows.push({ asset: a, band: band, rated: liq.rated, accessAge: accessAge, gated: gated,
        reachableCents: reachable, lockedCents: locked });
    });
    return Money.ok(bands[1] + bands[2] + bands[3], {
      bands: {
        today: bands[1], thisMonth: bands[2], thisYear: bands[3], never: bands[4]
      },
      cumulative: { today: bands[1], thisMonth: bands[1] + bands[2], thisYear: bands[1] + bands[2] + bands[3] },
      gatedCents: gatedCents,
      unknownCents: unknownCents,
      unratedCount: unratedCount,
      ageKnown: Money.isEntered(age),
      age: Money.isEntered(age) ? age : null,
      rows: rows,
      referenceVersion: rules.version
    });
  }

  /* ---- 4. The bridge to 59½ ---------------------------------------------------- */

  /**
   * bridgeGap(household, tables, opts)
   * Years between the FI date (standard variant, at the current pace) and
   * 59½, times annual spend, against what can be reached before 59½:
   * taxable, Roth basis, HSA. Result value = dollars short (0 = covered).
   */
  function bridgeGap(household, tables, opts) {
    var rules = tables && tables.accessRules;
    if (!rules) return Money.incomplete('Access rules are not loaded.', ['accessRules']);
    var age = opts && Money.isEntered(opts.age) ? opts.age : Schema.primaryAge(household);
    if (!Money.isEntered(age)) return Money.incomplete('Add your date of birth to place 59½.', ['dob']);
    var spend = Schema.monthlyExpensesCents(household);
    if (!Money.isOk(spend)) return Money.incomplete('Add your monthly spending to size the bridge.', ['monthlyExpenses']);
    var progress = Fire.progressToward(household, tables, { variantId: 'standard' });
    if (!Money.isOk(progress)) return progress;
    var years = progress.yearsAway;
    /* `return years` used to hand on whatever this was. When it was not a
       Result at all, the undefined travelled two more frames before anything
       noticed (D-143). A relay says so in its own words instead. */
    if (!Money.isOk(years)) {
      return Money.isOk(years) || (years && years.status)
        ? years
        : Money.incomplete('Could not work out how far off financial independence is, so the bridge cannot be sized.', ['monthlyExpenses']);
    }
    var fiAge = age + years.value;
    var gapYears = Math.max(0, ACCESS_AGE_DEFAULT - fiAge);
    var annualSpend = spend.value * 12;
    var needCents = Math.round(gapYears * annualSpend);

    var available = 0, parts = { taxable: 0, rothBasis: 0, hsa: 0, cash: 0 };
    valued(household).forEach(function (a) {
      var rule = Schema.assetRule(a, rules);
      if (rule.key === 'taxable') { parts.taxable += a.valueCents; available += a.valueCents; }
      else if (rule.key === 'cash') { parts.cash += a.valueCents; available += a.valueCents; }
      else if (rule.key === 'roth' && Money.isEntered(a.costBasisCents)) {
        var b = Math.min(a.costBasisCents, a.valueCents); parts.rothBasis += b; available += b;
      }
      else if (rule.key === 'hsa') { parts.hsa += a.valueCents; available += a.valueCents; }
    });
    var shortCents = Math.max(0, needCents - available);
    return Money.ok(shortCents, {
      age: age, fiAge: Math.round(fiAge * 10) / 10, yearsToFi: years.value,
      accessAge: ACCESS_AGE_DEFAULT,
      gapYears: Math.round(gapYears * 10) / 10,
      annualSpendCents: annualSpend,
      needCents: needCents,
      availableCents: available,
      parts: parts,
      coveredYears: annualSpend > 0 ? Math.round(available / annualSpend * 10) / 10 : null,
      noBridgeNeeded: gapYears === 0,
      alreadyThere: progress.yearsAway.alreadyThere === true
    });
  }

  /* ---- 5. The worst plausible year --------------------------------------------- */

  /**
   * worstPlausibleYear(household, tables)
   * Every deductible you carry, every out-of-pocket maximum, six months of
   * essentials, less what unemployment would pay — against cash. Value =
   * dollars short after cash (0 = covered).
   */
  function worstPlausibleYear(household, tables) {
    var ins = household.insurance || {};
    var spend = Schema.monthlyExpensesCents(household);
    if (!Money.isOk(spend)) return Money.incomplete('Add your monthly spending to size a bad year.', ['monthlyExpenses']);
    if (!Money.isEntered(ins.highestDeductibleCents)) {
      return Money.incomplete('Add your highest deductible to size a bad year.', ['highestDeductible']);
    }
    var deductibles = ins.highestDeductibleCents;
    var oop = Money.isEntered(ins.oopMaxCents) ? ins.oopMaxCents : 0;
    var essentials = spend.value * WORST_YEAR_MONTHS;

    var benefit = 0, benefitWeeks = 0, benefitWeeklyCents = null, benefitKnown = false;
    var ui = tables && tables.uiBenefits;
    var gross = Schema.grossAnnualIncomeCents(household);
    if (ui && household.state && ui.states[household.state] && Money.isOk(gross) && gross.value > 0) {
      var row = ui.states[household.state];
      var weeklyWage = gross.value / 52;
      benefitWeeklyCents = Math.round(Math.min(row.maxWeeklyDollars * 100, weeklyWage * ui.replacementRate));
      benefitWeeks = Math.min(row.weeks, MAX_BENEFIT_WEEKS);
      benefit = benefitWeeklyCents * benefitWeeks;
      benefitKnown = true;
    }
    var cost = deductibles + oop + essentials;
    var net = Math.max(0, cost - benefit);
    var cash = Schema.cashCents(household);
    var cashCents = Money.isOk(cash) ? cash.value : 0;
    return Money.ok(Math.max(0, net - cashCents), {
      deductiblesCents: deductibles,
      oopMaxCents: oop,
      oopMaxKnown: Money.isEntered(ins.oopMaxCents),
      essentialsCents: essentials,
      months: WORST_YEAR_MONTHS,
      costCents: cost,
      benefitCents: benefit,
      benefitWeeklyCents: benefitWeeklyCents,
      benefitWeeks: benefitWeeks,
      benefitKnown: benefitKnown,
      benefitConfidence: ui ? ui.confidence : null,
      netCents: net,
      cashCents: cashCents,
      cashKnown: Money.isOk(cash),
      coverage: net > 0 ? cashCents / net : null,
      covered: cashCents >= net
    });
  }

  /* ---- 6. Income concentration -------------------------------------------------- */

  function incomeConcentration(household) {
    var sources = Schema.allIncomeSources(household).filter(function (s) {
      return Money.isEntered(s.grossAnnualIncomeCents) && s.grossAnnualIncomeCents > 0;
    });
    if (!sources.length) return Money.incomplete('Add your income to see how concentrated it is.', ['grossAnnualIncome']);
    var total = 0, largest = null;
    sources.forEach(function (s) {
      total += s.grossAnnualIncomeCents;
      if (!largest || s.grossAnnualIncomeCents > largest.grossAnnualIncomeCents) largest = s;
    });
    return Money.ok(largest.grossAnnualIncomeCents / total, {
      sourceCount: sources.length,
      largestLabel: largest.source || null,
      largestCents: largest.grossAnnualIncomeCents,
      totalCents: total
    });
  }

  /* ---- 7. A rental, in ratios ---------------------------------------------------- */

  /**
   * propertyMetrics(household, property, opts)
   *   opts.vacancyRate — the assumption when the record has none (0.08)
   * NOI = (rent × (1 − vacancy) − opex) × 12. Cap rate = NOI / value.
   * Debt service = PITI × 12. DSCR = NOI / debt service. Cash-on-cash =
   * (NOI − debt service) / equity, equity = value − mortgage balance.
   */
  function propertyMetrics(household, property, opts) {
    var p = property || {};
    var asset = (household.assets || []).filter(function (a) { return a.id === p.assetId; })[0];
    if (!asset || !Money.isEntered(asset.valueCents)) {
      return Money.incomplete('Link this rental to the asset that carries its value.', ['assets']);
    }
    if (!Money.isEntered(p.rentMonthlyCents)) return Money.incomplete('Add the monthly rent.', ['rentMonthlyCents']);
    var vacancy = Money.isEntered(p.vacancyRate) ? p.vacancyRate
      : (opts && Money.isEntered(opts.vacancyRate) ? opts.vacancyRate : 0.08);
    var opex = Money.isEntered(p.opexMonthlyCents) ? p.opexMonthlyCents : 0;
    var noi = Math.round((p.rentMonthlyCents * (1 - vacancy) - opex) * 12);
    var mortgage = (household.debts || []).filter(function (d) { return d.id === p.mortgageId; })[0];
    var balance = mortgage && Money.isEntered(mortgage.balanceCents) ? mortgage.balanceCents : 0;
    var equity = asset.valueCents - balance;
    var debtService = Money.isEntered(p.pitiMonthlyCents) ? p.pitiMonthlyCents * 12 : 0;
    var capRate = Money.safeDivide(noi, asset.valueCents, { denominatorName: 'value' });
    var dscr = debtService > 0 ? Money.safeDivide(noi, debtService, { denominatorName: 'debtService' }) : null;
    var coc = Money.safeDivide(noi - debtService, equity, { denominatorName: 'equity', zeroReason: 'No equity yet.' });
    return Money.ok(noi, {
      noiCents: noi,
      vacancyRate: vacancy, vacancyAssumed: !Money.isEntered(p.vacancyRate),
      opexAnnualCents: opex * 12,
      debtServiceAnnualCents: debtService,
      equityCents: equity,
      valueCents: asset.valueCents,
      capRate: Money.isOk(capRate) ? capRate.value : null,
      dscr: dscr && Money.isOk(dscr) ? dscr.value : null,
      cashOnCash: Money.isOk(coc) ? coc.value : null,
      cashFlowMonthlyCents: Math.round((noi - debtService) / 12)
    });
  }

  function all(household, tables) {
    var t = tables || {};
    return {
      portfolios: portfolios(household, t.accessRules),
      confidenceWeightedNetWorth: confidenceWeightedNetWorth(household, t.confidenceWeights),
      liquidityLadder: liquidityLadder(household, t.accessRules),
      bridgeGap: bridgeGap(household, t),
      worstPlausibleYear: worstPlausibleYear(household, t),
      incomeConcentration: incomeConcentration(household),
      properties: (household.property || []).map(function (p) { return { property: p, metrics: propertyMetrics(household, p) }; })
    };
  }

  return {
    ACCESS_AGE_DEFAULT: ACCESS_AGE_DEFAULT,
    WORST_YEAR_MONTHS: WORST_YEAR_MONTHS,
    portfolios: portfolios,
    confidenceWeightedNetWorth: confidenceWeightedNetWorth,
    liquidityLadder: liquidityLadder,
    bridgeGap: bridgeGap,
    worstPlausibleYear: worstPlausibleYear,
    incomeConcentration: incomeConcentration,
    propertyMetrics: propertyMetrics,
    all: all
  };
});
