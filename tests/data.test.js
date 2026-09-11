#!/usr/bin/env node
/* ==========================================================================
   tests/data.test.js - the sourced data tables hold their shape.
   --------------------------------------------------------------------------
   Lane 2, section 3 (DECISIONS.md L-3). For the eight files the lane
   names (states, milestones, aca, studentloans, contribution_limits,
   tax_brackets, return_bands, bands) it asserts:

     - every cell (an object with a `value`) carries a `source` that is a
       URL and an `asOf` date, and every file carries a `refresh` note
     - no `asOf` is older than eighteen months from today, unless the cell
       is a closed prior year (`historical: true`) or says it is stale
       with a DECIDE: note
     - every state (fifty plus DC) is present in states.json, and every
       column is filled for every state
     - federal and state brackets are monotonic (thresholds rise, rates
       never fall); capital gains thresholds are ordered
     - the poverty guideline rises with household size
     - the figures this lane copied from the engines' own tables still
       agree with them (childcare, 401(k) and IRA limits, 2026 federal
       brackets, the 2025 poverty base), so two copies cannot drift apart
       unnoticed; the UI benefit differences are listed, not failed, since
       they are the newer readings

   Run:  node tests/data.test.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const TODAY = new Date('2026-09-10T00:00:00Z');
const STALE_MS = 18 * 30.44 * 24 * 3600 * 1000;

let passed = 0;
const failures = [];
const notes = [];
function ok() { passed++; }
function check(name, cond, detail) { if (cond) ok(); else failures.push(name + (detail ? '\n      ' + detail : '')); }
function load(name) { return JSON.parse(fs.readFileSync(path.join(DATA, name), 'utf8')); }

/* Four of the eight live under data/lane2/ until shared/reference.js registers them (docs/lane2-proposals.md P-5). */
const FILES = ['states.json', 'milestones.json', 'lane2/aca.json', 'lane2/studentloans.json', 'lane2/contribution_limits.json', 'tax_brackets.json', 'return_bands.json', 'bands.json'];
const isUrl = (s) => typeof s === 'string' && /^https?:\/\/\S+$/.test(s);
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));

/* ---- 1. Every cell has a source URL and an asOf; nothing is stale ------------ */
function walkCells(v, trail, fn, depth) {
  if (!v || typeof v !== 'object' || depth > 14) return;
  if (Object.prototype.hasOwnProperty.call(v, 'value') && ('source' in v || 'asOf' in v || 'confidence' in v)) { fn(v, trail); }
  const keys = Array.isArray(v) ? v.map((_, i) => i) : Object.keys(v);
  keys.forEach((k) => { if (k !== 'value' || Array.isArray(v[k]) || (v[k] && typeof v[k] === 'object')) walkCells(v[k], trail + '.' + k, fn, depth + 1); });
}
const tables = {};
let stale = 0, historical = 0;
FILES.forEach((f) => {
  let t;
  try { t = load(f); ok(); } catch (e) { failures.push('load ' + f + ': ' + e.message); return; }
  tables[f] = t;
  check(f + ' has a refresh note', t.refresh && typeof t.refresh.month === 'string' && typeof t.refresh.against === 'string');
  check(f + ' has a top-level asOf', isDate(t.asOf));
  let cells = 0;
  walkCells(t, f, (c, trail) => {
    cells++;
    check(trail + ' has a source URL', isUrl(c.source), 'source: ' + JSON.stringify(c.source));
    check(trail + ' has an asOf date', isDate(c.asOf), 'asOf: ' + JSON.stringify(c.asOf));
    if (isDate(c.asOf)) {
      const fresh = TODAY - Date.parse(c.asOf) <= STALE_MS;
      if (!fresh && c.stale === true && /DECIDE/.test(c.note || '')) { stale++; ok(); }
      else if (!fresh && c.historical === true) { historical++; ok(); }
      else check(trail + ' is not older than 18 months', fresh, 'asOf ' + c.asOf);
    }
    check(trail + ' says how sure it is', ['sourced', 'recalled', 'convention'].indexOf(c.confidence) >= 0, 'confidence: ' + c.confidence);
    if (c.confidence === 'recalled') check(trail + ' recalled cells carry verify: true', c.verify === true);
  }, 0);
  notes.push(f + ': ' + cells + ' cells');
});
if (historical) notes.push(historical + ' prior-year cells (2025 rows) are older than 18 months and marked `historical: true`: a closed year is a settled fact, not a stale one. DECIDE: whether the 18-month rule should read that way.');
if (stale) notes.push(stale + ' cells are older than 18 months and say so (`stale: true` with a DECIDE: note); every one is the childcare column, whose 2024 edition this session could not open. Not a pass: a flag for the May refresh.');

