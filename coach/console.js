/* coach/console.js, the Session console (CD-006, CD-010, CD-011). See session.html. */
(function () {
  'use strict';
  var SLAF = window.SLAF;
  var UI = SLAF.CoachUI, el = UI.el, esc = UI.esc;
  var Money = SLAF.Money, Schema = SLAF.Schema, Coach = SLAF.Coach, Session = SLAF.Session, Fields = SLAF.Fields;
  var QuickEntry = SLAF.QuickEntry, Tables = SLAF.Tables;

  var client = UI.clientOr(UI.param('client'));
  if (!client && UI.param('client') === Coach.DEMO_ID) client = Coach.ensureDemo(SLAF.DemoPersona);   /* the example client is always there */
  if (!client) {
    el('main').innerHTML = '<section class="slaf-card coach-off"><h1>No client open</h1><p class="slaf-lede">Open a session from <a href="index.html">Coach Home</a>.</p></section>';
    return;
  }
  var ID = client.id;                  /* every read and write below names this client */
  var T = null, stops = [], current = null;
  var itemAt = {}, detours = [], visited = {}, noteTab = 'stop';
  var MAX_DETOURS = 2;
  /* The pictures each stop shows, by chart id in Session.pictures. */
  var STOP_PICS = { life: ['goals', 'fiBand'], income: ['year', 'takeHomeVsGross'], spending: ['month', 'keep'], debt: ['debts', 'payoff', 'debtPace'], safety: ['cushion', 'reach'],
    assets: ['accounts', 'ownOwe'], taxes: ['taxNext', 'year'], goals: ['goals', 'goalsMonthly'], decisions: ['fiBand', 'path'] };
  var RAIL = [{ pic: 'keep', readout: 'savingsRate' }, { pic: 'debtShare', readout: 'debtToIncome' }, { pic: 'cushion', readout: 'emergencyFundMonths' }, { pic: 'reach', readout: 'liquidityRatio' }, { pic: 'homeShare', readout: 'housingRatio' }];

  function h() { return Coach.household(ID); }
  function rec() { return Coach.record(ID); }
  function open() { return Coach.openSession(ID); }
  function refreshClient() { client = Coach.client(ID) || client; }
  function stopById(id) { return stops.filter(function (s) { return s.id === id; })[0] || null; }
  function ctxFor(stopId) { var r = rec(); return { stopId: stopId, notes: r.notes, homework: r.homework, decisions: r.decisions }; }
  function startHousehold() {
    var s = open(); if (!s) { var all = rec().sessions; s = all.length ? all[all.length - 1] : null; }
    return s && s.startSnapshotId ? Coach.snapshotHousehold(ID, s.startSnapshotId) : null;
  }
  function picturesNow() { var r = rec(); return Session.pictures(h(), T, { asOf: Schema.localDay(), snapshots: Coach.snapshots(ID), checkins: r.checkins }); }
  function listLabel(list) { return (T.coachFields.lists[list] || {}).label || list; }
  function itemLabel(it) {
    if (it.kind === 'question') return it.text;
    if (it.kind === 'list') return listLabel(it.list);
    var d = Fields.def(it.fieldId); return d ? d.label : it.fieldId;
  }
  function itemValue(it, household) {
    if (it.kind === 'list') { var n = Fields.items(household, it.list).length; return n ? n + ' listed' : 'none yet'; }
    if (it.kind !== 'field') return '';
    var t = Fields.text(it.fieldId, Fields.read(household, it.fieldId));
    var m = household.meta && household.meta.fields && household.meta.fields[it.fieldId];
    return (t || 'not yet') + (m && m.confidence === 'roughly' ? ', a guess' : '');
  }

  /* ---- Header and step bar ------------------------------------------------------ */
  function paintHead() {
    var s = open();
    el('head').innerHTML = UI.header({ screen: 'Session', title: client.name + (client.demo && !/example numbers/.test(client.name) ? ' (example numbers)' : ''),
      sub: s ? 'Started ' + esc(UI.day(s.startedAt)) + '. Everything you type is saved as you go.' : 'Start the session to freeze today\'s numbers, so the recap can show what changed.',
      actions: '<span class="chip' + (s ? ' is-live' : '') + '" id="timer">' + (s ? '0:00:00' : 'not started') + '</span>'
        + (s ? '<button type="button" class="slaf-btn slaf-btn--primary" id="btn-end">End session</button>' : '<button type="button" class="slaf-btn slaf-btn--primary" id="btn-start">Start session</button>')
        + '<button type="button" class="slaf-btn" id="btn-detour"' + (detours.length >= MAX_DETOURS ? ' disabled title="Two detours deep: go back first."' : '') + '>Detour</button>'
        + '<button type="button" class="slaf-btn" id="btn-client-view">Client view</button>'
        + '<a class="slaf-btn slaf-btn--quiet" href="index.html">Clients</a>' });
  }
  function paintStepbar() {
    var household = h(), live = stops.filter(function (s) { return !s.skipped; });
    var doneN = 0, dots = live.map(function (s) { var d = Session.done(s, household, T, ctxFor(s.id)).done; if (d) doneN++; return '<i class="' + (d ? 'done' : '') + (current && current.id === s.id ? ' now' : '') + '" title="' + esc(s.title) + '"></i>'; }).join('');
    el('stepbar').innerHTML = '<span class="dots" aria-hidden="true">' + dots + '</span><span>' + doneN + ' of ' + live.length + ' stops done' + (current ? '. Now: <b>' + esc(current.title) + '</b>' : '') + '</span>';
  }

  /* ---- The path (left) ------------------------------------------------------ */
  function paintPath() {
    var household = h();
    el('path').innerHTML = stops.map(function (s, i) {
      var d = Session.done(s, household, T, ctxFor(s.id));
      var isCur = current && current.id === s.id, body = '';
      if (isCur) {
        body = '<div class="stop-body"><ul class="items">' + s.items.map(function (it) {
          var t = Coach.ticked(ID, s.id, it.id), v = itemValue(it, household);
          return '<li class="' + (itemAt[s.id] === it.id ? 'is-here' : '') + '"><label class="tick"><input type="checkbox" data-tick="' + esc(it.id) + '" aria-label="Done: ' + esc(itemLabel(it)) + '"' + (t ? ' checked' : '') + '/></label>'
            + '<button type="button" class="slaf-linkbtn item-text" data-item="' + esc(it.id) + '">' + (it.kind === 'question' ? 'Ask: ' : '') + esc(itemLabel(it)) + (v ? '<span class="v">' + esc(v) + '</span>' : '') + '</button>'
            + '<button type="button" class="slaf-btn slaf-btn--small slaf-btn--quiet hw-btn" data-hw="' + esc(it.id) + '">Homework</button></li>';
        }).join('') + '</ul>'
          + '<p class="coach-note" style="margin:var(--space-2) 0 0"><b>Done when:</b> ' + esc(s.doneLabel || '') + '</p>'
          + '<ul class="tests">' + d.tests.map(function (t) { return '<li class="' + (t.pass ? 'pass' : 'fail') + '">' + (t.pass ? 'Yes: ' : 'Not yet: ') + esc(t.why) + '</li>'; }).join('') + '</ul>'
          + '<div class="row"><button type="button" class="slaf-btn slaf-btn--small slaf-btn--quiet" data-move="' + esc(s.id) + '">Move up</button>'
          + '<button type="button" class="slaf-btn slaf-btn--small slaf-btn--quiet" data-skip="' + esc(s.id) + '">' + (s.skipped ? 'Put it back' : 'Skip for this client') + '</button></div></div>';
      }
      return '<div class="stop' + (isCur ? ' is-current' : '') + (d.done ? ' is-done' : '') + (s.skipped ? ' is-skipped' : '') + '">'
        + '<button type="button" class="stop-head" data-stop="' + esc(s.id) + '" aria-expanded="' + String(!!isCur) + '"><span><span class="n">' + (i + 1) + '</span>' + esc(s.title) + '</span>'
        + (d.done ? '<span class="done">done</span>' : s.skipped ? '<span class="coach-note">skipped</span>' : '') + '</button>' + body + '</div>';
    }).join('');
  }

  /* ---- The work card (centre): built once per stop ------------------------------- */
  function boxFor(id, value, item) {
    var d = Fields.def(id) || {}, hp = (T.coachHelp.fields || {})[id] || {};
    var key = ' data-field="' + esc(id) + '"' + (item ? ' data-item-id="' + esc(item) + '"' : '') + ' aria-label="' + esc(d.label) + '"';
    var ph = hp.example ? ' placeholder="for example ' + esc(hp.example) + '"' : '';
    var v = value;
    switch (d.unit) {
      case 'cents': return '<span class="affix"><span>$</span><input type="text" inputmode="decimal"' + key + ph + ' value="' + esc(v === null ? '' : String(v / 100)) + '"/></span>';
      case 'rate': return '<span class="affix"><input type="text" inputmode="decimal"' + key + ph + ' value="' + esc(v === null ? '' : String(Math.round(v * 1e6) / 1e4)) + '"/><span class="after">%</span></span>';
      case 'date': return '<input type="date"' + key + ' value="' + esc(v || '') + '"/>';
      case 'count': return '<input type="number" min="0" step="1"' + key + ph + ' value="' + esc(v === null ? '' : String(v)) + '"/>';
      case 'bool': return '<select' + key + '><option value=""' + (v === null ? ' selected' : '') + '>Not said yet</option><option value="yes"' + (v === true ? ' selected' : '') + '>Yes</option><option value="no"' + (v === false ? ' selected' : '') + '>No</option></select>';
      case 'enum': return '<select' + key + '><option value="">Not said yet</option>' + (d.choices || []).map(function (c) { return '<option value="' + esc(c[0]) + '"' + (c[0] === v ? ' selected' : '') + '>' + esc(c[1]) + '</option>'; }).join('') + '</select>';
      case 'match': return '<span class="row"><span class="affix"><input type="text" inputmode="decimal" data-match="pct" data-field="' + esc(id) + '" aria-label="How much they match, percent" placeholder="50" value="' + esc(v ? String(v.matchPercent * 100) : '') + '"/><span class="after">% of what goes in</span></span>'
        + '<span class="affix"><span>up to</span><input type="text" inputmode="decimal" data-match="cap" data-field="' + esc(id) + '" aria-label="Up to this percent of pay" placeholder="6" value="' + esc(v ? String(v.matchCapPercentOfSalary * 100) : '') + '"/><span class="after">% of pay</span></span></span>';
      default: return '<input type="text"' + key + ph + ' value="' + esc(v || '') + '"/>';
    }
  }
  function buildWork() {
    if (!current) return;
    var household = h(), parts = [];
    el('work-title').textContent = current.title;
    el('work-help').innerHTML = UI.help('stop', current.id, T, current.title);
    el('work-covers').textContent = current.covers || '';
    el('ask').innerHTML = (current.questions || []).map(function (q) { return '<li>' + esc(q.text) + '</li>'; }).join('');
    /* the read-outs, as tiles, then the pictures */
    el('figures').innerHTML = (current.figures || []).map(function (id) {
      return '<div class="stat" data-figure="' + esc(id) + '"><div class="lbl"><span class="fig-label"></span>' + UI.help('readout', id, T) + '</div><div class="now"></div><div class="word"></div><div class="was"></div></div>';
    }).join('');
    el('pics').innerHTML = (STOP_PICS[current.id] || []).map(function (id) { return '<div class="ck-host" data-pic="' + esc(id) + '"></div>'; }).join('');
    /* the entry form */
    (current.fields || []).forEach(function (f) {
      if (/^list:/.test(f)) {
        var list = f.slice(5), L = T.coachFields.lists[list];
        var lines = Fields.items(household, list);
        parts.push('<fieldset class="entry-list"><legend>' + esc(L.label) + '</legend>'
          + '<div class="entry-help">' + L.fields.map(function (fid) { return '<span>' + esc(Fields.def(fid).label) + ' ' + UI.help('field', fid, T, Fields.def(fid).label) + '</span>'; }).join('') + '</div>'
          + (lines.length ? lines.map(function (it) {
            return '<div class="entry-line">' + L.fields.map(function (fid) {
              return '<label class="inline">' + esc(Fields.def(fid).label) + boxFor(fid, Fields.read(household, fid, it.id), it.id) + '</label>';
            }).join('') + '<button type="button" class="slaf-btn slaf-btn--small slaf-btn--quiet" data-remove="' + esc(list) + ':' + esc(it.id) + '">Remove</button></div>';
          }).join('') : '<p class="coach-note">None yet.</p>')
          + '<button type="button" class="slaf-btn slaf-btn--small" data-add="' + esc(list) + '">' + esc(L.add) + '</button></fieldset>');
        return;
      }
      var d = Fields.def(f); if (!d) return;
      var m = household.meta && household.meta.fields && household.meta.fields[f];
      parts.push('<div class="entry-row"><label class="inline"><span class="field-label">' + esc(d.label) + '</span>' + boxFor(f, Fields.read(household, f)) + '</label>'
        + UI.help('field', f, T, d.label)
        + '<label class="guess" title="Tick this when the number is a rough guess. It shows as a number to check."><input type="checkbox" data-rough="' + esc(f) + '"' + (m && m.confidence === 'roughly' ? ' checked' : '') + '/> This is a guess</label></div>');
    });
    if (current.id === 'decisions') parts.push(decisionsHtml());
    el('form').innerHTML = parts.join('') || '<p class="coach-note">Nothing to type at this stop: talk it through, tick the questions on the path, and write the plan as a shared note.</p>';
    el('form-say').textContent = '';
    paintFigures();
    mountPics();
  }
  function decisionsHtml() {
    var ds = rec().decisions;
    return '<fieldset class="entry-list"><legend>The decisions</legend><p class="coach-note">Each gets a verdict. Tick "Show client" to put it on their life map.</p>' + (ds.length ? ds.map(function (d) {
      return '<div class="entry-line"><label class="inline">Decision<input type="text" data-dec="label" data-dec-id="' + esc(d.id) + '" value="' + esc(d.label) + '" placeholder="for example: buy a car"/></label>'
        + '<label class="inline">From (month)<input type="month" data-dec="startsOn" data-dec-id="' + esc(d.id) + '" value="' + esc(d.startsOn || '') + '"/></label>'
        + '<label class="inline">Verdict<select data-dec="verdict" data-dec-id="' + esc(d.id) + '">' + ['', 'go', 'wait', 'no'].map(function (x) { return '<option value="' + x + '"' + ((d.verdict || '') === x ? ' selected' : '') + '>' + (x ? x[0].toUpperCase() + x.slice(1) : 'No verdict yet') + '</option>'; }).join('') + '</select></label>'
        + '<label class="guess"><input type="checkbox" data-dec="showClient" data-dec-id="' + esc(d.id) + '"' + (d.showClient ? ' checked' : '') + '/> Show client</label></div>';
    }).join('') : '<p class="coach-note">No decisions yet.</p>') + '<button type="button" class="slaf-btn slaf-btn--small" id="btn-dec-add">Add a decision</button></fieldset>';
  }
  function paintFigures() {
    if (!current) return;
    var now = h(), start = startHousehold();
    var ids = current.figures || [];
    var a = Session.figures(now, T, ids), b = start ? Session.figures(start, T, ids) : null;
    a.forEach(function (r, i) {
      var tile = el('figures').querySelector('[data-figure="' + r.id + '"]'); if (!tile) return;
      tile.className = 'stat zone-' + r.zone;
      tile.querySelector('.fig-label').textContent = r.label;
      tile.querySelector('.now').textContent = r.text;
      tile.querySelector('.word').textContent = r.ok ? (r.zone === 'good' ? 'good' : r.zone === 'watch' ? 'watch' : r.zone === 'out' ? 'needs care' : '') : (r.reason || 'a few numbers are still to come');
      tile.querySelector('.was').textContent = b ? 'at the start: ' + b[i].text : '';
    });
  }
  function mountPics() {
    var P = picturesNow();
    Array.prototype.forEach.call(el('pics').querySelectorAll('[data-pic]'), function (host) {
      var id = host.getAttribute('data-pic');
      if (P[id]) UI.chart(host, 'stop-' + id, P[id]); else { host.innerHTML = ''; host.className = 'ck-host'; }
    });
  }
  function redrawPics() {
    var P = picturesNow();
    Array.prototype.forEach.call(el('pics').querySelectorAll('[data-pic]'), function (host) { var id = host.getAttribute('data-pic'); if (P[id]) { if (host.classList.contains('ck')) UI.redraw(host, P[id]); else UI.chart(host, 'stop-' + id, P[id]); } });
  }
  function saveBox(t) {
    var id = t.getAttribute('data-field'), item = t.getAttribute('data-item-id');
    var d = Fields.def(id) || {};
    var value;
    if (d.unit === 'match') {
      var boxes = el('form').querySelectorAll('[data-match][data-field="' + id + '"]');
      var a = Fields.parse('contributionPercent', boxes[0].value), b = Fields.parse('contributionPercent', boxes[1].value);
      if (!a.ok || !b.ok) { UI.say('form-say', 'A percent, like 50 or 6.', 'bad'); return; }
      value = a.value !== null && b.value !== null ? { matchPercent: a.value, matchCapPercentOfSalary: b.value } : null;
      if ((a.value === null) !== (b.value === null)) { UI.say('form-say', 'The match needs both: how much they add, and up to what share of pay.', null); return; }
    } else if (d.unit === 'bool') value = t.value === '' ? null : t.value === 'yes';
    else {
      var p = Fields.parse(id, t.value);
      if (!p.ok) { UI.say('form-say', d.label + ': ' + p.why + '. Not saved.', 'bad'); return; }
      value = p.value;
    }
    var rough = el('form').querySelector('[data-rough="' + id + '"]');
    Coach.setField(ID, id, value, item || null, { rough: !!(rough && rough.checked) });
    UI.say('form-say', 'Saved: ' + d.label + (value === null ? ' (left blank, which means not known yet)' : ''), 'good');
    paintLive();
  }

  /* ---- The rail (right): meters, built once, redrawn on every change ------------ */
  function buildRail() {
    el('rail').innerHTML = RAIL.map(function (r) {
      return '<li data-rail="' + esc(r.pic) + '"><div class="lbl"><span class="rail-label"></span>' + UI.help('readout', r.readout, T) + '</div><div class="ck-host" data-rail-pic="' + esc(r.pic) + '"></div><div class="was"></div></li>';
    }).join('') + '<li><div class="lbl"><span>The work-optional date</span>' + UI.help('readout', 'fiDate', T) + '</div><div class="ck-host" data-rail-pic="fiBand"></div><div class="was" id="rail-fi-was"></div></li>'
      + '<li class="stat" id="rail-nw"><div class="lbl"><span>What they own minus what they owe</span>' + UI.help('readout', 'netWorth', T) + '</div><div class="now"></div><div class="was"></div><div class="ck-host" data-rail-pic="netWorthOverTime"></div></li>';
    paintRail(true);
  }
  function paintRail(first) {
    var now = h(), start = startHousehold();
    var P = picturesNow(), Pb = start ? Session.pictures(start, T, { asOf: Schema.localDay() }) : null;
    var defs = {}; Session.rail(now, T).forEach(function (r) { defs[r.id] = r; });
    var before = {}; if (start) Session.rail(start, T).forEach(function (r) { before[r.id] = r; });
    RAIL.forEach(function (r) {
      var li = el('rail').querySelector('[data-rail="' + r.pic + '"]'), spec = P[r.pic], ro = defs[r.readout];
      li.querySelector('.rail-label').textContent = ro.label;
      var host = li.querySelector('[data-rail-pic]');
      if (first || !host.classList.contains('ck')) UI.chart(host, 'rail-' + r.pic, spec, { bare: true, hideTitle: true }); else UI.redraw(host, spec);
      li.querySelector('.was').textContent = start && before[r.readout] ? 'at the start: ' + before[r.readout].text : (ro.good ? 'good looks like: ' + ro.good : '');
    });
    var fiHost = el('rail').querySelector('[data-rail-pic="fiBand"]');
    if (first || !fiHost.classList.contains('ck')) UI.chart(fiHost, 'rail-fiBand', P.fiBand, { bare: true, hideTitle: true }); else UI.redraw(fiHost, P.fiBand);
    var fb = Session.fiBand(now, T), fbb = start ? Session.fiBand(start, T) : null;
    el('rail-fi-was').textContent = fbb ? 'at the start: ' + (fbb.hasDate ? 'likely ' + Session.monthsText(fbb.likely) : fbb.text) : (fb.hasDate && fb.ageText ? fb.ageText : '');
    var nw = Session.netWorth(now), nwb = start ? Session.netWorth(start) : null;
    el('rail-nw').querySelector('.now').textContent = nw === null ? 'not yet' : Money.formatCents(nw);
    el('rail-nw').querySelector('.was').textContent = start ? 'at the start: ' + (nwb === null ? 'not yet' : Money.formatCents(nwb)) : '';
    var nwHost = el('rail-nw').querySelector('[data-rail-pic]');
    if (P.netWorthOverTime) { if (nwHost.classList.contains('ck')) UI.redraw(nwHost, P.netWorthOverTime); else UI.chart(nwHost, 'rail-nw', P.netWorthOverTime, { bare: true, hideTitle: true, type: 'spark', height: 44 }); }
  }

  /* ---- Notes, homework, comments ------------------------------------------------ */
  function paintNotes() {
    var r = rec(), s = open();
    var mine = function (n) { return '<li><span>' + (n.kind === 'coach' ? '<span class="privacy">private</span> ' : '<span class="coach-note">shared</span> ') + esc(n.text) + '</span><button type="button" class="slaf-linkbtn" data-rm-note="' + esc(n.id) + '">Remove</button></li>'; };
    var list = noteTab === 'stop' ? r.notes.filter(function (n) { return current && n.stopId === current.id; }) : r.notes.filter(function (n) { return !n.stopId && s && n.sessionId === s.id; });
    el('list-notes').innerHTML = list.map(mine).join('') || '<li class="coach-note">' + (noteTab === 'stop' ? 'No notes on this stop yet.' : (s ? 'No notes on this session yet.' : 'Start the session to keep notes on it.')) + '</li>';
    el('list-hw').innerHTML = r.homework.map(function (x) {
      return '<li><label><input type="checkbox" data-hw-done="' + esc(x.id) + '"' + (x.doneAt ? ' checked' : '') + '/> ' + esc(x.text) + (x.dueOn ? ' <span class="coach-note">by ' + esc(UI.day(x.dueOn)) + '</span>' : '') + '</label></li>';
    }).join('') || '<li class="coach-note">No homework yet.</li>';
    el('list-cm').innerHTML = r.comments.map(function (c) {
      return '<li><span>' + esc(c.by === 'client' ? 'Client' + (c.loggedByCoach ? ' (written down by you)' : '') : 'You') + ' on ' + esc(targetLabel(c.target)) + ': ' + esc(c.text) + '</span>'
        + '<button type="button" class="slaf-linkbtn" data-resolve="' + esc(c.id) + '">' + (c.resolvedAt ? 'Reopen' : 'Done') + '</button></li>';
    }).join('') || '<li class="coach-note">No comments yet.</li>';
  }
  function targetLabel(t) {
    if (!t) return '';
    if (t.kind === 'goal') { var g = (h().goals || []).filter(function (x) { return x.id === t.id; })[0]; return g ? 'the goal ' + (g.name || '') : 'a goal'; }
    if (t.kind === 'recap') return 'the recap';
    var d = Fields.def(t.id); return d ? d.label : t.id;
  }
  function paintCommentTargets() {
    var opts = [];
    if (current) (current.fields || []).forEach(function (f) { if (!/^list:/.test(f)) opts.push({ v: 'row:' + f, t: Fields.def(f).label }); });
    (h().goals || []).forEach(function (g) { opts.push({ v: 'goal:' + g.id, t: 'Goal: ' + (g.name || 'a goal') }); });
    var s = open() || rec().sessions.slice(-1)[0];
    if (s) opts.push({ v: 'recap:' + s.id, t: 'The recap' });
    var keep = el('cm-target').value;
    el('cm-target').innerHTML = opts.map(function (o) { return '<option value="' + esc(o.v) + '">' + esc(o.t) + '</option>'; }).join('');
    if (keep) el('cm-target').value = keep;
  }

  /* ---- The clock ----------------------------------------------------------- */
  setInterval(function () {
    var s = open(), t = el('timer');
    if (s && s.startedAt && t) {
      var sec = Math.floor((Date.now() - Date.parse(s.startedAt)) / 1000);
      t.textContent = Math.floor(sec / 3600) + ':' + ('0' + Math.floor(sec / 60) % 60).slice(-2) + ':' + ('0' + sec % 60).slice(-2);
    }
  }, 1000);

  /* A saved entry repaints what reads it; the form itself is left alone. */
  function paintLive() { paintStepbar(); paintPath(); paintFigures(); redrawPics(); paintRail(false); paintNotes(); }
  function paintAll() {
    refreshClient();
    stops = Session.path(T.sessionPaths, client.pathId, client);
    if (current) current = stopById(current.id);
    paintHead(); paintStepbar(); paintPath(); paintCrumbs(); paintFigures(); redrawPics(); paintRail(false); paintNotes(); paintCommentTargets();
  }
  function show(stopId, opts) {
    var s = stopById(stopId); if (!s) return;
    var moved = !current || current.id !== s.id;
    current = s;
    if (open()) visited[s.id] = true;
    if (opts && opts.item !== undefined) itemAt[s.id] = opts.item;
    if (moved || (opts && opts.rebuild)) buildWork();
    paintAll();
    if (moved && window.innerWidth < 1100) el('work').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ---- Detour ------------------------------------------------------------- */
  function paintCrumbs() {
    el('crumbs').innerHTML = detours.map(function (d, i) { return '<button type="button" class="crumb" data-back="' + i + '">Back to ' + esc(d.label) + '</button>'; }).join('');
  }
  function openDetour() {
    if (detours.length >= MAX_DETOURS) { UI.say('top-say', 'Two detours deep already. Go back first.', 'bad'); return; }
    el('detour-list').innerHTML = '<div class="row">' + stops.filter(function (s) { return !current || s.id !== current.id; }).map(function (s) {
      return '<button type="button" class="slaf-btn slaf-btn--small" data-detour-stop="' + esc(s.id) + '">' + esc(s.title) + '</button>';
    }).join('') + '</div>';
    el('detour-dialog').showModal();
  }
  function pushDetour() {
    var item = itemAt[current.id] || null;
    var n = item ? current.items.map(function (x) { return x.id; }).indexOf(item) + 1 : 0;
    detours.push({ stopId: current.id, item: item, label: current.title + (n ? ', item ' + n : '') });
  }
  function back(i) { var d = detours[i]; detours = detours.slice(0, i); show(d.stopId, { item: d.item }); }

  /* ---- Quick entry ------------------------------------------------------------ */
  el('quick-in').addEventListener('input', function () { el('quick-preview').textContent = QuickEntry.parse(this.value, T.quickEntry, h()).preview || ''; });
  el('quick-in').addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    var plan = QuickEntry.parse(this.value, T.quickEntry, h());
    if (plan.kind === 'empty') return;
    var s = open();
    try {
      var out = Coach.applyQuick(ID, plan, { stopId: current ? current.id : null, sessionId: s ? s.id : null });
      el('quick-preview').textContent = plan.kind === 'rows' ? 'Saved: ' + plan.label + (out.note ? ', and a private note' : '') + '. It shows as a guess until you confirm it.' : 'Saved as a private note on this stop.';
      this.value = '';
      buildWork();                      /* the coach is typing up here, not in the form */
      paintLive();
    } catch (err) { el('quick-preview').textContent = 'Not saved: ' + err.message; }
  });

  /* ---- End and recap ------------------------------------------------------------ */
  var recapFor = null;
  function ticksSince(iso) {
    var out = [], c = Coach.client(ID);
    Object.keys(c.stops || {}).forEach(function (sid) { var items = (c.stops[sid] || {}).items || {}; Object.keys(items).forEach(function (iid) { if (!iso || items[iid] >= iso) out.push({ stopId: sid, itemId: iid }); }); });
    return out;
  }
  function buildRecap(sessionId) {
    var s = rec().sessions.filter(function (x) { return x.id === sessionId; })[0]; if (!s) return '';
    var before = Coach.snapshotHousehold(ID, s.startSnapshotId), after = s.endSnapshotId ? Coach.snapshotHousehold(ID, s.endSnapshotId) : h();
    var r = rec();
    var out = Session.recap(before || Schema.createHousehold({}), after || h(), T, { stops: stops, stopsCovered: s.stopsCovered, ticked: s.ticked, notes: r.notes, sessionId: s.id, homework: r.homework, readings: Fields.readings });
    var next = Coach.client(ID).nextSessionAt;
    return client.name + ', session of ' + UI.day(s.startedAt) + (s.durationMs !== null ? ' (' + UI.duration(s.durationMs) + ')' : '') + '\n\n' + out.text + (next ? '\n\nNext session: ' + UI.day(next) : '');
  }
  function showRecap(sessionId) {
    var s = rec().sessions.filter(function (x) { return x.id === sessionId; })[0];
    recapFor = sessionId;
    el('recap').hidden = false;
    el('recap-text').value = s && s.recapText ? s.recapText : buildRecap(sessionId);
    el('recap').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ---- Clicks and changes ---------------------------------------------------------- */
  document.addEventListener('click', function (e) {
    var t = e.target, b;
    if ((b = t.closest('[data-stop]'))) { show(b.getAttribute('data-stop')); return; }
    if ((b = t.closest('[data-item]'))) {
      itemAt[current.id] = b.getAttribute('data-item');
      var box = b.getAttribute('data-item').indexOf('field:') === 0 ? el('form').querySelector('[data-field="' + b.getAttribute('data-item').slice(6) + '"]') : null;
      if (box) { box.focus(); box.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      paintPath(); return;
    }
    if ((b = t.closest('[data-hw]'))) {
      var it = current.items.filter(function (x) { return x.id === b.getAttribute('data-hw'); })[0];
      itemAt[current.id] = it.id;
      el('hw-text').value = it.kind === 'question' ? it.text : 'Find: ' + itemLabel(it);
      el('hw-due').value = Coach.client(ID).nextSessionAt || '';
      el('hw-text').setAttribute('data-for', it.id);
      el('hw-text').focus(); el('hw-text').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if ((b = t.closest('[data-tab]'))) { noteTab = b.getAttribute('data-tab'); Array.prototype.forEach.call(el('notes').querySelectorAll('[role="tab"]'), function (x) { x.setAttribute('aria-selected', String(x === b)); }); paintNotes(); return; }
    if ((b = t.closest('[data-add]'))) { Coach.addItem(ID, b.getAttribute('data-add'), {}); buildWork(); paintLive(); return; }
    if ((b = t.closest('[data-remove]'))) { var pr = b.getAttribute('data-remove').split(':'); Coach.removeItem(ID, pr[0], pr[1]); buildWork(); paintLive(); return; }
    if ((b = t.closest('[data-move]'))) {
      var ids = stops.map(function (s) { return s.id; }), k = ids.indexOf(b.getAttribute('data-move'));
      if (k > 0) { ids.splice(k - 1, 0, ids.splice(k, 1)[0]); Coach.updateClient(ID, { stopOrder: ids }); paintAll(); }
      return;
    }
    if ((b = t.closest('[data-skip]'))) {
      var sk = Object.assign({}, Coach.client(ID).skipped || {}), sid = b.getAttribute('data-skip');
      if (sk[sid]) delete sk[sid]; else sk[sid] = true;
      Coach.updateClient(ID, { skipped: sk }); paintAll(); return;
    }
    if ((b = t.closest('[data-rm-note]'))) { Coach.removeNote(ID, b.getAttribute('data-rm-note')); paintLive(); return; }
    if ((b = t.closest('[data-resolve]'))) { var cm = rec().comments.filter(function (x) { return x.id === b.getAttribute('data-resolve'); })[0]; Coach.resolveComment(ID, cm.id, !cm.resolvedAt); paintNotes(); return; }
    if ((b = t.closest('[data-back]'))) { back(+b.getAttribute('data-back')); return; }
    if ((b = t.closest('[data-detour-stop]'))) { el('detour-dialog').close(); pushDetour(); show(b.getAttribute('data-detour-stop')); return; }
    switch (t.id) {
      case 'btn-detour': openDetour(); return;
      case 'detour-cancel': el('detour-dialog').close(); return;
      case 'btn-dec-add': Coach.addDecision(ID, {}); buildWork(); paintLive(); return;
      case 'btn-note-add': {
        var kind = (el('notes').querySelector('input[name="note-kind"]:checked') || {}).value || 'coach', s0 = open();
        if (!el('note-text').value.trim()) return;
        if (noteTab === 'session' && !s0) { UI.say('top-say', 'Start the session first; a session note belongs to one.', 'bad'); return; }
        Coach.addNote(ID, { kind: kind, text: el('note-text').value, stopId: noteTab === 'stop' && current ? current.id : null, sessionId: s0 ? s0.id : null });
        el('note-text').value = ''; paintLive(); return;
      }
      case 'btn-start': {
        Coach.startSession(ID); visited = {}; if (current) visited[current.id] = true;
        UI.say('top-say', 'Session started. Today\'s numbers are frozen, so the recap can show what changed.', 'good'); paintAll(); return;
      }
      case 'btn-end': {
        var s1 = open(); if (!s1) return;
        var ticked = ticksSince(s1.startedAt);
        var covered = Object.keys(visited).concat(ticked.map(function (x) { return x.stopId; })).filter(function (x, i, a) { return a.indexOf(x) === i; });
        Coach.endSession(ID, s1.id, { stopsCovered: covered, ticked: ticked });
        UI.say('top-say', 'Session ended. The recap is below.', 'good'); paintAll(); showRecap(s1.id); return;
      }
      case 'btn-client-view': {
        var w = window.open('client.html?client=' + encodeURIComponent(ID) + '&presenter=1', 'coach-client-view');
        if (!w) UI.say('top-say', 'The browser blocked the new window. Allow pop-ups for this page, or open Client view from Coach Home.', 'bad');
        return;
      }
      case 'btn-hw-add': {
        var s2 = open();
        var hw = Coach.addHomework(ID, { text: el('hw-text').value, dueOn: el('hw-due').value || null, stopId: current ? current.id : null, itemId: el('hw-text').getAttribute('data-for') || null, sessionId: s2 ? s2.id : null });
        if (hw) { el('hw-text').value = ''; el('hw-text').removeAttribute('data-for'); paintLive(); }
        return;
      }
      case 'btn-cm-add': {
        var tv = el('cm-target').value.split(':');
        if (Coach.addComment(ID, { target: { kind: tv[0], id: tv.slice(1).join(':') }, by: el('cm-by').value, text: el('cm-text').value })) { el('cm-text').value = ''; paintNotes(); }
        return;
      }
      case 'btn-recap-save': Coach.saveRecap(ID, recapFor, el('recap-text').value); UI.say('recap-say', 'Saved with the session.', 'good'); return;
      case 'btn-recap-copy': {
        var txt = el('recap-text').value;
        (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { UI.say('recap-say', 'Copied. Paste it into an email.', 'good'); },
          function () { el('recap-text').select(); UI.say('recap-say', 'Selected: press Ctrl+C (or Cmd+C) to copy.', null); });
        return;
      }
      case 'btn-recap-print': {
        Coach.saveRecap(ID, recapFor, el('recap-text').value);
        el('print-page').innerHTML = '<h1 style="font-size:20px">' + esc(client.name) + '</h1><pre style="white-space:pre-wrap;font:13px/1.45 system-ui,sans-serif">' + esc(el('recap-text').value) + '</pre><p style="font-size:11px">Prepared by your coach. Not investment advice.</p>';
        document.body.classList.add('printing-recap'); el('print-page').hidden = false;
        UI.say('recap-say', 'In the dialog, choose "Save as PDF" as the destination.', null);
        window.print();
        setTimeout(function () { document.body.classList.remove('printing-recap'); el('print-page').hidden = true; }, 500);
        return;
      }
      case 'btn-recap-seal': {
        var pass = el('recap-pass').value, st2 = SLAF.Vault.strength(pass);
        if (!st2.ok) { UI.say('recap-say', st2.why, 'bad'); return; }
        Coach.saveRecap(ID, recapFor, el('recap-text').value);
        Coach.seal(Coach.recapFile(ID, el('recap-text').value), pass).then(function (sealed) { UI.download(Coach.filename('recap'), sealed); UI.say('recap-say', 'Saved a locked recap. Give the client the password another way.', 'good'); },
          function (err) { UI.say('recap-say', err.message, 'bad'); });
        return;
      }
    }
  });
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.matches('#form [data-field]')) { saveBox(t); return; }
    if (t.matches('[data-rough]')) {
      var f = t.getAttribute('data-rough'), v = Fields.read(h(), f);
      if (v !== null) { Coach.setField(ID, f, v, null, { rough: t.checked }); paintLive(); }
      return;
    }
    if (t.matches('[data-dec]')) {
      var p = {}; p[t.getAttribute('data-dec')] = t.type === 'checkbox' ? t.checked : (t.value || null);
      Coach.setDecision(ID, t.getAttribute('data-dec-id'), p); paintLive(); return;
    }
    if (t.matches('[data-tick]')) {
      Coach.tick(ID, current.id, t.getAttribute('data-tick'), t.checked);
      itemAt[current.id] = t.getAttribute('data-tick');
      if (open()) visited[current.id] = true;
      paintStepbar(); paintPath(); return;
    }
    if (t.matches('[data-hw-done]')) { Coach.setHomeworkDone(ID, t.getAttribute('data-hw-done'), t.checked); paintLive(); return; }
    if (t.id === 'path-template') { Coach.updateClient(ID, { pathId: t.value, stopOrder: null }); current = null; refreshClient(); stops = Session.path(T.sessionPaths, client.pathId, client); var st = Session.stage(stops, h(), T, ctxFor(null)); show((st.stop || stops[0]).id); return; }
  });

  Tables.load().then(function (tables) {
    T = tables;
    Fields.use(T.coachFields);
    document.title = 'Session: ' + client.name;
    el('path-template').innerHTML = (T.sessionPaths.paths || []).map(function (p) { return '<option value="' + esc(p.id) + '"' + (p.id === client.pathId ? ' selected' : '') + '>' + esc(p.label) + '</option>'; }).join('');
    stops = Session.path(T.sessionPaths, client.pathId, client);
    buildRail();
    var st = Session.stage(stops, h(), T, ctxFor(null));
    show((st.stop || stops[0]).id);
    var s = open();
    if (s) UI.say('top-say', 'A session is open from ' + UI.day(s.startedAt) + '. End it when you are done.', null);
  });
})();
