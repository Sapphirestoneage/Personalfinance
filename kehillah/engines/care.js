/* ==========================================================================
   kehillah/engines/care.js, what care costs out of pocket. KD-003.
   --------------------------------------------------------------------------
     Care.read(table, plan, today)
       plan: { insured, deductibleCents, oopMaxCents, items: { id: { cents, covered } },
               hsa: { type, soFarCents }, savedCents, monthlyCents, names: { id: cents } }
       -> {
            rows: [{ id, label, kind, cents, yearCents, covered, entered }],
            coveredYearCents, uncoveredYearCents        sums of entered lines, per year
            outOfPocketCents: ok | incomplete           what you pay this year:
                  covered lines capped at the out-of-pocket maximum (if insured
                  and the max is entered), plus every uncovered line in full
            hsaRoomCents | null                          the year's limit minus what is in so far
            namesCents                                   the sum of the name-change lines entered
            timeline                                     Timeline.monthsTo on outOfPocket + names
          }
   A once-only item counts once; monthly twelve times; yearly once.
   ========================================================================== */
(function (root, factory) {
  var node = typeof module === 'object' && module.exports;
  var Money = node ? require('../shared/money.js') : root.SLAF.Money;
  var Timeline = node ? require('./timeline.js') : root.SLAF.Timeline;
  var api = factory(Money, Timeline);
  if (node) module.exports = api;
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Care = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Timeline) {
  'use strict';
  var TIMES = { once: 1, year: 1, month: 12 };
  function read(table, plan, today) {
    plan = plan || {}; var items = plan.items || {};
    var rows = table.items.map(function (it) {
      var v = items[it.id] || {}; var entered = Money.isEntered(v.cents);
      return { id: it.id, label: it.label, plain: it.plain, kind: it.kind, cents: entered ? v.cents : null, yearCents: entered ? v.cents * TIMES[it.kind] : null,
        covered: v.covered === true ? true : v.covered === false ? false : null, entered: entered, lowCents: it.lowCents, highCents: it.highCents };
    });
    var entered = rows.filter(function (r) { return r.entered; });
    var coveredSum = 0, uncoveredSum = 0, unsaid = 0;
    entered.forEach(function (r) { if (r.covered === true) coveredSum += r.yearCents; else if (r.covered === false) uncoveredSum += r.yearCents; else unsaid++; });
    var oop;
    if (!entered.length) oop = Money.incomplete('nothing entered yet', []);
    else if (unsaid) oop = Money.incomplete('say whether each line is covered', ['covered']);
    else if (coveredSum > 0 && plan.insured !== true && plan.insured !== false) oop = Money.incomplete('say whether you have insurance', ['insured']);
    else if (coveredSum > 0 && plan.insured === true && !Money.isEntered(plan.oopMaxCents)) oop = Money.incomplete('needs the plan\'s out-of-pocket maximum', ['oopMaxCents']);
    else {
      var coveredPay = plan.insured === true ? Math.min(coveredSum, plan.oopMaxCents) : coveredSum;
      oop = Money.ok(coveredPay + uncoveredSum, { coveredPayCents: coveredPay, capped: plan.insured === true && coveredSum > plan.oopMaxCents });
    }
    var hsaRoom = null;
    if (plan.hsa && (plan.hsa.type === 'individual' || plan.hsa.type === 'family') && Money.isEntered(plan.hsa.soFarCents)) {
      hsaRoom = Math.max(0, (plan.hsa.type === 'family' ? table.hsa.familyCents : table.hsa.individualCents) - plan.hsa.soFarCents);
    }
    var names = 0, namesEntered = 0; var nameRows = table.names.map(function (n) {
      var v = plan.names ? plan.names[n.id] : null; var e = Money.isEntered(v); if (e) { names += v; namesEntered++; }
      return { id: n.id, label: n.label, plain: n.plain, cents: e ? v : null, lowCents: n.lowCents, highCents: n.highCents };
    });
    var target = Money.isOk(oop) ? Money.ok(oop.value + names) : oop;
    var timeline = Money.isOk(target) ? Timeline.monthsTo({ targetCents: target.value, savedCents: plan.savedCents, monthlyCents: plan.monthlyCents, from: today }) : Money.incomplete(target.reason, target.missing);
    return { rows: rows, coveredYearCents: coveredSum, uncoveredYearCents: uncoveredSum, outOfPocketCents: oop, hsaRoomCents: hsaRoom,
      namesCents: names, namesEntered: namesEntered, nameRows: nameRows, targetCents: target, timeline: timeline, entered: entered.length };
  }
  return { read: read, TIMES: TIMES };
});
