// Owner's ask (2026-10-27): a basis can come from contributions by year, for each of many years. When the list has
// entries, the basis is their total (rollovers and conversions aside); else the one typed basis. Made-up numbers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readJson } from './spine-helpers.js';
import { loadHousehold } from '../engine/normalize.js';
import { tracker } from '../engine/spine.js';
import { basisOf } from '../engine/networth.js';
import { basisFromYears } from '../engine/ledger.js';

const K = (value) => ({ value, kind: 'known', asOf: '2026-10-01', source: 'test' });

test('the years win over a typed basis; rollovers and conversions are not counted', () => {
  const a = { id: 'r', family: 'ira', type: 'roth_ira', basis: K(5000), contributions: K([{ year: 2024, amount: 7000 }, { year: 2025, amount: 7000 }, { year: 2025, amount: 3000, kind: 'rollover' }]) };
  assert.equal(basisOf(tracker(), a), 14000);
  assert.equal(basisOf(tracker(), { ...a, contributions: K([]) }), 5000, 'an empty list leaves the typed basis');
  const brk = { id: 'b', family: 'taxable', type: 'brokerage', costBasis: K(9000), contributions: K([{ year: 2026, amount: 2500 }]) };
  assert.equal(basisOf(tracker(), brk), 2500, 'a brokerage cost basis by year too');
});

test('My numbers shows the basis row as the total of the years', () => {
  const s = loadHousehold(readJson('fixtures/demo.json'));
  const roth = s.accounts.find((x) => x.type === 'roth_ira');
  assert.equal(basisFromYears(s, 'accounts.' + roth.id + '.basis'), (roth.contributions.value || []).reduce((x, c) => x + c.amount, 0));
  assert.equal(basisFromYears(s, 'accounts.' + roth.id + '.balance'), null);
});
