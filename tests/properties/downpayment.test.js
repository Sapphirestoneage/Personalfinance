'use strict';
/* Property tests for engines/downpayment.js (lane 2, section 2, L-2). plan
   takes the tables and a what-if, not a household, so it is checked
   directly: more down means more needed, less borrowed, and a date no
   earlier; family help never makes a date later; whole cents throughout. */
const H = require('./_harness.js');
const { fc, prop, Money, TABLES, fractionalCents } = H;
const D = H.engine('downpayment');
const arb = fc.record({ price: fc.integer({ min: 1, max: 200000000 }), saved: fc.integer({ min: 0, max: 50000000 }), monthly: fc.integer({ min: 0, max: 1000000 }), help: fc.integer({ min: 0, max: 20000000 }) });

const props = [
  prop('more down: more cash needed, less borrowed, principal and interest lower, a date no earlier', arb, (o) => {
    const r = D.plan(TABLES, { priceCents: o.price, savedCents: o.saved, monthlyCents: o.monthly, from: '2026-09' });
    if (!Money.isOk(r)) return 'not ok: ' + r.reason;
    const frac = fractionalCents(r, 'plan', new Set(), 0);
    if (frac.length) return frac[0];
    for (let i = 1; i < r.options.length; i++) {
      const a = r.options[i - 1], b = r.options[i];
      if (b.downCents < a.downCents || b.loanCents > a.loanCents) return 'down or loan out of order at ' + b.label;
      if (b.principalInterestCents > a.principalInterestCents) return 'P&I rose at ' + b.label;
      if (b.neededCents < a.neededCents) return 'needed fell at ' + b.label;
      if (a.months !== null && b.months !== null && b.months < a.months) return 'date earlier at ' + b.label;
    }
    return true;
  }),
  prop('family help never makes a date later, and a needed figure never goes below zero', arb, (o) => {
    const a = D.plan(TABLES, { priceCents: o.price, savedCents: o.saved, monthlyCents: o.monthly, from: '2026-09' });
    const b = D.plan(TABLES, { priceCents: o.price, savedCents: o.saved, monthlyCents: o.monthly, familyHelpCents: o.help, from: '2026-09' });
    for (let i = 0; i < a.options.length; i++) {
      if (b.options[i].neededCents < 0) return 'needed below zero';
      if (b.options[i].neededCents > a.options[i].neededCents) return 'help raised the need';
      if (a.options[i].months !== null && (b.options[i].months === null || b.options[i].months > a.options[i].months)) return 'help made ' + b.options[i].label + ' later';
    }
    return true;
  })
];
module.exports = H.suite('downpayment', props);
if (require.main === module) H.main(module.exports);
