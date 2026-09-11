'use strict';
/* Property tests for engines/wrapped.js (lane 2, section 2, L-2). year takes
   the snapshot list as its second argument, which the generic four cannot
   supply; the year filter, the household rebuilt from a snapshot, and a year
   with no snapshots are checked directly. */
const H = require('./_harness.js');
const { fc, prop, TABLES, arbSpec, build } = H;
const W = H.engine('wrapped');
const arbStamp = fc.record({ year: fc.integer({ min: 2024, max: 2027 }), month: fc.integer({ min: 1, max: 12 }), day: fc.integer({ min: 1, max: 28 }) })
  .map((d) => d.year + '-' + String(d.month).padStart(2, '0') + '-' + String(d.day).padStart(2, '0') + 'T12:00:00.000Z');

const props = [
  prop('inYear keeps only that year, oldest first', fc.record({ stamps: fc.array(arbStamp, { minLength: 0, maxLength: 8 }), year: fc.integer({ min: 2024, max: 2027 }) }), (o) => {
    const snaps = o.stamps.map((t) => ({ timestamp: t }));
    const got = W.inYear(snaps, o.year);
    const want = snaps.filter((s) => s.timestamp.slice(0, 4) === String(o.year)).length;
    if (got.length !== want) return got.length + ' kept, ' + want + ' in ' + o.year;
    for (let i = 1; i < got.length; i++) if (got[i - 1].timestamp > got[i].timestamp) return 'not oldest first';
    return true;
  }),
  prop('a snapshot rebuilds into a household with the same people, and no snapshot rebuilds into nothing', arbSpec, (spec) => {
    const h = build(spec);
    if (W.householdAt(null) !== null || W.householdAt({}) !== null) return 'built a household from nothing';
    const again = W.householdAt({ rawInputs: { people: h.people, assets: h.assets, debts: h.debts, expenses: h.expenses, filingStatus: h.filingStatus, state: h.state } });
    return (again && again.people.length === h.people.length && again.assets.length === h.assets.length) || 'people or assets went missing';
  }),
  prop('a year with no snapshots is not ok, says what is missing, and never puts cents on the card', arbSpec, (spec) => {
    const r = W.year(build(spec), [], TABLES, { year: 2026 });
    if (r.ok !== false) return 'ok without a snapshot';
    if (!Array.isArray(r.missing) || !r.missing.length) return 'nothing named as missing';
    const frac = JSON.stringify(r.lines || []).match(/Cents/);
    return !frac || 'a cents value reached the card';
  })
];
module.exports = H.suite('wrapped', props);
if (require.main === module) H.main(module.exports);
