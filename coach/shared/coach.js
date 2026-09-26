/* ==========================================================================
   coach/shared/coach.js, the coach app's store. CD-002.
   --------------------------------------------------------------------------
   Everything Coach Mode keeps, under its own 'coach.' keys in this browser.
   It never reads or writes a SPARKS key ('slaf.'), and SPARKS never reads
   these: the coach's own household in SPARKS is untouched by any of this.

     coach.roster.v1                the roster: names, dates, the path and its
                                    ticks, import mappings. No money, ever.
     coach.client.<id>.v1           { household, coach } for one client
     coach.client.<id>.snaps.v1     [{ id, at, reason, household }], append-only

   Every call names its client. There is no "current client" anywhere, so a
   page can never draw one client with another's numbers.

   THE ROSTER
     roster() clients({ archived }) client(id) addClient({ name, pathId, demo })
     updateClient(id, patch) archive(id, on) removeClient(id)
     tick(id, stopId, itemId, on) ticked(id, stopId, itemId)
     saveTemplate(name, columns) templates()

   ONE CLIENT
     household(id)  record(id)      read (a fresh copy every time)
     setField(id, fieldId, value, itemId, opts)   through coach/shared/fields.js
     addItem(id, list, fields) removeItem(id, list, itemId)
     snapshot(id, reason) snapshots(id) snapshotHousehold(id, snapId)
     addNote addHomework setHomeworkDone removeNote
     startSession endSession openSession saveRecap
     addDecision setDecision        the decisions stop (go / wait / no)
     addCheckin addComment resolveComment
     applyQuick(id, plan, ctx)      a quick-entry plan (coach/engines/quickentry.js)
     sheetTargets suggest sheetPlan applySheet   the Google Sheet import
     ensureDemo(Demo)               the demo client, example numbers

   FILES (sealed with shared/vault.js; each carries slafCoachExport)
     clientFile(id) allFile() recapFile(id, text) filename(kind)
     seal(obj, passphrase) openFile(text, passphrase) restore(obj, { replace })

     onChange(fn)                   any coach key written, here or in another
                                    window (the Client View follows the Session)

   DISPLAY PREFERENCES (coach.prefs.v1): how the coach likes things drawn.
   Never money. { charts: { <chartId>: { type, theme, colors: { seriesId: hue } } },
   theme (the default colour order), welcomeSeen }
     prefs() setPref(key, value) chartPref(id) setChartPref(id, patch)
   ========================================================================== */
