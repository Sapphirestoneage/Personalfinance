// Net worth on the test households (S-115): Riley (rents; a 401(k), a Roth IRA, a used car with a
// loan) and Dana (owns a condo with a mortgage; a 401(k), a car with no loan, a Visa). Every expected
// number is worked out by hand below from the balances typed in tools/riley.mjs and tools/dana.mjs
// (Riley's checking, savings, and Visa ends are the ones in test/riley.test.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadRefs, loadHousehold } from './helpers.js';
import { migrate } from '../src/store/migrate.js';
import { validateHousehold } from '../src/store/validate.js';
import { setBalance } from '../src/store/accounts.js';
import { makeValue } from '../src/store/value.js';
import { countsForFI } from '../src/store/schema.js';
import { buildSummary } from '../src/calc/summary.js';
import { bridgeFor } from '../src/calc/bridge.js';
import { netWorthAt, netWorthByMonth, milestones, balanceMonths } from '../src/calc/networth.js';
import { netWorthBridge } from '../src/calc/networth-bridge.js';
import { contributionsFor } from '../src/calc/contributions.js';
import { owningCosts } from '../src/calc/owning.js';

const refs = loadRefs();
const lines = (b) => Object.fromEntries(b.lines.map((l) => [l.key, l.amount]));
const TODAY = '2026-10-17';

test('the files load clean', () => {
  for (const name of ['riley', 'dana']) assert.deepEqual(validateHousehold(loadHousehold(name)), [], name);
});

// ---- Riley ----

test('Riley: both net worths and the locked-in part at two month ends', () => {
  const d = loadHousehold('riley');
  // March 31: checking 2,577.46 + savings 700 + 401(k) 14,065 + Roth 8,450 + car 9,000 = 34,792.46.
  // Owed: Visa 652.59 + auto loan 5,146.97 = 5,799.56. Net worth 34,792.46 - 5,799.56 = 28,992.90.
  // FI: 2,577.46 + 700 + 14,065 + 8,450 = 25,792.46, less the Visa 652.59 = 25,139.87 (the car and its loan are out).
  // Locked in: the car 9,000 - its loan 5,146.97 = 3,853.03.
  // Paid ahead (S-119): the 960 of car insurance paid March 14 covers 12 months, 80 a month: 880 left at
  // March's end. It is an asset (tier 4), not FI. Net worth 28,992.90 + 880 = 29,872.90; assets 35,672.46.
  const mar = netWorthAt(d, '2026-03-31');
  assert.deepEqual([mar.assetsTotal, mar.debtsTotal, mar.total, mar.fi, mar.locked], [35672.46, 5799.56, 29872.9, 25139.87, 4733.03]);
  assert.deepEqual(mar.lockedRows.map((r) => [r.name, r.value, r.debt, r.equity]), [['Car', 9000, 5146.97, 3853.03], ['Paid ahead: Car insurance', 880, 0, 880]]);
  // By tier: 1 is cash, 3,277.46; 2 the same (nothing in tier 2); 3 adds the 401(k) and Roth: 25,792.46; all 35,672.46.
  assert.deepEqual(mar.byTier, { 1: 3277.46, 2: 3277.46, 3: 25792.46, 4: 35672.46 });
  // June 30: 2,379.81 + 450 + 15,340 + 9,800 = 27,969.81 in FI assets, less the Visa 511.75 = 27,458.06.
  // The car 8,700 - its loan 4,199.44 = 4,500.56, and the insurance paid ahead 960 - 4 x 80 = 640 (its July
  // registration not paid yet): locked in 5,140.56; net worth 27,458.06 + 5,140.56 = 32,598.62.
  const jun = netWorthAt(d, '2026-06-30');
  assert.deepEqual([jun.total, jun.fi, jun.locked], [32598.62, 27458.06, 5140.56]);
});

