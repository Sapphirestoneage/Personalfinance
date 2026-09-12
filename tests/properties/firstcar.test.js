'use strict';
/* Property tests for engines/firstcar.js (lane 2, section 2, L-2). The four
   generic properties, plus: three parts, each inside or outside, the gap to
   the price that fits is never negative, and the depreciation curve never
   rises. (The price that fits is at the rule's own term and rate, so a
   shorter, cheaper loan can sit inside all three above it.) */
const H = require('./_harness.js');
const { fc, prop, Money, TABLES, arbCompleteSpec, buildComplete } = H;
const F = H.engine('firstcar');

const props = H.generic('firstcar').concat([
  prop('three parts, inside or outside; the count is the parts inside; the gap is never negative; the curve never rises', fc.record({ spec: arbCompleteSpec, price: fc.integer({ min: 1, max: 15000000 }), down: fc.integer({ min: 0, max: 5000000 }), term: fc.integer({ min: 12, max: 84 }), rate: fc.integer({ min: 0, max: 150 }).map((n) => n / 1000), ins: fc.integer({ min: 0, max: 50000 }), gas: fc.integer({ min: 0, max: 50000 }) }), (o) => {
    const r = F.check(buildComplete(o.spec), TABLES, { priceCents: o.price, downCents: Math.min(o.down, o.price), termMonths: o.term, loanRate: o.rate, insuranceMonthlyCents: o.ins, gasMonthlyCents: o.gas });
    if (!Money.isOk(r)) return typeof r.reason === 'string' || 'incomplete without a reason';
    if (r.parts.length !== 3 || !r.parts.every((p) => typeof p.inside === 'boolean')) return 'parts ' + JSON.stringify(r.parts.map((p) => p.inside));
    if (r.value !== r.parts.filter((p) => p.inside).length) return 'the count is not the parts inside';
    if (r.maxAffordablePriceCents !== null && !Number.isInteger(r.maxAffordablePriceCents)) return 'a fractional price that fits';
    if (r.gapCents !== null && r.gapCents < 0) return 'a negative gap';
    for (let y = 0; y < 10; y++) if (F.retained(TABLES.carCosts, y + 1) > F.retained(TABLES.carCosts, y)) return 'the curve rose at year ' + (y + 1);
    return true;
  })
]);
module.exports = H.suite('firstcar', props);
if (require.main === module) H.main(module.exports);
