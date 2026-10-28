// Balance sheet: cash, invested assets, total assets, debts, net worth.

import { valueOf, tracker, round2 } from './spine.js';
import { INVESTED_FAMILIES, isEarmarked } from './schema.js';
import { debtTotals } from './debt.js';
import { owedTotal } from './owed.js';
import { money } from '../src/ui/format.js';
import { listWords } from './labels.js';

// The goal an earmarked account is for (S-228): a goal that links the account, else the account's own "goal it funds"
// (a goal's id or its name), else none. The words say it the same way on every page.
export function setAsideFor(spine, a) {
  const goals = spine.goals || [];
  // Every goal that links the account, sinking funds first: "Surgery fund and Recovery travel".
  const linked = goals.filter((g) => valueOf(g.linkedAccount) === a.id).sort((x, y) => (valueOf(y.sinkingFund) === true) - (valueOf(x.sinkingFund) === true));
  if (linked.length) return listWords(linked.map((g) => g.label || g.id));
  const own = valueOf(a.linkedGoal);
  const named = own ? goals.find((g) => g.id === own) : null;
  return named ? named.label || named.id : own || null;
}
export const setAsideWords = (goal) => 'set aside for ' + (goal || 'a goal');
// The one sentence every page uses for them, or null when nothing is set aside: "Not counted as cash: Surgery fund,
// $4,000 set aside for Knee surgery." A blank balance reads missing, never $0.
export function setAsideNote(list) {
  if (!list || !list.length) return null;
  return 'Not counted as cash: ' + list.map((x) => x.name + ', ' + (x.balance === null || x.balance === undefined ? 'balance missing,' : money(x.balance)) + ' ' + x.words).join('; ') + '.';
}
// Every earmarked account, with its goal and balance (null when no balance is entered: missing, never $0).
export function earmarks(spine) {
  return (spine.accounts || []).filter(isEarmarked).map((a) => {
    const goal = setAsideFor(spine, a);
    return { id: a.id, name: valueOf(a.name) || a.id, goal, words: setAsideWords(goal), balance: valueOf(a.balance), path: 'accounts.' + a.id + '.balance' };
  });
}

function sumBalances(accounts, keep) {
  const t = tracker();
  let sum = 0;
  for (const a of accounts) if (keep(a)) { const b = t.useFact('accounts.' + a.id + '.balance', a.balance); if (b !== null) sum += b; }
  return t.out(round2(sum));
}

// Liquid (Batch 3): money that can be reached without a penalty or a sale of something you live with. By default cash,
// taxable investing and short Treasury bills are liquid, and a Roth IRA's contributions (its basis, never more than the
// balance); pre-tax accounts, a Roth's earnings, an HSA, education accounts, a car and a home are not. An account's own
// "counted as liquid" yes or no overrides the default, for the whole balance.
const ROTH_IRAS = ['roth_ira', 'custodial_roth'];
export function liquidDefault(a) {
  if (a.family === 'cash' || a.family === 'taxable') return 'all';
  if (a.family === 'fixedTerm') return a.liquidity && ['instant', 'days'].includes(valueOf(a.liquidity) ?? a.liquidity) ? 'all' : 'none';
  if (ROTH_IRAS.includes(a.type)) return 'basis';
  return 'none';
}
// { value, kind, ..., items: [{ id, name, amount, part }], defaults: { <account id>: 'all' | 'basis' | 'none' } }: part 'all' or 'contributions'. A blank balance (or a Roth's
// blank basis) leaves the total incomplete, never $0.
export function liquidAssets(spine) {
  const t = tracker();
  const items = [], defaults = {};
  let sum = 0;
  for (const a of spine.accounts || []) {
    const base = 'accounts.' + a.id;
    defaults[a.id] = liquidDefault(a);
    const own = a.liquid ? t.useFact(base + '.liquid', a.liquid) : null;
    const how = own === true ? 'all' : own === false ? 'none' : liquidDefault(a);
    if (how === 'none') continue;
    const bal = t.useFact(base + '.balance', a.balance);
    let amount = bal;
    if (how === 'basis') { const basis = basisOf(t, a, base); amount = bal === null || basis === null ? null : Math.min(bal, Math.max(0, basis)); }
    if (amount !== null) sum += amount;
    items.push({ id: a.id, name: valueOf(a.name) || a.id, amount, part: how === 'basis' ? 'contributions' : 'all', path: base + '.balance' });
  }
  return { ...t.out(round2(sum)), items, defaults };
}

