// Phase 2.5, Batch 3: the Session's fast entry. Money from a person is taxed only when it should be; side money and an
// allowance for your time are self-employment; liquid assets by type with an override; goals by deadline; the
// assumption sets read Conservative, Standard, Optimistic and Your own, with a warning past Optimistic.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fact } from '../engine/spine.js';
import { loadRules } from './spine-helpers.js';
import { summarize } from '../engine/summary.js';
import { personTax, isSelfEmployment, validate, INCOME_TYPES } from '../engine/schema.js';
import { liquidAssets, balanceSheet } from '../engine/networth.js';
import { goalsView } from '../engine/plan.js';
import { SCENARIOS, SCENARIO_WORDS, scenarioAssumptions, beyondOptimistic } from '../engine/scenarios.js';
import { addItem } from '../engine/edits.js';

const R = loadRules();
const K = (x) => fact(x, { kind: 'known', asOf: '2026-10-22', source: 'test' });
function mini(over = {}) {
  const s = {
    schema: 'slam-spine/1', meta: { name: 'Test', asOf: '2026-10-22', demo: true },
    household: { people: [{ id: 'p', name: 'Pat', birthDate: K('1996-01-01') }], filingStatus: K('single'), state: K('NY'), county: K('Albany'), nycResident: K(false), situation: [{ id: 'now', from: null, value: K('employed') }], healthCoverage: [{ id: 'now', from: null, value: K('employer') }] },
    income: [], expenses: [], accounts: [], debts: [], goals: [],
    assumptions: { inflation: K(0.03), realReturn: K(0.05), withdrawalRate: K(0.04), lifeExpectancy: K(90) },
    taxYears: [{ id: '2026', year: 2026, estimatedPaidFederal: K(0), estimatedPaidState: K(0) }], ...over
  };
  const r = validate(s);
  assert.ok(r.ok, r.errors.map((e) => e.path + ' ' + e.message).join('\n'));
  return s;
}
const stream = (id, type, amount, cadence, o = {}) => ({ id, type, label: id, personId: 'p', amount: K(amount), cadence, start: null, end: null, withholding: { federal: K(o.fed ?? 0), state: K(o.st ?? 0) } });
const person = (purpose, extra = {}) => ({ ...stream('p', 'person', 1000, 'monthly', { fed: 0, st: 0 }), from: K('Parents'), purpose: K(purpose), ...extra });

test('money from a person: gifts, support and child support are not taxed; alimony by the decree year; an allowance by its switch', () => {
  assert.equal(personTax(person('gift')), 'none');
  assert.equal(personTax(person('childSupport')), 'none');
  assert.equal(personTax(person('alimony', { decreeYear: K(2019) })), 'none');
  assert.equal(personTax(person('alimony', { decreeYear: K(2015) })), 'ordinary');
  assert.equal(personTax(person('alimony')), null, 'no decree year: missing, not a guess');
  assert.equal(personTax(person('allowance')), 'none');
  assert.equal(personTax(person('allowance', { allowanceMode: K('time') })), 'se');
  assert.ok(isSelfEmployment(person('allowance', { allowanceMode: K('time') })));
  assert.ok(isSelfEmployment({ type: 'side' }));
  assert.ok(INCOME_TYPES.includes('side') && INCOME_TYPES.includes('person'));
});

test('a gift adds no tax; alimony under an old decree and side money do', () => {
  const base = { income: [stream('job', 'w2', 4000, 'monthly', { fed: 400, st: 150 })], expenses: [] };
  const due = (inc) => summarize(mini({ ...base, income: [...base.income, inc] }), R, { flags: false }).tax.balanceDue.value;
  const none = summarize(mini(base), R, { flags: false }).tax.balanceDue.value;
  assert.equal(due(person('gift')), none, 'a gift changes nothing');
  assert.ok(due(person('alimony', { decreeYear: K(2015) })) > none, 'old alimony is taxed');
  assert.ok(due({ ...stream('s', 'side', 1000, 'monthly', { fed: 0, st: 0 }) }) > due(person('alimony', { decreeYear: K(2015) })), 'side money owes self-employment tax too');
  assert.equal(due(person('alimony')), null, 'a missing decree year leaves the tax missing');
  assert.equal(validate(mini({ ...base, income: [...base.income, person('gift')] })).ok, true);
});

