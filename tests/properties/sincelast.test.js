'use strict';
/* Property tests for engines/sincelast.js (lane 2, section 2, L-2). compute
   and strip take a snapshot as their second argument, which the generic
   four cannot supply, so both are checked directly. */
const H = require('./_harness.js');
const { prop, TABLES, arbSpec, build, same } = H;
const S = H.engine('sincelast');
const EMPTY = { timestamp: '2026-01-01T00:00:00.000Z', fields: {}, fieldMeta: {} };

const props = [
  prop('no snapshot, no comparison', arbSpec, (spec) => S.compute(build(spec), null, TABLES) === null && S.strip(build(spec), undefined, TABLES) === null || 'compared against nothing'),
  prop('against an empty snapshot every change is learned, never earned, and the strip is a sentence or nothing', arbSpec, (spec) => {
    const h = build(spec);
    let r;
    try { r = S.compute(h, EMPTY, TABLES); } catch (e) { return 'threw: ' + e.message; }
    if (!r || !Array.isArray(r.changes)) return 'no changes list';
    for (const ch of r.changes) if (ch.kind !== 'learned') return ch.id + ' is ' + ch.kind + ' against an empty snapshot';
    if (!same(r, S.compute(h, EMPTY, TABLES))) return 'differs between calls';
    const s = S.strip(h, EMPTY, TABLES);
    return s === null || typeof s === 'string' || 'strip returned ' + typeof s;
  })
];
module.exports = H.suite('sincelast', props);
if (require.main === module) H.main(module.exports);
