// A name for each card and loan in the Session's Debt step (owner, 2026-10-28, S-292): every debt row starts with a Name
// box on the picker, the rows sit under their kind's heading, and a row still called by its kind among several is
// "Credit card 2" wherever it is spoken of. Engine side: a pick's fills never cover a typed number.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadRules, readJson } from './spine-helpers.js';
import { readHousehold } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';
import { addItem, putFact } from '../engine/edits.js';
import { validate } from '../engine/schema.js';
import { getAt, valueOf } from '../engine/spine.js';
import { applyFills, cardFills, cardEntries, institutionEntries, LIBRARY_SOURCE } from '../engine/library.js';
import { namePlaceholder } from '../engine/add.js';

const src = readFileSync(new URL('../ui/guide.js', import.meta.url), 'utf8');
const today = '2026-10-28';
const fresh = () => applyDefaults(readHousehold(readJson('fixtures/demo.json'), { today }).spine, loadRules());

test('every debt row starts with a labeled Name box on the picker, under its kind\'s heading', () => {
  assert.match(src, /'d-name-' \+ d\.id/);
  assert.match(src, /namePlaceholder\('debts', d\.type\)/);
  assert.match(src, /nameEntries\(current\(\)\.spine, 'debts', 'debt', d\.type\)/);
  assert.match(src, /cell\('Name', wrap, id\)/);
  assert.match(src, /class: 'srow kind-head'/);
  assert.match(src, /credit_card: \['Credit card', 'Credit cards'\]/);
  assert.match(src, /student_loan: \['Student loan', 'Student loans'\]/);
  // A new row is named first: Yes and Add several focus the Name box, not Owed.
  assert.match(src, /getElementById\('d-name-' \+ r\.id\)\?\.focus\(\)/);
  assert.match(src, /getElementById\('d-name-' \+ first\)\?\.focus\(\)/);
  assert.doesNotMatch(src, /getElementById\('d-bal-' \+ /);
  // An unnamed row among several: the kind and its place. A preset's label counts as unnamed too.
  assert.match(src, /n > 1 \? kind \+ ' ' \+ \(i \+ 1\) : kind/);
  assert.match(src, /Object\.values\(PRESETS\)\.filter\(\(p\) => p\.family === 'debt'\)\.map\(\(p\) => lower\(p\.label\)\)/);
  // The hint asks for the card, the servicer or the lender.
  assert.match(namePlaceholder('debts', 'credit_card'), /Card name, e\.g\. Chase Freedom/);
  assert.match(namePlaceholder('debts', 'student_loan'), /Servicer, e\.g\. MOHELA/);
  assert.match(namePlaceholder('debts', 'auto_loan'), /Lender, e\.g\. Toyota Financial/);
  assert.match(namePlaceholder('debts', 'family_iou'), /Who you owe/);
  assert.match(namePlaceholder('debts'), /Card name/);
});

test('the Add form and the Session\'s name box fill from a pick through the one helper', () => {
  const add = readFileSync(new URL('../ui/add-form.js', import.meta.url), 'utf8');
  assert.match(add, /applyFills\(made\.spine, base, pickFills, today\)/);
  assert.doesNotMatch(add, /kind: 'rough', asOf: today, source: LIBRARY_SOURCE \}\);\n\s+\}/);
  assert.match(src, /applyFills\(putFact\(s, p \+ '\.name', t, 'known', today\), p, fills, today\)/);
});

test('a card picked from the library names the row and brings its issuer, rate and fee as guesses, never over a typed number', () => {
  let s = fresh();
  const r = addItem(s, { collection: 'debts', type: 'credit_card', label: 'Credit card' }, today);
  s = r.spine;
  const p = 'debts.' + r.id;
  s = putFact(s, p + '.apr', 0.1899, 'known', today);
  const e = cardEntries(readJson('data/library-cards-2026.json')).find((x) => x.words === 'Chase Sapphire Preferred');
  assert.ok(e && e.source === 'card');
  s = applyFills(putFact(s, p + '.name', e.words, 'known', today), p, cardFills(e.value), today);
  assert.equal(valueOf(getAt(s, p + '.name')), 'Chase Sapphire Preferred');
  assert.deepEqual([getAt(s, p + '.apr').value, getAt(s, p + '.apr').kind], [0.1899, 'known']);
  assert.deepEqual([getAt(s, p + '.institution').value, getAt(s, p + '.institution').kind, getAt(s, p + '.institution').source], ['Chase', 'rough', LIBRARY_SOURCE]);
  assert.deepEqual([getAt(s, p + '.annualFee').value, getAt(s, p + '.annualFee').kind], [95, 'rough']);
  assert.ok(validate(s).ok, validate(s).errors.map((x) => x.path + ' ' + x.message).join('\n'));
  // The same pick again, once the fee is typed: the typed fee stays.
  s = putFact(s, p + '.annualFee', 0, 'known', today);
  s = applyFills(s, p, cardFills(e.value), today);
  assert.deepEqual([getAt(s, p + '.annualFee').value, getAt(s, p + '.annualFee').kind], [0, 'known']);
  // Nothing to fill: the same spine back.
  assert.equal(applyFills(s, p, null, today), s);
});

test('a student loan picks its name from the servicers; a name typed free fills nothing else', () => {
  const servicers = institutionEntries(readJson('data/library-institutions-2026.json'), ['servicer']);
  assert.ok(servicers.length >= 3 && servicers.every((x) => x.source === 'institution' && x.hint === 'loan servicer'));
  assert.ok(servicers.some((x) => /MOHELA|Nelnet|Aidvantage/.test(x.words)), servicers.map((x) => x.words).join(', '));
  let s = fresh();
  const r = addItem(s, { collection: 'debts', type: 'student_loan', label: 'Student loan' }, today);
  const p = 'debts.' + r.id;
  s = applyFills(putFact(r.spine, p + '.name', 'My old loan', 'known', today), p, null, today);
  assert.equal(valueOf(getAt(s, p + '.name')), 'My old loan');
  assert.deepEqual([getAt(s, p + '.institution').value, getAt(s, p + '.institution').kind], [null, 'missing']);
  assert.ok(validate(s).ok);
});
