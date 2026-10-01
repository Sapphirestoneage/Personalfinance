/* ==========================================================================
   engine/conversions.js, Roth conversion strategies. D-341.
   --------------------------------------------------------------------------
   A conversion moves pretax money into the Roth IRA as a dated layer and
   counts as ordinary income in the year. Four strategies, a setting:
     none          nothing converts
     fillBracket   convert up to the top of the chosen bracket (the 12%
                   bracket by default): the room is the bracket's top plus
                   the deductions plus the preferential income, less the
                   AGI the year already has
     targetMagi    convert up to a target MAGI, say to keep an ACA credit
     fixed         a set amount a year in today's dollars, inflated
   Conversions run in years with no earned income unless whileWorking is
   on, between fromAge and untilAge when those are set, and never more
   than the pretax balance. Each layer is seasoned five tax years later;
   withdrawals.js reads the layers.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) deps = { Tables: require('./tables.js') };
  else deps = { Tables: root.SLAF && root.SLAF.Engine && root.SLAF.Engine.Tables };
  var api = factory(deps.Tables);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Engine = root.SLAF.Engine || {}; root.SLAF.Engine.Conversions = api; }
})(typeof self !== 'undefined' ? self : null, function (Tables) {
  'use strict';

  function dollars(c) { return '$' + Math.round(c / 100).toLocaleString('en-US'); }

  /**
   * amount({ A, year, people, earnedCents, pretaxAvailableCents, federalBefore, inflator })
   *   federalBefore is federal.compute for the year with no conversion.
   * Returns { cents, explain }.
   */
  function amount(ctx) {
    var c = ctx.A.conversion || {}, s = c.strategy || 'none';
    var out = { cents: 0, explain: [] };
    if (s === 'none' || !ctx.pretaxAvailableCents) return out;
    if (ctx.earnedCents > 0 && !c.whileWorking) return out;
    var age = ctx.people[0].age;
    if (age !== null && c.fromAge !== null && c.fromAge !== undefined && age < c.fromAge) return out;
    if (age !== null && c.untilAge !== null && c.untilAge !== undefined && age > c.untilAge) return out;
    var fb = ctx.federalBefore;
    var room = 0;
    if (s === 'fillBracket') {
      var top = Tables.bracketTop(fb.brackets, c.bracketRate);
      if (top === null) return out;
      room = top + fb.deductions.totalCents + fb.preferentialCents - fb.agiCents;
      out.explain.push('Filling the ' + Math.round(c.bracketRate * 100) + '% bracket: room of ' + dollars(Math.max(0, room)) + ' before the next rate.');
    } else if (s === 'targetMagi') {
      if (c.targetMagiCents === null || c.targetMagiCents === undefined) return out;
      room = Math.round(c.targetMagiCents * ctx.inflator) - fb.magiCents;
      out.explain.push('Converting up to a MAGI of ' + dollars(c.targetMagiCents * ctx.inflator) + '.');
    } else if (s === 'fixed') {
      if (!c.fixedCents) return out;
      room = Math.round(c.fixedCents * ctx.inflator);
      out.explain.push('Converting the set ' + dollars(c.fixedCents) + ' a year in today\'s dollars.');
    }
    out.cents = Math.max(0, Math.min(Math.round(room), ctx.pretaxAvailableCents));
    return out;
  }

  /** Move `cents` from pretax (IRA first, then the workplace plan) into a
      dated Roth layer for the person who holds the money. */
  function apply(state, cents, year) {
    var left = cents, moved = [];
    for (var i = 0; i < state.pretaxIra.length && left > 0; i++) {
      var fromIra = Math.min(left, state.pretaxIra[i]); state.pretaxIra[i] -= fromIra; left -= fromIra;
      var fromK = Math.min(left, state.pretax401k[i]); state.pretax401k[i] -= fromK; left -= fromK;
      var total = fromIra + fromK;
      if (total > 0) { state.rothIra[i].layers.push({ year: year, cents: total }); moved.push({ owner: i, cents: total }); }
    }
    return moved;
  }

  return { amount: amount, apply: apply };
});
