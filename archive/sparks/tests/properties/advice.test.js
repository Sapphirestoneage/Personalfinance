'use strict';
/* Property tests for engines/advice.js (lane 2, section 2, L-2). The four
   generic properties from _harness.js: no throw and no NaN on any valid
   household, the same answer twice, the household untouched, whole cents. */
const H = require('./_harness.js');
module.exports = H.suite('advice', H.generic('advice'));
if (require.main === module) H.main(module.exports);
