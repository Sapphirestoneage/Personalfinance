'use strict';
/* Property tests for engines/notknowing.js (lane 2, section 2, L-2). The four
   generic properties, plus: the swings come largest first, each naming its
   row and what it feeds. */
const H = require('./_harness.js');
const { prop, TABLES, arbSpec, build } = H;
const K = H.engine('notknowing');

const props = H.generic('notknowing').concat([
  prop('every swing names its row and what it feeds, and the list is largest first', arbSpec, (spec) => {
    const all = K.all(build(spec), TABLES);
    if (!Array.isArray(all)) return 'all() is not an array';
    for (let i = 0; i < all.length; i++) {
      const s = all[i];
      if (!s.rowId || !s.feeds) return 'swing ' + i + ' names no row or feed';
      if (typeof s.swing !== 'number' || !isFinite(s.swing) || s.swing < 0) return s.rowId + ' swing ' + s.swing;
      if (i && all[i - 1].swing < s.swing) return all[i - 1].rowId + ' (' + all[i - 1].swing + ') listed before ' + s.rowId + ' (' + s.swing + ')';
    }
    return true;
  })
]);
module.exports = H.suite('notknowing', props);
if (require.main === module) H.main(module.exports);
