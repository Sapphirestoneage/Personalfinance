'use strict';
/* Property tests for engines/advicerules.js (lane 2, section 2, L-2). The
   four generic properties, plus: every rule the list returns carries one of
   the four statuses and a reason. */
const H = require('./_harness.js');
const { prop, TABLES, arbSpec, build } = H;
const A = H.engine('advicerules');

const props = H.generic('advicerules').concat([
  prop('every rule is judged with one of the four statuses and says why', arbSpec, (spec) => {
    const list = A.list(build(spec), TABLES);
    if (!Array.isArray(list)) return 'list is not an array';
    for (const r of list) {
      if (A.STATUSES.indexOf(r.status) < 0) return r.id + ' has status ' + r.status;
      if (typeof r.why !== 'string' || !r.why) return r.id + ' has no reason';
      if (r.status === 'cantTell' && !(Array.isArray(r.missing) && r.missing.length)) return r.id + ' cannot tell but names nothing missing';
    }
    return true;
  })
]);
module.exports = H.suite('advicerules', props);
if (require.main === module) H.main(module.exports);
