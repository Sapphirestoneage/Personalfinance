// Planning dates (Batch 8, S-278): dates worth knowing ahead, as calendar markers that never move cash.
import test from 'node:test';
import assert from 'node:assert/strict';
import { planningDates } from '../engine/planning-dates.js';
import { calendar } from '../engine/calendar.js';
import { loadRules, readJson } from './spine-helpers.js';
import { readHousehold } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';

const F = (value) => ({ value, kind: 'known', asOf: '2026-10-01', source: 'made up' });
const spine = {
  accounts: [
    { id: 'ib', type: 'i_bond', name: F('I bond'), purchaseDate: F('2026-03-15') },
    { id: 'cd', type: 'cd', name: F('CD'), maturityDate: F('2027-02-01') },
    { id: 'fsa', type: 'health_fsa', name: F('Health FSA'), planYearEnd: F('2026-12-31') },
    { id: 'es', type: 'espp', name: F('ESPP'), offeringPeriodEnd: F('2026-11-30') },
    { id: 'rs', type: 'rsu', name: F('RSUs'), rsuNextVest: F('2026-11-15'), rsuVestSchedule: F('quarterly'), rsuVestValue: F(5000) }],
  debts: [{ id: 'h', type: 'heloc', name: F('HELOC'), drawEnds: F('2027-01-10') }],
  policies: [{ id: 'life', type: 'term_life', name: F('Term life'), renewal: F('2027-03-01'), termEnds: F('2045-06-01') }],
  income: [{ id: 'job', label: 'Job', openEnrollmentMonth: F(11), raiseDate: F('2027-01-01') }]
};

test('each kind of planning date, in order, from the items', () => {
  const d = planningDates(spine, '2026-11-01', '2027-03-31');
  const by = (w) => d.filter((x) => x.what === w).map((x) => x.date);
  assert.deepEqual(by('ibond'), ['2027-03-15'], '12 months after buying; 5 years is 2031');
  assert.deepEqual(by('matures'), ['2027-02-01']);
  assert.deepEqual(by('fsa'), ['2026-12-31']);
  assert.deepEqual(by('espp'), ['2026-11-30']);
  assert.deepEqual(by('rsu'), ['2026-11-15', '2027-02-15'], 'every quarter from the next vest');
  assert.deepEqual(by('draw'), ['2027-01-10']);
  assert.deepEqual(by('renewal'), ['2027-03-01']);
  assert.deepEqual(by('enrollment'), ['2026-11-01']);
  assert.deepEqual(by('raise'), ['2027-01-01']);
  assert.deepEqual(d.map((x) => x.date), [...d.map((x) => x.date)].sort(), 'in date order');
  assert.deepEqual(planningDates(spine, '2031-03-01', '2031-03-31').map((x) => x.label), ['I bond: no more 3-month interest penalty (5 years)']);
});

test('on the calendar they are dates, never cash', () => {
  const R = loadRules();
  const demo = applyDefaults(readHousehold(readJson('fixtures/demo.json'), { today: '2026-10-26' }).spine, R);
  const s = { ...demo, income: demo.income.map((x, i) => (i === 0 ? { ...x, openEnrollmentMonth: F(11) } : x)) };
  const without = calendar(demo, R, { from: '2026-11', months: 1 }).months[0];
  const m = calendar(s, R, { from: '2026-11', months: 1 }).months[0];
  const e = m.events.find((x) => x.kind === 'planning');
  assert.ok(e && e.date === '2026-11-01' && e.counted === false && e.amount === null);
  assert.deepEqual(m.cash, without.cash, 'the month\'s cash does not move');
});
