// The type catalog (S-266): every account, debt and income type lists what it has; every field it opens is a schema field.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readJson, loadRules } from './spine-helpers.js';
import { loadHousehold, upgradeSpine } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';
import { PRESETS, INCOME_TYPES, FAMILIES, INCOME_DEPTH, validate } from '../engine/schema.js';
import { featuresOf, tickFeature, tickTodos, tickCount, matchTiersOf, matchOn, parseMatchText } from '../engine/features.js';
import { addItem } from '../engine/edits.js';

const cat = JSON.parse(readFileSync(new URL('../data/type-features.json', import.meta.url), 'utf8'));
const R = loadRules();
const demo = () => applyDefaults(loadHousehold(readJson('fixtures/demo.json')), R);
const T = '2026-10-27';
const INCOME_FIELDS = { ...INCOME_DEPTH, businessExpenses: 'money' };

test('every preset and income type is in the catalog, each feature well formed, each field in the schema', () => {
  for (const t of Object.keys(PRESETS)) assert.ok(cat.types[t], t);
  for (const t of INCOME_TYPES) assert.ok(t in cat.income, t);
  const check = (f, fields, where) => {
    assert.ok(f.id && /\?/.test(f.question) && ['core', 'extra'].includes(f.tier) && Array.isArray(f.engines), where + ' ' + f.id);
    for (const r of f.reveals) {
      assert.ok(['client', 'coach', 'guess'].includes(r.supplier), where + ' ' + r.field);
      assert.ok(r.field in fields, where + ': ' + r.field + ' is not a field');
    }
  };
  for (const [t, x] of Object.entries(cat.types)) {
    const fields = { ...FAMILIES.base.fields, ...FAMILIES[x.family].fields };
    const fs = featuresOf(cat, { type: t }, x.family === 'debt' ? 'debts' : 'accounts');
    assert.ok(fs.length, t + ' has features');
    assert.equal(new Set(fs.map((f) => f.id)).size, fs.length, t + ': ids unique');
    for (const f of fs) check(f, fields, t);
  }
  for (const [t, fs] of Object.entries(cat.income)) for (const f of fs) check(f, INCOME_FIELDS, 'income ' + t);
});

test('a 401(k) has the match tiers, true-up, vesting, loan, mega backdoor, funds, old job and more', () => {
  const ids = featuresOf(cat, { type: 'k401' }, 'accounts').map((f) => f.id);
  for (const id of ['contributing', 'rothSplit', 'match', 'employerExtra', 'vesting', 'ytd', 'autoIncrease', 'loan', 'afterTax', 'funds', 'beneficiary', 'oldJob']) assert.ok(ids.includes(id), id);
  assert.ok(featuresOf(cat, { type: 'k401' }, 'accounts').find((f) => f.id === 'match').reveals.some((r) => r.field === 'matchTiers' && r.type === 'tiers'));
});

test('yes opens the fields (a default as a guess), no sets them not for me and keeps what was typed, not sure makes a to-do', () => {
  let { spine: s, id } = addItem(demo(), { collection: 'accounts', type: 'k401', label: 'Acme 401(k)' }, T);
  const base = 'accounts.' + id, f = (fid) => featuresOf(cat, { type: 'k401' }, 'accounts').find((x) => x.id === fid);
  s = tickFeature(s, base, f('vesting'), 'yes', { rules: R, today: T });
  const a = s.accounts.find((x) => x.id === id);
  assert.deepEqual([a.vestingYears.value, a.vestingYears.kind], [3, 'rough'], 'the guess fills as a guess, never as known');
  assert.equal(a.vestingType.kind, 'missing');
  assert.equal(a.ticks.vesting, 'yes');
  s = tickFeature(s, base, f('vesting'), 'no', { rules: R, today: T });
  assert.equal(s.accounts.find((x) => x.id === id).vestingYears.kind, 'notForMe');
  s = tickFeature(s, base, f('vesting'), 'yes', { rules: R, today: T });
  assert.equal(s.accounts.find((x) => x.id === id).vestingYears.value, 3, 'yes again brings back what was there');
  s = tickFeature(s, base, f('match'), 'notSure', { rules: R, today: T });
  const todo = tickTodos(cat, s).find((x) => x.path.startsWith(base));
  assert.equal(todo.who, 'client');
  assert.match(todo.words, /Acme 401\(k\): Does your employer match\?/);
  assert.deepEqual(tickCount(cat, s.accounts.find((x) => x.id === id), 'accounts'), { checked: 2, total: 14 });
  assert.ok(validate(s).ok, validate(s).errors.map((e) => e.path + ' ' + e.message).join('; '));
});

test('match tiers: worked out tier by tier; old words become tiers and stay as written', () => {
  assert.deepEqual(parseMatchText('100% of the first 3%, 50% of the next 2%'), [{ rate: 1, upTo: 0.03 }, { rate: 0.5, upTo: 0.02 }]);
  assert.deepEqual(parseMatchText('dollar for dollar up to 4%'), [{ rate: 1, upTo: 0.04 }]);
  assert.equal(parseMatchText('they match some'), null);
  // $400 in on $10,000 of pay: the first $300 matched in full, the next $100 at half.
  assert.equal(matchOn([{ rate: 1, upTo: 0.03 }, { rate: 0.5, upTo: 0.02 }], 400, 10000), 350);
  assert.deepEqual(matchTiersOf({ matchRate: { value: 0.5, kind: 'known' }, matchCap: { value: 0.06, kind: 'known' } }), [{ rate: 0.5, upTo: 0.06 }]);
  const d = demo();
  const k = d.accounts.find((a) => a.family === 'employerRetirement');
  const strip = ({ matchTiers, ...rest }) => rest;
  const old = { ...d, accounts: d.accounts.map((a) => (a === k ? { ...strip(a), matchFormula: { value: '100% of the first 3%, 50% of the next 2%', kind: 'known', asOf: '2026-01-01', source: 'ledger' } } : a)) };
  // The demo's own words ("100% of first 4%") read as one tier too.
  assert.deepEqual(k.matchTiers.value, [{ rate: 1, upTo: 0.04 }]);
  const up = upgradeSpine(old).accounts.find((a) => a.id === k.id);
  assert.deepEqual(up.matchTiers.value, [{ rate: 1, upTo: 0.03 }, { rate: 0.5, upTo: 0.02 }]);
  assert.equal(up.matchFormula.value, '100% of the first 3%, 50% of the next 2%', 'the words stay');
  assert.ok(validate(upgradeSpine(old)).ok);
});

