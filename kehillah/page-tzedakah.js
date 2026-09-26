/* kehillah/page-tzedakah.js, Tzedakah (KD-004). */
(function () {
  'use strict';
  var K = SLAF.K, M = SLAF.Money;
  K.boot('tzedakah', function (T) {
    var today = new Date();
    K.bindMoney(K.el('income'), 'tzedakah.incomeCents', paint);
    K.chips(K.el('base'), T.tzedakah.bases.map(function (b) { return { id: b.id, label: b.label }; }), 'tzedakah.base', paint);
    K.chips(K.el('rates'), T.tzedakah.rates.map(function (r) { return { id: r.id, label: r.label + ' (' + Math.round(r.rate * 100) + '%)' }; }), 'tzedakah.rateId', function (id) {
      var r = null; T.tzedakah.rates.forEach(function (x) { if (x.id === id) r = x; });
      SLAF.Store.set('tzedakah.rate', r ? r.rate : null);
      K.el('rate').value = r ? String(Math.round(r.rate * 100)) : '';
      paint();
    });
    K.bindNumber(K.el('rate'), 'tzedakah.rate', function () {
      SLAF.Store.set('tzedakah.rateId', null);
      Array.prototype.forEach.call(K.el('rates').querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', 'false'); });
      paint();
    }, { percent: true });
    /* The stored rate may match a chip without the chip id being stored (the demo). */
    (function () {
      var r = SLAF.Store.get('tzedakah.rate'), id = SLAF.Store.get('tzedakah.rateId');
      if (id === null && M.isEntered(r)) T.tzedakah.rates.forEach(function (x) { if (Math.abs(x.rate - r) < 1e-9) { var b = K.el('rates').querySelector('button[data-id="' + x.id + '"]'); if (b) b.setAttribute('aria-pressed', 'true'); } });
    })();

    /* The entry form, once. */
    K.el('g-cause').innerHTML = T.tzedakah.causes.map(function (c) { return '<option value="' + K.esc(c.id) + '">' + K.esc(c.label) + '</option>'; }).join('');
    K.el('g-level').innerHTML += T.tzedakah.ladder.slice().sort(function (a, b) { return a.level - b.level; }).map(function (l) { return '<option value="' + l.level + '">' + l.level + ': ' + K.esc(l.label) + '</option>'; }).join('');
    K.el('g-date').value = today.toISOString().slice(0, 10);
    K.el('g-add').addEventListener('click', function () {
      var cents = M.parseMoney(K.el('g-cents').value);
      if (!M.isEntered(cents)) { K.say('g-say', 'How much? A number is needed; 0 is allowed.', 'bad'); return; }
      var plan = K.plan();
      var lvl = K.el('g-level').value;
      plan.tzedakah.gifts.push({ id: 'g' + Date.now().toString(36), cause: K.el('g-cause').value, label: K.el('g-label').value.trim(), cents: cents, level: lvl === '' ? null : Number(lvl), date: K.el('g-date').value || null, note: K.el('g-note').value.trim() });
      SLAF.Store.save(plan);
      K.el('g-cents').value = ''; K.el('g-label').value = ''; K.el('g-note').value = ''; K.el('g-level').value = '';
      K.say('g-say', 'Added.', 'good');
      paint();
    });
    K.el('gifts').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-remove]'); if (!b) return;
      var plan = K.plan(); var id = b.getAttribute('data-remove');
      plan.tzedakah.gifts = plan.tzedakah.gifts.filter(function (g) { return g.id !== id; });
      SLAF.Store.save(plan); paint();
    });
    var byCause = {}; T.tzedakah.causes.forEach(function (c) { byCause[c.id] = c.label; });
    var baseLabel = {}; T.tzedakah.bases.forEach(function (b) { baseLabel[b.id] = b.label.toLowerCase(); });

    function paint() {
      var plan = K.plan();
      var Z = SLAF.Tzedakah.read(T.tzedakah, plan.tzedakah, today, T.year.ends);
      var s = K.el('stats'); s.innerHTML = '<div id="s1"></div><div id="s2"></div><div id="s3"></div><div id="s4"></div>';
      var ok = M.isOk(Z.targetCents);
      K.stat(K.el('s1'), 'The year\'s target', ok ? K.money(Z.targetCents.value) : 'not yet', ok ? Math.round(plan.tzedakah.rate * 1000) / 10 + '% of ' + K.money(plan.tzedakah.incomeCents) + ' ' + (baseLabel[plan.tzedakah.base] || '') : Z.targetCents.reason, !ok);
      K.stat(K.el('s2'), 'Given so far', Z.count ? K.money(Z.givenCents) : 'nothing logged', Z.count ? Z.count + ' gift' + (Z.count === 1 ? '' : 's') : 'add one below', !Z.count);
      K.stat(K.el('s3'), 'Still to give', ok ? K.money(Z.gapCents) : 'not yet', ok ? (Z.gapCents === 0 ? 'the year is met' : 'by ' + K.day(T.year.ends)) : 'needs the target', !ok);
      K.stat(K.el('s4'), 'A month, to close it', ok && Z.gapCents > 0 ? K.money(Z.monthlyCents) : ok ? 'nothing' : 'not yet', ok ? 'over the ' + Z.monthsLeft + ' months left in 5787' : '', !ok);
      K.bar(K.el('bar'), Z.share, ok && Z.share >= 1 ? 'good' : null);
      K.el('bar-say').textContent = ok ? Math.round(Z.share * 100) + '% of the year\'s target given.' + (Z.highestLevel ? ' Your highest rung so far: ' + Z.highestLevel + '.' : '') : 'Enter an income and a rate to see the year.';
      /* Gifts. */
      var gifts = plan.tzedakah.gifts.slice().sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); });
      K.el('gifts').innerHTML = gifts.length ? '<thead><tr><th>When</th><th>To</th><th class="num">Amount</th><th>Rung</th><th></th></tr></thead><tbody>' + gifts.map(function (g) {
        return '<tr><td>' + K.esc(g.date ? K.day(g.date) : '') + '</td><td>' + K.esc(g.label || byCause[g.cause] || '') + (g.label ? '<span class="k-note">' + K.esc(byCause[g.cause] || '') + (g.note ? '. ' + K.esc(g.note) : '') + '</span>' : (g.note ? '<span class="k-note">' + K.esc(g.note) + '</span>' : '')) + '</td><td class="num">' + K.esc(K.money(g.cents)) + '</td><td>' + K.esc(M.isEntered(g.level) ? String(g.level) : '') + '</td><td><button type="button" class="k-use" data-remove="' + K.esc(g.id) + '" aria-label="Remove this gift">remove</button></td></tr>';
      }).join('') + '<tr class="is-total"><td></td><td>By cause: ' + K.esc(Z.byCause.map(function (c) { return c.label + ' ' + K.money(c.cents); }).join('; ')) + '</td><td class="num">' + K.esc(K.money(Z.givenCents)) + '</td><td></td><td></td></tr></tbody>' : '<tbody><tr><td class="k-note">No gifts logged this year. Add one on the left; 0 counts as a gift you decided against, blank does not.</td></tr></tbody>';
      /* The ladder, top rung first. */
      K.el('ladder').innerHTML = T.tzedakah.ladder.slice().sort(function (a, b) { return a.level - b.level; }).map(function (l) {
        var n = Z.ladder[l.level] === undefined ? 0 : Z.ladder[l.level];
        return '<li' + (n ? ' class="is-reached"' : '') + '><span class="rung">' + l.level + '</span><span><b>' + K.esc(l.label) + '</b><br/><span class="k-note">' + K.esc(l.plain) + '</span></span><span class="count">' + (n ? n + ' gift' + (n === 1 ? '' : 's') : '') + '</span></li>';
      }).join('');
    }
    var hol = {}; T.year.holidays.forEach(function (h) { hol[h.id] = h; });
    K.el('moments').innerHTML = T.tzedakah.moments.map(function (m) {
      var h = m.holiday ? hol[m.holiday] : null;
      return '<li><b>' + K.esc(m.label) + '</b>' + (h ? ' <span class="k-note">' + K.esc(h.name) + ', ' + K.esc(K.day(h.starts)) + '</span>' : '') + '<span class="k-note">' + K.esc(m.plain) + '</span></li>';
    }).join('');
    paint();
    K.words(K.el('words'), T, ['Tzedakah', 'Ma\'aser', 'Chomesh', 'Gemach', 'Matanot l\'evyonim', 'Ma\'ot chitim', 'Yahrzeit']);
    K.foot(K.el('foot'), T, 'tzedakah');
  });
})();