(function (root, factory) {
  var node = typeof module === 'object' && module.exports;
  var g = root || (typeof globalThis !== 'undefined' ? globalThis : {});
  var deps = node
    ? { Schema: require('./schema.js'), Money: require('./money.js'), Fields: require('./fields.js'), Vault: require('./vault.js') }
    : { Schema: g.SLAF && g.SLAF.Schema, Money: g.SLAF && g.SLAF.Money, Fields: g.SLAF && g.SLAF.Fields, Vault: g.SLAF && g.SLAF.Vault };
  var api = factory(deps, g);
  if (node) module.exports = api;
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Coach = api; }
})(typeof self !== 'undefined' ? self : null, function (D, g) {
  'use strict';
  var Schema = D.Schema, Money = D.Money, Fields = D.Fields;
  var ROSTER = 'coach.roster.v1';
  var PREFS = 'coach.prefs.v1';
  var SIGNATURE = 1;
  var DEFAULT_PATH = 'default';
  var DEMO_ID = 'demo';
  var listeners = [];

  /* ---- Storage: localStorage, or memory where it is refused --------------- */
  var memory = {};
  function ls() { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; } }
  function get(k) { var s = ls(); if (!s) return k in memory ? memory[k] : null; try { return s.getItem(k); } catch (e) { return null; } }
  function set(k, v) { var s = ls(); if (!s) { memory[k] = v; return; } s.setItem(k, v); }
  function del(k) { var s = ls(); if (!s) { delete memory[k]; return; } try { s.removeItem(k); } catch (e) { /* fine */ } }
  function keys() {
    var s = ls(), out = [];
    if (!s) return Object.keys(memory);
    try { for (var i = 0; i < s.length; i++) { var k = s.key(i); if (k) out.push(k); } } catch (e) { /* none */ }
    return out;
  }
  function notify(what) { listeners.slice().forEach(function (fn) { try { fn(what); } catch (e) { /* a listener must not break a write */ } }); }
  function onChange(fn) { listeners.push(fn); return function () { var i = listeners.indexOf(fn); if (i !== -1) listeners.splice(i, 1); }; }
  if (g && g.addEventListener) g.addEventListener('storage', function (e) { if (e.key && e.key.indexOf('coach.') === 0) notify(e.key); });

  function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
  function nowIso(now) { return (now ? new Date(now) : new Date()).toISOString(); }
  function validId(id) { return typeof id === 'string' && /^[a-z0-9_-]{1,40}$/.test(id); }
  function newId() { return 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function clientKey(id) { if (!validId(id)) throw new Error('Not a client id: ' + id); return 'coach.client.' + id + '.v1'; }
  function snapKey(id) { if (!validId(id)) throw new Error('Not a client id: ' + id); return 'coach.client.' + id + '.snaps.v1'; }

  /* ---- Display preferences ------------------------------------------------- */
  function prefs() { var o = null; try { o = JSON.parse(get(PREFS) || 'null'); } catch (e) { o = null; } if (!o || typeof o !== 'object') o = {}; if (!o.charts || typeof o.charts !== 'object') o.charts = {}; return o; }
  function writePrefs(o) { set(PREFS, JSON.stringify(o)); notify(PREFS); }
  function setPref(key, value) { var o = prefs(); if (value === null || value === undefined) delete o[key]; else o[key] = value; writePrefs(o); return o; }
  function chartPref(id) { var o = prefs(); return Object.assign({ theme: o.theme || null }, o.charts[id] || {}); }
  function setChartPref(id, patch) {
    var o = prefs(), c = Object.assign({}, o.charts[id] || {}, patch || {});
    if (patch && patch.colors) c.colors = Object.assign({}, (o.charts[id] || {}).colors || {}, patch.colors);
    Object.keys(c).forEach(function (k) { if (c[k] === null || c[k] === undefined) delete c[k]; });
    o.charts[id] = c; writePrefs(o); return c;
  }

  /* ---- The roster --------------------------------------------------------- */
  function emptyRoster() { return { version: 1, clients: [], importTemplates: {} }; }
  function readRoster() {
    var o = null; try { o = JSON.parse(get(ROSTER) || 'null'); } catch (e) { o = null; }
    if (!o || !Array.isArray(o.clients)) o = emptyRoster();
    if (!o.importTemplates || typeof o.importTemplates !== 'object') o.importTemplates = {};
    return o;
  }
  function writeRoster(o) { set(ROSTER, JSON.stringify(o)); notify(ROSTER); }
  function find(o, id) { for (var i = 0; i < o.clients.length; i++) if (o.clients[i].id === id) return o.clients[i]; return null; }
  function roster() { return clone(readRoster()); }
  function clients(opts) {
    var arch = !!(opts && opts.archived);
    return readRoster().clients.filter(function (c) { return !!c.archived === arch; })
      .sort(function (a, b) { return (b.demo ? 1 : 0) - (a.demo ? 1 : 0) || String(a.name).localeCompare(String(b.name)); }).map(clone);
  }
  function client(id) { var c = find(readRoster(), id); return c ? clone(c) : null; }
  function cleanName(n) { return String(n === null || n === undefined ? '' : n).replace(/\s+/g, ' ').trim().slice(0, 60); }
  function addClient(f) {
    f = f || {};
    var name = cleanName(f.name);
    if (!name) throw new Error('A client needs a name or a nickname.');
    var o = readRoster();
    var id = f.id && validId(f.id) && !find(o, f.id) ? f.id : newId();
    var c = { id: id, name: name, createdAt: nowIso(f.now), archived: false, pathId: f.pathId || DEFAULT_PATH, stops: {}, nextSessionAt: null, demo: !!f.demo, stopOrder: null, skipped: {} };
    o.clients.push(c);
    writeRoster(o);
    return clone(c);
  }
  var EDITABLE = ['name', 'pathId', 'nextSessionAt', 'stopOrder', 'skipped'];
  function updateClient(id, patch) {
    var o = readRoster(), c = find(o, id); if (!c) return null;
    Object.keys(patch || {}).forEach(function (k) { if (EDITABLE.indexOf(k) !== -1) c[k] = k === 'name' ? (cleanName(patch[k]) || c.name) : clone(patch[k]); });
    writeRoster(o); return clone(c);
  }
  function archive(id, on) { var o = readRoster(), c = find(o, id); if (!c) return null; c.archived = on !== false; writeRoster(o); return clone(c); }
  function removeClient(id) {
    var o = readRoster();
    var i = o.clients.map(function (c) { return c.id; }).indexOf(id);
    if (i === -1) return null;
    var gone = o.clients.splice(i, 1)[0];
    writeRoster(o);
    del(clientKey(id)); del(snapKey(id));
    notify(clientKey(id));
    return gone;
  }
  function tick(id, stopId, itemId, on, now) {
    var o = readRoster(), c = find(o, id); if (!c) return null;
    c.stops = c.stops || {};
    var st = c.stops[stopId] = c.stops[stopId] || { items: {} };
    st.items = st.items || {};
    if (on === false) delete st.items[itemId]; else if (!st.items[itemId]) st.items[itemId] = nowIso(now);
    writeRoster(o);
    return st.items[itemId] || null;
  }
  function ticked(id, stopId, itemId) {
    var c = find(readRoster(), id);
    return c && c.stops && c.stops[stopId] && c.stops[stopId].items ? c.stops[stopId].items[itemId] || null : null;
  }
  function saveTemplate(name, columns) {
    var n = cleanName(name); if (!n) throw new Error('A mapping needs a name.');
    var o = readRoster(), cols = {};
    Object.keys(columns || {}).forEach(function (h) { cols[String(h)] = columns[h] ? String(columns[h]) : null; });
    o.importTemplates[n] = { columns: cols, savedAt: nowIso() };
    writeRoster(o); return clone(o.importTemplates[n]);
  }
  function templates() { return clone(readRoster().importTemplates); }

  /* ---- The coach record (what a session leaves beside the household) ------- */
  function str(v, max) { return typeof v === 'string' ? v.slice(0, max || 4000) : null; }
  function iso(v) { return typeof v === 'string' && v ? v : null; }
  function cents(v) { return typeof v === 'number' && isFinite(v) ? Math.round(v) : null; }
  function nid(p) { return Schema.newId(p); }
  var MAKE = {
    sessions: function (f) { return { id: f.id || nid('cs'), startedAt: iso(f.startedAt), endedAt: iso(f.endedAt), startSnapshotId: f.startSnapshotId || null, endSnapshotId: f.endSnapshotId || null,
      stopsCovered: Array.isArray(f.stopsCovered) ? f.stopsCovered.filter(function (x) { return typeof x === 'string'; }) : [],
      ticked: Array.isArray(f.ticked) ? f.ticked.filter(function (t) { return t && typeof t.stopId === 'string' && typeof t.itemId === 'string'; }).map(function (t) { return { stopId: t.stopId, itemId: t.itemId }; }) : [],
      recapText: str(f.recapText, 20000), durationMs: typeof f.durationMs === 'number' && f.durationMs >= 0 ? f.durationMs : null }; },
    notes: function (f) { return { id: f.id || nid('cn'), kind: f.kind === 'shared' ? 'shared' : 'coach', stopId: f.stopId || null, sessionId: f.sessionId || null, text: str(f.text) || '', at: iso(f.at), source: ['typed', 'quick', 'import'].indexOf(f.source) >= 0 ? f.source : 'typed' }; },
    homework: function (f) { return { id: f.id || nid('hw'), text: str(f.text, 500) || '', dueOn: iso(f.dueOn), stopId: f.stopId || null, itemId: f.itemId || null, sessionId: f.sessionId || null, at: iso(f.at), doneAt: iso(f.doneAt) }; },
    checkins: function (f) {
      var b = {}; if (f.balances && typeof f.balances === 'object') Object.keys(f.balances).forEach(function (k) { var c = cents(f.balances[k]); if (c !== null) b[k] = c; });
      return { id: f.id || nid('ci'), date: iso(f.date), balances: b, incomeCents: cents(f.incomeCents), feeling: typeof f.feeling === 'number' && f.feeling >= 1 && f.feeling <= 5 ? Math.round(f.feeling) : null,
        text: str(f.text, 2000) || '', homeworkTicked: Array.isArray(f.homeworkTicked) ? f.homeworkTicked.filter(function (x) { return typeof x === 'string'; }) : [], enteredBy: f.enteredBy === 'client' ? 'client' : 'coach', at: iso(f.at) }; },
    comments: function (f) { var t = f.target || {};
      return { id: f.id || nid('cm'), target: { kind: ['row', 'goal', 'recap'].indexOf(t.kind) >= 0 ? t.kind : 'row', id: typeof t.id === 'string' ? t.id : null },
        by: f.by === 'client' ? 'client' : 'coach', loggedByCoach: f.by === 'client' && f.loggedByCoach !== false, at: iso(f.at), text: str(f.text, 2000) || '', resolvedAt: iso(f.resolvedAt) }; },
    decisions: function (f) { return { id: f.id || nid('dc'), label: str(f.label, 120) || 'A decision', startsOn: iso(f.startsOn), verdict: ['go', 'wait', 'no'].indexOf(f.verdict) >= 0 ? f.verdict : null, showClient: f.showClient === true, note: str(f.note, 500) }; }
  };
  function makeRecord(f) {
    f = f || {};
    var r = {};
    Object.keys(MAKE).forEach(function (k) { r[k] = Array.isArray(f[k]) ? f[k].map(function (x) { return MAKE[k](x || {}); }) : []; });
    return r;
  }

  /* ---- One client's data ---------------------------------------------------- */
  function readClient(id) {
    var key = clientKey(id);                   /* a bad id throws here, before any read */
    var o = null; try { o = JSON.parse(get(key) || 'null'); } catch (e) { o = null; }
    return { household: Schema.createHousehold((o && o.household) || { meta: { createdAt: nowIso() } }), coach: makeRecord(o && o.coach) };
  }
  function writeClient(id, data) {
    if (!find(readRoster(), id)) throw new Error('No such client.');
    set(clientKey(id), JSON.stringify({ household: data.household, coach: data.coach }));
    notify(clientKey(id));
  }
  function household(id) { return readClient(id).household; }
  function record(id) { return readClient(id).coach; }
  function change(id, fn) { var d = readClient(id); var out = fn(d); writeClient(id, d); return clone(out); }
  function setField(id, fieldId, value, itemId, opts) { return change(id, function (d) { Fields.write(d.household, fieldId, value, itemId, opts); return Fields.read(d.household, fieldId, itemId); }); }
  function addItem(id, list, fields) { return change(id, function (d) { return Fields.addItem(d.household, list, fields); }); }
  function removeItem(id, list, itemId) { return change(id, function (d) { Fields.removeItem(d.household, list, itemId); return true; }); }

  /* ---- Snapshots -------------------------------------------------------- */
  function snapshots(id) { try { var a = JSON.parse(get(snapKey(id)) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function snapshot(id, reason, now) {
    var list = snapshots(id);
    var s = { id: nid('snap'), at: nowIso(now), reason: reason || null, household: household(id) };
    list.push(s);
    set(snapKey(id), JSON.stringify(list));
    return { id: s.id, at: s.at, reason: s.reason };
  }
  function snapshotHousehold(id, snapId) { var s = snapshots(id).filter(function (x) { return x.id === snapId; })[0]; return s ? Schema.createHousehold(s.household) : null; }

  /* ---- Notes, homework, sessions, decisions ---------------------------------- */
  function push(id, list, f) { return change(id, function (d) { var x = MAKE[list](f); d.coach[list].push(x); return x; }); }
  function patch(id, list, itemId, fn) { return change(id, function (d) { var x = d.coach[list].filter(function (y) { return y.id === itemId; })[0]; if (x) fn(x, d); return x || null; }); }
  function addNote(id, f) { var t = String((f && f.text) || '').trim(); return t ? push(id, 'notes', Object.assign({}, f, { text: t, at: nowIso(f.now) })) : null; }
  function removeNote(id, noteId) { return change(id, function (d) { d.coach.notes = d.coach.notes.filter(function (n) { return n.id !== noteId; }); return true; }); }
  function addHomework(id, f) { var t = String((f && f.text) || '').trim(); return t ? push(id, 'homework', Object.assign({}, f, { text: t, at: nowIso(f.now) })) : null; }
  function setHomeworkDone(id, hwId, on, now) { return patch(id, 'homework', hwId, function (x) { x.doneAt = on === false ? null : nowIso(now); }); }
  function openSession(id) { var l = record(id).sessions.filter(function (s) { return !s.endedAt; }); return l.length ? l[l.length - 1] : null; }
  function startSession(id, now) {
    var open = openSession(id); if (open) return open;
    var snap = snapshot(id, 'coach-session-start', now);
    return push(id, 'sessions', { startedAt: nowIso(now), startSnapshotId: snap.id });
  }
  function endSession(id, sessionId, f) {
    var o = f || {};
    var snap = snapshot(id, 'coach-session-end', o.now);
    return patch(id, 'sessions', sessionId, function (s) {
      var end = new Date(o.now || Date.now());
      s.endedAt = end.toISOString(); s.endSnapshotId = snap.id;
      s.durationMs = s.startedAt ? Math.max(0, end.getTime() - Date.parse(s.startedAt)) : null;
      if (Array.isArray(o.stopsCovered)) s.stopsCovered = o.stopsCovered.slice();
      if (Array.isArray(o.ticked)) s.ticked = o.ticked.slice();
    });
  }
  function saveRecap(id, sessionId, text) { return patch(id, 'sessions', sessionId, function (s) { s.recapText = String(text || '').slice(0, 20000); }); }
  function addDecision(id, f) { return push(id, 'decisions', f || {}); }
  function setDecision(id, decId, p) { return patch(id, 'decisions', decId, function (x) { var n = MAKE.decisions(Object.assign({}, x, p)); Object.assign(x, n, { id: x.id }); }); }

  /* A check-in: each reported balance is written to the field that holds it
     (a field id, or 'fieldId:itemId' for one line); the record keeps what
     was reported. A box left empty is not reported: never a zero. */
  function addCheckin(id, f) {
    var o = f || {};
    return change(id, function (d) {
      var ci = MAKE.checkins(Object.assign({}, o, { at: nowIso(o.now), date: o.date || Schema.localDay(o.now ? new Date(o.now) : undefined) }));
      Object.keys(ci.balances).forEach(function (k) { var p = k.split(':'); Fields.write(d.household, p[0], ci.balances[k], p[1] || null, { now: ci.at }); });
      ci.homeworkTicked.forEach(function (hid) { var hw = d.coach.homework.filter(function (x) { return x.id === hid; })[0]; if (hw && !hw.doneAt) hw.doneAt = ci.at; });
      d.coach.checkins.push(ci);
      return ci;
    });
  }
  function addComment(id, f) { var t = String((f && f.text) || '').trim(); return t ? push(id, 'comments', Object.assign({}, f, { text: t, at: nowIso(f.now) })) : null; }
  function resolveComment(id, cmId, on, now) { return patch(id, 'comments', cmId, function (x) { x.resolvedAt = on === false ? null : nowIso(now); }); }

  /* ---- Quick entry: a plan from coach/engines/quickentry.js, saved ---------- */
  function applyQuick(id, plan, ctx) {
    var c = ctx || {};
    if (!plan || plan.kind === 'empty') return { written: 0, note: null };
    var written = 0, newItem = null;
    if (plan.kind === 'rows') {
      change(id, function (d) {
        if (plan.add) newItem = Fields.addItem(d.household, plan.add.list, plan.add.fields);
        plan.writes.forEach(function (w) {
          var item = w.item === 'new' ? newItem : w.item;
          Fields.write(d.household, w.field, w.value, item, { rough: true });
          written++;
        });
      });
    }
    var note = plan.note ? addNote(id, { kind: 'coach', text: plan.note, stopId: c.stopId || null, sessionId: c.sessionId || null, source: 'quick' }) : null;
    return { written: written, note: note, itemId: newItem };
  }

  /* ---- The sheet import -------------------------------------------------------
     A column maps to a single field ('field:<id>') or a quick-entry word
     ('qe:<word>', so 'Car loan' reads its cell as 'car 12000'). The last
     filled cell of each column is read; an unmapped column, or a cell that
     does not read, becomes a private note. Never a guessed number. */
  function sheetTargets(T) {
    var F = (T.coachFields && T.coachFields.fields) || {};
    var singles = Object.keys(F).filter(function (k) { return !F[k].list && (F[k].unit === 'cents' || F[k].unit === 'rate'); })
      .map(function (k) { return { id: 'field:' + k, label: F[k].label, unit: F[k].unit, words: [k.toLowerCase(), String(F[k].label).toLowerCase()] }; });
    var qe = ((T.quickEntry && T.quickEntry.entries) || []).map(function (e) {
      return { id: 'qe:' + e.words[0], label: e.kind === 'debt' ? e.label + ', balance (or a payment with /mo)' : e.kind === 'asset' ? e.label + ', what is in it' : e.label + (e.period === 'year' ? ', a year' : ', a month'), unit: 'quick', words: e.words };
    });
    return singles.concat(qe);
  }
  function suggest(headers, T) {
    var targets = sheetTargets(T), out = {};
    (headers || []).forEach(function (hd) {
      var h = String(hd).toLowerCase().replace(/[^a-z0-9()% ]+/g, ' ').replace(/\s+/g, ' ').trim(), best = null;
      targets.forEach(function (t) { t.words.forEach(function (w) { if (w && (h === w || h.indexOf(w + ' ') === 0 || h === w) && (!best || w.length > best.len)) best = { id: t.id, len: w.length }; }); });
      out[hd] = best ? best.id : null;
    });
    return out;
  }
  function sheetPlan(text, columns, T, Csv, Q) {
    var parsed = Csv.parse(String(text || ''));
    var headers = parsed.headers || [], cols = columns || {}, targets = {};
    sheetTargets(T).forEach(function (t) { targets[t.id] = t; });
    var writes = [], notes = [], bad = [];
    headers.forEach(function (hd, i) {
      var raw = null;
      for (var r = parsed.rows.length - 1; r >= 0; r--) { var cell = parsed.rows[r][i]; if (cell !== undefined && String(cell).trim() !== '') { raw = String(cell).trim(); break; } }
      if (raw === null) return;
      var t = cols[hd] && targets[cols[hd]] ? targets[cols[hd]] : null;
      if (!t) { notes.push('From the sheet, ' + hd + ': ' + raw); return; }
      if (t.unit === 'quick') {
        var plan = Q.parse(t.words[0] + ' ' + raw, T.quickEntry, null);
        if (plan.kind !== 'rows') { bad.push(hd); notes.push('From the sheet, ' + hd + ': ' + raw); return; }
        writes.push({ header: hd, target: t.id, raw: raw, text: plan.text, label: t.label });
        return;
      }
      var fid = t.id.slice(6);
      var v = t.unit === 'cents' ? Csv.amount(raw) : (function () { var n = Csv.number(raw); return n.blank || n.bad || n.value === null ? undefined : Number(((n.percent || n.value > 1) ? n.value / 100 : n.value).toFixed(8)); })();
      if (typeof v !== 'number') { bad.push(hd); notes.push('From the sheet, ' + hd + ' (did not read as ' + (t.unit === 'cents' ? 'an amount' : 'a rate') + '): ' + raw); return; }
      writes.push({ header: hd, target: t.id, field: fid, raw: raw, value: v, label: t.label });
    });
    return { headers: headers, writes: writes, notes: notes, bad: bad };
  }
  function applySheet(id, plan, T, Q) {
    var n = 0;
    plan.writes.forEach(function (w) {
      /* read again against the household as it now stands, so a second
         column of the same kind updates the line the first one added */
      if (w.text) { n += applyQuick(id, Q.parse(w.text, T.quickEntry, household(id)), {}).written; return; }
      setField(id, w.field, w.value, null, { rough: true }); n++;
    });
    plan.notes.forEach(function (t) { addNote(id, { kind: 'coach', text: t, source: 'import' }); });
    return { written: n, notes: plan.notes.length };
  }

  /* ---- The demo client: the SPARKS example persona, three dated goals ---------- */
  function ensureDemo(Demo, now) {
    var have = readRoster().clients.filter(function (c) { return c.demo; })[0];
    if (have) return clone(have);
    var c = addClient({ id: DEMO_ID, name: 'Demo client (example numbers)', demo: true, now: now });
    var h = Demo.build();
    h.meta = h.meta || {}; h.meta.isDemo = true;
    var y = new Date(now || Date.now()).getFullYear();
    h.goals = [
      Schema.createGoal({ name: 'Wedding', targetDate: (y + 2) + '-06-01', savedCents: 300000, monthlyContributionCents: 40000, lumpTargetCents: 2500000 }),
      Schema.createGoal({ name: 'House down payment', targetDate: (y + 5) + '-09-01', savedCents: 500000, monthlyContributionCents: 60000, lumpTargetCents: 6000000 }),
      Schema.createGoal({ name: 'Sabbatical', targetDate: (y + 4) + '-01-01', savedCents: 0, monthlyContributionCents: null, lumpTargetCents: 1800000 })
    ];
    /* Three example sessions before today, so the pictures have a past:
       each is a frozen household with the numbers a little further back,
       and a short recap. Example numbers only, like the persona itself. */
    var base = now ? new Date(now) : new Date();
    function ago(months, days) { var d = new Date(base.getTime()); d.setMonth(d.getMonth() - months); d.setDate(d.getDate() - (days || 0)); return d; }
    function past(cash, invested, card, wedding) {
      var p = Schema.createHousehold(JSON.parse(JSON.stringify(h)));
      p.assets.forEach(function (a) { if (a.category === 'cash') a.valueCents = cash; else if (a.category === 'investment' || a.category === 'retirement') a.valueCents = invested; });
      p.debts.forEach(function (d) { if (d.type === 'credit_card') d.balanceCents = card; });
      p.goals[0].savedCents = wedding;
      return p;
    }
    var stages = [{ at: ago(6), h: past(520000, 4150000, 460000, 0), covered: ['life', 'income', 'spending'], recap: 'First session: the big picture, what lands each month, and a normal month.' },
      { at: ago(4), h: past(690000, 4380000, 410000, 100000), covered: ['debt', 'safety'], recap: 'Every debt listed. The card goes first. Cushion: two and a half months.' },
      { at: ago(2), h: past(830000, 4600000, 360000, 200000), covered: ['assets', 'goals'], recap: 'Accounts listed, the match at work found. Three goals priced.' }];
    var snaps = [], sessions = [];
    stages.forEach(function (st, i) {
      var start = Schema.newId('snap'), end = Schema.newId('snap');
      var endAt = new Date(st.at.getTime() + 55 * 60000);
      snaps.push({ id: start, at: st.at.toISOString(), reason: 'coach-session-start', household: st.h });
      snaps.push({ id: end, at: endAt.toISOString(), reason: 'coach-session-end', household: i + 1 < stages.length ? stages[i + 1].h : st.h });
      sessions.push({ startedAt: st.at.toISOString(), endedAt: endAt.toISOString(), startSnapshotId: start, endSnapshotId: end, stopsCovered: st.covered, ticked: [], recapText: c.name + ', session of ' + st.at.toDateString() + '\n\n' + st.recap, durationMs: 55 * 60000 });
    });
    var checkins = [{ date: Schema.localDay(ago(3)), feeling: 2, text: 'Tight month, the car needed tyres.', enteredBy: 'client', at: ago(3).toISOString() },
      { date: Schema.localDay(ago(2)), feeling: 3, text: 'Paid the card down a bit.', enteredBy: 'client', at: ago(2).toISOString() },
      { date: Schema.localDay(ago(1)), feeling: 4, text: 'Set up the automatic transfer.', enteredBy: 'client', at: ago(1).toISOString() }];
    var notes = [{ kind: 'shared', text: 'The card goes first: it costs the most.', stopId: 'debt', sessionId: null, at: ago(4).toISOString() }];
    var homework = [{ text: 'Find the fee on the 401(k) funds', dueOn: Schema.localDay(ago(-1)), stopId: 'assets', at: ago(2).toISOString() }, { text: 'Move $300 a month to savings automatically', dueOn: Schema.localDay(ago(1)), stopId: 'safety', at: ago(4).toISOString(), doneAt: ago(1).toISOString() }];
    set(snapKey(c.id), JSON.stringify(snaps));
    writeClient(c.id, { household: Schema.createHousehold(h), coach: makeRecord({ sessions: sessions, checkins: checkins, notes: notes, homework: homework,
      decisions: [{ label: 'Buy a car next year', startsOn: (y + 1) + '-03', showClient: true }, { label: 'Move closer to work', startsOn: (y + 2) + '-01', verdict: 'wait', showClient: true }] }) });
    return c;
  }

  /* ---- Files --------------------------------------------------------------- */
  function dataOf(id) { var raw = get(clientKey(id)); return { client: raw, snaps: get(snapKey(id)) }; }
  function clientFile(id, now) {
    var c = client(id); if (!c) throw new Error('No such client.');
    var d = dataOf(id);
    return { slafCoachExport: SIGNATURE, kind: 'client', savedAt: nowIso(now), client: c, data: d.client, snapshots: d.snaps };
  }
  function allFile(now) {
    return { slafCoachExport: SIGNATURE, kind: 'all', savedAt: nowIso(now), importTemplates: templates(),
      clients: readRoster().clients.map(function (c) { var d = dataOf(c.id); return { client: clone(c), data: d.client, snapshots: d.snaps }; }) };
  }
  /* A recap leaves as its text and the client's name: never the household,
     never a coach note (the text is written without them). */
  function recapFile(id, text, now) { var c = client(id); return { slafCoachExport: SIGNATURE, kind: 'recap', savedAt: nowIso(now), client: { name: c ? c.name : null }, text: String(text || '') }; }
  function day(now) { var d = now ? new Date(now) : new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function filename(kind, now) { return 'money-rooms-coach-' + String(kind || 'client').replace(/[^a-z0-9-]/gi, '') + '-' + day(now) + '.json'; }
  function isCoachFile(o) { return !!(o && typeof o === 'object' && o.slafCoachExport === SIGNATURE && ['client', 'all', 'recap'].indexOf(o.kind) !== -1); }
  function vault() { return D.Vault || (g.SLAF && g.SLAF.Vault); }
  function seal(obj, passphrase) {
    var V = vault(); if (!V) return Promise.reject(new Error('The vault is not loaded on this page.'));
    return V.seal(JSON.stringify(obj), passphrase, { hint: 'Money Rooms coach file' }).then(function (t) {
      var env = JSON.parse(t); env.slafCoachExport = SIGNATURE;       /* the envelope says so too, for the repository guard */
      return JSON.stringify(env, null, 2);
    });
  }
  function openFile(text, passphrase) {
    var o = null; try { o = JSON.parse(String(text)); } catch (e) { return Promise.reject(new Error('That file does not read.')); }
    if (o && o.format === 'money-rooms-sealed') {
      var V = vault(); if (!V) return Promise.reject(new Error('The vault is not loaded on this page.'));
      return V.open(text, passphrase).then(function (p) { var inner = JSON.parse(p); if (!isCoachFile(inner)) throw new Error('That protected file is not a coach file.'); return inner; });
    }
    return isCoachFile(o) ? Promise.resolve(o) : Promise.reject(new Error('That is not a coach file.'));
  }
  function restoreOne(e, opts) {
    var o = readRoster();
    if (!e.client || !validId(e.client.id)) return { ok: false, reason: 'A client in that file has no usable id.' };
    if (find(o, e.client.id) && !(opts && opts.replace)) return { ok: false, id: e.client.id, reason: e.client.name + ' is already here. Tick Replace to load the file over them.' };
    var i = o.clients.map(function (c) { return c.id; }).indexOf(e.client.id);
    if (i === -1) o.clients.push(clone(e.client)); else o.clients[i] = clone(e.client);
    writeRoster(o);
    if (e.data) set(clientKey(e.client.id), e.data); else del(clientKey(e.client.id));
    if (e.snapshots) set(snapKey(e.client.id), e.snapshots); else del(snapKey(e.client.id));
    notify(clientKey(e.client.id));
    return { ok: true, id: e.client.id };
  }
  function restore(file, opts) {
    if (!isCoachFile(file)) return [{ ok: false, reason: 'That is not a coach file.' }];
    if (file.kind === 'client') return [restoreOne(file, opts)];
    if (file.kind === 'all') {
      var out = file.clients.map(function (e) { return restoreOne(e, opts); });
      var o = readRoster(); Object.keys(file.importTemplates || {}).forEach(function (n) { if (!o.importTemplates[n]) o.importTemplates[n] = file.importTemplates[n]; }); writeRoster(o);
      return out;
    }
    return [{ ok: false, reason: 'A recap is not a backup.' }];
  }
  /** Every key this app has written: the roster and each client's two. */
  function ownKeys() { return keys().filter(function (k) { return k.indexOf('coach.') === 0; }).sort(); }

  return { ROSTER: ROSTER, PREFS: PREFS, SIGNATURE: SIGNATURE, DEMO_ID: DEMO_ID, onChange: onChange, ownKeys: ownKeys, validId: validId,
    prefs: prefs, setPref: setPref, chartPref: chartPref, setChartPref: setChartPref,
    roster: roster, clients: clients, client: client, addClient: addClient, updateClient: updateClient, archive: archive, removeClient: removeClient,
    tick: tick, ticked: ticked, saveTemplate: saveTemplate, templates: templates,
    household: household, record: record, makeRecord: makeRecord, setField: setField, addItem: addItem, removeItem: removeItem,
    snapshot: snapshot, snapshots: snapshots, snapshotHousehold: snapshotHousehold,
    addNote: addNote, removeNote: removeNote, addHomework: addHomework, setHomeworkDone: setHomeworkDone,
    startSession: startSession, endSession: endSession, openSession: openSession, saveRecap: saveRecap,
    addDecision: addDecision, setDecision: setDecision, addCheckin: addCheckin, addComment: addComment, resolveComment: resolveComment,
    applyQuick: applyQuick, sheetTargets: sheetTargets, suggest: suggest, sheetPlan: sheetPlan, applySheet: applySheet, ensureDemo: ensureDemo,
    clientFile: clientFile, allFile: allFile, recapFile: recapFile, filename: filename, isCoachFile: isCoachFile, seal: seal, openFile: openFile, restore: restore };
});
