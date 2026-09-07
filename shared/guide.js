/* ==========================================================================
   shared/guide.js — the Walk-Through: a finishable path through the suite.
   --------------------------------------------------------------------------
   The suite has fifty-nine rooms. That is a library, not a plan, and a
   library is exactly what someone opening this for the first time cannot
   use. This file turns it into a short walk with an end:

     stages(h, T)      the five sets, each with only the rooms that apply to
                       THIS household, each step carrying its own state
     progress(h, T)    done / total across the whole walk
     nextStep(h, T)    the first step still open, or null when there are none
     stepOf(h, T, id)  where a room sits on the walk, if it is on it at all
     isFinished(h, T)  every step dealt with — done or set aside

   THREE RULES THIS FILE KEEPS

   1. It never guesses that you are finished. A step is done because you
      SAID so, not because the room has numbers in it. "This room has a
      value in every box" and "I have thought about this and I am happy"
      are different facts, and only the second one is progress. So the state
      comes from meta.walk (D-149) and nowhere else.

   2. It never invents a step. Membership is data — data/walk_stages.json —
      and every step is filtered through Registry.applies, which is the same
      gate every other part of the app uses (D-142). A room that is not for
      your situation is not a step you skipped; it is not a step.

   3. It is pure. No storage, no DOM, no dates. The spine writes; this
      reads. That is what lets the tests run it against a made-up household
      without a browser anywhere near it.

   NOT A GATE. Nothing anywhere is locked behind the walk. Every room stays
   reachable from the map at any time, in any order, walk or no walk. This
   is a suggested route with a checklist on it, and the checklist is for the
   person, not for the software.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Registry: require('./registry.js'), Schema: require('./schema.js') };
  } else {
    deps = {
      Registry: root.SLAF && root.SLAF.Registry,
      Schema: root.SLAF && root.SLAF.Schema
    };
  }
  var api = factory(deps.Registry, deps.Schema);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Guide = api; }
})(typeof self !== 'undefined' ? self : null, function (Registry, Schema) {
  'use strict';

  var TABLE = 'walkStages';

  function table(tables) {
    var t = tables && tables[TABLE];
    return (t && t.stages) ? t : null;
  }

  /* meta.walk, normalised, whether or not the household has ever seen it.
     Schema.createWalk is the one definition of the shape; going through it
     here means a household built by hand in a test behaves like one that
     came out of storage. */
  function ledger(household) {
    var raw = household && household.meta && household.meta.walk;
    return Schema && Schema.createWalk ? Schema.createWalk(raw) : {
      startedAt: null, finishedAt: null,
      done: (raw && raw.done) || {}, skipped: (raw && raw.skipped) || {}
    };
  }

  /** 'done' | 'skipped' | 'open' — for any room, on the walk or not. */
  function stateOf(household, roomId) {
    var w = ledger(household);
    if (w.done[roomId]) return 'done';
    if (w.skipped[roomId]) return 'skipped';
    return 'open';
  }

  /**
   * The walk for this household: the stages in order, each holding only the
   * steps whose rooms apply. A stage every one of whose rooms is filtered
   * out is dropped entirely rather than shown empty — an empty set with a
   * tick beside it reads as an achievement, and it is not one.
   */
  function stages(household, tables) {
    var t = table(tables);
    if (!t) return [];
    var n = 0;
    var out = [];
    t.stages.forEach(function (s) {
      var steps = [];
      (s.rooms || []).forEach(function (id) {
        var room = Registry.byId(id);
        if (!room) return;                                   /* a renamed room */
        if (!Registry.applies(room, household)) return;      /* not yours */
        var state = stateOf(household, id);
        steps.push({
          id: id,
          n: ++n,
          title: room.title,
          blurb: room.blurb,
          href: room.href,
          kind: room.kind,
          state: state
        });
      });
      if (!steps.length) return;
      var done = steps.filter(function (x) { return x.state === 'done'; }).length;
      var skipped = steps.filter(function (x) { return x.state === 'skipped'; }).length;
      out.push({
        id: s.id,
        title: s.title,
        goal: s.goal,
        steps: steps,
        done: done,
        skipped: skipped,
        total: steps.length,
        /* A set is complete when nothing in it is still open. Setting a
           step aside counts: deciding a room is not for you IS dealing
           with it, and a checklist that will not let you say so is a
           checklist nobody finishes. */
        complete: done + skipped === steps.length,
        /* ...but a set that was entirely waved off is not an achievement,
           and the page says so differently. */
        allSkipped: done === 0 && skipped === steps.length
      });
    });
    return out;
  }

  /** Every step, flat, in walk order. */
  function steps(household, tables) {
    var out = [];
    stages(household, tables).forEach(function (s) {
      s.steps.forEach(function (x) { out.push(x); });
    });
    return out;
  }

  /** { done, skipped, open, total, pct } across the whole walk. */
  function progress(household, tables) {
    var list = steps(household, tables);
    var done = 0, skipped = 0;
    list.forEach(function (x) {
      if (x.state === 'done') done++;
      else if (x.state === 'skipped') skipped++;
    });
    return {
      done: done,
      skipped: skipped,
      open: list.length - done - skipped,
      total: list.length,
      /* Dealt-with over total, so a set-aside step moves the bar. The bar
         measures how much of the walk is behind you, not how much of the
         app you have filled in — those are different questions and the
         second one already has its own answer in shared/progress.js. */
      pct: list.length ? Math.round(((done + skipped) / list.length) * 100) : 0
    };
  }

  /** The first step still open. Null when the walk is finished. */
  function nextStep(household, tables) {
    var list = steps(household, tables);
    for (var i = 0; i < list.length; i++) {
      if (list[i].state === 'open') return list[i];
    }
    return null;
  }

  /**
   * Where a room sits on the walk: { step, total, stage, state, prev, next }
   * or null if the room is not a step for this household. `next` is the
   * next step in ORDER, not the next open one — this is the "and then"
   * of the walk, and skipping ahead past something you left open would
   * quietly lose it.
   */
  function stepOf(household, tables, roomId) {
    /* One call to stages(), and the flat list derived from THAT array.
       Calling stages() and steps() separately builds the objects twice and
       the step in one is not the step in the other, so looking a step up by
       identity finds nothing — which is exactly the bug this shape had the
       first time it ran. */
    var all = stages(household, tables);
    var list = [];
    all.forEach(function (st) {
      st.steps.forEach(function (x) { list.push({ step: x, stage: st }); });
    });
    for (var i = 0; i < list.length; i++) {
      if (list[i].step.id !== roomId) continue;
      var stage = list[i].stage;
      return {
        step: i + 1,
        total: list.length,
        stage: stage,
        state: list[i].step.state,
        prev: i > 0 ? list[i - 1].step : null,
        next: i + 1 < list.length ? list[i + 1].step : null
      };
    }
    return null;
  }

  function isStep(household, tables, roomId) {
    return !!stepOf(household, tables, roomId);
  }

  /** True once no step is still open. */
  function isFinished(household, tables) {
    var p = progress(household, tables);
    return p.total > 0 && p.open === 0;
  }

  /** Has the person ever begun? Marks count, not just the explicit start. */
  function hasStarted(household) {
    var w = ledger(household);
    if (w.startedAt) return true;
    return Object.keys(w.done).length > 0 || Object.keys(w.skipped).length > 0;
  }

  return {
    TABLE: TABLE,
    ledger: ledger,
    stateOf: stateOf,
    stages: stages,
    steps: steps,
    progress: progress,
    nextStep: nextStep,
    stepOf: stepOf,
    isStep: isStep,
    isFinished: isFinished,
    hasStarted: hasStarted
  };
});
