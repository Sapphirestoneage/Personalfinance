/* ==========================================================================
   engines/rothaca.js — Roth conversions against the marketplace cliff.
   DECISIONS.md D-216 (J8).
   --------------------------------------------------------------------------
   Between leaving work and Medicare at 65, health cover comes from the
   marketplace and its price depends on what you report as income. A Roth
   conversion is reported income. So every dollar converted is taxed now at
   the ordinary rate AND can raise the premium, and above the cliff (the
   table's cliffMultiple of the poverty level) it removes the credit
   entirely. This file walks each year from the person's age to 65 and
   prices the two together, under two rules:

     cliff on    the 400%-of-FPL ceiling applies (the table's default)
     cliff off   no ceiling: the contribution is capped at
                 aca.ifNoCliff.capPercent of income instead (the rule of
                 the 2021 to 2025 enhancement, if it is extended)

   The answer is a RANGE, low to high, never one number, because which rule
   holds in the years ahead is legislation, not arithmetic.

   The benchmark premium (the second-lowest silver plan for the household)
   is typed by the person: there is no premium table in data/ and the app
   never guesses one. Tax is the federal ordinary ladder only
   (engines/tax.js ordinaryTax), conversions being ordinary income; the
   tax is paid from other money, so the whole conversion lands in the Roth.
   The pre-tax balance grows at the real return convention.

   One formula, one function: simulate() runs the years once for the
   conversion typed and once for none, and the room reads the difference.
   Every function returns a Money Result. Missing inputs produce an
   incomplete Result with a reason, never a number.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('../shared/money.js'), Schema: require('../shared/schema.js'), Tax: require('./tax.js') };
  } else {
    var S = root.SLAF || {};
    deps = { Money: S.Money, Schema: S.Schema, Tax: S.Tax };
  }
  var api = factory(deps.Money, deps.Schema, deps.Tax);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.RothAca = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Tax) {
  'use strict';

  var MONTHS = 12;
  var MEDICARE_AGE = 65;
  var DEFAULT_REAL_RETURN = 0.05;   /* used only when data/return_bands.json is not loaded, and said so */

  /** The pre-tax balance the household already holds: every invested asset
      whose orientation reads pretax (Schema.orientationOf). Null when none. */
  function pretaxCents(household) {
    var total = 0, counted = 0, assumed = false;
    ((household && household.assets) || []).forEach(function (a) {
      if (!Money.isEntered(a.valueCents)) return;
      var o = Schema.orientationOf(a);
      if (o.orientation !== 'pretax') return;
      total += a.valueCents; counted++; if (o.assumed) assumed = true;
    });
    return counted ? { cents: total, assumed: assumed, count: counted } : null;
  }

  /** The year's premium after the credit. `full` is the benchmark for the
      year in cents. Below the ceiling the household pays applicablePercentage
      × MAGI, never more than the benchmark; above it, with the cliff on, the
      whole benchmark; with the cliff off, capPercent × MAGI, never more than
      the benchmark. Returns null when the table cannot say. */
  function premiumFor(table, magiCents, size, fullCents, cliffApplies) {
    var aca = Tax.acaCliff(table, magiCents, size);
    if (!Money.isOk(aca)) return null;
    var expected;
    if (!aca.overCliff) expected = aca.expectedContributionCents === null ? fullCents : aca.expectedContributionCents;
    else if (cliffApplies) expected = fullCents;
    else {
      var cap = table.ifNoCliff && Money.isEntered(table.ifNoCliff.capPercent) ? table.ifNoCliff.capPercent : null;
      expected = cap === null ? fullCents : Math.round(magiCents * cap);
    }
    return {
      cents: Math.min(fullCents, Math.max(0, expected)),
      overCliff: !!aca.overCliff,
      fplMultiple: aca.value,
      belowFpl: aca.value < 1,
      roomBeforeCliffCents: aca.roomBeforeCliffCents,
      cliffCents: aca.cliffCents,
      fplDollars: aca.fplDollars
    };
  }

  /* The years, once. Returns the rows and the totals for a conversion a year. */
  function simulate(p, conversionAnnualCents) {
    var balance = p.pretaxCents, roth = 0;
    var rows = [], tax = 0, on = 0, off = 0, converted = 0;
    for (var age = p.startAge; age < MEDICARE_AGE; age++) {
      var conv = Math.max(0, Math.min(conversionAnnualCents, Math.round(balance)));
      var magi = p.otherIncomeCents + conv;
      var ord = Tax.ordinaryTax(p.tables.federalBrackets, magi, p.filingStatus);
      if (!Money.isOk(ord)) return ord;
      var pOn = premiumFor(p.tables.aca, magi, p.householdSize, p.fullYearCents, true);
      var pOff = premiumFor(p.tables.aca, magi, p.householdSize, p.fullYearCents, false);
      if (!pOn || !pOff) return Money.incomplete('The marketplace table could not price this year.', ['aca']);
      rows.push({
        age: age, conversionCents: conv, magiCents: magi, taxCents: ord.value, marginalRate: ord.marginalRate,
        premiumOnCents: pOn.cents, premiumOffCents: pOff.cents,
        overCliff: pOn.overCliff, belowFpl: pOn.belowFpl, fplMultiple: pOn.fplMultiple,
        roomBeforeCliffCents: pOn.roomBeforeCliffCents, cliffCents: pOn.cliffCents,
        pretaxStartCents: Math.round(balance)
      });
      tax += ord.value; on += pOn.cents; off += pOff.cents; converted += conv;
      balance = (balance - conv) * (1 + p.growthRate);
      roth = roth * (1 + p.growthRate) + conv;
    }
    return Money.ok(tax + on, {
      rows: rows, taxCents: tax, premiumOnCents: on, premiumOffCents: off,
      totalOnCents: tax + on, totalOffCents: tax + off,
      convertedCents: converted, leftPretaxCents: Math.round(balance), rothCents: Math.round(roth)
    });
  }

  /**
   * plan(household, tables, opts) → Result
   *   opts.benchmarkPremiumMonthlyCents   REQUIRED: the benchmark plan a month
   *   opts.conversionAnnualCents          converted each year (0 or absent: none)
   *   opts.otherIncomeAnnualCents         MAGI apart from conversions (absent: 0)
   *   opts.pretaxCents                    absent: the household's pre-tax assets
   *   opts.age                            absent: the primary adult's age
   *   value        the low end of the lifetime range (tax + premiums to 65)
   *   lowCents, highCents                 the range across the two rules
   *   cliffOn, cliffOff                   each: taxCents, premiumCents, totalCents
   *   baseline                            the same with no conversion
   *   extraOnCents, extraOffCents         what converting adds under each rule
   *   rows                                the year rows (cliff on) — see simulate
   *   years, filingStatus, householdSize, growthRate, assumed[]
   *   fillToCliffCents                    the most that fits under the cliff in year one
   */
  function plan(household, tables, opts) {
    var h = household || {}, T = tables || {}, o = opts || {};
    if (!T.federalBrackets) return Money.incomplete('Federal bracket table is not loaded.', ['federalBrackets']);
    if (!T.aca) return Money.incomplete('The marketplace table is not loaded.', ['aca']);
    if (!Money.isEntered(o.benchmarkPremiumMonthlyCents)) return Money.incomplete('Type the benchmark premium for your household from the marketplace to price this.', ['benchmarkPremium']);
    if (o.benchmarkPremiumMonthlyCents < 0) return Money.incomplete('A premium below zero is not a premium.', ['benchmarkPremium']);
    var age = Money.isEntered(o.age) ? o.age : Schema.primaryAge(h);
    if (age === null || age === undefined) return Money.incomplete('Add your date of birth in Start Here to count the years to 65.', ['dob']);
    var startAge = Math.floor(age);
    if (startAge >= MEDICARE_AGE) return Money.incomplete('At 65 the marketplace question ends: Medicare replaces it.', []);

    var assumed = [];
    var fs = h.filingStatus;
    if (!fs || !T.federalBrackets.brackets[fs]) { fs = 'single'; assumed.push('filingStatus'); }
    var pre;
    if (Money.isEntered(o.pretaxCents)) pre = { cents: o.pretaxCents, assumed: false, source: 'typed' };
    else {
      var held = pretaxCents(h);
      if (!held) return Money.incomplete('Type the pre-tax balance, or add a pre-tax account on the Statement.', ['pretaxBalance']);
      pre = { cents: held.cents, assumed: held.assumed, source: 'household' };
      if (held.assumed) assumed.push('pretaxOrientation');
    }
    var other = Money.isEntered(o.otherIncomeAnnualCents) ? o.otherIncomeAnnualCents : 0;
    if (!Money.isEntered(o.otherIncomeAnnualCents)) assumed.push('otherIncome');
    var growth = T.returnBands && T.returnBands.percentiles && Money.isEntered(T.returnBands.percentiles.p50) ? T.returnBands.percentiles.p50 : DEFAULT_REAL_RETURN;
    if (!(T.returnBands && T.returnBands.percentiles)) assumed.push('growth');
    var conv = Money.isEntered(o.conversionAnnualCents) ? Math.max(0, o.conversionAnnualCents) : 0;

    var p = {
      tables: T, filingStatus: fs, householdSize: Math.max(1, ((h.people || []).length) || 1),
      fullYearCents: o.benchmarkPremiumMonthlyCents * MONTHS, otherIncomeCents: other,
      pretaxCents: pre.cents, startAge: startAge, growthRate: growth
    };
    var withConv = simulate(p, conv);
    if (!Money.isOk(withConv)) return withConv;
    var without = simulate(p, 0);
    if (!Money.isOk(without)) return without;

    var first = premiumFor(T.aca, other, p.householdSize, p.fullYearCents, true);
    var low = Math.min(withConv.totalOnCents, withConv.totalOffCents);
    var high = Math.max(withConv.totalOnCents, withConv.totalOffCents);
    return Money.ok(low, {
      lowCents: low, highCents: high,
      cliffOn: { taxCents: withConv.taxCents, premiumCents: withConv.premiumOnCents, totalCents: withConv.totalOnCents },
      cliffOff: { taxCents: withConv.taxCents, premiumCents: withConv.premiumOffCents, totalCents: withConv.totalOffCents },
      baseline: {
        cliffOn: { taxCents: without.taxCents, premiumCents: without.premiumOnCents, totalCents: without.totalOnCents },
        cliffOff: { taxCents: without.taxCents, premiumCents: without.premiumOffCents, totalCents: without.totalOffCents }
      },
      extraOnCents: withConv.totalOnCents - without.totalOnCents,
      extraOffCents: withConv.totalOffCents - without.totalOffCents,
      rows: withConv.rows,
      years: withConv.rows.length,
      conversionAnnualCents: conv, convertedCents: withConv.convertedCents,
      leftPretaxCents: withConv.leftPretaxCents, rothCents: withConv.rothCents,
      pretaxSource: pre.source, pretaxCents: pre.cents, otherIncomeCents: other,
      yearsOverCliff: withConv.rows.filter(function (r) { return r.overCliff; }).length,
      fillToCliffCents: first ? first.roomBeforeCliffCents : null,
      cliffCents: first ? first.cliffCents : null, fplDollars: first ? first.fplDollars : null,
      filingStatus: fs, householdSize: p.householdSize, growthRate: growth, startAge: startAge, endAge: MEDICARE_AGE,
      assumed: assumed,
      referenceVersion: { federalBrackets: T.federalBrackets.version, aca: T.aca.version },
      confidence: T.aca.confidence
    });
  }

  return { MEDICARE_AGE: MEDICARE_AGE, DEFAULT_REAL_RETURN: DEFAULT_REAL_RETURN, pretaxCents: pretaxCents, premiumFor: premiumFor, plan: plan };
});
