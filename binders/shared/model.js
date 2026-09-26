/* ==========================================================================
   binders/shared/model.js, the planets, read against one set of answers.
   PB-001. The Binders' copy of what shared/solar.js does for SPARKS: where
   a person stands in the levels, and nothing else. It computes no figure
   (engines/reads.js does) and writes nothing (shared/store.js does).

     use(table)                    take data/playbooks.json (once per page)
     playbooks() systems() bands() the table's rows
     byId(id)                      one playbook
     levelId(playbook, band)       'machine-3'
     exercise(key)                 { ex, playbook, level } that owns a key
     resolve(ex)                   a { ref } exercise -> its owner's exercise
     levelState(level, state)      { state, filled, of, ticked, ofChecks, missing }
                                   state: done | part | notYet
     planet(id, state)             one planet: its levels, what is done,
                                   the band it is working on
     grid(state)                   twelve planets by six bands
     bandCleared(n, state)         every planet has finished that band
     next(state)                   the three levels to do next, and why
     overall(state)                { done, of, rings, exercisesAnswered }

   A level is done when every exercise holds an answer (a ref counts when
   its owner does) and every checklist item is ticked. Nothing here marks a
   level done that the person did not answer.
   ========================================================================== */
(function (root, factory) {
  var Store = (typeof module === 'object' && module.exports) ? require('./store.js') : (root.BINDERS && root.BINDERS.Store);
  var api = factory(Store);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.BINDERS = root.BINDERS || {}; root.BINDERS.Model = api; }
})(typeof self !== 'undefined' ? self : null, function (Store) {
  'use strict';
  var TABLE = null, OWNERS = {};
  function use(t) {
    TABLE = t || null; OWNERS = {};
    if (!TABLE) return TABLE;
    TABLE.playbooks.forEach(function (p) { p.levels.forEach(function (l) { l.id = l.id || (p.id + '-' + l.band); l.exercises.forEach(function (e) { if (e.key) OWNERS[e.key] = { ex: e, playbook: p, level: l }; }); }); });
    return TABLE;
  }
  function playbooks() { return TABLE ? TABLE.playbooks.slice().sort(function (a, b) { return systemOrder(a.system) - systemOrder(b.system) || a.order - b.order; }) : []; }
  function systems() { return TABLE ? TABLE.systems.slice().sort(function (a, b) { return a.order - b.order; }) : []; }
  function systemOrder(id) { var s = system(id); return s ? s.order : 99; }
  function system(id) { var out = null; (TABLE ? TABLE.systems : []).forEach(function (s) { if (s.id === id) out = s; }); return out; }
  function bands() { return TABLE ? TABLE.bands.slice() : []; }
  function byId(id) { var out = null; (TABLE ? TABLE.playbooks : []).forEach(function (p) { if (p.id === id) out = p; }); return out; }
  function levelId(p, band) { return p.id + '-' + band; }
  function exercise(key) { return OWNERS[key] || null; }
  function resolve(ex) { if (!ex.ref) return ex; var o = OWNERS[ex.ref]; return o ? o.ex : null; }

  function answered(ex, state) {
    var e = resolve(ex);
    if (!e) return false;
    return !Store.isEmpty(state.answers[e.key]);
  }
  function levelState(level, state) {
    state = state || Store.blank();
    var filled = 0, missing = [];
    level.exercises.forEach(function (ex) {
      if (answered(ex, state)) filled++;
      else { var e = resolve(ex); missing.push(e ? e.label : String(ex.ref)); }
    });
    var ticks = state.checks[level.id] || {}, ticked = 0;
    level.checklist.forEach(function (_, i) { if (ticks[i]) ticked++; });
    var of = level.exercises.length, ofChecks = level.checklist.length;
    var st = (filled === of && ticked === ofChecks) ? 'done' : (filled + ticked > 0 ? 'part' : 'notYet');
    return { state: st, filled: filled, of: of, ticked: ticked, ofChecks: ofChecks, missing: missing, id: level.id, band: level.band };
  }
  function planet(id, state) {
    var p = typeof id === 'string' ? byId(id) : id;
    if (!p) return null;
    var levels = p.levels.map(function (l) { return levelState(l, state); });
    var done = levels.filter(function (l) { return l.state === 'done'; }).length;
    var working = null;
    levels.some(function (l) { if (l.state !== 'done') { working = l.band; return true; } return false; });
    var answeredN = levels.reduce(function (a, l) { return a + l.filled + l.ticked; }, 0), ofN = levels.reduce(function (a, l) { return a + l.of + l.ofChecks; }, 0);
    return { id: p.id, label: p.label, system: p.system, levels: levels, done: done, of: levels.length, band: working, pct: ofN ? answeredN / ofN * 100 : 0 };
  }
  function grid(state) { return playbooks().map(function (p) { return planet(p, state); }); }
  function bandCleared(n, state) { return grid(state).every(function (pl) { var l = pl.levels[n - 1]; return !l || l.state === 'done'; }); }
  function overall(state) {
    var g = grid(state), done = 0, of = 0, rings = 0;
    g.forEach(function (pl) { done += pl.done; of += pl.of; });
    bands().forEach(function (b) { if (bandCleared(b.n, state)) rings++; });
    var answeredKeys = Object.keys((state || {}).answers || {}).length;
    return { done: done, of: of, rings: rings, planets: g, exercisesAnswered: answeredKeys };
  }
  /* The next three: a part-done level first, then the lowest band, in system
     order. Never above band 2 on any planet until every planet has finished
     band 1 (the same rule as SPARKS 1.4 rule 9). */
  function next(state) {
    var g = grid(state), open = [];
    var band1Clear = bandCleared(1, state);
    g.forEach(function (pl, pi) { pl.levels.forEach(function (l) { if (l.state !== 'done') open.push({ planet: pl, level: l, pi: pi }); }); });
    open = open.filter(function (o) { return band1Clear || o.level.band <= 2; });
    open.sort(function (a, b) {
      var pa = a.level.state === 'part' ? 0 : 1, pb = b.level.state === 'part' ? 0 : 1;
      return pa - pb || a.level.band - b.level.band || a.pi - b.pi;
    });
    return open.slice(0, 3).map(function (o) {
      var p = byId(o.planet.id), lv = p.levels[o.level.band - 1];
      var why = o.level.state === 'part' ? 'Started: ' + o.level.filled + ' of ' + o.level.of + ' answered, ' + o.level.ticked + ' of ' + o.level.ofChecks + ' ticked.'
        : (o.level.band === 1 ? 'Band 1 opens the planet in a few minutes.' : 'The lowest open band on this planet.');
      return { playbook: p, level: lv, state: o.level, why: why, minutes: lv.minutes };
    });
  }
  return { use: use, playbooks: playbooks, systems: systems, system: system, bands: bands, byId: byId, levelId: levelId, exercise: exercise, resolve: resolve, levelState: levelState, planet: planet, grid: grid, bandCleared: bandCleared, overall: overall, next: next };
});
