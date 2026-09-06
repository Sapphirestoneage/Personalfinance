/* ==========================================================================
   engines/persona.js — the long read. DD-027.
   --------------------------------------------------------------------------
   An Enneagram-shaped profile built on the class: what you want, what you are
   afraid of, who you work with, who winds you up, and what you are weak to.

   WHAT THIS IS, SAID PLAINLY IN THE ONE PLACE IT MATTERS.

   This is CHARACTERISATION. It is written to be recognised, not to be true,
   and it is no more evidence-based than a star sign. Everywhere else in this
   repo a number that cannot be derived is left blank rather than guessed at;
   here the whole output is a guess, so the honesty has to come from labelling
   rather than from arithmetic. Two rules make that work:

   1. THE PROFILE FOLLOWS A CLASS, AND THE CLASS SAYS WHERE IT CAME FROM.
      A class derived from money is marked measured; one derived from five
      questions is marked instinct. When they disagree the reader is shown
      both rather than handed a tidy single answer.

   2. THE ORIGIN STORIES ARE OFFERED, NEVER ASSERTED. Nothing here knows
      anything about anybody's childhood, and a tool that announced what your
      parents were like would simply be lying. They are returned with the
      warning text attached, and `originsWarning` is not optional — a room
      that prints the stories without it is misusing this file.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('../shared/money.js'), Journey: require('./journey.js') };
  } else {
    deps = { Money: root.SLAF && root.SLAF.Money, Journey: root.DND && root.DND.Journey };
  }
  var api = factory(deps.Money, deps.Journey);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.DND = root.DND || {}; root.DND.Persona = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Journey) {
  'use strict';

  function table(tables) { return tables.dndProfile; }

  function classOf(tables, id) {
    return tables.dndClasses.classes.filter(function (c) { return c.id === id; })[0] || null;
  }

  function name(tables, id) {
    var c = classOf(tables, id);
    return c ? c.name : id;
  }

  /* A relation, with the other class's own words attached so a room never has
     to look them up a second time and get them slightly different. */
  function relation(tables, rel) {
    if (!rel) return null;
    var c = classOf(tables, rel.classId);
    return {
      classId: rel.classId,
      name: c ? c.name : rel.classId,
      lever: c ? c.lever : null,
      why: rel.why
    };
  }

  function monsterByName(tables, n) {
    return (tables.dndRules.monsters || []).filter(function (m) { return m.name === n; })[0] || null;
  }

  /**
   * persona(household, sheet, tables)
   *
   * `sheet` is Character.sheet() — passed in rather than recomputed, because
   * the class it chose is the one the rest of the page is already showing and
   * two derivations of the same thing is how they drift apart.
   */
  function persona(household, sheet, tables) {
    var t = table(tables);
    if (!t || !t.classes) return { ready: false, reason: 'The profile table is not loaded.' };

    /* Where the class came from decides how it is labelled. */
    var measuredId = sheet && sheet.klass ? sheet.klass.id : null;
    var instinctId = null;
    if (Journey && tables.dndQuiz5) {
      var q = Journey.scoreQuiz((household.dndProfile || {}).quiz5 || {}, tables);
      if (Money.isOk(q)) instinctId = q.value;
    }

    var id = measuredId || instinctId;
    if (!id) {
      return { ready: false, reason: 'No class yet — answer the five questions or add your numbers.' };
    }
    var p = t.classes[id];
    if (!p) return { ready: false, reason: 'No profile written for ' + id + '.' };

    var mon = monsterByName(tables, p.weakTo.monster);

    return {
      ready: true,
      classId: id,
      name: name(tables, id),
      lever: (classOf(tables, id) || {}).lever || null,
      /* 'measured' if your money chose it, 'instinct' if five questions did. */
      basis: measuredId ? 'measured' : 'instinct',
      measured: measuredId ? { classId: measuredId, name: name(tables, measuredId) } : null,
      instinct: instinctId ? { classId: instinctId, name: name(tables, instinctId) } : null,
      /* The interesting case, and the reason both are kept. */
      split: !!(measuredId && instinctId && measuredId !== instinctId),
      other: (measuredId && instinctId && measuredId !== instinctId) ? t.classes[instinctId] : null,
      otherName: (measuredId && instinctId && measuredId !== instinctId) ? name(tables, instinctId) : null,

      /* THE ESOTERICA IS FLAVOUR AND IS LABELLED AS SUCH.
         The sign, the ruling body, the hour, the metal and the card are all
         invented, and the table's own note says so. They are here because a
         thing like this is more fun when it commits, and because a reader who
         is told plainly that it is a star sign can enjoy it as one. The people
         and circumstances under weakTo are the opposite: those are written
         from how each lever actually fails, and they are the part to take
         seriously. Both travel together so the page cannot present the fun as
         findings. */
      sign: p.sign || null,
      alignment: p.alignment || null,
      patron: p.patron || null,
      curse: p.curse || null,
      resistances: p.resistances || [],
      vulnerabilities: p.vulnerabilities || [],
      bane: p.bane || null,
      omens: p.omens || { good: [], ill: [] },
      reading: p.reading || null,
      esotericaNote: t.esotericaNote || null,

      headline: p.headline,
      coreDesire: p.coreDesire,
      coreFear: p.coreFear,
      lie: p.lie,
      truth: p.truth,
      atBest: p.atBest,
      atWorst: p.atWorst,
      blindSpot: p.blindSpot,
      needsToHear: p.needsToHear,

      growth: relation(tables, p.growth),
      stress: relation(tables, p.stress),
      relations: {
        partner: relation(tables, p.relations.partner),
        friend: relation(tables, p.relations.friend),
        annoying: relation(tables, p.relations.annoying),
        wary: relation(tables, p.relations.wary),
        triggeredBy: relation(tables, p.relations.triggeredBy)
      },
      weakTo: {
        monster: p.weakTo.monster,
        why: p.weakTo.why,
        cr: mon ? mon.cr : null,
        save: mon ? (mon.save || mon.targetSave || null) : null,
        found: !!mon,
        /* Not a creature — a kind of person, and a kind of afternoon. These
           are the two that actually get past people, and neither of them
           rolls initiative. */
        people: p.weakTo.people || [],
        circumstances: p.weakTo.circumstances || []
      },

      /* Offered, never asserted — and the warning travels with them so it
         cannot be dropped by a room that only wanted the pretty part. */
      origins: p.origins,
      originsWarning: t.originsWarning
    };
  }

  /**
   * Who is in your party, from everyone else's point of view.
   *
   * Reads the OTHER six profiles rather than this one's, so "who finds you
   * annoying" is genuinely their opinion of you and not your guess at it.
   * Two people can find each other annoying and the table should say so.
   */
  function party(classId, tables) {
    var t = table(tables);
    var out = { worksWith: [], findsYouAnnoying: [], waryOfYou: [], triggeredByYou: [] };
    if (!t || !t.classes) return out;
    Object.keys(t.classes).forEach(function (other) {
      if (other === classId) return;
      var r = t.classes[other].relations;
      var entry = { classId: other, name: name(tables, other) };
      if (r.partner.classId === classId) {
        out.worksWith.push({ classId: other, name: entry.name, why: r.partner.why, kind: 'partner' });
      }
      if (r.friend.classId === classId) {
        out.worksWith.push({ classId: other, name: entry.name, why: r.friend.why, kind: 'friend' });
      }
      if (r.annoying.classId === classId) {
        out.findsYouAnnoying.push({ classId: other, name: entry.name, why: r.annoying.why });
      }
      if (r.wary.classId === classId) {
        out.waryOfYou.push({ classId: other, name: entry.name, why: r.wary.why });
      }
      if (r.triggeredBy.classId === classId) {
        out.triggeredByYou.push({ classId: other, name: entry.name, why: r.triggeredBy.why });
      }
    });
    return out;
  }

  return { persona: persona, party: party, classOf: classOf, className: name };
});
