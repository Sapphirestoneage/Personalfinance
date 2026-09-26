/* kehillah/page-home.js, Home (KD-004): the doors and one line a door. */
(function () {
  'use strict';
  var K = SLAF.K, M = SLAF.Money;
  var DOORS = [
    { id: 'year', href: 'year.html', eyebrow: 'The Jewish year', title: 'The Year', blurb: 'Every holiday with a price, on the calendar of 5787, and what to set aside each month so none of them is a surprise.' },
    { id: 'tzedakah', href: 'tzedakah.html', eyebrow: 'Giving', title: 'Tzedakah', blurb: 'A tenth, a fifth, or your own rate. What that is in dollars, what you have given, and the ladder of how.' },
    { id: 'chosen-family', href: 'chosen-family.html', eyebrow: 'Protection', title: 'Chosen Family', blurb: 'The ten papers that put your people in charge instead of the law\'s defaults, each with a price, and a cushion for leaving safely.' },
    { id: 'family', href: 'family.html', eyebrow: 'Making a family', title: 'Making a Family', blurb: 'Insemination, IVF, surrogacy, adoption. What the path you choose costs, what comes back, and the month you get there.' },
    { id: 'care', href: 'care.html', eyebrow: 'Gender-affirming care', title: 'Care', blurb: 'What care costs out of pocket once insurance does its part, the untaxed account that pays for it, and the name change.' },
    { id: 'gemach', href: 'gemach.html', eyebrow: 'Interest-free loans', title: 'Gemach', blurb: 'A Hebrew free loan beside a credit card and a bank loan, in dollars saved, and where to find one.' },
    { id: 'elul', href: 'elul.html', eyebrow: 'Taking stock', title: 'Elul', blurb: 'Eight questions a year and four a month, in your words. The accounting of the soul, for money.' },
    { id: 'resources', href: 'resources.html', eyebrow: 'Doors', title: 'Resources', blurb: 'Queer Jewish community, free loans and emergency help, legal protection, and money help without a sales pitch.' }
  ];
  K.boot('index', function (T, plan) {
    var today = new Date();
    var Y = SLAF.Year.read(T.year, plan.year.lines, today);
    var Z = SLAF.Tzedakah.read(T.tzedakah, plan.tzedakah, today, T.year.ends);
    var P = SLAF.Protections.read(T.protections, plan.protections);
    var F = SLAF.Family.read(T.family, plan.family, today);
    var C = SLAF.Care.read(T.care, plan.care, today);
    var G = SLAF.Loan.compare(plan.gemach);
    var lines = {
      year: Y.entered ? K.money(Y.monthlyCents) + ' a month covers the ' + Y.entered + ' lines entered' + (Y.next ? '; ' + Y.next.holiday.name + ' in ' + Y.next.days + ' days' : '') + '.' : (Y.next ? Y.next.holiday.name + ' is in ' + Y.next.days + ' days. Nothing entered yet.' : 'Nothing entered yet.'),
      tzedakah: M.isOk(Z.targetCents) ? K.money(Z.givenCents) + ' given of ' + K.money(Z.targetCents.value) + ' this year; ' + K.money(Z.monthlyCents) + ' a month closes it.' : 'No income entered, so no target yet.',
      'chosen-family': P.done + P.todo + P.na ? P.done + ' papers done, ' + P.todo + ' to do' + (P.urgentTodo.length ? ', ' + P.urgentTodo.length + ' of them urgent for your household' : '') + '.' : 'No papers marked yet.',
      family: F.path ? (M.isOk(F.timeline) && F.timeline.value.date ? F.path.label + ': ' + K.money(F.targetCents.value) + ' to find, there by ' + K.day(F.timeline.value.date) + '.' : F.path.label + ' chosen; ' + (M.isOk(F.targetCents) ? K.money(F.targetCents.value) + ' to find.' : 'needs its costs.')) : 'No path chosen.',
      care: C.entered ? (M.isOk(C.outOfPocketCents) ? K.money(C.outOfPocketCents.value) + ' out of pocket this year' + (M.isOk(C.timeline) && C.timeline.value.date ? ', saved by ' + K.day(C.timeline.value.date) : '') + '.' : C.entered + ' lines entered; ' + C.outOfPocketCents.reason + '.') : 'Nothing entered yet.',
      gemach: G.status === 'ok' && G.card ? 'A gemach saves ' + K.money(G.savedVsCardCents) + ' against the card on ' + K.money(plan.gemach.amountCents) + '.' : 'Type an amount to compare.',
      elul: plan.elul.yearlyAt ? 'Last reckoning ' + K.day(plan.elul.yearlyAt) + '.' : 'Not yet this year.',
      resources: 'Four groups of doors, all free to knock on.'
    };
    K.el('doors').innerHTML = DOORS.map(function (d) {
      return '<a class="k-card k-door" href="' + K.esc(d.href) + '"><span class="k-eyebrow">' + K.esc(d.eyebrow) + '</span><h2>' + K.esc(d.title) + '</h2><p>' + K.esc(d.blurb) + '</p><p class="k-note">' + K.esc(lines[d.id]) + '</p></a>';
    }).join('');
    var filled = (Y.entered ? 1 : 0) + (M.isOk(Z.targetCents) ? 1 : 0) + (P.done + P.todo + P.na ? 1 : 0) + (F.path ? 1 : 0) + (C.entered ? 1 : 0) + (G.status === 'ok' ? 1 : 0);
    var w = K.el('where-body');
    if (!filled) { w.textContent = 'Nothing entered yet. Each page fills this in as you go, or try the example numbers from the strip above.'; return; }
    w.className = '';
    w.innerHTML = '<div class="k-stats">' +
      '<div class="k-stat"><span class="k-eyebrow">The year, each month</span><div class="now' + (Y.entered ? '' : ' is-empty') + '">' + K.esc(Y.entered ? K.money(Y.monthlyCents) : 'not yet') + '</div></div>' +
      '<div class="k-stat"><span class="k-eyebrow">Tzedakah still to give</span><div class="now' + (M.isOk(Z.targetCents) ? '' : ' is-empty') + '">' + K.esc(M.isOk(Z.targetCents) ? K.money(Z.gapCents) : 'not yet') + '</div></div>' +
      '<div class="k-stat"><span class="k-eyebrow">Papers done</span><div class="now' + (P.done + P.todo ? '' : ' is-empty') + '">' + K.esc(P.done + P.todo ? P.done + ' of ' + (P.done + P.todo) : 'not yet') + '</div></div>' +
      '<div class="k-stat"><span class="k-eyebrow">Biggest goal, the date</span><div class="now' + ((M.isOk(F.timeline) && F.timeline.value.date) || (M.isOk(C.timeline) && C.timeline.value.date) ? '' : ' is-empty') + '">' + K.esc(bigDate(F, C)) + '</div></div>' +
      '</div>' + (plan.demo ? '<p class="k-note" style="margin-top:var(--space-3)">These are the example household\'s numbers, ' + K.esc(SLAF.Demo.names) + '. Invented, all of them.</p>' : '');
    function bigDate(F, C) {
      var f = M.isOk(F.timeline) && F.timeline.value.date ? { c: F.targetCents.value, d: F.timeline.value.date } : null;
      var c = M.isOk(C.timeline) && C.timeline.value.date ? { c: C.targetCents.value, d: C.timeline.value.date } : null;
      var pick = f && c ? (f.c >= c.c ? f : c) : (f || c);
      return pick ? K.day(pick.d) : 'not yet';
    }
  });
})();
