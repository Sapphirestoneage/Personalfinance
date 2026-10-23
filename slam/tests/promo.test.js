// Dana's 0% promo ends (S-127), by hand. Her Visa is 24.99% with 0% until May 31, 2026; she pays 440 a
// month throughout. tools/dana.mjs works the balances out step by step; every number below is from there
// or worked out here, never from running the code. Uses the summary, bridge, net worth bridge, debts and
// calendar engines, and the helpers, which load the reference data in src/data and the Dana demo
// household in src/data/households.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRefs, loadHousehold } from './helpers.js';
import { buildSummary } from '../src/engines/summary.js';
import { bridgeFor } from '../src/engines/bridge.js';
import { netWorthBridge } from '../src/engines/networth-bridge.js';
import { cardInterest, promoEnded, promoWarnings } from '../src/engines/debts.js';
import { cashCalendar } from '../src/engines/calendar.js';

const refs = loadRefs();
const lines = (b) => Object.fromEntries(b.lines.map((l) => [l.key, l.amount]));
const visa = (d) => d.debts.find((x) => x.id === 'debt-visa');

test('Dana: no interest through May, then 24.99% from June', () => {
  const d = loadHousehold('dana');
  // May is still the promo (May 31 is its last day): 0. June: the balance going in, May's end 12,480 x 24.99 /
  // 1,200 = 259.896, 259.90. July 256.15, August 252.32, September 248.41, October 244.42 (tools/dana.mjs).
  const at = (m) => cardInterest(d, visa(d), m).amount;
  assert.deepEqual(
    ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'].map(at),
    [0, 259.9, 256.15, 252.32, 248.41, 244.42]
  );
  // June is the first month after the promo, and only June.
  assert.deepEqual(
    promoEnded(d, '2026-06').map((x) => [x.debt.label, x.promoApr, x.interest.amount]),
    [['Visa', 0, 259.9]]
  );
  assert.deepEqual([promoEnded(d, '2026-05').length, promoEnded(d, '2026-07').length], [0, 0]);
});

test('Dana: June in the cash bridge and the net worth bridge (both tie)', () => {
  const d = loadHousehold('dana');
  const inc = buildSummary(d, refs).income;
  // Cash bridge. Surplus: 4,000 - (3,510 + interest 259.90) - 300 = -69.90. Set aside 300 (the emergency fund,
  // still in savings). The Visa 12,480 to 12,299.90: -180.10. Its minimum in the budget +250.
  // Explained -69.90 + 300 - 180.10 + 250 = 300 = the actual change: checking 2,315 to 2,315, savings 3,600 to 3,900.
  const br = bridgeFor(d, inc, '2026-06');
  const c = (x) => Math.round(x * 100) / 100;
  assert.deepEqual(
    [c(br.surplus), br.steps.map((s) => [s.key, s.amount]), br.explained, br.actual, br.ties],
    [
      -69.9,
      [
        ['set-aside', 300],
        ['cards', -180.1],
        ['card-min', 250]
      ],
      300,
      300,
      true
    ]
  );
  assert.match(br.steps.find((s) => s.key === 'cards').from, /includes Visa interest \$259\.90 charged/);
  // Net worth bridge. Start (May 31): 2,315 + 3,600 + 9,450 + the condo 288,000 + the car 12,800 = 316,165, less
  // the Visa 12,480 and the mortgage 235,929.29 = 67,755.71. Surplus -69.90; saved 300 + 400 = 700; paid down
  // 250 + (235,929.29 - 235,408.94 = 520.35) = 770.35; market 9,790 - 9,450 - 400 = -60; value: the condo
  // +2,000, the car -600 = +1,400. Explained 67,755.71 - 69.90 + 700 + 770.35 - 60 + 1,400 = 70,496.16.
  // Actual June 30: 2,315 + 3,900 + 9,790 + 290,000 + 12,200 = 318,205 - 12,299.90 - 235,408.94 = 70,496.16.
  const nw = netWorthBridge(d, inc, '2026-06');
  assert.deepEqual(lines(nw.total), { surplus: -69.9, saved: 700, 'paid-down': 770.35, market: -60, value: 1400 });
  assert.deepEqual(
    [nw.total.start, nw.total.explained, nw.total.actual, nw.total.unexplained],
    [67755.71, 70496.16, 70496.16, 0]
  );
  assert.match(nw.total.lines.find((l) => l.key === 'surplus').from, /spends card interest: Visa \$259\.90/);
});

test('Dana: Month in review for June says so', () => {
  const d = loadHousehold('dana');
  // Saved with the month when it was closed (the snapshot's review).
  const review = (key) => d.months.find((m) => m.key === key).snapshot.review;
  assert.equal(review('2026-06').readings[0], 'Your 0% promo ended. Interest this month: $259.90.');
  assert.ok(!review('2026-07').readings.some((r) => r.includes('promo')));
});

test("Dana: the calendar shows October's interest on the card, on its due day", () => {
  const d = loadHousehold('dana');
  // Due the 20th: 244.42 charged to the Visa (what is owed goes up), checking untouched.
  const cal = cashCalendar(d, buildSummary(d, refs).income, { today: '2026-10-17', horizon: 30 });
  const day = cal.days.find((x) => x.date === '2026-10-20');
  const it = day.items.find((i) => i.kind === 'interest');
  assert.deepEqual([it.name, it.flow, it.cash, it.account], ['Visa interest (computed)', -244.42, false, 'visa']);
});

test('Dana: the Next card warns 60 days before the promo ends', () => {
  const d = loadHousehold('dana');
  // April 1, 2026 to May 31: 29 days left in April + 31 in May = 60. Still on it: the latest balance, March's
  // end, 13,360. March 31 is 61 days out: no warning yet. On June 1 the promo is over: none.
  assert.deepEqual(
    promoWarnings(d, '2026-04-01').map((x) => [x.debt.label, x.ends, x.days, x.balance]),
    [['Visa', '2026-05-31', 60, 13360]]
  );
  assert.deepEqual([promoWarnings(d, '2026-03-31').length, promoWarnings(d, '2026-06-01').length], [0, 0]);
});
