import test from 'node:test';
import assert from 'node:assert/strict';
import { loadHousehold } from '../engine/normalize.js';
import { validate } from '../engine/schema.js';
import { summarize } from '../engine/summary.js';
import { fixedVariable } from '../engine/spending.js';
import { logSpend, setFixed } from '../engine/edits.js';
import { readJson, loadRules, emptyLog } from './spine-helpers.js';

const R = loadRules();
const demo = () => emptyLog(loadHousehold(readJson('fixtures/demo.json')));
const fv = (s) => fixedVariable(s, R, summarize(s, R, { flags: false }), { months: 3, asOf: '2026-10-15' });

// Fixed and variable (owner's ask, 2026-10-27).
test('fixed and variable: groups with their monthly plan, and lines not sorted yet', () => {
  let s = demo();
  const a = fv(s);
  assert.ok(a.fixed.items.some((x) => x.id === 'rent'));
  assert.ok(a.variable.items.some((x) => x.id === 'utilities'));
  assert.deepEqual(a.months, ['2026-07', '2026-08', '2026-09']);
  s = setFixed(s, 'gym', null);
  assert.ok(fv(s).unsorted.some((x) => x.id === 'gym'));
  assert.ok(validate(s).ok);
});

test('a variable line: its average over logged months and which way it is going (house APP_TREND_PCT, 10%)', () => {
  let s = demo();
  const log = (amount, date) => { s = logSpend(s, { amount, date, expenseId: 'utilities' }).spine; };
  const util = () => fv(s).variable.items.find((x) => x.id === 'utilities');
  assert.equal(util().trend, null, 'nothing logged: no trend, never a made-up one');
  log(140, '2026-07-12'); log(150, '2026-08-12');
  log(170, '2026-09-12'); log(10, '2026-10-02');
  const u = util();
  assert.deepEqual(u.byMonth.map((m) => m.amount), [140, 150, 170]);
  assert.equal(u.average, 153.33);
  assert.equal(u.trend.direction, 'up', '170 against an earlier 145 is 17% up');
  assert.equal(u.trend.change, 0.17);
});
