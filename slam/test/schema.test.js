import test from 'node:test';
import assert from 'node:assert/strict';
import { validate, PRESETS, FAMILIES, SCHEMA_ID } from '../engine/schema.js';
import { loadHousehold, fromProfile } from '../engine/normalize.js';
import { fact, getAt, setAt, listFacts, valueOf, ageOn, inForce, addMonths, monthEnd } from '../engine/spine.js';
import { readJson, exists, loadRules } from './spine-helpers.js';

const errs = (r) => r.errors.map((e) => e.path + ': ' + e.message).join('\n');

test('the demo household validates', () => {
  const r = validate(loadHousehold(readJson('fixtures/demo.json')));
  assert.ok(r.ok, errs(r));
});

test('the local profile validates after loading (skipped without it)', { skip: !exists('fixtures/eli.local.json') }, () => {
  const spine = loadHousehold(readJson('fixtures/eli.local.json'));
  const r = validate(spine);
  assert.ok(r.ok, errs(r));
  assert.equal(spine.schema, SCHEMA_ID);
});

test('a profile-shaped household turns into a spine', () => {
  const p = {
    _meta: { name: 'T', asOf: '2026-10-22', version: 3 },
    household: {
      people: [{ id: 'a', name: 'A', birthDate: '1990-01-01', kind: 'known' }],
      filingStatus: { value: 'single', kind: 'known' }, state: { value: 'NY', kind: 'known' }, county: { value: 'X', kind: 'known' }, nycResident: { value: false, kind: 'known' },
      situation: { value: 'between_jobs', changesTo: 'self_employed', on: '2027-01-01', kind: 'rough' },
      healthCoverage: { value: 'parent_plan', endsOn: '2026-12-01', after: 'own_plan', kind: 'known' }
    },
    income: [
      { id: 'w', type: 'w2', label: 'W', amount: null, cadence: 'yearly', start: '2026-01-01', end: '2026-06-30', kind: 'missing' },
      { id: 'c', type: '1099', label: 'C', amount: 0, cadence: 'monthly', start: '2027-01-01', end: null, kind: 'missing' }
    ],
    expenses: [{ label: 'Rent', amount: 1000, cadence: 'monthly', fat: 'accommodation', fixed: true, kind: 'known' }],
    accounts: [{ id: 'chk', family: 'cash', type: 'checking', institution: 'B', balance: 10, kind: 'known' }],
    debts: [{ id: 'cc', type: 'credit_card', lender: 'L', balance: 5, apr: null, kind: 'known' }],
    otherAssets: [{ type: 'car', value: 100, kind: 'rough' }],
    goals: [{ label: 'FI', fiNumber: 1000, kind: 'known' }],
    assumptions: { inflation: { value: 0.03, kind: 'rough' }, realReturn: { value: 0.05, kind: 'rough' }, withdrawalRate: { value: 0.04, kind: 'rough' }, lifeExpectancy: { value: 95, kind: 'rough' } }
  };
  const s = fromProfile(p);
  const r = validate(s);
  assert.ok(r.ok, errs(r));
  assert.equal(s.income[0].cadence, 'total', 'a yearly amount over a half year window is a total');
  assert.equal(s.income[1].amount.value, null, 'a 0 marked missing is a blank');
  assert.equal(s.income[1].amount.kind, 'missing');
  assert.equal(s.debts[0].apr.kind, 'missing');
  assert.equal(s.debts[0].limit.kind, 'missing', 'a card always carries its limit');
  assert.equal(s.expenses[0].id, 'rent');
  assert.equal(s.accounts.find((a) => a.type === 'car').family, 'otherAssets');
  assert.equal(s.household.situation[1].from, '2027-01-01');
  assert.equal(s.goals[0].type, 'fi');
  // Every line is the first person's unless it names someone in the household (S-211).
  assert.deepEqual(s.income.map((x) => x.personId), ['a', 'a']);
  const two = fromProfile({ ...p, household: { ...p.household, people: [...p.household.people, { id: 'b', name: 'B', birthDate: '1991-01-01', kind: 'known' }] }, income: [{ ...p.income[0], personId: 'b' }, { ...p.income[1], person: 'nobody' }] });
  assert.deepEqual(two.income.map((x) => x.personId), ['b', 'a']);
});

test('the validator catches a zero that should be missing, bad kinds and bad families', () => {
  const s = loadHousehold(readJson('fixtures/demo.json'));
  s.income[0].amount = { value: 0, asOf: null, source: null, kind: 'missing' };
  s.debts[0].family = 'cash';
  s.accounts[0].apr = fact(0.1);
  s.expenses[0].amount = { value: 5, asOf: null, source: null, kind: 'maybe' };
  const r = validate(s);
  const paths = r.errors.map((e) => e.path);
  assert.ok(paths.includes('income.salary.amount'));
  assert.ok(paths.includes('debts.visa.family'));
  assert.ok(paths.includes('accounts.chk.apr'));
  assert.ok(paths.includes('expenses.rent.amount'));
});

test('every preset belongs to a family and names real rules', () => {
  const R = loadRules();
  for (const [id, p] of Object.entries(PRESETS)) {
    assert.ok(FAMILIES[p.family], id + ' family');
    for (const k of ['limitRule', 'catchUpRule']) if (p[k]) assert.ok(R.has(p[k]), id + ' ' + p[k]);
  }
  assert.equal(Object.keys(FAMILIES).length, 11, 'eleven families including base and policy (S-275)');
});

test('fact: missing carries null and kind defaults from the value', () => {
  assert.deepEqual(fact(null), { value: null, asOf: null, source: null, kind: 'missing' });
  assert.equal(fact(5).kind, 'known');
  assert.equal(fact(5, { kind: 'missing' }).value, null);
  assert.equal(fact(null, { kind: 'rough' }).kind, 'missing');
  assert.equal(valueOf(fact(3, { kind: 'notForMe' })), null);
});

test('paths read and write by id without touching the original', () => {
  const s = loadHousehold(readJson('fixtures/demo.json'));
  assert.equal(getAt(s, 'debts.visa.apr').value, 0.22);
  const t = setAt(s, 'debts.visa.apr', fact(0.2));
  assert.equal(getAt(t, 'debts.visa.apr').value, 0.2);
  assert.equal(getAt(s, 'debts.visa.apr').value, 0.22);
  assert.ok(listFacts(s).some((x) => x.path === 'income.salary.withholding.federal'));
});

test('date helpers', () => {
  assert.equal(ageOn('2000-12-01', '2026-10-22'), 25);
  assert.equal(ageOn('2000-12-01', '2026-11-30'), 25);
  assert.equal(ageOn('2000-12-01', '2026-12-01'), 26);
  assert.equal(addMonths('2026-11', 3), '2027-02');
  assert.equal(monthEnd('2028-02'), '2028-02-29');
  const tl = [{ from: null, v: 'a' }, { from: '2027-01-01', v: 'b' }];
  assert.equal(inForce(tl, '2026-12-31').v, 'a');
  assert.equal(inForce(tl, '2027-01-01').v, 'b');
});
