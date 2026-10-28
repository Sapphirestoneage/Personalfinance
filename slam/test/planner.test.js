// The planner views (S-274), by hand on the demo with a mix and fees added.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readJson, loadRules } from './spine-helpers.js';
import { loadHousehold } from '../engine/normalize.js';
import { summarize } from '../engine/summary.js';
import { putFact } from '../engine/edits.js';
import { taxBuckets, allocation, feesInDollars, bracketRoom, sources } from '../engine/planner.js';

const R = loadRules(), T = '2026-10-22';
const demo = () => loadHousehold(readJson('fixtures/demo.json'));

test('tax buckets: 401(k) pre-tax, Roth IRA Roth, brokerage taxable', () => {
  const b = taxBuckets(demo());
  assert.deepEqual(b.buckets.map((x) => [x.id, x.amount]), [['pretax', 45000], ['roth', 15000], ['taxable', 5000], ['hsa', 0]]);
  assert.equal(b.total, 65000);
});

test('allocation: a mix not given stays "not given", never guessed; given, it splits', () => {
  let s = demo();
  assert.equal(allocation(s).unknown, 65000);
  s = putFact(s, 'accounts.k401.stockShare', 0.9, 'known', T);
  const a = allocation(s);
  assert.equal(a.stocks, 40500); assert.equal(a.bonds, 4500); assert.equal(a.unknown, 20000); assert.equal(a.cash, 12000);
});

test('fees in dollars: balance x the fee, and what they cost by the FI date', () => {
  let s = putFact(demo(), 'accounts.k401.expenseRatio', 0.005, 'known', T);
  const sum = summarize(s, R, { flags: false });
  const f = feesInDollars(s, sum, R);
  assert.equal(f.yearly, 225);
  assert.ok(f.missing.includes('accounts.roth.expenseRatio'));
  if (f.byFi) assert.ok(f.byFi.cost > 225, 'fees compound');
});

test('bracket room: the top of the bracket less taxable income', () => {
  const r = bracketRoom(demo(), R);
  const brk = R.get('FED_BRK_S', 2026), at = brk.find(([top]) => top === null || r.taxable < top);
  assert.equal(r.top, at[0]); assert.equal(r.rate, at[1]);
  assert.equal(Math.round(r.room * 100) / 100, Math.round((at[0] - r.taxable) * 100) / 100);
});

test('where each number came from: every input once, with how sure it is; no coach note', () => {
  let s = putFact(demo(), 'accounts.k401.coachNote', 'private', 'known', T);
  const list = sources(s, summarize(s, R, { flags: false }));
  assert.ok(list.length > 10);
  assert.equal(new Set(list.map((x) => x.path)).size, list.length);
  assert.ok(list.every((x) => !/coachNote/.test(x.path)));
  assert.ok(list.some((x) => x.kind === 'rough'));
});
