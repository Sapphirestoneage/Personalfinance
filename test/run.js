#!/usr/bin/env node
/* ==========================================================================
   test/run.js — every rule in this game, re-derived outside a browser.
   --------------------------------------------------------------------------
   Two jobs.

   1. The rulebook's own schema holds: 18 sub-stats and never 19, seven
      classes with complete 1-20 tables, Hit Dice matching Section 3A. Those
      Hit Dice are what Max HP is built from, so a silent transcription slip
      there would quietly change every character's runway.

   2. The calibration promise holds: a US-population-median household scores
      10 on every computed sub-stat. That is the one claim the whole 8-20
      scale rests on, and data/dnd_scoring.json is meant to be edited — so
      this is what tells you which promise you just broke.

   test/parity.js covers the other half: that a sheet built here computes the
   same numbers as the full SPARKS suite, which is what makes porting a copy
   rather than a translation.

   Run:  node test/run.js && node test/parity.js
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const Money = require(path.join(ROOT, 'shared/money.js'));
const Character = require(path.join(ROOT, 'engines/character.js'));

const table = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));
const TABLES = {
  dndRules: table('dnd_rules.json'),
  dndClasses: table('dnd_classes.json'),
  dndScoring: table('dnd_scoring.json'),
  fooRules: table('foo_rules.json')
};

let passed = 0;
const failures = [];
function check(name, actual, expected) {
  if (actual === expected) { passed++; return; }
  failures.push(`${name}\n      expected: ${JSON.stringify(expected)}\n      actual:   ${JSON.stringify(actual)}`);
}
function checkTrue(name, cond, detail) {
  if (cond) { passed++; return; }
  failures.push(`${name}${detail ? '\n      ' + detail : ''}`);
}
function section(title) { console.log('\n' + title); }

section('Dungeons & Dividends — the schema holds');

(function () {
  const R = TABLES.dndRules, C = TABLES.dndClasses, S = TABLES.dndScoring;

  /* -- The closed schema of Section 2A is the whole design. 18, always. --- */
  check('exactly 18 sub-stats', R.subStats.length, 18);
  check('exactly 6 stats', R.stats.length, 6);
  Character.STAT_IDS.forEach(function (id) {
    check(`${id} owns exactly 3 sub-stats`,
      R.subStats.filter(s => s.stat === id).length, 3);
  });
  check('9 compute from money', Character.computedIds(R).length, 9);
  check('9 are declared', Character.declaredIds(R).length, 9);

  /* -- Section 4 says seven levers. Section 7 says "ten classes", which is a
        leftover from an earlier draft; seven is what the tables actually
        contain and what this build follows. D-048. ------------------------ */
  check('seven classes', C.classes.length, 7);
  C.classes.forEach(function (k) {
    check(`${k.id} has a full 1-20 table`, k.levels.length, 20);
    check(`${k.id} has 3 subclasses`, k.subclasses.length, 3);
    k.subclasses.forEach(function (sub) {
      checkTrue(`${k.id}/${sub.id} follows the 3/6/10/14/18 cadence`,
        JSON.stringify(sub.features.map(f => f.level))
          === JSON.stringify(C.cadence.subclassFeatureLevels));
    });
  });
  /* Hit Dice are the load-bearing number in Section 3A — they set Max HP. */
  const dice = {};
  C.classes.forEach(k => { dice[k.id] = k.hitDie; });
  check('Hit Dice match the Section 3A table', JSON.stringify(dice),
    JSON.stringify({ earner: 8, keeper: 10, builder: 8, compounder: 10,
                     landholder: 6, anchor: 12, speculator: 6 }));

  /* -- Every quiz sub-stat must be able to reach both ends of the scale. -- */
  Character.declaredIds(R).forEach(function (id) {
    const qs = S.quiz[id];
    checkTrue(`${id} has questions`, Array.isArray(qs) && qs.length === 2);
    const best = qs.reduce((t, q) => t + Math.max(...q.options.map(o => o.points)), 0);
    const worst = qs.reduce((t, q) => t + Math.min(...q.options.map(o => o.points)), 0);
    check(`${id} best answers reach 20`, 8 + best, 20);
    check(`${id} worst answers floor at 8`, 8 + worst, 8);
  });
})();

