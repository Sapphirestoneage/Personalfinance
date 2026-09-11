/* ==========================================================================
   engines/offers.js — Offer Compare: two to four job offers side by side.
   DECISIONS.md D-219 (K8).
   --------------------------------------------------------------------------
   Each offer is priced as what it is worth in a year, after what it costs
   to hold it: take-home on base plus bonus at the offer's state (the one
   take-home figure, engines/tier0.js on a copy of the household holding
   that pay and that state), the match (Schema.employerMatchCents: salary ×
   cap × rate, the true match, on the same copy), equity as a range never a
   point, less health premiums and the commute. Its value per real hour
   counts the commute in the hours and the days off out of them. The FI
   date under each offer is Tier0.yearsToFire on that copy. The one line
   that decides the comparison is the largest gap between the top two.

   Nothing is written here: "Accept this offer" in the room writes the pay
   and the state to the household and records the life change for the
   reopen sheet (G2.6).
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('../shared/money.js'), Schema: require('../shared/schema.js'), Tier0: require('./tier0.js') };
  } else {
    var S = root.SLAF || {};
    deps = { Money: S.Money, Schema: S.Schema, Tier0: S.Tier0 };
  }
  var api = factory(deps.Money, deps.Schema, deps.Tier0);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Offers = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Tier0) {
  'use strict';

  var MONTHS = 12, WEEKS = 52, HOURS_A_WEEK = 40, WORK_DAYS_A_WEEK = 5, MINUTES = 60;
  var MIN_OFFERS = 2, MAX_OFFERS = 4;
  var COMPONENTS = [
    { id: 'takeHome', label: 'take-home pay' }, { id: 'match', label: 'the employer match' }, { id: 'equity', label: 'equity' },
    { id: 'health', label: 'health premiums' }, { id: 'commute', label: 'the commute' }
  ];

  /** The household as it would be on this offer: the primary's pay replaced, the state set. */
  function household(h, offer) {
    var copy = JSON.parse(JSON.stringify(h || {}));
    var people = copy.people || [];
    var p = people.filter(function (x) { return x.role === 'adult'; })[0];
    if (!p) { p = Schema.createPerson({ id: 'offer_person', role: 'adult', employmentStatus: 'employed' }); copy.people = [p].concat(people); }
    var gross = (offer.baseCents || 0) + (Money.isEntered(offer.bonusCents) ? offer.bonusCents : 0);
    var src = Schema.createIncomeSource({ id: 'offer_income', personId: p.id, source: offer.label || 'The offer', grossAnnualIncomeCents: gross, type: 'w2',
      employerMatch: Money.isEntered(offer.matchRate) && Money.isEntered(offer.matchCapPct) ? { matchPercent: offer.matchRate, matchCapPercentOfSalary: offer.matchCapPct } : {} });
    p.incomeSources = [src];
    p.employmentStatus = 'employed';
    if (offer.state) copy.state = offer.state;
    return Schema.createHousehold(copy);
  }

  function priceOne(h, T, offer) {
    var o = offer || {};
    if (!Money.isEntered(o.baseCents) || o.baseCents <= 0) return { label: o.label || 'Offer', ok: false, reason: 'Type the base pay.' };
    var hh = household(h, o);
    var take = Schema.takeHomeAnnualCents(hh, T);
    if (!Money.isOk(take)) return { label: o.label || 'Offer', ok: false, reason: take.reason };
    var match = Schema.employerMatchCents(hh);
    var matchCents = Money.isOk(match) ? match.value : 0;
    var eqLow = Money.isEntered(o.equityLowCents) ? o.equityLowCents : 0, eqHigh = Money.isEntered(o.equityHighCents) ? Math.max(o.equityHighCents, eqLow) : eqLow;
    var health = (Money.isEntered(o.healthMonthlyCents) ? o.healthMonthlyCents : 0) * MONTHS;
    var commute = (Money.isEntered(o.commuteMonthlyCents) ? o.commuteMonthlyCents : 0) * MONTHS;
    var pto = Money.isEntered(o.ptoDays) ? o.ptoDays : 0;
    var remote = Money.isEntered(o.remoteDays) ? Math.max(0, Math.min(WORK_DAYS_A_WEEK, o.remoteDays)) : 0;
    var commuteMinutes = Money.isEntered(o.commuteMinutesPerDay) ? o.commuteMinutesPerDay : 0;
    var weeksWorked = WEEKS - pto / WORK_DAYS_A_WEEK;
    var commuteHoursAWeek = commuteMinutes / MINUTES * (WORK_DAYS_A_WEEK - remote);
    var hours = weeksWorked * (HOURS_A_WEEK + commuteHoursAWeek);
    var base = take.value + matchCents - health - commute;
    var low = base + eqLow, high = base + eqHigh, mid = Math.round((low + high) / 2);
    var fi = Tier0.yearsToFire(hh, T, null, { fractional: true });
    return {
      label: o.label || 'Offer', ok: true, state: hh.state || null,
      grossCents: (o.baseCents || 0) + (Money.isEntered(o.bonusCents) ? o.bonusCents : 0),
      takeHomeCents: take.value, effectiveRate: take.effectiveRate, matchCents: matchCents, matchKnown: Money.isOk(match),
      equityLowCents: eqLow, equityHighCents: eqHigh, healthCents: health, deductibleCents: Money.isEntered(o.deductibleCents) ? o.deductibleCents : null, commuteCents: commute,
      valueLowCents: low, valueHighCents: high, valueMidCents: mid,
      hoursAYear: Math.round(hours), commuteHoursAYear: Math.round(weeksWorked * commuteHoursAWeek), ptoDays: pto, remoteDays: remote,
      perHourLowCents: hours > 0 ? Math.round(low / hours) : null, perHourHighCents: hours > 0 ? Math.round(high / hours) : null, perHourMidCents: hours > 0 ? Math.round(mid / hours) : null,
      fiYears: Money.isOk(fi) ? Math.round(fi.value * 10) / 10 : null, fiReason: Money.isOk(fi) ? null : fi.reason,
      vestingYears: Money.isEntered(o.vestingYears) ? o.vestingYears : null,
      components: { takeHome: take.value, match: matchCents, equity: Math.round((eqLow + eqHigh) / 2), health: -health, commute: -commute }
    };
  }

  /**
   * compare(household, tables, { offers: [...] }) → Result
   *   value     the index of the best offer by the middle of its range
   *   offers    priced, in the order given
   *   decider   { component, label, diffCents, between: [i, j] } the largest gap between the top two
   */
  function compare(h, T, opts) {
    var list = (opts && opts.offers) || [];
    var priced = list.map(function (o) { return priceOne(h, T, o); });
    var live = priced.map(function (p, i) { return { p: p, i: i }; }).filter(function (x) { return x.p.ok; });
    if (live.length < MIN_OFFERS) return Money.incomplete('Type at least two offers with their base pay to compare them.', ['offers']);
    live.sort(function (a, b) { return b.p.valueMidCents - a.p.valueMidCents; });
    var top = live[0].p, second = live[1].p, best = null;
    COMPONENTS.forEach(function (c) {
      var d = Math.abs((top.components[c.id] || 0) - (second.components[c.id] || 0));
      if (!best || d > best.diffCents) best = { component: c.id, label: c.label, diffCents: d, between: [live[0].i, live[1].i] };
    });
    var gapCents = top.valueMidCents - second.valueMidCents;
    return Money.ok(live[0].i, { offers: priced, order: live.map(function (x) { return x.i; }), decider: best, gapCents: gapCents, overlap: top.valueLowCents <= second.valueHighCents });
  }

  return { MIN_OFFERS: MIN_OFFERS, MAX_OFFERS: MAX_OFFERS, COMPONENTS: COMPONENTS, household: household, priceOne: priceOne, compare: compare };
});
