/* kehillah/page-chosen-family.js, Chosen Family (KD-004). */
(function () {
  'use strict';
  var K = SLAF.K, M = SLAF.Money;
  K.boot('chosen-family', function (T) {
    var P = T.protections;
    K.el('why').textContent = P.why;
    K.chips(K.el('shape'), P.shapes.map(function (s) { return { id: s.id, label: s.label }; }), 'protections.shape', paint);
    K.el('papers').innerHTML = P.papers.map(function (p) {
      return '<div class="k-row" id="row-' + K.esc(p.id) + '"><div><div class="k-label">' + K.esc(p.label) + '<span class="k-urgent" id="urg-' + K.esc(p.id) + '" hidden>urgent for you</span></div><p class="k-plain">' + K.esc(p.plain) + '</p><div class="k-guide">' + K.esc(K.range(p.lowCents, p.highCents) || 'free') + '. ' + K.esc(p.where) + '</div></div>' +
        '<div class="k-box"><div class="k-status" role="group" aria-label="' + K.esc(p.label) + '">' + P.statuses.map(function (s) { return '<button type="button" data-paper="' + K.esc(p.id) + '" data-status="' + K.esc(s.id) + '" class="is-' + K.esc(s.id) + '" aria-pressed="false">' + K.esc(s.label) + '</button>'; }).join('') + '</div></div></div>';
    }).join('');
    K.el('papers').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-paper]'); if (!b) return;
      var id = b.getAttribute('data-paper'), st = b.getAttribute('data-status');
      var was = b.getAttribute('aria-pressed') === 'true';
      SLAF.Store.set('protections.status.' + id, was ? null : st);
      paint();
    });
    K.bindMoney(K.el('c-month'), 'cushion.monthCents', paint);
    K.bindMoney(K.el('c-saved'), 'cushion.savedCents', paint);
    K.bindMoney(K.el('c-monthly'), 'cushion.monthlyCents', paint);

    function paint() {
      var plan = K.plan();
      var R = SLAF.Protections.read(P, plan.protections);
      R.rows.forEach(function (r) {
        Array.prototype.forEach.call(document.querySelectorAll('#row-' + r.id + ' button[data-status]'), function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-status') === r.status ? 'true' : 'false'); });
        K.el('urg-' + r.id).hidden = !(r.urgent && r.status !== 'done' && r.status !== 'na');
      });
      var s = K.el('stats'); s.innerHTML = '<div id="s1"></div><div id="s2"></div><div id="s3"></div><div id="s4"></div>';
      var any = R.done + R.todo + R.na > 0;
      K.stat(K.el('s1'), 'Done', any ? R.done + ' of ' + (R.done + R.todo) : 'not yet', any ? (R.na ? R.na + ' do not apply' : '') + (R.unanswered ? (R.na ? ', ' : '') + R.unanswered + ' not marked' : '') : 'mark each paper below', !any);
      K.stat(K.el('s2'), 'Urgent and not done', any ? String(R.urgentTodo.length) : 'not yet', plan.protections.shape ? (R.urgentTodo.length ? 'for a household like yours' : 'nothing urgent is open') : 'pick a household shape', !any);
      var okc = M.isOk(R.costLowCents);
      K.stat(K.el('s3'), 'What is left would cost', okc ? K.range(R.costLowCents.value, R.costHighCents.value) : 'not yet', okc ? 'free forms at the low end, a lawyer at the high' : R.costLowCents.reason, !okc);
      var first = R.urgentTodo.length ? R.rows.filter(function (r) { return r.id === R.urgentTodo[0]; })[0] : (R.todo ? R.rows.filter(function (r) { return r.status === 'todo'; })[0] : null);
      K.stat(K.el('s4'), 'Do this one first', first ? first.label : (any ? 'nothing open' : 'not yet'), first ? first.where : '', !first);
      K.bar(K.el('bar'), R.share, R.share === 1 ? 'good' : null);
      /* The cushion. */
      var c = plan.cushion, out = K.el('cushion-out');
      out.innerHTML = '<div id="c1"></div><div id="c2"></div><div id="c3"></div>';
      var haveMonth = M.isEntered(c.monthCents) && c.monthCents > 0;
      var now = haveMonth && M.isEntered(c.savedCents) ? c.savedCents / c.monthCents : null;
      K.stat(K.el('c1'), 'Months you could cover today', now !== null ? (Math.round(now * 10) / 10) + '' : 'not yet', now !== null ? K.money(c.savedCents) + ' at ' + K.money(c.monthCents) + ' a month' : 'needs the lean month and what is set aside', now === null);
      var tl = haveMonth ? SLAF.Timeline.monthsTo({ targetCents: c.monthCents * 3, savedCents: c.savedCents, monthlyCents: c.monthlyCents }) : M.incomplete('needs the lean month', ['monthCents']);
      K.stat(K.el('c2'), 'Three months, the goal', haveMonth ? K.money(c.monthCents * 3) : 'not yet', M.isOk(tl) ? (tl.value.gapCents === 0 ? 'reached' : K.money(tl.value.gapCents) + ' still to find') : tl.reason, !haveMonth);
      K.stat(K.el('c3'), 'There by', M.isOk(tl) && tl.value.date ? (tl.value.months === 0 ? 'already' : K.day(tl.value.date)) : 'not yet', M.isOk(tl) ? (tl.value.months ? tl.value.months + ' months at ' + K.money(tl.value.monthlyCents) + ' a month' : (tl.partial ? tl.reason : '')) : '', !(M.isOk(tl) && tl.value.date));
    }
    paint();
    K.words(K.el('words'), T, ['Chosen family', 'Second-parent adoption', 'Health care proxy', 'Durable power of attorney', 'Beneficiary', 'Chevra kadisha', 'Gemach']);
    K.foot(K.el('foot'), T, 'protections');
  });
})();
