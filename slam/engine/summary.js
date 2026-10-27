// The one-pager: every headline number, computed once from the spine. The
// Dashboard only formats what this returns.

import { cashflow } from './cashflow.js';
import { balanceSheet } from './networth.js';
import { utilization, creditScoreNote, promoDeadlines, order, orderDetail, payoffPlan } from './debt.js';
import { emergency } from './emergency.js';
import { fiReport } from './fi.js';
import { taxForYear } from './tax.js';
import { buildFlags } from './flags.js';
import { subscriptions } from './subscriptions.js';
import { monthKey, addMonths, addDays, valueOf, tracker, round2 } from './spine.js';

// The income cliff (S-174): the first month within STAGE_CLIFF_MONTHS where
// certain income (no likelihood, or likelihood 1) is $0, what that month costs
// (spending, minimum payments, tax set-aside), and the likely income then.
export function incomeCliff(spine, rules, asOf) {
  const n = rules.get('STAGE_CLIFF_MONTHS', +asOf.slice(0, 4));
  let ym = monthKey(asOf);
  const now = cashflow(spine, rules, ym, { mode: 'committed' });
  if (!now.income.gross.value) return null;
  for (let k = 1; k <= n; k++) {
    ym = addMonths(ym, 1);
    const sure = cashflow(spine, rules, ym, { mode: 'committed' });
    if (sure.income.gross.value) continue;
    const likely = cashflow(spine, rules, ym, { mode: 'expected' });
    // The day certain income stops: the day after the last certain stream ends.
    const ends = (spine.income || []).filter((s) => s.end && s.end >= asOf && (!s.likelihood || valueOf(s.likelihood) === 1)).map((s) => s.end).sort();
    const from = ends.length ? addDays(ends[ends.length - 1], 1) : ym + '-01';
    const costs = sure.expenses.total.value + sure.debtMinimums.total.value + (sure.taxSetAside.total.value ?? 0);
    return { ym, from, costs, spending: sure.expenses.total, minimums: sure.debtMinimums.total, setAside: sure.taxSetAside.total, likely: likely.income.gross, likelyStreams: likely.income.streams.filter((x) => x.included && x.gross) };
  }
  return null;
}

export function summarize(spine, rules, { asOf = spine.meta.asOf, flags = true } = {}) {
  const ym = asOf.slice(0, 7);
  const cf = cashflow(spine, rules, ym);
  const sheet = balanceSheet(spine);
  const util = utilization(spine);
  const debt = {
    utilization: util,
    // Two separate readings, never merged (S-159): the payoff order by rate,
    // and the credit score note by personal utilization.
    creditScore: creditScoreNote(spine, rules, asOf, util),
    promo: promoDeadlines(spine, asOf),
    avalanche: order(spine, 'avalanche', asOf, { rules }),
    avalancheCards: order(spine, 'avalanche', asOf, { cardsOnly: true, rules })
  };
  debt.avalancheCardsDetail = orderDetail(spine, debt.avalancheCards, asOf);
  const s = {
    asOf, ym, cashflow: cf, sheet, debt,
    emergency: emergency(spine, rules, cf, sheet, asOf),
    fi: fiReport(spine, rules, cf, sheet, asOf),
    tax: taxForYear(spine, rules, +asOf.slice(0, 4), { asOf }),
    cliff: incomeCliff(spine, rules, asOf)
  };
  s.subs = subscriptions(spine, rules, cf, asOf);
  if (flags) s.flags = buildFlags(spine, rules, s);
  return s;
}

// The three payoff orders with dates and interest, paying the surplus as extra.
export function payoffOrders(spine, rules, s) {
  const extra = Math.max(0, s.cashflow.surplus.value || 0);
  return Object.fromEntries(['avalanche', 'snowball', 'stress'].map((k) => [k, payoffPlan(spine, rules, { strategy: k, extra, asOf: s.asOf })]));
}

// The five steps of a first session, in call order, each with one total (S-230): Needs (spending a month, your
// share), Debt (owed), Income (a month, before tax), Assets (everything you own), Goals (the amounts set as goals;
// the FI goal is a number the app figures, so it is not added in). Session shows these; each opens My numbers at its
// section. A goal with no amount yet makes the total incomplete, never $0.
export const SESSION_ORDER = [['needs', 'N', 'Needs'], ['debt', 'D', 'Debt'], ['income', 'I', 'Income'], ['assets', 'A', 'Assets'], ['goals', 'G', 'Goals']];
export function sessionSteps(spine, s) {
  const t = tracker();
  const goals = (spine.goals || []).filter((g) => g.type !== 'fi');
  let sum = null;
  for (const g of goals) { const v = t.useFact('goals.' + g.id + '.target', g.target); if (v !== null) sum = round2((sum ?? 0) + v); }
  const result = { needs: s.cashflow.expenses.total, debt: s.sheet.debts, income: s.cashflow.income.gross, assets: s.sheet.assets, goals: t.out(sum, { count: goals.length }) };
  return SESSION_ORDER.map(([id, letter, label]) => ({ id, letter, label, result: result[id] }));
}
