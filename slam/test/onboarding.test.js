// Onboarding fixes from a live session (owner, 2026-10-28, S-292): the ZIP names the county, Debt is quick mode (a count
// makes that many rows at once), a car payment on a $0 car loan still counts, an untaxed gift sets no tax aside, the
// to-dos split into this session and next, a goal keeps what is saved so far, and the new defaults.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadRules } from './spine-helpers.js';
import { blankHousehold } from '../engine/blank.js';
import { addItem, putFact, editIncome, editExpense } from '../engine/edits.js';
import { applyDefaults } from '../engine/defaults.js';
import { summarize } from '../engine/summary.js';
import { validate } from '../engine/schema.js';
import { placeOf, placeFacts } from '../engine/library.js';
import { sessionOf } from '../engine/questions.js';
import { goalsView } from '../engine/plan.js';

const R = loadRules(), T = '2026-10-28';
const places = JSON.parse(readFileSync(new URL('../data/library-places-2026.json', import.meta.url), 'utf8'));
const src = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

test('a ZIP fills the state and the county; New York City is its five counties', () => {
  assert.deepEqual(placeOf('10977', places), { state: 'NY', county: 'Rockland', locality: null, zip: '10977', words: 'ZIP 10977 (Rockland County, NY)' });
  assert.equal(placeOf('11215', places).locality, 'nyc');
  assert.equal(placeOf('10701', places).locality, 'yonkers');
  assert.equal(placeOf('07030', places).county, null, 'outside New York the county is left to type');
  let s = blankHousehold('Ellie', T);
  for (const [path, val] of placeFacts(placeOf('10977', places))) s = putFact(s, path, val, 'known', T);
  assert.deepEqual([s.household.state.value, s.household.county.value, s.household.zip.value, s.household.nycResident.value], ['NY', 'Rockland', '10977', false]);
  assert.ok(validate(s).ok, validate(s).errors.map((e) => e.path + ' ' + e.message).join('\n'));
});

test('Debt quick mode: a count, a total spread as a guess, a rough rate; no Add several, no single-or-couple question', () => {
  const g = src('ui/guide.js');
  assert.match(g, /cell\('How many', intBox\('dc-' \+ type/);
  assert.match(g, /'Other debt\?'/);
  assert.doesNotMatch(g, /'Add several'|'Something else'\)|Single, or a couple/);
  assert.match(src('ui/page.js'), /'Single, or a couple\?'/);
});

test('a $500 car payment on a car loan typed as $0 still counts in the month', () => {
  let s = blankHousehold('Ellie', T);
  let r = addItem(s, { collection: 'income', type: 'person', label: 'Parents' }, T); s = editIncome(r.spine, r.id, { amount: 4000, cadence: 'monthly', kind: 'known' }, T);
  s = putFact(s, 'income.parents.purpose', 'gift', 'known', T);
  r = addItem(s, { collection: 'expenses', label: 'Car payment', fat: 'transportation' }, T); s = editExpense(r.spine, r.id, { amount: 500, kind: 'known' }, T);
  const car = r.id;
  r = addItem(s, { collection: 'debts', type: 'auto_loan', label: 'Car loan' }, T); s = putFact(r.spine, 'debts.' + r.id + '.balance', 0, 'known', T);
  s = putFact(s, 'expenses.' + car + '.paysDebt', r.id, 'known', T);
  const x = summarize(applyDefaults(s, R), R, { flags: false });
  assert.equal(x.cashflow.expenses.total.value, 500, 'counted as a bill: the debt shows nothing owed');
  assert.equal(x.cashflow.taxSetAside.total.value, 0, 'a gift from parents is not taxed, so nothing is set aside');
  assert.equal(x.cashflow.monthlySurplus.value, 3500);
});

test('to-dos: amounts, balances and rates are this session; a Roth basis or a card bank is next', () => {
  assert.equal(sessionOf('debts.credit-card.balance'), 'this');
  assert.equal(sessionOf('household.filingStatus'), 'this');
  assert.equal(sessionOf('accounts.roth-ira.basis'), 'next');
  assert.equal(sessionOf('debts.credit-card.institution'), 'next');
  assert.equal(sessionOf('debts.credit-card.reportsToPersonalCredit'), 'next');
  assert.equal(sessionOf('income.job.withholding.federal'), 'next');
});

test('a goal keeps what is saved so far; a new client starts at 8% and 4%, on the Optimistic set', () => {
  let s = blankHousehold('Ellie', T);
  assert.deepEqual([s.assumptions.realReturn.value, s.assumptions.withdrawalRate.value], [0.08, 0.04]);
  const r = addItem(s, { collection: 'goals', type: 'savings', label: 'Start a business' }, T);
  s = putFact(putFact(r.spine, 'goals.' + r.id + '.target', 30000, 'known', T), 'goals.' + r.id + '.saved', 2000, 'known', T);
  assert.ok(validate(s).ok, validate(s).errors.map((e) => e.path + ' ' + e.message).join('\n'));
  const row = goalsView(s, R, summarize(s, R, { flags: false })).rows.find((g) => g.id === r.id);
  assert.equal(row.toGo, 28000);
  assert.match(src('engine/scenarios.js'), /SCENARIO_DEFAULT = 'optimistic'/);
});
