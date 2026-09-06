/* ==========================================================================
   test/rooms/panel.js — the dashboard panel must not lie, and must not fall
   over.
   --------------------------------------------------------------------------
   Written from a four-way audit of index.html's #full-panel (D-143). Each
   check below is a thing the panel actually did, reproduced.
   ========================================================================== */
module.exports = function (t) {
  var check = t.check, checkTrue = t.checkTrue, section = t.section;
  var Money = t.Money, Demo = t.Demo, TABLES = t.TABLES;
  var Ratios = t.Ratios, Fire = require(t.path.join(t.ROOT, 'engines/fire.js'));
  var Statement = require(t.path.join(t.ROOT, 'engines/statement.js'));

  section('The dashboard panel: an affirmative zero is a number, not a crash (D-143)');

  /* Someone types 0 for a month of spending. That is a real answer — the
     first non-negotiable in CLAUDE.md exists to keep it distinct from
     "not entered". It used to blank every panel on the dashboard and blame
     the reference tables in data/. */
  function zeroSpending() {
    var h = Demo.build();
    h.expenses = h.expenses || {};
    h.expenses.monthlyEssential = { estimatedValueCents: 0, source: 'typed' };
    return h;
  }

  var h0 = zeroSpending();
  var threw = null, all = null;
  try { all = Ratios.all(h0, TABLES); } catch (e) { threw = e.message; }
  check('Ratios.all survives a month of spending of zero', threw, null);
  checkTrue('… and still returns its rows', !!all && all.rows.length > 20);

  /* The root cause: a FIRE target of zero returned a progress object with no
     `yearsAway`, and three frames above it that undefined was handed on as
     if it were a Result. */
  var prog = Fire.progressToward(h0, TABLES, { variantId: 'standard' });
  checkTrue('a FIRE target of zero still says how far away it is', !!prog.yearsAway && !!prog.yearsAway.status);
  check('… and the answer is nought years, because you are already there', Money.isOk(prog.yearsAway) ? prog.yearsAway.value : 'not ok', 0);

  /* The relay: a function that cannot answer says so in its own words rather
     than handing on whatever it was given. */
  var bridge = Statement.bridgeGap(h0, TABLES);
  checkTrue('bridgeGap always returns a Result, whatever it was handed', !!bridge && !!bridge.status);

  /* The guard: one ratio breaking its contract must not take the page down.
     Twenty-one other ratios were fine. */
  var TABLES2 = {};
  Object.keys(TABLES).forEach(function (k) { TABLES2[k] = TABLES[k]; });
  var rowsWithNoResult = null, threw2 = null;
  try {
    /* Feed a household that makes several ratios unavailable and check the
       page still gets a full set of rows back, each one a Result. */
    rowsWithNoResult = Ratios.all({}, TABLES2);
  } catch (e) { threw2 = e.message; }
  check('Ratios.all survives an empty household', threw2, null);
  checkTrue('… and every row carries a Result, never undefined',
    !!rowsWithNoResult && rowsWithNoResult.rows.every(function (r) { return !!r.result && !!r.result.status; }));
  checkTrue('… and a row that could not be worked out says so rather than reading as fine',
    rowsWithNoResult.rows.every(function (r) { return r.ok || !!r.result.reason; }));
};
