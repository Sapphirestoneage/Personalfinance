// Balance sheet: cash, invested assets, total assets, debts, net worth.

import { valueOf, tracker, round2 } from './spine.js';
import { INVESTED_FAMILIES, isEarmarked } from './schema.js';
import { debtTotals } from './debt.js';
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
// { value, kind, ..., items: [{ id, name, amount, part }] }: part 'all' or 'contributions'. A blank balance (or a Roth's
// blank basis) leaves the total incomplete, never $0.
export function liquidAssets(spine) {
  const t = tracker();
  const items = [];
  let sum = 0;
  for (const a of spine.accounts || []) {
    const base = 'accounts.' + a.id;
    const own = a.liquid ? t.useFact(base + '.liquid', a.liquid) : null;
    const how = own === true ? 'all' : own === false ? 'none' : liquidDefault(a);
    if (how === 'none') continue;
    const bal = t.useFact(base + '.balance', a.balance);
    let amount = bal;
    if (how === 'basis') { const basis = t.useFact(base + '.basis', a.basis); amount = bal === null || basis === null ? null : Math.min(bal, Math.max(0, basis)); }
    if (amount !== null) sum += amount;
    items.push({ id: a.id, name: valueOf(a.name) || a.id, amount, part: how === 'basis' ? 'contributions' : 'all', path: base + '.balance' });
  }
  return { ...t.out(round2(sum)), items };
}

export function balanceSheet(spine) {
  const acc = spine.accounts || [];
  // Cash is money the household can fall back on: an account set aside for a goal is not (S-228); it is still an asset.
  const cash = sumBalances(acc, (a) => a.family === 'cash' && !isEarmarked(a));
  const setAside = sumBalances(acc, isEarmarked);
  const list = earmarks(spine);
  const invested = sumBalances(acc, (a) => INVESTED_FAMILIES.includes(a.family));
  const assets = sumBalances(acc, () => true);
  const { total: debts, cards } = debtTotals(spine);
  const t = tracker();
  t.absorb(assets); t.absorb(debts);
  const liquid = liquidAssets(spine);
  const lt = tracker();
  lt.absorb(liquid); lt.absorb(debts);
  return {
    liquid, liquidNetWorth: lt.out(round2(liquid.value - debts.value)),
    cash, setAside, earmarks: list, setAsideNote: setAsideNote(list), invested, assets, debts, cards,
    netWorth: t.out(round2(assets.value - debts.value)),
    byFamily: Object.fromEntries([...new Set(acc.map((a) => a.family))].map((f) => [f, sumBalances(acc, (a) => a.family === f)]))
  };
}

