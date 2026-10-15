// Checks the repo layout and house rules that apply from Phase 0 on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);

test('required docs exist', () => {
  for (const f of ['README.md', 'LESSONS.md', 'DECISIONS.md', 'PARKING_LOT.md']) {
    assert.ok(existsSync(new URL(f, root)), f + ' is missing');
  }
});

test('LESSONS.md lists all 16 lessons', () => {
  const text = readFileSync(new URL('LESSONS.md', root), 'utf8');
  for (let i = 1; i <= 16; i++) assert.match(text, new RegExp('^' + i + '\\. ', 'm'));
});
