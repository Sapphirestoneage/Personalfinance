/* ==========================================================================
   engines/worth.js — Prospective Worth and Retroactive Worth, one engine.
   --------------------------------------------------------------------------
   SPEC.md §13, Tier 1: "Prospective Worth calc — before buying, estimate
   cost per use / cost per hour of enjoyment" and "Retroactive Worth calc —
   after the fact, what a purchase actually returned, rated 1-10", with the
   note that the two are "designed as a before/after pair; Prospective's
   prediction should be storable and later compared against Retroactive's
   actual outcome".

   They are the same arithmetic pointed at two different tenses, so this is
   one engine and one stored record (Schema.createWorthCheck) with two
   ratings on it — see the comment there for why not two records.

   What it computes, and what it refuses to:

     • Cost per hour. Money over hours, nothing clever.
     • Cost per point of worth. A $400 thing rated 8 costs $50 a point; a
       $40 thing rated 2 costs $20 a point. This is the number that stops
       "it was expensive" from being the whole verdict.
     • The price in hours of your life, from engines/hourly.js — never a
       second wage calculation (SPEC.md §8).
     • The gap between what you predicted and what it turned out to be.
       Across enough entries that gap has a direction, and the direction is
       the actually useful output of the pair: it says whether you tend to
       overestimate what buying things will do for you.

   It does NOT score a purchase, rank your taste, or tell you what to buy.
   Every rating here is a self-report, and a self-report averaged into a
   single "purchase quality index" would be false precision — the same
   reasoning as the Fulfillment Curve and the Values audit.

   The Regret calculator (SPEC.md §13, Tier 4) is not a separate tool: it is
   this data filtered to low actual ratings. regrets() below is that view.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = {
      Money: require('../shared/money.js'),
      Rating: require('../shared/rating.js'),
      Hourly: require('./hourly.js')
    };
  } else {
    deps = {
      Money: root.SLAF && root.SLAF.Money,
      Rating: root.SLAF && root.SLAF.Rating,
      Hourly: root.SLAF && root.SLAF.Hourly
    };
  }
  var api = factory(deps.Money, deps.Rating, deps.Hourly);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Worth = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Rating, Hourly) {
  'use strict';

  /* The rating scope, for anchors and the shared control. Both ratings on a
     worth check use it — "worth every penny" reads the same before and
     after, which is the point of comparing them. */
  var SCOPE = 'worth';

  /* How far off a prediction can be and still count as "about right". One
     point on a ten-point self-report is inside the noise of the instrument;
     calling a 7-vs-8 a misprediction would make the whole tool cry wolf. */
  var GAP_BAND = 1;

  /* An actual rating at or below this is a regret. Deliberately low: the
     Tier 4 idea is "things you wish you hadn't bought", not "things that
     were only fine". 3 of 10 is a purchase you would take back. */
  var REGRET_MAX = 3;

  /* Below this many before/after pairs, the direction of your error is one
     bad week rather than a habit, so calibration() reports it as not yet
     readable instead of drawing a conclusion. */
  var MIN_CALIBRATION = 3;

  var VERDICTS = {
    better:   { id: 'better',   label: 'Better than you thought',
                blurb: 'You underrated this one before you bought it.' },
    expected: { id: 'expected', label: 'About what you expected',
                blurb: 'Your prediction held up.' },
    worse:    { id: 'worse',    label: 'Worse than you thought',
                blurb: 'It promised more before you owned it than after.' }
  };

  function verdictFor(gap) {
    if (!Money.isEntered(gap)) return null;
    if (gap > GAP_BAND) return VERDICTS.better;
    if (gap < -GAP_BAND) return VERDICTS.worse;
    return VERDICTS.expected;
  }

  /**
   * Cost per hour of use. Incomplete — never zero — when either half is
   * missing, because "I don't know how much I used it" and "I used it for
   * no hours" are different answers and only one of them is a number.
   */
  function costPerHour(check) {
    var c = check || {};
    var missing = [];
    if (!Money.isEntered(c.costCents)) missing.push('costCents');
    if (!Money.isEntered(c.hoursSpent)) missing.push('hoursSpent');
    if (missing.length) {
      return Money.incomplete('Add what it cost and how many hours you got out of it.', missing);
    }
    return Money.safeDivide(c.costCents, c.hoursSpent, {
      denominatorName: 'hoursSpent',
      zeroReason: 'Zero hours of use has no cost-per-hour — that is the finding, not a number.'
    });
  }

  /**
   * Cost per point of worth, for whichever rating you ask for.
   * `which` is 'predictedRating' or 'actualRating'.
   */
  function costPerPoint(check, which) {
    var c = check || {};
    var rating = c[which];
    if (!Money.isEntered(c.costCents)) {
      return Money.incomplete('Add what it cost.', ['costCents']);
    }
    if (!Rating.isValid(rating)) {
      return Money.incomplete(which === 'predictedRating'
        ? 'Predict how much this will be worth, 1 to 10.'
        : 'Rate how much it turned out to be worth, 1 to 10.', [which]);
    }
    return Money.ok(c.costCents / rating, { costCents: c.costCents, rating: rating });
  }

  /**
   * One worth check, fully worked out.
   *   evaluate(household, tables, check)
   *
   * The result's value is the cost per point of the rating that exists —
   * actual if it has been lived, predicted if it has not — and `basis` says
   * which, so a room never has to guess what it is showing.
   *
   * The price in hours of life comes from engines/hourly.js and is allowed
   * to be unavailable: someone can rate a purchase without having filled in
   * a work profile. `lifeHoursKnown` and `lifeHoursReason` carry that,
   * rather than a silent absence.
   */
  function evaluate(household, tables, check) {
    var c = check || {};
    var predicted = Rating.isValid(c.predictedRating) ? c.predictedRating : null;
    var actual = Rating.isValid(c.actualRating) ? c.actualRating : null;
    var gap = (predicted !== null && actual !== null) ? actual - predicted : null;

    var perHour = costPerHour(c);
    var perPredicted = costPerPoint(c, 'predictedRating');
    var perActual = costPerPoint(c, 'actualRating');

    var basis = actual !== null ? 'actual' : predicted !== null ? 'predicted' : null;
    var headline = basis === 'actual' ? perActual : basis === 'predicted' ? perPredicted : null;

    var life = Money.isEntered(c.costCents)
      ? Hourly.hoursToAfford(household, tables, c.costCents)
      : Money.incomplete('Add what it cost.', ['costCents']);

    var extra = {
      id: c.id,
      label: c.label,
      costCents: Money.isEntered(c.costCents) ? c.costCents : null,
      hoursSpent: Money.isEntered(c.hoursSpent) ? c.hoursSpent : null,
      predicted: predicted,
      actual: actual,
      gap: gap,
      verdict: verdictFor(gap),
      basis: basis,
      costPerHourCents: Money.isOk(perHour) ? perHour.value : null,
      costPerHourReason: Money.isOk(perHour) ? null : perHour.reason,
      costPerPredictedPointCents: Money.isOk(perPredicted) ? perPredicted.value : null,
      costPerActualPointCents: Money.isOk(perActual) ? perActual.value : null,
      /* What the money cost in hours you had to work for it. */
      lifeHours: Money.isOk(life) ? life.value : null,
      lifeHoursKnown: Money.isOk(life),
      lifeHoursReason: Money.isOk(life) ? null : life.reason,
      /* Hours worked for it against hours got out of it. Above 1 means the
         thing took more of your life to buy than it gave back in use. */
      hoursRatio: (Money.isOk(life) && Money.isEntered(c.hoursSpent) && c.hoursSpent > 0)
        ? life.value / c.hoursSpent : null,
      stage: actual !== null ? 'rated' : predicted !== null ? 'awaiting' : 'empty'
    };

    if (!headline) {
      return Money.incomplete('Rate this 1 to 10 — before or after, either works.',
        ['predictedRating', 'actualRating']);
    }
    if (!Money.isOk(headline)) {
      return Money.incomplete(headline.reason, headline.missing);
    }
    return Money.ok(headline.value, extra);
  }

  /** Every stored check, worked out, newest first as stored. */
  function rows(household, tables) {
    var checks = (household && household.worthChecks) || [];
    return checks.map(function (c) {
      var r = evaluate(household, tables, c);
      /* An unrated, un-costed row still has to render, so the raw fields
         come back either way — the Result says whether there is a reading,
         the row says what is in the record. */
      return {
        id: c.id,
        label: c.label,
        costCents: Money.isEntered(c.costCents) ? c.costCents : null,
        hoursSpent: Money.isEntered(c.hoursSpent) ? c.hoursSpent : null,
        predicted: Rating.isValid(c.predictedRating) ? c.predictedRating : null,
        actual: Rating.isValid(c.actualRating) ? c.actualRating : null,
        predictedAt: c.predictedAt || null,
        ratedAt: c.ratedAt || null,
        result: r,
        stage: Money.isOk(r) ? r.stage
          : (Rating.isValid(c.actualRating) ? 'rated'
            : Rating.isValid(c.predictedRating) ? 'awaiting' : 'empty')
      };
    });
  }

  /**
   * Are you a reliable predictor of your own satisfaction?
   *
   * The mean signed gap across every check that has both ratings. Negative
   * means things disappoint you relative to what you expected; positive
   * means you underrate them going in. This is the one number the pair
   * produces that no single purchase can.
   *
   * Incomplete under MIN_CALIBRATION pairs, and the reason says how many
   * more are needed rather than just "not enough data".
   */
  function calibration(household) {
    var checks = (household && household.worthChecks) || [];
    var pairs = checks.filter(function (c) {
      return Rating.isValid(c.predictedRating) && Rating.isValid(c.actualRating);
    });
    if (pairs.length < MIN_CALIBRATION) {
      var need = MIN_CALIBRATION - pairs.length;
      return Money.incomplete(
        'Rate ' + need + ' more thing' + (need === 1 ? '' : 's')
          + ' you predicted first — with fewer than ' + MIN_CALIBRATION
          + ' before-and-afters this is one bad week, not a pattern.',
        ['worthChecks']);
    }
    var gaps = pairs.map(function (c) { return c.actualRating - c.predictedRating; });
    var mean = gaps.reduce(function (s, g) { return s + g; }, 0) / gaps.length;
    var overestimated = gaps.filter(function (g) { return g < -GAP_BAND; }).length;
    var underestimated = gaps.filter(function (g) { return g > GAP_BAND; }).length;
    var onTarget = gaps.length - overestimated - underestimated;

    return Money.ok(mean, {
      pairCount: gaps.length,
      overestimatedCount: overestimated,
      underestimatedCount: underestimated,
      onTargetCount: onTarget,
      verdict: verdictFor(mean),
      /* Biggest miss in each direction, so the room can name the purchase
         instead of only reporting an average. */
      worstMiss: pairs.reduce(function (worst, c) {
        var g = c.actualRating - c.predictedRating;
        return (worst === null || g < worst.gap) ? { check: c, gap: g } : worst;
      }, null),
      bestSurprise: pairs.reduce(function (best, c) {
        var g = c.actualRating - c.predictedRating;
        return (best === null || g > best.gap) ? { check: c, gap: g } : best;
      }, null)
    });
  }

  /**
   * The Regret view (SPEC.md §13, Tier 4). Not a new calculation — the same
   * records, filtered to the ones that turned out badly, with what they cost
   * added up. Only things actually RATED low count; a thing you never rated
   * is not a regret, it is an unanswered question.
   */
  function regrets(household, opts) {
    var o = opts || {};
    var threshold = Money.isEntered(o.threshold) ? o.threshold : REGRET_MAX;
    var checks = (household && household.worthChecks) || [];
    var rated = checks.filter(function (c) { return Rating.isValid(c.actualRating); });
    if (rated.length === 0) {
      return Money.incomplete('Rate a few things you have already bought to see this.',
        ['worthChecks']);
    }
    var hits = rated.filter(function (c) { return c.actualRating <= threshold; });
    var totalCents = hits.reduce(function (s, c) {
      return Money.isEntered(c.costCents) ? s + c.costCents : s;
    }, 0);
    var costedCount = hits.filter(function (c) { return Money.isEntered(c.costCents); }).length;
    var ratedTotalCents = rated.reduce(function (s, c) {
      return Money.isEntered(c.costCents) ? s + c.costCents : s;
    }, 0);

    return Money.ok(totalCents, {
      threshold: threshold,
      items: hits.slice().sort(function (a, b) { return a.actualRating - b.actualRating; }),
      count: hits.length,
      costedCount: costedCount,
      /* Some regrets may have no cost recorded, so the total is a floor.
         Saying so beats printing a total that quietly leaves things out. */
      complete: costedCount === hits.length,
      ratedCount: rated.length,
      ratedTotalCents: ratedTotalCents,
      shareOfSpend: ratedTotalCents === 0 ? null : totalCents / ratedTotalCents
    });
  }

  /**
   * Everything a room needs in one call: the rows, the calibration, the
   * regret view, and the best and worst value for money among rated things.
   * Each part is its own Result — one missing piece never blanks the page.
   */
  function summarise(household, tables) {
    var all = rows(household, tables);
    var costed = all.filter(function (r) {
      return r.actual !== null && r.costCents !== null && Money.isOk(r.result);
    });
    var byValue = costed.slice().sort(function (a, b) {
      return a.result.costPerActualPointCents - b.result.costPerActualPointCents;
    });
    return {
      rows: all,
      ratedCount: all.filter(function (r) { return r.stage === 'rated'; }).length,
      awaitingCount: all.filter(function (r) { return r.stage === 'awaiting'; }).length,
      calibration: calibration(household),
      regrets: regrets(household),
      bestValue: byValue.length ? byValue[0] : null,
      worstValue: byValue.length ? byValue[byValue.length - 1] : null
    };
  }

  return {
    SCOPE: SCOPE,
    GAP_BAND: GAP_BAND,
    REGRET_MAX: REGRET_MAX,
    MIN_CALIBRATION: MIN_CALIBRATION,
    VERDICTS: VERDICTS,
    verdictFor: verdictFor,
    costPerHour: costPerHour,
    costPerPoint: costPerPoint,
    evaluate: evaluate,
    rows: rows,
    calibration: calibration,
    regrets: regrets,
    summarise: summarise
  };
});
