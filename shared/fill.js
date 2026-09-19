/* ==========================================================================
   shared/fill.js — Fill Mode: the state of every Ledger row, which one to
   fill next, and the loose ends. The owner's brief of 2026-09-19 (D-264).
   --------------------------------------------------------------------------
   The Ledger stays the only place a fact is stored. This module reads the
   three facts every row already carries (as-of, source, confidence in
   meta.fields, D-181), the "not sure yet" mark (meta.notSure, D-209) and
   the household's own N/A flags (notApplicable, D-130), and names ONE state
   per row:

     known     entered, confidence sure
     rough     entered, confidence roughly / unsure / from memory
     unknown   "Don't know yet": no value, the mark is on
     na        "Not for me": the household dropped it (and its downstream)
     computed  never typed; its inputs carry the state instead
     empty     never touched; lives in the Next queue

   Stale is a flag beside the state (Staleness, per-field window), never a
   state of its own: a stale number is still known or rough.

     Fill.use(weights, rules)          data/next-weights.json (+ foo_rules)
     Fill.stateOf(h, row, tables)      { state, stale, value, display, at,
                                         source, partial, notSure }
     Fill.rows(h, tables)              every applicable row with its state
     Fill.score(h, row, tables)        { score, roomsUnlocked, impact, minutes, rung }
     Fill.queue(h, tables)             the Next queue, best first
     Fill.finishLine(h, tables)        { rungsDone, rungsTotal, fieldsDone,
                                         fieldsTotal, complete, sentence }
     Fill.looseEnds(h, tables, filter) { rows, counts: { unknown, rough,
                                         stale, hidden, loose } }
     Fill.act(action, row, value, opts) the four buttons, one write path:
                                       'save' | 'roughly' | 'unknown' | 'na'
                                       (and 'applies' to take an N/A off)
     Fill.readers(row)                 rooms and readings that read the row
     Fill.whatChanged(before, after)   "Your runway now shows 2.1 months."
     Fill.snapshot(h, tables)          what whatChanged compares
     Fill.ledgerHref(row, fromRoomId)  the deep link to the row's Ledger box

   No number is computed here beyond a ranking. No copy of any value is
   kept. Node-loadable so test/run.js can hold every rule above to it.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('./money.js'), Schema: require('./schema.js'), Ownership: require('./ownership.js'), LedgerRows: require('./ledger-rows.js'),
      Levers: require('./levers.js'), Registry: require('./registry.js'),
      Staleness: (function () { try { return require('./staleness.js'); } catch (e) { return null; } })(),
      UpNext: (function () { try { return require('./upnext.js'); } catch (e) { return null; } })(),
      Prefs: (function () { try { return require('./prefs.js'); } catch (e) { return null; } })(),
      Spine: (function () { try { return require('./spine-v2.js'); } catch (e) { return null; } })() };
  } else {
    var S = root.SLAF || {};
    deps = { Money: S.Money, Schema: S.Schema, Ownership: S.Ownership, LedgerRows: S.LedgerRows, Levers: S.Levers, Registry: S.Registry,
      Staleness: S.Staleness || null, UpNext: S.UpNext || null, Prefs: S.Prefs || null, Spine: S.Spine || null };
  }
  var api = factory(deps);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Fill = api; }
})(typeof self !== 'undefined' ? self : null, function (D) {
  'use strict';
  var Money = D.Money, Schema = D.Schema, Ownership = D.Ownership, LedgerRows = D.LedgerRows, Levers = D.Levers, Registry = D.Registry;
  var STATES = ['known', 'rough', 'unknown', 'na', 'computed', 'empty'];
  var GLYPH = { known: '✓', rough: '~', unknown: '?', na: '—', computed: '=', empty: '✗' };
  var WORD = { known: 'Known', rough: 'Roughly', unknown: 'Don’t know', na: 'Not for me', computed: 'Worked out', empty: 'Not entered' };
  var MS_PER_DAY = 86400000;

  var WEIGHTS = null, RULES = null;
  /** bind({ Spine, Ownership, ... }): point at other module instances. For
      the test suite, which re-requires the spine mid-run; a page never needs it. */
  function bind(overrides) {
    Object.keys(overrides || {}).forEach(function (k) { D[k] = overrides[k]; });
    Ownership = D.Ownership; Schema = D.Schema; LedgerRows = D.LedgerRows;
    return D;
  }
  function use(weights, rules) {
    if (weights) WEIGHTS = weights;
    if (rules) RULES = rules;
    return WEIGHTS;
  }
  function weights() {
    if (WEIGHTS) return WEIGHTS;
    if (typeof module === 'object' && module.exports) { try { WEIGHTS = require('../data/next-weights.json'); } catch (e) { WEIGHTS = null; } }
    return WEIGHTS;
  }
  function live() {
    var g = (typeof self !== 'undefined') ? self : (typeof window !== 'undefined') ? window : null;
    var S = g && g.SLAF ? g.SLAF : {};
    return { Spine: D.Spine || S.Spine || null, Prefs: D.Prefs || S.Prefs || null, UpNext: D.UpNext || S.UpNext || null, Staleness: D.Staleness || S.Staleness || null };
  }
  function ms(iso) { var t = iso ? Date.parse(iso) : NaN; return isNaN(t) ? null : t; }
  /* A value of any shape is present: a finite number, a non-empty string, a
     boolean, an object (the match). Money.isEntered is numbers only. */
  function present(v) {
    if (v === null || v === undefined) return false;
    if (typeof v === 'number') return Number.isFinite(v);
    if (typeof v === 'string') return v.trim() !== '';
    return true;
  }

  /* ---- The ladder ---------------------------------------------------------- */
  function rungOf(fieldId) {
    var w = weights();
    if (!w) return null;
    for (var i = 0; i < w.ladder.length; i++) if (w.ladder[i].fields.indexOf(fieldId) !== -1) return w.ladder[i];
    return null;
  }
  function situation(h) { return Levers && Levers.situationOf ? Levers.situationOf(h || {}) : null; }
  function highInterestRate() {
    var w = weights();
    if (RULES && Money.isEntered(RULES.highInterestDebtRate)) return RULES.highInterestDebtRate;
    return w && Money.isEntered(w.highInterestRate) ? w.highInterestRate : 0.075;
  }
  function hasHighInterestDebt(h) {
    var t = highInterestRate();
    return ((h && h.debts) || []).some(function (d) { return Money.isEntered(d.rate) && d.rate >= t && Money.isEntered(d.balanceCents) && d.balanceCents > 0; });
  }
  /** plan_impact for a row under this household's situation; null = out of the queue. */
  function impactOf(h, fieldId) {
    var w = weights();
    if (!w) return 1;
    var rung = rungOf(fieldId);
    var impact = rung ? rung.weight : w.restWeight;
    var o = w.overrides || {};
    var sit = situation(h);
    if (sit === 'betweenJobs' && o.betweenJobs) {
      if (o.betweenJobs.drop.indexOf(fieldId) !== -1) return null;
      if (o.betweenJobs.first.indexOf(fieldId) !== -1) impact = Math.max(impact, o.betweenJobs.firstWeight);
    }
    if (sit === 'student' && o.student && o.student.lift.indexOf(fieldId) !== -1) impact = Math.max(impact, o.student.liftWeight);
    if (o.highInterestDebt && o.highInterestDebt.fields.indexOf(fieldId) !== -1 && hasHighInterestDebt(h)) {
      var above = rungOf(o.highInterestDebt.atLeastAbove);
      if (above) impact = Math.max(impact, above.weight + 1);
    }
    return impact;
  }

  /* ---- State --------------------------------------------------------------- */
  function notSureOf(h, key) { return Schema.notSure ? Schema.notSure(h, key) : null; }
  function userSaysNa(h, id) { return !!(h && h.notApplicable && h.notApplicable[id] === true); }
  function naAt(h, id) { var m = h && h.meta && h.meta.notApplicableAt; return m && m[id] ? m[id] : null; }
  function display(row, value) {
    var f = Ownership.FIELDS[row.id];
    if (!present(value)) return null;
    if (row.repeat) return value === 1 ? '1 listed' : value + ' listed';
    try { return f && f.format ? f.format(value) : String(value); } catch (e) { return String(value); }
  }
  /** The one state of a row for this household. */
  function stateOf(h, row, tables) {
    h = h || {};
    if (userSaysNa(h, row.id)) return { state: 'na', stale: false, value: null, display: null, at: naAt(h, row.id), source: null, partial: null, notSure: null };
    var s = LedgerRows.status(h, row, tables);
    var L = live();
    if (row.kind === 'computed') return { state: 'computed', stale: false, value: Money.isOk(s.value) ? s.value.value : null, display: Money.isOk(s.value) ? display(row, s.value.value) : null, at: null, source: null, partial: null, notSure: null, entered: s.entered };
    var ns = notSureOf(h, row.id);
    if (row.repeat) {
      var items = LedgerRows.items(h, row) || [];
      var have = items.filter(function (it) { return present(LedgerRows.itemValue(row, it)) || !!notSureOf(h, row.id + ':' + it.id); }).length;
      var lineUnknown = items.some(function (it) { return !!notSureOf(h, row.id + ':' + it.id); });
      if (!items.length) {
        if (ns) return { state: 'unknown', stale: false, value: null, display: null, at: ns.at, source: null, partial: null, notSure: ns };
        return { state: 'empty', stale: false, value: null, display: null, at: null, source: null, partial: null, notSure: null };
      }
      if (have < items.length) return { state: ns ? 'unknown' : 'empty', stale: false, value: items.length, display: have + ' of ' + items.length, at: ns ? ns.at : null, source: null, partial: { have: have, of: items.length }, notSure: ns };
      var metaR = Schema.meta ? Schema.meta(h, row.id) : { confidence: 'sure', asOf: null, source: null };
      var stR = L.Staleness && L.Staleness.describe ? L.Staleness.describe(h, row.id) : { stale: null };
      var rough = lineUnknown || (metaR.asOf && metaR.confidence !== 'sure');
      return { state: rough ? 'rough' : 'known', stale: stR && stR.stale === true, value: items.length, display: display(row, items.length), at: metaR.asOf || null, source: metaR.source || null, partial: null, notSure: null };
    }
    if (!s.entered) {
      if (ns) return { state: 'unknown', stale: false, value: null, display: null, at: ns.at, source: null, partial: null, notSure: ns };
      return { state: 'empty', stale: false, value: null, display: null, at: null, source: null, partial: null, notSure: null };
    }
    var meta = s.meta || { confidence: 'unknown', asOf: null, source: null };
    var known = meta.confidence === 'sure';
    return { state: known ? 'known' : 'rough', stale: s.stale === true, value: s.value.value, display: display(row, s.value.value), at: meta.asOf || null, source: meta.source || null, partial: null, notSure: null, days: s.days };
  }
  function withState(h, row, tables) {
    var st = stateOf(h, row, tables);
    return Object.assign({}, row, { fill: st, state: st.state, stale: st.stale });
  }
  /** Every applicable row (prefs rows aside), each with its state. */
  function rows(h, tables) {
    return LedgerRows.all()
      .filter(function (r) { return !/^prefs\./.test(r.path) && LedgerRows.applies(r, h || {}); })
      .map(function (r) { return withState(h, r, tables); });
  }

  /* ---- Readers and the score ----------------------------------------------- */
  function readers(row) {
    var rooms = LedgerRows.readersOf(row);
    var L = live();
    var readings = [];
    if (L.UpNext && L.UpNext.READINGS) {
      L.UpNext.READINGS.forEach(function (rd) { if (rd.needs.indexOf(row.id) !== -1 || (row.aliases || []).some(function (a) { return rd.needs.indexOf(a) !== -1; })) readings.push({ id: rd.id, label: rd.label, room: rd.room }); });
    }
    return { rooms: rooms, readings: readings, count: rooms.length + readings.length };
  }
  function score(h, row, tables) {
    var impact = impactOf(h, row.id);
    var rd = readers(row);
    var minutes = Money.isEntered(row.minutes) && row.minutes > 0 ? row.minutes : 0.5;
    var unlocked = Math.max(1, rd.count);
    var rung = rungOf(row.id);
    return { score: impact === null ? null : Math.round((unlocked * impact / minutes) * 100) / 100, roomsUnlocked: rd.count, impact: impact, minutes: minutes, rung: rung ? rung.rung : null, rungLabel: rung ? rung.label : null };
  }
  /* Placement ahead of the score (the brief's "move to #1", "move up"):
       0  the situation gate (rung 1): it decides what else applies at all
       1  between jobs: the runway rows (cash, the month) go first
       2  a student: the loan rows move up
       3  everything else, by score
     Weight alone cannot promise a place: a row that takes two minutes to
     look up loses on score to any half-minute row, whatever its rung. */
  function tierOf(h, r) {
    var w = weights();
    if (!w) return 3;
    if (r.rank.rung !== null && r.rank.rung <= (w.gateRung || 1)) return 0;
    var o = w.overrides || {}, sit = situation(h);
    if (sit === 'betweenJobs' && o.betweenJobs && o.betweenJobs.first.indexOf(r.id) !== -1) return 1;
    if (sit === 'student' && o.student && o.student.lift.indexOf(r.id) !== -1) return 2;
    return 3;
  }
  function bestFirst(a, b) {
    if (a.tier !== b.tier) return a.tier - b.tier;
    var sa = a.rank.score === null ? -1 : a.rank.score, sb = b.rank.score === null ? -1 : b.rank.score;
    if (sb !== sa) return sb - sa;
    if ((a.pass || 9) !== (b.pass || 9)) return (a.pass || 9) - (b.pass || 9);
    return (a.order || 0) - (b.order || 0);
  }
  /* High-interest debt: the debt rows sit above the invested rows, wherever
     the score put them (the brief's third override). */
  function debtAboveInvested(h, list) {
    var w = weights();
    var o = w && w.overrides && w.overrides.highInterestDebt;
    if (!o || !hasHighInterestDebt(h)) return list;
    var firstInvest = -1;
    for (var i = 0; i < list.length; i++) if (list[i].id === o.atLeastAbove || list[i].id === 'assetCharacter') { firstInvest = i; break; }
    if (firstInvest === -1) return list;
    var debts = list.filter(function (r, i) { return i > firstInvest && o.fields.indexOf(r.id) !== -1; });
    if (!debts.length) return list;
    var rest = list.filter(function (r) { return debts.indexOf(r) === -1; });
    var at = rest.indexOf(list[firstInvest]);
    return rest.slice(0, at).concat(debts, rest.slice(at));
  }
  function ranked(h, tables) {
    var list = rows(h, tables).map(function (r, i) { r.order = i; r.rank = score(h, r, tables); r.tier = tierOf(h, r); return r; }).sort(bestFirst);
    return debtAboveInvested(h, list);
  }

  /* ---- The working plan and the finish line -------------------------------- */
  function workingPlanFields() {
    var w = weights();
    if (!w) return [];
    var out = [];
    w.ladder.forEach(function (r) { if (r.rung <= w.workingPlanRungs) r.fields.forEach(function (f) { out.push({ fieldId: f, rung: r.rung, label: r.label }); }); });
    return out;
  }
  function counts(st) { return st === 'known' || st === 'rough' || st === 'computed'; }
  function finishLine(h, tables) {
    var w = weights();
    var all = {};
    rows(h, tables).forEach(function (r) { all[r.id] = r; });
    var byRung = {};
    var fieldsDone = 0, fieldsTotal = 0;
    workingPlanFields().forEach(function (f) {
      var r = all[f.fieldId];
      if (!r) return;                                   /* does not apply, or off the ladder for this situation */
      if (r.state === 'na') return;                     /* dropped by the household: out of the plan */
      if (impactOf(h, f.fieldId) === null) return;      /* dropped by the situation (between jobs: the match) */
      fieldsTotal++;
      var done = counts(r.state);
      if (done) fieldsDone++;
      byRung[f.rung] = byRung[f.rung] || { rung: f.rung, label: f.label, total: 0, done: 0 };
      byRung[f.rung].total++;
      if (done) byRung[f.rung].done++;
    });
    var rungs = Object.keys(byRung).map(function (k) { return byRung[k]; }).sort(function (a, b) { return a.rung - b.rung; });
    var rungsDone = rungs.filter(function (r) { return r.done === r.total; }).length;
    var complete = fieldsTotal > 0 && fieldsDone === fieldsTotal;
    return { rungs: rungs, rungsDone: rungsDone, rungsTotal: rungs.length, fieldsDone: fieldsDone, fieldsTotal: fieldsTotal, complete: complete,
      workingPlanRungs: w ? w.workingPlanRungs : 0,
      sentence: complete ? 'A working plan. Everything it needs is in.' : rungsDone + ' of ' + rungs.length + ' to a working plan.' };
  }

  /* ---- The Next queue ------------------------------------------------------- */
  function unknownReturnDays() {
    var L = live();
    var w = weights();
    var v = L.Prefs ? L.Prefs.get('fill.unknownReturnDays', null) : null;
    if (Money.isEntered(v) && v >= 0) return v;
    return w && Money.isEntered(w.unknownReturnDays) ? w.unknownReturnDays : 14;
  }
  /** An unknown row comes back once the working plan is complete, or after
      the delay; never before, so nobody is nagged in a loop. */
  function unknownReturns(h, row, tables, now) {
    var ns = row.fill && row.fill.notSure;
    var at = ms(ns && ns.at);
    var nowMs = now ? ms(now) : Date.now();
    if (at !== null && nowMs !== null && (nowMs - at) / MS_PER_DAY >= unknownReturnDays()) return true;
    return finishLine(h, tables).complete;
  }
  function queue(h, tables, opts) {
    var o = opts || {};
    var list = ranked(h, tables).filter(function (r) {
      if (r.kind === 'computed' || r.rank.impact === null) return false;
      if (r.state === 'empty') return true;
      if (r.state === 'unknown') return unknownReturns(h, r, tables, o.now);
      return false;
    });
    if (o.workingPlanOnly) { var wp = {}; workingPlanFields().forEach(function (f) { wp[f.fieldId] = true; }); list = list.filter(function (r) { return wp[r.id]; }); }
    return list;
  }

  /* ---- Loose ends ----------------------------------------------------------- */
  var LOOSE_FILTERS = {
    all: function (r) { return r.state === 'unknown' || r.state === 'rough' || (r.stale && r.state === 'known'); },
    unknown: function (r) { return r.state === 'unknown'; },
    rough: function (r) { return r.state === 'rough'; },
    stale: function (r) { return r.stale && (r.state === 'known' || r.state === 'rough'); },
    hidden: function (r) { return r.state === 'na'; }
  };
  function looseOrder(a, b) {
    var ra = a.state === 'unknown' ? 0 : 1, rb = b.state === 'unknown' ? 0 : 1;
    if (ra !== rb) return ra - rb;
    return bestFirst(a, b);
  }
  function looseEnds(h, tables, filter) {
    var all = LedgerRows.all().filter(function (r) { return !/^prefs\./.test(r.path) && r.kind !== 'computed'; })
      .map(function (r, i) { var x = withState(h, r, tables); x.order = i; x.rank = score(h, x, tables); x.applies = LedgerRows.applies(r, h || {}); return x; });
    var live_ = all.filter(function (r) { return r.applies; });
    var c = { unknown: 0, rough: 0, stale: 0, hidden: 0, loose: 0 };
    live_.forEach(function (r) {
      if (LOOSE_FILTERS.unknown(r)) c.unknown++;
      if (LOOSE_FILTERS.rough(r)) c.rough++;
      if (LOOSE_FILTERS.stale(r)) c.stale++;
      if (LOOSE_FILTERS.all(r)) c.loose++;
    });
    all.forEach(function (r) { if (LOOSE_FILTERS.hidden(r)) c.hidden++; });
    var keep = LOOSE_FILTERS[filter || 'all'] || LOOSE_FILTERS.all;
    var pool = filter === 'hidden' ? all : live_;
    return { rows: pool.filter(keep).sort(looseOrder), counts: c };
  }
  function looseCount(h, tables) { return looseEnds(h, tables, 'all').counts.loose; }

  /* ---- The four buttons: one write path ------------------------------------ */
  /**
   * act(action, row, value, opts) → { ok, note }
   *   save     value → known (typed, sure)
   *   roughly  value → rough; with no value, the number it holds is re-marked
   *            roughly and kept
   *   unknown  the mark goes on; a value it held is cleared (never zero)
   *   na       "Not for me": the household drops the row
   *   applies  the N/A comes off again
   * opts.itemId for one line of a repeat row; opts.source for the tag.
   */
  function act(action, row, value, opts) {
    var L = live();
    var Spine = L.Spine;
    var o = opts || {};
    if (!Spine) return { ok: false, note: 'No spine.' };
    var ctx = o.itemId ? { itemId: o.itemId } : null;
    var key = o.itemId ? row.id + ':' + o.itemId : row.id;
    var has = present(value);
    /* One tap, one undo entry, and the confidence it says. A write that
       first creates a person or a source saves twice, and the spine spends
       the tag on the first save (D-181); so the facts are checked after
       the write and set by hand when the tag did not land. */
    function tagged(confidence, note) {
      Spine.batch((confidence === 'sure' ? 'Saved: ' : 'Roughly: ') + row.label, function () {
        if (Spine.tagWrite) Spine.tagWrite({ source: o.source || 'typed', confidence: confidence });
        Ownership.write(row.id, value, ctx);
        if (!ctx && Spine.setFieldMeta) {
          var m = Schema.meta(Spine.getProfile(), row.id);
          if (m.entered && m.confidence !== confidence) Spine.setFieldMeta(row.id, { confidence: confidence, source: o.source || m.source || 'typed' });
        }
      });
      return { ok: true, note: note };
    }
    if (action === 'save') {
      if (!has) return { ok: false, note: 'A number, please.' };
      return tagged('sure', 'Saved.');
    }
    if (action === 'roughly') {
      if (has) return tagged('roughly', 'Saved, roughly.');
      var st = stateOf(Spine.getProfile(), row, o.tables);
      if (st.state === 'known' || st.state === 'rough') {
        Spine.setFieldMeta(row.id, { confidence: 'roughly', label: 'Marked roughly: ' + row.label });
        return { ok: true, note: 'Kept, marked roughly.' };
      }
      return { ok: false, note: 'A ballpark number, please.' };
    }
    if (action === 'unknown') {
      Spine.batch('Don’t know yet: ' + row.label, function () {
        var st = stateOf(Spine.getProfile(), row, o.tables);
        if (!row.repeat && (st.state === 'known' || st.state === 'rough')) Ownership.write(row.id, null, ctx);
        Spine.setNotSure(key, { expectedBy: o.expectedBy || null });
      });
      return { ok: true, note: 'Marked don’t know yet. It stays blank, never zero.' };
    }
    if (action === 'na') {
      Spine.setNotApplicable(row.id, true, 'Not for me: ' + row.label);
      return { ok: true, note: 'Not for you. It leaves every plan that read it.' };
    }
    if (action === 'applies') {
      Spine.setNotApplicable(row.id, false, 'Applies again: ' + row.label);
      return { ok: true, note: 'Back in the plan.' };
    }
    return { ok: false, note: 'Unknown action.' };
  }

  /* ---- What changed ---------------------------------------------------------- */
  /** What the readings say now, keyed by reading id: the thing a before /
      after sentence compares. */
  function snapshot(h, tables, fromRoomId) {
    var L = live();
    var out = { open: {}, finish: finishLine(h, tables) };
    if (L.UpNext && L.UpNext.plan) {
      var plan = L.UpNext.plan(h, tables, fromRoomId || 'dashboard');
      plan.open.forEach(function (e) { out.open[e.id] = { label: e.label, display: e.display }; });
      out.lockedCount = plan.locked.length;
    }
    return out;
  }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  /** One sentence: the first reading that opened or moved, else the finish line. */
  function whatChanged(before, after) {
    if (!before || !after) return '';
    var ids = Object.keys(after.open || {});
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i], b = before.open[id], a = after.open[id];
      if (!b) return cap(a.label) + ' now shows ' + a.display + '.';
      if (b.display !== a.display) return cap(a.label) + ' moved from ' + b.display + ' to ' + a.display + '.';
    }
    if (before.finish && after.finish && before.finish.fieldsDone !== after.finish.fieldsDone) return after.finish.sentence;
    return '';
  }

  /* ---- Links ------------------------------------------------------------------- */
  /** The row's own box in the Ledger's all-at-once view (#x-row-<id>). */
  function ledgerHref(row, fromRoomId) {
    return Ownership.linkTo('ledger', 'x-row-' + row.id, fromRoomId || null);
  }
  function looseEndsHref(fromRoomId) {
    return Registry.byId('loose-ends') ? Ownership.linkTo('loose-ends', null, fromRoomId || null) : ledgerHref({ id: '' }, fromRoomId);
  }
  function whyLine(row) {
    var rd = readers(row);
    var n = rd.count;
    if (!n) return row.unlocks ? 'Unlocks ' + row.unlocks + '.' : '';
    /* Name a reading or a scorecard room, never the Ledger or the front
       door, which read everything. */
    var room = rd.rooms.filter(function (r) { var reg = Registry.byId(r.id); return reg && !reg.utility && reg.group !== 'home'; })[0];
    var named = rd.readings.length ? 'your ' + rd.readings[0].label.replace(/^your /, '') : (room ? room.title : null);
    return 'Unlocks ' + n + (n === 1 ? ' reading' : ' readings') + (named ? ', including ' + named : '') + '.';
  }

  return { STATES: STATES, GLYPH: GLYPH, WORD: WORD, use: use, bind: bind, weights: weights, rungOf: rungOf, impactOf: impactOf, hasHighInterestDebt: hasHighInterestDebt,
    stateOf: stateOf, rows: rows, readers: readers, score: score, ranked: ranked, queue: queue, finishLine: finishLine, workingPlanFields: workingPlanFields,
    unknownReturnDays: unknownReturnDays, looseEnds: looseEnds, looseCount: looseCount, LOOSE_FILTERS: Object.keys(LOOSE_FILTERS),
    act: act, snapshot: snapshot, whatChanged: whatChanged, ledgerHref: ledgerHref, looseEndsHref: looseEndsHref, whyLine: whyLine };
});
