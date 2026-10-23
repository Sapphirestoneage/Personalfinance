// Health coverage in one place (S-117; the parent's plan rule from S-073). Every coverage fact lives in
// doc.coverage; the premium line follows it. Worked out by hand.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { newHousehold, SCHEMA_VERSION } from '../src/store/schema.js';
import { makeValue } from '../src/store/value.js';
import { findLine, renameLine, addIncome, addDeduction } from '../src/store/edits.js';
import { budgetModel } from '../src/engines/model.js';
import { buildSummary } from '../src/engines/summary.js';
import { parentsPlan, premiumFor, coverageSummary } from '../src/engines/coverage.js';
import { validateHousehold } from '../src/store/validate.js';
import { migrate } from '../src/store/migrate.js';
import { loadRefs, loadHousehold } from './helpers.js';

const refs = loadRefs();

// Out of pocket 40 a month; a premium of 300 a month paid directly unless coverage says otherwise.
function client(birthYear, how = 'parent') {
  const d = newHousehold('Plan');
  d.currentMonth = '2026-09';
  d.profile.birthYear = birthYear;
  d.coverage.how = how;
  d.coverage.premiumFrom = 'direct';
  d.coverage.premium = makeValue(300);
  findLine(d, 'out-of-pocket').line.estimate = makeValue(40);
  return d;
}
const health = (d) => budgetModel(d).categories.find((c) => c.id === 'health').estimate.amount;
const premiumLine = (d) => budgetModel(d).categories.find((c) => c.id === 'health').lines.find((l) => l.id === 'premiums');

test('24 and on a parent\'s plan: no premium, Health = out of pocket 40', () => {
  const d = client(2002); // 2026 - 2002 = 24
  assert.deepEqual(parentsPlan(d), { age: 24, eligible: true, chosen: true, on: true, agedOut: false });
  assert.equal(health(d), 40); // premium 0 + out of pocket 40
  const prem = buildSummary(d, refs).items.find((i) => i.key === 'act:premiums');
  assert.equal(prem.status, 'not-for-me', 'a covered premium counts as answered');
  assert.equal(coverageSummary(d), 'Covered by a parent\'s plan. No premium.');
  assert.deepEqual(validateHousehold(d), []);
});

test('25 is the last year it counts; at 26 the premium counts again', () => {
  assert.equal(health(client(2001)), 40); // 2026 - 2001 = 25: still covered
  const d = client(2000); // 26
  assert.equal(parentsPlan(d).agedOut, true);
  assert.equal(health(d), 340); // the premium 300 + 40
  assert.equal(coverageSummary(d), 'Aged off a parent\'s plan (26 this year), so premiums count again.');
});

test('paid directly: the premium is the Health insurance line, computed and never asked twice', () => {
  const d = client(1990, 'marketplace');
  assert.equal(health(d), 340);
  // The estimate and, with nothing logged, the actual are the premium: 300 a month.
  const l = premiumLine(d);
  assert.deepEqual([l.estimate, l.actual, l.status.actual, l.fromCoverage], [300, 300, 'computed', true]);
  // Typing on the line does nothing: coverage owns the premium.
  findLine(d, 'premiums').line.estimate = makeValue(999);
  assert.equal(health(d), 340);
  assert.equal(coverageSummary(d), 'Marketplace or ACA. Premium $300 a month, paid directly.');
  // A year's premium (3,600) is 300 a month the same way.
  d.coverage.premium = makeValue(3600, { cadence: 'year' });
  assert.equal(premiumFor(d, 'monthly').amount, 300);
});

test('from a paycheck: the premium stays the income\'s health deduction, and the line is 0', () => {
  const d = client(1990, 'employer');
  const job = addIncome(d, { id: 'job', type: 'w2', label: 'Job', payFrequency: 'monthly' });
  const ded = addDeduction(d, 'job', 'health');
  Object.assign(ded, { mode: 'amount', amount: makeValue(120, { cadence: 'paycheck' }) });
  d.coverage.premiumFrom = 'paycheck';
  d.coverage.premiumIncomeId = job.id;
  // Take-home is already net of the 120, so Health = 0 + 40.
  assert.equal(health(d), 40);
  assert.equal(coverageSummary(d), 'An employer plan. Premium taken out of the paycheck (Job).');
});

