/* ==========================================================================
   tests/engine/golden.js, the owner's golden household.
   When tests/engine/golden/household.json and expected.json exist, the
   engine's run is checked against the sheet's figures year by year within
   the tolerance in expected.json (`toleranceCents`, default $100), and
   every difference outside it is printed with the year and the column.
   Until the sheet arrives this prints the slot and passes.
   expected.json shape:
     { "toleranceCents": 10000, "assumptions": { ...overrides... }, "now": "2026-01-01",
       "years": [ { "year": 2026, "taxes.totalCents": 1234500, "netWorthCents": 99900000, ... } ] }
   Each key in a year is a dotted path into the YearRow.
   ========================================================================== */
var fs = require('fs'), path = require('path');
var P = require('../../engine/project.js');

function at(obj, dotted) { return dotted.split('.').reduce(function (o, k) { return o === null || o === undefined ? undefined : o[k]; }, obj); }

module.exports = function (t) {
  t.section('Golden household');
  var dir = path.join(__dirname, 'golden');
  var hp = path.join(dir, 'household.json'), ep = path.join(dir, 'expected.json');
  if (!fs.existsSync(hp) || !fs.existsSync(ep)) {
    console.log('   (no golden household yet: add tests/engine/golden/household.json and expected.json from the client sheet)');
    t.checkTrue('golden slot present', true);
    return;
  }
  var household = JSON.parse(fs.readFileSync(hp, 'utf8')), expected = JSON.parse(fs.readFileSync(ep, 'utf8'));
  var tol = expected.toleranceCents || 10000;
  var run = P.project(household, expected.assumptions || {}, expected.blocks || [], { now: expected.now ? new Date(expected.now) : undefined });
  (expected.years || []).forEach(function (ey) {
    var row = run.years.filter(function (r) { return r.year === ey.year; })[0];
    t.checkTrue('golden ' + ey.year + ' exists', !!row);
    if (!row) return;
    Object.keys(ey).forEach(function (k) {
      if (k === 'year') return;
      var got = at(row, k);
      t.check('golden ' + ey.year + ' ' + k, got, ey[k], tol);
    });
  });
};
