'use strict';
/* Property tests for engines/quickmath.js (lane 2, section 2, L-2). */
const H = require('./_harness.js');
const { fc, Money, prop, same } = H;
const Q = H.engine('quickmath');
const ok = (r) => Money.isOk(r);

const props = H.generic('quickmath').concat([
  prop('switching to a higher-yield account never loses money, and the gain grows with the spread', fc.record({ balance: fc.integer({ min: 0, max: 100000000 }), current: fc.integer({ min: 0, max: 60 }).map((n) => n / 1000), spread: fc.integer({ min: 0, max: 60 }).map((n) => n / 1000), more: fc.integer({ min: 1, max: 30 }).map((n) => n / 1000) }), (o) => {
    const a = Q.hysaSwitch({ balanceCents: o.balance, currentApy: o.current, newApy: o.current + o.spread });
    const b = Q.hysaSwitch({ balanceCents: o.balance, currentApy: o.current, newApy: o.current + o.spread + o.more });
    if (!ok(a) || !ok(b)) return 'incomplete: ' + (a.reason || b.reason);
    if (a.value < 0) return 'negative gain ' + a.value;
    if (b.value < a.value) return 'wider spread, smaller gain: ' + a.value + ' -> ' + b.value;
    return same(a, Q.hysaSwitch({ balanceCents: o.balance, currentApy: o.current, newApy: o.current + o.spread })) || 'differs between calls';
  }),
  prop('cost per use falls, or holds, with more uses', fc.record({ price: fc.integer({ min: 0, max: 10000000 }), uses: fc.integer({ min: 1, max: 1000 }), more: fc.integer({ min: 1, max: 100 }) }), (o) => {
    const a = Q.costPerUse({ priceCents: o.price, uses: o.uses }), b = Q.costPerUse({ priceCents: o.price, uses: o.uses + o.more });
    if (!ok(a) || !ok(b)) return 'incomplete: ' + (a.reason || b.reason);
    return b.value <= a.value || ('more uses, higher cost per use: ' + a.value + ' -> ' + b.value);
  })
]);
module.exports = H.suite('quickmath', props);
if (require.main === module) H.main(module.exports);
