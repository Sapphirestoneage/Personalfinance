/* ==========================================================================
   engines/advicerules.js — does the rule apply to you now? D-212 (H5).
   --------------------------------------------------------------------------
   data/advice.json holds the popular rules with their sources and the
   conditions, written over existing rows, under which each APPLIES NOW,
   is NOT YET relevant, or has been OUTGROWN. This reads the rows and says
   which, with the one-line reason; a rule with a blank input says can't
   tell yet and names the number that would decide it.

     AdviceRules.readings(h, tables)  → { id: value | null }
     AdviceRules.judge(rule, readings) → { status, why, missing }
     AdviceRules.list(h, tables)      → every rule with its status

   Statuses: appliesNow, notYet, outgrown, cantTell.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('../shared/money.js'), Schema: require('../shared/schema.js'), Tier0: require('./tier0.js'), Foo: require('./foo.js'),
      Ratios: (function () { try { return require('./ratios.js'); } catch (e) { return null; } })() };
  } else {
    deps = { Money: root.SLAF && root.SLAF.Money, Schema: root.SLAF && root.SLAF.Schema, Tier0: root.SLAF && root.SLAF.Tier0, Foo: root.SLAF && root.SLAF.Foo, Ratios: root.SLAF && root.SLAF.Ratios };
  }
  var api = factory(deps.Money, deps.Schema, deps.Tier0, deps.Foo, deps.Ratios);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.AdviceRules = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Tier0, Foo, Ratios) {
  'use strict';
  var STATUSES = ['appliesNow', 'notYet', 'outgrown', 'cantTell'];
  var LABELS = { appliesNow: 'Applies now', notYet: 'Not yet', outgrown: 'Outgrown', cantTell: 'Can’t tell yet' };
  function val(r) { return r && Money.isOk(r) ? r.value : null; }
  /** Every reading a rule may name, null where the household cannot say. */
  function readings(household, tables) {
    var h = household || {}, T = tables || {};
    var out = {};
    out.age = Schema.primaryAge(h);
    var p = Schema.primaryPerson(h);
    out.situation = p && p.employmentStatus ? p.employmentStatus : null;
    var sr = Tier0.savingsRate(h, T);
    out.savingsRate = val(Money.isOk(sr.includingMatch) ? sr.includingMatch : sr.excludingMatch);
    out.fiProgress = val(Tier0.fireProgress(h, T));
    out.yearsToFire = val(Tier0.yearsToFire(h, T));
    out.emergencyMonths = val(Tier0.emergencyFundMonths(h));
    out.debtToIncome = val(Tier0.debtToIncome(h));
    out.investmentsCents = val(Schema.investmentsCents(h));
    var thr = T.fooRules && T.fooRules.thresholds ? T.fooRules.thresholds : { highInterestDebtRate: 0.075 };
    var hi = Foo.highInterestDebts(h, thr);
    out.highInterestDebtCents = hi.unrated.length && !hi.above.length ? null : hi.above.reduce(function (s, d) { return s + d.balanceCents; }, 0);
    var take = Schema.takeHomeAnnualCents(h, T);
    var wants = ((h.expenses || {}).wants || {}).totalCents;
    out.wantsShare = Money.isOk(take) && take.value > 0 && Money.isEntered(wants) ? (wants * 12) / take.value : null;
    var mort = (h.debts || []).filter(function (d) { return d.type === 'mortgage' && Money.isEntered(d.rate) && d.archived !== true; });
    out.mortgageRate = mort.length ? Math.max.apply(null, mort.map(function (d) { return d.rate; })) : null;
    out.withdrawalRate = null;
    if (Ratios && Ratios.all) {
      var row = Ratios.all(h, T, {}).rows.filter(function (r) { return r.id === 'withdrawalRate'; })[0];
      if (row && row.ok && row.result && Money.isOk(row.result) && !row.result.covered) out.withdrawalRate = row.result.value;
    }
    return out;
  }
  var OPS = {
    '<': function (a, b) { return a < b; }, '<=': function (a, b) { return a <= b; }, '>': function (a, b) { return a > b; }, '>=': function (a, b) { return a >= b; },
    '==': function (a, b) { return a === b; }, '!=': function (a, b) { return a !== b; }
  };
  function holds(conds, R) {
    if (!conds || !conds.length) return { ok: false, missing: [] };
    var missing = [];
    var ok = conds.every(function (c) {
      var v = R[c[0]];
      if (v === null || v === undefined) { missing.push(c[0]); return false; }
      var op = OPS[c[1]];
      return op ? op(v, c[2]) : false;
    });
    return { ok: ok && !missing.length, missing: missing };
  }
  function judge(rule, R) {
    var order = ['outgrown', 'appliesNow', 'notYet'];
    var missing = [];
    for (var i = 0; i < order.length; i++) {
      var k = order[i];
      var r = holds(rule[k], R);
      if (r.ok) return { status: k, why: (rule.why || {})[k] || '', missing: [] };
      r.missing.forEach(function (m) { if (missing.indexOf(m) === -1) missing.push(m); });
    }
    if (missing.length) return { status: 'cantTell', why: 'Can’t tell yet: it needs ' + missing.join(' and ') + '.', missing: missing, decidedBy: rule.decidedBy || null };
    /* Every reading present, no list holds: the rule has nothing to say here. */
    return { status: 'notYet', why: (rule.why || {}).notYet || 'Nothing in your numbers puts this rule in play.', missing: [] };
  }
  function list(household, tables) {
    var T = tables || {};
    var rules = (T.advice && T.advice.rules) || [];
    var R = readings(household, T);
    return rules.map(function (rule) {
      var j = judge(rule, R);
      return { id: rule.id, name: rule.name, said: rule.said, source: rule.source, status: j.status, label: LABELS[j.status], why: j.why, missing: j.missing, decidedBy: j.decidedBy || rule.decidedBy || null };
    });
  }
  return { STATUSES: STATUSES, LABELS: LABELS, readings: readings, judge: judge, list: list };
});
