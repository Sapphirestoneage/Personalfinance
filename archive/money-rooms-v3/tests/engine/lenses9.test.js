/* Every Level 9 lens (MR-043) fires on a household built to trip it and stays
   quiet on the plain starter household when its trigger is not met. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compute } from '../../engine/compute.js';
import { createRow, addRow, setField } from '../../engine/record.js';
import { freshFacts } from '../../engine/fields.js';
import { loadData } from './load-data.js';
import { LEVER_SPECS } from '../households/levers-specs.mjs';
import { buildLevers } from './sensitivity.test.js';

const data = loadData(); const TODAY = '2026-10-07';
const fired = rec => compute(rec, data, { today: TODAY }).lenses.map(l => l.id);
const starter = () => buildLevers(LEVER_SPECS.starter, 'l9');
const row = (rec, planet, type) => rec.planets[planet].rows.find(r => r.type === type);
const set = (rec, rowId, fid, v, cad) => setField(rec, rowId, fid, v, 'known', 'client', { cad });
const add = (rec, planet, type, nick, f) => { const r = createRow(planet, type, { nickname: nick, f: freshFacts(data.fields, planet, type) }); addRow(rec, r); Object.keys(f).forEach(fid => { const [v, cad] = f[fid]; set(rec, r.id, fid, v, cad); }); return r; };
const line = (rec, nick) => rec.planets.spending.rows.find(r => r.nickname === nick);
const CASES = {
  'double-lever': r => r, 'withdrawal-sensitivity': r => r, 'guardrails-room': r => r, 'purchase-in-fi-days': r => r, 'first-100k': r => r, 'healthcare-bridge': r => r, 'ss-floor': r => r,
  'big-three': r => { set(r, line(r, 'Rent').id, 'amount', 200000, 'month'); return r; },
  'house-hack': r => { set(r, line(r, 'Rent').id, 'amount', 240000, 'month'); return r; },
  'lean-fi-close': r => { set(r, row(r, 'invest', 'account').id, 'accountBalance', 75000000); return r; },
  'barista-option': r => { set(r, row(r, 'invest', 'account').id, 'accountBalance', 40000000); return r; },
  'coast-reached': r => { set(r, row(r, 'invest', 'account').id, 'accountBalance', 30000000); return r; },
  'crossover-in-sight': r => { set(r, row(r, 'invest', 'account').id, 'accountBalance', 95000000); return r; },
  'the-flip': r => { set(r, row(r, 'invest', 'account').id, 'accountBalance', 50000000); return r; },
  'true-fi-gap': r => { set(r, row(r, 'invest', 'account').id, 'accountType', '401k'); return r; },
  'geo-arbitrage': r => { r.sun.flags = { geoArbitrage: true }; return r; },
  'gut-gap': r => { set(r, row(r, 'life', 'retirement').id, 'gutSpending', 450000, 'month'); return r; },
  'room-to-spend-more': r => { set(r, row(r, 'life', 'retirement').id, 'dreamSpending', 500000, 'month'); return r; },
  'side-hustle-real-wage': r => { add(r, 'income', 'side', 'Weekend shifts', { grossPay: [50000, 'month'], hoursPaid: [5] }); return r; },
  'underspending': r => { set(r, row(r, 'income', 'w2').id, 'takeHome', 1000000, 'month'); set(r, row(r, 'income', 'w2').id, 'grossPay', 1400000, 'month'); set(r, row(r, 'invest', 'account').id, 'contribAmount', 620000, 'month'); set(r, row(r, 'spending', 'savings').id, 'savingsLanding', 620000, 'month'); return r; },
};
const base = fired(starter());
test('the plain starter household fires the always-on FI lenses and not the conditional ones', () => {
  ['double-lever', 'withdrawal-sensitivity', 'guardrails-room', 'purchase-in-fi-days', 'first-100k', 'healthcare-bridge'].forEach(id => assert.ok(base.includes(id), id));
  ['big-three', 'house-hack', 'lean-fi-close', 'coast-reached', 'crossover-in-sight', 'geo-arbitrage', 'gut-gap', 'side-hustle-real-wage', 'underspending', 'true-fi-gap'].forEach(id => assert.ok(!base.includes(id), id + ' should be quiet'));
});
Object.keys(CASES).forEach(id => test('lens fires: ' + id, () => {
  const ids = fired(CASES[id](starter()));
  assert.ok(ids.includes(id), id + ' fired: ' + ids.join(', '));
}));
test('every Level 9 lens in the library has a rule and a reading', () => {
  const nine = data.lenses.lenses.filter(l => l.level === 9);
  assert.equal(nine.length, 20);
  nine.forEach(l => { assert.ok(CASES[l.id], l.id + ' has a case'); assert.ok(data.readings.readings.find(r => r.id === l.reading), l.id + ' reading ' + l.reading); assert.ok(data.metrics.metrics.find(m => m.id === l.metric), l.id + ' metric ' + l.metric); });
});
