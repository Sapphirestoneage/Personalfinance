// The loader against older and newer file shapes (S-228): fields missing, extra fields, version 4 and version 5
// profiles, a spine with bad fields. Every shape loads; a field that cannot be used is named (with what is wrong and
// what the file held) for the Ledger; nothing crashes any page's engines. Every household here is made up.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readHousehold, fileProblems, fromProfile, REPAIR_SOURCE } from '../engine/normalize.js';
import { validate } from '../engine/schema.js';
import { isDay, getAt } from '../engine/spine.js';
import { applyDefaults } from '../engine/defaults.js';
import { summarize } from '../engine/summary.js';
import { calendar } from '../engine/calendar.js';
import { cashLine, weeks, paychecks } from '../engine/calendar-views.js';
import { cashsim, burnTiers } from '../engine/cashsim.js';
import { spendingView } from '../engine/spending.js';
import { debtView } from '../engine/debtview.js';
import { fooLadder, goalsView } from '../engine/plan.js';
import { windfall } from '../engine/windfall.js';
import { maxIt, maxItSim } from '../engine/maxit.js';
import { ledgerRows, stillGuessing } from '../engine/ledger.js';
import { ledgerTree } from '../engine/ledger-tree.js';
import { editFact } from '../engine/edits.js';
import { METRICS, explainMetric } from '../engine/math.js';
import { whose } from '../ui/household.js';
import { readFileSync } from 'node:fs';
import { readJson, loadRules, SLAM } from './spine-helpers.js';

const R = loadRules();
const TODAY = '2026-10-25';
const demo = () => readJson('fixtures/demo.json');

// A version 3 profile, the shape the loader was built on.
const v3 = () => ({
  _meta: { name: 'Pat Example', asOf: '2026-10-22', version: 3 },
  household: {
    people: [{ id: 'pat', name: 'Pat Example', birthDate: '1990-01-01', kind: 'known' }],
    filingStatus: { value: 'single', kind: 'known' }, state: { value: 'NY', kind: 'known' }, county: { value: 'Albany', kind: 'known' }, nycResident: { value: false, kind: 'known' },
    situation: { value: 'employed', kind: 'known' }, healthCoverage: { value: 'employer', kind: 'known' }
  },
  income: [{ id: 'job', type: 'w2', label: 'Job', amount: 60000, cadence: 'yearly', start: '2026-01-01', end: null, kind: 'known' }],
  expenses: [{ label: 'Rent', amount: 1200, cadence: 'monthly', fat: 'accommodation', fixed: true, kind: 'known' }, { label: 'Groceries', amount: 400, cadence: 'monthly', fat: 'food', kind: 'rough' }],
  accounts: [{ id: 'chk', family: 'cash', type: 'checking', institution: 'Bank', balance: 2500, kind: 'known' }, { id: 'save', family: 'cash', type: 'savings', institution: 'Bank', balance: 6000, kind: 'known' }],
  debts: [{ id: 'card', type: 'credit_card', lender: 'Card Co', balance: 900, apr: 0.24, minimum: 35, kind: 'known' }],
  goals: [{ label: 'FI', fiNumber: 1000000, kind: 'known' }],
  assumptions: { inflation: { value: 0.03, kind: 'rough' }, realReturn: { value: 0.05, kind: 'rough' }, withdrawalRate: { value: 0.04, kind: 'rough' }, lifeExpectancy: { value: 95, kind: 'rough' } }
});
// Version 4: the same records with fields this app has under its own names (a role, a pay day) and fields it does not
// know (an employer, tags, a whole new section), and the situation left out.
const v4 = () => {
  const p = v3();
  p._meta.version = 4; p._meta.exportedBy = 'another tool';
  delete p.household.situation;
  p.household.dependents = 2;
  p.income[0] = { ...p.income[0], payDay: 15, employer: 'Acme' };
  p.accounts[1] = { ...p.accounts[1], role: 'sinking', tags: ['surgery'] };
  p.accounts.push({ id: 'odd', family: 'cash', type: 'pillow', balance: 50, kind: 'known' });
  p.goals.push({ label: 'Surgery', target: 8000, kind: 'known', linkedAccount: 'save', sinkingFund: true });
  p.newSection = { anything: 1 };
  return p;
};
// Version 5: household fields as plain values, numbers as { value, kind } with a kind this app does not know, a
// person with no id, words where numbers and dates go, and a list that is not a list.
const v5 = () => ({
  _meta: { name: 'Sam Example', asOf: '2026-10-22', version: 5 },
  household: { people: [{ name: 'Sam Example', birthDate: { value: '1991-02-02', kind: 'estimate' } }], filingStatus: 'married_joint', state: 'NY', healthCoverage: 'employer' },
  income: [{ type: 'salary', label: 'Job', amount: { value: 5000, kind: 'known' }, cadence: 'fortnightly' }],
  expenses: [{ id: 'rent', label: 'Rent', amount: '1,200', cadence: 'monthly' }, { label: 'Gym', amount: { value: 40, kind: 'rough' }, cadence: 'monthly', start: 'soon' }],
  accounts: [{ id: 'chk', type: 'checking', family: 'cash', balance: { value: 900, kind: 'known' } }],
  debts: 'none',
  goals: [{ label: 'Trip', target: 3000, by: 'next year' }]
});

