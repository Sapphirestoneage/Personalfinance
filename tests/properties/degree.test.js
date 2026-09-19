'use strict';
/* Property tests for engines/degree.js (lane 2, section 2, L-2). The four
   generic properties, plus: the cost adds up, no gain never breaks even,
   employer help never makes break-even later, and the ranges are ordered. */
const H = require('./_harness.js');
const { fc, prop, Money, TABLES, arbSpec, build } = H;
const D = H.engine('degree');

const props = H.generic('degree').concat([
  prop('the cost adds up, ranges are ordered, no gain never breaks even, employer help never breaks even later', fc.record({ spec: arbSpec, age: fc.integer({ min: 18, max: 60 }), tuition: fc.integer({ min: 0, max: 30000000 }), years: fc.integer({ min: 1, max: 6 }), withLow: fc.integer({ min: 0, max: 40000000 }), withSpan: fc.integer({ min: 0, max: 10000000 }), without: fc.integer({ min: 0, max: 40000000 }), help: fc.integer({ min: 0, max: 30000000 }) }), (o) => {
    const h = build(o.spec);
    const base = { age: o.age, tuitionCents: o.tuition, years: o.years, withLowCents: o.withLow, withHighCents: o.withLow + o.withSpan, withoutLowCents: o.without, withoutHighCents: o.without };
    const r = D.decide(h, TABLES, base);
    if (!Money.isOk(r)) return 'not ok: ' + r.reason;
    if (r.costCents !== o.tuition + Math.round(o.without * o.years) + 0) return 'cost ' + r.costCents;
    if (r.gainLowCents > r.gainHighCents) return 'gain low above high';
    if (r.lifetimeLowCents > r.lifetimeHighCents) return 'lifetime low above high';
    if (r.gainMidCents <= 0 && r.breakEvenAge !== null) return 'breaks even with no gain';
    if (r.breakEvenAge !== null && r.breakEvenAge < r.doneAt) return 'breaks even before finishing';
    const helped = D.decide(h, TABLES, Object.assign({}, base, { employerHelpCents: o.help }));
    if (helped.costCents > r.costCents) return 'help raised the cost';
    if (r.breakEvenAge !== null && (helped.breakEvenAge === null || helped.breakEvenAge > r.breakEvenAge)) return 'help made break-even later';
    return true;
  })
]);
module.exports = H.suite('degree', props);
if (require.main === module) H.main(module.exports);
