'use strict';
/* Property tests for engines/opening.js (D-312): the four generic
   properties from _harness.js on read(), model() and inputs(), which take a
   household first; the arithmetic helpers take numbers and are covered by
   test/run.js. */
const H = require('./_harness.js');
module.exports = H.suite('opening', H.generic('opening', { args: { opts: {}, inp: null } }));
if (require.main === module) H.main(module.exports);
