/* ==========================================================================
   engines/reachable.js — the reachable money waterfall. DECISIONS.md D-212 (H4).
   --------------------------------------------------------------------------
   An amount and a "by when": the order to pull it and what each dollar
   costs on the way out.

     cash            free
     Roth basis      free (contributions come out any time); needs the
                     basis row, rough while it is missing
     taxable         tax on the gains only, at the capital gains rate
     pre-tax         the marginal federal rate plus the state rate, plus
                     the 10% penalty under 59½
     Roth earnings   the same as pre-tax while under 59½; free after
     home equity     shown, never counted

   Headline: the total reachable in an emergency and the true cost of
   pulling it. Every rate comes from the tax tables through engines/tax.js
   and the access ages from data/access_rules.json; a test may hand in
   fixed rates (opts.rates) to check the arithmetic by hand.

     Reachable.waterfall(h, tables, { amountCents, rates }) →
       { status, tiers, pulls, reachableCents, costCents, homeEquityCents,
         shortfallCents, rough, missing, assumed }
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('../shared/money.js'), Schema: require('../shared/schema.js'), Tax: require('./tax.js') };
  } else {
    deps = { Money: root.SLAF && root.SLAF.Money, Schema: root.SLAF && root.SLAF.Schema, Tax: root.SLAF && root.SLAF.Tax };
  }
  var api = factory(deps.Money, deps.Schema, deps.Tax);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Reachable = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Tax) {
  'use strict';
  var PENALTY = 0.10;                 /* IRC 72(t): early distribution penalty */
  function isRoth(a) { return a.taxCharacter === 'roth'; }
  function isPretax(a) { return a.taxCharacter === 'pretax' || (!a.taxCharacter && a.category === 'retirement'); }
  function isTaxable(a) { return a.taxCharacter === 'taxable' || (!a.taxCharacter && a.category === 'investment'); }
  function isCash(a) { return a.taxCharacter === 'cash' || (!a.taxCharacter && a.category === 'cash'); }
  function isProperty(a) { return a.taxCharacter === 'property' || (!a.taxCharacter && a.category === 'property'); }

  /* The rates: current-year marginal federal, the state at its effective
     share of taxable income, the capital gains rate, the penalty. */
  function ratesOf(household, tables, given) {
    if (given) return Object.assign({ marginalRate: 0, stateRate: 0, capitalGainsRate: 0, penaltyRate: PENALTY, source: 'given' }, given);
    var out = { marginalRate: null, stateRate: null, capitalGainsRate: null, penaltyRate: PENALTY, source: 'tax tables', missing: [] };
    var est = Tax && Tax.estimate ? Tax.estimate(household, tables) : null;
    if (est && Money.isOk(est)) {
      out.marginalRate = est.marginalRate;
      /* The rate on the first dollar of gains above this year's taxable
         income, not the rate on gains already declared (usually none). */
      var cg = Tax.capitalGainsTax && tables && tables.federalBrackets ? Tax.capitalGainsTax(tables.federalBrackets, 100, est.taxableIncomeCents, household.filingStatus) : null;
      out.capitalGainsRate = cg && Money.isOk(cg) ? cg.marginalRate : est.capitalGainsRate;
      out.stateRate = est.stateIncluded && est.taxableIncomeCents > 0 ? est.stateCents / est.taxableIncomeCents : 0;
      out.stateIncluded = !!est.stateIncluded;
    } else out.missing = (est && est.missing) || ['grossAnnualIncome', 'filingStatus'];
    return out;
  }
  function waterfall(household, tables, opts) {
    var h = household || {}, T = tables || {}, o = opts || {};
    var rules = T.accessRules || null;
    var age = Schema.primaryAge(h);
    var accessAge = rules && rules.byTaxCharacter && rules.byTaxCharacter.pretax ? rules.byTaxCharacter.pretax.accessAge : 59.5;
    var under = Money.isEntered(age) ? age < accessAge : null;   /* null: age unknown */
    var rates = ratesOf(h, T, o.rates || null);
    var missing = [], assumed = [], rough = false;
    if (rates.missing && rates.missing.length) { rates.missing.forEach(function (m) { missing.push(m); }); }
    if (under === null) { missing.push('dob'); assumed.push('under 59½ (no date of birth)'); under = true; rough = true; }
    var assets = (h.assets || []).filter(function (a) { return Money.isEntered(a.valueCents) && a.valueCents > 0; });
    var tiers = [];
    /* cash */
    var cash = assets.filter(isCash).reduce(function (s, a) { return s + a.valueCents; }, 0);
    tiers.push({ id: 'cash', label: 'Cash', availableCents: cash, costRate: 0, costCents: 0, free: true, rough: false, note: 'Free. It is already money.' });
    /* Roth basis and earnings */
    var roth = assets.filter(isRoth);
    var basisKnown = roth.filter(function (a) { return Money.isEntered(a.costBasisCents); });
    var basisCents = basisKnown.reduce(function (s, a) { return s + Math.min(a.costBasisCents, a.valueCents); }, 0);
    var rothMissing = roth.filter(function (a) { return !Money.isEntered(a.costBasisCents); });
    if (roth.length) {
      if (rothMissing.length) { rough = true; rothMissing.forEach(function (a) { missing.push('assetCostBasis:' + (a.label || 'Roth')); }); }
      tiers.push({ id: 'rothBasis', label: 'Roth contributions', availableCents: basisCents, costRate: 0, costCents: 0, free: true, rough: rothMissing.length > 0,
        note: 'Free: contributions come out any time, tax and penalty free.' + (rothMissing.length ? ' Rough: ' + rothMissing.length + ' Roth' + (rothMissing.length === 1 ? ' has' : 's have') + ' no contributions figure yet, so only what is known counts.' : '') });
    }
    /* taxable: tax on the gains only */
    var taxable = assets.filter(isTaxable);
    if (taxable.length) {
      var gains = 0, basisAssumed = false;
      taxable.forEach(function (a) {
        var b = Money.isEntered(a.costBasisCents) ? a.costBasisCents : Math.round(a.valueCents * (Schema.TAXABLE_BASIS_SHARE || 0.6));
        if (!Money.isEntered(a.costBasisCents)) basisAssumed = true;
        gains += Math.max(0, a.valueCents - b);
      });
      var tv = taxable.reduce(function (s, a) { return s + a.valueCents; }, 0);
      var cgRate = Money.isEntered(rates.capitalGainsRate) ? rates.capitalGainsRate : null;
      var tcost = cgRate === null ? null : Math.round(gains * cgRate);
      if (basisAssumed) { rough = true; assumed.push('taxable basis at ' + Math.round((Schema.TAXABLE_BASIS_SHARE || 0.6) * 100) + '% of value'); }
      tiers.push({ id: 'taxable', label: 'Taxable accounts', availableCents: tv, costRate: cgRate === null ? null : (tv ? tcost / tv : 0), costCents: tcost, free: false, rough: basisAssumed || cgRate === null, gainsCents: gains,
        note: cgRate === null ? 'Tax on the gains only, once the capital gains rate is known (income and filing status).' : 'Tax on the gains only: ' + Money.formatCents(gains) + ' of gains at ' + Math.round(cgRate * 100) + '%.' + (basisAssumed ? ' Rough: a cost basis is missing, so the gains are assumed.' : '') });
    }
    /* pre-tax: marginal federal + state + penalty under 59½ */
    var pretax = assets.filter(isPretax);
    var pretaxRate = Money.isEntered(rates.marginalRate) ? rates.marginalRate + (rates.stateRate || 0) + (under ? rates.penaltyRate : 0) : null;
    if (pretax.length) {
      var pv = pretax.reduce(function (s, a) { return s + a.valueCents; }, 0);
      tiers.push({ id: 'pretax', label: 'Pre-tax accounts (401k, IRA)', availableCents: pv, costRate: pretaxRate, costCents: pretaxRate === null ? null : Math.round(pv * pretaxRate), free: false, rough: pretaxRate === null || under === true && assumed.length > 0,
        note: pretaxRate === null ? 'Taxed as income plus the penalty under 59½, once the marginal rate is known.' : 'Every dollar is income: ' + Math.round(rates.marginalRate * 100) + '% federal' + (rates.stateRate ? ' plus ' + (Math.round(rates.stateRate * 1000) / 10) + '% state' : '') + (under ? ' plus the 10% penalty under ' + accessAge : ', no penalty from ' + accessAge) + '.' });
    }
    if (roth.length) {
      var earnings = roth.reduce(function (s, a) { return s + Math.max(0, a.valueCents - (Money.isEntered(a.costBasisCents) ? Math.min(a.costBasisCents, a.valueCents) : 0)); }, 0);
      var eRate = under ? pretaxRate : 0;
      tiers.push({ id: 'rothEarnings', label: 'Roth earnings', availableCents: earnings, costRate: eRate, costCents: eRate === null ? null : Math.round(earnings * eRate), free: !under, rough: rothMissing.length > 0 || (under && pretaxRate === null),
        note: under ? 'The growth is taxed as income plus the penalty until ' + accessAge + '.' : 'Free from ' + accessAge + '.' });
    }
    /* home equity: shown, never counted */
    var home = assets.filter(isProperty).reduce(function (s, a) { return s + a.valueCents; }, 0);
    var mortgages = (h.debts || []).filter(function (d) { return d.type === 'mortgage' && Money.isEntered(d.balanceCents); }).reduce(function (s, d) { return s + d.balanceCents; }, 0);
    var homeEquity = home ? Math.max(0, home - mortgages) : 0;

    /* The order: cheapest dollar first; a tier with no known cost waits last. */
    var ordered = tiers.slice().sort(function (a, b) { return (a.costRate === null ? 9 : a.costRate) - (b.costRate === null ? 9 : b.costRate); });
    var reachable = 0, cost = 0, allKnown = true;
    ordered.forEach(function (t) { reachable += t.availableCents; if (t.costCents === null) allKnown = false; else cost += t.costCents; });
    var pulls = [], left = Money.isEntered(o.amountCents) ? o.amountCents : null, pullCost = 0;
    if (left !== null) {
      ordered.forEach(function (t) {
        if (left <= 0 || !t.availableCents) return;
        var take = Math.min(left, t.availableCents);
        var c = t.costRate === null ? null : Math.round(take * t.costRate);
        pulls.push({ tier: t.id, label: t.label, cents: take, costCents: c, netCents: c === null ? null : take - c, costRate: t.costRate });
        if (c !== null) pullCost += c;
        left -= take;
      });
    }
    return { status: tiers.length ? 'ok' : 'incomplete', tiers: ordered, pulls: pulls, reachableCents: reachable, costCents: allKnown ? cost : null, netCents: allKnown ? reachable - cost : null,
      pullCostCents: left !== null ? pullCost : null, shortfallCents: left !== null ? Math.max(0, left) : null, homeEquityCents: homeEquity, homeShown: home > 0,
      rough: rough || !allKnown, missing: missing, assumed: assumed, rates: rates, under: under, accessAge: accessAge };
  }
  return { waterfall: waterfall, PENALTY: PENALTY };
});
