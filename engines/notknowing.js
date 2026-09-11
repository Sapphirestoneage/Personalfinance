/* ==========================================================================
   engines/notknowing.js — the cost of not knowing. DECISIONS.md D-214 (I2).
   --------------------------------------------------------------------------
   For every blank or rough row that names what it unlocks, how much it
   could swing the insight it feeds: the dependent output at the low end
   and the high end of a plausible range (data/plausible_ranges.json),
   read off a copy of the household with the row set to each bound.
   Always phrased as a swing, never as money lost. The doors can sort
   blanks by swing so the most valuable unknown is asked first.

     NotKnowing.swing(rowId, h, tables) → { rowId, feeds, low, high,
                                            swing, unit, line } or null
     NotKnowing.all(h, tables)          → every open row's swing, largest first
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('../shared/money.js'), Schema: require('../shared/schema.js'), Tier0: require('./tier0.js'), LedgerRows: require('../shared/ledger-rows.js'), Ownership: require('../shared/ownership.js'),
      Reachable: (function () { try { return require('./reachable.js'); } catch (e) { return null; } })() };
  } else {
    var S = root.SLAF || {};
    deps = { Money: S.Money, Schema: S.Schema, Tier0: S.Tier0, LedgerRows: S.LedgerRows, Ownership: S.Ownership, Reachable: S.Reachable };
  }
  var api = factory(deps.Money, deps.Schema, deps.Tier0, deps.LedgerRows, deps.Ownership, deps.Reachable);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.NotKnowing = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Tier0, LedgerRows, Ownership, Reachable) {
  'use strict';
  /* Setting a row on a COPY, never through the spine. One setter a row. */
  function needs(h) { h.expenses = Schema.createExpenses(h.expenses); return h.expenses.needs; }
  var SET = {
    cashSavings: function (h, v) { h.assets = (h.assets || []).filter(function (a) { return a.category !== 'cash'; }).concat([Schema.createAsset({ id: 'nk_cash', category: 'cash', valueCents: v })]); },
    investments: function (h, v) { h.assets = (h.assets || []).filter(function (a) { return a.category !== 'investment' && a.category !== 'retirement'; }).concat([Schema.createAsset({ id: 'nk_inv', category: 'investment', valueCents: v })]); },
    grossAnnualIncome: function (h, v) { var p = Schema.primaryPerson(h); if (!p) return; p.incomeSources = (p.incomeSources || []).slice(); if (!p.incomeSources.length) p.incomeSources.push(Schema.createIncomeSource({ id: 'nk_src', personId: p.id, type: 'w2' })); p.incomeSources[0].grossAnnualIncomeCents = v; },
    foodMonthly: function (h, v) { needs(h).food = { monthlyCents: v }; },
    accommodationMonthly: function (h, v) { needs(h).accommodation = { monthlyCents: v }; },
    transportationMonthly: function (h, v) { needs(h).transportation = { monthlyCents: v }; },
    therapyMonthly: function (h, v) { h.expenses = Schema.createExpenses(h.expenses); h.expenses.wants.therapy = { monthlyCents: v }; },
    wantsMonthly: function (h, v) { h.expenses = Schema.createExpenses(h.expenses); h.expenses.wants.totalCents = v; },
    unemployment: function (h, v) { var p = Schema.primaryPerson(h); if (p) p.unemployment = Object.assign({}, Schema.unemploymentOf(h), { benefitWeeklyCents: v }); },
    debtRate: function (h, v, item) { (h.debts || []).forEach(function (d) { if (!item || d.id === item.id) d.rate = v; }); },
    assetCostBasis: function (h, v, item) { (h.assets || []).forEach(function (a) { if (!item || a.id === item.id) a.costBasisCents = v; }); }
  };
  var READ = {
    fiMonths: function (h, T) { var y = Tier0.yearsToFire(h, T, null, { fractional: true }); return Money.isOk(y) ? Money.ok(y.value * 12) : y; },
    runwayMonths: function (h, T) { return Tier0.emergencyFundMonths(h); },
    netWorthCents: function (h) { return Ownership.FIELDS.netWorth.read(h); },
    takeHomeMonthlyCents: function (h, T) { return Tier0.takeHomeMonthlyCents(h, T); },
    reachableCents: function (h, T) { if (!Reachable) return Money.incomplete('No waterfall.', []); var w = Reachable.waterfall(h, T, {}); return w.status === 'ok' ? Money.ok(w.reachableCents) : Money.incomplete('No accounts.', []); },
    interestMonthlyCents: function (h) { return Money.ok((h.debts || []).reduce(function (s, d) { return s + (Money.isEntered(d.rate) && Money.isEntered(d.balanceCents) ? Math.round(d.balanceCents * d.rate / 12) : 0); }, 0)); }
  };
  var UNITS = { fiMonths: 'months', runwayMonths: 'months', netWorthCents: 'cents', takeHomeMonthlyCents: 'cents', reachableCents: 'cents', interestMonthlyCents: 'cents' };
  var WORDS = { fiMonths: 'your FI date', runwayMonths: 'the runway', netWorthCents: 'net worth', takeHomeMonthlyCents: 'take-home pay a month', reachableCents: 'reachable money', interestMonthlyCents: 'interest a month' };
  function fmt(feeds, v) {
    if (UNITS[feeds] === 'months') { var m = Math.round(v); return m === 1 ? '1 month' : m + ' months'; }
    return Money.formatCents(Math.round(v));
  }
  function at(h, T, rowId, bound, item) {
    var copy = JSON.parse(JSON.stringify(h));
    if (item) { var list = copy.debts || []; item = list.filter(function (d) { return d.id === item.id; })[0] || (copy.assets || []).filter(function (a) { return a.id === item.id; })[0] || item; }
    SET[rowId](copy, bound, item);
    return copy;
  }
  function swing(rowId, household, tables, item) {
    var T = tables || {};
    var table = T.plausibleRanges && T.plausibleRanges.rows ? T.plausibleRanges.rows[rowId] : null;
    if (!table || !SET[rowId] || !READ[table.feeds]) return null;
    var high = table.high;
    if (high === null) {
      /* A basis has no ceiling of its own: the asset's value is the top. */
      if (!item || !Money.isEntered(item.valueCents)) return null;
      high = item.valueCents;
    }
    var lo = READ[table.feeds](at(household, T, rowId, table.low, item), T);
    var hi = READ[table.feeds](at(household, T, rowId, high, item), T);
    if (!Money.isOk(lo) || !Money.isOk(hi)) return null;
    var s = Math.abs(hi.value - lo.value);
    var row = LedgerRows.byId(rowId);
    var line = 'This blank could move ' + WORDS[table.feeds] + ' by up to ' + fmt(table.feeds, s) + '.';
    if (table.feeds === 'reachableCents') line = 'This blank hides up to ' + fmt(table.feeds, s) + ' of reachable money.';
    return { rowId: rowId, itemId: item ? item.id : null, label: row ? row.label : rowId, feeds: table.feeds, low: lo.value, high: hi.value, swing: s, unit: UNITS[table.feeds], line: line, bounds: { low: table.low, high: high } };
  }
  /** Every open row with a range: largest swing first. */
  function all(household, tables) {
    var T = tables || {};
    var out = [];
    LedgerRows.rows(household, T, { filter: 'open' }).forEach(function (r) {
      if (r.kind === 'computed' || !r.unlocks) return;
      if (r.repeat) {
        (LedgerRows.items(household, r) || []).forEach(function (it) {
          var v = LedgerRows.itemValue(r, it);
          if (v === null || v === undefined) { var s = swing(r.id, household, T, it); if (s) out.push(s); }
        });
        return;
      }
      var s2 = swing(r.id, household, T, null);
      if (s2) out.push(s2);
    });
    /* A swing of nothing is not a caution worth a line. */
    out = out.filter(function (s) { return s.swing > 0; });
    out.sort(function (a, b) { return b.swing - a.swing; });
    return out;
  }
  return { swing: swing, all: all, SET: Object.keys(SET), FEEDS: Object.keys(READ) };
});
