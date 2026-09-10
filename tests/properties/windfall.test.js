'use strict';
/* Property tests for engines/windfall.js (lane 2, section 2, L-2). */
const H = require('./_harness.js');
const { fc, prop, same } = H;
const W = H.engine('windfall');

const props = [
  prop('investing at once beats spreading it out whenever the market rate is at least the cash rate', fc.record({ amount: fc.integer({ min: 100, max: 100000000 }), months: fc.integer({ min: 1, max: 36 }), rate: fc.integer({ min: 0, max: 150 }).map((n) => n / 1000), cashBelow: fc.integer({ min: 0, max: 100 }).map((n) => n / 1000) }), (o) => {
    const cash = Math.max(0, o.rate - o.cashBelow);
    const r = W.run(o.amount, o.months, o.rate, cash);
    if (!(isFinite(r.lump) && isFinite(r.spread))) return 'NaN in the run';
    if (r.path.length !== o.months) return 'path has ' + r.path.length + ' rows for ' + o.months + ' months';
    return r.lump >= r.spread - 1 || ('lump ' + r.lump + ' < spread ' + r.spread + ' with market ' + o.rate + ' and cash ' + cash);
  }),
  prop('the same input gives the same run twice, and every path cell is whole cents', fc.record({ amount: fc.integer({ min: 100, max: 10000000 }), months: fc.integer({ min: 1, max: 24 }), rate: fc.integer({ min: 0, max: 150 }).map((n) => n / 1000), cash: fc.integer({ min: 0, max: 60 }).map((n) => n / 1000) }), (o) => {
    const a = W.run(o.amount, o.months, o.rate, o.cash);
    if (!same(a, W.run(o.amount, o.months, o.rate, o.cash))) return 'run differs between calls';
    const frac = H.fractionalCents(a.path, 'path', new Set(), 0);
    return !frac.length || frac[0];
  })
];
module.exports = H.suite('windfall', props, [
  'run() returns `lump` and `spread` as fractional cents while the path rows are rounded; only the rows carry a Cents suffix, so the generic whole-cents check does not see the two headline figures. Recorded here rather than as a failure because the field names do not claim to be cents.'
]);
if (require.main === module) H.main(module.exports);
