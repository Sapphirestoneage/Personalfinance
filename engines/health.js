/* ==========================================================================
   engines/health.js — the Financial Health Score.
   --------------------------------------------------------------------------
   SPEC.md §9 item 8 puts this last, because it aggregates everything else,
   and §12.4 left its weighting `[PENDING]` with an instruction not to guess.
   That decision is now resolved as **tunable by age cohort** — see
   DECISIONS.md D-043 — and the weights live in data/health_score.json where
   anyone can retune a decade without touching a line of code.

   The whole score is built out of numbers this app already computes:

     engines/ratios.js gives every ratio and, through position(), the one
     canonical mapping from "a ratio and its benchmark band" to a 0-1 figure
     — 1.0 at the good threshold, 0.5 at the warn threshold. Nothing here
     re-derives a ratio, re-reads a band, or invents a second scale. §8.

   Three things this gets right that scores usually do not:

     • A pillar with nothing computable is ABSENT, not zero. Someone who has
       not entered a mortgage does not have a failing housing score; they
       have no housing score, and its weight is spread across the pillars
       that do have data. Scoring silence as failure is the composite
       version of the `|| 0` this repo forbids everywhere else.
     • Over-performance is capped at 1.0. A twenty-month emergency fund
       does not buy off a debt problem. The radar in The Dashboard lets
       position() run past 1 because being well clear of a threshold is
       worth SEEING; it is not worth extra credit.
     • Below half the total weight the score is refused outright. A number
       built from a third of the picture looks exactly like a number built
       from all of it, and that is the entire danger of scores.

   And the honest caveat, which the room prints rather than burying: these
   weights are the most invented numbers in the repository. The engine
   therefore also computes the same household under EVERY cohort, so the
   effect of the weighting is visible instead of hidden.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = {
      Money: require('../shared/money.js'),
      Schema: require('../shared/schema.js'),
      Ratios: require('./ratios.js')
    };
  } else {
    deps = {
      Money: root.SLAF && root.SLAF.Money,
      Schema: root.SLAF && root.SLAF.Schema,
      Ratios: root.SLAF && root.SLAF.Ratios
    };
  }
  var api = factory(deps.Money, deps.Schema, deps.Ratios);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Health = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Ratios) {
  'use strict';

  /* Fallbacks only for a malformed table. The real values are in
     data/health_score.json and the room reports the version it used. */
  var DEFAULT_CAP = 1.0;
  var DEFAULT_MIN_COVERAGE = 0.5;

  /**
   * Which cohort an age falls in. Bounds are inclusive and either end may
   * be null for "open". Returns null for an age no cohort claims, which is
   * a table error rather than a user state — the caller says so.
   */
  function cohortForAge(table, age) {
    var list = (table && table.cohorts) || [];
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (Money.isEntered(c.minAge) && age < c.minAge) continue;
      if (Money.isEntered(c.maxAge) && age > c.maxAge) continue;
      return c;
    }
    return null;
  }

  function cohortById(table, id) {
    var list = (table && table.cohorts) || [];
    for (var i = 0; i < list.length; i++) { if (list[i].id === id) return list[i]; }
    return null;
  }

  function bandFor(table, score) {
    var bands = (table && table.bands) || [];
    for (var i = 0; i < bands.length; i++) {
      if (score >= bands[i].min) return bands[i];
    }
    return bands.length ? bands[bands.length - 1] : null;
  }

  /**
   * Score one pillar from the ratio rows engines/ratios.js already built.
   *
   * A ratio counts only if it computed AND has a band to be judged against.
   * A ratio with no convention behind it (`null` band in
   * data/ratio_benchmarks.json) is deliberately left out — it has no
   * "good", so there is nothing to be near.
   *
   * Within a pillar the ratios are averaged flat. They are facets of one
   * question, and weighting inside a pillar would be a second layer of
   * invented numbers on top of the first.
   */
  function scorePillar(pillar, rowsById, bands, cap) {
    var counted = [], skipped = [];
    (pillar.ratios || []).forEach(function (id) {
      var row = rowsById[id];
      if (!row) { skipped.push({ id: id, why: 'no such ratio' }); return; }
      if (!row.ok) {
        skipped.push({ id: id, label: row.label, why: row.result.reason });
        return;
      }
      var band = bands && bands.bands ? bands.bands[id] : null;
      if (!band || band.good === null || band.warn === null) {
        skipped.push({ id: id, label: row.label, why: 'no benchmark to judge it against' });
        return;
      }
      var position = Ratios.position(row.value, band);
      if (position === null) {
        skipped.push({ id: id, label: row.label, why: 'no benchmark to judge it against' });
        return;
      }
      counted.push({
        id: id, label: row.label, value: row.value, unit: row.unit,
        zone: row.verdict.zone,
        raw: position,
        score: Math.min(cap, position)
      });
    });

    if (!counted.length) {
      return { id: pillar.id, label: pillar.label, blurb: pillar.blurb,
               available: false, score: null, counted: [], skipped: skipped };
    }
    var total = counted.reduce(function (s, r) { return s + r.score; }, 0);
    return {
      id: pillar.id, label: pillar.label, blurb: pillar.blurb,
      available: true,
      score: total / counted.length,
      counted: counted,
      skipped: skipped,
      /* The one dragging this pillar down hardest — what the room names. */
      weakest: counted.slice().sort(function (a, b) { return a.score - b.score; })[0]
    };
  }

  /**
   * score(household, tables, opts)
   *   opts.cohortId  score against a cohort other than the person's own,
   *                  for the "what would this look like at 55" comparison.
   *                  Never changes what is stored; it is a preview.
   *   opts.age       override the age, same purpose.
   *
   * The Result's value is the score out of 100.
   */
  function score(household, tables, opts) {
    var o = opts || {};
    var table = tables && tables.healthScore;
    if (!table || !table.pillars || !table.cohorts) {
      return Money.incomplete('The health-score weights in data/ could not be read.',
        ['healthScore']);
    }
    var bands = tables && tables.ratioBenchmarks;
    if (!bands) {
      return Money.incomplete('The ratio benchmarks in data/ could not be read.',
        ['ratioBenchmarks']);
    }

    var cap = Money.isEntered(table.scoring && table.scoring.cap)
      ? table.scoring.cap : DEFAULT_CAP;
    var minCoverage = Money.isEntered(table.scoring && table.scoring.minCoverage)
      ? table.scoring.minCoverage : DEFAULT_MIN_COVERAGE;

    /* The cohort. Age is not optional and is not guessed: the resolved
       decision was to weight BY AGE, so without one there is no weighting
       to apply. Silence here is refused with a reason, never averaged. */
    var cohort, age = null;
    if (o.cohortId) {
      cohort = cohortById(table, o.cohortId);
      if (!cohort) {
        return Money.incomplete('That age group isn’t one this table knows.', ['cohortId']);
      }
    } else {
      age = Money.isEntered(o.age) ? o.age : Schema.primaryAge(household);
      if (!Money.isEntered(age)) {
        return Money.incomplete(
          'This is weighted by age — what matters at 25 is not what matters at 55 — '
            + 'so it needs your date of birth first.', ['dob']);
      }
      cohort = cohortForAge(table, age);
      if (!cohort) {
        return Money.incomplete('No age group in the table covers ' + age + '.', ['dob']);
      }
    }

    var all = Ratios.all(household, tables);
    var rowsById = {};
    (all.rows || []).forEach(function (r) { rowsById[r.id] = r; });

    var pillars = table.pillars.map(function (p) {
      var scored = scorePillar(p, rowsById, bands, cap);
      scored.weight = Money.isEntered(cohort.weights[p.id]) ? cohort.weights[p.id] : 0;
      return scored;
    });

    var totalWeight = pillars.reduce(function (s, p) { return s + p.weight; }, 0);
    var liveWeight = pillars.reduce(function (s, p) {
      return p.available ? s + p.weight : s;
    }, 0);
    var coverage = totalWeight === 0 ? 0 : liveWeight / totalWeight;

    var missing = pillars.filter(function (p) { return !p.available; });

    if (liveWeight === 0) {
      return Money.incomplete(
        'Nothing here can be scored yet — fill in a room or two and come back.',
        ['ratios']);
    }
    if (coverage < minCoverage) {
      return Money.incomplete(
        'Only ' + Math.round(coverage * 100) + '% of what this looks at can be worked out '
          + 'from what you have entered, and a score built on that little would read exactly '
          + 'like one built on all of it. Missing: '
          + missing.map(function (p) { return p.label.toLowerCase(); }).join(', ') + '.',
        ['ratios']);
    }

    /* The weighted mean over the pillars that HAVE data. Dividing by the
       live weight rather than the total is the redistribution: an absent
       pillar costs nothing and gains nothing. */
    var weighted = pillars.reduce(function (s, p) {
      return p.available ? s + p.weight * p.score : s;
    }, 0);
    var fraction = weighted / liveWeight;
    var out = Math.round(fraction * 100);

    /* Where the points are. For each pillar, how many points of the final
       score are still on the table — weight × how far it is from full,
       normalised the same way the score is. This is the actionable half. */
    var headroom = pillars.filter(function (p) { return p.available; })
      .map(function (p) {
        return {
          id: p.id, label: p.label, weight: p.weight, score: p.score,
          pointsAvailable: (p.weight / liveWeight) * (1 - p.score) * 100,
          weakest: p.weakest
        };
      }).sort(function (a, b) { return b.pointsAvailable - a.pointsAvailable; });

    return Money.ok(out, {
      cohort: cohort,
      age: age,
      band: bandFor(table, out),
      pillars: pillars,
      availablePillars: pillars.filter(function (p) { return p.available; }),
      missingPillars: missing,
      coverage: coverage,
      liveWeight: liveWeight,
      totalWeight: totalWeight,
      headroom: headroom,
      cap: cap,
      minCoverage: minCoverage,
      ratiosCounted: pillars.reduce(function (s, p) { return s + p.counted.length; }, 0),
      referenceVersion: table.version,
      benchmarkVersion: bands.version
    });
  }

  /**
   * The same household under every cohort.
   *
   * This exists because the weights are the most invented numbers here. A
   * score whose weighting is hidden invites more trust than it has earned;
   * showing what the identical figures produce at 25 and at 65 makes the
   * size of that judgement visible, and it costs one extra pass.
   */
  function acrossCohorts(household, tables) {
    var table = tables && tables.healthScore;
    if (!table || !table.cohorts) {
      return Money.incomplete('The health-score weights in data/ could not be read.',
        ['healthScore']);
    }
    var mine = score(household, tables);
    return Money.ok(table.cohorts.map(function (c) {
      return { cohort: c, result: score(household, tables, { cohortId: c.id }) };
    }), {
      ownCohortId: Money.isOk(mine) ? mine.cohort.id : null,
      own: mine
    });
  }

  return {
    cohortForAge: cohortForAge,
    cohortById: cohortById,
    bandFor: bandFor,
    scorePillar: scorePillar,
    score: score,
    acrossCohorts: acrossCohorts
  };
});
