import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trackerSteps } from '../../engine/tracker.js';
import { createRecord, createRow, addRow, setField } from '../../engine/record.js';
import { freshFacts } from '../../engine/fields.js';
import { loadData, loadHousehold } from './load-data.js';

const data = loadData();

test('a new client starts with the household facts and one row step per asked type', () => {
  const rec = createRecord();
  const t = trackerSteps(rec, data.fields);
  assert.equal(t.next.kind, 'sun');
  assert.equal(t.done, 0);
  assert.ok(t.steps.filter(s => s.kind === 'rows').length > 5);
  assert.ok(!t.steps.some(s => s.label.indexOf('rentals') !== -1), 'rentals are assumed none');
});

test('a row removes its type step and adds its headline and counted details; tags never count', () => {
  const rec = createRecord();
  const row = createRow('income', 'side', { nickname: 'Parents', f: freshFacts(data.fields, 'income', 'side') });
  addRow(rec, row, {});
  const t = trackerSteps(rec, data.fields);
  assert.ok(!t.steps.some(s => s.kind === 'rows' && s.href === '#/ledger/income/side'));
  assert.ok(t.steps.some(s => s.kind === 'headline' && s.field === 'grossPay' && !s.done));
  assert.ok(!t.steps.some(s => s.field === 'stability'), 'stability is a tag');
  assert.ok(t.steps.some(s => s.field === 'payFrequency'), 'pay frequency is asked while pay is per paycheck (the default)');
  setField(rec, row.id, 'grossPay', 25000, 'known', 'client', { cad: 'month' });
  const t2 = trackerSteps(rec, data.fields);
  assert.ok(t2.steps.find(s => s.field === 'grossPay').done);
  assert.ok(!t2.steps.some(s => s.field === 'payFrequency'), 'pay frequency is hidden once pay is per month');
});

test('Leah has far more in than open, and the next step points somewhere real', () => {
  const t = trackerSteps(loadHousehold('leah'), data.fields);
  assert.ok(t.done > t.total * 0.6, t.done + ' of ' + t.total);
  if (t.next) assert.ok(t.next.href.indexOf('#/') === 0);
});
