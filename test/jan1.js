#!/usr/bin/env node
/* ==========================================================================
   test/jan1.js — the January 1 test (G3.15, D-210).
   --------------------------------------------------------------------------
   The clock says 2027-01-01 and no 2027 tables exist. Every number that
   reads a year-based table must say "using 2026 limits" rather than crash
   or use them silently. Run on its own or from test/run.js, which spawns
   it so the clock override cannot leak into the rest of the suite.
   ========================================================================== */
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');

/* The clock: every `new Date()` and Date.now() read 2027-01-01 local. */
const FIXED = new Date(2027, 0, 1, 9, 0, 0).getTime();
const RealDate = Date;
class FakeDate extends RealDate {
  constructor(...a) { if (a.length === 0) super(FIXED); else super(...a); }
  static now() { return FIXED; }
}
global.Date = FakeDate;

const Money = require(path.join(ROOT, 'shared/money.js'));
const Schema = require(path.join(ROOT, 'shared/schema.js'));
const Reference = require(path.join(ROOT, 'shared/reference.js'));
const Tax = require(path.join(ROOT, 'engines/tax.js'));
const Presets = require(path.join(ROOT, 'engines/presets.js'));
const Demo = require(path.join(ROOT, 'shared/demo-persona.js'));

const T = {};
Object.keys(Reference.TABLE_FILES).forEach(k => { try { T[k] = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', Reference.TABLE_FILES[k]), 'utf8')); } catch (e) { /* skip */ } });

const out = { year: new Date().getFullYear(), localDay: Schema.localDay(), failures: [], passed: 0 };
function check(name, ok, detail) { if (ok) out.passed++; else out.failures.push(name + (detail ? ' — ' + detail : '')); }

check('the clock reads 2027', out.year === 2027, String(out.year));
check('the local day reads 2027-01-01', out.localDay === '2027-01-01', out.localDay);
const yearTables = Object.keys(T).filter(k => typeof T[k].taxYear === 'number');
check('the tax-year tables are the ones named _2026 (brackets, limits, SE tax, ACA, bend points, state, effective rates)', yearTables.length >= 6 && yearTables.every(k => /_2026\.json$/.test(Reference.TABLE_FILES[k])), yearTables.join(','));
check('every one carries its year', yearTables.every(k => Reference.yearOf(T[k]) === 2026), yearTables.filter(k => Reference.yearOf(T[k]) !== 2026).join(','));
check('a survey year or a cost convention is not a limit that expires', Reference.yearNote(T.netWorthPercentiles) === null && Reference.yearNote(T.cobraAca) === null);
check('every one says it is a year behind', yearTables.every(k => Reference.yearNote(T[k]) === 'using 2026 limits'), yearTables.map(k => k + '=' + Reference.yearNote(T[k])).join(' '));
check('a table without a year has no note', Reference.yearNote(T.staleness) === null);
const notes = Reference.yearNotes(T);
check('the notes list is one line, not one per table', notes.length === 1 && notes[0] === 'using 2026 limits', notes.join('|'));

const h = Demo.build();
let est = null, threw = null;
try { est = Tax.estimate(h, T); } catch (e) { threw = e.message; }
check('the tax estimate does not crash on January 1', threw === null, threw);
check('and it says which year it used', est && Money.isOk(est) && est.yearNote === 'using 2026 limits', est && est.yearNote);
let ira = null; try { ira = Presets.maxIra(h, T); } catch (e) { threw = e.message; }
check('the IRA limit preset says so too', ira && Money.isOk(ira) && ira.yearNote === 'using 2026 limits', ira && ira.yearNote);
h.retirement = Object.assign({}, h.retirement, { has401k: true });
let k401 = null; try { k401 = Presets.max401k(h, T); } catch (e) { threw = e.message; }
check('and the 401(k) preset', k401 && Money.isOk(k401) && k401.yearNote === 'using 2026 limits', k401 && k401.yearNote);
/* Back in the table's own year, no note. */
check('in 2026 there is no note', Reference.yearNote(T.federalBrackets, new RealDate(2026, 5, 1)) === null);
check('two years on it says how old', Reference.yearNote(T.federalBrackets, new RealDate(2028, 0, 1)) === 'using 2026 limits (2 years old)');

if (require.main === module) {
  if (out.failures.length) { console.log('✗ ' + out.failures.length + ' failed, ' + out.passed + ' passed'); out.failures.forEach((f, i) => console.log('  ' + (i + 1) + '. ' + f)); process.exit(1); }
  console.log('✓ ' + out.passed + ' checks passed — January 1 says which year it is using');
}
module.exports = out;
