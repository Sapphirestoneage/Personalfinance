import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRecord, setHousehold, setColTier } from '../../engine/record.js';
import { livesWithFamily } from '../../engine/household.js';
import { applyGuesses, applyDiscovery, discoverySummary } from '../../engine/discovery.js';
import { guessRows } from '../../engine/guesses.js';
import { moveOutOutcome, blockCosts } from '../../engine/scenarios.js';
import { compute } from '../../engine/compute.js';
import { loadData } from './load-data.js';

const data = loadData(); const TODAY = '2026-10-12'; const NOW = TODAY + 'T12:00:00.000Z';
const cat = (rec, c) => guessRows(rec).filter(r => r.f.category.v === c);
const total = rows => rows.reduce((s, r) => s + (r.f.amount.v || 0), 0);

test('the flag is stored through setHousehold; an older record without it reads as a place of their own', () => {
  const rec = createRecord({ id: 'f1' });
  assert.equal(rec.household.living, 'own'); assert.ok(!livesWithFamily(rec.household));
  setHousehold(rec, { living: 'family' }); assert.equal(rec.household.living, 'family'); assert.ok(livesWithFamily(rec.household));
  assert.ok(rec.journal[rec.journal.length - 1].kind === 'household');
  setHousehold(rec, { roommates: [{ nickname: 'A' }] }); assert.equal(rec.household.living, 'own');
  assert.ok(!livesWithFamily({ roommates: [], lease: 'none' }), 'no flag means own');
});

test('with family the guesses carry no rent and no utilities bill, food at the factor, getting around above it; nothing else moves', () => {
  const LF = data.defaults.livingWithFamily; assert.ok(LF && LF.foodFactor < 1 && LF.transportationFactor > 1);
  const own = createRecord({ id: 'own' }); setColTier(own, { tier: 'MCOL', source: 'client' }); applyGuesses(own, data);
  const fam = createRecord({ id: 'fam' }); setHousehold(fam, { living: 'family' }); setColTier(fam, { tier: 'MCOL', source: 'client' }); applyGuesses(fam, data);
  const rent = cat(fam, 'accommodation'); assert.equal(rent.length, 1); assert.equal(rent[0].f.amount.v, 0); assert.equal(rent[0].f.amount.state, 'none'); assert.equal(rent[0].nickname, 'Rent (living with family)');
  const util = cat(fam, 'utilities').find(r => /living with family/.test(r.nickname)); assert.ok(util && util.f.amount.v === 0);
  assert.ok(cat(fam, 'utilities').some(r => /phone/i.test(r.nickname)), 'a phone line stays');
  const mult = data.colTiers.tierAverages.MCOL.allItems / 100; const foodLines = data.defaults.categories.food.lines['1'];
  assert.equal(total(cat(fam, 'food')), foodLines.reduce((s, l) => s + Math.round(l[1] * mult * LF.foodFactor), 0)); assert.equal(total(cat(own, 'food')), foodLines.reduce((s, l) => s + Math.round(l[1] * mult), 0));
  assert.ok(total(cat(fam, 'transportation')) > total(cat(own, 'transportation')));
  assert.equal(total(cat(fam, 'wants')), total(cat(own, 'wants')));
  const R = compute(fam, data, { today: TODAY }); assert.ok(R.metrics.spending.status === 'ok' && R.metrics.spending.value.cents < compute(own, data, { today: TODAY }).metrics.spending.value.cents);
});

test('the move-out outcome: rent and utilities at the tier, food back up, transport down, the usual line and the cash to move in', () => {
  const rec = createRecord({ id: 'mo' }); setHousehold(rec, { living: 'family' }); setColTier(rec, { tier: 'MCOL', source: 'client' });
  assert.equal(moveOutOutcome(createRecord({ id: 'x' }), compute(createRecord({ id: 'x' }), data, { today: TODAY }), data), null, 'nothing unless living with family');
  const R = compute(rec, data, { today: TODAY }); const mo = R.moveOut; assert.ok(mo);
  const m = data.colTiers.tierAverages.MCOL; const u = data.defaults.housingByUnit['1bed']; const LF = data.defaults.livingWithFamily;
  assert.equal(mo.rent, Math.round(u.rent * m.housing / 100)); assert.equal(mo.utilities, Math.round(u.utilities * m[data.colTiers.componentByCategory.utilities || 'allItems'] / 100));
  const food = data.defaults.categories.food.lines['1'].reduce((s, l) => s + l[1], 0); const tr = data.defaults.categories.transportation.lines['1'].reduce((s, l) => s + l[1], 0);
  assert.equal(mo.foodBack, Math.round(food * m.allItems / 100 * (1 - LF.foodFactor))); assert.equal(mo.transportSaved, Math.round(tr * m.allItems / 100 * (LF.transportationFactor - 1)));
  assert.equal(mo.gap, mo.rent + mo.utilities + mo.foodBack - mo.transportSaved);
  assert.equal(mo.takeHome, null); assert.equal(mo.ableNow, null); assert.equal(mo.takeHomeNeeded, Math.round((mo.rent + mo.utilities) / LF.affordableHousingShare));
  assert.equal(mo.moveInCash, mo.rent * 2);
  /* the scenario block reads the same two figures */
  const def = data.scenarioBlocks.types.moveout; assert.ok(def);
  const c = blockCosts(def, { type: 'moveout', answers: { depositMonths: 1, oneTime: 50000, yearsOut: 30 } }, { moveOutRentMonthly: mo.rent, moveOutGapMonthly: mo.gap });
  assert.equal(c.oneOff, mo.rent + 50000); assert.equal(c.monthly, mo.gap);
  const missing = blockCosts(def, { type: 'moveout', answers: {} }, { moveOutRentMonthly: null, moveOutGapMonthly: null }); assert.ok(missing.needs && missing.needs.length);
});

test('discovery: With family lands the flag, drops roommates, and the summary says when they are able', () => {
  const rec = createRecord({ id: 'd' });
  applyDiscovery(rec, { snapshot: { name: 'Noa', city: 'Columbus', living: 'family', roommates: 2 }, money: { payType: 'salary', gross: '52,000', takeHome: '1,600', payFrequency: 'biweekly' } }, data, { now: NOW, today: TODAY });
  assert.equal(rec.household.living, 'family'); assert.deepEqual(rec.household.roommates, []);
  const R = compute(rec, data, { today: TODAY }); const s = discoverySummary(rec, R, data);
  assert.ok(s.moveOut && s.moveOut.takeHome > 0 && typeof s.moveOut.ableNow === 'boolean' && typeof s.moveOut.housingShare === 'number');
  assert.equal(s.snapshot.household.living, 'family'); assert.equal(s.roommate, null);
  assert.ok(R.guesses.rows.some(g => /living with family/.test(g.name)));
});