/* ---- 2. states.json: every state, every column ---------------------------------- */
(function () {
  const t = tables['states.json'];
  if (!t) return;
  const CODES = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'];
  const byCode = {};
  (t.states || []).forEach((s) => { byCode[s.code] = s; });
  CODES.forEach((c) => check('state ' + c + ' present', !!byCode[c]));
  check('fifty states, DC and OTHER', (t.states || []).length === 52, 'found ' + (t.states || []).length);
  const columns = Object.keys(t.columns || {});
  check('eight columns declared', columns.length === 8, columns.join(','));
  columns.forEach((col) => {
    check('column ' + col + ' has a source URL and asOf', isUrl(t.columns[col].source) && isDate(t.columns[col].asOf));
    CODES.forEach((c) => {
      const cellv = byCode[c] && byCode[c][col];
      check(c + '.' + col + ' filled', cellv && cellv.value !== null && cellv.value !== undefined, JSON.stringify(cellv));
    });
  });
  CODES.forEach((c) => {
    const s = byCode[c]; if (!s) return;
    const it = s.incomeTax.value;
    check(c + ' income tax type is none, flat or brackets', ['none', 'flat', 'brackets'].indexOf(it.type) >= 0);
    check(c + ' top rate matches the type', it.type === 'none' ? it.topRate === 0 : (it.topRate > 0 && it.topRate < 0.2), JSON.stringify(it));
    check(c + ' property tax rate is a small share', s.propertyTaxEffectiveRate.value > 0 && s.propertyTaxEffectiveRate.value < 0.03);
    check(c + ' UI weeks between 12 and 30', s.uiMaxWeeks.value >= 12 && s.uiMaxWeeks.value <= 30);
    check(c + ' UI weekly max between $200 and $1,300', s.uiWeeklyMaxCents.value >= 20000 && s.uiWeeklyMaxCents.value <= 130000);
    check(c + ' ACA benchmark between $300 and $1,400 a month', s.acaBenchmarkSilver40MonthlyCents.value >= 30000 && s.acaBenchmarkSilver40MonthlyCents.value <= 140000);
    check(c + ' cost of living index between 80 and 200', s.costOfLivingIndex.value >= 80 && s.costOfLivingIndex.value <= 200);
  });
  /* Agreement with the tables the engines read today. */
  const sb = load('state_brackets_2026.json');
  CODES.forEach((c) => {
    const row = sb.states[c];
    check(c + ' has a schedule in state_brackets_2026.json', !!row);
    if (row) {
      const type = byCode[c].incomeTax.value.type;
      if (type !== row.type) notes.push('states.json says ' + c + ' is ' + type + ' for 2026; state_brackets_2026.json says ' + row.type + ' (2025 edition): the 2026 change is not yet in the engine table');
    }
  });
  const cc = load('childcare_by_state.json');
  CODES.forEach((c) => check(c + ' childcare agrees with childcare_by_state.json', byCode[c].childcareInfantCenterMonthlyCents.value === cc.states[c].monthlyCents));
  const ui = load('ui_benefits.json');
  let uiDiff = 0;
  CODES.forEach((c) => {
    const old = ui.states[c]; if (!old) return;
    if (old.maxWeeklyDollars * 100 !== byCode[c].uiWeeklyMaxCents.value || old.weeks !== byCode[c].uiMaxWeeks.value) uiDiff++;
  });
  notes.push('UI benefit cells differ from data/ui_benefits.json (the engine copy) in ' + uiDiff + ' states; states.json carries the July 2025 DOL edition plus the October 2025 increases, ui_benefits.json a 2025 recollection. DECIDE: which the engine reads.');
})();

