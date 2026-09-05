#!/usr/bin/env node
/* ==========================================================================
   test/export.js — the household leaves and comes back unchanged.
   --------------------------------------------------------------------------
   Export → import must be a deep-equal round trip on the demo persona, the
   share code must round-trip too, and a full household with snapshots has
   to fit in a URL fragment well under 8 KB. Nothing here needs a browser:
   the spine uses the same CompressionStream Node ships.

   Run:  node test/export.js
   ========================================================================== */
'use strict';
const path = require('path');
const assert = require('assert');
const ROOT = path.join(__dirname, '..');
const Spine = require(path.join(ROOT, 'shared/spine-v2.js'));
const Schema = require(path.join(ROOT, 'shared/schema.js'));
const Demo = require(path.join(ROOT, 'shared/demo-persona.js'));
require(path.join(ROOT, 'shared/ownership.js'));   /* registers the field reader */
const Instruments = require(path.join(ROOT, 'shared/instruments.js'));

let passed = 0, failed = 0;
function ok(name, cond, detail) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.log('  ✗ ' + name + (detail ? '\n      ' + detail : '')); }
}
function eq(name, a, b) {
  let same = false;
  try { assert.deepStrictEqual(a, b); same = true; } catch (e) { /* differ */ }
  ok(name, same, same ? '' : 'differ: ' + JSON.stringify(a).slice(0, 120) + ' vs ' + JSON.stringify(b).slice(0, 120));
}

const TABLES = {};
[['effectiveTaxRates', 'effective_tax_rates_2026'], ['ratioBenchmarks', 'ratio_benchmarks'], ['fooRules', 'foo_rules'],
 ['irsLimits', 'irs_limits_2026'], ['retirementMilestones', 'retirement_milestones'],
 ['netWorthPercentiles', 'net_worth_percentiles_scf_2022'], ['fireVariants', 'fire_variants'],
 ['expenseCategories', 'expense_categories']].forEach(([k, f]) => { TABLES[k] = require(path.join(ROOT, 'data', f + '.json')); });

function loadDemo() {
  Spine.reset();
  const d = Demo.build();
  Spine.updateProfile({ people: d.people, filingStatus: d.filingStatus, state: d.state,
    assets: d.assets, debts: d.debts, expenses: d.expenses, capturingFullMatch: d.capturingFullMatch,
    retirement: d.retirement, insurance: d.insurance });
}

(async () => {
  console.log('\nExport → import');
  loadDemo();
  Instruments.snapshot(Spine.getProfile(), TABLES);
  Instruments.snapshot(Spine.getProfile(), TABLES);
  const before = Spine.getProfile();
  const snapsBefore = Spine.listSnapshots();
  const text = Spine.exportJSON();
  const parsed = JSON.parse(text);
  ok('the export names its format', parsed.format === 'slaf-export');
  ok('and the schema it carries', parsed.schemaVersion === Schema.SCHEMA_VERSION);
  ok('and when it was made', /^\d{4}-\d{2}-\d{2}T/.test(parsed.exportedAt));
  ok('the filename is dated', /^slaf-household-\d{4}-\d{2}-\d{2}\.json$/.test(Spine.exportFilename()));

  Spine.reset();
  ok('after a reset the household is empty', Spine.getProfile().people.length === 0);
  const r = Spine.importJSON(text);
  ok('import accepts the file', r.ok === true, r.reason);
  /* The command log is this browser's, not the household's: an export
     leaves it behind, so it is not part of "identical" (D-094). */
  function sansLog(h) { const c = JSON.parse(JSON.stringify(h)); delete c.meta.undoStack; delete c.meta.redoStack; return c; }
  eq('the household comes back identical', sansLog(Spine.getProfile()), sansLog(before));
  ok('… without the undo log, which stays with the browser that made it', text.indexOf('undoStack') === -1);
  eq('and so do the snapshots', Spine.listSnapshots(), snapsBefore);

  console.log('\nImport refuses what it should');
  ok('not JSON', Spine.inspectImport('{nope').ok === false);
  ok('JSON with no household', Spine.inspectImport('{"a":1}').ok === false);
  const future = JSON.parse(text); future.household.schemaVersion = Schema.SCHEMA_VERSION + 1;
  const f = Spine.inspectImport(JSON.stringify(future));
  ok('a newer schema', f.ok === false && /newer/.test(f.reason), f.reason);
  ok('and inspecting writes nothing', Spine.getProfile().people.length === 1);
  const bare = Spine.inspectImport(JSON.stringify(before));
  ok('a bare household (the stored shape) is accepted', bare.ok === true && bare.snapshots.length === 0);

  console.log('\nShare code');
  loadDemo();
  Instruments.snapshot(Spine.getProfile(), TABLES);
  const exp = Spine.exportObject();
  const code = await Spine.toShareCode(exp);
  ok('the code is compressed when the platform can', code.charAt(0) === 'z');
  ok('and is URL-safe', /^[A-Za-z0-9_-]+$/.test(code));
  const frag = await Spine.shareFragment(exp);
  ok('the fragment is #h=code', frag.indexOf('#h=') === 0);
  ok('and comes back out of a hash', Spine.codeFromFragment(frag) === code);
  ok('even beside other params', Spine.codeFromFragment('#x=1&h=' + code) === code);
  ok('and is null when absent', Spine.codeFromFragment('#out-weather') === null);
  const back = await Spine.fromShareCode(code);
  eq('the share code round-trips the export', back, exp);
  const sizeBytes = Buffer.byteLength(frag);
  ok('a full household with a snapshot fits well under 8 KB (' + sizeBytes + ' bytes)', sizeBytes < 8192);

  const plain = await Spine.toShareCode(exp).then(c => 'j' + Buffer.from(JSON.stringify(exp)).toString('base64url'));
  const backPlain = await Spine.fromShareCode(plain);
  eq('a plain (uncompressed) code reads too', backPlain, exp);
  let threw = null;
  try { await Spine.fromShareCode('q' + code.slice(1)); } catch (e) { threw = e.message; }
  ok('an unknown prefix is refused', !!threw, threw);
  threw = null;
  try { await Spine.fromShareCode(''); } catch (e) { threw = e.message; }
  ok('an empty code is refused', !!threw);

  console.log('\n' + '─'.repeat(66));
  if (failed) { console.log('✗ ' + failed + ' failed, ' + passed + ' passed'); process.exit(1); }
  console.log('✓ ' + passed + ' checks passed');
})().catch(e => { console.error(e); process.exit(1); });
