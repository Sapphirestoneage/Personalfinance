/* ==========================================================================
   parnassah/engines/milestones.js, the simchas ahead, on a line of years. PN-007.
   --------------------------------------------------------------------------
   Each child's bar or bat mitzvah, year in Israel, wedding and the years of
   support after it, placed in the year they land, with what each costs the
   family and the monthly set-aside that meets every one on time. Aliyah,
   when it is on, is a milestone of the whole family.

     Milestones.timeline(h, T, opts) -> Result
       value: { events: [{ id, label, year, yearsAway, kidId, name, cents, assumed, countedIn }],
                byYear: [{ year, cents, items }], totalCents, setAsideMonthlyCents,
                next, assumedAny, needSex: [kidIds] }
   The year in Israel is priced on the tuition page; it shows here with
   countedIn 'tuition' so nothing is counted twice.
   ========================================================================== */
(function (root, factory) {
  var Money = (typeof module === 'object' && module.exports) ? require('../shared/money.js') : (root.SLAF && root.SLAF.Money);
  var api = factory(Money);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Milestones = api; }
})(typeof self !== 'undefined' ? self : null, function (Money) {
  'use strict';
  var ok = Money.ok, incomplete = Money.incomplete, entered = Money.isEntered;

  function row(T, id) { for (var i = 0; i < T.milestones.events.length; i++) if (T.milestones.events[i].id === id) return T.milestones.events[i]; return null; }
  function typed(h, key, T, id) { var v = h.milestones[key]; if (entered(v)) return { cents: v, assumed: false }; return { cents: Math.round(row(T, id).dollars.typical * 100), assumed: true }; }
  function weddingShare(h, T) {
    var s = null;
    T.milestones.weddingShares.forEach(function (x) { if (x.id === h.milestones.weddingShareId) s = x; });
    if (!s) return null;
    if (s.id === 'custom') return entered(h.milestones.customShare) ? h.milestones.customShare : null;
    return s.share;
  }

  function timeline(h, T, opts) {
    var o = opts || {};
    var today = o.today ? new Date(o.today) : new Date();
    var thisYear = today.getFullYear(), thisMonth = today.getMonth() + 1;
    var kids = h.kids.filter(function (k) { return entered(k.birthYear); });
    var aliyahOn = h.milestones.aliyah.on === true;
    if (!kids.length && !aliyahOn) return incomplete('Add a child with a year of birth, or turn aliyah on, to see the years ahead.', ['kids']);
    var events = [], assumedAny = false, needSex = [];
    var weddingAge = entered(h.milestones.weddingAge) ? h.milestones.weddingAge : row(T, 'wedding').age;
    var share = weddingShare(h, T);
    var supportYears = entered(h.milestones.supportYears) ? h.milestones.supportYears : 0;
    function push(e) { e.yearsAway = e.year - thisYear; if (e.year < thisYear) return; events.push(e); if (e.assumed) assumedAny = true; }

    kids.forEach(function (k) {
      if (k.sex === 'boy') { var b = typed(h, 'barmitzvahCents', T, 'barmitzvah'); push({ id: 'barmitzvah', label: 'Bar mitzvah', year: k.birthYear + row(T, 'barmitzvah').age, kidId: k.id, name: k.name, cents: b.cents, assumed: b.assumed, countedIn: 'here' }); }
      else if (k.sex === 'girl') { var g = typed(h, 'batmitzvahCents', T, 'batmitzvah'); push({ id: 'batmitzvah', label: 'Bat mitzvah', year: k.birthYear + row(T, 'batmitzvah').age, kidId: k.id, name: k.name, cents: g.cents, assumed: g.assumed, countedIn: 'here' }); }
      else needSex.push(k.id);
      if (k.gapYear === true) {
        var gp = h.tuition.overrides.gap;
        var gapCents = entered(gp) ? gp : Math.round(row(T, 'gap').dollars.typical * 100);
        push({ id: 'gap', label: 'The year in Israel', year: k.birthYear + row(T, 'gap').age, kidId: k.id, name: k.name, cents: gapCents, assumed: !entered(gp), countedIn: 'tuition' });
      }
      var w = typed(h, 'weddingCents', T, 'wedding');
      if (share !== null) push({ id: 'wedding', label: 'Wedding (your share)', year: k.birthYear + weddingAge, kidId: k.id, name: k.name, cents: Math.round(w.cents * share), assumed: w.assumed, countedIn: 'here' });
      for (var y = 1; y <= supportYears; y++) {
        var s = typed(h, 'supportAnnualCents', T, 'support');
        push({ id: 'support', label: 'Supporting the young couple, year ' + y, year: k.birthYear + weddingAge + y, kidId: k.id, name: k.name, cents: s.cents, assumed: s.assumed, countedIn: 'here' });
      }
    });
    if (aliyahOn) {
      var A = T.milestones.aliyah, a = h.milestones.aliyah, total = 0, assumed = false;
      A.items.forEach(function (it) { var v = a[it.id + 'Cents']; if (entered(v)) total += v; else { total += Math.round(it.dollars.typical * 100); assumed = true; } });
      var yr = entered(a.year) ? a.year : thisYear + 1;
      push({ id: 'aliyah', label: 'Aliyah', year: yr, kidId: null, name: 'The family', cents: total, assumed: assumed, countedIn: 'here' });
    }
    events.sort(function (a, b) { return a.year - b.year || (a.name || '').localeCompare(b.name || ''); });
    var byYearMap = {}, totalCents = 0, setAside = 0;
    events.forEach(function (e) {
      if (!byYearMap[e.year]) byYearMap[e.year] = { year: e.year, cents: 0, items: [] };
      byYearMap[e.year].items.push(e);
      if (e.countedIn !== 'here') return;
      byYearMap[e.year].cents += e.cents;
      totalCents += e.cents;
      /* Months to the middle of that year, and never fewer than the months left in this one. */
      var monthsAway = Math.max((e.year - thisYear) * 12 + 6 - thisMonth, 12 - thisMonth + 1);
      setAside += e.cents / monthsAway;
    });
    var byYear = Object.keys(byYearMap).map(Number).sort(function (a, b) { return a - b; }).map(function (y) { return byYearMap[y]; });
    var next = events.filter(function (e) { return e.countedIn === 'here'; })[0] || null;
    if (share === null && kids.length) return ok({ events: events, byYear: byYear, totalCents: totalCents, setAsideMonthlyCents: Math.round(setAside), next: next, assumedAny: assumedAny, needSex: needSex, shareMissing: true }, { missing: ['milestones.customShare'] });
    return ok({ events: events, byYear: byYear, totalCents: totalCents, setAsideMonthlyCents: Math.round(setAside), next: next, assumedAny: assumedAny, needSex: needSex, shareMissing: false }, { missing: needSex.map(function (id) { return 'sex:' + id; }) });
  }
  return { timeline: timeline, weddingShare: weddingShare };
});