test('Riley: March\'s net worth bridge, line by line (it ties)', () => {
  const d = loadHousehold('riley');
  const b = netWorthBridge(d, buildSummary(d, refs).income, '2026-03');
  // Start (February 28): checking 3,793.11 + savings 450 + 401(k) 13,465 + Roth 7,910 + car 9,100 = 34,718.11,
  // less the Visa 586.35 and the loan 5,459.67: 28,672.09.
  // Surplus -451.89 (the actual income 3,220, S-118) and timing -865 (yearly), from the cash bridge
  // (test/riley.test.js). Before S-118 these were -171.89 and -1,145 (with -280 of income vs take-home): the same sum.
  // Saved: the savings lines 200 + 400 + 50 = 650, + the 401(k) from the paycheck 150 x 26 / 12 = 325: 975.
  // Debt paid down: the Visa minimum 35 + the loan 5,459.67 - 5,146.97 = 312.70: 347.70.
  // Market: 401(k) 14,065 - 13,465 - 325 = 275; Roth 8,450 - 7,910 - 400 moved in on the 28th = 140: 415.
  // Values: the car 9,100 -> 9,000: -100.
  // Paid ahead (S-119): the 960 for car insurance is mostly still owed to Riley: 880 at March's end (none at
  // the start). Timing: -865 + 880 = +15 (the car registration's share, not paid until July).
  assert.deepEqual(lines(b.total), { surplus: -451.89, timing: 15, saved: 975, 'paid-down': 347.7, market: 415, value: -100 });
  // 28,672.09 - 451.89 + 15 + 975 + 347.70 + 415 - 100 = 29,872.90 = March's end with 880 paid ahead: nothing left over.
  assert.deepEqual([b.total.start, b.total.explained, b.total.actual, b.total.unexplained, b.total.change], [28672.09, 29872.9, 29872.9, 0, 1200.81]);
  // In words: saved -451.89 + 15 + 975 = 538.11.
  assert.equal(b.reading, 'Net worth rose $1,201. $538 you saved, $415 the market added, $348 of debt paid down, $100 of value lost on things you own.');
  // FI: start 25,618.11 - 586.35 = 25,031.76; lines without the loan and the car:
  // -451.89 - 865 + 975 + 35 + 415 = 108.11; 25,031.76 + 108.11 = 25,139.87 = March's FI.
  assert.deepEqual(lines(b.fi), { surplus: -451.89, timing: -865, saved: 975, 'paid-down': 35, market: 415 });
  assert.deepEqual([b.fi.start, b.fi.explained, b.fi.unexplained], [25031.76, 25139.87, 0]);
});

test('Riley: June\'s net worth bridge, with the $60 of ATM cash not explained', () => {
  const d = loadHousehold('riley');
  const b = netWorthBridge(d, buildSummary(d, refs).income, '2026-06');
  // Start (May 31): 2,822.03 + 200 + 15,165 + 9,475 + 8,800 = 36,462.03, plus the insurance paid ahead
  // 960 - 3 x 80 = 720, less 707.62 and 4,516.86: 31,957.55.
  // Surplus -376.35 (the actual income 3,150, S-118); timing: yearly +95, paid back +60, and paid ahead
  // 720 -> 640 = -80: 75 (test/riley.test.js).
  // Saved 650 + 325 = 975. Paid down 35 + (4,516.86 - 4,199.44 = 317.42) = 352.42.
  // Market: 401(k) 15,340 - 15,165 - 325 = -150; Roth 9,800 - 9,475 - 400 = -75: -225. The car 8,800 -> 8,700: -100.
  assert.deepEqual(lines(b.total), { surplus: -376.35, timing: 75, saved: 975, 'paid-down': 352.42, market: -225, value: -100 });
  // Explained 31,957.55 - 376.35 + 75 + 975 + 352.42 - 225 - 100 = 32,658.62; actual 31,958.62 + 640 = 32,598.62;
  // -60 not explained.
  assert.deepEqual([b.total.start, b.total.explained, b.total.actual, b.total.unexplained, b.total.ties], [31957.55, 32658.62, 32598.62, -60, false]);
  assert.equal(b.parts.cash, -60);
  // Saved -376.35 + 75 + 975 = 673.65; the change 32,598.62 - 31,957.55 = 641.07.
  assert.equal(b.reading, 'Net worth rose $641. $674 you saved, $225 the market took, $352 of debt paid down, $100 of value lost on things you own. $60 is not explained yet.');
});

