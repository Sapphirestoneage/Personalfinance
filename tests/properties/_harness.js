/* ==========================================================================
   tests/properties/_harness.js - shared pieces for the property tests.
   --------------------------------------------------------------------------
   Lane 2, section 2 (DECISIONS.md L-2). One file per engine under
   tests/properties/ uses this: fast-check, the reference tables, random
   valid households built through shared/schema.js, and the four generic
   properties every engine gets (no throw and no NaN, the same answer
   twice, the household untouched, whole cents out).

   Every property here runs on a SPEC (dollars, plain fields) and builds
   the household inside the predicate, so when fast-check shrinks a
   failure the counterexample it reports is a spec a person can read, not
   a 40KB household. A failure is a finding for docs/lane2-findings.md,
   never a fix to the engine.
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const fc = require('fast-check');
const ROOT = path.resolve(__dirname, '..', '..');
const Money = require(path.join(ROOT, 'shared/money.js'));
const Schema = require(path.join(ROOT, 'shared/schema.js'));
const Reference = require(path.join(ROOT, 'shared/reference.js'));

const SEED = process.env.FC_SEED ? Number(process.env.FC_SEED) : 20260910;
const NUM_RUNS = process.env.FC_RUNS ? Number(process.env.FC_RUNS) : 100;
const TODAY = '2026-09-10';
const NOW_MS = Date.UTC(2026, 8, 10, 12, 0, 0);

/* ---- Tables ------------------------------------------------------------------ */
const TABLES = {};
Object.keys(Reference.TABLE_FILES).forEach(function (k) {
  try { TABLES[k] = Reference.readSync(k, path.join(ROOT, 'data')); } catch (e) { /* an engine that needs it says so */ }
});
/* uiBenefits is a VIEW of states.json (D-220): it comes from the loop above. */
['accessRules:access_rules.json', 'confidenceWeights:confidence_weights.json', 'vpw:vpw.json'].forEach(function (pair) {
  const k = pair.split(':')[0], f = pair.split(':')[1];
  try { TABLES[k] = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8')); } catch (e) { /* optional */ }
});
const ARG_BY_NAME = {
  tables: TABLES, T: TABLES, catalog: TABLES.expenseCategories, rules: TABLES.debtRules,
  templates: TABLES.budgetTemplates, thresholds: TABLES.fooRules && TABLES.fooRules.thresholds,
  opts: undefined, localOverrides: undefined, prefs: undefined, now: NOW_MS, nowMs: NOW_MS, today: TODAY
};
/* ratios.context() reads Date.now() when opts.now is absent, so the suite
   passes a fixed clock: a clock read is an input here, not hidden state. */
const ENGINE_ARGS = { statement: { rules: TABLES.accessRules, weights: TABLES.confidenceWeights }, hassle: { table: TABLES.hassleDefaults }, ratios: { opts: { now: NOW_MS } } };

/* ---- Money helpers ------------------------------------------------------------- */
const c = (d) => (d === null || d === undefined) ? null : Math.round(d * 100);
function clone(v) { return JSON.parse(JSON.stringify(v)); }
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

/* ---- Arbitraries: specs in dollars ---------------------------------------------- */
const dollars = (max) => fc.integer({ min: 0, max: max });
const maybe = (arb, weightNull) => fc.oneof({ arbitrary: arb, weight: 100 - (weightNull || 15) }, { arbitrary: fc.constant(null), weight: weightNull || 15 });
const rate2 = (max) => fc.integer({ min: 0, max: Math.round(max * 1000) }).map((n) => n / 1000);
const FILING = ['single', 'married_joint', 'married_separate', 'head_of_household'];
const STATES = ['CA', 'TX', 'NY', 'FL', 'WA', 'NC', 'OH', 'CO', 'IL', 'PA'];
const STATUS = ['employed', 'selfEmployed', 'both', 'unemployed', 'notWorking'];
const ASSET_CATS = ['cash', 'investment', 'retirement', 'real_estate', 'vehicle', 'other'];
const TAX_CHAR = ['pretax', 'roth', 'taxable', 'unknown'];
const DEBT_TYPES = ['credit_card', 'student_loan', 'auto', 'mortgage', 'personal', 'family', 'medical', 'other'];

const arbIncome = fc.record({
  gross: dollars(400000), type: fc.constantFrom('w2', '1099'),
  match: maybe(fc.record({ pct: fc.constantFrom(0.5, 1), cap: fc.constantFrom(0.03, 0.04, 0.05, 0.06) }), 50)
});
const arbPerson = fc.record({
  year: fc.integer({ min: 1950, max: 2007 }), status: fc.constantFrom.apply(null, STATUS),
  income: fc.array(arbIncome, { minLength: 0, maxLength: 2 })
});
const arbAsset = fc.record({
  category: fc.constantFrom.apply(null, ASSET_CATS), value: maybe(dollars(3000000), 10),
  taxCharacter: maybe(fc.constantFrom.apply(null, TAX_CHAR), 40), confidence: maybe(fc.integer({ min: 1, max: 4 }), 40)
});
const arbDebt = fc.record({
  balance: maybe(dollars(600000), 10), rate: maybe(rate2(0.35), 15), min: maybe(dollars(6000), 15),
  type: fc.constantFrom.apply(null, DEBT_TYPES)
});
const arbFat = fc.record({
  food: maybe(dollars(4000)), accommodation: maybe(dollars(12000)), transportation: maybe(dollars(3000)), wants: maybe(dollars(15000))
});
const arbSpec = fc.record({
  people: fc.array(arbPerson, { minLength: 1, maxLength: 2 }),
  filingStatus: maybe(fc.constantFrom.apply(null, FILING), 10),
  state: maybe(fc.constantFrom.apply(null, STATES), 10),
  assets: fc.array(arbAsset, { minLength: 0, maxLength: 5 }),
  debts: fc.array(arbDebt, { minLength: 0, maxLength: 5 }),
  fat: arbFat,
  hasDebt: fc.constantFrom(null, true, false),
  contributionPercent: maybe(fc.integer({ min: 0, max: 30 }), 40)
});
/* A household with every Tier 0 input entered: one adult with a job, cash,
   an investment, the four FAT lines, a filing status. */
const arbCompleteSpec = fc.record({
  year: fc.integer({ min: 1955, max: 2005 }),
  gross: fc.integer({ min: 1, max: 600000 }),
  match: maybe(fc.record({ pct: fc.constantFrom(0.5, 1), cap: fc.constantFrom(0.03, 0.06) }), 50),
  filingStatus: fc.constantFrom.apply(null, FILING),
  cash: dollars(500000), invested: dollars(4000000), retirementValue: dollars(4000000),
  property: maybe(dollars(2000000), 50), vehicle: maybe(dollars(80000), 50),
  debts: fc.array(fc.record({ balance: fc.integer({ min: 1, max: 400000 }), rate: rate2(0.3), min: fc.integer({ min: 1, max: 5000 }), type: fc.constantFrom.apply(null, DEBT_TYPES) }), { minLength: 0, maxLength: 4 }),
  food: fc.integer({ min: 1, max: 4000 }), accommodation: fc.integer({ min: 0, max: 12000 }), transportation: fc.integer({ min: 0, max: 3000 }), wants: fc.integer({ min: 0, max: 15000 })
});

function personFrom(p, i) {
  const id = 'p' + i;
  const out = Schema.createPerson({ id, label: 'Person ' + (i + 1), role: 'adult', dob: p.year + '-06-15', employmentStatus: p.status });
  (p.income || []).forEach((s, j) => {
    out.incomeSources.push(Schema.createIncomeSource({ id: id + '_inc' + j, personId: id, source: 'Source ' + (j + 1), grossAnnualIncomeCents: c(s.gross), type: s.type,
      employerMatch: s.match ? { matchPercent: s.match.pct, matchCapPercentOfSalary: s.match.cap } : undefined }));
  });
  return out;
}
function fatFrom(f) {
  return { needs: { food: { monthlyCents: c(f.food) }, accommodation: { monthlyCents: c(f.accommodation) }, transportation: { monthlyCents: c(f.transportation) } }, wants: { totalCents: c(f.wants), therapy: null }, entries: [] };
}
function build(spec) {
  return Schema.createHousehold({
    people: spec.people.map(personFrom), filingStatus: spec.filingStatus, state: spec.state,
    assets: spec.assets.map((a, i) => Schema.createAsset({ id: 'a' + i, label: 'Asset ' + (i + 1), category: a.category, valueCents: c(a.value), liquid: a.category === 'cash', taxCharacter: a.taxCharacter, confidence: a.confidence })),
    debts: spec.debts.map((d, i) => Schema.createDebt({ id: 'd' + i, label: 'Debt ' + (i + 1), balanceCents: c(d.balance), rate: d.rate, minPaymentCents: c(d.min), type: d.type })),
    expenses: fatFrom(spec.fat),
    retirement: { contributionPercent: spec.contributionPercent },
    meta: { hasDebt: spec.hasDebt }
  });
}
function buildComplete(s) {
  const assets = [
    Schema.createAsset({ id: 'cash', label: 'Cash', category: 'cash', valueCents: c(s.cash), liquid: true }),
    Schema.createAsset({ id: 'inv', label: 'Brokerage', category: 'investment', valueCents: c(s.invested), taxCharacter: 'taxable' }),
    Schema.createAsset({ id: 'ret', label: 'Retirement', category: 'retirement', valueCents: c(s.retirementValue), taxCharacter: 'pretax' })
  ];
  if (s.property !== null) assets.push(Schema.createAsset({ id: 'home', label: 'Home', category: 'real_estate', valueCents: c(s.property) }));
  if (s.vehicle !== null) assets.push(Schema.createAsset({ id: 'car', label: 'Car', category: 'vehicle', valueCents: c(s.vehicle) }));
  return Schema.createHousehold({
    people: [personFrom({ year: s.year, status: 'employed', income: [{ gross: s.gross, type: 'w2', match: s.match }] }, 0)],
    filingStatus: s.filingStatus, state: 'NC', assets,
    debts: s.debts.map((d, i) => Schema.createDebt({ id: 'd' + i, label: 'Debt ' + (i + 1), balanceCents: c(d.balance), rate: d.rate, minPaymentCents: c(d.min), type: d.type })),
    expenses: fatFrom(s), meta: { hasDebt: s.debts.length > 0 }, capturingFullMatch: !!s.match
  });
}
/** The same complete spec with one field changed. */
function withField(s, key, value) { const o = clone(s); o[key] = value; return o; }

/* ---- Result walkers --------------------------------------------------------------- */
function badNumbers(v, trail, seen, depth) {
  const out = [];
  if (depth > 12) return out;
  if (typeof v === 'number') { if (!isFinite(v)) out.push(trail); return out; }
  if (!v || typeof v !== 'object') return out;
  if (seen.has(v)) return out;
  seen.add(v);
  const keys = Array.isArray(v) ? v.slice(0, 200).map((_, i) => i) : Object.keys(v);
  for (const k of keys) out.push.apply(out, badNumbers(v[k], trail + '.' + k, seen, depth + 1));
  return out;
}
function fractionalCents(v, trail, seen, depth) {
  const out = [];
  if (depth > 12) return out;
  if (!v || typeof v !== 'object') return out;
  if (seen.has(v)) return out;
  seen.add(v);
  const keys = Array.isArray(v) ? v.slice(0, 200).map((_, i) => i) : Object.keys(v);
  for (const k of keys) {
    const x = v[k];
    /* A result that echoes the reference tables is not producing them. */
    if (k === 'tables' || k === 'table') continue;
    if (typeof x === 'number' && /Cents$/.test(String(k)) && isFinite(x) && !Number.isInteger(x)) out.push(trail + '.' + k + ' = ' + x);
    else out.push.apply(out, fractionalCents(x, trail + '.' + k, seen, depth + 1));
  }
  return out;
}

/* ---- The engine's household-first functions ---------------------------------------- */
function params(fn) {
  const s = fn.toString();
  const m = /^function[^(]*\(([^)]*)\)/.exec(s) || /^\(?([^)=]*)\)?\s*=>/.exec(s);
  return (m ? m[1] : '').split(',').map((x) => x.trim()).filter(Boolean);
}
function engine(name) { return require(path.join(ROOT, 'engines', name + '.js')); }
function householdFunctions(name, opts) {
  const mod = engine(name);
  const own = Object.assign({}, ENGINE_ARGS[name] || {}, (opts && opts.args) || {});
  const skip = (opts && opts.skip) || [];
  return Object.keys(mod).filter((k) => typeof mod[k] === 'function').map((k) => {
    const ps = params(mod[k]);
    if (!/^(household|h|hh)$/.test(ps[0] || '') || skip.indexOf(k) >= 0) return null;
    const unsupplied = ps.slice(1).filter((p) => !(p in own) && !(p in ARG_BY_NAME));
    return { name: k, fn: mod[k], mod, params: ps, unsupplied,
      args: (h) => ps.map((p, i) => (i === 0 ? h : (p in own ? own[p] : ARG_BY_NAME[p]))) };
  }).filter((f) => f && !f.unsupplied.length);
}

