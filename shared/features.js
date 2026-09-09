/* ==========================================================================
   shared/features.js — the switches: what a room renders, asks, or applies.
   --------------------------------------------------------------------------
   Every phenomenon in the master prompt's sections 15 and 16 is a switch in
   data/features.json. The schema always carries the shape; the switch
   decides whether any room renders it, asks for it, or an engine applies it.
   Features.on(id) is the ONLY way an engine or room checks one. A switch
   changes rendering and engine behaviour, never stored facts: flipping any
   of them on and off leaves the household byte-identical. DECISIONS.md D-180.

     use(table)                 hand it data/features.json once
     all() · get(id) · groups() the table
     on(id, household)          user scope: the pref, else the default;
                                situation scope: read from the household
     set(id, value)             user scope only; writes prefs (null clears)
     applyPath('beginner'|'fi') the onboarding split's starting set
     rooms(id)                  the rooms whose registry entry lists it
     situationSays(id, h)       what the situation gate says, for the row
   ========================================================================== */
(function (root, factory) {
  var node = typeof module === 'object' && module.exports;
  var deps = node
    ? { Prefs: require('./prefs.js'), Registry: require('./registry.js') }
    : { Prefs: root.SLAF && root.SLAF.Prefs, Registry: root.SLAF && root.SLAF.Registry };
  function scenarios() {
    if (node) { try { return require('./scenarios.js'); } catch (e) { return null; } }
    return root.SLAF && root.SLAF.Scenarios ? root.SLAF.Scenarios : null;
  }
  var api = factory(deps.Prefs, deps.Registry, scenarios);
  if (node) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Features = api; }
})(typeof self !== 'undefined' ? self : null, function (Prefs, Registry, scenarios) {
  'use strict';

  var TABLE = null;
  function use(table) { TABLE = table || TABLE; return TABLE; }
  function table() {
    if (TABLE) return TABLE;
    if (typeof module === 'object' && module.exports) { try { TABLE = require('../data/features.json'); } catch (e) { TABLE = null; } }
    return TABLE;
  }
  function all() {
    var t = table();
    if (!t || !t.features) return [];
    return Object.keys(t.features).map(function (id) { return Object.assign({ id: id }, t.features[id]); });
  }
  function get(id) { var t = table(); return t && t.features && t.features[id] ? Object.assign({ id: id }, t.features[id]) : null; }
  function groups() { var t = table(); return t && t.groups ? t.groups.slice() : []; }
  function prefKey(id) { return 'features.' + id; }

  /* ---- situationWhen: a few fixed phrases, read by hand -------------------- */
  function situationSays(id, household) {
    var f = get(id);
    if (!f || f.scope !== 'situation') return null;
    var h = household || {};
    var w = String(f.situationWhen || '');
    if (w === 'income type includes equity') {
      return (h.people || []).some(function (p) { return (p.incomeSources || []).some(function (s) { return s.type === 'equity'; }); });
    }
    if (w === 'a federal student loan exists') {
      return (h.debts || []).some(function (d) { return d && (d.type === 'student_loan' || d.kind === 'studentFederal') && d.kind !== 'studentPrivate'; });
    }
    if (w === 'an inheritance block exists') {
      var S = scenarios();
      return !!(S && S.blocks && S.blocks().some(function (b) { return b.type === 'inheritance'; }));
    }
    if (w === 'situation includes selfEmployed') {
      return (h.people || []).some(function (p) { return p.employmentStatus === 'selfEmployed' || p.employmentStatus === 'both'; });
    }
    return false;
  }

  /** The one question a room or engine asks. */
  function on(id, household) {
    var f = get(id);
    if (!f) return false;
    if (f.scope === 'situation') return !!situationSays(id, household);
    var stored = Prefs ? Prefs.get(prefKey(id), null) : null;
    if (stored === true || stored === false) return stored;
    return f['default'] === 'on';
  }
  /** User scope only. `value` true/false, or null to go back to the default. */
  function set(id, value) {
    var f = get(id);
    if (!f || f.scope !== 'situation' && Prefs) {
      if (!f) return false;
      Prefs.set(prefKey(id), value === null || value === undefined ? null : !!value);
      return on(id);
    }
    return on(id);
  }
  function isDefault(id) { return !Prefs || Prefs.get(prefKey(id), null) === null; }

  /** The onboarding split: beginner starts with only the default-on set;
      FI starts with Accuracy and Horizon all on. Stored under prefs too. */
  function applyPath(path) {
    var t = table();
    var p = t && t.paths && t.paths[path];
    if (!p || !Prefs) return null;
    all().forEach(function (f) {
      if (f.scope !== 'user') return;
      if (p.on === 'defaults') { Prefs.set(prefKey(f.id), null); return; }
      var onGroups = Array.isArray(p.on) ? p.on : [];
      Prefs.set(prefKey(f.id), onGroups.indexOf(f.group) > -1 ? true : (f['default'] === 'on'));
    });
    Prefs.set('door', path);
    return path;
  }

  /** The rooms whose registry entry lists this switch under `features`. */
  function rooms(id) {
    if (!Registry || !Registry.all) return [];
    return Registry.all().filter(function (r) { return (r.features || []).indexOf(id) > -1; }).map(function (r) { return { id: r.id, title: r.title, href: r.href }; });
  }

  return { use: use, all: all, get: get, groups: groups, on: on, set: set, isDefault: isDefault, applyPath: applyPath, rooms: rooms, situationSays: situationSays, prefKey: prefKey };
});
