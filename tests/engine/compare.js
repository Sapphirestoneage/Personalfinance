/* compare(): two runs of the same household, one with a lever pulled. */
var P = require('../../engine/project.js');
var C = require('../../engine/compare.js');
var corpus = require('./households.js');

module.exports = function (t) {
  t.section('compare()');
  var h = corpus.households.single25;
  var a = P.project(h.household, h.assumptions, [], { now: corpus.NOW });
  /* The lever: $300 a month less on wants. */
  var cheaper = JSON.parse(JSON.stringify(h.household));
  cheaper.expenses.wants.totalCents -= 30000;
  var b = P.project(cheaper, h.assumptions, [], { now: corpus.NOW });
  var d = C.compare(a, b);
  t.checkTrue('headline shape', /^This (moves your FI date by \d+ months (earlier|later)|leaves your FI date where it is|does not change your FI date) and changes monthly cash flow by -?\$[\d,]+\.$/.test(d.headline), d.headline);
  t.checkTrue('spending less never moves FI later', d.fiMonths === null || d.fiMonths <= 0);
  t.check('monthly cash flow up by $300', d.monthlyCashFlowDeltaCents, 30000, 100);
  t.check('first divergence is the first year', d.firstDivergenceYear, 2026);
  t.checkTrue('net worth at 60 reported', d.netWorthAt.some(function (n) { return n.age === 60 && n.deltaCents !== null; }));
  t.checkTrue('net worth higher with lower spending', d.netWorthAt.filter(function (n) { return n.age === 60; })[0].deltaCents > 0);
  t.checkTrue('lifetime tax figures present', typeof d.lifetimeTaxDeltaCents === 'number' && typeof d.lifetimeTaxDeltaTodayCents === 'number');
  var same = C.compare(a, a);
  t.check('same run: no divergence', same.firstDivergenceYear, null);
  t.check('same run: zero FI months', same.fiMonths, 0);
  t.check('same run: no new warnings', same.newWarningYears.length, 0);
  /* A block through the engine: a $20,000 car bought with cash in 2028, as a one-off line. */
  var block = { id: 'b_test', type: 'car', label: 'Car', active: true, dates: [{ start: '2028-03', end: null }],
    lines: [{ id: 'price', label: 'Paid in cash', path: 'assets.cashCents', kind: 'oneoff', delta: -2000000 }, { id: 'running', label: 'Running costs', path: 'expenses.needs.transportation', kind: 'monthly', delta: 15000 }] };
  var withCar = P.project(h.household, h.assumptions, [block], { now: corpus.NOW });
  var dc = C.compare(a, withCar);
  t.check('block: diverges the year it opens', dc.firstDivergenceYear, 2028);
  t.checkTrue('block: listed as active', withCar.years.filter(function (r) { return r.year === 2029; })[0].activeBlocks.length === 1);
  t.checkTrue('block: ten months of running costs in 2028', withCar.years.filter(function (r) { return r.year === 2028; })[0].spending.fatCents - a.years.filter(function (r) { return r.year === 2028; })[0].spending.fatCents > 0);
  t.checkTrue('block: never earlier FI', dc.fiMonths === null || dc.fiMonths >= 0);
};
