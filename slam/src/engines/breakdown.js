// Breaking a Rough number into sub-categories, and debts by type. Dollars a month for payments,
// dollars owed for balances. Depends on balances.js (a card's balance from its account), debts.js
// (minimumAmount), money.js (sumKnown), normalize.js, and the sub-category ideas in
// src/data/subcategory-ideas.json, handed in as refs.subcategoryIdeas.

import { linkedCardBalance } from './balances.js';
import { toMonthly } from './normalize.js';
import { sumKnown } from './money.js';
import { minimumAmount } from './debts.js';

/**
 * Ideas for sub-categories not already a line in the category (any case).
 * @param {object} doc the household file
 * @param {object} refs reference data; refs.subcategoryIdeas is src/data/subcategory-ideas.json
 * @returns {Object<string, string[]>} by category id: line names to offer, in the data file's order
 */
export function lineIdeas(doc, refs) {
  const ideas = (refs.subcategoryIdeas && refs.subcategoryIdeas.ideas) || {};
  const out = {};
  for (const c of doc.categories) {
    // An archived line's name is free to offer again.
    const have = new Set(c.lines.filter((l) => l.state !== 'archived').map((l) => l.name.toLowerCase()));
    out[c.id] = (ideas[c.type] || []).filter((n) => !have.has(n.toLowerCase()));
  }
  return out;
}

/**
 * Debts grouped by type: how many, the monthly payments, and the balances.
 * @param {object} doc the household file
 * @returns {Array<{type: string, count: number, monthly: ?number, monthlyMissing: number, balance: ?number, balanceMissing: number}>}
 *   monthly in dollars a month (each debt's minimum, whatever cadence it was typed in); balance in dollars
 *   owed now; the Missing counts are debts with no number, which the totals leave out rather than call 0
 */
export function debtsByType(doc) {
  const groups = {};
  for (const d of doc.debts) {
    if (d.state === 'archived') continue;
    const g = groups[d.type] = groups[d.type] || { type: d.type, count: 0, minimums: [], balances: [] };
    g.count += 1;
    g.minimums.push(minimumAmount(doc, d));
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
