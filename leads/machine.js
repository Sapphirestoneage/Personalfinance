/* ==========================================================================
   leads/machine.js, the Machine page (LD-007).
   ========================================================================== */
(function () {
  'use strict';
  var S = window.SLAF, UI = S.UI, el = UI.el, esc = UI.esc, Store = S.Store, Machine = S.Machine, Money = S.Money, Ladder = S.Ladder, Charts = S.Charts;
  var GROUPS = [
    ['reach', 'How much you do', 'The rule of 100 says a hundred primary actions a day.'],
    ['rates', 'How it converts', 'Each rate is the share that makes it to the next step. Enter what you measured; leave blank what you have not.'],
    ['money', 'What a customer is worth', 'Price, what they keep paying, how long they stay, and what is left after delivering.'],
    ['spend', 'What getting leads costs', 'Ads and the pay of the people doing the outreach. Zero is an answer.'],
    ['growth', 'Referrals against churn', 'The two rates the referral chapter is about.']
  ];
  function state() { return Store.load(); }
  function shown(inp, v) { if (!Money.isEntered(v)) return ''; return inp.unit === 'cents' ? String(Math.round(v) / 100) : inp.unit === 'rate' ? String(Math.round(v * 1000) / 10) : String(v); }
  function buildInputs() {
    var st = state();
    el('inputs').innerHTML = GROUPS.map(function (g) {
      return '<section class="lz-group"><h3>' + esc(g[1]) + '</h3><p class="lz-note">' + esc(g[2]) + '</p>' + Machine.INPUTS.filter(function (i) { return i.group === g[0]; }).map(function (inp) {
        var pre = inp.unit === 'cents' ? '<span>$</span>' : '', post = inp.unit === 'rate' ? '<span class="after">%</span>' : '';
        return '<label class="lz-field" id="k-' + inp.key + '"><span>' + esc(inp.label) + '</span><div class="lz-affix">' + pre + '<input type="number" inputmode="decimal" step="any" min="0" data-key="' + inp.key + '" data-unit="' + inp.unit + '" value="' + esc(shown(inp, st.kpis[inp.key])) + '"/>' + post + '</div>'
          + '<span class="lz-eg">for example: ' + esc(inp.unit === 'cents' ? '$' + inp.example / 100 : inp.unit === 'rate' ? (inp.example * 100) + '%' : inp.example) + '</span>' + (inp.hint ? '<span class="lz-eg">' + esc(inp.hint) + '</span>' : '') + '</label>';
      }).join('') + '</section>';
    }).join('');
    el('inputs').addEventListener('input', function (e) {
      var n = e.target, key = n.getAttribute('data-key'); if (!key) return;
      var x = n.value === '' ? null : parseFloat(n.value), unit = n.getAttribute('data-unit');
      if (x !== null && isFinite(x)) x = unit === 'cents' ? Math.round(x * 100) : unit === 'rate' ? x / 100 : x; else x = null;
      Store.setKpi(key, x);
      paintReadouts();
    });
  }

  /* ---- Readouts ------------------------------------------------------------- */
  function fig(label, value, note) { return '<div class="lz-tile"><span class="lz-eyebrow">' + esc(label) + '</span><div class="lz-mid">' + value + '</div>' + (note ? '<div class="lz-faint">' + esc(note) + '</div>' : '') + '</div>'; }
  function missingWords(r, prefix) { var n = r.missing.length; return (prefix || 'Needs') + ' ' + (n === 1 ? 'one more number' : n + ' more numbers') + ' on the left: ' + r.missing.slice(0, 3).map(function (k) { var i = Machine.INPUTS.filter(function (x) { return x.key === k; })[0]; return i ? i.label.toLowerCase() : k; }).join(', ') + (n > 3 ? ', and more' : '') + '.'; }
  function paintReadouts() {
    var st = state(), k = st.kpis, R = Machine.read(k), f = R.funnel, c = R.costs, v = R.value, ch = R.checks, lv = R.levers, g = R.growth;
    el('figures').innerHTML = [
      fig('Customers a month', Money.isOk(f) ? UI.count(f.customers, 1) : '<span class="lz-faint">not yet</span>'),
      fig('Engaged leads a month', Money.isOk(f) ? UI.count(f.engaged, 0) : '<span class="lz-faint">not yet</span>'),
      fig('Cost per engaged lead', Money.isOk(c) ? (c.free ? '$0' : c.perEngaged === null ? '<span class="lz-faint">none made</span>' : UI.money(c.perEngaged)) : '<span class="lz-faint">not yet</span>'),
      fig('Cost per customer', Money.isOk(c) ? (c.free ? '$0' : c.perCustomer === null ? '<span class="lz-faint">none made</span>' : UI.money(c.perCustomer)) : '<span class="lz-faint">not yet</span>'),
      fig('A customer is worth', Money.isOk(v) ? UI.money(v.lifetime) : '<span class="lz-faint">not yet</span>', Money.isOk(v) ? 'gross profit over their life' : '')
    ].join('');
    UI.chart(el('ch-funnel'), 'funnel', { kind: 'compare', title: 'From reached to customers, a month', unit: 'count', oneColor: true, defaultType: 'hbar',
      slices: Money.isOk(f) ? f.stages.map(function (s) { return { id: s.id, label: s.label, value: Math.round(s.value * 10) / 10 }; }) : [] }, { width: 680 });
    el('funnel-words').textContent = Money.isOk(f) ? 'Of ' + UI.count(f.reach) + ' people reached, ' + UI.count(f.engaged, 0) + ' engage, ' + UI.count(f.booked, 0) + ' book, ' + UI.count(f.shows, 0) + ' show, ' + UI.count(f.customers, 1) + ' buy.' : missingWords(f);

    var ratioSpec = { kind: 'meter', title: 'Lifetime gross profit over cost per customer', unit: 'score', value: Money.isOk(ch) && !ch.free && ch.ratio !== null ? Math.round(ch.ratio * 10) / 10 : null, max: 6, maxNote: '+',
      bands: [{ to: 1, zone: 'out', label: '1' }, { to: Machine.RATIO_FLOOR, zone: 'watch', label: '3' }, { to: 6, zone: 'good' }], zoneWords: { out: 'loses money', watch: 'under three to one', good: 'three to one or better', none: '' }, defaultType: 'gauge' };
    UI.chart(el('ch-ratio'), 'ratio', ratioSpec, { width: 320 });
    var payback = { kind: 'compare', title: 'First thirty days against twice the cost', unit: 'cents', defaultType: 'bar',
      slices: Money.isOk(ch) && !ch.free && ch.cac !== null ? [{ id: 'first30', label: 'Gross profit, first 30 days', value: ch.first30 }, { id: 'twice', label: 'Twice the cost per customer', value: ch.cac * Machine.PAYBACK_MULT }] : [] };
    UI.chart(el('ch-payback'), 'payback', payback, { width: 320 });
    var vw = el('checks-words');
    vw.className = 'lz-verdict' + (Money.isOk(ch) ? (ch.free ? ' is-good' : ch.ratioOk && ch.paybackOk ? ' is-good' : ch.ratioOk ? ' is-watch' : ' is-out') : '');
    vw.textContent = Money.isOk(ch) ? ch.words : missingWords(ch, 'Both checks need');

    UI.chart(el('ch-levers'), 'levers', { kind: 'compare', title: 'Extra customers a month from one small change', unit: 'count', defaultType: 'hbar',
      slices: Money.isOk(lv) ? lv.levers.map(function (l) { return { id: l.id, label: l.label, value: Math.round(l.gain * 100) / 100 }; }) : [] }, { width: 680 });
    el('levers-words').textContent = Money.isOk(lv) ? 'Every rate multiplies the same chain, so a tenth more of any of them is the same tenth more customers. One point is different: ' + lv.weakestLabel.toLowerCase() + ' is your lowest rate at ' + UI.rate(k[lv.weakest]) + ', so a point there is worth the most. "Better" on the weakest step beats "more" until the rates even out.' : missingWords(lv);

    var months = []; for (var i = 0; i <= 12; i++) months.push(i === 0 ? 'now' : i + ' mo');
    UI.chart(el('ch-growth'), 'growth', { kind: 'series', title: 'Customers over twelve months', unit: 'count', x: months, defaultType: 'line',
      series: Money.isOk(g) ? [{ id: 'with', label: 'With referrals as entered', values: g.withReferrals.map(function (x) { return Math.round(x * 10) / 10; }) }, { id: 'without', label: 'If nobody referred', values: g.withoutReferrals.map(function (x) { return Math.round(x * 10) / 10; }) }] : [] }, { width: 680 });
    el('growth-words').textContent = Money.isOk(g) ? g.words + ' The gap between the lines after a year is ' + UI.count(g.withReferrals[12] - g.withoutReferrals[12], 0) + ' customers: what asking is worth.' : missingWords(g);

    paintLog();
    var goal = Ladder.entered(st.start.goal) ? st.start.goal : null, perWeek = Money.isOk(f) ? f.engaged * 12 / 52 : null;
    UI.chart(el('ch-goal'), 'goal', { kind: 'progress', title: 'Engaged leads a week against the goal', unit: 'count', items: [{ id: 'goal', label: 'This week, at your rates', value: perWeek === null ? null : Math.round(perWeek * 10) / 10, total: goal === null ? 0 : goal }] }, { width: 320 });
    el('goal-words').textContent = goal === null ? 'Set the goal in Start Here on the sky. The book\'s rule: you do not stop at the hundred, you stop when the goal is hit.'
      : perWeek === null ? 'Fill the reach and the rates and this says whether the goal is in reach at your numbers.'
      : perWeek >= goal ? 'At these numbers the goal is met. Raise it, or spend the extra on the next planet.'
      : 'At these numbers you make ' + UI.count(perWeek, 1) + ' engaged leads a week against a goal of ' + UI.count(goal) + '. Either more actions a day, or a better reply rate, closes it; the levers above say which is cheaper.';
  }

  /* ---- The log --------------------------------------------------------------- */
  function paintLog() {
    var st = state(), d = Machine.actionsByDay(st.log, 30);
    el('log-figures').innerHTML = [fig('Days at 100 or more', d.hundredDays + ' <span class="lz-faint">of 30</span>'), fig('In a row', String(d.streak)), fig('Days logged', String(d.loggedDays))].join('');
    UI.chart(el('ch-log'), 'log', { kind: 'series', title: 'Primary actions a day, last thirty days', unit: 'count', x: d.x.map(function (x) { return x.slice(5); }), defaultType: 'bar', ymin: 0, ymax: Math.max(120, Math.max.apply(null, d.total.filter(function (v) { return v !== null; }).concat([0]))),
      series: d.series.length ? d.series.map(function (s) { var p = Ladder.planetById(s.id); return { id: s.id, label: p ? p.name : s.id, values: s.values }; }) : [{ id: 'none', label: 'Logged', values: d.total }] }, { width: 680, note: 'A hundred a day is the line. A day with nothing logged is blank, not zero.' });
    el('log-list').innerHTML = st.log.slice().reverse().slice(0, 30).map(function (e, i) { var p = Ladder.planetById(e.planet); return '<li><span>' + esc(e.date) + '</span><span>' + esc(p ? p.short : e.planet) + '</span><span class="lz-num"><b>' + esc(String(e.count)) + '</b></span><button type="button" data-drop="' + (st.log.length - 1 - i) + '" aria-label="Remove this entry">remove</button></li>'; }).join('');
  }
  el('btn-log').addEventListener('click', function () {
    var date = el('log-date').value, planet = el('log-planet').value, n = parseInt(el('log-count').value, 10);
    if (!date) { UI.say('log-say', 'Pick the day.', 'bad'); return; }
    if (!isFinite(n) || n < 0) { UI.say('log-say', 'Type the count. Zero is allowed, it means you did none.', 'bad'); return; }
    Store.addLog(date, planet, n); el('log-count').value = '';
    UI.say('log-say', 'Logged ' + n + ' for ' + date + '.', 'good'); paintLog();
  });
  el('log-list').addEventListener('click', function (e) { var b = e.target.closest('[data-drop]'); if (!b) return; Store.dropLog(parseInt(b.getAttribute('data-drop'), 10)); paintLog(); });
  el('btn-demo').addEventListener('click', function () { Store.demo(); location.reload(); });

  S.Tables.load().then(function (T) {
    Ladder.use(T.book);
    el('head').innerHTML = UI.header({ screen: 'The Machine', title: 'The numbers behind the book', demo: state().demo, sub: 'Reach, the rates, what a customer costs and is worth, the two checks, the levers, referrals against churn, and the daily hundred. The sky\'s Measure levels read from here.' });
    buildInputs();
    el('log-date').value = new Date().toISOString().slice(0, 10);
    paintReadouts();
    var h = location.hash; if (h && h.indexOf('#k-') === 0) { var f = el(h.slice(1)); if (f) { f.scrollIntoView({ block: 'center' }); var inp = f.querySelector('input'); if (inp) inp.focus(); } }
    else if (h === '#log') el('log').scrollIntoView();
  }).catch(function (err) { el('main').innerHTML = '<p class="lz-say is-bad">The book did not load: ' + esc(err.message) + '. Serve this folder over http (python3 -m http.server) rather than opening the file.</p>'; });
})();
