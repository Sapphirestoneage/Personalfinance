/* ==========================================================================
   engines/layouts.js — the same rooms, arranged twenty different ways.
   --------------------------------------------------------------------------
   The app has sixty-four rooms and exactly one order to walk them in. That
   order is the registry's, it is a real opinion, and it is not the only one
   that could be held. This engine makes the alternatives real instead of
   theoretical: every arrangement is a row in data/layouts.json, and every one
   of them renders from this one function.

     list()                 every layout, with its volume and its premise
     byId(id)               one of them, or null
     build(h, T, id)        that layout, for THIS household: the groups, with
                            only the rooms that apply, and the coverage
     coverage(h, T, id)     placed / total / missing / doubled, computed

   THREE RULES

   1. A LAYOUT IS A VIEW, NEVER A FACT. Nothing here may change a number,
      gate a room, or decide what a room needs. `test/run.js` holds that: no
      engine other than this one may read the layouts table, and this one
      returns rooms and labels — never money. Which shelf a room sits on is
      an editorial opinion; what a room needs is in the registry.

   2. FILTERING IS THE GATE'S JOB, NOT THE LAYOUT'S. A room is dropped from
      a bay only when `Registry.applies` says it is not for this household —
      the same call the map, the walk and the situation sweep all make
      (D-142). A layout has no opinion about who you are. That is why the
      same bay is nine rooms for one person and four for another, and why a
      bay whose every room is gated away is dropped rather than shown empty.

   3. COVERAGE IS COMPUTED, NEVER ASSERTED. If an arrangement drops a room
      or files one twice, `coverage()` says so by name. A layout that quietly
      loses a room is how a room becomes unreachable, and that is exactly the
      failure this whole file exists to make impossible to ship.

   PURE. No storage, no DOM. Takes the household and the tables, returns
   plain objects.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Registry: require('../shared/registry.js') };
  } else {
    deps = { Registry: root.SLAF && root.SLAF.Registry };
  }
  var api = factory(deps.Registry);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Layouts = api; }
})(typeof self !== 'undefined' ? self : null, function (Registry) {
  'use strict';

  var TABLE = 'layouts';
  var DEFAULT_ID = 'path';          /* what the app ships as its own order */

  function table(tables) {
    var t = tables && tables[TABLE];
    return (t && t.layouts) ? t : null;
  }

  /** Every layout, in set order, without their room lists — for a picker. */
  function list(tables) {
    var t = table(tables);
    if (!t) return [];
    return t.layouts.map(function (l) {
      return {
        id: l.id, code: l.code, volume: l.volume, name: l.name,
        by: l.by || null, live: !!l.live, mode: l.mode,
        premise: l.premise, groups: l.groups.length
      };
    });
  }

  function byId(tables, id) {
    var t = table(tables);
    if (!t) return null;
    for (var i = 0; i < t.layouts.length; i++) {
      if (t.layouts[i].id === id) return t.layouts[i];
    }
    return null;
  }

  /* A room is in a layout for this household when the registry knows it and
     the gate says it applies. Utilities included: they are rooms too, and a
     layout that hid Your Data would be hiding the way out. */
  function usable(id, household) {
    var room = Registry.byId(id);
    if (!room) return null;
    if (!Registry.applies(room, household)) return null;
    return room;
  }

  /**
   * One layout, resolved for a household.
   *
   *   { id, name, mode, premise, by, volume, groups: [...], coverage: {...} }
   *
   * Each group carries `rooms` as full registry rows (id, title, blurb, href,
   * kind) so a page never has to look them up again, plus `droppedCount` —
   * how many of its rooms the gate removed, which is worth saying out loud
   * rather than silently showing a shorter bay.
   */
  function build(household, tables, id) {
    var l = byId(tables, id) || byId(tables, DEFAULT_ID);
    if (!l) return null;
    var groups = [];
    l.groups.forEach(function (g) {
      var rows = [], dropped = 0;
      (g.rooms || []).forEach(function (rid) {
        var room = usable(rid, household);
        if (!room) { dropped++; return; }
        rows.push({
          id: room.id, title: room.title, blurb: room.blurb,
          href: room.href, kind: room.kind, utility: !!room.utility,
          isHub: rid === g.hub
        });
      });
      /* A bay the gate emptied is not shown. An empty shelf with a heading
         reads as "nothing here for you", which is not what happened — what
         happened is that none of it was ever yours. */
      if (!rows.length) return;
      var parent = null, name = g.name;
      var cut = g.name.indexOf(' › ');           /* "Parent › Child" */
      if (cut !== -1) { parent = g.name.slice(0, cut); name = g.name.slice(cut + 3); }
      groups.push({
        name: name, parent: parent, fullName: g.name,
        note: g.note || null, warn: !!g.warn, overlay: !!g.overlay,
        hub: g.hub || null, rooms: rows, droppedCount: dropped
      });
    });
    /* SAFETY NET. A room added to the registry after data/layouts.json was
       written is on no shelf in any arrangement — which is how a room
       silently becomes unreachable. Rather than lose it, every layout gets a
       final, plainly-labelled bay for whatever it has no opinion about. The
       coverage figure still counts it as missing, so the gap gets fixed in
       the data rather than papered over here. */
    var cov = coverage(household, tables, l.id);
    if (cov.missing.length) {
      var strays = [];
      cov.missing.forEach(function (rid) {
        var room = usable(rid, household);
        if (!room) return;
        strays.push({
          id: room.id, title: room.title, blurb: room.blurb,
          href: room.href, kind: room.kind, utility: !!room.utility, isHub: false
        });
      });
      if (strays.length) {
        groups.push({
          name: 'Not shelved in this arrangement',
          parent: null, fullName: 'Not shelved in this arrangement',
          note: 'This layout has no opinion about ' + (strays.length === 1 ? 'this room' : 'these rooms')
            + ' — it was written before ' + (strays.length === 1 ? 'it' : 'they') + ' existed. '
            + 'Listed here so nothing is unreachable.',
          warn: true, overlay: false, hub: null, rooms: strays, droppedCount: 0
        });
      }
    }
    return {
      id: l.id, code: l.code, volume: l.volume, name: l.name,
      by: l.by || null, live: !!l.live, mode: l.mode,
      premise: l.premise, readsWell: l.readsWell, costs: l.costs,
      groups: groups,
      coverage: cov
    };
  }

  /**
   * Does this arrangement reach every room this household has?
   *   { placed, total, missing: [ids], doubled: [ids] }
   *
   * `total` is the rooms that apply to THIS household, not all 64 — a
   * retiree's layout is complete when it reaches a retiree's rooms.
   */
  function coverage(household, tables, id) {
    var l = byId(tables, id);
    var all = Registry.all().filter(function (r) { return Registry.applies(r, household); })
      .map(function (r) { return r.id; });
    if (!l) return { placed: 0, total: all.length, missing: all.slice(), doubled: [] };
    var seen = {}, doubled = [];
    l.groups.forEach(function (g) {
      if (g.overlay) return;              /* a second way in, not a second shelf */
      (g.rooms || []).forEach(function (rid) {
        if (!usable(rid, household)) return;
        if (seen[rid]) doubled.push(rid); else seen[rid] = true;
      });
    });
    return {
      placed: Object.keys(seen).length,
      total: all.length,
      missing: all.filter(function (r) { return !seen[r]; }),
      doubled: doubled
    };
  }

  /** The distinct parents in a tree-mode layout, in first-seen order. */
  function parents(built) {
    var seen = {}, out = [];
    (built && built.groups || []).forEach(function (g) {
      if (!g.parent || seen[g.parent]) return;
      seen[g.parent] = true;
      out.push(g.parent);
    });
    return out;
  }

  return {
    TABLE: TABLE,
    DEFAULT_ID: DEFAULT_ID,
    list: list,
    byId: byId,
    build: build,
    coverage: coverage,
    parents: parents
  };
});
