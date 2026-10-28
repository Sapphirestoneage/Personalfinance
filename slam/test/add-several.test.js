// Several credit cards at once (owner, 2026-10-28, S-290): the Session's card row offers "Add several", which asks how
// many more (2 to 6) and adds that many blank rows in one change. Engine side: N added cards are N distinct rows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadRules, readJson } from './spine-helpers.js';
import { readHousehold } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';
import { addItem } from '../engine/edits.js';
import { validate } from '../engine/schema.js';

test('the card row offers Add several, then How many more?; only kinds that come in handfuls get it', () => {
  const src = readFileSync(new URL('../ui/guide.js', import.meta.url), 'utf8');
  assert.match(src, /'Add several'/);
  assert.match(src, /'How many more ' \+ label\.toLowerCase\(\) \+ 's\?'/);
  assert.match(src, /const SEVERAL = \[2, 3, 4, 5, 6\];/);
  assert.match(src, /\['credit_card', 'Any credit cards\?', 'Credit card', true\]/);
  assert.doesNotMatch(src, /\['mortgage', 'A mortgage\?', 'Mortgage', true\]/);
});

test('adding four cards in one change gives four blank rows with their own ids', () => {
  const R = loadRules();
  let s = applyDefaults(readHousehold(readJson('fixtures/demo.json'), { today: '2026-10-28' }).spine, R);
  const before = s.debts.filter((d) => d.type === 'credit_card').length;
  const ids = [];
  for (let i = 0; i < 4; i++) { const r = addItem(s, { collection: 'debts', type: 'credit_card', label: 'Credit card' }, '2026-10-28'); s = r.spine; ids.push(r.id); }
  assert.equal(new Set(ids).size, 4);
  assert.equal(s.debts.filter((d) => d.type === 'credit_card').length, before + 4);
  assert.ok(validate(s).ok, validate(s).errors.map((e) => e.path + ' ' + e.message).join('\n'));
});
