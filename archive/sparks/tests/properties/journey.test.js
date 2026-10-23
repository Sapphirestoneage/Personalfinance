'use strict';
/* Property tests for engines/journey.js (lane 2; D-235). The map reads the
   ladder, the tiers and the routes off engines that have their own files,
   so the properties here are about the reading, not the arithmetic. */
const H = require('./_harness.js');
const { fc, Money, TABLES, buildComplete, withField, arbCompleteSpec, prop } = H;
const Journey = H.engine('journey');
const Tier0 = H.engine('tier0');
const ok = (r) => Money.isOk(r);

const props = H.generic('journey').concat([
  prop('the ladder has one rung per FOO step, and "here" is the one marked here', arbCompleteSpec, (s) => {
    const lad = Journey.ladder(buildComplete(s), TABLES);
    if (lad.steps.length !== TABLES.fooRules.ladder.length) return lad.steps.length + ' rungs for ' + TABLES.fooRules.ladder.length + ' steps';
    const here = lad.steps.filter((x) => x.state === 'here');
    if (lad.here === null) return here.length === 0 || 'nowhere, yet a rung is marked here';
    return (here.length === 1 && here[0].step === lad.here) || ('here is ' + lad.here + ' but the marked rung is ' + here.map((x) => x.step).join(','));
  }),
  prop('the road as it is lands on the same FI year as Tier 0 (one loop)', arbCompleteSpec, (s) => {
    const h = buildComplete(s);
    const m = Journey.map(h, TABLES);
    if (!ok(m.routes)) return true;
    const asIs = m.routes.routes.filter((r) => r.id === 'as-is')[0];
    const t0 = Tier0.yearsToFire(h, TABLES);
    if (!ok(t0)) return asIs.never || ('Tier 0 has no year but the road as it is says ' + asIs.yearsToFire);
    const t0Years = t0.alreadyThere ? 0 : t0.value;
    return asIs.yearsToFire === t0Years || ('road as it is ' + asIs.yearsToFire + ', Tier 0 ' + t0Years);
  }),
  prop('every route lives on plus puts in exactly take-home', arbCompleteSpec, (s) => {
    const m = Journey.map(buildComplete(s), TABLES);
    if (!ok(m.routes)) return true;
    for (const r of m.routes.routes) {
      const diff = Math.abs(r.monthlyLivingCents * 12 + r.annualSavingCents - m.routes.takeHomeAnnualCents);
      if (diff >= 12) return r.id + ' is ' + diff + ' cents off take-home';
    }
    return true;
  }),
  prop('the death march never arrives later than the road as it is, the scenic route never sooner', arbCompleteSpec, (s) => {
    const m = Journey.map(buildComplete(s), TABLES);
    if (!ok(m.routes)) return true;
    const by = {}; m.routes.routes.forEach((r) => { by[r.id] = r; });
    if (by['as-is'].yearsToFire === null) return true;
    if (by.march.yearsToFire !== null && by.march.yearsToFire > by['as-is'].yearsToFire) return 'march ' + by.march.yearsToFire + ' after as-is ' + by['as-is'].yearsToFire;
    if (by.march.yearsToFire === null) return 'the march never arrives while the road as it is does';
    if (by.scenic.yearsToFire !== null && by.scenic.yearsToFire < by['as-is'].yearsToFire) return 'scenic ' + by.scenic.yearsToFire + ' before as-is ' + by['as-is'].yearsToFire;
    return true;
  }),
  prop('spending up never brings a route\'s FIRE year earlier', fc.tuple(arbCompleteSpec, fc.integer({ min: 1, max: 3000 })), ([s, more]) => {
    const a = Journey.map(buildComplete(s), TABLES).routes;
    const b = Journey.map(buildComplete(withField(s, 'wants', s.wants + more)), TABLES).routes;
    if (!ok(a) || !ok(b)) return true;
    for (const r of a.routes) {
      const r2 = b.routes.filter((x) => x.id === r.id)[0];
      if (r.yearsToFire !== null && r2 && r2.yearsToFire !== null && r2.yearsToFire < r.yearsToFire) return r.id + ': spending up, FIRE ' + r.yearsToFire + ' -> ' + r2.yearsToFire;
    }
    return true;
  }),
  prop('routes are sorted soonest first, never-arrives last', arbCompleteSpec, (s) => {
    const m = Journey.map(buildComplete(s), TABLES);
    if (!ok(m.routes)) return true;
    const ys = m.routes.routes.map((r) => (r.yearsToFire === null ? Infinity : r.yearsToFire));
    for (let i = 1; i < ys.length; i++) if (ys[i] < ys[i - 1]) return 'order ' + ys.join(',');
    return true;
  })
]);
module.exports = H.suite('journey', props);
if (require.main === module) H.main(module.exports);
