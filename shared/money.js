/* ==========================================================================
   shared/money.js — numeric primitives every calculator in SLAF calls.
   --------------------------------------------------------------------------
   Enforces three rules from SPEC.md that are easy to violate by accident:

   §6  Money is stored as INTEGER CENTS. Never floating-point dollars.
   §4  A rate is stored as a DECIMAL FRACTION (0.07 === 7%). Convert at
       display time only.
   §4/§5  null/undefined means "not entered". 0 means "the user typed zero".
       These never collapse. No `x || 0` anywhere in a formula.

   Every computed output is a Result, not a bare number:
       { status: 'ok',         value: <number>, reason: null, missing: [] }
       { status: 'incomplete', value: null,     reason: '…',  missing: […] }

   Loads as a browser global (window.SLAF.Money) and as a CommonJS module so
   test/run.js can re-derive the same math outside the browser.
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Money = api; }
})(typeof self !== 'undefined' ? self : null, function () {
  'use strict';

  /* ---- Entry state ----------------------------------------------------- */

  /** True only for a real, finite number. null/undefined/NaN are "not entered". */
  function isEntered(v) {
    return v !== null && v !== undefined && typeof v === 'number' && Number.isFinite(v);
  }

  /* ---- Result constructors --------------------------------------------- */

  function ok(value, extra) {
    var r = { status: 'ok', value: value, reason: null, missing: [] };
    if (extra) { for (var k in extra) { if (Object.prototype.hasOwnProperty.call(extra, k)) r[k] = extra[k]; } }
    return r;
  }

  function incomplete(reason, missing) {
    return { status: 'incomplete', value: null, reason: reason, missing: missing || [] };
  }

  function isOk(result) { return !!result && result.status === 'ok'; }

  /**
   * Collect the names of any required inputs that were never entered.
   * Pass { fieldName: value, … } — the shape a room already has to hand.
   */
  function missingFrom(required) {
    var missing = [];
    for (var name in required) {
      if (!Object.prototype.hasOwnProperty.call(required, name)) continue;
      if (!isEntered(required[name])) missing.push(name);
    }
    return missing;
  }

  /* ---- Cents ------------------------------------------------------------ */

  /** Dollars (possibly fractional) -> integer cents. Passes "not entered" through. */
  function toCents(dollars) {
    if (!isEntered(dollars)) return null;
    return Math.round(dollars * 100);
  }

  /** Integer cents -> dollars as a float. Display/formatting use only, never storage. */
  function fromCents(cents) {
    if (!isEntered(cents)) return null;
    return cents / 100;
  }

  /**
   * Parse raw text from a money input into integer cents.
   * "" -> null (not entered). "0" -> 0 (affirmative zero). Strips $ and commas.
   */
  function parseMoney(text) {
    if (text === null || text === undefined) return null;
    var cleaned = String(text).replace(/[$,\s]/g, '');
    if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;
    var n = Number(cleaned);
    if (!Number.isFinite(n)) return null;
    return Math.round(n * 100);
  }

  /**
   * Parse a percent typed by a human ("7", "7.5", "7%") into a decimal rate.
   * "" -> null. "0" -> 0.
   */
  function parseRatePercent(text) {
    if (text === null || text === undefined) return null;
    var cleaned = String(text).replace(/[%\s]/g, '');
    if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;
    var n = Number(cleaned);
    if (!Number.isFinite(n)) return null;
    return n / 100;
  }

  /** Sum a list of cent amounts. Entries that were never entered are skipped,
   *  NOT coerced to zero — and the count of real entries is reported back so a
   *  caller can tell "nothing entered" from "entered as zero". */
  function sumCents(list) {
    var total = 0, counted = 0;
    for (var i = 0; i < (list || []).length; i++) {
      if (isEntered(list[i])) { total += list[i]; counted++; }
    }
    return { total: total, counted: counted };
  }

  /* ---- Safe division ----------------------------------------------------
     SPEC.md §6: any ratio with a zero or missing denominator is `—` plus a
     one-line reason. Never 0, NaN, or Infinity. Every ratio in the app goes
     through here so that rule cannot be forgotten in one calculator.       */

  /**
   * safeDivide(numerator, denominator, opts)
   * opts.missingReason  — shown when either side was never entered
   * opts.zeroReason     — shown when the denominator is an affirmative zero
   * opts.numeratorName / opts.denominatorName — for the `missing` list
   */
  function safeDivide(numerator, denominator, opts) {
    var o = opts || {};
    var missing = missingFrom({
      numerator: numerator,
      denominator: denominator
    });
    if (missing.length) {
      var named = [];
      if (!isEntered(numerator) && o.numeratorName) named.push(o.numeratorName);
      if (!isEntered(denominator) && o.denominatorName) named.push(o.denominatorName);
      return incomplete(o.missingReason || 'Add the missing inputs to see this.', named);
    }
    if (denominator === 0) {
      return incomplete(
        o.zeroReason || 'Can’t divide by zero — this needs a non-zero value.',
        o.denominatorName ? [o.denominatorName] : []
      );
    }
    return ok(numerator / denominator);
  }

  /* ---- Formatting -------------------------------------------------------
     Formatting happens at the edge, never inside a formula.               */

  var EM_DASH = '—';

  /** Integer cents -> "$1,234" (or "-$1,234"). Not-entered -> em dash. */
  function formatCents(cents, opts) {
    var o = opts || {};
    if (!isEntered(cents)) return o.placeholder || EM_DASH;
    var dollars = cents / 100;
    var decimals = o.decimals === undefined ? 0 : o.decimals;
    var abs = Math.abs(dollars);
    var body = abs.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
    return (dollars < 0 ? '-$' : '$') + body;
  }

  /** Decimal rate -> "7%" / "7.5%". Not-entered -> em dash. */
  function formatRate(rate, opts) {
    var o = opts || {};
    if (!isEntered(rate)) return o.placeholder || EM_DASH;
    var decimals = o.decimals === undefined ? 0 : o.decimals;
    return (rate * 100).toFixed(decimals) + '%';
  }

  /** Months count -> "5.3 months" / "1 month". */
  function formatMonths(months, opts) {
    var o = opts || {};
    if (!isEntered(months)) return o.placeholder || EM_DASH;
    var rounded = Math.round(months * 10) / 10;
    return rounded + (rounded === 1 ? ' month' : ' months');
  }

  /** Ratio -> "3.2x". */
  function formatMultiple(x, opts) {
    var o = opts || {};
    if (!isEntered(x)) return o.placeholder || EM_DASH;
    return (Math.round(x * 10) / 10) + 'x';
  }

  /** Render any Result for display: its value, or the em dash. The caller
   *  shows `result.reason` alongside when the status is incomplete. */
  function display(result, formatter) {
    if (!isOk(result)) return EM_DASH;
    return formatter(result.value);
  }

  return {
    EM_DASH: EM_DASH,
    isEntered: isEntered,
    ok: ok,
    incomplete: incomplete,
    isOk: isOk,
    missingFrom: missingFrom,
    toCents: toCents,
    fromCents: fromCents,
    parseMoney: parseMoney,
    parseRatePercent: parseRatePercent,
    sumCents: sumCents,
    safeDivide: safeDivide,
    formatCents: formatCents,
    formatRate: formatRate,
    formatMonths: formatMonths,
    formatMultiple: formatMultiple,
    display: display
  };
});
