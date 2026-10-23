'use strict';
/* Property tests for engines/coast.js (lane 2, section 2, L-2). The four
   generic properties, plus the growth helper's arithmetic and the walk with
   every input handed in. */
const H = require('./_harness.js');
const { fc, prop, Money, TABLES, build, arbSpec } = H;
const C = H.engine('coast');
const rate = fc.integer({ min: 0, max: 120 }).map((n) => n / 1000);

const props = H.generic('coast').concat([
  prop('growing for no months is the identity, and more months never shrink a pot at a non-negative rate', fc.record({ cents: fc.integer({ min: 0, max: 500000000 }), rate, months: fc.integer({ min: 0, max: 600 }) }), (o) => {
    if (C.grow(o.cents, o.rate, 0) !== o.cents) return 'grow(c, r, 0) is ' + C.grow(o.cents, o.rate, 0) + ' for ' + o.cents;
    const a = C.grow(o.cents, o.rate, o.months), b = C.grow(o.cents, o.rate, o.months + 12);
    return b >= a - 1e-6 || ('pot fell from ' + a + ' to ' + b + ' with a year more');
  }),
  prop('with every input handed in, the walk answers: a whole-cent pot at the coast date, or a named reason', fc.record({ spec: arbSpec, age: fc.integer({ min: 20, max: 60 }), years: fc.integer({ min: 1, max: 45 }), fi: fc.integer({ min: 1, max: 500000000 }), inv: fc.integer({ min: 0, max: 500000000 }), contrib: fc.integer({ min: 0, max: 10000000 }), rate }), (o) => {
    const r = C.date(build(o.spec), TABLES, { age: o.age, targetAge: o.age + o.years, fiNumberCents: o.fi, investmentsCents: o.inv, annualContributionCents: o.contrib, returnReal: o.rate });
    if (!Money.isOk(r)) return typeof r.reason === 'string' || 'incomplete without a reason';
    if (r.neverAtThisPace) return r.potAtCoastCents === null || r.potAtCoastCents === undefined || 'a pot at a coast date that never comes';
    if (!Number.isInteger(r.potAtCoastCents)) return 'potAtCoastCents = ' + r.potAtCoastCents;
    if (!(r.months >= 0 && r.months <= o.years * 12)) return 'months = ' + r.months + ' of ' + (o.years * 12);
    return true;
  })
]);
module.exports = H.suite('coast', props);
if (require.main === module) H.main(module.exports);
