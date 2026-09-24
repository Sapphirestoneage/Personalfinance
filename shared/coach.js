/* ==========================================================================
   shared/coach.js, the coach's roster and a client's sealed file. D-339.
   --------------------------------------------------------------------------
   Coach Mode (docs/COACH-MODE.md) keeps one household per client, each in
   its own profile (shared/profiles.js). This module holds what sits ABOVE
   the households: the roster, under 'slaf.coach.v1', and the files that
   carry one client, or all of them, off the device.

   THE ROSTER. No money, ever: names, dates, the path a client is on and the
   items ticked on it. Every number stays in the client's household.
     { version: 1,
       clients: [{ id, name, createdAt, archived, pathId,
                   stops: { <stopId>: { items: { <itemId>: tickedAt } } },
                   nextSessionAt, demo, stopOrder, skipped }],
       importTemplates: { <name>: { columns: { <header>: <rowId> | null } } } }

     roster()                     a copy of the whole store
     clients({ archived })        live clients (or archived ones), demo first
     client(id)                   one entry, or null
     addClient({ name, pathId, demo })  -> the entry (a new profile id)
     updateClient(id, patch)      name, pathId, nextSessionAt, stopOrder, skipped
     archive(id, on)              hide from the roster; nothing is deleted
     removeClient(id)             the entry AND every key of its profile
     tick(id, stopId, itemId, on) an item on the path, ticked for good
     ticked(id, stopId, itemId)   the moment it was ticked, or null
     saveTemplate(name, columns) / templates()   the sheet import mappings

   THE FILES. Plain objects carrying the signature `slafCoachExport`, sealed
   with shared/vault.js before they leave. `.gitignore` refuses their names
   and test/run.js fails if a tracked file carries the signature, because
   this repository is public and a client's numbers must never enter it.
     clientFile(id)               { slafCoachExport, kind: 'client', client, keys }
     allFile()                    { slafCoachExport, kind: 'all', clients: [...] }
     filename(kind, now)          money-rooms-coach-<kind>-YYYY-MM-DD.json
     seal(obj, passphrase)        Promise<sealed text> (the envelope is marked too)
     restore(obj, { replace })    writes each client's profile and roster entry
     openFile(text, passphrase)   Promise<obj>: a sealed or plain coach file

   THE CLIENT'S OWN RECORD. household.coach, in the ACTIVE profile, written
   through the spine like any fact (one labelled change, undoable). Every
   number a coach types still goes through Ownership to the row that owns
   it; the record keeps only what was said and when.
     record()                     household.coach, normalised (empty lists if none)
     addNote({ kind: 'coach'|'shared', text, stopId, sessionId, source })
     removeNote(id)
     addHomework({ text, dueOn, stopId, itemId, sessionId }) / setHomeworkDone(id, on)
     startSession(now)            snapshot the household, open a session
     endSession(id, { stopsCovered, ticked, now })   snapshot again, close it
     openSession()                the session still open, or null
     saveRecap(id, text)          the recap as edited
     snapshotHousehold(snapId)    the household a coach snapshot froze
     addCheckin(fields)           balances written through Ownership, the
                                  report kept as reported (F1)
     addComment(fields) / resolveComment(id, on)   (F2)
     applyQuick(plan, ctx)        a quick-entry plan saved (C5)
     setVerdict(clientId, blockId, 'go'|'wait'|'no'|null)   roster, no money
     setShown(clientId, blockId, on)   a block the Client View may draw
     ensureDemo(Demo)             the demo client, from the example persona
   ========================================================================== */
