'use strict';
/* Property tests for engines/microretirement.js (lane 2, section 2, L-2).
   The four generic properties, plus: the fund is the break plus the cushion,
   never below the months of spending less income, and a zero pay penalty
   removes only the momentum line. */
const H = require('./_harness.js');
const { fc, prop, Money, TABLES, arbSpec, build } = H;
const M = H.engine('microretirement');

const props = H.generic('microretirement').concat([
  prop('the fund is the break plus the cushion; a zero pay penalty changes nothing else', fc.record({ spec: arbSpec, months: fc.integer({ min: 1, max: 12 }), spend: fc.integer({ min: 0, max: 2000000 }), income: fc.integer({ min: 0, max: 2000000 }), cover: fc.integer({ min: 0, max: 300000 }) }), (o) => {
    const h = build(o.spec);
    const r = M.plan(h, TABLES, { months: o.months, spendMonthlyCents: o.spend, incomeMonthlyCents: o.income, coverMonthlyCents: o.cover, from: '2026-09' });
    if (!Money.isOk(r)) return 'not ok: ' + r.reason;
    const perMonth = Math.max(0, o.spend + o.cover - o.income);
    if (r.breakCents !== o.months * perMonth) return 'break ' + r.breakCents + ' for ' + o.months + ' × ' + perMonth;
    if (r.fundCents !== r.breakCents + r.cushionCents) return 'fund is not break plus cushion';
    if (r.weeksBought !== Math.round(o.months * 52 / 12)) return 'weeks ' + r.weeksBought;
    const z = M.plan(h, TABLES, { months: o.months, spendMonthlyCents: o.spend, incomeMonthlyCents: o.income, coverMonthlyCents: o.cover, momentumRate: 0, from: '2026-09' });
    if (z.fundCents !== r.fundCents || z.readyDate !== r.readyDate || z.fiMovesMonths !== r.fiMovesMonths) return 'a zero penalty changed more than the momentum line';
    return !z.momentum || z.momentum.cents === 0 || 'momentum ' + z.momentum.cents + ' at a zero rate';
  })
]);
module.exports = H.suite('microretirement', props);
if (require.main === module) H.main(module.exports);
