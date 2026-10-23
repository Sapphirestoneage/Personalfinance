'use strict';
/* Property tests for engines/ratios.js (lane 2, section 2, L-2). The four
   generic properties from _harness.js: no throw and no NaN on any valid
   household, the same answer twice, the household untouched, whole cents. */
const H = require('./_harness.js');
module.exports = H.suite('ratios', H.generic('ratios'), [
  'context(), all() and scored() read Date.now() when opts.now is absent and echo it as `now`; two calls a millisecond apart differ. The suite passes a fixed `now`, so the clock read is treated as an input rather than hidden state. Rooms that call without `now` get a wall-clock stamp in the result.'
]);
if (require.main === module) H.main(module.exports);