// Every engine a page calls, on one household: none may throw.
function everyPage(spine) {
  const s = summarize(spine, R);
  ledgerRows(spine); stillGuessing(spine, R); ledgerTree(spine, { names: [], aliases: {} });
  const c = calendar(spine, R, { from: spine.meta.asOf.slice(0, 7), months: 3 });
  weeks(c.sim); paychecks(spine, R, c.sim, s); cashLine(spine, c.sim);
  const debt = debtView(spine, R, c.sim, s);
  const sim = cashsim(spine, R, { months: 1 });
  const spend = spendingView(spine, R, sim, s, { today: spine.meta.asOf });
  burnTiers(spine, R, s.cashflow, { extra: 0 });
  fooLadder(spine, R, s); goalsView(spine, R, s);
  const wf = windfall(spine, R, s, { amount: 5000, taxed: true });
  const mx = maxIt(spine, R, { sim: maxItSim(spine, R) });
  for (const m of METRICS) explainMetric(m.id, { spine, rules: R, s, sim, spend, windfall: wf, maxit: mx, debt });
  return s;
}
const load = (raw) => { const r = readHousehold(raw, { today: TODAY }); return { ...r, spine: applyDefaults(r.spine, R) }; };
const paths = (r) => r.problems.map((x) => x.path);

test('a version 3 profile reads exactly as before, with nothing to flag', () => {
  const r = load(v3());
  assert.deepEqual(r.problems, []);
  assert.ok(validate(r.spine).ok);
  assert.deepEqual(readHousehold(v3(), { today: TODAY }).spine, { ...fromProfile(v3()), meta: { ...fromProfile(v3()).meta } }, 'the same spine as the version 3 reader');
  const s = everyPage(r.spine);
  assert.equal(s.sheet.cash.value, 8500);
});

test('a version 4 profile: fields under the spine\'s names are read, unknown ones are left in the file, an unknown account type is kept aside and named', () => {
  const r = load(v4());
  assert.ok(validate(r.spine).ok, JSON.stringify(validate(r.spine).errors.slice(0, 3)));
  const job = r.spine.income.find((x) => x.id === 'job');
  assert.equal(job.payDay.value, 15, 'a pay day under the spine\'s own name is read');
  assert.equal(r.spine.accounts.find((a) => a.id === 'save').role.value, 'sinking', 'the role is read');
  assert.equal(r.spine.goals.find((g) => g.label === 'Surgery').linkedAccount.value, 'save');
  assert.equal(r.spine.household.situation[0].value.kind, 'missing', 'a section left out reads missing');
  assert.deepEqual(paths(r), ['accounts.odd']);
  assert.match(r.problems[0].message, /type "pillow" is not an account type this app knows; kept aside, not used/);
  assert.equal(r.spine.meta.unread['accounts.odd'].type, 'pillow', 'kept, not dropped');
  const s = everyPage(r.spine);
  assert.equal(s.sheet.cash.value, 2500, 'the surgery fund is set aside, not cash (S-228)');
  assert.match(s.sheet.setAsideNote, /set aside for Surgery/);
  const p = fileProblems(r.spine);
  assert.equal(p.open.length, 0); assert.equal(p.other.length, 1);
  assert.equal(p.other[0].label, 'An account (pillow)', 'named in words, never by its place in the file');
});

