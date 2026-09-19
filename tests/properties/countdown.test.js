'use strict';
/* Property tests for engines/countdown.js (lane 2, section 2, L-2). The one
   countdown takes no household, so the generic four do not apply; the walk
   is checked directly: never before it is reached, never after a bigger
   contribution, whole months, and the honest monthly figure lands. */
const H = require('./_harness.js');
const { fc, prop, Money } = H;
const C = H.engine('countdown');
const rate = fc.integer({ min: 0, max: 120 }).map((n) => n / 1000);

const props = [
  prop('already there reads reached now; nothing in and nothing growing reads never; else whole months forward', fc.record({ target: fc.integer({ min: 0, max: 100000000 }), saved: fc.integer({ min: 0, max: 100000000 }), monthly: fc.integer({ min: 0, max: 500000 }), rate }), (o) => {
    const r = C.goalCountdown({ targetCents: o.target, savedCents: o.saved, monthlyContributionCents: o.monthly, annualRate: o.rate, from: '2026-09' });
    if (!Money.isOk(r)) return 'not ok: ' + r.reason;
    if (o.saved >= o.target) return (r.reachedNow && r.months === 0) || 'reached but not now';
    if (o.monthly === 0 && o.rate === 0) return (r.neverAtThisPace && r.months === null && r.date === null) || 'never, but a date';
    if (r.neverAtThisPace) return r.months === null || 'never with months';
    return (Number.isInteger(r.months) && r.months > 0 && /^\d{4}-\d{2}$/.test(r.date)) || ('months ' + r.months + ' date ' + r.date);
  }),
  prop('a bigger monthly contribution never lands later, and the bands order the range', fc.record({ target: fc.integer({ min: 1, max: 100000000 }), saved: fc.integer({ min: 0, max: 50000000 }), monthly: fc.integer({ min: 1, max: 500000 }), extra: fc.integer({ min: 0, max: 500000 }) }), (o) => {
    const a = C.goalCountdown({ targetCents: o.target, savedCents: o.saved, monthlyContributionCents: o.monthly, annualRate: 0.05, bands: { p25: 0.02, p50: 0.05, p75: 0.08 } });
    const b = C.goalCountdown({ targetCents: o.target, savedCents: o.saved, monthlyContributionCents: o.monthly + o.extra, annualRate: 0.05, bands: { p25: 0.02, p50: 0.05, p75: 0.08 } });
    if (a.months !== null && b.months !== null && b.months > a.months) return 'more a month landed later: ' + a.months + ' then ' + b.months;
    if (a.months !== null && b.months === null) return 'more a month never lands';
    if (a.months !== null && a.range.fastMonths !== null && a.range.slowMonths !== null && !(a.range.fastMonths <= a.months && a.months <= a.range.slowMonths)) return 'range out of order ' + JSON.stringify(a.range);
    return true;
  }),
  prop('the honest monthly figure lands within the months it was asked for', fc.record({ target: fc.integer({ min: 1, max: 100000000 }), saved: fc.integer({ min: 0, max: 50000000 }), months: fc.integer({ min: 1, max: 360 }), rate }), (o) => {
    const m = C.monthlyNeededCents(o.target, o.saved, o.rate, o.months);
    if (!Number.isInteger(m) || m < 0) return 'monthly ' + m;
    const landed = C.monthsTo(o.target, o.saved, m, o.rate, o.months + 1);
    return (landed !== null && landed <= o.months) || ('asked for ' + o.months + ' months, landed ' + landed + ' at ' + m);
  })
];
module.exports = H.suite('countdown', props);
if (require.main === module) H.main(module.exports);
