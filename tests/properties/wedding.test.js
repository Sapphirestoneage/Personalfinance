'use strict';
/* Property tests for engines/wedding.js (lane 2, section 2, L-2). The four
   generic properties, plus: the build-up adds up, a typed total wins, and
   family help never makes the date later. */
const H = require('./_harness.js');
const { fc, prop, Money, TABLES, arbSpec, build } = H;
const W = H.engine('wedding');

const props = H.generic('wedding').concat([
  prop('guests × per guest + fixed + ring is the total; a typed total wins; family help never lands later', fc.record({ spec: arbSpec, guests: fc.integer({ min: 0, max: 400 }), per: fc.integer({ min: 0, max: 50000 }), fixed: fc.integer({ min: 0, max: 10000000 }), ring: fc.integer({ min: 0, max: 5000000 }), saved: fc.integer({ min: 0, max: 5000000 }), monthly: fc.integer({ min: 0, max: 500000 }), help: fc.integer({ min: 0, max: 5000000 }), typed: fc.option(fc.integer({ min: 0, max: 20000000 }), { nil: null }) }), (o) => {
    const h = build(o.spec);
    const r = W.plan(h, TABLES, { guests: o.guests, perGuestCents: o.per, fixedCents: o.fixed, ringCents: o.ring, savedCents: o.saved, monthlyCents: o.monthly, totalCents: o.typed, from: '2026-09' });
    if (!Money.isOk(r)) return 'not ok: ' + r.reason;
    const want = o.typed === null ? o.guests * o.per + o.fixed + o.ring : o.typed;
    if (r.totalCents !== want) return 'total ' + r.totalCents + ' for ' + want;
    if (r.source !== (o.typed === null ? 'built' : 'typed')) return 'source ' + r.source;
    const helped = W.plan(h, TABLES, { guests: o.guests, perGuestCents: o.per, fixedCents: o.fixed, ringCents: o.ring, savedCents: o.saved, monthlyCents: o.monthly, totalCents: o.typed, familyCents: o.help, from: '2026-09' });
    if (helped.neededCents > r.neededCents) return 'help raised the need';
    if (r.months !== null && (helped.months === null || helped.months > r.months)) return 'help landed later';
    return r.perTableCents === r.tableSize * r.perGuestCents || 'a table is not tableSize guests';
  })
]);
module.exports = H.suite('wedding', props);
if (require.main === module) H.main(module.exports);
