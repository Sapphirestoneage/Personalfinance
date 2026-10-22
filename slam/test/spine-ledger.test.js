import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { loadHousehold } from '../engine/normalize.js';
import { validate } from '../engine/schema.js';
import { ledgerRows, stillGuessing, typeFor } from '../engine/ledger.js';
import { parseInput, editFact, createHistory, commit, undo, redo, canUndo, canRedo } from '../engine/edits.js';
import { getAt, listFacts } from '../engine/spine.js';
import { labelFor } from '../engine/labels.js';
import { readJson, loadRules, SLAM } from './spine-helpers.js';

const R = loadRules();
const demo = () => loadHousehold(readJson('fixtures/demo.json'));

test('ledger: every Fact is a row, in a DAITE group, with a label and type', () => {
  const s = demo();
  const groups = ledgerRows(s);
  assert.deepEqual(groups.map((g) => g.id), ['D', 'A', 'I', 'T', 'E', 'G']);
  const rows = groups.flatMap((g) => g.rows);
  assert.equal(rows.length, listFacts(s).length);
  const find = (p) => rows.find((r) => r.path === p);
  assert.equal(find('debts.visa.apr').group, 'D');
  assert.equal(find('debts.visa.apr').type, 'rate');
  assert.equal(find('accounts.hysa.balance').group, 'A');
  assert.equal(find('income.salary.amount').group, 'I');
  assert.equal(find('income.salary.withholding.federal').group, 'T');
  assert.equal(find('expenses.rent.amount').group, 'E');
  assert.equal(find('assumptions.withdrawalRate').group, 'G');
  assert.equal(labelFor(s, 'debts.visa.minimum'), 'Visa: minimum payment');
  assert.equal(typeFor(s, 'household.filingStatus').startsWith('choice:'), true);
});

test('still guessing: missing fields first, then rough ones by effect', () => {
  const s = demo();
  s.debts[0].limit = { value: null, asOf: null, source: 'test', kind: 'missing' };
  const g = stillGuessing(s, R);
  assert.equal(g.items[0].kind, 'missing');
  assert.equal(g.items[0].path, 'debts.visa.limit');
  assert.ok(g.items[0].blocks.includes('utilization'));
  const rough = g.items.filter((i) => i.kind === 'rough');
  for (let i = 1; i < rough.length; i++) assert.ok(rough[i - 1].score >= rough[i].score);
  const top = rough[0];
  assert.ok(top.score > 0, 'the biggest guess moves something');
  assert.ok(g.items.every((i) => i.kind === 'rough' || i.kind === 'missing'));
});

test('parse typed input by field type', () => {
  assert.deepEqual(parseInput('money', '$1,250'), { ok: true, value: 1250 });
  assert.deepEqual(parseInput('rate', '25%'), { ok: true, value: 0.25 });
  assert.deepEqual(parseInput('rate', '4.5'), { ok: true, value: 0.045 });
  assert.equal(parseInput('money', 'abc').ok, false);
  assert.equal(parseInput('money', '').ok, false);
  assert.deepEqual(parseInput('date', '2027-05-31'), { ok: true, value: '2027-05-31' });
  assert.deepEqual(parseInput('bool', 'yes'), { ok: true, value: true });
  assert.equal(parseInput('choice:a|b', 'c').ok, false);
  assert.deepEqual(parseInput('list', '[{"year":2026,"amount":1}]').value, [{ year: 2026, amount: 1 }]);
});

test('edit, confirm, not for me: each keeps the spine valid', () => {
  let s = demo();
  s = editFact(s, 'expenses.groceries.amount', 'set', { value: 450, kind: 'known', today: '2026-10-23' });
  assert.deepEqual(getAt(s, 'expenses.groceries.amount'), { value: 450, kind: 'known', asOf: '2026-10-23', source: 'ledger' });
  s = editFact(s, 'expenses.dining.amount', 'confirm', { today: '2026-10-23' });
  assert.equal(getAt(s, 'expenses.dining.amount').kind, 'known');
  assert.equal(getAt(s, 'expenses.dining.amount').value, 200);
  s = editFact(s, 'debts.visa.stress', 'notForMe', { today: '2026-10-23' });
  assert.deepEqual([getAt(s, 'debts.visa.stress').value, getAt(s, 'debts.visa.stress').kind], [null, 'notForMe']);
  const r = validate(s);
  assert.ok(r.ok, r.errors.map((e) => e.path + ' ' + e.message).join('\n'));
});

test('undo and redo every edit', () => {
  const s0 = demo();
  let h = createHistory(s0);
  assert.equal(canUndo(h), false);
  const s1 = editFact(s0, 'expenses.rent.amount', 'set', { value: 1900, today: '2026-10-23' });
  h = commit(h, s1, 'Rent');
  const s2 = editFact(s1, 'expenses.rent.amount', 'set', { value: 2000, today: '2026-10-23' });
  h = commit(h, s2, 'Rent');
  h = undo(h);
  assert.equal(getAt(h.present, 'expenses.rent.amount').value, 1900);
  h = undo(h);
  assert.equal(getAt(h.present, 'expenses.rent.amount').value, 1800);
  assert.equal(canUndo(h), false);
  h = redo(h);
  assert.equal(getAt(h.present, 'expenses.rent.amount').value, 1900);
  assert.equal(canRedo(h), true);
  h = commit(h, editFact(h.present, 'expenses.rent.amount', 'set', { value: 1, today: '2026-10-23' }), 'Rent');
  assert.equal(canRedo(h), false, 'a new edit drops the redo branch');
});

// Views never calculate: the UI files hold no arithmetic on money.
test('views do no money math', () => {
  for (const f of readdirSync(SLAM + 'ui').filter((x) => x.endsWith('.js'))) {
    const src = readFileSync(SLAM + 'ui/' + f, 'utf8');
    assert.ok(!/\.value\s*[-+*/]\s*[\w(]/.test(src), 'ui/' + f + ' computes with a result value');
    assert.ok(!/from '\.\.\/engine\/(cashflow|tax|debt|fi|emergency|projection|networth)\.js'/.test(src), 'ui/' + f + ' should read numbers through summary.js or ledger.js');
  }
});
