// The Debt tab (S-205): readings of the one day-by-day run and the debt engine
// for every card and loan. Nothing here is a second formula: dates, interest,
// peaks and balances come from the simulation (engine/cashsim.js over the
// vendored v44 engine), the payoff order and the minimum rule from
// engine/debt.js, every limit and rate from the rules registry. A missing
// input or a missing rule gives a missing row, never a number. Views only
// format what comes back.

import { valueOf as v, tracker, round2, monthKey, addMonths, daysBetween } from './spine.js';
import { order, orderDetail, payoffPlan, rateOn, minimumPayment } from './debt.js';
import * as C from './vendor/cashcal.js';
import { yearTax } from './tax.js';

const dollars = (c) => (c === null || c === undefined ? null : round2(c / 100));
const cents = (d) => Math.round(d * 100);
const P = (d, f) => 'debts.' + d.id + '.' + f;
const debtOf = (spine, id) => (spine.debts || []).find((d) => d.id === id) || null;
// A card's balance today, in cents: the run opens it lower by a statement carried in from before the run (S-209).
const openingCents = (c) => c.balance + (c.carried ? Math.round(c.carried.amount * 100) : 0);
const STUDENT = ['student_loan', 'private_student_loan'];
const IDR_RULES = ['IDR_PAYMENT_SHARE', 'IDR_POVERTY_MULTIPLE', 'POVERTY_LINE_1', 'POVERTY_LINE_EACH'];
const RAP_RULES = ['RAP_BAND', 'RAP_SHARE_PER_BAND', 'RAP_SHARE_MAX', 'RAP_MIN_PAYMENT', 'RAP_DEPENDENT_CREDIT', 'RAP_FORGIVENESS_PAYMENTS'];
const sameDayLater = (iso, months) => { const ym = addMonths(monthKey(iso), months); const last = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).getUTCDate(); return ym + '-' + String(Math.min(+iso.slice(8, 10), last)).padStart(2, '0'); };

// The four clear dates, kept separate (spec 4.4): high-interest free, every card clear, loans paid off, debt free.
export function clearDates(sim) {
  const cd = sim.clearDates;
  const row = (id, label, date, why) => ({ id, label, date, beyond: !date, why });
  return {
    hiRate: cd.hiRate,
    rows: [
      row('hiFree', 'High-interest free (nothing above ' + Math.round(cd.hiRate * 100) + '%)', cd.hiFree, 'every card and loan at or above the high-interest line is cleared or paid off'),
      row('cardsFree', 'Every card clear', cd.cardsFree, 'every revolving card has stopped revolving: a statement paid in full'),
      row('loansFree', 'Loans paid off', cd.loansFree, 'every loan at zero'),
      row('allFree', 'Debt free', cd.allFree, 'cards clear and loans paid off')
    ],
    kind: sim.kind
  };
}

// Clear dates from the Plan's run (payoffPlan through the order list): high-interest free, cards, loans, all, each as the
// month it lands. A date more than 12 months out reads as one line, "Past <the date 12 months on>", with what it holds.
export function planClearDates(spine, rules, o, asOf = spine.meta.asOf) {
  const hi = rules.get('APP_HI_RATE', +asOf.slice(0, 4));
  const last = (rows) => { if (!rows.length) return monthKey(asOf); if (rows.some((r) => !r.planYm)) return null; return rows.map((r) => r.planYm).sort().pop(); };
  const owing = o.rows.filter((r) => (r.balance ?? 0) > 0);
  const horizon = addMonths(monthKey(asOf), 12);
  const row = (id, label, ym) => ({ id, label, ym, past: !ym || ym > horizon });
  const rows = [
    row('hiFree', 'High-interest free (nothing above ' + Math.round(hi * 100) + '%)', last(owing.filter((r) => (r.rate ?? 0) >= hi || r.promo))),
    row('cardsFree', 'Every card clear', last(owing.filter((r) => r.kind === 'card'))),
    row('loansFree', 'Loans paid off', last(owing.filter((r) => r.kind === 'loan'))),
    row('allFree', 'Debt free', o.debtFreeYm || last(owing))
  ];
  return { rows: rows.filter((r) => !r.past), past: rows.filter((r) => r.past), horizon, extra: o.extra, kind: o.kind };
}

