// Eras: life chapters end to end after regular life, with cash month by month (the eras engine,
// slam/src/engines/eras.js). Regular life here: take-home 4,000, spending 3,000, so 1,000 a month is
// saved. Uses the store (schema, value, edits, validate, migrate) and the helpers, which load the
// reference data in src/data (the era templates give the income and spending shares used as guesses)
// and put the cash on hand in a checking account.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newHousehold } from '../src/store/schema.js';
import { makeValue } from '../src/store/value.js';
import { eraTimeline, addMonths } from '../src/engines/eras.js';
import { addEra, moveEra, removeEra } from '../src/store/edits.js';
import { validateHousehold } from '../src/store/validate.js';
import { migrate } from '../src/store/migrate.js';
import { loadRefs, withCashOnHand } from './helpers.js';

const refs = loadRefs();
const T = Object.fromEntries(refs.eraTemplates.templates.map((t) => [t.id, t]));
const totals = { takeHome: 4000, spending: 3000 };

function plan() {
  const d = newHousehold('Eras');
  d.currentMonth = '2026-11';
  withCashOnHand(d, 10000);
  const geo = addEra(d, T['geo-arbitrage']);
  geo.oneTime = makeValue(2000);
  const sab = addEra(d, T.sabbatical);
  sab.gapMonths = 2;
  return { d, geo, sab };
}

test('addMonths crosses years', () => {
  assert.equal(addMonths('2026-11', 2), '2027-01');
  assert.equal(addMonths('2027-10', 3), '2028-01');
});

test('two eras end to end, template shares as guesses, against regular life', () => {
  const { d } = plan();
  const r = eraTimeline(d, totals, refs);
  const [geo, sab] = r.eras;
  // Geo arbitrage, 12 months from Nov 2026: income 4,000 x 1, spending 3,000 x 0.55 = 1,650, net 2,350
  assert.deepEqual([geo.start, geo.end, geo.income, geo.spend, geo.net], ['2026-11', '2027-10', 4000, 1650, 2350]);
  assert.ok(geo.incomeGuess && geo.spendGuess);
  // cash 10,000 - 2,000 one-time + 2,350 x 12 = 36,200
  assert.equal(geo.cashEnd, 36200);
  // 2 months of regular life (+2,000) then Sabbatical from Jan 2028: 0 in, 3,000 x 0.8 = 2,400 out, 6 months
  assert.deepEqual([sab.start, sab.end, sab.net, sab.cashStart], ['2028-01', '2028-06', -2400, 38200]);
  assert.equal(sab.cashEnd, 23800); // 38,200 - 14,400
  assert.equal(sab.oneTimeBlank, true);
  // Regular life over the same 20 months: 10,000 + 20 x 1,000 = 30,000; the eras cost 6,200 of it
  assert.deepEqual([r.totalMonths, r.endKey, r.regularEnd, r.cashEnd, r.costVsRegular], [20, '2028-06', 30000, 23800, 6200]);
});

test('typed numbers replace the guess; cash running out says when and how long to save first', () => {
  const d = newHousehold('Trip');
  d.currentMonth = '2026-11';
  withCashOnHand(d, 1000);
  const trip = addEra(d, T['long-travel']);
  trip.spending = makeValue(5000);
  const e = eraTimeline(d, totals, refs).eras[0];
  // income 0 (template), spending 5,000 typed: 1,000 - 15,000 = -14,000 by the end
  assert.deepEqual([e.spendGuess, e.net, e.cashEnd, e.runsOut, e.shortBy], [false, -5000, -14000, '2026-11', 14000]);
  assert.equal(e.saveFirstMonths, 14); // 14,000 / 1,000 saved a month
});

test('blocks move earlier and later; dates follow the order', () => {
  const { d, geo, sab } = plan();
  moveEra(d, sab.id, -1);
  const r = eraTimeline(d, totals, refs);
  // Sabbatical first: 2 months gap (Nov, Dec) then Jan to Jun 2027; Geo from Jul 2027
  assert.deepEqual(r.eras.map((e) => [e.name, e.start]), [['Sabbatical', '2027-01'], ['Geo arbitrage', '2027-07']]);
  moveEra(d, geo.id, 5); // past the end: no change
  assert.equal(d.eras.list[1].id, geo.id);
  removeEra(d, sab.id);
  assert.equal(d.eras.list.length, 1);
  assert.deepEqual(validateHousehold(d), []);
});

test('no cash entered: the path shows change from today, no run-out claims', () => {
  const { d } = plan();
  d.accounts = [];
  d.balances = {};
  const r = eraTimeline(d, totals, refs);
  assert.equal(r.cashKnown, false);
  assert.equal(r.eras[0].runsOut, null);
  assert.equal(r.cashEnd, 13800); // 23,800 - 10,000
});

test('compat and checks: files before eras load with none; months must be whole and 1 or more', () => {
  const raw = JSON.parse(JSON.stringify(newHousehold('Old')));
  delete raw.eras;
  assert.deepEqual(migrate(raw).eras.list, []);
  const { d, geo } = plan();
  geo.months = 0;
  assert.ok(validateHousehold(d).some((e) => e.includes('months')));
});
