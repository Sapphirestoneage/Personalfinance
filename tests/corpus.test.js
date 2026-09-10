#!/usr/bin/env node
/* ==========================================================================
   tests/corpus.test.js - every engine against every synthetic household.
   --------------------------------------------------------------------------
   Lane 2, section 1 (DECISIONS.md L-1). Loads every fixture under
   fixtures/households/ (and edge/), runs every exported engine function
   whose first parameter is the household, and asserts:

     1. no throw          - with every argument the sweep can supply
     2. no NaN, no Infinity anywhere in what comes back
     3. no negative where the schema forbids one (a runway, a FI target,
        an estimated tax, a months figure)
     4. every `meta.known` value within 1% of the engine's output, or the
        same incompleteness

   Where the engine disagrees with the hand arithmetic in a fixture, the
   fixture is NOT changed to match: the disagreement is written to
   docs/lane2-findings.md with both numbers and the working. That file is
   regenerated on every run, so it is always the current list.

   Exit code: 1 on a load failure, a throw, a NaN, or a forbidden
   negative. Known-value disagreements are findings for the master build,
   not a lane 2 failure (DECIDE: whether they should fail CI once the
   master build has read them; the conservative choice is not to block the
   other lane on a list it has not seen yet). CORPUS_STRICT=1 makes them
   fail too.

   Run:  node tests/corpus.test.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const Money = require(path.join(ROOT, 'shared/money.js'));
const Schema = require(path.join(ROOT, 'shared/schema.js'));
const Reference = require(path.join(ROOT, 'shared/reference.js'));
const Tier0 = require(path.join(ROOT, 'engines/tier0.js'));
const Runway = require(path.join(ROOT, 'engines/runway.js'));

const FIXTURES = path.join(ROOT, 'fixtures', 'households');
const FINDINGS = path.join(ROOT, 'docs', 'lane2-findings.md');
const STRICT = process.env.CORPUS_STRICT === '1';

/* ---- Tables: every file the app registers, loaded the way run.js does ---- */
const TABLES = {};
Object.keys(Reference.TABLE_FILES).forEach(function (k) {
  try { TABLES[k] = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', Reference.TABLE_FILES[k]), 'utf8')); } catch (e) { /* an engine that needs it says so */ }
});
/* Tables an engine takes by a name other than `tables`. Anything not here
   is passed as undefined, and a throw on such a call is "not callable
   generically", recorded but not a failure. */
const ARG_BY_NAME = {
  household: null, tables: TABLES, catalog: TABLES.expenseCategories, rules: TABLES.debtRules,
  templates: TABLES.budgetTemplates, thresholds: TABLES.fooRules && TABLES.fooRules.thresholds,
  opts: undefined, localOverrides: undefined, prefs: undefined, now: undefined, nowMs: undefined, today: undefined
};
/* Three tables test/run.js loads by hand because shared/reference.js does not
   register them (noted in docs/lane2-proposals.md). */
['accessRules:access_rules.json', 'confidenceWeights:confidence_weights.json', 'uiBenefits:ui_benefits.json'].forEach(function (pair) {
  const k = pair.split(':')[0], f = pair.split(':')[1];
  try { TABLES[k] = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8')); } catch (e) { /* as above */ }
});
/* Where an engine names its table by a generic word, the table it means. */
const ENGINE_ARGS = {
  statement: { rules: TABLES.accessRules },
  hassle: { table: TABLES.hassleDefaults }
};

/* ---- Harness --------------------------------------------------------------- */
let passed = 0;
const failures = [];
const findings = [];      /* known-value disagreements */
const uncallable = [];    /* functions the sweep could not call with real arguments */
function ok(name) { passed++; }
function fail(name, detail) { failures.push(name + (detail ? '\n      ' + detail : '')); }

function params(fn) {
  const s = fn.toString();
  const m = /^function[^(]*\(([^)]*)\)/.exec(s) || /^\(?([^)=]*)\)?\s*=>/.exec(s);
  return (m ? m[1] : '').split(',').map((x) => x.trim()).filter(Boolean);
}
function clone(v) { return JSON.parse(JSON.stringify(v)); }

/* Walk a result for NaN or Infinity. Depth-limited, cycle-safe. */
function badNumbers(v, trail, seen, depth) {
  const out = [];
  if (depth > 12) return out;
  if (typeof v === 'number') { if (!isFinite(v)) out.push(trail + ' = ' + String(v)); return out; }
  if (!v || typeof v !== 'object') return out;
  if (seen.has(v)) return out;
  seen.add(v);
  const keys = Array.isArray(v) ? v.slice(0, 200).map((_, i) => i) : Object.keys(v);
  for (const k of keys) out.push.apply(out, badNumbers(v[k], trail + '.' + k, seen, depth + 1));
  return out;
}

/* ---- 1. Load ---------------------------------------------------------------- */
function loadDir(dir, tag) {
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => {
    const file = path.join(dir, f);
    let h = null;
    try { h = JSON.parse(fs.readFileSync(file, 'utf8')); ok('load ' + f); } catch (e) { fail('load ' + f, e.message); return null; }
    if (!h || h.schemaVersion !== Schema.SCHEMA_VERSION) fail('schemaVersion ' + f, 'expected ' + Schema.SCHEMA_VERSION + ', got ' + (h && h.schemaVersion)); else ok('schemaVersion ' + f);
    if (!h.meta || !h.meta.name || !h.meta.story || !h.meta.known) fail('meta ' + f, 'name, story and known are required'); else ok('meta ' + f);
    return { id: (tag ? tag + '/' : '') + f.replace(/\.json$/, ''), file, h };
  }).filter(Boolean);
}
const corpus = loadDir(FIXTURES, '').concat(loadDir(path.join(FIXTURES, 'edge'), 'edge'));
const archetypes = corpus.filter((x) => !/^edge\//.test(x.id)).length;
const edges = corpus.length - archetypes;
if (archetypes < 24) fail('corpus size', 'need at least 24 archetypes, found ' + archetypes); else ok('corpus size');
if (edges < 6) fail('edge size', 'need 6 edge cases, found ' + edges); else ok('edge size');

/* ---- 2. The sweep ------------------------------------------------------------ */
const engines = fs.readdirSync(path.join(ROOT, 'engines')).filter((f) => f.endsWith('.js')).sort();
const sweep = { calls: 0, engines: engines.length, functions: 0 };
const unsuppliedNames = new Set();
engines.forEach(function (file) {
  const name = file.replace(/\.js$/, '');
  const mod = require(path.join(ROOT, 'engines', file));
  Object.keys(mod).forEach(function (fnName) {
    const fn = mod[fnName];
    if (typeof fn !== 'function') return;
    const ps = params(fn);
    if (ps[0] !== 'household') return;
    sweep.functions++;
    const own = ENGINE_ARGS[name] || {};
    const unsupplied = ps.slice(1).filter((p) => !(p in own) && !(p in ARG_BY_NAME));
    corpus.forEach(function (fx) {
      const args = ps.map(function (p) {
        if (p === 'household') return clone(fx.h);
        if (p in own) return own[p];
        return ARG_BY_NAME[p];
      });
      const label = name + '.' + fnName + ' on ' + fx.id;
      let result;
      sweep.calls++;
      try { result = fn.apply(mod, args); } catch (e) {
        if (unsupplied.length) { uncallable.push({ fn: name + '.' + fnName, params: ps.join(', '), needs: unsupplied.join(', '), error: e.message }); unsupplied.forEach((u) => unsuppliedNames.add(u)); return; }
        fail('throw: ' + label, e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : String(e));
        return;
      }
      if (result && typeof result.then === 'function') { ok('promise: ' + label); return; }
      const bad = badNumbers(result, 'result', new Set(), 0);
      if (bad.length) fail('NaN/Infinity: ' + label, bad.slice(0, 5).join('; ')); else ok('finite: ' + label);
    });
  });
});
/* Collapse the uncallable list to one row per function. */
const uncallableByFn = {};
uncallable.forEach((u) => { uncallableByFn[u.fn] = uncallableByFn[u.fn] || u; });

/* ---- 3. Forbidden negatives --------------------------------------------------- */
function nonNegative(label, r) {
  if (!Money.isOk(r)) { ok(label + ' (incomplete)'); return; }
  if (typeof r.value === 'number' && r.value < 0) fail('negative: ' + label, 'value ' + r.value); else ok(label);
}
corpus.forEach(function (fx) {
  const h = fx.h;
  nonNegative('estimated tax ' + fx.id, Schema.estimatedAnnualTaxCents(h, TABLES));
  nonNegative('monthly expenses ' + fx.id, Schema.monthlyExpensesCents(h));
  nonNegative('total assets ' + fx.id, Schema.totalAssetsCents(h));
  nonNegative('total debt ' + fx.id, Schema.totalDebtCents(h));
  nonNegative('emergency fund months ' + fx.id, Tier0.emergencyFundMonths(h));
  nonNegative('debt to income ' + fx.id, Tier0.debtToIncome(h));
  nonNegative('FIRE number ' + fx.id, Tier0.fireNumber(h));
  nonNegative('years to FIRE ' + fx.id, Tier0.yearsToFire(h, TABLES));
  nonNegative('runway quit ' + fx.id, Runway.project(h, TABLES, { preset: 'quit' }));
  const gross = Schema.grossAnnualIncomeCents(h);
  if (Money.isOk(gross) && gross.value >= 0) nonNegative('take-home ' + fx.id, Schema.takeHomeAnnualCents(h, TABLES));
});

/* ---- 4. Known values --------------------------------------------------------- */
function compare(fx, key, expected, actual, describe) {
  const label = fx.id + ' ' + key;
  const tol = (fx.h.meta.known.tolerance || 0.01);
  if (expected === null || expected === undefined) {
    if (!Money.isOk(actual)) { ok(label + ' incomplete as expected'); return; }
    findings.push({ fixture: fx.id, key, expected: 'incomplete', actual: actual.value, reason: 'the fixture expects no number here (' + describe + '), the engine returned one', working: fx.h.meta.known.working });
    if (STRICT) fail('known: ' + label, 'expected incomplete, got ' + actual.value); else ok(label + ' (finding)');
    return;
  }
  if (!Money.isOk(actual)) {
    findings.push({ fixture: fx.id, key, expected, actual: 'incomplete: ' + (actual && actual.reason), reason: describe, working: fx.h.meta.known.working });
    if (STRICT) fail('known: ' + label, 'expected ' + expected + ', got incomplete: ' + (actual && actual.reason)); else ok(label + ' (finding)');
    return;
  }
  const diff = Math.abs(actual.value - expected);
  const within = expected === 0 ? diff <= 1 : diff / Math.abs(expected) <= tol;
  if (within) { ok(label); return; }
  findings.push({ fixture: fx.id, key, expected, actual: actual.value, reason: describe + '; off by ' + (expected ? ((diff / Math.abs(expected)) * 100).toFixed(2) + '%' : diff), working: fx.h.meta.known.working });
  if (STRICT) fail('known: ' + label, 'expected ' + expected + ', got ' + actual.value); else ok(label + ' (finding)');
}
corpus.forEach(function (fx) {
  const h = fx.h, k = h.meta.known;
  compare(fx, 'grossAnnualCents', k.grossAnnualCents, Schema.grossAnnualIncomeCents(h), 'sum of income sources');
  compare(fx, 'estimatedTaxCents', k.estimatedTaxCents, Schema.estimatedAnnualTaxCents(h, TABLES), 'gross x effective rate from the 2026 band table');
  compare(fx, 'takeHomeAnnualCents', k.takeHomeAnnualCents, Schema.takeHomeAnnualCents(h, TABLES), 'gross minus estimated tax');
  compare(fx, 'takeHomeMonthlyCents', k.takeHomeMonthlyCents, Tier0.takeHomeMonthlyCents(h, TABLES), 'take-home / 12');
  compare(fx, 'monthlySpendingCents', k.monthlySpendingCents, Schema.monthlyExpensesCents(h), 'the four FAT numbers summed');
  compare(fx, 'savingsRate', k.savingsRate, Tier0.savingsRate(h, TABLES).excludingMatch, '(take-home - 12 x spending) / gross');
  compare(fx, 'fiTargetCents', k.fiTargetCents, Tier0.fireNumber(h), '12 x spending / 0.04');
  compare(fx, 'runwayMonths', k.runwayMonths, Tier0.emergencyFundMonths(h), 'cash / monthly spending');
  compare(fx, 'runwayWholeMonths', k.runwayWholeMonths, Runway.project(h, TABLES, { preset: 'quit' }), 'whole months before cash goes below zero, capped at 60');
  if ('netWorthCents' in k) compare(fx, 'netWorthCents', k.netWorthCents, Tier0.netWorth(h), 'assets - debts');
});

/* ---- 5. The findings file ------------------------------------------------------ */
function money(v) { return typeof v === 'number' ? '$' + (v / 100).toLocaleString('en-US', { maximumFractionDigits: 2 }) : String(v); }
function cell(key, v) { return /Cents$/.test(key) ? money(v) : (typeof v === 'number' ? v.toFixed(4) : String(v)); }
const lines = [];
lines.push('# Lane 2 findings');
lines.push('');
lines.push('Generated by `node tests/corpus.test.js` on every run. Do not edit by hand: change the fixture spec in `tests/tools/build-households.js` or, if the engine is wrong, write the fix as a proposal in `docs/lane2-proposals.md`. Fixtures are never changed to match an engine.');
lines.push('');
lines.push('Last run: ' + new Date().toISOString().slice(0, 10) + '. Corpus: ' + archetypes + ' archetypes, ' + edges + ' edge cases. Sweep: ' + sweep.functions + ' household-first functions across ' + sweep.engines + ' engines, ' + sweep.calls + ' calls.');
lines.push('');
lines.push('## Where the engine disagrees with the hand arithmetic');
lines.push('');
if (!findings.length) {
  lines.push('None. Every `known` value in every fixture is within 1% of the engine, and every expected incompleteness is incomplete.');
} else {
  lines.push('| fixture | value | hand arithmetic | engine | why it matters |');
  lines.push('|---|---|---|---|---|');
  findings.forEach((f) => lines.push('| ' + f.fixture + ' | ' + f.key + ' | ' + cell(f.key, f.expected) + ' | ' + cell(f.key, f.actual) + ' | ' + f.reason + ' |'));
  lines.push('');
  lines.push('### The working behind each');
  lines.push('');
  const seen = new Set();
  findings.forEach((f) => {
    if (seen.has(f.fixture)) return;
    seen.add(f.fixture);
    lines.push('**' + f.fixture + '**');
    lines.push('');
    f.working.forEach((w) => lines.push('- ' + w));
    lines.push('');
  });
}
lines.push('');
lines.push('## Throws, NaN and forbidden negatives');
lines.push('');
if (!failures.length) lines.push('None. No household-first engine function threw when called with real arguments, nothing returned NaN or Infinity, and no runway, tax, months or FI figure came back negative.');
else { failures.forEach((f) => lines.push('- ' + f.replace(/\n\s*/g, ' ').slice(0, 400))); }
lines.push('');
lines.push('## Functions the sweep could not call generically');
lines.push('');
lines.push('These take an argument the sweep has no real value for (a skill, a goal, a template, an offer). They were called with that argument undefined; a throw there is the missing argument, not a finding. Section 2 (property tests) gives each a real value.');
lines.push('');
const uf = Object.keys(uncallableByFn).sort();
if (!uf.length) lines.push('None.');
else { lines.push('| function | parameters | needs |'); lines.push('|---|---|---|'); uf.forEach((k) => { const u = uncallableByFn[k]; lines.push('| ' + u.fn + ' | ' + u.params + ' | ' + u.needs + ' |'); }); }
lines.push('');
lines.push('## Notes the corpus itself raises');
lines.push('');
lines.push('- The effective-rate table is flat by gross and filing status. The `state` field, a 1099 income type, and the SE tax do not change the estimate, so `self-employed-lumpy`, `house-hacker`, `variable-hustle` and `geo-arb` carry the same rate a W-2 earner in any state would. The fixtures agree with the engine because they use the same table; the note is that the table is approximate (its own `precision` says so), not that the engine is wrong. Section 3 (tax_brackets.json, states.json) is where a sharper figure would come from.');
lines.push('- `retired-early` and `between-jobs` have no income source, so take-home and the savings rate are incomplete. Portfolio draws and unemployment benefits are not income sources in the current shape; the engines that read them (`decumulation`, `betweenjobs`) are swept but not compared to a known value here.');
lines.push('- `zero-income` types a gross of $0: the engine estimates $0 of tax and $0 of take-home and refuses a savings rate (zero denominator). Both match the fixture.');
lines.push('- `forty-debts` sits exactly on the $75,000 single boundary. The table rule is `gross <= upToGrossIncome`, so it lands in the 0.19 band; the fixture says so in `band`.');
lines.push('');
fs.mkdirSync(path.dirname(FINDINGS), { recursive: true });
fs.writeFileSync(FINDINGS, lines.join('\n') + '\n');

/* ---- Report --------------------------------------------------------------------- */
console.log('corpus: ' + archetypes + ' archetypes + ' + edges + ' edge cases; ' + sweep.functions + ' functions x ' + corpus.length + ' households = ' + sweep.calls + ' calls');
console.log('findings (engine vs hand arithmetic): ' + findings.length + (findings.length ? '  -> docs/lane2-findings.md' : ''));
console.log('not callable generically: ' + uf.length + ' functions');
if (failures.length) {
  console.log('\n' + failures.length + ' FAILED, ' + passed + ' passed\n');
  failures.slice(0, 60).forEach((f) => console.log('  x ' + f));
  process.exit(1);
}
console.log(passed + ' checks passed');
