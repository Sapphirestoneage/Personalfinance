/* ==========================================================================
   engines/trap.js — the Middle Class Trap Test.
   DECISIONS.md D-218 (K1).
   --------------------------------------------------------------------------
   The debate: BiggerPockets Money says a net worth that is mostly the
   house and the 401(k) is a trap before 59 and a half; ChooseFI and the
   FI Tax Guy say it is a planning problem with known solutions. This file
   runs both on the household's own numbers, year by year from the
   retirement age to the access age, under four paths:

     bridge   spend cash, taxable accounts and Roth contributions; touch
              pre-tax money only at the access age
     ladder   convert a year of spending from pre-tax to Roth each year,
              taxed as income in the year converted, spendable after the
              seasoning period; the bridge covers the seasoning years
     sepp     72(t): a fixed annual payment from the pre-tax money by the
              amortization method at the rule's rate ceiling, taxed as
              income, no penalty
     rule55   leaving in or after the year you turn 55: the employer plan
              is spendable, taxed as income, no penalty

   Every rule (the access age, the penalty, the seasoning years, the 72(t)
   method and rate, the Rule of 55 age, the life expectancy table) comes
   from data/early_access_rules_2026.json. Tax is the federal ordinary
   ladder (engines/tax.js ordinaryTax) and the capital gains stack; the
   72(t) payment is engines/projection.js levelPaymentCents, never a
   second formula. Balances grow at the real return; the range is the
   three bands (Triple D: dream, default, disaster). Home equity is shown
   and never counted unless the person picks sell or borrow against it.

   A shortfall year is a year the path's own sources cannot cover spending.
   The verdicts: Trapped (a shortfall year), Tight (covered, but the bridge
   ends near empty), Free. Nothing here picks a side: the room names both
   and says what the numbers say for this household.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('../shared/money.js'), Schema: require('../shared/schema.js'), Tax: require('./tax.js'), Projection: require('./projection.js'), Tier0: require('./tier0.js') };
  } else {
    var S = root.SLAF || {};
    deps = { Money: S.Money, Schema: S.Schema, Tax: S.Tax, Projection: S.Projection, Tier0: S.Tier0 };
  }
  var api = factory(deps.Money, deps.Schema, deps.Tax, deps.Projection, deps.Tier0);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Trap = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Tax, Projection, Tier0) {
  'use strict';

  var MONTHS = 12;
  var PATHS = [
    { id: 'bridge', label: 'Bridge accounts', side: 'trap', words: 'Spend cash, taxable accounts and Roth contributions; touch pre-tax money only at the access age.' },
    { id: 'ladder', label: 'Roth conversion ladder', side: 'solvable', words: 'Convert a year of spending each year, pay the tax then, spend it after the seasoning period; the bridge carries the first years.' },
    { id: 'sepp', label: '72(t) payments', side: 'solvable', words: 'A fixed yearly payment from the pre-tax money by the approved method, taxed as income, no penalty.' },
    { id: 'rule55', label: 'Rule of 55', side: 'solvable', words: 'Leave that employer in or after the year you turn 55 and its plan is spendable, taxed as income, no penalty.' }
  ];
  var VERDICTS = ['Trapped', 'Tight', 'Free'];
  var HOME_EQUITY = ['ignore', 'sell', 'borrow'];

  /* ---- the piles, read off the assets by orientation ---------------------- */
  function piles(household) {
    var h = household || {};
    var out = { cashCents: 0, taxableCents: 0, taxableBasisCents: 0, rothBasisCents: 0, rothEarningsCents: 0, pretaxCents: 0, homeCents: 0, mortgageCents: 0, assumed: [] };
    (h.assets || []).forEach(function (a) {
      if (!Money.isEntered(a.valueCents) || a.valueCents <= 0) return;
      var tc = a.taxCharacter, cat = a.category;
      if (tc === 'cash' || (!tc && cat === 'cash')) { out.cashCents += a.valueCents; return; }
      if (tc === 'property' || (!tc && cat === 'property')) { out.homeCents += a.valueCents; return; }
      var o = Schema.orientationOf(a);
      if (o.assumed) out.assumed.push((a.label || 'an account') + ' read as ' + o.orientation);
      if (o.orientation === 'pretax' || o.orientation === 'hsa') { out.pretaxCents += a.valueCents; return; }
      if (o.orientation === 'roth') {
        var basis = Money.isEntered(a.costBasisCents) ? Math.min(a.costBasisCents, a.valueCents) : 0;
        if (!Money.isEntered(a.costBasisCents)) out.assumed.push((a.label || 'a Roth') + ' with no contribution basis entered: read as all earnings');
        out.rothBasisCents += basis; out.rothEarningsCents += a.valueCents - basis; return;
      }
      if (o.orientation === 'taxable') {
        var share = Schema.TAXABLE_BASIS_SHARE || 0.6;
        var tb = Money.isEntered(a.costBasisCents) ? Math.min(a.costBasisCents, a.valueCents) : Math.round(a.valueCents * share);
        if (!Money.isEntered(a.costBasisCents)) out.assumed.push((a.label || 'a taxable account') + ' basis assumed at ' + Math.round(share * 100) + '% of value');
        out.taxableCents += a.valueCents; out.taxableBasisCents += tb;
      }
    });
    (h.debts || []).forEach(function (d) { if (d.type === 'mortgage' && Money.isEntered(d.balanceCents)) out.mortgageCents += d.balanceCents; });
    out.homeEquityCents = Math.max(0, out.homeCents - out.mortgageCents);
    return out;
  }

  function lifeExpectancy(rules, age) {
    var t = rules.singleLifeExpectancy && rules.singleLifeExpectancy.byAge;
    if (!t) return null;
    var ages = Object.keys(t).map(Number).sort(function (a, b) { return a - b; });
    var a = Math.max(ages[0], Math.min(ages[ages.length - 1], Math.round(age)));
    return t[String(a)];
  }

  /** The 72(t) payment a year by the fixed amortization method at the rule's rate ceiling. */
  function seppPaymentCents(rules, pretaxCents, age) {
    var n = lifeExpectancy(rules, age);
    if (n === null || pretaxCents <= 0) return 0;
    var p = Projection.levelPaymentCents({ principalCents: pretaxCents, annualRate: rules.sepp.maxRate, months: Math.round(n * MONTHS) });
    return Money.isOk(p) ? p.value * MONTHS : 0;
  }

  /* ---- the lead time: what is saved until the retirement age lands in the
     bridge (taxable), and the invested piles grow ------------------------- */
  function accumulate(pl, years, rate, annualSavingsCents) {
    var s = { cash: pl.cashCents, taxable: pl.taxableCents, taxBasis: pl.taxableBasisCents, rothBasis: pl.rothBasisCents, rothEarn: pl.rothEarningsCents, pretax: pl.pretaxCents };
    for (var y = 0; y < years; y++) {
      s.taxable = s.taxable * (1 + rate) + annualSavingsCents; s.taxBasis += annualSavingsCents;
      s.rothEarn *= (1 + rate); s.pretax *= (1 + rate);
    }
    return s;
  }

  /* ---- one path, one band ---------------------------------------------------- */
  function simulate(pathId, p, rate) {
    var R = p.rules, spend = p.spendAnnualCents;
    var s = accumulate(p.piles, Math.max(0, Math.round(p.retireAge - p.age)), rate, p.annualSavingsCents);
    s.cash += p.extraCashCents;
    var queue = [], rows = [], tax = 0, shortfall = 0, shortfallYears = [];
    var sepp = pathId === 'sepp' ? seppPaymentCents(R, s.pretax, p.retireAge) : 0;
    for (var y = 0; y < p.horizonYears; y++) {
      var age = p.retireAge + y;
      var ordinary = 0, conversion = 0, fromPretax = 0;
      if (pathId === 'ladder') {
        queue.forEach(function (q) { if (q.at === y) s.rothBasis += q.cents; });
        conversion = Math.min(spend, Math.floor(s.pretax));
        if (conversion > 0) { s.pretax -= conversion; queue.push({ at: y + R.conversionSeasoningYears, cents: conversion }); ordinary += conversion; }
      }
      if (pathId === 'sepp') { fromPretax = Math.min(sepp, Math.floor(s.pretax)); s.pretax -= fromPretax; s.cash += fromPretax; ordinary += fromPretax; }
      var ord = Tax.ordinaryTax(p.tables.federalBrackets, ordinary, p.filingStatus);
      var ordTax = Money.isOk(ord) ? ord.value : 0;
      var need = spend + ordTax;
      var fromCash = 0, fromTaxable = 0, fromRoth = 0, gains = 0;
      /* the draw: cash, then taxable (gains taxed on top of the year's ordinary income), then Roth contributions */
      var take = Math.min(need, Math.round(s.cash)); s.cash -= take; fromCash += take; need -= take;
      if (need > 0 && s.taxable > 0) {
        take = Math.min(need, Math.round(s.taxable));
        var gainShare = s.taxable > 0 ? Math.max(0, 1 - s.taxBasis / s.taxable) : 0;
        gains = Math.round(take * gainShare);
        s.taxBasis -= Math.round(take * (1 - gainShare)); s.taxable -= take; fromTaxable += take; need -= take;
      }
      if (need > 0 && s.rothBasis > 0) { take = Math.min(need, Math.round(s.rothBasis)); s.rothBasis -= take; fromRoth += take; need -= take; }
      if (pathId === 'rule55' && need > 0 && s.pretax > 0) {
        take = Math.min(need, Math.round(s.pretax)); s.pretax -= take; fromPretax += take; need -= take; ordinary += take;
        var ord2 = Tax.ordinaryTax(p.tables.federalBrackets, ordinary, p.filingStatus);
        var extra = (Money.isOk(ord2) ? ord2.value : 0) - ordTax;
        ordTax += extra; need += extra;
        if (need > 0 && s.pretax > 0) { take = Math.min(need, Math.round(s.pretax)); s.pretax -= take; fromPretax += take; need -= take; }
      }
      var cg = gains > 0 ? Tax.capitalGainsTax(p.tables.federalBrackets, gains, Money.isOk(ord) ? ord.taxableIncomeCents : 0, p.filingStatus) : null;
      var cgTax = cg && Money.isOk(cg) ? cg.value : 0;
      if (cgTax > 0) { take = Math.min(cgTax, Math.round(s.cash)); s.cash -= take; fromCash += take; var left = cgTax - take; if (left > 0 && s.rothBasis > 0) { take = Math.min(left, Math.round(s.rothBasis)); s.rothBasis -= take; fromRoth += take; left -= take; } need += left; }
      tax += ordTax + cgTax;
      var short = Math.max(0, need);
      if (short > 0) { shortfall += short; shortfallYears.push(age); }
      var bridgeLeft = Math.round(s.cash + s.taxable + s.rothBasis);
      rows.push({ age: age, spendCents: spend, taxCents: ordTax + cgTax, fromCashCents: fromCash, fromTaxableCents: fromTaxable, fromRothCents: fromRoth, fromPretaxCents: fromPretax, conversionCents: conversion, shortfallCents: short, bridgeLeftCents: bridgeLeft, pretaxLeftCents: Math.round(s.pretax) });
      /* growth: invested piles at the real rate, cash flat */
      s.taxable *= (1 + rate); s.rothBasis += 0; s.rothEarn *= (1 + rate); s.pretax *= (1 + rate);
    }
    var last = rows[rows.length - 1];
    var bridgeLeft = last ? last.bridgeLeftCents : Math.round(s.cash + s.taxable + s.rothBasis);
    var verdict = shortfallYears.length ? 'Trapped' : (bridgeLeft < R.verdicts.tightYearsOfBridgeLeft * spend ? 'Tight' : 'Free');
    return { rows: rows, taxCents: tax, shortfallCents: shortfall, shortfallYears: shortfallYears, penaltyIfFilledCents: Math.round(shortfall * R.penaltyRate),
      bridgeLeftCents: bridgeLeft, pretaxLeftCents: Math.round(s.pretax), verdict: verdict, seppPaymentCents: sepp };
  }

  function available(pathId, p) {
    if (pathId === 'rule55') {
      if (p.retireAge < p.rules.ruleOf55.separationAge) return { ok: false, reason: 'Only from ' + p.rules.ruleOf55.separationAge + ': you would leave at ' + p.retireAge + '.' };
      if (p.rule55 === false) return { ok: false, reason: 'Turned off: the pre-tax money is not in the plan of the employer you leave.' };
    }
    if ((pathId === 'sepp' || pathId === 'ladder' || pathId === 'rule55') && p.piles.pretaxCents <= 0) return { ok: false, reason: 'No pre-tax money to reach.' };
    return { ok: true, reason: null };
  }

  /**
   * run(household, tables, opts) → Result
   *   opts.retireAge     absent: targets.retireAge
   *   opts.rule55        false: the plan is not the employer's (default true when the age allows)
   *   opts.homeEquity    'ignore' (default) | 'sell' | 'borrow'
   *   opts.age           tests
   *   value      the best verdict across paths at the middle band
   *   paths      [{ id, label, side, words, available, reason, verdict, verdicts: {p25,p50,p75}, earliestAge, ...simulate }]
   *   inputs     { age, retireAge, spendAnnualCents, piles, filingStatus, assumed, horizonYears, homeEquity, extraCashCents }
   */
  function run(household, tables, opts) {
    var h = household || {}, T = tables || {}, o = opts || {};
    var R = T.earlyAccessRules;
    if (!R) return Money.incomplete('The early-access rules are not loaded.', ['earlyAccessRules']);
    if (!T.federalBrackets) return Money.incomplete('Federal bracket table is not loaded.', ['federalBrackets']);
    var age = Money.isEntered(o.age) ? o.age : Schema.primaryAge(h);
    if (!Money.isEntered(age)) return Money.incomplete('Add your date of birth to count the years to 59 and a half.', ['dob']);
    var spend = Schema.monthlyExpensesCents(h);
    if (!Money.isOk(spend)) return Money.incomplete('Add your monthly spending to run the test.', ['monthlyExpenses']);
    var retireAge = Money.isEntered(o.retireAge) ? o.retireAge : (h.targets && Money.isEntered(h.targets.retireAge) ? h.targets.retireAge : null);
    if (retireAge === null) return Money.incomplete('Set a target retirement age in FIRE, or type one here.', ['retireAge']);
    var assumed = [];
    var fs = h.filingStatus;
    if (!fs || !T.federalBrackets.brackets[fs]) { fs = 'single'; assumed.push('filing status assumed single'); }
    var pl = piles(h);
    assumed = assumed.concat(pl.assumed);
    var he = HOME_EQUITY.indexOf(o.homeEquity) > -1 ? o.homeEquity : 'ignore';
    var extraCash = he === 'sell' ? pl.homeEquityCents : he === 'borrow' ? Math.round(pl.homeEquityCents * R.homeEquity.borrowShareOfEquity) : 0;
    var bands = T.returnBands && T.returnBands.percentiles ? T.returnBands.percentiles : null;
    var mid = Schema.resolveAssumptions(h, null, T).returnReal;
    var horizon = Math.max(0, Math.ceil(R.accessAge - retireAge));
    var savings = 0;
    if (retireAge > age) {
      var sr = Tier0 ? Tier0.savingsRate(h, T) : null;
      var basis = sr && (Money.isOk(sr.includingMatch) ? sr.includingMatch : sr.excludingMatch);
      if (basis && Money.isOk(basis)) savings = Math.max(0, basis.annualSavingsCents);
      else assumed.push('nothing saved between now and ' + retireAge + ' (no savings basis: add income and filing status)');
      if (savings > 0) assumed.push('what you save until ' + retireAge + ' lands in taxable accounts, the bridge');
    }
    var p = { rules: R, tables: T, filingStatus: fs, spendAnnualCents: spend.value * MONTHS, piles: pl, extraCashCents: extraCash, retireAge: retireAge, age: age, horizonYears: horizon, rule55: o.rule55 !== false, annualSavingsCents: savings };
    var paths = PATHS.map(function (def) {
      var av = available(def.id, p);
      var out = { id: def.id, label: def.label, side: def.side, words: def.words, available: av.ok, reason: av.reason, verdict: null, verdicts: {}, earliestAge: null };
      if (!av.ok) return out;
      var midRun = simulate(def.id, p, mid);
      Object.assign(out, midRun);
      out.verdicts = bands ? { p25: simulate(def.id, p, bands.p25).verdict, p50: midRun.verdict, p75: simulate(def.id, p, bands.p75).verdict } : { p50: midRun.verdict };
      /* the earliest retirement age that is not trapped on this path */
      for (var a = Math.ceil(age); a < R.accessAge; a++) {
        var q = Object.assign({}, p, { retireAge: a, horizonYears: Math.max(0, Math.ceil(R.accessAge - a)) });
        if (!available(def.id, q).ok) continue;
        if (simulate(def.id, q, mid).verdict !== 'Trapped') { out.earliestAge = a; break; }
      }
      return out;
    });
    var best = paths.filter(function (x) { return x.available; }).map(function (x) { return VERDICTS.indexOf(x.verdict); });
    var bestVerdict = best.length ? VERDICTS[Math.max.apply(null, best)] : null;
    var atRetire = accumulate(pl, Math.max(0, Math.round(retireAge - age)), mid, savings);
    var bridgeYears = p.spendAnnualCents > 0 ? (atRetire.cash + extraCash + atRetire.taxable + atRetire.rothBasis) / p.spendAnnualCents : null;
    return Money.ok(bestVerdict, {
      paths: paths, bestVerdict: bestVerdict, bridgeYears: bridgeYears, seasoningYears: R.conversionSeasoningYears,
      inputs: { age: age, retireAge: retireAge, spendAnnualCents: p.spendAnnualCents, piles: pl, atRetirement: { cashCents: Math.round(atRetire.cash + extraCash), taxableCents: Math.round(atRetire.taxable), rothBasisCents: Math.round(atRetire.rothBasis), pretaxCents: Math.round(atRetire.pretax) }, annualSavingsCents: savings, filingStatus: fs, assumed: assumed, horizonYears: horizon, homeEquity: he, extraCashCents: extraCash, rate: mid, bands: bands, accessAge: R.accessAge },
      referenceVersion: { earlyAccessRules: R.version, federalBrackets: T.federalBrackets.version }, confidence: R.confidence
    });
  }

  return { PATHS: PATHS, VERDICTS: VERDICTS, HOME_EQUITY: HOME_EQUITY, run: run, piles: piles, seppPaymentCents: seppPaymentCents, lifeExpectancy: lifeExpectancy };
});
