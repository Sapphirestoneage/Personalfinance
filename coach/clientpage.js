/* coach/clientpage.js, the Client View page (CD-007, CD-008, CD-010, CD-011). See client.html. */
(function () {
  'use strict';
  var SLAF = window.SLAF;
  var UI = SLAF.CoachUI, el = UI.el, esc = UI.esc;
  var Money = SLAF.Money, Schema = SLAF.Schema, Coach = SLAF.Coach, ClientView = SLAF.ClientView, Fields = SLAF.Fields, Tables = SLAF.Tables, Session = SLAF.Session;

  var client = UI.clientOr(UI.param('client'));
  if (!client && UI.param('client') === Coach.DEMO_ID) client = Coach.ensureDemo(SLAF.DemoPersona);   /* the example client is always there */
  if (!client) { el('main').innerHTML = '<section class="slaf-card coach-off"><h1>Nothing to show</h1><p class="slaf-lede">Open a client view from Coach Home.</p></section>'; return; }
  var ID = client.id;
  var presenter = UI.param('presenter') === '1';
  var snapId = UI.param('snap');
  var T = null, feeling = null;
  var FEEL = { 1: 'awful', 2: 'worried', 3: 'so-so', 4: 'okay', 5: 'great' };

  el('head').innerHTML = UI.header({ presenter: presenter, screen: presenter ? '' : 'Client view', title: client.name, sub: presenter ? '' : 'What the client sees. Nothing private is on this page.',
    actions: presenter ? '' : '<a class="slaf-btn slaf-btn--quiet" href="session.html?client=' + encodeURIComponent(ID) + '">Back to the session</a><a class="slaf-btn slaf-btn--quiet" href="index.html">Clients</a>' });

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
    var c = Coach.client(ID) || client, rec = Coach.record(ID);
    var since = snapId ? { h: null, date: null } : sinceOf();
    var snap = snapId ? Coach.snapshots(ID).filter(function (x) { return x.id === snapId; })[0] : null;
    var pics = Session.pictures(h, T, { asOf: Schema.localDay(), snapshots: snapId ? [] : Coach.snapshots(ID), checkins: rec.checkins });
    /* a client's meters wear the client's words */
    ['keep', 'debtShare', 'homeShare', 'taxNext', 'reach'].forEach(function (k) { delete pics[k]; });
    el('view').innerHTML = ClientView.render(h, T, {
      record: rec, readings: Fields.readings, pictures: pics,
      name: c.name, asOf: Schema.localDay(), mapWidth: Math.max(320, el('view').clientWidth - 40), since: since.h, sinceDate: since.date,
      nextSessionAt: c.nextSessionAt, readOnly: !!snapId, snapLabel: snap ? UI.day(snap.at) : null
    });
    Array.prototype.forEach.call(el('view').querySelectorAll('[data-chart]'), function (host) {
      var id = host.getAttribute('data-chart');
      if (pics[id]) UI.chart(host, 'client-' + id, pics[id], id === 'fiBand' ? { hideTitle: true } : {});
    });
  }

  /* The check-in: built on open and after a save only. */
  function buildCheckin() {
    var h = Coach.household(ID), lines = [];
    (h.assets || []).forEach(function (a) { lines.push({ key: 'assetValue:' + a.id, label: a.label || 'An account' }); });
    if (!(h.assets || []).length) { lines.push({ key: 'cashSavings', label: 'Cash in the bank' }); lines.push({ key: 'investments', label: 'Invested' }); }
    (h.debts || []).forEach(function (d) { lines.push({ key: 'debtBalance:' + d.id, label: (d.label || 'A debt') + ', still owed' }); });
    el('ci-balances').innerHTML = '<p class="slaf-label">Balances that moved</p><div class="row">' + lines.map(function (l, i) { return '<label class="inline">' + esc(l.label) + '<span class="affix"><span>$</span><input type="text" inputmode="decimal" data-bal="' + esc(l.key) + '" id="ci-bal-' + i + '" style="border:0;background:transparent"/></span></label>'; }).join('') + '</div>';
    el('ci-feel').innerHTML = '<span class="end">awful</span>' + [1, 2, 3, 4, 5].map(function (n) { return '<button type="button" class="slaf-btn slaf-btn--small" data-feel="' + n + '" aria-pressed="false" aria-label="' + n + ', ' + FEEL[n] + '">' + n + '</button>'; }).join('') + '<span class="end">great</span>';
    var open = Coach.record(ID).homework.filter(function (x) { return !x.doneAt; });
    el('ci-homework').innerHTML = open.length ? '<p class="slaf-label">Homework done</p>' + open.map(function (x) {
      return '<label class="slaf-switch" style="min-height:36px;display:flex"><input type="checkbox" data-hw-tick="' + esc(x.id) + '"/> ' + esc(x.text) + '</label>';
    }).join('') : '';
    el('ci-date').value = Schema.localDay(); el('ci-income').value = ''; el('ci-text').value = '';
    el('ci-by-wrap').hidden = presenter;             /* the client is filling it in */
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
    if (el('ci-income').value.trim() && (income === null || !isFinite(income))) bad.push('Money in this month');
    if (bad.length) { UI.say('ci-say', 'Not read as an amount: ' + bad.join(', ') + '. Nothing was saved.', 'bad'); return; }
    var ticks = Array.prototype.filter.call(document.querySelectorAll('[data-hw-tick]'), function (x) { return x.checked; }).map(function (x) { return x.getAttribute('data-hw-tick'); });
    if (!Object.keys(balances).length && income === null && feeling === null && !el('ci-text').value.trim() && !ticks.length) { UI.say('ci-say', 'Nothing to save yet.', 'bad'); return; }
    try {
      Coach.addCheckin(ID, { date: el('ci-date').value || null, balances: balances, incomeCents: income, feeling: feeling, text: el('ci-text').value, homeworkTicked: ticks, enteredBy: presenter ? 'client' : el('ci-by').value });
      buildCheckin(); paint();
      UI.say('ci-say', 'Saved. Thank you.', 'good');
    } catch (err) { UI.say('ci-say', 'Not saved: ' + err.message, 'bad'); }
  });

  /* The coach's console in another window writes; the pictures follow at once. */
  Coach.onChange(function (key) { if (T && (!key || key.indexOf('coach.client.' + ID + '.') === 0)) paint(); });
  var resized = null;
  window.addEventListener('resize', function () { clearTimeout(resized); resized = setTimeout(function () { if (T) paint(); }, 200); });

  Tables.load().then(function (tables) {
    T = tables;
    Fields.use(T.coachFields);
    document.title = presenter ? 'Your plan' : 'Client view: ' + client.name;
    el('words-body').innerHTML = UI.words(T);
    paint();
    if (!snapId) { el('checkin').hidden = false; buildCheckin(); }
  });
})();
