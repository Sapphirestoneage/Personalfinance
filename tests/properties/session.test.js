'use strict';
/* Property tests for engines/session.js (Coach Mode, D-340 to D-344): the
   generic four on every household reading, then its own rules. A recap of a
   household against itself says nothing changed; a coach note never reaches
   the recap text; a stop is done only when every test passes; the check-in
   status is a function of the last date alone. */
const H = require('./_harness.js');
const { fc, prop, TABLES, arbSpec, build } = H;
const S = H.engine('session');
const stops = S.path(TABLES.sessionPaths, 'default', {});

const props = H.generic('session', { nondeterministic: ['lifeMap', 'goals'] }).concat([
  prop('a recap of a household against itself: no number changed, every ratio the same', arbSpec, (spec) => {
    const h = build(spec);
    const r = S.recap(h, JSON.parse(JSON.stringify(h)), TABLES, { stops });
    const nums = r.sections.filter((s) => s.id === 'numbers')[0].lines;
    if (nums.length !== 1 || nums[0] !== 'No number changed.') return 'changed: ' + nums.join('; ');
    const ratios = r.sections.filter((s) => s.id === 'ratios')[0].lines;
    return ratios.every((l) => / \(same\)$/.test(l)) || 'a ratio moved: ' + ratios.join('; ');
  }),
  prop('coach notes never reach the recap, shared notes always do', fc.tuple(arbSpec, fc.stringMatching(/^[A-Z]{12}$/), fc.stringMatching(/^[a-z]{12}$/)), (t) => {
    const h = build(t[0]);
    const r = S.recap(h, h, TABLES, { stops, notes: [{ kind: 'coach', text: t[1] }, { kind: 'shared', text: t[2] }] });
    if (r.text.indexOf(t[1]) !== -1) return 'the coach note is in the recap';
    return r.text.indexOf(t[2]) !== -1 || 'the shared note is missing';
  }),
  prop('a stop is done exactly when every one of its tests passes', arbSpec, (spec) => {
    const h = build(spec);
    for (const s of stops) {
      const d = S.done(s, h, TABLES, {});
      if (d.done !== (d.tests.length > 0 && d.tests.every((x) => x.pass))) return s.id;
    }
    return true;
  }),
  prop('check-in status reads the last date only: in, then late, then missing', fc.integer({ min: 0, max: 400 }), (days) => {
    const now = Date.UTC(2026, 8, 24);
    const d = new Date(now - days * 86400000).toISOString().slice(0, 10);
    const s = S.checkinStatus([{ date: '2020-01-01' }, { date: d }], now);
    const want = days <= 35 ? 'in' : days <= 65 ? 'late' : 'missing';
    return s === want || (days + ' days: ' + s);
  })
]);
module.exports = H.suite('session', props);
if (require.main === module) H.main(module.exports);
