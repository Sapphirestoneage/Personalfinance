/* ==========================================================================
   engines/variance.js — closed months read back: estimated against actual,
   month over month, bucket by bucket. DECISIONS.md D-128.
   --------------------------------------------------------------------------
   Reads MonthRecords only (household.ledger.months), never the live month.
   Every figure is arithmetic on frozen columns; the one thing that leaves
   this module is a proposal — "use the last N months' actual as next
   month's estimate" — which the room writes only when tapped.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('../shared/money.js'), Schema: require('../shared/schema.js') };
  } else {
    var S = root.SLAF || {};
    deps = { Money: S.Money, Schema: S.Schema };
  }
  var api = factory(deps.Money, deps.Schema);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Variance = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema) {
  'use strict';

  var BUCKETS = Schema.BUDGET_BUCKETS;
  var LABELS = { income: 'Income', expenses: 'Expenses', savings: 'Savings', investments: 'Investments', debt: 'Debt' };

  /* Through the constructor, so a record written this session reads with
     its label and its five buckets whether or not it has been reloaded. */
  function months(h) { return ((h && h.ledger && h.ledger.months) || []).map(function (m) { return Schema.createMonthRecord(m); }).filter(function (m) { return m.id; }).sort(function (a, b) { return a.id < b.id ? -1 : 1; }); }
  function actualOf(record, bucket, useRevised) {
    var r = useRevised && record.actualRevised && Money.isEntered(record.actualRevised[bucket]) ? record.actualRevised[bucket] : record.actual[bucket];
    return Money.isEntered(r) ? r : null;
  }

  /** One month: per bucket, estimated, actual, the difference and its share. */
  function single(record, opts) {
    var useRevised = !!(opts && opts.revised);
    if (!record) return Money.incomplete('Pick a closed month.', ['month']);
    var rows = BUCKETS.map(function (b) {
      var e = Money.isEntered(record.estimated[b]) ? record.estimated[b] : null;
      var a = actualOf(record, b, useRevised);
      var diff = e !== null && a !== null ? a - e : null;
      /* Over for a spending bucket is spending more than estimated; over
         for income is earning less — the sign that hurts is 'over'. */
      var hurts = diff === null ? null : b === 'income' ? diff < 0 : diff > 0;
      return { bucket: b, label: LABELS[b], estimatedCents: e, actualCents: a, revised: useRevised && record.actualRevised && record.actualRevised[b] !== record.actual[b],
        differenceCents: diff, share: diff !== null && e ? diff / Math.abs(e) : null, hurts: hurts };
    });
    var worst = rows.filter(function (r) { return r.share !== null; }).sort(function (a, b) { return Math.abs(b.share) - Math.abs(a.share); })[0] || null;
    return Money.ok(rows.filter(function (r) { return r.hurts === true; }).length, { month: record.id, label: record.label, rows: rows, worst: worst, hasRevised: !!record.actualRevised });
  }

  /** Every closed month, per bucket: the two lines to draw and the variance each month. */
  function trend(h, opts) {
    var all = months(h);
    if (all.length < 2) return Money.incomplete(all.length ? 'One month closed; a trend needs two.' : 'No month closed yet. Close one on the Budget and come back.', ['months']);
    var useRevised = !!(opts && opts.revised);
    var series = {};
    BUCKETS.forEach(function (b) {
      series[b] = { bucket: b, label: LABELS[b], estimated: [], actual: [], variance: [] };
      all.forEach(function (m, i) {
        var e = Money.isEntered(m.estimated[b]) ? m.estimated[b] : null, a = actualOf(m, b, useRevised);
        series[b].estimated.push([i, e]); series[b].actual.push([i, a]);
        series[b].variance.push({ month: m.id, label: m.label, cents: e !== null && a !== null ? a - e : null, share: e !== null && a !== null && e ? (a - e) / Math.abs(e) : null });
      });
    });
    return Money.ok(all.length, { months: all.map(function (m) { return { id: m.id, label: m.label }; }), series: series });
  }

  /** Per bucket across every closed month: the average miss and how steady it is. */
  function perBucket(h, opts) {
    var all = months(h);
    if (!all.length) return Money.incomplete('No month closed yet.', ['months']);
    var useRevised = !!(opts && opts.revised);
    var rows = BUCKETS.map(function (b) {
      var shares = [], cents = [];
      all.forEach(function (m) {
        var e = Money.isEntered(m.estimated[b]) ? m.estimated[b] : null, a = actualOf(m, b, useRevised);
        if (e === null || a === null) return;
        cents.push(a - e);
        if (e) shares.push((a - e) / Math.abs(e));
      });
      var mean = function (xs) { return xs.length ? xs.reduce(function (t, x) { return t + x; }, 0) / xs.length : null; };
      var avgShare = mean(shares), avgCents = mean(cents);
      var spread = shares.length > 1 ? Math.sqrt(mean(shares.map(function (s) { return (s - avgShare) * (s - avgShare); }))) : null;
      var sameWay = shares.length > 1 && shares.every(function (s) { return s > 0; }) ? 'over' : shares.length > 1 && shares.every(function (s) { return s < 0; }) ? 'under' : null;
      return { bucket: b, label: LABELS[b], months: cents.length, averageCents: avgCents === null ? null : Math.round(avgCents), averageShare: avgShare, spread: spread, sameWay: sameWay,
        lastActualCents: (function () { for (var i = all.length - 1; i >= 0; i--) { var a = actualOf(all[i], b, useRevised); if (a !== null) return a; } return null; })() };
    });
    return Money.ok(all.length, { rows: rows });
  }

  /** The proposal: the average actual of the last N closed months, for a bucket. */
  function proposal(h, bucket, n, opts) {
    var all = months(h).filter(function (m) { return actualOf(m, bucket, !!(opts && opts.revised)) !== null; });
    if (!all.length) return Money.incomplete('No closed month has an actual for ' + LABELS[bucket] + '.', ['months']);
    var last = all.slice(-(n || 3));
    var avg = Math.round(last.reduce(function (t, m) { return t + actualOf(m, bucket, !!(opts && opts.revised)); }, 0) / last.length);
    return Money.ok(avg, { bucket: bucket, months: last.map(function (m) { return m.label; }), count: last.length });
  }

  return { BUCKETS: BUCKETS, LABELS: LABELS, months: months, single: single, trend: trend, perBucket: perBucket, proposal: proposal };
});
