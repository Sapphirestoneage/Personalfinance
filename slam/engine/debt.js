// Debt engine: minimums, utilization, promo deadlines, and payoff orders
// (avalanche, snowball, stress-weighted) with payoff dates and interest.

import { valueOf, tracker, round2, monthKey, monthStart, monthEnd, addMonths, addDays, dayIn } from './spine.js';
import { REVOLVING } from './schema.js';

const v = valueOf;
const P = (d, k) => 'debts.' + d.id + '.' + k;

// The rate charged on a date: the promo rate while the promo runs, then the APR.
// Returns { rate, path } where rate is null when the APR is missing.
// The intro rate runs through its end date; the day after, the APR (the rate
// after the intro) applies. An APR marked not for me charges no interest.
export function rateOn(debt, iso) {
  const ends = v(debt.promoEnds), promo = v(debt.promoApr);
  if (ends && promo !== null && iso <= ends) return { rate: promo, path: P(debt, 'promoApr'), promo: true };
  return { rate: debt.apr && debt.apr.kind === 'notForMe' ? 0 : v(debt.apr), path: P(debt, 'apr'), promo: false };
}

// The monthly minimum. A known minimum is used as is. A card with no minimum
// gets an estimate (APP_CARD_MIN_PCT of the balance plus a month of interest,
// at least APP_CARD_MIN_FLOOR, never more than the balance), marked rough.
// Any other debt with no minimum is missing.
export function minimumPayment(debt, rules, iso, balance = v(debt.balance)) {
  const t = tracker();
  const year = +iso.slice(0, 4);
  t.useFact(P(debt, 'balance'), debt.balance);
  if (balance === null) return t.out(null);
  if (balance <= 0) return t.out(0);
  const known = t.useFact(P(debt, 'minimum'), debt.minimum);
  if (known !== null) return t.out(Math.min(known, balance), { estimated: false });
  if (debt.type !== 'credit_card') return t.out(null, { estimated: false });
  const { rate, path } = rateOn(debt, iso);
  const rateUsed = t.useFact(path, path.endsWith('promoApr') ? debt.promoApr : debt.apr);
  const pct = t.rule(rules, 'APP_CARD_MIN_PCT', year), floor = t.rule(rules, 'APP_CARD_MIN_FLOOR', year);
  const est = Math.min(balance, Math.max(floor, balance * pct + balance * (rateUsed ?? rate ?? 0) / 12));
  t.addRough(P(debt, 'minimum'));
  return t.out(round2(est), { estimated: true });
}

export function debtTotals(spine) {
  const all = tracker(), cards = tracker();
  let sum = 0, cardSum = 0;
  for (const d of spine.debts || []) {
    const b = all.useFact(P(d, 'balance'), d.balance);
    if (b !== null) sum += b;
    if (d.type === 'credit_card') { const c = cards.useFact(P(d, 'balance'), d.balance); if (c !== null) cardSum += c; }
  }
  return { total: all.out(sum), cards: cards.out(cardSum) };
}

// Utilization three ways (S-158): per card; personal, the cards that report to
// personal credit; and overall, every revolving account, business cards
// included. A total needs every limit (and, for personal, every card's
// reporting answer): with one missing it is null and names it, because a
// partial figure would read as a real one.
export function utilization(spine) {
  const items = [];
  const all = tracker(), pers = tracker();
  let bal = 0, lim = 0, pBal = 0, pLim = 0;
  for (const d of (spine.debts || []).filter((x) => REVOLVING.includes(x.type))) {
    const t = tracker();
    const b = t.useFact(P(d, 'balance'), d.balance), l = t.useFact(P(d, 'limit'), d.limit);
    all.useFact(P(d, 'balance'), d.balance); all.useFact(P(d, 'limit'), d.limit);
    if (b !== null) bal += b;
    if (l !== null) lim += l;
    // A card must say whether it reports; a HELOC counts as personal only when it says so.
    const reports = d.type === 'credit_card' || d.reportsToPersonalCredit ? pers.useFact(P(d, 'reportsToPersonalCredit'), d.reportsToPersonalCredit) : false;
    if (reports === true) {
      pers.useFact(P(d, 'balance'), d.balance); pers.useFact(P(d, 'limit'), d.limit);
      if (b !== null) pBal += b;
      if (l !== null) pLim += l;
    }
    items.push({ id: d.id, name: v(d.name), balance: b, limit: l, business: v(d.business), reports, util: t.out(b !== null && l ? b / l : null) });
  }
  const total = (tr, b, l) => tr.out(tr.snapshot().missing.length || !l ? null : b / l, { balance: b, limit: l });
  return { items, personal: total(pers, pBal, pLim), overall: total(all, bal, lim) };
}

