/* ==========================================================================
   engines/buckets.js — Time Buckets: a price on each decade you have left,
   set against the money there will be when it starts.
   DECISIONS.md D-101 (schema); the room's own entry follows.
   --------------------------------------------------------------------------
   Die With Zero's exercise: list what you want to do in each decade of the
   life you have left, price it, and set it against the net worth projected
   for that decade — so the question becomes "can the fifties afford the
   fifties" rather than "will there be enough at the end". The projection is
   Projection.pathCents, the one compound loop every growth chart draws, run
   ONCE from now to the plan age at the household's real return and its
   current yearly savings (Tier0.savingsRate, the including-match figure
   when there is one). Money planned for a decade is read as spent at its
   start, so each decade is judged on the plan accumulated up to and
   including it against the balance at its first year.

   Nothing here is a second copy of a formula: the savings basis is Tier 0's,
   the FI number is Tier 0's, the climb is projection.js's.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('../shared/money.js'), Schema: require('../shared/schema.js'), Tier0: require('./tier0.js'), Projection: require('./projection.js') };
  } else {
    var S = root.SLAF || {};
    deps = { Money: S.Money, Schema: S.Schema, Tier0: S.Tier0, Projection: S.Projection };
  }
  var api = factory(deps.Money, deps.Schema, deps.Tier0, deps.Projection);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Buckets = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Tier0, Projection) {
  'use strict';

  /* The last decade planned for starts before this age: 30 → 90s, seven
     decades at most. A convention, not a life expectancy. */
  var PLAN_AGE = 95;
  /* With no date of birth the decades are laid out from the thirties — the
     first decade the ideas table prices as more than a shoestring — and the
     room says so. */
  var START_DECADE_WITHOUT_AGE = 30;
  /* The one experience the room's money boxes write: a decade's price with
     no itemised list behind it, or the remainder on top of one. */
  var PLANNED_LABEL = 'Planned';
  var MONTHS = 12;

  function label(decade) { return decade + 's'; }
  function inYour(decade) { return 'In your ' + label(decade); }

  function isPlannedRow(x) { return x && x.label === PLANNED_LABEL; }
  function pricedCents(experiences) {
    return (experiences || []).reduce(function (t, x) { return t + (Money.isEntered(x.costCents) ? x.costCents : 0); }, 0);
  }

  /** The decades from the one you are in (or the thirties) to the plan age. */
  function decades(household, opts) {
    var h = household || {};
    var age = Schema.primaryAge(h);
    var known = Money.isEntered(age);
    var planAge = (opts && Money.isEntered(opts.planAge)) ? opts.planAge : PLAN_AGE;
    var first = known ? Math.floor(age / 10) * 10 : START_DECADE_WITHOUT_AGE;
    var stored = {};
    (h.timeBuckets || []).forEach(function (b) { if (Money.isEntered(b.decade)) stored[b.decade] = b; });
    var out = [], past = 0;
    Object.keys(stored).forEach(function (k) { if (Number(k) < first) past += pricedCents(stored[k].experiences); });
    for (var d = first; d < planAge; d += 10) {
      var b = stored[d] || { decade: d, experiences: [] };
      var xs = b.experiences || [];
      out.push({
        decade: d, label: label(d), from: d, to: d + 9,
        current: known && age >= d && age < d + 10,
        yearsUntil: known ? Math.max(0, d - age) : null,
        experiences: xs,
        plannedCents: pricedCents(xs),
        itemisedCount: xs.filter(function (x) { return !isPlannedRow(x) && Money.isEntered(x.costCents); }).length,
        unpricedCount: xs.filter(function (x) { return !Money.isEntered(x.costCents); }).length
      });
    }
    return Money.ok(out.length, { decades: out, age: known ? age : null, ageAssumed: !known, planAge: planAge, pastCents: past });
  }

  /** Everything priced, across every decade stored — the ownership row's figure. */
  function totalPlannedCents(household) {
    return ((household && household.timeBuckets) || []).reduce(function (t, b) { return t + pricedCents(b.experiences); }, 0);
  }

  /** The ideas table's proposals for a decade, with their sum. */
  function ideasFor(decade, tables) {
    var t = tables && tables.bucketIdeas;
    var items = (t && t.decades && t.decades[String(decade)]) || [];
    return { items: items, totalCents: items.reduce(function (s, i) { return s + (Money.isEntered(i.cents) ? i.cents : 0); }, 0), table: t || null };
  }

  /**
   * The write behind a decade's money box, as a pure function on the stored
   * list: `cents` null or 0 clears the decade; with nothing itemised (no
   * experience but the 'Planned' one) the decade becomes one 'Planned'
   * experience at that price; with an itemised list the list is kept and a
   * 'Planned' remainder is added or updated so the decade's total equals the
   * typed value — unless the typed value is below the list's own total, in
   * which case there is no remainder that fits and the price replaces the
   * list. Returns a new list; never touches the one handed in.
   */
  function setDecadeCents(timeBuckets, decade, cents) {
    var others = (timeBuckets || []).filter(function (b) { return b.decade !== decade; }).map(function (b) { return Schema.createTimeBucket(b); });
    var current = ((timeBuckets || []).filter(function (b) { return b.decade === decade; })[0] || {}).experiences || [];
    if (!Money.isEntered(cents) || cents <= 0) return others;
    var itemised = current.filter(function (x) { return !isPlannedRow(x); });
    var itemisedCents = pricedCents(itemised);
    var keep = itemised.length && cents >= itemisedCents ? itemised.slice() : [];
    var remainder = cents - pricedCents(keep);
    if (remainder > 0) {
      var planned = current.filter(isPlannedRow)[0];
      keep.push(Schema.createExperience({ id: planned ? planned.id : undefined, label: PLANNED_LABEL, costCents: remainder, year: null }));
    }
    var next = others.concat([Schema.createTimeBucket({ decade: decade, experiences: keep })]);
    next.sort(function (a, b) { return a.decade - b.decade; });
    return next;
  }

  /**
   * Investments projected to the start of each decade — ONE pathCents run
   * from now to the plan age at the real return, contributing the current
   * yearly savings (Tier 0's including-match figure when there is one) a
   * twelfth a month until the stop age when one is set, else throughout —
   * with each decade's cumulative plan set against the balance there.
   */
  function affordability(household, tables, opts) {
    var dd = decades(household, opts);
    if (!Money.isOk(dd)) return dd;
    if (dd.ageAssumed) return Money.incomplete('Add your date of birth to project the money for each decade.', ['dob']);
    var inv = Schema.investmentsCents(household);
    var rates = Tier0.savingsRate(household, tables);
    var basis = Money.isOk(rates.includingMatch) ? rates.includingMatch : rates.excludingMatch;
    if (!Money.isOk(inv)) return Money.incomplete('Add your investments to project the decades.', ['investments']);
    if (!Money.isOk(basis)) return Money.incomplete('Add your income and spending to project the decades: ' + basis.reason, basis.missing || ['grossAnnualIncome', 'monthlyExpenses']);
    var a = Schema.resolveAssumptions(household);
    var stopAge = Money.isEntered((household.targets || {}).retireAge) ? household.targets.retireAge : null;
    var years = dd.planAge - dd.age;
    var path = Projection.pathCents({
      startCents: inv.value, monthlyContributionCents: Math.round(basis.annualSavingsCents / MONTHS),
      annualRate: a.returnReal, years: years,
      contributeYears: stopAge === null ? years : Math.max(0, Math.min(years, stopAge - dd.age))
    });
    if (!Money.isOk(path)) return path;
    var atYear = function (y) { return path.years[Math.max(0, Math.min(path.years.length - 1, Math.round(y)))].balanceCents; };
    var cumulative = 0, anyStrained = false, firstStrained = null;
    var rows = dd.decades.map(function (d) {
      cumulative += d.plannedCents;
      var at = atYear(d.yearsUntil);
      var strained = cumulative > 0 && cumulative > at;
      if (strained && !anyStrained) { anyStrained = true; firstStrained = d.decade; }
      return Object.assign({}, d, { cumulativeCents: cumulative, projectedCents: at, strained: strained });
    });
    return Money.ok(cumulative, {
      rows: rows, age: dd.age, planAge: dd.planAge, anyStrained: anyStrained, firstStrained: firstStrained,
      investmentsCents: inv.value, annualSavingsCents: basis.annualSavingsCents, savingsVariant: basis.variant,
      annualRate: a.returnReal, stopAge: stopAge
    });
  }

  /**
   * The room's one call: the total planned from this decade on, each decade
   * with its price, its years away and — when the money can be projected —
   * the balance there and whether the plan has outrun it; the plan as a
   * share of the FI number. Incomplete, with a reason, when nothing is
   * priced yet.
   */
  function plan(household, tables, opts) {
    var h = household || {};
    var dd = decades(h, opts);
    if (!Money.isOk(dd)) return dd;
    var aff = affordability(h, tables, opts);
    var rows = Money.isOk(aff) ? aff.rows : dd.decades.map(function (d) { return Object.assign({}, d, { cumulativeCents: null, projectedCents: null, strained: null }); });
    var total = rows.reduce(function (t, d) { return t + d.plannedCents; }, 0);
    var planned = rows.filter(function (d) { return d.plannedCents > 0; });
    if (!planned.length) {
      return Money.incomplete(dd.pastCents > 0 ? 'Nothing planned for the decades ahead yet — put a price on one below.' : 'Nothing planned yet — put a price on a decade below.', ['timeBuckets']);
    }
    var fire = Tier0.fireNumber(h);
    var share = Money.isOk(fire) && fire.value > 0 ? total / fire.value : null;
    return Money.ok(total, {
      rows: rows, plannedCount: planned.length, first: planned[0], next: rows.filter(function (d) { return !d.current; })[0] || null,
      age: dd.age, ageAssumed: dd.ageAssumed, planAge: dd.planAge, pastCents: dd.pastCents,
      affordability: aff, anyStrained: Money.isOk(aff) && aff.anyStrained,
      firstStrained: Money.isOk(aff) ? aff.firstStrained : null,
      shareOfFi: share, fireNumberCents: Money.isOk(fire) ? fire.value : null
    });
  }

  return {
    PLAN_AGE: PLAN_AGE, START_DECADE_WITHOUT_AGE: START_DECADE_WITHOUT_AGE, PLANNED_LABEL: PLANNED_LABEL,
    label: label, inYour: inYour, decades: decades, totalPlannedCents: totalPlannedCents, ideasFor: ideasFor,
    setDecadeCents: setDecadeCents, affordability: affordability, plan: plan
  };
});
