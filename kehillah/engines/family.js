/* ==========================================================================
   kehillah/engines/family.js, what a family costs and when. KD-003.
   --------------------------------------------------------------------------
     Family.read(table, plan, today)
       plan: { path, tries, perTryCents, onceCents, coveredCents, savedCents, monthlyCents, afterward: { id: cents } }
       -> {
            path,                                   the table row or null
            costCents: ok | incomplete              tries * perTry + once
            creditCents                             the adoption credit, if the path takes it, else 0
            coveredCents                            what insurance or a grant pays, or 0 if blank
            targetCents: ok | incomplete            cost - covered - credit, never below 0
            afterwardCents                          the sum of the "afterward" lines entered
            timeline                                Timeline.monthsTo on the target
          }
   The person types the per-try cost and the tries; the table's ranges are
   shown beside the box as a guide and never used as a number.
   ========================================================================== */
(function (root, factory) {
  var node = typeof module === 'object' && module.exports;
  var Money = node ? require('../shared/money.js') : root.SLAF.Money;
  var Timeline = node ? require('./timeline.js') : root.SLAF.Timeline;
  var api = factory(Money, Timeline);
  if (node) module.exports = api;
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Family = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Timeline) {
  'use strict';
  function read(table, plan, today) {
    plan = plan || {};
    var path = null; table.paths.forEach(function (p) { if (p.id === plan.path) path = p; });
    var cost;
    if (!path) cost = Money.incomplete('choose a path', ['path']);
    else {
      var perTryNeeded = path.perTryHighCents > 0;
      var req = { onceCents: plan.onceCents };
      if (perTryNeeded) { req.tries = plan.tries; req.perTryCents = plan.perTryCents; }
      var missing = Money.missingFrom(req);
      if (missing.length) cost = Money.incomplete('needs ' + (perTryNeeded ? 'the cost of one try, how many tries, and the one-time costs' : 'the one-time costs'), missing);
      else cost = Money.ok((perTryNeeded ? plan.tries * plan.perTryCents : 0) + plan.onceCents);
    }
    var credit = path && path.credit ? table.adoptionCreditCents : 0;
    var covered = Money.isEntered(plan.coveredCents) ? plan.coveredCents : 0;
    var target = Money.isOk(cost) ? Money.ok(Math.max(0, cost.value - covered - credit)) : cost;
    var after = 0; var afterRows = table.afterward.map(function (a) {
      var v = plan.afterward ? plan.afterward[a.id] : null; var e = Money.isEntered(v); if (e) after += v;
      return { id: a.id, label: a.label, plain: a.plain, cents: e ? v : null, lowCents: a.lowCents, highCents: a.highCents };
    });
    var timeline = Money.isOk(target) ? Timeline.monthsTo({ targetCents: target.value, savedCents: plan.savedCents, monthlyCents: plan.monthlyCents, from: today }) : Money.incomplete(target.reason, target.missing);
    return { path: path, costCents: cost, creditCents: credit, coveredCents: covered, targetCents: target, afterwardCents: after, afterwardRows: afterRows, timeline: timeline };
  }
  return { read: read };
});