// The payoff Gantt: one bar per card and loan from the start of the window to
// the day it clears, or to the end of the window when it does not.
export function gantt(sim) {
  const from = sim.start;
  const to = sim.daily.length ? sim.daily[sim.daily.length - 1].date : sim.start;
  const span = Math.max(1, daysBetween(from, to));
  const frac = (date) => Math.min(1, Math.max(0, daysBetween(from, date) / span));
  const rows = [];
  for (const c of sim.model.cards) {
    if (!(openingCents(c) > 0) || c.payInFull) continue;
    const st = sim.cards[c.id];
    const clear = sim.clearDates.perCard[c.id] || null;
    rows.push({ id: c.id, name: c.name, kind: 'card', path: c.path, startBalance: dollars(openingCents(c)), endBalance: st ? st.balance : null, clearDate: clear, beyond: !clear, endsAt: clear || to, fraction: clear ? frac(clear) : 1, interest: sim.interest.byCard[c.id] ?? 0, apr: c.apr, promoEnd: c.promoEnd, revolving: st ? st.revolving : null });
  }
  for (const l of sim.model.loans) {
    const st = sim.loans[l.id];
    const off = st ? st.paidOff : null;
    rows.push({ id: l.id, name: l.name, kind: 'loan', path: st ? st.path : null, startBalance: dollars(l.balance), endBalance: st ? st.balance : null, clearDate: off, beyond: !off, endsAt: off || to, fraction: off ? frac(off) : 1, interest: st ? st.interest : 0, apr: l.rate, promoEnd: null, revolving: null });
  }
  const ticks = [];
  for (let ym = monthKey(from); ym <= monthKey(to); ym = addMonths(ym, 1)) { const d = ym + '-01'; if (d > from && d <= to) ticks.push({ ym, fraction: frac(d) }); }
  return { from, to, days: span, rows, ticks, kind: sim.kind };
}

// The payoff order under the debt plan's strategy: rate today, the clear date
// inside the window from the simulation, the month from the monthly plan when
// it falls beyond the window (rough), and the interest each one costs.
export function orderList(spine, rules, sim, asOf = spine.meta.asOf, extraOverride = null) {
  const strategy = sim.extra.strategy === 'snowball' ? 'snowball' : 'avalanche';
  const ids = order(spine, strategy, asOf);
  const detail = orderDetail(spine, ids, asOf);
  const extra = extraOverride ?? (sim.extra.amount || 0);
  const plan = payoffPlan(spine, rules, { strategy, extra, asOf });
  const rows = detail.map((x, i) => {
    const d = debtOf(spine, x.id);
    const isCard = d.type === 'credit_card';
    const clear = isCard ? (sim.clearDates.perCard[x.id] || null) : (sim.loans[x.id] ? sim.loans[x.id].paidOff : null);
    const p = plan.debts.find((y) => y.id === x.id) || null;
    const model = isCard ? sim.model.cards.find((c) => c.id === x.id) : sim.model.loans.find((l) => l.id === x.id);
    return {
      position: i + 1, id: x.id, name: x.name, kind: isCard ? 'card' : 'loan', path: P(d, 'balance'), balance: v(d.balance),
      rate: x.rate, promo: x.promo, promoEnds: x.promoEnds, payLast: !!(model && model.payLast),
      clearDate: clear, planYm: p ? p.payoffYm : null,
      interestInWindow: isCard ? (sim.interest.byCard[x.id] ?? 0) : (sim.loans[x.id] ? sim.loans[x.id].interest : 0),
      planInterest: p ? p.interest : null
    };
  });
  const kind = plan.totalInterest.kind === 'computed' && sim.kind === 'computed' ? 'computed' : plan.totalInterest.kind === 'missing' ? 'missing' : 'rough';
  return { strategy, extra, rows, debtFreeYm: plan.debtFreeYm, neverPaysOff: plan.neverPaysOff, totalInterest: plan.totalInterest, kind };
}