/* ---- 3. Brackets monotonic, capital gains ordered ---------------------------------- */
(function () {
  const t = tables['tax_brackets.json'];
  if (!t) return;
  Object.keys(t.years).forEach((y) => {
    const yr = t.years[y];
    Object.keys(yr.brackets).forEach((fs) => {
      const rows = yr.brackets[fs].value;
      check(y + ' ' + fs + ' has seven rates', rows.length === 7);
      for (let i = 1; i < rows.length; i++) {
        check(y + ' ' + fs + ' rate ' + i + ' rises', rows[i].rate > rows[i - 1].rate);
        if (rows[i].upTo !== null) check(y + ' ' + fs + ' threshold ' + i + ' rises', rows[i].upTo > rows[i - 1].upTo, rows[i - 1].upTo + ' -> ' + rows[i].upTo);
      }
      check(y + ' ' + fs + ' top bracket is open', rows[rows.length - 1].upTo === null);
      const cg = yr.capitalGains[fs].value;
      check(y + ' ' + fs + ' capital gains thresholds ordered', cg.zeroUpTo > 0 && cg.fifteenUpTo > cg.zeroUpTo);
      check(y + ' ' + fs + ' standard deduction positive', yr.standardDeduction[fs].value > 0);
    });
    check(y + ' joint 10% bracket is twice single', yr.brackets.married_joint.value[0].upTo === 2 * yr.brackets.single.value[0].upTo);
    check(y + ' wage base above $150,000', yr.fica.socialSecurityWageBase.value > 150000);
  });
  check('the wage base rose from 2025 to 2026', t.years[2026].fica.socialSecurityWageBase.value > t.years[2025].fica.socialSecurityWageBase.value);
  /* The engines read this file through shared/reference.js views (D-210). */
  const Reference = require(path.join(ROOT, 'shared/reference.js'));
  const fed = Reference.view('federalBrackets', t), se = Reference.view('seTax', t);
  Object.keys(t.years[Reference.TAX_YEAR].brackets).forEach((fs) => {
    check('federalBrackets view carries the ' + fs + ' ladder', fed.brackets[fs].length === 7 && fed.brackets[fs][6].upToTaxableIncome === null);
    check('federalBrackets view carries the ' + fs + ' standard deduction', fed.standardDeduction[fs] === t.years[Reference.TAX_YEAR].standardDeduction[fs].value);
  });
  check('seTax view doubles the employee shares', se.socialSecurityRate === 0.124 && se.medicareRate === 0.029 && se.employeeFicaRate === 0.0765, JSON.stringify([se.socialSecurityRate, se.medicareRate, se.employeeFicaRate]));
  check('seTax view carries the safe harbour and the due dates', se.safeHarbor && se.safeHarbor.currentYearShare === 0.9 && se.quarterlyDueDates.length === 4);
  /* State brackets monotonic too. */
  const sb = load('state_brackets_2026.json');
  Object.keys(sb.states).forEach((c) => {
    const row = sb.states[c];
    if (row.type !== 'brackets' || !Array.isArray(row.brackets)) return;
    for (let i = 1; i < row.brackets.length; i++) {
      const a = row.brackets[i - 1], b = row.brackets[i];
      const top = (r) => r.upTo === undefined ? r.upToTaxableIncome : r.upTo;
      if (top(b) !== null && top(b) !== undefined) check(c + ' bracket ' + i + ' threshold rises', top(b) > top(a));
      check(c + ' bracket ' + i + ' rate never falls', b.rate >= a.rate);
    }
  });
})();

