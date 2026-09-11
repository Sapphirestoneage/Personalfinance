'use strict';
/* Property tests for engines/rankguess.js (lane 2, section 2, L-2). Neither
   function is household-first, so the generic four do not apply; the band
   and the comparison are checked directly. */
const H = require('./_harness.js');
const { fc, prop, TABLES, arbSpec, build, same } = H;
const R = H.engine('rankguess');

const props = [
  prop('every percentile from 0 to 100 falls in exactly one band, and the bands rise with it', fc.integer({ min: 0, max: 100 }), (p) => {
    const b = R.band(p);
    if (!b) return 'no band for ' + p;
    if (!(b.from <= p && p < b.to)) return p + ' outside its band ' + b.id;
    const next = R.band(Math.min(100, p + 1));
    return R.BANDS.indexOf(next) >= R.BANDS.indexOf(b) || ('band fell from ' + b.id + ' to ' + next.id);
  }),
  prop('a comparison never throws, is the same twice, and is either incomplete with a reason or names both bands', fc.record({ spec: arbSpec, guess: fc.integer({ min: 0, max: 100 }) }), (o) => {
    const h = build(o.spec);
    let r;
    try { r = R.compare(o.guess, h, TABLES); } catch (e) { return 'threw: ' + e.message; }
    if (!same(r, R.compare(o.guess, h, TABLES))) return 'differs between calls';
    if (r.status === 'incomplete') return typeof r.reason === 'string' || 'incomplete without a reason';
    if (!r.guess || !r.real) return 'compared without both bands';
    if (r.same !== (r.guess.id === r.real.id)) return 'same flag disagrees with the bands';
    return ['same', 'guessedHigher', 'guessedLower'].indexOf(r.direction) >= 0 || ('direction ' + r.direction);
  })
];
module.exports = H.suite('rankguess', props);
if (require.main === module) H.main(module.exports);
