/* coach/home.js, Coach Home (CD-006, CD-011). See the comment in index.html. */
(function () {
  'use strict';
  var SLAF = window.SLAF;
  var UI = SLAF.CoachUI, el = UI.el, esc = UI.esc;
  var Coach = SLAF.Coach, Session = SLAF.Session, Fields = SLAF.Fields, Tables = SLAF.Tables, Charts = SLAF.Charts;
  var T = null;
  var importing = null;              /* { text, headers, samples } of the file read for import */

  el('head').innerHTML = UI.header({ screen: 'Coach Home', title: 'Clients', sub: 'One card a client. Open a session to work; open their view to show them.',
    actions: '<a class="slaf-btn slaf-btn--primary" href="#new-client">Add a client</a><a class="slaf-btn slaf-btn--quiet" href="#restore">Keep a safe copy</a>' });

  function summary(c) {
    var h = Coach.household(c.id), rec = Coach.record(c.id);
    var stops = Session.path(T.sessionPaths, c.pathId, c);
    var st = Session.stage(stops, h, T, { notes: rec.notes, homework: rec.homework, decisions: rec.decisions });
    var sessions = rec.sessions.slice().sort(function (a, b) { return String(a.startedAt).localeCompare(String(b.startedAt)); });
    var last = sessions.length ? sessions[sessions.length - 1] : null, first = sessions[0] || null;
    var bandFirst = null;
    if (first && first.startSnapshotId) { var fh = Coach.snapshotHousehold(c.id, first.startSnapshotId); if (fh) bandFirst = Session.fiBand(fh, T); }
    var hist = Session.history(Coach.snapshots(c.id), rec.checkins, h, T);
    return { h: h, stage: st, stops: stops, sessions: sessions, last: last, bandNow: Session.fiBand(h, T), bandFirst: bandFirst, rough: Session.roughCount(h), checkin: Session.checkinStatus(rec.checkins), netWorth: hist.netWorth, nw: Session.netWorth(h) };
  }
  function bandShort(b) { return !b ? 'no session yet' : b.hasDate ? 'likely ' + Session.monthsText(b.likely) : b.text; }
  function card(c) {
    var s = summary(c);
    var link = function (page) { return page + '?client=' + encodeURIComponent(c.id); };
    var stageText = s.stage.stop ? 'Stop ' + (s.stage.index + 1) + ' of ' + s.stage.of + ': ' + s.stage.stop.title : 'Every stop done';
    var checkWord = { in: 'In', late: 'Late', missing: 'Missing' }[s.checkin];
    return '<article class="slaf-card client-card" data-client="' + esc(c.id) + '" aria-label="' + esc(c.name) + '">'
      + '<div class="name"><b>' + esc(c.name) + '</b>' + (c.demo ? '<span class="demo-tag">example numbers</span>' : '') + (c.archived ? '<span class="coach-note">(archived)</span>' : '') + '</div>'
      + '<div class="spark" data-spark="' + esc(c.id) + '">' + (s.netWorth ? '' : '<p class="coach-note">The progress picture appears after the first session.</p>') + '</div>'
      + '<dl class="facts">'
      + '<div><dt>Next stop</dt><dd>' + esc(stageText) + '</dd></div>'
      + '<div><dt>Work-optional date</dt><dd>' + esc(bandShort(s.bandNow)) + (s.bandFirst && s.bandFirst.text !== s.bandNow.text ? '<br/><span class="coach-note">at the first session: ' + esc(bandShort(s.bandFirst)) + '</span>' : '') + '</dd></div>'
      + '<div><dt>Sessions</dt><dd>' + (s.last ? esc(UI.day(s.last.startedAt)) + ' was the last (' + s.sessions.length + ')' : 'None yet') + '</dd></div>'
      + '<div><dt>Monthly check-in</dt><dd><span class="status ' + esc(s.checkin) + '">' + esc(checkWord) + '</span></dd></div>'
      + '<div><dt>Numbers to check</dt><dd>' + esc(String(s.rough)) + ' <span class="coach-note">rough or old</span></dd></div>'
      + '<div><dt>Next session</dt><dd><input type="date" data-next="' + esc(c.id) + '" value="' + esc(c.nextSessionAt || '') + '" aria-label="Next session with ' + esc(c.name) + '"/></dd></div>'
      + '</dl>'
      + '<div class="coach-actions">'
      + '<a class="slaf-btn slaf-btn--primary" href="' + esc(link('session.html')) + '">Open session</a>'
      + '<a class="slaf-btn" href="' + esc(link('client.html')) + '">Client view</a>'
      + '<div class="more"><button type="button" class="slaf-btn slaf-btn--quiet" data-more="' + esc(c.id) + '" aria-haspopup="true" aria-expanded="false">More</button>'
      + '<div class="more-menu" hidden><button type="button" data-history="' + esc(c.id) + '">Past sessions</button><button type="button" data-backup="' + esc(c.id) + '">Save a locked copy</button>'
      + (c.demo ? '' : '<button type="button" data-archive="' + esc(c.id) + '">' + (c.archived ? 'Unarchive' : 'Archive') + '</button>')
      + (c.archived ? '<button type="button" data-delete="' + esc(c.id) + '">Delete from this browser</button>' : '') + '</div></div>'
      + '</div><div class="history-host" hidden></div></article>';
  }
  function paint() {
    var list = Coach.clients().concat(el('show-archived').checked ? Coach.clients({ archived: true }) : []);
    el('cards').innerHTML = list.map(card).join('') || '<p class="coach-note">No clients yet.</p>';
    list.forEach(function (c) {
      var host = el('cards').querySelector('[data-spark="' + c.id + '"]');
      var s = Session.history(Coach.snapshots(c.id), Coach.record(c.id).checkins, Coach.household(c.id), T);
      if (host && s.netWorth) UI.chart(host, 'home-' + c.id, Object.assign({}, s.netWorth, { title: 'What they own minus what they owe, over the sessions' }), { bare: true, type: 'area', height: 120, pad: 4 });
    });
    var real = Coach.clients().filter(function (c) { return !c.demo; }).length;
    el('welcome').hidden = !!(Coach.prefs().welcomeSeen || real > 0);
    var keep = el('imp-client').value;
    var opts = Coach.clients().filter(function (c) { return !c.demo; });
    el('imp-client').innerHTML = opts.map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>'; }).join('') || '<option value="">Add a client first</option>';
    if (keep) el('imp-client').value = keep;
    var tkeep = el('imp-template').value, ts = Coach.templates();
    el('imp-template').innerHTML = '<option value="">None</option>' + Object.keys(ts).sort().map(function (n) { return '<option>' + esc(n) + '</option>'; }).join('');
    el('imp-template').value = tkeep && ts[tkeep] ? tkeep : '';
  }

  /* Past sessions: each with its recap and the plan as of that day. */
  function showHistory(id) {
    var c = Coach.client(id); if (!c) return;
    var host = el('cards').querySelector('[data-client="' + id + '"] .history-host'); if (!host) return;
    if (!host.hidden) { host.hidden = true; return; }
    var s = summary(c);
    host.innerHTML = '<h3>Past sessions</h3><ul class="history">' + (s.sessions.slice().reverse().map(function (x) {
      var covered = (x.stopsCovered || []).map(function (sid) { var st = T.sessionPaths.stops[sid]; return st ? st.title : sid; }).join(', ');
      var snap = x.endSnapshotId || x.startSnapshotId;
      return '<li><b>' + esc(UI.day(x.startedAt)) + '</b> ' + (x.endedAt ? esc(UI.duration(x.durationMs)) : '(still open)') + (covered ? ', ' + esc(covered) : '')
        + (snap ? ' <a href="client.html?client=' + encodeURIComponent(id) + '&amp;snap=' + encodeURIComponent(snap) + '">The plan as of that day</a>' : '')
        + (x.recapText ? '<details><summary>Recap</summary><pre style="white-space:pre-wrap;font:inherit">' + esc(x.recapText) + '</pre></details>' : '') + '</li>';
    }).join('') || '<li>No sessions yet.</li>') + '</ul>';
    host.hidden = false;
  }

  function backup(obj, kind) {
    var p = el('pass').value, st = SLAF.Vault.strength(p);
    if (!st.ok) { el('restore').open = true; UI.say('backup-say', 'First choose a password of 8 characters or more, in the "Keep a safe copy" box.', 'bad'); el('pass').focus(); return; }
    UI.say('backup-say', 'Locking the file...');
    Coach.seal(obj, p).then(function (text) { UI.download(Coach.filename(kind), text); UI.say('backup-say', 'Saved. The file opens only with that password.', 'good'); },
      function (e) { UI.say('backup-say', e.message, 'bad'); });
  }

  /* The sheet import: a sample cell beside each column, so the choice is easy. */
  function targetOptions(chosen) {
    return '<option value="">Keep as a note</option>' + Coach.sheetTargets(T).map(function (t) { return '<option value="' + esc(t.id) + '"' + (t.id === chosen ? ' selected' : '') + '>' + esc(t.label) + '</option>'; }).join('');
  }
  function paintMapping() {
    var tpl = Coach.templates()[el('imp-template').value];
    var guess = tpl ? tpl.columns : Coach.suggest(importing.headers, T);
    el('imp-table').innerHTML = '<tr><td><b>Column</b></td><td class="sample"><b>Last value</b></td><td><b>Goes to</b></td></tr>' + importing.headers.map(function (hd, i) {
      return '<tr><td>' + esc(hd) + '</td><td class="sample">' + esc(importing.samples[i] || '') + '</td><td><select data-col="' + i + '" aria-label="Where ' + esc(hd) + ' goes">' + targetOptions(guess[hd] || null) + '</select></td></tr>';
    }).join('');
    el('imp-map').hidden = false;
    if (tpl) el('imp-name').value = el('imp-template').value;
  }
  function columnsNow() {
    var out = {};
    Array.prototype.forEach.call(document.querySelectorAll('#imp-table select[data-col]'), function (s) { out[importing.headers[+s.getAttribute('data-col')]] = s.value || null; });
    return out;
  }
  function closeMenus(except) {
    Array.prototype.forEach.call(document.querySelectorAll('.more-menu'), function (m) { if (m !== except) { m.hidden = true; var b = m.parentElement.querySelector('[data-more]'); if (b) b.setAttribute('aria-expanded', 'false'); } });
  }

  document.addEventListener('click', function (e) {
    var t = e.target, b;
    if ((b = t.closest('[data-more]'))) { var menu = b.parentElement.querySelector('.more-menu'); closeMenus(menu); menu.hidden = !menu.hidden; b.setAttribute('aria-expanded', String(!menu.hidden)); return; }
    if (!t.closest('.more')) closeMenus(null);
    if ((b = t.closest('[data-history]'))) { showHistory(b.getAttribute('data-history')); return; }
    if ((b = t.closest('[data-backup]'))) { backup(Coach.clientFile(b.getAttribute('data-backup')), 'client'); return; }
    if ((b = t.closest('[data-archive]'))) { var c = Coach.client(b.getAttribute('data-archive')); Coach.archive(c.id, !c.archived); paint(); return; }
    if ((b = t.closest('[data-delete]'))) {
      var d = Coach.client(b.getAttribute('data-delete'));
      if (d && window.confirm('Delete ' + d.name + ' and every number of theirs from this browser? Save a locked copy first if you might want it back.')) { Coach.removeClient(d.id); paint(); UI.say('roster-say', d.name + ' was deleted from this browser.', 'good'); }
      return;
    }
    if (t.id === 'btn-welcome-done') { Coach.setPref('welcomeSeen', true); el('welcome').hidden = true; return; }
    if (t.id === 'btn-new') {
      try { var nc = Coach.addClient({ name: el('new-name').value, pathId: el('new-path').value }); el('new-name').value = ''; paint(); UI.say('new-say', nc.name + ' was added. Open session starts them on the path.', 'good'); }
      catch (err) { UI.say('new-say', err.message, 'bad'); }
      return;
    }
    if (t.id === 'btn-backup-all') { backup(Coach.allFile(), 'all'); return; }
    if (t.id === 'btn-restore') {
      var p = el('pass').value;
      UI.readFile(el('restore-file')).then(function (text) { return Coach.openFile(text, p); }).then(function (file) {
        var res = Coach.restore(file, { replace: el('restore-replace').checked });
        var ok = res.filter(function (r) { return r.ok; }).length, no = res.filter(function (r) { return !r.ok; }).map(function (r) { return r.reason; });
        paint();
        UI.say('backup-say', ok + (ok === 1 ? ' client' : ' clients') + ' loaded.' + (no.length ? ' ' + no.join(' ') : ''), no.length ? 'bad' : 'good');
      }, function (err) { UI.say('backup-say', err.message, 'bad'); });
      return;
    }
    if (t.id === 'btn-imp-read') {
      UI.readFile(el('imp-file')).then(function (text) {
        var parsed = SLAF.Csv.parse(text);
        if (!parsed.headers || !parsed.headers.length) throw new Error('That file has no header row.');
        var samples = parsed.headers.map(function (hd, i) { for (var r = parsed.rows.length - 1; r >= 0; r--) { var v = parsed.rows[r][i]; if (v !== undefined && String(v).trim() !== '') return String(v).trim(); } return ''; });
        importing = { text: text, headers: parsed.headers, samples: samples };
        paintMapping();
        UI.say('imp-say', parsed.headers.length + ' columns, ' + parsed.rows.length + ' lines. Check where each column goes, then bring the numbers in.', null);
      }).catch(function (err) { UI.say('imp-say', err.message, 'bad'); });
      return;
    }
    if (t.id === 'btn-imp-go') {
      var id = el('imp-client').value;
      if (!importing || !id) { UI.say('imp-say', 'Choose a client and read a file first.', 'bad'); return; }
      var cols = columnsNow();
      var plan = Coach.sheetPlan(importing.text, cols, T, SLAF.Csv, SLAF.QuickEntry);
      var name = el('imp-name').value.trim();
      if (name) Coach.saveTemplate(name, cols);
      try {
        var out = Coach.applySheet(id, plan, T, SLAF.QuickEntry);
        UI.say('imp-say', out.written + ' numbers went to ' + Coach.client(id).name + ', marked as guesses to check; ' + out.notes + ' kept as notes.' + (plan.bad.length ? ' Not read as numbers: ' + plan.bad.join(', ') + '.' : ''), 'good');
      } catch (err) { UI.say('imp-say', err.message, 'bad'); }
      paint();
      return;
    }
  });
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.matches('input[data-next]')) { Coach.updateClient(t.getAttribute('data-next'), { nextSessionAt: t.value || null }); return; }
    if (t.id === 'show-archived') { paint(); return; }
    if (t.id === 'imp-template' && importing) { paintMapping(); return; }
  });

  Tables.load().then(function (tables) {
    T = tables;
    Fields.use(T.coachFields);
    el('new-path').innerHTML = (T.sessionPaths.paths || []).map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.label) + '</option>'; }).join('');
    Coach.ensureDemo(SLAF.DemoPersona);
    paint();
  });
})();
