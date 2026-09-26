/* coach/clientpage.js, the Client View page (CD-007, CD-008). See client.html. */
(function () {
  'use strict';
  var SLAF = window.SLAF;
  var UI = SLAF.CoachUI, el = UI.el, esc = UI.esc;
  var Money = SLAF.Money, Schema = SLAF.Schema, Coach = SLAF.Coach, ClientView = SLAF.ClientView, Fields = SLAF.Fields, Tables = SLAF.Tables;

  var client = UI.clientOr(UI.param('client'));
  if (!client) { el('main').innerHTML = '<section class="slaf-card coach-off"><h1>Nothing to show</h1><p class="slaf-lede">Open a client view from Coach Home.</p></section>'; return; }
  var ID = client.id;
  var presenter = UI.param('presenter') === '1';
  var snapId = UI.param('snap');
  var T = null, feeling = null;

  el('presenter-bar').innerHTML = presenter ? '<span>Client view</span>'
    : '<a href="index.html">Coach Home</a><a href="session.html?client=' + encodeURIComponent(ID) + '">Back to the session</a>';

  function household() { return snapId ? Coach.snapshotHousehold(ID, snapId) : Coach.household(ID); }
  function sinceOf() {
    var sessions = Coach.record(ID).sessions;
    if (!sessions.length) return { h: null, date: null };
    var s = sessions.filter(function (x) { return !x.endedAt; })[0] || sessions[sessions.length - 1];
    return { h: s.startSnapshotId ? Coach.snapshotHousehold(ID, s.startSnapshotId) : null, date: s.startedAt };
  }
  function paint() {
    var h = household();
    if (!h) { el('view').innerHTML = '<section class="slaf-card"><p>That snapshot is not in this browser.</p></section>'; return; }
    var c = Coach.client(ID) || client;
    var since = snapId ? { h: null, date: null } : sinceOf();
    var snap = snapId ? Coach.snapshots(ID).filter(function (x) { return x.id === snapId; })[0] : null;
    el('view').innerHTML = ClientView.render(h, T, {
      record: Coach.record(ID), readings: Fields.readings,
      name: c.name, asOf: Schema.localDay(), mapWidth: Math.max(320, el('view').clientWidth - 40), since: since.h, sinceDate: since.date,
      nextSessionAt: c.nextSessionAt, readOnly: !!snapId, snapLabel: snap ? UI.day(snap.at) : null
    });
  }

  /* The check-in: built on open and after a save only. */
  function buildCheckin() {
    var h = Coach.household(ID), lines = [];
    (h.assets || []).forEach(function (a) { lines.push({ key: 'assetValue:' + a.id, label: a.label || 'An account' }); });
    if (!(h.assets || []).length) { lines.push({ key: 'cashSavings', label: 'Cash and savings' }); lines.push({ key: 'investments', label: 'Investments and retirement' }); }
    (h.debts || []).forEach(function (d) { lines.push({ key: 'debtBalance:' + d.id, label: (d.label || 'A debt') + ', still owed' }); });
    el('ci-balances').innerHTML = '<div class="row">' + lines.map(function (l, i) { return '<label class="inline">' + esc(l.label) + '<input type="text" inputmode="decimal" data-bal="' + esc(l.key) + '" id="ci-bal-' + i + '"/></label>'; }).join('') + '</div>';
    el('ci-feel').innerHTML = [1, 2, 3, 4, 5].map(function (n) { return '<button type="button" class="slaf-btn slaf-btn--small" data-feel="' + n + '" aria-pressed="false">' + n + '</button>'; }).join('');
    var open = Coach.record(ID).homework.filter(function (x) { return !x.doneAt; });
    el('ci-homework').innerHTML = open.length ? '<p class="slaf-label">Homework done</p>' + open.map(function (x) {
      return '<label class="slaf-switch" style="min-height:36px;display:flex"><input type="checkbox" data-hw-tick="' + esc(x.id) + '"/> ' + esc(x.text) + '</label>';
    }).join('') : '';
    el('ci-date').value = Schema.localDay(); el('ci-income').value = ''; el('ci-text').value = '';
    feeling = null;
  }
  el('ci-feel').addEventListener('click', function (e) {
    var b = e.target.closest('[data-feel]'); if (!b) return;
    feeling = +b.getAttribute('data-feel');
    Array.prototype.forEach.call(el('ci-feel').querySelectorAll('[data-feel]'), function (x) { x.setAttribute('aria-pressed', String(+x.getAttribute('data-feel') === feeling)); });
  });
  el('ci-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var balances = {}, bad = [];
    Array.prototype.forEach.call(document.querySelectorAll('[data-bal]'), function (inp) {
      if (!inp.value.trim()) return;                      /* empty is not zero: not reported */
      var c = Money.parseMoney(inp.value);
      if (c === null || c === undefined || !isFinite(c)) { bad.push(inp.closest('label').textContent.trim()); return; }
      balances[inp.getAttribute('data-bal')] = c;
    });
    var income = el('ci-income').value.trim() ? Money.parseMoney(el('ci-income').value) : null;
    if (el('ci-income').value.trim() && (income === null || !isFinite(income))) bad.push('Income this month');
    if (bad.length) { UI.say('ci-say', 'Not read as an amount: ' + bad.join(', ') + '. Nothing was saved.', 'bad'); return; }
    var ticks = Array.prototype.filter.call(document.querySelectorAll('[data-hw-tick]'), function (x) { return x.checked; }).map(function (x) { return x.getAttribute('data-hw-tick'); });
    if (!Object.keys(balances).length && income === null && feeling === null && !el('ci-text').value.trim() && !ticks.length) { UI.say('ci-say', 'Nothing to save yet.', 'bad'); return; }
    try {
      Coach.addCheckin(ID, { date: el('ci-date').value || null, balances: balances, incomeCents: income, feeling: feeling, text: el('ci-text').value, homeworkTicked: ticks, enteredBy: el('ci-by').value });
      buildCheckin(); paint();
      UI.say('ci-say', 'Saved. Thank you.', 'good');
    } catch (err) { UI.say('ci-say', 'Not saved: ' + err.message, 'bad'); }
  });

  /* The coach's console in another window writes; the map follows at once. */
  Coach.onChange(function (key) { if (T && (!key || key.indexOf('coach.client.' + ID + '.') === 0)) paint(); });
  var resized = null;
  window.addEventListener('resize', function () { clearTimeout(resized); resized = setTimeout(function () { if (T) paint(); }, 200); });

  Tables.load().then(function (tables) {
    T = tables;
    Fields.use(T.coachFields);
    document.title = presenter ? 'Your plan' : 'Client view: ' + client.name;
    paint();
    if (!snapId) { el('checkin').hidden = false; buildCheckin(); }
  });
})();