test('a version 5 profile: plain values and { value, kind } numbers read; what cannot be used reads missing and is named', () => {
  const r = load(v5());
  assert.ok(validate(r.spine).ok, JSON.stringify(validate(r.spine).errors.slice(0, 3)));
  const sp = r.spine;
  assert.equal(sp.household.people[0].id, 'sam-example', 'a person with no id gets one from the name');
  assert.equal(sp.household.people[0].birthDate.kind, 'rough', 'a kind this app does not know reads rough');
  assert.equal(sp.household.filingStatus.value, 'mfj');
  assert.equal(sp.accounts[0].balance.value, 900);
  assert.deepEqual(sp.debts, [], 'a list that is not a list reads empty');
  const byPath = Object.fromEntries(r.problems.map((x) => [x.path, x]));
  assert.match(byPath['income.job.type'].message, /type "salary" is not one this app knows; read as other/);
  assert.match(byPath['income.job.amount'].message, /how often "fortnightly" is not one this app knows; the amount reads missing/);
  assert.equal(byPath['income.job.amount'].held, 5000, 'what the file held is kept with the problem');
  assert.equal(byPath['expenses.rent.amount'].message, 'money must be a number');
  assert.equal(byPath['expenses.rent.amount'].held, '1,200');
  assert.equal(byPath['expenses.gym.start'].held, 'soon');
  assert.equal(byPath['goals.trip.by'].held, 'next year');
  // Missing, never $0.
  assert.equal(sp.expenses.find((e) => e.id === 'rent').amount.value, null);
  assert.equal(sp.expenses.find((e) => e.id === 'rent').amount.kind, 'missing');
  const s = everyPage(sp);
  assert.notEqual(s.cashflow.expenses.total.kind, 'computed', 'spending is not complete while rent is missing');
  // The Ledger's list: the two amounts are open with links; the rest is said once.
  const p = fileProblems(sp);
  assert.deepEqual(p.open.map((x) => x.link).sort(), ['expenses.rent.amount', 'income.job.amount']);
  assert.equal(p.open.find((x) => x.link === 'expenses.rent.amount').label, 'Rent');
  // Entering the field closes it.
  const fixed = editFact(sp, 'expenses.rent.amount', 'set', { value: 1200, today: TODAY });
  assert.deepEqual(fileProblems(fixed).open.map((x) => x.link), ['income.job.amount']);
});

test('fields missing from a spine are added as missing; only a missing as-of date is named', () => {
  const x = demo();
  delete x.assumptions; delete x.household.situation; delete x.income[0].withholding; delete x.meta.asOf; delete x.debts[0].business;
  const r = load(x);
  assert.ok(validate(r.spine).ok);
  assert.deepEqual(paths(r), ['meta.asOf']);
  assert.equal(r.spine.meta.asOf, TODAY);
  assert.equal(r.spine.assumptions.withdrawalRate.kind, 'missing');
  assert.equal(r.spine.income[0].withholding.federal.kind, 'missing');
  everyPage(r.spine);
});

test('extra fields on a spine are kept aside and named, never a reason to refuse the file', () => {
  const x = demo();
  x.accounts[0].apr = { value: 0.1, asOf: null, source: null, kind: 'known' };
  x.accounts[0].color = 'blue';
  x.debtPlan = { extra: { value: 100, asOf: null, source: null, kind: 'known' }, turbo: true };
  x.taxYears[0].bonus = 5;
  x.somethingNew = [1, 2];
  const r = load(x);
  assert.ok(validate(r.spine).ok);
  assert.deepEqual(paths(r).sort(), ['accounts.chk.apr', 'accounts.chk.color', 'debtPlan.turbo', 'taxYears.2026.bonus']);
  assert.ok(r.problems.every((p) => p.aside && /kept aside, not used$/.test(p.message)));
  assert.equal(r.spine.meta.unread['accounts.chk.color'], 'blue');
  assert.equal(r.spine.debtPlan.extra.value, 100, 'the fields it knows are untouched');
  assert.deepEqual(r.spine.somethingNew, [1, 2], 'a section this app does not read stays as it was');
  const s = everyPage(r.spine);
  assert.equal(s.sheet.netWorth.value, summarize(applyDefaults(readHousehold(demo(), { today: TODAY }).spine, R), R).sheet.netWorth.value);
});

