/* ==========================================================================
   tests/tools/findings.js - renders docs/lane2-findings.md from the reports.
   --------------------------------------------------------------------------
   Every lane 2 suite writes a JSON report under tests/reports/ and calls
   render(). The findings file is generated in full each time, in a fixed
   order, so a diff of it is a diff of what the suites found: nothing is
   edited by hand, and no fixture or engine is changed to make a row go
   away. A suite that has not run yet simply has no section.
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const REPORTS = path.join(ROOT, 'tests', 'reports');
const OUT = path.join(ROOT, 'docs', 'lane2-findings.md');

function read(name) {
  try { return JSON.parse(fs.readFileSync(path.join(REPORTS, name + '.json'), 'utf8')); } catch (e) { return null; }
}
function money(v) { return typeof v === 'number' ? '$' + (v / 100).toLocaleString('en-US', { maximumFractionDigits: 2 }) : String(v); }
function cell(key, v) { return /Cents$/.test(key) ? money(v) : (typeof v === 'number' ? v.toFixed(4) : String(v)); }
function compact(v) { const s = JSON.stringify(v); return s.length > 700 ? s.slice(0, 700) + ' ...' : s; }

function corpusSection(r) {
  const L = [];
  L.push('## Section 1: the synthetic household corpus');
  L.push('');
  L.push('Corpus: ' + r.archetypes + ' archetypes, ' + r.edges + ' edge cases. Sweep: ' + r.sweep.functions + ' household-first functions across ' + r.sweep.engines + ' engines, ' + r.sweep.calls + ' calls. Source: `tests/corpus.test.js`.');
  L.push('');
  L.push('### Where the engine disagrees with the hand arithmetic');
  L.push('');
  if (!r.findings.length) L.push('None. Every `known` value in every fixture is within 1% of the engine, and every expected incompleteness is incomplete.');
  else {
    L.push('| fixture | value | hand arithmetic | engine | why it matters |');
    L.push('|---|---|---|---|---|');
    r.findings.forEach((f) => L.push('| ' + f.fixture + ' | ' + f.key + ' | ' + cell(f.key, f.expected) + ' | ' + cell(f.key, f.actual) + ' | ' + f.reason + ' |'));
    L.push('');
    L.push('#### The working behind each');
    L.push('');
    const seen = new Set();
    r.findings.forEach((f) => { if (seen.has(f.fixture)) return; seen.add(f.fixture); L.push('**' + f.fixture + '**'); L.push(''); f.working.forEach((w) => L.push('- ' + w)); L.push(''); });
  }
  L.push('');
  L.push('### Throws, NaN and forbidden negatives');
  L.push('');
  if (!r.failures.length) L.push('None. No household-first engine function threw when called with real arguments, nothing returned NaN or Infinity, and no runway, tax, months or FI figure came back negative.');
  else r.failures.forEach((f) => L.push('- ' + f.replace(/\n\s*/g, ' ').slice(0, 400)));
  L.push('');
  L.push('### Functions the sweep could not call generically');
  L.push('');
  L.push('These take an argument the sweep has no real value for (a skill, a goal, a template, an offer). They were called with that argument undefined; a throw there is the missing argument, not a finding. The property files under `tests/properties/` give each a real value where one exists.');
  L.push('');
  if (!r.uncallable.length) L.push('None.');
  else { L.push('| function | parameters | needs |'); L.push('|---|---|---|'); r.uncallable.forEach((u) => L.push('| ' + u.fn + ' | ' + u.params + ' | ' + u.needs + ' |')); }
  L.push('');
  L.push('### Notes the corpus itself raises');
  L.push('');
  r.notes.forEach((n) => L.push('- ' + n));
  L.push('');
  return L;
}

function propertiesSection(r) {
  const L = [];
  L.push('## Section 2: property tests');
  L.push('');
  L.push('Seed ' + r.seed + ', ' + r.numRuns + ' cases per property, ' + r.files + ' files for ' + r.engines + ' engines, ' + r.totalProperties + ' properties, ' + r.failedProperties + ' failing. Source: `tests/properties/run.js`. A failing row carries the shrunk spec (dollars) that breaks it; `tests/properties/_harness.js` `build()` turns it back into a household.');
  L.push('');
  if (r.missingFiles.length) { L.push('Engines without a property file: ' + r.missingFiles.join(', ')); L.push(''); }
  L.push('### Failing properties');
  L.push('');
  const bad = [];
  r.suites.forEach((s) => s.properties.forEach((p) => { if (!p.ok) bad.push({ engine: s.engine, p }); }));
  if (!bad.length) L.push('None. Every property held on every generated household at this seed.');
  else {
    bad.forEach((b) => {
      L.push('**' + b.engine + ': ' + b.p.name + '**');
      L.push('');
      L.push('- Reason: ' + b.p.reason);
      L.push('- Minimal spec: `' + compact(b.p.counterexample) + '`');
      if (b.p.note) L.push('- Note: ' + b.p.note);
      L.push('');
    });
  }
  L.push('### Notes from the property files: what could not be held yet, and what a failure means');
  L.push('');
  const notes = [];
  r.suites.forEach((s) => (s.notes || []).forEach((n) => notes.push(s.engine + ': ' + n)));
  if (!notes.length) L.push('None.');
  else notes.forEach((n) => L.push('- ' + n));
  L.push('');
  L.push('### What each engine is held to');
  L.push('');
  L.push('| engine | properties |');
  L.push('|---|---|');
  r.suites.forEach((s) => L.push('| ' + s.engine + ' | ' + s.properties.map((p) => (p.ok ? '' : 'FAIL: ') + p.name).join('; ') + ' |'));
  L.push('');
  return L;
}

function dataSection(r) {
  const L = [];
  L.push('## Section 3: sourced data tables');
  L.push('');
  L.push(r.passed + ' checks over ' + r.files.length + ' files. Source: `tests/data.test.js`. A note is a disagreement between a lane 2 table and the copy an engine reads today, or a cell the rule had to make an exception for; each carries a DECIDE:.');
  L.push('');
  L.push('### Failures');
  L.push('');
  if (!r.failures.length) L.push('None.'); else r.failures.forEach((f) => L.push('- ' + f.replace(/\n\s*/g, ' ')));
  L.push('');
  L.push('### Notes');
  L.push('');
  r.notes.forEach((n) => L.push('- ' + n));
  L.push('');
  return L;
}

function render() {
  const corpus = read('corpus');
  const properties = read('properties');
  const data = read('data');
  const L = [];
  L.push('# Lane 2 findings');
  L.push('');
  L.push('Generated by the lane 2 suites from `tests/reports/*.json`; regenerated in full on every run. Do not edit by hand. If a fixture is wrong, change its spec in `tests/tools/build-households.js`; if an engine is wrong, write the fix as a proposal in `docs/lane2-proposals.md`. A fixture is never changed to match an engine, and no engine is changed from this lane.');
  L.push('');
  if (corpus) L.push.apply(L, corpusSection(corpus));
  if (properties) L.push.apply(L, propertiesSection(properties));
  if (data) L.push.apply(L, dataSection(data));
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, L.join('\n') + '\n');
  return OUT;
}

module.exports = { render, read, REPORTS };
if (require.main === module) console.log('wrote ' + render());