// Card interest month by month, one stack per card (loan interest is not
// charged by statement, so it sits in the order list instead).
export function interestTimeline(sim) {
  const byMonth = sim.interest.byMonth;
  const months = Object.keys(byMonth).sort();
  const ids = [...new Set(months.flatMap((ym) => Object.keys(byMonth[ym])))];
  const rows = months.map((ym) => { const m = byMonth[ym]; return { ym, byDebt: Object.fromEntries(ids.map((id) => [id, m[id] || 0])), total: round2(ids.reduce((a, id) => a + (m[id] || 0), 0)) }; });
  return { months: rows, debts: ids.map((id) => ({ id, name: (sim.cards[id] && sim.cards[id].name) || id, total: sim.interest.byCard[id] ?? 0 })), max: rows.reduce((a, r) => Math.max(a, r.total), 0), total: sim.interest.total, kind: sim.kind };
}

// The minimum-payment trap: the minimum today against a month of interest, and
// how long and how much interest paying only the minimum takes (the monthly
// plan on this one debt with no extra, the same function the Dashboard uses).
export function minimumTrap(spine, rules, d, asOf = spine.meta.asOf) {
  const t = tracker();
  const bal = t.useFact(P(d, 'balance'), d.balance);
  const r = rateOn(d, asOf);
  const m = minimumPayment(d, rules, asOf, bal);
  t.absorb({ ...m, value: undefined });
  const interestNow = bal === null ? null : round2(bal * r.rate / 12);
  const only = payoffPlan({ ...spine, debts: [d] }, rules, { strategy: 'avalanche', extra: 0, asOf, maxMonths: 600 });
  t.absorb({ ...only.totalInterest, value: undefined });
  const row = only.debts[0] || null;
  const months = only.neverPaysOff || !row ? null : only.months;
  const trapped = m.value !== null && interestNow !== null && m.value <= interestNow;
  const out = t.out(months === null ? null : row.interest);
  return { id: d.id, name: v(d.name), path: P(d, 'balance'), balance: bal, rate: r.rate, promo: r.promo, minimumNow: m.value, interestNow, months, years: months === null ? null : round2(months / 12), interest: out.value, neverPaysOff: only.neverPaysOff || trapped, trapped, kind: out.kind, from: out.from, rough: out.rough, missing: out.missing, rules: out.rules };
}

// Utilization as the bureaus will see it: the peak balance before each card's
// report day over the window, personal (the cards that report) and overall.
export function utilizationAtReport(spine, rules, sim) {
  const year = +sim.start.slice(0, 4);
  const warn = rules.get('STAGE_UTIL_RED', year);
  const all = tracker(), pers = tracker();
  all.rule(rules, 'STAGE_UTIL_RED', year); pers.rule(rules, 'STAGE_UTIL_RED', year);
  let peakSum = 0, lim = 0, pPeak = 0, pLim = 0;
  const items = [];
  for (const c of sim.model.cards) {
    const d = debtOf(spine, c.id);
    if (!d) continue;
    const t = tracker();
    const l = t.useFact(P(d, 'limit'), d.limit);
    all.useFact(P(d, 'limit'), d.limit);
    if (c.reportDayRough) { t.addRough(P(d, 'reportDay')); all.addRough(P(d, 'reportDay')); }
    const st = sim.run.cards[c.id];
    const peak = dollars(Math.max(st ? st.peakBeforeReport || 0 : 0, st ? st.balance : 0, openingCents(c)));
    const reports = d.type === 'credit_card' || d.reportsToPersonalCredit ? pers.useFact(P(d, 'reportsToPersonalCredit'), d.reportsToPersonalCredit) : false;
    if (reports === true) { pers.useFact(P(d, 'limit'), d.limit); if (c.reportDayRough) pers.addRough(P(d, 'reportDay')); pPeak += peak; if (l !== null) pLim += l; }
    peakSum += peak; if (l !== null) lim += l;
    const util = t.out(l ? round2(peak / l * 10000) / 10000 : null);
    items.push({ id: c.id, name: c.name, path: P(d, 'limit'), balancePath: P(d, 'balance'), peak, balanceNow: sim.cards[c.id] ? sim.cards[c.id].balance : null, limit: l, reportDay: c.reportDay, reportDayRough: !!c.reportDayRough, reports, warn: util.value === null ? null : util.value > warn, util });
  }
  const total = (tr, p, l) => tr.out(tr.snapshot().missing.length || !l ? null : round2(p / l * 10000) / 10000, { peak: round2(p), limit: round2(l) });
  return { warn, items, personal: total(pers, pPeak, pLim), overall: total(all, peakSum, lim) };
}

