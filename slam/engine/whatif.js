// What if (overnight Track F): four sliders on the Plan move the household in memory, never in My numbers, and the
// dates move with them. "Save as a scenario" keeps the moved copy beside the others.
//   spendLess  dollars a month off the everyday lines (the ones not fixed), shared out by their size
//   earnMore   dollars a month more pay before tax, on the biggest paycheck (taxed like the rest of it)
//   extraDebt  dollars a month more at the debt, on top of the extra already set
//   windfall   dollars once, sent where the Windfall order sends it (tax bill, cash floor, promo and card balances,
//              the cushion, Roth room; what is left lands in checking)
//   rent       dollars a month more (or, negative, less) on the housing line (Home's Drag to see the future, S-286)
//   saveMore   dollars a month more saved, off the everyday lines like spendLess (Home's slider, in the client's words)
// whatIf(spine, rules, moves) -> { spine, now, then }: now and then are { surplus, debtFreeYm, interest, fiYear,
// yearsToFi }, read the same way for both, so they compare.

import { valueOf as v, round2, getAt } from './spine.js';
import { summarize } from './summary.js';
import { planPayoff } from './plan.js';
import { windfall as windfallOrder } from './windfall.js';
import { editExpense, editIncome, putFact } from './edits.js';
import { mainChecking } from './defaults.js';

const bump = (spine, path, by, today) => { const was = v(getAt(spine, path)) ?? 0; return putFact(spine, path, round2(was + by), 'rough', today); };

// The housing line a rent slider moves: the accommodation line named rent or mortgage, else the biggest one; null when
// there is none (the slider then says so instead of guessing).
export function housingLine(spine) {
  const lines = (spine.expenses || []).filter((e) => e.fat === 'accommodation' && typeof v(e.amount) === 'number');
  if (!lines.length) return null;
  return lines.find((e) => /\b(rent|mortgage)\b/i.test(String(e.label || e.id))) || lines.slice().sort((a, b) => v(b.amount) - v(a.amount))[0];
}

export function movedSpine(spine, rules, { spendLess = 0, earnMore = 0, extraDebt = 0, windfall = 0, rent = 0, saveMore = 0 } = {}, today = spine.meta.asOf) {
  let s = spine;
  const base = summarize(spine, rules, { flags: false });
  if (rent) {
    const line = housingLine(spine);
    if (line) s = editExpense(s, line.id, { amount: round2(Math.max(0, v(line.amount) + rent)), kind: 'rough' }, today);
  }
  spendLess = (spendLess > 0 ? spendLess : 0) + (saveMore > 0 ? saveMore : 0);
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
// Debt dates and interest are the Plan's (morning answer 1, planPayoff); `every` is the comparison only.
export function outcome(spine, rules) {
  const s = summarize(spine, rules, { flags: false });
  const hasDebt = (spine.debts || []).some((d) => (v(d.balance) ?? 0) > 0);
  const p = hasDebt ? planPayoff(spine, rules, s) : null;
  const y = s.fi.yearsToFi.value;
  return { surplus: s.cashflow.surplus.value, hasHi: !!(p && p.hasHi), hiYm: p ? p.hiYm : null, debtFreeYm: p ? p.allYm : null, neverPaysOff: !!(p && p.neverPaysOff), interest: p ? p.interest.value : 0, everyYm: p ? p.every.debtFreeYm : null, yearsToFi: y, fiYear: y === null ? null : Math.floor(+s.asOf.slice(0, 4) + (+s.asOf.slice(5, 7) - 1) / 12 + y) };
}

export function whatIf(spine, rules, moves, today) {
  const moved = movedSpine(spine, rules, moves, today);
  return { spine: moved, now: outcome(spine, rules), then: outcome(moved, rules) };
}
