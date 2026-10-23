import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checklist, fieldText, statusOf, STATUS } from '../../engine/checklist.js';
import { trackerSteps } from '../../engine/tracker.js';
import { compute } from '../../engine/compute.js';
import { createRecord, createRow, addRow, setField, setHousehold } from '../../engine/record.js';
import { freshFacts } from '../../engine/fields.js';
import { SUN_ASKED, PLANETS } from '../../engine/sun.js';
import { loadData, loadHousehold } from './load-data.js';

const data = loadData(); const TODAY = '2026-10-12';
const leah = loadHousehold('leah');
const R = compute(leah, data, { today: TODAY });
const C = checklist(leah, R, data);

test('the counts add up: done plus open is the total, and only counted items count', () => {
  assert.equal(C.done + C.open, C.total);
  assert.equal(C.total, C.items.filter(i => i.counts).length);
  assert.equal(C.rough, C.items.filter(i => i.counts && i.status === 'rough').length);
  C.sections.forEach(s => { assert.equal(s.done + s.open, s.total, s.id); assert.equal(s.total, s.groups.reduce((n, g) => n + g.total, 0), s.id); });
  assert.equal(C.complete, C.open === 0);
});

test('the sections are the household facts, the seven rooms in order, then the first call', () => {
  assert.deepEqual(C.sections.map(s => s.id), ['household'].concat(PLANETS, ['call']));
  const hh = C.sections[0].groups[0].items;
  SUN_ASKED.forEach(id => assert.ok(hh.find(i => i.field === id && i.required), id));
  assert.ok(hh.find(i => i.id === 'household'));
  assert.ok(hh.find(i => i.field === 'name' && !i.required), 'name is listed but optional');
  assert.ok(C.sections.find(s => s.id === 'taxes').derived);
});

test('every counted fact on a row appears exactly once, with the row name and a door to its cell', () => {
  const seen = {};
  C.items.filter(i => i.rowId && i.rowId !== 'sun' && i.field).forEach(i => { const k = i.rowId + ':' + i.field; assert.ok(!seen[k], 'twice: ' + k); seen[k] = true; assert.ok(i.href.startsWith('#/ledger/' + i.planet + '/' + i.type), i.href); });
  PLANETS.forEach(p => leah.planets[p].rows.forEach(r => {
    const tdef = data.fields.planets[p].types[r.type]; if (!tdef) return;
    const mine = C.items.filter(i => i.rowId === r.id);
    assert.ok(mine.length > 0, r.nickname);
    mine.forEach(i => { if (i.field && i.status !== 'none') assert.equal(i.sub, r.nickname || tdef.label); });
  }));
});

test('states read as the words the coach expects', () => {
  assert.equal(statusOf({ v: 100, state: 'known', source: 'client' }), 'in');
  assert.equal(statusOf({ v: 100, state: 'verified', source: 'client' }), 'in');
  assert.equal(statusOf({ v: 100, state: 'rough', source: 'client' }), 'rough');
  assert.equal(statusOf({ v: 100, state: 'known', source: 'estimated' }), 'rough');
  assert.equal(statusOf({ v: null, state: 'will-send', source: 'client' }), 'send');
  assert.equal(statusOf({ v: null, state: 'unknown', source: 'client' }), 'missing');
  assert.equal(statusOf({ v: 0, state: 'none', source: 'client' }), 'none');
  assert.equal(statusOf({ v: null, state: 'not-applicable', source: 'client' }), 'na');
  assert.equal(statusOf(null), 'missing');
  ['in', 'rough', 'none', 'na'].forEach(s => assert.ok(STATUS[s].done, s));
  ['send', 'missing', 'add', 'optional'].forEach(s => assert.ok(!STATUS[s].done, s));
});

