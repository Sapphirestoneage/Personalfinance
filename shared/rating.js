/* ==========================================================================
   shared/rating.js — THE 1-10 rating control. One of them, not four.
   --------------------------------------------------------------------------
   SPEC.md §13, Tier 1.5: "The 1-10 rating mechanism is shared infrastructure
   with Category Tracker Engine, Dating Cost Calculator, and Retroactive
   Worth calc — build one reusable rating component, not four."

   So this file owns the whole idea:

     • the scale (1-10, integers, no zero)
     • what "not rated" means, and how it stays distinct from a low rating
     • reading a rating off the household, for any scope
     • the control markup every room renders, and the dot readout beside it

   Ratings live in `household.ratings[scope][itemId]` — see
   Schema.createRatings(). A scope is just a name: 'joy' for the Fulfillment
   Curve, 'hassle' for Return on Hassle, and so on. Rooms never invent their
   own storage shape for a rating, and never re-implement the control.

   There is deliberately NO zero. A missing key is "not rated", full stop —
   it can never be read as "rated it nothing", which is the failure mode a
   0-10 scale walks straight into.

   Loads as a browser global (window.SLAF.Rating) and as a CommonJS module.
   The markup helpers are pure string builders, so test/run.js checks them
   outside the browser like everything else.
   ========================================================================== */
