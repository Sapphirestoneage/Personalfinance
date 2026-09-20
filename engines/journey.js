/* ==========================================================================
   engines/journey.js, the map: the road, where you are on it, and the
   routes from here to the finish. DECISIONS.md D-235.
   --------------------------------------------------------------------------
   One road, three stretches, drawn from readings that already exist:

     the ladder    the ten FOO steps (engines/foo.js): done, here, ahead
     the tiers     Coast, Lean, FIRE, Chubby, Fat as rungs (Fire.tiers)
     the back half drawing it down, once the pot is the target

   "You are here" is the ladder step the next dollar belongs to and the
   tier the pot has reached, both read, never decided here.

   The routes are paces (data/journey_routes.json): the road as it is,
   the scenic route, the death march, coast then cruise. A route is a
   rule for how much of take-home is saved; the years to each rung come
   from engines/projection.js yearsToTargetCents, the one loop Tier0 and
   Fire already use, so "as it is" lands on the same FI year the
   dashboard shows. Nothing here writes. A missing baseline figure is an
   incomplete route naming the field; a pace that never arrives says so
   rather than printing a far-off year.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('../shared/money.js'), Schema: require('../shared/schema.js'), Gate: require('../shared/gate.js'),
      Tier0: require('./tier0.js'), Fire: require('./fire.js'), Foo: require('./foo.js'), Projection: require('./projection.js') };
  } else {
    var S = root.SLAF || {};
    deps = { Money: S.Money, Schema: S.Schema, Gate: S.Gate, Tier0: S.Tier0, Fire: S.Fire, Foo: S.Foo, Projection: S.Projection };
  }
  var api = factory(deps.Money, deps.Schema, deps.Gate, deps.Tier0, deps.Fire, deps.Foo, deps.Projection);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Journey = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Gate, Tier0, Fire, Foo, Projection) {
  'use strict';

  var MONTHS = 12;
  var NEVER_YEARS = 100;

  /* ---- The ladder: ten steps, and the one the next dollar belongs to ---- */
  function ladder(household, tables) {
    var rules = tables && tables.fooRules;
    if (!rules) return { steps: [], here: null, reason: 'FOO rules table is not loaded.' };
    var f = Foo.evaluate(household, tables);
    var here = f.status === 'ok' && f.placement && Money.isEntered(f.placement.step) ? f.placement.step : null;
    var byKey = {};
    (f.steps || []).forEach(function (s) { byKey[s.key] = s; });
    var steps = rules.ladder.map(function (rung) {
      var judged = byKey[rung.key];
      var state;
      if (here !== null) state = rung.step < here ? 'done' : rung.step === here ? 'here' : 'ahead';
      else if (judged && judged.status === 'met') state = 'done';
      else if (judged && judged.status === 'unknown') state = 'unknown';
      else state = 'ahead';
      return { step: rung.step, key: rung.key, label: rung.label, state: state,
        reason: judged && judged.status === 'unknown' ? judged.detail : null };
    });
    var stopped = f.stoppedAt && f.stoppedAt.status === 'unknown' ? f.stoppedAt : null;
    return { steps: steps, here: here,
      reason: here === null ? (stopped && stopped.detail ? stopped.detail : (f.placement && f.placement.reason) || f.reason || 'Not enough entered to place you on the ladder yet.') : null };
  }

  /* ---- The routes: four paces from here to every rung ------------------- */
  function yearsTo(startCents, targetCents, annualRate, annualSavingCents) {
    var r = Projection.yearsToTargetCents({ startCents: startCents, targetCents: targetCents, annualRate: annualRate,
      annualContributionCents: annualSavingCents, maxYears: NEVER_YEARS });
    if (Money.isOk(r)) return { years: r.value, alreadyThere: r.alreadyThere === true, never: false };
    return { years: null, alreadyThere: false, never: true, reason: r.reason };
  }

  function routes(household, tables, tiersResult) {
    var table = tables && tables.journeyRoutes;
    if (!table) return Money.incomplete('The routes table is not loaded.', ['journeyRoutes']);
    var rungs = tiersResult && tiersResult.rungs ? tiersResult.rungs : [];
    if (!rungs.length) return Money.incomplete(tiersResult && tiersResult.reason ? tiersResult.reason : 'Add your monthly expenses to draw the road.', (tiersResult && tiersResult.missing) || ['monthlyExpenses']);
    var invested = Schema.investmentsCents(household);
    if (!Money.isOk(invested)) return Money.incomplete('Add your investment balance to place you on the road.', ['investments']);
    var takeHome = Schema.takeHomeAnnualCents(household, tables);
    if (!Money.isOk(takeHome)) return Money.incomplete('Add your income and filing status to pace the routes.', takeHome.missing && takeHome.missing.length ? takeHome.missing : ['grossAnnualIncome', 'filingStatus']);
    var spend = Schema.monthlyExpensesCents(household);
    if (!Money.isOk(spend)) return Money.incomplete('Add your monthly expenses to pace the routes.', ['monthlyExpenses']);
    var sr = Tier0.savingsRate(household, tables);
    var basis = Money.isOk(sr.includingMatch) ? sr.includingMatch : sr.excludingMatch;
    if (!Money.isOk(basis)) return Money.incomplete(basis.reason, basis.missing);
    var a = Schema.resolveAssumptions(household, null, tables);
    var rate = a.expectedReturnRate;
    var currentSaving = basis.annualSavingsCents;
    var standard = rungs.filter(function (r) { return r.id === 'standard'; })[0] || null;
    var coast = rungs.filter(function (r) { return r.id === 'coast'; })[0] || null;

    var out = table.routes.map(function (spec) {
      var route = { id: spec.id, label: spec.label, line: spec.line, pace: spec.pace, annualSavingCents: null, monthlyLivingCents: null,
        rough: false, note: null, eta: {}, yearsToFire: null, never: false, reason: null };
      var saving;
      if (spec.pace === 'current' || spec.pace === 'coast') saving = currentSaving;
      else if (spec.pace === 'share') {
        /* Half of nothing is nothing, and half of a shortfall is not a
           slower road: with no saving today the scenic route is the road
           as it is, and says so. */
        if (currentSaving <= 0) { saving = currentSaving; route.note = 'Nothing is saved today, so there is no half to keep back; this is the road as it is.'; }
        else saving = Math.round(currentSaving * spec.share);
      }
      else if (spec.pace === 'floor') {
        var floor = Schema.fatNeedsCents(household);
        var floorCents;
        if (Money.isOk(floor)) floorCents = floor.value * MONTHS;
        else { floorCents = Math.round(spend.value * MONTHS * table.floorShareFallback); route.rough = true;
          route.note = 'The floor is ' + Math.round(table.floorShareFallback * 100) + '% of today’s spending until food, a roof and getting around are typed in Expenses.'; }
        saving = takeHome.value - floorCents;
        /* Already living at or under the floor: the march saves what the
           road as it is saves, and says so, rather than a smaller number. */
        if (saving < currentSaving) { saving = currentSaving; route.note = 'You already spend no more than the floor; this is the road as it is.'; }
      }
      route.annualSavingCents = saving;
      route.monthlyLivingCents = Math.round((takeHome.value - saving) / MONTHS);
      rungs.forEach(function (r) {
        route.eta[r.id] = yearsTo(invested.value, r.targetCents, rate, saving);
      });
      if (spec.pace === 'coast' && coast) {
        /* Reach the Coast rung at today's pace, then stop: the finish is the
           coast target age, so the years to FIRE are the years to that age. */
        var t = coast.progress && Money.isOk(coast.progress) ? Fire.calculateFIRE(household, tables, { variantId: 'coast' }) : null;
        var reachCoast = route.eta.coast;
        route.stopSavingIn = reachCoast.years;
        if (t && Money.isOk(t) && Money.isEntered(t.yearsOfGrowth)) {
          route.arriveAge = t.coastTargetAge;
          if (reachCoast.never) { route.yearsToFire = null; route.never = true; route.reason = reachCoast.reason; }
          else if (reachCoast.years > t.yearsOfGrowth) { route.yearsToFire = null; route.never = true; route.reason = 'At today’s pace the Coast rung comes after age ' + t.coastTargetAge + ', so there is nothing to coast on.'; }
          else { route.yearsToFire = t.yearsOfGrowth; route.eta.standard = { years: t.yearsOfGrowth, alreadyThere: false, never: false, coasted: true }; }
        } else { route.yearsToFire = null; route.never = true; route.reason = 'Coast needs a date of birth.'; }
      } else if (standard) {
        var s = route.eta.standard;
        route.yearsToFire = s.never ? null : s.years;
        route.never = s.never; route.reason = s.never ? s.reason : null;
      }
      return route;
    });
    var asIs = out.filter(function (r) { return r.id === 'as-is'; })[0] || null;
    out.forEach(function (r) {
      r.deltaYears = asIs && r !== asIs && r.yearsToFire !== null && asIs.yearsToFire !== null ? asIs.yearsToFire - r.yearsToFire : null;   /* positive = sooner */
    });
    /* Soonest first; a route that never arrives goes last, in file order. */
    var ranked = out.map(function (r, i) { return [r, i]; }).sort(function (x, y) {
      var a1 = x[0].yearsToFire === null ? 1e9 : x[0].yearsToFire, b1 = y[0].yearsToFire === null ? 1e9 : y[0].yearsToFire;
      return a1 - b1 || x[1] - y[1];
    }).map(function (p) { return p[0]; });
    return Money.ok(ranked.length, { routes: ranked, asIs: asIs, annualRate: rate, takeHomeAnnualCents: takeHome.value, investmentsCents: invested.value, referenceVersion: table.version });
  }

  /* ---- The map ---------------------------------------------------------- */
  function map(household, tables, opts) {
    var h = household || {};
    var situation = Gate ? Gate.situationOf(h) : null;
    var lad = ladder(h, tables);
    var tiers = Fire.tiers(h, tables, opts);
    var rungs = tiers.rungs || [];
    var backHalf = { id: 'back-half', label: 'The back half', state: situation === 'retired' ? 'here' : (Money.isOk(tiers) && !tiers.next ? 'here' : 'ahead') };
    return {
      ladder: lad,
      tiers: tiers,
      backHalf: backHalf,
      here: { step: lad.here, tier: Money.isOk(tiers) && tiers.current ? tiers.current.id : null, situation: situation },
      routes: routes(h, tables, tiers),
      rungCount: rungs.length
    };
  }

  return { ladder: ladder, routes: routes, map: map, NEVER_YEARS: NEVER_YEARS };
});