// Annual fee against what the card gives back a year (rewards and credits actually used).
export function feeRoi(d) {
  const t = tracker();
  const fee = d.annualFee && d.annualFee.kind !== 'notForMe' ? t.useFact(P(d, 'annualFee'), d.annualFee) : null;
  if (fee === null || fee === 0) return null;
  const value = t.useFact(P(d, 'annualValue'), d.annualValue);
  const out = t.out(value === null ? null : round2(value - fee));
  return { fee, value, net: out.value, path: P(d, 'annualFee'), verdict: value === null ? null : value >= fee ? 'pays for itself' : 'costs more than it gives back', kind: out.kind, from: out.from, rough: out.rough, missing: out.missing, rules: out.rules };
}

// A signup bonus: spend required by a date, what is spent, what is left, the
// pace needed against the pace the card is charged in the run.
export function signupBonus(d, sim, asOf = sim.start) {
  if (!d.bonusSpend && !d.bonusBy) return null;
  const t = tracker();
  const required = t.useFact(P(d, 'bonusSpend'), d.bonusSpend);
  const by = t.useFact(P(d, 'bonusBy'), d.bonusBy);
  const spent = t.useFact(P(d, 'bonusSpent'), d.bonusSpent);
  const value = d.bonusValue && d.bonusValue.kind !== 'notForMe' ? t.useFact(P(d, 'bonusValue'), d.bonusValue) : null;
  const toGo = required === null || spent === null ? null : round2(required - spent);
  const left = toGo === null ? null : Math.max(0, toGo);
  const daysLeft = by ? daysBetween(asOf, by) : null;
  const perDayNeeded = left !== null && daysLeft !== null && daysLeft > 0 ? round2(left / daysLeft) : null;
  const st = sim.cards[d.id];
  const perDayNow = st && sim.days ? round2(st.chargedBack / sim.days) : null;
  const out = t.out(left);
  return { id: d.id, path: P(d, 'bonusSpend'), required, spent, left: out.value, toGo, value, by, daysLeft, perDayNeeded, perDayNow, onPace: perDayNeeded === null || perDayNow === null ? null : perDayNow >= perDayNeeded, done: left === 0, missed: left !== null && left > 0 && daysLeft !== null && daysLeft < 0, kind: out.kind, from: out.from, rough: out.rough, missing: out.missing, rules: out.rules };
}

// One card's tile: the billing cycle, utilization at the report day, why it is
// stuck, the minimum-payment trap, the annual fee and the signup bonus.
export function cardTiles(spine, rules, sim, asOf = spine.meta.asOf) {
  const util = utilizationAtReport(spine, rules, sim);
  return sim.model.cards.map((c) => {
    const d = debtOf(spine, c.id);
    const st = sim.cards[c.id] || null;
    let nextClose = null, nextDue = null, nextStatement = null;
    for (const day of sim.run.days) { const e = day.events.find((x) => x.kind === 'statement' && x.card === c.id); if (e) { nextClose = day.date; nextDue = e.due; nextStatement = dollars(e.stmt); break; } }
    const cycle = { stmtDay: c.stmtDay, closeRough: !!c.estimated, graceDays: c.graceDays, dueDay: c.dueDay, nextClose, nextDue, nextStatement, autopay: c.autopay, everyday: !!c.goalNoInterest };
    const why = st && openingCents(c) > 0 ? C.whyStuck(sim.model, sim.run, c.id) : null;
    return {
      id: c.id, name: c.name, path: c.path, balance: st ? st.balance : null, startBalance: dollars(openingCents(c)), carried: c.carried || null, apr: c.apr, promoApr: c.promoApr, promoEnd: c.promoEnd,
      everyday: !!c.goalNoInterest, payLast: !!c.payLast, revolving: st ? st.revolving : null, clearDate: sim.clearDates.perCard[c.id] || null, interest: sim.interest.byCard[c.id] ?? 0,
      cycle, util: util.items.find((x) => x.id === c.id) || null,
      why: why ? { code: why.code, text: why.text, minimum: dollars(why.minimum), interest: dollars(why.interest), charged: dollars(why.charged), paid: dollars(why.paid) } : null,
      trap: d && openingCents(c) > 0 && !c.payInFull ? minimumTrap(spine, rules, d, asOf) : null,
      fee: d ? feeRoi(d) : null,
      bonus: d ? signupBonus(d, sim, asOf) : null
    };
  });
}

