/* ==========================================================================
   engines/fulfillment.js — the Fulfillment Curve. SPEC.md §13, Tier 1.5.
   --------------------------------------------------------------------------
   "Cross-references spend-per-category against a 1-10 joy rating. […] Needs
   Cash Flow calc's categorized data as a prerequisite."

   Two numbers per category — what it costs a month, and what it is worth to
   you — and the interesting part is where they disagree. The output is a
   scatter and four quadrants, not a score: like the Values audit, a single
   figure here would be false precision on top of a self-report.

   Where the lines fall, and why:

     • The joy line is 5.5, the midpoint of a 1-10 scale with no zero.
       It is a property of the scale, not a judgement.
     • The spend line is the MEDIAN monthly spend across the categories that
       have been rated. Not the mean: one mortgage would drag a mean so far
       right that nothing else could ever be "high spend", and the quadrants
       would stop saying anything.

   Both thresholds come back with the result so a room can state them. A
   reading built on a hidden cut-off is not a reading.

   Unrated categories are never assumed. They come back in their own list so
   the room can ask, and they are excluded from the median, the quadrants
   and every ranking.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = {
      Money: require('../shared/money.js'),
      Rating: require('../shared/rating.js'),
      CashFlow: require('./cashflow.js')
    };
  } else {
    deps = {
      Money: root.SLAF && root.SLAF.Money,
      Rating: root.SLAF && root.SLAF.Rating,
      CashFlow: root.SLAF && root.SLAF.CashFlow
    };
  }
  var api = factory(deps.Money, deps.Rating, deps.CashFlow);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Fulfillment = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Rating, CashFlow) {
  'use strict';

  var SCOPE = 'joy';

  /* The joy axis splits at the midpoint of the scale itself. */
  var JOY_MIDPOINT = (Rating.MIN + Rating.MAX) / 2;

  /* Minimum rated categories before the quadrant reading means anything.
     Two points define a median that moves every time one is added; the room
     asks for more rather than drawing a picture out of noise. */
  var MIN_RATED = 4;

  var QUADRANTS = {
    worth_it:   { id: 'worth_it',   label: 'Worth it',
                  blurb: 'Costs a lot, and you would not give it up. Nothing to do here.' },
    expensive:  { id: 'expensive',  label: 'Expensive habit',
                  blurb: 'The biggest gap in the picture — real money, and it barely registers.' },
    cheap_joy:  { id: 'cheap_joy',  label: 'Cheap joy',
                  blurb: 'Small money, big return. The one quadrant worth spending MORE in.' },
    small_meh:  { id: 'small_meh',  label: 'Small and forgettable',
                  blurb: 'Not much money and not much joy. Rarely worth the effort of cutting.' }
  };

  function median(numbers) {
    var sorted = (numbers || []).slice().sort(function (a, b) { return a - b; });
    if (sorted.length === 0) return null;
    var mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function quadrantFor(monthlyCents, joy, spendLine) {
    var pricey = monthlyCents > spendLine;
    var joyful = joy > JOY_MIDPOINT;
    if (pricey && joyful) return QUADRANTS.worth_it;
    if (pricey && !joyful) return QUADRANTS.expensive;
    if (!pricey && joyful) return QUADRANTS.cheap_joy;
    return QUADRANTS.small_meh;
  }

  /**
   * Every categorised category with its rating attached, rated or not.
   * The list a room turns into a row of rating controls.
   */
  function rows(household, catalog) {
    var summary = CashFlow.summarise(household, catalog);
    if (!Money.isOk(summary)) {
      return Money.incomplete(
        'Categorise a month in Cash Flow first — this needs to know what each '
          + 'thing costs before you can say what it is worth.',
        ['expenseEntries']);
    }
    /* Savings and extra debt payments are left out. This tool asks what a
       purchase gives you, and money you keep is not a purchase — rating
       your own retirement contribution for joy is a category error, and
       including it would drag the spend median right for no reason. The
       Values audit DOES count savings, because "what does this serve" is a
       different question from "what does this buy you". */
    var spendOnly = summary.categories.filter(function (row) {
      return row.bucket !== 'savings';
    });

    return Money.ok(spendOnly.map(function (row) {
      var joy = Rating.get(household, SCOPE, row.categoryId);
      return {
        categoryId: row.categoryId,
        label: row.label,
        bucket: row.bucket,
        monthlyCents: row.monthlyCents,
        joy: joy,
        rated: joy !== null
      };
    }), {
      totalMonthlyCents: summary.spendMonthlyCents,
      excludedSavingsCents: summary.savingsMonthlyCents,
      excludedCount: summary.categories.length - spendOnly.length
    });
  }

  /**
   * The reading. `value` is the count of rated categories — the thing that
   * decides whether there is a picture yet. Everything else rides along:
   *
   *   plotted[]     rated categories, each with its quadrant and joy-per-$100
   *   unrated[]     what is still to rate, biggest spend first
   *   spendLine     the median monthly spend the quadrants split on
   *   joyLine       5.5, the midpoint of the scale
   *   byQuadrant    the four buckets, each with its rows and monthly total
   *   cheapestJoy / dearestJoy   the ends of the joy-per-dollar ranking
   *
   * No score. Like the Values audit, the output is a comparison view.
   */
  function curve(household, catalog) {
    var all = rows(household, catalog);
    if (!Money.isOk(all)) return all;

    var rated = all.value.filter(function (r) { return r.rated; });
    var unrated = all.value.filter(function (r) { return !r.rated; })
      .sort(function (a, b) { return b.monthlyCents - a.monthlyCents; });

    if (rated.length < MIN_RATED) {
      return Money.incomplete(
        'Rate at least ' + MIN_RATED + ' of these to see where they fall — '
          + rated.length + ' so far.',
        ['ratings']);
    }

    var spendLine = median(rated.map(function (r) { return r.monthlyCents; }));

    var plotted = rated.map(function (r) {
      var q = quadrantFor(r.monthlyCents, r.joy, spendLine);
      return {
        categoryId: r.categoryId,
        label: r.label,
        bucket: r.bucket,
        monthlyCents: r.monthlyCents,
        joy: r.joy,
        quadrantId: q.id,
        quadrantLabel: q.label,
        /* Joy per $100 a month. Per dollar the numbers are unreadable, and
           a category costing zero has no ratio at all rather than an
           infinite one. */
        joyPerHundred: r.monthlyCents === 0 ? null : r.joy / (r.monthlyCents / 10000)
      };
    });

    var byQuadrant = {};
    Object.keys(QUADRANTS).forEach(function (id) {
      byQuadrant[id] = { id: id, label: QUADRANTS[id].label, blurb: QUADRANTS[id].blurb,
                         rows: [], monthlyCents: 0 };
    });
    plotted.forEach(function (p) {
      var q = byQuadrant[p.quadrantId];
      q.rows.push(p);
      q.monthlyCents += p.monthlyCents;
    });
    Object.keys(byQuadrant).forEach(function (id) {
      byQuadrant[id].rows.sort(function (a, b) { return b.monthlyCents - a.monthlyCents; });
    });

    var ranked = plotted.filter(function (p) { return p.joyPerHundred !== null; })
      .sort(function (a, b) { return b.joyPerHundred - a.joyPerHundred; });

    return Money.ok(rated.length, {
      plotted: plotted.slice().sort(function (a, b) { return b.monthlyCents - a.monthlyCents; }),
      unrated: unrated,
      spendLineCents: spendLine,
      joyLine: JOY_MIDPOINT,
      byQuadrant: byQuadrant,
      ranked: ranked,
      cheapestJoy: ranked.length ? ranked[0] : null,
      dearestJoy: ranked.length ? ranked[ranked.length - 1] : null,
      ratedMonthlyCents: rated.reduce(function (s, r) { return s + r.monthlyCents; }, 0),
      unratedMonthlyCents: unrated.reduce(function (s, r) { return s + r.monthlyCents; }, 0),
      coverage: Rating.coverage(household, SCOPE,
        all.value.map(function (r) { return r.categoryId; })),
      spendMonthlyCents: all.totalMonthlyCents,
      excludedSavingsCents: all.excludedSavingsCents
    });
  }

  return {
    SCOPE: SCOPE,
    JOY_MIDPOINT: JOY_MIDPOINT,
    MIN_RATED: MIN_RATED,
    QUADRANTS: QUADRANTS,
    median: median,
    rows: rows,
    curve: curve
  };
});
