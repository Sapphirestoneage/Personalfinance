/* ==========================================================================
   engine/accounts.js, the balances the projection carries from year to
   year, by account type and owner. D-341.
   --------------------------------------------------------------------------
   init(household, facts, A) reads household.assets[] and household.debts[]
   once (shared/schema.js accountType and orientationOf decide the type)
   into:
     cash                       one pool
     taxable  { value, basis }  one pool; basis from costBasisCents or the
                                basis-share assumption, flagged
     pretax401k[i], pretaxIra[i], roth401k[i], hsa[i]   one per adult
     rothIra[i] { basis, layers: [{ year, cents }], earnings }
                                contributions are basis; each conversion
                                is its own dated layer; the rest is earnings
     home { value }, debts [{ id, balance, rate, minPaymentCents, type }]
   grow(state, A) applies one year of return to every balance, each at
   the rate for its kind. Taxable grows by the return less the dividend
   yield (the dividends are paid to cash and taxed in the year).
   totals(state) is what a row reports.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) deps = { Schema: require('../shared/schema.js'), Money: require('../shared/money.js'), Facts: require('./facts.js') };
  else deps = { Schema: root.SLAF && root.SLAF.Schema, Money: root.SLAF && root.SLAF.Money, Facts: root.SLAF && root.SLAF.Engine && root.SLAF.Engine.Facts };
  var api = factory(deps.Schema, deps.Money, deps.Facts);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Engine = root.SLAF.Engine || {}; root.SLAF.Engine.Accounts = api; }
})(typeof self !== 'undefined' ? self : null, function (Schema, Money, Facts) {
  'use strict';

  function entered(v) { return Money.isEntered(v); }
  var K401 = { '401k': 1, '403b': 1, '457b': 1, tsp: 1, old_401k: 1, pension: 1 };
  var IRA = { traditional_ira: 1, sep_ira: 1, simple_ira: 1 };

  function emptyPerson() { return 0; }
  function init(household, facts, A) {
    var h = household || {};
    var n = facts.people.length;
    var s = { cash: 0, taxable: { value: 0, basis: 0, basisAssumed: false }, pretax401k: [], pretaxIra: [], roth401k: [], hsa: [], rothIra: [],
      home: { value: 0 }, vehicles: 0, debts: [], warnings: [] };
    for (var i = 0; i < n; i++) { s.pretax401k.push(0); s.pretaxIra.push(0); s.roth401k.push(0); s.hsa.push(0); s.rothIra.push({ basis: 0, layers: [], earnings: 0 }); }
    Schema.aggregatableAssets(h).forEach(function (a) {
      if (!entered(a.valueCents)) return;
      var v = a.valueCents, owner = Facts.personIndex(facts, a.ownerIds), t = a.accountType || null;
      var o = Schema.orientationOf(a).orientation;
      if (a.category === 'real_estate') { s.home.value += v; return; }
      if (a.category === 'vehicle') { s.vehicles += v; return; }
      if (a.category === 'cash' || o === 'cash' || (t && /^(checking|savings|hysa|money_market|cd)$/.test(t))) { s.cash += v; return; }
      if (o === 'hsa') { s.hsa[owner] += v; return; }
      if (o === 'roth') {
        if (t === 'roth_401k') { s.roth401k[owner] += v; return; }
        var basis = entered(a.costBasisCents) ? Math.min(v, a.costBasisCents) : 0;
        s.rothIra[owner].basis += basis; s.rothIra[owner].earnings += v - basis;
        if (!entered(a.costBasisCents)) s.warnings.push('No contribution basis typed for ' + (a.label || 'a Roth IRA') + ': all of it counts as earnings, reachable only after 59 and a half.');
        return;
      }
      if (o === 'pretax') {
        if (t && IRA[t]) s.pretaxIra[owner] += v; else s.pretax401k[owner] += v;
        return;
      }
      if (o === 'taxable' || a.category === 'investment' || a.category === 'retirement') {
        s.taxable.value += v;
        if (entered(a.costBasisCents)) s.taxable.basis += Math.min(v, a.costBasisCents);
        else { s.taxable.basis += Math.round(v * A.taxableBasisShare); s.taxable.basisAssumed = true; }
        return;
      }
      if (o === null && a.category !== 'other' && !/^(529|daf|business)$/.test(a.taxCharacter || '')) {
        /* No account type and no tax character: counted as taxable, and said so. */
        s.taxable.value += v; s.taxable.basis += Math.round(v * A.taxableBasisShare); s.taxable.basisAssumed = true;
        s.warnings.push((a.label || 'An account') + ' has no account type yet: counted as a taxable account.');
        return;
      }
      /* 529, DAF, business, other: outside the plan, in net worth only. */
      s.vehicles += v;
    });
    facts.debts.forEach(function (d) {
      s.debts.push({ id: d.id, label: d.label, type: d.type, balance: d.balanceCents, rate: d.rate, minPaymentCents: d.minPaymentCents, owner: d.owner });
    });
    return s;
  }

  function sum(arr) { var t = 0; for (var i = 0; i < arr.length; i++) t += arr[i]; return t; }
  function rothTotal(r) { return r.basis + r.earnings + r.layers.reduce(function (t, l) { return t + l.cents; }, 0); }

  function totals(state) {
    var rothIra = state.rothIra.map(rothTotal);
    var mortgage = state.debts.filter(function (d) { return d.type === 'mortgage'; }).reduce(function (t, d) { return t + d.balance; }, 0);
    var debts = {};
    var debtTotal = 0;
    state.debts.forEach(function (d) { debts[d.id] = Math.round(d.balance); debtTotal += d.balance; });
    var invested = state.taxable.value + sum(state.pretax401k) + sum(state.pretaxIra) + sum(state.roth401k) + sum(rothIra) + sum(state.hsa);
    return {
      cashCents: Math.round(state.cash),
      taxableCents: Math.round(state.taxable.value), taxableBasisCents: Math.round(state.taxable.basis),
      pretax401kCents: Math.round(sum(state.pretax401k)), pretaxIraCents: Math.round(sum(state.pretaxIra)),
      roth401kCents: Math.round(sum(state.roth401k)), rothIraCents: Math.round(sum(rothIra)),
      rothIraBasisCents: Math.round(sum(state.rothIra.map(function (r) { return r.basis; }))),
      rothConversionLayers: state.rothIra.reduce(function (all, r, i) { return all.concat(r.layers.map(function (l) { return { owner: i, year: l.year, cents: Math.round(l.cents), seasonedFrom: l.year + 5 }; })); }, []),
      hsaCents: Math.round(sum(state.hsa)),
      homeValueCents: Math.round(state.home.value), homeEquityCents: Math.round(state.home.value - mortgage),
      vehiclesCents: Math.round(state.vehicles),
      debts: debts, debtTotalCents: Math.round(debtTotal),
      investedCents: Math.round(invested),
      liquidCents: Math.round(state.cash + invested),
      netWorthCents: Math.round(state.cash + invested + state.home.value + state.vehicles - debtTotal)
    };
  }

  /** One year of growth; returns the growth by kind (the interest on cash
      and the dividends are income, reported by the caller). */
  function grow(state, A, rates) {
    var r = rates || {};
    var inv = entered(r.invested) ? r.invested : A.returnNominal;
    var priceOnly = inv - A.dividendYield;
    var g = { cash: 0, taxable: 0, pretax: 0, roth: 0, hsa: 0, home: 0 };
    g.cash = state.cash * A.cashReturnNominal; state.cash += g.cash;
    g.taxable = state.taxable.value * priceOnly; state.taxable.value += g.taxable;
    for (var i = 0; i < state.pretax401k.length; i++) {
      var a = state.pretax401k[i] * inv, b = state.pretaxIra[i] * inv, c = state.roth401k[i] * inv, d = state.hsa[i] * inv;
      state.pretax401k[i] += a; state.pretaxIra[i] += b; state.roth401k[i] += c; state.hsa[i] += d;
      g.pretax += a + b; g.roth += c; g.hsa += d;
      var e = rothTotal(state.rothIra[i]) * inv;
      state.rothIra[i].earnings += e; g.roth += e;
    }
    g.home = state.home.value * A.homeAppreciationNominal; state.home.value += g.home;
    state.vehicles = state.vehicles * (1 - 0.1);
    return g;
  }

  function clone(state) { return JSON.parse(JSON.stringify(state)); }

  return { init: init, totals: totals, grow: grow, clone: clone, rothTotal: rothTotal, sum: sum, K401: K401, IRA: IRA };
});
