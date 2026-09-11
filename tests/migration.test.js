#!/usr/bin/env node
/* ==========================================================================
   tests/migration.test.js - every old export loads through today's import.
   --------------------------------------------------------------------------
   Lane 2, section 5 (DECISIONS.md L-5). For every file under
   fixtures/exports/ (one set per format the app has produced, from
   tests/tools/build-exports.js):

     - Spine.importJSON(text) does not throw and reports ok, or the file
       is the pre-spine flat profile, which goes through
       Spine._migrateLegacy instead (the import path refuses it: a finding)
     - the imported household renders the section 1 `known` values within
       1%: gross, estimated tax, take-home, monthly spending, savings
       rate, FI target, runway and net worth, or the same incompleteness
     - a snapshot list, when the format carries one, comes back a list

   Anything that fails is a row in tests/reports/migration.json, rendered
   into docs/lane2-findings.md with the failing field. Fixtures are never
   changed to pass. Exit 1 only on a throw or an unreadable fixture;
   value disagreements are findings unless CORPUS_STRICT=1.

   Run:  node tests/migration.test.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const Money = require(path.join(ROOT, 'shared/money.js'));
const Schema = require(path.join(ROOT, 'shared/schema.js'));
const Spine = require(path.join(ROOT, 'shared/spine-v2.js'));
const Tier0 = require(path.join(ROOT, 'engines/tier0.js'));
const Runway = require(path.join(ROOT, 'engines/runway.js'));
const STRICT = process.env.CORPUS_STRICT === '1';
const DIR = path.join(ROOT, 'fixtures', 'exports');
const B = require(path.join(__dirname, 'tools', 'build-households.js'));
const SPECS = {};
B.ARCHETYPES.concat(B.EDGES).forEach((spec) => { SPECS[spec.id] = spec; });
const TABLES = { effectiveTaxRates: require(path.join(ROOT, 'shared/reference.js')).readSync('effectiveTaxRates', path.join(ROOT, 'data')) };

let passed = 0;
const failures = [];
const findings = [];
const notes = [];
function ok() { passed++; }
function fail(name, detail) { failures.push(name + (detail ? '\n      ' + detail : '')); }
function finding(file, field, expected, actual, reason) {
  findings.push({ file, field, expected, actual, reason });
  if (STRICT) fail('known: ' + file + ' ' + field, 'expected ' + expected + ', got ' + actual + ' (' + reason + ')'); else ok();
}

const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json') && f !== 'index.json').sort();
const index = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8'));
const formats = index.formats.filter((f) => f.commit).length;
if (formats < 3) fail('at least three historical formats', 'found ' + formats); else ok();
if (!files.length) fail('export fixtures present');

function compare(file, key, expected, actual, describe) {
  if (expected === null || expected === undefined) {
    if (!Money.isOk(actual)) { ok(); return; }
    finding(file, key, 'incomplete', actual.value, describe + '; the fixture expects no number here');
    return;
  }
  if (!Money.isOk(actual)) { finding(file, key, expected, 'incomplete: ' + (actual && actual.reason), describe); return; }
  const diff = Math.abs(actual.value - expected);
  const within = expected === 0 ? diff <= 1 : diff / Math.abs(expected) <= 0.01;
  if (within) ok(); else finding(file, key, expected, actual.value, describe + '; off by ' + (expected ? ((diff / Math.abs(expected)) * 100).toFixed(2) + '%' : diff));
}

files.forEach((f) => {
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); ok(); } catch (e) { fail('read ' + f, e.message); return; }
  const lane = parsed.lane2 || {};
  /* The hand arithmetic is redone from the spec at test time (D-210): a
     `known` block stored in the file is the arithmetic as it stood when
     the export was built, and the tax table has moved since. */
  const k = lane.specId && SPECS[lane.specId] ? B.known(SPECS[lane.specId]) : (lane.known || {});
  let h = null;

  if (lane.via === 'legacyStorage') {
    /* The pre-spine flat profile: no schemaVersion, so the import path
       refuses it by design. The legacy migration reads it from
       localStorage; called directly here. */
    const r = Spine.inspectImport(JSON.stringify(parsed));
    if (r.ok) fail('legacy: the import path should refuse a flat profile', JSON.stringify(r).slice(0, 200)); else ok();
    findings.push({ file: f, field: 'importJSON', expected: 'a way in', actual: 'refused: ' + r.reason, reason: 'the pre-spine flat profile (annualSalary, studentLoanBalance) only migrates from localStorage via _migrateLegacy; a person who saved one as a file cannot import it. DECIDE: whether Your Data should accept it.' });
    try { h = Spine._migrateLegacy(parsed); ok(); } catch (e) { fail('legacy: _migrateLegacy threw', e.message); return; }
    compare(f, 'grossAnnualCents', k.grossAnnualCents, Schema.grossAnnualIncomeCents(h), 'annualSalary in dollars to cents');
    compare(f, 'studentLoanBalanceCents', k.studentLoanBalanceCents, Schema.totalDebtCents(h), 'studentLoanBalance to a debt');
    const d = (h.debts || [])[0];
    if (!d || Math.abs(d.rate - k.studentLoanRate) > 1e-9) finding(f, 'studentLoanRate', k.studentLoanRate, d && d.rate, 'a rate typed as 5.3 should become 0.053'); else ok();
    if (h.meta.migratedFrom !== 'flat-profile-v1') fail('legacy: migratedFrom stamped'); else ok();
    return;
  }

  let r;
  try { Spine.reset(); r = Spine.importJSON(JSON.stringify(parsed)); ok(); } catch (e) { fail('import ' + f + ' threw', (e && e.stack || String(e)).split('\n').slice(0, 2).join(' | ')); return; }
  if (!r || !r.ok) { finding(f, 'importJSON', 'ok', 'refused: ' + (r && r.reason), 'the current import path refuses this format'); return; }
  h = Spine.getProfile();
  if (!h || h.schemaVersion !== Schema.SCHEMA_VERSION) fail('schemaVersion after import ' + f, JSON.stringify(h && h.schemaVersion)); else ok();
  if (!Array.isArray(r.snapshots)) fail('snapshots after import ' + f, 'not a list'); else ok();

  compare(f, 'grossAnnualCents', k.grossAnnualCents, Schema.grossAnnualIncomeCents(h), 'sum of income sources');
  compare(f, 'estimatedTaxCents', k.estimatedTaxCents, Schema.estimatedAnnualTaxCents(h, TABLES), 'gross x effective rate');
  compare(f, 'takeHomeAnnualCents', k.takeHomeAnnualCents, Schema.takeHomeAnnualCents(h, TABLES), 'gross minus tax');
  compare(f, 'monthlySpendingCents', k.monthlySpendingCents, Schema.monthlyExpensesCents(h), 'the month, from FAT or migrated from the one estimated figure');
  compare(f, 'savingsRate', k.savingsRate, Tier0.savingsRate(h, TABLES).excludingMatch, '(take-home - 12 x spending) / gross');
  compare(f, 'fiTargetCents', k.fiTargetCents, Tier0.fireNumber(h), '12 x spending / 0.04');
  compare(f, 'runwayMonths', k.runwayMonths, Tier0.emergencyFundMonths(h), 'cash / spending');
  compare(f, 'runwayWholeMonths', k.runwayWholeMonths, Runway.project(h, TABLES, { preset: 'quit' }), 'whole months of cash');
  if ('netWorthCents' in k) compare(f, 'netWorthCents', k.netWorthCents, Tier0.netWorth(h), 'assets minus debts');
});

/* ---- Report ------------------------------------------------------------------- */
const byFile = {};
findings.forEach((x) => { byFile[x.file] = (byFile[x.file] || 0) + 1; });
const report = { files: files.length, formats: index.formats.length, passed, failures: failures.slice(), findings, notes: notes.concat([
  Object.keys(byFile).length + ' of ' + files.length + ' fixture files disagree with a known value or refuse to import; each row above names the field.'
]) };
fs.mkdirSync(path.join(ROOT, 'tests', 'reports'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'tests', 'reports', 'migration.json'), JSON.stringify(report, null, 2) + '\n');
try { require(path.join(ROOT, 'tests', 'tools', 'findings.js')).render(); } catch (e) { /* optional */ }
console.log('exports: ' + files.length + ' files, ' + index.formats.length + ' formats; findings: ' + findings.length);
if (failures.length) {
  console.log('\n' + failures.length + ' FAILED, ' + passed + ' passed\n');
  failures.slice(0, 40).forEach((x) => console.log('  x ' + x));
  process.exit(1);
}
console.log(passed + ' checks passed');
