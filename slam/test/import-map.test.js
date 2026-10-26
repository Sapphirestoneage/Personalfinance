// data/import-map.json is the only place the numbers spreadsheet's questions and synonyms live (S-237). This fails
// when a household field has no entry there, or an entry points at a field (or a kind) that no longer exists.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PRESETS, INCOME_TYPES, DEBT_PLAN_FIELDS, TAX_YEAR_FIELDS, validate } from '../engine/schema.js';
import { loadHousehold } from '../engine/normalize.js';
import { setAt } from '../engine/spine.js';
import { fieldPath } from '../js/sheet-import.js';
import { readJson, SLAM } from './spine-helpers.js';

const map = readJson('data/import-map.json');
const schemaSrc = readFileSync(SLAM + 'engine/schema.js', 'utf8');
const demo = () => loadHousehold(readJson('fixtures/demo.json'));

// Every household field the validator checks, read from its source so a new one is caught here.
function householdFields() {
  const out = new Set([...schemaSrc.matchAll(/checkFact\('household\.(\w+)'/g)].map((m) => 'household.' + m[1]));
  out.add('household.people.$me.name'); out.add('household.people.$me.birthDate');
  out.add('household.situation.now.value'); out.add('household.healthCoverage.now.value');
  const A = /for \(const k of \[([^\]]+)\]\) checkFact\('assumptions\.'/.exec(schemaSrc);
  for (const k of A[1].match(/\w+/g)) out.add('assumptions.' + k);
  for (const m of schemaSrc.matchAll(/checkFact\('assumptions\.(\w+)'/g)) out.add('assumptions.' + m[1]);
  for (const k of DEBT_PLAN_FIELDS) out.add('debtPlan.' + k);
  for (const k of TAX_YEAR_FIELDS) out.add('taxYears.$year.' + k);
  return out;
}

test('every household field has a question on the sheet', () => {
  const mapped = new Set(map.fields.map((f) => f.path));
  const missing = [...householdFields()].filter((p) => !mapped.has(p));
  assert.deepEqual(missing, [], 'add these to data/import-map.json fields');
});

test('every kind of account, debt and income has words to find it by', () => {
  const has = (c, t) => (map.kinds[c] || []).some((k) => k.type === t);
  const missing = [];
  for (const [t, p] of Object.entries(PRESETS)) if (!has(p.family === 'debt' ? 'debts' : 'accounts', t)) missing.push(t);
  for (const t of INCOME_TYPES) if (!has('income', t)) missing.push('income ' + t);
  assert.deepEqual(missing, []);
});

test('no entry points at a kind that no longer exists', () => {
  const stale = [];
  for (const c of ['accounts', 'debts']) for (const k of map.kinds[c]) if (!PRESETS[k.type] || (PRESETS[k.type].family === 'debt') !== (c === 'debts')) stale.push(c + ' ' + k.type);
  for (const k of map.kinds.income) if (!INCOME_TYPES.includes(k.type)) stale.push('income ' + k.type);
  assert.deepEqual(stale, []);
});

// A field exists when the validator takes a right value there and refuses a wrong one.
const GOOD = { money: 1, rate: 0.05, int: 2, text: 'a', bool: true, date: '2000-01-01', name: 'A', scenarios: 0.05 };
const BAD = { money: 'x', rate: 'x', int: 1.5, text: 5, bool: 'x', date: 'x', choice: 'zzz', name: 5, scenarios: 'x' };
test('no entry points at a field that no longer exists', () => {
  const s0 = demo();
  for (const f of map.fields) {
    const path = fieldPath(s0, f);
    const good = f.type === 'choice' ? Object.keys(f.choices)[0] : GOOD[f.type];
    const put = (v) => {
      let s = s0;
      const ty = /^taxYears\.(\d{4})\./.exec(path);
      if (ty && !s.taxYears.some((x) => x.id === ty[1])) s = { ...s, taxYears: [...s.taxYears, { id: ty[1], year: +ty[1] }] };
      return setAt(s, path, f.type === 'name' ? v : { value: v, kind: 'known', asOf: '2026-10-01', source: 'test' });
    };
    assert.ok(validate(put(good)).ok, path + ' takes ' + JSON.stringify(good) + ': ' + JSON.stringify(validate(put(good)).errors));
    assert.ok(!validate(put(BAD[f.type])).ok, path + ' is not a field the household checks');
    if (f.type === 'choice') for (const v of Object.keys(f.choices)) assert.ok(validate(put(v)).ok, path + ' choice ' + v);
  }
});

test('every section has a title and words; every field names one', () => {
  const ids = new Set(map.sections.map((s) => s.id));
  for (const s of map.sections) assert.ok(s.title && s.words.length, s.id);
  for (const f of map.fields) assert.ok(ids.has(f.section), f.path);
  assert.deepEqual(map.sections.map((s) => s.title), ['About you', 'Money coming in', 'Monthly spending: needs', 'Monthly spending: wants', 'What you have', 'What you owe', 'Goals', 'Assumptions']);
});
