// Phase 2.5, Batch 0 fixes: money set aside for a goal (S-228). The "Cash under the floor" date, the Calendar's
// "Cash today" line, the Ledger row, the Windfall and Plan words, and an account two goals share. Adapted from the
// second build's p25-earmarked-setaside test. Made-up demo household only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadHousehold } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';
import { validate } from '../engine/schema.js';
import { fact } from '../engine/spine.js';
import { summarize } from '../engine/summary.js';
import { setAsideFor, setAsideWords } from '../engine/networth.js';
import { cashsim } from '../engine/cashsim.js';
import { milestones } from '../engine/calendar-views.js';
import { calendar } from '../engine/calendar.js';
import { windfall } from '../engine/windfall.js';
import { fooLadder, fixedFloor } from '../engine/plan.js';
import { ledgerTree } from '../engine/ledger-tree.js';
import { ledgerRows } from '../engine/ledger.js';
import { labelFor } from '../engine/labels.js';
import { showValue } from '../ui/view.js';
import { readJson, loadRules } from './spine-helpers.js';

const R = loadRules();
const F = (v) => fact(v, { asOf: '2026-10-01', source: 'test (made up)' });
const S = (s) => summarize(s, R);

// The demo plus a $7,000 surgery fund set aside for a goal.
function withFund({ role = 'sinking' } = {}) {
  const raw = readJson('fixtures/demo.json');
  raw.accounts = [...raw.accounts, { id: 'surgery_fund', family: 'cash', type: 'hysa', name: F('Surgery savings'), balance: F(7000), role: F(role) }];
  raw.goals = [...raw.goals, { id: 'surgery', type: 'savings', label: 'Surgery fund', target: F(12000), linkedAccount: F('surgery_fund'), by: '2027-03-01' }];
  return applyDefaults(loadHousehold(raw), R);
}
// The demo with its savings account set aside for a goal: the usable cash is under the floor from the start.
function hysaAside() {
  const raw = readJson('fixtures/demo.json');
  raw.accounts = raw.accounts.map((a) => (a.id === 'hysa' ? { ...a, role: F('sinking') } : a));
  return applyDefaults(loadHousehold(raw), R);
}

test('the households are valid', () => {
  for (const s of [withFund(), hysaAside()]) assert.ok(validate(s).ok, JSON.stringify(validate(s).errors));
});

test('cash under the floor leaves the set-aside fund out, so the Calendar marks it', () => {
  const sp = hysaAside(), run = cashsim(sp, R, { months: 3 });
  assert.equal(run.run.firstDryTotal, null, 'counting the fund, cash never goes under the floor');
  assert.equal(run.dryDate, sp.meta.asOf, 'without it, cash you can use is under the floor today');
  const dry = milestones(sp, R, run).filter((x) => x.kind === 'dry');
  assert.equal(dry.length, 1);
  assert.match(dry[0].note, /less money set aside for a goal/);
  // With nothing set aside, the date and the words are as before.
  const plain = applyDefaults(loadHousehold(readJson('fixtures/demo.json')), R), pr = cashsim(plain, R, { months: 3 });
  assert.equal(pr.dryDate, pr.run.firstDryTotal);
});

test('the Calendar says cash today leaves the fund out, and why', () => {
  const sp = withFund(), s = S(sp);
  const cash = calendar(sp, R, { months: 1 }).months[0].cash;
  assert.equal(cash.today, s.sheet.cash.value);
  assert.match(cash.todayNote, /^Not counted as cash: Surgery savings, \$7,000 set aside for Surgery fund\.$/);
  assert.equal(cash.apart, true);
  const plain = calendar(applyDefaults(loadHousehold(readJson('fixtures/demo.json')), R), R, { months: 1 }).months[0].cash;
  assert.equal(plain.todayNote, null);
  assert.equal(plain.apart, false);
});

test('the Ledger says what the money is for, in words, and notes it is not cash', () => {
  const sp = withFund();
  assert.equal(labelFor(sp, 'accounts.surgery_fund.role'), 'Surgery savings: what this money is for');
  const row = ledgerRows(sp).flatMap((g) => g.rows).find((r) => r.path === 'accounts.surgery_fund.role');
  assert.equal(showValue(row.fact.value, row.type), 'Set aside for a goal');
  assert.equal(showValue('emergency', row.type), 'Emergency cushion');
  const items = [];
  const walk = (n) => { if (n.item) items.push(n); else for (const c of n.children || []) walk(c); };
  ledgerTree(sp, readJson('data/institutions.json')).forEach(walk);
  assert.equal(items.find((x) => x.key === 'accounts.surgery_fund').note, 'Set aside for Surgery fund, so it is not counted as cash.');
  assert.equal(items.find((x) => x.key === 'accounts.hysa').note, null);
});

test('Windfall and Plan quote cash and say the set-aside money was left out', () => {
  const sp = withFund(), s = S(sp);
  const w = windfall(sp, R, s, { amount: 50000 });
  for (const id of ['cashFloor', 'cushion']) assert.match(w.steps.find((x) => x.id === id).why, /Not counted as cash: Surgery savings, \$7,000 set aside for Surgery fund\./, id);
  const rung = fooLadder(sp, R, s).rungs.find((r) => r.id === 'deductibles');
  if (rung.why && /Cash \(|more cash/.test(rung.why)) assert.match(rung.why, /set aside for Surgery fund/);
  assert.match(fixedFloor(sp, R, s, null).setAsideNote, /set aside for Surgery fund/);
  // Nothing set aside: no note.
  const plain = applyDefaults(loadHousehold(readJson('fixtures/demo.json')), R);
  assert.doesNotMatch(windfall(plain, R, S(plain), { amount: 50000 }).steps.find((x) => x.id === 'cushion').why, /Not counted as cash/);
});

test('an account two goals share names both', () => {
  const two = withFund();
  two.goals = [...two.goals, { id: 'travel', type: 'savings', label: 'Recovery travel', target: F(1500), linkedAccount: F('surgery_fund') }];
  assert.equal(setAsideWords(setAsideFor(two, two.accounts.find((a) => a.id === 'surgery_fund'))), 'set aside for Surgery fund and Recovery travel');
  assert.equal(setAsideFor(withFund(), withFund().accounts.find((a) => a.id === 'surgery_fund')), 'Surgery fund');
});
