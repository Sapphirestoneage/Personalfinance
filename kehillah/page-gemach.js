/* kehillah/page-gemach.js, Gemach (KD-004). */
(function () {
  'use strict';
  var K = SLAF.K, M = SLAF.Money;
  K.boot('gemach', function (T) {
    var G = T.gemach;
    K.el('plain').textContent = G.plain;
    K.bindMoney(K.el('amount'), 'gemach.amountCents', paint);
    K.bindNumber(K.el('term'), 'gemach.termMonths', paint, { integer: true });
    K.bindNumber(K.el('card'), 'gemach.cardApr', paint, { percent: true });
    K.bindNumber(K.el('loan'), 'gemach.loanApr', paint, { percent: true });
    K.bindMoney(K.el('monthly'), 'gemach.monthlyCents', paint);
    K.el('typical').innerHTML = [
      ['Amounts', K.range(G.typical.minCents, G.typical.maxCents) + ', by the society and the purpose.'],
      ['Paid back over', G.typical.termMonthsLow + ' to ' + G.typical.termMonthsHigh + ' months, in equal monthly amounts, at no interest and no fee.'],
      ['Guarantors', G.typical.guarantors + '. This replaces the credit check; ask your chosen family before you assume you have none.'],
      ['What people borrow for', G.typical.uses]
    ].map(function (r) { return '<li><b>' + K.esc(r[0]) + '</b><span class="k-note">' + K.esc(r[1]) + '</span></li>'; }).join('');
    K.el('finder').innerHTML = '<a href="' + K.esc(G.finder.url) + '" rel="noopener">' + K.esc(G.finder.label) + '</a>: ' + K.esc(G.finder.plain);
    K.el('societies').innerHTML = G.societies.map(function (s) { return '<li><a href="' + K.esc(s.url) + '" rel="noopener">' + K.esc(s.name) + '</a> <span class="k-note">' + K.esc(s.area) + '. ' + K.esc(s.note) + '</span></li>'; }).join('');

    function paint() {
      var plan = K.plan();
      var R = SLAF.Loan.compare(plan.gemach);
      var host = K.el('compare');
      if (R.status !== 'ok') { host.innerHTML = '<div class="k-stat"><span class="k-eyebrow">The same loan three ways</span><div class="now is-empty">not yet</div><div class="why">' + K.esc(R.reason) + '</div></div>'; K.el('compare-say').textContent = ''; }
      else {
        var cols = [['A gemach', R.gemach, true], ['Your card', R.card, false], ['A bank loan', R.loan, false]];
        host.innerHTML = cols.map(function (c) {
          var l = c[1];
          if (!l) return '<div class="k-stat"><span class="k-eyebrow">' + K.esc(c[0]) + '</span><div class="now is-empty">no rate entered</div></div>';
          return '<div class="k-stat' + (c[2] ? ' is-best' : '') + '"><span class="k-eyebrow">' + K.esc(c[0]) + (l.apr ? ', ' + Math.round(l.apr * 1000) / 10 + '%' : ', 0%') + '</span><div class="now">' + K.esc(K.money(l.monthlyCents)) + ' a month</div><div class="why">' + K.esc(K.money(l.totalCents)) + ' in all; ' + K.esc(l.interestCents ? K.money(l.interestCents) + ' of it interest' : 'no interest') + '</div></div>';
        }).join('');
        var parts = [];
        if (R.card) parts.push(K.money(R.savedVsCardCents) + ' against the card');
        if (R.loan) parts.push(K.money(R.savedVsLoanCents) + ' against the bank');
        K.el('compare-say').textContent = 'On ' + K.money(plan.gemach.amountCents) + ' over ' + plan.gemach.termMonths + ' months, a gemach saves ' + (parts.length ? parts.join(' and ') : 'whatever the other rate would have charged; type one to see it') + '. The last payment is smaller, so the total is exactly what was borrowed.';
      }
      var W = SLAF.Loan.waitOrBorrow(plan.gemach);
      K.stat(K.el('wait'), 'Months to save it first', M.isOk(W) ? String(W.value) : 'not yet', M.isOk(W) ? K.money(plan.gemach.amountCents) + ' at ' + K.money(plan.gemach.monthlyCents) + ' a month' : W.reason, !M.isOk(W));
    }
    paint();
    K.words(K.el('words'), T, ['Gemach', 'Guarantor', 'APR', 'Tzedakah']);
    K.foot(K.el('foot'), T, 'gemach');
  });
})();