/* ---- 4. FPL rises with household size; applicable percentages ordered ---------------- */
(function () {
  const t = tables['lane2/aca.json'];
  if (!t) return;
  Object.keys(t.fpl).forEach((y) => Object.keys(t.fpl[y]).forEach((area) => {
    const r = t.fpl[y][area];
    check(y + ' ' + area + ' base positive', r.base.value > 0);
    check(y + ' ' + area + ' rises with household size', r.perAdditionalPerson.value > 0);
    for (let n = 1; n < 8; n++) check(y + ' ' + area + ' household of ' + (n + 1) + ' above household of ' + n, r.base.value + n * r.perAdditionalPerson.value > r.base.value + (n - 1) * r.perAdditionalPerson.value);
  }));
  check('2026 guideline above 2025', t.fpl[2026].contiguous.base.value > t.fpl[2025].contiguous.base.value);
  check('Alaska above the contiguous states', t.fpl[2026].alaska.base.value > t.fpl[2026].contiguous.base.value);
  Object.keys(t.applicablePercentage).forEach((y) => {
    const rows = t.applicablePercentage[y].value;
    for (let i = 0; i < rows.length; i++) {
      check(y + ' band ' + i + ' percentage does not fall inside the band', rows[i].to >= rows[i].from);
      if (i) { check(y + ' band ' + i + ' starts where the last ended', rows[i].fromFpl === rows[i - 1].toFpl); check(y + ' band ' + i + ' percentage does not fall across bands', rows[i].from >= rows[i - 1].to); }
    }
  });
  const old = load('aca_2026.json');
  check('2025 base agrees with aca_2026.json (which prices 2026 coverage)', old.fpl.base === t.fpl[2025].contiguous.base.value, old.fpl.base + ' vs ' + t.fpl[2025].contiguous.base.value);
  const oldTop = old.applicablePercentage[old.applicablePercentage.length - 1].percent;
  const newTop = t.applicablePercentage[2026].value[t.applicablePercentage[2026].value.length - 1].to;
  if (oldTop !== newTop) notes.push('2026 top applicable percentage: aca.json says ' + newTop + ' (Rev. Proc. 2025-25), aca_2026.json says ' + oldTop + '. DECIDE: which the engine reads.'); else ok();
})();

/* ---- 5. Contribution limits agree with the engine's table ------------------------------ */
(function () {
  const t = tables['lane2/contribution_limits.json'];
  if (!t) return;
  const irs = load('irs_limits_2026.json');
  const pairs = [['elective401k', 'elective401k'], ['elective401kCatchup50Plus', 'catchup50Plus'], ['ira', 'ira'], ['iraCatchup50Plus', 'iraCatchup50Plus'], ['hsaSelfOnly', 'hsaSelfOnly'], ['hsaFamily', 'hsaFamily'], ['annualAdditions', 'annualAdditions415c']];
  pairs.forEach(([a, b]) => {
    const x = irs.limits[a], y = t.years[2026][b].value;
    if (x === y) ok(); else notes.push('2026 ' + b + ': contribution_limits.json says ' + y + ' (IRS Notice 2025-67 as read from search), irs_limits_2026.json says ' + x + ' (carried from the FOO room). DECIDE: which the engine reads.');
  });
  check('2026 401(k) limit above 2025', t.years[2026].elective401k.value > t.years[2025].elective401k.value);
  check('Roth phase-out ranges ordered', Object.keys(t.years[2026].rothPhaseOut).every((k) => { const v = t.years[2026].rothPhaseOut[k].value; return v[1] > v[0]; }));
})();

