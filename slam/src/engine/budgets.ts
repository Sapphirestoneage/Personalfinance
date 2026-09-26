/* ==========================================================================
   Agreed budgets: a regular's monthly ceiling. When a month's tributes go
   past it, the app prompts a check-in with them. Pure: takes records,
   returns the list to prompt for.
   ========================================================================== */
import type { ClientRecord, Sale } from '@/data/schemas';

export interface BudgetFlag {
  clientId: string;
  alias: string;
  agreedBudgetCents: number;
  spentCents: number;
  overByCents: number;
}

/** month is "YYYY-MM" */
export function budgetCheck(clients: ClientRecord[], sales: Sale[], month: string): BudgetFlag[] {
  const spent = new Map<string, number>();
  for (const s of sales) {
    if (!s.clientId || !s.date.startsWith(month)) continue;
    spent.set(s.clientId, (spent.get(s.clientId) ?? 0) + s.amountCents);
  }
  const flags: BudgetFlag[] = [];
  for (const c of clients) {
    if (c.agreedBudgetCents === null) continue;
    const spentCents = spent.get(c.id) ?? 0;
    if (spentCents > c.agreedBudgetCents) {
      flags.push({ clientId: c.id, alias: c.alias, agreedBudgetCents: c.agreedBudgetCents, spentCents, overByCents: spentCents - c.agreedBudgetCents });
    }
  }
  return flags.sort((a, b) => b.overByCents - a.overByCents);
}