/* ---- Properties -------------------------------------------------------------------- */
/** A property: name, the arbitrary, a predicate returning true or a string
 *  reason. `spec` is what fast-check reports when it fails. */
function prop(name, arb, predicate, note) { return { name, arb, predicate, note: note || null }; }

/** The four every engine gets. `opts.impure` lists functions documented to
 *  return a changed household on purpose; they are exempt from the
 *  untouched-input check and said so in the report. */
function generic(name, opts) {
  const fns = householdFunctions(name, opts);
  const impure = (opts && opts.impure) || [];
  const nondeterministic = (opts && opts.nondeterministic) || [];
  if (!fns.length) return [];
  const each = (spec, f) => f.fn.apply(f.mod, f.args(build(spec)));
  return [
    prop('no throw, no NaN or Infinity, on any valid household (' + fns.length + ' functions)', arbSpec, (spec) => {
      for (const f of fns) {
        let r;
        try { r = each(spec, f); } catch (e) { return f.name + ' threw: ' + (e && e.message); }
        const bad = badNumbers(r, f.name, new Set(), 0);
        if (bad.length) return bad.slice(0, 3).join(', ');
      }
      return true;
    }),
    prop('the same input gives the same output twice (no hidden state)', arbSpec, (spec) => {
      for (const f of fns) {
        if (nondeterministic.indexOf(f.name) >= 0) continue;
        let a, b;
        try { a = each(spec, f); b = each(spec, f); } catch (e) { continue; }
        if (!same(a, b)) return f.name + ' differs between two calls';
      }
      return true;
    }),
    prop('the household passed in is byte-identical afterwards', arbSpec, (spec) => {
      for (const f of fns) {
        if (impure.indexOf(f.name) >= 0) continue;
        const h = build(spec);
        const before = JSON.stringify(h);
        try { f.fn.apply(f.mod, f.args(h)); } catch (e) { continue; }
        if (JSON.stringify(h) !== before) return f.name + ' changed the household it was given';
      }
      return true;
    }),
    prop('cents in, cents out: no *Cents field carries a fraction', arbSpec, (spec) => {
      for (const f of fns) {
        let r;
        try { r = each(spec, f); } catch (e) { continue; }
        const frac = fractionalCents(r, f.name, new Set(), 0);
        if (frac.length) return frac.slice(0, 3).join(', ');
      }
      return true;
    })
  ];
}

