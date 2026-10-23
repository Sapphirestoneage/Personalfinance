// The cash simulation adapter (S-203): the spine in, the vendored cashflow v44
// engine's model out (engine/vendor/cashcal.js, cents), and its results back
// in dollars as Results with a kind. One day-by-day run from the as-of date
// over the window: paychecks on their pay dates (what lands, net of tax, FICA
// and payroll saving), bills on their days (an undated bill is spread across
// the month as everyday spending), cards with statement close and grace,
// interest on the average daily balance, late fee and penalty rate after a
// miss, promo rates with a reversion month, the SLAM minimum rule (the larger
// of $40 or 1% plus a month of interest) and house defaults (APR 25%, due day
// 1, both rough), loans and student loans (paid last), pay-later plans, the
// everyday (float) card, the extra at the debt (avalanche with promos last, or
// snowball; stopAtHi; rollFreed), auto-cover, the cash floor guard at the
// stage 1 floor, reimbursed shared bills, maybe money three ways by income
// likelihood, per-occurrence overrides and the maybe tray from spine.calendar.
// null is never zero: a line without an amount is left out and named in needs.

import { valueOf as v, tracker, round2, monthKey, monthEnd, addMonths, addDays, daysBetween, dayIn, daysInMonth } from './spine.js';
import { cashflow, streamWeight } from './cashflow.js';
import { balanceSheet } from './networth.js';
import { emergency } from './emergency.js';
import { mainChecking } from './defaults.js';
import { shareOf, coverOf } from './sharing.js';
import { isSubscription, nextCharge } from './subscriptions.js';
import { DEFAULT_MIN_SOURCE, payPolicyOf, minimumPayment } from './debt.js';
import * as C from './vendor/cashcal.js';
import { MATCH_DAYS, matchOccurrence } from './feed.js';
import { TAG_WORDS } from './spending.js';

const cents = (x) => (x === null || x === undefined ? null : Math.round(x * 100));
const dollars = (c) => (c === null || c === undefined ? null : round2(c / 100));
const roughFact = (f) => !f || f.kind !== 'known';
const STEP = { weekly: 'weekly', biweekly: 'biweekly' };
const PER_YEAR = { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12, quarterly: 4, yearly: 1 };

// Days from the as-of date through the end of the last of `months` months.
// The window runs to the end of the last calendar month asked for, and never
// less than the same number of whole months ahead (one month on the 22nd runs
// to the 21st of next month, so the next paycheck and the next 14 days are in it).
export function windowDays(asOf, months) {
  const n = Math.max(1, months);
  const last = monthEnd(addMonths(monthKey(asOf), n - 1));
  const ahead = addDays(clampDay(addMonths(monthKey(asOf), n), +asOf.slice(8, 10)), -1);
  return daysBetween(asOf, last > ahead ? last : ahead) + 1;
}
const clampDay = (ym, day) => { const end = monthEnd(ym); return ym + '-' + String(Math.min(day, +end.slice(8, 10))).padStart(2, '0'); };

// The last statement close strictly before the run, and its due date the way the engine sets one (the next
// due day after the close, else the close plus the grace days), when that due date falls inside the run.
export function carriedStatement(asOf, end, stmtDay, dueDay, graceDays) {
  let ym = monthKey(asOf), close = clampDay(ym, stmtDay);
  if (close >= asOf) { ym = addMonths(ym, -1); close = clampDay(ym, stmtDay); }
  let due;
  if (dueDay) { due = clampDay(monthKey(close), dueDay); if (due <= close) due = clampDay(addMonths(monthKey(close), 1), dueDay); }
  else due = addDays(close, graceDays);
  return due >= asOf && due <= end ? { close, due } : null;
}

// The debt plan (spine.debtPlan, every field optional): the extra at the debt and how it is aimed.
export function debtPlanOf(spine, rules, t, year) {
  const P = spine.debtPlan || {};
  const read = (k, rule) => { if (P[k]) return t.useFact('debtPlan.' + k, P[k]); if (rule) { t.addRough('debtPlan.' + k); return t.rule(rules, rule, year); } return null; };
  const extra = P.extra ? t.useFact('debtPlan.extra', P.extra) : 0;
  return {
    cents: cents(extra ?? 0), day: read('day', 'APP_EXTRA_DAY') ?? 14, strategy: (P.strategy && v(P.strategy)) || 'avalanche',
    stopAtHi: P.stopAtHi ? v(P.stopAtHi) !== false : true, hiRate: read('hiRate', 'APP_HI_RATE') ?? 0.1, rollFreed: P.rollFreed ? v(P.rollFreed) !== false : true,
    source: P.extra && v(P.extra) !== null ? 'ledger' : 'none'
  };
}

// Skip overrides for an item's occurrences outside its own start and end dates
// (the engine repeats a rule across the whole window; the item's dates win).
function fenceDates(model, item, dates, start, end) {
  for (const d of dates) if ((start && d < start) || (end && d > end)) model.overrides[item.id + '|' + d] = { skip: true };
}

