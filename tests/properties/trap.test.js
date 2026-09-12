'use strict';
/* Property tests for engines/trap.js (lane 2, section 2, L-2). The four
   generic properties, plus: every available path carries a verdict from
   the three, a year per row to the access age, and counting the home as
   cash never makes a verdict worse. */
const H = require('./_harness.js');
const { fc, prop, Money, TABLES, arbCompleteSpec, buildComplete } = H;
const T = H.engine('trap');
const rank = (v) => T.VERDICTS.indexOf(v);

const props = H.generic('trap').concat([
  prop('every available path has a verdict from the three and a row a year; selling the home never reads worse', fc.record({ spec: arbCompleteSpec, retire: fc.integer({ min: 30, max: 62 }) }), (o) => {
    const h = buildComplete(o.spec);
    const a = T.run(h, TABLES, { retireAge: o.retire, homeEquity: 'ignore' }), b = T.run(h, TABLES, { retireAge: o.retire, homeEquity: 'sell' });
    if (!Money.isOk(a)) return typeof a.reason === 'string' || 'incomplete without a reason';
    for (const p of a.paths) {
      if (!p.available) { if (typeof p.reason !== 'string') return p.id + ' unavailable without a reason'; continue; }
      if (rank(p.verdict) < 0) return p.id + ' verdict ' + p.verdict;
      if (p.rows.length !== a.inputs.horizonYears) return p.id + ' ' + p.rows.length + ' rows for ' + a.inputs.horizonYears + ' years';
      const q = b.paths.filter((x) => x.id === p.id)[0];
      if (q && q.available && rank(q.verdict) < rank(p.verdict)) return p.id + ' read worse with the home sold';
    }
    return true;
  })
]);
module.exports = H.suite('trap', props);
if (require.main === module) H.main(module.exports);
