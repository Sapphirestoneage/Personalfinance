/* ==========================================================================
   shared/profiles.js, many households in one browser (Coach Mode). D-339.
   --------------------------------------------------------------------------
   Today there is one household per browser, under 'slaf.household.v2'. A
   coach needs one per client. A profile is a name for a set of keys:

     'default'   today's exact keys, untouched: slaf.household.v2, ...
     <clientId>  the same keys under 'slaf.p.<clientId>.':
                 slaf.p.<clientId>.household.v2, ...snapshots.v1, ...

   Only the keys in SCOPED move with the profile (the household, its
   snapshots, its quarantine copy, its scenarios and blocks, the Skill
   Tree's seen marks). Preferences, the error log and the backup's undo
   stash are the device's, not the household's, and stay where they are.

   The active profile is this TAB's, kept in sessionStorage, so an embedded
   room in the coach console reads the same client as the console around
   it, and a second tab on the personal household is never switched from
   under it. It counts only while Coach Mode is on (prefs.coachMode): with
   the switch off every key is today's key, whatever the tab remembers, so
   the public site behaves exactly as before.

     DEFAULT                  'default'
     SCOPED                   the base keys that move with a profile
     coachOn()                prefs.coachMode is true
     active()                 the id in use ('default' unless coach is on)
     use(id)                  switch this tab; 'default' goes home
     key(base, id)            the stored key for a base key in profile id
                              (the active one when id is omitted)
     prefix(id)               'slaf.p.<id>.' ('' for default)
     keysOf(id)               every stored key that belongs to profile id
     remove(id)               delete every key under its prefix, nothing else
     validId(id)              a short lowercase id: [a-z0-9_-], 1 to 40
     newId()                  'c_' and a random tail
     onSwitch(fn)             subscribe; returns an unsubscribe
     readKeys(id)             { baseKey: stored text } for a profile, the
                              shape a per-client backup carries
     writeKeys(id, map)       the reverse, for a restore: only SCOPED base
                              keys, and the profile's old keys go first

   ?coach=1 on any page sets the switch once (and ?coach=0 clears it).
   Dependency-free, and the third script on every Money Rooms page
   (tools/stamp-build.js puts it there), so the spine and every module
   after it can ask which household is theirs before the first read.
   ========================================================================== */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Profiles = api; }
})(typeof self !== 'undefined' ? self : null, function (root) {
  'use strict';

  var DEFAULT = 'default';
  var PREFS_KEY = 'slaf.prefs.v1';
  var ACTIVE_KEY = 'slaf.profile.active';
  var PREFIX = 'slaf.p.';
  var SCOPED = ['slaf.household.v2', 'slaf.snapshots.v1', 'slaf.household.unreadable', 'slaf.scenarios.v1', 'slaf.skilltree.seen'];
  var memoryActive = null;          /* where sessionStorage is missing (node, a locked tab) */
  var listeners = [];

  function local() { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; } }
  function session() { try { return typeof sessionStorage !== 'undefined' ? sessionStorage : null; } catch (e) { return null; } }

  function validId(id) { return typeof id === 'string' && /^[a-z0-9_-]{1,40}$/.test(id); }
  function newId() { return 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  function readPrefs() {
    var s = local(); if (!s) return {};
    try { var p = JSON.parse(s.getItem(PREFS_KEY) || '{}'); return p && typeof p === 'object' ? p : {}; } catch (e) { return {}; }
  }
  function coachOn() { return readPrefs().coachMode === true; }

  /* The one writer of the switch outside Settings: ?coach=1 on a link. It
     merges into the stored preferences; shared/prefs.js reads them later. */
  function setCoach(on) {
    var s = local(); if (!s) return;
    var p = readPrefs();
    if (on) p.coachMode = true; else delete p.coachMode;
    var raw = JSON.stringify(p);
    try { s.setItem(PREFS_KEY, raw); } catch (e) { /* storage refused: the switch stays as it was */ }
  }

  function remembered() {
    var s = session();
    var v = null;
    if (s) { try { v = s.getItem(ACTIVE_KEY); } catch (e) { v = null; } }
    if (v === null || v === undefined) v = memoryActive;
    return validId(v) ? v : DEFAULT;
  }
  function active() { return coachOn() ? remembered() : DEFAULT; }

  function use(id) {
    var next = id === DEFAULT || id === null || id === undefined ? DEFAULT : id;
    if (next !== DEFAULT && !validId(next)) throw new Error('Not a profile id: ' + id);
    var before = active();
    memoryActive = next;
    var s = session();
    if (s) { try { if (next === DEFAULT) s.removeItem(ACTIVE_KEY); else s.setItem(ACTIVE_KEY, next); } catch (e) { /* memory only */ } }
    var after = active();
    if (after !== before) listeners.slice().forEach(function (fn) { try { fn(after, before); } catch (e) { /* a listener must not break the switch */ } });
    return after;
  }

  function prefix(id) { return id === DEFAULT ? '' : PREFIX + id + '.'; }
  function key(base, id) {
    var p = id === undefined ? active() : id;
    if (p === DEFAULT || SCOPED.indexOf(base) === -1) return base;
    if (!validId(p)) throw new Error('Not a profile id: ' + p);
    return PREFIX + p + '.' + base.slice('slaf.'.length);
  }

  function allKeys() {
    var s = local(); if (!s) return [];
    var out = [];
    try { for (var i = 0; i < s.length; i++) { var k = s.key(i); if (k !== null && k !== undefined) out.push(k); } } catch (e) { /* nothing to list */ }
    return out;
  }
  function keysOf(id) {
    if (id === DEFAULT) return allKeys().filter(function (k) { return SCOPED.indexOf(k) !== -1; }).sort();
    if (!validId(id)) return [];
    var p = prefix(id);
    return allKeys().filter(function (k) { return k.indexOf(p) === 0; }).sort();
  }
  function remove(id) {
    if (id === DEFAULT || !validId(id)) throw new Error('Only a client profile can be removed');
    var s = local(); var gone = keysOf(id);
    gone.forEach(function (k) { try { s.removeItem(k); } catch (e) { /* fine */ } });
    if (remembered() === id) use(DEFAULT);
    return gone;
  }
  function base(id, k) { return id === DEFAULT ? k : 'slaf.' + k.slice(prefix(id).length); }
  function readKeys(id) {
    var s = local(); var out = {};
    keysOf(id).forEach(function (k) { var b = base(id, k); if (SCOPED.indexOf(b) === -1) return; try { var v = s.getItem(k); if (v !== null) out[b] = v; } catch (e) { /* skip */ } });
    return out;
  }
  function writeKeys(id, map) {
    if (id === DEFAULT || !validId(id)) throw new Error('A restore goes into a client profile only');
    var names = Object.keys(map || {});
    names.forEach(function (b) { if (SCOPED.indexOf(b) === -1) throw new Error('Not a profile key: ' + b); });
    var s = local(); if (!s) return [];
    keysOf(id).forEach(function (k) { try { s.removeItem(k); } catch (e) { /* fine */ } });
    names.forEach(function (b) { s.setItem(key(b, id), String(map[b])); });
    return names.map(function (b) { return key(b, id); });
  }
  function onSwitch(fn) {
    listeners.push(fn);
    return function () { var i = listeners.indexOf(fn); if (i !== -1) listeners.splice(i, 1); };
  }

  /* ?coach=1 sets the switch, ?coach=0 clears it. Read once, on load. */
  try {
    var q = root && root.location && root.location.search ? root.location.search : '';
    var m = /[?&]coach=([01])(?:&|$)/.exec(q);
    if (m) setCoach(m[1] === '1');
  } catch (e) { /* no location here */ }

  /* A room opened on its own in a tab that is on a client's household says
     so at the top, with the way back, so a coach never mistakes a client's
     numbers for their own. Not inside the coach console's frame (the
     console says it), and never with Coach Mode off. */
  function banner() {
    try {
      var doc = root && root.document;
      if (!doc || active() === DEFAULT || root.top !== root) return;
      if (/\/coach\//.test(root.location.pathname || '')) return;
      var add = function () {
        if (doc.getElementById('slaf-profile-banner') || !doc.body) return;
        var d = doc.createElement('div');
        d.id = 'slaf-profile-banner';
        d.setAttribute('role', 'note');
        d.style.cssText = 'position:sticky;top:0;z-index:50;padding:6px 12px;font:14px/1.4 system-ui,sans-serif;background:#5a3b00;color:#fff;text-align:center';
        var up = /\/rooms\//.test(root.location.pathname || '') ? '../' : '';
        d.innerHTML = 'Coach Mode: this tab shows a client\'s numbers, not yours. <a style="color:#fff;text-decoration:underline" href="' + up + 'coach/index.html">Back to Coach Home</a>';
        doc.body.insertBefore(d, doc.body.firstChild);
      };
      if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', add); else add();
    } catch (e) { /* no document here */ }
  }
  banner();

  /* Tests only: forget the tab's memory. */
  function _reset() { memoryActive = null; var s = session(); if (s) { try { s.removeItem(ACTIVE_KEY); } catch (e) { /* fine */ } } }

  return { DEFAULT: DEFAULT, SCOPED: SCOPED.slice(), PREFIX: PREFIX, ACTIVE_KEY: ACTIVE_KEY,
    coachOn: coachOn, setCoach: setCoach, active: active, use: use, key: key, prefix: prefix,
    keysOf: keysOf, remove: remove, readKeys: readKeys, writeKeys: writeKeys, validId: validId, newId: newId, onSwitch: onSwitch, _reset: _reset };
});