test('liquid assets: cash, taxable and Roth contributions by default; an override wins', () => {
  const acct = (id, type, family, bal, extra = {}) => ({ id, type, family, name: K(id), balance: K(bal), ...extra });
  const s = mini({ accounts: [acct('chk', 'checking', 'cash', 1000), acct('bk', 'brokerage', 'taxable', 2000), acct('roth', 'roth_ira', 'ira', 9000, { basis: K(4000) }), acct('k', 'k401', 'employerRetirement', 30000), acct('car', 'car', 'otherAssets', 8000), acct('hsa', 'hsa', 'hsaFsa', 3000, { liquid: K(true) })] });
  const l = liquidAssets(s);
  assert.equal(l.value, 1000 + 2000 + 4000 + 3000);
  assert.deepEqual(l.items.map((x) => x.id + ':' + x.part), ['chk:all', 'bk:all', 'roth:contributions', 'hsa:all']);
  const b = balanceSheet(s);
  assert.equal(b.liquidNetWorth.value, b.liquid.value - b.debts.value);
});

test('goals fund one at a time by priority, or by deadline when chosen', () => {
  const g = (id, by, priority) => ({ id, type: 'savings', label: id, target: K(1000), by, priority: K(priority) });
  const s = mini({ goals: [g('trip', '2027-06-01', 1), g('car', '2027-01-01', 2)] });
  const order = (sp) => goalsView(sp, R, summarize(sp, R, { flags: false })).rows.map((r) => r.id);
  assert.deepEqual(order(s), ['trip', 'car']);
  assert.deepEqual(order({ ...s, household: { ...s.household, goalOrder: K('byDeadline') } }), ['car', 'trip']);
});

test('assumption sets: Conservative, Standard (default), Optimistic, Your own; a warning past Optimistic', () => {
  assert.deepEqual(SCENARIOS.map((x) => SCENARIO_WORDS[x]), ['Conservative', 'Standard', 'Optimistic', 'Your own']);
  const s = mini({ assumptions: { inflation: K(0.03), realReturn: K(0.08), withdrawalRate: K(0.04), lifeExpectancy: K(90) } });
  assert.equal(scenarioAssumptions(s, R, 'optimistic').realReturn.value, R.get('SCENARIO_OPT_RETURN', 2026));
  assert.match(beyondOptimistic(s, R), /a return above 7%/);
  assert.equal(beyondOptimistic({ ...s, assumptions: { ...s.assumptions, realReturn: K(0.05) } }, R), null);
});

test('the Session: five steps with letters, tick lists and presets from data, Back and Next, and no Other income to pick', () => {
  const src = readFileSync(new URL('../ui/session.js', import.meta.url), 'utf8');
  assert.match(src, /const STEPS = \[\['needs', 'N', 'Needs'\], \['debt', 'D', 'Debt'\], \['income', 'I', 'Income'\], \['assets', 'A', 'Assets'\], \['goals', 'G', 'Goals'\]\];/);
  assert.match(src, /'Next: ' \+ next\[2\]/);
  const data = JSON.parse(readFileSync(new URL('../data/session-presets.json', import.meta.url), 'utf8'));
  assert.deepEqual(data.needs.map((c) => c.label), ['Accommodation', 'Food', 'Transportation', 'Health and fitness', 'Subscriptions', 'Miscellaneous']);
  assert.deepEqual(data.presets.map((p) => p.label), ['High-cost-city renter', 'Lives with parents', 'Self-employed']);
  assert.equal(data.withdrawal.find((w) => w.default).rate, 0.04);
  assert.ok(data.withdrawal.every((w) => w.source));
  const starter = readFileSync(new URL('../engine/starter.js', import.meta.url), 'utf8');
  assert.ok(!starter.includes("I('other'"), 'Money from a person replaces Other income');
  // A new person line asks who and what for; nothing is withheld from it.
  const p = addItem(mini({}), { collection: 'income', type: 'person', label: 'From Mom' }, '2026-10-22');
  const x = p.spine.income.find((i) => i.id === p.id);
  assert.equal(x.purpose.kind, 'missing');
  assert.equal(x.withholding.federal.value, 0);
});