section('Dungeons & Dividends — the calibration promise');

(function () {
  const A = TABLES.dndScoring.anchors;
  const at = (id, v) => Character.scoreFromAnchor(A, id, v).value;

  /* The single claim the whole scale rests on: median reads 10, and 10 is a
     +0 modifier. If a recalibration breaks this, the sheet quietly starts
     telling ordinary people they are exceptional. */
  check('median income scores 10', at('incomePower', 60000), 10);
  check('median wage growth scores 10', at('incomeTrajectory', 0.03), 10);
  check('median saving rate scores 10', at('savingsRate', 0.06), 10);
  check('median reserve scores 10', at('reserveDepth', 1), 10);
  check('median liquid share scores 10', at('liquidityAgility', 0.10), 10);
  check('median fixed-cost share scores 10', at('obligationFlex', 0.65), 10);
  check('and 10 is a +0 modifier', Character.modifier(10), 0);

  /* Ladders flatten at both ends rather than extrapolating. */
  check('below the floor clamps to 8', at('incomePower', 1000), 8);
  check('above the ceiling clamps to 20', at('incomePower', 10000000), 20);
  /* obligationFlex descends: LESS fixed cost is BETTER. */
  checkTrue('obligationFlex rewards lower fixed costs',
    at('obligationFlex', 0.25) > at('obligationFlex', 0.85));

  /* Modifier bands, straight off the Section 2 table. */
  [[8,-1],[9,-1],[10,0],[11,0],[12,1],[13,1],[14,2],[15,2],[16,3],[17,3],[18,4],[19,4],[20,5]]
    .forEach(([sc, mod]) => check(`score ${sc} -> ${mod}`, Character.modifier(sc), mod));
})();

section('Dungeons & Dividends — level, HP and AC');

(function () {
  const L = pct => Character.levelFromProgress(pct, TABLES).value;

  /* Section 7's bands, checked at every boundary. A value sitting exactly on
     a boundary belongs to the HIGHER band. */
  check('0% is level 1', L(0), 1);
  check('just under 10% is still 5', L(0.0999), 5);
  check('exactly 10% is 6', L(0.10), 6);
  check('exactly 30% is 11', L(0.30), 11);
  check('exactly 60% is 16', L(0.60), 16);
  check('exactly 90% is 19', L(0.90), 19);
  check('99.9% is still 19', L(0.999), 19);
  check('100% is 20', L(1.00), 20);
  check('past 100% stays 20', L(4.00), 20);

  /* Max HP is in WEEKS — the ruling that reconciles Section 3A's two
     incompatible definitions of HP. D-046. */
  check('d8 at level 1 with CON +0', Character.maxHp(8, 1, 0, 0, TABLES).weeks, 8);
  check('d8 at level 5 with CON +2', Character.maxHp(8, 5, 2, 0, TABLES).weeks, 38);
  check('d12 at level 20 with CON +3', Character.maxHp(12, 20, 3, 0, TABLES).weeks, 205);
  /* The "Level 20 with no CON" problem, made literal: same level, same class,
     four points of CON apart. */
  checkTrue('CON genuinely changes the pool at the same level',
    Character.maxHp(10, 10, 3, 0, TABLES).weeks > Character.maxHp(10, 10, -1, 0, TABLES).weeks);
  /* And the illiquid-landlord problem: same level, different Hit Die. */
  checkTrue('a d6 class carries less runway than a d10 at the same level',
    Character.maxHp(6, 10, 2, 0, TABLES).weeks < Character.maxHp(10, 10, 2, 0, TABLES).weeks);
  check('Debt Burden 2 cuts Max HP by 25%',
    Character.maxHp(10, 10, 2, 2, TABLES).weeks, 63);
  check('a level never adds less than 1 HP even at terrible CON',
    Character.maxHp(6, 10, -5, 0, TABLES).weeks, 10);

  /* Section 12A's Spectrum formula, exactly as written. */
  const spec = Character.spectrum({
    incomePower: Money.ok(20), savingsRate: Money.ok(8), reserveDepth: Money.ok(14)
  }, TABLES);
  const by = {};
  spec.forEach(r => { by[r.id] = r; });
  check('score 20 is 100%', by.incomePower.percent, 100);
  check('score 8 is 0%', by.savingsRate.percent, 0);
  check('score 14 is 50%', by.reserveDepth.percent, 50);
  check('the spectrum ranks highest first', spec[0].id, 'incomePower');
})();

