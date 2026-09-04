#!/usr/bin/env node
/* ==========================================================================
   test/export.js — the export contract in FORMAT.md, asserted.
   --------------------------------------------------------------------------
   Another program is going to be written against this format. These are the
   promises it is allowed to rely on, and the traps the shape exists to avoid.
   ========================================================================== */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
global.self = { localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } };

const Money = require(path.join(ROOT, 'shared/money.js'));
const Schema = require(path.join(ROOT, 'shared/schema.js'));
const Store = require(path.join(ROOT, 'shared/store.js'));
const Export = require(path.join(ROOT, 'shared/export.js'));

const t = f => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));
const TABLES = {
  dndRules: t('dnd_rules.json'), dndClasses: t('dnd_classes.json'),
  dndScoring: t('dnd_scoring.json'), fooRules: t('foo_rules.json'),
  effectiveTaxRates: t('effective_tax_rates_2026.json'),
  fireVariants: t('fire_variants.json'),
  retirementMilestones: t('retirement_milestones.json'),
  netWorthPercentiles: t('net_worth_percentiles_scf_2022.json')
};

let passed = 0; const failures = [];
const check = (n, a, e) => { if (a === e) passed++; else failures.push(`${n}\n      expected ${JSON.stringify(e)}, got ${JSON.stringify(a)}`); };
const checkTrue = (n, c, d) => { if (c) passed++; else failures.push(`${n}${d ? '\n      ' + d : ''}`); };
const section = t => console.log('\n' + t);

function fullCharacter() {
  Store.reset();
  Store.setMoney('grossAnnualIncomeCents', 7200000);
  Store.setMoney('monthlyExpensesCents', 315000);
  Store.setMoney('cashCents', 950000);
  Store.setMoney('investmentsCents', 4800000);
  Store.setDebt(2160000, true);
  Store.setFilingStatus('single');
  Store.patchProfile({ yearsSustained: 2, disruptionSurvived: false });
  return Store.household();
}

section('The envelope');
(function () {
  const env = Export.build(fullCharacter(), TABLES);
  check('format is the exact identifier', env.format, 'dungeons-and-dividends/character');
  check('format version is an integer', typeof env.formatVersion, 'number');
  check('schema version is passed through from the household', env.schemaVersion, 2);
  check('it declares itself partial', env.partial, true);
  checkTrue('it timestamps itself', /^\d{4}-\d\d-\d\dT/.test(env.exportedAt));
  checkTrue('it names its source', !!(env.source && env.source.tool && env.source.url));
  /* Never a literal: if Schema's version moves, the export must move with it. */
  check('schema version tracks Schema, not a hardcoded number',
    Export.build({}).schemaVersion, Schema.createHousehold().schemaVersion);
})();

section('It is PARTIAL — the trap this format exists to avoid');
(function () {
  const env = Export.build(fullCharacter(), TABLES);
  const keys = Object.keys(env.household);

  /* The whole point. A full household dump would carry these as empty values,
     and an importer applying it would silently wipe work the person did in
     SPARKS. They must be ABSENT, not present-and-empty. */
  ['goals', 'ratings', 'worthChecks', 'valuesProfile', 'swan',
   'assumptions', 'assumptionOverrides', 'meta', 'state', 'capturingFullMatch']
    .forEach(k => checkTrue(`${k} is absent, not empty`, keys.indexOf(k) === -1,
      `${k} would overwrite real SPARKS data with nothing`));

  /* And a sanity check that a naive whole-household export WOULD have carried
     them — otherwise the assertions above prove nothing. */
  const naive = Object.keys(Store.household());
  checkTrue('a naive dump really would have included goals',
    naive.indexOf('goals') !== -1,
    'if this fails the test above is vacuous');

  check('contains names exactly the keys present',
    JSON.stringify(env.contains.slice().sort()),
    JSON.stringify(keys.slice().sort()));
  env.contains.forEach(k =>
    checkTrue(`${k} is inside the owned set`, Export.OWNED_KEYS.indexOf(k) !== -1));
})();

section('Absent beats empty, key by key');
(function () {
  Store.reset();
  Store.setMoney('grossAnnualIncomeCents', 5000000);
  const env = Export.build(Store.household(), TABLES);
  checkTrue('no debts entered -> debts omitted entirely',
    env.contains.indexOf('debts') === -1,
    'sending [] would read as "I have no debts" and could clear a real list');
  checkTrue('no assets entered -> assets omitted', env.contains.indexOf('assets') === -1);
  checkTrue('no expenses entered -> expenses omitted', env.contains.indexOf('expenses') === -1);
  checkTrue('but income was entered, so people is present', env.contains.indexOf('people') !== -1);

  /* A debt of zero is a real answer and must NOT be exported as a debt record;
     the store removes the record, so the key drops out. */
  Store.setDebt(0, false);
  checkTrue('an affirmative zero debt still omits the key',
    Export.build(Store.household(), TABLES).contains.indexOf('debts') === -1);
})();

section('An empty sheet exports nothing rather than junk');
(function () {
  Store.reset();
  const env = Export.build(Store.household(), TABLES);
  check('nothing is claimed', env.contains.length, 0);
  check('the household is empty', Object.keys(env.household).length, 0);
  checkTrue('and no summary is invented', env.summary === undefined);
  checkTrue('but it is still a well-formed, valid file',
    Export.validate(env, { expectSchemaVersion: 2 }).ok);
})();

