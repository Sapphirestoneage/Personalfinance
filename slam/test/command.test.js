// The command bar (engine/command.js): a line in plain words, said before it is made, made through one change.
// The household is made up.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readJson, loadRules } from './spine-helpers.js';
import { loadHousehold } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';
import { valueOf, getAt } from '../engine/spine.js';
import { parseCommand, findTarget } from '../engine/command.js';

const R = loadRules();
const T = '2026-10-27';
const demo = () => applyDefaults(loadHousehold(readJson('fixtures/demo.json')), R);
const SCREENS = [['Today', 'dashboard.html'], ['Plan', 'plan.html'], ['Calendar', 'calendar.html']];
const cmd = (s, text) => parseCommand(s, R, text, { today: T, screens: SCREENS });

test('"visa 2700" sets the Visa balance; "rent 1950" sets the rent; it says what it will do first', () => {
  const s = demo();
  const c = cmd(s, 'visa 2700');
  assert.equal(c.words, 'Set Visa balance to $2,700 (now $3,000)');
  assert.equal(valueOf(getAt(c.run(s), 'debts.visa.balance')), 2700);
  assert.equal(valueOf(getAt(cmd(s, 'rent 1950').run(s), 'expenses.rent.amount')), 1950);
  assert.equal(cmd(s, 'Rent $1.95k').words, 'Set Rent amount to $1,950 (now $1,800)');
});

test('"add netflix 15.99 on the 12th" adds a subscription charged on the 12th', () => {
  const s = demo();
  const c = cmd(s, 'add netflix 15.99 on the 12th');
  assert.equal(c.words, 'Add Netflix: $15.99 a month, charged on the 12th');
  const n = c.run(s), e = n.expenses.find((x) => x.label === 'Netflix');
  assert.equal(valueOf(e.amount), 15.99);
  assert.equal(valueOf(e.subscription), true);
  assert.equal(valueOf(e.renews).slice(8, 10), '12');
});

test('"go to plan", "mark rent happened", "undo"; a name that fits two things is not guessed', () => {
  const s = demo();
  assert.deepEqual([cmd(s, 'go to plan').kind, cmd(s, 'go to plan').href], ['go', 'plan.html']);
  const m = cmd(s, 'mark rent happened');
  assert.equal(m.words, 'Rent on 2026-10-01 happened: $1,800');
  assert.ok(m.run(s).log.some((x) => x.expenseId === 'rent' && x.date === '2026-10-01' && x.source === 'scheduled'));
  assert.equal(cmd(s, 'undo').kind, 'undo');
  assert.equal(findTarget(s, 'card'), null, 'Store card and Business card both fit: no guess');
  assert.equal(cmd(s, 'hello there'), null, 'anything else is a search');
});
