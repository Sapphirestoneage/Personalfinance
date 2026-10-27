// Notes (overnight Track I).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readJson, loadRules } from './spine-helpers.js';
import { loadHousehold } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';
import { validate } from '../engine/schema.js';
import { addNote, removeNote, setShared, notesFor, sessionNotes, sharedNotes } from '../engine/notes.js';

const R = loadRules();
const demo = () => applyDefaults(loadHousehold(readJson('fixtures/demo.json')), R);

test('a note on a number, on its item, and Session notes; shared ones print', () => {
  let s = demo();
  assert.equal(s.notes, undefined, 'older files have none');
  s = addNote(s, { path: 'expenses.rent.amount', text: 'Lease renews in March; ask about the increase' }, '2026-10-20');
  s = addNote(s, { path: 'expenses.rent', text: 'Landlord: Hudson Rentals' }, '2026-10-27');
  s = addNote(s, { text: 'Talked about the store card promo' }, '2026-10-27');
  s = addNote(s, { text: 'Next call: bring the pay stub', shared: true }, '2026-10-27');
  s = addNote(s, { text: '   ' }, '2026-10-27');
  assert.equal(s.notes.length, 4, 'an empty note is not kept');
  assert.deepEqual(notesFor(s, 'expenses.rent.amount').map((n) => n.date), ['2026-10-27', '2026-10-20'], 'newest first, the item note too');
  assert.equal(notesFor(s, 'expenses.gym.amount').length, 0);
  assert.equal(sessionNotes(s).length, 2);
  assert.deepEqual(sharedNotes(s).map((n) => n.text), ['Next call: bring the pay stub']);
  const id = sessionNotes(s).find((n) => !n.shared).id;
  s = setShared(s, id, true);
  assert.equal(sharedNotes(s).length, 2);
  assert.ok(validate(s).ok, validate(s).errors.map((e) => e.path + ' ' + e.message).join('; '));
  s = removeNote(s, id);
  assert.equal(s.notes.length, 3);
  assert.ok(new Set(s.notes.map((n) => n.id)).size === 3);
});

test('a file with notes saves and loads with them', () => {
  const s = addNote(demo(), { text: 'Hello', shared: true }, '2026-10-27');
  const back = loadHousehold(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(back.notes, s.notes);
});
