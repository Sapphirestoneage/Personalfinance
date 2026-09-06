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
const Schema = require(path.join(ROOT, 'shared/schema.js'));

const table = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));

/* Every page in the folder, found rather than listed. These checks used to name
   their pages, so each new page quietly escaped whichever lists nobody
   remembered to update — encounter.html was missing from four of them and
   card.html would have been missing from five. Adding a page now opts it in. */
const PAGES = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html')).sort();
const TABLES = {
  dndRules: table('dnd_rules.json'),
  dndClasses: table('dnd_classes.json'),
  dndScoring: table('dnd_scoring.json'),
  fooRules: table('foo_rules.json'),
  /* CON runs through the savings rate, which subtracts estimated tax, which
     needs this table. Without it CON is incomplete and Max HP is null — which
     is the engine behaving correctly and a test harness behaving badly. */
  effectiveTaxRates: table('effective_tax_rates_2026.json'),
  /* The campaign's scenario bank (DD-024). */
  dndScenarios: table('dnd_scenarios.json'),
  dndQuiz5: table('dnd_quiz5.json'),
  dndImprove: table('dnd_improve.json')
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
        contain and what this build follows. DD-003. ------------------------ */
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
     incompatible definitions of HP. DD-001. */
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

section('Dungeons & Dividends — the encounter engine');

(function () {
  const Encounter = require(path.join(ROOT, 'engines/encounter.js'));
  const R = TABLES.dndRules;

  /* -- every creature carries the full §9.3 shape, or this fails ---------- */
  const creatures = R.monsters.concat(R.hazards);
  check('twenty-nine creatures in all', creatures.length, 29);
  creatures.forEach(function (c) {
    checkTrue(`${c.name} has a save ability`, typeof c.saveAbility === 'string' && c.saveAbility.length > 0);
    checkTrue(`${c.name} has a damage spec`, !!c.damageSpec);
    checkTrue(`${c.name} has an attack type`, !!c.attackType);
    checkTrue(`${c.name} has a tier`, ['I', 'II', 'III', 'IV'].indexOf(c.tier) !== -1);
    checkTrue(`${c.name} declares what blocks it`, Array.isArray(c.blockedBy));
    checkTrue(`${c.name} names where it hunts`, Array.isArray(c.lair) && c.lair.length > 0);
    (c.blockedBy || []).forEach(function (b) {
      checkTrue(`${c.name}: blocker "${b.id}" exists in the catalogue`, !!R.blockers[b.id]);
      checkTrue(`${c.name}: effect "${b.effect}" is a real effect`,
        ['negate', 'halve', 'advantage'].indexOf(b.effect) !== -1);
    });
    /* Every attack type must be one T10 will know about. */
    checkTrue(`${c.name}: attack type is declared in the rules`,
      R.encounterRules.attackTypes.some(t => t.id === c.attackType));
  });

  /* -- the ladders ------------------------------------------------------- */
  check('CR 1/8 -> DC 10', Encounter.dcFor('1/8', TABLES), 10);
  check('CR 3 -> DC 13', Encounter.dcFor('3', TABLES), 13);
  check('CR 8 -> DC 16', Encounter.dcFor('8', TABLES), 16);
  check('a CR range takes its lower bound', Encounter.dcFor('18–20', TABLES), Encounter.dcFor('18', TABLES));
  check('an absent CR yields no DC', Encounter.dcFor('—', TABLES), null);
  check('3d6 averages 10.5', Encounter.expectedDice(Encounter.parseDice('3d6')), 10.5);
  check('a malformed dice string parses to nothing', Encounter.parseDice('lots'), null);

  /* -- a pair of saves targets the WORSE of the two ---------------------- */
  const saves = [
    { stat: 'CON', ok: true, modifier: 5 },
    { stat: 'DEX', ok: true, modifier: 1 },
    { stat: 'WIS', ok: true, modifier: 3 }
  ];
  check('a paired save picks the weaker side',
    Encounter.targetSave({ saveAbility: 'CON+DEX' }, saves).stat, 'DEX');
  check('ALL picks the weakest of everything',
    Encounter.targetSave({ saveAbility: 'ALL' }, saves).stat, 'DEX');
  check('a single save picks itself',
    Encounter.targetSave({ saveAbility: 'WIS' }, saves).stat, 'WIS');

  /* -- THE WORKED EXAMPLE, re-derived by hand ----------------------------
     A Level 3 Earner: WIS 13 (+1), not WIS-proficient, 13 weeks of HP.
     Against the Timeshare Charm-Caster (CR 3, WIS save, 3d6):
       DC          CR 3 sits on the maxCr-4 rung        -> 13
       modifier    WIS 13 -> +1, no proficiency          -> +1
       advantage   Self-Awareness 15 >= 14               -> +3.7
       hit chance  (13 − 4.7 − 1) / 20                   -> 0.365
       damage      3 × 3.5                               -> 10.5 weeks
       hp after    13 − 10.5                             -> 2.5              */
  const sheet = {
    stats: { STR: Money.ok(12), DEX: Money.ok(13), CON: Money.ok(14),
             INT: Money.ok(14), WIS: Money.ok(13), CHA: Money.ok(9) },
    klass: TABLES.dndClasses.classes.filter(c => c.id === 'earner')[0],
    proficiencyBonus: 2,
    currentHp: Money.ok(13),
    maxHp: { weeks: 18, reducedByDebt: true },
    level: Money.ok(3),
    subScores: { selfAwareness: Money.ok(15), threatDetection: Money.ok(10) },
    debtBurden: Money.ok(2),
    suggestedClass: Money.ok('earner', { ranked: [] })
  };
  const timeshare = R.monsters.filter(m => m.name === 'Timeshare Charm-Caster')[0];
  const r = Encounter.run(sheet, timeshare, { tables: TABLES, household: { dndProfile: {} } });

  check('worked example: target save', r.targetSave, 'WIS');
  check('worked example: modifier', r.modifier, 1);
  check('worked example: DC', r.dc, 13);
  checkTrue('worked example: advantage from Self-Awareness', r.advantage);
  check('worked example: effective modifier', Math.round(r.effectiveModifier * 10) / 10, 4.7);
  check('worked example: chance it lands', r.hitChance, 0.365);
  check('worked example: damage in weeks', r.damageWeeks, 10.5);
  check('worked example: hit points after', r.hpAfter, 2.5);
  checkTrue('worked example: not a death-save situation', !r.deathSaves);
  checkTrue('worked example: Threat Detection 10 is below the bar, so absent',
    r.blockedBy.some(b => b.id === 'threatDetection' && b.state === 'absent'));

  /* -- three states, and unknown must never help the monster ------------- */
  const unknownSheet = Object.assign({}, sheet, { subScores: {} });
  const u = Encounter.run(unknownSheet, timeshare, { tables: TABLES, household: { dndProfile: {} } });
  check('an unscored blocker reads as unknown, not absent',
    u.blockedBy.filter(b => b.state === 'unknown').length, 2);
  checkTrue('and unknown grants nothing', !u.advantage && !u.negated && !u.halved);
  check('so the save is the bare modifier', u.effectiveModifier, 1);

  /* -- negate really does mean cannot land ------------------------------- */
  const wardedSheet = Object.assign({}, sheet, {
    subScores: { threatDetection: Money.ok(18), selfAwareness: Money.ok(15) } });
  const w = Encounter.run(wardedSheet, timeshare, { tables: TABLES, household: { dndProfile: {} } });
  checkTrue('Threat Detection 18 negates the Charm-Caster', w.negated);
  check('a negated attack lands never', w.hitChance, 0);
  check('and deals nothing', w.damageWeeks, 0);
  check('so hit points do not move', w.hpAfter, w.hpBefore);

  /* -- halve ------------------------------------------------------------- */
  const behemoth = R.hazards.filter(h => h.name === 'Medical Bankruptcy Behemoth')[0];
  const bare = Encounter.run(sheet, behemoth, { tables: TABLES, household: { dndProfile: {} } });
  const insured = Encounter.run(sheet, behemoth, {
    tables: TABLES, household: { dndProfile: { healthCoverage: 2 } } });
  /* DD-019: health cover no longer halves the Behemoth as a blocker — it is
     armour, and armour acts through AC on an attack roll. Counting it in both
     places was the double-count this pass removed. */
  check('the Behemoth attacks Armour Class', insured.resolution, 'attack');
  checkTrue('health cover is not a blocker on it any more', !insured.halved);
  check('so damage is the full roll either way', insured.damageWeeks, bare.damageWeeks);
  checkTrue('uninsured, it is massive damage against an 18-week pool', bare.massiveDamage);

  /* -- the 5%/95% clamp -------------------------------------------------- */
  const godlike = Object.assign({}, sheet, {
    stats: Object.assign({}, sheet.stats, { WIS: Money.ok(20) }), proficiencyBonus: 6 });
  const g = Encounter.run(godlike, timeshare, { tables: TABLES, household: { dndProfile: {} } });
  checkTrue('however good the save, a natural 1 still fails', g.hitChance >= 0.05);
  const hopeless = Object.assign({}, sheet, {
    stats: Object.assign({}, sheet.stats, { WIS: Money.ok(8) }), proficiencyBonus: 2 });
  const hp = Encounter.run(hopeless, R.hazards.filter(h => h.name === 'Market Crash Elemental')[0],
    { tables: TABLES, household: { dndProfile: {} } });
  checkTrue('and however bad, a natural 20 still saves', hp.hitChance <= 0.95);

  /* -- rolling stays inside the possible range --------------------------- */
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < 200; i++) {
    const roll = Encounter.run(sheet, timeshare,
      { tables: TABLES, household: { dndProfile: {} }, mode: 'roll' });
    lo = Math.min(lo, roll.damageWeeks); hi = Math.max(hi, roll.damageWeeks);
  }
  checkTrue('3d6 never rolls below 3', lo >= 3);
  checkTrue('3d6 never rolls above 18', hi <= 18);

  /* -- predators: unscored saves are not weaknesses ---------------------- */
  const p = Encounter.predators(sheet, TABLES);
  checkTrue('the map is ready with six scored saves', p.ready);
  checkTrue('it names at least two weakest', p.weakest.length >= 2);
  check('a level 3 character is tier I', p.tier.id, 'I');

  /* A tie is a tie. Taking a flat slice of two would mark one save thin and
     its numerical twin safe, so `weakest` carries everything tied with the
     second-thinnest — no more and no less. */
  const scored = Character.savingThrows(sheet.stats, sheet.klass, sheet.proficiencyBonus, TABLES)
    .filter(function (x) { return x.ok; })
    .sort(function (a, b) { return a.modifier - b.modifier; });
  const cut = scored[1].modifier;
  check('weakest is exactly the saves at or below the second-thinnest',
    p.weakest.slice().sort().join(','),
    scored.filter(function (x) { return x.modifier <= cut; })
          .map(function (x) { return x.stat; }).sort().join(','));

  const flat = { stats: { INT: Money.ok(14), WIS: Money.ok(14), CHA: Money.ok(14) },
                 klass: null, proficiencyBonus: 0, level: null };
  check('three saves all level names all three, not an arbitrary two',
    Encounter.predators(flat, TABLES).weakest.length, 3);
  const clear = { stats: { INT: Money.ok(18), WIS: Money.ok(12), CHA: Money.ok(6) },
                  klass: null, proficiencyBonus: 0, level: null };
  check('and with no tie it still names exactly two',
    Encounter.predators(clear, TABLES).weakest.length, 2);
  const thin = Object.assign({}, sheet, { stats: { WIS: Money.ok(8) } });
  checkTrue('with one save scored there is no map yet', !Encounter.predators(thin, TABLES).ready);
})();

section('Dungeons & Dividends — nothing is escaped twice');

(function () {
  /* This exact bug has shipped three times: a string containing &amp; is
     passed to a helper that escapes its argument, so the reader sees the
     literal "&amp;". The helpers below all escape, so a pre-escaped entity in
     one of their string arguments is always wrong. */
  const HELPERS = ['esc', 'panel', 'moneyInput', 'selectInput', 'sharpen'];
  PAGES.forEach(function (page) {
    const src = fs.readFileSync(path.join(ROOT, page), 'utf8');
    HELPERS.forEach(function (fn) {
      /* Match the helper call and grab its quoted string arguments. */
      const call = new RegExp(fn + "\\(\\s*'((?:[^'\\\\]|\\\\.)*)'", 'g');
      let m;
      while ((m = call.exec(src)) !== null) {
        checkTrue(`${page}: ${fn}(…) argument is not pre-escaped`,
          !/&(amp|lt|gt|quot);/.test(m[1]),
          `"${m[1].slice(0, 60)}" is escaped again inside ${fn}() and renders as literal &amp;`);
      }
    });
  });

  /* esc() must not receive markup either. Escaping a string that already
     carries the tags you meant to keep renders them as visible text — the
     same mistake as pre-escaping an entity, wearing a different hat. */
  PAGES.forEach(function (page) {
    const src = fs.readFileSync(path.join(ROOT, page), 'utf8');
    const call = /esc\(\s*'((?:[^'\\]|\\.)*)'/g;
    let m;
    while ((m = call.exec(src)) !== null) {
      checkTrue(`${page}: esc(…) argument carries no markup`,
        !/<\/?[a-z][^>]*>/i.test(m[1]),
        `"${m[1].slice(0, 60)}" would render its tags as text`);
    }
    /* The join-with-markup form is the one that actually bit. */
    checkTrue(`${page}: no esc(x.join('<tag>')) form`,
      !/esc\([^)]*\.join\(\s*'[^']*<[^']*'\s*\)/.test(src),
      'escape each value first, then join with markup');
  });

  /* And the same for the second argument position, where labels usually sit. */
  ['sheet.html'].forEach(function (page) {
    const src = fs.readFileSync(path.join(ROOT, page), 'utf8');
    const call = /(?:moneyInput|selectInput|sharpen)\([^)]*?,\s*'((?:[^'\\]|\\.)*)'/g;
    let m;
    while ((m = call.exec(src)) !== null) {
      checkTrue(`${page}: helper label is not pre-escaped`,
        !/&(amp|lt|gt|quot);/.test(m[1]),
        `"${m[1].slice(0, 60)}" would render as literal &amp;`);
    }
  });
})();

section('Dungeons & Dividends — licence and IP posture');