// A federal student loan on an income-driven plan: the payment from the rules
// registry (share of discretionary income above a multiple of the poverty line
// for the household size), the forgiveness date, and Public Service Loan
// Forgiveness when the loan says it is on track. A missing rule is a missing row.
export function idr(spine, rules, d, s = null, asOf = spine.meta.asOf) {
  const year = +asOf.slice(0, 4);
  const t = tracker();
  const bal = t.useFact(P(d, 'balance'), d.balance);
  const base = { id: d.id, name: v(d.name), path: P(d, 'balance'), balance: bal, plan: v(d.plan), standardPayment: v(d.minimum) };
  const federal = d.type === 'student_loan' && !d.federal ? true : t.useFact(P(d, 'federal'), d.federal);
  if (federal === false) return { ...base, federal: false, note: 'Not a federal loan: income-driven plans and forgiveness do not apply.', payment: null, missingRules: [], ...t.out(null), value: undefined, kind: 'notForMe' };
  const missingRules = IDR_RULES.filter((id) => !rules.has(id, year));
  const size = t.useFact('household.householdSize', spine.household.householdSize);
  const agiLine = s && s.tax && s.tax.lines && s.tax.lines.agi ? s.tax.lines.agi : yearTax(spine, rules, year).lines.agi || null;
  let agi = null, agiSource = null;
  // While the year's AGI cannot be figured, the inputs it is waiting on are named, never the bare income list (S-210).
  const waiting = agiLine ? agiLine.missing : [];
  if (agiLine && agiLine.value !== null) { agi = agiLine.value; agiSource = 'tax'; t.absorb({ ...agiLine, value: undefined }); }
  else if (s && s.cashflow.income.gross.value !== null) { agi = round2(s.cashflow.income.gross.value * 12); agiSource = 'cashflow'; t.absorb({ ...s.cashflow.income.gross, value: undefined }); for (const p of waiting.length ? waiting : s.cashflow.income.gross.from.slice(0, 1)) t.addRough(p); }
  else for (const p of [...waiting, ...(s ? s.cashflow.income.gross.missing : [])]) t.addMissing(p);
  let poverty = null, discretionary = null, payment = null;
  if (!missingRules.length && size !== null && agi !== null) {
    poverty = t.rule(rules, 'POVERTY_LINE_1', year) + t.rule(rules, 'POVERTY_LINE_EACH', year) * Math.max(0, size - 1);
    discretionary = Math.max(0, round2(agi - t.rule(rules, 'IDR_POVERTY_MULTIPLE', year) * poverty));
    payment = round2(t.rule(rules, 'IDR_PAYMENT_SHARE', year) * discretionary / 12);
  }
  // The Repayment Assistance Plan (opens July 1, 2026): a share of AGI by $10,000 band, less a credit for each
  // dependent, never under the minimum; forgiven after its payments. Shown beside income-driven repayment, not in place.
  let rap = null;
  if (RAP_RULES.every((id) => rules.has(id, year)) && size !== null && agi !== null) {
    const band = t.rule(rules, 'RAP_BAND', year);
    const share = Math.min(t.rule(rules, 'RAP_SHARE_MAX', year), Math.floor(agi / band) * t.rule(rules, 'RAP_SHARE_PER_BAND', year));
    const pay = Math.max(t.rule(rules, 'RAP_MIN_PAYMENT', year), round2(agi * share / 12 - t.rule(rules, 'RAP_DEPENDENT_CREDIT', year) * Math.max(0, size - 1)));
    const n = t.rule(rules, 'RAP_FORGIVENESS_PAYMENTS', year);
    rap = { share, payment: pay, payments: n, date: sameDayLater(asOf, n) };
  }
  const hasYears = rules.has('IDR_FORGIVENESS_YEARS', year);
  const years = hasYears ? t.rule(rules, 'IDR_FORGIVENESS_YEARS', year) : null;
  if (!hasYears) missingRules.push('IDR_FORGIVENESS_YEARS');
  const pslfOn = d.pslf ? t.useFact(P(d, 'pslf'), d.pslf) === true : false;
  const hasPslf = rules.has('PSLF_PAYMENTS', year);
  const pslfPayments = pslfOn && hasPslf ? t.rule(rules, 'PSLF_PAYMENTS', year) : null;
  if (pslfOn && !hasPslf) missingRules.push('PSLF_PAYMENTS');
  const out = t.out(payment);
  return {
    ...base, federal: true, agi, agiSource, householdSize: size, povertyLine: poverty, discretionary, payment, rap,
    lower: payment !== null && base.standardPayment !== null ? payment < base.standardPayment : null,
    forgivenessYears: years, forgivenessDate: years === null ? null : sameDayLater(asOf, years * 12),
    pslf: pslfOn ? { payments: pslfPayments, date: pslfPayments === null ? null : sameDayLater(asOf, pslfPayments) } : null,
    missingRules, kind: missingRules.length ? 'missing' : out.kind, from: out.from, rough: out.rough, missing: [...out.missing, ...missingRules.map((id) => 'rule:' + id)], rules: out.rules
  };
}

