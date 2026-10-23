// Hand-computed expected answers for Jordan, the transaction-import demo household: what the
// CSV import, the kind classifier, the detections and the chart data (top merchants, day of
// week, size vs count) must produce. Read by tests/transactions.test.js. The sources are
// jordan.json and the two exports beside it, a Chase credit card export (jordan-chase.csv) and
// a generic checking export (jordan-checking.csv).

// KINDS (30 rows): card payments 3 (two "Payment Thank You", one "CRD AUTOPAY"),
// transfer 1 (to savings), income 4 (payroll), reimbursements 2 (Venmo from Alex,
// Acme expense reimbursement), refund 1 (Amazon return), fees 2 (late fee, ATM fee), spend 17.

// SEPTEMBER ACTUALS FROM TRANSACTIONS (double counting removed)
// groceries:     Whole Foods 95.60 + Trader Joe's 61.30 + 61.30 (likely duplicate, kept until removed) = 218.20 (3)
// subscriptions: Netflix 17.99 + Spotify 11.99 = 29.98 (2)
// gas:           Shell 45.00 + 38.00 = 83.00 (2)
// eating-out:    Chipotle 32.00 - Venmo from Alex 16.00 (learned mapping) = 16.00 (2)
// shopping:      Amazon 120.00 - return 40.00 = 80.00 (2)
// fee-late 39.00 (1); fee-atm 3.00 (1)
// Not counted: card payments 700 + 700 (both sides), transfer 300, payroll, Acme reimbursement 85 (not mapped).
// Unmapped purchases: Affirm 50.00 (1)
// AUGUST: groceries 82.40 + 54.10 = 136.50; subscriptions 15.49 + 0.00 = 15.49; gas 40.00; eating-out 14.25; unmapped Affirm 50.00

// DETECTIONS
// Subscriptions: Netflix (Aug 3 and Sep 3, 31 days apart, 15.49 -> 17.99 is within 20%) = 17.99 x 12 = 215.88 a year;
//   Spotify (trial that converted) = 11.99 x 12 = 143.88. Total 359.76.
//   Not subscriptions: Shell and Whole Foods (more than one charge in a month), Chipotle (amount changed > 20%),
//   Affirm (buy now, pay later, flagged separately).
// Price creep: Netflix 15.49 -> 17.99 = +2.50 a month, +30.00 a year.
// Free trial converted: Spotify 0.00 on Aug 12, then 11.99 on Sep 11 (30 days later).
// Likely duplicate: Trader Joe's 61.30 twice on Sep 13.
// Fees: 39.00 + 3.00 = 42.00. Buy now, pay later: Affirm 50.00 x 2 = 100.00.

// TOP MERCHANTS (purchases + fees - refunds, both months)
// Whole Foods 82.40 + 54.10 + 95.60 = 232.10; Shell 40 + 45 + 38 = 123.00; Trader Joe's 122.60;
// Affirm 100.00; Amazon 120 - 40 = 80.00; then Chipotle 46.25, late fee 39.00, Netflix 33.48, Spotify 11.99, ATM fee 3.00
// Total = 791.42. Shares: 232.10/791.42 = 0.293270; 123/791.42 = 0.155417; 122.60/791.42 = 0.154911;
// 100/791.42 = 0.126355; 80/791.42 = 0.101084. Top 5 together 657.70/791.42 = 0.831038

// WEEKDAYS (purchases and fees only; Aug 1 2026 is a Saturday)
// Mon: Netflix Aug 3 15.49
// Tue: ATM fee Sep 29 3.00
// Wed: Whole Foods Aug 5 82.40 + Spotify Aug 12 0 + Whole Foods Aug 19 54.10 + Whole Foods Sep 2 95.60 = 232.10
// Thu: Affirm Aug 20 50 + Netflix Sep 3 17.99 + late fee Sep 24 39 = 106.99
// Fri: Spotify Sep 11 11.99 + Amazon Sep 18 120 = 131.99
// Sat: Chipotle Aug 15 14.25 + Chipotle Sep 12 32 = 46.25
// Sun: Shell Aug 9 40 + Shell Sep 6 45 + Trader Joe's Sep 13 122.60 + Shell Sep 20 38 + Affirm Sep 20 50 = 295.60
// Total 831.42; weekend 46.25 + 295.60 = 341.85; weekday 489.57; weekend share 341.85/831.42 = 0.411164
// Per day: weekend 341.85/2 = 170.93; weekday 489.57/5 = 97.91

// SIZE VS COUNT: Shell 3 charges, average 41.00; Trader Joe's 2, average 61.30; Whole Foods 3, average 232.10/3 = 77.37

export default {
  count: 30,
  kinds: { 'card-payment': 3, transfer: 1, income: 4, reimbursement: 2, refund: 1, fee: 2, spend: 17 },
  september: {
    groceries: 218.2,
    subscriptions: 29.98,
    gas: 83.0,
    'eating-out': 16.0,
    shopping: 80.0,
    'fee-late': 39.0,
    'fee-atm': 3.0
  },
  septemberCounts: {
    groceries: 3,
    subscriptions: 2,
    gas: 2,
    'eating-out': 2,
    shopping: 2,
    'fee-late': 1,
    'fee-atm': 1
  },
  septemberUnmapped: [50.0, 1],
  august: { groceries: 136.5, subscriptions: 15.49, gas: 40.0, 'eating-out': 14.25 },
  subscriptions: [
    ['NETFLIX.COM', 215.88],
    ['SPOTIFY USA', 143.88]
  ],
  subscriptionsYearly: 359.76,
  priceCreep: [['NETFLIX.COM', 15.49, 17.99, 2.5, 30.0]],
  trials: [['SPOTIFY USA', '2026-08-12', '2026-09-11', 11.99]],
  duplicates: [['TRADER JOE S', '2026-09-13', 61.3]],
  feesTotal: 42.0,
  bnplTotal: 100.0,
  topTotal: 791.42,
  top: [
    ['WHOLE FOODS MARKET', 232.1, 0.29327],
    ['SHELL OIL', 123.0, 0.155417],
    ['TRADER JOE S', 122.6, 0.154911],
    ['AFFIRM PAYMENT', 100.0, 0.126355],
    ['AMAZON MKTPLACE PMTS', 80.0, 0.101084]
  ],
  topShare: 0.831038,
  weekdays: [15.49, 3.0, 232.1, 106.99, 131.99, 46.25, 295.6],
  weekdayTotal: 831.42,
  weekend: 341.85,
  weekday: 489.57,
  weekendShare: 0.411164,
  perWeekendDay: 170.93,
  perWeekday: 97.91,
  sizeVsCount: { 'SHELL OIL': [3, 41.0], 'TRADER JOE S': [2, 61.3], 'WHOLE FOODS MARKET': [3, 77.37] },
  // Food's September actual as budgetModel reads it from the log: groceries 218.20 + eating out 16.00 = 234.20.
  // The key's name dates from the confirm step that S-087 removed; there is no apply step now.
  foodActualAfterApplying: 234.2
};
