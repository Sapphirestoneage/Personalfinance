/* ==========================================================================
   engines/careermove.js — Career Move: an offer against the job you have.
   DECISIONS.md D-099 (the second wave of tranche rooms).
   --------------------------------------------------------------------------
   Nothing here is a formula of its own. The offer is priced by the SAME
   function that prices the current job — engines/hourly.js realHourlyWage —
   with the offer's hours, commute and costs handed in as `opts.work`, and
   the offer's pay handed in as the only pay of the job it replaces (a copy
   of the household; nothing is written). Take-home is engines/tier0.js
   takeHomeMonthlyCents on the same two households; the FI move is the
   projection engine's years-to-target with the real return, the FI number
   and this year's savings, the way shared/lens.js reads it — spending
   unchanged, the sign-on landing in investments in the offer's year.

     difference an hour = offer.real − now.real         (cents per hour)
     kept a year, more  = offer.keptAnnual − now.keptAnnual
     FI move            = (yearsNow − yearsOffer) × 12  (months, + = sooner)

   What is NOT carried from the current job: paid hours, commute, costs of
   working (each is the offer's own, or its stated stand-in). What IS
   carried: unpaid overtime, getting ready, decompressing, weeks a year —
   the person is the same person, and the room says so in its drawer.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('../shared/money.js'), Schema: require('../shared/schema.js'),
             Tier0: require('./tier0.js'), Projection: require('./projection.js'), Hourly: require('./hourly.js') };
  } else {
    var S = root.SLAF || {};
    deps = { Money: S.Money, Schema: S.Schema, Tier0: S.Tier0, Projection: S.Projection, Hourly: S.Hourly };
  }
  var api = factory(deps.Money, deps.Schema, deps.Tier0, deps.Projection, deps.Hourly);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.CareerMove = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Tier0, Projection, Hourly) {
  'use strict';

  var MONTHS = 12;
  /* A standard week, when neither the offer nor the current job says. */
  var STANDARD_WEEK_HOURS = 40;

  function offerOf(household) {
    return Schema.createCareer((household && household.career) || {}).offer;
  }

  /* The job the offer replaces: the primary person's first W-2 source, or
     failing that their first source of any kind. Every other source stays
     on both sides — a mixed household's own work is not what is moving. */
  function jobIndex(person) {
    var sources = (person && person.incomeSources) || [];
    for (var i = 0; i < sources.length; i++) if (sources[i].type === 'w2') return i;
    return sources.length ? 0 : -1;
  }

  /**
   * offerHousehold(h, offer) — a deep copy of the household in which the
   * primary person's current job pays the offer instead. Nothing is written;
   * the copy is what the shared engines are pointed at.
   */
  function offerHousehold(household, offer) {
    var copy = JSON.parse(JSON.stringify(household || {}));
    var person = Schema.primaryPerson(copy);
    if (!person) return copy;
    var i = jobIndex(person);
    var source = Schema.createIncomeSource({
      id: i >= 0 ? person.incomeSources[i].id : undefined,
      personId: person.id, source: 'The offer', type: 'w2',
      grossAnnualIncomeCents: offer.grossAnnualCents
    });
    if (i >= 0) person.incomeSources[i] = source; else person.incomeSources = [source];
    return copy;
  }

  /**
   * offerWork(h, offer) — the work overrides the offer brings, and where
   * each came from. Only entered keys are handed over, so an unentered
   * commute or costs carries the current job's figure through Hourly's
   * merge rather than being nulled out — and a typed 0 stays 0.
   */
  function offerWork(household, offer) {
    var current = Schema.workProfile(Schema.primaryPerson(household));
    var work = {}, sources = {};
    if (Money.isEntered(offer.hoursPerWeek)) { work.contractedHoursPerWeek = offer.hoursPerWeek; sources.hours = 'offer'; }
    else if (Money.isEntered(current.contractedHoursPerWeek)) { work.contractedHoursPerWeek = current.contractedHoursPerWeek; sources.hours = 'current'; }
    else { work.contractedHoursPerWeek = STANDARD_WEEK_HOURS; sources.hours = 'convention'; }
    if (Money.isEntered(offer.commuteHoursPerWeek)) { work.commuteHoursPerWeek = offer.commuteHoursPerWeek; sources.commute = 'offer'; }
    else sources.commute = Money.isEntered(current.commuteHoursPerWeek) ? 'current' : 'none';
    if (Money.isEntered(offer.workCostsMonthlyCents)) { work.workCostsMonthlyCents = offer.workCostsMonthlyCents; sources.costs = 'offer'; }
    else sources.costs = Money.isEntered(current.workCostsMonthlyCents) ? 'current' : 'none';
    return { work: work, sources: sources, current: current };
  }

  /* The FI arithmetic the lens uses, on one household: the FI number, the
     investments, this year's savings and the real return. The employer
     match is left out on BOTH sides — the offer's match is a benefit, and
     benefits are out of this room's scope — so the two sides are read on
     the same basis. */
  function fiInputs(household, tables) {
    var fire = Tier0.fireNumber(household);
    if (!Money.isOk(fire)) return fire;
    var inv = Schema.investmentsCents(household);
    if (!Money.isOk(inv)) return Money.incomplete('Add your investments to see FI move.', ['investments']);
    var basis = Tier0.savingsRate(household, tables).excludingMatch;
    if (!Money.isOk(basis)) return Money.incomplete('Add your income and filing status to see FI move.', basis.missing);
    return Money.ok(fire.value, { investmentsCents: inv.value, annualSavingsCents: basis.annualSavingsCents, rate: Schema.resolveAssumptions(household).returnReal, targetCents: fire.value });
  }
  function yearsFrom(startCents, fi) {
    if (startCents >= fi.targetCents) return Money.ok(0, { alreadyThere: true });
    if (fi.annualSavingsCents <= 0) return Money.incomplete('Nothing is being saved, so FI is out of reach.', ['savingsRate']);
    return Projection.yearsToTargetCents({ startCents: Math.max(0, startCents), targetCents: fi.targetCents, annualRate: fi.rate, annualContributionCents: fi.annualSavingsCents, fractional: true });
  }

  /**
   * fiMove(now, offer, signOnNetCents, tables) → Result: months FI moves,
   * positive = sooner. The sign-on, after tax, is a one-off into the
   * offer's investments in year one.
   */
  function fiMove(nowHousehold, offerHouseholdObj, signOnNetCents, tables) {
    var a = fiInputs(nowHousehold, tables);
    if (!Money.isOk(a)) return a;
    var b = fiInputs(offerHouseholdObj, tables);
    if (!Money.isOk(b)) return b;
    var yNow = yearsFrom(a.investmentsCents, a);
    var yOff = yearsFrom(b.investmentsCents + (Money.isEntered(signOnNetCents) ? signOnNetCents : 0), b);
    if (!Money.isOk(yNow) && !Money.isOk(yOff)) return Money.incomplete('FI is out of reach on both sides at these assumptions, so it cannot move.', ['savingsRate']);
    if (!Money.isOk(yNow)) return Money.ok(null, { unreachableNow: true, yearsOffer: yOff.value, months: null });
    if (!Money.isOk(yOff)) return Money.ok(null, { unreachableOffer: true, yearsNow: yNow.value, months: null });
    var raw = (yNow.value - yOff.value) * MONTHS;
    return Money.ok(Math.round(raw), { rawMonths: raw, yearsNow: yNow.value, yearsOffer: yOff.value, savingsNowCents: a.annualSavingsCents, savingsOfferCents: b.annualSavingsCents, targetCents: a.targetCents, rate: a.rate });
  }

  /**
   * compare(household, tables) → Result. value = the real difference an
   * hour, in cents (offer − now). Incomplete with a reason when there is no
   * offer; when the current job's hours are not in, incomplete with the
   * reason AND `offer` attached, so a room can still show the offer's own
   * rate.
   */
  function compare(household, tables) {
    var h = household || {};
    var offer = offerOf(h);
    if (!Money.isEntered(offer.grossAnnualCents)) {
      return Money.incomplete('Add the offer — what it pays a year — to compare it with the job you have.', ['offer.grossAnnualCents']);
    }
    if (offer.grossAnnualCents <= 0) {
      return Money.incomplete('An offer has to pay something to be compared.', ['offer.grossAnnualCents']);
    }
    var person = Schema.primaryPerson(h);
    if (!person) return Money.incomplete('Answer the income question in Start Here to compare an offer with it.', ['grossAnnualIncome']);

    var ow = offerWork(h, offer);
    var side = offerHousehold(h, offer);
    var offerWage = Hourly.realHourlyWage(side, tables, { work: ow.work });
    if (!Money.isOk(offerWage)) return offerWage;
    var offerTake = Tier0.takeHomeMonthlyCents(side, tables);
    var signOn = Money.isEntered(offer.signOnCents) ? offer.signOnCents : null;
    var signOnNet = signOn === null ? null : Math.round(signOn * (1 - (offerWage.taxKnown ? offerWage.estimatedTaxCents / offerWage.grossAnnualIncomeCents : 0)));

    var offerSide = {
      realHourlyCents: offerWage.realHourlyCents, nominalHourlyCents: offerWage.nominalHourlyCents,
      keptAnnualCents: offerWage.keptAnnualCents, grossAnnualCents: offerWage.grossAnnualIncomeCents,
      estimatedTaxCents: offerWage.estimatedTaxCents, taxKnown: offerWage.taxKnown, taxReason: offerWage.taxReason,
      effectiveRate: offerWage.taxKnown ? offerWage.estimatedTaxCents / offerWage.grossAnnualIncomeCents : null,
      annualWorkCostsCents: offerWage.annualWorkCostsCents, workCostsMonthlyCents: Money.isEntered(ow.work.workCostsMonthlyCents) ? ow.work.workCostsMonthlyCents : (Money.isEntered(ow.current.workCostsMonthlyCents) ? ow.current.workCostsMonthlyCents : 0),
      paidHoursPerWeek: offerWage.paidHoursPerWeek, unpaidHoursPerWeek: offerWage.unpaidHoursPerWeek, totalHoursPerWeek: offerWage.totalHoursPerWeek,
      unpaidParts: offerWage.unpaidParts, weeksPerYear: offerWage.weeksPerYear,
      takeHomeMonthlyCents: Money.isOk(offerTake) ? offerTake.value : null,
      takeHomeAnnualCents: Money.isOk(offerTake) ? offerTake.grossAnnualIncomeCents - offerTake.estimatedTaxCents : null,
      signOnCents: signOn, signOnNetCents: signOnNet,
      costsMoreThanItPays: offerWage.costsMoreThanItPays, implausibleHours: offerWage.implausibleHours
    };

    var nowWage = Hourly.realHourlyWage(h, tables, {});
    if (!Money.isOk(nowWage)) {
      var r = Money.incomplete('Your current job’s hours are not in, so there is no rate to hold the offer against. ' + nowWage.reason, nowWage.missing);
      r.offer = offerSide; r.sources = ow.sources; r.nowReason = nowWage.reason;
      return r;
    }
    var nowTake = Tier0.takeHomeMonthlyCents(h, tables);
    var nowSide = {
      realHourlyCents: nowWage.realHourlyCents, nominalHourlyCents: nowWage.nominalHourlyCents,
      keptAnnualCents: nowWage.keptAnnualCents, grossAnnualCents: nowWage.grossAnnualIncomeCents,
      estimatedTaxCents: nowWage.estimatedTaxCents, taxKnown: nowWage.taxKnown, taxReason: nowWage.taxReason,
      effectiveRate: nowWage.taxKnown ? nowWage.estimatedTaxCents / nowWage.grossAnnualIncomeCents : null,
      annualWorkCostsCents: nowWage.annualWorkCostsCents, workCostsMonthlyCents: Money.isEntered(ow.current.workCostsMonthlyCents) ? ow.current.workCostsMonthlyCents : 0,
      paidHoursPerWeek: nowWage.paidHoursPerWeek, unpaidHoursPerWeek: nowWage.unpaidHoursPerWeek, totalHoursPerWeek: nowWage.totalHoursPerWeek,
      unpaidParts: nowWage.unpaidParts, weeksPerYear: nowWage.weeksPerYear,
      takeHomeMonthlyCents: Money.isOk(nowTake) ? nowTake.value : null,
      takeHomeAnnualCents: Money.isOk(nowTake) ? nowTake.grossAnnualIncomeCents - nowTake.estimatedTaxCents : null,
      costsMoreThanItPays: nowWage.costsMoreThanItPays, implausibleHours: nowWage.implausibleHours
    };

    var fi = fiMove(h, side, signOnNet, tables);
    var diff = offerSide.realHourlyCents - nowSide.realHourlyCents;
    return Money.ok(diff, {
      differenceHourlyCents: diff,
      keptDifferenceAnnualCents: offerSide.keptAnnualCents - nowSide.keptAnnualCents,
      takeHomeDifferenceAnnualCents: (offerSide.takeHomeAnnualCents !== null && nowSide.takeHomeAnnualCents !== null) ? offerSide.takeHomeAnnualCents - nowSide.takeHomeAnnualCents : null,
      hoursDifferencePerWeek: offerSide.totalHoursPerWeek - nowSide.totalHoursPerWeek,
      now: nowSide, offer: offerSide,
      fi: fi,
      fiMonthsSooner: Money.isOk(fi) ? fi.value : null,
      sources: ow.sources,
      carried: { unpaidOvertimeHoursPerWeek: ow.current.unpaidOvertimeHoursPerWeek, prepHoursPerWeek: ow.current.prepHoursPerWeek, decompressHoursPerWeek: ow.current.decompressHoursPerWeek, weeksPerYear: nowWage.weeksPerYear },
      taxKnown: nowSide.taxKnown && offerSide.taxKnown
    });
  }

  return {
    STANDARD_WEEK_HOURS: STANDARD_WEEK_HOURS,
    offerOf: offerOf,
    offerHousehold: offerHousehold,
    offerWork: offerWork,
    fiMove: fiMove,
    compare: compare
  };
});