test('Riley: the car, next to getting around without it', () => {
  const d = loadHousehold('riley');
  const [car] = owningCosts(d, buildSummary(d, refs), TODAY);
  // Interest: the loan at its latest balance (September 30) 3,237.64 x 6% / 12 = 16.1882, 16.19.
  // Depreciation from its values in the last year: 9,500 (2025-10-31) to 8,400 (2026-09-30), 11 whole months:
  // 1,100 / 11 = 100. Insurance 960 a year = 80; gas 120 (the estimates). No maintenance estimate and no
  // parking line: named, not counted.
  assert.deepEqual(car.parts.map((p) => [p.key, p.amount, p.from]), [['interest', 16.19, 'debt'], ['depreciation', 100, 'values'], ['insurance', 80, 'budget'], ['maintenance', null, null], ['parking', null, null], ['gas', 120, 'budget']]);
  // Never back: 16.19 + 100 + 80 + 120 = 316.19. Equity 8,400 - 3,237.64 = 5,162.36.
  assert.deepEqual([car.value, car.equity, car.neverBack, car.missing], [8400, 5162.36, 316.19, ['Maintenance', 'Parking and tolls']]);
  // Without it: rideshare 200 + transit 100 + an occasional rental 50 = 350.
  assert.equal(car.alternative.amount, 350);
  assert.equal(car.reading, 'The car costs about $316 a month you\'ll never get back (not counting maintenance, parking and tolls). Your trips by Uber, transit and a rental would be about $350.');
});

test('Riley: contributions come from the log and the paycheck, never typed', () => {
  const d = loadHousehold('riley');
  const inc = buildSummary(d, refs).income;
  const c = contributionsFor(d, inc, '2026-03');
  // 401(k): 150 a paycheck x 26 / 12 = 325 from the paycheck. Roth: the 400 moved in on March 28.
  assert.deepEqual([c.byAccount.k401.deductions, c.byAccount.k401.transfers, c.byAccount.roth.transfers, c.byAccount.roth.deductions, c.total], [325, 0, 400, 0, 725]);
  // No account stores a contribution of its own, and typing a balance does not change them.
  assert.ok(d.accounts.every((a) => !Object.keys(a).some((k) => /contribution/i.test(k))));
  setBalance(d, '2026-03', 'roth', 'end', makeValue(9999, { cadence: 'one-off' }));
  assert.deepEqual(contributionsFor(d, inc, '2026-03'), c);
});

// ---- Dana ----

test('Dana: both net worths at the start and end of the year, and at two month ends', () => {
  const d = loadHousehold('dana');
  // October 1, 2025: checking 2,400 + savings 1,200 + 401(k) 6,000 = 9,600, less the Visa 16,000: FI -6,400.
  // The condo 285,000 - the mortgage 240,000 = 45,000 and the car 14,000 (no loan) are locked in: 59,000.
  // Net worth -6,400 + 59,000 = 52,600.
  const start = netWorthAt(d, '2025-10-01');
  assert.deepEqual([start.total, start.fi, start.locked], [52600, -6400, 59000]);
  // October 31: 2,400 + 1,500 + 6,460 = 10,360 - 15,560 = FI -5,200. The condo has no new value yet
  // (285,000); the mortgage 239,500: 45,500. The car 14,000. Locked in 59,500; net worth 54,300.
  const oct = netWorthAt(d, '2025-10-31');
  assert.deepEqual([oct.assetsTotal, oct.debtsTotal, oct.total, oct.fi, oct.locked], [309360, 255060, 54300, -5200, 59500]);
  assert.deepEqual(oct.lockedRows.map((r) => [r.name, r.equity]), [['Condo', 45500], ['Car', 14000]]);
  // March 31, 2026: 2,315 + 3,000 + 8,470 = 13,785 - 13,360 = FI 425. The condo 288,000 - 236,962.24 =
  // 51,037.76; the car 12,800: locked 63,837.76; net worth 425 + 63,837.76 = 64,262.76.
  const mar = netWorthAt(d, '2026-03-31');
  assert.deepEqual([mar.total, mar.fi, mar.locked], [64262.76, 425, 63837.76]);
  // By tier: cash 5,315; through tier 3 + the 401(k): 13,785; all + the condo and car: 314,585.
  assert.deepEqual(mar.byTier, { 1: 5315, 2: 5315, 3: 13785, 4: 314585 });
  assert.deepEqual(mar.debtsByType.map((t) => [t.type, t.amount]), [['credit-card', 13360], ['mortgage', 236962.24]]);
  // September 30, 2026: 2,315 + 4,800 + 11,170 = 18,285 - 10,720 = FI 7,565. The condo 289,000 -
  // 233,832.21 = 55,167.79; the car 11,600. Net worth 7,565 + 55,167.79 + 11,600 = 74,332.79.
  const end = netWorthAt(d, '2026-09-30');
  assert.deepEqual([end.total, end.fi, end.locked], [74332.79, 7565, 66767.79]);
});

