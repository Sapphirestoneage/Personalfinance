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

  /** A creature's to-hit bonus from CR — the attack-roll twin of dcFor(). */
  function attackBonusFor(cr, tables) {
    var n = crToNumber(cr);
    if (n === null) return null;
    var ladder = tables.dndRules.encounterRules.crToAttackBonus;
    for (var i = 0; i < ladder.length; i++) {
      if (ladder[i].maxCr === null || n <= ladder[i].maxCr) return ladder[i].bonus;
    }
    return ladder[ladder.length - 1].bonus;
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
      /* No subScores at all is the same claim as an unscored one: we have not
         been told. It must never throw — a caller holding a partial sheet is
         exactly who this three-state answer exists for. */
      var scores = ctx.sheet && ctx.sheet.subScores;
      var r = scores ? scores[cat.subStat] : null;
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

    /* Two ways to get hurt, as in 5e (DD-019). An ATTACK is a bill, a lawsuit,
       a lost stream: d20 + a CR bonus against your Armour Class, so insurance
       does its real job. A SAVE goes around armour and targets judgment. */
    var isAttack = monster.resolution === 'attack';

    /* Debt Burden's disadvantage — the rulebook's own rule, applied at last.
       5e's cancel rule holds: advantage and disadvantage together are neither. */
    var burdenRow = Money.isOk(sheet.debtBurden) ? sheet.debtBurden.row : null;
    var burdenDis = burdenRow && Array.isArray(burdenRow.saveDisadvantage)
      ? burdenRow.saveDisadvantage : [];

    /* Exhaustion (§9.7) subtracts from every save. This is the whole reason it
       is derived rather than decorative: being close to the edge really does
       make you easier to move — you cannot wait for a better offer, shop the
       policy or walk away — and every creature here is built for exactly that.
       An unmeasurable runway means no penalty, not a guessed one. */
    var exh = Character.exhaustion(sheet.currentHp, tables);
    var exhPenalty = Money.isOk(exh) ? exh.savePenalty : 0;

    var modifier = target && target.ok ? target.modifier : null;
    var disadvantage = !isAttack && !!target && burdenDis.indexOf(target.stat) !== -1;
    var netRoll = (advantage ? 1 : 0) - (disadvantage ? 1 : 0);   /* 5e: they cancel */
    var effectiveMod = modifier;
    if (effectiveMod !== null && !isAttack) {
      effectiveMod += netRoll * rules.effects.advantageBonus;
      effectiveMod -= exhPenalty;
    }

    /* Attack rolls: the creature's d20 + bonus must reach your AC. A blocker
       that would grant YOU advantage on a save instead hampers the attacker
       — same value, applied to its roll. Exhaustion is a judgment penalty and
       does not lower your insurance, so it does not apply here. */
    var attackBonus = isAttack ? attackBonusFor(monster.cr, tables) : null;
    var ac = Money.isOk(sheet.armorClass) ? sheet.armorClass.value : null;
    var effectiveAttack = attackBonus;
    if (isAttack && effectiveAttack !== null && advantage) effectiveAttack -= rules.effects.advantageBonus;

    /* Chance it lands. On a save: the save fails. On an attack: the roll
       reaches AC. A natural 1 always misses/fails and a 20 always hits/saves,
       so it never reaches 0 or 1 — a 5% floor either way. */
    var hitChance = null;
    if (negated) hitChance = 0;
    else if (isAttack) {
      if (effectiveAttack !== null && ac !== null) {
        var rawA = (21 + effectiveAttack - ac) / rules.d20.sides;
        hitChance = Math.max(rules.d20.autoFailChance, Math.min(1 - rules.d20.autoSucceedChance, rawA));
        hitChance = Math.round(hitChance * 1000) / 1000;
      }
    } else if (effectiveMod !== null && dc !== null) {
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
      resolution: isAttack ? 'attack' : 'save',
      attackBonus: attackBonus, effectiveAttack: effectiveAttack, armorClass: ac,
      disadvantage: disadvantage,
      disadvantageFrom: disadvantage ? 'Debt Burden level ' + sheet.debtBurden.value : null,
      exhaustion: Money.isOk(exh) ? exh.value : null,
      exhaustionLabel: Money.isOk(exh) ? exh.row.label : null,
      exhaustionPenalty: exhPenalty,
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

  /* ---- the type chart — T10 ---------------------------------------------
     Six attack types, and what each of them actually is: not a label, but the
     set of saves the creatures using it target and the defences that stop
     them. All of it is DERIVED from the bestiary rather than written down
     twice. Add a creature and the chart moves; write the chart by hand and it
     is wrong the first time somebody does.                                 */

  /**
   * For every attack type: which saves it comes at, what blocks it, and how
   * often — counted over the creatures that actually use it.
   */
  function typeChart(tables) {
    var creatures = allCreatures(tables);
    return tables.dndRules.encounterRules.attackTypes.map(function (t) {
      var users = creatures.filter(function (c) { return c.attackType === t.id; });

      /* Which saves this type comes at. "ALL" is kept separate: a creature
         that targets everything says nothing about which save is special. */
      var saveCount = {}, hitsAll = 0;
      users.forEach(function (c) {
        var spec = String(c.saveAbility || '').toUpperCase();
        if (spec === 'ALL') { hitsAll++; return; }
        spec.split('+').forEach(function (id) {
          if (id) saveCount[id] = (saveCount[id] || 0) + 1;
        });
      });
      var saves = Object.keys(saveCount).sort(function (a, b) {
        return saveCount[b] - saveCount[a] || (a < b ? -1 : 1);
      });

      /* What stops it, and how hard. A blocker that negates on one creature
         and gives advantage on another is reported under its strongest
         effect, because that is the one worth telling someone about. */
      var RANK = { negate: 3, halve: 2, advantage: 1 };
      var blockCount = {};
      users.forEach(function (c) {
        (c.blockedBy || []).forEach(function (b) {
          var seen = blockCount[b.id];
          if (!seen) seen = blockCount[b.id] = { id: b.id, count: 0, effect: b.effect };
          seen.count++;
          if (RANK[b.effect] > RANK[seen.effect]) seen.effect = b.effect;
        });
      });
      var blockers = Object.keys(blockCount).map(function (id) {
        var b = blockCount[id];
        var cat = tables.dndRules.blockers[id] || {};
        return { id: id, count: b.count, effect: b.effect,
                 label: cat.label || id, kind: cat.kind || 'rule', detail: cat.detail || '',
                 covers: b.count / users.length };
      }).sort(function (a, b) {
        return RANK[b.effect] - RANK[a.effect] || b.count - a.count;
      });

      var crs = users.map(function (c) { return crToNumber(c.cr); })
        .filter(function (n) { return n !== null; }).sort(function (a, b) { return a - b; });

      return {
        id: t.id, label: t.label, blurb: t.blurb,
        creatures: users, count: users.length,
        attacks: users.filter(function (c) { return c.resolution === 'attack'; }).length,
        saves: saves, hitsAll: hitsAll,
        blockers: blockers,
        crRange: crs.length ? { min: crs[0], max: crs[crs.length - 1] } : null
      };
    });
  }

  /**
   * How THIS character stands against each type.
   *
   * The defence against a type is the worst of the saves it comes at, because
   * that is the one a creature will pick — the same rule targetSave() uses,
   * called rather than restated. A type whose saves are all unscored comes
   * back `known: false`: not resistant, not exposed, unmeasured.
   */
  function typeDefence(sheet, tables) {
    var saves = Character.savingThrows(sheet.stats, sheet.klass, sheet.proficiencyBonus, tables);
    var exh = Character.exhaustion(sheet.currentHp, tables);
    var penalty = Money.isOk(exh) ? exh.savePenalty : 0;

    return typeChart(tables).map(function (t) {
      /* The defence is measured against the saves this type CHARACTERISTICALLY
         comes at, not against every save it could ever touch. One creature in
         the type that targets everything would otherwise collapse the whole
         row to your single worst save — and then Guilt, which is CHA in every
         other respect, reports itself as a Dexterity problem. The ALL-targeting
         creatures are reported separately instead, so the page can say both
         things without either drowning the other. */
      var named = saves.filter(function (s) { return t.saves.indexOf(s.stat) !== -1; });
      var pool = named.length ? named : saves;   /* a type of nothing but ALL */
      var scored = pool.filter(function (s) { return s.ok; });

      /* What a creature that hits everything would find, kept apart. */
      var allScored = saves.filter(function (s) { return s.ok; })
        .sort(function (a, b) { return a.modifier - b.modifier; });
      var worstOverall = t.hitsAll > 0 && allScored.length ? allScored[0] : null;

      if (!pool.length || !scored.length) {
        return { type: t, known: false, pool: pool.map(function (s) { return s.stat; }),
                 hitsAll: t.hitsAll,
                 worstOverall: worstOverall
                   ? { stat: worstOverall.stat, effective: worstOverall.modifier - penalty }
                   : null };
      }
      scored.sort(function (a, b) { return a.modifier - b.modifier; });
      var worst = scored[0];
      return {
        type: t, known: true,
        stat: worst.stat,
        modifier: worst.modifier,
        effective: worst.modifier - penalty,
        exhaustionPenalty: penalty,
        unscored: pool.filter(function (s) { return !s.ok; }).map(function (s) { return s.stat; }),
        pool: pool.map(function (s) { return s.stat; }),
        hitsAll: t.hitsAll,
        worstOverall: worstOverall
          ? { stat: worstOverall.stat, effective: worstOverall.modifier - penalty }
          : null
      };
    });
  }

  /**
   * What has actually come at you, from the encounter log.
   *
   * Rows written before T10 carry no attackType, so the creature is looked up
   * by name and the type filled in. A row naming a creature that no longer
   * exists is counted as unknown rather than dropped — it happened, and
   * silently losing history is worse than an untidy total.
   */
  function typeHistory(encounters, tables) {
    var byName = {};
    allCreatures(tables).forEach(function (c) { byName[c.name] = c; });

    var counts = {}, unknown = 0, total = 0;
    (encounters || []).forEach(function (row) {
      total++;
      var type = row.attackType;
      if (!type && row.monsterId && byName[row.monsterId]) type = byName[row.monsterId].attackType;
      if (!type) { unknown++; return; }
      var c = counts[type] || (counts[type] = { type: type, seen: 0, landed: 0, blocked: 0, weeks: 0 });
      c.seen++;
      if (row.outcome === 'immune') c.blocked++;
      else c.landed++;
      if (Money.isEntered(row.damageWeeks)) c.weeks += row.damageWeeks;
    });

    var rows = tables.dndRules.encounterRules.attackTypes.map(function (t) {
      var c = counts[t.id] || { type: t.id, seen: 0, landed: 0, blocked: 0, weeks: 0 };
      return { id: t.id, label: t.label, seen: c.seen, landed: c.landed,
               blocked: c.blocked, weeks: Math.round(c.weeks * 10) / 10 };
    });
    return { rows: rows, total: total, unknown: unknown,
             recorded: total - unknown, any: total > 0 };
  }

  /**
   * What gets through your armour — DD-019. The attack-roll creatures, each
   * with the chance its roll reaches your AC. This is the sentence the AC
   * panel could never say before: which bills your insurance actually stops.
   */
  function armourGaps(sheet, tables) {
    if (!Money.isOk(sheet.armorClass)) {
      return { ready: false, reason: 'Armour Class needs Dexterity and your cover answered.', rows: [] };
    }
    var ac = sheet.armorClass.value;
    var rules = tables.dndRules.encounterRules;
    var rows = allCreatures(tables).filter(function (c) { return c.resolution === 'attack'; })
      .map(function (c) {
        var b = attackBonusFor(c.cr, tables);
        var raw = (21 + b - ac) / rules.d20.sides;
        var chance = Math.max(rules.d20.autoFailChance, Math.min(1 - rules.d20.autoSucceedChance, raw));
        return { creature: c, attackBonus: b, chance: Math.round(chance * 100) / 100 };
      }).sort(function (a, b) { return b.chance - a.chance; });
    return { ready: true, ac: ac, rows: rows,
             landing: rows.filter(function (r) { return r.chance >= 0.5; }).length };
  }

  return {
    attackBonusFor: attackBonusFor,
    armourGaps: armourGaps,
    typeChart: typeChart,
    typeDefence: typeDefence,
    typeHistory: typeHistory,
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
