// The owner's own numbers spreadsheet (S-237): fixtures/eli-numbers.local.xlsx, gitignored like every *.local.* file,
// so no real number is in this public repository. Skipped when it is not on this machine. Every row must land
// somewhere and read; what needs a look is printed with why. Against fixtures/eli.local.json (when present) the
// rows that differ are listed: those are where the sheet is newer, or where one of them is wrong.
import test from 'node:test';
import assert from 'node:assert/strict';
import { exists, readJson, SLAM } from './spine-helpers.js';
import { importCheck, words, sheetsOf, emptyHousehold } from '../tools/import-check.mjs';

const SHEET = 'fixtures/eli-numbers.local.xlsx';
const skip = !exists(SHEET) && 'the owner\'s spreadsheet is not on this machine';
const today = new Date().toISOString().slice(0, 10);

test('my numbers spreadsheet: every row maps and reads (against an empty household)', { skip }, (t) => {
  const r = importCheck(sheetsOf(SLAM + SHEET), emptyHousehold(today), { today });
  t.diagnostic(words(r));
  assert.deepEqual(r.read.problems, []);
  const look = r.plan.rows.filter((x) => x.group === 'review');
  assert.deepEqual(look.map((x) => 'row ' + x.n + ' ' + x.question + ': ' + x.why), [], 'rows that need a look');
});

test('my numbers spreadsheet against eli.local.json: what differs is listed', { skip: skip || (!exists('fixtures/eli.local.json') && 'eli.local.json is not on this machine') }, (t) => {
  const r = importCheck(sheetsOf(SLAM + SHEET), readJson('fixtures/eli.local.json'), { today });
  t.diagnostic(words(r));
  assert.deepEqual(r.plan.rows.filter((x) => x.group === 'review').map((x) => 'row ' + x.n + ' ' + x.question + ': ' + x.why), []);
});
