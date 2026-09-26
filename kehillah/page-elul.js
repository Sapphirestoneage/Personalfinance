/* kehillah/page-elul.js, Elul (KD-004). Words in, words out; nothing computed. */
(function () {
  'use strict';
  var K = SLAF.K;
  K.boot('elul', function (T) {
    var E = T.elul;
    K.el('plain').textContent = E.plain;
    function build(host, list, branch) {
      host.innerHTML = list.map(function (q) {
        return '<div class="k-question"><div class="q">' + K.esc(q.q) + '</div>' + (q.hint ? '<div class="hint">' + K.esc(q.hint) + '</div>' : '') + '<textarea class="k-text" id="' + K.esc(branch + '-' + q.id) + '" rows="2" aria-label="' + K.esc(q.q) + '" placeholder="in your words"></textarea></div>';
      }).join('');
      list.forEach(function (q) { K.bindText(K.el(branch + '-' + q.id), 'elul.' + branch + '.' + q.id); });
    }
    build(K.el('yearly'), E.yearly, 'yearly');
    build(K.el('monthly'), E.monthly, 'monthly');
    function paintDates() {
      var p = K.plan();
      K.el('last-yearly').textContent = p.elul.yearlyAt ? 'The year\'s reckoning: ' + K.day(p.elul.yearlyAt) + '.' : 'The year\'s reckoning: not yet this year.';
      K.el('last-monthly').textContent = p.elul.monthlyAt ? 'The month\'s: ' + K.day(p.elul.monthlyAt) + '.' : 'The month\'s: not yet.';
    }
    K.el('btn-yearly').addEventListener('click', function () { SLAF.Store.set('elul.yearlyAt', new Date().toISOString().slice(0, 10)); paintDates(); });
    K.el('btn-monthly').addEventListener('click', function () { SLAF.Store.set('elul.monthlyAt', new Date().toISOString().slice(0, 10)); paintDates(); });
    paintDates();
    K.words(K.el('words'), T, ['Cheshbon ha-nefesh', 'Elul', 'Rosh Chodesh', 'Tzedakah']);
    K.foot(K.el('foot'), T, 'elul');
  });
})();
