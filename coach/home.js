/* coach/home.js, Coach Home (CD-006). See the comment in index.html. */
(function () {
  'use strict';
  var SLAF = window.SLAF;
  var UI = SLAF.CoachUI, el = UI.el, esc = UI.esc;
  var Coach = SLAF.Coach, Session = SLAF.Session, Fields = SLAF.Fields, Tables = SLAF.Tables;
  var T = null;
  var importing = null;              /* { text, headers } of the file read for import */

  function summary(c) {
    var h = Coach.household(c.id), rec = Coach.record(c.id);
    var stops = Session.path(T.sessionPaths, c.pathId, c);
    var st = Session.stage(stops, h, T, { notes: rec.notes, homework: rec.homework, decisions: rec.decisions });
    var sessions = rec.sessions.slice().sort(function (a, b) { return String(a.startedAt).localeCompare(String(b.startedAt)); });
    var last = sessions.length ? sessions[sessions.length - 1] : null, first = sessions[0] || null;
    var bandFirst = null;
    if (first && first.startSnapshotId) { var fh = Coach.snapshotHousehold(c.id, first.startSnapshotId); if (fh) bandFirst = Session.fiBand(fh, T); }
    return { stage: st, sessions: sessions, last: last, bandNow: Session.fiBand(h, T), bandFirst: bandFirst, rough: Session.roughCount(h), checkin: Session.checkinStatus(rec.checkins) };
  }
  function bandShort(b) { return !b ? 'no session yet' : b.hasDate ? 'likely ' + Session.monthsText(b.likely) : b.text; }
  function row(c) {
    var s = summary(c);
    var stageText = s.stage.stop ? (s.stage.index + 1) + ' of ' + s.stage.of + ': ' + s.stage.stop.title : 'every stop done';
    var link = function (page) { return page + '?client=' + encodeURIComponent(c.id); };
    return '<tr data-client="' + esc(c.id) + '">'
      + '<td class="name"><b>' + esc(c.name) + '</b>' + (c.demo ? '<span class="demo-tag">example numbers</span>' : '') + (c.archived ? ' <span class="coach-note">(archived)</span>' : '') + '</td>'
      + '<td data-label="Where">' + esc(stageText) + '</td>'
      + '<td data-label="Sessions">' + (s.last ? 'Last ' + esc(UI.day(s.last.startedAt)) + ' (' + s.sessions.length + ')' : 'None yet')
      + '<br/><label class="inline">Next<input type="date" data-next="' + esc(c.id) + '" value="' + esc(c.nextSessionAt || '') + '"/></label></td>'
      + '<td data-label="Rough or stale">' + esc(String(s.rough)) + '</td>'
      + '<td data-label="Check-in"><span class="status ' + esc(s.checkin) + '">' + esc({ in: 'In', late: 'Late', missing: 'Missing' }[s.checkin]) + '</span></td>'
      + '<td data-label="FI date">' + esc(bandShort(s.bandNow)) + (s.bandFirst ? '<br/><span class="coach-note">first session: ' + esc(bandShort(s.bandFirst)) + '</span>' : '') + '</td>'
      + '<td><div class="coach-actions">'
      + '<a class="slaf-btn slaf-btn--small slaf-btn--primary" href="' + esc(link('session.html')) + '">Open session</a>'
      + '<a class="slaf-btn slaf-btn--small" href="' + esc(link('client.html')) + '">Client view</a>'
      + '<button type="button" class="slaf-btn slaf-btn--small slaf-btn--quiet" data-history="' + esc(c.id) + '">History</button>'
      + '<button type="button" class="slaf-btn slaf-btn--small slaf-btn--quiet" data-backup="' + esc(c.id) + '">Back up</button>'
      + (c.demo ? '' : '<button type="button" class="slaf-btn slaf-btn--small slaf-btn--quiet" data-archive="' + esc(c.id) + '">' + (c.archived ? 'Unarchive' : 'Archive') + '</button>')
      + (c.archived ? '<button type="button" class="slaf-btn slaf-btn--small slaf-btn--quiet" data-delete="' + esc(c.id) + '">Delete</button>' : '')
      + '</div></td></tr>';
  }
  function paint() {
    var list = Coach.clients().concat(el('show-archived').checked ? Coach.clients({ archived: true }) : []);
    el('roster-body').innerHTML = list.map(row).join('') || '<tr><td colspan="7">No clients yet.</td></tr>';
    var keep = el('imp-client').value;
    var opts = Coach.clients().filter(function (c) { return !c.demo; });
    el('imp-client').innerHTML = opts.map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>'; }).join('') || '<option value="">Add a client first</option>';
    if (keep) el('imp-client').value = keep;
    var tkeep = el('imp-template').value, ts = Coach.templates();
    el('imp-template').innerHTML = '<option value="">None</option>' + Object.keys(ts).sort().map(function (n) { return '<option>' + esc(n) + '</option>'; }).join('');
    el('imp-template').value = tkeep && ts[tkeep] ? tkeep : '';
  }

  /* History: every session, its recap, the plan as of that day read-only. */
  function showHistory(id) {
    var c = Coach.client(id); if (!c) return;
    var s = summary(c);
    el('history-card').hidden = false;
    el('history-title').textContent = 'Sessions with ' + c.name;
    el('history').innerHTML = s.sessions.slice().reverse().map(function (x) {
      var covered = (x.stopsCovered || []).map(function (sid) { var st = T.sessionPaths.stops[sid]; return st ? st.title : sid; }).join(', ');
      var snap = x.endSnapshotId || x.startSnapshotId;
      return '<li><b>' + esc(UI.day(x.startedAt)) + '</b> ' + (x.endedAt ? esc(UI.duration(x.durationMs)) : '(still open)') + (covered ? ', ' + esc(covered) : '')
        + (snap ? ' <a href="client.html?client=' + encodeURIComponent(id) + '&amp;snap=' + encodeURIComponent(snap) + '">The plan as of that day (read-only)</a>' : '')
        + (x.recapText ? '<details><summary>Recap</summary><pre style="white-space:pre-wrap">' + esc(x.recapText) + '</pre></details>' : '') + '</li>';
    }).join('') || '<li>No sessions yet.</li>';
    el('history-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function backup(obj, kind) {
    var p = el('pass').value, st = SLAF.Vault.strength(p);
    if (!st.ok) { UI.say('backup-say', st.why, 'bad'); el('pass').focus(); return; }
    UI.say('backup-say', 'Sealing...');
    Coach.seal(obj, p).then(function (text) { UI.download(Coach.filename(kind), text); UI.say('backup-say', 'Saved a sealed file. It opens only with that passphrase.', 'good'); },
      function (e) { UI.say('backup-say', e.message, 'bad'); });
  }

  /* The sheet import */
  function targetOptions(chosen) {
    return '<option value="">Keep as a note</option>' + Coach.sheetTargets(T).map(function (t) { return '<option value="' + esc(t.id) + '"' + (t.id === chosen ? ' selected' : '') + '>' + esc(t.label) + '</option>'; }).join('');
  }
  function paintMapping() {
    var tpl = Coach.templates()[el('imp-template').value];
    var guess = tpl ? tpl.columns : Coach.suggest(importing.headers, T);
    el('imp-table').innerHTML = '<tr><td><b>Column</b></td><td><b>Goes to</b></td></tr>' + importing.headers.map(function (hd, i) {
      return '<tr><td>' + esc(hd) + '</td><td><select data-col="' + i + '" aria-label="Where ' + esc(hd) + ' goes">' + targetOptions(guess[hd] || null) + '</select></td></tr>';
    }).join('');
    el('imp-map').hidden = false;
    if (tpl) el('imp-name').value = el('imp-template').value;
  }
  function columnsNow() {
    var out = {};
    Array.prototype.forEach.call(document.querySelectorAll('#imp-table select[data-col]'), function (s) { out[importing.headers[+s.getAttribute('data-col')]] = s.value || null; });
    return out;
  }

  document.addEventListener('click', function (e) {
    var t = e.target, b;
    if ((b = t.closest('[data-history]'))) { showHistory(b.getAttribute('data-history')); return; }
    if ((b = t.closest('[data-backup]'))) { backup(Coach.clientFile(b.getAttribute('data-backup')), 'client'); return; }
    if ((b = t.closest('[data-archive]'))) { var c = Coach.client(b.getAttribute('data-archive')); Coach.archive(c.id, !c.archived); paint(); return; }
    if ((b = t.closest('[data-delete]'))) {
      var d = Coach.client(b.getAttribute('data-delete'));
      if (d && window.confirm('Delete ' + d.name + ' and every number of theirs from this browser? Save a sealed backup first if you might want it back.')) { Coach.removeClient(d.id); paint(); UI.say('roster-say', d.name + ' was deleted from this browser.', 'good'); }
      return;
    }
    if (t.id === 'btn-new') {
      try { var nc = Coach.addClient({ name: el('new-name').value, pathId: el('new-path').value }); el('new-name').value = ''; paint(); UI.say('new-say', nc.name + ' was added. Open session starts on the path.', 'good'); }
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
        UI.say('backup-say', ok + (ok === 1 ? ' client' : ' clients') + ' restored.' + (no.length ? ' ' + no.join(' ') : ''), no.length ? 'bad' : 'good');
      }, function (err) { UI.say('backup-say', err.message, 'bad'); });
      return;
    }
    if (t.id === 'btn-imp-read') {
      UI.readFile(el('imp-file')).then(function (text) {
        var parsed = SLAF.Csv.parse(text);
        if (!parsed.headers || !parsed.headers.length) throw new Error('That file has no header row.');
        importing = { text: text, headers: parsed.headers };
        paintMapping();
        UI.say('imp-say', parsed.headers.length + ' columns, ' + parsed.rows.length + ' lines. Check where each goes.', null);
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
        UI.say('imp-say', out.written + ' numbers written to ' + Coach.client(id).name + '; ' + out.notes + ' kept as notes.' + (plan.bad.length ? ' Not read as numbers: ' + plan.bad.join(', ') + '.' : ''), 'good');
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