// The target solver (spec 4.4): the smallest extra a month that clears one
// debt by a date, found by halving over the same simulation, and whether that
// extra breaks cash (a shortfall held back by the floor). The v44 solver stops
// at $600 a month; this one goes up to the balance itself, so it always answers.
export function solvePayoff(spine, rules, sim, { target, byDate, maxExtra = null } = {}) {
  const model = sim.model;
  const year = +model.start.slice(0, 4);
  const opts = { maybeMode: sim.mode, penaltyMonths: rules.get('CARD_PENALTY_MONTHS', year) };
  const card = model.cards.find((c) => c.id === target) || null, loan = card ? null : model.loans.find((l) => l.id === target) || null;
  if (!card && !loan || !byDate) return null;
  const days = Math.max(model.days, daysBetween(model.start, byDate) + 31);
  const run = (extraCents) => {
    const r = C.simulate({ ...model, days, extra: { ...model.extra, cents: extraCents, stopAtHi: false } }, opts);
    const st = card ? r.cards[target] : r.loans[target];
    const date = card ? (st.balance <= 0 && st.zeroDate ? st.zeroDate : st.cleared && st.cleared > model.start ? st.cleared : null) : st.paidOff;
    return { date, run: r };
  };
  const ok = (x) => !!x.date && x.date <= byDate;
  const now = model.extra.cents || 0;
  const base = run(now);
  const shape = (x, extra) => ({ target, name: card ? card.name : loan.name, byDate, extraNow: dollars(now), need: dollars(extra), date: x.date, breaksCash: x.run.shortfalls.length > 0, shortfalls: x.run.shortfalls.length, low: dollars(x.run.low.cents) });
  if (ok(base)) return { ...shape(base, now), already: true };
  const balance = card ? card.balance : loan.balance;
  const hiCents = maxExtra !== null ? cents(maxExtra) : Math.max(now + 500, balance + 500);
  const top = run(hiCents);
  if (!ok(top)) return { ...shape(top, hiCents), impossible: true, best: top.date };
  let lo = now, hi = hiCents, best = top;
  while (hi - lo > 500) {
    const mid = Math.round((lo + hi) / 2 / 500) * 500;
    if (mid <= lo || mid >= hi) break;
    const r = run(mid);
    if (ok(r)) { hi = mid; best = r; } else lo = mid;
  }
  return shape(best, hi);
}

