/* ==========================================================================
   engines/history.js — History: every snapshot frozen, what moved between
   them, and the command log.
   --------------------------------------------------------------------------
   A snapshot (shared/spine-v2.js appendSnapshot, taken through
   shared/instruments.js snapshot) freezes every owned field (`fields`, by
   field id) and every instrument's Result (`computedOutputs`, by
   instrument id) at that moment. This engine reads those back against the
   household as it is NOW — the "now" side is Instruments.outputs on the
   current household, never a stored figure — and says what changed since a
   chosen baseline: the compare-to snapshot when it still exists, else the
   first one frozen.

   Nothing financial is derived here. Net worth, cash, investments and debt
   come from the instruments engine (which reads Tier0.netWorth); the only
   arithmetic is after − before, and the share of before when before is not
   zero. The command log is the spine's own (meta.undoStack, D-094); this
   file lists it, newest first.

   Result: History.review(h, snapshots, T, { now }) → Money.ok(netWorthDelta,
   { … }) or Money.incomplete(reason) carrying the same extras (snapshots,
   log, baseline) so a room can still list the log when there is nothing to
   compare yet. NEVER a key named `status` in the extras.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('../shared/money.js'), Instruments: require('../shared/instruments.js') };
  } else {
    var S = root.SLAF || {};
    deps = { Money: S.Money, Instruments: S.Instruments };
  }
  var api = factory(deps.Money, deps.Instruments);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.History = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Instruments) {
  'use strict';

  var MS_PER_DAY = 86400000;
  var LOG_SHOWN = 10;

  /* The three balance-sheet figures a snapshot freezes as owned fields
     (the field ids are shared/ownership.js's), and where each also sits
     inside the frozen net-worth Result, for a snapshot taken before the
     field existed. */
  var PARTS = [
    { id: 'cash',        field: 'cashSavings', label: 'Cash',        fromNetWorth: function (nw) { return nw && nw.cash ? readStored(nw.cash) : null; } },
    { id: 'investments', field: 'investments', label: 'Investments', fromNetWorth: function (nw) { return nw && nw.investments ? readStored(nw.investments) : null; } },
    { id: 'debt',        field: 'totalDebt',   label: 'Debt',        fromNetWorth: function (nw) { return nw && Money.isEntered(nw.totalDebtCents) ? nw.totalDebtCents : null; } }
  ];

  /* A stored figure is a bare number or a {status, value} Result (D-056);
     both read to a number or null. */
  function readStored(v) {
    if (v && typeof v === 'object' && 'status' in v) return v.status === 'ok' && Money.isEntered(v.value) ? v.value : null;
    return Money.isEntered(v) ? v : null;
  }
  function stored(bucket, id) {
    if (!bucket || !Object.prototype.hasOwnProperty.call(bucket, id)) return null;
    return readStored(bucket[id]);
  }

  /* ---- Formatting only: dates and "ago" ------------------------------------- */

  function dateLabel(ms) {
    if (!Number.isFinite(ms)) return '';
    return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  /** "just now", "4 minutes ago", "3 hours ago", "yesterday", "12 days ago",
   *  then months and years. A log entry is minutes old more often than
   *  days, which is why this is finer than Staleness.label. */
  function ago(ms, nowMs) {
    if (!Number.isFinite(ms) || !Number.isFinite(nowMs)) return '';
    var s = Math.max(0, Math.round((nowMs - ms) / 1000));
    if (s < 60) return 'just now';
    var m = Math.floor(s / 60);
    if (m < 60) return m + (m === 1 ? ' minute ago' : ' minutes ago');
    var hrs = Math.floor(m / 60);
    if (hrs < 24) return hrs + (hrs === 1 ? ' hour ago' : ' hours ago');
    var days = Math.floor(hrs / 24);
    if (days === 1) return 'yesterday';
    if (days < 31) return days + ' days ago';
    if (days < 61) return 'about a month ago';
    if (days < 365) return Math.round(days / 30) + ' months ago';
    if (days < 730) return 'over a year ago';
    return Math.floor(days / 365) + ' years ago';
  }

  /* ---- The pieces ----------------------------------------------------------- */

  /** One snapshot read into the figures this room cares about. */
  function readSnapshot(s) {
    var ms = Date.parse(s && s.timestamp);
    var nw = s && s.computedOutputs ? s.computedOutputs.netWorth : null;
    var row = { id: s.id, timestamp: s.timestamp || null, ms: Number.isFinite(ms) ? ms : null, label: dateLabel(ms),
      netWorthCents: stored(s.computedOutputs, 'netWorth'), outputs: s.computedOutputs || {}, fields: s.fields || {} };
    PARTS.forEach(function (p) {
      var v = stored(s.fields, p.field);
      row[p.id + 'Cents'] = v !== null ? v : p.fromNetWorth(nw);
    });
    return row;
  }

  /** The command log, newest first, the last LOG_SHOWN of it. */
  function readLog(household, nowMs) {
    var stack = (household && household.meta && Array.isArray(household.meta.undoStack)) ? household.meta.undoStack : [];
    var entries = stack.slice(-LOG_SHOWN).reverse().map(function (e) {
      var ms = Date.parse(e && e.ts);
      return { label: (e && e.label) || 'A change', ts: (e && e.ts) || null, ms: Number.isFinite(ms) ? ms : null,
        ago: ago(ms, nowMs), changes: Array.isArray(e && e.changes) ? e.changes.length : 0 };
    });
    return { count: stack.length, cap: 100, entries: entries, last: entries.length ? entries[0] : null };
  }

  /** Which snapshot to measure from: the one asked for when it still exists, else the first. */
  function pickBaseline(rows, compareTo) {
    if (!rows.length) return { baseline: null, fallback: false };
    if (!compareTo) return { baseline: rows[0], fallback: false };
    var hit = rows.filter(function (r) { return r.id === compareTo; })[0];
    return hit ? { baseline: hit, fallback: false } : { baseline: rows[0], fallback: true };
  }

  function change(before, after) {
    var both = Money.isEntered(before) && Money.isEntered(after);
    return { before: Money.isEntered(before) ? before : null, after: Money.isEntered(after) ? after : null,
      delta: both ? after - before : null, pct: both && before !== 0 ? (after - before) / Math.abs(before) : null };
  }

  /* ---- The review ----------------------------------------------------------- */

  /**
   * review(h, snapshots, T, { now }) → Result
   *   value          net worth now − net worth at the baseline, cents
   *   snapshots      every snapshot read (id, ms, label, netWorthCents, cash/investments/debt)
   *   count          how many
   *   baseline       the one measured from (or null)
   *   baselineFallback  true when compareTo named a snapshot that no longer exists
   *   compareTo      what the household asked for (or null)
   *   sinceLabel     the baseline's date
   *   netWorth, cash, investments, debt   { before, after, delta, pct }
   *   instruments    every Instruments row: { id, label, unit, before, after, delta }
   *   now            the instruments' outputs on the household today
   *   points         [{ x: days since the first snapshot, y: net worth cents, id, isNow, isBaseline }]
   *   log            { count, entries (newest first, ≤ 10), last }
   *   zone           'good' when net worth rose, 'out' when it fell, null otherwise or with one snapshot
   */
  function review(household, snapshots, tables, opts) {
    var h = household || {};
    var nowMs = opts && Number.isFinite(opts.now) ? opts.now : Date.now();
    var list = Array.isArray(snapshots) ? snapshots.filter(function (s) { return s && s.id; }) : [];
    var rows = list.map(readSnapshot).sort(function (a, b) { return (a.ms || 0) - (b.ms || 0); });
    var log = readLog(h, nowMs);
    var compareTo = h.history && typeof h.history.compareTo === 'string' && h.history.compareTo ? h.history.compareTo : null;
    var pick = pickBaseline(rows, compareTo);
    var outputsNow = Instruments.outputs(h, tables, nowMs);
    var nwNow = readStored(outputsNow.netWorth);
    var base = { snapshots: rows, count: rows.length, baseline: pick.baseline, baselineFallback: pick.fallback, compareTo: compareTo,
      sinceLabel: pick.baseline ? pick.baseline.label : null, log: log, now: outputsNow, nowMs: nowMs, netWorthNowCents: nwNow, points: [], instruments: [], zone: null,
      netWorth: change(null, nwNow), cash: change(null, null), investments: change(null, null), debt: change(null, null) };

    function fail(reason, missing) { return Object.assign(Money.incomplete(reason, missing), base); }
    if (!rows.length) return fail('Freeze once to start.', ['snapshots']);

    var b = pick.baseline;
    /* The chart's points: every snapshot that held a net worth, and today. */
    var first = rows[0].ms;
    base.points = rows.filter(function (r) { return r.netWorthCents !== null && r.ms !== null; }).map(function (r) {
      return { x: (r.ms - first) / MS_PER_DAY, y: r.netWorthCents, id: r.id, ms: r.ms, isNow: false, isBaseline: r.id === b.id };
    });
    if (nwNow !== null && first !== null) base.points.push({ x: (nowMs - first) / MS_PER_DAY, y: nwNow, id: null, ms: nowMs, isNow: true, isBaseline: false });

    /* Every instrument, frozen then against computed now. */
    base.instruments = Instruments.INSTRUMENTS.map(function (spec) {
      var before = stored(b.outputs, spec.id), after = readStored(outputsNow[spec.id]);
      return { id: spec.id, label: spec.label, unit: spec.unit, before: before, after: after,
        delta: before !== null && after !== null ? after - before : null };
    });
    base.netWorth = change(b.netWorthCents, nwNow);
    PARTS.forEach(function (p) { base[p.id] = change(b[p.id + 'Cents'], readStored(outputsNow.netWorth && outputsNow.netWorth[p.id === 'debt' ? 'totalDebtCents' : p.id])); });

    if (nwNow === null) return fail(outputsNow.netWorth && outputsNow.netWorth.reason ? outputsNow.netWorth.reason : 'Add what you own and what you owe to see this.', (outputsNow.netWorth && outputsNow.netWorth.missing) || ['assets', 'debts']);
    if (b.netWorthCents === null) return fail('That snapshot did not hold a net worth; freeze again once your balances are in.', ['snapshots']);

    var delta = base.netWorth.delta;
    base.zone = rows.length < 2 || delta === 0 ? null : delta > 0 ? 'good' : 'out';
    return Money.ok(delta, base);
  }

  /** The instruments a snapshot freezes, by name — for the drawer. */
  function frozenNames() { return Instruments.INSTRUMENTS.map(function (s) { return s.label; }); }

  return {
    LOG_SHOWN: LOG_SHOWN,
    PARTS: PARTS,
    review: review,
    readSnapshot: readSnapshot,
    readLog: readLog,
    pickBaseline: pickBaseline,
    change: change,
    ago: ago,
    dateLabel: dateLabel,
    frozenNames: frozenNames
  };
});
