'use strict';
/* Property tests for engines/income.js (lane 2, section 2, L-2). */
const H = require('./_harness.js');
const { fc, Money, prop } = H;
const I = H.engine('income');
const ok = (r) => Money.isOk(r);

const props = H.generic('income').concat([
  prop('annualising a stored annual figure returns it unchanged; a monthly rate times twelve', fc.record({ gross: fc.integer({ min: 0, max: 100000000 }), monthly: fc.integer({ min: 0, max: 5000000 }) }), (o) => {
    const a = I.annualise({ grossAnnualIncomeCents: o.gross, frequency: 'annual', rateCents: null });
    if (!ok(a) || a.value !== o.gross) return 'annual: ' + JSON.stringify(a).slice(0, 120);
    const m = I.annualise({ grossAnnualIncomeCents: null, frequency: 'monthly', rateCents: o.monthly });
    if (!ok(m) || m.value !== o.monthly * 12) return 'monthly: ' + JSON.stringify(m).slice(0, 120);
    return true;
  })
]);
module.exports = H.suite('income', props);
if (require.main === module) H.main(module.exports);
