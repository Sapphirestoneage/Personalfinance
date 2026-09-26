/* ==========================================================================
   safeword/engines/plan.js, the whole picture and the split. SF-009.
   --------------------------------------------------------------------------
   Runs every engine once and reads out the protocol for a month's money:
   of every dollar you keep, the share that goes to the tax jar, the fund,
   the house, the long game and the life, and what is left for the lean
   month. If what is left is under the lean month, the month does not
   close, and the page says which lever is nearest.

   Plan.read(h, T) -> { S, H, TX, F, R, L, D, FA, P (the readings),
     split: [{ id, label, rate: Result, cents: Result }], yours: Result, closes: true|false|null,
     pages: [{ id, label, done: true|false, missing: [words] }], doneCount }
   ========================================================================== */
(function (root, factory) {
  var names = ['Money', 'Streams', 'House', 'TaxPlan', 'Fund', 'Rails', 'LongGame', 'Dynamic', 'Family', 'Play'];
  var deps = {};
  if (typeof module === 'object' && module.exports) {
    deps.Money = require('../shared/money.js'); deps.Streams = require('./streams.js'); deps.House = require('./house.js'); deps.TaxPlan = require('./taxplan.js');
    deps.Fund = require('./fund.js'); deps.Rails = require('./rails.js'); deps.LongGame = require('./longgame.js'); deps.Dynamic = require('./dynamic.js'); deps.Family = require('./family.js'); deps.Play = require('./play.js');
  } else names.forEach(function (n) { deps[n] = root.SLAF && root.SLAF[n]; });
  var api = factory(deps);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Plan = api; }
})(typeof self !== 'undefined' ? self : null, function (E) {
  'use strict';
  var Money = E.Money;
  function read(h, T) {
    var S = E.Streams.read(h, T), H = E.House.read(h, T, S), R = E.Rails.read(h, T, S), TX = E.TaxPlan.read(h, T, S, H), F = E.Fund.read(h, T, S, H, R);
    var L = E.LongGame.read(h, T, S, TX), D = E.Dynamic.read(h, T, S), FA = E.Family.read(h, T), P = E.Play.read(h, T, S);
    var net = Money.isOk(S.typicalNet) && S.typicalNet.value > 0 ? S.typicalNet.value : null;
    function part(id, label, cents) {
      var c = Money.isOk(cents) ? cents : cents;
      return { id: id, label: label, cents: c, rate: net && Money.isOk(c) ? Money.ok(c.value / net) : Money.incomplete('Needs the Streams page.', ['streams']) };
    }
    /* The tax jar is a share of the self-employed part only; the job withholds its own. */
    var seMonth = Money.isOk(S.seNetAnnual) ? Money.ok(Math.round(S.seNetAnnual.value / 12)) : S.seNetAnnual;
    var jar = Money.isOk(TX.setAsideRate) && Money.isOk(seMonth) ? Money.ok(Math.round(TX.setAsideRate.value * seMonth.value)) : Money.incomplete('Needs the Taxes page.', ['taxes']);
    var split = [
      part('taxes', 'The tax jar', jar),
      part('fund', 'The safeword fund', F.setAsideMonth),
      part('house', 'The house (costs of the work)', H.monthTotal),
      part('longgame', 'The long game', Money.isEntered(h.longgame.monthCents) ? Money.ok(h.longgame.monthCents) : Money.incomplete('Needs the Long game page.', ['longgame'])),
      part('play', 'The life', P.monthTotal)
    ];
    var allOk = net !== null && split.every(function (p) { return Money.isOk(p.cents); });
    var yours = allOk ? Money.ok(net - split.reduce(function (a, p) { return a + p.cents.value; }, 0)) : Money.incomplete('Every page above needs its numbers first.', split.filter(function (p) { return !Money.isOk(p.cents); }).map(function (p) { return p.id; }));
    var lean = h.personal.leanMonthCents;
    var closes = Money.isOk(yours) && Money.isEntered(lean) ? yours.value >= lean : null;
    var pages = [
      { id: 'streams', label: 'Streams', done: Money.isOk(S.typicalNet), missing: Money.isOk(S.typicalNet) ? [] : [S.typicalNet.reason] },
      { id: 'house', label: 'The house', done: Money.isOk(H.monthTotal) && !H.monthTotal.none, missing: Money.isOk(H.monthTotal) ? (H.monthTotal.none ? ['No costs entered yet.'] : []) : [H.monthTotal.reason] },
      { id: 'taxes', label: 'Taxes', done: Money.isOk(TX.total), missing: Money.isOk(TX.total) ? [] : [TX.total.reason] },
      { id: 'fund', label: 'The safeword', done: Money.isOk(F.progress), missing: Money.isOk(F.progress) ? [] : [F.target.reason || F.balance.reason] },
      { id: 'rails', label: 'Rails', done: Money.isOk(R.score), missing: Money.isOk(R.score) ? [] : [R.score.reason] },
      { id: 'longgame', label: 'The long game', done: Money.isOk(L.path), missing: Money.isOk(L.path) ? [] : [L.path.reason] },
      { id: 'dynamic', label: 'The house rules', done: Money.isOk(D.shared) && D.people.length > 0, missing: Money.isOk(D.shared) && D.people.length ? [] : [D.people.length ? D.shared.reason : 'Nobody in the house yet.'] },
      { id: 'family', label: 'Chosen family', done: Money.isOk(FA.score), missing: Money.isOk(FA.score) ? [] : [FA.score.reason] },
      { id: 'play', label: 'The life', done: Money.isOk(P.yearTotal) && !P.yearTotal.none, missing: Money.isOk(P.yearTotal) ? (P.yearTotal.none ? ['Nothing entered yet.'] : []) : [P.yearTotal.reason] }
    ];
    return { S: S, H: H, TX: TX, F: F, R: R, L: L, D: D, FA: FA, P: P, net: net, split: split, yours: yours, lean: lean, closes: closes, pages: pages,
      doneCount: pages.filter(function (p) { return p.done; }).length };
  }
  return { read: read };
});
