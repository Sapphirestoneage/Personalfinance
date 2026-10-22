// The one-pager: every headline number, computed once from the spine. The
// Dashboard only formats what this returns.

import { cashflow } from './cashflow.js';
import { balanceSheet } from './networth.js';
import { utilization, creditScoreNote, promoDeadlines, order, orderDetail, payoffPlan } from './debt.js';
import { emergency } from './emergency.js';
import { fiReport } from './fi.js';
import { taxForYear } from './tax.js';
import { buildFlags } from './flags.js';

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
    avalanche: order(spine, 'avalanche', asOf),
    avalancheCards: order(spine, 'avalanche', asOf, { cardsOnly: true })
  };
  debt.avalancheCardsDetail = orderDetail(spine, debt.avalancheCards, asOf);
  const s = {
    asOf, ym, cashflow: cf, sheet, debt,
    emergency: emergency(spine, rules, cf, sheet, asOf),
    fi: fiReport(spine, rules, cf, sheet, asOf),
    tax: taxForYear(spine, rules, +asOf.slice(0, 4), { asOf })
  };
  if (flags) s.flags = buildFlags(spine, rules, s);
  return s;
}

// The three payoff orders with dates and interest, paying the surplus as extra.
export function payoffOrders(spine, rules, s) {
  const extra = Math.max(0, s.cashflow.surplus.value || 0);
  return Object.fromEntries(['avalanche', 'snowball', 'stress'].map((k) => [k, payoffPlan(spine, rules, { strategy: k, extra, asOf: s.asOf })]));
}
