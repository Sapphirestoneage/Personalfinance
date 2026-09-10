/* ==========================================================================
   shared/spheres.js — the nine spheres, read (19.1, D-184).
   --------------------------------------------------------------------------
   data/spheres.json is the one file: nine entries in order, each with three
   faces. Depth (which Ledger rows you enter) is the only face that gates
   anything, and it gates precision, never access. Shadow is a measurement
   with a cost in minutes or dollars; its NAME renders in exactly one place,
   the drawer, and this module never puts it in a sentence. Virtue is the
   word on screen.

     Spheres.use(table) / table() / all() / byId(id) / byOrder(n)
     Spheres.sphereOf(rowId)          the sphere a Ledger row belongs to
     Spheres.state(h, tables)         every sphere with its rows' status,
                                      complete (every applicable non-computed
                                      row at least roughly), sharp (every one
                                      sure), minutes left, and the household's
                                      current sphere (the lowest incomplete),
                                      completeThrough and sharpThrough
     Spheres.measure(h, tables, id)   the shadow measure, as a Result with
                                      the sentence filled in ({n} {minutes}
                                      {dollars}); the shadow name is not in it
     Spheres.cells(h, tables)         the target: five letters by nine
                                      spheres, each cell full | half | empty |
                                      dashed (any stale)
     Spheres.tile(h, tables, id)      what a Dashboard tile shows (19.2)
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    var req = function (p) { try { return require(p); } catch (e) { return null; } };
    deps = { Money: require('./money.js'), Schema: require('./schema.js'), LedgerRows: require('./ledger-rows.js'), Ownership: require('./ownership.js'),
      Tier0: req('../engines/tier0.js'), Swan: req('../engines/swan.js'), Variance: req('../engines/variance.js') };
  } else {
    var S = root.SLAF || {};
    deps = { Money: S.Money, Schema: S.Schema, LedgerRows: S.LedgerRows, Ownership: S.Ownership, Tier0: S.Tier0, Swan: S.Swan, Variance: S.Variance };
  }
  var api = factory(deps.Money, deps.Schema, deps.LedgerRows, deps.Ownership, deps.Tier0, deps.Swan, deps.Variance);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Spheres = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, LedgerRows, Ownership, Tier0, Swan, Variance) {
  'use strict';
  var LETTERS = ['D', 'A', 'I', 'T', 'E'];
  var RUNWAY_MONTHS_DEFAULT = 6;   /* the full emergency fund of data/foo_rules.json, when no sleep-at-night number is set */
  var TABLE = null;
  function use(t) { TABLE = t || TABLE; return TABLE; }
  function table() {
    if (TABLE) return TABLE;
    if (typeof module === 'object' && module.exports) { try { TABLE = require('../data/spheres.json'); } catch (e) { TABLE = null; } }
    return TABLE;
  }
  function all() { var t = table(); return t && t.spheres ? t.spheres.slice().sort(function (a, b) { return a.order - b.order; }) : []; }
  function byId(id) { return all().filter(function (s) { return s.id === id; })[0] || null; }
  function byOrder(n) { return all().filter(function (s) { return s.order === n; })[0] || null; }
  function sphereOf(rowId) {
    return all().filter(function (s) { return s.depth.rows.indexOf(rowId) >= 0; })[0] || null;
  }
  function counts(rows) {
    var gate = rows.filter(function (r) { return r.kind !== 'computed'; });
    var open = gate.filter(function (r) { return r.status === 'missing' || r.status === 'roughly' || r.status === 'stale'; });
    return {
      applicable: gate.length,
      sure: gate.filter(function (r) { return r.status === 'sure'; }).length,
      roughly: gate.filter(function (r) { return r.status === 'roughly' || r.status === 'stale'; }).length,
      missing: gate.filter(function (r) { return r.status === 'missing'; }).length,
      stale: gate.filter(function (r) { return r.status === 'stale'; }).length,
      open: open.length,
      minutesLeft: LedgerRows.minutes(open),
      complete: gate.every(function (r) { return r.status === 'sure' || r.status === 'roughly' || r.status === 'stale'; }),
      sharp: gate.every(function (r) { return r.status === 'sure'; })
    };
  }
  /**
   * state(h, tables): every sphere with its rows and counts, in order, and
   * where the household stands. A sphere with no applicable rows counts as
   * complete and sharp only once every sphere before it is.
   */
  function state(household, tables) {
    var rows = LedgerRows.rows(household, tables, { filter: 'all' });
    var byId_ = {}; rows.forEach(function (r) { byId_[r.id] = r; });
    var before = { complete: true, sharp: true };
    var list = all().map(function (s) {
      var mine = s.depth.rows.map(function (id) { return byId_[id]; }).filter(Boolean);
      var c = counts(mine);
      if (!c.applicable) { c.complete = before.complete; c.sharp = before.sharp; }
      before = { complete: before.complete && c.complete, sharp: before.sharp && c.sharp };
      return Object.assign({}, s, { rows: mine, counts: c, complete: c.complete, sharp: c.sharp, minutesLeft: c.minutesLeft });
    });
    var current = list.filter(function (s) { return !s.complete; })[0] || null;
    var completeThrough = 0, sharpThrough = 0;
    for (var i = 0; i < list.length; i++) { if (list[i].complete && completeThrough === i) completeThrough = i + 1; else break; }
    for (var j = 0; j < list.length; j++) { if (list[j].sharp && sharpThrough === j) sharpThrough = j + 1; else break; }
    return { spheres: list, current: current, currentOrder: current ? current.order : list.length + 1, completeThrough: completeThrough, sharpThrough: sharpThrough,
      minutesLeft: LedgerRows.minutes(rows.filter(function (r) { return r.kind !== 'computed' && r.status !== 'sure'; })) };
  }
  /** The 45 cells of the target: one per letter per sphere. */
  function cells(household, tables) {
    var st = state(household, tables);
    var out = [];
    st.spheres.forEach(function (s) {
      LETTERS.forEach(function (L) {
        var mine = s.rows.filter(function (r) { return r.letter === L && r.kind !== 'computed'; });
        var c = counts(mine);
        var fill = !mine.length ? 'none' : c.stale ? 'dashed' : c.sharp ? 'full' : c.complete ? 'half' : c.missing === mine.length ? 'empty' : 'half';
        out.push({ sphere: s.id, order: s.order, letter: L, rows: mine, fill: fill, counts: c });
      });
    });
    return out;
  }

  /* ---- The shadow measures: a measurement and a cost, never a judgement ---- */
  function fill(sentence, vars) {
    return String(sentence).replace(/\{(n|minutes|dollars)\}/g, function (_, k) {
      var v = vars[k];
      if (v === null || v === undefined) return '?';
      return k === 'dollars' ? Money.formatCents(v) : String(v);
    });
  }
  function untouchedRows(h, tables) {
    var rows = LedgerRows.rows(h, tables, { filter: 'missing' }).filter(function (r) { return r.kind !== 'computed'; });
    return Money.ok(rows.length, { n: rows.length, minutes: LedgerRows.minutes(rows), dollars: null, rows: rows });
  }
  function joyLowest(h, tables) {
    var f = Ownership && Ownership.FIELDS && Ownership.FIELDS.rerankCut;
    var r = f ? f.read(h) : Money.incomplete('The Rerank is not loaded.', ['rerank']);
    if (!Money.isOk(r)) return Money.incomplete(r.reason, r.missing);
    return Money.ok(r.value, { n: null, minutes: null, dollars: r.value });
  }
  function undatedDreams(h) {
    var list = (h && h.dreams) || [];
    var priced = list.filter(function (d) { return Money.isEntered(d.monthlyCents); });
    if (!priced.length) return Money.incomplete('No dream priced yet.', ['dreams']);
    var total = priced.reduce(function (t, d) { return t + d.monthlyCents; }, 0);
    return Money.ok(priced.length, { n: priced.length, minutes: null, dollars: total });
  }
  function roughRows(h, tables) {
    var rows = LedgerRows.roughRows(h, tables);
    return Money.ok(rows.length, { n: rows.length, minutes: LedgerRows.minutes(rows), dollars: null, rows: rows });
  }
  function highestRateLine(h) {
    var debts = ((h && h.debts) || []).filter(function (d) { return Money.isEntered(d.rate) && Money.isEntered(d.balanceCents) && d.balanceCents > 0; });
    if (!debts.length) return Money.incomplete('No debt with a rate entered.', ['debtRate']);
    var top = debts.slice().sort(function (a, b) { return b.rate - a.rate; })[0];
    var monthly = Math.round(top.balanceCents * top.rate / 12);
    return Money.ok(monthly, { n: Math.round(top.rate * 1000) / 10, minutes: null, dollars: monthly, debt: top });
  }
  function idleCash(h) {
    var cash = Schema.cashCents(h), spend = Schema.monthlyExpensesCents(h);
    if (!Money.isOk(cash)) return Money.incomplete('Add your cash to see this.', ['cashSavings']);
    if (!Money.isOk(spend)) return Money.incomplete('Add your spending to size the runway.', ['monthlyExpenses']);
    var months = RUNWAY_MONTHS_DEFAULT, source = 'convention';
    if (Swan && typeof Swan.targetMonths === 'function') { var t = Swan.targetMonths(h); if (Money.isOk(t)) { months = t.value; source = 'swan'; } }
    var idle = Math.max(0, cash.value - Math.round(spend.value * months));
    return Money.ok(idle, { n: months, minutes: null, dollars: idle, monthsSource: source });
  }
  function carShare(h) {
    var cars = ((h && h.assets) || []).filter(function (a) { return a.category === 'vehicle' && Money.isEntered(a.valueCents); });
    if (!cars.length) return Money.incomplete('No car listed.', ['assetValue']);
    var value = cars.reduce(function (t, a) { return t + a.valueCents; }, 0);
    var nw = Tier0 ? Tier0.netWorth(h) : Money.incomplete('Net worth is not available.', ['netWorth']);
    if (!Money.isOk(nw) || nw.value <= 0) return Money.ok(value, { n: null, minutes: null, dollars: value });
    return Money.ok(value, { n: Math.round(value / nw.value * 100), minutes: null, dollars: value });
  }
  function estimateGap(h) {
    if (!Variance) return Money.incomplete('The variance engine is not loaded.', ['variance']);
    var months = Variance.months(h);
    if (!months.length) return Money.incomplete('No month closed yet.', ['monthsClosed']);
    var last = months[months.length - 1];
    var s = Variance.single(last, {});
    if (!Money.isOk(s)) return s;
    var gap = s.rows.reduce(function (t, r) { return t + (r.differenceCents === null ? 0 : Math.abs(r.differenceCents)); }, 0);
    return Money.ok(gap, { n: s.value, minutes: null, dollars: gap, month: last.id });
  }
  function daysOff() {
    /* Nothing stores days off or their price yet; the time budget (16.12)
       adds the line. Until then the tile says so rather than inventing. */
    return Money.incomplete('Days off are not tracked yet: the time budget adds them.', ['timeBudget']);
  }
  var ENGINES = { untouchedRows: untouchedRows, joyLowest: joyLowest, undatedDreams: undatedDreams, roughRows: roughRows, highestRateLine: highestRateLine, idleCash: idleCash, carShare: carShare, estimateGap: estimateGap, daysOff: daysOff };
  /** The shadow measure for one sphere, the sentence filled in. The shadow's name is never in the result. */
  function measure(household, tables, id) {
    var s = byId(id);
    if (!s) return Money.incomplete('No such sphere.', ['sphere']);
    var fn = ENGINES[String(s.shadow.engine).replace(/^Spheres\./, '')];
    if (!fn) return Money.incomplete('No engine for this measure.', ['engine']);
    var r = fn(household, tables);
    if (!Money.isOk(r)) return Money.incomplete(r.reason, r.missing);
    return Money.ok(r.value, { n: r.n, minutes: r.minutes, dollars: r.dollars, sentence: fill(s.shadow.sentence, r), action: s.action, virtue: s.virtue });
  }
  /** What a Dashboard tile shows (19.2): the virtue word and either the measure or the minutes to get there. */
  function tile(household, tables, id) {
    var st = state(household, tables);
    var s = st.spheres.filter(function (x) { return x.id === id; })[0];
    if (!s) return null;
    var base = { id: s.id, order: s.order, virtue: s.virtue, alreadyGood: !!s.alreadyGood, complete: s.complete, sharp: s.sharp, minutesLeft: s.minutesLeft };
    if (!s.complete) return Object.assign(base, { mode: 'minutes', sentence: 'About ' + s.minutesLeft + ' minutes in the Ledger.', action: { label: 'in the Ledger', room: 'ledger', filter: null, sphere: s.id } });
    var m = measure(household, tables, id);
    if (!Money.isOk(m)) return Object.assign(base, { mode: 'unmeasured', sentence: m.reason, action: null });
    return Object.assign(base, { mode: 'measure', value: m.value, n: m.n, dollars: m.dollars, minutes: m.minutes, sentence: m.sentence, action: s.action });
  }
  return { LETTERS: LETTERS, RUNWAY_MONTHS_DEFAULT: RUNWAY_MONTHS_DEFAULT, use: use, table: table, all: all, byId: byId, byOrder: byOrder, sphereOf: sphereOf,
    state: state, cells: cells, measure: measure, tile: tile, ENGINES: Object.keys(ENGINES) };
});
