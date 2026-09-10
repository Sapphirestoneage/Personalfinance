/* ==========================================================================
   shared/ledger-rows.js — the Ledger's row registry, read (18.2, D-183).
   --------------------------------------------------------------------------
   data/ledger-rows.json lists every number the app can hold, one row each,
   keyed by the ownership field id so a row reads and writes through the
   one map every room already uses (shared/ownership.js). This module is
   the reader: which rows apply to a household, what state each is in, what
   to do next.

     LedgerRows.use(table) / table()   the registry (Reference in a room)
     LedgerRows.applies(row, h)        its appliesWhen (Levers.appliesWhen)
     LedgerRows.status(h, row, tables) { state, value, meta, stale, days }
                                       state: sure | roughly | missing |
                                       computed | stale
     LedgerRows.rows(h, tables, opts)  the applicable rows, in pass order
                                       then file order, each with its
                                       status; opts.filter: rough | missing
                                       | stale | all; opts.query: label
                                       search; opts.letter
     LedgerRows.next(h, tables)        exactly one row: the first missing or
                                       rough row of the lowest pass
     LedgerRows.roughRows(h, tables)   the rows at roughly / unknown
     LedgerRows.minutes(rows)          a cost in minutes for a list of rows
     LedgerRows.readersOf(row)         the rooms whose registry entry reads
                                       the row's field (tap targets)
     LedgerRows.inputsOf(row, h, tables) a computed row's inputs, each with
                                       its own row and whether it is missing
   Named LedgerRows because SLAF.Ledger is the dated-income engine (D-128).
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('./money.js'), Schema: require('./schema.js'), Ownership: require('./ownership.js'), Levers: require('./levers.js'),
      Daite: require('./daite.js'),
      Staleness: (function () { try { return require('./staleness.js'); } catch (e) { return null; } })(),
      Registry: (function () { try { return require('./registry.js'); } catch (e) { return null; } })(),
      Prefs: (function () { try { return require('./prefs.js'); } catch (e) { return null; } })() };
  } else {
    var S = root.SLAF || {};
    deps = { Money: S.Money, Schema: S.Schema, Ownership: S.Ownership, Levers: S.Levers, Daite: S.Daite, Staleness: S.Staleness, Registry: S.Registry, Prefs: S.Prefs };
  }
  var api = factory(deps.Money, deps.Schema, deps.Ownership, deps.Levers, deps.Daite, deps.Staleness, deps.Registry, deps.Prefs);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.LedgerRows = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Ownership, Levers, Daite, Staleness, Registry, Prefs) {
  'use strict';
  var TABLE = null;
  function use(t) { TABLE = t || TABLE; return TABLE; }
  function table() {
    if (TABLE) return TABLE;
    if (typeof module === 'object' && module.exports) { try { TABLE = require('../data/ledger-rows.json'); } catch (e) { TABLE = null; } }
    return TABLE;
  }
  function all() { var t = table(); return t && t.rows ? t.rows.slice() : []; }
  function byId(id) { return all().filter(function (r) { return r.id === id || (r.aliases || []).indexOf(id) >= 0; })[0] || null; }
  function applies(row, household) {
    return Levers && typeof Levers.appliesWhen === 'function' ? Levers.appliesWhen(row.appliesWhen, household) : true;
  }
  function field(row) { return Ownership && Ownership.FIELDS ? Ownership.FIELDS[row.id] || null : null; }
  /** Items for a repeat row: one line per debt, asset, source, period or yearly line. */
  function items(household, row) {
    var h = household || {};
    if (!row.repeat) return null;
    if (row.repeat === 'debts') return (h.debts || []).slice();
    if (row.repeat === 'assets') return Schema.aggregatableAssets ? Schema.aggregatableAssets(h) : (h.assets || []).slice();
    if (row.repeat === 'incomeSources') { var p = Schema.primaryPerson(h); return p ? (p.incomeSources || []).slice() : []; }
    if (row.repeat === 'futureIncome') return (h.futureIncome || []).slice();
    if (row.repeat === 'annualLines') return ((h.expenses || {}).annual || []).slice();
    return [];
  }
  /**
   * status(h, row, tables): the state of one row for this household.
   *   computed  never typed: the engine's answer, or its missing inputs
   *   missing   nothing entered
   *   stale     entered, past the staleness window for its field
   *   roughly   entered as a placeholder (confidence roughly / unsure / unknown)
   *   sure      entered and confirmed
   */
  /* A preference row (prefs.*) is read from Prefs, never from the household. */
  function prefValue(row) {
    if (!Prefs || !/^prefs\./.test(row.path)) return null;
    var v = Prefs.get(row.path.replace(/^prefs\./, ''), null);
    return v === null || v === undefined ? Money.incomplete('Not chosen yet.', [row.id]) : Money.ok(v);
  }
  function status(household, row, tables) {
    var h = household || {};
    var f = field(row);
    var value = prefValue(row) || (f && typeof f.read === 'function' ? f.read(h) : Money.incomplete('No reader for this row.', [row.id]));
    /* A yes-or-no answered by implication: a listed debt is a yes. */
    if (!Money.isOk(value) && row.impliedBy && items(h, { repeat: row.impliedBy }).length) value = Money.ok(true, { implied: row.impliedBy });
    var entered = Money.isOk(value);
    if (/^prefs\./.test(row.path)) return { state: entered ? 'sure' : 'missing', value: value, entered: entered, meta: null, stale: false, days: null };
    if (row.kind === 'computed') {
      return { state: 'computed', value: value, entered: entered, meta: null, stale: false, days: null };
    }
    if (row.repeat) {
      /* One line per item: the row's value is the count, its items the lines. */
      var list = items(h, row);
      entered = list.length > 0;
      value = entered ? Money.ok(list.length, { items: list }) : Money.incomplete('Nothing listed yet.', [row.id]);
    }
    if (!entered) return { state: 'missing', value: value, entered: false, meta: null, stale: false, days: null };
    var meta = Schema.meta ? Schema.meta(h, row.id) : { confidence: 'unknown', asOf: null, source: null };
    var st = Staleness && typeof Staleness.describe === 'function' ? Staleness.describe(h, row.id) : { stale: null, days: null };
    var state = meta.confidence === 'sure' ? 'sure' : 'roughly';
    if (st && st.stale === true) state = 'stale';
    return { state: state, value: value, entered: true, meta: meta, stale: st ? st.stale === true : false, days: st ? st.days : null };
  }
  function withStatus(household, row, tables) {
    var s = status(household, row, tables);
    return Object.assign({}, row, { status: s.state, result: s.value, meta: s.meta, stale: s.stale, days: s.days, entered: s.entered });
  }
  var FILTERS = {
    all: function () { return true; },
    rough: function (r) { return r.status === 'roughly' || r.status === 'stale'; },
    missing: function (r) { return r.status === 'missing'; },
    stale: function (r) { return r.status === 'stale'; },
    open: function (r) { return r.status === 'missing' || r.status === 'roughly' || r.status === 'stale'; }
  };
  /** The applicable rows, in pass order then file order, each with its status. */
  function rows(household, tables, opts) {
    var o = opts || {};
    var list = all().filter(function (r) { return applies(r, household); });
    if (o.letter) list = list.filter(function (r) { return r.letter === o.letter || (o.letter === 'you' && r.family === 'you'); });
    if (o.query) { var q = String(o.query).toLowerCase(); list = list.filter(function (r) { return r.label.toLowerCase().indexOf(q) >= 0; }); }
    list = list.map(function (r, i) { return Object.assign(withStatus(household, r, tables), { order: i }); });
    list.sort(function (a, b) { return (a.pass - b.pass) || (a.order - b.order); });
    var keep = FILTERS[o.filter || 'all'] || FILTERS.all;
    return list.filter(keep);
  }
  /** Exactly one row: the first missing or rough row, lowest pass first; null when none. */
  function next(household, tables) {
    var open = rows(household, tables, { filter: 'open' }).filter(function (r) { return r.kind !== 'computed'; });
    if (!open.length) return null;
    var missing = open.filter(function (r) { return r.status === 'missing'; });
    var pick = missing.length && missing[0].pass <= open[0].pass ? missing[0] : open[0];
    return Object.assign({}, pick, { minutesLeft: minutes(open), openCount: open.length });
  }
  function roughRows(household, tables) { return rows(household, tables, { filter: 'rough' }); }
  function minutes(list) {
    var m = (list || []).reduce(function (t, r) { return t + (Money.isEntered(r.minutes) ? r.minutes : 0); }, 0);
    return Math.round(m * 2) / 2;
  }
  /** The rooms whose registry entry reads this row's field. */
  function readersOf(row) {
    if (!Registry || typeof Registry.all !== 'function') return [];
    var ids = [row.id].concat(row.aliases || []);
    var paths = ids.map(function (id) { return Daite && Daite.PATHS ? Daite.PATHS[id] : null; }).filter(Boolean);
    return Registry.all().filter(function (r) {
      var needs = (r.needs || []).some(function (id) { return ids.indexOf(id) >= 0; });
      var reads = ((r.daite && r.daite.reads) || []).some(function (p) { return paths.indexOf(p) >= 0; });
      return needs || reads;
    }).map(function (r) { return { id: r.id, title: r.title, href: r.href }; });
  }
  /** A computed row's inputs, each with its row and whether it is missing. */
  function inputsOf(row, household, tables) {
    return (row.inputs || []).map(function (id) {
      var r = byId(id);
      if (!r) return { id: id, row: null, status: 'unknown', missing: true };
      var s = status(household, r, tables);
      /* A computed input is never "missing" itself: its own inputs are. */
      return { id: id, row: r, status: s.state, missing: s.state === 'missing', incomplete: s.state === 'computed' && !s.entered };
    });
  }
  /** The summary the Ledger's top line reads: counts by state and the minutes left. */
  function summary(household, tables) {
    var list = rows(household, tables, { filter: 'all' });
    var by = { sure: 0, roughly: 0, missing: 0, computed: 0, stale: 0 };
    list.forEach(function (r) { by[r.status] = (by[r.status] || 0) + 1; });
    var open = list.filter(FILTERS.open);
    return { total: list.length, by: by, open: open.length, minutesLeft: minutes(open) };
  }
  return { use: use, table: table, all: all, byId: byId, applies: applies, items: items, status: status, rows: rows, next: next,
    roughRows: roughRows, minutes: minutes, readersOf: readersOf, inputsOf: inputsOf, summary: summary, FILTERS: Object.keys(FILTERS) };
});
