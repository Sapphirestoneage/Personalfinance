// Clients (S-269): each client its own household in this browser; new, switch, duplicate, delete with Undo, and the
// example once edited joins the list rather than being dropped. A new client starts empty and valid.
import test from 'node:test';
import assert from 'node:assert/strict';

const store = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };
globalThis.localStorage = store(); globalThis.sessionStorage = store();
const C = await import('../ui/clients.js');
const { blankHousehold, renameHousehold } = await import('../engine/blank.js');
const { validate } = await import('../engine/schema.js');
const spineName = () => JSON.parse(localStorage.getItem('slam-spine:v1')).meta.name;

test('a new client is an empty, valid household; renamed, its first person follows', () => {
  const b = blankHousehold('Maya Lopez', '2026-10-27');
  assert.deepEqual(validate(b).errors, []);
  assert.equal(b.household.people[0].name, 'Maya Lopez');
  assert.deepEqual([b.accounts, b.debts, b.income, b.expenses], [[], [], [], []]);
  const r = renameHousehold(b, 'Maya L.', 'Maya Lopez');
  assert.equal(r.meta.name, 'Maya L.'); assert.equal(r.household.people[0].name, 'Maya L.');
});

test('new, switch, duplicate, delete and undo keep each household apart', () => {
  C.newClient('Maya Lopez');
  assert.equal(spineName(), 'Maya Lopez');
  const maya = JSON.parse(localStorage.getItem('slam-spine:v1')); maya.meta.asOf = '2026-10-01'; localStorage.setItem('slam-spine:v1', JSON.stringify(maya));
  C.newClient('Dre Carter');
  assert.equal(spineName(), 'Dre Carter');
  assert.deepEqual(C.clients().list.map((c) => c.name), ['Maya Lopez', 'Dre Carter']);
  C.switchTo('maya-lopez');
  assert.equal(spineName(), 'Maya Lopez');
  assert.equal(JSON.parse(localStorage.getItem('slam-spine:v1')).meta.asOf, '2026-10-01', 'what was typed came back with it');
  C.duplicateClient();
  assert.equal(spineName(), 'Maya Lopez (copy)');
  C.deleteClient('maya-lopez-copy');
  assert.ok(!C.clients().list.some((c) => c.id === 'maya-lopez-copy'));
  const gone = C.takeDeleted();
  assert.equal(gone.client.name, 'Maya Lopez (copy)');
  C.restoreClient(gone);
  assert.equal(spineName(), 'Maya Lopez (copy)', 'Undo brings it back on screen');
  C.rememberStep('income');
  assert.equal(C.lastStep(), 'income');
  C.switchTo('dre-carter');
  assert.equal(C.lastStep(), null, 'each client keeps its own step');
});

test('the example, once edited, becomes a client instead of being dropped on a switch', () => {
  C.showExample();
  assert.equal(localStorage.getItem('slam-spine:v1'), null, 'the example is on screen');
  const edited = { ...blankHousehold('Casey Rivera', '2026-10-27'), meta: { name: 'Household', asOf: '2026-10-27' } };
  localStorage.setItem('slam-spine:v1', JSON.stringify(edited));
  C.switchTo('dre-carter');
  assert.ok(C.clients().list.some((c) => c.name === 'Casey Rivera'));
});