// The credit score note (S-159), kept apart from the payoff order: personal
// cards over APP_UTIL_WARN, highest first, and what personal utilization would
// be with the smallest of those balances paid off.
export function creditScoreNote(spine, rules, asOf, util = utilization(spine)) {
  const warn = rules.get('APP_UTIL_WARN', +asOf.slice(0, 4));
  const over = util.items.filter((c) => c.reports === true && c.util.value !== null && c.util.value > warn).sort((a, b) => b.util.value - a.util.value);
  const smallest = over.length ? over.reduce((m, c) => (c.balance < m.balance ? c : m), over[0]) : null;
  const t = tracker();
  t.absorb(util.personal);
  if (smallest) t.absorb(smallest.util);
  const p = util.personal;
  return {
    warn,
    cards: over.map((c) => ({ id: c.id, name: c.name, balance: c.balance, limit: c.limit, util: c.util.value })),
    smallest: smallest && { id: smallest.id, name: smallest.name, balance: smallest.balance },
    personalNow: p,
    personalAfter: t.out(smallest && p.value !== null ? (p.balance - smallest.balance) / p.limit : null)
  };
}

// An order with what drives it: today's rate and, for a promo, when it ends.
export function orderDetail(spine, ids, asOf) {
  return ids.map((id) => {
    const d = spine.debts.find((x) => x.id === id);
    const r = rateOn(d, asOf);
    return { id, name: v(d.name), rate: r.rate, promo: r.promo, promoEnds: r.promo ? v(d.promoEnds) : null };
  });
}

// Payments left before a promo ends: one a month, from the month after asOf
// through the month the promo ends.
export function paymentsBefore(asOf, endsIso) {
  const a = monthKey(asOf), e = monthKey(endsIso);
  const n = (+e.slice(0, 4) - +a.slice(0, 4)) * 12 + (+e.slice(5) - +a.slice(5));
  return Math.max(0, n);
}

// Promo balances that must be cleared before their promo ends, and the
// monthly amount that clears each one in time.
export function promoDeadlines(spine, asOf) {
  const items = [];
  const t = tracker();
  let total = 0, monthly = 0;
  for (const d of spine.debts || []) {
    const ends = v(d.promoEnds);
    if (!ends || ends < asOf || v(d.promoApr) === null) continue;
    const b = t.useFact(P(d, 'balance'), d.balance);
    t.useFact(P(d, 'promoEnds'), d.promoEnds);
    if (!b) continue;
    const n = paymentsBefore(asOf, ends);
    const need = n ? b / n : b;
    total += b; monthly += need;
    // The rate after the intro starts the day after it ends.
    t.useFact(P(d, 'apr'), d.apr);
    items.push({ id: d.id, name: v(d.name), balance: b, promoEnds: ends, switchDate: addDays(ends, 1), paymentsLeft: n, monthlyNeeded: round2(need), deferredInterest: v(d.deferredInterest), aprAfter: rateOn(d, addDays(ends, 1)).rate, aprAfterKind: d.apr ? d.apr.kind : 'missing' });
  }
  items.sort((a, b) => (a.promoEnds < b.promoEnds ? -1 : a.promoEnds > b.promoEnds ? 1 : 0));
  const by = items.length ? items.reduce((m, x) => (x.promoEnds < m ? x.promoEnds : m), items[0].promoEnds) : null;
  return { items, total: t.out(items.length ? total : 0), monthly: t.out(round2(monthly)), firstDeadline: by };
}

// ---------------------------------------------------------------- orders
const cmp = (a, b) => (a === b ? 0 : a === null ? 1 : b === null ? -1 : 0);
function byRateThenPromo(asOf) {
  return (a, b) => {
    const ra = rateOn(a, asOf).rate, rb = rateOn(b, asOf).rate;
    if (cmp(ra, rb)) return cmp(ra, rb);
    if (ra !== rb) return rb - ra;
    const da = v(a.deferredInterest) === true, db = v(b.deferredInterest) === true;
    if (da !== db) return da ? -1 : 1;
    const ea = v(a.promoEnds) || '9999', eb = v(b.promoEnds) || '9999';
    if (ea !== eb) return ea < eb ? -1 : 1;
    return (v(a.balance) ?? 0) - (v(b.balance) ?? 0);
  };
}
export const STRATEGIES = {
  // Highest rate charged today first. A 0% promo counts as 0% until it ends.
  avalanche: (asOf) => byRateThenPromo(asOf),
  // Smallest balance first.
  snowball: (asOf) => (a, b) => (v(a.balance) ?? Infinity) - (v(b.balance) ?? Infinity) || byRateThenPromo(asOf)(a, b),
  // Most stressful first (1 to 10); a debt with no stress score goes after the scored ones.
  stress: (asOf) => (a, b) => cmp(v(a.stress), v(b.stress)) || (v(b.stress) ?? 0) - (v(a.stress) ?? 0) || byRateThenPromo(asOf)(a, b)
};

export function order(spine, strategy, asOf, { cardsOnly = false } = {}) {
  const list = (spine.debts || []).filter((d) => (v(d.balance) ?? 0) > 0 && (!cardsOnly || d.type === 'credit_card'));
  return list.slice().sort(STRATEGIES[strategy](asOf)).map((d) => d.id);
}

