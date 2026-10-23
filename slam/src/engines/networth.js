// Two net worths (S-111), for any day and every month end. Pure functions; balances come from
// balanceAt (the latest dated balance on or before the day, balances.js).
//
//   Net worth (everything) = every asset - every debt.
//   FI net worth (what can fund your life) = the assets that count toward FI - the debts, leaving
//     out a debt secured by an asset that does not count (the mortgage on the home, the loan on the
//     car). Unsecured debts (cards, student loans, personal, family, buy now pay later) always count.
//   Locked in things you use = net worth - FI net worth, one row per asset that does not count:
//     its value less the debt it secures (home equity, vehicle equity, other).
//
// Empty is not zero: a total with a missing balance is null and the missing ones are named.
// Dollars on a day (balances, not monthly flows), rounded to the cent. Depends on balances.js (balanceAt,
// liabilities), store/schema.js (each type's tier and whether it counts toward FI), paid-ahead.js, and
// money.js (r2).

import { balanceAt, liabilities, lastDayOf, kindOf } from './balances.js';
import { tierOf, countsForFI, typeInfo } from '../store/schema.js';
import { paidAheadAt } from './paid-ahead.js';
import { r2 } from './money.js';

const sum = (xs) => r2(xs.reduce((a, x) => a + x, 0));
// The total of some rows, or null when any of them has no balance.
const total = (rows) => (rows.some((r) => r.amount === null) ? null : sum(rows.map((r) => r.amount)));

export const LABELS = {
  total: 'Net worth (everything)',
  fi: 'FI net worth (what can fund your life)',
  locked: 'Locked in things you use'
};
export const EXPLAIN = {
  total: 'Everything you have, less everything you owe.',
  fi: 'What could pay for your life: money and investments, less the debts that are not tied to a home or car.',
  locked:
    'The part of your net worth in things you live in and use, like a home or a car. It counts, but it cannot pay a bill.'
};

/**
 * Both net worths on one day, with every asset and debt that went into them.
 * get(key) gives one account's or debt's balance; by default the latest dated one on the day.
 * paDate: the day Paid ahead is read on (S-119); the bridge reads a month's start on the day before it.
 * @param {object} doc the household file
 * @param {string} date 'YYYY-MM-DD'
 * @param {function(string): ?object} [get] key => { amount, status, date, from } in dollars, or null
 * @param {string} [paDate=date] 'YYYY-MM-DD'
 * @returns {object} { date, assets, debts, total, fi, locked, lockedRows, assetsTotal, debtsTotal, byTier,
 *   debtsByType, byKind, missing }: dollars; a total is null while any of its balances is missing
 */
export function netWorthAt(doc, date, get = (key) => balanceAt(doc, key, date), paDate = date) {
  // Cards (kind 'owed') are not assets; they come in below as liabilities.
  const accts = (doc.accounts || []).filter((a) => a.state !== 'archived' && kindOf(a) !== 'owed');
  const assets = accts.map((a) => {
    const b = get(a.id);
    return {
      id: a.id,
      name: a.name,
      type: a.type,
      kind: kindOf(a),
      tier: tierOf(a),
      fi: countsForFI(a),
      amount: b ? b.amount : null,
      status: b ? b.status : null,
      asOf: b ? b.date : null,
      from: b ? b.from : null
    };
  });
  // Paid ahead (S-119): computed from the log, one row per line; tier 4, not counted toward FI.
  for (const p of paidAheadAt(doc, paDate))
    assets.push({
      id: 'paid-ahead:' + p.lineId,
      name: 'Paid ahead: ' + p.name,
      type: 'paid-ahead',
      kind: 'prepaid',
      tier: 4,
      fi: false,
      amount: p.amount,
      status: 'computed',
      asOf: paDate,
      from: 'computed',
      computed: true
    });
  // Each debt secured by an asset belongs to the first asset that names it.
  const securedBy = {};
  for (const a of accts) if (a.securedDebtId && !securedBy[a.securedDebtId]) securedBy[a.securedDebtId] = a;
  const debts = liabilities(doc).map((l) => {
    const b = get(l.key);
    const by = l.debtId ? securedBy[l.debtId] || null : null;
    // counts: toward FI. A debt secured by an asset that does not count (the mortgage on the home) is left out with it.
    return {
      key: l.key,
      name: l.name,
      debtType: l.debtType,
      debtId: l.debtId,
      amount: b ? b.amount : null,
      status: b ? b.status : null,
      asOf: b ? b.date : null,
      securedBy: by ? by.id : null,
      counts: !(by && !countsForFI(by))
    };
  });
  const fiAssets = assets.filter((a) => a.fi);
  const fiDebts = debts.filter((d) => d.counts);
  const totalNW = total(assets) === null || total(debts) === null ? null : r2(total(assets) - total(debts));
  const fiNW = total(fiAssets) === null || total(fiDebts) === null ? null : r2(total(fiAssets) - total(fiDebts));
  // Locked in: each asset that does not count, less the debts it secures.
  const lockedRows = assets
    .filter((a) => !a.fi)
    .map((a) => {
      const owed = debts.filter((d) => d.securedBy === a.id && !d.counts);
      const debt = total(owed);
      return {
        id: a.id,
        name: a.name,
        type: a.type,
        value: a.amount,
        debt: owed.length ? debt : 0,
        debtNames: owed.map((d) => d.name),
        equity: a.amount === null || debt === null ? null : r2(a.amount - (owed.length ? debt : 0))
      };
    });
  // byTier is cumulative: tier 1 is cash, 2 adds brokerage and the like, 3 adds retirement, 4 adds things you
  // use and paid ahead, so byTier[4] is every asset.
  const tierSum = (max) => total(assets.filter((a) => a.tier <= max));
  const types = [...new Set(debts.map((d) => d.debtType))];
  return {
    date,
    assets,
    debts,
    total: totalNW,
    fi: fiNW,
    locked: totalNW === null || fiNW === null ? null : r2(totalNW - fiNW),
    lockedRows,
    assetsTotal: total(assets),
    debtsTotal: total(debts),
    byTier: { 1: tierSum(1), 2: tierSum(2), 3: tierSum(3), 4: tierSum(4) },
    debtsByType: types.map((t) => ({
      type: t,
      amount: total(debts.filter((d) => d.debtType === t)),
      count: debts.filter((d) => d.debtType === t).length
    })),
    byKind: ['cash', 'invested', 'valued', 'prepaid'].map((k) => ({
      kind: k,
      amount: total(assets.filter((a) => a.kind === k))
    })),
    missing: [
      ...assets.filter((a) => a.amount === null).map((a) => a.name),
      ...debts.filter((d) => d.amount === null).map((d) => d.name)
    ]
  };
}

