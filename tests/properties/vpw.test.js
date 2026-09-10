'use strict';
/* Property tests for engines/vpw.js (lane 2, section 2, L-2). */
const H = require('./_harness.js');
const { fc, Money, TABLES, prop, same } = H;
const V = H.engine('vpw');
const ok = (r) => Money.isOk(r);
const share = fc.constantFrom(0, 0.2, 0.4, 0.5, 0.6, 0.8, 1);

const props = [
  prop('the withdrawal percentage sits in (0, 1] and never falls with age', fc.record({ age: fc.integer({ min: 40, max: 99 }), share }), (o) => {
    const a = V.percentageAt(TABLES.vpwTable, o.age, o.share), b = V.percentageAt(TABLES.vpwTable, o.age + 1, o.share);
    if (!(a > 0 && a <= 1)) return 'percentage at ' + o.age + ' is ' + a;
    return b >= a || ('percentage fell from ' + a + ' at ' + o.age + ' to ' + b + ' at ' + (o.age + 1));
  }),
  prop('a plan never throws, never returns NaN, and is the same twice', fc.record({ portfolio: fc.integer({ min: 0, max: 1000000000 }), retireAge: fc.integer({ min: 45, max: 80 }), realReturn: fc.integer({ min: -20, max: 80 }).map((n) => n / 1000), spend: fc.integer({ min: 0, max: 50000000 }), share }), (o) => {
    const args = { table: TABLES.vpwTable, portfolioCents: o.portfolio, retireAge: o.retireAge, realReturn: o.realReturn, annualSpendCents: o.spend, stockShare: o.share };
    let r;
    try { r = V.plan(args); } catch (e) { return 'threw: ' + e.message; }
    const bad = H.badNumbers(r, 'plan', new Set(), 0);
    if (bad.length) return bad[0];
    const frac = H.fractionalCents(r, 'plan', new Set(), 0);
    if (frac.length) return frac[0];
    return same(r, V.plan(args)) || 'plan differs between calls';
  })
];
module.exports = H.suite('vpw', props);
if (require.main === module) H.main(module.exports);
