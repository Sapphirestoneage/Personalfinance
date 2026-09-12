'use strict';
/* Property tests for engines/debates.js (lane 2, section 2, L-2). run takes
   the debate id first, so the generic four do not apply; every debate is run
   on random households: an answer from the three with a sentence, or a
   reason, and never a throw. */
const H = require('./_harness.js');
const { fc, prop, Money, TABLES, arbSpec, build, badNumbers } = H;
const D = H.engine('debates');
const ids = D.list(TABLES).map((d) => d.id);

const props = [
  prop('every debate answers a, b or cantTell with a sentence and a flip point, or says what is missing; the household is untouched', fc.record({ spec: arbSpec, price: fc.integer({ min: 1, max: 200000000 }) }), (o) => {
    const h = build(o.spec);
    const before = JSON.stringify(h);
    for (const id of ids) {
      let r;
      try { r = D.run(id, h, TABLES, { priceCents: o.price }); } catch (e) { return id + ' threw: ' + e.message; }
      const bad = badNumbers(r, id, new Set(), 0);
      if (bad.length) return bad[0];
      if (Money.isOk(r)) {
        if (['a', 'b', 'cantTell'].indexOf(r.value) < 0) return id + ' answered ' + r.value;
        if (typeof r.sentence !== 'string' || !r.flip || typeof r.flip.words !== 'string') return id + ' without a sentence or flip point';
        if (/you should/i.test(r.sentence)) return id + ' says you should';
      } else if (typeof r.reason !== 'string') return id + ' incomplete without a reason';
    }
    return JSON.stringify(h) === before || 'a debate changed the household';
  })
];
module.exports = H.suite('debates', props);
if (require.main === module) H.main(module.exports);
