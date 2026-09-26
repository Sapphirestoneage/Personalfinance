/* ==========================================================================
   leads/engines/ladder.js, where you stand on each planet. LD-002.
   --------------------------------------------------------------------------
   data/book.json says what the levels are. This says where a person stands
   in them, and nothing else: it computes no money, writes nothing and
   invents no answer. The same shape as SPARKS' shared/solar.js, five bands
   instead of ten, and a sun that is a planet too (the lead magnet).

     use(book)                    take data/book.json (once per page)
     applies(planet, state)       { ok, why }: a dim planet is never hidden
                                  and never locked, it says what would light it
     levelState(level, state)     { state: done | part | notYet, filled, of,
                                    later }
     planet(id, state)            { id, band, done, of, applies, levels[], bands[] }
     grid(state)                  every planet by every band, for the sky
     next(state)                  the three levels to do next, and why
     overall(state)               { done, of, rings, lit }

   A level is done when every field it collects holds a value, every box on
   its checklist is ticked, and its "got it" (if it has one) was pressed. A
   level that reads the Machine is done when the Machine holds every number
   it names. Marking a level "later" puts it on the come-back list; it never
   counts as done.
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Ladder = api; }
})(typeof self !== 'undefined' ? self : null, function () {
  'use strict';

  var BOOK = null;
  function use(book) { BOOK = book || null; return BOOK; }
  function book() { return BOOK; }
  function planets() { return BOOK ? BOOK.planets.slice() : []; }
  function bands() { return BOOK ? BOOK.bands.slice() : []; }
  function levels() { return BOOK ? BOOK.levels.slice() : []; }
  function byId(id) {
    var all = BOOK ? BOOK.levels : [];
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return null;
  }
  function planetById(id) {
    var all = BOOK ? BOOK.planets : [];
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return null;
  }
  function forPlanet(id) { return levels().filter(function (l) { return l.planet === id; }); }

  /* ---- Entered or not -----------------------------------------------------
     Empty is not zero: '' and null are blank, 0 is an answer, [] is blank. */
  function entered(v) {
    if (v === undefined || v === null) return false;
    if (typeof v === 'string') return v.trim() !== '';
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'number') return isFinite(v);
    return !!v;
  }

  /* ---- The situation gate --------------------------------------------------
     Start Here's answers say which planets apply. A planet that does not
     apply is dim, with the sentence that says what would light it. */
  function applies(planet, state) {
    var p = typeof planet === 'string' ? planetById(planet) : planet;
    if (!p) return { ok: false, why: 'no such planet' };
    var s = (state && state.start) || {};
    var when = p.appliesWhen || 'always', ok;
    switch (when) {
      case 'always': ok = true; break;
      case 'budget': ok = s.budget === 'some'; break;
      case 'customers': ok = s.customers === 'some' || s.customers === 'many'; break;
      case 'team': ok = s.team === 'team' || s.team === 'hiring'; break;
      default: ok = false;
    }
    return { ok: ok, why: ok ? '' : (p.dimMessage || '') };
  }

  /* ---- One level -------------------------------------------------------- */
  function answersOf(state, id) { return (state && state.levels && state.levels[id]) || {}; }
  function levelState(level, state) {
    var lv = typeof level === 'string' ? byId(level) : level;
    if (!lv) return { state: 'notYet', filled: 0, of: 0, later: false, missing: [] };
    var a = answersOf(state, lv.id), of = 0, filled = 0, missing = [];
    (lv.fields || []).forEach(function (f) {
      if (f.optional) return;
      of++;
      if (entered(a.values && a.values[f.key])) filled++; else missing.push(f.label);
    });
    (lv.checklist || []).forEach(function (item, i) {
      of++;
      if (a.ticks && a.ticks[i]) filled++; else missing.push(item);
    });
    if (lv.confirm) { of++; if (a.confirmed) filled++; else missing.push(lv.confirm); }
    (lv.needs || []).forEach(function (k) {
      of++;
      if (entered(state && state.kpis && state.kpis[k])) filled++; else missing.push(k);
    });
    var st = of > 0 && filled === of ? 'done' : filled > 0 ? 'part' : 'notYet';
    return { state: st, filled: filled, of: of, later: !!a.later, missing: missing };
  }

  /* ---- One planet ----------------------------------------------------------
     Its levels by band, what is done, and the band it is working on: the
     lowest band with an open level (a finished planet sits on the last). */
  function planet(id, state) {
    var p = planetById(id); if (!p) return null;
    var lv = forPlanet(id), done = 0;
    var perBand = bands().map(function (b) {
      var mine = lv.filter(function (l) { return l.band === b.n; });
      var d = mine.filter(function (l) { return levelState(l, state).state === 'done'; }).length;
      return { n: b.n, id: b.id, name: b.name, done: d, of: mine.length, clear: mine.length > 0 && d === mine.length };
    });
    perBand.forEach(function (b) { done += b.done; });
    var band = 1;
    for (var i = 0; i < perBand.length; i++) { band = perBand[i].n; if (!perBand[i].clear) break; }
    var ap = applies(p, state);
    return { id: id, name: p.name, short: p.short, hue: p.hue, sun: !!p.sun, getter: !!p.getter, band: band, done: done, of: lv.length,
      started: done > 0, finished: lv.length > 0 && done === lv.length, applies: ap.ok, why: ap.why, levels: lv, bands: perBand };
  }
  function grid(state) { return (BOOK ? BOOK.order : []).map(function (id) { return planet(id, state); }).filter(Boolean); }

  /* ---- Rings and the whole ------------------------------------------------
     A ring is cleared when every planet that applies has cleared that band.
     A planet that does not apply does not hold a ring up (rule 6). */
  function ringCleared(n, state) {
    var g = grid(state).filter(function (p) { return p.applies; });
    if (!g.length) return false;
    return g.every(function (p) { var b = p.bands[n - 1]; return b && b.clear; });
  }
  function overall(state) {
    var g = grid(state), done = 0, of = 0, rings = 0;
    g.forEach(function (p) { done += p.done; of += p.of; });
    for (var n = 1; n <= bands().length; n++) { if (ringCleared(n, state)) rings = n; else break; }
    var sun = g.filter(function (p) { return p.sun; })[0];
    return { done: done, of: of, rings: rings, lit: sun ? (sun.of ? sun.done / sun.of : 0) : 0, planets: g.length, applying: g.filter(function (p) { return p.applies; }).length };
  }

  /* ---- The next three -----------------------------------------------------
     Book order (the sun, then the core four in the book's order for a
     one-person business, then the lead getters), lowest band first. The
     planet chosen in Start Here goes before the other three of the core
     four. Nothing above band 2 is suggested on any planet until the sun's
     first three bands and the first core four planet's band 2 are done,
     which is the book's own advice: one way, until it works. */
  function next(state) {
    var s = (state && state.start) || {};
    var order = (BOOK ? BOOK.order : []).slice();
    if (s.first && order.indexOf(s.first) > 0) { order.splice(order.indexOf(s.first), 1); order.splice(1, 0, s.first); }
    var g = {}; grid(state).forEach(function (p) { g[p.id] = p; });
    var sun = g.magnet, firstCore = g[s.first || 'warm'];
    var sunReady = sun && sun.bands.slice(0, 3).every(function (b) { return b.clear; });
    var coreReady = firstCore && firstCore.bands.slice(0, 2).every(function (b) { return b.clear; });
    var cap = (sunReady && coreReady) ? 5 : 2;
    var open = [];
    order.forEach(function (id, pi) {
      var p = g[id]; if (!p || !p.applies) return;
      p.levels.forEach(function (lv) {
        var st = levelState(lv, state);
        if (st.state === 'done' || st.later) return;
        if (lv.band > cap) return;
        open.push({ level: lv, planet: p, state: st, rank: lv.band * 100 + pi });
      });
    });
    open.sort(function (a, b) { return a.rank - b.rank || a.level.id.localeCompare(b.level.id); });
    var why = cap === 2 ? 'The book says one way, done every day, before anything else. So nothing past Sketch is suggested until the magnet and your first planet are drafted.'
      : 'Lowest band first, in the book\'s order: the magnet, your first planet, the rest of the core four, then the lead getters.';
    return { items: open.slice(0, 3), why: why, cap: cap };
  }
  function later(state) {
    return levels().filter(function (lv) { return levelState(lv, state).later; });
  }

  return { use: use, book: book, planets: planets, bands: bands, levels: levels, byId: byId, planetById: planetById, forPlanet: forPlanet,
    entered: entered, applies: applies, levelState: levelState, planet: planet, grid: grid, ringCleared: ringCleared, overall: overall, next: next, later: later };
});
