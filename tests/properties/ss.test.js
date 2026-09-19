'use strict';
/* Property tests for engines/ss.js (lane 2, section 2, L-2). */
const H = require('./_harness.js');
const { fc, TABLES, prop } = H;
const SS = H.engine('ss');

const props = H.generic('ss').concat([
  prop('the primary insurance amount never falls as average indexed earnings rise, and is never above them', fc.record({ aime: fc.integer({ min: 0, max: 20000 }), more: fc.integer({ min: 1, max: 5000 }) }), (o) => {
    const a = SS.pia(TABLES.ssBendPoints, o.aime), b = SS.pia(TABLES.ssBendPoints, o.aime + o.more);
    if (!(typeof a === 'number' && isFinite(a))) return 'pia is ' + a;
    if (a < 0) return 'negative PIA';
    if (a > o.aime) return 'PIA ' + a + ' above AIME ' + o.aime;
    return b >= a || ('more earnings, smaller PIA: ' + a + ' -> ' + b);
  }),
  prop('the claiming factor never falls as the claiming age rises', fc.integer({ min: 62, max: 69 }), (age) => {
    const a = SS.claimFactor(TABLES.ssBendPoints, age), b = SS.claimFactor(TABLES.ssBendPoints, age + 1);
    if (!(a > 0 && a <= 1.3)) return 'factor at ' + age + ' is ' + a;
    return b >= a || ('factor fell from ' + a + ' at ' + age + ' to ' + b);
  })
]);
module.exports = H.suite('ss', props);
if (require.main === module) H.main(module.exports);
