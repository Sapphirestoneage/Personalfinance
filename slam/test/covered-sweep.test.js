// Bug sweep, step 4: things someone else covers. A fully covered line keeps its name, real cost, who covers it and
// need or want; how and when it is paid are not asked, so nothing about it is missing or rough or on the Calendar, and
// it never moves checking. Needs shows one "Covered by others" line. Every household here is made up.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readJson, loadRules } from './spine-helpers.js';
import { loadHousehold } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';
import { cashsim } from '../engine/cashsim.js';
import { calendar } from '../engine/calendar.js';
import { ledgerRows, coveredByOthers, stillGuessing } from '../engine/ledger.js';

const R = loadRules();
const f = (v) => ({ value: v, kind: 'known', asOf: '2026-10-01', source: 'test' });
const base = () => applyDefaults(loadHousehold(readJson('fixtures/demo.json')), R);
const covered = () => { const b = base(); return applyDefaults({ ...b, expenses: b.expenses.map((e) => (e.id === 'phone' ? { ...e, covered: f(true), coveredBy: f('Parents') } : e)) }, R); };

test('a covered phone does not move checking on any day', () => {
  const b = base();
  const without = applyDefaults({ ...b, expenses: b.expenses.filter((e) => e.id !== 'phone') }, R);
  const a = cashsim(covered(), R, { months: 3 }), w = cashsim(without, R, { months: 3 });
  assert.deepEqual(a.daily.map((d) => d.primary), w.daily.map((d) => d.primary));
  assert.ok(!calendar(covered(), R, { months: 2 }).months.some((m) => m.events.some((e) => /phone/i.test(e.label))), 'not on the Calendar');
});

test('a covered line asks only its name, cost, who covers it and need or want; nothing to firm up', () => {
  const rows = ledgerRows(covered()).flatMap((g) => g.rows).filter((r) => r.path.startsWith('expenses.phone.'));
  assert.deepEqual(rows.map((r) => r.path).sort(), ['expenses.phone.amount', 'expenses.phone.need']);
  assert.ok(rows.every((r) => r.fact.kind !== 'rough' && r.fact.kind !== 'missing'));
  assert.ok(!stillGuessing(covered(), R).items.some((x) => x.path.startsWith('expenses.phone.')));
});

test('Covered by others: one total a month, each line with who covers it', () => {
  const c = coveredByOthers(covered());
  assert.deepEqual(c.items.map((i) => [i.id, i.by, i.monthly]), [['phone', 'Parents', 60]]);
  assert.equal(c.monthly, 60);
  assert.equal(coveredByOthers(base()).monthly, null);
});
