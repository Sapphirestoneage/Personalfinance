// What if (overnight Track F): four sliders on the Plan move the household in memory, never in My numbers, and the
// dates move with them. "Save as a scenario" keeps the moved copy beside the others.
//   spendLess  dollars a month off the everyday lines (the ones not fixed), shared out by their size
//   earnMore   dollars a month more pay before tax, on the biggest paycheck (taxed like the rest of it)
//   extraDebt  dollars a month more at the debt, on top of the extra already set
//   windfall   dollars once, sent where the Windfall order sends it (tax bill, cash floor, promo and card balances,
//              the cushion, Roth room; what is left lands in checking)
// whatIf(spine, rules, moves) -> { spine, now, then }: now and then are { surplus, debtFreeYm, interest, fiYear,
// yearsToFi }, read the same way for both, so they compare.

import { valueOf as v, round2, getAt } from './spine.js';
import { summarize } from './summary.js';
import { payoffPlan } from './debt.js';
import { windfall as windfallOrder } from './windfall.js';
import { editExpense, editIncome, putFact } from './edits.js';
import { mainChecking } from './defaults.js';

const bump = (spine, path, by, today) => { const was = v(getAt(spine, path)) ?? 0; return putFact(spine, path, round2(was + by), 'rough', today); };

export function movedSpine(spine, rules, { spendLess = 0, earnMore = 0, extraDebt = 0, windfall = 0 } = {}, today = spine.meta.asOf) {
  let s = spine;
  const base = summarize(spine, rules, { flags: false });
  if (spendLess > 0) {
    const flex = base.cashflow.expenses.items.filter((i) => !i.fixed && i.amount > 0);
    const total = flex.reduce((a, i) => a + i.amount, 0);
    const k = total > 0 ? Math.max(0, 1 - spendLess / total) : 1;
    for (const i of flex) { const e = (s.expenses || []).find((x) => x.id === i.id); const amt = e ? v(e.amount) : null; if (typeof amt === 'number') s = editExpense(s, i.id, { amount: round2(amt * k), kind: 'rough' }, today); }
  }
  if (earnMore > 0) {
    const top = [...base.cashflow.income.streams].filter((x) => x.included && x.gross > 0).sort((a, b) => b.gross - a.gross)[0];
    const src = top && (s.income || []).find((x) => x.id === top.id);
    const amt = src ? v(src.amount) : null;
    if (typeof amt === 'number' && top.gross > 0) s = editIncome(s, top.id, { amount: round2(amt + earnMore * (amt / top.gross)), kind: 'rough' }, today);
  }
  if (extraDebt > 0) s = bump(s, 'debtPlan.extra', extraDebt, today);
  if (windfall > 0) {
    const w = windfallOrder(s, rules, summarize(s, rules, { flags: false }), { amount: windfall });
    let left = 0;
    for (const st of w.steps) {
      if (!(st.amount > 0)) continue;
      const paid = (st.items || []).filter((x) => x.path && x.pay > 0);
      if (paid.length) { for (const x of paid) s = bump(s, x.path, -x.pay, today); continue; }
      if (st.id === 'taxBill' || st.id === 'taxOnIt') continue; // paid out to the tax bill
      if (st.path && /^accounts\.[^.]+\.balance$/.test(st.path)) s = bump(s, st.path, st.amount, today);
      else if (st.path && /^accounts\.[^.]+\.contributions$/.test(st.path)) s = bump(s, st.path.replace(/contributions$/, 'balance'), st.amount, today);
      else left += st.amount;
    }
    const chk = mainChecking(s);
    if (left > 0 && chk) s = bump(s, 'accounts.' + chk + '.balance', left, today);
  }
  return s;
}

// The numbers a slider moves, read the same way for any household.
export function outcome(spine, rules) {
  const s = summarize(spine, rules, { flags: false });
  const strategy = (spine.debtPlan && v(spine.debtPlan.strategy)) || 'avalanche';
  const extra = Math.max(0, s.cashflow.surplus.value || 0) + ((spine.debtPlan && v(spine.debtPlan.extra)) || 0);
  const hasDebt = (spine.debts || []).some((d) => (v(d.balance) ?? 0) > 0);
  const p = hasDebt ? payoffPlan(spine, rules, { strategy, extra, asOf: s.asOf }) : null;
  const y = s.fi.yearsToFi.value;
  return { surplus: s.cashflow.surplus.value, debtFreeYm: p && !p.neverPaysOff ? p.debtFreeYm : null, neverPaysOff: !!(p && p.neverPaysOff), interest: p ? p.totalInterest.value : 0, yearsToFi: y, fiYear: y === null ? null : Math.floor(+s.asOf.slice(0, 4) + (+s.asOf.slice(5, 7) - 1) / 12 + y) };
}

export function whatIf(spine, rules, moves, today) {
  const moved = movedSpine(spine, rules, moves, today);
  return { spine: moved, now: outcome(spine, rules), then: outcome(moved, rules) };
}