/* ---- Running ------------------------------------------------------------------------ */
function runProperty(p, params) {
  const numRuns = (params && params.numRuns) || NUM_RUNS;
  const started = Date.now();
  let reason = null;
  const out = fc.check(fc.property(p.arb, (spec) => {
    const r = p.predicate(spec);
    if (r !== true) { reason = typeof r === 'string' ? r : 'predicate returned ' + JSON.stringify(r); return false; }
    return true;
  }), { seed: SEED, numRuns, verbose: false });
  const result = { name: p.name, ok: !out.failed, numRuns: out.numRuns, seed: SEED, ms: Date.now() - started };
  if (p.note) result.note = p.note;
  if (out.failed) {
    result.counterexample = out.counterexample ? out.counterexample[0] : null;
    result.reason = out.errorInstance ? String(out.errorInstance.message || out.errorInstance).split('\n')[0] : reason;
    if (!out.errorInstance) result.reason = reason;
    /* Re-run the shrunk case once to record the reason for THAT case. */
    try { const r2 = p.predicate(result.counterexample); if (typeof r2 === 'string') result.reason = r2; } catch (e) { result.reason = 'threw: ' + e.message; }
  }
  return result;
}
function suite(engineName, properties, notes) { return { engine: engineName, properties, notes: notes || [] }; }
function runSuite(s, params) { return { engine: s.engine, notes: s.notes, properties: s.properties.map((p) => runProperty(p, params)) }; }
function main(s) {
  const r = runSuite(s);
  r.properties.forEach((p) => console.log((p.ok ? '  ok   ' : '  FAIL ') + s.engine + ': ' + p.name + ' (' + p.numRuns + ' runs, ' + p.ms + 'ms)' + (p.ok ? '' : '\n         ' + p.reason + '\n         ' + JSON.stringify(p.counterexample))));
  if (r.properties.some((p) => !p.ok)) process.exitCode = 1;
}

module.exports = { fc, ROOT, Money, Schema, TABLES, SEED, NUM_RUNS, TODAY, NOW_MS, c, clone, same,
  dollars, maybe, rate2, FILING, arbSpec, arbCompleteSpec, arbIncome, arbAsset, arbDebt, arbFat, build, buildComplete, withField,
  badNumbers, fractionalCents, params, engine, householdFunctions, prop, generic, runProperty, suite, runSuite, main };