// S-267: every account has beneficiary and titling ticks; a retirement account with no beneficiary is a flag; the
// employer plan memory keeps only plan rules; a Social Security estimate is recorded per person.
test('beneficiary, titling, employer memory, Social Security estimate', async () => {
  const { beneficiaryFlag, tickTodos } = await import('../engine/features.js');
  const { planTemplateOf, rememberFrom, applyTemplate, employerKey, FROM_MEMORY } = await import('../engine/employer-plans.js');
  const { ssEstimates } = await import('../engine/ss.js');
  const { validate } = await import('../engine/schema.js');
  for (const [name, t] of Object.entries(cat.types)) {
    if (t.family === 'debt') continue;
    const ids = featuresOf(cat, { type: name }, 'accounts').map((f) => f.id);
    assert.ok(ids.includes('titling'), name + ' has titling');
    assert.ok(ids.includes('beneficiary') || ids.includes('successor'), name + ' has a beneficiary tick');
  }
  const k = { id: 'k', family: 'employerRetirement', type: 'k401', name: { value: 'Work 401(k)', kind: 'known' }, balance: { value: 9000, kind: 'known' },
    employerName: { value: 'Acme Health, Inc.', kind: 'known' }, matchTiers: { value: [{ rate: 1, upTo: 0.03 }], kind: 'known' }, vestingYears: { value: 3, kind: 'known' },
    monthlyContribution: { value: 500, kind: 'known' }, ticks: { beneficiary: 'no' } };
  assert.equal(beneficiaryFlag(k), true);
  assert.ok(tickTodos(cat, { accounts: [k], debts: [], income: [] }).some((x) => /beneficiary/.test(x.words)));
  const tpl = planTemplateOf(k);
  assert.deepEqual(Object.keys(tpl.fields).sort(), ['matchTiers', 'vestingYears'], 'plan rules only: no balance, no contribution');
  assert.equal(employerKey('ACME Health inc'), employerKey('Acme Health, Inc.'));
  const store = rememberFrom({ accounts: [k] });
  const fresh = { accounts: [{ id: 'n', family: 'employerRetirement', type: 'k401', name: { value: 'New', kind: 'known' }, balance: { value: 0, kind: 'known' } }] };
  const filled = applyTemplate(fresh, 'accounts.n', store[employerKey('acme health')], '2026-10-27');
  assert.equal(filled.accounts[0].matchTiers.kind, 'rough');
  assert.equal(filled.accounts[0].matchTiers.source, FROM_MEMORY);
  assert.equal(planTemplateOf({ ...filled.accounts[0], employerName: { value: 'Acme', kind: 'known' } }), null, 'a remembered guess is never remembered again');
  const demo = JSON.parse(readFileSync(new URL('../fixtures/demo.json', import.meta.url)));
  const p0 = demo.household.people[0];
  const F = (value) => ({ value, kind: 'known', asOf: '2026-10-27', source: 'ledger' });
  demo.household.people[0] = { ...p0, ssAtFra: F(2100), ssAsOf: F('2026-06-01') };
  demo.accounts[0] = { ...demo.accounts[0], coachNote: F('Ask about the old plan'), titling: F('joint'), beneficiaryNamed: F(true) };
  assert.deepEqual(validate(demo).errors, []);
  assert.equal(ssEstimates(demo)[0].atFra, 2100);
});

// S-270: the two-screen rule on an item, a type default always a guess, and the keys on every page.
test('screen two: fields only extra questions open go in More; defaults land as guesses; the keys are listed', async () => {
  const { screenTwoFields } = await import('../engine/features.js');
  const two = screenTwoFields(cat, { type: 'k401' }, 'accounts');
  assert.ok(two.has('expenseRatio') && two.has('titling') && two.has('beneficiaryNamed'), 'fees, titling and the beneficiary are screen two');
  assert.ok(!two.has('matchTiers') && !two.has('monthlyContribution'), 'the match and what you put in are screen one');
  const src = readFileSync(new URL('../ui/shortcuts.js', import.meta.url), 'utf8');
  for (const k of ["'Enter'", "'y n s'", "'m'"]) assert.ok(src.includes('[' + k), k + ' is in the keyboard list');
  const kit = readFileSync(new URL('../affordances.html', import.meta.url), 'utf8');
  for (const c of ['headline-strip', 'tick-list', 'more-drawer', 'keys-hint', 'next-card']) assert.ok(kit.includes(c), c + ' is in the Design kit');
  const strip = readFileSync(new URL('../ui/strip.js', import.meta.url), 'utf8');
  for (const id of ['netWorth', 'liquidNetWorth', 'surplus', 'savingsRateNet', 'yearsToFi']) assert.ok(strip.includes("metric('" + id + "'"), id + ' is tagged for the agree check');
});
