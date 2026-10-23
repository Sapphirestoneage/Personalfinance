// Checks the repo layout and house rules that apply from Phase 0 on: the five docs at the slam/ root
// (README, LESSONS, DECISIONS, PARKING_LOT, HOSTING) exist, and LESSONS.md numbers its lessons.
// Reads the files straight from disk with node:fs; no store or engine code is involved.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);

test('required docs exist', () => {
  for (const f of ['README.md', 'LESSONS.md', 'DECISIONS.md', 'PARKING_LOT.md', 'HOSTING.md']) {
    assert.ok(existsSync(new URL(f, root)), f + ' is missing');
  }
});

test('LESSONS.md lists all 21 lessons', () => {
  const text = readFileSync(new URL('LESSONS.md', root), 'utf8');
  // Lessons 22 and 23 were added after this test; it still only checks that the first 21 are numbered.
  for (let i = 1; i <= 21; i++) assert.match(text, new RegExp('^' + i + '\\. ', 'm'));
});
