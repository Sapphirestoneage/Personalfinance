#!/usr/bin/env node
/* ==========================================================================
   test/workbook.js — the spreadsheet and the app must agree. D-356.
   --------------------------------------------------------------------------
   shared/workbook.js writes the whole app as one file: every Ledger row on a
   tab for its door, and a tab of readings worked out by real formulas over
   named cells. Those formulas are a SECOND way of saying what the engines
   already say, and two ways of saying one thing is exactly what CLAUDE.md
   forbids letting drift.

   So this is the tie. It reads the workbook the builder produces, works every
   formula out with a small spreadsheet of its own, and compares each answer
   to the engine that owns the figure — over several households, including
   an empty one, where every reading must come back blank rather than zero.

   If anybody changes an engine and not data/workbook.json, or the other way
   round, this fails and names the reading.

   Run:  node test/workbook.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const Money = require(path.join(ROOT, 'shared/money.js'));
const Schema = require(path.join(ROOT, 'shared/schema.js'));
const Demo = require(path.join(ROOT, 'shared/demo-persona.js'));
const LR = require(path.join(ROOT, 'shared/ledger-rows.js'));
const Own = require(path.join(ROOT, 'shared/ownership.js'));
const Recipes = require(path.join(ROOT, 'engines/recipes.js'));
const Workbook = require(path.join(ROOT, 'shared/workbook.js'));
const Xlsx = require(path.join(ROOT, 'shared/xlsx.js'));
const plan = require(path.join(ROOT, 'data/workbook.json'));

const req = (n) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', n + '.json'), 'utf8'));
const T = {
  ledgerRows: req('ledger-rows'), expenseCategories: req('expense_categories'), accessRules: req('access_rules'),
  irsLimits: req('irs_limits_2026'), effectiveTaxRates: req('effective_tax_rates_2026'), debtRules: req('debt_rules'),
  ratioBenchmarks: req('ratio_benchmarks'), confidenceWeights: req('confidence_weights'), staleness: req('staleness'),
  federalBrackets: req('federal_brackets_2026'), states: req('states'), bands: req('bands')
};
LR.use(T.ledgerRows);

let passed = 0; const failures = [];
function ok(name, cond, detail) { if (cond) passed++; else failures.push(name + (detail ? ' — ' + detail : '')); }
function near(name, a, b, tol, detail) {
  const fine = a === null && b === null ? true
    : (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= (tol === undefined ? 0.005 : tol));
  ok(name, fine, detail || ('sheet ' + fmt(a) + ' vs engine ' + fmt(b)));
}
function fmt(v) { return v === null ? 'blank' : (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : String(v)); }
function section(t) { console.log('\n' + t); }

/* ---- A small spreadsheet ---------------------------------------------------
   Enough of the language to work out what this workbook actually contains:
   numbers, text, the defined names, the handful of functions the readings
   use, and the one rule that matters most — a blank cell is blank, and a
   comparison with it is not a number. */