test('Dana: FI net worth crosses $0 in March', () => {
  const d = loadHousehold('dana');
  const s = netWorthByMonth(d);
  // FI at each month end: October -5,200; November 11,150 - 15,120 = -3,970; December 11,730 - 14,680 = -2,950;
  // January 12,510 - 14,240 = -1,730; February 12,975 - 13,800 = -825; March 13,785 - 13,360 = 425.
  assert.deepEqual(s.slice(0, 6).map((x) => [x.month, x.fi]), [['2025-10', -5200], ['2025-11', -3970], ['2025-12', -2950], ['2026-01', -1730], ['2026-02', -825], ['2026-03', 425]]);
  // The only milestone: FI net worth crossed $0 in March (net worth was never below $0; FI stays under
  // $10,000; the Visa is still owed, so not debt-free but the mortgage).
  assert.deepEqual(milestones(s).map((m) => [m.key, m.month, m.celebrate]), [['fi-zero', '2026-03', true]]);
});

test('Dana: October\'s net worth bridge (it ties) and February\'s ($85 not explained)', () => {
  const d = loadHousehold('dana');
  const inc = buildSummary(d, refs).income;
  // The budget each month: take-home 4,000 - spending (lines 1,560 + mortgage 1,700 + Visa minimum 250 = 3,510)
  // - the emergency fund 300 = surplus 190.
  // October: start 52,600. Saved 300 + the 401(k) from the paycheck 400 = 700. Paid down: the Visa minimum
  // 250 + the mortgage 240,000 - 239,500 = 500: 750. Market 6,460 - 6,000 - 400 = 60. No new values.
  const oct = netWorthBridge(d, inc, '2025-10');
  assert.deepEqual(lines(oct.total), { surplus: 190, saved: 700, 'paid-down': 750, market: 60 });
  // 52,600 + 190 + 700 + 750 + 60 = 54,300, the October 31 net worth.
  assert.deepEqual([oct.total.start, oct.total.explained, oct.total.actual, oct.total.unexplained], [52600, 54300, 54300, 0]);
  assert.equal(oct.reading, 'Net worth rose $1,700. $890 you saved, $60 the market added, $750 of debt paid down.');
  // FI: -6,400 + 190 + 700 + 250 + 60 = -5,200.
  assert.deepEqual([oct.fi.start, oct.fi.explained, oct.fi.unexplained], [-6400, -5200, 0]);
  // February: start (January 31) 2,400 + 2,400 + 7,710 + the condo 286,500 + the car 13,400 = 312,410,
  // less the Visa 14,240 and the mortgage 237,984.95: 60,185.05.
  // Paid down: 250 + 237,984.95 - 237,474.87 = 510.08: 760.08. Market 7,960 - 7,710 - 400 = -150.
  const feb = netWorthBridge(d, inc, '2026-02');
  assert.deepEqual(lines(feb.total), { surplus: 190, saved: 700, 'paid-down': 760.08, market: -150 });
  // Explained 60,185.05 + 190 + 700 + 760.08 - 150 = 61,685.13. Actual: 2,315 + 2,700 + 7,960 + 286,500 +
  // 13,400 = 312,875, less 13,800 and 237,474.87: 61,600.13. Not explained: -85 (the cash, as in the cash bridge).
  assert.deepEqual([feb.total.start, feb.total.explained, feb.total.actual, feb.total.unexplained, feb.total.ties], [60185.05, 61685.13, 61600.13, -85, false]);
  assert.equal(bridgeFor(d, inc, '2026-02').unexplained, -85);
  // The change 61,600.13 - 60,185.05 = 1,415.08.
  assert.equal(feb.reading, 'Net worth rose $1,415. $890 you saved, $150 the market took, $760 of debt paid down. $85 is not explained yet.');
  // FI: -1,730 + 190 + 700 + 250 - 150 = -740 explained; actual -825; -85.
  assert.deepEqual([feb.fi.start, feb.fi.explained, feb.fi.actual, feb.fi.unexplained], [-1730, -740, -825, -85]);
});

