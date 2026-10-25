// Balance sheet: cash, invested assets, total assets, debts, net worth.

import { valueOf, tracker, round2 } from './spine.js';
import { INVESTED_FAMILIES, isEarmarked } from './schema.js';
import { debtTotals } from './debt.js';
import { money } from '../src/ui/format.js';

// The goal an earmarked account is for (S-228): a goal that links the account, else the account's own "goal it funds"
// (a goal's id or its name), else none. The words say it the same way on every page.
export function setAsideFor(spine, a) {
  const goals = spine.goals || [];
  const linked = goals.find((g) => valueOf(g.linkedAccount) === a.id && valueOf(g.sinkingFund) === true) || goals.find((g) => valueOf(g.linkedAccount) === a.id);
  const own = valueOf(a.linkedGoal);
  const named = linked || (own ? goals.find((g) => g.id === own) : null);
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
  return {
    cash, setAside, earmarks: list, setAsideNote: setAsideNote(list), invested, assets, debts, cards,
    netWorth: t.out(round2(assets.value - debts.value)),
    byFamily: Object.fromEntries([...new Set(acc.map((a) => a.family))].map((f) => [f, sumBalances(acc, (a) => a.family === f)]))
  };
}

