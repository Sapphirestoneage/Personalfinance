'use strict';
/* Property tests for engines/cliff.js (D-296): the four generic properties
   from _harness.js. where() takes the household, the tables and an options
   bag; with no raise and no size named it reads the household alone, which
   is the case the page opens on. fplCents() takes a table row, not a
   household, so the harness leaves it to test/run.js. */
const H = require('./_harness.js');
module.exports = H.suite('cliff', H.generic('cliff', { args: { opts: {} } }));
if (require.main === module) H.main(module.exports);