test('Dana: the condo next to renting, and the car', () => {
  const d = loadHousehold('dana');
  const [condo, car] = owningCosts(d, buildSummary(d, refs), TODAY);
  // Interest: the mortgage at its latest balance 233,832.21 x 6% / 12 = 1,169.16105, 1,169.16.
  // Property tax 250 and insurance 60 (the estimates). No maintenance line: Guess 1% of 289,000 / 12 = 240.83.
  // The equity 289,000 - 233,832.21 = 55,167.79 could earn 5% a year: 55,167.79 x 0.05 / 12 = 229.8658, 229.87.
  assert.deepEqual(condo.parts.map((p) => [p.key, p.amount, p.from]), [['interest', 1169.16, 'debt'], ['tax', 250, 'budget'], ['insurance', 60, 'budget'], ['maintenance', 240.83, 'guess'], ['opportunity', 229.87, 'assumption']]);
  // Never back: 1,169.16 + 250 + 60 + 240.83 + 229.87 = 1,949.86.
  assert.deepEqual([condo.equity, condo.neverBack, condo.missing], [55167.79, 1949.86, []]);
  // To hold it: the Housing lines (utilities 140 + insurance 60 + tax 250 = 450) + the payment 1,700 = 2,150.
  // Of the payment, 1,700 - 1,169.16 = 530.84 is principal (it builds equity).
  assert.deepEqual([condo.hold.lines, condo.hold.payment, condo.hold.total, condo.debt.principal], [450, 1700, 2150, 530.84]);
  assert.equal(condo.alternative.amount, 1900);
  assert.equal(condo.reading, 'Owning costs you about $1,950 a month you\'ll never get back. Renting a similar place would be about $1,900.');
  // The car: 13,400 (2025-12-31) to 11,600 (2026-09-30), 9 months: 1,800 / 9 = 200 a month. Insurance 90,
  // maintenance 40, gas 110; no parking line. Never back 200 + 90 + 40 + 110 = 440; no alternative set.
  assert.deepEqual([car.neverBack, car.missing, car.alternative.set], [440, ['Parking and tolls'], false]);
});

// ---- Every household ----

test('FI net worth never includes an asset that does not count, or a debt it secures, any month', () => {
  for (const name of ['riley', 'dana']) {
    const d = loadHousehold(name);
    const acct = (id) => d.accounts.find((a) => a.id === id);
    for (const m of netWorthByMonth(d)) {
      const nw = netWorthAt(d, m.date);
      for (const a of nw.assets.filter((x) => x.fi)) assert.ok(countsForFI(acct(a.id)), name + ' ' + m.month + ' ' + a.name);
      for (const x of nw.debts.filter((y) => y.counts)) assert.ok(!x.securedBy || countsForFI(acct(x.securedBy)), name + ' ' + m.month + ' ' + x.name);
      // And what is left out is exactly the locked-in rows: FI = net worth - their equity.
      const locked = nw.lockedRows.reduce((s, r) => s + r.equity, 0);
      assert.equal(Math.round((nw.total - locked) * 100), Math.round(nw.fi * 100), name + ' ' + m.month);
    }
  }
});

test('the bridge ties for every month of Riley and Dana, with no surprise not-explained amounts', () => {
  // Only the months worked out above as not explained: Riley's June (-60, the ATM cash) and Dana's
  // February (-85). Every other month: 0.
  const off = [];
  for (const name of ['riley', 'dana']) {
    const d = loadHousehold(name);
    const inc = buildSummary(d, refs).income;
    for (const m of balanceMonths(d).filter((x) => x < d.currentMonth)) {
      const b = netWorthBridge(d, inc, m);
      if (b.total.unexplained !== 0) off.push([name, m, b.total.unexplained, b.fi.unexplained]);
    }
  }
  assert.deepEqual(off, [['riley', '2026-06', -60, -60], ['dana', '2026-02', -85, -85]]);
});

test('migration changes no existing number (Riley\'s file from before net worth)', () => {
  const raw = JSON.parse(readFileSync(new URL('./fixtures/riley-schema9.json', import.meta.url), 'utf8'));
  const doc = migrate(raw);
  // Every number in the old file is still there, at the same place.
  const walk = (a, b, path) => {
    if (typeof a === 'number') return assert.equal(b, a, path);
    if (!a || typeof a !== 'object') return;
    for (const k of Object.keys(a)) if (k !== 'schemaVersion') walk(a[k], b === undefined || b === null ? undefined : b[k], path + '.' + k);
  };
  walk(raw, doc, 'doc');
  // And the new fields hold no amounts: tiers and FI from the type, no balances added.
  assert.deepEqual(doc.accounts.map((a) => [a.id, a.tier, a.countsForFI]), [['chk', 1, true], ['sav', 1, true], ['visa', null, true]]);
  assert.deepEqual(Object.keys(doc.balances).sort(), Object.keys(raw.balances).sort());
});
