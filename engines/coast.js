/* ==========================================================================
   engines/coast.js — your coast date. DECISIONS.md D-213 (I4).
   --------------------------------------------------------------------------
   The earliest date you could stop saving for retirement and still reach
   the FI number by the target age, at the real return from the
   assumptions file, in today's dollars. Its own formula, not a FIRE
   variant (decided before this): a month-by-month walk. Each month the
   pot grows at the real rate and takes the month's contribution; the
   first month where the pot, left alone, would reach the FI number by
   the target age is the coast date.

     Coast.date(h, tables, { targetAge, returnReal, fiNumberCents,
                             investmentsCents, annualContributionCents, age })
       → { status, months, coastAge, reachedNow, neverAtThisPace,
           potAtCoastCents, targetAge, fiNumberCents, returnReal,
           noMoreContributions: { atTargetAgeCents } }

   The reverse view: with no more contributions, today's retirement money
   grows to about X by the target age.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('../shared/money.js'), Schema: require('../shared/schema.js'), Tier0: require('./tier0.js') };
  } else {
    deps = { Money: root.SLAF && root.SLAF.Money, Schema: root.SLAF && root.SLAF.Schema, Tier0: root.SLAF && root.SLAF.Tier0 };
  }
  var api = factory(deps.Money, deps.Schema, deps.Tier0);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Coast = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Tier0) {
  'use strict';
  function grow(cents, annualRate, months) { return cents * Math.pow(1 + annualRate, months / 12); }
  function date(household, tables, opts) {
    var h = household || {}, o = opts || {}, T = tables || {};
    var age = Money.isEntered(o.age) ? o.age : Schema.primaryAge(h);
    if (!Money.isEntered(age)) return Money.incomplete('Add your date of birth to find the coast date.', ['dob']);
    var targetAge = Money.isEntered(o.targetAge) ? o.targetAge : ((h.targets && Money.isEntered(h.targets.retireAge)) ? h.targets.retireAge : (T.fireVariants && T.fireVariants.defaults ? T.fireVariants.defaults.coastTargetAge : 65));
    if (targetAge <= age) return Money.incomplete('The target age is behind you; pick a later one.', ['retireAge']);
    var fi = Money.isEntered(o.fiNumberCents) ? Money.ok(o.fiNumberCents) : Tier0.fireNumber(h);
    if (!Money.isOk(fi)) return fi;
    var inv = Money.isEntered(o.investmentsCents) ? Money.ok(o.investmentsCents) : Schema.investmentsCents(h);
    if (!Money.isOk(inv)) return inv;
    var contrib;
    if (Money.isEntered(o.annualContributionCents)) contrib = o.annualContributionCents;
    else {
      var sr = Tier0.savingsRate(h, T);
      var basis = Money.isOk(sr.includingMatch) ? sr.includingMatch : sr.excludingMatch;
      if (!Money.isOk(basis)) return Money.incomplete('Add income, spending and filing status to know what is being saved.', basis.missing);
      contrib = basis.annualSavingsCents;
    }
    var r = Money.isEntered(o.returnReal) ? o.returnReal : Schema.resolveAssumptions(h, null, T).returnReal;
    var horizon = Math.round((targetAge - age) * 12);
    var pot = inv.value, month = 0, found = null;
    for (month = 0; month <= horizon; month++) {
      /* To the cent: a pot that lands within half a cent of the number reaches it. */
      if (grow(pot, r, horizon - month) >= fi.value - 0.5) { found = month; break; }
      pot = pot * Math.pow(1 + r, 1 / 12) + contrib / 12;
    }
    var noMore = Math.round(grow(inv.value, r, horizon));
    if (found === null) {
      return Money.ok(null, { months: null, coastAge: null, reachedNow: false, neverAtThisPace: true, targetAge: targetAge, age: age, fiNumberCents: fi.value, returnReal: r, annualContributionCents: contrib, potAtCoastCents: null, noMoreContributions: { atTargetAgeCents: noMore }, horizonMonths: horizon });
    }
    return Money.ok(found, { months: found, coastAge: Math.round((age + found / 12) * 10) / 10, reachedNow: found === 0, neverAtThisPace: false, targetAge: targetAge, age: age, fiNumberCents: fi.value, returnReal: r, annualContributionCents: contrib, potAtCoastCents: Math.round(pot), noMoreContributions: { atTargetAgeCents: noMore }, horizonMonths: horizon });
  }
  return { date: date, grow: grow };
});
