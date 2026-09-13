/* ==========================================================================
   test/rooms/situation.js — a room never asks a question your situation
   has no answer to.
   --------------------------------------------------------------------------
   The bug this exists to stop coming back: someone between jobs opened Real
   Hourly Wage and was asked for their paid hours, their commute and their
   costs of working. Thirteen other rooms did the same — contract rates, a
   401(k), a partner's income, a child's tuition.

   None of it was a missing decision. `Gate.exists` has always known, and
   `Registry.applies` has always read it — but only the map and the menu
   listened, so a room reached by a link, a bookmark or the header hops drew
   its whole body anyway. D-142.

   These checks are the data half: every branch has a reason a reader can
   read, every room's REQUIRES resolves, and the six situations turn off the
   rooms they should. The rendering half — that the room actually folds — is
   in test/alignment.js, which needs a browser.
   ========================================================================== */
module.exports = function (t) {
  var Gate = require('../../shared/gate.js');
  var Registry = require('../../shared/registry.js');
  var check = t.check, checkTrue = t.checkTrue;

  function household(status) {
    return { people: [{ id: 'p1', role: 'adult', employmentStatus: status }] };
  }

  /* Every branch must be able to say why, or a room folds itself with no
     reason given — which is worse than asking the wrong question. */
  checkTrue('every gate branch has a sentence saying why it does not apply',
    Gate.BRANCHES.every(function (k) { return typeof Gate.WHY[k] === 'string' && Gate.WHY[k].length > 10; }));
  /* A sentence may describe the ROOM ("this one is about the money that comes
     in between jobs"). It must never assert the READER's situation — the
     caller names that once, and a branch is false in more than one of them. */
  checkTrue('… and none of them tells the reader what their situation is',
    Gate.BRANCHES.every(function (k) { return !/\byou are\b|\byou're\b|\byour situation is\b/i.test(Gate.WHY[k]); }));

  /* A room whose REQUIRES names a branch that does not exist would never
     fold, silently. */
  var known = {}; Gate.BRANCHES.forEach(function (k) { known[k] = true; });
  checkTrue('every branch a room requires is a branch the gate has',
    Registry.all().every(function (r) { return [].concat.apply([], Registry.requires(r.id)).every(function (k) { return known[k]; }); }));

  /* Before the intake, a room is absent only when it needs a FACT nobody
     has given yet — a partner, a dependent, a status. The exact list is
     already asserted in test/run.js, where the gate's own checks live, and
     it is a decision rather than an accident; this file does not restate it.
     What belongs here is that whatever IS absent can still say why. */
  var offAtStart = Registry.inOrder().filter(function (r) { return !Registry.applies(r, {}); });
  checkTrue('before you say anything, a room that is absent still says why',
    offAtStart.length > 0 && offAtStart.every(function (r) { return !!Registry.whyAbsent(r, {}); }));

  /* The six situations, and what each turns off. Written out rather than
     computed, so a change to the gate has to be agreed to here too.
     Between Jobs left this list in D-232: it is a reading of The Cushion
     now, and The Cushion applies to everyone — the question "how long while
     job hunting" is one an employed person is entitled to ask.
     Price the Dream left it in D-240 for the same reason: it is a reading
     of Big Purchase, and what one thing costs is a question anyone may ask.
     The dream reading still needs a wage to price the list in hours, and
     says so rather than disappearing.
     Kids and Tuition left it in D-241 by merging INTO a room that is still
     gated: Family requires a partner OR a dependent, and each reading keeps
     the branch its room had, so the hat is absent when the branch is. What
     changed is that one entry covers both — a household with children and
     no partner now has the room, and only the children's hat in it.
     Variable Income and the Real Hourly Wage left it in D-247, readings of
     Income, which requires nothing: what comes in is a question for
     everybody, and each of those two readings keeps its own branch, so its
     hat is absent exactly where its room used to be. Where It Goes left it
     in D-248 the same way — a reading of The Statement, which everybody
     has, keeping the retirement branch on its own hat.
     Six work rooms left it in D-251 as readings of Work, which keeps the
     appliesWhen every one of them carried. The Account You Left Behind is
     NOT among them: it never had that rule, and folding it in would have
     taken it from exactly the people it is for. It is held, with the
     reason, in docs/room-map.json. */
  var EXPECTED = {
    employed:     ['decumulation', 'partner'],
    selfEmployed: ['decumulation', 'partner'],
    unemployed:   ['fire', 'hassle', 'decumulation', 'tax', 'partner'],
    student:      ['protection', 'decumulation', 'partner'],
    retired:      ['fire', 'hassle', 'career-move', 'partner'],
    both:         ['decumulation', 'partner']
  };
  Object.keys(EXPECTED).forEach(function (status) {
    var h = household(status);
    var off = Registry.inOrder().filter(function (r) { return !Registry.applies(r, h); }).map(function (r) { return r.id; });
    check(status + ': the rooms that do not apply', off.join(','), EXPECTED[status].join(','));
    /* And every one of them can say why, in words. Two things can take a
       room away since D-251 — a branch it needs, or a situation it says it
       is not for — so this asks the registry, which knows both, rather
       than the gate, which knows one. */
    checkTrue(status + ': … and each says why in a sentence',
      off.every(function (id) { return !!Registry.whyAbsent(Registry.byId(id), h); }));
  });

  /* A room that applies must never produce a reason — that is what would
     fold a room someone needs. */
  Object.keys(EXPECTED).forEach(function (status) {
    var h = household(status);
    var on = Registry.inOrder().filter(function (r) { return Registry.applies(r, h); });
    checkTrue(status + ': no room that applies has anything to apologise for',
      on.every(function (r) { return Gate.why(h, Registry.requires(r.id)) === null; }));
  });
};
