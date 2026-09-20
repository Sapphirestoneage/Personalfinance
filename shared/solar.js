/* ==========================================================================
   shared/solar.js, the planets, read against one household. D-321.
   --------------------------------------------------------------------------
   data/levels.json says what the 180 levels are. This says where a household
   stands in them, and nothing else: it computes no money, writes nothing, and
   invents no figure. Step 2 of docs/SOLAR-SYSTEM.md, the part the planets
   screen needs.

     use(levels)                 take data/levels.json (call once per page)
     applies(level, h)           the situation gate: a level that does not
                                 apply is ABSENT, never greyed (rule 6), and
                                 the planet's maximum shrinks with it
     levelState(level, h)        { state, filled, of, fields[], guessed }
                                 state: done | part | notYet
     planet(id, h)               one planet: its levels, what is done, the
                                 band it is working on, how far it has come
     grid(h)                     six planets by ten bands, for the screen
     bandCleared(band, h)        every planet has finished that band, which
                                 is the ring-complete moment (1.4 rule 8)
     next(h)                     the level to do next, and why it is that one
     overall(h)                  { done, applicable, rings, planets }

   A level is done when every field it collects holds a value. A field is
   either one of the app's own (shared/ownership.js, so anything already in
   the Ledger counts the day this ships: migrate, do not reset) or a new key
   the Solar System will store under levels.<planet>.<key>. Nothing here
   marks a level done that the person did not answer.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('./money.js'), Schema: require('./schema.js'), Ownership: require('./ownership.js'),
      Levers: (function () { try { return require('./levers.js'); } catch (e) { return null; } })() };
  } else {
    var S = root.SLAF || {};
    deps = { Money: S.Money, Schema: S.Schema, Ownership: S.Ownership, Levers: S.Levers };
  }
  var api = factory(deps.Money, deps.Schema, deps.Ownership, deps.Levers);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Solar = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Ownership, Levers) {
  'use strict';

  var TABLE = null;
  function use(levels) { TABLE = levels || null; return TABLE; }
  function table() { return TABLE; }
  function planets() { return TABLE ? TABLE.planets.slice() : []; }
  function bands() { return TABLE ? TABLE.bands.slice() : []; }
  function levels() { return TABLE ? TABLE.levels.slice() : []; }
  function byId(id) {
    var all = TABLE ? TABLE.levels : [];
    for (var i = 0; i < all.length; i++) { if (all[i].id === id) return all[i]; }
    return null;
  }
  function forPlanet(id) { return levels().filter(function (l) { return l.planet === id; }); }

  /* ---- The situation gate (rule 6) ---------------------------------------
     The phrases data/levels.json declares. The ones shared/levers.js already
     reads are handed to it, so a phrase is never read two ways. */
  function has(h, path) {
    var parts = String(path).split('.'), node = h;
    for (var i = 0; i < parts.length; i++) {
      if (!node || typeof node !== 'object') return false;
      node = node[parts[i]];
    }
    return node !== undefined && node !== null && node !== '';
  }
  function debts(h) { return (h && h.debts) || []; }
  function assets(h) { return (h && h.assets) || []; }
  function applies(level, h) {
    var when = (level && level.appliesWhen) || 'always';
    h = h || {};
    switch (when) {
      case 'always': return true;
      case 'debt.mortgage': return debts(h).some(function (d) { return d.type === 'mortgage'; });
      case 'debt.variable': return debts(h).some(function (d) { return d.rateType === 'variable'; });
      case 'debt.promo': return debts(h).some(function (d) { return d.promoRate !== undefined && d.promoRate !== null; });
      case 'income.selfEmployed': return (h.people || []).some(function (p) { return p.employmentStatus === 'selfEmployed' || p.employmentStatus === 'both'; })
        || (h.people || []).some(function (p) { return (p.incomeSources || []).some(function (s) { return s.kind === '1099' || s.kind === 'business' || s.kind === 'selfEmployed'; }); });
      case 'income.side': return (h.people || []).some(function (p) { return (p.incomeSources || []).length > 1; });
      case 'income.equity': return assets(h).some(function (a) { return a.category === 'equityComp' || a.accountType === 'rsu'; });
      case 'asset.taxable': return assets(h).some(function (a) { return a.taxCharacter === 'taxable' || a.accountType === 'brokerage'; });
      case 'asset.home': return assets(h).some(function (a) { return a.category === 'property' || a.accountType === 'home'; }) || ((h.property || []).length > 0);
      case 'asset.property': return applies({ appliesWhen: 'asset.home' }, h) || applies({ appliesWhen: 'intent.buy' }, h);
      case 'asset.other': return assets(h).some(function (a) { return a.category === 'other' || a.category === 'crypto' || a.category === 'business'; });
      case 'cash.uses': return (h.plans && (h.plans.cashUses || []).length > 0) || false;
      case 'plan.move': return has(h, 'housing.moveTo') || has(h, 'meta.moveTo');
      case 'plan.school': return has(h, 'meta.schoolPlanned');
      default:
        if (Levers && Levers.appliesWhen) { try { return !!Levers.appliesWhen(when, h); } catch (e) { return false; } }
        return false;
    }
  }

  /* ---- One level ----------------------------------------------------------
     Its fields, and whether each holds anything. An app field is read through
     its owner; a Solar-only field is read from levels.<planet>.<key>. */
  function stored(h, level, key) {
    var box = h && h.levels && h.levels[level.planet];
    var v = box ? box[key] : undefined;
    return v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length);
  }
  function fieldState(h, level, f) {
    if (f.existing && Ownership && Ownership.FIELDS && Ownership.FIELDS[f.key]) {
      var d = null;
      try { d = Ownership.describe(f.key, h || {}, null); } catch (e) { d = null; }
      if (d) return { key: f.key, label: f.label, filled: !!d.isSet, applies: d.applies !== false, guessed: !!d.guessed, href: d.href, display: d.display, own: true };
      return { key: f.key, label: f.label, filled: false, applies: true, guessed: false, href: null, display: null, own: true };
    }
    return { key: f.key, label: f.label, filled: stored(h, level, f.key), applies: true, guessed: false, href: null, display: null, own: false };
  }
  function levelState(level, h) {
    var fields = (level.fields || []).map(function (f) { return fieldState(h, level, f); });
    var live = fields.filter(function (f) { return f.applies; });
    var filled = live.filter(function (f) { return f.filled; });
    return {
      id: level.id,
      state: !live.length ? 'notYet' : filled.length === live.length ? 'done' : filled.length ? 'part' : 'notYet',
      filled: filled.length,
      of: live.length,
      guessed: filled.some(function (f) { return f.guessed; }),
      fields: fields
    };
  }

  /* ---- One planet ---------------------------------------------------------
     Its applicable levels, what is done, and the band it is working on: the
     lowest band that is not finished. A planet whose levels have dropped out
     (no debt) has a smaller maximum, and its bands still count as cleared. */
  function planet(id, h) {
    var meta = planets().filter(function (p) { return p.id === id; })[0] || { id: id, label: id, letter: '?' };
    var rows = forPlanet(id).map(function (l) {
      var applicable = applies(l, h);
      var st = applicable ? levelState(l, h) : { id: l.id, state: 'absent', filled: 0, of: 0, guessed: false, fields: [] };
      return { level: l, applies: applicable, state: st.state, filled: st.filled, of: st.of, guessed: st.guessed, fields: st.fields };
    });
    var live = rows.filter(function (r) { return r.applies; });
    var done = live.filter(function (r) { return r.state === 'done'; });
    var byBand = [];
    for (var b = 1; b <= 10; b++) {
      var inBand = rows.filter(function (r) { return r.level.band === b; });
      var liveBand = inBand.filter(function (r) { return r.applies; });
      var doneBand = liveBand.filter(function (r) { return r.state === 'done'; });
      var partBand = liveBand.filter(function (r) { return r.state === 'part'; });
      byBand.push({
        band: b,
        name: (bands()[b - 1] || {}).name || ('Band ' + b),
        rows: inBand,
        applicable: liveBand.length,
        done: doneBand.length,
        started: doneBand.length + partBand.length,
        /* A band with no applicable level counts as complete (rule 6). */
        cleared: liveBand.length === 0 || doneBand.length === liveBand.length
      });
    }
    var working = 10;
    for (var i = 0; i < byBand.length; i++) { if (!byBand[i].cleared) { working = byBand[i].band; break; } }
    return {
      id: meta.id, label: meta.label, letter: meta.letter, order: meta.order,
      rows: rows, bands: byBand,
      applicable: live.length, done: done.length,
      /* The level number it has reached: the highest done level with every
         earlier applicable level done, so a skipped level is not counted. */
      reached: (function () {
        var n = 0;
        for (var j = 0; j < rows.length; j++) {
          if (!rows[j].applies) { n = rows[j].level.level; continue; }
          if (rows[j].state === 'done') n = rows[j].level.level; else break;
        }
        return n;
      })(),
      working: working,
      cleared: byBand.filter(function (b) { return b.cleared; }).length
    };
  }

  function grid(h) { return planets().map(function (p) { return planet(p.id, h); }); }
  function bandCleared(band, h) { return grid(h).every(function (p) { return (p.bands[band - 1] || {}).cleared; }); }

  /* ---- What to do next ----------------------------------------------------
     The lowest band with something open, and inside it the load-bearing
     level first (its grade), then the cheapest in minutes. Band 2 is never
     suggested while any planet has band 1 open (rule 9). */
  var GRADE = { S: 0, A: 1, B: 2, C: 3 };
  function next(h) {
    var all = [];
    grid(h).forEach(function (p) {
      p.rows.forEach(function (r) { if (r.applies && r.state !== 'done') all.push({ planet: p, row: r }); });
    });
    if (!all.length) return null;
    var lowest = Math.min.apply(null, all.map(function (o) { return o.row.level.band; }));
    var pool = all.filter(function (o) { return o.row.level.band === lowest; });
    pool.sort(function (a, b) {
      var g = GRADE[a.row.level.grade] - GRADE[b.row.level.grade];
      if (g) return g;
      var m = a.row.level.minutes - b.row.level.minutes;
      if (m) return m;
      return a.planet.order - b.planet.order;
    });
    var pick = pool[0];
    return { level: pick.row.level, planet: pick.planet.id, planetLabel: pick.planet.label, band: lowest, state: pick.row.state,
      why: lowest === 1 ? 'Band 1 on every planet first: it takes a couple of minutes and lights the first metrics.'
        : 'The lowest band still open, and the level the most readings lean on.' };
  }

  function overall(h) {
    var g = grid(h);
    var rings = 0;
    for (var b = 1; b <= 10; b++) { if (g.every(function (p) { return p.bands[b - 1].cleared; })) rings = b; else break; }
    return {
      planets: g,
      done: g.reduce(function (n, p) { return n + p.done; }, 0),
      applicable: g.reduce(function (n, p) { return n + p.applicable; }, 0),
      rings: rings,
      next: next(h)
    };
  }

  return {
    use: use, table: table,
    planets: planets, bands: bands, levels: levels, byId: byId, forPlanet: forPlanet,
    applies: applies, levelState: levelState,
    planet: planet, grid: grid, bandCleared: bandCleared, next: next, overall: overall
  };
});
