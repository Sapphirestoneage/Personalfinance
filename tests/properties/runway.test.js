'use strict';
/* Property tests for engines/runway.js (lane 2, section 2, L-2). */
const H = require('./_harness.js');
const { fc, Money, TABLES, buildComplete, withField, arbCompleteSpec, prop } = H;
const Runway = H.engine('runway');
const ok = (r) => Money.isOk(r);

const props = H.generic('runway').concat([
  prop('runway never counts property or vehicles', fc.tuple(arbCompleteSpec, fc.constantFrom('quit', 'unemployment', 'business')), ([s, preset]) => {
    const a = Runway.project(buildComplete(s), TABLES, { preset });
    const b = Runway.project(buildComplete(withField(withField(s, 'property', (s.property || 0) + 750000), 'vehicle', (s.vehicle || 0) + 40000)), TABLES, { preset });
    if (!ok(a) || !ok(b)) return 'incomplete: ' + (a.reason || b.reason);
    return a.value === b.value || ('a house and a car moved the runway from ' + a.value + ' to ' + b.value);
  }),
  prop('runway falls, or holds, when cash falls', fc.tuple(arbCompleteSpec, fc.integer({ min: 1, max: 200000 })), ([s, less]) => {
    const a = Runway.project(buildComplete(s), TABLES, { preset: 'quit' });
    const b = Runway.project(buildComplete(withField(s, 'cash', Math.max(0, s.cash - less))), TABLES, { preset: 'quit' });
    if (!ok(a) || !ok(b)) return 'incomplete: ' + (a.reason || b.reason);
    return b.value <= a.value || ('less cash, longer runway: ' + a.value + ' -> ' + b.value);
  }),
  prop('runway is a whole number of months between 0 and the horizon', arbCompleteSpec, (s) => {
    const r = Runway.project(buildComplete(s), TABLES, { preset: 'quit' });
    if (!ok(r)) return 'incomplete: ' + r.reason;
    return (Number.isInteger(r.value) && r.value >= 0 && r.value <= Runway.HORIZON_MONTHS) || ('runway ' + r.value);
  }),
  prop('cutting spending never shortens the runway', fc.tuple(arbCompleteSpec, fc.integer({ min: 0, max: 3000 })), ([s, cutDollars]) => {
    const h = buildComplete(s);
    const a = Runway.project(h, TABLES, { preset: 'quit' });
    const cut = Math.min(cutDollars * 100, (s.food + s.accommodation + s.transportation + s.wants) * 100);
    const b = Runway.project(h, TABLES, { preset: 'quit', expenseCutCents: cut });
    if (!ok(a) || !ok(b)) return 'incomplete: ' + (a.reason || b.reason);
    return b.value >= a.value || ('a cut of ' + cut + ' shortened the runway ' + a.value + ' -> ' + b.value);
  })
]);
module.exports = H.suite('runway', props);
if (require.main === module) H.main(module.exports);
