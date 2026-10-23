// Part 4 of the monthly loop: actuals come from the log (S-087). A line with entries takes its actual
// from the log and cannot be typed over; a yearly line's actual is its monthly share; migration keeps
// every month's typed actual. Depends on the store (schema, value, migrate, validate, store, storage,
// edits, log), on the engines model.js (budgetModel, primaryPayFrequency), plan.js (modelForMonth) and
// normalize.js (toMonthly), and reads five demo households straight from src/data/households/*.json.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newHousehold } from '../src/store/schema.js';
import { makeValue, normalizeValue } from '../src/store/value.js';
import { migrate } from '../src/store/migrate.js';
import { validateHousehold } from '../src/store/validate.js';
import { createStore } from '../src/store/store.js';
import { createStorage, memoryBackend } from '../src/store/storage.js';
import { setField, findLine } from '../src/store/edits.js';
import { addEntry } from '../src/store/log.js';
import { budgetModel, primaryPayFrequency } from '../src/engines/model.js';
import { modelForMonth } from '../src/engines/plan.js';
import { toMonthly } from '../src/engines/normalize.js';

const raw = (name) => JSON.parse(readFileSync(new URL('../src/data/households/' + name + '.json', import.meta.url), 'utf8'));
const lineOf = (model, id) => model.categories.flatMap((c) => c.lines).find((l) => l.id === id);

test('a line with entries: its actual is the log, "from your log, N entries", and it cannot be typed over', () => {
  const d = newHousehold('Log owns');
  d.currentMonth = '2026-10';
  addEntry(d, { date: '2026-10-02', amount: 61.4, lineId: 'groceries' });
  addEntry(d, { date: '2026-10-09', amount: 48.6, lineId: 'groceries' });
  addEntry(d, { date: '2026-10-12', amount: -10, kind: 'refund', lineId: 'groceries' });
  // 61.40 + 48.60 - 10 refund = 100
  const g = lineOf(budgetModel(d), 'groceries');
  assert.deepEqual([g.actual, g.actualFrom, g.logCount, g.status.actual], [100, 'log', 3, 'computed']);
  assert.throws(() => setField(d, ['line', 'groceries', 'actual'], makeValue(250)), /This comes from 3 entries\. Add one, or edit an entry\./);
  // A line with no entries is typed as before
  setField(d, ['line', 'gas', 'actual'], makeValue(40));
  assert.deepEqual([lineOf(budgetModel(d), 'gas').actual, lineOf(budgetModel(d), 'gas').actualFrom], [40, 'typed']);
  // "None this month" is a typed zero
  setField(d, ['line', 'delivery', 'actual'], makeValue(0, { note: 'None this month' }));
  assert.equal(lineOf(budgetModel(d), 'delivery').actual, 0);
  // Other months read their own log: September has none, so groceries is blank there
  assert.equal(lineOf(modelForMonth(d, '2026-09'), 'groceries').actual, null);
});

test('the store refuses typing over a logged line, with the plain message', () => {
  const s = createStore(createStorage(memoryBackend()), () => new Date('2026-10-17T12:00:00Z'));
  s.create('Store');
  s.update('Log', (d) => { addEntry(d, { date: s.doc.currentMonth + '-03', amount: 20, lineId: 'transit' }); });
  assert.throws(() => s.update('Type', (d) => setField(d, ['line', 'transit', 'actual'], makeValue(99))), /This comes from 1 entry/);
  assert.equal(findLine(s.doc, 'transit').line.actual.amount, null);
});

test('a yearly line (due month set): the actual is its monthly share; the payment is in the log', () => {
  const d = newHousehold('Yearly');
  d.currentMonth = '2026-03';
  const ins = findLine(d, 'car-insurance').line;
  ins.estimate = makeValue(1200, { cadence: 'year' });
  ins.dueMonth = makeValue(3, { cadence: 'one-off' });
  ins.dueDay = makeValue(14, { cadence: 'one-off' });
  addEntry(d, { date: '2026-03-14', amount: 1200, lineId: 'car-insurance' });
  // 1,200 a year = 100 a month, whatever month it is paid in
  const l = lineOf(budgetModel(d), 'car-insurance');
  assert.deepEqual([l.actual, l.actualFrom, l.yearly], [100, 'share', true]);
});

for (const name of ['maya', 'luis', 'tasha', 'sam', 'jordan']) {
  test('migration keeps every month\'s actual: ' + name, () => {
    const r = raw(name);
    const month = r.currentMonth;
    // Another open month: the one after (earlier ones may be closed)
    const prev = month.slice(0, 5) + String(Number(month.slice(5)) + 1).padStart(2, '0');
    // Give the file a log: 10 on every line with a typed actual this month, and 25 on Gas.
    r.transactions = [];
    const typed = [];
    let blankLine = null;
    for (const c of r.categories) for (const l of c.lines || []) {
      if (l.actual && l.actual.amount !== null && l.actual.amount !== undefined) {
        typed.push([l.id, l]);
        r.transactions.push({ id: 'tx-t' + typed.length, date: month + '-01', amount: 10, description: 'TEST', account: null, kind: 'spend', merchant: 'TEST', lineId: l.id, bnpl: false });
      } else if (!blankLine && c.id !== 'savings') blankLine = l.id;
    }
    // A line with no typed actual just takes its log: 25 (blank before, a number now; nothing typed is lost).
    if (blankLine) r.transactions.push({ id: 'tx-blank', date: month + '-02', amount: 25, description: 'NEW', account: null, kind: 'spend', merchant: 'NEW', lineId: blankLine, bnpl: false });
    // And another open month with a typed 300 on groceries and two entries of 100.
    r.monthActuals = { ...(r.monthActuals || {}), [prev]: { groceries: { amount: 300 } } };
    r.transactions.push({ id: 'tx-p1', date: prev + '-05', amount: 100, description: 'G', account: null, kind: 'spend', merchant: 'G', lineId: 'groceries', bnpl: false });
    r.transactions.push({ id: 'tx-p2', date: prev + '-15', amount: 100, description: 'G', account: null, kind: 'spend', merchant: 'G', lineId: 'groceries', bnpl: false });
    const d = migrate(r);
    assert.deepEqual(validateHousehold(d), []);
    const freq = primaryPayFrequency(d);
    const model = budgetModel(d);
    const bl = blankLine ? lineOf(model, blankLine) : null;
    if (bl && !bl.covered) assert.equal(bl.actual, 25);
    for (const [id, l] of typed) {
      const v = normalizeValue(l.actual);
      let before = toMonthly(v, freq);
      if (l.path === 'reimbursable' && l.owedBackReceived) before -= toMonthly(normalizeValue(l.owedBack), freq);
      const after = lineOf(model, id);
      if (!after || after.covered) continue;
      assert.ok(Math.abs(after.actual - before) < 0.005, name + ' ' + id + ': ' + after.actual + ' vs ' + before);
    }
    // Groceries that month: typed 300, the log had 200, so a kept entry of 100 makes it 300 again
    assert.equal(lineOf(modelForMonth(d, prev), 'groceries').actual, 300);
    assert.equal(d.transactions.find((t) => t.adjust && t.date.startsWith(prev)).amount, 100);
  });
}