(function (root, factory) {
  var node = typeof module === 'object' && module.exports;
  var deps = node
    ? { Profiles: require('./profiles.js'), Vault: require('./vault.js'), Schema: require('./schema.js') }
    : { Profiles: root.SLAF && root.SLAF.Profiles, Vault: root.SLAF && root.SLAF.Vault, Schema: root.SLAF && root.SLAF.Schema };
  var g = root || (typeof globalThis !== 'undefined' ? globalThis : {});
  function slaf() { return (g.SLAF) || (typeof globalThis !== 'undefined' && globalThis.SLAF) || {}; }
  var api = factory(deps.Profiles, function () { return deps.Vault || slaf().Vault; }, deps.Schema || slaf().Schema, slaf);
  if (node) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Coach = api; }
})(typeof self !== 'undefined' ? self : null, function (Profiles, vault, Schema, slaf) {
  'use strict';

  var KEY = 'slaf.coach.v1';
  var SIGNATURE = 1;           /* the value of slafCoachExport; bump with the file shape */
  var DEFAULT_PATH = 'default';

  function local() { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; } }
  function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
  function nowIso(now) { return (now ? new Date(now) : new Date()).toISOString(); }

  function empty() { return { version: 1, clients: [], importTemplates: {} }; }
  function read() {
    var s = local(); var raw = null;
    if (s) { try { raw = s.getItem(KEY); } catch (e) { raw = null; } }
    var obj = null;
    if (raw) { try { obj = JSON.parse(raw); } catch (e) { obj = null; } }
    if (!obj || typeof obj !== 'object' || !Array.isArray(obj.clients)) obj = empty();
    if (!obj.importTemplates || typeof obj.importTemplates !== 'object') obj.importTemplates = {};
    return obj;
  }
  function write(obj) {
    var s = local(); if (!s) return false;
    try { s.setItem(KEY, JSON.stringify(obj)); return true; } catch (e) { return false; }
  }

  function roster() { return clone(read()); }
  function clients(opts) {
    var wantArchived = !!(opts && opts.archived);
    return read().clients.filter(function (c) { return !!c.archived === wantArchived; })
      .sort(function (a, b) { return (b.demo ? 1 : 0) - (a.demo ? 1 : 0) || String(a.name).localeCompare(String(b.name)); })
      .map(clone);
  }
  function find(obj, id) { for (var i = 0; i < obj.clients.length; i++) if (obj.clients[i].id === id) return obj.clients[i]; return null; }
  function client(id) { var c = find(read(), id); return c ? clone(c) : null; }

  function cleanName(n) { var s = String(n === null || n === undefined ? '' : n).replace(/\s+/g, ' ').trim().slice(0, 60); return s; }

  function addClient(fields) {
    var f = fields || {};
    var name = cleanName(f.name);
    if (!name) throw new Error('A client needs a name or a nickname.');
    var obj = read();
    var id = f.id && Profiles.validId(f.id) && !find(obj, f.id) ? f.id : Profiles.newId();
    var entry = { id: id, name: name, createdAt: nowIso(f.now), archived: false, pathId: f.pathId || DEFAULT_PATH,
      stops: {}, nextSessionAt: null, demo: !!f.demo, stopOrder: null, skipped: {} };
    obj.clients.push(entry);
    write(obj);
    return clone(entry);
  }
  var EDITABLE = ['name', 'pathId', 'nextSessionAt', 'stopOrder', 'skipped'];
  function updateClient(id, patch) {
    var obj = read(); var c = find(obj, id);
    if (!c) return null;
    Object.keys(patch || {}).forEach(function (k) {
      if (EDITABLE.indexOf(k) === -1) return;
      c[k] = k === 'name' ? (cleanName(patch[k]) || c.name) : clone(patch[k]);
    });
    write(obj);
    return clone(c);
  }
  function archive(id, on) {
    var obj = read(); var c = find(obj, id);
    if (!c) return null;
    c.archived = on !== false;
    write(obj);
    return clone(c);
  }
  function removeClient(id) {
    var obj = read();
    var i = obj.clients.map(function (c) { return c.id; }).indexOf(id);
    if (i === -1) return null;
    var gone = obj.clients.splice(i, 1)[0];
    write(obj);
    Profiles.remove(id);
    return gone;
  }
  function tick(id, stopId, itemId, on, now) {
    var obj = read(); var c = find(obj, id);
    if (!c) return null;
    c.stops = c.stops || {};
    var stop = c.stops[stopId] = c.stops[stopId] || { items: {} };
    stop.items = stop.items || {};
    if (on === false) delete stop.items[itemId];
    else if (!stop.items[itemId]) stop.items[itemId] = nowIso(now);
    write(obj);
    return stop.items[itemId] || null;
  }
  function ticked(id, stopId, itemId) {
    var c = find(read(), id);
    return c && c.stops && c.stops[stopId] && c.stops[stopId].items ? (c.stops[stopId].items[itemId] || null) : null;
  }

  /* ---- Sheet import templates (spec section 8) ------------------------- */
  function saveTemplate(name, columns) {
    var n = cleanName(name);
    if (!n) throw new Error('A template needs a name.');
    var obj = read();
    var cols = {};
    Object.keys(columns || {}).forEach(function (h) { var v = columns[h]; cols[String(h)] = v ? String(v) : null; });
    obj.importTemplates[n] = { columns: cols, savedAt: nowIso() };
    write(obj);
    return clone(obj.importTemplates[n]);
  }
  function templates() { return clone(read().importTemplates); }

  /* ---- Files ------------------------------------------------------------ */
  function clientFile(id, now) {
    var c = client(id);
    if (!c) throw new Error('No such client.');
    return { slafCoachExport: SIGNATURE, kind: 'client', savedAt: nowIso(now), client: c, keys: Profiles.readKeys(id) };
  }
  function allFile(now) {
    var list = read().clients.map(function (c) { return { client: clone(c), keys: Profiles.readKeys(c.id) }; });
    return { slafCoachExport: SIGNATURE, kind: 'all', savedAt: nowIso(now), clients: list, importTemplates: templates() };
  }
  /* A recap leaves as its text and the client's name only: never the
     household, never a coach note (the text is built without them). */
  function recapFile(id, text, now) {
    var c = client(id);
    return { slafCoachExport: SIGNATURE, kind: 'recap', savedAt: nowIso(now), client: { name: c ? c.name : null }, text: String(text || '') };
  }
  function day(now) {
    var d = now ? new Date(now) : new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function filename(kind, now) { return 'money-rooms-coach-' + String(kind || 'client').replace(/[^a-z0-9-]/gi, '') + '-' + day(now) + '.json'; }

  function isCoachFile(obj) { return !!(obj && typeof obj === 'object' && obj.slafCoachExport === SIGNATURE && (obj.kind === 'client' || obj.kind === 'all' || obj.kind === 'recap')); }

  function seal(obj, passphrase) {
    var V = vault();
    if (!V) return Promise.reject(new Error('The vault is not loaded on this page.'));
    return V.seal(JSON.stringify(obj), passphrase, { hint: 'Money Rooms coach file' }).then(function (text) {
      /* The envelope says it is a coach file too, so the repository guard
         catches a sealed one as surely as a plain one. */
      var env = JSON.parse(text);
      env.slafCoachExport = SIGNATURE;
      return JSON.stringify(env, null, 2);
    });
  }
  function openFile(text, passphrase) {
    var V = vault();
    var obj = null;
    try { obj = JSON.parse(String(text)); } catch (e) { return Promise.reject(new Error('That file does not read.')); }
    if (obj && obj.format === 'money-rooms-sealed') {
      if (!V) return Promise.reject(new Error('The vault is not loaded on this page.'));
      return V.open(text, passphrase).then(function (plain) {
        var inner = JSON.parse(plain);
        if (!isCoachFile(inner)) throw new Error('That protected file is not a coach file.');
        return inner;
      });
    }
    if (!isCoachFile(obj)) return Promise.reject(new Error('That is not a coach file.'));
    return Promise.resolve(obj);
  }

  /* Put one client back: the profile's keys and the roster entry. An id
     already on the roster is refused unless { replace: true }. */
  function restoreOne(entry, keys, opts) {
    var obj = read();
    var have = find(obj, entry.client.id);
    if (have && !(opts && opts.replace)) return { ok: false, id: entry.client.id, reason: entry.client.name + ' is already here. Replace to load the file over them.' };
    Profiles.writeKeys(entry.client.id, keys || {});
    obj = read();
    var i = obj.clients.map(function (c) { return c.id; }).indexOf(entry.client.id);
    if (i === -1) obj.clients.push(clone(entry.client)); else obj.clients[i] = clone(entry.client);
    write(obj);
    return { ok: true, id: entry.client.id };
  }
  function restore(file, opts) {
    if (!isCoachFile(file)) return [{ ok: false, reason: 'That is not a coach file.' }];
    if (file.kind === 'client') return [restoreOne({ client: file.client }, file.keys, opts)];
    if (file.kind === 'all') {
      var out = file.clients.map(function (e) { return restoreOne({ client: e.client }, e.keys, opts); });
      if (file.importTemplates) { var obj = read(); Object.keys(file.importTemplates).forEach(function (n) { if (!obj.importTemplates[n]) obj.importTemplates[n] = file.importTemplates[n]; }); write(obj); }
      return out;
    }
    return [{ ok: false, reason: 'A recap is not a backup.' }];
  }

  /* ---- Roster: block verdicts and what the client may see ------------- */
  function setVerdict(id, blockId, v) {
    var obj = read(); var c = find(obj, id); if (!c) return null;
    c.blockVerdicts = c.blockVerdicts || {};
    if (['go', 'wait', 'no'].indexOf(v) >= 0) c.blockVerdicts[blockId] = v; else delete c.blockVerdicts[blockId];
    write(obj); return c.blockVerdicts[blockId] || null;
  }
  function setShown(id, blockId, on) {
    var obj = read(); var c = find(obj, id); if (!c) return null;
    c.shownBlocks = c.shownBlocks || {};
    if (on) c.shownBlocks[blockId] = true; else delete c.shownBlocks[blockId];
    write(obj); return !!c.shownBlocks[blockId];
  }

  /* ---- The client's own record (household.coach, the active profile) ---- */
  function Spine() { var S = slaf().Spine; if (!S) throw new Error('The spine is not loaded.'); return S; }
  function Ownership() { var O = slaf().Ownership; if (!O) throw new Error('Ownership is not loaded.'); return O; }
  function sch() { return Schema || slaf().Schema; }
  function record() { return sch().createCoachRecord(Spine().getProfile().coach || {}); }
  function change(fn) {
    var rec = record();
    var out = fn(rec);
    Spine().updateProfile({ coach: rec });
    return clone(out);
  }
  function addNote(f) {
    var text = String((f && f.text) || '').trim();
    if (!text) return null;
    return change(function (rec) { var n = sch().createCoachNote(Object.assign({}, f, { text: text, at: nowIso(f.now) })); rec.notes.push(n); return n; });
  }
  function removeNote(id) { return change(function (rec) { rec.notes = rec.notes.filter(function (n) { return n.id !== id; }); return true; }); }
  function addHomework(f) {
    var text = String((f && f.text) || '').trim();
    if (!text) return null;
    return change(function (rec) { var hw = sch().createCoachHomework(Object.assign({}, f, { text: text, at: nowIso(f.now) })); rec.homework.push(hw); return hw; });
  }
  function setHomeworkDone(id, on, now) {
    return change(function (rec) { var hw = rec.homework.filter(function (x) { return x.id === id; })[0]; if (hw) hw.doneAt = on === false ? null : nowIso(now); return hw || null; });
  }
  function freeze(reason) {
    var S = Spine();
    var h = S.getProfile();
    if (h.meta) { delete h.meta.undoStack; delete h.meta.redoStack; }
    return S.appendSnapshot({ reason: reason, rawInputs: { household: h } });
  }
  function snapshotHousehold(snapId, profileId) {
    var S = Spine();
    var list = profileId ? S.snapshotsOf(profileId) : S.listSnapshots();
    var snap = list.filter(function (x) { return x.id === snapId; })[0];
    return snap && snap.rawInputs && snap.rawInputs.household ? sch().createHousehold(snap.rawInputs.household) : null;
  }
  function openSession() {
    var list = record().sessions.filter(function (x) { return !x.endedAt; });
    return list.length ? clone(list[list.length - 1]) : null;
  }
  function startSession(now) {
    var open = openSession();
    if (open) return open;
    var d = new Date(now || Date.now());
    var snap = freeze('coach-session-start');
    return change(function (rec) {
      var s = sch().createCoachSession({ startedAt: d.toISOString(), startSnapshotId: snap.id });
      rec.sessions.push(s); return s;
    });
  }
  function endSession(id, f) {
    var o = f || {};
    var snap = freeze('coach-session-end');
    return change(function (rec) {
      var s = rec.sessions.filter(function (x) { return x.id === id; })[0];
      if (!s) return null;
      var end = new Date(o.now || Date.now());
      s.endedAt = end.toISOString();
      s.endSnapshotId = snap.id;
      s.durationMs = s.startedAt ? Math.max(0, end.getTime() - Date.parse(s.startedAt)) : null;
      if (Array.isArray(o.stopsCovered)) s.stopsCovered = o.stopsCovered.slice();
      if (Array.isArray(o.ticked)) s.ticked = o.ticked.slice();
      return s;
    });
  }
  function saveRecap(id, text) {
    return change(function (rec) { var s = rec.sessions.filter(function (x) { return x.id === id; })[0]; if (s) s.recapText = String(text || '').slice(0, 20000); return s || null; });
  }

  /* A check-in (F1): each balance goes to the row that owns it, through
     Ownership, so the Ledger moves; the record keeps what was reported.
     A balance key is a row id, or 'rowId:itemId' for one line of a list. */
  function writeBalance(key, cents) {
    var parts = String(key).split(':');
    Ownership().write(parts[0], cents, parts[1] ? { itemId: parts[1] } : null);
  }
  function addCheckin(f) {
    var o = f || {};
    var ci = sch().createCoachCheckin(Object.assign({}, o, { at: nowIso(o.now), date: o.date || (sch().localDay ? sch().localDay(o.now ? new Date(o.now) : undefined) : null) }));
    Spine().batch('A check-in', function () {
      Object.keys(ci.balances).forEach(function (k) { writeBalance(k, ci.balances[k]); });
    });
    return change(function (rec) {
      rec.checkins.push(ci);
      ci.homeworkTicked.forEach(function (hid) { var hw = rec.homework.filter(function (x) { return x.id === hid; })[0]; if (hw && !hw.doneAt) hw.doneAt = ci.at; });
      return ci;
    });
  }
  function addComment(f) {
    var text = String((f && f.text) || '').trim();
    if (!text) return null;
    return change(function (rec) { var c = sch().createCoachComment(Object.assign({}, f, { text: text, at: nowIso(f.now) })); rec.comments.push(c); return c; });
  }
  function resolveComment(id, on, now) {
    return change(function (rec) { var c = rec.comments.filter(function (x) { return x.id === id; })[0]; if (c) c.resolvedAt = on === false ? null : nowIso(now); return c || null; });
  }

  /* Quick entry (C5): the plan from engines/quickentry.js, saved. A new
     line is added through its owner first; each figure then goes to its
     row. Words kept aside become a private note on the stop. */
  function applyQuick(plan, ctx) {
    var c = ctx || {};
    if (!plan || plan.kind === 'empty') return { written: 0, note: null };
    var O = Ownership(), written = 0, newId = null;
    if (plan.kind === 'rows') {
      Spine().batch(plan.label + ', by quick entry', function () {
        if (plan.add) { var rec = O.addItem(plan.add.list, plan.add.fields); newId = rec && rec.id; }
        plan.writes.forEach(function (w) {
          var item = w.item === 'new' ? newId : w.item;
          O.write(w.field, w.value, item ? { itemId: item } : null);
          written++;
        });
      });
    }
    var note = plan.note ? addNote({ kind: 'coach', text: plan.note, stopId: c.stopId || null, sessionId: c.sessionId || null, source: 'quick' }) : null;
    return { written: written, note: note, itemId: newId };
  }

  /* The demo client: the example persona (shared/demo-persona.js), three
     goals with dates and one check-in, all example numbers, labelled so. */
  var DEMO_ID = 'demo';
  function ensureDemo(Demo, now) {
    var have = read().clients.filter(function (c) { return c.demo; })[0];
    if (have) return clone(have);
    var entry = addClient({ id: DEMO_ID, name: 'Demo client (example numbers)', demo: true, now: now });
    var h = Demo.build();
    h.meta = h.meta || {};
    h.meta.isDemo = true;
    var y = new Date(now || Date.now()).getFullYear();
    h.goals = [
      sch().createGoal({ name: 'Wedding', targetDate: (y + 2) + '-06-01', savedCents: 300000, monthlyContributionCents: 40000, lumpTargetCents: 2500000 }),
      sch().createGoal({ name: 'House down payment', targetDate: (y + 5) + '-09-01', savedCents: 500000, monthlyContributionCents: 60000, lumpTargetCents: 6000000 }),
      sch().createGoal({ name: 'Sabbatical', targetDate: (y + 4) + '-01-01', savedCents: 0, monthlyContributionCents: null, lumpTargetCents: 1800000 })
    ];
    Profiles.writeKeys(entry.id, { 'slaf.household.v2': JSON.stringify(sch().createHousehold(h)) });
    return entry;
  }

  /* ---- Sheet import (spec section 8) --------------------------------------
     sheetTargets(T)              what a column can map to: a single Ledger
                                  row in cents or a rate ('row:<id>'), or a
                                  quick-entry word ('qe:<word>', so a debt or
                                  an account column reads as 'car 12000')
     suggest(headers, T)          a first guess at the mapping, by label
     sheetPlan(text, columns, T)  { writes: [{ header, target, raw, value | plan }],
                                    notes: [text], bad: [header] }: the last
                                  filled cell of each column; unmapped columns
                                  become notes, a cell that does not read as a
                                  number becomes a note too, never a guess
     applySheet(plan, T)          writes into the ACTIVE profile            */
  function Csv() { var C = slaf().Csv; if (!C) throw new Error('The CSV reader is not loaded.'); return C; }
  function QE() { return slaf().QuickEntry; }
  function sheetTargets(T) {
    var O = slaf().Ownership;
    var writable = O && O.writable ? O.writable() : [];
    var rows = ((T.ledgerRows && T.ledgerRows.rows) || []).filter(function (r) { return (r.unit === 'cents' || r.unit === 'rate') && !r.repeat && writable.indexOf(r.id) >= 0; })
      .map(function (r) { return { id: 'row:' + r.id, label: r.label, unit: r.unit, words: [r.id.toLowerCase(), String(r.label).toLowerCase()] }; });
    var qe = ((T.quickEntry && T.quickEntry.entries) || []).map(function (e) {
      var what = e.kind === 'debt' ? e.label + ', balance (or a payment with /mo)' : e.kind === 'asset' ? e.label + ', what is in it' : e.label + (e.period === 'year' ? ', a year' : ', a month');
      return { id: 'qe:' + e.words[0], label: what, unit: 'quick', words: e.words };
    });
    return rows.concat(qe);
  }
  function suggest(headers, T) {
    var targets = sheetTargets(T);
    var out = {};
    (headers || []).forEach(function (hd) {
      var h = String(hd).toLowerCase().replace(/[^a-z0-9()% ]+/g, ' ').replace(/\s+/g, ' ').trim();
      var best = null;
      targets.forEach(function (t) { t.words.forEach(function (w) { if (w && (h === w || h.indexOf(w) === 0) && (!best || w.length > best.len)) best = { id: t.id, len: w.length }; }); });
      out[hd] = best ? best.id : null;
    });
    return out;
  }
  function sheetPlan(text, columns, T) {
    var parsed = Csv().parse(String(text || ''));
    var headers = parsed.headers || [];
    var cols = columns || {};
    var writes = [], notes = [], bad = [];
    var targets = {}; sheetTargets(T).forEach(function (t) { targets[t.id] = t; });
    headers.forEach(function (hd, i) {
      var raw = null;
      for (var r = parsed.rows.length - 1; r >= 0; r--) { var cell = parsed.rows[r][i]; if (cell !== undefined && String(cell).trim() !== '') { raw = String(cell).trim(); break; } }
      if (raw === null) return;
      var target = cols[hd] && targets[cols[hd]] ? targets[cols[hd]] : null;
      if (!target) { notes.push('From the sheet, ' + hd + ': ' + raw); return; }
      if (target.unit === 'cents') {
        var c = Csv().amount(raw);
        if (typeof c !== 'number') { bad.push(hd); notes.push('From the sheet, ' + hd + ' (did not read as an amount): ' + raw); return; }
        writes.push({ header: hd, target: target.id, raw: raw, value: c, label: target.label });
      } else if (target.unit === 'rate') {
        var n = Csv().number(raw);
        if (n.blank || n.bad || n.value === null) { bad.push(hd); notes.push('From the sheet, ' + hd + ' (did not read as a rate): ' + raw); return; }
        var v = n.percent || n.value > 1 ? n.value / 100 : n.value;
        writes.push({ header: hd, target: target.id, raw: raw, value: Number(v.toFixed(8)), label: target.label });
      } else {
        var Q = QE();
        var plan = Q ? Q.parse(target.words[0] + ' ' + raw, T.quickEntry, null) : null;
        if (!plan || plan.kind !== 'rows') { bad.push(hd); notes.push('From the sheet, ' + hd + ': ' + raw); return; }
        writes.push({ header: hd, target: target.id, raw: raw, plan: plan, label: target.label });
      }
    });
    return { headers: headers, writes: writes, notes: notes, bad: bad };
  }
  function applySheet(plan, T) {
    var O = Ownership(), n = 0;
    Spine().batch('Imported from a sheet', function () {
      plan.writes.forEach(function (w) {
        /* read again against the household as it now stands, so a second
           column of the same kind updates the line the first one added */
        if (w.plan) { n += applyQuick(QE().parse(w.plan.text, T.quickEntry, Spine().getProfile()), {}).written; return; }
        O.write(w.target.slice(4), w.value); n++;
      });
    });
    plan.notes.forEach(function (t) { addNote({ kind: 'coach', text: t, source: 'import' }); });
    return { written: n, notes: plan.notes.length };
  }

  /** Tests only. */
  function _reset() { write(empty()); }

  return { KEY: KEY, SIGNATURE: SIGNATURE, DEFAULT_PATH: DEFAULT_PATH,
    roster: roster, clients: clients, client: client, addClient: addClient, updateClient: updateClient,
    archive: archive, removeClient: removeClient, tick: tick, ticked: ticked,
    saveTemplate: saveTemplate, templates: templates,
    clientFile: clientFile, allFile: allFile, recapFile: recapFile, filename: filename, isCoachFile: isCoachFile,
    seal: seal, openFile: openFile, restore: restore, _reset: _reset,
    setVerdict: setVerdict, setShown: setShown, DEMO_ID: DEMO_ID, ensureDemo: ensureDemo,
    record: record, addNote: addNote, removeNote: removeNote, addHomework: addHomework, setHomeworkDone: setHomeworkDone,
    startSession: startSession, endSession: endSession, openSession: openSession, saveRecap: saveRecap, snapshotHousehold: snapshotHousehold,
    sheetTargets: sheetTargets, suggest: suggest, sheetPlan: sheetPlan, applySheet: applySheet,
    addCheckin: addCheckin, addComment: addComment, resolveComment: resolveComment, applyQuick: applyQuick };
});
