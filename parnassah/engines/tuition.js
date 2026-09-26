/* ==========================================================================
   parnassah/engines/tuition.js, the tuition mountain. PN-004.
   --------------------------------------------------------------------------
   Every child, every school year from this one until the youngest is out
   (and back from Israel, if that year is on): which stage they are in, what
   it costs, and the sum. One formula, parameterised by the family's own
   numbers where it has them and by the tuition table where it does not.

     Tuition.grade(birthYear, schoolYear, T)      -> integer (K is 0, nursery -2)
     Tuition.stage(grade, T)                       -> stage row or null
     Tuition.schoolYear(today, T)                  -> the year the current school year began
     Tuition.plan(h, T, opts)                      -> Result
       value: { years: [{ year, totalCents, perKid: [{ kidId, name, grade, stageId, stageLabel, cents, assumed }] }],
                thisYearCents, peak: { year, cents }, lifetimeCents, lastYear, assumedAny, kidsInSchool }
   Empty is not zero: a stage price the family has not typed comes from the
   table's typical band and is marked `assumed`; a child with no birth year
   is left out and named in `missing`. No region and no typed prices means
   incomplete, never a guess.
   ========================================================================== */
(function (root, factory) {
  var Money = (typeof module === 'object' && module.exports) ? require('../shared/money.js') : (root.SLAF && root.SLAF.Money);
  var api = factory(Money);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Tuition = api; }
})(typeof self !== 'undefined' ? self : null, function (Money) {
  'use strict';
  var ok = Money.ok, incomplete = Money.incomplete, entered = Money.isEntered;

  function grade(birthYear, schoolYear, T) { return schoolYear - birthYear - T.tuition.kindergartenAge; }
  function stage(g, T) {
    var s = T.tuition.stages;
    for (var i = 0; i < s.length; i++) if (g >= s[i].gradeFrom && g <= s[i].gradeTo) return s[i];
    return null;
  }
  function schoolYear(today, T) {
    var d = today ? new Date(today) : new Date();
    return d.getMonth() + 1 >= T.tuition.schoolYearStartMonth ? d.getFullYear() : d.getFullYear() - 1;
  }

  /* The price of one stage for one child in one year, in cents, and whether it was assumed. */
  function price(stageId, h, T) {
    var typed = h.tuition.overrides[stageId];
    if (entered(typed)) return { cents: typed, assumed: false };
    var region = h.household.region;
    if (!region || !T.tuition.annualDollars[region]) return null;
    return { cents: Math.round(T.tuition.annualDollars[region][stageId].typical * 100), assumed: true };
  }

  function plan(h, T, opts) {
    var o = opts || {};
    var start = schoolYear(o.today, T);
    var kids = h.kids.filter(function (k) { return entered(k.birthYear); }).slice().sort(function (a, b) { return a.birthYear - b.birthYear; });
    var missing = h.kids.filter(function (k) { return !entered(k.birthYear); }).map(function (k) { return 'birthYear:' + k.id; });
    if (!h.kids.length) return incomplete('Add a child to see the tuition years.', ['kids']);
    if (!kids.length) return incomplete('Each child needs a year of birth.', missing);
    var years = [], lastYear = start, assumedAny = false, lifetime = 0, peak = { year: null, cents: null }, kidsInSchool = 0, priceMissing = false;
    /* The last year anyone is in school: the youngest child's 12th grade, or the year after when Israel is on. */
    kids.forEach(function (k) {
      var end = k.birthYear + T.tuition.kindergartenAge + 12 + (k.gapYear === true ? 1 : 0);
      if (end > lastYear) lastYear = end;
    });
    var aShare = entered(h.tuition.assistanceShare) ? h.tuition.assistanceShare : null;
    var sShare = entered(h.tuition.siblingShare) ? h.tuition.siblingShare : null;
    var sFrom = entered(h.tuition.siblingFrom) ? h.tuition.siblingFrom : 3;
    for (var y = start; y <= lastYear; y++) {
      var perKid = [], total = 0, ordinal = 0;
      kids.forEach(function (k) {
        var g = grade(k.birthYear, y, T), s = stage(g, T);
        if (!s) return;
        if (s.id === 'gap' && k.gapYear !== true) return;
        var p = price(s.id, h, T);
        if (!p) { priceMissing = true; return; }
        ordinal++;
        var cents = p.cents;
        if (s.id !== 'gap') {
          if (aShare !== null) cents = Math.round(cents * (1 - aShare));
          if (sShare !== null && ordinal >= sFrom) cents = Math.round(cents * (1 - sShare));
        }
        if (p.assumed) assumedAny = true;
        perKid.push({ kidId: k.id, name: k.name, grade: g, stageId: s.id, stageLabel: s.label, cents: cents, assumed: p.assumed });
        total += cents;
      });
      if (y === start) kidsInSchool = perKid.length;
      years.push({ year: y, totalCents: total, perKid: perKid });
      lifetime += total;
      if (peak.cents === null || total > peak.cents) peak = { year: y, cents: total };
    }
    if (priceMissing && !years.some(function (yr) { return yr.perKid.length; })) {
      return incomplete('Pick the region, or type your school\'s tuition, to price the years.', ['household.region']);
    }
    return ok({ years: years, thisYearCents: years[0].totalCents, peak: peak, lifetimeCents: lifetime, lastYear: lastYear, assumedAny: assumedAny, kidsInSchool: kidsInSchool, startYear: start, priceMissing: priceMissing }, { missing: missing });
  }

  return { grade: grade, stage: stage, schoolYear: schoolYear, price: price, plan: plan };
});