section('The summary is a real read, and optional');
(function () {
  const env = Export.build(fullCharacter(), TABLES);
  check('class name', env.summary.className, 'The Earner');
  check('level', env.summary.level, 3);
  check('HP is in weeks', env.summary.currentHpWeeks, 13);
  check('max HP in weeks', env.summary.maxHpWeeks, 18);
  check('debt burden', env.summary.debtBurden, 2);
  check('percent is a percentage, not a fraction', env.summary.percentOfFiNumber, 5.1);
  /* Unanswered things are absent from the summary, never nulled. */
  checkTrue('unscored stats are absent, not null',
    !('STR' in (env.summary.abilityScores || {})) || env.summary.abilityScores.STR !== null);
  /* Without tables the payload is unaffected — only the summary goes. */
  const noTables = Export.build(fullCharacter());
  checkTrue('no tables -> no summary', noTables.summary === undefined);
  check('but the payload is identical',
    JSON.stringify(noTables.household), JSON.stringify(env.household));
})();

section('Validation, as an importer would run it');
(function () {
  const json = Export.toJSON(fullCharacter(), TABLES);
  const good = Export.validate(json, { expectSchemaVersion: 2 });
  check('a real export validates', good.ok, true);
  check('with no warnings', good.warnings.length, 0);

  check('a string that is not JSON fails', Export.validate('not json {').ok, false);
  check('an array fails', Export.validate([]).ok, false);
  check('an unrelated JSON object fails', Export.validate({ hello: 'world' }).ok, false);
  checkTrue('and says why', /not a dungeons/i.test(Export.validate({ hello: 'world' }).errors[0]));

  const wrongSchema = Export.validate(JSON.parse(json), { expectSchemaVersion: 99 });
  check('a schema-version mismatch is an error', wrongSchema.ok, false);

  /* Forward compatibility: a NEWER file must still import, with a warning,
     because unknown keys are ignorable by design. */
  const newer = JSON.parse(json); newer.formatVersion = Export.FORMAT_VERSION + 1;
  const fwd = Export.validate(newer, { expectSchemaVersion: 2 });
  check('a newer format version still imports', fwd.ok, true);
  checkTrue('but warns about it', fwd.warnings.some(w => /format version/i.test(w)));

  /* An OLDER or nonsense version is a hard error. */
  const older = JSON.parse(json); older.formatVersion = 0;
  check('an older format version is refused', Export.validate(older).ok, false);

  const lying = JSON.parse(json); lying.contains = lying.contains.concat('goals');
  check('contains naming a key that is not there fails', Export.validate(lying).ok, false);

  const sneaky = JSON.parse(json); sneaky.household.goals = [{ id: 'x' }];
  const sneakyResult = Export.validate(sneaky, { expectSchemaVersion: 2 });
  checkTrue('an unlisted key warns rather than passing silently',
    sneakyResult.warnings.length > 0);
})();

section('Round trip: the export rebuilds the same character');
(function () {
  const Character = require(path.join(ROOT, 'engines/character.js'));
  const original = fullCharacter();
  const before = Character.sheet(original, TABLES);
  const env = Export.build(original, TABLES);

  /* Exactly what FORMAT.md tells an importer to do: merge the named keys. */
  const rebuilt = Schema.createHousehold();
  env.contains.forEach(k => { rebuilt[k] = JSON.parse(JSON.stringify(env.household[k])); });
  const after = Character.sheet(rebuilt, TABLES);

  check('same level', after.level.value, before.level.value);
  check('same class', after.suggestedClass.value, before.suggestedClass.value);
  check('same debt burden', after.debtBurden.value, before.debtBurden.value);
  check('same current HP', after.currentHp.value, before.currentHp.value);
  check('same max HP', after.maxHp.weeks, before.maxHp.weeks);
  check('same CON', after.stats.CON.value, before.stats.CON.value);
  check('the game state survived', after.subScores.consistency.value, before.subScores.consistency.value);
})();

section('Merging does not clobber an existing SPARKS household');
(function () {
  /* The scenario the format is shaped around: someone has already used SPARKS,
     has goals and ratings, and imports a character. Merging the named keys
     must leave everything this tool does not own completely untouched. */
  const existing = Schema.createHousehold();
  existing.goals = [{ id: 'g1', label: 'House deposit' }];
  existing.worthChecks = [{ id: 'w1' }];
  existing.state = 'NC';
  const before = JSON.stringify({ goals: existing.goals, worthChecks: existing.worthChecks, state: existing.state });

  const env = Export.build(fullCharacter(), TABLES);
  env.contains.forEach(k => { existing[k] = JSON.parse(JSON.stringify(env.household[k])); });

  check('goals survived', JSON.stringify(existing.goals), JSON.stringify([{ id: 'g1', label: 'House deposit' }]));
  check('worth checks survived', existing.worthChecks.length, 1);
  check('state survived', existing.state, 'NC');
  check('and the character did land', existing.dndProfile.yearsSustained, 2);
  checkTrue('nothing this tool does not own was touched',
    JSON.stringify({ goals: existing.goals, worthChecks: existing.worthChecks, state: existing.state }) === before);
})();

section('Stable ids, so a re-import updates rather than duplicates');
(function () {
  const env = Export.build(fullCharacter(), TABLES);
  check('person id', env.household.people[0].id, 'dnd_person');
  check('income id', env.household.people[0].incomeSources[0].id, 'dnd_income');
  check('cash id', env.household.assets[0].id, 'dnd_asset_cash');
  check('debt id', env.household.debts[0].id, 'dnd_debt_total');
  checkTrue('every id is namespaced',
    env.household.assets.every(a => a.id.indexOf('dnd_') === 0));
})();

console.log('\n' + '─'.repeat(66));
if (!failures.length) { console.log(`✓ ${passed} checks passed`); process.exit(0); }
console.log(`✗ ${failures.length} failed, ${passed} passed\n`);
failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
process.exit(1);