// Which card to use for a purchase today: rewards minus interest (a revolving
// card charges interest on it), the interest-free days until the next due
// date, and a utilization warning. Rewards come from each card's own rate,
// else the house default (rough).
export function whichCard(spine, rules, sim, { amount, category = 'other' } = {}) {
  const year = +sim.start.slice(0, 4);
  const t = tracker();
  const dflt = t.rule(rules, 'APP_REWARDS_RATE', year);
  const lib = { cards: sim.model.cards.map((c) => { const d = debtOf(spine, c.id); const r = d && d.rewardsRate && d.rewardsRate.kind !== 'notForMe' ? t.useFact(P(d, 'rewardsRate'), d.rewardsRate) : null; if (r === null && d) t.addRough(P(d, 'rewardsRate')); return { id: c.id, name: c.name, earn: { other: (r ?? dflt) * 100 }, pointValueCents: 1, rate: r ?? dflt }; }) };
  if (amount === null || amount === undefined || !(amount > 0)) return { amount: null, rows: [], best: null, ...t.out(null) };
  const rows = C.whichCard(sim.model, sim.run, { cents: cents(amount), category }, lib).map((r) => ({ id: r.id, name: r.name, rewards: dollars(r.rewards), interest: dollars(r.interest), net: dollars(r.net), interestFreeDays: r.interestFreeDays, utilizationWarn: r.utilizationWarn, revolving: r.revolving, rate: (lib.cards.find((x) => x.id === r.id) || {}).rate ?? dflt, path: (sim.model.cards.find((c) => c.id === r.id) || {}).path || null }));
  return { amount, rows, best: rows.length ? rows[0].id : null, ...t.out(rows.length ? rows[0].net : null) };
}

// A balance transfer: the fee against the interest skipped during the 0%
// window, with what is left when the window ends. Offer terms come from the
// form, else the house defaults.
export function balanceTransfer(spine, rules, { cardId, feeShare = null, promoMonths = null, postApr = null, payment = null } = {}, asOf = spine.meta.asOf) {
  const d = debtOf(spine, cardId);
  if (!d) return null;
  const year = +asOf.slice(0, 4);
  const t = tracker();
  const bal = t.useFact(P(d, 'balance'), d.balance);
  const r = rateOn(d, asOf);
  const fee = feeShare ?? t.rule(rules, 'BT_FEE_SHARE', year);
  const months = promoMonths ?? t.rule(rules, 'BT_PROMO_MONTHS', year);
  const after = postApr ?? r.rate;
  if (bal === null || !(bal > 0)) return { cardId, name: v(d.name), path: P(d, 'balance'), balance: bal, apr: r.rate, feeShare: fee, promoMonths: months, postApr: after, ...t.out(null) };
  const x = C.balanceTransfer({ balance: cents(bal), apr: r.rate, feeShare: fee, promoMonths: months, postApr: after, payment: payment === null ? undefined : cents(payment) });
  return { cardId, name: v(d.name), path: P(d, 'balance'), balance: bal, apr: r.rate, feeShare: fee, promoMonths: months, postApr: after, fee: dollars(x.fee), interestSkipped: dollars(x.interestSkipped), netSaving: dollars(x.netSaving), worthIt: x.worthIt, balanceLeftAfterPromo: dollars(x.balanceLeftAfterPromo), payment: dollars(x.payment), ...t.out(dollars(x.netSaving)) };
}

// Everything the Debt tab shows, from one run.
// extra: the extra a month at the debt from the Plan (planDebtExtra), so the order and the clear dates read the same
// number the Plan shows; the clear dates come from the Plan's month-by-month run (never "not inside the window").
export function debtView(spine, rules, sim, s = null, { asOf = spine.meta.asOf, extra = null } = {}) {
  const cards = cardTiles(spine, rules, sim, asOf);
  const loans = (spine.debts || []).filter((d) => STUDENT.includes(d.type) || (d.federal && v(d.federal) === true)).map((d) => idr(spine, rules, d, s, asOf));
  return {
    asOf, window: { from: sim.start, days: sim.days },
    ...(() => { const o = orderList(spine, rules, sim, asOf, extra); return { order: o, clearDates: planClearDates(spine, rules, o, asOf), gantt: gantt(sim) }; })(), interest: interestTimeline(sim),
    cards, utilization: utilizationAtReport(spine, rules, sim), loans,
    kind: sim.kind, from: sim.from, rough: sim.rough, missing: sim.missing, rules: sim.rules
  };
}
