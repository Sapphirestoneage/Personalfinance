/* ==========================================================================
   engine/tables.js, the reference tables the engine reads, and how a
   2026 figure becomes a later year's figure.
   --------------------------------------------------------------------------
   Every dollar threshold the engine uses comes from data/tax/ (D-341):
     tax/2026.json              federal brackets, limits, rules, RMD table
     tax/fpl.json               poverty guidelines by year
     tax/aca-applicable-pct.json the two subsidy rules
     tax/states/<ST>.json       one state's schedule (NY first)

   Nothing here reads localStorage or the DOM. In node the files are read
   from disk the first time they are asked for; in the browser a room loads
   them through shared/reference.js and hands them to use(tables), or
   passes them in assumptions.tables. project() is pure either way: the
   tables are inputs.

   Indexing: an `indexed` figure for year Y is the 2026 figure grown by
   (1 + inflation) ^ (Y - 2026), rounded to the nearest dollar. The IRS
   indexes by chained CPI in $25, $50 or $100 steps; the smooth version is
   within a bracket's rounding step and is declared in assumptionsUsed.
   Figures Congress fixed (`indexed: false`) never move.
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Engine = root.SLAF.Engine || {}; root.SLAF.Engine.Tables = api; }
})(typeof self !== 'undefined' ? self : null, function () {
  'use strict';

  var FILES = {
    tax: 'tax/2026.json',
    fpl: 'tax/fpl.json',
    acaPct: 'tax/aca-applicable-pct.json'
  };
  var STATE_FILE = function (code) { return 'tax/states/' + code + '.json'; };
  var LOADED = null;

  function readJson(rel) {
    if (typeof module !== 'object' || !module.exports) return null;
    var fs = require('fs'), path = require('path');
    var p = path.join(__dirname, '..', 'data', rel);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  }

  /** Hand the engine its tables (a room does this after Reference.load). */
  function use(tables) {
    if (!tables) return LOADED;
    LOADED = LOADED || { states: {} };
    if (tables.tax) LOADED.tax = tables.tax;
    if (tables.fpl) LOADED.fpl = tables.fpl;
    if (tables.acaPct) LOADED.acaPct = tables.acaPct;
    if (tables.states) Object.keys(tables.states).forEach(function (k) { LOADED.states[k] = tables.states[k]; });
    return LOADED;
  }

  /** The tables, loading from disk in node when nothing was handed in. */
  function get() {
    if (!LOADED) {
      LOADED = { states: {} };
      Object.keys(FILES).forEach(function (k) { var t = readJson(FILES[k]); if (t) LOADED[k] = t; });
    }
    return LOADED;
  }

  /** One state's file, or null when the state has none (flat rate then). */
  function state(code) {
    var t = get();
    if (!code) return null;
    code = String(code).toUpperCase();
    if (t.states[code] === undefined) t.states[code] = readJson(STATE_FILE(code)) || null;
    return t.states[code];
  }

  /** Grow a 2026 dollar figure to `year` at the inflation assumption. */
  function indexFactor(year, baseYear, inflation) {
    var n = year - baseYear;
    if (!n) return 1;
    return Math.pow(1 + (inflation || 0), n);
  }
  function indexDollars(dollars, factor, indexed) {
    if (dollars === null || dollars === undefined) return null;
    return indexed === false ? dollars : Math.round(dollars * factor);
  }
  /** Dollars in the file become cents in the engine. */
  function cents(dollars) { return dollars === null || dollars === undefined ? null : Math.round(dollars * 100); }

  /** A bracket schedule for a filing status and year, in cents. */
  function brackets(section, status, factor) {
    var rows = section[status] || section.single;
    return rows.map(function (r) {
      return { upToCents: r.upTo === null ? null : cents(indexDollars(r.upTo, factor, section.indexed)), rate: r.rate };
    });
  }
  /** A by-filing-status dollar figure, indexed, in cents. */
  function byStatus(section, key, status, factor) {
    var v = section[key];
    var raw = (v && typeof v === 'object') ? (v[status] !== undefined ? v[status] : v.single) : v;
    return cents(indexDollars(raw, factor, section.indexed));
  }
  /** A plain dollar figure in a section, indexed per the section, in cents. */
  function figure(section, key, factor, indexedOverride) {
    var indexed = indexedOverride !== undefined ? indexedOverride : section.indexed;
    return cents(indexDollars(section[key], factor, indexed));
  }

  /** Tax on an amount through a bracket ladder; also the marginal rate and
      the room left in the bracket whose top is the given rate. */
  function ladder(amountCents, rows) {
    var tax = 0, lower = 0, marginal = rows.length ? rows[0].rate : 0;
    var bands = [];
    for (var i = 0; i < rows.length; i++) {
      var top = rows[i].upToCents === null ? Infinity : rows[i].upToCents;
      if (amountCents > lower) {
        var slice = Math.min(amountCents, top) - lower;
        tax += slice * rows[i].rate;
        marginal = rows[i].rate;
        bands.push({ rate: rows[i].rate, amountCents: Math.round(slice), taxCents: Math.round(slice * rows[i].rate) });
      }
      if (amountCents <= top) break;
      lower = top;
    }
    return { taxCents: Math.round(tax), marginalRate: marginal, bands: bands };
  }
  /** The top of the bracket with this rate (null when none or no ceiling). */
  function bracketTop(rows, rate) {
    for (var i = 0; i < rows.length; i++) if (rows[i].rate === rate) return rows[i].upToCents;
    return null;
  }

  return { FILES: FILES, use: use, get: get, state: state, indexFactor: indexFactor, indexDollars: indexDollars,
    cents: cents, brackets: brackets, byStatus: byStatus, figure: figure, ladder: ladder, bracketTop: bracketTop };
});