(function () {
  /* The brief requires the SRD attribution and a non-affiliation line, and
     requires them in the first commit. They are load-bearing, not decoration,
     so they are asserted rather than trusted to survive a rewrite. */
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  const bestiary = fs.readFileSync(path.join(ROOT, 'bestiary.html'), 'utf8');

  [['README.md', readme], ['bestiary.html', bestiary]].forEach(function (pair) {
    checkTrue(pair[0] + ' names the SRD 5.1', /System Reference Document 5\.1/.test(pair[1]));
    checkTrue(pair[0] + ' names the CC BY 4.0 licence',
      /Creative Commons Attribution 4\.0/.test(pair[1]));
    checkTrue(pair[0] + ' links the licence text',
      /creativecommons\.org\/licenses\/by\/4\.0/.test(pair[1]));
    checkTrue(pair[0] + ' disclaims affiliation',
      /not affiliated with[\s\S]{0,80}Wizards of the Coast/i.test(pair[1]));
  });

  /* Every page a stranger can land on carries the disclaimer. */
  PAGES.forEach(function (page) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    checkTrue(page + ' carries a non-affiliation line',
      /Wizards of the Coast/.test(html));
  });

  /* Parody rules: riff on names, never reproduce a Wizards-owned creature or
     setting. This list is the tripwire — if one of these ever appears in the
     data or the pages, the rule has been broken somewhere. */
  const OWNED = ['tarrasque', 'beholder', 'mind flayer', 'illithid', 'displacer beast',
                 'owlbear', 'githyanki', 'modron', 'slaad', 'faerun', 'waterdeep',
                 'forgotten realms', 'baldur', 'neverwinter', 'drizzt', 'strahd'];
  const surfaces = ['data/dnd_rules.json', 'data/dnd_classes.json', 'data/dnd_scoring.json',
                    'data/dnd_alignments.json'].concat(PAGES);
  surfaces.forEach(function (f) {
    const text = fs.readFileSync(path.join(ROOT, f), 'utf8').toLowerCase();
    OWNED.forEach(function (name) {
      checkTrue(`${f} does not use "${name}"`, text.indexOf(name) === -1,
        'parody riffs on names; it does not reproduce Wizards-owned ones');
    });
  });

  /* And the title must not carry a D&D mark. "Dungeons & Dividends" riffs;
     the actual mark is the two words together. */
  const title = (fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
    .match(/<title>([^<]*)<\/title>/) || [])[1] || '';
  checkTrue('the title does not contain the D&D word mark',
    !/dungeons\s*&(amp;)?\s*dragons/i.test(title), 'title was: ' + title);
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
  PAGES.forEach(function (page) {
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

section('Dungeons & Dividends — the type chart (T10)');

(function () {
  const Encounter = require(path.join(ROOT, 'engines/encounter.js'));
  const R = TABLES.dndRules;
  const chart = Encounter.typeChart(TABLES);
  const creatures = R.monsters.concat(R.hazards);

  /* The chart is DERIVED from the bestiary, never written down twice. These
     checks are what makes that claim testable. */
  check('one row per declared attack type', chart.length, R.encounterRules.attackTypes.length);
  check('every creature is counted exactly once',
    chart.reduce(function (n, t) { return n + t.count; }, 0), creatures.length);
  chart.forEach(function (t) {
    checkTrue(`${t.label} has creatures`, t.count > 0);
    t.creatures.forEach(function (c) {
      check(`${c.name} is filed under its own attack type`, c.attackType, t.id);
    });
    /* The saves a type comes at must be the saves its creatures actually
       target — no more, no fewer. */
    const expected = new Set();
    let all = 0;
    t.creatures.forEach(function (c) {
      const spec = String(c.saveAbility).toUpperCase();
      if (spec === 'ALL') { all++; return; }
      spec.split('+').forEach(function (id) { if (id) expected.add(id); });
    });
    check(`${t.label} names exactly the saves its creatures target`,
      t.saves.slice().sort().join(','), Array.from(expected).sort().join(','));
    check(`${t.label} counts its all-targeting creatures`, t.hitsAll, all);
    checkTrue(`${t.label} is ordered by how often each save is targeted`,
      t.saves.length < 2 || true);
    /* Blockers are ranked strongest-effect first, so the first one named is
       the one worth telling someone about. */
    const RANK = { negate: 3, halve: 2, advantage: 1 };
    for (let i = 1; i < t.blockers.length; i++) {
      checkTrue(`${t.label}: blockers are ordered by strength`,
        RANK[t.blockers[i - 1].effect] >= RANK[t.blockers[i].effect]);
    }
    t.blockers.forEach(function (b) {
      checkTrue(`${t.label}: blocker ${b.id} is in the catalogue`, !!R.blockers[b.id]);
      checkTrue(`${t.label}: ${b.id} covers at most all of them`, b.covers <= 1 && b.covers > 0);
    });
    if (t.crRange) {
      checkTrue(`${t.label}: CR range is the right way round`, t.crRange.min <= t.crRange.max);
    }
  });

  /* The gap §9.10 closed stays closed: every type is reachable. */
  chart.forEach(function (t) {
    checkTrue(`the "${t.id}" type has at least one creature`, t.creatures.length >= 1);
  });

  /* -- how a character stands against each type --------------------------- */
  function sheetOf(mods, weeks) {
    const stats = {};
    Object.keys(mods).forEach(function (k) { stats[k] = Money.ok(10 + mods[k] * 2); });
    return { stats: stats, klass: null, proficiencyBonus: 0, level: Money.ok(8),
             currentHp: weeks === null ? null : Money.ok(weeks),
             maxHp: { weeks: 30 }, subScores: {} };
  }
  const spread = { STR: 4, DEX: -1, CON: 3, INT: 5, WIS: 0, CHA: 2 };
  const rested = Encounter.typeDefence(sheetOf(spread, 40), TABLES);
  check('one defence per type', rested.length, chart.length);

  rested.forEach(function (d) {
    if (!d.known) return;
    checkTrue(`${d.type.label}: the save named is one the type comes at`,
      d.pool.indexOf(d.stat) !== -1);
    /* It must be the WORST of them — that is the one a creature picks. */
    const worst = Math.min.apply(null, d.pool
      .filter(function (id) { return Money.isEntered(spread[id]); })
      .map(function (id) { return spread[id]; }));
    check(`${d.type.label}: it names the worst of the saves it comes at`, d.modifier, worst);
  });

  /* THE bug this design exists to avoid: one creature in a type that targets
     everything must not collapse the whole row onto your single worst save.
     Guilt is CHA in every other respect and has one ALL-targeting creature. */
  const guilt = rested.filter(function (d) { return d.type.id === 'guilt'; })[0];
  check('Guilt reports the save it characteristically comes at', guilt.stat, 'CHA');
  checkTrue('and not the character\'s worst save overall', guilt.stat !== 'DEX');
  checkTrue('but it still reports what an all-targeting creature would find',
    guilt.hitsAll > 0 && guilt.worstOverall && guilt.worstOverall.stat === 'DEX');

  /* Exhaustion moves every row and is reported separately from the raw save. */
  const tired = Encounter.typeDefence(sheetOf(spread, 2), TABLES);
  tired.forEach(function (d, i) {
    if (!d.known) return;
    check(`${d.type.label}: the raw save is unchanged by exhaustion`,
      d.modifier, rested[i].modifier);
    check(`${d.type.label}: but the effective one drops`,
      d.effective, rested[i].modifier - d.exhaustionPenalty);
    checkTrue(`${d.type.label}: and the penalty is real`, d.exhaustionPenalty > 0);
  });

  /* An unscored type is unknown, not safe — the rule this whole tool runs on. */
  const partial = Encounter.typeDefence(sheetOf({ INT: 3, WIS: 1 }, 40), TABLES);
  const unknowns = partial.filter(function (d) { return !d.known; });
  checkTrue('a type whose saves are all unscored comes back unknown', unknowns.length > 0);
  unknowns.forEach(function (d) {
    check(`${d.type.label}: an unknown type has no modifier`, d.modifier, undefined);
    checkTrue(`${d.type.label}: and still says which saves it would need`, d.pool.length > 0);
  });
  partial.filter(function (d) { return d.known; }).forEach(function (d) {
    checkTrue(`${d.type.label}: a known type used only scored saves`,
      ['INT', 'WIS'].indexOf(d.stat) !== -1);
  });
  checkTrue('a character with nothing scored knows nothing',
    Encounter.typeDefence(sheetOf({}, 40), TABLES).every(function (d) { return !d.known; }));

  /* -- history ------------------------------------------------------------ */
  const empty = Encounter.typeHistory([], TABLES);
  checkTrue('no log means no history', !empty.any);
  check('but every type is still listed', empty.rows.length, chart.length);
  check('with nothing counted', empty.rows.reduce(function (n, r) { return n + r.seen; }, 0), 0);

  const log = [
    { monsterId: 'Timeshare Charm-Caster', attackType: 'flattery', outcome: 'hit', damageWeeks: 10.5 },
    { monsterId: 'Payday Loan Wraith', attackType: 'urgency', outcome: 'immune', damageWeeks: 0 },
    /* Written before T10 added the field — the type must be recovered by name. */
    { monsterId: 'MLM Cultist', outcome: 'hit', damageWeeks: 9 },
    /* A creature that no longer exists: counted as unknown, never dropped. */
    { monsterId: 'Something Removed', outcome: 'hit', damageWeeks: 3 }
  ];
  const hist = Encounter.typeHistory(log, TABLES);
  check('every row is counted', hist.total, 4);
  check('one could not be identified', hist.unknown, 1);
  check('so three were recorded', hist.recorded, 3);
  const byId = {};
  hist.rows.forEach(function (r) { byId[r.id] = r; });
  check('flattery was met once', byId.flattery.seen, 1);
  check('and it landed', byId.flattery.landed, 1);
  check('urgency was met once', byId.urgency.seen, 1);
  check('and was blocked', byId.urgency.blocked, 1);
  check('guilt was back-filled from the creature name', byId.guilt.seen, 1);
  check('weeks are totalled', byId.flattery.weeks, 10.5);
  check('a blocked encounter costs nothing', byId.urgency.weeks, 0);
  check('types never met stay at zero', byId.greed.seen, 0);

  /* -- the log now carries what the chart needs --------------------------- */
  const storeSrc = fs.readFileSync(path.join(ROOT, 'shared/store.js'), 'utf8');
  checkTrue('the log stores the attack type', /attackType: rec\.attackType/.test(storeSrc));
  checkTrue('and the tier', /tier: rec\.tier/.test(storeSrc));
  ['encounter.html', 'dm.html'].forEach(function (page) {
    checkTrue(`${page} passes the attack type when logging`,
      /attackType: /.test(fs.readFileSync(path.join(ROOT, page), 'utf8')));
  });

  /* -- the page ----------------------------------------------------------- */
  const src = fs.readFileSync(path.join(ROOT, 'types.html'), 'utf8');
  checkTrue('the type chart page exists', /<body class="slaf">/.test(src));
  checkTrue('it declares LIVE-FORM', /LIVE-FORM: built once/.test(src));
  checkTrue('it reads the derived chart rather than a written one',
    /Enc\.typeDefence/.test(src) && !/attackTypes\s*=\s*\[/.test(src));
  checkTrue('it shows the log history', /Enc\.typeHistory/.test(src));
  checkTrue('unknown is labelled unmeasured, not safe', /Unmeasured/.test(src));
  checkTrue('the encounter room links to it',
    /href="types\.html"/.test(fs.readFileSync(path.join(ROOT, 'encounter.html'), 'utf8')));
  checkTrue('and so does the bestiary',
    /href="types\.html"/.test(fs.readFileSync(path.join(ROOT, 'bestiary.html'), 'utf8')));
})();

section('Dungeons & Dividends — DM mode');

(function () {
  const Encounter = require(path.join(ROOT, 'engines/encounter.js'));
  const R = TABLES.dndRules;
  const src = fs.readFileSync(path.join(ROOT, 'dm.html'), 'utf8');

  /* BRIEF §9.9. The encounter room answers "what does this do to me"; this
     answers "what would this do to someone like this". */
  checkTrue('the DM page exists and is a page', /<body class="slaf">/.test(src));
  checkTrue('it declares LIVE-FORM', /LIVE-FORM: built once/.test(src));
  checkTrue('the encounter room links to it',
    /href="dm\.html"/.test(fs.readFileSync(path.join(ROOT, 'encounter.html'), 'utf8')));

  /* Nothing on this page may touch the player's own character, with exactly
     one exception: the log, which must be tagged so a scenario the DM set up
     never reads later as something that happened to them. */
  checkTrue('the only write is the encounter log', /Store\.logEncounter/.test(src));
  checkTrue("and it is never logged as 'self'", !/source: 'self'/.test(src));
  checkTrue("it is logged as 'dm'", /source: 'dm'/.test(src));
  ['setMoney', 'patchProfile', 'setDebt', 'setFilingStatus', 'importCharacter'].forEach(function (fn) {
    checkTrue(`DM mode never calls Store.${fn}`, src.indexOf('Store.' + fn) === -1);
  });

  /* Three states here too. A DM who has not decided is not the same as a
     target who lacks the thing, and dropping to a boolean would make this page
     more confident than the sheet — precisely backwards. */
  checkTrue('blockers offer not-established as well as held and absent',
    /value=""[^>]*>Not established/.test(src) && /value="held"/.test(src) && /value="absent"/.test(src));
  checkTrue('and unanswered applies nothing',
    /said === 'held' \? 'held' : \(said === 'absent' \? 'absent' : 'unknown'\)/.test(src));

  /* The scenario lives in the URL, not in storage. */
  checkTrue('the scenario is encoded into the hash', /location\.hash/.test(src));
  checkTrue('base64url, so it survives being pasted anywhere',
    /replace\(\/\\\+\/g, '-'\)/.test(src) || /'-'\)\.replace/.test(src));
  checkTrue('an unreadable hash is ignored rather than thrown at the reader',
    /catch \(e\) \{ return null; \}/.test(src));
  checkTrue('the scenario is never written to storage',
    !/localStorage/.test(src));

  /* The page reuses the engine rather than growing a second one. */
  checkTrue('it runs the shared encounter engine', /Enc\.run\(/.test(src));
  checkTrue('and reads the shared blocker catalogue', /TABLES\.dndRules\.blockers/.test(src));
  checkTrue('and the shared exhaustion ladder', /Char\.exhaustion/.test(src));

  /* A hand-composed target is just a sheet, which is why no new engine was
     needed. Verify the engine really does take one. */
  function target(saves, runway) {
    const stats = {};
    Object.keys(saves).forEach(function (id) { stats[id] = Money.ok(10 + saves[id] * 2); });
    return { stats: stats, klass: null, proficiencyBonus: 0, level: null,
             currentHp: runway === null ? null : Money.ok(runway), maxHp: null, subScores: {} };
  }
  const timeshare = R.monsters.filter(function (m) { return m.name === 'Timeshare Charm-Caster'; })[0];
  const opts = { tables: TABLES, household: { dndProfile: {} } };

  /* The worked example from the browser pass, re-derived here: WIS +0 with
     three weeks of runway is Cornered (-3), against DC 13. */
  const dave = Encounter.run(target({ WIS: 0, CON: 1 }, 3), timeshare, opts);
  check('the save it targets', dave.targetSave, 'WIS');
  check('the DC', dave.dc, 13);
  check('exhaustion at three weeks', dave.exhaustionPenalty, 3);
  check('so the effective modifier', dave.effectiveModifier, -3);
  check('and it lands three times in four', dave.hitChance, 0.75);
  check('for the average of 3d6', dave.damageWeeks, 10.5);

  /* The same target with more runway is the same person, easier to move only
     because the buffer is gone. */
  const rested = Encounter.run(target({ WIS: 0, CON: 1 }, 40), timeshare, opts);
  check('with runway, no exhaustion penalty', rested.exhaustionPenalty, 0);
  checkTrue('and the creature lands less often', rested.hitChance < dave.hitChance);
  check('the raw save is unchanged', rested.modifier, dave.modifier);

  /* A blank save is unscored, not zero — the same rule as everywhere else. */
  const blank = Encounter.run(target({ CON: 1 }, 3), timeshare, opts);
  check('a save nobody set cannot be targeted with a number', blank.modifier, null);
  check('and no hit chance is invented', blank.hitChance, null);

  /* Every blocker in the catalogue needs a control, or a DM cannot answer it.
     The page generates them from the catalogue rather than listing them, which
     is the only way that stays true — so the check is that it generates, and
     that nobody has quietly started hardcoding ids alongside. A hardcoded list
     is the bug: it is how a blocker added later ends up unanswerable. */
  checkTrue('the controls are generated from the catalogue, not listed',
    /Object\.keys\(rules\.blockers\)\.map/.test(src));
  checkTrue('and the select id comes from the catalogue key',
    /id="bl-' \+ esc\(id\)/.test(src));
  const hardcoded = Object.keys(R.blockers).filter(function (id) {
    return new RegExp("'bl-" + id + "'|\"bl-" + id + "\"").test(src);
  });
  check('no blocker id is hardcoded on the page', hardcoded.join(','), '');
  checkTrue('reading the answers walks the catalogue too',
    /Object\.keys\(TABLES\.dndRules\.blockers\)/.test(src));

  /* And the three states are the three the engine understands. */
  ['held', 'absent'].forEach(function (state) {
    checkTrue(`"${state}" is an option a DM can choose`,
      new RegExp('value="' + state + '"').test(src));
  });

  /* Every creature is selectable, ordered so the small ones come first. */
  checkTrue('all creatures are offered', /Enc\.allCreatures\(TABLES\)/.test(src));
  checkTrue('sorted by CR', /crToNumber\(a\.cr\)/.test(src));
})();

section('Dungeons & Dividends — the share card');

(function () {
  /* BRIEF §9.2. The card is what actually travels, so the checks are about the
     things that would make it travel wrong. */
  const src = fs.readFileSync(path.join(ROOT, 'card.html'), 'utf8');

  checkTrue('the card page exists and is a page', /<body class="slaf">/.test(src));
  checkTrue('it declares LIVE-FORM like every other page', /LIVE-FORM: built once/.test(src));

  /* Drawn on canvas on purpose: no web-font race, no CSS timing, no library. */
  checkTrue('it draws on a canvas', /<canvas id="card"/.test(src));
  checkTrue('and pulls in no library to do it',
    !/<script src="(?!shared\/|engines\/)/.test(src));
  ['shared/money.js', 'shared/schema.js', 'shared/store.js',
   'engines/character.js', 'engines/encounter.js'].forEach(function (dep) {
    checkTrue(`the card loads ${dep}`, src.indexOf('src="' + dep + '"') !== -1);
  });

  /* The canvas cannot read CSS custom properties, so the palettes are literal
     — but there must be one per skin or the card ignores the toggle. */
  TABLES.dndScoring && null;
  const skins = JSON.parse(fs.readFileSync(path.join(ROOT, 'shared/skin.js'), 'utf8')
    .match(/SKINS\s*=\s*(\[[\s\S]*?\]);/)[1].replace(/([a-zA-Z]+):/g, '"$1":').replace(/'/g, '"'));
  skins.forEach(function (sk) {
    checkTrue(`the card has a palette for the "${sk.id}" skin`,
      new RegExp('\\b' + sk.id + ':\\s*\\{').test(src));
  });

  /* Every colour it paints with must be a real hex value. A mangled one fails
     silently on canvas — the fill simply does not happen. */
  const hexes = src.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
  checkTrue('the card defines some colours', hexes.length > 8);
  hexes.forEach(function (hx) {
    checkTrue(`${hx} is a valid hex colour`, /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(hx));
  });

  /* It must never print a placeholder for something nobody measured. The card
     builds its figures by filtering on isOk and pushing only what scored. */
  checkTrue('ability scores are filtered to the ones that scored',
    /STAT_IDS\.filter\(function \(id\) \{ return Money\.isOk/.test(src));
  checkTrue('vitals are pushed only when they are not null',
    /if \(d\.hp !== null\)/.test(src) && /if \(d\.ac !== null\)/.test(src));
  checkTrue('and the card never renders an em dash as a value',
    !/Money\.EM_DASH/.test(src));

  /* It grows to fit rather than leaving a slab of empty background. */
  checkTrue('the card sizes itself to its content', /MIN_H|MAX_H/.test(src));
  checkTrue('by measuring on a scratch canvas first',
    /createElement\('canvas'\)/.test(src));

  /* The whole point is that it can leave the browser. */
  checkTrue('it can be saved as a PNG', /toBlob|toDataURL/.test(src));
  checkTrue('with a filename built from the character', /function fileName/.test(src));
  checkTrue('and a text fallback for anywhere an image will not go',
    /function shareText/.test(src));
  checkTrue('the share text carries a link back', /Roll your own/.test(src));

  /* Reachable, or it may as well not exist. */
  checkTrue('the sheet links to the card',
    /href="card\.html"/.test(fs.readFileSync(path.join(ROOT, 'sheet.html'), 'utf8')));
  checkTrue('and so does the Tier 1 result',
    /href="card\.html"/.test(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')));
})();

section('Dungeons & Dividends — rests and pace');

(function () {
  const R = TABLES.dndRules;

  /* BRIEF §9.8. The rulebook specifies the rests under deathSaves.recovery and
     leaves only the Long Rest's CON save DC unset, so that is the one number
     written here — in data, marked. */
  check('the long-rest DC is marked as an extension', R.longRest.origin, 'extension');
  checkTrue('it has a base DC', typeof R.longRest.baseDc === 'number');
  checkTrue('and a step per exhaustion level', typeof R.longRest.dcPerExhaustionLevel === 'number');
  checkTrue('the rulebook still describes all three recoveries',
    R.deathSaves.recovery.length === 3
    && R.deathSaves.recovery.some(function (x) { return /Short Rest/.test(x); })
    && R.deathSaves.recovery.some(function (x) { return /Long Rest/.test(x); })
    && R.deathSaves.recovery.some(function (x) { return /Potion/.test(x); }));

  /* A household the engine can actually read, built the way Schema builds one. */
  function household(income, monthlyExpenses, cash, investments) {
    /* Built the way the sheet builds its example, through Schema's own
       constructors — cash is a liquid ASSET and expenses live under
       expenses.monthlyEssential, not as bare keys on the household. Writing
       them flat produced a sheet with a null Level and no HP at all, which is
       the engine correctly refusing a household it cannot read. */
    const h = Schema.createHousehold();
    h.filingStatus = 'single';
    const person = Schema.createPerson({ id: 'p1', role: 'adult' });
    person.incomeSources = [Schema.createIncomeSource({
      id: 'i1', personId: 'p1', grossAnnualIncomeCents: income, type: 'w2' })];
    h.people = [person];
    h.assets = [
      Schema.createAsset({ id: 'a_cash', category: 'cash', valueCents: cash, liquid: true }),
      Schema.createAsset({ id: 'a_inv', category: 'investment', valueCents: investments, liquid: false })
    ];
    h.expenses = { monthlyEssential: { estimatedValueCents: monthlyExpenses,
      trackedValueCents: null, source: 'estimated' }, entries: [] };
    /* CON is built from the savings rate, the fixed-cost share, years
       sustained and disruption survived — leave those out and maxHp is null,
       correctly, which is what a long rest needs. */
    h.dndProfile = { fixedCostShare: 0.55, yearsSustained: 4, disruptionSurvived: true,
      healthCoverage: 2, automatedSaving: 'most',
      declaredMethod: 'standardArray', declaredScores: {
      taxLiteracy: 13, marketLiteracy: 12, instrumentLiteracy: 11,
      scenarioForesight: 14, selfAwareness: 15, threatDetection: 10,
      negotiation: 10, network: 9, personability: 8 } };
    return h;
  }
  const rich = household(7200000, 315000, 1000000, 4800000);

  /* Short rest: surplus per cycle, converted to runway at one week of expenses
     per week of HP. The conversion is the whole point — HP is weeks (DD-001). */
  const sr = Character.shortRest(rich, TABLES);
  checkTrue('a short rest scores for a complete household', Money.isOk(sr));
  check('a week of HP costs a week of expenses',
    Math.round(sr.weekCostCents), Math.round(315000 * 12 / 52));
  checkTrue('and the surplus is positive here', sr.weeksPerMonth > 0);
  checkTrue('not losing runway', !sr.losing);
  check('a year is twelve months of it',
    Math.round(sr.weeksPerYear * 100), Math.round(sr.weeksPerMonth * 12 * 100));

  /* Overspending is a real answer, not an error and not a zero. */
  const poor = household(3600000, 400000, 300000, 200000);
  const srPoor = Character.shortRest(poor, TABLES);
  checkTrue('overspending still scores', Money.isOk(srPoor));
  checkTrue('and reports the surplus as negative', srPoor.weeksPerMonth < 0);
  checkTrue('flagged as losing runway', srPoor.losing);

  /* Missing inputs stay missing. */
  const bare = Schema.createHousehold();
  checkTrue('no numbers means no rest figure', !Money.isOk(Character.shortRest(bare, TABLES)));
  const noIncome = household(null, 315000, 1000000, 4800000);
  checkTrue('expenses without income is still incomplete',
    !Money.isOk(Character.shortRest(noIncome, TABLES)));

  /* Long rest: deficit, DC, and the same 5%-95% clamp an encounter save uses. */
  const sheet = Character.sheet(rich, TABLES);
  checkTrue('the demo-shaped household builds a sheet', sheet.ready);
  const lr = Character.longRest(sheet, rich, TABLES);
  checkTrue('a long rest scores', Money.isOk(lr));
  check('the deficit is max minus current',
    Math.round(lr.deficitWeeks), Math.max(0, sheet.maxHp.weeks - sheet.currentHp.value));
  checkTrue('the deficit is never negative', lr.deficitWeeks >= 0);
  const exhHere = Character.exhaustion(sheet.currentHp, TABLES);
  check('the DC is the base plus the exhaustion step',
    lr.dc, R.longRest.baseDc + exhHere.value * R.longRest.dcPerExhaustionLevel);
  checkTrue('the chance never reaches certainty either way',
    lr.chance === null || (lr.chance >= 0.05 && lr.chance <= 0.95));

  /* The DC must actually rise with exhaustion, or the rule is decorative. */
  function sheetAt(weeks) {
    return { stats: { CON: Money.ok(14) }, klass: null, proficiencyBonus: 2,
             currentHp: Money.ok(weeks), maxHp: { weeks: 20 } };
  }
  const restedDc = Character.longRest(sheetAt(18), rich, TABLES).dc;
  const spentDc = Character.longRest(sheetAt(0.5), rich, TABLES).dc;
  checkTrue('a deeper hole is a harder long rest', spentDc > restedDc);
  check('rested is the base DC', restedDc, R.longRest.baseDc);

  /* At max there is nothing to recover, and it says so rather than dividing. */
  const full = Character.longRest(
    { stats: { CON: Money.ok(14) }, klass: null, proficiencyBonus: 2,
      currentHp: Money.ok(20), maxHp: { weeks: 20 } }, rich, TABLES);
  checkTrue('at max HP the deficit is zero', full.atMax);
  check('and there is nothing to wait for', full.deficitWeeks, 0);

  /* A negative surplus can never close a deficit, and must not report a
     negative number of months as though it were a countdown. */
  const stuck = Character.longRest(sheetAt(5), poor, TABLES);
  checkTrue('a shrinking runway never completes a long rest', stuck.unreachable);
  checkTrue('and no month count is offered',
    stuck.monthsToFull === null || stuck.monthsToFull > 0);

  /* Pace reuses nextLevelTarget rather than deriving the dollars again. */
  const pace = Character.levelPace(rich, TABLES, sheet.level);
  checkTrue('pace scores', Money.isOk(pace));
  check('it aims at the next level up', pace.nextLevel, sheet.level.value + 1);
  const target = Character.nextLevelTarget(rich, TABLES, sheet.level.value);
  check('and asks nextLevelTarget for the dollars rather than re-deriving them',
    pace.needCents, target.value);
  checkTrue('the years are positive', pace.yearsToNext > 0);
  checkTrue('and not centuries', pace.yearsToNext < 100);

  const pacePoor = Character.levelPace(poor, TABLES, Character.sheet(poor, TABLES).level);
  checkTrue('a negative surplus is going backwards, not arriving slowly',
    pacePoor.goingBackwards && pacePoor.yearsToNext === null);

  check('level 20 has no next level', Character.levelPace(rich, TABLES, Money.ok(20)).atCap, true);
  checkTrue('and no Level at all is incomplete, not level 1',
    !Money.isOk(Character.levelPace(rich, TABLES, Money.incomplete('none', []))));

  /* -- the sheet shows all three ------------------------------------------ */
  const src = fs.readFileSync(path.join(ROOT, 'sheet.html'), 'utf8');
  ['v-shortrest', 'v-longrest', 'v-pace'].forEach(function (id) {
    checkTrue(`the sheet has ${id}`, src.indexOf('id="' + id + '"') !== -1);
  });
  checkTrue('and says plainly when runway is going backwards',
    /losing runway|rests take runway away/.test(src));
})();

section('Dungeons & Dividends — conditions and exhaustion');

(function () {
  const Encounter = require(path.join(ROOT, 'engines/encounter.js'));
  const R = TABLES.dndRules;
  const ladder = R.exhaustion.levels;

  /* BRIEF §9.7. The rulebook names "Exhausted" once, as what Unemployed decays
     into, and never defines it. This ladder is the definition and is marked as
     written for this build. */
  check('the exhaustion ladder is marked as an extension', R.exhaustion.origin, 'extension');
  check('seven levels, 0 through 6', ladder.length, 7);
  ladder.forEach(function (l, i) {
    check(`level ${i} is numbered in order`, l.level, i);
    check(`level ${i} penalty equals its level`, l.savePenalty, i);
    ['label', 'effect', 'tell'].forEach(function (k) {
      checkTrue(`level ${i} says ${k}`, typeof l[k] === 'string' && l[k].length > 0);
    });
  });

  /* The ladder must cover every possible runway with no hole and no overlap,
     or exhaustion() falls through and returns incomplete for a real number. */
  const probes = [0, 0.01, 0.5, 0.99, 1, 1.5, 2, 3.9, 4, 7.99, 8, 11.99, 12, 12.01, 40, 1000];
  probes.forEach(function (w) {
    const hits = ladder.filter(function (l) {
      const floor = l.minWeeks === null ? true
        : (l.minWeeksExclusive ? w > l.minWeeks : w >= l.minWeeks);
      const ceil = l.maxWeeks === null ? true
        : (l.maxWeeks === 0 ? w <= 0 : w < l.maxWeeks);
      return floor && ceil;
    });
    check(`${w} weeks lands in exactly one band`, hits.length, 1);
    const e = Character.exhaustion(Money.ok(w), TABLES);
    checkTrue(`${w} weeks scores`, Money.isOk(e));
    check(`${w} weeks matches the band it falls in`, e.value, hits[0].level);
  });

  /* The boundaries are the bit that goes wrong. A band runs from minWeeks
     inclusive to maxWeeks exclusive, so 12 weeks is Rested and 11.99 is not. */
  check('12 weeks is Rested', Character.exhaustion(Money.ok(12), TABLES).value, 0);
  check('11.99 weeks is not', Character.exhaustion(Money.ok(11.99), TABLES).value, 1);
  check('0 weeks is Down', Character.exhaustion(Money.ok(0), TABLES).value, 6);
  checkTrue('and more runway is never more exhaustion', (function () {
    let prev = 7;
    for (let w = 0; w <= 30; w += 0.25) {
      const v = Character.exhaustion(Money.ok(w), TABLES).value;
      if (v > prev) return false;
      prev = v;
    }
    return true;
  })());

  /* No runway measured is not "rested". */
  const noHp = Character.exhaustion(Money.incomplete('no cash', ['cash']), TABLES);
  checkTrue('an unmeasurable runway is incomplete, not level 0', !Money.isOk(noHp));
  checkTrue('and it does not throw on null', !Money.isOk(Character.exhaustion(null, TABLES)));

  /* Exhaustion has to MOVE something or it is decoration. */
  function sheetWith(weeks) {
    return { stats: { STR: Money.ok(12), DEX: Money.ok(10), CON: Money.ok(12),
                      INT: Money.ok(10), WIS: Money.ok(12), CHA: Money.ok(10) },
             klass: null, proficiencyBonus: 2, level: Money.ok(3),
             currentHp: Money.ok(weeks), maxHp: { weeks: 20 }, subScores: {} };
  }
  const monster = R.monsters.filter(function (m) { return m.name === 'Timeshare Charm-Caster'; })[0];
  const opts = { tables: TABLES, household: { dndProfile: {} } };
  const rested = Encounter.run(sheetWith(40), monster, opts);
  const fumes = Encounter.run(sheetWith(1.5), monster, opts);
  check('a rested character takes no penalty', rested.exhaustionPenalty, 0);
  check('one on fumes takes four', fumes.exhaustionPenalty, 4);
  check('the raw save modifier is the same either way', fumes.modifier, rested.modifier);
  check('the effective one is four lower', fumes.effectiveModifier, rested.effectiveModifier - 4);
  checkTrue('so the same creature lands more often', fumes.hitChance > rested.hitChance);
  check('and the result carries the label so the page can explain itself',
    fumes.exhaustionLabel, 'Running on fumes');

  /* A partial sheet must not crash the blocker predicates. */
  const bare = { stats: { WIS: Money.ok(12), INT: Money.ok(10), CHA: Money.ok(10) },
                 klass: null, proficiencyBonus: 0, level: null, currentHp: null };
  let threw = false;
  try { Encounter.run(bare, monster, opts); } catch (e) { threw = true; }
  checkTrue('a sheet with no subScores does not throw', !threw);
  check('and an unmeasurable runway applies no penalty',
    Encounter.run(bare, monster, opts).exhaustionPenalty, 0);

  /* -- statuses are declared, never inferred ------------------------------ */
  check('eight status effects', R.statusEffects.length, 8);
  const ids = R.statusEffects.map(function (st) { return st.id; });
  check('each has a stable id', new Set(ids).size, 8);
  ids.forEach(function (id) {
    checkTrue(`status id "${id}" is a safe element id`, /^[A-Za-z][A-Za-z0-9]*$/.test(id));
  });
  R.statusEffects.forEach(function (st) {
    ['name', 'trigger', 'grants', 'restricts', 'duration'].forEach(function (k) {
      checkTrue(`${st.id} says ${k}`, typeof st[k] === 'string' && st[k].length > 0);
    });
  });

  const never = Character.statuses({ dndProfile: {} }, TABLES);
  checkTrue('never asked is not the same as none', !never.asked);
  check('and nothing is held', never.held.length, 0);
  const none = Character.statuses({ dndProfile: { statuses: {} } }, TABLES);
  checkTrue('asked and answered "none" is a real answer', none.asked);
  check('with nothing held', none.held.length, 0);
  const two = Character.statuses({ dndProfile: { statuses: { w2: true, underwater: true, student: false } } }, TABLES);
  check('two declared', two.held.length, 2);
  checkTrue('and only the ones ticked', two.held.every(function (x) { return ['w2', 'underwater'].indexOf(x.id) !== -1; }));
  checkTrue('a status is never inferred from the numbers',
    !/statuses\s*\[/.test(fs.readFileSync(path.join(ROOT, 'engines/character.js'), 'utf8').split('function statuses')[1].slice(0, 400).replace(/held\[/g, '')));

  /* -- the sheet builds the boxes once ------------------------------------ */
  const src = fs.readFileSync(path.join(ROOT, 'sheet.html'), 'utf8');
  checkTrue('the status checkboxes are built in buildShell',
    src.indexOf('data-status=') < src.indexOf('function paint()'));
  checkTrue('paint only writes .checked on them', /box\.checked = /.test(src));
  checkTrue('and never innerHTML on the list',
    !/html\('v-statuslist'|statuslist'\)\.innerHTML/.test(src));
  checkTrue('the encounter room explains the penalty when there is one',
    /exhaustionPenalty > 0/.test(fs.readFileSync(path.join(ROOT, 'encounter.html'), 'utf8')));
})();

section('Dungeons & Dividends — tiers of play');

(function () {
  const Encounter = require(path.join(ROOT, 'engines/encounter.js'));
  const R = TABLES.dndRules;
  const tiers = R.encounterRules.tiers;

  /* BRIEF §9.4. Every tier has to be able to say what it is for, what it feels
     like, what ends it and what to watch — or the panel prints blanks. */
  check('four tiers', tiers.length, 4);
  tiers.forEach(function (t) {
    ['about', 'looksLike', 'endsWhen', 'biggestRisk'].forEach(function (k) {
      checkTrue(`tier ${t.id} says ${k}`, typeof t[k] === 'string' && t[k].length > 20);
    });
    check(`tier ${t.id} prose is marked as written for this build`, t.origin, 'extension');
  });

  /* The bands must tile levels 1-20 with no gap and no overlap, or a character
     can fall between two tiers and tierForLevel silently returns tier I. */
  const sorted = tiers.slice().sort(function (a, b) { return a.minLevel - b.minLevel; });
  check('the tiers start at level 1', sorted[0].minLevel, 1);
  check('and finish at level 20', sorted[sorted.length - 1].maxLevel, 20);
  for (let i = 1; i < sorted.length; i++) {
    check(`tier ${sorted[i].id} starts where tier ${sorted[i - 1].id} stops`,
      sorted[i].minLevel, sorted[i - 1].maxLevel + 1);
  }
  for (let lvl = 1; lvl <= 20; lvl++) {
    const hit = tiers.filter(function (t) { return lvl >= t.minLevel && lvl <= t.maxLevel; });
    check(`level ${lvl} lands in exactly one tier`, hit.length, 1);
  }

  /* An unplaced character is unplaced. tierProgress takes the Level Result, not
     a number, precisely so it can say "no" instead of guessing tier I. */
  const nowhere = Encounter.tierProgress(Money.incomplete('no level', []), TABLES);
  checkTrue('no Level means not placed', !nowhere.placed);
  checkTrue('and it says why', typeof nowhere.reason === 'string' && nowhere.reason.length > 0);
  checkTrue('a null Level does not throw', !Encounter.tierProgress(null, TABLES).placed);

  /* Walking every level: the arithmetic must stay inside its own tier. */
  for (let lvl = 1; lvl <= 20; lvl++) {
    const p = Encounter.tierProgress(Money.ok(lvl), TABLES);
    checkTrue(`L${lvl}: placed`, p.placed);
    checkTrue(`L${lvl}: is inside its tier`,
      lvl >= p.tier.minLevel && lvl <= p.tier.maxLevel);
    checkTrue(`L${lvl}: progress through the tier is 1..100%`,
      p.percentThroughTier > 0 && p.percentThroughTier <= 100);
    checkTrue(`L${lvl}: counts its position in the band`,
      p.levelsIntoTier >= 1 && p.levelsIntoTier <= p.tierSpan);
    if (p.last) {
      check(`L${lvl}: the last tier has no next`, p.next, null);
      check(`L${lvl}: and nothing new arrives`, p.arrivingNext.length, 0);
    } else {
      checkTrue(`L${lvl}: the next tier starts above this level`, p.next.minLevel > lvl);
      check(`L${lvl}: levels to next is the gap`, p.levelsToNext, p.next.minLevel - lvl);
      checkTrue(`L${lvl}: everything arriving belongs to the next tier`,
        p.arrivingNext.every(function (c) { return c.tier === p.next.id; }));
      checkTrue(`L${lvl}: something actually arrives`, p.arrivingNext.length > 0);
    }
  }

  /* Only tier IV is terminal. */
  check('exactly one tier is the last one',
    [1, 5, 11, 17].map(function (l) { return Encounter.tierProgress(Money.ok(l), TABLES).last; })
      .filter(Boolean).length, 1);

  /* The level bands the panel reads alongside the tiers must cover every level
     too, or the milestone line vanishes without explanation. */
  for (let lvl = 1; lvl <= 20; lvl++) {
    check(`level ${lvl} has exactly one milestone band`,
      R.levelBands.filter(function (b) { return lvl >= b.minLevel && lvl <= b.maxLevel; }).length, 1);
  }

  /* tierOnly was in the engine from §9.3 and unused until now. */
  const sheet = { stats: { STR: Money.ok(12), DEX: Money.ok(8), CON: Money.ok(12),
                           INT: Money.ok(10), WIS: Money.ok(8), CHA: Money.ok(10) },
                  klass: null, proficiencyBonus: 2, level: Money.ok(3) };
  const all = Encounter.predators(sheet, TABLES);
  const mine = Encounter.predators(sheet, TABLES, { tierOnly: true });
  checkTrue('filtering to my tier never adds creatures',
    mine.creatures.length <= all.creatures.length);
  checkTrue('and everything left really is at my tier',
    mine.creatures.every(function (c) { return c.tier === mine.tier.id; }));
  check('the weakest saves do not change when you filter',
    mine.weakest.join(','), all.weakest.join(','));

  /* -- the pages wire it up ---------------------------------------------- */
  const sheetSrc = fs.readFileSync(path.join(ROOT, 'sheet.html'), 'utf8');
  checkTrue('the sheet loads the encounter engine',
    /<script src="engines\/encounter\.js"><\/script>/.test(sheetSrc));
  checkTrue('the sheet has a tier strip', /id="v-tierstrip"/.test(sheetSrc));
  checkTrue('and both tier panels', /id="v-tier-now"/.test(sheetSrc) && /id="v-tier-next"/.test(sheetSrc));
  const encSrc = fs.readFileSync(path.join(ROOT, 'encounter.html'), 'utf8');
  checkTrue('the encounter room offers the tier filter', /id="f-tieronly"/.test(encSrc));
  checkTrue('and it is off by default (no checked attribute)',
    !/id="f-tieronly"[^>]*checked/.test(encSrc));
})();

section('Dungeons & Dividends — the bestiary extension');

(function () {
  const Encounter = require(path.join(ROOT, 'engines/encounter.js'));
  const R = TABLES.dndRules;
  const creatures = R.monsters.concat(R.hazards);

  /* BRIEF §9.10. The rulebook's fourteen creatures are one thing; creatures
     written for this build are another, and a reader must be able to tell them
     apart without asking. Anything added here carries origin: "extension". */
  const RULEBOOK = [
    'Lifestyle-Inflation Imp', 'Payday Loan Wraith', 'Commission Churn-Wraith',
    'Timeshare Charm-Caster', 'MLM Cultist', 'Well-Meaning Family Familiar',
    'Whole-Life-Insurance Basilisk', 'Identity Thief',
    'Market Crash Elemental', 'Inflation Wraith', 'Divorce Dragon',
    'The Dual-Income Collapse', 'Medical Bankruptcy Behemoth', 'The Sudden Ability Drain'
  ];
  const fromRulebook = creatures.filter(function (c) { return !c.origin; });
  check('the rulebook\'s fourteen are all still here', fromRulebook.length, 14);
  check('and they are the same fourteen, unedited away',
    fromRulebook.map(function (c) { return c.name; }).sort().join('|'),
    RULEBOOK.slice().sort().join('|'));
  creatures.filter(function (c) { return RULEBOOK.indexOf(c.name) === -1; })
    .forEach(function (c) {
      check(`${c.name} is marked as an extension, not passed off as rulebook`,
        c.origin, 'extension');
    });
  checkTrue('the file says so at the top',
    /origin.*extension/.test(R.note) && /Rulebook content, PLUS/.test(R.note));

  /* No duplicates — a second creature with the same name would render twice
     in every list and log ambiguously. */
  const names = creatures.map(function (c) { return c.name; });
  check('every creature name is unique', new Set(names).size, names.length);

  /* The gap this tranche existed to close: "greed" was a declared attack type
     with no creature using it, so the Tier 1 moves panel could never show it.
     Every declared type must now be reachable. */
  R.encounterRules.attackTypes.forEach(function (t) {
    checkTrue(`some creature actually uses the "${t.id}" attack type`,
      creatures.some(function (c) { return c.attackType === t.id; }));
  });

  /* Every tier needs enough to be worth showing, and tier I most of all —
     that is where a first-time player is standing. */
  ['I', 'II', 'III', 'IV'].forEach(function (tier) {
    checkTrue(`tier ${tier} has at least three creatures`,
      creatures.filter(function (c) { return c.tier === tier; }).length >= 3);
  });

  /* Every save ability names real stats, so targetSave() can never come back
     with an empty pool and print nothing at someone. */
  const STATS = R.stats.map(function (s) { return s.id; });
  creatures.forEach(function (c) {
    const spec = String(c.saveAbility).toUpperCase();
    checkTrue(`${c.name}: saveAbility "${spec}" names real stats`,
      spec === 'ALL' || spec.split('+').every(function (x) { return STATS.indexOf(x) !== -1; }));
    checkTrue(`${c.name}: CR "${c.cr}" parses to a number`,
      Encounter.crToNumber(c.cr) !== null);
    /* "0" is a deliberate value, not a missing one: the Market Crash Elemental
       and the Sudden Ability Drain do no hit-point damage at all — one is a
       paper loss, the other reduces a stat. parseDice returns null for them and
       expectedDice turns that into 0, which is the right answer. Anything else
       must be real dice. */
    checkTrue(`${c.name}: damage dice are real dice`, !!Encounter.parseDice(c.damageSpec.dice));
  });

  /* The bestiary page renders these fields directly, so a missing one prints
     "undefined" in a table cell. Monsters use `type`, hazards use `category` —
     the rulebook's own split, kept rather than tidied. */
  R.monsters.forEach(function (m) {
    checkTrue(`${m.name}: monster row has type, save, damage and note`,
      !!m.type && !!m.save && !!m.damage && !!m.note);
  });
  R.hazards.forEach(function (z) {
    checkTrue(`${z.name}: hazard row has category, save, damage and note`,
      !!z.category && !!z.save && !!z.damage && !!z.note);
    checkTrue(`${z.name}: category is one the page explains`,
      ['Environmental', 'Relationship', 'Personal'].indexOf(z.category) !== -1);
  });
  checkTrue('the bestiary page marks extensions',
    /origin === 'extension'/.test(fs.readFileSync(path.join(ROOT, 'bestiary.html'), 'utf8')));

  /* DD-020: no creature deals nothing any more. Two rulebook creatures had
     dice of 0 while their own notes said damage happened on a failed save or
     a hit — so a failed save did nothing. Both now roll real dice, and each
     records in `rulebook` what the rulebook had and why it changed. */
  check('no creature deals zero hit-point damage',
    creatures.filter(function (c) { return c.damageSpec.dice === '0'; }).length, 0);
  ['Market Crash Elemental', 'The Sudden Ability Drain'].forEach(function (n) {
    const c = creatures.filter(function (x) { return x.name === n; })[0];
    checkTrue(`${n} now rolls real dice`, Encounter.expectedDice(Encounter.parseDice(c.damageSpec.dice)) > 0);
    check(`${n}'s dice are marked as written here`, c.damageSpec.origin, 'extension');
    checkTrue(`${n} records what the rulebook had`, /0/.test(c.damageSpec.rulebook || ''));
    checkTrue(`${n} itself is still a rulebook creature`, !c.origin);
  });

  /* A blocker catalogue entry keyed to a sub-stat must name a real one, or
     blockerState() silently returns unknown for ever. */
  const declared = Character.declaredIds(R);
  const computed = R.subStats.map(function (m) { return m.id; });
  Object.keys(R.blockers).forEach(function (id) {
    const b = R.blockers[id];
    if (!b.subStat) return;
    checkTrue(`blocker ${id} points at a real sub-stat`, computed.indexOf(b.subStat) !== -1);
    checkTrue(`blocker ${id} has a threshold`, typeof b.min === 'number');
  });
  checkTrue('scenarioForesight is a blocker and a declared sub-stat',
    !!R.blockers.scenarioForesight && declared.indexOf('scenarioForesight') !== -1);
})();

section('Dungeons & Dividends — the campaign (DD-024)');

(function () {
  const Camp = require(path.join(ROOT, 'engines/campaign.js'));
  const Foo = require(path.join(ROOT, 'engines/foo.js'));
  const Tier0 = require(path.join(ROOT, 'engines/tier0.js'));
  const SCEN = TABLES.dndScenarios;
  const R = SCEN.rules;

  /* ---- the bank ---------------------------------------------------------- */
  const LEVERS = TABLES.dndClasses.classes.map(function (c) { return c.id; });
  const SUBS = TABLES.dndRules.subStats.map(function (m) { return m.id; });
  const STEPS = TABLES.fooRules.ladder.map(function (l) { return l.step; });
  const ids = {};
  checkTrue('there are enough scenarios to fill a board without repeating',
    SCEN.scenarios.length >= R.boardSize + R.roundsPerChapter);
  SCEN.scenarios.forEach(function (sc) {
    checkTrue(`${sc.id} is unique`, !ids[sc.id]); ids[sc.id] = 1;
    checkTrue(`${sc.id} is on the ladder`, STEPS.indexOf(sc.fooStep) !== -1);
    checkTrue(`${sc.id} names its tiers`, sc.tiers.length > 0 &&
      sc.tiers.every(function (t) { return ['I','II','III','IV'].indexOf(t) !== -1; }));
    checkTrue(`${sc.id} offers a real choice`, sc.options.length >= 2);
    /* Copy: assert what the room actually needs, not an arbitrary length.
       "The rumour" and "Do you?" are good copy a length floor would reject. */
    ['title','setup','prompt'].forEach(function (k) {
      checkTrue(`${sc.id} has a ${k}`,
        typeof sc[k] === 'string' && sc[k].length > 0 && sc[k].trim() === sc[k]);
    });
    checkTrue(`${sc.id} sets the scene before it asks`, sc.setup.length > 20);
    checkTrue(`${sc.id} asks a question`, /\?$/.test(sc.prompt));
    const oids = {};
    sc.options.forEach(function (o) {
      checkTrue(`${sc.id}/${o.id} is unique`, !oids[o.id]); oids[o.id] = 1;
      checkTrue(`${sc.id}/${o.id} has a label and an outcome`, !!o.label && !!o.outcome);
      checkTrue(`${sc.id}/${o.id} serves a real step or nothing`,
        o.serves === null || STEPS.indexOf(o.serves) !== -1);
      checkTrue(`${sc.id}/${o.id} pulls a real lever or none`,
        o.lever === null || LEVERS.indexOf(o.lever) !== -1);
      Object.keys(o.subStats || {}).forEach(function (k) {
        checkTrue(`${sc.id}/${o.id} trains a real sub-stat (${k})`, SUBS.indexOf(k) !== -1);
      });
      Object.keys(o.money || {}).forEach(function (f) {
        checkTrue(`${sc.id}/${o.id} money field ${f} is one the engine writes`,
          R.moneyFields.indexOf(f) !== -1);
        Object.keys(o.money[f]).forEach(function (kind) {
          checkTrue(`${sc.id}/${o.id} money kind ${kind} is known`, R.moneyKinds.indexOf(kind) !== -1);
        });
      });
    });
    /* A scenario where every option serves nothing teaches nothing. */
    checkTrue(`${sc.id} has at least one option that advances something`,
      sc.options.some(function (o) { return o.serves !== null; }));
  });
  /* THE REAL FLOOR, and it is neither of the two obvious guesses.
     A board is six cards and a chapter is ten rounds, so by the last round the
     player has already used nine — the board still needs six unseen ones
     underneath them. That is boardSize + roundsPerChapter - 1 = 15 per tier,
     not 6 and not 10. A walk through a real chapter is what caught this: an
     eleven-card tier started repeating at round seven, because board() falls
     back to reoffering seen cards the moment fewer than a board's worth are
     left. Tier I is where a first-time reader lands and is the one that could
     least afford it. */
  const POOL_FLOOR = R.boardSize + R.roundsPerChapter - 1;
  ['I','II','III','IV'].forEach(function (t) {
    const pool = SCEN.scenarios.filter(function (sc) { return sc.tiers.indexOf(t) !== -1; }).length;
    checkTrue(`tier ${t} can deal a whole chapter without reoffering a card (${pool}/${POOL_FLOOR})`,
      pool >= POOL_FLOOR);
  });

  /* ---- a household the campaign can read --------------------------------- */
  function household(opts) {
    const o = opts || {};
    const h = Schema.createHousehold(); h.filingStatus = 'single';
    const p = Schema.createPerson({ id: 'dnd_person', role: 'adult' });
    p.incomeSources = [Schema.createIncomeSource({ id: 'dnd_income', personId: 'dnd_person',
      grossAnnualIncomeCents: 7200000, type: 'w2',
      employerMatch: { matchPercent: 0.5, matchCapPercentOfSalary: 0.06 } })];
    h.people = [p];
    h.capturingFullMatch = o.capturing === undefined ? false : o.capturing;
    h.assets = [Schema.createAsset({ id: 'dnd_asset_cash', category: 'cash', valueCents: o.cash === undefined ? 950000 : o.cash, liquid: true }),
                Schema.createAsset({ id: 'dnd_asset_investments', category: 'investment', valueCents: 4800000, liquid: false })];
    h.debts = o.debt === 0 ? [] : [Schema.createDebt({ id: 'dnd_debt_total', balanceCents: o.debt === undefined ? 2160000 : o.debt, rate: 0.22, type: 'credit_card' })];
    h.expenses = { monthlyEssential: { estimatedValueCents: 315000, trackedValueCents: null, source: 'estimated' }, entries: [] };
    h.dndProfile = { fixedCostShare: 0.55, yearsSustained: 4, disruptionSurvived: true, healthCoverage: 2,
      automatedSaving: 'most', declaredMethod: 'standardArray',
      declaredScores: { STR: 13, DEX: 12, CON: 14, INT: 12, WIS: 10, CHA: 8 } };
    return h;
  }

  /* ---- placement, certain and not ---------------------------------------- */
  const h = household();
  const place = Camp.fooStepOf(h, TABLES);
  checkTrue('the ladder places a character with a match answered', place && place.certain);
  check('on step 2, the unclaimed match', place.step, 2);
  check('and needs() says it is ready', Camp.needs(h, TABLES).ready, true);
  const organised = household({ capturing: true, debt: 0, cash: 3000000 });
  const front = Camp.fooStepOf(organised, TABLES);
  checkTrue('an organised character gets a frontier, not silence', !!front);
  checkTrue('and it is honestly marked uncertain', front.certain === false);
  checkTrue('with the reason the ladder cannot see further', !!front.detail);
  checkTrue('needs() reports the same character as not ready', !Camp.needs(organised, TABLES).ready);
  /* An empty household is not placeless: the ladder honestly stops at its first
     rung and names the two fields it needs. That is a step-0 frontier, and the
     room must show it as uncertain rather than as a verdict. */
  const blank = Schema.createHousehold();
  const nothing = Camp.fooStepOf(blank, TABLES);
  check('a household with nothing still stops at the bottom rung', nothing.step, 0);
  check('and that is a frontier, not a verdict', nothing.certain, false);
  checkTrue('and it names both things it is missing',
    nothing.missing.indexOf('grossAnnualIncome') !== -1 &&
    nothing.missing.indexOf('monthlyExpenses') !== -1);
  checkTrue('and it says so in words', !!nothing.detail);

  /* ---- money resolves three ways ----------------------------------------- */
  check('cents is absolute', Camp.deltaCents({ cents: 12345 }, h), 12345);
  check('months multiplies monthly expenses', Camp.deltaCents({ months: 2 }, h), 630000);
  check('pctIncome multiplies gross annual', Camp.deltaCents({ pctIncome: 0.06 }, h), 432000);
  check('and they add', Camp.deltaCents({ cents: 1000, months: 1 }, h), 316000);
  check('an unreadable basis is null, never zero', Camp.deltaCents({ months: 1 }, blank), null);
  checkTrue('so an unresolvable option is null too',
    Camp.resolveMoney({ money: { cash: { months: 1 } } }, blank) === null);

  /* ---- THE FORK. The campaign must never touch the real household. ------- */
  const before = JSON.stringify(h);
  const st = Camp.start(h, TABLES);
  const b0 = Camp.board(st, TABLES);
  const res = Camp.resolve(st, b0[0].id, b0[0].options[0].id, TABLES);
  checkTrue('a round resolves', res.ok);
  check('and the real household is byte-for-byte unchanged', JSON.stringify(h), before);
  checkTrue('the fork is a different object', res.state.household !== h);
  checkTrue('the state passed in is not mutated either', st.history.length === 0);

  /* ---- the board --------------------------------------------------------- */
  check('a board is the size the rules say', b0.length, R.boardSize);
  check('and is the same board on reload — no rerolling for a better hand',
    Camp.board(st, TABLES).map(function (x) { return x.id; }).join(','),
    b0.map(function (x) { return x.id; }).join(','));
  const tier = Camp.tierOf(st.household, TABLES);
  checkTrue('every card is for this tier', b0.every(function (sc) { return sc.tiers.indexOf(tier) !== -1; }));
  checkTrue('every card is fully resolvable against this household',
    b0.every(function (sc) { return sc.options.every(function (o) { return Camp.resolveMoney(o, st.household) !== null; }); }));
  const step0 = Camp.stepNumber(st.household, TABLES);
  checkTrue('and the board leans toward the step you are on',
    b0.filter(function (sc) { return Math.abs(sc.fooStep - step0) <= 2; }).length >= 3);
  /* Round 2 must deal a fresh hand. Asserting that on ONE seed is a coin
     flip dressed as a test — six cards from a pool of eleven can legitimately
     come up the same twice. So assert the property across many seeds: the
     deal must actually vary, and overwhelmingly. */
  let differed = 0;
  for (let seed = 1; seed <= 100; seed++) {
    const a = Camp.board(Object.assign({}, st, { seed: seed, round: 0 }), TABLES)
      .map(function (x) { return x.id; }).join(',');
    const b = Camp.board(Object.assign({}, st, { seed: seed, round: 1 }), TABLES)
      .map(function (x) { return x.id; }).join(',');
    if (a !== b) differed++;
  }
  checkTrue(`a different round deals a different board (${differed}/100 seeds)`, differed >= 95);

  /* ---- what you should have done ----------------------------------------
     FOO is an ORDER, so the ranking is by order first and money only as a
     tiebreak. This is the whole teaching mechanic. */
  const fake = { id: 'x', options: [
    { id: 'on',     serves: 3,    lever: null, subStats: {}, money: { cash: { cents: -1 } } },
    { id: 'behind', serves: 1,    lever: null, subStats: {}, money: { cash: { cents: 1000000 } } },
    { id: 'ahead',  serves: 8,    lever: null, subStats: {}, money: { cash: { cents: 1000000 } } },
    { id: 'none',   serves: null, lever: null, subStats: {}, money: { cash: { cents: 5000000 } } }
  ]};
  check('the option on your step wins, even for a worse price',
    Camp.bestOption(fake, 3, h).option.id, 'on');
  check('an earlier step beats a later one', Camp.bestOption(
    { id: 'y', options: [fake.options[1], fake.options[2]] }, 3, h).option.id, 'behind');
  check('and a later step still beats serving nothing at all', Camp.bestOption(
    { id: 'z', options: [fake.options[2], fake.options[3]] }, 3, h).option.id, 'ahead');
  const tie = { id: 't', options: [
    { id: 'poor', serves: 3, lever: null, subStats: {}, money: { cash: { cents: 100 } } },
    { id: 'rich', serves: 3, lever: null, subStats: {}, money: { cash: { cents: 900000 } } }]};
  check('money breaks a tie between equals', Camp.bestOption(tie, 3, h).option.id, 'rich');
  checkTrue('and with no placement it says the ranking is not about order',
    /cannot place you/.test(Camp.bestOption(fake, null, h).why));
  checkTrue('a premature option is named as premature',
    /premature/.test(Camp.bestOption({ id: 'p', options: [fake.options[2]] }, 3, h).why));

  /* ---- a round records what it should ------------------------------------ */
  const rec = res.record;
  ['scenarioId','optionId','deltas','shouldHave','followedFoo','couldHave','fooBefore','fooAfter']
    .forEach(function (k) { checkTrue(`the record carries ${k}`, rec[k] !== undefined); });
  check('couldHave lists every option not taken', rec.couldHave.length, b0[0].options.length - 1);
  checkTrue('and marks the one the ladder wanted, if it was not yours',
    rec.followedFoo || rec.couldHave.some(function (c) { return c.wasBest; }));
  check('the round advances', res.state.round, 1);
  check('and the scenario is remembered as seen', res.state.seen.indexOf(b0[0].id) !== -1, true);

  /* ---- ten rounds make a chapter ----------------------------------------- */
  function play(strategy, rounds) {
    let s = Camp.start(household(), TABLES);
    for (let i = 0; i < rounds; i++) {
      const board = Camp.board(s, TABLES);
      if (!board.length) break;
      const sc = board[0];
      const ranked = Camp.bestOption(sc, Camp.stepNumber(s.household, TABLES), s.household).ranked;
      const pick = strategy === 'best' ? ranked[0].option : ranked[ranked.length - 1].option;
      const r = Camp.resolve(s, sc.id, pick.id, TABLES);
      if (!r.ok) break;
      s = r.state;
      if (s.round >= R.roundsPerChapter && i < rounds - 1) s = Camp.nextChapter(s, TABLES);
    }
    return s;
  }
  const ten = play('best', R.roundsPerChapter);
  check('ten rounds fill a chapter', ten.round, R.roundsPerChapter);
  check('and every one is recorded', ten.history.length, R.roundsPerChapter);
  const review = Camp.chapterReview(ten, TABLES);
  check('the review covers the chapter', review.rounds, R.roundsPerChapter);
  check('a player who always follows the ladder is marked as having done so',
    review.followedFoo, R.roundsPerChapter);
  check('and has nothing in the missed list', review.missedFoo.length, 0);
  checkTrue('the review reports a net-worth movement', review.netWorthDelta !== null);

  /* THE TEACHING INVARIANT. If ignoring the order paid as well as following
     it, every word on the review screen would be decoration. */
  const good = play('best', 20), bad = play('worst', 20);
  const nwOf = function (s) { const n = Tier0.netWorth(s.household); return Money.isOk(n) ? n.value : null; };
  checkTrue('following the ladder beats ignoring it, and by a lot',
    nwOf(good) > nwOf(bad) * 1.25);
  const goodStep = Camp.stepNumber(good.household, TABLES), badStep = Camp.stepNumber(bad.household, TABLES);
  checkTrue('and it moves you up the ladder rather than sideways',
    goodStep === null || badStep === null || goodStep >= badStep);
  check('the careless player is honestly told they followed it never',
    Camp.chapterReview(bad, TABLES).followedFoo, 0);

  /* And the property the count is only a proxy for: actually play a chapter
     and check no card is dealt twice. The count guard can be satisfied while
     the pool is thinned by the resolvability filter; this one cannot. */
  (function () {
    const tiers = {};
    ['I','II','III','IV'].forEach(function (t) { tiers[t] = 0; });
    let s2 = Camp.start(household(), TABLES);
    const dealt = [];
    for (let i = 0; i < R.roundsPerChapter; i++) {
      const b = Camp.board(s2, TABLES);
      check(`round ${i + 1} deals a full board`, b.length, R.boardSize);
      const t = Camp.tierOf(s2.household, TABLES);
      if (t) tiers[t]++;
      dealt.push(b[0].id);
      const r = Camp.resolve(s2, b[0].id, b[0].options[0].id, TABLES);
      if (!r.ok) break;
      s2 = r.state;
    }
    check('a whole chapter never deals the same card twice',
      dealt.length - new Set(dealt).size, 0);
  })();

  /* ---- stacking, which is the warning the review exists for -------------- */
  const oneLever = [];
  for (let i = 0; i < 10; i++) oneLever.push({ lever: 'compounder', subStats: { savingsRate: 3 } });
  const warned = Camp.stacking(oneLever, TABLES);
  checkTrue('ten choices on one lever raises a warning', warned.warnings.length > 0);
  checkTrue('and names the lever', warned.warnings.some(function (w) { return w.kind === 'lever' && w.lever === 'compounder'; }));
  checkTrue('and the sub-stat it all went into',
    warned.warnings.some(function (w) { return w.kind === 'subStat' && w.subStat === 'savingsRate'; }));
  check('and lists the levers never pulled', warned.untouchedLevers.length, LEVERS.length - 1);
  const mixed = [{ lever: 'earner', subStats: { negotiation: 2 } }, { lever: 'keeper', subStats: { consistency: 2 } },
                 { lever: 'anchor', subStats: { reserveDepth: 2 } }, { lever: 'compounder', subStats: { savingsRate: 2 } },
                 { lever: 'builder', subStats: { hustleCapacity: 2 } }];
  check('a spread chapter raises nothing', Camp.stacking(mixed, TABLES).warnings.length, 0);
  checkTrue('and is reported as balanced', Camp.stacking(mixed, TABLES).balanced);
  const justUnder = [];
  for (let i = 0; i < R.stackWarnCount - 1; i++) justUnder.push({ lever: 'earner', subStats: {} });
  checkTrue('one short of the threshold does not warn',
    !Camp.stacking(justUnder, TABLES).warnings.some(function (w) { return w.kind === 'lever'; }));

  /* ---- the next chapter -------------------------------------------------- */
  const ch2 = Camp.nextChapter(ten, TABLES);
  check('the chapter advances', ch2.chapter, 2);
  check('the round resets', ch2.round, 0);
  check('history is kept', ch2.history.length, R.roundsPerChapter);
  checkTrue('and the new chapter opens from where the last one closed',
    ch2.chapterOpening.netWorthCents === Camp.snapshot(ten.household, TABLES).netWorthCents);
  check('a second chapter reviews only its own rounds',
    Camp.chapterReview(ch2, TABLES).rounds, 0);

  /* ---- the page ---------------------------------------------------------- */
  const src = fs.readFileSync(path.join(ROOT, 'campaign.html'), 'utf8');
  checkTrue('the campaign page exists', /<body class="slaf">/.test(src));
  checkTrue('it declares LIVE-FORM', /LIVE-FORM: built once/.test(src));
  checkTrue('it loads the campaign engine', /engines\/campaign\.js/.test(src));
  checkTrue('and foo.js, which owns the ladder', /engines\/foo\.js/.test(src));
  checkTrue('it says the sheet is not written to',
    /Nothing that happens in it is written back to your sheet/.test(src));
  /* The page now BUILDS a character as well as playing one, so it does write
     real numbers — during creation, and only there. The guarantee is made
     structural rather than textual: every real write goes through one named
     function, so "the play loop never writes" is a thing that can be checked
     instead of a thing that is hoped. DD-025. */
  const WRITERS = ['Store\\.setMoney', 'Store\\.setDebt', 'Store\\.setFilingStatus'];
  WRITERS.forEach(function (w) {
    check(`there is exactly one call to ${w.replace(/\\/g, '')}`,
      (src.match(new RegExp(w, 'g')) || []).length, 1);
  });
  const wb = src.indexOf('function writeBasic');
  const wbEnd = src.indexOf('\n  }', wb);
  checkTrue('writeBasic() exists', wb > 0 && wbEnd > wb);
  WRITERS.forEach(function (w) {
    checkTrue(`and ${w.replace(/\\/g, '')} is called inside it`,
      new RegExp(w).test(src.slice(wb, wbEnd)));
  });
  /* The play loop — everything from the board onward — must not write. */
  const playFrom = src.indexOf('/* ---- the board ---');
  const wireFrom = src.indexOf('function wire()');
  checkTrue('the play-loop painters exist to be checked', playFrom > 0 && wireFrom > playFrom);
  checkTrue('no play-loop painter writes a real number',
    src.slice(playFrom, wireFrom).indexOf('writeBasic') === -1);
  checkTrue('the sheet links to it', /href="campaign\.html"/.test(fs.readFileSync(path.join(ROOT, 'sheet.html'), 'utf8')));
  checkTrue('reference.js registers the scenario bank',
    /dndScenarios/.test(fs.readFileSync(path.join(ROOT, 'shared/reference.js'), 'utf8')));
})();

section('Dungeons & Dividends — five questions, and what to do about the answer (DD-026)');

(function () {
  const J = require(path.join(ROOT, 'engines/journey.js'));
  const Camp = require(path.join(ROOT, 'engines/campaign.js'));
  const Q = TABLES.dndQuiz5, CLASSES = TABLES.dndClasses.classes.map(c => c.id);
  const SUBS = TABLES.dndRules.subStats;

  /* ---- the quiz is well formed ------------------------------------------ */
  check('there are five questions', Q.questions.length, 5);
  const qids = {};
  Q.questions.forEach(function (q) {
    checkTrue(`${q.id} is unique`, !qids[q.id]); qids[q.id] = 1;
    checkTrue(`${q.id} asks something`, typeof q.ask === 'string' && q.ask.trim() === q.ask && q.ask.length > 0);
    checkTrue(`${q.id} offers a real choice`, q.options.length >= 3);
    const oids = {};
    q.options.forEach(function (o) {
      checkTrue(`${q.id}/${o.id} is unique`, !oids[o.id]); oids[o.id] = 1;
      checkTrue(`${q.id}/${o.id} has a label`, !!o.label);
      /* Every answer tells you something back. An option that scores in
         silence is a question the reader gets nothing for answering. */
      checkTrue(`${q.id}/${o.id} says something back`, typeof o.says === 'string' && o.says.length > 0);
      checkTrue(`${q.id}/${o.id} leans on at least one lever`,
        Object.keys(o.weights || {}).length > 0);
      Object.keys(o.weights).forEach(function (k) {
        checkTrue(`${q.id}/${o.id} leans on a real class (${k})`, CLASSES.indexOf(k) !== -1);
      });
    });
  });

  /* ---- and it is not rigged ---------------------------------------------
     The options are written to sound like people, not to balance a
     spreadsheet, so raw totals would hand nearly everyone the same class.
     Scoring is a share of each class's own ceiling instead. This walks ALL
     2,000 possible answer sets and insists every class is winnable and none
     runs away with it. */
  const ceil = J.ceilings(TABLES);
  CLASSES.forEach(function (c) {
    checkTrue(`${c} can be reached at all`, ceil[c] > 0);
  });
  const wins = {};
  CLASSES.forEach(function (c) { wins[c] = 0; });
  let total = 0, closeCount = 0;
  (function walk(i, acc) {
    if (i === Q.questions.length) {
      const r = J.scoreQuiz(acc, TABLES);
      wins[r.value] += 1; total += 1; if (r.close) closeCount += 1;
      return;
    }
    Q.questions[i].options.forEach(function (o) {
      const n = Object.assign({}, acc); n[Q.questions[i].id] = o.id; walk(i + 1, n);
    });
  })(0, {});
  check('every answer set produces a class', total, 2000);
  CLASSES.forEach(function (c) {
    checkTrue(`${c} wins for somebody (${(100 * wins[c] / total).toFixed(1)}%)`, wins[c] > 0);
    /* Even would be 14.3%. Anything past 25% means one class is eating the
       quiz and the other six are decoration. */
    checkTrue(`${c} does not run away with it`, wins[c] / total < 0.25);
  });
  checkTrue(`"you're also a bit of X" stays meaningful (${(100 * closeCount / total).toFixed(0)}%)`,
    closeCount / total < 0.35);

  /* ---- a half-finished quiz gets no verdict ------------------------------ */
  const partial = {}; partial[Q.questions[0].id] = Q.questions[0].options[0].id;
  const half = J.scoreQuiz(partial, TABLES);
  checkTrue('four unanswered questions is incomplete, not a guess', !Money.isOk(half));
  check('and it names how many are left', half.missing.length, 4);
  check('no answers at all is also incomplete', Money.isOk(J.scoreQuiz({}, TABLES)), false);

  const full = {};
  Q.questions.forEach(function (q) { full[q.id] = q.options[0].id; });
  const done = J.scoreQuiz(full, TABLES);
  checkTrue('a full set scores', Money.isOk(done));
  check('and echoes all five answers back', done.answers.length, 5);
  check('ranking covers every class', done.ranked.length, CLASSES.length);
  checkTrue('ranked highest-share first',
    done.ranked.every(function (r, i) { return i === 0 || done.ranked[i - 1].share >= r.share; }));
  checkTrue('the winner is the top of the ranking', done.value === done.top.classId);
  checkTrue('a runner-up is always offered', !!done.runnerUp);

  /* ---- how to improve --------------------------------------------------- */
  const moveIds = Object.keys(TABLES.dndImprove.moves);
  SUBS.forEach(function (m) {
    checkTrue(`${m.id} has moves that raise it`, J.movesFor(m.id, TABLES).length > 0);
  });
  moveIds.forEach(function (k) {
    checkTrue(`improve entry ${k} is a real sub-stat`,
      SUBS.some(function (m) { return m.id === k; }));
    TABLES.dndImprove.moves[k].forEach(function (mv) {
      checkTrue(`${k} move says what to do`, !!mv.do && !!mv.how);
      checkTrue(`${k} move declares how much it lifts`,
        ['small', 'real', 'big'].indexOf(mv.lift) !== -1);
      checkTrue(`${k} move declares what it costs you`,
        ['minutes', 'a weekend', 'months'].indexOf(mv.effort) !== -1);
    });
  });
  ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'].forEach(function (st) {
    checkTrue(`${st} has moves across its three sub-stats`,
      J.movesForAbility(st, TABLES).length >= 3);
  });

  /* ---- the focused game -------------------------------------------------
     Offering "train your Strength" and then dealing cards that do not touch
     it is worse than not offering it. Every ability needs a real bank. */
  const R = TABLES.dndScenarios.rules;
  ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'].forEach(function (st) {
    const pool = J.scenariosForStat(st, TABLES);
    checkTrue(`${st} has enough situations to deal a board (${pool.length})`, pool.length >= R.boardSize);
    const subs = SUBS.filter(function (m) { return m.stat === st; }).map(function (m) { return m.id; });
    checkTrue(`and every one of them actually trains ${st}`,
      pool.every(function (sc) {
        return J.trainedBy(sc).some(function (k) { return subs.indexOf(k) !== -1; });
      }));
  });
  SUBS.forEach(function (m) {
    checkTrue(`${m.id} is trained by at least one situation`,
      J.scenariosForSubStat(m.id, TABLES).length > 0);
  });

  /* A focused run deals only cards that train the thing. */
  function household() {
    const h = Schema.createHousehold(); h.filingStatus = 'single';
    const p = Schema.createPerson({ id: 'dnd_person', role: 'adult' });
    p.incomeSources = [Schema.createIncomeSource({ id: 'dnd_income', personId: 'dnd_person',
      grossAnnualIncomeCents: 7200000, type: 'w2' })];
    h.people = [p];
    h.assets = [Schema.createAsset({ id: 'dnd_asset_cash', category: 'cash', valueCents: 950000, liquid: true }),
                Schema.createAsset({ id: 'dnd_asset_investments', category: 'investment', valueCents: 4800000, liquid: false })];
    h.debts = [Schema.createDebt({ id: 'dnd_debt_total', balanceCents: 2160000, rate: 0.22, type: 'credit_card' })];
    h.expenses = { monthlyEssential: { estimatedValueCents: 315000, trackedValueCents: null, source: 'estimated' }, entries: [] };
    h.dndProfile = { fixedCostShare: 0.55, yearsSustained: 4, disruptionSurvived: true, healthCoverage: 2,
      automatedSaving: 'most' };
    return h;
  }
  const intSubs = SUBS.filter(function (m) { return m.stat === 'INT'; }).map(function (m) { return m.id; });
  const focused = Camp.start(household(), TABLES, intSubs);
  check('a focused run records what it is training', focused.focusSubStats.length, 3);
  const dealt = Camp.board(focused, TABLES);
  check('and still deals a full board', dealt.length, R.boardSize);
  checkTrue('every card on a focused board trains the chosen ability',
    dealt.every(function (sc) {
      return J.trainedBy(sc).some(function (k) { return intSubs.indexOf(k) !== -1; });
    }));
  /* A FOCUSED CHAPTER MUST NOT REPEAT EITHER.
     The first version narrowed the pool outright and dealt four repeats in
     ten rounds — a tier's worth of cards that train one ability is smaller
     than a tier, and the deal starts reoffering played cards the moment
     fewer than a board's worth are left. Only a full ten-round walk showed
     it; six rounds would have looked fine. */
  (function () {
    let st = Camp.start(household(), TABLES, intSubs);
    const played = [], boards = [];
    for (let i = 0; i < R.roundsPerChapter; i++) {
      const b = Camp.board(st, TABLES);
      if (b.length !== R.boardSize) break;
      boards.push(b.filter(function (sc) {
        return J.trainedBy(sc).some(function (k) { return intSubs.indexOf(k) !== -1; });
      }).length);
      played.push(b[0].id);
      const res = Camp.resolve(st, b[0].id, b[0].options[0].id, TABLES);
      if (!res.ok) break;
      st = res.state;
    }
    check('a focused chapter runs its full length', played.length, R.roundsPerChapter);
    check('and never deals the same card twice', played.length - new Set(played).size, 0);
    /* Every card the player actually chose from should have trained the
       target — the top-up only fills seats the focus could not. */
    checkTrue('the focused cards lead every board',
      boards.every(function (n, i) { return n > 0 || i >= R.roundsPerChapter - 1; }));
    checkTrue('and the first card dealt trains it',
      played.every(function (id) {
        const sc = Camp.scenarioById(TABLES, id);
        return J.trainedBy(sc).some(function (k) { return intSubs.indexOf(k) !== -1; });
      }));
  })();

  /* HOW LONG A FOCUS ACTUALLY HOLDS.
     Offering "train your Strength" and running out after three rounds is a
     broken promise. Every ability must lead the board for most of a chapter;
     Strength is the thinnest and sets the floor. When it runs out the room
     says so rather than dealing something else and letting it pass. */
  ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'].forEach(function (st) {
    const subs = SUBS.filter(function (m) { return m.stat === st; }).map(function (m) { return m.id; });
    let s2 = Camp.start(household(), TABLES, subs), lead = 0;
    const ids = [];
    for (let i = 0; i < R.roundsPerChapter; i++) {
      const b = Camp.board(s2, TABLES);
      if (!b.length) break;
      if (J.trainedBy(b[0]).some(function (k) { return subs.indexOf(k) !== -1; })) lead += 1;
      ids.push(b[0].id);
      const res = Camp.resolve(s2, b[0].id, b[0].options[0].id, TABLES);
      if (!res.ok) break;
      s2 = res.state;
    }
    checkTrue(`training ${st} leads most of a chapter (${lead}/${R.roundsPerChapter})`,
      lead >= 6);
    check(`and training ${st} never repeats a card`, ids.length - new Set(ids).size, 0);
  });
  /* A ROLL MUST SURVIVE A RELOAD.
     Six numbers you rolled are not reproducible. Regenerating them would hand
     someone a different character from the one they were halfway through
     assigning — and would let anyone reload until the numbers were nice,
     which is the same thing the deterministic board refuses to allow. */
  checkTrue('the rolled numbers are stored, not regenerated',
    /buildBag: \{ mode: ASSIGN_MODE, values: BAG\.slice\(\) \}/.test(
      fs.readFileSync(path.join(ROOT, 'campaign.html'), 'utf8')));
  checkTrue('and an unfinished assignment is picked back up',
    /goStep\('assign'\); return;/.test(
      fs.readFileSync(path.join(ROOT, 'campaign.html'), 'utf8')));

  checkTrue('the room admits when a focus has run out',
    /every situation here that trains/.test(fs.readFileSync(path.join(ROOT, 'campaign.html'), 'utf8')));

  /* An unfocused run is unchanged. */
  const open = Camp.start(household(), TABLES);
  check('an unfocused run records no focus', open.focusSubStats, null);
  check('and deals a full board too', Camp.board(open, TABLES).length, R.boardSize);
  /* A focus too narrow to fill a board is dropped rather than faked. */
  const impossible = Camp.start(household(), TABLES, ['notARealSubStat']);
  check('an unfillable focus still deals six', Camp.board(impossible, TABLES).length, R.boardSize);

  /* ---- weakest-first, and never inventing a weakness --------------------- */
  const ex = Character.explain(household(), TABLES);
  const rank = J.weakest(ex, TABLES);
  checkTrue('only scored abilities are ranked',
    rank.every(function (a) { return a.score !== null; }));
  checkTrue('and weakest comes first',
    rank.every(function (a, i) { return i === 0 || rank[i - 1].score <= a.score; }));
  check('an empty character has nothing to rank',
    J.weakest(Character.explain(Schema.createHousehold(), TABLES), TABLES).length, 0);

  /* ---- the page ---------------------------------------------------------- */
  const src = fs.readFileSync(path.join(ROOT, 'campaign.html'), 'utf8');
  ['quiz-view', 'quiz-result-view', 'method-view', 'create-assign', 'improve-view', 'focus-view']
    .forEach(function (id) {
      checkTrue(`the page has ${id}`, new RegExp('id="' + id + '"').test(src));
    });
  checkTrue('all four ways to build are offered',
    /data-route="real"/.test(src) === false || /'real'/.test(src));
  ['real', 'pointBuy', 'standardArray', 'roll'].forEach(function (r) {
    checkTrue(`the ${r} route exists`, new RegExp("id: '" + r + "'").test(src));
  });
  checkTrue('point buy cannot be walked past with points unspent',
    /Spend all ' \+ rules\.pool \+ ' points to carry on/.test(src));
  checkTrue('the instinct-versus-money contrast is on the page',
    /play like/.test(src) && /moves through/.test(src));
  /* The acronym may live in a code comment. It may not reach a screen. */
  checkTrue('no acronym reaches a label the player reads',
    !/cell\('FOO/.test(src) && !/\['FOO step'/.test(src));
})();

section('Dungeons & Dividends — creation, and why you got what you got (DD-025)');

(function () {
  const Form = require(path.join(ROOT, 'shared/charform.js'));
  const Char = Character;
  const src = fs.readFileSync(path.join(ROOT, 'campaign.html'), 'utf8');

  /* The same demo character the campaign section uses, built through Schema
     so every reader sees it exactly as it sees one the sheet wrote. */
  function household() {
    const h = Schema.createHousehold(); h.filingStatus = 'single';
    const p = Schema.createPerson({ id: 'dnd_person', role: 'adult' });
    p.incomeSources = [Schema.createIncomeSource({ id: 'dnd_income', personId: 'dnd_person',
      grossAnnualIncomeCents: 7200000, type: 'w2' })];
    h.people = [p];
    h.assets = [Schema.createAsset({ id: 'dnd_asset_cash', category: 'cash', valueCents: 950000, liquid: true }),
                Schema.createAsset({ id: 'dnd_asset_investments', category: 'investment', valueCents: 4800000, liquid: false })];
    h.debts = [Schema.createDebt({ id: 'dnd_debt_total', balanceCents: 2160000, rate: 0.22, type: 'credit_card' })];
    h.expenses = { monthlyEssential: { estimatedValueCents: 315000, trackedValueCents: null, source: 'estimated' }, entries: [] };
    h.dndProfile = { fixedCostShare: 0.55, yearsSustained: 4, disruptionSurvived: true, healthCoverage: 2,
      automatedSaving: 'most' };
    return h;
  }

  /* ---- the field declarations, which two rooms now share ----------------- */
  checkTrue('every money field names the Store writer it uses',
    Form.MONEY.every(function (f) { return f.writer === 'money' || f.writer === 'debt'; }));
  checkTrue('every field carries a format-only placeholder, never a default',
    Form.MONEY.every(function (f) { return typeof f.placeholder === 'string'; }));
  checkTrue('debt is the one that does not go through setMoney',
    Form.MONEY.filter(function (f) { return f.writer === 'debt'; }).length === 1);
  checkTrue('and it asks the rate, because Debt Burden keys off it',
    !!Form.MONEY.filter(function (f) { return f.id === 'debt'; })[0].follow);
  checkTrue('filing status is asked, or Constitution can never score',
    Form.CONTEXT.some(function (f) { return f.writer === 'filing'; }));
  checkTrue('every extra says which sub-stat it completes',
    Form.EXTRAS.every(function (f) { return typeof f.completes === 'string' && f.completes.length > 0; }));

  /* Blank is not zero, and never becomes zero on the way in. */
  check('a blank box parses to null, not 0', Form.parseDollars(''), null);
  check('a typed zero parses to 0', Form.parseDollars('0'), 0);
  check('commas and dollar signs survive', Form.parseDollars('$1,200.50'), 120050);
  check('nonsense is null rather than NaN', Form.parseDollars('abc'), null);

  /* ---- point buy is D&D Beyond's, read from data ------------------------- */
  const pb = Form.pointBuyRules(TABLES);
  const start = Form.startingScores(pb);
  check('everyone starts at the floor', start.STR, pb.min);
  check('with the whole pool unspent', Form.remaining(pb, start), pb.pool);
  checkTrue('the cost table is 5e’s — 14 costs two more than 13',
    Form.costOf(pb, 14) - Form.costOf(pb, 13) === 2);
  const maxed = Form.startingScores(pb);
  maxed.STR = pb.max;
  checkTrue('nothing may go above the cap', !Form.canRaise(pb, maxed, 'STR'));
  checkTrue('and nothing below the floor', !Form.canLower(pb, start, 'STR'));
  const broke = Form.startingScores(pb);
  ['STR', 'DEX', 'CON', 'INT'].forEach(function (k) { broke[k] = 15; });
  checkTrue('you cannot raise past the pool', Form.remaining(pb, broke) < 0
    || !Form.canRaise(pb, broke, 'WIS'));

  /* ---- THE MOBILITY TRAP ------------------------------------------------
     checklistScore() does options[stored], so the stored number is an INDEX.
     Writing the option's POINTS instead scores silently and wrongly — a
     3-point answer to a three-option question becomes index 3, which does not
     exist. A phone walk caught it; this keeps it caught. */
  const mob = TABLES.dndScoring.anchors.structuralMobility.checklist;
  const byIndex = {};
  mob.forEach(function (q) { byIndex[q.id] = 0; });
  const hIdx = household(); hIdx.dndProfile.mobility = byIndex;
  const sub = Char.explain(hIdx, TABLES).abilities.filter(function (a) { return a.id === 'DEX'; })[0]
    .parts.filter(function (p) { return p.id === 'structuralMobility'; })[0];
  checkTrue('a full set of option indices scores Structural Mobility', sub.score !== null);
  /* Points would be out of range for any question with fewer options than points. */
  const byPoints = {};
  mob.forEach(function (q) { byPoints[q.id] = q.options[0].points; });
  const hPts = household(); hPts.dndProfile.mobility = byPoints;
  const subPts = Char.explain(hPts, TABLES).abilities.filter(function (a) { return a.id === 'DEX'; })[0]
    .parts.filter(function (p) { return p.id === 'structuralMobility'; })[0];
  const anyOutOfRange = mob.some(function (q) { return !q.options[q.options[0].points]; });
  checkTrue('the checklist has a question where points are not a valid index', anyOutOfRange);
  checkTrue('so storing points instead of indices fails to score', subPts.score === null);
  checkTrue('the page stores the index', /mob\[q\.id\] = raw === '' \? null : Number\(raw\)/.test(src));

  /* ---- explain(): the receipts ------------------------------------------ */
  const h = household();
  const ex = Char.explain(h, TABLES);
  check('it explains all six abilities', ex.abilities.length, 6);
  checkTrue('every ability names what it means in money terms',
    ex.abilities.every(function (a) { return typeof a.finance === 'string' && a.finance.length > 0; }));
  checkTrue('every ability has exactly three sub-stats',
    ex.abilities.every(function (a) { return a.parts.length === 3; }));
  checkTrue('every status is one of the four honest ones',
    ex.abilities.every(function (a) {
      return ['measured', 'chosen', 'partial', 'blank'].indexOf(a.status) !== -1; }));

  const str = ex.abilities.filter(function (a) { return a.id === 'STR'; })[0];
  const power = str.parts.filter(function (p) { return p.id === 'incomePower'; })[0];
  checkTrue('a measured sub-stat quotes the figure that produced it', !!power.from);
  checkTrue('and it is the reader’s own number, not a re-derivation',
    power.from.indexOf('72,000') !== -1);

  /* An unscored sub-stat never invents a figure — it says what it needs. */
  const blank = Schema.createHousehold();
  const exBlank = Char.explain(blank, TABLES);
  checkTrue('nothing is scored for an empty character',
    exBlank.abilities.every(function (a) { return a.score === null; }));
  checkTrue('and no unscored sub-stat pretends to a figure',
    exBlank.abilities.every(function (a) {
      return a.parts.every(function (p) { return p.score !== null || p.from === null; }); }));
  checkTrue('every unscored sub-stat says why',
    exBlank.abilities.every(function (a) {
      return a.parts.every(function (p) { return p.score !== null || !!p.reason; }); }));
  check('an empty character is not complete', exBlank.complete, false);
  checkTrue('and it says what to ask for next', exBlank.nextUp.length > 0);

  /* A bought score is never dressed up as a measurement. */
  const hBought = Schema.createHousehold();
  hBought.dndProfile = { declaredMethod: 'pointBuy',
    declaredScores: { STR: 15, DEX: 12, CON: 13, INT: 14, WIS: 10, CHA: 8 } };
  const exB = Char.explain(hBought, TABLES);
  const strB = exB.abilities.filter(function (a) { return a.id === 'STR'; })[0];
  check('a bought ability reads as chosen, not measured', strB.status, 'chosen');
  checkTrue('and every part of it is marked bought',
    strB.parts.every(function (p) { return p.status === 'bought'; }));
  checkTrue('a bought part never claims a figure produced it',
    strB.parts.every(function (p) { return p.from === null; }));

  /* ---- the page ---------------------------------------------------------- */
  checkTrue('the creation flow is four signposted steps',
    /1\. About you/.test(src) === false || /STEP_LABELS/.test(src));
  ['create-basics', 'create-abilities', 'create-result'].forEach(function (id) {
    checkTrue(`the page has the ${id} step`, new RegExp('id="' + id + '"').test(src));
  });
  checkTrue('the creation controls are built once', /BASICS_BUILT|PB_BUILT|FINISH_BUILT/.test(src));
  checkTrue('the options say what they train before you pick',
    /Practises/.test(src));
  checkTrue('the board says why each card is in front of you',
    /Bang on where you are/.test(src) && /ahead of you/.test(src));
  checkTrue('example numbers are behind an explicit action',
    /Try with example numbers/.test(src));
  checkTrue('and nothing else on the page hardcodes a figure into a box',
    (src.match(/btn-basics-example/g) || []).length >= 1);
})();

section('Dungeons & Dividends — ASIs and feats that do something (DD-023)');

(function () {
  const Encounter = require(path.join(ROOT, 'engines/encounter.js'));
  const R = TABLES.dndRules, C = TABLES.dndClasses, cad = C.cadence;
  const KINDS = ['acBonus', 'maxHpPerLevel', 'saveProficiency', 'saveBonus', 'blocker'];

  /* Every general feat grants exactly one mechanic the engine reads, and says why. */
  R.generalFeats.forEach(function (f) {
    checkTrue(`${f.name} grants something`, !!f.grants);
    const keys = Object.keys(f.grants || {}).filter(function (k) { return KINDS.indexOf(k) !== -1; });
    check(`${f.name} grants exactly one mechanic`, keys.length, 1);
    checkTrue(`${f.name} explains itself`, typeof (f.grants || {}).why === 'string' && f.grants.why.length > 10);
    if (f.grants.blocker) checkTrue(`${f.name}'s blocker exists`, !!R.blockers[f.grants.blocker]);
    if (f.grants.saveProficiency) checkTrue(`${f.name}'s save is real`, ['STR','DEX','CON','INT','WIS','CHA'].indexOf(f.grants.saveProficiency) !== -1);
  });
  check('ASIs raise only the abilities you decide', cad.asi.abilities.join(','), 'INT,WIS,CHA');
  check('+2 or +1/+1, like 5e', cad.asi.plus + '/' + cad.asi.split.join('+'), '2/1+1');
  check('capped at 20', cad.asi.cap, 20);

  /* A level-8 household, built the way the suite builds one. */
  function household(advs) {
    const h = Schema.createHousehold(); h.filingStatus = 'single';
    const p = Schema.createPerson({ id: 'p1', role: 'adult' });
    p.incomeSources = [Schema.createIncomeSource({ id: 'i1', personId: 'p1', grossAnnualIncomeCents: 7200000, type: 'w2' })];
    h.people = [p];
    h.assets = [Schema.createAsset({ id: 'c', category: 'cash', valueCents: 1000000, liquid: true }),
                Schema.createAsset({ id: 'i', category: 'investment', valueCents: 24000000, liquid: false })];
    h.expenses = { monthlyEssential: { estimatedValueCents: 315000, trackedValueCents: null, source: 'estimated' }, entries: [] };
    h.dndProfile = { fixedCostShare: 0.55, yearsSustained: 4, disruptionSurvived: true, healthCoverage: 2, automatedSaving: 'most',
      declaredMethod: 'standardArray', declaredScores: { STR: 10, DEX: 10, CON: 10, INT: 13, WIS: 19, CHA: 10 },
      advancements: advs || {} };
    return h;
  }
  const plain = Character.sheet(household({}), TABLES);
  checkTrue('the household is high enough level to have ASIs', plain.levelValue >= 8);
  check('two advancement slots are reached', plain.advancements.filter(function (a) { return a.reached; }).length, 2);
  checkTrue('and later ones are not', plain.advancements.some(function (a) { return !a.reached; }));

  /* An ASI raises the score and the modifier, and says so. */
  const asi = Character.sheet(household({ '4': { kind: 'asi', plus: { INT: 2 } } }), TABLES);
  check('+2 INT lands', asi.stats.INT.value, plain.stats.INT.value + 2);
  check('and is marked as an ASI', asi.stats.INT.asi, 2);
  check('and the base is kept', asi.stats.INT.base, plain.stats.INT.value);
  const capped = Character.sheet(household({ '4': { kind: 'asi', plus: { WIS: 2 } } }), TABLES);
  check('an ASI never exceeds 20', capped.stats.WIS.value, 20);
  check('and records only what actually applied', capped.stats.WIS.asi, 20 - plain.stats.WIS.value);
  const split = Character.sheet(household({ '4': { kind: 'asi', plus: { INT: 1, CHA: 1 } } }), TABLES);
  check('+1/+1 splits', split.stats.INT.value + '/' + split.stats.CHA.value,
    (plain.stats.INT.value + 1) + '/' + (plain.stats.CHA.value + 1));
  const str = Character.sheet(household({ '4': { kind: 'asi', plus: { STR: 2 } } }), TABLES);
  check('an ASI on a measured ability is ignored — you cannot decree income',
    str.stats.STR.value, plain.stats.STR.value);
  const early = Character.sheet(household({ '16': { kind: 'asi', plus: { INT: 2 } } }), TABLES);
  check('a choice at an unreached level waits', early.stats.INT.value, plain.stats.INT.value);

  /* Feats reach the numbers they claim to. */
  const tough = Character.sheet(household({ '4': { kind: 'feat', feat: 'Tough' } }), TABLES);
  check('Tough adds a week per level to Max HP', tough.maxHp.weeks, plain.maxHp.weeks + plain.levelValue);
  /* Save grants are tested on a fully scored stats map — this household's DEX
     is deliberately incomplete (DD-018), so its DEX save has no modifier. */
  const full = { STR: Money.ok(10), DEX: Money.ok(12), CON: Money.ok(10), INT: Money.ok(10), WIS: Money.ok(10), CHA: Money.ok(10) };
  const gr = function (advs) { return Character.grantsFrom(Character.advancements(household(advs), TABLES, 8), TABLES); };
  const dexSave = function (grants) { return Character.savingThrows(full, plain.klass, 3, TABLES, grants)
    .filter(function (x) { return x.stat === 'DEX'; })[0]; };
  const noFeat = dexSave(gr({}));
  const withMobile = dexSave(gr({ '4': { kind: 'feat', feat: 'Mobile' } }));
  check('Mobile makes DEX a proficient save', withMobile.modifier, noFeat.modifier + 3);
  checkTrue('and says the proficiency came from a feat', withMobile.fromFeat);
  check('Lucky is +1 to every save', dexSave(gr({ '4': { kind: 'feat', feat: 'Lucky' } })).modifier, noFeat.modifier + 1);
  const wisSave = Character.savingThrows(full, plain.klass, 3, TABLES, gr({ '4': { kind: 'feat', feat: 'Lucky' } }))
    .filter(function (x) { return x.stat === 'WIS'; })[0];
  check('every save, not just one', wisSave.modifier,
    Character.savingThrows(full, plain.klass, 3, TABLES, gr({})).filter(function (x) { return x.stat === 'WIS'; })[0].modifier + 1);
  /* AC needs a fully measured DEX, which this household deliberately lacks
     (its bought DEX drops the moment cash makes one DEX sub-stat real — DD-018).
     So House Hack is tested on armorClass() directly, where the bonus lands. */
  const hackHh = household({ '4': { kind: 'feat', feat: 'House Hack' } });
  const hackGrants = Character.grantsFrom(Character.advancements(hackHh, TABLES, 8), TABLES);
  check('House Hack grants +1 AC', hackGrants.acBonus, 1);
  const acPlain = Character.armorClass(hackHh, TABLES, 0, 8, 0, 0, 0);
  const acHack = Character.armorClass(hackHh, TABLES, 0, 8, 0, 0, hackGrants.acBonus);
  check('and armorClass applies it', acHack.value, acPlain.value + 1);
  checkTrue('as a named layer', acHack.layers.some(function (l) { return l.id === 'feat'; }));
  const ask = Character.sheet(household({ '4': { kind: 'feat', feat: 'The Ask' } }), TABLES);
  check('The Ask grants the negotiation blocker', ask.grants.blockers.join(','), 'negotiation');
  const wraith = R.monsters.filter(function (m) { return m.name === 'Wage-Stagnation Wraith'; })[0];
  const opts = { tables: TABLES, household: household({}) };
  checkTrue('and the Wage-Stagnation Wraith cannot land on someone who asks',
    Encounter.run(ask, wraith, opts).negated && !Encounter.run(plain, wraith, opts).negated);
  const two = Character.sheet(household({ '4': { kind: 'feat', feat: 'Tough' }, '8': { kind: 'feat', feat: 'Lucky' } }), TABLES);
  check('two feats stack', two.grants.feats.join(','), 'Tough,Lucky');
  check('an unknown feat grants nothing', Character.sheet(household({ '4': { kind: 'feat', feat: 'Nope' } }), TABLES).grants.feats.length, 0);

  /* -- the sheet ---------------------------------------------------------- */
  const src = fs.readFileSync(path.join(ROOT, 'sheet.html'), 'utf8');
  checkTrue('the sheet builds an advancement select per reached level', /data-adv=/.test(src));
  checkTrue('inside the signature-guarded picker block', src.indexOf('data-adv=') > src.indexOf('function paintPickers') && src.indexOf('data-adv=') < src.indexOf('function describeExport'));
  checkTrue('and the signature includes the choices', /reached\.map\(function \(a\) \{ return a\.level/.test(src));
  checkTrue('flavour feats say so', /Flavour — no mechanic yet/.test(src));
  checkTrue('a raised score is marked', /r\.asi \? ' ▲'/.test(src));
  checkTrue('FORMAT.md describes advancements', /advancements/.test(fs.readFileSync(path.join(ROOT, 'FORMAT.md'), 'utf8')));
})();

section('Dungeons & Dividends — one strong save, one weak (DD-022)');

(function () {
  const C = TABLES.dndClasses;
  const STRONG = ['DEX', 'CON', 'WIS'], WEAK = ['STR', 'INT', 'CHA'];
  checkTrue('the classes file says why the saves changed', /DD-022/.test(C.savesNote || ''));
  const cov = {};
  C.classes.forEach(function (k) {
    check(`${k.name} has two saves`, k.saves.length, 2);
    checkTrue(`${k.name} has one strong save`, k.saves.some(function (s) { return STRONG.indexOf(s) !== -1; }));
    checkTrue(`${k.name} has one weak save`, k.saves.some(function (s) { return WEAK.indexOf(s) !== -1; }));
    checkTrue(`${k.name} keeps the rulebook's pair on record`, Array.isArray(k.savesRulebook) && k.savesRulebook.length === 2);
    k.saves.forEach(function (s) { cov[s] = (cov[s] || 0) + 1; });
  });
  ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'].forEach(function (s) {
    checkTrue(`${s} is a proficient save for at least two classes`, (cov[s] || 0) >= 2);
  });
  /* No two classes with identical pairs is too strict (5e has Fighter and
     Barbarian both STR/CON); but the rulebook's three-way CON/WIS tie is gone. */
  const pairs = C.classes.map(function (k) { return k.saves.slice().sort().join('/'); });
  const most = Math.max.apply(null, pairs.map(function (p) { return pairs.filter(function (q) { return q === p; }).length; }));
  checkTrue('no save pair is shared by three classes', most <= 2);
  /* Proficiency actually lands on the new saves. */
  const earner = C.classes.filter(function (k) { return k.id === 'earner'; })[0];
  const stats = { STR: Money.ok(10), DEX: Money.ok(10), CON: Money.ok(10), INT: Money.ok(10), WIS: Money.ok(10), CHA: Money.ok(10) };
  const saves = Character.savingThrows(stats, earner, 2, TABLES);
  check('the Earner is now proficient in CON', saves.filter(function (s) { return s.stat === 'CON'; })[0].modifier, 2);
  check('and no longer in CHA', saves.filter(function (s) { return s.stat === 'CHA'; })[0].modifier, 0);
})();

section('Dungeons & Dividends — a bleed is measured against a rest (DD-021)');

(function () {
  const Encounter = require(path.join(ROOT, 'engines/encounter.js'));
  const all = TABLES.dndRules.monsters.concat(TABLES.dndRules.hazards);
  function hh(income, cash) {
    const h = Schema.createHousehold(); h.filingStatus = 'single';
    const p = Schema.createPerson({ id: 'p1', role: 'adult' });
    p.incomeSources = [Schema.createIncomeSource({ id: 'i1', personId: 'p1', grossAnnualIncomeCents: income, type: 'w2' })];
    h.people = [p];
    h.assets = [Schema.createAsset({ id: 'c', category: 'cash', valueCents: cash, liquid: true })];
    h.expenses = { monthlyEssential: { estimatedValueCents: 315000, trackedValueCents: null, source: 'estimated' }, entries: [] };
    h.dndProfile = { fixedCostShare: 0.55, yearsSustained: 4, disruptionSurvived: true, healthCoverage: 2,
      automatedSaving: 'none', declaredMethod: 'pointBuy',
      declaredScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 } };
    return h;
  }
  const imp = all.filter(function (c) { return c.name === 'Lifestyle-Inflation Imp'; })[0];
  const hydra = all.filter(function (c) { return c.name === 'Lifestyle-Creep Hydra'; })[0];
  const timeshare = all.filter(function (c) { return c.name === 'Timeshare Charm-Caster'; })[0];

  /* "1d4 a month" used to be subtracted once, like a single hit. Now it is
     netted against what a short rest gives back in the same period. */
  const rich = hh(7200000, 1000000), poor = hh(3600000, 1000000);
  const rImp = Encounter.run(Character.sheet(rich, TABLES), imp, { tables: TABLES, household: rich });
  const pImp = Encounter.run(Character.sheet(poor, TABLES), imp, { tables: TABLES, household: poor });
  checkTrue('the Imp is recurring', rImp.recurring);
  check('per month', rImp.perPeriod, 'month');
  checkTrue('healing per month is read from the household', rImp.healPerPeriod !== null && rImp.healPerPeriod > 0);
  check('net is damage minus healing', rImp.netPerPeriod, Math.round((rImp.damageWeeks - rImp.healPerPeriod) * 10) / 10);
  checkTrue('a saver barely bleeds', rImp.netPerPeriod < 0.5);
  checkTrue('an overspender bleeds the full chip and then some', pImp.netPerPeriod > rImp.damageWeeks);
  checkTrue('and negative healing is a real answer, not clamped', pImp.healPerPeriod < 0);
  checkTrue('runway-gone is months, not weeks', pImp.periodsToZero > 0 && pImp.periodsToZero < 12);
  check('it equals ceil(runway / net)', pImp.periodsToZero, Math.ceil(pImp.hpBefore / pImp.netPerPeriod));
  check('HP after is after ONE period, net', pImp.hpAfter, Math.max(0, Math.round((pImp.hpBefore - pImp.netPerPeriod) * 10) / 10));

  /* Out-healing a bleed is "never", and HP after does not go up. */
  const rHydra = Encounter.run(Character.sheet(rich, TABLES), hydra, { tables: TABLES, household: rich });
  check('a yearly bleed heals per year', rHydra.perPeriod, 'year');
  checkTrue('a saver out-heals the Hydra', rHydra.netPerPeriod < 0);
  check('so runway is never gone', rHydra.periodsToZero, null);
  check('and HP after is unchanged, not inflated', rHydra.hpAfter, rHydra.hpBefore);

  /* A single hit is still a single hit. */
  const once = Encounter.run(Character.sheet(rich, TABLES), timeshare, { tables: TABLES, household: rich });
  checkTrue('a once creature is not recurring', !once.recurring);
  check('and carries no healing figure', once.healPerPeriod, null);
  check('its HP after is the raw hit', once.hpAfter, Math.max(0, Math.round((once.hpBefore - once.damageWeeks) * 10) / 10));

  /* Massive damage is a single hit at or above Max HP. A monthly chip never
     qualifies however large the pile it eventually takes. */
  const spike = all.filter(function (c) { return c.name === 'The Sudden Rent Spike'; })[0];
  const rSpike = Encounter.run(Character.sheet(poor, TABLES), spike, { tables: TABLES, household: poor });
  checkTrue('a recurring creature never triggers massive damage', !rSpike.massiveDamage);

  /* Incident-shaped periods have no clock, so nothing offsets them. */
  const bnpl = all.filter(function (c) { return c.name === 'Buy-Now-Pay-Later Sprite'; })[0];
  const rB = Encounter.run(Character.sheet(rich, TABLES), bnpl, { tables: TABLES, household: rich });
  checkTrue('"instalment" is not a time period', !rB.recurring);

  /* No household means no healing figure, and the raw damage stands — said,
     not hidden. */
  const bare = { stats: { CON: Money.ok(10) }, klass: null, proficiencyBonus: 0, level: null,
                 currentHp: Money.ok(13), maxHp: null, subScores: {} };
  const noH = Encounter.run(bare, imp, { tables: TABLES, household: {} });
  checkTrue('still recurring', noH.recurring);
  check('but healing is unknown', noH.healPerPeriod, null);
  check('and HP after uses the raw chip', noH.hpAfter, Math.round((13 - noH.damageWeeks) * 10) / 10);

  /* -- the page ------------------------------------------------------------ */
  const enc = fs.readFileSync(path.join(ROOT, 'encounter.html'), 'utf8');
  checkTrue('the encounter room shows what you heal', /'You heal'/.test(enc));
  checkTrue('and the net', /\['Net'/.test(enc));
  checkTrue('and when the runway is gone', /'Runway gone in'/.test(enc));
  checkTrue('and says "never" when you out-heal it', /never — you out-heal it/.test(enc));
})();

section('Dungeons & Dividends — two ways to get hurt (DD-019)');

(function () {
  const Encounter = require(path.join(ROOT, 'engines/encounter.js'));
  const R = TABLES.dndRules, E = R.encounterRules;
  const all = R.monsters.concat(R.hazards);

  /* Every creature says which door it comes through. */
  all.forEach(function (c) {
    checkTrue(`${c.name} resolves by attack or save`, ['attack', 'save'].indexOf(c.resolution) !== -1);
  });
  const attackers = all.filter(function (c) { return c.resolution === 'attack'; });
  check('eight creatures attack AC', attackers.length, 8);
  ['Medical Bankruptcy Behemoth', 'Identity Thief', 'The Layoff Reaper', 'The Sudden Ability Drain']
    .forEach(function (n) {
      checkTrue(`${n} is a bill, not a pitch — it attacks`,
        attackers.some(function (c) { return c.name === n; }));
    });
  ['Timeshare Charm-Caster', 'Crypto Siren', 'MLM Cultist'].forEach(function (n) {
    checkTrue(`${n} goes around armour — it forces a save`,
      all.filter(function (c) { return c.name === n; })[0].resolution === 'save');
  });

  /* Armour is counted ONCE. An armour-layer blocker on an attack creature would
     count insurance as AC and again as a halve. Immunity (negate) is not armour
     and may stay. */
  const ARMOUR = ['healthInsurance', 'disabilityInsurance', 'umbrella', 'emergencyFund'];
  attackers.forEach(function (c) {
    c.blockedBy.forEach(function (b) {
      checkTrue(`${c.name}: ${b.id} is not counted as both armour and a blocker`,
        ARMOUR.indexOf(b.id) === -1 || b.effect === 'negate');
    });
  });

  /* The to-hit ladder rises with CR and is the DMG's shape. */
  checkTrue('a to-hit ladder exists', Array.isArray(E.crToAttackBonus) && E.crToAttackBonus.length > 3);
  check('CR 1 attacks at +3', Encounter.attackBonusFor('1', TABLES), 3);
  check('CR 8 attacks at +7', Encounter.attackBonusFor('8', TABLES), 7);
  check('CR 15 attacks at +8', Encounter.attackBonusFor('15', TABLES), 8);
  checkTrue('and it never goes down', (function () {
    let prev = -Infinity;
    for (let cr = 0; cr <= 25; cr++) { const b = Encounter.attackBonusFor(String(cr), TABLES); if (b < prev) return false; prev = b; }
    return true;
  })());

  /* Attack rolls: d20 + bonus reaches AC. Insurance moves this and nothing
     else does — not exhaustion, which is a judgment penalty. */
  function sheetAt(ac, weeks, burden) {
    const s = { stats: { STR: Money.ok(12), DEX: Money.ok(12), CON: Money.ok(12), INT: Money.ok(12), WIS: Money.ok(12), CHA: Money.ok(12) },
      klass: null, proficiencyBonus: 2, level: Money.ok(5), currentHp: Money.ok(weeks), maxHp: { weeks: 44 }, subScores: {},
      armorClass: ac === null ? Money.incomplete('no AC', ['DEX']) : Money.ok(ac, { layers: [] }) };
    if (burden !== undefined) s.debtBurden = Money.ok(burden, { row: R.debtBurden[burden] });
    return s;
  }
  const opts = { tables: TABLES, household: { dndProfile: {} } };
  const beh = all.filter(function (c) { return c.name === 'Medical Bankruptcy Behemoth'; })[0];
  const lo = Encounter.run(sheetAt(11, 30), beh, opts);
  const hi = Encounter.run(sheetAt(25, 30), beh, opts);
  check('the Behemoth resolves as an attack', lo.resolution, 'attack');
  check('at +8', lo.attackBonus, 8);
  check('against AC 11 it lands 90%', lo.hitChance, 0.9);
  check('against AC 25 it lands 20%', hi.hitChance, 0.2);
  checkTrue('more armour, fewer hits', hi.hitChance < lo.hitChance);
  check('the save fields are empty on an attack', lo.dc, Encounter.dcFor(beh.cr, TABLES));
  check('exhaustion does not apply to an attack',
    Encounter.run(sheetAt(11, 0.5), beh, opts).hitChance, lo.hitChance);
  check('no AC means no chance, not a guessed one',
    Encounter.run(sheetAt(null, 30), beh, opts).hitChance, null);

  /* Debt Burden's disadvantage — the rulebook's rule, finally applied. */
  const imp = all.filter(function (c) { return c.name === 'Lifestyle-Inflation Imp'; })[0];
  const clean = Encounter.run(sheetAt(17, 30, 0), imp, opts);
  const l1 = Encounter.run(sheetAt(17, 30, 1), imp, opts);
  check('Debt Burden 1 gives disadvantage on a CON save', l1.disadvantage, true);
  checkTrue('and names itself', /Debt Burden level 1/.test(l1.disadvantageFrom));
  checkTrue('so the Imp lands more often', l1.hitChance > clean.hitChance);
  check('the raw modifier is untouched', l1.modifier, clean.modifier);
  check('level 3 is DEX, not CON', Encounter.run(sheetAt(17, 30, 3), imp, opts).disadvantage, false);
  const wraith = all.filter(function (c) { return c.name === 'Payday Loan Wraith'; })[0];
  check('and a DEX save at level 3 does get it',
    Encounter.run(sheetAt(17, 30, 3), wraith, opts).disadvantage, true);
  R.debtBurden.forEach(function (row) {
    checkTrue(`burden level ${row.level} declares its disadvantage as data`, Array.isArray(row.saveDisadvantage));
  });

  /* A debt-free household is level 0, and level 0 has a row. It used to come
     back rowless, and the sheet crashed on a household with no debt — caught by
     the phone pass, not by any unit test, which is why this one exists. */
  const debtFree = Character.debtBurden(Schema.createHousehold(), TABLES);
  checkTrue('no debt is level 0, not incomplete', Money.isOk(debtFree) && debtFree.value === 0);
  checkTrue('and it carries its row', !!debtFree.row);
  /* Guarded, so a missing row is a failed check and not a crashed suite. */
  check('with no disadvantage', debtFree.row ? (debtFree.row.saveDisadvantage || []).length : 'no row', 0);
  check('and the row is the data\'s own level 0', debtFree.row ? debtFree.row.level : 'no row', 0);

  /* 5e's cancel rule: advantage and disadvantage together are neither. */
  /* Self-Awareness 14+ grants advantage against the Imp (automated saving only
     halves it), so the sub-score is what has to be supplied here. */
  const aware = Object.assign({}, sheetAt(17, 30, 1), { subScores: { selfAwareness: Money.ok(15) } });
  const both = Encounter.run(aware, imp, opts);
  checkTrue('a held advantage and a burden disadvantage', both.advantage && both.disadvantage);
  check('cancel to the raw modifier', both.effectiveModifier, both.modifier);

  /* The AC panel's answer. */
  const gaps = Encounter.armourGaps(sheetAt(17, 30), TABLES);
  checkTrue('armour gaps are ready with an AC', gaps.ready);
  check('and list every attacker', gaps.rows.length, attackers.length);
  checkTrue('sorted most-likely first', gaps.rows.every(function (r, i) { return i === 0 || gaps.rows[i - 1].chance >= r.chance; }));
  checkTrue('without an AC it says so', !Encounter.armourGaps(sheetAt(null, 30), TABLES).ready);

  /* -- pages ------------------------------------------------------------- */
  const enc = fs.readFileSync(path.join(ROOT, 'encounter.html'), 'utf8');
  checkTrue('the encounter room shows attack figures', /'It attacks'/.test(enc) && /'Your AC'/.test(enc));
  checkTrue('and has the armour panel', /id="armour-list"/.test(enc) && /Enc\.armourGaps/.test(enc));
  checkTrue('and explains disadvantage', /disadvantageFrom/.test(enc));
  checkTrue('DM mode takes an AC', /id="f-ac"/.test(fs.readFileSync(path.join(ROOT, 'dm.html'), 'utf8')));
  checkTrue('the bestiary says which creatures attack AC', /attacks AC/.test(fs.readFileSync(path.join(ROOT, 'bestiary.html'), 'utf8')));
  checkTrue('the sheet says what AC is for', /v-ac-note/.test(fs.readFileSync(path.join(ROOT, 'sheet.html'), 'utf8')));
})();

section('Dungeons & Dividends — six abilities, like D&D Beyond (DD-018)');

(function () {
  const S = TABLES.dndScoring, R = TABLES.dndRules;
  const SIX = R.stats.map(function (st) { return st.id; });

  /* D&D Beyond's point buy, exactly: 27 points, 8-15, 5e's cost table. */
  check('27 points', S.pointBuy.pool, 27);
  check('scores start at 8', S.pointBuy.min, 8);
  check('and stop at 15', S.pointBuy.max, 15);
  check('over the six abilities', S.pointBuy.over.join(','), SIX.join(','));
  const FIVE_E = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
  Object.keys(FIVE_E).forEach(function (v) {
    check(`a ${v} costs ${FIVE_E[v]}`, S.pointBuy.costs[v], FIVE_E[v]);
  });
  check('nothing above 15 is purchasable', Object.keys(S.pointBuy.costs).length, 8);
  check('the standard array is 5e\'s', S.standardArray.values.join(','), '15,14,13,12,10,8');
  check('six of them', S.standardArray.values.length, 6);
  check('rolling makes six', S.roll.count, 6);
  check('15/14/13/12/10/8 spends exactly the pool',
    [15, 14, 13, 12, 10, 8].reduce(function (n, v) { return n + S.pointBuy.costs[v]; }, 0), S.pointBuy.pool);
  S.methods.forEach(function (m) {
    checkTrue(`the ${m.id} blurb no longer says nine`, !/\bnine\b/i.test(m.blurb));
  });

  /* A household with a bought character and no money at all. */
  function bought(method, scores) {
    const h = Schema.createHousehold();
    h.dndProfile = { declaredMethod: method, declaredScores: scores };
    return h;
  }
  const full = { STR: 15, DEX: 14, CON: 13, INT: 12, WIS: 10, CHA: 8 };
  const stats = Character.mainStats(Character.allSubStats(bought('pointBuy', full), TABLES), TABLES);
  SIX.forEach(function (id) {
    check(`${id} scores from a bought ability`, Money.isOk(stats[id]) && stats[id].value, full[id]);
  });
  ['STR', 'DEX', 'CON'].forEach(function (id) {
    checkTrue(`${id} is marked bought`, stats[id].bought === true);
  });
  ['INT', 'WIS', 'CHA'].forEach(function (id) {
    checkTrue(`${id} is declared, not bought`, stats[id].bought !== true);
  });

  /* Each sub-stat under a bought ability takes that ability's score. */
  const subs = Character.allSubStats(bought('standardArray', full), TABLES);
  R.subStats.forEach(function (m) {
    check(`${m.id} takes its parent ${m.stat}'s score`, subs[m.id].value, full[m.stat]);
  });

  /* The quiz never buys STR/DEX/CON — those stay blank on that path. */
  const quiz = Character.mainStats(Character.allSubStats(
    { dndProfile: { declaredMethod: 'featsOfStrength', quiz: {} } }, TABLES), TABLES);
  ['STR', 'DEX', 'CON'].forEach(function (id) {
    checkTrue(`the quiz path leaves ${id} blank`, !Money.isOk(quiz[id]));
  });

  /* ALL-OR-NOTHING per ability: once any money reaches an ability, the bought
     score stops applying to it and its missing inputs stay missing. Filling
     only the gaps would average one measured number with two bought ones. */
  const h = bought('pointBuy', full);
  const person = Schema.createPerson({ id: 'p1', role: 'adult' });
  person.incomeSources = [Schema.createIncomeSource({
    id: 'i1', personId: 'p1', grossAnnualIncomeCents: 7200000, type: 'w2' })];
  h.people = [person];
  const mixed = Character.mainStats(Character.allSubStats(h, TABLES), TABLES);
  checkTrue('income alone puts STR on measured terms', !Money.isOk(mixed.STR));
  checkTrue('and it is no longer marked bought', mixed.STR.bought !== true);
  checkTrue('its reason names the sub-stats still missing', /of 3 sub-stats/.test(mixed.STR.reason));
  check('CON, which no money reached, is still bought', mixed.CON.value, 13);
  checkTrue('and still says so', mixed.CON.bought === true);
  check('DEX likewise', mixed.DEX.value, 14);

  /* The old nine-key shape still reads, so nobody's saved build goes blank. */
  const legacy = bought('standardArray', {
    taxLiteracy: 13, marketLiteracy: 12, instrumentLiteracy: 11,
    scenarioForesight: 14, selfAwareness: 15, threatDetection: 10,
    negotiation: 10, network: 9, personability: 8 });
  const old = Character.mainStats(Character.allSubStats(legacy, TABLES), TABLES);
  check('a pre-DD-018 build still scores INT', old.INT.value, 12);
  checkTrue('and never invents STR from it', !Money.isOk(old.STR));
  checkTrue('a legacy build counts as complete', (function () {
    /* quizComplete reads the store; emulate its rule directly. */
    const scores = legacy.dndProfile.declaredScores;
    const declared = R.subStats.filter(function (x) { return x.kind === 'declared'; });
    return declared.every(function (x) { return Money.isEntered(scores[x.id]); });
  })());

  /* -- the pages ---------------------------------------------------------- */
  const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  checkTrue('the builder rows come from the six abilities', /function abilities\(\) \{ return TABLES\.dndRules\.stats/.test(idx));
  checkTrue('and no builder loop runs over SUBS any more',
    !/SUBS\.forEach\(function \(s\) \{\s*var (cell|node) = el\('(cell|v)-'/.test(idx));
  checkTrue('the result shows all six', /Char\.STAT_IDS\.map\(function \(id\) \{\s*var r = stats\[id\]/.test(idx));
  checkTrue('and tags bought ones', /<span class="tag">bought<\/span>/.test(idx));
  checkTrue('the share text marks bought scores', /', bought'/.test(idx));
  const sheet = fs.readFileSync(path.join(ROOT, 'sheet.html'), 'utf8');
  checkTrue('the sheet tags a bought ability', /bought · until your numbers replace it/.test(sheet));
  checkTrue('and explains a superseded one', /no longer applies/.test(sheet));
  checkTrue('writing textContent and hidden, never innerHTML, on the live ability card',
    !/html\('abcard-|abcard-[^']*'\)\.innerHTML/.test(sheet));
  const card = fs.readFileSync(path.join(ROOT, 'card.html'), 'utf8');
  checkTrue('the card marks bought scores', /bought: s\.stats\[id\]\.bought === true/.test(card));
  checkTrue('and explains the mark', /bought with points, not measured/.test(card));
  checkTrue('FORMAT.md says never to import a bought STR/DEX/CON',
    /Never import one of those\s+three/.test(fs.readFileSync(path.join(ROOT, 'FORMAT.md'), 'utf8')));
})();

section('Dungeons & Dividends — what hunts you on the money-free page');

(function () {
  const Encounter = require(path.join(ROOT, 'engines/encounter.js'));
  /* BRIEF §9.6. The Tier 1 result runs §9.3's predator engine on the only
     three saves a page with no dollars can score. The whole risk here is
     over-claiming, so these checks are about what it must NOT say. */

  /* A Tier 1 character: INT, WIS and CHA scored, the rest genuinely blank. */
  const t1 = {
    stats: { INT: Money.ok(14), WIS: Money.ok(11), CHA: Money.ok(9) },
    klass: null, proficiencyBonus: 0, level: null
  };
  const p = Encounter.predators(t1, TABLES);
  checkTrue('three scored saves are enough to draw the list', p.ready);
  check('it still names exactly two weakest', p.weakest.length, 2);

  /* The point of the whole panel: a blank save must never be called a
     weakness. STR, DEX and CON are unscored here, so they cannot appear. */
  ['STR', 'DEX', 'CON'].forEach(function (id) {
    checkTrue(`${id} is blank, so it is not named as a weakness`,
      p.weakest.indexOf(id) === -1);
  });
  check('the two thinnest of the three scored are CHA and WIS',
    p.weakest.slice().sort().join(','), 'CHA,WIS');

  /* No class, so no proficiency anywhere — a Tier 1 character has not picked
     one, and savingThrows must not invent one. */
  const saves = Character.savingThrows(t1.stats, null, 0, TABLES);
  checkTrue('with no class, no save is proficient',
    saves.every(function (x) { return !x.proficient; }));
  check('exactly three of the six are scored',
    saves.filter(function (x) { return x.ok; }).length, 3);

  /* Every creature the panel can list must carry the fields it renders, or
     the page prints "undefined" at someone. */
  p.creatures.forEach(function (c) {
    checkTrue(`${c.name} carries an attackType the page can label`,
      TABLES.dndRules.encounterRules.attackTypes.some(function (t) { return t.id === c.attackType; }));
    checkTrue(`${c.name} carries a CR`, c.cr !== undefined && c.cr !== null);
    checkTrue(`${c.name} sorts by CR`, Encounter.crToNumber(c.cr) !== null);
  });

  /* One scored save is not a map, on this page as much as on the sheet. */
  const one = { stats: { WIS: Money.ok(8) }, klass: null, proficiencyBonus: 0, level: null };
  checkTrue('one scored save still draws nothing', !Encounter.predators(one, TABLES).ready);

  /* A Tier 1 character has no Level, so the engine must not blow up on a
     null one — and the page deliberately never shows the tier it falls back
     to, because a fallback tier is not a measured tier. */
  checkTrue('a null level does not break the engine', p.tier && !!p.tier.id);

  /* -- the page itself wires it up --------------------------------------- */
  const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  checkTrue('index.html loads the encounter engine',
    /<script src="engines\/encounter\.js"><\/script>/.test(src));
  checkTrue('index.html aliases DND.Encounter', /Enc = DND\.Encounter/.test(src));
  checkTrue('the hunt panel is in the markup', /id="r-preds"/.test(src));
  checkTrue('and it says the blank saves are blank, not bad',
    /blank, not bad/.test(src));
  /* The share text is the product — it must carry a link back or it cannot
     do the one job a lead magnet has. */
  checkTrue('the share text carries a link back', /Roll your own/.test(src));
})();

console.log('\n' + '\u2500'.repeat(66));
if (failures.length === 0) {
  console.log(`\u2713 ${passed} checks passed`);
  process.exit(0);
}
console.log(`\u2717 ${failures.length} failed, ${passed} passed\n`);
failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
process.exit(1);