section('Dungeons & Dividends — empty is never zero');

(function () {
  /* The rule this whole engine is built around. An unanswered sub-stat is
     NOT an 8, and a main stat with two of three answered is NOT an average
     of two — it is unscored, and it says what it is waiting for. */
  const blank = Character.allSubStats({}, TABLES);
  check('all 18 are reported on an empty household', Object.keys(blank).length, 18);
  check('none of them invent a score',
    Object.keys(blank).filter(k => Money.isOk(blank[k])).length, 0);

  const stats = Character.mainStats(blank, TABLES);
  Character.STAT_IDS.forEach(function (id) {
    checkTrue(`${id} is unscored, not 8`, !Money.isOk(stats[id]));
    check(`${id} names all three missing sub-stats`, stats[id].missing.length, 3);
  });

  /* Two of three is still not a stat. */
  const partial = Character.mainStats(Object.assign({}, blank, {
    incomePower: Money.ok(14), incomeTrajectory: Money.ok(16)
  }), TABLES);
  checkTrue('STR stays unscored with 2 of 3 sub-stats', !Money.isOk(partial.STR));
  check('and names the one still missing', partial.STR.missing.length, 1);

  /* Three of three is. 14, 16, 12 -> 14. */
  const full = Character.mainStats(Object.assign({}, blank, {
    incomePower: Money.ok(14), incomeTrajectory: Money.ok(16), hustleCapacity: Money.ok(12)
  }), TABLES);
  check('three sub-stats average into the stat', full.STR.value, 14);

  const sheet = Character.sheet({}, TABLES);
  checkTrue('an empty sheet still renders', sheet.ready);
  check('with no Max HP guessed from a default Hit Die', sheet.maxHp, null);
})();


section('Dungeons & Dividends — the quiz-only leaning');

(function () {
  /* A leaning has to be able to reach every class. An earlier version ranked
     on the six main stats, which meant that with only INT, WIS and CHA scored
     The Speculator (INT/WIS) was the only class with both primaries available
     and won almost every time, while The Landholder (DEX/CON) could never
     appear at all. Ranking over the nine answered sub-stats fixes that, and
     this is the check that stops it regressing. */
  const affinity = TABLES.dndScoring.tier1Affinity.subStats;
  check('every class has a quiz-only affinity',
    Object.keys(affinity).length, TABLES.dndClasses.classes.length);

  const declared = Character.declaredIds(TABLES.dndRules);
  Object.keys(affinity).forEach(function (classId) {
    affinity[classId].forEach(function (id) {
      checkTrue(`${classId} leans on ${id}, which is a real declared sub-stat`,
        declared.indexOf(id) !== -1);
    });
  });

  /* Every one of the seven must be reachable by some answer pattern. */
  const reachable = new Set();
  Object.keys(affinity).forEach(function (classId) {
    const scores = {};
    declared.forEach(function (id) { scores[id] = Money.ok(8); });
    affinity[classId].forEach(function (id) { scores[id] = Money.ok(20); });
    reachable.add(Character.suggestClassFromStats(scores, TABLES).value);
  });
  check('all seven classes are reachable from the quiz alone',
    reachable.size, TABLES.dndClasses.classes.length);

  check('and with nothing answered it declines to guess',
    Character.suggestClassFromStats({}, TABLES).status, 'incomplete');
})();

console.log('\n' + '\u2500'.repeat(66));
if (failures.length === 0) {
  console.log(`\u2713 ${passed} checks passed`);
  process.exit(0);
}
console.log(`\u2717 ${failures.length} failed, ${passed} passed\n`);
failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
process.exit(1);
