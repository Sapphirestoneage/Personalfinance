// House style for Phase 1 files: no em dashes in code, comments, UI copy or docs,
// and no real household data committed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { SLAM } from './spine-helpers.js';

// Built from the char code so this file holds none.
const EM = String.fromCharCode(0x2014);

const files = [
  ...['engine', 'ui'].flatMap((d) => readdirSync(SLAM + d).map((f) => d + '/' + f)),
  ...readdirSync(SLAM + 'test').filter((f) => /^(spine-|rules\.|schema\.|eli\.golden|demo\.golden)/.test(f)).map((f) => 'test/' + f),
  'ledger.html', 'dashboard.html', 'data/rules-2026.json', 'fixtures/demo.json',
  'CONTRACTS.md', 'BOARD.md', 'QUESTIONS.md', 'DECISIONS.md', 'README.md'
];

test('no em dashes in Phase 1 files', () => {
  for (const f of files) assert.ok(!readFileSync(SLAM + f, 'utf8').includes(EM), f + ' has an em dash');
});

test('the demo household is marked made up', () => {
  const demo = JSON.parse(readFileSync(SLAM + 'fixtures/demo.json', 'utf8'));
  assert.equal(demo.meta.demo, true);
});
