/* kehillah/page-year.js, The Year (KD-004): the rows once, the read-outs on every change. */
(function () {
  'use strict';
  var K = SLAF.K, M = SLAF.Money;
  K.boot('year', function (T) {
    var today = new Date();
    var KIND = { year: 'a year', month: 'a month', week: 'a week' };

    /* The rows: built once (D-034). */
    K.el('lines').innerHTML = T.year.lines.map(function (l) {
      var h = null; T.year.holidays.forEach(function (x) { if (x.id === l.holiday) h = x; });
      return '<div class="k-row">' +
        '<div><div class="k-label">' + K.esc(l.label) + '</div><p class="k-plain">' + K.esc(l.plain) + '</p>' +
          '<div class="k-guide">Typical: ' + K.esc(K.range(l.lowCents, l.highCents)) + ' ' + K.esc(KIND[l.kind]) +
          (M.isEntered(l.startCents) ? ' <button type="button" class="k-use" data-use="' + K.esc(l.id) + '" data-cents="' + l.startCents + '">use ' + K.esc(K.money(l.startCents)) + '</button>' : '') +
          (h ? ' <span class="k-when">' + K.esc(h.name) + ', ' + K.esc(K.day(h.starts)) + '</span>' : '') + '</div></div>' +
        '<div class="k-box"><span class="slaf-input-shell"><span class="slaf-affix">$</span><input type="text" id="line-' + K.esc(l.id) + '" autocomplete="off" placeholder="not entered" aria-label="' + K.esc(l.label) + ', ' + K.esc(KIND[l.kind]) + '"/></span><span class="k-guide">' + K.esc(KIND[l.kind]) + '</span></div>' +
      '</div>';
    }).join('');
    T.year.lines.forEach(function (l) { K.bindMoney(K.el('line-' + l.id), 'year.lines.' + l.id, paint); });
    K.el('lines').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-use]'); if (!b) return;
      var id = b.getAttribute('data-use'), cents = Number(b.getAttribute('data-cents'));
      SLAF.Store.set('year.lines.' + id, cents);
      K.el('line-' + id).value = String(cents / 100);
      paint();
    });
    K.bindMoney(K.el('saved'), 'year.savedCents', paint);

    /* The calendar: static. */
    K.el('calendar').innerHTML = '<thead><tr><th>Holiday</th><th>Begins the evening of</th><th>Days</th><th>What it is</th></tr></thead><tbody>' +
      T.year.holidays.map(function (h) {
        var past = new Date(h.ends + 'T12:00:00Z').getTime() < today.getTime() - 86400000;
        return '<tr' + (past ? ' class="is-past"' : '') + '><td>' + K.esc(h.name) + '</td><td>' + K.esc(K.day(h.eve)) + '</td><td>' + K.esc(K.day(h.starts) === K.day(h.ends) ? K.day(h.starts) : K.day(h.starts) + ' to ' + K.day(h.ends)) + '</td><td class="k-note">' + K.esc(h.plain) + '</td></tr>';
      }).join('') + '</tbody>';

    function paint() {
      var plan = K.plan();
      var Y = SLAF.Year.read(T.year, plan.year.lines, today);
      if (Y.next) {
        K.el('next-title').textContent = Y.next.days === 0 ? Y.next.holiday.name + ' is today' : Y.next.holiday.name + ' in ' + Y.next.days + ' day' + (Y.next.days === 1 ? '' : 's');
        var dated = Y.rows.filter(function (r) { return r.entered && r.holidayId === Y.next.holiday.id; });
        K.el('next-body').textContent = Y.next.holiday.plain + (dated.length ? ' You have ' + K.money(dated.reduce(function (s, r) { return s + r.yearCents; }, 0)) + ' on it: ' + dated.map(function (r) { return r.label.toLowerCase(); }).join(', ') + '.' : ' No line is entered for it yet.');
      } else { K.el('next-title').textContent = 'The year is over'; K.el('next-body').textContent = 'Time for the next table.'; }
      var s = K.el('stats');
      s.innerHTML = '<div id="s1"></div><div id="s2"></div><div id="s3"></div><div id="s4"></div>';
      var ok = M.isOk(Y.totalCents);
      K.stat(K.el('s1'), 'The year, in total', ok ? K.money(Y.totalCents.value) : 'not yet', ok ? Y.entered + ' of ' + Y.rows.length + ' lines entered' + (Y.blank ? ', ' + Y.blank + ' blank' : '') : 'type any line to start', !ok);
      K.stat(K.el('s2'), 'To set aside each month', ok ? K.money(Y.monthlyCents) : 'not yet', 'the total over twelve months', !ok);
      var big = Y.byMonth.reduce(function (a, b) { return b.cents > a.cents ? b : a; }, Y.byMonth[0]);
      K.stat(K.el('s3'), 'The costliest month ahead', ok && big.cents > 0 ? monthName(big.ym) : 'not yet', ok && big.cents > 0 ? K.money(big.cents) + (big.names.length ? ': ' + big.names.slice(0, 2).join(', ') : '') : '', !(ok && big.cents > 0));
      var weekly = Y.weeklyMonthlyCents;
      K.stat(K.el('s4'), 'The weekly and monthly part', M.isEntered(weekly) ? K.money(weekly) + ' a year' : 'not yet', M.isEntered(weekly) ? 'Shabbat and kosher food, over the year' : 'no weekly or monthly line entered', !M.isEntered(weekly));
      /* The bars. */
      var max = Math.max.apply(null, Y.byMonth.map(function (m) { return m.cents; }).concat([1]));
      K.el('months').innerHTML = Y.byMonth.map(function (m, i) {
        var h = Math.max(2, Math.round(m.cents / max * 100));
        return '<div class="' + (m.cents === 0 ? 'is-empty' : i === 0 ? 'is-now' : '') + '" style="height:' + h + '%" title="' + K.esc(monthName(m.ym) + ': ' + K.money(m.cents)) + '"></div>';
      }).join('');
      K.el('months-labels').innerHTML = Y.byMonth.map(function (m) { return '<span>' + K.esc(monthName(m.ym).slice(0, 3)) + '</span>'; }).join('');
      K.el('months-say').textContent = ok ? Y.byMonth.map(function (m) { return monthName(m.ym).slice(0, 3) + ' ' + K.money(m.cents); }).join(', ') + '.' : 'The bars fill in as lines are entered.';
      /* The pot. */
      var saved = plan.year.savedCents;
      if (M.isEntered(saved) && ok) {
        var share = Y.totalCents.value > 0 ? Math.min(1, saved / Y.totalCents.value) : 1;
        K.stat(K.el('pot'), 'Covered so far', Math.round(share * 100) + '% of the year', K.money(saved) + ' of ' + K.money(Y.totalCents.value) + (saved >= Y.totalCents.value ? '; the year is paid for' : '; ' + K.money(Y.totalCents.value - saved) + ' still to find'), false);
      } else K.stat(K.el('pot'), 'Covered so far', 'not yet', M.isEntered(saved) ? 'enter a line above to compare' : 'type what is in the pot', true);
    }
    function monthName(ym) { return new Date(ym + '-01T12:00:00Z').toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' }); }
    paint();
    K.words(K.el('words'), T, ['Shul', 'Havurah', 'Sliding scale', 'Mishloach manot', 'Matanot l\'evyonim', 'Empty is not zero']);
    K.foot(K.el('foot'), T, 'year');
  });
})();
