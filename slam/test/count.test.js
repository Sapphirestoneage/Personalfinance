// Count first (2026-10-28, engine/count.js): the type lists, counts from the household, a plus that makes a named
// item, a minus that takes the last one, Other as everything no group names, and the header words.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readJson, loadRules } from './spine-helpers.js';
import { readHousehold } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';
import { validate, PRESETS, INCOME_TYPES } from '../engine/schema.js';
import { valueOf } from '../engine/spine.js';
import * as C from '../engine/count.js';

const R = loadRules();
const T = '2026-10-28';
const demo = () => applyDefaults(readHousehold(readJson('fixtures/demo.json'), { today: T }).spine, R);
const blank = () => applyDefaults(readHousehold(readJson('test/clients/maya-start.json'), { today: T }).spine, R);

test('the lists the brief names, in order; Other counts every type no group names', () => {
  assert.deepEqual(C.groupsOf('debts').map((g) => g.label), ['Credit cards', 'Student loans', 'Car loans', 'Mortgage', 'Personal or family loans', 'Medical', 'Buy now pay later', 'Other']);
  assert.deepEqual(C.groupsOf('accounts').map((g) => g.label), ['Checking', 'Savings or HYSA', '401(k) or 403(b)', 'IRA or Roth IRA', 'HSA', 'Brokerage', 'Crypto', 'Home', 'Car', 'Other']);
  assert.deepEqual(C.groupsOf('income').map((g) => g.label), ['W-2 job', 'Self-employed or side income', 'Benefits', 'Other']);
  for (const coll of ['debts', 'accounts']) {
    const all = Object.keys(PRESETS).filter((k) => (coll === 'debts') === (PRESETS[k].family === 'debt'));
    const named = C.groupsOf(coll).flatMap((g) => g.types);
    assert.deepEqual([...named].sort(), [...all].sort(), coll + ': every type is in exactly one group');
    assert.equal(new Set(named).size, named.length);
  }
  assert.deepEqual([...C.groupsOf('income').flatMap((g) => g.types)].sort(), [...INCOME_TYPES].sort());
  assert.throws(() => C.groupsOf('goals'), /No count list/);
});

test('counts come from the household; the demo reads 3 cards and 1 student loan', () => {
  const s = demo();
  const debts = C.countsOf(s, 'debts');
  assert.deepEqual(debts.filter((g) => g.n).map((g) => [g.key, g.n]), [['cards', 3], ['student', 1]]);
  assert.equal(C.countWords(s, 'debts'), '3 cards, 1 student loan');
  assert.equal(C.countWords(s, 'income'), '1 job, 1 self-employed line, 1 other income');
  assert.equal(C.countWords(blank(), 'accounts'), 'nothing yet');
  assert.equal(C.groupFor('income', { type: 'maybeMoney' }).key, 'other');
  assert.equal(C.groupFor('accounts', { type: 'hysa' }).key, 'savings');
});

test('plus makes a named item with its answers blank; a second one is numbered; minus takes the last one back', () => {
  let s = blank();
  let r = C.addToGroup(s, 'debts', 'cards', T);
  s = r.spine;
  assert.equal(r.label, 'Credit card');
  assert.equal(s.debts[0].type, 'credit_card');
  assert.equal(s.debts[0].balance.kind, 'missing', 'never $0');
  r = C.addToGroup(s, 'debts', 'cards', T);
  s = r.spine;
  assert.equal(r.label, 'Credit card 2');
  assert.equal(C.countWords(s, 'debts'), '2 cards');
  r = C.addToGroup(s, 'income', 'w2', T);
  s = r.spine;
  assert.deepEqual([r.label, s.income[0].cadence], ['Paycheck', 'biweekly']);
  r = C.addToGroup(s, 'income', 'benefits', T);
  s = r.spine;
  assert.deepEqual([s.income[1].type, s.income[1].cadence], ['unemployment', 'weekly']);
  assert.ok(validate(s).ok, validate(s).errors.map((e) => e.path + ' ' + e.message).join('\n'));
  const gone = C.removeLastOf(s, 'debts', 'cards');
  assert.equal(gone.label, 'Credit card 2');
  assert.equal(gone.spine.debts.length, 1);
  assert.equal(C.removeLastOf(gone.spine, 'debts', 'car'), null, 'nothing at 0');
  assert.throws(() => C.addToGroup(s, 'debts', 'other', T), /Nothing to add/, 'Other goes through the add form');
  void valueOf;
});
