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

section('Dungeons & Dividends — the questions');

(function () {
  const S = TABLES.dndScoring;
  const declared = Character.declaredIds(TABLES.dndRules);
  const all = [];
  declared.forEach(id => (S.quiz[id] || []).forEach((q, i) => all.push({ id, i, q })));

  /* Display order lives in the data, and the UI sorts by it. A duplicate or a
     gap would silently reshuffle the run, so pin it: 1..18, each used once. */
  const orders = all.map(x => x.q.order).sort((a, b) => a - b);
  check('every question declares an order', all.filter(x => typeof x.q.order === 'number').length, 18);
  check('orders are exactly 1..18 with no repeats',
    JSON.stringify(orders), JSON.stringify(Array.from({ length: 18 }, (_, i) => i + 1)));

  /* The two questions on one topic must not sit next to each other — asking
     the same thing twice in a row reads as a drill rather than a quiz. */
  declared.forEach(function (id) {
    const pair = (S.quiz[id] || []).map(q => q.order).sort((a, b) => a - b);
    checkTrue(`${id}'s two questions are spread apart`, pair[1] - pair[0] > 1,
      'consecutive questions on one sub-stat feel like an interrogation');
  });

  /* The driest topics land last, once someone is already committed. */
  const firstOf = id => Math.min.apply(null, (S.quiz[id] || []).map(q => q.order));
  checkTrue('tax is not the opening question', firstOf('taxLiteracy') > 5,
    'opening on tax is how you lose someone in the first ten seconds');
  checkTrue('the run opens on something behavioural',
    firstOf('negotiation') === 1 || firstOf('threatDetection') === 1 || firstOf('network') === 1);

  /* No option may be a dead end: every question needs a real top and bottom,
     or the 8-20 scale silently narrows. */
  all.forEach(function (x) {
    const pts = x.q.options.map(o => o.points);
    check(`${x.id}[${x.i}] can reach 6`, Math.max.apply(null, pts), 6);
    check(`${x.id}[${x.i}] can reach 0`, Math.min.apply(null, pts), 0);
    checkTrue(`${x.id}[${x.i}] offers a real choice`, x.q.options.length >= 4);
  });

  /* Behavioural, not a memory test: no question may ask the reader to compute.
     These are the shapes the old knowledge questions had. */
  const arithmetic = /\bhow much\b|\bwhat does that cost\b|\bper year on \$|\bcalculate\b|\b0\.\d+%.*\$\d/i;
  all.forEach(function (x) {
    checkTrue(`${x.id}[${x.i}] asks no arithmetic`, !arithmetic.test(x.q.q),
      'a question with sums in it is a test, and people close tests');
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

section('Dungeons & Dividends — the two skins');

(function () {
  /* skin.js talks to localStorage, so give it one. */
  const realSelf = global.self;
  const store = {};
  global.self = {
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; }
    },
    document: { body: { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } } }
  };
  delete require.cache[require.resolve(path.join(ROOT, 'shared/skin.js'))];
  const Skin = require(path.join(ROOT, 'shared/skin.js'));

  check('two skins offered', Skin.SKINS.length, 2);
  check('navy is the default', Skin.get(), 'navy');
  check('init paints the default', Skin.init(), 'navy');
  check('and stamps the body', global.self.document.body.attrs['data-skin'], 'navy');

  check('parchment can be chosen', Skin.set('parchment'), 'parchment');
  check('it persists', Skin.get(), 'parchment');
  check('and repaints the body', global.self.document.body.attrs['data-skin'], 'parchment');
  check('nonsense falls back rather than throwing', Skin.set('lasagne'), 'navy');

  /* A skin is a preference about a browser, not a fact about someone's money.
     It must never ride along in a character export. */
  checkTrue('the skin key is separate from the character key',
    Skin.KEY !== 'dnd.character.v1');
  const Export = require(path.join(ROOT, 'shared/export.js'));
  checkTrue('and skin is not an exportable field',
    Export.OWNED_KEYS.indexOf('skin') === -1 && Export.OWNED_KEYS.indexOf('dndSkin') === -1);

  if (realSelf === undefined) delete global.self; else global.self = realSelf;
})();

(function () {
  /* Every page must load both halves and give the control somewhere to go,
     or the toggle silently does nothing on that page. */
  ['index.html', 'sheet.html', 'bestiary.html'].forEach(function (page) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    checkTrue(`${page} loads skin.css`, /shared\/skin\.css/.test(html));
    checkTrue(`${page} loads skin.js`, /shared\/skin\.js/.test(html));
    checkTrue(`${page} has somewhere to mount the control`, /id="skin-bar"/.test(html));
    checkTrue(`${page} mounts it`, /Skin\.mount\(/.test(html));
    /* Applied before the page paints, so it cannot flash the wrong skin. */
    checkTrue(`${page} applies the skin up front`, /Skin\.init\(\)/.test(html));
  });

  /* Printing must not depend on remembering to switch first. */
  const css = fs.readFileSync(path.join(ROOT, 'shared/skin.css'), 'utf8');
  checkTrue('there is a print block', /@media print/.test(css));
  checkTrue('print forces a white page', /@media print[\s\S]*background:\s*#FFFFFF/i.test(css));
  checkTrue('print hides the toggle', /@media print[\s\S]*\.skin-bar[\s\S]*display:\s*none/i.test(css));
  /* Guard the mangled-hex class of typo that nearly shipped here. */
  const hexes = css.match(/#[0-9A-Fa-f]{3,8}\b/g) || [];
  hexes.forEach(function (h) {
    checkTrue(`${h} is a valid hex colour`, /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(h));
  });
  checkTrue('no stray non-hex slipped into a colour value',
    !/--color-[a-z-]+:\s*#[0-9A-Fa-f]*[g-zG-Z][^;]*;/.test(css));
})();

section('Dungeons & Dividends — the sheet furniture');

(function () {
  const cls = TABLES.dndClasses.classes.filter(c => c.id === 'earner')[0];
  const stats = { STR: Money.ok(14), DEX: Money.ok(12), CON: Money.ok(15),
                  INT: Money.ok(10), WIS: Money.ok(13), CHA: Money.ok(16) };

  /* Six saves, and exactly the class's two carry proficiency (§3). */
  const saves = Character.savingThrows(stats, cls, 2, TABLES);
  check('six saving throws', saves.length, 6);
  check('exactly two are proficient', saves.filter(s => s.proficient).length, 2);
  const by = {};
  saves.forEach(s => { by[s.stat] = s; });
  /* STR 14 -> +2, plus proficiency 2 -> +4. */
  check('a proficient save adds the proficiency bonus', by.STR.modifier, 4);
  /* DEX 12 -> +1, no proficiency. */
  check('a non-proficient save does not', by.DEX.modifier, 1);
  check('and the proficient ones are the class\'s',
    JSON.stringify(saves.filter(s => s.proficient).map(s => s.stat)),
    JSON.stringify(cls.saves));

  /* An unscored stat produces an unscored save, never a +0. */
  const partial = Character.savingThrows({ STR: Money.ok(14) }, cls, 2, TABLES);
  check('an unscored stat gives an unscored save', partial.filter(s => s.ok).length, 1);

  /* The skills block IS the eighteen sub-stats — that is §2A's whole design. */
  const skills = Character.skillList(Character.allSubStats({}, TABLES), cls, TABLES);
  check('eighteen skills, one per sub-stat', skills.length, 18);
  check('none score on an empty character', skills.filter(s => s.ok).length, 0);
  check('the class\'s primary stats are marked',
    skills.filter(s => s.primary).length,
    TABLES.dndRules.subStats.filter(m => cls.primary.indexOf(m.stat) !== -1).length);

  /* Hit dice read the way a sheet writes them. */
  check('hit dice', Character.hitDiceLabel(cls, 3), '3d8');
  check('hit dice at 20', Character.hitDiceLabel(cls, 20), '20d8');
  check('no class, no hit dice', Character.hitDiceLabel(null, 3), null);

  /* Passive scores are 10 + modifier, exactly as passive Perception is. */
  const subs = { threatDetection: Money.ok(16), scenarioForesight: Money.ok(8) };
  const ps = Character.passives(subs, TABLES);
  const pby = {};
  ps.forEach(p => { pby[p.id] = p; });
  check('passive from a 16 is 13', pby.threatDetection.value, 13);
  check('passive from an 8 is 9', pby.scenarioForesight.value, 9);
  check('an unscored sub-stat has no passive', pby.instrumentLiteracy.ok, false);

  /* Defences are read off earned feature text, never invented. */
  const none = Character.defenses([{ feature: 'Automate', detail: 'sets up contributions' }], []);
  check('a feature with no resistance wording yields nothing', none.length, 0);
  const some = Character.defenses(
    [{ feature: 'Seven-Figure Threshold', detail: 'resistance to Lifestyle-Inflation Imp damage' }], []);
  check('a resistance is picked up', some.length, 1);
  check('and typed correctly', some[0].kind, 'Resistance');
  const imm = Character.defenses([{ feature: 'Total Market Immunity', detail: 'immune to picking wrong' }], []);
  check('an immunity outranks a resistance', imm[0].kind, 'Immunity');
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