/**
 * The months with any balance, from the first one to the month being worked on.
 * @param {object} doc the household file
 * @returns {Array<string>} consecutive months 'YYYY-MM', from the first with a balance to the later of the
 *   last with one and the month being worked on; empty with no balances at all
 */
export function balanceMonths(doc) {
  const keys = Object.keys(doc.balances || {})
    .filter((k) => /^\d{4}-\d{2}$/.test(k))
    .sort();
  if (!keys.length) return [];
  const out = [];
  let [y, m] = keys[0].split('-').map(Number);
  const last = doc.currentMonth > keys[keys.length - 1] ? doc.currentMonth : keys[keys.length - 1];
  for (;;) {
    const k = y + '-' + String(m).padStart(2, '0');
    out.push(k);
    if (k >= last) break;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/**
 * Both net worths at every month end (the last day of each month).
 * @param {object} doc the household file
 * @returns {Array<object>} per month { month, date, total, fi, locked, assets, debts, nonMortgageDebt, byKind,
 *   byTier }: dollars on the month's last day, null where a balance is missing
 */
export function netWorthByMonth(doc) {
  return balanceMonths(doc).map((month) => {
    const nw = netWorthAt(doc, lastDayOf(month));
    return {
      month,
      date: nw.date,
      total: nw.total,
      fi: nw.fi,
      locked: nw.locked,
      assets: nw.assetsTotal,
      debts: nw.debtsTotal,
      nonMortgageDebt: total(nw.debts.filter((d) => d.debtType !== 'mortgage')),
      byKind: nw.byKind,
      byTier: nw.byTier
    };
  });
}

/**
 * From the first month end with both net worths to the last: how much each changed.
 * @param {Array<object>} series what netWorthByMonth returns
 * @returns {?{from: string, to: string, total: number, fi: number}} months 'YYYY-MM' and dollars; null with
 *   fewer than two month ends where both are known
 */
export function seriesChange(series) {
  const known = series.filter((x) => x.total !== null && x.fi !== null);
  if (known.length < 2) return null;
  const a = known[0];
  const b = known[known.length - 1];
  return { from: a.month, to: b.month, total: r2(b.total - a.total), fi: r2(b.fi - a.fi) };
}

// The dollar lines for the FI net worth milestones.
export const FI_STEPS = [10000, 25000, 50000, 100000];
/**
 * Milestones (S-111): events with dates, never grades. Each is the first month end where it is true
 * after a month end where it was not (a series that starts past a line has no event for it: we do
 * not know when it happened).
 * @param {Array<object>} series what netWorthByMonth returns
 * @returns {Array<{key: string, label: string, month: string, date: string, celebrate: boolean}>} oldest first
 */
export function milestones(series) {
  const out = [];
  // A month with no number is null, neither false nor true, so a gap in the balances never fakes a crossing.
  const first = (key, label, test, celebrate) => {
    for (let i = 1; i < series.length; i++) {
      const a = series[i - 1];
      const b = series[i];
      if (test(a) === false && test(b) === true) {
        out.push({ key, label, month: b.month, date: b.date, celebrate: !!celebrate });
        return;
      }
    }
  };
  const known = (k, f) => (x) => (x[k] === null ? null : f(x[k]));
  first(
    'fi-zero',
    'FI net worth crossed $0',
    known('fi', (v) => v >= 0),
    true
  );
  first(
    'total-zero',
    'Net worth crossed $0',
    known('total', (v) => v >= 0),
    true
  );
  for (const n of FI_STEPS)
    first(
      'fi-' + n,
      'First $' + n.toLocaleString('en-US') + ' of FI net worth',
      known('fi', (v) => v >= n)
    );
  first(
    'debt-free',
    'Debt-free except the mortgage',
    known('nonMortgageDebt', (v) => v <= 0)
  );
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * The label for an account type; 'paid-ahead' is the paid-ahead row (paid-ahead.js), not a stored type.
 * @param {string} type an account type from store/schema.js, or 'paid-ahead'
 * @returns {string} the type's label from ACCOUNT_TYPE_INFO (the "other" label for an unknown type)
 */
export const typeLabel = (type) => (type === 'paid-ahead' ? 'Paid ahead' : typeInfo({ type }).label);
