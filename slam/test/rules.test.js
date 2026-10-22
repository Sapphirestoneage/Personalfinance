import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { makeRules, statusRuleId } from '../engine/rules.js';
import { SLAM, readJson, loadRules } from './spine-helpers.js';

test('the registry loads and every rule has the eight fields', () => {
  const reg = readJson('data/rules-2026.json');
  assert.equal(reg.year, 2026);
  for (const r of reg.rules) {
    for (const k of ['id', 'rule', 'value', 'unit', 'appliesTo', 'notes', 'source', 'verified']) assert.ok(k in r, r.id + ' lacks ' + k);
    assert.ok(['yes', 'law', 'verify', 'app', 'assumption'].includes(r.verified), r.id + ' verified word');
  }
});

test('get returns values from the sheet', () => {
  const R = loadRules();
  assert.equal(R.get('STD_S', 2026), 16100);
  assert.equal(R.get('IRA_LIMIT', 2026), 7500);
  assert.equal(R.get('SE_FACTOR', 2026), 0.9235);
  assert.equal(R.get('SS_WAGE', 2026), 184500);
});

test('a later year falls back to the latest registry and says so', () => {
  const R = loadRules();
  assert.equal(R.get('STD_S', 2031), 16100);
  assert.equal(R.meta('STD_S', 2031).fallback, true);
  assert.equal(R.meta('STD_S', 2026).fallback, false);
});

test('an unknown id throws instead of returning a default', () => {
  const R = loadRules();
  assert.throws(() => R.get('NOPE_RULE', 2026), /Unknown rule id/);
});

test('duplicate ids are refused', () => {
  assert.throws(() => makeRules({ year: 2026, rules: [{ id: 'A' }, { id: 'A' }] }), /Duplicate/);
});

test('statusRuleId maps filing status to a rule id', () => {
  assert.equal(statusRuleId('STD', 'single'), 'STD_S');
  assert.equal(statusRuleId('FED_BRK', 'mfj'), 'FED_BRK_J');
  assert.throws(() => statusRuleId('STD', 'other'));
});

// Every rule id an engine names must exist. Engines name rules two ways:
// rules.get('ID') / cite('ID') / meta('ID'), and statusRuleId('PREFIX', status),
// whose four expansions must all exist.
test('every rule id referenced in code exists', () => {
  const R = loadRules();
  const dirs = ['engine', 'ui'];
  // get('X'), rule(rules, 'X'), g('X') and statusRuleId('X', ...), id('X') forms.
  const direct = /\b(?:get|cite|meta|has|rule|g)\(\s*(?:[A-Za-z_.]+\s*,\s*)?'([A-Z][A-Z0-9_]+)'/g;
  const prefixed = /\b(?:statusRuleId|id)\(\s*'([A-Z][A-Z0-9_]+)'/g;
  let seen = 0;
  for (const d of dirs) {
    let files = [];
    try { files = readdirSync(SLAM + d, { recursive: true }).filter((f) => String(f).endsWith('.js')); } catch { continue; }
    for (const f of files) {
      const src = readFileSync(SLAM + d + '/' + f, 'utf8');
      for (const m of src.matchAll(direct)) { seen++; assert.ok(R.has(m[1]), d + '/' + f + ' names missing rule ' + m[1]); }
      for (const m of src.matchAll(prefixed)) {
        for (const s of ['single', 'mfj', 'mfs', 'hoh']) { seen++; assert.ok(R.has(statusRuleId(m[1], s)), d + '/' + f + ' needs ' + statusRuleId(m[1], s)); }
      }
    }
  }
  assert.ok(seen > 20, 'the scan found the rule references in the engines (' + seen + ')');
});
