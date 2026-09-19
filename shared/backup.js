/* ==========================================================================
   shared/backup.js — everything this browser holds, as one file.
   --------------------------------------------------------------------------
   Every figure in the app lives in localStorage, which means it lives in
   ONE browser on ONE device and is one "clear browsing data" from gone.
   This is the way out: one file that carries every key the app owns, and
   the way back in on the other device. No sync, no account, no server. One
   device is the true copy at a time; the file moves the truth. D-202.

   Your Data's file (shared/spine-v2.js exportJSON) carries the HOUSEHOLD,
   which is what a share link and a QR code carry too. This carries more:
   the household, the snapshots, the preferences, the pinned scenarios, the
   Skill Tree's seen marks, and the Dungeons & Dividends character — every
   key under the prefixes below. A household file still loads here, so a
   phone that saved one from Your Data is not a dead end.

     PREFIXES                  the namespaces the app writes: 'slaf.', 'dnd.'
     keys()                    every stored key under the prefixes, sorted
     build()                   the backup as an object
     toJSON()                  the backup as text
     filename(now)             money-rooms-backup-YYYY-MM-DD.json
     inspect(text)             check a file without touching storage:
                                 { ok, reason, kind, counts, savedAt, appVersion }
     apply(text)               stash an undo, then make storage match the file
     undo()                    put back what apply() replaced
     undoAvailable()           { at, count } while a stash exists, else null
     drift()                   stored keys outside the prefixes (dev guard)
     driftGuard()              console.warn those, on a dev host only
     mount(host)               the widget: two buttons and a status line

   WHAT A FILE HOLDS. Each key's stored string, as JSON where it parses
   ({ json: … }) and as text where it does not ({ text: … }), so a file is
   readable by a person and a plain-string key (the D&D skin) survives the
   round trip unchanged. Nothing is reshaped: the bytes that come back are
   the bytes that went in. That is what makes "uniform" true — a new room's
   key is carried the day it is written, with no wiring here.

   WHAT LOADING DOES. Storage under the prefixes is made to MATCH the file:
   keys the file has are written, keys it lacks are removed. A backup is a
   copy of a device, not a merge; the merge lives in Your Data. Before the
   first write the current state is stashed under UNDO_KEY, so the load is
   one click reversible until the next load. The stash is not part of any
   backup and the drift guard does not count it.

   The undo stash is the one key here outside the "carried" set. The probe
   key the spine writes and removes in the same tick is ignored too.
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Backup = api; }
})(typeof self !== 'undefined' ? self : null, function () {
  'use strict';

  var FORMAT = 'money-rooms-backup';
  var BACKUP_VERSION = 1;
  var HOUSEHOLD_FORMAT = 'slaf-export';            /* Your Data's file, spine-v2.js */
  var PREFIXES = ['slaf.', 'dnd.'];
  var UNDO_KEY = 'slaf.backup.undo.v1';
  var IGNORE = [UNDO_KEY, '__slaf_probe__'];

  function g() { return typeof self !== 'undefined' ? self : (typeof global !== 'undefined' ? global : {}); }
  function slaf() { return g().SLAF || {}; }
  function storage() {
    try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; }
  }
  function owned(key) {
    if (IGNORE.indexOf(key) !== -1) return false;
    for (var i = 0; i < PREFIXES.length; i++) if (key.indexOf(PREFIXES[i]) === 0) return true;
    return false;
  }
  function allKeys() {
    var s = storage(); if (!s) return [];
    var out = [];
    try {
      for (var i = 0; i < s.length; i++) { var k = s.key(i); if (k !== null && k !== undefined) out.push(k); }
    } catch (e) { /* a locked-down storage: nothing to list */ }
    return out;
  }
  function keys() { return allKeys().filter(owned).sort(); }
  function read(key) { var s = storage(); try { return s ? s.getItem(key) : null; } catch (e) { return null; } }
  function write(key, value) { var s = storage(); try { if (s) s.setItem(key, value); } catch (e) { /* quota: the caller reports */ }
    return read(key) === value; }
  function remove(key) { var s = storage(); try { if (s) s.removeItem(key); } catch (e) { /* fine */ } }

  function snapshot() {
    var out = {};
    keys().forEach(function (k) { var v = read(k); if (v !== null) out[k] = v; });
    return out;
  }

  /* ---- The file shape --------------------------------------------------- */
  function encode(raw) {
    try { return { json: JSON.parse(raw) }; } catch (e) { return { text: String(raw) }; }
  }
  function decode(entry) {
    if (entry && typeof entry === 'object' && Object.prototype.hasOwnProperty.call(entry, 'json')) return JSON.stringify(entry.json);
    if (entry && typeof entry === 'object' && typeof entry.text === 'string') return entry.text;
    return null;
  }
  function appVersion() {
    var S = slaf().Schema;
    if (!S || !S.APP_VERSION) return null;
    return S.BUILD ? S.APP_VERSION + ' (' + S.BUILD + ')' : String(S.APP_VERSION);
  }
  function schemaVersion() { var S = slaf().Schema; return S && S.SCHEMA_VERSION ? S.SCHEMA_VERSION : null; }

  function build(now) {
    var snap = snapshot();
    var out = {};
    Object.keys(snap).sort().forEach(function (k) { out[k] = encode(snap[k]); });
    return {
      format: FORMAT,
      backupVersion: BACKUP_VERSION,
      appVersion: appVersion(),
      schemaVersion: schemaVersion(),
      savedAt: (now ? new Date(now) : new Date()).toISOString(),
      keys: out
    };
  }
  function toJSON(now) { return JSON.stringify(build(now), null, 2); }
  function filename(now) {
    var S = slaf().Schema;
    var d = now ? new Date(now) : new Date();
    if (isNaN(d.getTime())) d = new Date();
    var day = S && S.localDay ? S.localDay(d) : d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    return 'money-rooms-backup-' + day + '.json';
  }

  /* ---- Checking a file ---------------------------------------------------
     Never throws, never writes. Every refusal names what was wrong in a
     sentence, because the person reading it is on a phone with a file they
     were told would work.                                                  */
  function counts(incoming) {
    var have = snapshot();
    var c = { add: 0, overwrite: 0, same: 0, remove: 0 };
    Object.keys(incoming).forEach(function (k) {
      if (!Object.prototype.hasOwnProperty.call(have, k)) c.add++;
      else if (have[k] === incoming[k]) c.same++;
      else c.overwrite++;
    });
    Object.keys(have).forEach(function (k) { if (!Object.prototype.hasOwnProperty.call(incoming, k)) c.remove++; });
    return c;
  }
  function inspect(text) {
    var no = function (reason) { return { ok: false, reason: reason }; };
    if (typeof text !== 'string' || !text.trim()) return no('The file is empty.');
    var obj;
    try { obj = JSON.parse(text); }
    catch (e) { return no('That file is not readable. It may be cut off, or not finished downloading. Nothing was changed.'); }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return no('That is a JSON file, but not a Money Rooms backup. Nothing was changed.');

    /* Your Data's household file: hand it to the spine, which knows how to
       check and migrate one. It carries the household and the snapshots. */
    if (obj.format === HOUSEHOLD_FORMAT) {
      var Spine = slaf().Spine;
      if (!Spine || !Spine.inspectImport) return no('That is a household file from Your Data. Open Your Data to load it.');
      var check = Spine.inspectImport(text);
      if (!check.ok) return no(check.reason);
      var incomingH = {};
      incomingH['slaf.household.v2'] = JSON.stringify(check.household);
      incomingH['slaf.snapshots.v1'] = JSON.stringify(check.snapshots || []);
      var have = snapshot();
      var ch = { add: 0, overwrite: 0, same: 0, remove: 0 };
      Object.keys(incomingH).forEach(function (k) {
        if (!Object.prototype.hasOwnProperty.call(have, k)) ch.add++; else if (have[k] === incomingH[k]) ch.same++; else ch.overwrite++;
      });
      return { ok: true, kind: 'household', counts: ch, savedAt: check.exportedAt || null, appVersion: obj.appVersion || null, text: text };
    }

    if (obj.format !== FORMAT) return no('That is a JSON file, but not a Money Rooms backup. Nothing was changed.');
    if (typeof obj.backupVersion !== 'number' || obj.backupVersion > BACKUP_VERSION) return no('That backup was saved by a newer build than this one (backup format ' + obj.backupVersion + '). Update this device first. Nothing was changed.');
    var mine = schemaVersion();
    if (mine !== null && typeof obj.schemaVersion === 'number' && obj.schemaVersion > mine) return no('That backup was saved by a newer build than this one (data version ' + obj.schemaVersion + ', this build reads ' + mine + '). Update this device first. Nothing was changed.');
    if (!obj.keys || typeof obj.keys !== 'object' || Array.isArray(obj.keys)) return no('That backup has no data in it. Nothing was changed.');

    var incoming = {};
    var names = Object.keys(obj.keys);
    for (var i = 0; i < names.length; i++) {
      var k = names[i];
      if (!owned(k)) return no('That backup carries a key this app does not own (' + k + '). Nothing was changed.');
      var raw = decode(obj.keys[k]);
      if (raw === null) return no('That backup has an entry that does not read (' + k + '). Nothing was changed.');
      incoming[k] = raw;
    }
    return { ok: true, kind: 'backup', keys: incoming, counts: counts(incoming), savedAt: obj.savedAt || null, appVersion: obj.appVersion || null, text: text };
  }

  /* ---- Loading -----------------------------------------------------------
     The stash first, then the writes; a stash that will not fit (quota)
     stops the load before anything changes.                                 */
  function stash() {
    var before = { at: new Date().toISOString(), keys: snapshot() };
    return write(UNDO_KEY, JSON.stringify(before)) ? before : null;
  }
  function apply(textOrCheck) {
    var check = typeof textOrCheck === 'string' ? inspect(textOrCheck) : textOrCheck;
    if (!check || !check.ok) return check || { ok: false, reason: 'Nothing to load.' };
    var before = stash();
    if (!before) return { ok: false, reason: 'This browser has no room to keep an undo copy, so nothing was loaded.' };

    if (check.kind === 'household') {
      var r = slaf().Spine.importJSON(check.text);
      if (!r.ok) { remove(UNDO_KEY); return { ok: false, reason: r.reason }; }
      return { ok: true, kind: 'household', counts: check.counts, undoAt: before.at };
    }
    var incoming = check.keys;
    keys().forEach(function (k) { if (!Object.prototype.hasOwnProperty.call(incoming, k)) remove(k); });
    var failed = [];
    Object.keys(incoming).forEach(function (k) { if (!write(k, incoming[k])) failed.push(k); });
    if (failed.length) {
      /* Half a load is worse than none: put everything back. */
      restore(before.keys);
      remove(UNDO_KEY);
      return { ok: false, reason: 'This browser ran out of room part way (' + failed[0] + '). Everything was put back as it was.' };
    }
    return { ok: true, kind: 'backup', counts: check.counts, undoAt: before.at };
  }
  function restore(snap) {
    keys().forEach(function (k) { if (!Object.prototype.hasOwnProperty.call(snap, k)) remove(k); });
    Object.keys(snap).forEach(function (k) { write(k, snap[k]); });
  }
  function undoAvailable() {
    var raw = read(UNDO_KEY); if (!raw) return null;
    try {
      var s = JSON.parse(raw);
      if (!s || typeof s !== 'object' || !s.keys || typeof s.keys !== 'object') return null;
      return { at: s.at || null, count: Object.keys(s.keys).length };
    } catch (e) { return null; }
  }
  function undo() {
    var raw = read(UNDO_KEY);
    if (!raw) return { ok: false, reason: 'There is no load to undo.' };
    var s;
    try { s = JSON.parse(raw); } catch (e) { s = null; }
    if (!s || !s.keys || typeof s.keys !== 'object') { remove(UNDO_KEY); return { ok: false, reason: 'The undo copy did not read, so it was discarded.' }; }
    restore(s.keys);
    remove(UNDO_KEY);
    return { ok: true, at: s.at || null, count: Object.keys(s.keys).length };
  }
  function clearUndo() { remove(UNDO_KEY); }

  /* ---- The drift guard ---------------------------------------------------
     A room that writes a key outside the prefixes has data no backup
     carries, and the backup still looks complete. On a dev host this says
     so in the console; on the live site it is silent. test/run.js runs the
     same rule statically over every room, which is what catches a new room
     before it ships.                                                       */
  function drift() {
    return allKeys().filter(function (k) { return IGNORE.indexOf(k) === -1 && !owned(k); }).sort();
  }
  function isDev() {
    var loc = g().location;
    if (!loc) return false;
    if (loc.protocol === 'file:') return true;
    var host = String(loc.hostname || '');
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '' || /^192\.168\./.test(host) || /^10\./.test(host) || /\.local$/.test(host);
  }
  function driftGuard() {
    if (!isDev()) return [];
    var stray = drift();
    if (stray.length && typeof console !== 'undefined' && console.warn) {
      console.warn('[Money Rooms backup] ' + stray.length + ' localStorage key' + (stray.length === 1 ? '' : 's') + ' outside the backed-up prefixes (' + PREFIXES.join(', ') + '): ' + stray.join(', ') + '. Give ' + (stray.length === 1 ? 'it' : 'them') + ' a prefix, or ' + (stray.length === 1 ? 'it is' : 'they are') + ' in no backup.');
    }
    return stray;
  }

  /* ---- The widget --------------------------------------------------------
     Two buttons and a status line; Undo appears only while a stash exists.
     Built once (LIVE-FORM: built once): no text input, and the status line
     is the only thing repainted.                                            */
  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function shortDate(iso) { var d = new Date(iso); return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  function things(n) { return n + (n === 1 ? ' thing' : ' things'); }
  function countsSentence(c) {
    var bits = [];
    if (c.add) bits.push('adds ' + things(c.add));
    if (c.overwrite) bits.push('replaces ' + things(c.overwrite));
    if (c.remove) bits.push('removes ' + things(c.remove));
    if (!bits.length) return c.same ? 'It matches what this browser already holds.' : 'It is empty.';
    var s = bits.length === 1 ? bits[0] : bits.slice(0, -1).join(', ') + ' and ' + bits[bits.length - 1];
    return 'It ' + s + (c.same ? ', and leaves ' + things(c.same) + ' as they are.' : '.');
  }

  /* ---- When was a copy last saved? (D-204) --------------------------------
     Every export in the app (this file, Your Data's file, Send) notes the
     moment in Prefs. The widget's idle line reads it back: quiet when the
     copy is recent, a nudge past thirty days, never a popup. */
  var EXPORT_PREF = 'backup.lastExportAt';
  var NUDGE_AFTER_DAYS = 30;
  function prefs() { var S = slaf(); return S.Prefs && S.Prefs.get ? S.Prefs : null; }
  function noteExport(when) {
    var P = prefs(); if (!P) return;
    P.set(EXPORT_PREF, (when ? new Date(when) : new Date()).toISOString());
  }
  function lastExportAt() { var P = prefs(); return P ? P.get(EXPORT_PREF, null) : null; }
  function exportAgeDays(now) {
    var at = lastExportAt(); if (!at) return null;
    var t = Date.parse(at); if (isNaN(t)) return null;
    return Math.floor(((now ? new Date(now) : new Date()).getTime() - t) / 86400000);
  }
  function exportAgeLine(now) {
    var days = exportAgeDays(now);
    if (days === null) return keys().length ? 'No copy saved from this browser yet.' : '';
    if (days < 1) return 'A copy was saved today.';
    if (days === 1) return 'A copy was saved yesterday.';
    if (days < NUDGE_AFTER_DAYS) return 'A copy was saved ' + days + ' days ago.';
    return 'The last copy is ' + days + ' days old. Worth saving a fresh one.';
  }

  function mount(host, opts) {
    var doc = g().document;
    if (!doc) return null;
    var el = typeof host === 'string' ? doc.querySelector(host) : host;
    if (!el) return null;
    var o = opts || {};
    el.className = (el.className ? el.className + ' ' : '') + 'slaf-backup';
    el.innerHTML = '<span class="slaf-eyebrow">Backup</span>'
      + '<p class="slaf-backup-lede">Everything this browser holds, as one file. Save it here, load it on the other device. Whichever device you loaded last is the true copy.</p>'
      + '<div class="slaf-backup-acts">'
      + '<button type="button" class="slaf-btn" data-backup="save">Save a copy</button>'
      + '<button type="button" class="slaf-btn" data-backup="load">Load a copy</button>'
      + '<button type="button" class="slaf-btn slaf-btn--quiet" data-backup="undo" hidden>Undo last load</button>'
      + '<input type="file" data-backup="file" accept="application/json,.json" hidden aria-label="Choose a backup file"/>'
      + '</div>'
      + '<p class="slaf-backup-status" data-backup="status" role="status" aria-live="polite"></p>';
    var q = function (name) { return el.querySelector('[data-backup="' + name + '"]'); };
    var status = q('status'), undoBtn = q('undo'), file = q('file');
    function say(text, cls) { status.textContent = text || ''; status.className = 'slaf-backup-status' + (cls ? ' ' + cls : ''); }
    function reload() { if (o.reload === false) return; try { g().location.reload(); } catch (e) { /* fine */ } }
    function paintUndo() {
      var u = undoAvailable();
      undoBtn.hidden = !u;
      if (u && !status.textContent) say('Loaded a copy' + (u.at ? ' on ' + shortDate(u.at) : '') + '. Undo is here until the next load.');
      else if (!status.textContent) say(exportAgeLine());
    }

    q('save').addEventListener('click', function () {
      var n = keys().length;
      if (!n) { say('Nothing to save yet: this browser holds no figures.', 'is-error'); return; }
      var text = toJSON();
      var name = filename();
      try {
        var blob = new Blob([text], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = doc.createElement('a');
        a.href = url; a.download = name;
        doc.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        noteExport();
        say('Saved ' + name + ' (' + things(n) + '). Keep it where you keep a bank statement.', 'is-good');
      } catch (e) { say('This browser would not hand over the file: ' + (e && e.message ? e.message : e), 'is-error'); }
    });
    q('load').addEventListener('click', function () { file.value = ''; file.click(); });
    file.addEventListener('change', function () {
      var f = file.files && file.files[0];
      if (!f) return;
      f.text().then(function (text) {
        var check = inspect(text);
        if (!check.ok) { say(check.reason, 'is-error'); return; }
        var from = check.kind === 'household' ? 'a household file from Your Data' : 'a backup';
        var when = check.savedAt ? ', saved ' + shortDate(check.savedAt) : '';
        var ver = check.appVersion ? ' by Money Rooms ' + check.appVersion : '';
        var msg = 'Load ' + f.name + '? It is ' + from + when + ver + '. ' + countsSentence(check.counts)
          + (check.kind === 'household' ? ' Only the household and the snapshots change.' : '')
          + ' Undo is one click afterwards.';
        var ask = o.confirm || function (m) { return g().confirm ? g().confirm(m) : true; };
        if (!ask(msg)) { say('Not loaded. Nothing was changed.'); return; }
        var r = apply(check);
        if (!r.ok) { say(r.reason, 'is-error'); return; }
        say('Loaded ' + f.name + '. ' + countsSentence(r.counts) + ' Reloading so every room reads it.', 'is-good');
        paintUndo();
        if (o.onApplied) o.onApplied(r);
        reload();
      }).catch(function (e) { say('That file could not be read: ' + (e && e.message ? e.message : e), 'is-error'); });
    });
    undoBtn.addEventListener('click', function () {
      var r = undo();
      if (!r.ok) { say(r.reason, 'is-error'); paintUndo(); return; }
      say('Put back what was here before the last load (' + things(r.count) + '). Reloading.', 'is-good');
      undoBtn.hidden = true;
      if (o.onUndone) o.onUndone(r);
      reload();
    });

    paintUndo();
    driftGuard();
    return { element: el, say: say };
  }

  return {
    FORMAT: FORMAT,
    BACKUP_VERSION: BACKUP_VERSION,
    PREFIXES: PREFIXES.slice(),
    UNDO_KEY: UNDO_KEY,
    keys: keys,
    build: build,
    toJSON: toJSON,
    filename: filename,
    inspect: inspect,
    apply: apply,
    undo: undo,
    undoAvailable: undoAvailable,
    clearUndo: clearUndo,
    drift: drift,
    isDev: isDev,
    driftGuard: driftGuard,
    countsSentence: countsSentence,
    noteExport: noteExport,
    lastExportAt: lastExportAt,
    exportAgeDays: exportAgeDays,
    exportAgeLine: exportAgeLine,
    mount: mount
  };
});