// Unvested employer money (S-272): the part of a workplace plan's employer money that is not yours yet, on its own line
// with the date it vests, and out of total and invested assets (so out of net worth) until then. A cliff vests all at
// once after the years; graded vests evenly over them (the house's simple reading; a plan's own table may differ).
// { id, name, amount (null when the employer part is not given), vestsOn, path } or null when nothing is unvested.
const addYears = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + Math.round(n * 12)); return d.toISOString().slice(0, 10); };
export function unvestedOf(a, asOf) {
  if (!a || a.family !== 'employerRetirement' || (a.ticks && a.ticks.vesting === 'no')) return null;
  const type = valueOf(a.vestingType), years = valueOf(a.vestingYears), served = valueOf(a.yearsOfService) ?? 0;
  if (!type || type === 'immediate' || typeof years !== 'number' || years <= 0 || served >= years) return null;
  const share = type === 'cliff' ? 1 : Math.max(0, 1 - served / years), emp = valueOf(a.employerBalance);
  return { id: a.id, name: valueOf(a.name) || a.id, amount: emp === null ? null : round2(emp * share), share, vestsOn: addYears(asOf, years - served), path: 'accounts.' + a.id + '.employerBalance' };
}
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// The one sentence every page uses: "Not yours yet: Work 401(k), $2,000 of your employer's money until Mar 2028. Not
// counted in net worth until then." Null when nothing is unvested.
export function unvestedNote(u) {
  if (!u || !u.items.length) return null;
  return 'Not yours yet: ' + u.items.map((i) => i.name + ', ' + (i.amount === null ? 'the employer\'s part (amount not given)' : money(i.amount) + ' of your employer\'s money') + ' until ' + MON[+i.vestsOn.slice(5, 7) - 1] + ' ' + i.vestsOn.slice(0, 4)).join('; ') + '. Not counted in net worth until then.';
}
export function unvestedTotal(spine) {
  const items = (spine.accounts || []).map((a) => unvestedOf(a, spine.meta.asOf)).filter(Boolean);
  return { value: round2(items.reduce((x, i) => x + (i.amount || 0), 0)), items, missing: items.filter((i) => i.amount === null).map((i) => i.path) };
}

export function balanceSheet(spine) {
  const acc = spine.accounts || [];
  // Cash is money the household can fall back on: an account set aside for a goal is not (S-228); it is still an asset.
  const cash = sumBalances(acc, (a) => a.family === 'cash' && !isEarmarked(a));
  const setAside = sumBalances(acc, isEarmarked);
  const list = earmarks(spine);
  // Unvested employer money is not counted until it vests (S-272): out of invested and total assets, on its own line.
  const unvested = unvestedTotal(spine);
  const less = (r) => (unvested.value && r.value !== null ? { ...r, value: round2(r.value - unvested.value) } : r);
  const invested = less(sumBalances(acc, (a) => INVESTED_FAMILIES.includes(a.family)));
  const assets = less(sumBalances(acc, () => true));
  const { total: debts, cards } = debtTotals(spine);
  // Owed to you (shared bills, money lent): part of net worth, never cash, so not in the liquid figure, the runway or
  // safe to spend until it is marked paid and lands in an account.
  const owed = owedTotal(spine, spine.meta.asOf);
  const t = tracker();
  t.absorb(assets); t.absorb(debts);
  const liquid = liquidAssets(spine);
  const lt = tracker();
  lt.absorb(liquid); lt.absorb(debts);
  return {
    liquid, liquidNetWorth: lt.out(round2(liquid.value - debts.value)),
    cash, setAside, earmarks: list, setAsideNote: setAsideNote(list), invested, assets, unvested, unvestedNote: unvestedNote(unvested), debts, cards,
    owed, netWorth: t.out(round2(assets.value - debts.value + owed)),
    byFamily: Object.fromEntries([...new Set(acc.map((a) => a.family))].map((f) => [f, sumBalances(acc, (a) => a.family === f)]))
  };
}


// The money put in (owner's ask, 2026-10-27): the contributions by year when that list has any, else the one basis
// typed (a Roth's basis, a brokerage's cost basis). Rollovers and conversions are not counted here; they have their
// own rules. One formula for every screen that reads a basis.
const BASIS_FIELD = (a) => (a.family === 'taxable' ? 'costBasis' : 'basis');
export function basisOf(t, a, base = 'accounts.' + a.id) {
  const list = a.contributions ? t.useFact(base + '.contributions', a.contributions) : null;
  const counted = Array.isArray(list) ? list.filter((c) => c && typeof c.amount === 'number' && !['rollover', 'conversion'].includes(c.kind)) : [];
  if (counted.length) return round2(counted.reduce((x, c) => x + c.amount, 0));
  const f = a[BASIS_FIELD(a)];
  return f ? t.useFact(base + '.' + BASIS_FIELD(a), f) : null;
}
export const basisFromList = (a) => Array.isArray(valueOf(a.contributions)) && valueOf(a.contributions).some((c) => c && typeof c.amount === 'number');