test('a spine of a later version with bad fields: each is named with what is wrong, and the household loads', () => {
  const x = demo();
  x.schema = 'slam-spine/2';
  x.income[0].amount = { value: 'lots', asOf: null, source: null, kind: 'known' };
  x.expenses[0].cadence = 'sometimes';
  x.accounts.push({ id: 'chk', family: 'cash', type: 'checking', balance: 5 });
  x.debts[0].apr = { value: 24, asOf: null, source: null, kind: 'known' };
  x.household.filingStatus = { value: 'together', kind: 'known', asOf: null, source: null };
  x.log = [{ id: 'l1', date: 'yesterday', amount: 5, kind: 'spend' }];
  x.meta.asOf = '2026-13-45';
  const r = load(x);
  assert.ok(validate(r.spine).ok, JSON.stringify(validate(r.spine).errors.slice(0, 3)));
  const byPath = Object.fromEntries(r.problems.map((p) => [p.path, p]));
  assert.match(byPath['meta.asOf'].message, /no as-of date; read as of 2026-10-25/);
  assert.equal(byPath['income.salary.amount'].held, 'lots');
  assert.match(byPath['expenses.rent.amount'].message, /"sometimes"/);
  assert.match(byPath['debts.visa.apr'].message, /rate out of range/);
  assert.equal(byPath['household.filingStatus'].held, 'together');
  assert.ok(byPath['log.l1'].aside);
  assert.match(byPath['accounts.account-1'].message, /"chk" was used twice/);
  assert.equal(r.spine.accounts.find((a) => a.id === 'account-1').balance.value, 5, 'a plain number is read as the balance');
  assert.equal(readHousehold(x, { today: TODAY }).spine.debts.find((d) => d.id === 'visa').apr.source, REPAIR_SOURCE, 'read as missing');
  assert.equal(getAt(r.spine, 'debts.visa.apr').source, 'DEFAULT_CARD_APR', 'the house default stands in, rough');
  assert.ok(fileProblems(r.spine).open.some((p) => p.link === 'debts.visa.apr'), 'and the Ledger still names it until it is entered');
  everyPage(r.spine);
});

test('a file that is not a household says so in words; anything that is one never throws', () => {
  for (const bad of [null, 5, 'text', [], {}, { schema: 'something-else' }, { _meta: {} }]) assert.throws(() => readHousehold(bad, { today: TODAY }), /Not a household file/);
  // The Plan page's export reads too.
  const wrapped = { format: 'slam-export/1', exportedAt: '2026-10-22', schema: 'slam-spine/1', spine: demo() };
  assert.equal(readHousehold(wrapped, { today: TODAY }).spine.meta.name, demo().meta.name);
  // Odd shapes all the way down still load.
  for (const odd of [{ _meta: { version: 7 }, household: {} }, { schema: 'slam-spine/1', household: null, income: 'x', accounts: [null, 3, { id: 'a.b', family: 'cash', type: 'checking', balance: 1 }] }]) {
    const r = load(odd);
    assert.ok(validate(r.spine).ok, JSON.stringify(validate(r.spine).errors.slice(0, 3)));
    assert.ok(isDay(r.spine.meta.asOf));
    everyPage(r.spine);
  }
});

test('loading again keeps the list: problems from an earlier load stay until the field is filled', () => {
  const first = load(v5()).spine;
  const again = load(JSON.parse(JSON.stringify(first)));
  assert.deepEqual(again.problems, [], 'nothing new the second time');
  assert.deepEqual(fileProblems(again.spine).open.map((x) => x.link).sort(), ['expenses.rent.amount', 'income.job.amount']);
});

test('whose numbers: the made-up household is the example, anyone else is named, and every page says so in its header', () => {
  assert.deepEqual(whose(readHousehold(demo(), { today: TODAY }).spine), { example: true, name: 'Example household' });
  assert.deepEqual(whose(load(v5()).spine), { example: false, name: 'Sam Example' });
  const noName = v3(); delete noName._meta.name;
  assert.equal(whose(load(noName).spine).name, 'Pat Example', 'no file name: the first person');
  for (const f of ['dashboard', 'ledger', 'calendar', 'spending', 'plan', 'windfall', 'onepager', 'math-page']) {
    const src = readFileSync(SLAM + 'ui/' + f + '.js', 'utf8');
    // A page on the shell (S-230) gets whose numbers from the shell's header.
    assert.match(src, /whoseLine\(|startPage\(\{(?![^}]*household: false)/, f + ' shows whose numbers');
    assert.ok(!/SOURCE_WORDS\[source\]/.test(src), f + ' has no header of its own');
  }
  assert.match(readFileSync(SLAM + 'ui/shell.js', 'utf8'), /whoseLine\(hist\.present, source, \{ rules, reopen:/, 'the shell\'s header says whose numbers');
  // Load my file goes through the one loader: no page reads a file another way.
  const page = readFileSync(SLAM + 'ui/page.js', 'utf8'), hh = readFileSync(SLAM + 'ui/household.js', 'utf8'), pf = readFileSync(SLAM + 'ui/profile-file.js', 'utf8');
  assert.match(page, /Stays in this browser\. Nothing is uploaded\./);
  assert.match(page, /loadMyFile\(/); assert.match(hh, /readProfile\(/); assert.match(pf, /readHousehold\(/);
  assert.ok(!/fetch\(|XMLHttpRequest|sendBeacon/.test(pf), 'the file is read in the browser, never sent');
});