// ---------------------------------------------------------------- payoff
// Month by month from the month after asOf: every debt gets its minimum, the
// extra plus any freed minimums go to the first unpaid debt in the order.
// Deferred interest: when a deferred-interest promo ends with a balance, the
// interest on the starting balance for the promo months is added (approximate:
// the real charge runs from each purchase date).
// One month of interest on a debt's running state { d, bal, interest,
// startBal, deferredDone }, including a deferred-interest charge the month a
// deferred promo ends with a balance. Returns the interest added.
export function accrueMonth(s, iso, asOf, t) {
  const { rate, path, promo } = rateOn(s.d, iso);
  if (rate === null && t) t.addMissing(path);
  let added = 0;
  if (!promo && !s.deferredDone && v(s.d.deferredInterest) === true && v(s.d.promoEnds) && v(s.d.apr) !== null) {
    added += s.startBal * v(s.d.apr) * paymentsBefore(asOf, v(s.d.promoEnds)) / 12;
    s.deferredDone = true;
  }
  // An intro that ends inside this month: intro rate up to its end date, the
  // rate after it from the next day, split by days.
  let monthRate = rate ?? 0;
  const ends = v(s.d.promoEnds), ym = iso.slice(0, 7);
  if (promo && ends && ends.slice(0, 7) === ym && ends < monthEnd(ym)) {
    const after = rateOn(s.d, addDays(ends, 1));
    if (after.rate === null && t) t.addMissing(after.path);
    const dim = +monthEnd(ym).slice(8), on = +ends.slice(8);
    monthRate = (monthRate * on + (after.rate ?? 0) * (dim - on)) / dim;
  }
  added += (s.bal + added) * monthRate / 12;
  s.bal += added; s.interest += added;
  return added;
}

export function payoffPlan(spine, rules, { strategy = 'avalanche', extra = 0, asOf, cardsOnly = false, maxMonths = 600 } = {}) {
  const t = tracker();
  const ids = order(spine, strategy, asOf, { cardsOnly });
  const debts = ids.map((id) => spine.debts.find((d) => d.id === id));
  const st = debts.map((d) => ({ d, bal: t.useFact(P(d, 'balance'), d.balance), interest: 0, paidYm: null, startBal: v(d.balance), deferredDone: false }));
  let ym = monthKey(asOf);
  let months = 0;
  while (st.some((s) => s.bal > 0.005) && months < maxMonths) {
    ym = addMonths(ym, 1); months++;
    const iso = monthStart(ym);
    let pool = extra;
    for (const s of st) {
      if (s.bal <= 0.005) { const m = minimumPayment(s.d, rules, iso, s.startBal); pool += m.value ?? 0; continue; }
      accrueMonth(s, iso, asOf, t);
      const m = minimumPayment(s.d, rules, iso, s.bal);
      t.absorb({ ...m, value: undefined });
      const pay = Math.min(s.bal, m.value ?? 0);
      s.bal -= pay;
      if (m.value === null) t.addMissing(P(s.d, 'minimum'));
    }
    for (const s of st) {
      if (pool <= 0) break;
      if (s.bal <= 0.005) continue;
      const pay = Math.min(s.bal, pool);
      s.bal -= pay; pool -= pay;
    }
    for (const s of st) if (s.bal <= 0.005 && !s.paidYm) { s.bal = 0; s.paidYm = ym; }
  }
  const stuck = st.some((s) => s.bal > 0.005);
  const totalInterest = st.reduce((a, s) => a + s.interest, 0);
  return {
    strategy, order: ids,
    debts: st.map((s) => ({ id: s.d.id, name: v(s.d.name), payoffYm: s.paidYm, interest: round2(s.interest) })),
    debtFreeYm: stuck ? null : st.reduce((m, s) => (s.paidYm && s.paidYm > m ? s.paidYm : m), ''),
    months: stuck ? null : months,
    totalInterest: t.out(round2(totalInterest)),
    neverPaysOff: stuck
  };
}

// When a debt's payment falls in month ym: its due day (the house default fills
// a blank one, engine/defaults.js), or null when there is none.
export function dueDateIn(debt, ym) {
  const day = v(debt.dueDay);
  return day === null ? null : dayIn(ym, day);
}

// Minimums due in a month across all debts with a balance, each on its due day.
export function minimumsTotal(spine, rules, iso) {
  const t = tracker();
  let sum = 0;
  const items = [];
  for (const d of spine.debts || []) {
    const b = v(d.balance);
    if (b !== null && b <= 0) continue;
    const m = minimumPayment(d, rules, iso);
    t.absorb({ ...m, value: undefined });
    if (m.value !== null) sum += m.value;
    items.push({ id: d.id, name: v(d.name), amount: m.value, estimated: !!m.estimated, dueDate: dueDateIn(d, iso.slice(0, 7)) });
  }
  return { total: t.out(round2(sum)), items };
}

