/* ==========================================================================
   engines/estate.js — Estate Basics.
   DECISIONS.md D-098 (the tranche rooms on the template).
   --------------------------------------------------------------------------
   Three yes/no facts — beneficiaries named, a will, a power of attorney —
   and what the household owns, read against data/estate_basics.json, which
   says which asset category usually passes by beneficiary designation,
   by title, or by will. From those, one number: how many of the three are
   in place, and the dollars that would pass by the state's rules rather
   than the person's choice:

     atRisk = Σ assets that pass by will,        when willExists       !== true
            + Σ assets that pass by beneficiary, when beneficiariesSet !== true

   Unanswered counts as not in place, but is SAID as "not answered", never
   as "no" — empty ≠ zero, and null ≠ false.

   Nothing here is legal advice. Jointly held property is not modelled:
   assets carry no title flag, so nothing maps to the "title" route and the
   caller says so in its assumptions.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('../shared/money.js'), Schema: require('../shared/schema.js') };
  } else {
    var S = root.SLAF || {};
    deps = { Money: S.Money, Schema: S.Schema };
  }
  var api = factory(deps.Money, deps.Schema);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Estate = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema) {
  'use strict';

  var FACTS = [
    { id: 'beneficiariesSet', label: 'Beneficiaries named' },
    { id: 'willExists',       label: 'A will' },
    { id: 'poaExists',        label: 'A power of attorney' }
  ];
  var ROUTES = ['beneficiary', 'title', 'will', 'state'];
  var TOTAL_FACTS = FACTS.length;

  /* true / false / null. Anything that is not a boolean is "not answered". */
  function tri(v) { return typeof v === 'boolean' ? v : null; }

  /** The three facts, each with its answer and how to say it. */
  function facts(household) {
    var e = (household && household.estate) || {};
    return FACTS.map(function (f) {
      var v = tri(e[f.id]);
      return { id: f.id, label: f.label, value: v, state: v === true ? 'yes' : v === false ? 'no' : 'unanswered',
        said: v === true ? 'in place' : v === false ? 'not yet' : 'not answered' };
    });
  }

  /** category → route, from the table. Unknown category: 'will' (the default road). */
  function routeOf(category, table) {
    var rows = (table && table.categories) || [];
    for (var i = 0; i < rows.length; i++) if (rows[i].category === category) return rows[i].passesBy;
    return 'will';
  }

  /** Dollars by the route they would take, from the household's assets. */
  function byRoute(household, table) {
    var sums = {}, counted = 0;
    ROUTES.forEach(function (r) { sums[r] = 0; });
    Schema.aggregatableAssets(household).forEach(function (a) {
      if (!Money.isEntered(a.valueCents)) return;
      var r = routeOf(a.category, table);
      if (!(r in sums)) r = 'will';
      sums[r] += a.valueCents;
      counted++;
    });
    return { sums: sums, counted: counted };
  }

  /**
   * review(household, tables) → Result
   *   value             how many of the three facts are in place (0–3)
   *   inPlace, total    the same, and 3
   *   facts             [{ id, label, value, state, said }]
   *   unanswered        how many are null
   *   assets            Result: ok(total cents) or incomplete when nothing is entered
   *   routes            { beneficiary, title, will, state } cents — where each
   *                     dollar would go given the facts as answered
   *   passesBy          { beneficiary, title, will } cents — where each dollar
   *                     goes by the table alone, before the facts
   *   atRiskCents       what would pass by the state's rules (routes.state)
   *   chosenCents       what passes the way the person chose
   *   zone              'good' | 'watch' | 'out' | null
   *   guardianLine      the table's line, when someone depends on you and
   *                     there is no will in place; else null
   */
  function review(household, tables) {
    var table = tables && tables.estateBasics;
    if (!table || !Array.isArray(table.categories)) return Money.incomplete('The estate table is not loaded.', ['estateBasics']);
    var h = household || {};
    var fs = facts(h);
    var byId = {};
    fs.forEach(function (f) { byId[f.id] = f; });
    var inPlace = fs.filter(function (f) { return f.value === true; }).length;
    var unanswered = fs.filter(function (f) { return f.value === null; }).length;

    var split = byRoute(h, table);
    var assets = split.counted > 0 ? Money.ok(split.sums.beneficiary + split.sums.title + split.sums.will)
      : Money.incomplete('Add what you own in Start Here to see what would pass by the state’s rules.', ['assets']);

    var routes = { beneficiary: 0, title: split.sums.title, will: 0, state: 0 };
    if (byId.willExists.value === true) routes.will = split.sums.will; else routes.state += split.sums.will;
    if (byId.beneficiariesSet.value === true) routes.beneficiary = split.sums.beneficiary; else routes.state += split.sums.beneficiary;

    var atRisk = routes.state;
    var total = Money.isOk(assets) ? assets.value : 0;
    var zone = inPlace === TOTAL_FACTS ? 'good' : inPlace > 0 ? 'watch' : (Money.isOk(assets) && total > 0 ? 'out' : null);

    var deps = Schema.createDependents(h.dependents);
    var guardianLine = deps && deps.length > 0 && byId.willExists.value !== true ? (table.guardian || null) : null;

    return Money.ok(inPlace, {
      inPlace: inPlace, total: TOTAL_FACTS, facts: fs, unanswered: unanswered,
      assets: assets, routes: routes, passesBy: { beneficiary: split.sums.beneficiary, title: split.sums.title, will: split.sums.will },
      atRiskCents: atRisk, chosenCents: total - atRisk,
      zone: zone, guardianLine: guardianLine
    });
  }

  return { FACTS: FACTS, ROUTES: ROUTES, facts: facts, routeOf: routeOf, byRoute: byRoute, review: review };
});
