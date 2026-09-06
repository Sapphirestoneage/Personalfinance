/* ==========================================================================
   engines/timeline.js — a life laid out in months, and what lands in each.
   --------------------------------------------------------------------------
   "Add jobs in the future for periods of time… plan an entire life and stack
   it all and calculate income as things get closer."

   Every room in this app answers a question about NOW. This one is the only
   thing that answers a question about a sequence: what is coming, when, for
   how long, and what the months look like once you lay them end to end and
   let them overlap.

     periods(h, opts)   every future period, resolved onto the month grid,
                        each one saying plainly what it could not resolve
     months(h, opts)    the grid itself: one row a month, the total, and
                        the parts that make it up
     summary(h, opts)   the three facts worth a sentence — what today is,
                        the next month anything changes, and where the gaps
                        and the overlaps are

   THE RULE THIS FILE EXISTS TO KEEP. A period you have not priced is not a
   period worth zero. A period with no start date is not a period starting
   today. Both are extremely easy to write and both would silently invent a
   future. So an unpriced period contributes NOTHING to a month and is
   reported by name in `unplaced`, and a month whose parts are all unpriced
   is `incomplete`, never `$0`. SPEC.md §5.

   NO END IS A REAL ANSWER. A job with no end date runs to the horizon, and
   the row says `openEnded: true` so the page can say "and onward" rather
   than drawing a cliff at an edge the person never chose.

   PURE. No storage, no DOM, and the clock comes in through `opts.now` so a
   test can stand anywhere in time. Money is integer cents throughout;
   nothing here formats anything.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('../shared/money.js'), Schema: require('../shared/schema.js') };
  } else {
    deps = { Money: root.SLAF && root.SLAF.Money, Schema: root.SLAF && root.SLAF.Schema };
  }
  var api = factory(deps.Money, deps.Schema);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Timeline = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema) {
  'use strict';

  var DEFAULT_YEARS = 30;
  var MAX_YEARS = 60;

  /* ---- Month arithmetic --------------------------------------------------
     A month is an integer: year * 12 + monthIndex. Every comparison in this
     file is then an integer comparison, which is the whole reason the grid
     can be built without a single Date in the loop. Dates only appear at
     the two edges — parsing in, labelling out. */

  function monthOf(y, m) { return y * 12 + m; }

  function parseMonth(iso) {
    if (typeof iso !== 'string') return null;
    var m = /^(\d{4})-(\d{2})/.exec(iso);
    if (!m) return null;
    var year = Number(m[1]), mon = Number(m[2]) - 1;
    if (mon < 0 || mon > 11) return null;
    return monthOf(year, mon);
  }

  function label(month) {
    var y = Math.floor(month / 12), m = month - y * 12;
    return String(y) + '-' + (m < 9 ? '0' : '') + String(m + 1);
  }

  function nowMonth(opts) {
    var d = (opts && opts.now) ? new Date(opts.now) : new Date();
    return monthOf(d.getFullYear(), d.getMonth());
  }

  /* The month the primary adult turns `age`. Null when there is no date of
     birth to count from — which is a reason to say so, not to guess. */
  function monthAtAge(household, age, opts) {
    var p = Schema.primaryPerson(household || {});
    var born = parseMonth(p && p.dob);
    if (born === null || !Money.isEntered(age)) return null;
    return born + Math.round(age * 12);
  }

  /* ---- Periods -----------------------------------------------------------

     Each row comes back with what it resolved to and, when it did not, the
     reason in words the page can print without rewording. `startsOn` wins
     over `startsAtAge` when both are given: an explicit date is a stronger
     statement than an age, and silently preferring the age would move a
     period the person had pinned. */

  function resolve(household, row, opts) {
    var missing = [];
    var start = parseMonth(row.startsOn);
    if (start === null && Money.isEntered(row.startsAtAge)) {
      start = monthAtAge(household, row.startsAtAge, opts);
      if (start === null) missing.push('This one starts at an age, and there is no date of birth to count from.');
    }
    if (start === null && !missing.length) missing.push('No start date, so there is nowhere to put it yet.');

    var end = parseMonth(row.endsOn);
    if (end === null && Money.isEntered(row.endsAtAge)) {
      end = monthAtAge(household, row.endsAtAge, opts);
    }
    var priced = Money.isEntered(row.monthlyCents);
    if (!priced) missing.push('No monthly amount, so it adds nothing to any month.');
    /* An end before the start is not a period. Saying so beats drawing a
       negative one or silently swapping them. */
    if (start !== null && end !== null && end < start) {
      missing.push('It ends before it starts.');
    }
    return {
      id: row.id,
      label: row.label || null,
      kind: row.kind || 'other',
      monthlyCents: priced ? row.monthlyCents : null,
      confidence: row.confidence === undefined ? null : row.confidence,
      inflationAdjusted: !!row.inflationAdjusted,
      startMonth: start,
      endMonth: end,
      openEnded: start !== null && end === null,
      startsFromAge: start !== null && !row.startsOn && Money.isEntered(row.startsAtAge),
      endsFromAge: end !== null && !row.endsOn && Money.isEntered(row.endsAtAge),
      /* Usable on the grid only when it is both placed and priced. */
      placeable: start !== null && priced && !(end !== null && end < start),
      why: missing
    };
  }

  /** Every future period, resolved. Order: placeable ones by start, then the
   *  rest — an unplaceable row is not "first", it is waiting. */
  function periods(household, opts) {
    var rows = ((household || {}).futureIncome || []).map(function (r) {
      return resolve(household, r, opts);
    });
    var placed = rows.filter(function (r) { return r.placeable; })
      .sort(function (a, b) { return a.startMonth - b.startMonth; });
    var waiting = rows.filter(function (r) { return !r.placeable; });
    return placed.concat(waiting);
  }

  /* ---- The grid ---------------------------------------------------------- */

  function horizon(household, opts) {
    var o = opts || {};
    var years = Money.isEntered(o.years) ? o.years : DEFAULT_YEARS;
    if (years < 1) years = 1;
    if (years > MAX_YEARS) years = MAX_YEARS;
    return Math.round(years * 12);
  }

  /**
   * One row a month from now to the horizon.
   *   { month, label, cents, parts: [{ id, label, kind, cents }], count }
   *
   * `cents` is the sum of every period live in that month. A month with no
   * live period is 0 with `count: 0` — and that IS a real zero here, because
   * it means "nothing you have listed pays you then", which is exactly the
   * gap this room exists to show. It is not the `|| 0` the rules forbid:
   * that one hides a missing input, and a missing input never reaches this
   * loop — it was filtered out by `placeable` and named in `unplaced`.
   */
  function months(household, opts) {
    var all = periods(household, opts);
    var placed = all.filter(function (r) { return r.placeable; });
    var unplaced = all.filter(function (r) { return !r.placeable; });

    if (!placed.length) {
      return Money.incomplete(
        unplaced.length
          ? 'Nothing on the timeline can be placed yet — each one is missing a date or an amount.'
          : 'Nothing is listed yet.',
        ['futureIncome'], { unplaced: unplaced, rows: [] });
    }

    var from = nowMonth(opts);
    var span = horizon(household, opts);
    var rows = [];
    for (var i = 0; i <= span; i++) {
      var m = from + i;
      var parts = [], total = 0;
      for (var j = 0; j < placed.length; j++) {
        var p = placed[j];
        if (p.startMonth > m) continue;
        if (p.endMonth !== null && p.endMonth < m) continue;
        parts.push({ id: p.id, label: p.label, kind: p.kind, cents: p.monthlyCents });
        total += p.monthlyCents;
      }
      rows.push({ month: m, label: label(m), offset: i, cents: total, parts: parts, count: parts.length });
    }
    return Money.ok(rows, { unplaced: unplaced, placed: placed, from: from, span: span });
  }

  /* ---- What is worth a sentence ------------------------------------------ */

  /**
   * { today, nextChange, gaps, overlaps, peak, unplaced }
   *
   * `gaps` are runs of months with nothing coming in — the thing a stack of
   * jobs is actually for. `overlaps` are runs where two or more pay at once.
   * Both are returned as runs rather than counts, because "four months from
   * next March" is a fact you can act on and "12 months" is not.
   */
  function summary(household, opts) {
    var grid = months(household, opts);
    if (!Money.isOk(grid)) return grid;
    var rows = grid.value;
    var runs = function (test) {
      var out = [], open = null;
      rows.forEach(function (r) {
        if (test(r)) { if (!open) open = { from: r, to: r, length: 1 }; else { open.to = r; open.length++; } }
        else if (open) { out.push(open); open = null; }
      });
      if (open) out.push(open);
      return out;
    };
    var next = null;
    for (var i = 1; i < rows.length; i++) {
      if (rows[i].cents !== rows[i - 1].cents) { next = rows[i]; break; }
    }
    var peak = rows[0];
    rows.forEach(function (r) { if (r.cents > peak.cents) peak = r; });
    return Money.ok({
      today: rows[0],
      nextChange: next,
      gaps: runs(function (r) { return r.count === 0; }),
      overlaps: runs(function (r) { return r.count > 1; }),
      peak: peak,
      unplaced: grid.unplaced
    });
  }

  return {
    DEFAULT_YEARS: DEFAULT_YEARS,
    MAX_YEARS: MAX_YEARS,
    monthOf: monthOf,
    parseMonth: parseMonth,
    label: label,
    periods: periods,
    months: months,
    summary: summary
  };
});
