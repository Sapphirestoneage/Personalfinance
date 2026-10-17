// Breaking a Rough number into sub-categories, and debts by type.

import { linkedCardBalance } from './balances.js';
import { toMonthly } from './normalize.js';
import { sumKnown } from './money.js';

// Ideas for sub-categories not already a line in the category (any case).
export function lineIdeas(doc, refs) {
  const ideas = (refs.subcategoryIdeas && refs.subcategoryIdeas.ideas) || {};
  const out = {};
  for (const c of doc.categories) {
    const have = new Set(c.lines.filter((l) => l.state !== 'archived').map((l) => l.name.toLowerCase()));
    out[c.id] = (ideas[c.type] || []).filter((n) => !have.has(n.toLowerCase()));
  }
  return out;
}

// Debts grouped by type: how many, the monthly payments, and the balances.
export function debtsByType(doc) {
  const groups = {};
  for (const d of doc.debts) {
    if (d.state === 'archived') continue;
    const g = groups[d.type] = groups[d.type] || { type: d.type, count: 0, minimums: [], balances: [] };
    g.count += 1;
    g.minimums.push(toMonthly(d.minimum, 'monthly'));
    // A card linked to an account reads its balance from there (S-084).
    const linked = linkedCardBalance(doc, d.id);
    g.balances.push(linked ? linked.amount : d.balance.amount);
  }
  return Object.values(groups).map((g) => ({
    type: g.type, count: g.count,
    monthly: sumKnown(g.minimums).total, monthlyMissing: sumKnown(g.minimums).missing,
    balance: sumKnown(g.balances).total, balanceMissing: sumKnown(g.balances).missing
  }));
}
