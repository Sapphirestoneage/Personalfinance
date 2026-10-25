// Money set aside for a goal is not emergency cash (S-228): an account with the sinking-fund role (a surgery fund, a
// down payment) is the household's (assets and net worth count it) but runway, the cushion and the floor, and safe to
// spend leave it out, and every page that lists cash says "set aside for <goal>". A made-up household: the demo with a
// surgery fund added.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadHousehold } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';
import { validate, isEarmarked } from '../engine/schema.js';
import { fact } from '../engine/spine.js';
import { balanceSheet, earmarks, setAsideNote } from '../engine/networth.js';
import { summarize } from '../engine/summary.js';
import { cashsim } from '../engine/cashsim.js';
import { safeToSpend, checkInForecast } from '../engine/spending.js';
import { cashLine, cashReading } from '../engine/calendar-views.js';
import { windfall } from '../engine/windfall.js';
import { explainMetric } from '../engine/math.js';
import { readJson, loadRules } from './spine-helpers.js';

const R = loadRules();
const F = (value) => fact(value, { kind: 'known', asOf: '2026-10-01', source: 'test (made up)' });
const base = applyDefaults(loadHousehold(readJson('fixtures/demo.json')), R);
const fund = { id: 'surgery', family: 'cash', type: 'savings', name: F('Surgery fund'), balance: F(4000), role: F('sinking') };
const goal = { id: 'knee', type: 'savings', label: 'Knee surgery', target: F(6000), linkedAccount: F('surgery'), sinkingFund: F(true) };
const withFund = applyDefaults({ ...base, accounts: [...base.accounts, fund], goals: [...base.goals, goal] }, R);

test('the role is stored on the account and the household with a surgery fund validates', () => {
  const r = validate(withFund);
  assert.ok(r.ok, r.errors.map((e) => e.path + ': ' + e.message).join('\n'));
  assert.equal(isEarmarked(withFund.accounts.find((a) => a.id === 'surgery')), true);
  assert.equal(withFund.accounts.filter(isEarmarked).length, 1, 'checking and the emergency savings are not earmarked');
});

test('the balance sheet: set aside is an asset, never cash', () => {
  const a = balanceSheet(base), b = balanceSheet(withFund);
  assert.equal(b.cash.value, a.cash.value, 'cash leaves the surgery fund out');
  assert.equal(b.assets.value, a.assets.value + 4000, 'it is still an asset');
  assert.equal(b.netWorth.value, a.netWorth.value + 4000, 'and counts in net worth');
  assert.equal(b.setAside.value, 4000);
  assert.deepEqual(earmarks(withFund), [{ id: 'surgery', name: 'Surgery fund', goal: 'Knee surgery', words: 'set aside for Knee surgery', balance: 4000, path: 'accounts.surgery.balance' }]);
  assert.match(setAsideNote(b.earmarks), /^Not counted as cash: Surgery fund, \$4,000(\.00)? set aside for Knee surgery\.$/);
  assert.equal(setAsideNote(a.earmarks), null, 'nothing set aside: no sentence');
  assert.equal(b.setAsideNote, setAsideNote(b.earmarks), 'the balance sheet carries the sentence for the pages');
  assert.equal(a.setAsideNote, null);
});

test('runway, the Rule of 5 gap and the runway flag leave it out and name it', () => {
  const a = summarize(base, R), b = summarize(withFund, R);
  assert.equal(b.emergency.tiers.full.runway.value, a.emergency.tiers.full.runway.value);
  assert.equal(b.emergency.tiers.fatOnly.runway.value, a.emergency.tiers.fatOnly.runway.value);
  assert.equal(b.emergency.gap.value, a.emergency.gap.value);
  const flag = b.flags.find((f) => f.id === 'runway');
  assert.ok(flag, 'the runway flag shows');
  assert.match(flag.detail, /set aside for Knee surgery/);
  assert.notEqual(flag.next && flag.next.path, 'accounts.surgery.balance', 'the next step never points at the surgery fund');
  // Show the math: cash and runway read the same as without it, and say why.
  const ctx = { spine: withFund, rules: R, s: b };
  const cash = explainMetric('cash', ctx);
  assert.equal(cash.value, a.sheet.cash.value);
  assert.equal(cash.recomputed, cash.value, 'its inputs add up to it');
  assert.ok(!cash.terms.some((t) => t.path === 'accounts.surgery.balance'), 'the fund is not an input');
  assert.match(cash.note, /set aside for Knee surgery/);
  assert.equal(explainMetric('runway', ctx).value, a.emergency.tiers.full.runway.value);
});

