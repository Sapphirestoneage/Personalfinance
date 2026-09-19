'use strict';
/* Property tests for engines/race.js (lane 2, section 2, L-2). The four
   generic properties, plus: rungs climb by $100K, each is dated no earlier
   than the one before, and saving plus growth adds to the rung. */
const H = require('./_harness.js');
const { fc, prop, Money, TABLES, arbCompleteSpec, buildComplete } = H;
const R = H.engine('race');

const props = H.generic('race').concat([
  prop('every rung is $100K above the last, dated no earlier, and its saving plus growth is the climb', fc.record({ spec: arbCompleteSpec, monthly: fc.integer({ min: 0, max: 1000000 }) }), (o) => {
    const r = R.rungs(buildComplete(o.spec), TABLES, { monthlyContributionCents: o.monthly, from: '2026-09' });
    if (!Money.isOk(r)) return typeof r.reason === 'string' || 'incomplete without a reason';
    if (r.pastTop) return r.rows.length === 0 || 'rows past the top';
    let prevCents = r.startCents, prevMonths = 0;
    for (const x of r.rows) {
      if (x.rungCents % R.RUNG_CENTS !== 0) return 'rung ' + x.rungCents;
      if (x.months < prevMonths) return 'rung ' + x.rungCents + ' dated before the one before';
      if (x.contributedCents + x.grownCents !== x.rungCents - prevCents) return 'saving plus growth is not the climb at ' + x.rungCents;
      prevCents = x.rungCents; prevMonths = x.months;
    }
    if (r.neverAtThisPace) return (r.rows.length === 0 && r.monthlyNeededCents > 0) || 'never, yet rungs or no honest figure';
    return true;
  })
]);
module.exports = H.suite('race', props);
if (require.main === module) H.main(module.exports);
