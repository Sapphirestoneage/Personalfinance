'use strict';
/* Property tests for engines/decumulation.js (lane 2, section 2, L-2). */
const H = require('./_harness.js');
const { fc, prop } = H;
const D = H.engine('decumulation');

const props = H.generic('decumulation').concat([
  prop('a draw path never ends higher with a lower return, and a bigger draw never ends higher', fc.record({ start: fc.integer({ min: 0, max: 500000000 }), draw: fc.integer({ min: 0, max: 20000000 }), rate: fc.integer({ min: -50, max: 150 }).map((n) => n / 1000), years: fc.integer({ min: 1, max: 40 }), moreRate: fc.integer({ min: 1, max: 40 }).map((n) => n / 1000), moreDraw: fc.integer({ min: 1, max: 5000000 }) }), (o) => {
    const last = (p) => p[p.length - 1].balanceCents;
    const a = D.drawPath(o.start, o.draw, o.rate, o.years);
    const higherRate = D.drawPath(o.start, o.draw, o.rate + o.moreRate, o.years);
    const biggerDraw = D.drawPath(o.start, o.draw + o.moreDraw, o.rate, o.years);
    if (a.length > o.years + 1 || (o.start > 0 && last(a) > 0 && a.length !== o.years + 1)) return 'path has ' + a.length + ' rows for ' + o.years + ' years';
    if (last(higherRate) < last(a)) return 'higher rate ended lower: ' + last(a) + ' -> ' + last(higherRate);
    if (last(biggerDraw) > last(a)) return 'bigger draw ended higher: ' + last(a) + ' -> ' + last(biggerDraw);
    for (const row of a) if (!Number.isInteger(row.balanceCents)) return 'fractional cents at year ' + row.year;
    return true;
  })
]);
module.exports = H.suite('decumulation', props, [
  'Sequence of returns (a bad-early ending pot at most a good-early one at equal average return) has no engine to hold it to: drawPath, vpw.plan, projection.pathCents and windfall.run all take one constant rate. Deferred until an engine consumes a return sequence.'
]);
if (require.main === module) H.main(module.exports);
