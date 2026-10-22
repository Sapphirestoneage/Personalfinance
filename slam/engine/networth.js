// Balance sheet: cash, invested assets, total assets, debts, net worth.

import { valueOf, tracker, round2 } from './spine.js';
import { INVESTED_FAMILIES } from './schema.js';
import { debtTotals } from './debt.js';

function sumBalances(accounts, keep) {
  const t = tracker();
  let sum = 0;
  for (const a of accounts) if (keep(a)) { const b = t.useFact('accounts.' + a.id + '.balance', a.balance); if (b !== null) sum += b; }
  return t.out(round2(sum));
}

export function balanceSheet(spine) {
  const acc = spine.accounts || [];
  const cash = sumBalances(acc, (a) => a.family === 'cash');
  const invested = sumBalances(acc, (a) => INVESTED_FAMILIES.includes(a.family));
  const assets = sumBalances(acc, () => true);
  const { total: debts, cards } = debtTotals(spine);
  const t = tracker();
  t.absorb(assets); t.absorb(debts);
  return {
    cash, invested, assets, debts, cards,
    netWorth: t.out(round2(assets.value - debts.value)),
    byFamily: Object.fromEntries([...new Set(acc.map((a) => a.family))].map((f) => [f, sumBalances(acc, (a) => a.family === f)]))
  };
}