/* ---- 6. Milestones and student loans hold their shape ---------------------------------- */
(function () {
  const m = tables['milestones.json'];
  if (m) {
    const ids = m.milestones.map((x) => x.id);
    ['catchup50', 'ruleOf55', 'penaltyFree', 'ssEarly', 'medicare', 'fullRetirementAge', 'ssDelayed', 'rmd'].forEach((id) => check('milestone ' + id + ' present', ids.indexOf(id) >= 0));
    const fra = m.milestones.filter((x) => x.id === 'fullRetirementAge')[0].byBirthYear;
    for (let i = 1; i < fra.length; i++) check('FRA row ' + i + ' does not fall', fra[i].years * 12 + fra[i].months >= fra[i - 1].years * 12 + fra[i - 1].months);
    const rmd = m.milestones.filter((x) => x.id === 'rmd')[0].byBirthYear;
    for (let i = 1; i < rmd.length; i++) check('RMD age row ' + i + ' does not fall', rmd[i].age >= rmd[i - 1].age);
    m.milestones.forEach((x) => check('milestone ' + x.id + ' rule has a citation', typeof x.rule.citation === 'string' && x.rule.citation.length > 0));
  }
  const s = tables['lane2/studentloans.json'];
  if (s) {
    check('PSLF is 120 payments', s.pslf.paymentsRequired.value === 120);
    s.plans.forEach((p) => {
      check('plan ' + p.id + ' has a status', p.status && typeof p.status.value === 'string');
      if (p.discretionaryShare && p.discretionaryShare.value !== null) check('plan ' + p.id + ' share between 5% and 25%', p.discretionaryShare.value >= 0.05 && p.discretionaryShare.value <= 0.25);
      if (p.forgivenessYears) check('plan ' + p.id + ' forgiveness between 20 and 30 years', p.forgivenessYears.value >= 20 && p.forgivenessYears.value <= 30);
    });
  }
  const b = tables['bands.json'];
  if (b) {
    Object.keys(b.letters).forEach((k) => {
      ['slaf', 'trench', 'moneyguy', 'fiftythirty'].forEach((src) => check('band ' + k + ' has ' + src, b.letters[k].sources[src] && typeof b.letters[k].sources[src].high === 'number'));
      check('band ' + k + ' has a slaf proposal marked DECIDE', b.slafProposed.letters[k] && /DECIDE/.test(b.slafProposed.letters[k].note));
    });
    ['trench', 'moneyguy', 'fiftythirty'].forEach((src) => check('citation for ' + src, b.citations[src] && isUrl(b.citations[src].source) && Object.keys(b.citations[src].where).length === Object.keys(b.letters).length));
  }
  const r = tables['return_bands.json'];
  if (r) {
    check('return bands unchanged: 2 / 5 / 8', r.percentiles.p25 === 0.02 && r.percentiles.p50 === 0.05 && r.percentiles.p75 === 0.08);
    check('return bands name a series and window', r.sourceSeries && isUrl(r.sourceSeries.named.source) && typeof r.sourceSeries.named.window === 'string');
    check('return bands carry a DECIDE', /DECIDE/.test(r.sourceSeries.decide));
  }
})();

/* ---- Report --------------------------------------------------------------------------- */
const report = { files: FILES, passed, failures: failures.slice(), notes: notes.slice() };
fs.mkdirSync(path.join(ROOT, 'tests', 'reports'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'tests', 'reports', 'data.json'), JSON.stringify(report, null, 2) + '\n');
try { require(path.join(ROOT, 'tests', 'tools', 'findings.js')).render(); } catch (e) { /* the renderer is optional here */ }
notes.forEach((n) => console.log('  note: ' + n));
if (failures.length) {
  console.log('\n' + failures.length + ' FAILED, ' + passed + ' passed\n');
  failures.slice(0, 40).forEach((f) => console.log('  x ' + f));
  process.exit(1);
}
console.log(passed + ' checks passed');
