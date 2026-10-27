// The bill negotiation list (overnight Track H).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readJson, loadRules } from './spine-helpers.js';
import { loadHousehold } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';
import { summarize } from '../engine/summary.js';
import { validate } from '../engine/schema.js';
import { valueOf as v } from '../engine/spine.js';
import { negotiationList, recordCall } from '../engine/negotiate.js';

const R = loadRules();
const ref = readJson('data/negotiable-2026.json');
const demo = () => applyDefaults(loadHousehold(readJson('fixtures/demo.json')), R);

test('the reference table is dated, flagged and every pattern compiles', () => {
  assert.equal(ref.year, 2026);
  for (const k of ref.kinds) { assert.ok(new RegExp(k.match, 'i')); assert.ok(k.typical > 0 && k.script.length > 40); assert.doesNotMatch(k.script, /—/); }
});

test('phone and gym bills and high-rate cards are listed, with scripts', () => {
  const s = demo(), list = negotiationList(s, summarize(s, R).cashflow, ref);
  assert.ok(list.some((x) => x.type === 'phone'));
  assert.ok(list.some((x) => x.type === 'gym'));
  const card = list.find((x) => x.kind === 'card');
  assert.ok(card && card.now >= ref.cardRateAbove && /\d+(\.\d)?%/.test(card.script));
  assert.ok(!list.some((x) => x.label === 'Rent'));
  assert.ok(!list.some((x) => x.label === 'Miscellaneous'), 'whole words only: Miscellaneous is not a cell phone');
});

test('I called: the new price lands in My numbers and the call is kept, valid', () => {
  const s = demo(), list = negotiationList(s, summarize(s, R).cashflow, ref);
  const phone = list.find((x) => x.type === 'phone');
  const n = recordCall(s, phone, 45, '2026-10-27');
  assert.equal(v(n.expenses.find((e) => e.id === phone.id).amount), 45);
  const c = n.lifeChanges[n.lifeChanges.length - 1];
  assert.deepEqual([c.kind, c.from, c.to, c.date], ['called', phone.now, 45, '2026-10-27']);
  assert.equal(negotiationList(n, summarize(n, R).cashflow, ref).find((x) => x.id === phone.id).called.to, 45);
  const card = list.find((x) => x.kind === 'card');
  const m = recordCall(n, card, 0.18, '2026-10-27');
  assert.equal(v(m.debts.find((d) => d.id === card.id).apr), 0.18);
  assert.ok(validate(m).ok, validate(m).errors.map((e) => e.path + ' ' + e.message).join('; '));
});
