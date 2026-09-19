'use strict';
/* Property tests for engines/reachable.js (lane 2, section 2, L-2). The four
   generic properties, plus: nothing reachable comes from nowhere, home equity
   is never counted (as the engine itself reports it), and the cost of pulling
   money is never negative. */
const H = require('./_harness.js');
const { fc, prop, Money, TABLES, arbSpec, build } = H;
const Re = H.engine('reachable');

const props = H.generic('reachable').concat([
  prop('reachable money never exceeds what is held outside the home, and pulling it never costs less than nothing', fc.record({ spec: arbSpec, amount: fc.integer({ min: 0, max: 300000000 }) }), (o) => {
    const h = build(o.spec);
    const r = Re.waterfall(h, TABLES, { amountCents: o.amount });
    if (!r || !Array.isArray(r.tiers)) return 'no tiers';
    const held = (h.assets || []).filter((a) => Money.isEntered(a.valueCents) && a.valueCents > 0).reduce((s, a) => s + a.valueCents, 0) - (r.homeEquityCents || 0);
    if (r.reachableCents > held) return 'reachable ' + r.reachableCents + ' > held outside the home ' + held;
    if (r.costCents < 0) return 'cost ' + r.costCents;
    if (r.shortfallCents < 0) return 'shortfall ' + r.shortfallCents;
    const pulled = (r.pulls || []).reduce((s, p) => s + (p.pullCents || p.amountCents || 0), 0);
    return pulled <= o.amount + 1 || ('pulled ' + pulled + ' for a request of ' + o.amount);
  })
]);
module.exports = H.suite('reachable', props);
if (require.main === module) H.main(module.exports);
