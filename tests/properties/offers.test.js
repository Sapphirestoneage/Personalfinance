'use strict';
/* Property tests for engines/offers.js (lane 2, section 2, L-2). household()
   needs an offer, so it is left out of the generic four and checked here:
   the true match is salary × cap × rate, equity is a range low to high, and
   the best offer is the one with the highest middle. */
const H = require('./_harness.js');
const { fc, prop, Money, Schema, TABLES, arbSpec, build } = H;
const O = H.engine('offers');
const arbOffer = fc.record({ baseCents: fc.integer({ min: 1, max: 50000000 }), bonusCents: fc.option(fc.integer({ min: 0, max: 5000000 }), { nil: null }), matchRate: fc.constantFrom(0.5, 1), matchCapPct: fc.constantFrom(0.03, 0.04, 0.06),
  equityLowCents: fc.integer({ min: 0, max: 5000000 }), equityHighCents: fc.integer({ min: 0, max: 5000000 }), healthMonthlyCents: fc.integer({ min: 0, max: 200000 }), commuteMonthlyCents: fc.integer({ min: 0, max: 100000 }), commuteMinutesPerDay: fc.integer({ min: 0, max: 180 }), ptoDays: fc.integer({ min: 0, max: 40 }), remoteDays: fc.integer({ min: 0, max: 5 }) });

const props = H.generic('offers', { skip: ['household'] }).concat([
  prop('the match is salary × cap × rate on the offer household (one adult), and the household passed in is untouched', fc.record({ spec: arbSpec.map((s) => Object.assign({}, s, { people: s.people.slice(0, 1) })), offer: arbOffer }), (o) => {
    const h = build(o.spec);
    const before = JSON.stringify(h);
    const hh = O.household(h, o.offer);
    if (JSON.stringify(h) !== before) return 'household() changed the household';
    const m = Schema.employerMatchCents(hh);
    const gross = o.offer.baseCents + (o.offer.bonusCents || 0);
    return (Money.isOk(m) && m.value === Math.round(gross * o.offer.matchCapPct * o.offer.matchRate)) || ('match ' + (m && m.value));
  }),
  prop('two priced offers: value low to high, whole cents, the best is the highest middle, one line decides', fc.record({ spec: arbSpec, a: arbOffer, b: arbOffer }), (o) => {
    const r = O.compare(build(o.spec), TABLES, { offers: [o.a, o.b] });
    if (!Money.isOk(r)) return typeof r.reason === 'string' || 'incomplete without a reason';
    for (const p of r.offers) {
      if (!p.ok) return 'an offer with base pay did not price: ' + p.reason;
      if (p.valueLowCents > p.valueHighCents) return 'low above high';
      if (!Number.isInteger(p.valueMidCents) || !Number.isInteger(p.takeHomeCents)) return 'fractional cents';
    }
    const best = r.offers[r.value], other = r.offers[1 - r.value];
    if (best.valueMidCents < other.valueMidCents) return 'best is not the highest middle';
    return (r.decider && typeof r.decider.label === 'string' && r.decider.diffCents >= 0) || 'no decider';
  })
]);
module.exports = H.suite('offers', props);
if (require.main === module) H.main(module.exports);
