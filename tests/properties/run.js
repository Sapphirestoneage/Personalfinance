#!/usr/bin/env node
/* ==========================================================================
   tests/properties/run.js - runs every *.test.js here, one per engine.
   --------------------------------------------------------------------------
   Lane 2, section 2 (DECISIONS.md L-2). Checks that every engine under
   engines/ has a property file, runs each file's suite with a fixed seed
   (FC_SEED, default 20260910) and FC_RUNS cases per property (default 40),
   writes tests/reports/properties.json, re-renders docs/lane2-findings.md,
   and fails if an engine has no file or the whole suite takes longer than
   two minutes. A property a shrunk household breaks is a finding for the
   master build, written to the findings file; it fails the run only with
   CORPUS_STRICT=1 (the same DECIDE: as the corpus test).

   Run:  node tests/properties/run.js            (all)
         node tests/properties/tier0.test.js     (one)
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const H = require('./_harness.js');
const ROOT = H.ROOT;
const BUDGET_MS = 120000;

const started = Date.now();
const engines = fs.readdirSync(path.join(ROOT, 'engines')).filter((f) => f.endsWith('.js')).map((f) => f.replace(/\.js$/, '')).sort();
const files = fs.readdirSync(__dirname).filter((f) => f.endsWith('.test.js')).sort();
const covered = files.map((f) => f.replace(/\.test\.js$/, ''));
const missing = engines.filter((e) => covered.indexOf(e) === -1);
const extra = covered.filter((e) => engines.indexOf(e) === -1);

const report = { seed: H.SEED, numRuns: H.NUM_RUNS, engines: engines.length, files: files.length, missingFiles: missing, extraFiles: extra, suites: [] };
let failed = 0, total = 0;
files.forEach(function (f) {
  const s = require(path.join(__dirname, f));
  const t0 = Date.now();
  const r = H.runSuite(s);
  const ms = Date.now() - t0;
  r.properties.forEach((p) => { total++; if (!p.ok) failed++; });
  report.suites.push({ engine: r.engine, notes: r.notes, properties: r.properties.map((p) => { const o = Object.assign({}, p); delete o.ms; return o; }) });
  const bad = r.properties.filter((p) => !p.ok);
  console.log((bad.length ? 'FAIL ' : 'ok   ') + r.engine.padEnd(16) + r.properties.length + ' properties  ' + ms + 'ms');
  bad.forEach((p) => console.log('       x ' + p.name + '\n         ' + p.reason + '\n         ' + JSON.stringify(p.counterexample)));
});
const elapsed = Date.now() - started;
report.totalProperties = total;
report.failedProperties = failed;
fs.mkdirSync(path.join(ROOT, 'tests', 'reports'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'tests', 'reports', 'properties.json'), JSON.stringify(report, null, 2) + '\n');
require(path.join(ROOT, 'tests', 'tools', 'findings.js')).render();

console.log('\n' + files.length + ' files for ' + engines.length + ' engines; ' + total + ' properties, ' + failed + ' failing; ' + (elapsed / 1000).toFixed(1) + 's');
if (missing.length) console.log('engines without a property file: ' + missing.join(', '));
if (extra.length) console.log('property files for shared modules (no engine of that name): ' + extra.join(', '));
const STRICT = process.env.CORPUS_STRICT === '1';
if (failed && !STRICT) console.log('failing properties are findings for the master build (docs/lane2-findings.md); CORPUS_STRICT=1 makes them fail the run');
if (missing.length || (failed && STRICT) || elapsed > BUDGET_MS) {
  if (elapsed > BUDGET_MS) console.log('over the two-minute budget');
  process.exit(1);
}
