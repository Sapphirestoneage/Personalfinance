'use strict';
/* Property tests for shared/levers.js (lane 2, section 2, L-2): not an
   engine, but the thing "applying then removing a lever" is about. */
const H = require('./_harness.js');
const { fc, Money, Schema, TABLES, build, buildComplete, arbSpec, arbCompleteSpec, prop, same } = H;
const L = require(H.ROOT + '/shared/levers.js');
L.use(TABLES.levers);
const ids = (L.all() || []).map((x) => x.id);
const arbId = fc.constantFrom.apply(null, ids.length ? ids : ['steady']);

const props = [
  prop('applying a lever never touches the household it was given', fc.tuple(arbSpec, arbId, fc.constantFrom(0, 0.5, 1)), ([spec, id, scale]) => {
    const h = build(spec);
    const before = JSON.stringify(h);
    L.apply(id, h, { scale });
    return JSON.stringify(h) === before || (id + ' changed the household in place');
  }),
  prop('a lever at scale 0 changes no number: only the record of its application', fc.tuple(arbSpec, arbId), ([spec, id]) => {
    const h = build(spec);
    const out = L.apply(id, h, { scale: 0 });
    const strip = (x) => { const y = JSON.parse(JSON.stringify(x)); delete y.meta.leversApplied; if (y.people) y.people.forEach((p) => { p.incomeSources = (p.incomeSources || []).filter((s) => !s.lever || Money.isEntered(s.grossAnnualIncomeCents) && s.grossAnnualIncomeCents !== 0); }); return y; };
    return same(strip(Schema.createHousehold(JSON.parse(JSON.stringify(h)))), strip(out)) || (id + ' at scale 0 changed a number');
  }, 'A zero-scale extra-income lever still adds a $0 source; it is stripped before comparing.'),
  prop('the same lever applied twice to the same household gives the same household', fc.tuple(arbCompleteSpec, arbId), ([s, id]) => {
    const h = buildComplete(s);
    return same(L.apply(id, h), L.apply(id, h)) || 'apply differs between calls';
  })
];
module.exports = H.suite('levers', props, [
  'There is no remove(): a lever returns a new household and the original is untouched, so "apply then remove is byte-identical" is held as "the input is byte-identical after apply" plus "scale 0 changes nothing".'
]);
if (require.main === module) H.main(module.exports);
