/* ==========================================================================
   engines/cliff.js — the benefits cliff: what a raise takes away.
   DECISIONS.md D-296.
   --------------------------------------------------------------------------
   A means-tested benefit ends at a multiple of the poverty line, and a raise
   that crosses the line can cost more than it pays. This reads the lines
   from data/benefit_cliffs_2026.json, the poverty guideline and the
   marketplace schedule from data/aca_2026.json (through Tax.acaCliff, the
   one place that schedule is walked), the state's benchmark premium from
   data/states.json, and says for THIS household: where each line sits, how
   far the income is from it, and what a given raise crosses.
     where(household, tables, opts)   → Result: value = lines crossed by the
                                        raise; programs[], fpl, magi, raise
   opts: magiCents (else gross annual income), raiseCents (else 0),
         householdSize (else the people on the household).
   Empty is not zero: no income → incomplete, never "eligible for all".
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('../shared/money.js'), Schema: require('../shared/schema.js'), Tax: require('./tax.js'), RothAca: require('./rothaca.js') };
  } else {
    var S = root.SLAF || {};
    deps = { Money: S.Money, Schema: S.Schema, Tax: S.Tax, RothAca: S.RothAca };
  }
  var api = factory(deps.Money, deps.Schema, deps.Tax, deps.RothAca);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Cliff = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Tax, RothAca) {
  'use strict';
  var MONTHS = 12;

  function fplCents(aca, size) {
    var f = aca && aca.fpl;
    if (!f || !Money.isEntered(f.base)) return null;
    return Math.round((f.base + f.perAdditionalPerson * Math.max(0, size - 1)) * 100);
  }
  function benchmarkAnnualCents(tables, state) {
    var t = tables && tables.states;
    if (!t || !state) return null;
    var byCode = Schema.statesByCode ? Schema.statesByCode(tables) : null;
    var row = byCode && byCode[state];
    var v = row && row.acaBenchmarkSilver40MonthlyCents;
    var cents = v && Money.isEntered(v.value) ? v.value : (Money.isEntered(v) ? v : null);
    return cents === null ? null : cents * MONTHS;
  }

  function where(household, tables, opts) {
    var h = household || {}, T = tables || {}, o = opts || {};
    if (!T.benefitCliffs) return Money.incomplete('The benefit-cliffs table is not loaded.', ['benefitCliffs']);
    if (!T.aca) return Money.incomplete('The marketplace table is not loaded.', ['aca']);
    var gross = Schema.grossAnnualIncomeCents(h);
    var magi = Money.isEntered(o.magiCents) ? o.magiCents : (Money.isOk(gross) ? gross.value : null);
    if (magi === null) return Money.incomplete('Add your income in Start Here to place it against the lines.', ['grossAnnualIncome']);
    var size = Money.isEntered(o.householdSize) ? o.householdSize : Math.max(1, ((h.people || []).length) || 1);
    var fpl = fplCents(T.aca, size);
    if (fpl === null) return Money.incomplete('The poverty guideline is missing from the marketplace table.', ['aca']);
    var raise = Money.isEntered(o.raiseCents) ? Math.max(0, o.raiseCents) : 0;
    var after = magi + raise;
    var state = h.state || null;
    var bench = benchmarkAnnualCents(T, state);

    var programs = (T.benefitCliffs.programs || []).map(function (p) {
      var out = { id: p.id, label: p.label, kind: p.kind, note: p.note, applies: true, whyNot: null };
      if (p.id === 'acaSubsidy') {
        /* The schedule lives in aca_2026.json and Tax.acaCliff walks it; the
           premium in dollars needs the state's benchmark, which is the
           40-year-old silver plan and is said to be. */
        var before = Tax.acaCliff(T.aca, magi, size), then = Tax.acaCliff(T.aca, after, size);
        out.fplMultiple = T.aca.cliffMultiple;
        out.lineCents = Math.round(fpl * T.aca.cliffMultiple);
        out.distanceCents = out.lineCents - magi;
        out.crossed = Money.isOk(before) && Money.isOk(then) && !before.overCliff && then.overCliff;
        if (bench !== null && RothAca && RothAca.premiumFor) {
          var pb = RothAca.premiumFor(T.aca, magi, size, bench, true), pa = RothAca.premiumFor(T.aca, after, size, bench, true);
          if (pb && pa) {
            out.helpBeforeCents = bench - pb.cents; out.helpAfterCents = bench - pa.cents;
            out.lostCents = Math.max(0, out.helpBeforeCents - out.helpAfterCents);
            out.benchmarkAnnualCents = bench; out.benchmarkNote = 'the state’s benchmark silver plan for a 40-year-old';
          }
        } else {
          out.lostCents = null; out.lostWhy = state ? 'No benchmark premium on file for ' + state + '.' : 'Add your state in Start Here to price the help in dollars.';
        }
        return out;
      }
      out.fplMultiple = p.fplMultiple;
      out.lineCents = Math.round(fpl * p.fplMultiple);
      out.distanceCents = out.lineCents - magi;
      out.crossed = magi <= out.lineCents && after > out.lineCents;
      out.above = magi > out.lineCents;
      if (p.nonExpansionStates && state && p.nonExpansionStates.indexOf(state) !== -1) {
        out.applies = false; out.whyNot = p.label + ' has not been expanded in ' + state + ' (' + p.nonExpansionNote + ')';
      }
      return out;
    });
    var crossed = programs.filter(function (p) { return p.applies && p.crossed; });
    return Money.ok(crossed.length, {
      magiCents: magi, raiseCents: raise, afterCents: after, householdSize: size,
      fplCents: fpl, fplMultiple: Math.round(magi / fpl * 100) / 100,
      programs: programs, crossed: crossed.map(function (p) { return p.id; }),
      lostCents: crossed.reduce(function (s, p) { return s + (Money.isEntered(p.lostCents) ? p.lostCents : 0); }, 0),
      state: state, referenceVersion: T.benefitCliffs.version
    });
  }

  return { where: where, fplCents: fplCents };
});
