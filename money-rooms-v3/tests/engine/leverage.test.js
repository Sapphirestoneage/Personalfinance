import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankLeverage, session } from '../../engine/leverage.js';
import { loadData, loadHousehold } from './load-data.js';
import { createRecord, createRow, addRow, setField } from '../../engine/record.js';
import { freshFacts } from '../../engine/fields.js';

const data = loadData();

test('leverage = category x item x (1 - confidence) x materiality, and the big dollars rank first', () => {
  const rec = createRecord({ id: 'lv' });
  const rent = createRow('spending', 'line', { id: 'rent', nickname: 'Rent', f: freshFacts(data.fields, 'spending', 'line') });
  addRow(rec, rent); setField(rec, 'rent', 'category', 'accommodation', 'known', 'client'); setField(rec, 'rent', 'amount', 215000, 'rough', 'client', { cad: 'month' });
  const wifi = createRow('spending', 'line', { id: 'wifi', nickname: 'Wi-Fi', f: freshFacts(data.fields, 'spending', 'line') });
  addRow(rec, wifi); setField(rec, 'wifi', 'category', 'utilities', 'known', 'client'); setField(rec, 'wifi', 'amount', 6000, 'rough', 'client', { cad: 'month' });
  const ranked = rankLeverage({ record: rec, fields: data.fields, weights: data.weights });
  const r = ranked.find(i => i.rowId === 'rent' && i.field === 'amount'); const w = ranked.find(i => i.rowId === 'wifi' && i.field === 'amount');
  assert.equal(r.catW, 9); assert.equal(r.itemW, 8); assert.equal(r.confidence, 0.6); assert.equal(r.materiality, 1.5);
  assert.equal(r.leverage, Math.round(9 * 8 * 0.4 * 1.5 * 100) / 100);
  assert.equal(w.catW, 3); assert.equal(w.materiality, 0.5);
  assert.ok(ranked.indexOf(r) < ranked.indexOf(w), 'rent before wi-fi');
  assert.ok(ranked.filter(i => i.rowId === 'rent' || i.rowId === 'wifi').every(i => i.question.length > 10));
});

test('under $100 a year is a small win, not a question; client facts go on their plate, lookups on mine', () => {
  const rec = loadHousehold('jordan');
  const s = session({ record: rec, fields: data.fields, weights: data.weights });
  assert.equal(s.next.length, 3);
  assert.ok(s.next[0].leverage >= s.next[1].leverage && s.next[1].leverage >= s.next[2].leverage);
  s.smallWins.forEach(i => assert.ok(Math.abs(i.dollarsAnnual) < 10000, i.label + ' is small'));
  assert.ok(s.theirPlate.every(i => i.source === 'client'));
  assert.ok(s.myPlate.every(i => i.source !== 'client' || i.note));
  assert.ok(s.theirPlate.some(i => i.state === 'rough'), 'Jordan has rough client facts');
});

test('an unfiled quick note lands on my plate at zero confidence', () => {
  const rec = loadHousehold('maya');
  const s = session({ record: rec, fields: data.fields, weights: data.weights });
  const note = s.all.find(i => i.note);
  assert.ok(note && note.plate === 'mine' && note.confidence === 0);
});
