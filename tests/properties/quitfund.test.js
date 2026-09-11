'use strict';
/* Property tests for engines/quitfund.js (lane 2, section 2, L-2). The four
   generic properties, plus: laid off never reads fewer months than quit and
   changes nothing but the benefit; the targets are 3, 6 and 12 months. */
const H = require('./_harness.js');
const { fc, prop, Money, TABLES, arbCompleteSpec, buildComplete } = H;
const Q = H.engine('quitfund');

const props = H.generic('quitfund').concat([
  prop('laid off reads no fewer months than quit, with the same free money, month and cover; targets are 3, 6 and 12', arbCompleteSpec, (spec) => {
    const h = buildComplete(spec);
    const q = Q.plan(h, TABLES, { mode: 'quit', from: '2026-09' }), l = Q.plan(h, TABLES, { mode: 'laidOff', from: '2026-09' });
    if (!Money.isOk(q)) return typeof q.reason === 'string' || 'incomplete without a reason';
    if (!Money.isOk(l)) return 'laid off incomplete where quit was not';
    if (l.value < q.value) return 'laid off ' + l.value + ' < quit ' + q.value;
    if (l.freeCents !== q.freeCents || l.monthCents !== q.monthCents || l.coverCents !== q.coverCents) return 'more than the benefit changed';
    if (q.benefit.totalCents !== 0) return 'quit counted a benefit';
    if (q.targets.map((t) => t.months).join(',') !== '3,6,12') return 'targets ' + q.targets.map((t) => t.months).join(',');
    return q.targets.every((t) => t.targetCents >= 0 && (t.date === null || /^\d{4}-\d{2}$/.test(t.date))) || 'a target without a date shape';
  })
]);
module.exports = H.suite('quitfund', props);
if (require.main === module) H.main(module.exports);
