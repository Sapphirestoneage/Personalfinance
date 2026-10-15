/* MR-117: the split is selected on the line (Fixed, Variable, Annual, Part fixed with a share), blank follows the rule;
   the planet publishes bySplit and byFeeling; the materiality line is the higher of wage times minutes and a share of a year's spending. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compute } from '../../engine/compute.js';
import { createRecord, createRow, addRow, setField } from '../../engine/record.js';
import { freshFacts } from '../../engine/fields.js';
import { belowMateriality, materialityLine } from '../../engine/hours.js';
import { whatsLeft, materialityOf } from '../../engine/whatsleft.js';
import { loadData } from './load-data.js';

const data = loadData(); const TODAY = '2026-10-07';
function sun(rec, facts) { Object.keys(facts).forEach(k => setField(rec, 'sun', k, facts[k], 'known', 'client')); }
function add(rec, planet, type, f, nick) { const r = createRow(planet, type, { nickname: nick || type, f: freshFacts(data.fields, planet, type) }); addRow(rec, r, { session: null }); Object.keys(f || {}).forEach(k => { const v = f[k]; const [val, st, cad] = Array.isArray(v) ? v : [v, 'known', undefined]; setField(rec, r.id, k, val, st, 'client', cad ? { cad } : {}); }); return r; }
function household() {
  const rec = createRecord(); sun(rec, { birthDate: '1994-03-01', state: 'OR', filingStatus: 'single', workSituation: 'employed' });
  add(rec, 'income', 'w2', { takeHome: [400000, 'known', 'month'], payFrequency: 'monthly' }, 'Job');
  add(rec, 'spending', 'line', { category: 'accommodation', amount: [150000, 'known', 'month'], splitKind: 'fixed', feeling: 'calm' }, 'Rent');
  add(rec, 'spending', 'line', { category: 'food', amount: [60000, 'known', 'month'], needWant: 'want', feeling: 'joy' }, 'Groceries'); /* blank split: a want is variable */
  add(rec, 'spending', 'line', { category: 'utilities', amount: [12000, 'known', 'month'], splitKind: 'mixed', fixedShare: 0.5, feeling: 'obligation' }, 'Phone and internet');
  add(rec, 'spending', 'line', { category: 'wants', amount: [240000, 'known', 'year'], splitKind: 'annual', feeling: 'joy' }, 'Travel');
  add(rec, 'spending', 'line', { category: 'therapy', amount: [8000, 'known', 'month'] }, 'Gym'); /* blank split, a need by default: fixed; no feeling */
  return rec;
}
const S = rec => compute(rec, data, { today: TODAY }).sun.outputs.spending;

test('a selected split wins, blank follows Need or Want and the category, Part fixed counts in two by its share', () => {
  const sp = S(household()); const r = sp.resolved;
  assert.equal(r.expensesFixed.itemized, 150000 + 6000 + 8000);
  assert.equal(r.expensesVariable.itemized, 60000 + 6000);
  assert.equal(r.expensesAnnual.itemized, 240000);
  assert.equal(r.expenses.itemized, 150000 + 60000 + 12000 + 20000 + 8000); /* the all-in total counts the part-fixed line once */
  assert.equal(r.expenses.counts.known, 5); assert.equal(r.expensesFixed.counts.known, 3); assert.equal(r.expensesVariable.counts.known, 2);
  assert.equal(sp.bySplit.fixed.cents, 164000); assert.equal(sp.bySplit.variable.cents, 66000); assert.equal(sp.bySplit.annual.cents, 20000);
  assert.equal(sp.bySplit.fixed.cents + sp.bySplit.variable.cents + sp.bySplit.annual.cents, sp.baselineMonthly.cents);
});
test('Part fixed with no share typed is not a half of nothing: the rule decides until the percent arrives', () => {
  const rec = household(); const row = rec.planets.spending.rows.find(r => r.nickname === 'Phone and internet'); setField(rec, row.id, 'fixedShare', null, 'unknown', 'client');
  const sp = S(rec); assert.equal(sp.resolved.expensesFixed.itemized, 150000 + 12000 + 8000); assert.equal(sp.resolved.expensesVariable.itemized, 60000);
});
test('the lines by feeling sum the tagged lines and keep the untagged apart', () => {
  const sp = S(household());
  assert.equal(sp.byFeeling.joy.cents, 60000 + 20000); assert.equal(sp.byFeeling.calm.cents, 150000); assert.equal(sp.byFeeling.obligation.cents, 12000);
  assert.equal(sp.byFeeling.untagged.cents, 8000); assert.equal(sp.byFeeling.dread.cents, 0);
  assert.equal(Object.keys(sp.byFeeling).reduce((s, k) => s + sp.byFeeling[k].cents, 0), sp.baselineMonthly.cents);
});
test('the materiality line is the higher of the wage leg and the share leg; with neither nothing is small', () => {
  assert.equal(materialityLine(2652, 5, 0), 2652 * 5 / 60);
  assert.equal(materialityLine(2652, 5, 100000), 100000);
  assert.equal(materialityLine(null, 5, 100000), 100000);
  assert.equal(materialityLine(null, 5, null), 0);
  assert.equal(belowMateriality(5000, 2652, 5), false); /* $50 a year against $2.21 */
  assert.equal(belowMateriality(5000, 2652, 5, 100000), true); /* under a $1,000 share line */
  assert.equal(belowMateriality(5000, null, 5, null), false);
});
test('the share leg reads the assumption against a year of resolved spending, else take-home, and What\'s left carries it', () => {
  const rec = household(); const R = compute(rec, data, { today: TODAY });
  const M = materialityOf(rec, R, data, null);
  assert.equal(M.share, 0.005); assert.equal(M.base, 'spending'); assert.equal(M.annual, R.sun.outputs.spending.baselineMonthly.cents * 12); assert.equal(M.shareLine, Math.round(M.annual * 0.005));
  const WL = whatsLeft(rec, R, data); assert.equal(WL.materiality.shareLine, M.shareLine);
  rec.sun.assumptions = { materialityShare: 0.02 }; const R2 = compute(rec, data, { today: TODAY }); assert.equal(materialityOf(rec, R2, data, null).shareLine, Math.round(M.annual * 0.02));
  const only = createRecord(); sun(only, { birthDate: '1994-03-01', state: 'OR', filingStatus: 'single', workSituation: 'employed' }); add(only, 'income', 'w2', { takeHome: [400000, 'known', 'month'], payFrequency: 'monthly' }, 'Job');
  const M2 = materialityOf(only, compute(only, data, { today: TODAY }), data, null); assert.equal(M2.base, 'income'); assert.equal(M2.shareLine, Math.round(400000 * 12 * 0.005));
});
