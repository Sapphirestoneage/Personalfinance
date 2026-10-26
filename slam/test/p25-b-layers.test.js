// Phase 2.5, Part B1: the data layers (docs/DATA_LAYERS.md). House defaults live in their own file and are read like
// a rule; a guess made from one follows it, and nothing typed does; every Fact keeps its four tags; starting guesses
// come in one order.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRules, readJson } from './spine-helpers.js';
import { makeRules, withHouse, isHouseRule } from '../engine/rules.js';
import { readHousehold } from '../engine/normalize.js';
import { applyDefaults, startingGuess, DEFAULT_WORDS } from '../engine/defaults.js';
import { whoSupplies, valueOf, fact, getAt } from '../engine/spine.js';
import { editFact } from '../engine/edits.js';
import { estimatedVsActual } from '../engine/compare.js';

const law = readJson('data/rules-2026.json'), house = readJson('data/house-defaults.json');
const demo = (R = loadRules()) => applyDefaults(readHousehold(readJson('fixtures/demo.json'), { today: '2026-10-26' }).spine, R);

test('house defaults are their own file, not the law; every engine still reads them by id', () => {
  const lawIds = new Set(law.rules.map((r) => r.id));
  for (const r of house.rules) { assert.ok(!lawIds.has(r.id), r.id + ' is in both files'); assert.equal(r.verified, 'house'); assert.match(r.source, /^Eli's default/); }
  const R = loadRules();
  assert.equal(R.get('DEFAULT_CARD_APR', 2026), 0.25);
  assert.equal(R.get('DEFAULT_DUE_DAY', 2026), 1);
  assert.equal(R.get('APP_RULE_OF_5', 2026), 5);
  assert.equal(R.get('APP_HOUSING_REF', 2026), 0.35);
  assert.equal(R.get('APP_MATERIALITY', 2026), 100);
  assert.deepEqual(R.get('FOO_RUNGS', 2026), house.rules.find((r) => r.id === 'FOO_RUNGS').value);
  assert.ok(isHouseRule(R.meta('APP_RULE_OF_5', 2027)), 'a later year reads the same defaults');
  assert.ok(!isHouseRule(R.meta('K401_DEF', 2026)));
  // The law alone does not have them.
  assert.throws(() => makeRules(law).get('DEFAULT_CARD_APR', 2026), /Unknown rule/);
});

test('changing a house default changes every guess that used it, and nothing typed', () => {
  const R0 = loadRules();
  // Blank the Visa's rate, so the house default fills it; the store card keeps its typed rate.
  let s = applyDefaults(editFact(demo(R0), 'debts.visa.apr', 'clear', { today: '2026-10-26' }), R0);
  const cards = s.debts.filter((d) => d.type === 'credit_card');
  const guessed = cards.filter((d) => d.apr.source === 'DEFAULT_CARD_APR');
  const typed = cards.filter((d) => d.apr.source !== 'DEFAULT_CARD_APR');
  assert.ok(guessed.length >= 1 && typed.length >= 1, 'the demo has a guessed rate and a typed one');
  for (const d of guessed) { assert.equal(valueOf(d.apr), 0.25); assert.equal(whoSupplies(d.apr), 'default'); assert.match(d.apr.note, new RegExp(DEFAULT_WORDS)); }
  const R1 = loadRules({ DEFAULT_CARD_APR: { value: 0.3 }, DEFAULT_DUE_DAY: { value: 5 } });
  const again = applyDefaults(s, R1);
  for (const d of guessed) assert.equal(valueOf(getAt(again, 'debts.' + d.id + '.apr')), 0.3, d.id + ' follows the new default');
  for (const d of typed) assert.deepEqual(getAt(again, 'debts.' + d.id + '.apr'), d.apr, d.id + ' keeps what was typed');
  for (const d of again.debts) if (d.dueDay && d.dueDay.source === 'DEFAULT_DUE_DAY') assert.equal(valueOf(d.dueDay), 5);
  // Typing over a guess makes it the client's; a new default no longer touches it.
  const id = guessed[0].id;
  s = editFact(again, 'debts.' + id + '.apr', 'set', { value: 0.199, kind: 'known', today: '2026-10-26' });
  assert.equal(valueOf(getAt(applyDefaults(s, R0), 'debts.' + id + '.apr')), 0.199);
});

test('the four tags: where from, as of when, how sure, who supplies it', () => {
  const f = fact(10, { asOf: '2026-10-26', source: 'ledger', kind: 'known', by: 'coach' });
  assert.deepEqual([f.source, f.asOf, f.kind, whoSupplies(f)], ['ledger', '2026-10-26', 'known', 'coach']);
  assert.equal(whoSupplies({ value: 1, kind: 'rough', source: 'DEFAULT_DUE_DAY' }), 'default', 'an older guess from a default');
  assert.equal(whoSupplies({ value: 1, kind: 'rough', source: 'typical: elsewhere' }), 'lookedUp');
  assert.equal(whoSupplies({ value: 1, kind: 'known', source: 'demo (made up)' }), 'client');
  assert.equal(fact(1, { by: 'nobody' }).by, undefined, 'only the four suppliers');
});

test('starting guesses: own number, then profile, then reference, then the house default; each says which', () => {
  const all = { own: { value: 1200 }, profile: { value: 0, source: 'profile: lives with family' }, reference: { value: 1400, source: 'typical: elsewhere' }, house: { value: 70, source: 'DEFAULT_PHONE_PLAN_1' } };
  assert.equal(startingGuess(all).value, 1200);
  assert.equal(startingGuess(all).by, 'client');
  const p = startingGuess({ ...all, own: null });
  assert.deepEqual([p.value, p.kind, p.note], [0, 'rough', 'a guess from your profile'], 'a profile guess of $0 is a guess, not blank');
  const r = startingGuess({ ...all, own: null, profile: { value: null } });
  assert.deepEqual([r.value, r.by, r.note], [1400, 'lookedUp', 'typical for people like you']);
  const hd = startingGuess({ house: all.house });
  assert.deepEqual([hd.value, hd.by, hd.note, whoSupplies(hd)], [70, 'default', DEFAULT_WORDS, 'default']);
  assert.equal(startingGuess({}).kind, 'missing', 'nothing to go on is missing, never $0');
});

test('too small to matter: a month within $100 of the plan reads on plan', () => {
  const s = demo();
  const c = estimatedVsActual(s, loadRules(), { months: 1 });
  if (c.spend.diff !== null) assert.equal(c.spend.onPlan, Math.abs(c.spend.diff) < 100);
  const big = estimatedVsActual(s, loadRules({ APP_MATERIALITY: { value: 1e9 } }), { months: 1 });
  if (big.spend.diff !== null) assert.equal(big.spend.onPlan, true);
});

test('the Builder has House defaults beside Rules, on the same editor', async () => {
  const { readFileSync } = await import('node:fs');
  const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
  assert.match(read('ui/builder.js'), /'House defaults', 'house\.html'/);
  assert.match(read('house.html'), /src="ui\/rules-page\.js"/);
  assert.match(read('ui/rules-page.js'), /ON_HOUSE \? HOUSE : YEAR/);
  assert.ok(withHouse(law, house).rules.length === law.rules.length + house.rules.length);
});