test('no coverage: no premium; not answered: the premium is blank, never 0', () => {
  const none = client(1990, 'none');
  assert.equal(health(none), 40);
  const d = client(1990, null);
  d.coverage.premiumFrom = null;
  assert.equal(premiumLine(d).estimate, null);
  assert.equal(health(d), 40); // only what is known adds up; the premium is still to answer
  assert.equal(coverageSummary(d), 'Health coverage not answered yet.');
});

test('it follows the line type, not the name', () => {
  const d = client(2002);
  renameLine(d, 'premiums', "Mom's plan premium");
  assert.equal(findLine(d, 'premiums').line.type, 'health-insurance');
  assert.equal(health(d), 40);
});

test('migration moves the old answers to coverage without changing a number', () => {
  // A schema 13 file: on a parent's plan (household.parentsPlan), 24, premium line 300, out of pocket 40.
  const raw = JSON.parse(JSON.stringify(newHousehold('Old')));
  raw.schemaVersion = 13;
  raw.currentMonth = '2026-09';
  raw.profile.birthYear = 2002;
  delete raw.coverage;
  raw.household.parentsPlan = true;
  raw.categories.find((c) => c.id === 'health').lines.find((l) => l.id === 'premiums').estimate = makeValue(300);
  raw.categories.find((c) => c.id === 'health').lines.find((l) => l.id === 'out-of-pocket').estimate = makeValue(40);
  const d = migrate(raw);
  assert.deepEqual(validateHousehold(d), []);
  assert.equal(d.household.parentsPlan, undefined);
  assert.deepEqual([d.coverage.how, d.coverage.premiumFrom, d.coverage.premium.amount], ['parent', 'direct', 300]);
  // Before: covered at 24, Health 40. After: the same 40; at 26 it was 340, and still is.
  assert.equal(health(d), 40);
  d.profile.birthYear = 2000;
  assert.equal(health(d), 340);
  // An income with a health deduction and no premium line amount: the premium is from that paycheck.
  const raw2 = JSON.parse(JSON.stringify(raw));
  raw2.categories.find((c) => c.id === 'health').lines.find((l) => l.id === 'premiums').estimate = makeValue();
  raw2.household.parentsPlan = false;
  raw2.income = [{ id: 'job', type: 'w2', label: 'Job', payFrequency: 'monthly', takeHome: makeValue(3000), gross: makeValue(), deductions: [{ id: 'd1', kind: 'health', mode: 'amount', amount: makeValue(120, { cadence: 'paycheck' }) }], state: 'active' }];
  const d2 = migrate(raw2);
  assert.deepEqual([d2.coverage.how, d2.coverage.premiumFrom, d2.coverage.premiumIncomeId], [null, 'paycheck', 'job']);
});

test('every household: coverage moved, and Health and the totals as worked out by hand', async () => {
  for (const name of ['maya', 'luis', 'tasha', 'sam']) {
    const { default: exp } = await import('../src/data/households/' + name + '.expected.js');
    const d = loadHousehold(name);
    const s = buildSummary(d, refs);
    // None of them had a parent's plan, a health deduction, or a premium amount: nothing to move.
    assert.deepEqual([d.coverage.how, d.coverage.premiumFrom], [null, null], name);
    const row = s.rows.find((r) => r.id === 'health');
    assert.deepEqual([row.estimate, row.actual], exp.categories.health, name + ' health');
    assert.deepEqual([s.totals.estimateTotal, s.totals.spending], [exp.estimateTotal, exp.spending], name + ' totals');
  }
  const files = readdirSync(new URL('../src/data/households/', import.meta.url)).filter((f) => f.endsWith('.json'));
  for (const f of [...files.map((x) => '../src/data/households/' + x), './fixtures/riley-schema9.json']) {
    const d = migrate(JSON.parse(readFileSync(new URL(f, import.meta.url), 'utf8')));
    assert.equal(d.schemaVersion, SCHEMA_VERSION);
    assert.equal(d.household.parentsPlan, undefined, f);
    assert.deepEqual(validateHousehold(d), [], f);
  }
});
