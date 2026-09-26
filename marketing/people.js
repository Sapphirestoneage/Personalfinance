/* marketing/people.js, the People screen (MD-008). See people.html. */
(function () {
  'use strict';
  var UI = SLAF.MktUI, M = SLAF.Mkt, K = SLAF.KPI, el = UI.el, esc = UI.esc;
  var T = null, TODAY = UI.today(), openId = null, editId = null, sortBy = 'due', sortDir = 1;
  var PLATFORMS = [{ id: '', label: 'none' }, { id: 'instagram', label: 'Instagram' }, { id: 'linkedin', label: 'LinkedIn' }, { id: 'tiktok', label: 'TikTok' }, { id: 'youtube', label: 'YouTube' }, { id: 'x', label: 'X' }, { id: 'facebook', label: 'Facebook' }, { id: 'email', label: 'Email' }, { id: 'phone', label: 'Phone' }, { id: 'in_person', label: 'In person' }];

  function stages() { return T.tables.stages; }
  function cadences() { return M.settings().cadences; }
  function dueOf(p) { return K.nextTouch(p, M.touches(p.id), stages(), cadences(), TODAY); }
  function param(name) { var m = new RegExp('[?&]' + name + '=([^&#]*)').exec(location.search || ''); return m ? decodeURIComponent(m[1]) : null; }

  /* ---- The pipeline ------------------------------------------------------------ */
  function drawPipe() {
    var c = K.pipeline(M.people());
    el('pipe').innerHTML = stages().map(function (s) { return '<button type="button" class="lane" data-stage="' + esc(s.id) + '" style="cursor:pointer;text-align:left"><div class="n">' + (c[s.id] || 0) + '</div><div class="l">' + esc(s.label) + '</div></button>'; }).join('');
  }

  /* ---- The list ------------------------------------------------------------------ */
  var COLS = [
    { id: 'name', label: 'Name', get: function (p) { return p.name.toLowerCase(); } },
    { id: 'company', label: 'Company', get: function (p) { return (p.company || '').toLowerCase(); } },
    { id: 'stage', label: 'Stage', get: function (p) { return K.STAGE_ORDER[p.stage]; } },
    { id: 'source', label: 'Lane', get: function (p) { return p.source; } },
    { id: 'last', label: 'Last touch', get: function (p) { var d = dueOf(p); return d.last ? d.last.date : ''; } },
    { id: 'due', label: 'Next touch', get: function (p) { var d = dueOf(p); return { overdue: 0, today: 1, soon: 2, later: 3, never: 4 }[d.status] * 100000 - (d.daysOver || 0); } }
  ];
  var stageFilter = null;
  function visible() {
    var f = el('filter').value, q = el('search').value.trim().toLowerCase();
    var list = M.people({ archived: f === 'archived' }).filter(function (p) {
      if (f === 'archived') return p.archived;
      if (p.archived) return false;
      if (stageFilter && p.stage !== stageFilter) return false;
      if (f === 'due') { var s = dueOf(p).status; if (s !== 'overdue' && s !== 'today') return false; }
      if (f === 'lead' && p.stage !== 'lead' && p.stage !== 'call') return false;
      if (f === 'client' && p.stage !== 'client' && p.stage !== 'advocate') return false;
      return !q || (p.name + ' ' + p.company + ' ' + p.tags.join(' ') + ' ' + p.notes + ' ' + p.email).toLowerCase().indexOf(q) !== -1;
    });
    var col = COLS.filter(function (c) { return c.id === sortBy; })[0];
    list.sort(function (a, b) { var x = col.get(a), y = col.get(b); return (x < y ? -1 : x > y ? 1 : 0) * sortDir; });
    return list;
  }
  function duePill(d) {
    if (d.status === 'never') return '<span class="pill">no rhythm</span>';
    var text = d.status === 'overdue' ? d.daysOver + (d.daysOver === 1 ? ' day over' : ' days over') : d.status === 'today' ? 'today' : UI.day(d.when);
    return '<span class="pill ' + d.status + '">' + esc(text) + '</span>';
  }
  function drawList() {
    var list = visible();
    el('count').textContent = M.people().length + ' people' + (stageFilter ? ', showing ' + UI.label(stages(), stageFilter).toLowerCase() : '');
    el('tbl').innerHTML = '<thead><tr>' + COLS.map(function (c) { return '<th><button type="button" data-sort="' + c.id + '" aria-sort="' + (sortBy === c.id ? (sortDir < 0 ? 'descending' : 'ascending') : 'none') + '">' + esc(c.label) + '</button></th>'; }).join('') + '</tr></thead><tbody>'
      + (list.length ? list.map(function (p) {
        var d = dueOf(p);
        return '<tr data-person="' + esc(p.id) + '" class="' + (p.id === openId ? 'is-open' : '') + '" style="cursor:pointer"><td><b>' + esc(p.name) + '</b>' + (p.tags.length ? '<br><span class="faint">' + esc(p.tags.join(', ')) + '</span>' : '') + '</td><td>' + esc(p.company) + (p.role ? '<br><span class="faint">' + esc(p.role) + '</span>' : '') + '</td>'
          + '<td><span class="pill st-' + esc(p.stage) + '">' + esc(UI.label(stages(), p.stage)) + '</span></td><td>' + esc(UI.label(T.tables.sources, p.source)) + '</td><td>' + (d.last ? esc(UI.day(d.last.date)) + '<br><span class="faint">' + esc(UI.label(T.tables.kinds, d.last.kind)) + (d.last.direction === 'in' ? ', from them' : '') + '</span>' : '<span class="faint">never</span>') + '</td><td>' + duePill(d) + '</td></tr>';
      }).join('') : '<tr><td colspan="6" class="faint">' + (M.people().length ? 'Nobody matches.' : 'Nobody yet. Add a person, or import a CSV of your contacts.') + '</td></tr>') + '</tbody>';
  }

  /* ---- The open person ------------------------------------------------------------ */
  function drawPanel() {
    var p = openId && M.person(openId); if (!p) { el('panel').innerHTML = '<p class="mkt-note">Pick a person to see their touches, or add one.</p>'; return; }
    var d = dueOf(p), touches = M.touches(p.id).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    var from = p.fromPostId && M.post(p.fromPostId);
    el('panel').innerHTML = '<div class="bar"><h2 style="margin:0">' + esc(p.name) + '</h2><span class="grow"></span><button type="button" class="slaf-linkbtn" data-edit="' + esc(p.id) + '">Edit</button></div>'
      + '<p class="mkt-note">' + esc([p.company, p.role].filter(Boolean).join(', ')) + '</p>'
      + '<dl class="facts"><dt>Stage</dt><dd><select id="stage-now" aria-label="Stage">' + UI.options(stages(), p.stage) + '</select></dd><dt>Next touch</dt><dd>' + duePill(d) + '<br><span class="faint" style="font-size:var(--text-xs)">' + esc(d.why) + '</span></dd>'
      + (p.email ? '<dt>Email</dt><dd>' + esc(p.email) + '</dd>' : '') + (p.phone ? '<dt>Phone</dt><dd>' + esc(p.phone) + '</dd>' : '') + (p.handle ? '<dt>' + esc(UI.label(PLATFORMS, p.platform) || 'Handle') + '</dt><dd>' + esc(p.handle) + '</dd>' : '')
      + '<dt>How we met</dt><dd>' + esc(UI.label(T.tables.sources, p.source)) + (from ? ', the post "' + esc(from.hook || from.date) + '"' : '') + '</dd>' + (p.value !== null ? '<dt>Paid</dt><dd>' + UI.money(p.value) + '</dd>' : '') + '</dl>'
      + (d.status !== 'never' ? '<p class="help-panel" style="max-width:none"><b>How:</b> ' + esc(d.how) + '</p>' : '') + (p.notes ? '<p class="mkt-note">' + esc(p.notes) + '</p>' : '')
      + '<h3 style="margin-top:12px">Log a touch</h3><form id="touch-form" autocomplete="off"><div class="row">'
      + '<label class="inline"><span>Date</span><input type="date" name="date" value="' + TODAY + '"/></label><label class="inline"><span>Kind</span><select name="kind">' + UI.options(T.tables.kinds, d.last ? d.last.kind : 'dm') + '</select></label>'
      + '<label class="inline"><span>Lane ' + UI.help('field', 'lane', T) + '</span><select name="lane">' + UI.options(T.tables.lanes, p.source === 'cold' ? 'cold' : p.source === 'content' ? 'content' : p.source === 'referral' ? 'referral' : 'warm') + '</select></label>'
      + '<label class="inline"><span>Who started it</span><select name="direction"><option value="out">I did</option><option value="in">They did</option></select></label>'
      + '<label class="inline"><span>What happened ' + UI.help('field', 'outcome', T) + '</span><select name="outcome">' + UI.options(T.tables.outcomes, 'none') + '</select></label></div>'
      + '<div class="row"><label class="inline" style="flex:1 1 100%"><span>Note</span><input type="text" name="note" style="width:100%"/></label><button type="submit" class="slaf-btn slaf-btn--primary">Save touch</button></div><p class="mkt-say" id="say-touch"></p></form>'
      + '<h3>Touches <span class="mkt-note">(' + touches.length + ')</span></h3><ul class="touch-list">' + (touches.length ? touches.map(function (t) { return '<li><span>' + esc(UI.day(t.date)) + ' <b>' + esc(UI.label(T.tables.kinds, t.kind)) + '</b>' + (t.direction === 'in' ? ' <span class="in">from them</span>' : '') + (t.outcome !== 'none' ? ', ' + esc(UI.label(T.tables.outcomes, t.outcome).toLowerCase()) : '') + (t.note ? '<br><span class="faint">' + esc(t.note) + '</span>' : '') + '</span><button type="button" class="slaf-linkbtn rowbtn" data-remove-touch="' + esc(t.id) + '" aria-label="Remove this touch">remove</button></li>'; }).join('') : '<li class="faint">No touches yet.</li>') + '</ul>'
      + '<div class="mkt-actions" style="margin-top:12px"><button type="button" class="slaf-btn slaf-btn--quiet" data-archive="' + esc(p.id) + '">' + (p.archived ? 'Bring back' : 'Archive') + '</button><button type="button" class="slaf-btn slaf-btn--quiet" data-remove-person="' + esc(p.id) + '">Delete</button></div>';
    el('stage-now').addEventListener('change', function () { M.setStage(p.id, el('stage-now').value); drawAll(); });
    el('touch-form').addEventListener('submit', function (e) {
      e.preventDefault(); var f = e.target;
      var r = M.addTouch({ personId: p.id, date: f.elements.date.value, kind: f.elements.kind.value, lane: f.elements.lane.value, direction: f.elements.direction.value, outcome: f.elements.outcome.value, note: f.elements.note.value });
      if (!r.ok) { UI.say('say-touch', 'Check the ' + r.bad.join(', ') + '.', 'bad'); return; }
      var o = f.elements.outcome.value, move = o === 'booked' ? 'call' : o === 'sold' ? 'client' : o === 'declined' ? 'lost' : (o === 'replied' && K.STAGE_ORDER[p.stage] < 2 ? 'conversation' : null);
      if (move && move !== p.stage && confirm('Move ' + p.name + ' to "' + UI.label(stages(), move) + '"?')) M.setStage(p.id, move, f.elements.date.value);
      drawAll();
    });
  }

  /* ---- Add and edit ----------------------------------------------------------------- */
  function openDialog(p) {
    editId = p ? p.id : null;
    var f = el('person-form');
    el('dlg-title').textContent = p ? 'Edit ' + p.name : 'Add a person';
    el('f-platform').innerHTML = UI.options(PLATFORMS, p ? p.platform : '');
    el('f-stage').innerHTML = UI.options(stages(), p ? p.stage : 'follower');
    el('f-source').innerHTML = UI.options(T.tables.sources, p ? p.source : 'content');
    ['name', 'company', 'role', 'email', 'phone', 'handle', 'notes'].forEach(function (k) { f.elements[k].value = p ? p[k] : ''; });
    f.elements.tags.value = p ? p.tags.join(', ') : '';
    f.elements.cadence.value = p && p.cadence !== null ? p.cadence : '';
    f.elements.nextAt.value = p && p.nextAt ? p.nextAt : '';
    f.elements.value.value = p && p.value !== null ? (p.value / 100).toFixed(2).replace(/\.00$/, '') : '';
    var recent = M.posts().sort(function (a, b) { return a.date < b.date ? 1 : -1; }).slice(0, 60);
    el('f-from').innerHTML = '<option value="">none in particular</option>' + recent.map(function (x) { return '<option value="' + esc(x.id) + '"' + (p && p.fromPostId === x.id ? ' selected' : '') + '>' + esc(UI.day(x.date) + ', ' + UI.label(T.tables.channels, x.channel) + (x.hook ? ': ' + x.hook.slice(0, 48) : '')) + '</option>'; }).join('');
    UI.say('say-dlg', '');
    el('dlg').showModal(); f.elements.name.focus();
  }
  function savePerson(e) {
    e.preventDefault();
    var f = el('person-form'), fields = {};
    ['name', 'company', 'role', 'email', 'phone', 'platform', 'handle', 'stage', 'source', 'tags', 'notes', 'nextAt', 'value'].forEach(function (k) { fields[k] = f.elements[k].value; });
    fields.fromPostId = f.elements.fromPostId.value || null;
    fields.cadence = f.elements.cadence.value === '' ? null : f.elements.cadence.value;
    var r = editId ? M.updatePerson(editId, fields) : M.addPerson(fields);
    if (!r.ok) { UI.say('say-dlg', 'Check: ' + r.bad.join(', ') + '.', 'bad'); return; }
    el('dlg').close(); openId = r.person.id; drawAll();
  }

  /* ---- CSV in and out ------------------------------------------------------------------ */
  function importCsv() {
    UI.readFile(el('file-csv')).then(function (text) {
      if (SLAF.Csv.looksBinary(text)) { UI.say('say', 'That is a workbook, not a CSV. Save it as CSV first.', 'bad'); return; }
      /* LinkedIn's export starts with three lines of notes before the header */
      var lines = text.split(/\r?\n/), start = 0;
      for (var i = 0; i < Math.min(6, lines.length); i++) if (/first name/i.test(lines[i]) && /last name/i.test(lines[i])) { start = i; break; }
      if (start) text = lines.slice(start).join('\n');
      var parsed = SLAF.Csv.parse(text), recs = SLAF.Csv.records(text);
      var m = M.mapContacts(recs, { headers: parsed.headers, source: 'import' });
      if (!m.mapping.name && !m.mapping.first) { UI.say('say', 'No name column found. The header needs "name", or "first name" and "last name".', 'bad'); return; }
      if (!m.people.length) { UI.say('say', 'Nobody new in the file. ' + (m.skipped.length ? m.skipped.length + ' rows skipped (' + m.skipped[0].why + ').' : ''), 'bad'); return; }
      var cols = Object.keys(m.mapping).map(function (k) { return k + ' from "' + m.mapping[k] + '"'; }).join(', ');
      if (!confirm('Add ' + m.people.length + ' people as strangers?\n\nColumns read: ' + cols + (m.skipped.length ? '\n\n' + m.skipped.length + ' rows skipped (already here, or no name).' : ''))) return;
      M.addPeople(m.people); drawAll();
      UI.say('say', 'Added ' + m.people.length + ' people. They stay in this browser only.', 'good');
    }).catch(function (e) { UI.say('say', e.message, 'bad'); });
    el('file-csv').value = '';
  }
  function saveCsv() {
    var cols = [{ id: 'name', label: 'name' }, { id: 'company', label: 'company' }, { id: 'role', label: 'role' }, { id: 'email', label: 'email' }, { id: 'phone', label: 'phone' }, { id: 'platform', label: 'platform' }, { id: 'handle', label: 'handle' },
      { id: 'stage', label: 'stage' }, { id: 'source', label: 'source' }, { id: 'tags', label: 'tags', get: function (p) { return p.tags.join(', '); } }, { id: 'cadence', label: 'days_between_touches' }, { id: 'nextAt', label: 'contact_on' },
      { id: 'last', label: 'last_touch', get: function (p) { var d = dueOf(p); return d.last ? d.last.date : ''; } }, { id: 'next', label: 'next_touch', get: function (p) { return dueOf(p).when || ''; } },
      { id: 'value', label: 'paid', get: function (p) { return p.value === null ? '' : p.value / 100; } }, { id: 'touches', label: 'touches', get: function (p) { return M.touches(p.id).length; } }, { id: 'notes', label: 'notes' }, { id: 'createdAt', label: 'added', get: function (p) { return String(p.createdAt).slice(0, 10); } }];
    UI.download(M.filename('people'), UI.csv(M.people({ archived: true }), cols), 'text/csv');
  }

  document.addEventListener('click', function (e) {
    var b;
    if ((b = e.target.closest('[data-sort]'))) { var id = b.getAttribute('data-sort'); if (sortBy === id) sortDir = -sortDir; else { sortBy = id; sortDir = 1; } drawList(); return; }
    if ((b = e.target.closest('[data-stage]'))) { var s = b.getAttribute('data-stage'); stageFilter = stageFilter === s ? null : s; drawList(); return; }
    if ((b = e.target.closest('tr[data-person]'))) { openId = b.getAttribute('data-person'); drawList(); drawPanel(); return; }
    if ((b = e.target.closest('[data-edit]'))) { openDialog(M.person(b.getAttribute('data-edit'))); return; }
    if ((b = e.target.closest('[data-archive]'))) { var p = M.person(b.getAttribute('data-archive')); M.updatePerson(p.id, { archived: !p.archived }); drawAll(); return; }
    if ((b = e.target.closest('[data-remove-person]'))) { var q = M.person(b.getAttribute('data-remove-person')); if (confirm('Delete ' + q.name + ' and every touch with them? Archive keeps them.')) { M.removePerson(q.id); openId = null; drawAll(); } return; }
    if ((b = e.target.closest('[data-remove-touch]'))) { M.removeTouch(b.getAttribute('data-remove-touch')); drawAll(); return; }
  });
  function drawAll() { drawPipe(); drawList(); drawPanel(); }

  UI.boot(function (tables) {
    T = tables;
    el('head').innerHTML = UI.header({ screen: 'People', title: 'Who to talk to, and when', sub: 'Every contact has a stage and a rhythm. Nothing here leaves this browser.' });
    ['name', 'stage', 'cadence', 'nextAt', 'value'].forEach(function (id) { el('h-' + id).innerHTML = UI.help('field', id, T); });
    openId = param('person');
    if (openId) el('filter').value = 'all';
    drawAll();
    el('btn-add').addEventListener('click', function () { openDialog(null); });
    el('dlg-cancel').addEventListener('click', function () { el('dlg').close(); });
    el('person-form').addEventListener('submit', savePerson);
    el('filter').addEventListener('change', drawList); el('search').addEventListener('input', drawList);
    el('file-csv').addEventListener('change', importCsv); el('btn-csv').addEventListener('click', saveCsv);
  });
})();
