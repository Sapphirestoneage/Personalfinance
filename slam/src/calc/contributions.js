// Money moved into an investment account in a month (S-110): transfers into it in the log (less
// transfers out of it), plus the paycheck deductions that go into it (a 401(k), a Roth). Computed
// from the log and the paycheck, never typed a second time.
//
// A deduction counts at its monthly amount (lesson 13: every amount is normalized to a month), for
// each income that is not archived.

import { counted } from './log.js';
import { kindOf } from './balances.js';

const r2 = (x) => Math.round(x * 100) / 100 + 0;

// income: the income summary (summary.income), whose deduction rows carry their account.
export function contributionsFor(doc, income, month) {
  const invested = (doc.accounts || []).filter((a) => a.state !== 'archived' && kindOf(a) === 'invested');
  const byAccount = {};
  for (const a of invested) {
    // A transfer into an account is a negative amount on it (money in); out is positive.
    const moves = counted(doc.transactions || []).filter((t) => t.kind === 'transfer' && t.account === a.id && t.date.slice(0, 7) === month);
    const transfers = r2(-moves.reduce((x, t) => x + t.amount, 0));
    const deds = (income.sources || []).filter((s) => s.state !== 'archived').flatMap((s) => s.deductions.filter((d) => d.accountId === a.id && d.monthly !== null).map((d) => ({ income: s.label, label: d.label, monthly: d.monthly })));
    const deductions = r2(deds.reduce((x, d) => x + d.monthly, 0));
    byAccount[a.id] = { id: a.id, name: a.name, transfers, transferCount: moves.length, deductions, fromPaycheck: deds, total: r2(transfers + deductions) };
  }
  const list = Object.values(byAccount);
  return { month, byAccount, total: r2(list.reduce((x, c) => x + c.total, 0)), transfers: r2(list.reduce((x, c) => x + c.transfers, 0)), deductions: r2(list.reduce((x, c) => x + c.deductions, 0)) };
}
