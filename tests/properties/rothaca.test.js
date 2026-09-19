'use strict';
/* Property tests for engines/rothaca.js (lane 2, section 2, L-2). The four
   generic properties, plus: with a premium and a pre-tax balance typed, one
   row a year to 65, the range in order, and no conversion beyond the pot. */
const H = require('./_harness.js');
const { fc, prop, Money, TABLES, arbSpec, build } = H;
const R = H.engine('rothaca');

const props = H.generic('rothaca').concat([
  prop('one row a year to 65, low to high in order, the tax the same under both rules, nothing converted from nothing', fc.record({ spec: arbSpec, age: fc.integer({ min: 20, max: 70 }), premium: fc.integer({ min: 0, max: 300000 }), conv: fc.integer({ min: 0, max: 20000000 }), other: fc.integer({ min: 0, max: 30000000 }), pretax: fc.integer({ min: 0, max: 300000000 }) }), (o) => {
    const r = R.plan(build(o.spec), TABLES, { age: o.age, benchmarkPremiumMonthlyCents: o.premium, conversionAnnualCents: o.conv, otherIncomeAnnualCents: o.other, pretaxCents: o.pretax });
    if (!Money.isOk(r)) return (o.age >= R.MEDICARE_AGE || typeof r.reason === 'string') || 'incomplete without a reason';
    if (r.rows.length !== R.MEDICARE_AGE - o.age) return r.rows.length + ' rows from ' + o.age;
    if (r.lowCents > r.highCents) return 'low above high';
    if (r.cliffOn.taxCents !== r.cliffOff.taxCents) return 'the tax differs between the rules';
    if (r.leftPretaxCents < 0 || r.rothCents < 0) return 'a pile below zero';
    if (o.pretax === 0 && r.convertedCents !== 0) return 'converted from nothing';
    return r.rows.every((y) => Number.isInteger(y.taxCents) && y.premiumOnCents >= 0 && y.premiumOffCents >= 0 && y.premiumOffCents <= y.premiumOnCents) || 'a row out of shape';
  })
]);
module.exports = H.suite('rothaca', props);
if (require.main === module) H.main(module.exports);