(function (root, factory) {
  var Money = (typeof module === 'object' && module.exports)
    ? require('./money.js')
    : (root.SLAF && root.SLAF.Money);
  var api = factory(Money);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Rating = api; }
})(typeof self !== 'undefined' ? self : null, function (Money) {
  'use strict';

  var MIN = 1;
  var MAX = 10;

  /* Anchors for the two ends. A bare 1-10 means nothing without them, and a
     room that writes its own wording would drift from the next room's. */
  var ANCHORS = {
    joy:    { low: 'barely notice it', high: 'would not give it up', label: 'Joy' },
    hassle: { low: 'no bother at all', high: 'genuinely painful',    label: 'Hassle' },
    worth:  { low: 'not worth it',     high: 'worth every penny',    label: 'Worth it' }
  };

  function anchors(scope) {
    return ANCHORS[scope] || { low: 'low', high: 'high', label: 'Rating' };
  }

  /** A valid rating is an integer 1-10. Anything else is not a rating. */
  function isValid(v) {
    return Money.isEntered(v) && v >= MIN && v <= MAX && Math.round(v) === v;
  }

  /** Raw text from a control -> a rating, or null for "not rated". */
  function parse(text) {
    if (text === null || text === undefined) return null;
    var cleaned = String(text).trim();
    if (cleaned === '') return null;
    var n = Number(cleaned);
    return isValid(n) ? n : null;
  }

  function scopeOf(household, scope) {
    var all = (household && household.ratings) || {};
    return all[scope] || {};
  }

  /** One rating, or null. Never a zero, never undefined. */
  function get(household, scope, itemId) {
    var v = scopeOf(household, scope)[itemId];
    return isValid(v) ? v : null;
  }

  function isRated(household, scope, itemId) {
    return get(household, scope, itemId) !== null;
  }

  /**
   * How much of a list has been rated. Rooms use this to decide between
   * "here is your reading" and "rate a few more first" — and to say how
   * many are left rather than showing a chart built from two points.
   */
  function coverage(household, scope, itemIds) {
    var ids = itemIds || [];
    var rated = [], missing = [];
    ids.forEach(function (id) {
      (isRated(household, scope, id) ? rated : missing).push(id);
    });
    return {
      total: ids.length,
      ratedCount: rated.length,
      rated: rated,
      missing: missing,
      share: ids.length === 0 ? null : rated.length / ids.length
    };
  }

  /**
   * The average rating across a list, weighted by whatever the caller says
   * each item is worth (dollars, usually). Unrated items are SKIPPED, not
   * counted as zero — and how many were skipped comes back with the answer.
   * Pass items as [{ id, weight }].
   */
  function weightedAverage(household, scope, items) {
    var list = items || [];
    var weighted = 0, weight = 0, counted = 0, skipped = 0;
    list.forEach(function (item) {
      var r = get(household, scope, item.id);
      if (r === null) { skipped++; return; }
      var w = Money.isEntered(item.weight) ? item.weight : 0;
      weighted += r * w;
      weight += w;
      counted++;
    });
    if (counted === 0) {
      return Money.incomplete('Nothing here is rated yet.', ['ratings']);
    }
    if (weight === 0) {
      /* Everything rated is worth nothing, so a weighted average has no
         meaning. The plain average still does. */
      var plain = list.reduce(function (s, item) {
        var r = get(household, scope, item.id);
        return r === null ? s : s + r;
      }, 0) / counted;
      return Money.ok(plain, { unweighted: true, ratedCount: counted, skippedCount: skipped });
    }
    return Money.ok(weighted / weight, {
      unweighted: false, ratedCount: counted, skippedCount: skipped, totalWeight: weight
    });
  }

  /* ---- Markup ------------------------------------------------------------
     Pure string builders. Every room in SPARKS renders through innerHTML, so
     the control is a string, and the room binds ONE change listener on the
     container rather than ten per row.                                     */

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /**
   * The select every rating in the app is entered through.
   *   opts = { scope, itemId, value, label, slot, name }
   * `label` names the thing being rated, for the accessible name.
   * A change event on it carries the scope and item in data attributes —
   * read them with readTarget() rather than parsing them in the room.
   *
   * `slot` is for the one case where a single item carries MORE THAN ONE
   * rating: the before/after pair in Worth It rates the same purchase twice
   * (predicted, then actual). It comes back from readTarget() so the room
   * knows which of the two changed. Without it, the pair would have had to
   * fake two item ids and split them apart again with string surgery.
   * `name` overrides the wording in the accessible name for that case.
   */
  function controlHtml(opts) {
    var o = opts || {};
    var a = anchors(o.scope);
    var current = isValid(o.value) ? o.value : null;
    var options = ['<option value=""' + (current === null ? ' selected' : '') + '>—</option>'];
    for (var n = MIN; n <= MAX; n++) {
      options.push('<option value="' + n + '"' + (current === n ? ' selected' : '') + '>'
        + n + (n === MIN ? ' · ' + a.low : n === MAX ? ' · ' + a.high : '') + '</option>');
    }
    return '<span class="slaf-input-shell slaf-rating">'
      + '<select data-rating-scope="' + escapeHtml(o.scope) + '" '
      + 'data-rating-item="' + escapeHtml(o.itemId) + '" '
      + (o.slot ? 'data-rating-slot="' + escapeHtml(o.slot) + '" ' : '')
      + 'aria-label="' + escapeHtml((o.name || a.label) + ' for ' + (o.label || o.itemId)) + '">'
      + options.join('') + '</select></span>';
  }

  /**
   * Pull { scope, itemId, slot, value } off a change event's target, or null
   * if the event did not come from a rating control. The room's whole
   * handler is then three lines. `slot` is null unless the control declared
   * one — see controlHtml().
   */
  function readTarget(node) {
    if (!node || !node.getAttribute) return null;
    var scope = node.getAttribute('data-rating-scope');
    var itemId = node.getAttribute('data-rating-item');
    if (!scope || !itemId) return null;
    return {
      scope: scope,
      itemId: itemId,
      slot: node.getAttribute('data-rating-slot') || null,
      value: parse(node.value)
    };
  }

  /** Ten dots, filled to the rating. Read-only, and blank when not rated. */
  function dotsHtml(value) {
    var v = isValid(value) ? value : 0;
    var out = [];
    for (var n = MIN; n <= MAX; n++) {
      out.push('<span class="slaf-dot' + (n <= v ? ' is-on' : '') + '"></span>');
    }
    return '<span class="slaf-dots" role="img" aria-label="'
      + (isValid(value) ? value + ' out of ' + MAX : 'not rated') + '">'
      + out.join('') + '</span>';
  }

  return {
    MIN: MIN,
    MAX: MAX,
    ANCHORS: ANCHORS,
    anchors: anchors,
    isValid: isValid,
    parse: parse,
    get: get,
    isRated: isRated,
    scopeOf: scopeOf,
    coverage: coverage,
    weightedAverage: weightedAverage,
    controlHtml: controlHtml,
    readTarget: readTarget,
    dotsHtml: dotsHtml
  };
});
