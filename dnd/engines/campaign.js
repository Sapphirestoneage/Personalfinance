/* ==========================================================================
   engines/campaign.js — the campaign. DD-024.
   --------------------------------------------------------------------------
   A character sheet says where you are. A campaign says what you did, and
   what it cost. Each round offers a board of scenarios; you resolve one; the
   money moves; ten rounds make a chapter and a chapter ends in a review.

   TWO THINGS THIS FILE WILL NOT DO.

   1. IT NEVER WRITES TO YOUR REAL NUMBERS. A campaign forks the household at
      the moment it starts and every consequence lands on the fork. Your sheet
      is untouched, because a game that silently edited someone's actual
      recorded finances would be indefensible. `state.household` is the fork.

   2. IT DOES NOT AUTHOR THE RIGHT ANSWER. "What you should have done" is not
      written on the scenarios. Each option declares which FOO step it serves,
      and the engine compares that against your LIVE placement from
      engines/foo.js. The advice therefore moves as you move: paying down a
      card is right on step 3 and premature on step 1, and the same option
      scores differently in the two places. Nothing here re-derives the FOO —
      Foo.evaluate() owns it, as it owns it for the rest of the suite.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = {
      Money: require('../shared/money.js'),
      Schema: require('../shared/schema.js'),
      Tier0: require('./tier0.js'),
      Foo: require('./foo.js'),
      Character: require('./character.js')
    };
  } else {
    deps = {
      Money: root.SLAF && root.SLAF.Money,
      Schema: root.SLAF && root.SLAF.Schema,
      Tier0: root.SLAF && root.SLAF.Tier0,
      Foo: root.SLAF && root.SLAF.Foo,
      Character: root.SLAF && root.SLAF.Character
    };
  }
  var api = factory(deps.Money, deps.Schema, deps.Tier0, deps.Foo, deps.Character);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.DND = root.DND || {}; root.DND.Campaign = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Tier0, Foo, Character) {
  'use strict';

  var ID = { person: 'dnd_person', cash: 'dnd_asset_cash', investments: 'dnd_asset_investments',
             income: 'dnd_income', debt: 'dnd_debt_total' };

  function rules(tables) { return tables.dndScenarios.rules; }
  function catalogue(tables) { return tables.dndScenarios.scenarios; }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  /* A small deterministic PRNG. The board must be the same board when you
     reload the page mid-round — a reshuffle on refresh would let someone roll
     for a hand they liked better, which is not the game. */
  function rng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }
  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  /* ---- reading the fork -------------------------------------------------- */

  /**
   * Where you are on the ladder, and how sure we are.
   *
   * Foo.evaluate() gives a PLACEMENT only for a step it can judge and finds
   * unmet. Above step 4 it needs contribution figures this tool does not
   * collect, and honestly reports `unknown` rather than guessing — so a
   * well-organised character would get no placement at all.
   *
   * But a walk that stopped at step 6 established every step below it as MET.
   * "At or beyond step 6" is therefore a fact foo.js proved, not a guess, and
   * it is enough to rank options against. It is returned with certain:false
   * and the page says which it has. Nothing here re-derives the ladder.
   */
  function fooStepOf(household, tables) {
    if (!Foo || !tables || !tables.fooRules) return null;
    var f = Foo.evaluate(household, tables);
    if (f && f.placement && Money.isEntered(f.placement.step)) {
      return { step: f.placement.step, certain: true, label: f.placement.label, detail: null };
    }
    var at = f && f.stoppedAt;
    if (at && at.status === 'unknown') {
      var ladder = tables.fooRules.ladder;
      for (var i = 0; i < ladder.length; i++) {
        if (ladder[i].key === at.key) {
          return { step: ladder[i].step, certain: false, label: ladder[i].label,
                   detail: at.detail || null, missing: at.missing || [] };
        }
      }
    }
    return null;
  }

  /** The step number alone, or null — for the callers that only rank. */
  function stepNumber(household, tables) {
    var p = fooStepOf(household, tables);
    return p ? p.step : null;
  }

  /**
   * What the ladder still needs before it can place you. The campaign's
   * prologue asks for exactly this and nothing more — a form that asks for
   * what it does not use is how people stop filling in forms.
   */
  function needs(household, tables) {
    var p = fooStepOf(household, tables);
    if (p && p.certain) return { ready: true, missing: [], detail: null };
    var f = Foo.evaluate(household, tables);
    var at = f && f.stoppedAt;
    return {
      ready: false,
      missing: (at && at.missing) || [],
      detail: (at && at.detail) || null,
      frontier: p ? p.step : null
    };
  }

  /** Everything a review compares. Each figure is a Result or null, never a
      guessed number — an unmeasurable one stays unmeasurable. */
  function snapshot(household, tables) {
    var sheet = Character.sheet(household, tables);
    var nw = Tier0.netWorth(household);
    /* The score AND where it came from. Without the second half a rolled 17
       being replaced by a measured 8 is indistinguishable from a real drop of
       nine — see the bought/measured handling in chapterReview(). */
    var subs = {}, bought = {};
    Object.keys(sheet.subScores || {}).forEach(function (k) {
      var r = sheet.subScores[k];
      subs[k] = Money.isOk(r) ? r.value : null;
      bought[k] = Money.isOk(r) ? !!r.bought : null;
    });
    var stats = {};
    Character.STAT_IDS.forEach(function (id) {
      var r = sheet.stats[id];
      stats[id] = Money.isOk(r) ? r.value : null;
    });
    return {
      at: new Date().toISOString(),
      level: Money.isOk(sheet.level) ? sheet.level.value : null,
      fooStep: stepNumber(household, tables),
      fooCertain: (function () { var p = fooStepOf(household, tables); return p ? p.certain : null; })(),
      netWorthCents: Money.isOk(nw) ? nw.value : null,
      currentHp: Money.isOk(sheet.currentHp) ? sheet.currentHp.value : null,
      armorClass: Money.isOk(sheet.armorClass) ? sheet.armorClass.value : null,
      classId: sheet.chosenClassId || null,
      stats: stats, subScores: subs, subBought: bought
    };
  }

  /* ---- money ------------------------------------------------------------- */

  /**
   * One delta, in cents. Three shapes so a scenario fits any character:
   * `cents` absolute, `months` x monthly expenses, `pctIncome` x gross annual.
   * A shape whose basis cannot be read returns null — the option is then
   * unresolvable and the board will not offer it.
   */
  function deltaCents(spec, household) {
    if (!spec) return 0;
    var total = 0;
    if (Money.isEntered(spec.cents)) total += spec.cents;
    if (Money.isEntered(spec.months)) {
      var m = Schema.monthlyExpensesCents(household);
      if (!Money.isOk(m)) return null;
      total += spec.months * m.value;
    }
    if (Money.isEntered(spec.pctIncome)) {
      var g = Schema.grossAnnualIncomeCents(household);
      if (!Money.isOk(g)) return null;
      total += spec.pctIncome * g.value;
    }
    return Math.round(total);
  }

  /** Every field of an option's money block, in cents. null if any is unreadable. */
  function resolveMoney(option, household) {
    var out = {}, money = option.money || {};
    var keys = Object.keys(money);
    for (var i = 0; i < keys.length; i++) {
      var v = deltaCents(money[keys[i]], household);
      if (v === null) return null;
      out[keys[i]] = v;
    }
    return out;
  }

  /* Writing into the FORK. Deliberately not Store.setMoney: that writes the
     person's own household, and this must never touch it. The records carry
     the same ids the Store uses so the fork and a real sheet have one shape. */
  function firstAsset(h, category) {
    var list = h.assets || [];
    for (var i = 0; i < list.length; i++) if (list[i].category === category) return list[i];
    return null;
  }

  function applyDeltas(household, deltas) {
    var h = household;
    Object.keys(deltas).forEach(function (field) {
      var d = deltas[field];
      if (!d) return;
      if (field === 'cash' || field === 'investments') {
        var cat = field === 'cash' ? 'cash' : 'investment';
        var a = firstAsset(h, cat);
        if (!a) {
          a = Schema.createAsset({ id: field === 'cash' ? ID.cash : ID.investments,
            category: cat, valueCents: 0, liquid: cat === 'cash' });
          h.assets = (h.assets || []).concat([a]);
        }
        a.valueCents = Math.max(0, (a.valueCents || 0) + d);
      } else if (field === 'debt') {
        var debts = h.debts || [];
        var t = debts[0];
        if (!t) {
          t = Schema.createDebt({ id: ID.debt, balanceCents: 0, rate: 0.075, type: 'other' });
          h.debts = debts.concat([t]);
        }
        t.balanceCents = Math.max(0, (t.balanceCents || 0) + d);
      } else if (field === 'incomeAnnual') {
        var p = (h.people || [])[0];
        if (!p) { p = Schema.createPerson({ id: ID.person, role: 'adult' }); h.people = [p]; }
        var src = (p.incomeSources || [])[0];
        if (!src) {
          src = Schema.createIncomeSource({ id: ID.income, personId: p.id, grossAnnualIncomeCents: 0, type: 'w2' });
          p.incomeSources = [src];
        }
        src.grossAnnualIncomeCents = Math.max(0, (src.grossAnnualIncomeCents || 0) + d);
      } else if (field === 'monthlyExpenses') {
        var e = h.expenses || (h.expenses = { monthlyEssential: null, entries: [] });
        if (!e.monthlyEssential) e.monthlyEssential = { estimatedValueCents: 0, trackedValueCents: null, source: 'estimated' };
        var cur = Money.isEntered(e.monthlyEssential.trackedValueCents)
          ? e.monthlyEssential.trackedValueCents : (e.monthlyEssential.estimatedValueCents || 0);
        var next = Math.max(0, cur + d);
        if (Money.isEntered(e.monthlyEssential.trackedValueCents)) e.monthlyEssential.trackedValueCents = next;
        else e.monthlyEssential.estimatedValueCents = next;
      }
    });
    return h;
  }

  /* ---- what you should have done ----------------------------------------
     FOO is an ORDER. An option that serves the step you are actually on is
     the right move; one that serves a step you have already passed is still
     sound housekeeping; one that jumps ahead is premature however clever it
     looks, which is the single most common mistake this tool exists to name.
     Money is the tiebreak, never the ranking.                              */

  var SCORE = { onStep: 100, behind: 60, ahead: 20, none: 10 };

  function scoreOption(option, step, household) {
    var s;
    if (step === null) s = option.serves === null ? SCORE.none : SCORE.behind;
    else if (option.serves === null) s = SCORE.none;
    else if (option.serves === step) s = SCORE.onStep;
    else if (option.serves < step) s = SCORE.behind;
    else s = SCORE.ahead;
    var m = resolveMoney(option, household) || {};
    /* One year of consequence, in cents, as a tiebreak only. */
    var money = (m.cash || 0) + (m.investments || 0) - (m.debt || 0)
              + (m.incomeAnnual || 0) - (m.monthlyExpenses || 0) * 12;
    return { score: s, money: money };
  }

  function bestOption(scenario, step, household) {
    var ranked = scenario.options.map(function (o) {
      var sc = scoreOption(o, step, household);
      return { option: o, score: sc.score, money: sc.money };
    }).sort(function (a, b) { return b.score - a.score || b.money - a.money; });
    var top = ranked[0];
    var why;
    if (step === null) {
      why = 'The ladder cannot place you yet, so this is ranked on what it costs and returns alone — '
          + 'not on order. Answer the two questions in the prologue and this becomes real advice.';
    } else if (top.option.serves === null) {
      why = 'Nothing here advances step ' + step + ', so the one that costs you least is the one to take.';
    } else if (top.option.serves === step) {
      why = 'It serves step ' + step + ', which is the step you are on.';
    } else if (top.option.serves < step) {
      why = 'It shores up step ' + top.option.serves + ', which you have already passed — sound housekeeping.';
    } else {
      why = 'Everything here is ahead of step ' + step + '; this is the least premature. Order is the '
          + 'whole point of the ladder — a clever move made too early is still too early.';
    }
    return { option: top.option, why: why, ranked: ranked };
  }

  /* ---- the board --------------------------------------------------------- */

  function tierOf(household, tables) {
    var sheet = Character.sheet(household, tables);
    var lvl = Money.isOk(sheet.level) ? sheet.level.value : 1;
    var tiers = tables.dndRules.encounterRules.tiers;
    for (var i = 0; i < tiers.length; i++) {
      if (lvl >= tiers[i].minLevel && lvl <= tiers[i].maxLevel) return tiers[i].id;
    }
    return 'I';
  }

  /**
   * The scenarios offered this round. Relevance first — a scenario about your
   * own step beats one three steps away — then deterministic shuffle, so the
   * same round always shows the same board.
   */
  function board(state, tables) {
    var h = state.household;
    var size = rules(tables).boardSize;
    var tier = tierOf(h, tables);
    var step = stepNumber(h, tables);
    var seen = state.seen || [];

    var pool = catalogue(tables).filter(function (s) {
      return s.tiers.indexOf(tier) !== -1
        && s.options.every(function (o) { return resolveMoney(o, h) !== null; });
    });

    /* A FOCUSED RUN. state.focusSubStats names the sub-stats the player asked
       to train; a card counts as training one if any of its options moves it,
       read off the bank rather than a second hand-kept list. */
    var want = (state.focusSubStats && state.focusSubStats.length) ? state.focusSubStats : null;
    function trains(s) {
      if (!want) return false;
      return s.options.some(function (o) {
        return Object.keys(o.subStats || {}).some(function (k) {
          return o.subStats[k] > 0 && want.indexOf(k) !== -1;
        });
      });
    }

    var fresh = pool.filter(function (s) { return seen.indexOf(s.id) === -1; });

    /* PREFERENCE, NOT A FILTER — and this ordering is the whole point.
       Narrowing the pool to the focus outright looked right and dealt repeats
       within a single chapter: a tier's worth of cards that train one ability
       is smaller than a tier, and the moment fewer than a board's worth are
       left the deal starts reoffering cards already played. Being shown a
       situation you have just answered is worse than being shown a fresh one
       that trains something else, so a focused board takes every unseen card
       that trains the target FIRST, then tops up with other unseen cards, and
       only reaches for a seen card when nothing unseen is left at all. */
    var usable;
    if (want) {
      var focused = fresh.filter(trains);
      var rest = fresh.filter(function (s) { return focused.indexOf(s) === -1; });
      usable = focused.concat(rest);
    } else {
      usable = fresh;
    }
    if (usable.length < size) {
      usable = usable.concat(pool.filter(function (s) { return usable.indexOf(s) === -1; }));
    }

    var r = rng(hash(String(state.seed) + ':' + state.chapter + ':' + state.round));
    return usable.map(function (s) {
      var distance = step === null ? 0 : Math.abs(s.fooStep - step);
      /* On a focused run, training the thing you asked to train outranks
         being near your step — otherwise the top-up cards, which are often
         closer to your position, crowd out the ones you came for. */
      var miss = (want && !trains(s)) ? 1000 : 0;
      return { s: s, k: miss + distance * 10 + r() * 9 };   /* relevance, then jitter */
    }).sort(function (a, b) { return a.k - b.k; })
      .slice(0, size).map(function (x) { return x.s; });
  }

  /* ---- running a round --------------------------------------------------- */

  function start(household, tables, focusSubStats) {
    var fork = clone(household || {});
    return {
      startedAt: new Date().toISOString(),
      seed: hash(JSON.stringify(fork).slice(0, 400) + Date.now()),
      chapter: 1, round: 0,
      focusSubStats: (focusSubStats && focusSubStats.length) ? focusSubStats.slice() : null,
      seen: [], history: [],
      household: fork,
      opening: snapshot(fork, tables),
      chapterOpening: snapshot(fork, tables)
    };
  }

  function scenarioById(tables, id) {
    return catalogue(tables).filter(function (s) { return s.id === id; })[0] || null;
  }

  /**
   * Resolve one scenario. Returns the new state and the round's record —
   * including what the other options would have done, which is only honest
   * to show AFTER the choice is made.
   */
  function resolve(state, scenarioId, optionId, tables) {
    var scenario = scenarioById(tables, scenarioId);
    if (!scenario) return { ok: false, reason: 'No such scenario.' };
    var option = scenario.options.filter(function (o) { return o.id === optionId; })[0];
    if (!option) return { ok: false, reason: 'No such option.' };

    var next = clone(state);
    var before = snapshot(next.household, tables);
    var step = before.fooStep;
    var best = bestOption(scenario, step, next.household);
    var deltas = resolveMoney(option, next.household) || {};

    applyDeltas(next.household, deltas);
    var after = snapshot(next.household, tables);

    var couldHave = scenario.options.filter(function (o) { return o.id !== optionId; })
      .map(function (o) {
        return { id: o.id, label: o.label, outcome: o.outcome, serves: o.serves,
                 lever: o.lever, money: resolveMoney(o, before ? state.household : next.household) || {},
                 wasBest: o.id === best.option.id };
      });

    var record = {
      chapter: next.chapter, round: next.round + 1,
      scenarioId: scenario.id, title: scenario.title,
      optionId: option.id, label: option.label, outcome: option.outcome,
      lever: option.lever || null, subStats: option.subStats || {},
      serves: option.serves, fooStepAtTime: step,
      deltas: deltas,
      shouldHave: { id: best.option.id, label: best.option.label, why: best.why },
      followedFoo: best.option.id === option.id,
      couldHave: couldHave,
      levelBefore: before.level, levelAfter: after.level,
      fooBefore: before.fooStep, fooAfter: after.fooStep
    };

    next.history = next.history.concat([record]);
    if (next.seen.indexOf(scenario.id) === -1) next.seen = next.seen.concat([scenario.id]);
    next.round += 1;
    var per = rules(tables).roundsPerChapter;
    var chapterDone = next.round >= per;
    return { ok: true, state: next, record: record, chapterDone: chapterDone };
  }

  /* ---- stacking ----------------------------------------------------------
     The warning the whole review exists for. Practising one lever is how you
     get good at it; practising ONLY one lever is how a character becomes
     unable to answer anything else, and the bestiary is built to find exactly
     that. Counted over the chapter, never over a lifetime — a chapter spent
     on debt when you are on step 3 is correct, not a fault.               */

  function stacking(records, tables) {
    var R = rules(tables);
    var levers = {}, subs = {}, totalSub = 0, withLever = 0;
    records.forEach(function (rec) {
      if (rec.lever) { levers[rec.lever] = (levers[rec.lever] || 0) + 1; withLever++; }
      Object.keys(rec.subStats || {}).forEach(function (k) {
        subs[k] = (subs[k] || 0) + rec.subStats[k]; totalSub += rec.subStats[k];
      });
    });
    var topLever = null, topLeverN = 0;
    Object.keys(levers).forEach(function (k) { if (levers[k] > topLeverN) { topLeverN = levers[k]; topLever = k; } });
    var topSub = null, topSubN = 0;
    Object.keys(subs).forEach(function (k) { if (subs[k] > topSubN) { topSubN = subs[k]; topSub = k; } });

    var allLevers = tables.dndClasses.classes.map(function (c) { return c.id; });
    var untouched = allLevers.filter(function (l) { return !levers[l]; });

    var warnings = [];
    if (topLever && topLeverN >= R.stackWarnCount) {
      warnings.push({
        kind: 'lever', lever: topLever, count: topLeverN, of: records.length,
        text: topLeverN + ' of ' + records.length + ' choices pulled the same lever. That is how you get '
          + 'good at it, and how a character ends up unable to answer anything else.'
      });
    }
    if (topSub && totalSub > 0 && (topSubN / totalSub) >= R.stackSubStatShare) {
      warnings.push({
        kind: 'subStat', subStat: topSub, share: Math.round((topSubN / totalSub) * 100),
        text: Math.round((topSubN / totalSub) * 100) + '% of what you practised this chapter went into one '
          + 'sub-stat. The saves you never train are the ones a creature will come at.'
      });
    }
    return {
      levers: levers, subStats: subs, untouchedLevers: untouched,
      topLever: topLever, topSubStat: topSub, warnings: warnings,
      balanced: warnings.length === 0 && withLever > 0
    };
  }

  /* ---- the chapter review ------------------------------------------------ */

  function chapterReview(state, tables) {
    var records = state.history.filter(function (r) { return r.chapter === state.chapter; });
    var before = state.chapterOpening;
    var after = snapshot(state.household, tables);

    /* Same for the abilities: one whose sub-stats stopped being bought has
       changed basis, not fallen. */
    function abilityBecameReal(id) {
      var members = tables.dndRules.subStats.filter(function (m) { return m.stat === id; });
      return members.some(function (m) {
        return before.subBought && after.subBought
          && before.subBought[m.id] === true && after.subBought[m.id] === false;
      });
    }
    var statShifts = Character.STAT_IDS.map(function (id) {
      return { stat: id, from: before.stats[id], to: after.stats[id],
               basisChanged: abilityBecameReal(id),
               delta: (before.stats[id] === null || after.stats[id] === null) ? null : after.stats[id] - before.stats[id] };
    }).filter(function (x) { return x.delta !== null && x.delta !== 0 && !x.basisChanged; });

    /* A SCORE THAT STOPPED BEING BOUGHT DID NOT FALL.
       A character built by roll or point buy holds bought scores for STR, DEX
       and CON. The moment a scenario moves any real money, boughtFallback
       hands that ability over to measurement and the bought number stops
       applying — so a rolled 17 becomes a measured 8. Reporting that as
       "Income Power −9" told the player they had done something disastrous
       when all that changed was which of the two numbers counts. These are
       pulled out of the shifts and reported as what they are. */
    var becameReal = [];
    var subShifts = Object.keys(after.subScores).map(function (id) {
      var f = before.subScores[id], t = after.subScores[id];
      return {
        subStat: id, from: f, to: t,
        wasBought: before.subBought ? before.subBought[id] : null,
        nowBought: after.subBought ? after.subBought[id] : null,
        delta: (f === null || t === null) ? null : t - f
      };
    }).filter(function (x) {
      if (x.delta === null || x.delta === 0) return false;
      if (x.wasBought === true && x.nowBought === false) { becameReal.push(x); return false; }
      return true;
    }).sort(function (a, b) { return Math.abs(b.delta) - Math.abs(a.delta); });

    var followed = records.filter(function (r) { return r.followedFoo; }).length;
    var missed = records.filter(function (r) { return !r.followedFoo; });

    return {
      chapter: state.chapter, rounds: records.length,
      before: before, after: after,
      levelDelta: (before.level === null || after.level === null) ? null : after.level - before.level,
      fooDelta: (before.fooStep === null || after.fooStep === null) ? null : after.fooStep - before.fooStep,
      netWorthDelta: (before.netWorthCents === null || after.netWorthCents === null)
        ? null : after.netWorthCents - before.netWorthCents,
      statShifts: statShifts, subShifts: subShifts, becameReal: becameReal,
      followedFoo: followed, missedFoo: missed,
      stacking: stacking(records, tables),
      records: records
    };
  }

  function nextChapter(state, tables) {
    var next = clone(state);
    next.chapter += 1;
    next.round = 0;
    next.chapterOpening = snapshot(next.household, tables);
    return next;
  }

  return {
    ID: ID,
    rules: rules, catalogue: catalogue, scenarioById: scenarioById,
    fooStepOf: fooStepOf, stepNumber: stepNumber, needs: needs, tierOf: tierOf, snapshot: snapshot,
    deltaCents: deltaCents, resolveMoney: resolveMoney, applyDeltas: applyDeltas,
    scoreOption: scoreOption, bestOption: bestOption,
    board: board, start: start, resolve: resolve,
    stacking: stacking, chapterReview: chapterReview, nextChapter: nextChapter
  };
});
