'use strict';
/* Property tests for engines/sidehustle.js (lane 2, section 2, L-2): the generic
   four where a household is taken, plus the opts-only entry point on
   random inputs: no throw, no NaN, whole cents, the same answer twice. */
const H = require('./_harness.js');
const { fc, TABLES, prop, same } = H;
const E = H.engine('sidehustle');
const gen = { cents: fc.integer({ min: 0, max: 100000000 }), small: fc.integer({ min: 0, max: 60 }), rate: fc.integer({ min: 0, max: 500 }).map((n) => n / 1000), filing: fc.constantFrom.apply(null, H.FILING), score: fc.integer({ min: 1, max: 5 }) };
const fields = 'annualRevenueCents=cents,annualExpensesCents=cents,annualHours=small,marginalRate=rate,filingStatus=filing'.split(',').map((f) => f.split('='));
const arbOpts = fc.record(Object.fromEntries(fields.map(([k, g]) => [k, H.maybe(gen[g], 20)])));
const call = (o) => (E.sideHustle.length >= 2 ? E.sideHustle(o, TABLES) : E.sideHustle(o));
const props = H.generic('sidehustle').concat([
  prop('sideHustle on random inputs: no throw, no NaN, whole cents, the same answer twice', arbOpts, (o) => {
    let r;
    try { r = call(o); } catch (e) { return 'threw: ' + e.message; }
    const bad = H.badNumbers(r, 'sideHustle', new Set(), 0);
    if (bad.length) return bad[0];
    const frac = H.fractionalCents(r, 'sideHustle', new Set(), 0);
    if (frac.length) return frac[0];
    return same(r, call(o)) || 'sideHustle differs between calls';
  })
]);
module.exports = H.suite('sidehustle', props);
if (require.main === module) H.main(module.exports);
