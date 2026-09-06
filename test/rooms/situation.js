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
    Registry.all().every(function (r) { return Registry.requires(r.id).every(function (k) { return known[k]; }); }));

  /* Before the intake, a room is absent only when it needs a FACT nobody
     has given yet — a partner, a dependent, a status. The exact list is
     already asserted in test/run.js, where the gate's own checks live, and
     it is a decision rather than an accident; this file does not restate it.
     What belongs here is that whatever IS absent can still say why. */
  var offAtStart = Registry.inOrder().filter(function (r) { return !Registry.applies(r, {}); });
  checkTrue('before you say anything, a room that is absent still says why',
    offAtStart.length > 0 && offAtStart.every(function (r) { return !!Gate.why({}, Registry.requires(r.id)); }));

  /* The six situations, and what each turns off. Written out rather than
     computed, so a change to the gate has to be agreed to here too. */
  var EXPECTED = {
    employed:     ['self-employed', 'between-jobs', 'decumulation', 'partner', 'kids', 'variable-income'],
    selfEmployed: ['accounts', 'between-jobs', 'decumulation', 'partner', 'kids'],
    unemployed:   ['savings-rate', 'fire', 'real-hourly-wage', 'hassle', 'self-employed', 'side-hustle',
                   'credential', 'accounts', 'decumulation', 'tax', 'career-move', 'partner', 'kids',
                   'variable-income', 'dreamline'],
    student:      ['self-employed', 'accounts', 'between-jobs', 'protection', 'decumulation', 'partner',
                   'kids', 'variable-income'],
    retired:      ['savings-rate', 'fire', 'real-hourly-wage', 'hassle', 'self-employed', 'side-hustle',
                   'credential', 'accounts', 'between-jobs', 'career-move', 'partner', 'kids',
                   'variable-income', 'dreamline'],
    both:         ['between-jobs', 'decumulation', 'partner', 'kids']
  };
  Object.keys(EXPECTED).forEach(function (status) {
    var h = household(status);
    var off = Registry.inOrder().filter(function (r) { return !Registry.applies(r, h); }).map(function (r) { return r.id; });
    check(status + ': the rooms that do not apply', off.join(','), EXPECTED[status].join(','));
    /* And every one of them can say why, in words. */
    checkTrue(status + ': … and each says why in a sentence',
      off.every(function (id) { return !!Gate.why(h, Registry.requires(id)); }));
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
