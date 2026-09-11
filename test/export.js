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
  /* D-200: the share sheet, where there is one. */
  ok('the share sheet helper exists and refuses politely where there is no sheet', typeof Spine.sendToDevice === 'function');
  let noSheet = null; try { await Spine.sendToDevice(); } catch (e) { noSheet = e.message; }
  ok('...saying to use the file or the link', /Download the file or copy the link/.test(noSheet || ''));
  /* D-203: a browser that has a sheet and refuses it (an in-app browser). */
  const denied = () => { const e = new Error('Permission denied'); e.name = 'NotAllowedError'; return Promise.reject(e); };
  const setNav = (v) => Object.defineProperty(global, 'navigator', { value: v, configurable: true, writable: true });
  const origNav = Object.getOwnPropertyDescriptor(global, 'navigator');
  setNav({ share: denied, canShare: () => true });
  global.File = function (parts, name) { this.name = name; };
  let blocked = null; try { await Spine.sendToDevice(); } catch (e) { blocked = e; }
  ok('a sheet that refuses twice gives one plain, marked error', !!blocked && blocked.blocked === true && /would not open the share sheet/.test(blocked.message) && /Chrome or Safari/.test(blocked.message), blocked && blocked.message);
  let calls = 0;
  setNav({ share: (d) => { calls++; return d.files ? denied() : Promise.resolve(); }, canShare: () => true });
  const viaLink = await Spine.sendToDevice();
  ok('a sheet that refuses the file gets the link instead', viaLink.how === 'link' && calls === 2);
  setNav({ share: () => { const e = new Error('cancel'); e.name = 'AbortError'; return Promise.reject(e); }, canShare: () => true });
  let cancel = null; try { await Spine.sendToDevice(); } catch (e) { cancel = e; }
  ok('a cancel is still a cancel, not a refusal', !!cancel && cancel.name === 'AbortError' && !cancel.blocked);
  if (origNav) Object.defineProperty(global, 'navigator', origNav); else delete global.navigator;
  delete global.File;
  /* D-204: the browser is asked to keep the data on the first write, and the answer is remembered. */
  {
    let asked = 0;
    setNav({ storage: { persist: () => { asked++; return Promise.resolve(true); } } });
    const recorded = {};
    global.SLAF = { Prefs: { set: (k, v) => { recorded[k] = v; }, get: (k, d) => (k in recorded ? recorded[k] : d) } };
    global.localStorage = { _s: {}, getItem(k) { return k in this._s ? this._s[k] : null; }, setItem(k, v) { this._s[k] = String(v); }, removeItem(k) { delete this._s[k]; } };
    const spinePath = require('path').join(__dirname, '..', 'shared', 'spine-v2.js');
    delete require.cache[require.resolve(spinePath)];
    const Sp = require(spinePath);
    Sp.ensurePrimaryPerson('You');
    Sp.set('people.0.age', 40, 'age');
    await new Promise(r => setTimeout(r, 0));
    ok('persist() was asked once on the first write', asked === 1);
    ok('and the answer is remembered in Prefs', recorded['storage.persisted'] === true);
    ok('and readable from the spine', Sp.storageState().persisted === true);
    delete require.cache[require.resolve(spinePath)]; delete global.localStorage; delete global.SLAF;
    if (origNav) Object.defineProperty(global, 'navigator', origNav); else delete global.navigator;
  }
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
