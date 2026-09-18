/* ==========================================================================
   shared/phase1.js — the two numbers, and the gate in front of everything else.
   --------------------------------------------------------------------------
   A beginner arriving at this app met ninety-four rooms, a map and a
   dashboard before they had typed a single figure. Phase 1 is the answer:
   ask for TWO numbers, show ONE reading, and keep the rest of the app shut
   until the person asks for it.

     the two    what a typical month costs, and the cash on hand
     the one    the runway — how long the money lasts

   Nothing here is a new stored fact. `monthlyExpenses` and `cashSavings`
   already exist, already have owners, and are already read by The Cushion.
   This file only answers three questions about them:

     answered(h)   how many of the two are in, and which are not
     done(h)       both in
     unlocked(h)   has this browser gone past Phase 1 — either because the
                   person asked to (the pref), or because the household
                   already holds numbers Phase 1 never asks for
     open(h)       still in Phase 1: the map, the rooms and the panel stay
                   shut. Answering the two does NOT open it — the person does
     screen(h, panelReady)   'onboarding' | 'micro' | 'dashboard'

   The unlock is a PREFERENCE, never a stored fact about the household: it
   changes what is rendered and nothing else, so flipping it leaves the
   household byte-identical (the same rule shared/features.js follows).

   WHY wantsMonthly IS THE WRITE TARGET. A month is four buckets — food,
   accommodation, transportation and everything else (D-172, D-197). Phase 1
   asks for one figure because a beginner has one figure. shared/schema.js
   already names that case: an unsplit month is stored as "everything else",
   and its own migration says so in as many words. So Phase 1 writes
   `wantsMonthly` through its owner, the Expenses room's write path, and the
   moment anyone splits the month in Expenses the split takes over. No
   second copy of the number exists.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Progress: require('./progress.js'), Prefs: require('./prefs.js') };
  } else {
    deps = { Progress: root.SLAF && root.SLAF.Progress, Prefs: root.SLAF && root.SLAF.Prefs };
  }
  var api = factory(deps.Progress, deps.Prefs);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Phase1 = api; }
})(typeof self !== 'undefined' ? self : null, function (Progress, Prefs) {
  'use strict';

  /* The two, as shared/ownership.js names them for READING. */
  var FIELDS = ['monthlyExpenses', 'cashSavings'];

  /* The field each one is WRITTEN through. Reading a month and writing a
     month are not the same field: the month is read as a total and written
     as a bucket. See the header. */
  var WRITES = { monthlyExpenses: 'wantsMonthly', cashSavings: 'cashSavings' };

  /* What each question says on screen, so the onboarding and the
     micro-dashboard cannot drift apart. */
  var ASKS = [
    {
      fieldId: 'monthlyExpenses',
      writeField: 'wantsMonthly',
      heading: 'What does a typical month cost?',
      label: 'Everything you spend, a month',
      why: 'Rent or mortgage, food, getting about, everything else — one rough figure, all in. You can split it up later; nothing here needs the split.',
      placeholder: 'e.g. 3,200'
    },
    {
      fieldId: 'cashSavings',
      writeField: 'cashSavings',
      heading: 'How much cash do you have?',
      label: 'Cash and savings',
      why: 'Checking, savings, anything you could spend this week. Not investments, not retirement accounts.',
      placeholder: 'e.g. 9,600'
    }
  ];

  var UNLOCK_PREF = 'phase1.unlocked';

  /* ---- Which of the two are in ------------------------------------------ */

  /** { filled, total, missing: [fieldId], filledIds: [fieldId] } */
  function answered(household) {
    var ids = filledIds(household);
    var missing = FIELDS.filter(function (f) { return ids.indexOf(f) === -1; });
    return {
      filled: FIELDS.length - missing.length,
      total: FIELDS.length,
      missing: missing,
      filledIds: FIELDS.filter(function (f) { return ids.indexOf(f) !== -1; })
    };
  }

  function done(household) { return answered(household).missing.length === 0; }

  /** Every shared field this household has an answer for, by id. */
  function filledIds(household) {
    if (!Progress || typeof Progress.all !== 'function') return [];
    var seen = {};
    Progress.all(household).forEach(function (row) {
      row.filled.forEach(function (f) { seen[f.fieldId] = true; });
    });
    return Object.keys(seen);
  }

  /* ---- Past Phase 1 ------------------------------------------------------ */

  /** Numbers in the household that Phase 1 never asks for. A returning
      visitor, an imported file and the example household all land here,
      so none of them is ever pushed back to the first question. */
  function hasAnswersBeyond(household) {
    return filledIds(household).some(function (id) { return FIELDS.indexOf(id) === -1; });
  }

  function prefUnlocked() {
    try { return Prefs && Prefs.get(UNLOCK_PREF) === true; } catch (e) { return false; }
  }

  function unlocked(household) {
    return prefUnlocked() || hasAnswersBeyond(household);
  }

  /** The person asked for the rest of the app. A preference, not a fact. */
  function unlock() { try { if (Prefs) Prefs.set(UNLOCK_PREF, true); } catch (e) { /* fine */ } return true; }
  function relock() { try { if (Prefs) Prefs.set(UNLOCK_PREF, null); } catch (e) { /* fine */ } return false; }

  /**
   * Still inside Phase 1: the map, the room list, the other five ways into
   * the Ledger and the full panel all stay shut.
   *
   * ANSWERING THE TWO QUESTIONS DOES NOT OPEN THE GATE. That was the first
   * version of this and it was wrong: the reward for finishing onboarding
   * was the ninety-four rooms it existed to keep out of the way. The gate
   * opens when the PERSON opens it, or when the household already holds
   * numbers Phase 1 never asks for.
   */
  function open(household) { return !unlocked(household); }

  /**
   * Which of the three screens index.html should be showing.
   *   onboarding  inside Phase 1 with a question outstanding — the two
   *               questions and nothing else
   *   micro       the two are in: one reading, one next step, one way on;
   *               also where a household sits that has gone past Phase 1
   *               without giving the full panel everything it needs
   *   dashboard   the panel has what it needs
   * `panelReady` is the caller's own answer to "can the full panel draw",
   * because only index.html knows what its panel needs.
   */
  function screen(household, panelReady) {
    if (open(household)) return done(household) ? 'micro' : 'onboarding';
    return panelReady ? 'dashboard' : 'micro';
  }

  return {
    FIELDS: FIELDS,
    WRITES: WRITES,
    ASKS: ASKS,
    UNLOCK_PREF: UNLOCK_PREF,
    answered: answered,
    done: done,
    filledIds: filledIds,
    hasAnswersBeyond: hasAnswersBeyond,
    unlocked: unlocked,
    unlock: unlock,
    relock: relock,
    open: open,
    screen: screen
  };
});
