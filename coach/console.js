/* coach/console.js, the Session console (D-342, D-343). See session.html. */
(function () {
  'use strict';
  var SLAF = window.SLAF;
  var UI = SLAF.CoachUI, el = UI.el, esc = UI.esc;
  var Money = SLAF.Money, Schema = SLAF.Schema, Spine = SLAF.Spine, Coach = SLAF.Coach, Session = SLAF.Session;
  var Ownership = SLAF.Ownership, Registry = SLAF.Registry, Reference = SLAF.Reference, LedgerRows = SLAF.LedgerRows;
  var QuickEntry = SLAF.QuickEntry, Scenarios = SLAF.Scenarios;

  if (!UI.guard(el('main'))) return;
  var client = UI.clientOr(UI.param('client'));
  if (!client) {
    el('main').innerHTML = '<section class="slaf-card coach-off"><h1>No client open</h1><p class="slaf-lede">Open a session from <a href="index.html">Coach Home</a>.</p></section>';
    return;
  }
  /* This tab now reads and writes this client's household, and only it. */
  Spine.useProfile(client.id);

  var T = null;
  var stops = [];
  var current = null;                 /* the stop in the work area */
  var itemAt = {};                    /* stopId -> the item last touched */
  var tab = {};                       /* stopId -> the room tab shown */
  var detours = [];                   /* [{ stopId, item, tab, label }] at most two */
  var visited = {};                   /* stops made current while the session is open */
  var MAX_DETOURS = 2;

  /* ---- Reading ------------------------------------------------------------ */
  function h() { return Spine.getProfile(); }
  function rec() { return Coach.record(); }
  function open() { return Coach.openSession(); }
  function refreshClient() { client = Coach.client(client.id) || client; }
  function stopById(id) { return stops.filter(function (s) { return s.id === id; })[0] || null; }
  function blocks() { try { return Scenarios.blocks(); } catch (e) { return []; } }
  function ctxFor(stopId) { var r = rec(); return { stopId: stopId, notes: r.notes, homework: r.homework, blocks: blocks(), verdicts: client.blockVerdicts || {} }; }
  function startHousehold() {
    var s = open() || null;
    if (!s) { var all = rec().sessions; s = all.length ? all[all.length - 1] : null; }
    return s && s.startSnapshotId ? Coach.snapshotHousehold(s.startSnapshotId) : null;
  }
  function fieldText(id, household) {
    var f = Ownership.FIELDS[id];
    if (!f) return null;
    var r; try { r = f.read(household); } catch (e) { r = null; }
    if (!r || r.status !== 'ok') return null;
    try { return f.format ? f.format(r.value) : String(r.value); } catch (e) { return String(r.value); }
  }
  function readings(household) {
    var out = {};
    Object.keys(Ownership.FIELDS).forEach(function (id) { out[id] = { label: Ownership.FIELDS[id].label || id, text: fieldText(id, household) }; });
    return out;
  }
  function roomHref(target) {
    var id = target.split('#')[0], sec = target.split('#')[1] || '';
    var room = Registry.byId(id);
    if (!room) return null;
    return '../' + room.href + (sec ? '#' + sec : '');
  }
  function roomTitle(target) { var r = Registry.byId(target.split('#')[0]); return r ? r.title : target; }
  function itemLabel(stop, item) {
    if (item.kind === 'question') return item.text;
    var row = LedgerRows.byId(item.rowId);
    return row ? row.label : item.rowId;
  }

  /* ---- The path (left) ------------------------------------------------------ */
  function paintPath() {
    var household = h();
    el('path').innerHTML = stops.map(function (s, i) {
      var d = Session.done(s, household, T, ctxFor(s.id));
      var isCur = current && current.id === s.id;
      var body = '';
      if (isCur) {
        var here = itemAt[s.id];
        body = '<div class="stop-body"><p class="covers">' + esc(s.covers || '') + '</p><ul class="items">' + s.items.map(function (it) {
          var t = Coach.ticked(client.id, s.id, it.id);
          var value = '';
          if (it.kind === 'row') {
            var row = LedgerRows.byId(it.rowId);
            var st = null; try { st = row ? LedgerRows.status(household, row, T) : null; } catch (e) { st = null; }
            var shown = fieldText(it.rowId, household);
            value = '<span class="coach-note">: ' + esc(shown ? shown : 'not yet') + (st && st.state === 'roughly' ? ', rough' : '') + (st && st.stale ? ', stale' : '') + '</span>';
          }
          return '<li class="' + (here === it.id ? 'is-here' : '') + '"><label class="tick"><input type="checkbox" data-tick="' + esc(it.id) + '" aria-label="Done: ' + esc(itemLabel(s, it)) + '"' + (t ? ' checked' : '') + '/></label>'
            + '<button type="button" class="slaf-linkbtn item-text" data-item="' + esc(it.id) + '">' + (it.kind === 'question' ? 'Ask: ' : '') + esc(itemLabel(s, it)) + value + '</button>'
            + '<button type="button" class="slaf-btn slaf-btn--small slaf-btn--quiet hw-btn" data-hw="' + esc(it.id) + '">Homework</button></li>';
        }).join('') + '</ul>'
          + '<p class="coach-note" style="margin:var(--space-2) 0 0"><b>Done when:</b> ' + esc(s.doneLabel || '') + '</p>'
          + '<ul class="tests">' + d.tests.map(function (t) { return '<li class="' + (t.pass ? 'pass' : 'fail') + '">' + (t.pass ? 'Yes: ' : 'Not yet: ') + esc(t.why) + '</li>'; }).join('') + '</ul>'
          + (s.id === 'decisions' ? decisionsHtml() : '')
          + '<div class="row"><button type="button" class="slaf-btn slaf-btn--small slaf-btn--quiet" data-move="' + esc(s.id) + '">Move up</button>'
          + '<button type="button" class="slaf-btn slaf-btn--small slaf-btn--quiet" data-skip="' + esc(s.id) + '">' + (s.skipped ? 'Unskip' : 'Skip for this client') + '</button></div></div>';
      }
      return '<div class="stop' + (isCur ? ' is-current' : '') + (s.skipped ? ' is-skipped' : '') + '">'
        + '<button type="button" class="stop-head" data-stop="' + esc(s.id) + '" aria-expanded="' + String(!!isCur) + '"><span><span class="n">' + i + '.</span> ' + esc(s.title) + '</span>'
        + (d.done ? '<span class="done">done</span>' : s.skipped ? '<span class="coach-note">skipped</span>' : '') + '</button>' + body + '</div>';
    }).join('');
  }
  function decisionsHtml() {
    var bs = blocks();
    if (!bs.length) return '<p class="coach-note">No decision blocks yet. Open What If Life (or Housing, Car, Career) to add one.</p>';
    var v = client.blockVerdicts || {}, shown = client.shownBlocks || {};
    return '<ul class="items">' + bs.map(function (b) {
      return '<li><span class="item-text">' + esc(b.label) + '</span><select data-verdict="' + esc(b.id) + '" aria-label="Verdict on ' + esc(b.label) + '">'
        + ['', 'go', 'wait', 'no'].map(function (x) { return '<option value="' + x + '"' + ((v[b.id] || '') === x ? ' selected' : '') + '>' + (x ? x[0].toUpperCase() + x.slice(1) : 'No verdict') + '</option>'; }).join('')
        + '</select><label class="slaf-switch" style="min-height:32px"><input type="checkbox" data-show="' + esc(b.id) + '"' + (shown[b.id] ? ' checked' : '') + '/> Show client</label></li>';
    }).join('') + '</ul>';
  }

  /* ---- The work area (centre) ---------------------------------------------- */
  var frameSrc = null;
  function load(src) {
    if (!src || src === frameSrc) return;
    frameSrc = src;
    el('work').src = src;
  }
  function paintTabs() {
    if (!current) { el('work-tabs').innerHTML = ''; return; }
    var rooms = current.rooms || [];
    var at = tab[current.id] || rooms[0];
    el('work-tabs').innerHTML = rooms.map(function (r) {
      return '<button type="button" class="slaf-btn slaf-btn--small' + (r === at ? ' slaf-btn--primary' : '') + '" data-tab="' + esc(r) + '" aria-pressed="' + String(r === at) + '">' + esc(roomTitle(r)) + (r.indexOf('#') !== -1 ? ' (' + esc(r.split('#')[1]) + ')' : '') + '</button>';
    }).join('');
  }
  function show(stopId, opts) {
    var s = stopById(stopId); if (!s) return;
    current = s;
    if (open()) visited[s.id] = true;
    var o = opts || {};
    if (o.tab) tab[s.id] = o.tab;
    if (o.item !== undefined) itemAt[s.id] = o.item;
    var target = o.href || roomHref(tab[s.id] || (s.rooms || [])[0] || 'ledger');
    load(target);
    paintAll();
  }
  function openField(rowId) {
    var f = Ownership.FIELDS[rowId];
    if (!f) return;
    var room = Registry.byId(f.owner);
    if (room) load('../' + room.href + (f.anchor ? '#' + f.anchor : ''));
  }

  /* ---- Detour ------------------------------------------------------------ */
  function paintCrumbs() {
    el('crumbs').innerHTML = detours.map(function (d, i) {
      return '<button type="button" class="crumb" data-back="' + i + '">Back to ' + esc(d.label) + '</button>';
    }).join('');
    el('btn-detour').disabled = detours.length >= MAX_DETOURS;
    el('btn-detour').title = detours.length >= MAX_DETOURS ? 'Two detours deep: go back first.' : '';
  }
  function openDetour() {
    if (detours.length >= MAX_DETOURS) { UI.say('top-say', 'Two detours deep already. Go back first.', 'bad'); return; }
    var rooms = Registry.all().filter(function (r) { return r.href && r.id !== 'settings' && r.id !== 'data'; });
    el('detour-list').innerHTML = '<h3 class="slaf-eyebrow">A stop</h3><div class="row">' + stops.filter(function (s) { return !current || s.id !== current.id; }).map(function (s) {
      return '<button type="button" class="slaf-btn slaf-btn--small" data-detour-stop="' + esc(s.id) + '">' + esc(s.title) + '</button>';
    }).join('') + '</div><h3 class="slaf-eyebrow" style="margin-top:var(--space-3)">A room</h3><div class="row">' + rooms.map(function (r) {
      return '<button type="button" class="slaf-btn slaf-btn--small slaf-btn--quiet" data-detour-room="' + esc(r.id) + '">' + esc(r.title) + '</button>';
    }).join('') + '</div>';
    el('detour-dialog').showModal();
  }
  function pushDetour() {
    var item = itemAt[current.id] || null;
    var n = item ? current.items.map(function (x) { return x.id; }).indexOf(item) + 1 : 0;
    detours.push({ stopId: current.id, item: item, tab: tab[current.id] || null, src: frameSrc, label: current.title + (n ? ', item ' + n : '') });
  }
  function back(i) {
    var d = detours[i];
    detours = detours.slice(0, i);
    frameSrc = null;
    show(d.stopId, { item: d.item, tab: d.tab, href: d.src });
  }

  /* ---- The rail (right) ------------------------------------------------------ */
  function paintRail() {
    var now = h(), start = startHousehold();
    var ids = T.sessionPaths.rail.slice();
    var unlocked = (current && current.ratios || []).filter(function (r) { return ids.indexOf(r) === -1; });
    var a = Session.rail(now, T, ids.concat(unlocked), { snapshots: Spine.listSnapshots() });
    var b = start ? Session.rail(start, T, ids.concat(unlocked), {}) : null;
    var nw = Session.netWorth(now), nwb = start ? Session.netWorth(start) : null;
    var fb = Session.fiBand(now, T), fbb = start ? Session.fiBand(start, T) : null;
    var line = function (cls, label, nowText, wasText, extra) {
      return '<li class="' + cls + '"><span class="lbl">' + esc(label) + '</span><span class="now">' + esc(nowText) + '</span>'
        + (wasText !== null ? '<br/><span class="was">at the start: ' + esc(wasText) + '</span>' : '') + (extra || '') + '</li>';
    };
    el('rail').innerHTML = a.map(function (r, i) {
      return line('zone-' + r.zone + (unlocked.indexOf(r.id) !== -1 ? ' unlocked' : ''), r.label, r.text, b ? b[i].text : null,
        !r.ok && r.reason ? '<br/><span class="was">' + esc(r.reason) + '</span>' : '');
    }).join('')
      + line('', 'Net worth', nw === null ? 'not yet' : Money.formatCents(nw), b ? (nwb === null ? 'not yet' : Money.formatCents(nwb)) : null)
      + line('', 'FI date', fb.hasDate ? 'likely ' + Session.monthsText(fb.likely) : fb.text, fbb ? (fbb.hasDate ? 'likely ' + Session.monthsText(fbb.likely) : fbb.text) : null,
        fb.hasDate ? '<br/><span class="was">' + esc(Session.monthsText(fb.best) + ' to ' + Session.monthsText(fb.worst)) + '</span>' : '');
  }

  /* ---- Notes, homework, comments ----------------------------------------------- */
  function paintNotes() {
    var r = rec(), s = open();
    var mine = function (n) { return '<li><span>' + (n.kind === 'coach' ? '<span class="privacy">private</span> ' : '<span class="coach-note">shared</span> ') + esc(n.text) + '</span><button type="button" class="slaf-linkbtn" data-rm-note="' + esc(n.id) + '">Remove</button></li>'; };
    el('list-stop').innerHTML = r.notes.filter(function (n) { return current && n.stopId === current.id; }).map(mine).join('');
    el('list-session').innerHTML = r.notes.filter(function (n) { return !n.stopId && s && n.sessionId === s.id; }).map(mine).join('');
    el('list-hw').innerHTML = r.homework.map(function (x) {
      return '<li><label><input type="checkbox" data-hw-done="' + esc(x.id) + '"' + (x.doneAt ? ' checked' : '') + '/> ' + esc(x.text) + (x.dueOn ? ' <span class="coach-note">by ' + esc(UI.day(x.dueOn)) + '</span>' : '') + '</label></li>';
    }).join('') || '<li class="coach-note">No homework yet.</li>';
    el('list-cm').innerHTML = r.comments.map(function (c) {
      return '<li><span>' + esc(c.by === 'client' ? 'Client' + (c.loggedByCoach ? ' (logged by coach)' : '') : 'Coach') + ' on ' + esc(targetLabel(c.target)) + ': ' + esc(c.text) + '</span>'
        + '<button type="button" class="slaf-linkbtn" data-resolve="' + esc(c.id) + '">' + (c.resolvedAt ? 'Reopen' : 'Resolve') + '</button></li>';
    }).join('') || '<li class="coach-note">No comments yet.</li>';
  }
  function targetLabel(t) {
    if (!t) return '';
    if (t.kind === 'goal') { var g = (h().goals || []).filter(function (x) { return x.id === t.id; })[0]; return g ? 'goal ' + (g.name || '') : 'a goal'; }
    if (t.kind === 'recap') return 'the recap';
    var row = LedgerRows.byId(t.id); return row ? row.label : t.id;
  }
  function paintCommentTargets() {
    var opts = [];
    if (current) (current.ledgerRows || []).forEach(function (r) { var row = LedgerRows.byId(r); opts.push({ v: 'row:' + r, t: row ? row.label : r }); });
    (h().goals || []).forEach(function (g) { opts.push({ v: 'goal:' + g.id, t: 'Goal: ' + (g.name || 'a goal') }); });
    var s = open() || rec().sessions.slice(-1)[0];
    if (s) opts.push({ v: 'recap:' + s.id, t: 'The recap' });
    var keep = el('cm-target').value;
    el('cm-target').innerHTML = opts.map(function (o) { return '<option value="' + esc(o.v) + '">' + esc(o.t) + '</option>'; }).join('');
    if (keep) el('cm-target').value = keep;
  }

  /* ---- Timer and session buttons -------------------------------------------------- */
  function paintTop() {
    var s = open();
    el('btn-start').hidden = !!s;
    el('btn-end').hidden = !s;
    if (!s) el('timer').textContent = 'not started';
  }
  setInterval(function () {
    var s = open();
    if (s && s.startedAt) {
      var ms = Date.now() - Date.parse(s.startedAt), sec = Math.floor(ms / 1000);
      el('timer').textContent = Math.floor(sec / 3600) + ':' + ('0' + Math.floor(sec / 60) % 60).slice(-2) + ':' + ('0' + sec % 60).slice(-2);
    }
  }, 1000);

  function paintAll() {
    refreshClient();
    stops = Session.path(T.sessionPaths, client.pathId, client);
    if (current) current = stopById(current.id);
    paintTop(); paintPath(); paintTabs(); paintCrumbs(); paintRail(); paintNotes(); paintCommentTargets();
  }

  /* ---- Quick entry (C5) ---------------------------------------------------- */
  var plan = null;
  el('quick-in').addEventListener('input', function () {
    plan = QuickEntry.parse(this.value, T.quickEntry, h());
    el('quick-preview').textContent = plan.preview || '';
  });
  el('quick-in').addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    plan = QuickEntry.parse(this.value, T.quickEntry, h());
    if (plan.kind === 'empty') return;
    var s = open();
    try {
      var out = Coach.applyQuick(plan, { stopId: current ? current.id : null, sessionId: s ? s.id : null });
      el('quick-preview').textContent = plan.kind === 'rows' ? 'Saved: ' + plan.label + (out.note ? ', and a note' : '') + '.' : 'Saved as a private note on this stop.';
      this.value = '';
      plan = null;
      frameSrc && reloadFrame();
    } catch (err) { el('quick-preview').textContent = 'Not saved: ' + err.message; }
  });
  function reloadFrame() { try { el('work').contentWindow.location.reload(); } catch (e) { var s = frameSrc; frameSrc = null; load(s); } }

  /* ---- End the session, write the recap (E1, E2) ------------------------------- */
  var recapFor = null;
  function ticksSince(iso) {
    var out = [];
    var c = Coach.client(client.id);
    Object.keys(c.stops || {}).forEach(function (sid) { var items = (c.stops[sid] || {}).items || {}; Object.keys(items).forEach(function (iid) { if (!iso || items[iid] >= iso) out.push({ stopId: sid, itemId: iid }); }); });
    return out;
  }
  function buildRecap(sessionId) {
    var s = rec().sessions.filter(function (x) { return x.id === sessionId; })[0];
    if (!s) return null;
    var before = Coach.snapshotHousehold(s.startSnapshotId), after = s.endSnapshotId ? Coach.snapshotHousehold(s.endSnapshotId) : h();
    var r = rec();
    var out = Session.recap(before || Schema.createHousehold({}), after || h(), T, {
      stops: stops, stopsCovered: s.stopsCovered, ticked: s.ticked, notes: r.notes, sessionId: s.id,
      homework: r.homework, readings: readings
    });
    var head = client.name + ', session of ' + UI.day(s.startedAt) + (s.durationMs !== null ? ' (' + UI.duration(s.durationMs) + ')' : '');
    var next = Coach.client(client.id).nextSessionAt;
    return head + '\n\n' + out.text + (next ? '\n\nNext session: ' + UI.day(next) : '');
  }
  function showRecap(sessionId) {
    var s = rec().sessions.filter(function (x) { return x.id === sessionId; })[0];
    recapFor = sessionId;
    el('recap').hidden = false;
    el('recap-text').value = s && s.recapText ? s.recapText : buildRecap(sessionId);
    el('recap').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function recapText() { return el('recap-text').value; }

  /* ---- Clicks ------------------------------------------------------------------- */
  document.addEventListener('click', function (e) {
    var t = e.target, b;
    if ((b = t.closest('[data-stop]'))) { show(b.getAttribute('data-stop')); return; }
    if ((b = t.closest('[data-item]'))) {
      var iid = b.getAttribute('data-item');
      itemAt[current.id] = iid;
      if (iid.indexOf('row:') === 0) openField(iid.slice(4));
      paintPath();
      return;
    }
    if ((b = t.closest('[data-tab]'))) { tab[current.id] = b.getAttribute('data-tab'); load(roomHref(tab[current.id])); paintTabs(); return; }
    if ((b = t.closest('[data-hw]'))) {
      var it = current.items.filter(function (x) { return x.id === b.getAttribute('data-hw'); })[0];
      itemAt[current.id] = it.id;
      el('hw-text').value = it.kind === 'question' ? it.text : 'Find: ' + itemLabel(current, it);
      el('hw-due').value = Coach.client(client.id).nextSessionAt || '';
      el('hw-text').focus();
      el('hw-text').setAttribute('data-for', it.id);
      return;
    }
    if ((b = t.closest('[data-move]'))) {
      var ids = stops.map(function (s) { return s.id; }), k = ids.indexOf(b.getAttribute('data-move'));
      if (k > 0) { ids.splice(k - 1, 0, ids.splice(k, 1)[0]); Coach.updateClient(client.id, { stopOrder: ids }); paintAll(); }
      return;
    }
    if ((b = t.closest('[data-skip]'))) {
      var sk = Object.assign({}, Coach.client(client.id).skipped || {}), sid = b.getAttribute('data-skip');
      if (sk[sid]) delete sk[sid]; else sk[sid] = true;
      Coach.updateClient(client.id, { skipped: sk }); paintAll(); return;
    }
    if ((b = t.closest('[data-add-note]'))) {
      var parts = b.getAttribute('data-add-note').split(':'), scope = parts[0], kind = parts[1];
      var box = el('note-' + scope + '-' + kind), s0 = open();
      if (!box.value.trim()) return;
      if (scope === 'session' && !s0) { UI.say('top-say', 'Start the session first; a session note belongs to one.', 'bad'); return; }
      Coach.addNote({ kind: kind, text: box.value, stopId: scope === 'stop' && current ? current.id : null, sessionId: s0 ? s0.id : null });
      box.value = '';
      paintNotes(); paintPath();
      return;
    }
    if ((b = t.closest('[data-rm-note]'))) { Coach.removeNote(b.getAttribute('data-rm-note')); paintNotes(); paintPath(); return; }
    if ((b = t.closest('[data-resolve]'))) { var cm = rec().comments.filter(function (x) { return x.id === b.getAttribute('data-resolve'); })[0]; Coach.resolveComment(cm.id, !cm.resolvedAt); paintNotes(); return; }
    if ((b = t.closest('[data-back]'))) { back(+b.getAttribute('data-back')); return; }
    if ((b = t.closest('[data-detour-stop]'))) { el('detour-dialog').close(); pushDetour(); frameSrc = null; show(b.getAttribute('data-detour-stop')); return; }
    if ((b = t.closest('[data-detour-room]'))) {
      el('detour-dialog').close(); pushDetour();
      var room = Registry.byId(b.getAttribute('data-detour-room'));
      load('../' + room.href); paintCrumbs(); return;
    }
    switch (t.id) {
      case 'btn-detour': openDetour(); return;
      case 'detour-cancel': el('detour-dialog').close(); return;
      case 'btn-start': {
        var st = Coach.startSession();
        visited = {}; if (current) visited[current.id] = true;
        UI.say('top-say', st ? 'Session started. The numbers as they stand are frozen for the recap.' : 'Nothing to freeze yet: the session started on an empty household.', 'good');
        paintAll(); return;
      }
      case 'btn-end': {
        var s1 = open(); if (!s1) return;
        var ticked = ticksSince(s1.startedAt);
        var covered = Object.keys(visited).concat(ticked.map(function (x) { return x.stopId; })).filter(function (x, i, a) { return a.indexOf(x) === i; });
        Coach.endSession(s1.id, { stopsCovered: covered, ticked: ticked });
        UI.say('top-say', 'Session ended. The recap is below.', 'good');
        paintAll(); showRecap(s1.id); return;
      }
      case 'btn-client-view': {
        var w = window.open('client.html?client=' + encodeURIComponent(client.id) + '&presenter=1', 'coach-client-view');
        if (!w) UI.say('top-say', 'The browser blocked the new window. Allow pop-ups for this page, or open Client view from Coach Home.', 'bad');
        return;
      }
      case 'btn-hw-add': {
        var s2 = open();
        var hw = Coach.addHomework({ text: el('hw-text').value, dueOn: el('hw-due').value || null, stopId: current ? current.id : null, itemId: el('hw-text').getAttribute('data-for') || null, sessionId: s2 ? s2.id : null });
        if (hw) { el('hw-text').value = ''; el('hw-text').removeAttribute('data-for'); paintNotes(); paintPath(); }
        return;
      }
      case 'btn-cm-add': {
        var tv = el('cm-target').value.split(':');
        var c = Coach.addComment({ target: { kind: tv[0], id: tv.slice(1).join(':') }, by: el('cm-by').value, text: el('cm-text').value });
        if (c) { el('cm-text').value = ''; paintNotes(); }
        return;
      }
      case 'btn-recap-save': Coach.saveRecap(recapFor, recapText()); UI.say('recap-say', 'Saved with the session.', 'good'); return;
      case 'btn-recap-copy': {
        var txt = recapText();
        (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { UI.say('recap-say', 'Copied. Paste it into an email.', 'good'); },
          function () { el('recap-text').select(); UI.say('recap-say', 'Selected: press Ctrl+C (or Cmd+C) to copy.', null); });
        return;
      }
      case 'btn-recap-print': {
        Coach.saveRecap(recapFor, recapText());
        el('print-page').innerHTML = '<h1 style="font-size:20px">' + esc(client.name) + '</h1><pre style="white-space:pre-wrap;font:13px/1.45 system-ui,sans-serif">' + esc(recapText()) + '</pre><p style="font-size:11px">Prepared by your coach. Not investment advice.</p>';
        document.body.classList.add('printing-recap');
        el('print-page').hidden = false;
        UI.say('recap-say', 'In the dialog, choose "Save as PDF" as the destination.', null);
        window.print();
        setTimeout(function () { document.body.classList.remove('printing-recap'); el('print-page').hidden = true; }, 500);
        return;
      }
      case 'btn-recap-seal': {
        var pass = el('recap-pass').value;
        var st2 = SLAF.Vault.strength(pass);
        if (!st2.ok) { UI.say('recap-say', st2.why, 'bad'); return; }
        Coach.saveRecap(recapFor, recapText());
        Coach.seal(Coach.recapFile(client.id, recapText()), pass).then(function (sealed) {
          UI.download(Coach.filename('recap'), sealed);
          UI.say('recap-say', 'Saved a sealed recap. Send the passphrase to the client another way.', 'good');
        }, function (err) { UI.say('recap-say', err.message, 'bad'); });
        return;
      }
    }
  });
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.matches('[data-tick]')) {
      Coach.tick(client.id, current.id, t.getAttribute('data-tick'), t.checked);
      itemAt[current.id] = t.getAttribute('data-tick');
      if (open()) visited[current.id] = true;
      paintPath(); return;
    }
    if (t.matches('[data-verdict]')) { Coach.setVerdict(client.id, t.getAttribute('data-verdict'), t.value || null); paintAll(); return; }
    if (t.matches('[data-show]')) { Coach.setShown(client.id, t.getAttribute('data-show'), t.checked); refreshClient(); return; }
    if (t.id === 'path-template') { Coach.updateClient(client.id, { pathId: t.value, stopOrder: null }); current = null; paintAll(); var st = Session.stage(stops, h(), T, ctxFor(null)); show((st.stop || stops[0]).id); return; }
  });

  /* A write anywhere (the embedded room, quick entry, another tab) repaints
     the lists and the rail; the typed boxes are never touched. */
  Spine.onChange(function () { if (T) { paintPath(); paintRail(); paintNotes(); } });

  Reference.load().then(function (tables) {
    T = tables;
    LedgerRows.use(T.ledgerRows);
    el('client-name').textContent = client.name + (client.demo && !/example numbers/.test(client.name) ? ' (example numbers)' : '');
    document.title = 'Session: ' + client.name + ' · SPARKS';
    el('path-template').innerHTML = (T.sessionPaths.paths || []).map(function (p) { return '<option value="' + esc(p.id) + '"' + (p.id === client.pathId ? ' selected' : '') + '>' + esc(p.label) + '</option>'; }).join('');
    stops = Session.path(T.sessionPaths, client.pathId, client);
    var st = Session.stage(stops, h(), T, ctxFor(null));
    show((st.stop || stops[0]).id);
    var s = open();
    if (s) UI.say('top-say', 'A session is open from ' + UI.day(s.startedAt) + '. End it when you are done.', null);
  });
})();
