/* ==========================================================================
   engines/encounter.js — running one monster at one character. BRIEF §9.3.
   --------------------------------------------------------------------------
   The point of the whole thing: a monster's danger is not a property of the
   monster. It is a property of the monster meeting THIS sheet. The same
   Timeshare Charm-Caster is a shrug to a high-WIS character with an emergency
   fund and a genuine threat to someone with neither, and this file is where
   that difference gets computed.

   THREE STATES, NOT TWO. A blocker is `held`, `absent`, or `unknown`. The
   brief's shape implies a boolean, but "you have no disability insurance" and
   "nobody has asked you about disability insurance" are different claims, and
   only the first should make a monster look more dangerous. Unknown blockers
   apply nothing and are reported separately, so the page can say what it would
   need to know rather than quietly assuming the worst. Same rule as everywhere
   else here: empty is not zero.

   WHAT LIVES WHERE. Every threshold — the CR-to-DC ladder, the tier bands, the
   advantage bonus, the 5%/95% clamp — is in data/dnd_rules.json under
   `encounterRules`. This file holds only the arithmetic and the predicates
   that decide whether a blocker is actually held, which is logic, not data.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = {
      Money: require('../shared/money.js'),
      Schema: require('../shared/schema.js'),
      Tier0: require('./tier0.js'),
      Character: require('./character.js')
    };
  } else {
    deps = {
      Money: root.SLAF && root.SLAF.Money,
      Schema: root.SLAF && root.SLAF.Schema,
      Tier0: root.SLAF && root.SLAF.Tier0,
      Character: root.SLAF && root.SLAF.Character
    };
  }
  var api = factory(deps.Money, deps.Schema, deps.Tier0, deps.Character);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.DND = root.DND || {}; root.DND.Encounter = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Tier0, Character) {
  'use strict';

  /* ---- dice ------------------------------------------------------------- */

  function parseDice(expr) {
    var m = /^(\d+)d(\d+)$/.exec(String(expr || '').trim());
    if (!m) return null;
    return { count: Number(m[1]), sides: Number(m[2]) };
  }
  function expectedDice(d) { return d ? d.count * (d.sides + 1) / 2 : 0; }
  function rollDice(d, rng) {
    if (!d) return 0;
    var total = 0;
    for (var i = 0; i < d.count; i++) total += 1 + Math.floor((rng || Math.random)() * d.sides);
    return total;
  }

  /* ---- ladders, all read from data -------------------------------------- */

  function crToNumber(cr) {
    var s = String(cr).trim();
    if (s === '—' || s === '') return null;
    if (s.indexOf('/') !== -1) {
      var parts = s.split('/');
      return Number(parts[0]) / Number(parts[1]);
    }
    /* "18–20" style ranges take their lower bound. */
    var range = /^(\d+)\D+(\d+)$/.exec(s);
    if (range) return Number(range[1]);
    var n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  function dcFor(cr, tables) {
    var n = crToNumber(cr);
    if (n === null) return null;
    var ladder = tables.dndRules.encounterRules.crToDc;
    for (var i = 0; i < ladder.length; i++) {
      if (ladder[i].maxCr === null || n <= ladder[i].maxCr) return ladder[i].dc;
    }
    return ladder[ladder.length - 1].dc;
  }

  function tierForLevel(level, tables) {
    var tiers = tables.dndRules.encounterRules.tiers;
    for (var i = 0; i < tiers.length; i++) {
      if (level >= tiers[i].minLevel && level <= tiers[i].maxLevel) return tiers[i];
    }
    return tiers[0];
  }

  /**
   * Where you are in the arc — BRIEF §9.4.
   *
   * Returns the tier you are in, the one after it, how far through this one you
   * are, and the creatures that come into range when you cross. It takes a
   * Result for the level rather than a number, because a character with no Level
   * is not "tier I" — they are unplaced, and saying otherwise is the same
   * over-claim as calling an unscored save a weakness.
   */
  function tierProgress(levelResult, tables) {
    if (!Money.isOk(levelResult)) {
      return { placed: false, reason: 'Add your numbers and this places you in the arc.' };
    }
    var level = levelResult.value;
    var tiers = tables.dndRules.encounterRules.tiers;
    var here = tierForLevel(level, tables);
    var idx = tiers.indexOf(here);
    var next = idx >= 0 && idx + 1 < tiers.length ? tiers[idx + 1] : null;
    var span = here.maxLevel - here.minLevel + 1;
    var through = level - here.minLevel + 1;

    var arriving = next
      ? allCreatures(tables).filter(function (c) { return c.tier === next.id; })
      : [];
    return {
      placed: true, level: level, tier: here, next: next,
      levelsIntoTier: through, tierSpan: span,
      levelsToNext: next ? next.minLevel - level : null,
      percentThroughTier: Math.round((through / span) * 100),
      arrivingNext: arriving,
      last: !next
    };
  }

  /* ---- blockers ----------------------------------------------------------
     The catalogue in data says what each blocker IS. These predicates say
     whether this character actually holds it, and return null for "we have
     not asked", which is not the same as false.                          */

  function blockerState(id, ctx) {
    var cat = ctx.tables.dndRules.blockers[id];
    if (!cat) return null;
    if (cat.subStat) {
      var r = ctx.sheet.subScores[cat.subStat];
      if (!r || !Money.isOk(r)) return null;
      return r.value >= cat.min;
    }
    var p = ctx.profile;
    switch (id) {
      case 'emergencyFund':
      case 'deepReserve': {
        var months = Tier0.emergencyFundMonths(ctx.household);
        if (!Money.isOk(months)) return null;
        return months.value >= (id === 'deepReserve' ? 6 : 3);
      }
      case 'healthInsurance':
        return Money.isEntered(p.healthCoverage) ? p.healthCoverage >= 1 : null;
      case 'disabilityInsurance':
        return typeof p.disabilityInsurance === 'boolean' ? p.disabilityInsurance : null;
      case 'umbrella':
        return typeof p.umbrellaPolicy === 'boolean' ? p.umbrellaPolicy : null;
      case 'automatedSaving':
        return p.automatedSaving ? (p.automatedSaving === 'most' || p.automatedSaving === 'all') : null;
      case 'lowDebtBurden':
        return Money.isOk(ctx.sheet.debtBurden) ? ctx.sheet.debtBurden.value <= 1 : null;
      case 'diversified':
        return Money.isOk(ctx.sheet.suggestedClass)
          ? ctx.sheet.suggestedClass.ranked.filter(function (r) { return r.cents > 0; }).length >= 2
          : null;
      default:
        return null;
    }
  }

  function resolveBlockers(monster, ctx) {
    return (monster.blockedBy || []).map(function (b) {
      var cat = ctx.tables.dndRules.blockers[b.id] || {};
      var held = blockerState(b.id, ctx);
      return {
        id: b.id, effect: b.effect,
        label: cat.label || b.id, kind: cat.kind || 'rule', detail: cat.detail || '',
        state: held === null ? 'unknown' : (held ? 'held' : 'absent')
      };
    });
  }

  /* ---- the save ---------------------------------------------------------- */

  /**
   * Which save this attack targets. A pair ("CON+DEX") uses whichever of the
   * two is WORSE — the monster attacks where you are thinnest. "ALL" means
   * every save at once, so the worst of the six.
   */
  function targetSave(monster, saves) {
    var spec = String(monster.saveAbility || '').toUpperCase();
    var pool;
    if (spec === 'ALL') pool = saves;
    else if (spec.indexOf('+') !== -1) {
      var want = spec.split('+');
      pool = saves.filter(function (s) { return want.indexOf(s.stat) !== -1; });
    } else {
      pool = saves.filter(function (s) { return s.stat === spec; });
    }
    if (!pool.length) return null;
    var scored = pool.filter(function (s) { return s.ok; });
    if (!scored.length) return { stat: pool[0].stat, ok: false, pool: pool.map(function (s) { return s.stat; }) };
    scored.sort(function (a, b) { return a.modifier - b.modifier; });
    return { stat: scored[0].stat, ok: true, modifier: scored[0].modifier,
             pool: pool.map(function (s) { return s.stat; }) };
  }

  /* ---- the encounter ----------------------------------------------------- */

  /**
   * run(sheet, monster, opts) — everything about this monster meeting this
   * character. `opts.mode` is 'expected' (default) or 'roll'.
   */
  function run(sheet, monster, opts) {
    var o = opts || {};
    var tables = o.tables;
    var household = o.household || {};
    var ctx = { sheet: sheet, tables: tables, household: household,
                profile: household.dndProfile || {} };
    var rules = tables.dndRules.encounterRules;

    var saves = Character.savingThrows(sheet.stats, sheet.klass, sheet.proficiencyBonus, tables);
    var target = targetSave(monster, saves);
    var dc = dcFor(monster.cr, tables);
    var blockers = resolveBlockers(monster, ctx);
    var held = blockers.filter(function (b) { return b.state === 'held'; });
    var unknown = blockers.filter(function (b) { return b.state === 'unknown'; });

    var negated = held.some(function (b) { return b.effect === 'negate'; });
    var halved = held.some(function (b) { return b.effect === 'halve'; });
    var advantage = held.some(function (b) { return b.effect === 'advantage'; });

    var modifier = target && target.ok ? target.modifier : null;
    var effectiveMod = modifier;
    if (effectiveMod !== null && advantage) effectiveMod += rules.effects.advantageBonus;

    /* Chance the save FAILS, i.e. the attack lands. A natural 1 always fails
       and a natural 20 always succeeds, so it never reaches 0 or 1. */
    var hitChance = null;
    if (negated) hitChance = 0;
    else if (effectiveMod !== null && dc !== null) {
      var raw = (dc - effectiveMod - 1) / rules.d20.sides;
      hitChance = Math.max(rules.d20.autoFailChance,
                  Math.min(1 - rules.d20.autoSucceedChance, raw));
      hitChance = Math.round(hitChance * 1000) / 1000;
    }

    var spec = monster.damageSpec || {};
    var dice = parseDice(spec.dice);
    var base = o.mode === 'roll' ? rollDice(dice, o.rng) : expectedDice(dice);
    base += Money.isEntered(spec.flat) ? spec.flat : 0;
    var damageWeeks = negated ? 0 : (halved ? base / 2 : base);
    damageWeeks = Math.round(damageWeeks * 10) / 10;

    var cur = Money.isOk(sheet.currentHp) ? sheet.currentHp.value : null;
    var hpAfter = cur === null ? null : Math.max(0, Math.round((cur - damageWeeks) * 10) / 10);

    /* Massive Damage (§3A): a single hit at or above Max HP skips death saves
       and goes straight to insolvency. */
    var maxHp = sheet.maxHp ? sheet.maxHp.weeks : null;
    var massive = !!(maxHp && damageWeeks >= maxHp);

    return {
      monster: monster.name,
      attackType: monster.attackType || null,
      tier: monster.tier || null,
      targetSave: target ? target.stat : null,
      savePool: target ? target.pool : [],
      modifier: modifier,
      effectiveModifier: effectiveMod,
      dc: dc,
      hitChance: hitChance,
      damageWeeks: damageWeeks,
      damageNote: spec.note || null,
      perPeriod: spec.per || null,
      hpBefore: cur,
      hpAfter: hpAfter,
      deathSaves: hpAfter === 0 && cur !== null && damageWeeks > 0,
      massiveDamage: massive,
      negated: negated, halved: halved, advantage: advantage,
      blockedBy: blockers, held: held, unknown: unknown,
      lair: monster.lair || [],
      mode: o.mode === 'roll' ? 'roll' : 'expected'
    };
  }

  /* ---- the weakness map -------------------------------------------------- */

  function allCreatures(tables) {
    return tables.dndRules.monsters.map(function (m) {
      return Object.assign({}, m, { kind: 'monster' });
    }).concat(tables.dndRules.hazards.map(function (h) {
      return Object.assign({}, h, { kind: 'hazard' });
    }));
  }

  /**
   * The two saves you are thinnest on, and the creatures that hunt there at
   * your current tier. Unscored saves are excluded rather than treated as
   * terrible — a blank is not a weakness, it is a blank.
   */
  function predators(sheet, tables, opts) {
    var o = opts || {};
    var saves = Character.savingThrows(sheet.stats, sheet.klass, sheet.proficiencyBonus, tables)
      .filter(function (s) { return s.ok; });
    if (saves.length < 2) {
      return { ready: false, reason: 'Score more of your saves to see what hunts you.', weakest: [], creatures: [] };
    }
    /* The two thinnest — PLUS anything tied with the second. Taking a flat
       slice of two marks one of three equal saves as safe and its identical
       twin as thin, which is a claim the numbers do not support. A tie is a
       tie, and the caller is told about all of it. */
    var sorted = saves.slice().sort(function (a, b) { return a.modifier - b.modifier; });
    var cut = sorted[1].modifier;
    var weakest = sorted.filter(function (s) { return s.modifier <= cut; })
                        .map(function (s) { return s.stat; });
    var tier = tierForLevel(Money.isOk(sheet.level) ? sheet.level.value : 1, tables);

    var creatures = allCreatures(tables).filter(function (c) {
      var spec = String(c.saveAbility || '').toUpperCase();
      var hits = spec === 'ALL' || weakest.some(function (w) { return spec.indexOf(w) !== -1; });
      return hits && (!o.tierOnly || c.tier === tier.id);
    });
    return { ready: true, weakest: weakest, tier: tier, creatures: creatures };
  }

  return {
    parseDice: parseDice,
    expectedDice: expectedDice,
    rollDice: rollDice,
    crToNumber: crToNumber,
    dcFor: dcFor,
    tierForLevel: tierForLevel,
    tierProgress: tierProgress,
    blockerState: blockerState,
    resolveBlockers: resolveBlockers,
    targetSave: targetSave,
    allCreatures: allCreatures,
    predators: predators,
    run: run
  };
});
