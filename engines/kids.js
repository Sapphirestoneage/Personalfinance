/* ==========================================================================
   engines/kids.js — the Kids and Tuition room's plan.
   DECISIONS.md D-099 (the second wave of tranche rooms on the template).
   --------------------------------------------------------------------------
   Two things, per child and for the household:

     the cost now    what a child of this age costs a month, read from the
                     age band in data/child_cost.json (USDA basis; excludes
                     college), plus childcare from data/childcare_by_state.json
                     while they are under five (the state's figure, or the
                     table's national figure when no state is entered), plus
                     a day school's tuition when the household says one is in
                     the picture. Summed to the household's month and year.

     the tuition     one target per child (what should be there at 18), one
                     saved pot for the household, one monthly figure going in.
                     For each child: months until 18, what the saved share
                     grows to by then at the real return, the shortfall, and
                     the level monthly contribution that closes it on time.
                     The household's need is the sum; the figure going in is
                     measured against it.

   The level monthly contribution that reaches a future target S in n months
   at monthly rate r is the sinking-fund payment

       PMT = S · r ÷ ((1 + r)^n − 1)             with S = target − saved·(1 + r)^n

   and that is the loan formula in engines/projection.js applied to the
   present value of S: levelPayment(principal = S ÷ (1 + r)^n) =
   S·(1 + r)^−n · r ÷ (1 − (1 + r)^−n) = S · r ÷ ((1 + r)^n − 1). So there is
   one annuity formula in the codebase and this file calls it rather than
   carrying a second (SPEC.md §8). At r = 0 both collapse to S ÷ n.

   A child's age is a whole number of years; null means not entered, and a
   child without an age is costed as an infant (the youngest band, childcare
   included, eighteen years to go) and says so. A child at or past 18 costs
   nothing here and their tuition is due now. The saved pot goes to the
   child whose bill comes first — the oldest — then the next, because that
   is what one pot does. Empty is never zero: a target of nothing, or none
   entered, means no tuition line rather than a $0 need.

   Cents in, cents out. Returns a Result: value is the household's yearly
   cost; the rest rides in the extras. Never throws on an empty household.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('../shared/money.js'), Schema: require('../shared/schema.js'), Projection: require('./projection.js') };
  } else {
    var S = root.SLAF || {};
    deps = { Money: S.Money, Schema: S.Schema, Projection: S.Projection };
  }
  var api = factory(deps.Money, deps.Schema, deps.Projection);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Kids = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Projection) {
  'use strict';

  var MONTHS = 12;
  var ADULT_AT = 18;          /* saving stops, and the cost bands end, at 18 */
  var CHILDCARE_UNTIL = 5;    /* childcare is a line while under five */
  var SCHOOL_FROM = 5;        /* a day school is a line from five to 17 */

  /* The tables, whole or nothing: a missing table is a reason, never a
     fallback figure. */
  function costTable(tables) {
    var t = tables && tables.childCost;
    if (!t || !Array.isArray(t.bands) || !t.bands.length) return null;
    for (var i = 0; i < t.bands.length; i++) {
      if (!Money.isEntered(t.bands[i].fromMonths) || !Money.isEntered(t.bands[i].monthlyCents)) return null;
    }
    return t;
  }
  function careTable(tables) {
    var t = tables && tables.childcareByState;
    return t && t.states && typeof t.states === 'object' ? t : null;
  }

  /** The band a child of `ageMonths` falls in: the last one starting at or
   *  before that month. Bands are sorted by fromMonths here, not trusted. */
  function bandFor(table, ageMonths) {
    var bands = table.bands.slice().sort(function (a, b) { return a.fromMonths - b.fromMonths; });
    var hit = bands[0];
    for (var i = 0; i < bands.length; i++) if (bands[i].fromMonths <= ageMonths) hit = bands[i];
    return hit;
  }

  /** Childcare a month for this household's state, or the national figure
   *  when no state is entered. { cents, source, reason } */
  function childcareFor(table, state) {
    if (!table) return { cents: null, source: null, reason: 'The childcare table is not loaded.' };
    var code = state ? String(state).toUpperCase() : null;
    if (code && table.states[code] && Money.isEntered(table.states[code].monthlyCents)) {
      return { cents: table.states[code].monthlyCents, source: 'state', reason: null };
    }
    if (table.national && Money.isEntered(table.national.monthlyCents)) {
      return { cents: table.national.monthlyCents, source: 'national',
        reason: code ? 'No childcare figure for ' + code + ' — the national figure stands in.' : 'No state entered — the national figure stands in. Set it in Start Here.' };
    }
    return { cents: null, source: null, reason: code ? 'No childcare figure for ' + code + '.' : 'No state entered, and the table has no national figure.' };
  }

  /**
   * The level monthly contribution that takes `savedCents` to `targetCents`
   * in `months` at `annualRate`, via the one annuity formula in
   * engines/projection.js (see the header). Returns
   * { neededMonthlyCents, shortfallCents, growthFactor, funded }.
   * `months` of zero means the bill is due now: no monthly figure exists,
   * the shortfall is simply target less saved.
   */
  function levelMonthlyToTarget(targetCents, savedCents, months, annualRate) {
    var r = annualRate / MONTHS;
    var growth = Math.pow(1 + r, months);
    var shortfall = targetCents - savedCents * growth;
    if (shortfall <= 0) return { neededMonthlyCents: 0, shortfallCents: Math.round(shortfall), growthFactor: growth, funded: true };
    if (months <= 0) return { neededMonthlyCents: null, shortfallCents: Math.round(shortfall), growthFactor: growth, funded: false };
    var pmt = Projection.levelPaymentCents({ principalCents: shortfall / growth, annualRate: annualRate, months: months });
    return { neededMonthlyCents: Money.isOk(pmt) ? pmt.value : null, shortfallCents: Math.round(shortfall), growthFactor: growth, funded: false };
  }

  /**
   * plan(household, tables) — the room's one call.
   */
  function plan(household, tables) {
    var h = household || {};
    var deps = Schema.createDependents(h.dependents);
    if (deps === null) return Money.incomplete('Nobody depending on you is entered yet — say who in Start Here.', ['dependents']);
    if (!deps.length) return Money.incomplete('Nobody depends on your income, so there is nothing to cost here.', ['dependents']);
    var costs = costTable(tables);
    if (!costs) return Money.incomplete('The child cost table (data/child_cost.json) is not loaded.', ['childCost']);
    var care = careTable(tables);

    var state = h.state || null;
    var daySchool = !!(h.community && h.community.daySchool === true);
    var daySchoolMonthly = daySchool && Money.isEntered(costs.privateSchoolMonthlyCents) ? costs.privateSchoolMonthlyCents : null;
    var kids = Schema.createKidsPlan(h.kids);
    var returnReal = Schema.resolveAssumptions(h).returnReal;

    /* ---- The cost now, child by child ------------------------------------ */
    var children = deps.map(function (d, i) {
      var ageKnown = Money.isEntered(d.age);
      var age = ageKnown ? Math.max(0, Math.floor(d.age)) : 0;
      var past18 = ageKnown && age >= ADULT_AT;
      var c = {
        index: i, age: ageKnown ? age : null, ageKnown: ageKnown, past18: past18,
        label: !ageKnown ? 'Age not entered' : 'Age ' + age,
        note: null, band: null, costCents: 0, childcareCents: 0, childcareApplies: false, childcareSource: null, childcareReason: null,
        daySchoolCents: 0, monthlyCents: 0, yearsTo18: past18 ? 0 : ADULT_AT - age
      };
      if (past18) {
        c.note = 'Past 18 — no cost band here, and any tuition is due now.';
        return c;
      }
      var band = bandFor(costs, age * MONTHS);
      c.band = { id: band.id, label: band.label, fromMonths: band.fromMonths, monthlyCents: band.monthlyCents };
      c.costCents = band.monthlyCents;
      if (age < CHILDCARE_UNTIL) {
        var cc = childcareFor(care, state);
        c.childcareApplies = true;
        c.childcareCents = cc.cents;
        c.childcareSource = cc.source;
        c.childcareReason = cc.reason;
      }
      if (daySchoolMonthly !== null && age >= SCHOOL_FROM) c.daySchoolCents = daySchoolMonthly;
      c.monthlyCents = c.costCents + (Money.isEntered(c.childcareCents) ? c.childcareCents : 0) + c.daySchoolCents;
      if (!ageKnown) c.note = 'Age not entered — costed as an infant (the youngest band, childcare included, eighteen years to 18). Add the age in Start Here.';
      return c;
    });

    var monthly = 0, childcare = 0, daySchoolTotal = 0, underFive = 0, childcareUnknown = 0;
    children.forEach(function (c) {
      monthly += c.monthlyCents;
      daySchoolTotal += c.daySchoolCents;
      if (c.childcareApplies) {
        underFive++;
        if (Money.isEntered(c.childcareCents)) childcare += c.childcareCents; else childcareUnknown++;
      }
    });

    /* ---- Tuition: the pot goes to the first bill first -------------------- */
    var tuition = null, tuitionReason = null;
    if (!Money.isEntered(kids.tuitionTargetCents)) tuitionReason = 'No tuition target entered.';
    else if (kids.tuitionTargetCents <= 0) tuitionReason = 'The tuition target is zero, so there is no tuition line.';
    else {
      var target = kids.tuitionTargetCents;
      var saved = Money.isEntered(kids.tuitionSavedCents) ? kids.tuitionSavedCents : 0;
      var savedEntered = Money.isEntered(kids.tuitionSavedCents);
      var pot = saved;
      var order = children.slice().sort(function (a, b) { return a.yearsTo18 - b.yearsTo18 || a.index - b.index; });
      var needed = 0, gapNow = 0, dueNow = 0, funded = 0, anyNeed = false;
      order.forEach(function (c) {
        var share = Math.min(pot, target);
        pot -= share;
        var months = c.yearsTo18 * MONTHS;
        var lvl = levelMonthlyToTarget(target, share, months, returnReal);
        c.tuition = {
          targetCents: target, savedCents: share, months: months, growthFactor: lvl.growthFactor,
          shortfallCents: lvl.shortfallCents, neededMonthlyCents: lvl.neededMonthlyCents,
          funded: lvl.funded, dueNow: months <= 0 && !lvl.funded, gapNowCents: Math.max(0, target - share)
        };
        gapNow += c.tuition.gapNowCents;
        if (lvl.funded) funded++;
        else if (c.tuition.dueNow) dueNow++;
        else { needed += lvl.neededMonthlyCents; anyNeed = true; }
      });
      var going = Money.isEntered(kids.tuitionMonthlyCents) ? kids.tuitionMonthlyCents : null;
      tuition = {
        targetCents: target, savedCents: saved, savedEntered: savedEntered, monthlyCents: going,
        neededMonthlyCents: needed, gapCents: gapNow, returnReal: returnReal,
        allFunded: funded === children.length, fundedCount: funded, dueNowCount: dueNow,
        onTime: going === null ? null : (anyNeed ? going >= needed : true),
        shortMonthlyCents: going === null ? null : Math.max(0, needed - going)
      };
    }

    var zone = tuition && tuition.onTime === false ? 'watch' : null;
    return Money.ok(monthly * MONTHS, {
      children: children, count: children.length,
      monthlyCents: monthly, annualCents: monthly * MONTHS,
      childcareMonthlyCents: childcare, underFive: underFive, childcareUnknown: childcareUnknown,
      daySchool: daySchool, daySchoolMonthlyCents: daySchoolTotal,
      state: state, tuition: tuition, tuitionReason: tuitionReason, returnReal: returnReal, zone: zone
    });
  }

  return {
    ADULT_AT: ADULT_AT,
    CHILDCARE_UNTIL: CHILDCARE_UNTIL,
    bandFor: bandFor,
    childcareFor: childcareFor,
    levelMonthlyToTarget: levelMonthlyToTarget,
    plan: plan
  };
});