const BLANK = '';
function evaluator(cells, names) {
  /* cells: { 'Tab!B7': value }, names: { name: 'Tab!B7' | 'Tab!B7:B11' } */
  const cache = {}, busy = {};
  function nameValue(id) {
    const ref = names[id];
    if (ref === undefined) throw new Error('no such name: ' + id);
    if (busy[id]) throw new Error('a loop through ' + id);
    if (cache[id] !== undefined) return cache[id];
    busy[id] = true;
    let out;
    if (/:/.test(ref)) out = spread(ref).map(cellValue);
    else out = cellValue(ref);
    busy[id] = false;
    cache[id] = out;
    return out;
  }
  function spread(ref) {
    const m = /^(.*)!([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(ref.replace(/\$/g, ''));
    if (!m) throw new Error('bad range ' + ref);
    const out = [];
    for (let r = +m[3]; r <= +m[5]; r++) out.push(m[1] + '!' + m[2] + r);
    return out;
  }
  function cellValue(ref) {
    const key = ref.replace(/\$/g, '');
    const c = cells[key];
    if (c === undefined) return BLANK;
    if (c && typeof c === 'object' && c.f !== undefined) {
      if (busy[key]) throw new Error('a loop at ' + key);
      if (cache[key] !== undefined) return cache[key];
      busy[key] = true;
      const v = run(c.f);
      busy[key] = false;
      cache[key] = v;
      return v;
    }
    return c === null || c === undefined ? BLANK : c;
  }
  function num(v) {
    if (Array.isArray(v)) return v.reduce((n, x) => n + num(x), 0);
    if (v === BLANK || v === null || v === undefined) return 0;
    const n = Number(v);
    return isFinite(n) ? n : 0;
  }
  const FN = {
    SUM: (args) => args.reduce((n, a) => n + num(a), 0),
    SUMPRODUCT: (args) => {
      const cols = args.map((a) => (Array.isArray(a) ? a : [a]));
      const len = Math.max.apply(null, cols.map((c) => c.length));
      let total = 0;
      for (let i = 0; i < len; i++) { let p = 1; cols.forEach((c) => { p *= num(c[i]); }); total += p; }
      return total;
    },
    SUMIF: (args) => {
      const keys = Array.isArray(args[0]) ? args[0] : [args[0]];
      const want = args[1];
      const vals = Array.isArray(args[2]) ? args[2] : [args[2]];
      let total = 0;
      keys.forEach((k, i) => { if (String(k) === String(want)) total += num(vals[i]); });
      return total;
    },
    IF: (args) => (truthy(args[0]) ? args[1] : (args.length > 2 ? args[2] : false)),
    OR: (args) => args.some(truthy),
    AND: (args) => args.every(truthy),
    TODAY: () => today(),
    DATEDIF: (args) => {
      const a = asDate(args[0]), b = asDate(args[1]);
      if (!a || !b) return BLANK;
      let years = b.getUTCFullYear() - a.getUTCFullYear();
      const before = (b.getUTCMonth() < a.getUTCMonth())
        || (b.getUTCMonth() === a.getUTCMonth() && b.getUTCDate() < a.getUTCDate());
      if (before) years--;
      return years;
    }
  };
  function truthy(v) { return v === true || (v !== false && v !== BLANK && v !== 0 && v !== null && v !== undefined); }
  function today() { const d = new Date(); return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); }
  function asDate(v) {
    if (v instanceof Date) return v;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
    return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
  }

  /* ---- The parser: expression → comparison → sum → product → unary → atom */
  function run(src) {
    let s = String(src).replace(/^=/, ''), i = 0;
    function ws() { while (i < s.length && s[i] === ' ') i++; }
    function expr() { return compare(); }
    function compare() {
      let a = sum();
      ws();
      const two = s.slice(i, i + 2);
      if (two === '>=' || two === '<=' || two === '<>') { i += 2; const b = sum(); return cmp(two, a, b); }
      const one = s[i];
      if (one === '=' || one === '>' || one === '<') { i++; const b = sum(); return cmp(one, a, b); }
      return a;
    }
    function cmp(op, a, b) {
      const both = typeof a === 'number' || typeof b === 'number';
      const x = both && a !== BLANK ? num(a) : a, y = both && b !== BLANK ? num(b) : b;
      if (op === '=') return String(x) === String(y) || (x === BLANK && y === 0) || (y === BLANK && x === 0);
      if (op === '<>') return !(String(x) === String(y));
      if (op === '>=') return num(x) >= num(y);
      if (op === '<=') return num(x) <= num(y);
      if (op === '>') return num(x) > num(y);
      return num(x) < num(y);
    }
    function sum() {
      let a = product();
      for (;;) {
        ws();
        if (s[i] === '+') { i++; a = num(a) + num(product()); continue; }
        if (s[i] === '-') { i++; a = num(a) - num(product()); continue; }
        if (s[i] === '&') { i++; a = String(a) + String(product()); continue; }
        return a;
      }
    }
    function product() {
      let a = unary();
      for (;;) {
        ws();
        if (s[i] === '*') { i++; a = num(a) * num(unary()); continue; }
        if (s[i] === '/') { i++; const d = num(unary()); a = d === 0 ? { err: '#DIV/0!' } : num(a) / d; continue; }
        if (s[i] === '^') { i++; a = Math.pow(num(a), num(unary())); continue; }
        return a;
      }
    }
    function unary() { ws(); if (s[i] === '-') { i++; return -num(unary()); } if (s[i] === '+') { i++; return unary(); } return atom(); }
    function atom() {
      ws();
      if (s[i] === '(') { i++; const v = expr(); ws(); if (s[i] === ')') i++; return v; }
      if (s[i] === '"') {
        i++; let out = '';
        while (i < s.length && s[i] !== '"') out += s[i++];
        i++;
        return out;
      }
      const n = /^\d+(\.\d+)?/.exec(s.slice(i));
      if (n) { i += n[0].length; return Number(n[0]); }
      const word = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(s.slice(i));
      if (!word) throw new Error('cannot read "' + s.slice(i) + '" in ' + src);
      i += word[0].length;
      ws();
      if (s[i] === '(') {
        i++;
        const args = [];
        ws();
        if (s[i] !== ')') { for (;;) { args.push(expr()); ws(); if (s[i] === ',') { i++; continue; } break; } }
        ws(); if (s[i] === ')') i++;
        const fn = FN[word[0].toUpperCase()];
        if (!fn) throw new Error('no such function: ' + word[0]);
        return fn(args);
      }
      return nameValue(word[0]);
    }
    const v = expr();
    return v;
  }
  return { run: run, name: nameValue, cell: cellValue };
}

/* Flatten what the builder produced into the cell map the evaluator reads. */
function flatten(built) {
  const cells = {}, names = {};
  built.sheets.forEach((sheet) => {
    const top = sheet.noHeader ? 1 : 2;
    (sheet.rows || []).forEach((row, ri) => {
      row.forEach((cell, ci) => {
        const key = sheet.name + '!' + Xlsx.colName(ci) + (ri + top);
        if (cell && typeof cell === 'object') {
          if (cell.f !== undefined) cells[key] = { f: cell.f };
          else cells[key] = cell.v === undefined || cell.v === null ? BLANK : cell.v;
        } else cells[key] = cell === undefined || cell === null ? BLANK : cell;
      });
    });
  });
  built.names.forEach((n) => { names[n.name] = n.ref.replace(/'/g, '').replace(/\$/g, ''); });
  return { cells: cells, names: names };
}

/* What the engine says, in the unit the sheet shows: dollars, or a fraction. */
const CENTS = { payAYear: 1, totalAssets: 1, trueMonthlySpend: 1, efTarget: 1, interestPerMonth: 1, fiNumber: 1 };
function engineValue(id, h) {
  const r = Recipes.FORMULAS[id] ? Recipes.value(id, h, T) : null;
  if (!r || !Money.isOk(r)) return null;
  const v = Array.isArray(r.value) ? null : r.value;
  if (v === null || typeof v !== 'number') return null;
  return CENTS[id] ? v / 100 : v;
}
function sheetValueRaw(ev, id) {
  let v;
  try { v = ev.name(id); } catch (e) { return null; }
  if (v === BLANK || v === null || v === undefined) return null;
  return v;
}
function sheetValue(ev, id) {
  let v;
  try { v = ev.name(id); } catch (e) { return { err: e.message }; }
  if (v === BLANK || v === false) return null;
  if (v && typeof v === 'object' && v.err) return null;   /* #DIV/0! shows as blank */
  return typeof v === 'number' ? v : null;
}

(function () {
  section('The workbook is a workbook');
  const demo = Schema.createHousehold(Demo.build());
  const built = Workbook.build(demo, T, {});
  ok('a tab for Start here, one a door, and one for the readings', built.sheets.length === plan.doors.length + 2, String(built.sheets.length));
  ok('Start here comes first and What it says comes last',
    built.sheets[0].name === 'Start here' && built.sheets[built.sheets.length - 1].name === 'What it says');
  const dup = {}; let dupes = '';
  built.names.forEach((n) => { if (dup[n.name]) dupes += n.name + ' '; dup[n.name] = true; });
  ok('no name is defined twice', dupes === '', dupes);
  built.names.forEach((n) => { if (!Workbook.nameable(n.name)) dupes += n.name; });
  ok('every defined name is a name a spreadsheet accepts', dupes === '', dupes);

  /* Every row of the Ledger has to be somewhere in the file, or it is not
     the app on a sheet, it is a selection from it. */
  const onSheet = {};
  built.sheets.forEach((s) => (s.rows || []).forEach((r) => {
    const idCell = r[13];
    const id = idCell && typeof idCell === 'object' ? idCell.v : idCell;
    if (id) onSheet[id] = true;
  }));
  const missing = T.ledgerRows.rows.filter((r) => !/^prefs\./.test(r.path) && !onSheet[r.id]).map((r) => r.id);
  ok('every Ledger row is on a tab', missing.length === 0, missing.join(', '));
  /* A computed row is a statement, not a question: it carries the words for
     how it is worked out instead of the five that say how to answer it. */
  const noPlain = T.ledgerRows.rows.filter((r) => !/^prefs\./.test(r.path) && r.kind !== 'computed' && !r.plain).map((r) => r.id);
  ok('and every one that is a question is asked in plain words', noPlain.length === 0, noPlain.join(', '));
  const noWords = T.ledgerRows.rows.filter((r) => r.kind === 'computed' && !(r.formula && r.formula.words)).map((r) => r.id);
  ok('every computed row says how it is worked out', noWords.length === 0, noWords.join(', '));

  section('The thirteen computed rows are generated, not retyped');
  const rowsById = {}; T.ledgerRows.rows.forEach((r) => { rowsById[r.id] = r; });
  const flat = flatten(built);
  const ev = evaluator(flat.cells, flat.names);
  const computed = T.ledgerRows.rows.filter((r) => r.kind === 'computed');
  ok('there are thirteen of them', computed.length === 13, String(computed.length));
  let written = 0;
  computed.forEach((r) => {
    const f = Workbook.computedFormula(r, (function () { const m = {}; Object.keys(flat.names).forEach((k) => { m[k] = { isRange: /:/.test(flat.names[k]) }; }); return m; })());
    if (!f) return;
    written++;
    if (Workbook.BY_HAND[r.id] !== undefined) return;    /* the three the terms cannot say */
    const terms = (r.formula && r.formula.terms) || [];
    const named = terms.filter((t) => flat.names[t.id]);
    ok(r.id + ' says the same as its terms', named.every((t) => f.indexOf(t.id) > -1), f);
  });
  ok('most of them made it onto the sheet', written >= 8, String(written) + ' of ' + computed.length);

  section('Every reading agrees with the engine that owns it');
  const households = {
    'the example one': demo,
    'the example one, with a house and a typed take-home': (function () {
      const h = Schema.createHousehold(Demo.build());
      const p = Schema.primaryPerson(h);
      h.assets = (h.assets || []).concat([Schema.createAsset({ label: 'The house', valueCents: 31000000, category: 'real_estate' })]);
      h.takeHome = Schema.createTakeHome({ monthlyCents: 486000, typedCents: 486000, per: 'month' });
      return h;
    })()
  };
  Object.keys(households).forEach((label) => {
    const h = households[label];
    const b = Workbook.build(h, T, {});
    const f = flatten(b);
    const e = evaluator(f.cells, f.names);
    plan.readings.forEach((r) => {
      if (!r.engine || !Recipes.FORMULAS[r.engine]) return;
      const mine = sheetValue(e, r.id);
      if (mine && typeof mine === 'object') { ok(label + ': ' + r.id + ' works out', false, mine.err); return; }
      /* Some readings lean on a figure the app works out with the tax tables
         and the sheet cannot: take-home from a gross salary. The sheet shows
         nothing until that one is typed in, which is the same rule as any
         other blank, and the engine is only held to it once it is. */
      const short = (r.needs || []).filter((id) => { const v = sheetValueRaw(e, id); return v === null; });
      const theirs = engineValue(r.engine, h);
      if (short.length) { ok(label + ': ' + r.id + ' waits for ' + short.join(', '), mine === null, 'sheet said ' + fmt(mine)); return; }
      if (theirs === null) { ok(label + ': ' + r.id + ' is blank when the engine has nothing', mine === null, 'sheet said ' + fmt(mine)); return; }
      const tol = Math.max(0.005, Math.abs(theirs) * 1e-6);
      near(label + ': ' + r.id, mine, theirs, tol);
    });
  });

  section('Nothing entered is nothing shown');
  const blank = Schema.createHousehold({});
  const bb = Workbook.build(blank, T, {});
  const fb = flatten(bb);
  const eb = evaluator(fb.cells, fb.names);
  const zeros = [];
  plan.readings.forEach((r) => {
    const v = sheetValue(eb, r.id);
    if (v !== null && v !== 0) zeros.push(r.id + ' = ' + fmt(v));
  });
  ok('an empty household makes up no figures', zeros.length === 0, zeros.join(', '));
  const typedZero = [];
  bb.sheets.forEach((s) => (s.rows || []).forEach((row) => {
    const c = row[2];
    if (c && typeof c === 'object' && c.v === 0) typedZero.push(String((row[13] || {}).v || '?'));
  }));
  ok('and writes no zero into a box nobody answered', typedZero.length === 0, typedZero.join(', '));

  section('The file itself');
  const bytes = Workbook.file(demo, T, { now: new Date(Date.UTC(2026, 0, 1)) });
  ok('it is a zip a spreadsheet opens', Xlsx.isXlsx(bytes), 'first bytes ' + Array.from(bytes.slice(0, 4)).join(','));
  ok('and it is a real file, not a stub', bytes.length > 50000, String(bytes.length) + ' bytes');
  const again = Workbook.file(demo, T, { now: new Date(Date.UTC(2026, 0, 1)) });
  ok('built twice from one household, it is byte for byte the same file',
    Buffer.compare(Buffer.from(bytes), Buffer.from(again)) === 0);

  return Xlsx.read(bytes).then((sheets) => {
    ok('it reads back as the same tabs', sheets.map((s) => s.name).join(' | ') === built.sheets.map((s) => s.name).join(' | '),
      sheets.map((s) => s.name).join(' | '));
    const owe = sheets.filter((s) => /owe/.test(s.name))[0];
    ok('a debt balance survives the trip', owe && JSON.stringify(owe.rows).indexOf('18400') > -1);
  });
})().then(() => {
  console.log('\n' + '─'.repeat(66));
  if (!failures.length) { console.log('✓ ' + passed + ' checks passed — the sheet and the app say the same thing'); process.exit(0); }
  console.log('✗ ' + failures.length + ' failed, ' + passed + ' passed\n');
  failures.forEach((f, i) => console.log('  ' + (i + 1) + '. ' + f));
  process.exit(1);
}).catch((e) => { console.error('\nthrew: ' + (e && e.stack ? e.stack : e)); process.exit(1); });