// The model the vendored engine runs, built from the spine with every Fact it reads tracked.
export function cashModel(spine, rules, { asOf = spine.meta.asOf, months = 1, days = null } = {}) {
  const t = tracker();
  const year = +asOf.slice(0, 4), ym = monthKey(asOf);
  const cal = spine.calendar || {};
  const needs = [];
  const R = (id) => t.rule(rules, id, year);
  const model = {
    start: asOf, days: days || windowDays(asOf, months), accounts: [], incomes: [], bills: [], cards: [], loans: [], payLater: [], transfers: [], maybe: [], extras: [], logs: [],
    overrides: {}, floor: 0, floorSource: 'none', guard: cal.guard !== false, sweep: false, sweepTo: null, sweepKeep: 0, shock: null, needs, likelyThreshold: R('APP_LIKELY_THRESHOLD'),
    everydayMonthly: 0, realHourlyWage: null, surplusMonthly: null, paths: {}
  };
  const end = addDays(asOf, model.days - 1);
  model.checkingPath = null;
  const cf = cashflow(spine, rules, ym, { mode: 'expected' });
  t.absorb({ ...cf.income.takeHome, value: undefined });
  model.surplusMonthly = cents(cf.surplus.value);
  // The month-end sweep (S-206): on, to an account, keeping an amount above the floor.
  const sw = cal.sweep || {};
  model.sweep = sw.on === true; model.sweepTo = sw.to || null; model.sweepKeep = cents(sw.keep ?? 0);
  // Hours of life (S-206): take-home per hour worked, until Batch F's real hourly wage.
  const hours = spine.household.workHoursPerWeek ? t.useFact('household.workHoursPerWeek', spine.household.workHoursPerWeek) : null;
  model.realHourlyWage = hours && cf.income.takeHome.value ? Math.round(cents(cf.income.takeHome.value) / (hours * R('APP_WEEKS_PER_MONTH'))) : null;

  // ------------------------------------------------------------ cash accounts
  const main = mainChecking(spine);
  model.checkingPath = main ? 'accounts.' + main + '.balance' : null;
  for (const a of spine.accounts || []) {
    if (a.family !== 'cash') continue;
    const bal = t.useFact('accounts.' + a.id + '.balance', a.balance);
    if (bal === null) { needs.push({ path: 'accounts.' + a.id + '.balance', what: (v(a.name) || a.id) + ': balance' }); continue; }
    const cushion = v(a.role) === 'emergency' || (a.type === 'hysa' || a.type === 'savings') && a.id !== main;
    model.accounts.push({ id: a.id, name: v(a.name) || a.id, type: a.type, balance: cents(bal), primary: a.id === main, cushion, autoCover: false });
    model.paths['acct:' + a.id] = 'accounts.' + a.id + '.balance';
  }
  if (!model.accounts.length) needs.push({ path: null, what: 'a checking or savings account with a balance' });
  // Auto-cover (a house default, S-203): the cushion account tops checking back up to the floor; off when calendar.autoCover is false.
  if (cal.autoCover !== false) { const spare = model.accounts.find((a) => !a.primary && a.cushion) || model.accounts.find((a) => !a.primary); if (spare) { spare.autoCover = true; t.addRough('accounts.' + spare.id + '.balance'); } }
  const pid = main;

  // ------------------------------------------------------------ income: what lands, on its days
  const w2Gross = cf.income.streams.filter((x) => x.included && x.type === 'w2').reduce((x, y) => x + (y.gross || 0), 0);
  const payroll = cf.saving.payroll.value || 0;
  for (const s of spine.income || []) {
    const st = cf.income.streams.find((x) => x.id === s.id);
    const base = 'income.' + s.id, path = base + '.amount';
    const amt = t.useFact(path, s.amount);
    if (amt === null) { needs.push({ path, what: s.label + ': amount' }); continue; }
    if (s.end && s.end < asOf) continue;
    const w = streamWeight(s, 'expected') ?? 1;
    if (w === 0) continue;
    // Net per dollar of gross, from the same cash flow the Dashboard uses; the payroll saving share comes off W-2 pay.
    const ratio = st && st.included && st.gross ? st.takeHome / st.gross : (s.type === 'w2' || s.type === 'tips' ? null : 1);
    if (ratio === null) { if (!st || !st.included) continue; needs.push({ path, what: s.label + ': this month\'s pay' }); continue; }
    const deducted = s.type === 'w2' && w2Gross > 0 && st ? payroll * st.gross / w2Gross : 0;
    const perMonthNet = (st ? (st.gross / Math.max(w, 1e-9)) * ratio : amt * PER_YEAR[s.cadence] / 12) - deducted;
    const estimatedDay = !s.payDay || roughFact(s.payDay);
    const label = s.label;
    // Each paycheck lands in the account it is paid into when that account is in the run (S-209), else main checking.
    const into = s.depositTo ? t.useFact(base + '.depositTo', s.depositTo) : null;
    const to = into && model.accounts.some((a) => a.id === into) ? into : pid;
    const item = { id: s.id, label, to, source: 'spine', variable: roughFact(s.amount), estimated: estimatedDay, path };
    model.paths['pay:' + s.id] = path;
    const maybe = w < 1;
    const push = (dates, each) => {
      if (maybe) { for (const d of dates) if (d >= asOf && d <= end && (!s.end || d <= s.end)) model.maybe.push({ id: s.id + '@' + d, label, cents: cents(each), date: d, likelihood: w, direction: 'in', path }); return; }
      model.incomes.push(item); fenceDates(model, item, dates, s.start, s.end);
    };
    if (s.cadence === 'once') { if (s.start >= asOf && s.start <= end) { if (maybe) model.maybe.push({ id: s.id, label, cents: cents(amt * ratio), date: s.start, likelihood: w, direction: 'in', path }); else model.extras.push({ id: s.id, label, cents: cents(amt * ratio), cadence: 'once', date: s.start, direction: 'in', paidWith: 'cash', category: 'income', to, path }); } continue; }
    if (STEP[s.cadence]) {
      if (!s.start) { needs.push({ path: base + '.payDay', what: label + ': first pay date' }); continue; }
      const each = amt * ratio - deducted * 12 / PER_YEAR[s.cadence];
      Object.assign(item, { cents: cents(each), cadence: STEP[s.cadence], anchor: s.start, estimated: false });
      push(C.paydays(STEP[s.cadence], s.start, asOf, end), each);
      continue;
    }
    const day = s.payDay ? t.useFact(base + '.payDay', s.payDay) : null;
    if (s.cadence === 'semimonthly') {
      const d1 = day || 15;
      Object.assign(item, { cents: cents(perMonthNet / 2), cadence: 'semimonthly', anchor: dayIn(ym, d1) });
      if (!day) t.addRough(base + '.payDay');
      push(C.paydays('semimonthly', dayIn(ym, d1), asOf, end), perMonthNet / 2);
      continue;
    }
    // Monthly and less often: the monthly share on the day paid (the 1st, rough, when none is entered).
    const d1 = day || 1;
    if (!day) t.addRough(base + '.payDay');
    Object.assign(item, { cents: cents(perMonthNet), cadence: 'month', day: d1 });
    push(C.occurrences({ cadence: 'month', day: d1 }, asOf, end), perMonthNet);
  }

  // ------------------------------------------------------------ bills
  const cardIds = new Set((spine.debts || []).filter((d) => d.type === 'credit_card').map((d) => d.id));
  const reimbDays = R('APP_REIMBURSE_DAYS');
  for (const e of spine.expenses || []) {
    const base = 'expenses.' + e.id, path = base + '.amount';
    if (coverOf(e).covered) { t.useFact(base + '.covered', e.covered); continue; }
    if (e.end && e.end < asOf) continue;
    // Marked "does not apply": not a cost, and not a missing one either.
    if (e.amount && e.amount.kind === 'notForMe') { t.useFact(path, e.amount); continue; }
    const amt = t.useFact(path, e.amount);
    if (amt === null) { needs.push({ path, what: e.label + ': amount' }); continue; }
    if (amt <= 0) continue;
    const sh = shareOf(spine, e);
    for (const p of sh.rough || []) t.addRough(p);
    for (const p of sh.missing || []) t.addMissing(p);
    const share = sh.shared ? (sh.share ?? null) : 1;
    if (share === null) { needs.push({ path, what: e.label + ': your share' }); continue; }
    // You pay the whole bill and get paid back: the full bill goes out and the rest comes back a few days later.
    const whole = sh.shared && sh.whoPays === 'whole';
    const yours = amt * share, bill = whole ? amt : yours;
    const paidFrom = e.paidFrom ? t.useFact(base + '.paidFrom', e.paidFrom) : null;
    const paidWith = paidFrom && cardIds.has(paidFrom) ? paidFrom : 'cash';
    const common = { id: e.id, label: e.label, paidWith, category: e.fat || 'other', variable: roughFact(e.amount), shared: !!sh.shared, budgeted: paidWith !== 'cash', movable: false, path };
    model.paths['bill:' + e.id] = path;
    const reimb = (dates, amountBack, cadence, day) => { if (!whole) return; const inc = { id: e.id + ':reimb', label: e.label + ', paid back', cents: cents(amountBack), cadence: 'month', day, offsetDays: reimbDays, to: pid, source: 'reimb', variable: false, estimated: true, path }; model.incomes.push(inc); t.addRough(path); };
    const dayFact = e.payDay ? t.useFact(base + '.payDay', e.payDay) : null;
    if (isSubscription(e)) {
      const renews = e.renews ? t.useFact(base + '.renews', e.renews) : null;
      const next = renews ? nextCharge(renews, e.cadence, asOf) : null;
      if (next && (e.cadence === 'monthly' || e.cadence === 'yearly' || e.cadence === 'quarterly')) {
        const cad = e.cadence === 'yearly' ? 'year' : 'month';
        const it = { ...common, cents: cents(e.cadence === 'quarterly' ? bill / 3 : bill), cadence: cad, day: +next.slice(8, 10), month: +next.slice(5, 7), estimated: roughFact(e.renews) || e.cadence === 'quarterly', subscription: true };
        model.bills.push(it); fenceDates(model, it, C.occurrences(it, asOf, end), e.start, e.end);
        reimb(null, amt - yours, cad, it.day);
        continue;
      }
    }
    if (e.cadence === 'once') { if (e.start && e.start >= asOf && e.start <= end) model.extras.push({ ...common, cents: cents(bill), cadence: 'once', date: e.start, direction: 'out' }); continue; }
    if (STEP[e.cadence] && e.start) {
      const it = { ...common, cents: cents(bill), cadence: e.cadence === 'weekly' ? 'week' : 'biweekly', anchor: e.start, estimated: false };
      model.bills.push(it); fenceDates(model, it, C.paydays(STEP[e.cadence], e.start, asOf, end), e.start, e.end);
      continue;
    }
    const monthly = e.cadence === 'total' && e.start && e.end ? bill * 30.44 / (daysBetween(e.start, e.end) + 1) : bill * PER_YEAR[e.cadence] / 12;
    if (e.cadence === 'yearly' && e.start) {
      const it = { ...common, cents: cents(bill), cadence: 'year', month: +e.start.slice(5, 7), day: +e.start.slice(8, 10), estimated: roughFact(e.amount) };
      model.bills.push(it); fenceDates(model, it, C.occurrences(it, asOf, end), e.start, e.end);
      continue;
    }
    if (dayFact !== null) {
      const it = { ...common, cents: cents(monthly), cadence: 'month', day: dayFact, estimated: roughFact(e.payDay) || (e.cadence !== 'monthly'), movable: true };
      model.bills.push(it); fenceDates(model, it, C.occurrences(it, asOf, end), e.start, e.end);
      reimb(null, (amt - yours) * PER_YEAR[e.cadence] / 12, 'month', dayFact);
      continue;
    }
    // No day: spread across the month as everyday spending (never on a made-up day).
    model.bills.push({ ...common, cents: cents(monthly), cadence: 'spread', estimated: true });
    model.everydayMonthly += cents(monthly);
    if (whole) model.incomes.push({ id: e.id + ':reimb', label: e.label + ', paid back', cents: cents((amt - yours) * PER_YEAR[e.cadence] / 12), cadence: 'month', day: 1, offsetDays: reimbDays, to: pid, source: 'reimb', variable: false, estimated: true, path });
  }

  // ------------------------------------------------------------ cards, loans, pay-later plans
  const grace = R('CARD_GRACE_DAYS'), lateFee = cents(R('CARD_LATE_FEE')), penaltyApr = R('CARD_PENALTY_APR');
  for (const d of spine.debts || []) {
    const base = 'debts.' + d.id;
    const bal = t.useFact(base + '.balance', d.balance);
    const name = v(d.name) || d.id;
    if (bal === null) { needs.push({ path: base + '.balance', what: name + ': balance' }); continue; }
    model.paths['debt:' + d.id] = base + '.balance';
    if (d.type === 'credit_card') {
      const apr = t.useFact(base + '.apr', d.apr) ?? 0;
      const promoApr = d.promoApr && d.promoApr.kind !== 'notForMe' ? t.useFact(base + '.promoApr', d.promoApr) : null;
      const promoEnds = d.promoEnds && d.promoEnds.kind !== 'notForMe' ? t.useFact(base + '.promoEnds', d.promoEnds) : null;
      const limit = d.limit ? t.useFact(base + '.limit', d.limit) : null;
      const dueDay = t.useFact(base + '.dueDay', d.dueDay) ?? 1;
      const closeFact = d.statementCloseDay ? t.useFact(base + '.statementCloseDay', d.statementCloseDay) : null;
      const stmtDay = closeFact ?? ((dueDay - grace - 1 + 62) % 31) + 1;
      if (closeFact === null) t.addRough(base + '.statementCloseDay');
      const policy = payPolicyOf(spine, d);
      if (d.payPolicy) t.useFact(base + '.payPolicy', d.payPolicy); else if (spine.household.cardPayPolicy) t.useFact('household.cardPayPolicy', spine.household.cardPayPolicy);
      // The SLAM minimum (S-166): the larger of $40 or 1% plus a month of interest, following the balance; an entered minimum is used as is.
      const minEntered = d.minimum && d.minimum.source !== DEFAULT_MIN_SOURCE ? t.useFact(base + '.minimum', d.minimum) : null;
      if (minEntered === null) t.addRough(base + '.minimum');
      const everyday = d.everydayCard ? t.useFact(base + '.everydayCard', d.everydayCard) === true : false;
      const payLast = d.payLast ? t.useFact(base + '.payLast', d.payLast) === true : false;
      // The day the card reports to the bureaus (S-205): entered, else the statement close day (rough).
      const reportFact = d.reportDay ? t.useFact(base + '.reportDay', d.reportDay) : null;
      const reportDay = reportFact ?? stmtDay;
      if (reportFact === null) t.addRough(base + '.reportDay');
      const annualFee = d.annualFee && d.annualFee.kind !== 'notForMe' ? t.useFact(base + '.annualFee', d.annualFee) ?? 0 : 0;
      model.cards.push({
        id: d.id, name, balance: cents(bal), apr, promoApr, promoEnd: promoEnds ? promoEnds.slice(0, 7) : null, limit: cents(limit), minimum: cents(minEntered),
        stmtDay, graceDays: grace, dueDay, payInFull: false, autopay: policy === 'statement' ? 'statement' : 'minimum', goalNoInterest: everyday,
        lateFee, penaltyApr, reportDay: reportDay, reportDayRough: reportFact === null, payLast, annualFee: cents(annualFee),
        minPct: minEntered === null ? 0.01 + apr / 12 : 0, minFloor: minEntered === null ? cents(rules.get('APP_CARD_MIN_FLOOR', year)) : 0,
        revolving: bal > 0, estimated: closeFact === null, movable: true, path: base + '.balance'
      });
      t.rule(rules, 'APP_CARD_MIN_FLOOR', year); t.rule(rules, 'APP_CARD_MIN_PCT', year);
      // A statement that closed before the run, due inside it (S-209). The engine opens every card with no
      // statement, so that payment would never leave checking and the lowest day and safe to spend would read
      // too high. It lands on its due day from checking at the SLAM minimum (or the whole balance when the card
      // is paid by its statement), and the card opens that much lower. The statement is taken as today's
      // balance (charges since the close are not known), so it is rough.
      const card = model.cards[model.cards.length - 1];
      const carry = carriedStatement(asOf, end, card.stmtDay, card.dueDay, grace);
      if (carry && bal > 0) {
        const m = minimumPayment(d, rules, carry.due, bal, policy);
        const pay = m.value === null ? null : Math.min(bal, m.value);
        if (pay) {
          model.extras.push({ id: 'carry:' + d.id, kind: 'card-payment', label: name + (policy === 'statement' ? ' statement' : ' minimum') + ' (statement closed ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+carry.close.slice(5, 7) - 1] + ' ' + +carry.close.slice(8, 10) + ')', cadence: 'once', date: carry.due, cents: cents(pay), direction: 'out', paidWith: 'cash', category: 'debt', card: d.id });
          card.balance = cents(bal - pay);
          card.carried = { close: carry.close, due: carry.due, amount: pay };
          t.addRough(base + '.statementCloseDay');
        }
      }
      continue;
    }
    const minimum = t.useFact(base + '.minimum', d.minimum);
    if (minimum === null) { needs.push({ path: base + '.minimum', what: name + ': monthly payment' }); continue; }
    if (bal <= 0) continue;
    const dueDay = t.useFact(base + '.dueDay', d.dueDay) ?? 1;
    if (d.type === 'bnpl') {
      model.payLater.push({ id: d.id, label: name, total: cents(bal), installment: cents(minimum), nextDate: dayIn(ym, dueDay) >= asOf ? dayIn(ym, dueDay) : dayIn(addMonths(ym, 1), dueDay), freq: 'monthly', paid: 0, paidWith: 'cash', path: base + '.balance' });
      continue;
    }
    const rate = d.apr && d.apr.kind !== 'notForMe' ? t.useFact(base + '.apr', d.apr) ?? 0 : 0;
    const student = d.type === 'student_loan' || d.type === 'private_student_loan';
    model.loans.push({ id: d.id, name, balance: cents(bal), rate, payment: cents(minimum), day: dueDay, estimated: roughFact(d.dueDay), type: d.type, payLast: student || (d.payLast ? v(d.payLast) === true : false), path: base + '.balance' });
  }

  // ------------------------------------------------------------ saving from take-home and the tax set-aside
  for (const a of spine.accounts || []) {
    if (!a.monthlyContribution || a.family === 'cash' || ['employerRetirement', 'hsaFsa'].includes(a.family)) continue;
    const x = t.useFact('accounts.' + a.id + '.monthlyContribution', a.monthlyContribution);
    if (!x) continue;
    const from = a.fundedFrom ? t.useFact('accounts.' + a.id + '.fundedFrom', a.fundedFrom) : null;
    model.transfers.push({ id: 'save:' + a.id, label: 'Into ' + (v(a.name) || a.id), cents: cents(x), cadence: 'month', day: 1, from: from && from !== 'paycheck' ? from : pid, to: a.id, kind: 'savings', path: 'accounts.' + a.id + '.monthlyContribution' });
    t.addRough('accounts.' + a.id + '.monthlyContribution');
  }
  if (cf.taxSetAside.total.value) { t.absorb({ ...cf.taxSetAside.total, value: undefined }); model.transfers.push({ id: 'setAside', label: 'Tax set-aside', cents: cents(cf.taxSetAside.total.value), cadence: 'month', day: 1, from: pid, to: 'goals', kind: 'setAside', path: null }); }

  // ------------------------------------------------------------ the floor, the extra, the tray and the overrides
  const sheet = balanceSheet(spine);
  const em = emergency(spine, rules, cf, sheet, asOf);
  const floorMonths = R('STAGE_RUNWAY_RED_MONTHS');
  // The floor on checking is the stage 1 month less what the cushion accounts already hold (Eli's correction: the floor is the cushion, not a formula on top of it).
  if (em.monthlyNeed !== null) {
    const target = Math.ceil(floorMonths * em.monthlyNeed);
    const cushionCash = model.accounts.filter((a) => a.cushion).reduce((x, a) => x + a.balance, 0) / 100;
    model.floor = cents(Math.max(0, target - cushionCash)); model.floorTarget = cents(target); model.cushionCash = cents(cushionCash);
    model.floorSource = cushionCash >= target ? 'cushion-account' : cushionCash > 0 ? 'stage1-less-cushion' : 'stage1';
    t.absorb({ ...em.tiers.full.burn, value: undefined });
  }
  model.extra = debtPlanOf(spine, rules, t, year);
  for (const m of cal.maybe || []) if (m.date >= asOf && m.date <= end) model.maybe.push({ id: m.id, label: m.label, cents: cents(m.amount), date: m.date, likelihood: typeof m.likelihood === 'number' ? m.likelihood : 0.5, direction: m.direction || 'in', tray: true });
  for (const [key, o] of Object.entries(cal.overrides || {})) { const ov = {}; if (o.date) ov.date = o.date; if (typeof o.amount === 'number') ov.cents = cents(o.amount); if (o.skip) ov.skip = true; model.overrides[key] = { ...(model.overrides[key] || {}), ...ov }; }
  // Moved from before the as-of date to on or after it (S-209): it had not gone out (or come in) yet, so the
  // as-of balance does not hold it. The engine only makes occurrences from the as-of date on, so it is added
  // on its new day, once, carrying its calendar key; the log can then claim it like any other occurrence.
  for (const [key, o] of Object.entries(cal.overrides || {})) {
    const [src, orig] = key.split('|');
    if (o.skip || !o.date || !orig || orig >= asOf || o.date < asOf || o.date > end) continue;
    const it = model.bills.find((b) => b.id === src && b.cadence !== 'spread') || model.incomes.find((x) => x.id === src);
    if (!it) continue;
    const isIn = model.incomes.includes(it);
    model.extras.push({ id: 'late:' + key, label: it.label, cents: typeof o.amount === 'number' ? cents(o.amount) : it.cents, cadence: 'once', date: o.date, direction: isIn ? 'in' : 'out', paidWith: isIn ? 'cash' : it.paidWith || 'cash', category: isIn ? 'income' : it.category || 'other', to: isIn ? it.to : undefined, late: key });
  }
  const fromLog = logIntoRun(spine, model, asOf, end, cardIds);
  const snap = t.snapshot();
  return { model, needs, ...snap, cf, claims: fromLog.claims, fromLog: fromLog.entries };
}

// The log reaches the run (S-209), the engine's own logs input, with each entry moving cash once:
// 1. "It happened" names its occurrence: the run takes the logged amount on the logged day,
//    or skips the occurrence when that day is before the as-of balance, which already holds it.
// 2. A typed entry on a dated bill line within a quarter of its amount, or typed income close to a
//    paycheck's amount, within the feed's match window of an occurrence claims it the same way.
// 3. Everyday spending on a tag the run already spreads moves cash only past what the spread
//    takes from the as-of date to that month's end; a refund on that tag gives it back.
// 4. Anything else dated on or after the as-of date lands on its own day.
export function logIntoRun(spine, model, asOf, end, cardIds) {
  const incomeIds = new Set((spine.income || []).map((x) => x.id));
  const lineOf = new Map((spine.expenses || []).map((x) => [x.id, x]));
  // A moved occurrence from before the as-of date is an extra that carries its calendar key (late).
  const srcOf = (it) => (it.late ? it.late.split('|')[0] : it.sourceId);
  const planned = C.schedule(model, { maybeMode: 'ignore' }).filter((it) => (it.kind === 'income' && incomeIds.has(srcOf(it))) || (it.kind === 'bill' && lineOf.has(srcOf(it))));
  const keyOf = (it) => it.late || it.sourceId + '|' + it.origDate; // the calendar's key
  const ovKey = (it) => it.sourceId + '|' + it.origDate; // the key the engine reads an override by
  const byKey = new Map(planned.map((it) => [keyOf(it), it]));
  const occs = planned.map((it) => ({ key: keyOf(it), kind: it.kind, source: srcOf(it), date: it.date, amount: dollars(it.cents), it }));
  const taken = new Set(), claims = [], entries = [];
  const claim = (it, e) => {
    const key = keyOf(it); taken.add(key);
    model.overrides[ovKey(it)] = e.date >= asOf ? { date: e.date, cents: cents(e.amount) } : { skip: true };
    claims.push({ key, logId: e.id, date: e.date, label: it.label, kind: it.kind, amount: e.amount, planned: dollars(it.cents), inRun: e.date >= asOf && e.date <= end });
  };
  const log = (spine.log || []).filter((e) => e.date <= end).slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  for (const e of log) if (e.importKey && e.importKey.startsWith('sched:')) { const it = byKey.get(e.importKey.slice(6)); if (it && !taken.has(keyOf(it))) claim(it, e); }
  const rest = [];
  for (const e of log) {
    if (e.importKey && e.importKey.startsWith('sched:')) continue;
    if (daysBetween(e.date, asOf) > MATCH_DAYS) continue;
    const o = matchOccurrence(e, occs, taken);
    if (o) claim(o.it, e);
    else if (e.date >= asOf) rest.push(e);
  }
  const spread = model.bills.filter((b) => b.cadence === 'spread');
  const spreadLines = new Set(spread.map((b) => b.id));
  const tagOf = (e) => e.tag || (e.expenseId && lineOf.get(e.expenseId) ? lineOf.get(e.expenseId).fat || 'other' : 'other');
  const payerOf = (e) => (e.paidWith && cardIds.has(e.paidWith) ? e.paidWith : 'cash');
  const words = (e) => e.note || e.merchant || TAG_WORDS[tagOf(e)] || 'Logged';
  const groups = new Map();
  for (const e of rest) {
    if (e.kind === 'income') {
      model.extras.push({ id: 'log:' + e.id, label: words(e), cents: cents(e.amount), cadence: 'once', date: e.date, direction: 'in', paidWith: 'cash', category: 'income', fromLog: true });
      entries.push({ logId: e.id, date: e.date, label: words(e), kind: 'income', amount: e.amount, moved: e.amount, how: 'whole' });
      continue;
    }
    const tag = tagOf(e), payer = payerOf(e);
    const everyday = (!e.expenseId || spreadLines.has(e.expenseId)) && spread.some((b) => b.category === tag && b.paidWith === payer);
    if (everyday) { const k = e.date.slice(0, 7) + '|' + tag + '|' + payer; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(e); continue; }
    const signed = e.kind === 'refund' ? -e.amount : e.amount;
    model.logs.push({ id: 'log:' + e.id, date: e.date, cents: cents(signed), what: words(e), tag, paidWith: payer });
    entries.push({ logId: e.id, date: e.date, label: words(e), kind: e.kind || 'spend', amount: e.amount, moved: round2(signed), how: 'whole' });
  }
  for (const [k, es] of groups) {
    const [ym, tag, payer] = k.split('|');
    const n = daysInMonth(+ym.slice(0, 4), +ym.slice(5, 7));
    const perDay = spread.filter((b) => b.category === tag && b.paidWith === payer).reduce((x, b) => x + Math.round(b.cents / n), 0);
    const first = asOf > ym + '-01' ? asOf : ym + '-01';
    const plan = perDay * (daysBetween(first, monthEnd(ym)) + 1);
    let sum = 0;
    for (const e of es) {
      const past = (x) => Math.max(0, x - plan);
      const before = past(sum); sum += cents(e.kind === 'refund' ? -e.amount : e.amount); const moved = past(sum) - before;
      if (moved) model.logs.push({ id: 'log:' + e.id, date: e.date, cents: moved, what: (TAG_WORDS[tag] || tag) + ': logged past the plan', tag, paidWith: payer });
      entries.push({ logId: e.id, date: e.date, label: words(e), kind: e.kind || 'spend', amount: e.amount, moved: dollars(moved), how: moved ? 'past the plan' : 'inside the plan', planLeft: dollars(Math.max(0, plan - sum)) });
    }
  }
  return { claims, entries };
}

// Run the simulation and read it back in dollars.
export function cashsim(spine, rules, opts = {}) {
  const { model, needs, from, rough, missing, rules: ruleIds, cf, claims, fromLog } = cashModel(spine, rules, opts);
  const mode = opts.maybeMode || 'weighted';
  const simOpts = { maybeMode: mode, penaltyMonths: rules.get('CARD_PENALTY_MONTHS', +model.start.slice(0, 4)) };
  let run = C.simulate(model, simOpts);
  // A carried statement the floor held back (S-209 review): it left the card's opening balance, so the unpaid
  // part goes back on the card on its due day with the late fee, and interest runs on it from there.
  let chargedBack = false;
  for (const c of model.cards) {
    if (!c.carried) continue;
    const label = (model.extras.find((x) => x.id === 'carry:' + c.id) || {}).label;
    const unpaid = run.shortfalls.filter((x) => x.date === c.carried.due && x.label === label).reduce((a, x) => a + x.cents, 0);
    if (!unpaid) continue;
    c.carried.unpaid = dollars(unpaid);
    model.extras.push({ id: 'carry-unpaid:' + c.id, kind: 'late-fee', label: c.name + ': ' + (unpaid < cents(c.carried.amount) ? 'part of the payment' : 'the payment') + ' not made, back on the card with the late fee', cents: unpaid + (c.lateFee || 0), cadence: 'once', date: c.carried.due, direction: 'out', paidWith: c.id, category: 'card' });
    chargedBack = true;
  }
  if (chargedBack) run = C.simulate(model, simOpts);
  const ev = (e) => ({ kind: e.kind, label: e.label, amount: dollars(e.cents), account: e.account || null, card: e.card || null, statement: e.stmt !== undefined ? dollars(e.stmt) : undefined, due: e.due || undefined, partial: !!e.partial, guarded: !!e.guarded });
  // A carried statement (S-209) left the card's opening balance so the engine would not charge it twice;
  // until checking pays it on its due day it is still owed, so the debt reading carries it back.
  const owedBefore = (date) => model.cards.reduce((a, c) => a + (c.carried && date < c.carried.due ? cents(c.carried.amount) : 0), 0);
  // Checking (S-209): every checking account together, so a paycheck paid into a second checking account
  // is in the line. With main checking unknown the engine's figure stands (and nothing shows it).
  const checkingIds = model.accounts.some((a) => a.primary) ? model.accounts.filter((a) => a.primary || a.type === 'checking').map((a) => a.id) : null;
  const checkingOf = (d) => (checkingIds ? checkingIds.reduce((x, id) => x + (d.balances[id] || 0), 0) : d.primary);
  const days = run.days.map((d) => ({ date: d.date, dom: d.dom, cash: dollars(d.cash), primary: dollars(checkingOf(d)), cardDebt: dollars(d.cardDebt + owedBefore(d.date)), loanDebt: dollars(d.loanDebt), payLater: dollars(d.payLater), debt: dollars(d.debt + owedBefore(d.date)), in: dollars(d.in), out: dollars(d.out), balances: Object.fromEntries(Object.entries(d.balances).map(([k, c]) => [k, dollars(c)])), events: d.events.map(ev) }));
  const cards = Object.fromEntries(Object.entries(run.cards).map(([id, c]) => [id, { ...c, balance: dollars(c.balance), interest: dollars(c.interest), lateFees: dollars(c.lateFees), paid: dollars(c.paid), chargedBack: dollars(c.chargedBack), netPaydown: dollars(c.netPaydown), startBalance: dollars(c.startBalance), limit: dollars(c.limit), peakBeforeReport: dollars(c.peakBeforeReport), interestByMonth: Object.fromEntries(Object.entries(c.interestByMonth).map(([k, x]) => [k, dollars(x)])), statements: c.statements.map((s) => ({ ...s, balance: dollars(s.balance), interest: dollars(s.interest), charges: dollars(s.charges), adb: dollars(s.adb) })), path: model.paths['debt:' + id] || null }]));
  const loans = Object.fromEntries(Object.entries(run.loans).map(([id, l]) => [id, { ...l, balance: dollars(l.balance), interest: dollars(l.interest), paid: dollars(l.paid), path: model.paths['debt:' + id] || null }]));
  // Dates: cards free (every revolving card stopped revolving), high-interest free, loans paid, all free.
  const hi = model.extra.hiRate;
  const cardList = model.cards.filter((c) => c.revolving || c.balance > 0);
  const clearedOf = (c) => { const st = run.cards[c.id]; return st ? (st.cleared && st.cleared > model.start ? st.cleared : st.cleared === model.start ? model.start : null) : null; };
  const allDated = (list, get) => { const ds = list.map(get); return list.length === 0 ? model.start : ds.some((x) => !x) ? null : ds.sort().pop(); };
  const cardsFree = allDated(cardList.filter((c) => c.revolving), clearedOf);
  const hiDebts = [...cardList.filter((c) => c.revolving && c.apr >= hi).map((c) => () => clearedOf(c)), ...model.loans.filter((l) => l.rate >= hi).map((l) => () => run.loans[l.id].paidOff)];
  const hiFree = hiDebts.length ? (hiDebts.map((f) => f()).some((x) => !x) ? null : hiDebts.map((f) => f()).sort().pop()) : model.start;
  const loansFree = allDated(model.loans, (l) => run.loans[l.id].paidOff);
  const allFree = cardsFree && loansFree ? (cardsFree > loansFree ? cardsFree : loansFree) : null;
  const raid = run.days.find((d) => d.events.some((e) => e.kind === 'auto-cover'));
  const kind = missing.length ? 'incomplete' : rough.length ? 'rough' : 'computed';
  return {
    start: model.start, days: model.days, mode, model, run, needs, cf, claims, fromLog,
    // Empty is not zero (S-209): with no balance on main checking the engine's "checking" is every cash account,
    // savings included, so nothing that reads checking is shown until it has one.
    checking: { known: model.accounts.some((a) => a.primary), path: model.checkingPath, ids: checkingIds || [], open: checkingIds ? dollars(checkingIds.reduce((x, id) => x + model.accounts.find((a) => a.id === id).balance, 0)) : null },
    daily: days,
    // The lowest day is read off the checking line (every checking account together), like the line itself.
    low: days.length ? (() => { const d = days.reduce((m, x) => (x.primary < m.primary ? x : m)); return { date: d.date, amount: d.primary }; })() : { date: run.low.date, amount: dollars(run.low.cents) },
    floor: { amount: dollars(model.floor), target: dollars(model.floorTarget ?? null), cushionCash: dollars(model.cushionCash ?? 0), source: model.floorSource, guard: model.guard },
    firstBelowFloor: run.firstBelowFloor, firstBelowZero: run.firstBelowZero, dryDate: run.firstDryTotal, raidDate: raid ? raid.date : null,
    cards, loans, clearDates: { cardsFree, hiFree, loansFree, allFree, hiRate: hi, perCard: Object.fromEntries(cardList.map((c) => [c.id, clearedOf(c)])) },
    interest: { total: dollars(run.interest.total), byCard: Object.fromEntries(Object.entries(run.interest.byCard).map(([k, x]) => [k, dollars(x)])), byMonth: Object.fromEntries(Object.entries(run.interest.byMonth).map(([ym, m]) => [ym, Object.fromEntries(Object.entries(m).map(([k, x]) => [k, dollars(x)]))])) },
    lateFees: dollars(run.lateFees), shortfalls: run.shortfalls.map((s) => ({ ...s, amount: dollars(s.cents) })), extraPaid: dollars(run.extraPaid), extraLog: run.extraLog.map((x) => ({ ...x, amount: dollars(x.cents) })),
    monthly: Object.fromEntries(Object.entries(run.monthly).map(([ym, m]) => { const inMonth = days.filter((d) => d.date.slice(0, 7) === ym); return [ym, { in: dollars(m.in), out: dollars(m.out), net: dollars(m.net), low: inMonth.length ? Math.min(...inMonth.map((d) => d.primary)) : dollars(m.low), interest: dollars(m.interest) }]; })),
    safeToSpend: { today: dollars(run.safeToSpend.today), committed: dollars(run.safeToSpend.committed), nextIncome: run.safeToSpend.nextIncome, excludesCushion: run.safeToSpend.excludesCushion, byDay: run.safeToSpend.byDay.map((d) => ({ date: d.date, amount: dollars(d.cents), committed: dollars(d.committed), nextIncome: d.nextIncome })) },
    paychecks: run.paychecks.map((p) => ({ date: p.date, label: p.label, amount: dollars(p.cents), until: p.until, left: dollars(p.left), bills: p.bills.map((b) => ({ date: b.date, label: b.label, amount: dollars(b.cents), kind: b.kind })) })),
    totals: { in: dollars(run.totals.in), out: dollars(run.totals.out) }, everydayPerDay: dollars(run.everydayPerDay),
    extra: { ...model.extra, amount: dollars(model.extra.cents) },
    kind, from, rough, missing, rules: ruleIds
  };
}

// Maybe money three ways on the spine: ignored, likely only, weighted.
export function threeWays(spine, rules, opts = {}) {
  const out = {};
  for (const m of ['ignore', 'likely', 'weighted']) { const r = cashsim(spine, rules, { ...opts, maybeMode: m }); out[m] = { low: r.low, end: r.daily.length ? r.daily[r.daily.length - 1].primary : null, shortfalls: r.shortfalls.length }; }
  return out;
}

// The four burn tiers (spec 4.2), cumulative and reconciling to take-home: core
// burn (food, housing, transportation), plus everything else that is not debt,
// plus every debt at its minimum, plus the extra at the debt and saving, with
// what is still unallocated. Built from the same cash flow as the Dashboard.
export function burnTiers(spine, rules, cf, { extra = 0 } = {}) {
  const t = tracker();
  const items = cf.expenses.items;
  const sum = (list) => round2(list.reduce((a, i) => a + (i.amount ?? 0), 0));
  const core = sum(items.filter((i) => i.fat && !i.covered));
  const rest = sum(items.filter((i) => !i.fat && !i.covered));
  t.absorb({ ...cf.expenses.total, value: undefined }); t.absorb({ ...cf.debtMinimums.total, value: undefined }); t.absorb({ ...cf.saving.afterTax, value: undefined }); t.absorb({ ...cf.taxSetAside.total, value: undefined }); t.absorb({ ...cf.income.takeHome, value: undefined });
  const minimums = cf.debtMinimums.total.value ?? 0;
  const saved = round2((cf.saving.afterTax.value ?? 0) + (cf.taxSetAside.total.value ?? 0) + extra);
  const takeHome = cf.income.takeHome.value;
  const tiers = [
    { id: 'core', label: 'Core burn: food, housing, transportation', amount: core, cumulative: core },
    { id: 'rest', label: 'Plus everything else that is not debt', amount: rest, cumulative: round2(core + rest) },
    { id: 'minimums', label: 'Plus every debt at its minimum', amount: round2(minimums), cumulative: round2(core + rest + minimums) },
    { id: 'extra', label: 'Plus the extra at the debt, saving and the tax set-aside', amount: saved, cumulative: round2(core + rest + minimums + saved) }
  ];
  const unallocated = takeHome === null ? null : round2(takeHome - tiers[3].cumulative);
  const anyMissing = items.some((i) => i.amount === null && !i.covered);
  return { tiers, takeHome: t.out(takeHome), unallocated: t.out(unallocated), spending: t.out(round2(core + rest)), missing: t.snapshot().missing, kind: anyMissing || t.snapshot().missing.length ? 'incomplete' : t.snapshot().rough.length ? 'rough' : 'computed' };
}

export { dollars, cents };
