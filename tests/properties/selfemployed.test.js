'use strict';
/* Property tests for engines/selfemployed.js (lane 2, section 2, L-2). */
const H = require('./_harness.js');
const { fc, Money, TABLES, prop } = H;
const SE = H.engine('selfemployed');
const ok = (r) => Money.isOk(r);

const props = H.generic('selfemployed').concat([
  prop('self-employment tax is at most 15.3% of net profit plus the additional Medicare tax, never negative, never falls as profit rises', fc.record({ net: fc.integer({ min: -100000, max: 100000000 }), more: fc.integer({ min: 1, max: 5000000 }), fs: fc.constantFrom.apply(null, H.FILING) }), (o) => {
    const a = SE.selfEmploymentTax(o.net, o.fs, TABLES.seTax), b = SE.selfEmploymentTax(o.net + o.more, o.fs, TABLES.seTax);
    if (!ok(a) || !ok(b)) return 'incomplete: ' + (a.reason || b.reason);
    if (a.value < 0) return 'negative SE tax';
    if (o.net <= 0 && a.value !== 0) return 'no profit, tax ' + a.value;
    if (a.value > Math.ceil(Math.max(0, o.net) * (0.153 + 0.009)) + 2) return 'SE tax ' + a.value + ' above 16.2% of ' + o.net;
    if (b.value < a.value) return 'more profit, less SE tax: ' + a.value + ' -> ' + b.value;
    return true;
  })
]);
module.exports = H.suite('selfemployed', props);
if (require.main === module) H.main(module.exports);
