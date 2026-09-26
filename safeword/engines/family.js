/* ==========================================================================
   safeword/engines/family.js, the papers that protect chosen family. SF-008.
   --------------------------------------------------------------------------
   Family.read(h, T) -> { papers: [{ id, label, hint, weight, status, share }], score: Result (0..1),
     next: paper|null, legalNextOfKin: true|false|null, note }
   The readiness score is the weighted share of papers done; started counts
   half. "next" is the heaviest paper not done. legalNextOfKin is false
   when the house holds people who are not a spouse and the filing status
   is not married: the state's list will not name them.
   ========================================================================== */
(function (root, factory) {
  var deps = (typeof module === 'object' && module.exports)
    ? { Money: require('../shared/money.js'), Model: require('../shared/model.js') }
    : { Money: root.SLAF && root.SLAF.Money, Model: root.SLAF && root.SLAF.Model };
  var api = factory(deps.Money, deps.Model);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Family = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Model) {
  'use strict';
  function read(h, T) {
    var statuses = T.papers.statuses, st = h.papers || {};
    var papers = T.papers.papers.map(function (p) {
      var s = statuses.filter(function (x) { return x.id === st[p.id]; })[0] || null;
      return { id: p.id, label: p.label, hint: p.hint, weight: p.weight, status: s ? s.id : null, share: s ? s.share : null };
    });
    var answered = papers.filter(function (p) { return p.status !== null; });
    var weightAll = papers.reduce(function (a, p) { return a + p.weight; }, 0);
    var score = answered.length ? Money.ok(papers.reduce(function (a, p) { return a + p.weight * (p.share || 0); }, 0) / weightAll, { answered: answered.length, of: papers.length }) : Money.incomplete('Say where each paper stands.', ['papers']);
    var next = papers.filter(function (p) { return p.status !== 'done'; }).sort(function (a, b) { return b.weight - a.weight || (a.share || 0) - (b.share || 0); })[0] || null;
    var others = Model.rows(h.house.people).filter(function (p) { return p.role !== 'me'; });
    var married = /^married/.test(h.you.filingStatus || '');
    var legalNextOfKin = !others.length ? null : married ? null : false;
    var note = legalNextOfKin === false ? 'The people in your house are not your legal next of kin. Without the will, the beneficiary forms and the medical power, the state’s list decides, and they are not on it.' : null;
    return { papers: papers, score: score, next: next, legalNextOfKin: legalNextOfKin, note: note };
  }
  return { read: read };
});