test('a value prints with its cadence, a choice by its label, a state by its word', () => {
  const gp = data.fields.fields.grossPay; const pf = data.fields.fields.payFrequency;
  assert.equal(fieldText(gp, { v: 365000, state: 'known', source: 'client', cad: 'paycheck' }), '$3,650 a paycheck');
  assert.equal(fieldText(gp, { v: 365000, state: 'rough', source: 'client', cad: 'month' }), '~$3,650 a month');
  assert.equal(fieldText(pf, { v: 'biweekly', state: 'known', source: 'client' }), 'Every two weeks');
  assert.equal(fieldText(gp, { v: null, state: 'will-send', source: 'client' }), 'Will send');
  assert.equal(fieldText(gp, { v: 0, state: 'none', source: 'client' }), 'None');
  assert.equal(fieldText(gp, { v: null, state: 'unknown', source: 'client' }), '');
});

test('a new client: the four household facts are missing, every asked type is an Add step, nothing is in', () => {
  const rec = createRecord();
  const c = checklist(rec, compute(rec, data, { today: TODAY }), data);
  /* only the assumed-none rental and the empty confirm list read as done; no typed fact does */
  assert.deepEqual(c.items.filter(i => i.counts && i.done).map(i => i.id).sort(), ['call:confirm', 'type:income:rental']);
  assert.ok(c.open > 0);
  SUN_ASKED.forEach(id => assert.equal(c.items.find(i => i.field === id).status, 'missing'));
  assert.ok(c.items.some(i => i.status === 'add' && i.planet === 'income' && i.type === 'w2'));
  assert.equal(c.next.field, 'birthDate');
  /* the fill tracker and the checklist agree on what is still to enter (the checklist adds the household line and the first call) */
  const t = trackerSteps(rec, data.fields);
  assert.equal(c.items.filter(i => i.counts && !i.done && i.planet !== 'call' && i.id !== 'household').length, t.total - t.done);
});

test('a None row counts as answered, a will-send does not, an assumed-none type is in, and detail rows stand down the rough total', () => {
  const rec = createRecord();
  setField(rec, 'sun', 'workSituation', 'employed', 'known', 'client');
  const job = createRow('income', 'w2', { nickname: 'Job', f: freshFacts(data.fields, 'income', 'w2') }); addRow(rec, job);
  setField(rec, job.id, 'grossPay', null, 'will-send', 'client');
  const none = createRow('debt', 'card', { nickname: 'None', f: Object.assign(freshFacts(data.fields, 'debt', 'card'), { balance: { v: 0, state: 'none', source: 'client' } }) }); addRow(rec, none);
  const c = checklist(rec, compute(rec, data, { today: TODAY }), data);
  const gp = c.items.find(i => i.rowId === job.id && i.field === 'grossPay');
  assert.equal(gp.status, 'send'); assert.ok(!gp.done); assert.ok(gp.primary);
  const cards = c.items.filter(i => i.rowId === none.id);
  assert.equal(cards.length, 1); assert.equal(cards[0].status, 'none'); assert.ok(cards[0].done);
  const rental = c.items.find(i => i.planet === 'income' && i.type === 'rental');
  assert.equal(rental.status, 'none'); assert.ok(rental.done);
  const sum = c.sections.find(s => s.id === 'spending').groups.find(g => g.id === 'summary');
  assert.equal(sum.items[0].status, 'optional');
  setHousehold(rec, { roommates: [{ nickname: 'Sam' }], lease: 'both' });
  const c2 = checklist(rec, compute(rec, data, { today: TODAY }), data);
  const hh = c2.items.find(i => i.id === 'household');
  assert.equal(hh.status, 'in'); assert.match(hh.text, /1 roommate, lease in both names/);
});

test('the first call section reads the form, what is left to confirm, and the gut and dream figures', () => {
  const call = C.sections.find(s => s.id === 'call').groups[0].items;
  assert.deepEqual(call.map(i => i.id), ['call:form', 'call:confirm', 'call:gut', 'call:dream']);
  call.forEach(i => assert.equal(i.href.slice(0, 2), '#/'));
  const maya = loadHousehold('maya-discovery');
  const cm = checklist(maya, compute(maya, data, { today: TODAY }), data).sections.find(s => s.id === 'call').groups[0].items;
  assert.equal(cm[0].status, 'in');
  assert.match(cm[1].text, /to confirm|confirmed|Nothing/);
});
