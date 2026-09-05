/* ==========================================================================
   engines/skills.js — the Skill Stacker's engine: three skills at a time,
   did or didn't, what a day of practice is worth, and what the ledger
   becomes by 65.
   BRIEF §7, DECISIONS.md D-090.
   --------------------------------------------------------------------------
   The catalogue (dnd/data/skills.json, hundred_ways.json, stacks.json,
   curves.json) says what a skill IS; the household's `skills` map says
   where each one stands; this file is every rule that moves one between
   the two. Nothing here is a score. A day logged is a row in the practice
   ledger with what that day's practice was worth in cents, and the only
   totals are sums of those rows — feedback, not points (BRIEF §7 D-C).

   Value comes one way: `effect.cents` a year, or `effect.formula` in the
   life-events expression language over Events.context — so "a third of
   the dining-out line" is the same figure whichever room asks. A `risk`
   effect is worth $0 a year on purpose: the Anchor stack is worth nothing
   in a normal year and everything in a bad one, and pretending otherwise
   would put a number on sleep.

   States, by kind:
     once      locked → available → trial → done
     habit     locked → available → trial → practicing → habit  (and back)
     periodic  locked → available → practicing → done  (due again later)
   `equip` puts a skill in trial/practicing; at most rules.maxEquipped sit
   there at once, and a fourth is refused with the reason. A habit that
   goes unlogged decays: to practicing after its decayDays, to available
   after rules.lapseDays. A once-skill with a `verify` clause is marked
   done from the household's own facts on load, and un-marked if the fact
   stops holding — the room never asks what the model already knows.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = {
      Money: require('../shared/money.js'),
      Schema: require('../shared/schema.js'),
      Events: require('./events.js'),
      Benchmarks: require('./benchmarks.js'),
      Ownership: require('../shared/ownership.js'),
      Foo: require('./foo.js')
    };
  } else {
    var S = root.SLAF || {};
    deps = { Money: S.Money, Schema: S.Schema, Events: S.Events || null,
             Benchmarks: S.Benchmarks || null, Ownership: S.Ownership || null, Foo: S.Foo || null };
  }
  var api = factory(deps.Money, deps.Schema, deps.Events, deps.Benchmarks, deps.Ownership, deps.Foo);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Skills = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Events, Benchmarks, Ownership, Foo) {
  'use strict';

  var MS_PER_DAY = 86400000;
  var DAYS_PER_YEAR = 365;
  var MINUTES_PER_HOUR = 60;
  var OWNER = 'stacker';

  /* Which stored states count as "doing it" — the ones a stack, the
     automation ratio and a prerequisite read as satisfied — per kind. */
  var ACTIVE_BY_KIND = { once: ['done'], habit: ['practicing', 'habit'], periodic: ['done'] };
  var EQUIPPED = ['trial', 'practicing'];
  var SATISFIES_PREREQ = ['done', 'habit'];

  /* ---- 0. Days ------------------------------------------------------------ */

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  /** A calendar day as YYYY-MM-DD. Undefined means today, in local time —
      the day the person taps is the day on their clock, not UTC's. A
      10-character string is taken as it is; anything else is a Date. */
  function dayISO(when) {
    if (typeof when === 'string' && when.length === 10) return when;
    var d = when === undefined || when === null ? new Date() : new Date(when);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function dayNumber(iso) { return Math.round(Date.parse(iso + 'T00:00:00Z') / MS_PER_DAY); }
  function addDays(iso, n) { return new Date((dayNumber(iso) + n) * MS_PER_DAY).toISOString().slice(0, 10); }
  function daysBetween(fromISO, toISO) { return dayNumber(toISO) - dayNumber(fromISO); }

  /* ---- 1. The catalogue ---------------------------------------------------- */

  function rules(tables) {
    var t = tables && tables.skills && tables.skills.rules;
    if (!t) throw new Error('The skills catalogue is not loaded.');
    return t;
  }

  /** A hundred-ways entry read as a skill: the defaults from its own file,
      the way's name, kind and cents on top. */
  function wayAsSkill(way, defaults) {
    var d = defaults || {};
    var habit = way.kind === 'habit';
    return {
      id: way.id, name: way.name, lever: d.lever || 'keeper',
      subStats: Object.assign({}, d.subStats || {}),
      kind: way.kind,
      effect: { type: 'cents_per_year', cents: way.cents },
      effort: { learnHours: (d.effort || {}).learnHours || 0, practiceMinutes: habit ? ((d.effort || {}).practiceMinutes || 0) : 0 },
      prereqs: [], unlocks: [], synergy: [], verify: null,
      decayDays: habit ? (d.decayDays || null) : null,
      everyDays: way.kind === 'periodic' ? (d.everyDays || null) : null,
      fooStep: d.fooStep || 0, level: d.level || 1,
      source: 'hundred_ways', trial: true
    };
  }

  /** Every skill the Stacker knows: the catalogue, then the hundred ways. */
  function catalogue(tables) {
    var out = [];
    var seen = {};
    ((tables && tables.skills && tables.skills.skills) || []).forEach(function (s) {
      if (!seen[s.id]) { seen[s.id] = true; out.push(s); }
    });
    var hw = tables && tables.hundredWays;
    ((hw && hw.ways) || []).forEach(function (w) {
      if (!seen[w.id]) { seen[w.id] = true; out.push(wayAsSkill(w, hw.defaults)); }
    });
    return out;
  }

  function byId(tables, id) {
    var list = catalogue(tables);
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  /* ---- 2. Standing ---------------------------------------------------------- */

  function stored(household, id) {
    return (household && household.skills && household.skills[id]) || null;
  }
  /* Done lives in the Skill Tree (household.skillTree.state), the one
     place a skill is marked mastered, so the Stacker and the tree can never
     disagree (D-131). The Stacker keeps only its practice states here. */
  function treeDone(household, id) {
    var t = household && household.skillTree && household.skillTree.state && household.skillTree.state[id];
    return !!(t && t.state === 'done');
  }
  function treePatch(household, id, on, by) {
    var next = Schema.createSkillTree(household.skillTree || {});
    if (on === false) delete next.state[id];
    else next.state[id] = { state: 'done', on: on, by: by === 'proof' ? 'proof' : 'self' };
    return next;
  }

  function satisfied(household, id) {
    if (treeDone(household, id)) return true;
    var s = stored(household, id);
    return !!s && SATISFIES_PREREQ.indexOf(s.state) >= 0;
  }

  function unmetPrereqs(household, skill) {
    return (skill.prereqs || []).filter(function (id) { return !satisfied(household, id); });
  }

  /** locked / available / trial / practicing / habit / done. The stored
      state wins once the skill has been touched; before that it is locked
      until every prerequisite is met, else available. */
  function state(household, skill) {
    if (treeDone(household, skill.id)) return 'done';
    var s = stored(household, skill.id);
    if (s && s.state && s.state !== 'locked' && s.state !== 'available' && s.state !== 'done') return s.state;
    return unmetPrereqs(household, skill).length ? 'locked' : 'available';
  }

  function isActive(household, skill) {
    return (ACTIVE_BY_KIND[skill.kind] || []).indexOf(state(household, skill)) >= 0;
  }

  function equipped(household, tables) {
    return catalogue(tables).filter(function (s) { return EQUIPPED.indexOf(state(household, s)) >= 0; });
  }

  /* ---- 3. Worth ------------------------------------------------------------- */

  function contextFor(household, tables) {
    if (!Events) return null;
    return Events.context(household, tables || {});
  }

  /**
   * What a skill is worth a year, in cents. Risk skills are $0 by design
   * (and say so with `risk: true`); a formula that cannot be evaluated on
   * this household comes back incomplete, not zero.
   */
  function valuePerYear(household, skill, tables, ctx) {
    var e = skill.effect || {};
    if (e.type === 'risk') return Money.ok(0, { risk: true, source: 'risk' });
    if (Money.isEntered(e.cents)) return Money.ok(Math.round(e.cents), { source: 'cents' });
    if (!e.formula) return Money.incomplete('This skill has no stated effect.', [skill.id]);
    if (!Events) return Money.incomplete('The events engine is not loaded, so the formula cannot run.', ['events']);
    var c = ctx || contextFor(household, tables);
    var v = Events.evaluate(e.formula, { ctx: c, answers: {}, tables: tables || {} });
    if (v === null || typeof v !== 'number' || !Number.isFinite(v)) {
      return Money.incomplete('Not enough entered to value ' + skill.name.toLowerCase() + ' yet.', [skill.id]);
    }
    return Money.ok(Math.round(v), { source: 'formula' });
  }

  /** Hours a skill costs over a year: learning once plus daily practice. */
  function effortHours(skill, tables) {
    var ef = skill.effort || {};
    var hours = (ef.learnHours || 0) + (ef.practiceMinutes || 0) * DAYS_PER_YEAR / MINUTES_PER_HOUR;
    return Math.max(rules(tables).minEffortHours, hours);
  }

  /** Cents a year per hour of effort. */
  function returnOnEffort(household, skill, tables, ctx) {
    var v = valuePerYear(household, skill, tables, ctx);
    var hours = effortHours(skill, tables);
    return Money.ok(Money.isOk(v) ? v.value / hours : 0, { valueCents: Money.isOk(v) ? v.value : null, hours: hours, valued: Money.isOk(v) });
  }

  /** The available skills, best return on effort first. */
  function available(household, tables) {
    var ctx = contextFor(household, tables);
    return catalogue(tables)
      .filter(function (s) { return state(household, s) === 'available'; })
      .map(function (s) { return { skill: s, roe: returnOnEffort(household, s, tables, ctx) }; })
      .sort(function (a, b) { return b.roe.value - a.roe.value || a.skill.level - b.skill.level || a.roe.hours - b.roe.hours; })
      .map(function (r) { return Object.assign({ returnOnEffortCents: r.roe.value, valueCents: r.roe.valueCents, effortHours: r.roe.hours }, { skill: r.skill }); });
  }

  /* ---- 4. Verified from the facts ------------------------------------------- */

  /** Does the household already show this once-skill done? */
  function verifies(household, skill) {
    var v = skill.verify;
    if (!v || !Ownership) return false;
    var f = Ownership.field(v.field);
    if (!f) return false;
    if (f.applies && !f.applies(household)) return false;
    var r = f.read(household);
    if (!Money.isOk(r)) return false;
    if (v.equals !== undefined) return r.value === v.equals;
    if (v.gteField) {
      var g = Ownership.field(v.gteField);
      var o = g && g.read(household);
      return !!o && Money.isOk(o) && r.value >= o.value;
    }
    if (v.source) return r.source === v.source;
    return v.present === true;
  }

  /**
   * Mark every once-skill the facts already prove as done, and un-mark
   * the ones that were marked by the facts and no longer hold. Returns
   * the new skills map with what changed; the household is not mutated.
   */
  function verifyOnce(household, tables, today) {
    var day = dayISO(today);
    var next = Schema.createSkills(household.skills);
    var tree = Schema.createSkillTree(household.skillTree || {});
    var verified = [], reverted = [];
    catalogue(tables).forEach(function (s) {
      if (s.kind !== 'once' || !s.verify) return;
      var cur = next[s.id];
      var t = tree.state[s.id];
      var holds = verifies(household, s);
      if (holds && !t) {
        next[s.id] = Schema.createSkillState(Object.assign({}, cur || {}, {
          state: 'available', kind: 'once', verifiedOn: day, verifiedBy: 'household',
          startedOn: (cur && cur.startedOn) || day
        }));
        tree.state[s.id] = { state: 'done', on: day, by: 'proof' };
        verified.push(s.id);
      } else if (!holds && t && t.by === 'proof') {
        if (cur) next[s.id] = Schema.createSkillState(Object.assign({}, cur, { state: 'available', verifiedOn: null, verifiedBy: null }));
        delete tree.state[s.id];
        reverted.push(s.id);
      }
    });
    return { skills: next, skillTree: tree, verified: verified, reverted: reverted };
  }

  /* ---- 5. Moving a skill ------------------------------------------------------ */

  function refuse(reason, ids) { return Money.incomplete(reason, ids || []); }

  /** Take a skill on. Refused, with the reason, when it is locked, already
      on, done, or when three are already on. */
  function equip(household, skillId, tables, today) {
    var skill = byId(tables, skillId);
    if (!skill) return refuse('No such skill.', [skillId]);
    var st = state(household, skill);
    var day = dayISO(today);
    if (st === 'locked') {
      var need = unmetPrereqs(household, skill).map(function (id) { var p = byId(tables, id); return p ? p.name : id; });
      return refuse('First: ' + need.join(', ') + '.', unmetPrereqs(household, skill));
    }
    if (EQUIPPED.indexOf(st) >= 0) return refuse('Already on.', [skillId]);
    if (st === 'done' && skill.kind !== 'periodic') return refuse('Already done.', [skillId]);
    if (st === 'habit') return refuse('Already a habit.', [skillId]);
    var on = equipped(household, tables);
    var max = rules(tables).maxEquipped;
    if (on.length >= max) {
      return refuse(max + ' at a time. Finish or drop one first: ' + on.map(function (s) { return s.name; }).join(', ') + '.',
        on.map(function (s) { return s.id; }));
    }
    var cur = stored(household, skillId) || {};
    var next = Schema.createSkills(household.skills);
    next[skillId] = Schema.createSkillState(Object.assign({}, cur, {
      state: skill.kind === 'periodic' ? 'practicing' : 'trial',
      kind: skill.kind,
      startedOn: day,
      dueOn: skill.kind === 'periodic' ? day : null
    }));
    return Money.ok({ skills: next }, { state: next[skillId].state, equippedCount: on.length + 1 });
  }

  /** Put a skill down. Its log is kept; its standing goes back to available. */
  function drop(household, skillId) {
    var cur = stored(household, skillId);
    if (!cur) return refuse('Not on.', [skillId]);
    var next = Schema.createSkills(household.skills);
    next[skillId] = Schema.createSkillState(Object.assign({}, cur, { state: 'available' }));
    return Money.ok({ skills: next });
  }

  /** A once-skill done by hand, or a periodic done this time. */
  function markDone(household, skillId, tables, today) {
    var skill = byId(tables, skillId);
    if (!skill) return refuse('No such skill.', [skillId]);
    if (skill.kind === 'habit') return refuse('A habit is logged a day at a time, not marked done.', [skillId]);
    var day = dayISO(today);
    var cur = stored(household, skillId) || {};
    var next = Schema.createSkills(household.skills);
    /* Done is the tree's (D-131): a once-skill keeps only its provenance
       here; a periodic one keeps its practice state so it can come due. */
    var patch = { state: skill.kind === 'once' ? 'available' : 'done', kind: skill.kind, startedOn: cur.startedOn || day };
    if (skill.kind === 'once') { patch.verifiedOn = day; patch.verifiedBy = 'self'; }
    if (skill.kind === 'periodic') { patch.lastDone = day; patch.dueOn = addDays(day, skill.everyDays || rules(tables).windowDays); }
    next[skillId] = Schema.createSkillState(Object.assign({}, cur, patch));
    return Money.ok({ skills: next, skillTree: treePatch(household, skillId, day, 'self') }, { dueOn: next[skillId].dueOn });
  }

  function setAutomated(household, skillId, automated) {
    var cur = stored(household, skillId);
    if (!cur) return refuse('Not on.', [skillId]);
    var next = Schema.createSkills(household.skills);
    next[skillId] = Schema.createSkillState(Object.assign({}, cur, { automated: automated === true }));
    return Money.ok({ skills: next });
  }

  /** A periodic skill whose next time has come. */
  function due(household, skill, today) {
    var s = stored(household, skill.id);
    if (!s || skill.kind !== 'periodic' || !s.dueOn) return false;
    return daysBetween(s.dueOn, dayISO(today)) >= 0;
  }

  /* ---- 6. A day logged ---------------------------------------------------------- */

  function uniqSorted(list) {
    var seen = {};
    return list.filter(function (d) { if (seen[d]) return false; seen[d] = true; return true; }).sort();
  }
  function countWithin(days, endISO, window) {
    var start = dayNumber(endISO) - (window - 1), end = dayNumber(endISO);
    return days.filter(function (d) { var n = dayNumber(d); return n >= start && n <= end; }).length;
  }
  /* Misses that came the day after a miss: the "never miss twice" count. */
  function secondMissCount(misses) {
    var set = {};
    misses.forEach(function (d) { set[d] = true; });
    return misses.filter(function (d) { return set[addDays(d, -1)]; }).length;
  }

  /**
   * "Did" or "didn't" for one day. Returns the new skills map and ledger:
   * a did-day writes (or rewrites) that day's ledger row at the skill's
   * value ÷ 365; a didn't-day removes it. The habit's standing moves with
   * the count of the last thirty days.
   */
  function logDay(household, skillId, did, tables, today) {
    var skill = byId(tables, skillId);
    if (!skill) return refuse('No such skill.', [skillId]);
    var cur = stored(household, skillId);
    if (!cur || EQUIPPED.concat(['habit']).indexOf(cur.state) < 0) return refuse('Not on.', [skillId]);
    if (skill.kind !== 'habit' && !(skill.kind === 'once' && did)) return refuse('Only a habit is logged a day at a time.', [skillId]);
    var r = rules(tables);
    var day = dayISO(today);
    var value = valuePerYear(household, skill, tables);
    var perDay = Money.isOk(value) ? Math.round(value.value / DAYS_PER_YEAR) : null;

    var log = cur.log.filter(function (d) { return d !== day; });
    var misses = cur.misses.filter(function (d) { return d !== day; });
    if (did) log.push(day); else misses.push(day);
    log = uniqSorted(log); misses = uniqSorted(misses);
    /* The window ends on the latest day known, so back-filling an earlier
       day never shrinks the count. */
    var ref = log.length && log[log.length - 1] > day ? log[log.length - 1] : day;
    var last30 = countWithin(log, ref, r.windowDays);

    var nextState = cur.state;
    if (skill.kind === 'habit') {
      if (last30 >= r.habitDays) nextState = 'habit';
      else if (last30 >= r.trialDays) nextState = cur.state === 'habit' ? 'habit' : 'practicing';
      else nextState = cur.state === 'trial' ? 'trial' : cur.state;
    }
    var next = Schema.createSkills(household.skills);
    next[skillId] = Schema.createSkillState(Object.assign({}, cur, {
      state: nextState, kind: skill.kind, log: log, misses: misses, last30: last30,
      secondMisses: secondMissCount(misses),
      valuePerDayCents: perDay, valueSource: Money.isOk(value) ? value.source : null
    }));

    var ledger = (household.practiceLedger || []).filter(function (e) { return !(e.on === day && e.skill === skillId); });
    if (did) ledger.push(Schema.createPracticeEntry({ on: day, skill: skillId, cents: perDay === null ? 0 : perDay }));
    ledger.sort(function (a, b) { return a.on < b.on ? -1 : a.on > b.on ? 1 : (a.skill < b.skill ? -1 : 1); });
    return Money.ok({ skills: next, practiceLedger: ledger }, {
      state: nextState, from: cur.state, last30: last30, centsToday: did ? perDay : 0, valued: Money.isOk(value)
    });
  }

  function loggedOn(household, skillId, today) {
    var s = stored(household, skillId);
    var day = dayISO(today);
    if (!s) return null;
    if (s.log.indexOf(day) >= 0) return true;
    if (s.misses.indexOf(day) >= 0) return false;
    return null;
  }

  /* ---- 7. Decay --------------------------------------------------------------- */

  /**
   * Time does the un-doing. A habit unlogged for its decayDays falls from
   * habit to practicing; unlogged for lapseDays it goes back to available,
   * log kept, lapses + 1. Returns the new map and what moved.
   */
  function decay(household, tables, today) {
    var r = rules(tables);
    var day = dayISO(today);
    var next = Schema.createSkills(household.skills);
    var changes = [];
    catalogue(tables).forEach(function (s) {
      if (s.kind !== 'habit') return;
      var cur = next[s.id];
      if (!cur || ['trial', 'practicing', 'habit'].indexOf(cur.state) < 0) return;
      var last = cur.log.length ? cur.log[cur.log.length - 1] : cur.startedOn;
      if (!last) return;
      var gap = daysBetween(last, day);
      var to = null;
      if (gap >= r.lapseDays) to = 'available';
      else if (gap >= (s.decayDays || r.decayDays) && cur.state === 'habit') to = 'practicing';
      if (!to || to === cur.state) return;
      next[s.id] = Schema.createSkillState(Object.assign({}, cur, {
        state: to, lapses: cur.lapses + 1, last30: countWithin(cur.log, day, r.windowDays)
      }));
      changes.push({ id: s.id, from: cur.state, to: to, daysSince: gap });
    });
    return { skills: next, changes: changes };
  }

  /* ---- 8. Stacks ---------------------------------------------------------------- */

  /** Every active skill with its stand-alone annual value. */
  function activeValues(household, tables) {
    var ctx = contextFor(household, tables);
    return catalogue(tables).filter(function (s) { return isActive(household, s); }).map(function (s) {
      var v = valuePerYear(household, s, tables, ctx);
      var st = stored(household, s.id) || {};
      return { id: s.id, name: s.name, kind: s.kind, lever: s.lever, state: state(household, s),
               valueCents: Money.isOk(v) ? v.value : null, risk: Money.isOk(v) && v.risk === true,
               automated: st.automated === true };
    });
  }

  /** The multiplier a skill's active synergies earn it. */
  function synergyMultiplier(household, skill, tables) {
    var m = 1, applied = [];
    (skill.synergy || []).forEach(function (sy) {
      var other = byId(tables, sy.with);
      if (other && isActive(household, other)) { m *= sy.multiplier; applied.push(sy); }
    });
    return { multiplier: m, applied: applied };
  }

  /**
   * A stack's value a year, as a waterfall: each skill's base value while
   * active, its synergy multiplier when the partner is active too, the
   * sum, then the cap — the stack's own cents, or twelve months of the
   * line it acts on when that line is known and smaller. So The Kitchen
   * can never claim more than the food it buys.
   */
  function stackValue(household, stackId, tables) {
    var stacks = (tables && tables.stacks && tables.stacks.stacks) || [];
    var stack = null;
    for (var i = 0; i < stacks.length; i++) if (stacks[i].id === stackId) stack = stacks[i];
    if (!stack) return refuse('No such stack.', [stackId]);
    var ctx = contextFor(household, tables);
    var raw = 0, activeCount = 0;
    var rows = stack.skills.map(function (id) {
      var s = byId(tables, id);
      if (!s) return { id: id, name: id, missing: true, active: false, baseCents: 0, multiplier: 1, valueCents: 0 };
      var act = isActive(household, s);
      var v = act ? valuePerYear(household, s, tables, ctx) : null;
      var base = v && Money.isOk(v) ? v.value : 0;
      var sy = act ? synergyMultiplier(household, s, tables) : { multiplier: 1, applied: [] };
      var val = Math.round(base * sy.multiplier);
      raw += val; if (act) activeCount++;
      return { id: s.id, name: s.name, kind: s.kind, state: state(household, s), active: act,
               baseCents: base, valued: !!v && Money.isOk(v), multiplier: sy.multiplier, synergies: sy.applied, valueCents: val };
    });
    var cap = stack.capCents;
    var capFrom = 'stack';
    if (stack.capField && ctx && Money.isEntered(ctx[stack.capField])) {
      var lineCap = ctx[stack.capField] * 12;
      if (lineCap < cap) { cap = lineCap; capFrom = stack.capField; }
    }
    var value = Math.min(raw, cap);
    return Money.ok(value, {
      stack: stack, rows: rows, rawCents: raw, capCents: cap, capFrom: capFrom, capped: raw > cap,
      activeCount: activeCount, total: stack.skills.length, complete: activeCount === stack.skills.length
    });
  }

  function stackValues(household, tables) {
    return ((tables && tables.stacks && tables.stacks.stacks) || []).map(function (st) { return stackValue(household, st.id, tables); });
  }

  /* ---- 9. The automation ratio (ratios §4.3) ---------------------------------- */

  /** Annual value of active skills that run without you ÷ all active
      value. Nothing to say until an active skill is worth something. */
  function automationRatio(household, tables) {
    if (!tables || !tables.skills) return Money.incomplete('The skills catalogue is not loaded.', ['skills']);
    var rows = activeValues(household, tables).filter(function (r) { return Money.isEntered(r.valueCents) && r.valueCents > 0; });
    if (!rows.length) return Money.incomplete('Nothing active in the Skill Stacker is worth dollars yet.', ['skills']);
    var all = 0, auto = 0;
    rows.forEach(function (r) { all += r.valueCents; if (r.automated) auto += r.valueCents; });
    return Money.ok(auto / all, { automatedCents: auto, totalCents: all, count: rows.length });
  }

  /* ---- 10. The ledger ------------------------------------------------------------ */

  function ledgerTotalCents(household) {
    return (household.practiceLedger || []).reduce(function (t, e) { return t + (Money.isEntered(e.cents) ? e.cents : 0); }, 0);
  }

  function ledgerOn(household, day) {
    var d = dayISO(day);
    return (household.practiceLedger || []).filter(function (e) { return e.on === d; })
      .reduce(function (t, e) { return t + e.cents; }, 0);
  }

  /** The ledger total grown to 65 on the wealth multiplier at your age. */
  function ledgerFutureValue(household, tables, opts) {
    if (!Benchmarks) return Money.incomplete('The benchmarks engine is not loaded.', ['benchmarks']);
    var total = ledgerTotalCents(household);
    var m = Benchmarks.wealthMultiplier(household, tables, opts);
    if (!Money.isOk(m)) return m;
    return Money.ok(Math.round(total * m.value), { ledgerCents: total, multiplier: m.value, age: m.age, endAge: m.endAge });
  }

  /* ---- 11. The next skill ---------------------------------------------------------- */

  function currentFooStep(household, tables) {
    if (!Foo || !tables || !tables.fooRules) return null;
    var f = Foo.evaluate(household, tables);
    return f && f.placement && Money.isEntered(f.placement.step) ? f.placement.step : null;
  }

  /**
   * One suggestion: available, prerequisites met, at your FOO step or at
   * none in particular, best return on effort — with a nudge toward the
   * skill that trains your lowest sub-stat, when the sheet says which.
   */
  function nextSkill(household, tables, opts) {
    var o = opts || {};
    var step = Money.isEntered(o.fooStep) ? o.fooStep : currentFooStep(household, tables);
    var low = o.lowestSubStat || null;
    var nudge = rules(tables).nudgeMultiplier;
    var ctx = contextFor(household, tables);
    var ranked = catalogue(tables)
      .filter(function (s) { return state(household, s) === 'available' && !s.trial; })
      .filter(function (s) { return !s.fooStep || step === null || s.fooStep === step; })
      .map(function (s) {
        var roe = returnOnEffort(household, s, tables, ctx);
        var trains = !!(low && s.subStats && s.subStats[low]);
        var atStep = !!(step !== null && s.fooStep === step);
        return { skill: s, score: roe.value * (trains ? nudge : 1), trains: trains, atStep: atStep, roe: roe };
      })
      .sort(function (a, b) {
        return b.score - a.score || (b.atStep - a.atStep) || (b.trains - a.trains) || a.skill.level - b.skill.level || a.roe.hours - b.roe.hours;
      });
    if (!ranked.length) return Money.incomplete('Nothing left to suggest.', []);
    var top = ranked[0];
    var why = [];
    if (top.roe.valued && top.roe.valueCents > 0) why.push('about ' + Money.formatCents(top.roe.valueCents) + ' a year for ' + (Math.round(top.roe.hours * 10) / 10) + ' hours');
    if (top.atStep) why.push('it is your step on the ladder');
    if (top.trains) why.push('it trains ' + low);
    if (!why.length) why.push(top.skill.effect && top.skill.effect.type === 'risk' ? 'worth nothing a year and something in a bad one' : 'the best return on effort left');
    return Money.ok(top.skill, { why: why.join('; '), fooStep: step, lowestSubStat: low, ranked: ranked.length });
  }

  /* ---- 12. Curves ------------------------------------------------------------------- */

  /** The poster: 1.01^days, clipped at the cap so the fiction is drawn as one. */
  function posterValue(tables, days) {
    var p = tables.curves.poster;
    return Math.min(p.cap, Math.pow(p.base, days));
  }
  /** Capability: a logistic on practice days. */
  function capability(tables, days) {
    var l = tables.curves.logistic;
    return l.max / (1 + Math.exp(-l.k * (days - l.midpointDays)));
  }

  /* ---- 13. Today ---------------------------------------------------------------------- */

  /** What the Today screen shows: the lines on, today's cents, the ledger, 65. */
  function today(household, tables, opts) {
    var o = opts || {};
    var day = dayISO(o.today);
    var ctx = contextFor(household, tables);
    var lines = catalogue(tables)
      .filter(function (s) { var st = state(household, s); return EQUIPPED.indexOf(st) >= 0 || (s.kind === 'habit' && st === 'habit'); })
      .map(function (s) {
        var v = valuePerYear(household, s, tables, ctx);
        var st = stored(household, s.id) || {};
        return { skill: s, state: state(household, s), loggedToday: loggedOn(household, s.id, day),
                 valueCents: Money.isOk(v) ? v.value : null, perDayCents: Money.isOk(v) ? Math.round(v.value / DAYS_PER_YEAR) : null,
                 risk: Money.isOk(v) && v.risk === true, last30: st.last30 || 0, secondMisses: st.secondMisses || 0,
                 due: due(household, s, day), dueOn: st.dueOn || null, automated: st.automated === true };
      });
    return {
      day: day,
      lines: lines,
      equippedCount: equipped(household, tables).length,
      maxEquipped: rules(tables).maxEquipped,
      todayCents: ledgerOn(household, day),
      ledgerCents: ledgerTotalCents(household),
      atEnd: ledgerFutureValue(household, tables, o),
      next: nextSkill(household, tables, o)
    };
  }

  return {
    OWNER: OWNER,
    DAYS_PER_YEAR: DAYS_PER_YEAR,
    ACTIVE_BY_KIND: ACTIVE_BY_KIND,
    EQUIPPED: EQUIPPED,
    dayISO: dayISO,
    addDays: addDays,
    daysBetween: daysBetween,
    rules: rules,
    catalogue: catalogue,
    byId: byId,
    treeDone: treeDone,
    state: state,
    isActive: isActive,
    unmetPrereqs: unmetPrereqs,
    equipped: equipped,
    valuePerYear: valuePerYear,
    effortHours: effortHours,
    returnOnEffort: returnOnEffort,
    available: available,
    verifies: verifies,
    verifyOnce: verifyOnce,
    equip: equip,
    drop: drop,
    markDone: markDone,
    setAutomated: setAutomated,
    due: due,
    logDay: logDay,
    loggedOn: loggedOn,
    decay: decay,
    activeValues: activeValues,
    synergyMultiplier: synergyMultiplier,
    stackValue: stackValue,
    stackValues: stackValues,
    automationRatio: automationRatio,
    ledgerTotalCents: ledgerTotalCents,
    ledgerOn: ledgerOn,
    ledgerFutureValue: ledgerFutureValue,
    nextSkill: nextSkill,
    posterValue: posterValue,
    capability: capability,
    today: today
  };
});
