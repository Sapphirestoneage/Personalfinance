/* ==========================================================================
   shared/staleness.js — how old a figure is, and whether that matters.
   --------------------------------------------------------------------------
   The spine stamps meta.confirmedAt[fieldId] on every value change
   (DECISIONS.md D-056). This reads those stamps back as an age in days and,
   once data/staleness.json has been handed in via use(), says whether that
   age is past the review interval for that field.

   Three honest states, never collapsed:
     known    — the field has a stamp; `days` is real.
     unknown  — no stamp yet (every household saved before D-056). `days`
                falls back to the household's last save, and `perField` is
                false so the caller can say "unknown per field".
     never    — the field has no value at all; nothing to be stale.

   Stale is a prompt to look, not a verdict: nothing here discounts, zeroes
   or hides a figure because it is old. DECISIONS.md D-057.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('./money.js') };
  } else {
    deps = { Money: root.SLAF && root.SLAF.Money };
  }
  var api = factory(deps.Money);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Staleness = api; }
})(typeof self !== 'undefined' ? self : null, function (Money) {
  'use strict';

  var MS_PER_DAY = 86400000;
  var table = null;

  /** Hand in data/staleness.json. Until then ages compute, verdicts are null. */
  function use(t) { table = t || null; return table; }
  function tableInUse() { return table; }

  function parse(iso) {
    if (!iso) return null;
    var t = Date.parse(iso);
    return isNaN(t) ? null : t;
  }

  /**
   * ageDays(household, fieldId, now?) — whole days since the field was last
   * set or confirmed. Falls back to the household's last save when the
   * field has no stamp; null when there is nothing to date at all.
   */
  function ageDays(household, fieldId, now) {
    var d = describe(household, fieldId, now);
    return d.days;
  }

  function staleAfterDays(fieldId) {
    if (!table || !table.staleAfterDays) return undefined;
    var v = table.staleAfterDays[fieldId];
    return v === undefined ? undefined : v;
  }

  /**
   * describe(household, fieldId, now?) →
   *   { fieldId, days, perField, confirmedAt, staleAfterDays, stale, label }
   *
   * `stale` is true/false when a review interval is known and an age can
   * be computed, and null otherwise — a caller that colours on `stale`
   * therefore never colours on a guess.
   */
  function describe(household, fieldId, now) {
    var meta = (household && household.meta) || {};
    var stamps = meta.confirmedAt || {};
    var at = parse(stamps[fieldId]);
    var perField = at !== null;
    if (!perField) at = parse(meta.updatedAt);
    var nowMs = now === undefined ? Date.now() : (typeof now === 'number' ? now : parse(now));
    var days = (at === null || nowMs === null) ? null : Math.max(0, Math.floor((nowMs - at) / MS_PER_DAY));

    var after = staleAfterDays(fieldId);
    var stale = null;
    if (days !== null && after !== undefined) stale = after === null ? false : days > after;

    return {
      fieldId: fieldId,
      days: days,
      perField: perField,
      confirmedAt: perField ? stamps[fieldId] : null,
      staleAfterDays: after === undefined ? null : after,
      stale: stale,
      label: label(days, perField)
    };
  }

  function label(days, perField) {
    if (days === null) return '';
    var when = days === 0 ? 'today'
      : days === 1 ? 'yesterday'
      : days < 31 ? days + ' days ago'
      : days < 61 ? 'about a month ago'
      : days < 365 ? Math.round(days / 30) + ' months ago'
      : days < 730 ? 'over a year ago'
      : Math.floor(days / 365) + ' years ago';
    return perField ? 'updated ' + when : 'last saved ' + when + ' (this figure not dated)';
  }

  /** The short list the Refresh page walks, from the table; [] until use(). */
  function volatileFields() {
    return (table && table.volatile) ? table.volatile.slice() : [];
  }

  /**
   * summary(household, now?) — the oldest volatile figure and whether any
   * is past its interval, for the dashboard's one staleness line.
   */
  function summary(household, now) {
    var rows = volatileFields().map(function (id) { return describe(household, id, now); });
    var dated = rows.filter(function (r) { return r.days !== null; });
    var oldest = dated.sort(function (a, b) { return b.days - a.days; })[0] || null;
    return {
      rows: rows,
      oldest: oldest,
      anyStale: rows.some(function (r) { return r.stale === true; }),
      anyUnknown: rows.some(function (r) { return !r.perField; })
    };
  }

  return {
    use: use,
    tableInUse: tableInUse,
    ageDays: ageDays,
    describe: describe,
    label: label,
    volatileFields: volatileFields,
    summary: summary
  };
});