test('the day-by-day run: the floor, the cushion, safe to spend and cash by day leave it out', () => {
  const a = cashsim(base, R, { months: 3 }), b = cashsim(withFund, R, { months: 3 });
  assert.equal(b.floor.amount, a.floor.amount, 'the fund does not lower the floor');
  assert.equal(b.floor.cushionCash, a.floor.cushionCash);
  const acct = b.model.accounts.find((x) => x.id === 'surgery');
  assert.equal(acct.earmarked, true); assert.equal(acct.autoCover, false, 'it never tops checking up');
  assert.equal(acct.goal, 'Knee surgery');
  assert.equal(b.model.accounts.find((x) => x.autoCover).id, a.model.accounts.find((x) => x.autoCover).id, 'the emergency savings still covers');
  assert.deepEqual(b.daily.map((d) => d.cash), a.daily.map((d) => d.cash), 'a day\'s cash leaves it out');
  assert.deepEqual(b.daily.map((d) => d.primary), a.daily.map((d) => d.primary), 'checking is unchanged');
  assert.ok(b.daily.every((d) => d.setAside === 4000), 'the day carries it apart');
  assert.ok(a.daily.every((d) => d.setAside === null), 'nothing set aside: null, not $0');
  const sa = safeToSpend(a), sb = safeToSpend(b);
  assert.equal(sb.today, sa.today, 'safe to spend leaves it out');
  assert.equal(sb.cash, sa.cash);
  assert.deepEqual(sb.setAside.map((x) => [x.name, x.words, x.balance]), [['Surgery fund', 'set aside for Knee surgery', 4000]]);
  const la = cashLine(base, a), lb = cashLine(withFund, b);
  assert.deepEqual(lb.days.map((d) => d.savings), la.days.map((d) => d.savings), 'the savings line leaves it out');
  assert.deepEqual(lb.setAside.map((x) => x.words), ['set aside for Knee surgery']);
  assert.match(lb.setAsideNote, /^Not counted as cash: Surgery fund/); assert.match(sb.setAsideNote, /set aside for Knee surgery/);
  assert.equal(la.setAsideNote, null); assert.equal(sa.setAsideNote, null);
  assert.deepEqual(cashReading(b, b.start.slice(0, 7)), cashReading(a, a.start.slice(0, 7)), 'the month in words reads the same');
  const f = checkInForecast(withFund, b);
  const row = f.accounts.find((x) => x.id === 'surgery');
  assert.equal(row.setAside, 'set aside for Knee surgery'); assert.equal(row.cushion, false, 'it is never called the cushion');
});

test('the Windfall: the cash floor and cushion steps read cash without it', () => {
  const a = windfall(base, R, summarize(base, R), { amount: 5000, taxed: false }), b = windfall(withFund, R, summarize(withFund, R), { amount: 5000, taxed: false });
  for (const id of ['cashFloor', 'cushion']) assert.equal(b.steps.find((x) => x.id === id).amount, a.steps.find((x) => x.id === id).amount, id);
});

test('when the only savings account is set aside, there is no cushion: the floor is the whole stage 1 month', () => {
  const only = applyDefaults({ ...base, accounts: base.accounts.map((x) => (x.id === 'hysa' ? { ...x, role: F('sinking'), linkedGoal: F('A down payment') } : x)) }, R);
  assert.ok(validate(only).ok);
  const s = summarize(only, R);
  assert.equal(s.sheet.cash.value, 3000, 'checking only');
  assert.deepEqual(s.sheet.earmarks.map((x) => x.words), ['set aside for A down payment'], 'its own goal words when no goal links it');
  const sim = cashsim(only, R, { months: 1 });
  assert.equal(sim.floor.cushionCash, 0);
  assert.equal(sim.floor.amount, sim.floor.target, 'nothing lowers the floor');
  assert.ok(!sim.model.accounts.some((x) => x.autoCover), 'nothing tops checking up');
  assert.equal(safeToSpend(sim).excludesCushion, false, 'no cushion to name');
  // No goal at all: "set aside for a goal".
  const bare = applyDefaults({ ...base, accounts: base.accounts.map((x) => (x.id === 'hysa' ? { ...x, role: F('sinking') } : x)) }, R);
  assert.deepEqual(earmarks(bare).map((x) => x.words), ['set aside for a goal']);
});
