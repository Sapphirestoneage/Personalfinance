/* ==========================================================================
   engines/skilltree.js — the Skill Tree: household in, per-skill state and
   reason out. DECISIONS.md D-131.
   --------------------------------------------------------------------------
   Two parallel orders of operations. The FOO ladder says what the next
   dollar does; this tree says what the next hour does; and they cross
   unlock each other the way Civ VI's technology and civics trees do.

   Four states per skill, and a fifth the board draws:
     done      the skill's own proof was met (stored: skillTree.state[id])
     open      every unlock condition is met, or something the household
               did in the app boosted it open (never to done)
     locked    a condition is unmet, and it ALWAYS says which, with a link
     bypassed  a warp's proof shows the person is already past it: counts
               as satisfied for unlocking, drawn dashed, reopenable forever
     fogged    a band beyond the next one: silhouettes and a count, no name
   A skill the situation rules out is NOT YOURS: it is absent, never
   counted, never greyed (D-055's "not applicable is not missing").

   Only `done` is ever stored. Everything else is derived here on every
   call from the household, the tables and what the app has recorded, so
   the tree cannot drift from the facts. A boost moves a skill to open,
   never to done; a warp reveals, it never awards. Money is never touched.

   Reads: data/skill_tree.json (bands, trees, skills, warps),
   data/skill_links.json (cross links, the ladder both ways), and the
   household through Schema, Ownership, Foo, Tier0 and Gate. Snapshots are
   the spine's and are passed in as opts.snapshots (a count), the way the
   ratios engine takes them, so this file never depends on the spine.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('../shared/money.js'), Schema: require('../shared/schema.js'), Ownership: require('../shared/ownership.js'),
             Foo: require('./foo.js'), Tier0: require('./tier0.js'), Gate: require('../shared/gate.js') };
  } else {
    var S = root.SLAF || {};
    deps = { Money: S.Money, Schema: S.Schema, Ownership: S.Ownership, Foo: S.Foo, Tier0: S.Tier0, Gate: S.Gate };
  }
  var api = factory(deps.Money, deps.Schema, deps.Ownership, deps.Foo, deps.Tier0, deps.Gate);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.SkillTree = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Ownership, Foo, Tier0, Gate) {
  'use strict';

  var STATES = ['done', 'open', 'locked', 'bypassed', 'fogged'];
  var NEXT_OPEN_COUNT = 3;
  var LOG_BOOST_COUNT = 30;

  /* ---- The tables ---------------------------------------------------------- */
  function table(T) { var t = T && T.skillTree; if (!t || !t.skills) throw new Error('The skill tree table (data/skill_tree.json) is not loaded.'); return t; }
  function links(T) { return (T && T.skillLinks) || { links: [], fooRequires: {}, fooUnlocks: {} }; }
  function bands(T) { return (table(T).bands || []).slice().sort(function (a, b) { return a.order - b.order; }); }
  function bandOrder(T, id) { var b = bands(T).filter(function (x) { return x.id === id; })[0]; return b ? b.order : 99; }
  function skills(T) { return table(T).skills || []; }
  function byId(T, id) { return skills(T).filter(function (s) { return s.id === id; })[0] || null; }
  function warps(T) { return table(T).warps || []; }

  /* ---- What the household has done in the app: the boost events ------------ */
  function closedMonths(h) { return ((h && h.ledger && h.ledger.months) || []).filter(function (m) { return m && m.status === 'closed'; }).length; }
  function logCount(h) { return ((h && h.expenses && h.expenses.entries) || []).filter(function (e) { return e && e.source === 'log' && e.active !== false && e.date; }).length; }
  function debtsPaid(h) { return ((h && h.debts) || []).filter(function (d) { return d && (d.archived === true || d.balanceCents === 0); }).length; }
  function exercisesDone(h) { return Object.keys((h && h.exercises && h.exercises.done) || {}).length; }
  function factHolds(h, fieldId) {
    if (!Ownership) return false;
    var f = Ownership.field(fieldId);
    if (!f) return false;
    if (f.applies && !f.applies(h || {})) return false;
    var r; try { r = f.read(h || {}); } catch (e) { return false; }
    if (!Money.isOk(r)) return false;
    return r.value === true || (typeof r.value === 'number' && r.value > 0) || (typeof r.value === 'string' && r.value.length > 0);
  }
  function houseOwnedOutright(h) {
    var assets = (h && h.assets) || [];
    var props = (h && h.properties) || [];
    var debts = (h && h.debts) || [];
    return assets.some(function (a) {
      if (!a || a.category !== 'real_estate' || !Money.isEntered(a.valueCents) || a.valueCents <= 0) return false;
      var p = props.filter(function (x) { return x.assetId === a.id; })[0];
      if (!p || !p.mortgageId) return true;
      var m = debts.filter(function (d) { return d.id === p.mortgageId; })[0];
      return !m || m.archived === true || m.balanceCents === 0;
    });
  }
  /**
   * events(h, opts) — every app event a boost can name, with its count or
   * truth: { monthClosed, log30, debtPaid, snapshot, exercise:<id>, fact:<field> }.
   */
  function events(h, opts) {
    var o = opts || {};
    return {
      monthsClosed: closedMonths(h),
      logCount: logCount(h),
      debtsPaid: debtsPaid(h),
      snapshots: Money.isEntered(o.snapshots) ? o.snapshots : 0,
      exercisesDone: exercisesDone(h)
    };
  }
  function eventMet(h, ev, id) {
    if (id === 'monthClosed') return ev.monthsClosed >= 1;
    if (id === 'log30') return ev.logCount >= LOG_BOOST_COUNT;
    if (id === 'debtPaid') return ev.debtsPaid >= 1;
    if (id === 'snapshot') return ev.snapshots >= 1;
    if (id.indexOf('exercise:') === 0) return !!((h.exercises && h.exercises.done) || {})[id.slice(9)];
    if (id.indexOf('fact:') === 0) return factHolds(h, id.slice(5));
    return false;
  }

  /* ---- The ladder ---------------------------------------------------------- */
  function fooStep(h, T) {
    if (!Foo) return null;
    var foo = Foo.evaluate(h, T);
    if (!foo || !foo.placement || !Money.isEntered(foo.placement.step)) return null;
    return foo.placement.step;
  }

  /* ---- Situation ----------------------------------------------------------- */
  function situation(h) { return Gate ? Gate.situationOf(h) : null; }
  function applies(h, skill) {
    var sit = situation(h);
    return (skill.appliesWhen || []).every(function (c) {
      if (c.field === 'situation') {
        if (!sit) return true;            /* not answered yet: the gate will ask; the skill stays yours */
        var v = c.value || [];
        return c.op === 'notIn' ? v.indexOf(sit) < 0 : v.indexOf(sit) >= 0;
      }
      return true;
    });
  }

  /* ---- Household thresholds ------------------------------------------------ */
  var THRESHOLD_WORDS = {
    monthsClosed: { one: 'closed month in the ledger', many: 'closed months in the ledger', href: 'budget.html#close' },
    logCount: { one: 'dated expense in the log', many: 'dated expenses in the log', href: 'cash-flow.html#log' },
    snapshots: { one: 'snapshot frozen', many: 'snapshots frozen', href: 'refresh.html#snapshot' },
    exercisesDone: { one: 'exercise completed', many: 'exercises completed', href: 'exercises.html' },
    debtsPaid: { one: 'debt paid off', many: 'debts paid off', href: 'debt-payoff.html#debts' }
  };
  function numberWord(n) { return ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'][n] || String(n); }
  function thresholdReason(ev, req) {
    var have = ev[req.field];
    var w = THRESHOLD_WORDS[req.field] || { one: req.field, many: req.field, href: 'start.html' };
    if (!Money.isEntered(have)) return null;
    if (have >= req.gte) return null;
    return { text: 'Locked. Needs ' + numberWord(req.gte) + ' ' + (req.gte === 1 ? w.one : w.many) + '. You have ' + have + '.', href: w.href, kind: 'household' };
  }

  /* ---- Warps: a skip you earn by proving you are already past it ----------- */
  function warpActive(h, T, w, ev) {
    var p = w.proof || {};
    if (p.kind === 'ratio') {
      if (p.field === 'emergencyFundMonths' && Tier0) { var r = Tier0.emergencyFundMonths(h); return Money.isOk(r) && r.value >= p.gte; }
      return false;
    }
    if (p.kind === 'household') {
      if (p.field === 'houseOwnedOutright') return houseOwnedOutright(h) === (p.equals !== false);
      var have = ev[p.field];
      return Money.isEntered(have) && (p.gte !== undefined ? have >= p.gte : have === p.equals);
    }
    if (p.kind === 'facts') return (p.all || []).every(function (f) { return factHolds(h, f); });
    if (p.kind === 'fact') return factHolds(h, p.field) === (p.equals !== false);
    return false;
  }

  /* ---- Unlock chips: what a skill improves, as links ----------------------- */
  var NUMBER_WORDS = { savingsRate: 'Savings rate', monthlyExpenses: 'A month of spending', emergencyFundMonths: 'Runway', grossAnnualIncome: 'Income', safeWithdrawalRate: 'Safe withdrawal rate', bridgeGapYears: 'Bridge to 59½', worstPlausibleYearCoverage: 'Worst-year coverage' };
  function chips(skill, roomTitle) {
    return (skill.unlocks || []).map(function (u) {
      if (u.room) return { kind: 'room', id: u.room, label: roomTitle ? roomTitle(u.room) : u.room, href: u.room + '.html' };
      return { kind: 'number', id: u.number, label: NUMBER_WORDS[u.number] || u.number, href: 'ratios.html#r-' + u.number };
    });
  }

  /**
   * evaluate(household, tables, opts) — the whole tree, judged.
   *   opts.snapshots   how many snapshots the spine holds
   *   opts.roomTitle   fn(roomId) → title, for the unlock chips
   *   opts.reveal      keep fogged skills' names (tests only; the room never asks)
   *   opts.exercises   the exercises table, to attach each skill's first action
   * Returns Money.ok(countDone, { skills, byId, bands, currentBand, fooStep,
   *   warps, nextOpen, counts, events, ladderNeeds }). Never incomplete: an
   * empty household is a tree with everything locked and every reason said.
   */
  function evaluate(household, tables, opts) {
    var h = household || {};
    var T = tables || {};
    var o = opts || {};
    var all = skills(T);
    var ev = events(h, o);
    var step = fooStep(h, T);
    var stored = (h.skillTree && h.skillTree.state) || {};
    var activeWarps = warps(T).map(function (w) { return { id: w.id, label: w.label, active: warpActive(h, T, w, ev), bypasses: w.bypasses || [] }; });
    var bypassedBy = {};
    activeWarps.forEach(function (w) { if (w.active) w.bypasses.forEach(function (id) { bypassedBy[id] = w; }); });

    var exTable = o.exercises || T.exercises;
    var exercisesFor = function (id) { return ((exTable && exTable.exercises) || []).filter(function (e) { return (e.advances || []).indexOf(id) >= 0; }).map(function (e) { return e.id; }); };
    var yours = all.filter(function (s) { return applies(h, s); });
    var yoursById = {}; yours.forEach(function (s) { yoursById[s.id] = s; });
    var out = {};
    var satisfied = function (id) { var st = out[id]; return !!st && (st.state === 'done' || st.state === 'bypassed'); };

    /* First pass: done and bypassed, which need nothing else. */
    yours.forEach(function (s) {
      var d = stored[s.id];
      if (d && d.state === 'done') out[s.id] = { state: 'done', provenance: d.by === 'proof' ? 'proof' : 'self', doneOn: d.on || null, reasons: [] };
      else if (bypassedBy[s.id]) out[s.id] = { state: 'bypassed', provenance: 'warp', warp: bypassedBy[s.id].id, warpLabel: bypassedBy[s.id].label, reasons: [] };
    });
    /* Second pass: open or locked, with the reasons; iterate until stable
       since a prerequisite may be decided later in the list. */
    var changed = true, guard = 0;
    while (changed && guard++ < 50) {
      changed = false;
      yours.forEach(function (s) {
        if (out[s.id] && out[s.id].state !== 'locked' && out[s.id].state !== 'open') return;
        var reasons = [];
        (s.prereqs || []).forEach(function (p) {
          if (satisfied(p)) return;
          var ps = byId(T, p);
          if (!ps || !yoursById[p]) return;        /* a prerequisite that is not yours does not bind */
          reasons.push({ text: 'Locked. Needs: ' + ps.name + '.', href: '#skill-' + p, kind: 'skill', skill: p });
        });
        if (s.gate && Money.isEntered(s.gate.foo)) {
          if (step === null) reasons.push({ text: 'Locked. Opens at FOO step ' + s.gate.foo + '. You are not placed on the ladder yet.', href: 'foo-ladder.html', kind: 'ladder' });
          else if (step < s.gate.foo) reasons.push({ text: 'Locked. Opens at FOO step ' + s.gate.foo + '. You are on step ' + step + '.', href: 'foo-ladder.html', kind: 'ladder' });
        }
        (s.requires || []).forEach(function (req) { var r = thresholdReason(ev, req); if (r) reasons.push(r); });
        /* Boosts: the events the skill names, plus every completed exercise
           that advances it — an exercise is attached to one skill and
           completing it boosts that skill (never to done). */
        var boostIds = (s.boostedBy || []).slice();
        exercisesFor(s.id).forEach(function (exId) { if (boostIds.indexOf('exercise:' + exId) < 0) boostIds.push('exercise:' + exId); });
        var met = boostIds.filter(function (id) { return eventMet(h, ev, id); });
        var boost = { fraction: boostIds.length ? met.length / boostIds.length : 0, met: met, of: boostIds.length };
        var state = reasons.length ? 'locked' : 'open';
        var provenance = null;
        if (state === 'locked' && met.length) { state = 'open'; provenance = 'boost'; }
        var prev = out[s.id];
        if (!prev || prev.state !== state) changed = true;
        out[s.id] = { state: state, provenance: provenance, reasons: state === 'locked' ? reasons : [], lockedBy: reasons, boost: boost };
      });
    }

    /* Bands: yours in full up to the one you are in, the next half lit, the rest fogged. */
    var bs = bands(T);
    var current = null;
    bs.forEach(function (b) {
      if (current) return;
      var mine = yours.filter(function (s) { return s.band === b.id; });
      if (mine.some(function (s) { return !satisfied(s.id); })) current = b;
    });
    if (!current) current = bs[bs.length - 1] || null;
    var currentOrder = current ? current.order : 1;
    var visibility = {};
    bs.forEach(function (b) { visibility[b.id] = b.order <= currentOrder ? 'full' : b.order === currentOrder + 1 ? 'dim' : 'fogged'; });

    var firstActionOf = function (id) {
      var list = (exTable && exTable.exercises) || [];
      var ex = list.filter(function (e) { return e.kind === 'micro' && (e.advances || []).indexOf(id) >= 0; })[0];
      return ex ? { id: ex.id, title: ex.title, minutes: ex.minutes, room: ex.room } : null;
    };
    var rows = yours.map(function (s) {
      var st = out[s.id] || { state: 'locked', reasons: [], boost: { fraction: 0, met: [], of: 0 } };
      var fog = visibility[s.band] === 'fogged';
      var dim = visibility[s.band] === 'dim';
      var state = fog ? 'fogged' : st.state;
      return {
        id: s.id, name: fog && !o.reveal ? null : s.name, tree: s.tree, band: s.band, minutes: s.minutes,
        state: state, provenance: st.provenance || null, doneOn: st.doneOn || null, warp: st.warp || null, warpLabel: st.warpLabel || null,
        reasons: fog ? [] : st.reasons, boost: st.boost || { fraction: 0, met: [], of: 0 },
        prereqs: s.prereqs || [], gate: s.gate || null, proof: fog ? null : s.proof,
        unlocks: fog || dim ? [] : chips(s, o.roomTitle), firstAction: fog || dim ? null : firstActionOf(s.id),
        unlocksSkills: yours.filter(function (x) { return (x.prereqs || []).indexOf(s.id) >= 0; }).map(function (x) { return x.id; }),
        stackerId: s.stackerId || null, dim: dim
      };
    });
    var rowsById = {}; rows.forEach(function (r) { rowsById[r.id] = r; });
    var counts = { yours: rows.length, notYours: all.length - rows.length, done: 0, open: 0, locked: 0, bypassed: 0, fogged: 0 };
    rows.forEach(function (r) { counts[r.state] = (counts[r.state] || 0) + 1; });
    var bandRows = bs.map(function (b) {
      var mine = rows.filter(function (r) { return r.band === b.id; });
      return { id: b.id, label: b.label, order: b.order, visibility: visibility[b.id], count: mine.length,
        done: mine.filter(function (r) { return r.state === 'done'; }).length, open: mine.filter(function (r) { return r.state === 'open'; }).length };
    });
    var nextOpen = rows.filter(function (r) { return r.state === 'open'; })
      .sort(function (a, b) { return (bandOrder(T, a.band) - bandOrder(T, b.band)) || (b.unlocksSkills.length - a.unlocksSkills.length) || (a.name || '').localeCompare(b.name || ''); })
      .slice(0, NEXT_OPEN_COUNT);
    var L = links(T);
    var ladderNeeds = {};
    Object.keys(L.fooRequires || {}).forEach(function (stepKey) {
      var missing = (L.fooRequires[stepKey] || []).filter(function (id) { return yoursById[id] && !satisfied(id); });
      if (missing.length) ladderNeeds[stepKey] = missing;
    });
    return Money.ok(counts.done, {
      skills: rows, byId: rowsById, bands: bandRows, currentBand: current ? current.id : null, fooStep: step,
      warps: activeWarps, nextOpen: nextOpen, counts: counts, events: ev, ladderNeeds: ladderNeeds, situation: situation(h)
    });
  }

  /** The tree's word on one skill, for the Stacker and the dashboard. */
  function stateOf(household, tables, id, opts) {
    var r = evaluate(household, tables, opts);
    return r.byId[id] || null;
  }
  /** The Stacker's catalogue id → the tree's row, when the seed links them. */
  function byStackerId(household, tables, stackerId, opts) {
    var r = evaluate(household, tables, opts);
    return r.skills.filter(function (s) { return s.stackerId === stackerId; })[0] || null;
  }

  return {
    STATES: STATES,
    NEXT_OPEN_COUNT: NEXT_OPEN_COUNT,
    LOG_BOOST_COUNT: LOG_BOOST_COUNT,
    bands: bands,
    skills: skills,
    byId: byId,
    warps: warps,
    events: events,
    fooStep: fooStep,
    applies: applies,
    evaluate: evaluate,
    stateOf: stateOf,
    byStackerId: byStackerId
  };
});
