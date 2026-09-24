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
   ========================================================================== */
(function (root, factory) {
  var node = typeof module === 'object' && module.exports;
  var deps = node
    ? { Profiles: require('./profiles.js'), Vault: require('./vault.js') }
    : { Profiles: root.SLAF && root.SLAF.Profiles, Vault: root.SLAF && root.SLAF.Vault };
  var api = factory(deps.Profiles, function () { return deps.Vault || (root && root.SLAF && root.SLAF.Vault); });
  if (node) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Coach = api; }
})(typeof self !== 'undefined' ? self : null, function (Profiles, vault) {
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

  /** Tests only. */
  function _reset() { write(empty()); }

  return { KEY: KEY, SIGNATURE: SIGNATURE, DEFAULT_PATH: DEFAULT_PATH,
    roster: roster, clients: clients, client: client, addClient: addClient, updateClient: updateClient,
    archive: archive, removeClient: removeClient, tick: tick, ticked: ticked,
    saveTemplate: saveTemplate, templates: templates,
    clientFile: clientFile, allFile: allFile, filename: filename, isCoachFile: isCoachFile,
    seal: seal, openFile: openFile, restore: restore, _reset: _reset };
});
