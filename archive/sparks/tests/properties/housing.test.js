'use strict';
/* Property tests for engines/housing.js (lane 2, section 2, L-2). */
const H = require('./_harness.js');
const { fc, Money, prop } = H;
const Housing = H.engine('housing');
const ok = (r) => Money.isOk(r);

const props = H.generic('housing').concat([
  prop('a mortgage payment repays the principal and rises with the rate', fc.record({ principal: fc.integer({ min: 1000, max: 200000000 }), rate: fc.integer({ min: 0, max: 150 }).map((n) => n / 1000), years: fc.integer({ min: 1, max: 40 }), moreRate: fc.integer({ min: 1, max: 50 }).map((n) => n / 1000) }), (o) => {
    const a = Housing.monthlyPayment(o.principal, o.rate, o.years), b = Housing.monthlyPayment(o.principal, o.rate + o.moreRate, o.years);
    if (!ok(a) || !ok(b)) return 'incomplete: ' + (a.reason || b.reason);
    const months = o.years * 12;
    if (a.value * months < o.principal - months) return 'payment ' + a.value + ' x ' + months + ' < principal ' + o.principal;
    if (b.value < a.value) return 'higher rate, lower payment: ' + a.value + ' -> ' + b.value;
    const interest = Housing.interestInFirstMonths(o.principal, o.rate, a.value, 12);
    if (typeof interest === 'number' && interest < 0) return 'negative first-year interest';
    return true;
  }, 'Rounding to the cent each month may leave the total up to one cent per month short of the principal.')
]);
module.exports = H.suite('housing', props);
if (require.main === module) H.main(module.exports);
