'use strict';
/* Property tests for engines/projection.js (lane 2, section 2, L-2). The
   one compounding loop everything else uses, so it gets the closed-form
   checks: more rate or more contribution never ends lower, a level
   payment always repays the principal, more contribution never takes
   longer to reach a target. */
const H = require('./_harness.js');
const { fc, Money, prop, same } = H;
const P = H.engine('projection');
const ok = (r) => Money.isOk(r);
const cents = (max) => fc.integer({ min: 0, max: max * 100 });
const rate = fc.integer({ min: 0, max: 150 }).map((n) => n / 1000);
const years = fc.integer({ min: 1, max: 40 });

const props = [
  prop('future value never falls when the rate or the contribution rises', fc.record({ start: cents(2000000), rate, years, contrib: cents(100000), moreRate: fc.integer({ min: 1, max: 50 }), moreContrib: cents(20000) }), (o) => {
    const a = P.futureValueCents({ startCents: o.start, annualRate: o.rate, years: o.years, annualContributionCents: o.contrib });
    const b = P.futureValueCents({ startCents: o.start, annualRate: o.rate + o.moreRate / 1000, years: o.years, annualContributionCents: o.contrib });
    const c = P.futureValueCents({ startCents: o.start, annualRate: o.rate, years: o.years, annualContributionCents: o.contrib + o.moreContrib });
    if (!ok(a) || !ok(b) || !ok(c)) return 'incomplete: ' + (a.reason || b.reason || c.reason);
    if (b.value < a.value) return 'higher rate, lower value: ' + a.value + ' -> ' + b.value;
    if (c.value < a.value) return 'more contribution, lower value: ' + a.value + ' -> ' + c.value;
    return true;
  }),
  prop('a level payment times its months repays at least the principal', fc.record({ principal: fc.integer({ min: 100, max: 100000000 }), rate, months: fc.integer({ min: 1, max: 480 }) }), (o) => {
    const r = P.levelPaymentCents({ principalCents: o.principal, annualRate: o.rate, months: o.months });
    if (!ok(r)) return 'incomplete: ' + r.reason;
    if (r.value * o.months < o.principal - o.months) return 'payment ' + r.value + ' x ' + o.months + ' < principal ' + o.principal;
    if (r.totalInterestCents < 0) return 'negative interest ' + r.totalInterestCents;
    return true;
  }, 'Rounding to the cent each month may leave the total up to one cent per month short of the principal.'),
  prop('more contribution never takes longer to reach a target', fc.record({ start: cents(500000), target: fc.integer({ min: 100, max: 300000000 }), rate, contrib: fc.integer({ min: 100, max: 20000000 }), more: fc.integer({ min: 100, max: 5000000 }) }), (o) => {
    const a = P.yearsToTargetCents({ startCents: o.start, targetCents: o.target, annualRate: o.rate, annualContributionCents: o.contrib });
    const b = P.yearsToTargetCents({ startCents: o.start, targetCents: o.target, annualRate: o.rate, annualContributionCents: o.contrib + o.more });
    if (!ok(a)) return true;
    if (!ok(b)) return 'more contribution made the projection incomplete: ' + b.reason;
    return b.value <= a.value || ('more contribution, more years: ' + a.value + ' -> ' + b.value);
  }),
  prop('the same input gives the same output twice', fc.record({ start: cents(500000), rate, years, contrib: cents(50000) }), (o) => {
    const args = { startCents: o.start, annualRate: o.rate, years: o.years, monthlyContributionCents: Math.round(o.contrib / 12) };
    return same(P.pathCents(args), P.pathCents(args)) || 'pathCents differs between calls';
  }),
  prop('cents in, cents out on every projection', fc.record({ start: cents(500000), rate, years, contrib: cents(50000), target: fc.integer({ min: 100, max: 100000000 }) }), (o) => {
    const rs = [
      P.futureValueCents({ startCents: o.start, annualRate: o.rate, years: o.years, annualContributionCents: o.contrib }),
      P.pathCents({ startCents: o.start, annualRate: o.rate, years: o.years, monthlyContributionCents: Math.round(o.contrib / 12) }),
      P.yearsToTargetCents({ startCents: o.start, targetCents: o.target, annualRate: o.rate, annualContributionCents: o.contrib }),
      P.presentValueNeededCents({ targetCents: o.target, annualRate: o.rate, years: o.years })
    ];
    for (const r of rs) { const f = H.fractionalCents(r, 'r', new Set(), 0); if (f.length) return f[0]; }
    return true;
  })
];
module.exports = H.suite('projection', props);
if (require.main === module) H.main(module.exports);
