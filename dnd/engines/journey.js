/* ==========================================================================
   engines/journey.js — the guided run through. DD-026.
   --------------------------------------------------------------------------
   Five questions, a character, a choice of how to build your six, then a
   focused go at whichever one is weakest.

   ONE THING THIS FILE IS CAREFUL ABOUT.

   The five-question class is a READ OF TEMPERAMENT, not a measurement. It says
   which lever you reach for, which is a real and useful thing to know. It does
   NOT say where your money actually moves — that is suggestClass() on your
   numbers, and the two disagreeing is the most interesting screen in the whole
   tool rather than a bug to reconcile. Nothing here overwrites the measured
   class, and nothing here pretends the quiz measured anything.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('../shared/money.js') };
  } else {
    deps = { Money: root.SLAF && root.SLAF.Money };
  }
  var api = factory(deps.Money);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.DND = root.DND || {}; root.DND.Journey = api; }
})(typeof self !== 'undefined' ? self : null, function (Money) {
  'use strict';

  function quiz(tables) { return tables.dndQuiz5; }
  function classes(tables) { return tables.dndClasses.classes; }

  function questionById(tables, id) {
    return quiz(tables).questions.filter(function (q) { return q.id === id; })[0] || null;
  }
  function optionById(question, id) {
    return question.options.filter(function (o) { return o.id === id; })[0] || null;
  }

  /**
   * The most any one class could score, question by question.
   *
   * WITHOUT THIS THE QUIZ IS RIGGED. The options are written to sound like
   * real people rather than to balance a spreadsheet, so some levers appear in
   * more answers than others — Anchor can reach 12 points across the five,
   * Landholder only 6. Scoring on raw totals would hand nearly everyone the
   * same two classes. Each class is therefore scored as a SHARE of its own
   * ceiling, so leaning hard on a rarely-offered lever counts for as much as
   * leaning hard on a common one.
   */
  function ceilings(tables) {
    var out = {};
    classes(tables).forEach(function (c) { out[c.id] = 0; });
    quiz(tables).questions.forEach(function (q) {
      var best = {};
      q.options.forEach(function (o) {
        Object.keys(o.weights).forEach(function (k) {
          if (!Money.isEntered(best[k]) || o.weights[k] > best[k]) best[k] = o.weights[k];
        });
      });
      Object.keys(best).forEach(function (k) { out[k] += best[k]; });
    });
    return out;
  }

  /**
   * scoreQuiz(answers, tables) — answers is { questionId: optionId }.
   *
   * Returns every class ranked by share of its own ceiling, the winner, the
   * runner-up, and whether it was close. Incomplete until every question is
   * answered: a half-finished quiz gets no verdict, because a class picked
   * from two answers is a horoscope.
   */
  function scoreQuiz(answers, tables) {
    var qs = quiz(tables).questions;
    var a = answers || {};
    var missing = qs.filter(function (q) { return !a[q.id]; }).map(function (q) { return q.id; });
    if (missing.length) {
      return Money.incomplete(missing.length + ' of ' + qs.length + ' still to answer.', missing);
    }
    var raw = {}, said = [];
    classes(tables).forEach(function (c) { raw[c.id] = 0; });
    qs.forEach(function (q) {
      var o = optionById(q, a[q.id]);
      if (!o) return;
      said.push({ question: q.id, ask: q.ask, label: o.label, says: o.says });
      Object.keys(o.weights).forEach(function (k) {
        if (Money.isEntered(raw[k])) raw[k] += o.weights[k];
      });
    });
    var cap = ceilings(tables);
    var ranked = classes(tables).map(function (c) {
      return {
        classId: c.id, name: c.name, lever: c.lever,
        points: raw[c.id], ceiling: cap[c.id],
        share: cap[c.id] > 0 ? raw[c.id] / cap[c.id] : 0
      };
    }).sort(function (x, y) { return y.share - x.share || y.points - x.points; });

    var top = ranked[0], second = ranked[1];
    return Money.ok(top.classId, {
      ranked: ranked, top: top, runnerUp: second,
      /* Almost nobody is one pure thing, and saying so is more honest than a
         verdict delivered to three decimal places. The threshold is 0.05 and
         not something rounder because the median gap between first and second
         is 0.12: at 0.15 the "you're also a bit of X" line fired on 56% of all
         2,000 possible answer sets, which makes it wallpaper. At 0.05 it fires
         on 23% — often enough to be true, rare enough to mean something. */
      close: !!second && (top.share - second.share) < 0.05,
      answers: said
    });
  }

  /* ---- how to raise a stat ----------------------------------------------
     The moves live in data (dnd_improve.json), keyed by sub-stat, because a
     list of things to do is reference content and not calculator code.     */

  function improve(tables) { return tables.dndImprove; }

  function movesFor(subStatId, tables) {
    var t = improve(tables);
    return (t && t.moves && t.moves[subStatId]) || [];
  }

  /** Every move for an ability, with the sub-stat each one lifts. */
  function movesForAbility(statId, tables) {
    var subs = tables.dndRules.subStats.filter(function (m) { return m.stat === statId; });
    var out = [];
    subs.forEach(function (m) {
      movesFor(m.id, tables).forEach(function (mv) {
        out.push({ subStat: m.id, subStatName: m.name, kind: m.kind, move: mv });
      });
    });
    return out;
  }

  /* ---- the focused game --------------------------------------------------
     Pick a stat, get the scenarios that actually train it. "Trains it" means
     an option under that scenario moves one of its three sub-stats — read off
     the scenario bank, never a second hand-kept list.                       */

  function trainedBy(scenario) {
    var out = {};
    (scenario.options || []).forEach(function (o) {
      Object.keys(o.subStats || {}).forEach(function (k) {
        if (o.subStats[k] > 0) out[k] = true;
      });
    });
    return Object.keys(out);
  }

  function scenariosForStat(statId, tables) {
    var subs = tables.dndRules.subStats
      .filter(function (m) { return m.stat === statId; })
      .map(function (m) { return m.id; });
    return tables.dndScenarios.scenarios.filter(function (s) {
      return trainedBy(s).some(function (k) { return subs.indexOf(k) !== -1; });
    });
  }

  function scenariosForSubStat(subStatId, tables) {
    return tables.dndScenarios.scenarios.filter(function (s) {
      return trainedBy(s).indexOf(subStatId) !== -1;
    });
  }

  /**
   * What is worth training, weakest first.
   *
   * Only ranks abilities that HAVE a score. An unscored ability is not weak,
   * it is unknown, and sending someone to train a number nobody has measured
   * would be the tool inventing a problem.
   */
  function weakest(explained, tables) {
    if (!explained || !explained.ready) return [];
    return explained.abilities
      .filter(function (a) { return a.score !== null; })
      .sort(function (x, y) { return x.score - y.score; })
      .map(function (a) {
        return {
          statId: a.id, name: a.name, score: a.score, status: a.status,
          scenarios: scenariosForStat(a.id, tables).length
        };
      });
  }

  return {
    ceilings: ceilings, scoreQuiz: scoreQuiz,
    questionById: questionById, optionById: optionById,
    movesFor: movesFor, movesForAbility: movesForAbility,
    trainedBy: trainedBy, scenariosForStat: scenariosForStat,
    scenariosForSubStat: scenariosForSubStat, weakest: weakest
  };
});
