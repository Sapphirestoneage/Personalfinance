'use strict';
/* Property tests for engines/next100.js (lane 2, section 2, L-2). The four
   generic properties, plus: every line is guaranteed or expected, never a
   blend, and an expected line's range holds its rate. */
const H = require('./_harness.js');
const { prop, TABLES, arbSpec, build } = H;
const N = H.engine('next100');

const props = H.generic('next100').concat([
  prop('every line is guaranteed or expected, and an expected range holds its rate', arbSpec, (spec) => {
    const r = N.rank(build(spec), TABLES);
    if (!r || !Array.isArray(r.rows)) return 'no rows';
    for (const row of r.rows) {
      if (row.kind !== 'guaranteed' && row.kind !== 'expected') return row.id + ' is ' + row.kind;
      if (typeof row.rate !== 'number' || !isFinite(row.rate)) return row.id + ' has rate ' + row.rate;
      if (row.kind === 'expected' && typeof row.low === 'number' && typeof row.high === 'number' && !(row.low <= row.rate && row.rate <= row.high)) return row.id + ' rate ' + row.rate + ' outside ' + row.low + '..' + row.high;
      if (row.kind === 'guaranteed' && row.low !== undefined && row.low !== null && row.low !== row.rate) return row.id + ' is guaranteed but carries a range';
    }
    return true;
  })
]);
module.exports = H.suite('next100', props);
if (require.main === module) H.main(module.exports);
