// Flags: plain-English alerts built from the data. They say what is true and
// what it means in dollars and dates; they never tell anyone what to do.
//
// Every flag has a stage (S-165): red (stage 1), yellow (stage 2) or green
// (stage 3), a "next" goal that moves it up one stage, and the goal for green.
// A goal names the number or action, the dollar gap, and when there is a date,
// the monthly amount that gets there in time. Its path opens the Ledger field.
// Thresholds are STAGE_* rules in data/rules-<year>.json.
//
// Flag: { id, stage, stageNumber, stageLabel, title, detail, next, green, from, rules }
// Goal: { text, target, gap, by, months, monthly, path }

import { valueOf, daysBetween, addDays, inForce, monthKey, addMonths } from './spine.js';
import { labelFor, listWords } from './labels.js';
import { paymentsBefore } from './debt.js';
import { money } from '../src/ui/format.js';
import { isEarmarked } from './schema.js';

const v = valueOf;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const longDate = (iso) => MONTHS[+iso.slice(5, 7) - 1] + ' ' + +iso.slice(8, 10) + ', ' + iso.slice(0, 4);
const monthWords = (ym) => MONTHS[+ym.slice(5, 7) - 1].slice(0, 3) + ' ' + ym.slice(0, 4);
// The three groups on Today, in words (no stage numbers on any screen).
const GROUP_WORDS = { red: 'Do first', yellow: 'Next up', green: 'Done' };
const pctWords = (x) => Math.round(x * 100) + '%';
// A big amount, short: $1.0M, $1.08M; under a million, the dollars.
const big = (x) => { if (x === null || x === undefined) return 'missing'; if (Math.abs(x) < 1e6) return money(x); let t = (x / 1e6).toFixed(2); if (t.endsWith('0')) t = t.slice(0, -1); return '$' + t + 'M'; };
// A flag as a card on Today: a short headline, one line of numbers, one action (a verb; a field to open, or a page),
// and sometimes a second, smaller way. prefill: a value the field opens with, ready to accept.
const cardOf = (headline, line, action, alt = null) => ({ headline, line, action, alt });
const pct1 = (x) => (Math.round(x * 1000) / 10).toFixed(1) + '%';
const rateWords = (x) => String(Math.round(x * 10000) / 100) + '%';
const months1 = (x) => (Math.round(x * 10) / 10).toFixed(1);

export const STAGES = ['red', 'yellow', 'green'];
const STAGE_NUMBER = { red: 1, yellow: 2, green: 3 };

// A goal: the words, the target, the gap from today, and with a date, the
// monthly amount over the payments left (months after the as-of month through
// the month of the date).
export function goal(asOf, text, { target = null, gap = null, by = null, path = null } = {}) {
  const months = by ? paymentsBefore(asOf, by) : null;
  const monthly = by && gap !== null && gap > 0 && months ? gap / months : null;
  const when = monthly !== null ? ' (' + money(Math.ceil(monthly)) + ' a month, ' + monthWords(addMonths(monthKey(asOf), 1)) + ' to ' + monthWords(monthKey(by)) + ')' : '';
  return { text: text + when, target, gap, by, months, monthly, path };
}

// Stage by a value against two thresholds. high: bigger is worse (utilization).
export function stageFor(value, redOver, greenAtOrUnder) {
  if (value === null || value === undefined) return null;
  if (value > redOver) return 'red';
  return value <= greenAtOrUnder ? 'green' : 'yellow';
}

// s: the summary from summary.js (cashflow, sheet, debt, emergency, fi, tax).
export function buildFlags(spine, rules, s) {
  const asOf = s.asOf, year = +asOf.slice(0, 4);
  const R = (id) => rules.get(id, year);
  const out = [];
  const add = (f) => out.push({ rules: [], from: [], next: null, green: null, ...f, stageNumber: STAGE_NUMBER[f.stage], stageLabel: GROUP_WORDS[f.stage] });

  // ------------------------------------------------------------ the income cliff (S-174)
  const cl = s.cliff;
  if (cl) {
    const lk = cl.likelyStreams.map((x) => x.label + (x.weight < 1 ? ' at ' + pctWords(x.weight) : '')).join(', ');
    const best = (spine.income || []).filter((x) => x.likelihood && v(x.likelihood) < 1 && (!x.start || x.start <= cl.from + 'Z')).sort((a, b) => v(b.likelihood) - v(a.likelihood))[0];
    add({
      id: 'income-cliff', stage: 'red',
      title: 'From ' + longDate(cl.from) + ', certain income is $0 and costs are ' + money(cl.costs) + ' a month',
      detail: 'Costs then: spending ' + money(cl.spending.value) + ', minimum payments ' + money(cl.minimums.value) + (cl.setAside.value ? ', tax set-aside ' + money(cl.setAside.value) : '') + '. Likely income from then: ' + money(cl.likely.value) + ' a month' + (lk ? ' (' + lk + ')' : '') + '.',
      next: goal(asOf, 'Next: a confirmed income from ' + longDate(cl.from) + ' that covers ' + money(cl.costs) + ' a month', { target: Math.ceil(cl.costs), gap: cl.costs, path: best ? 'income.' + best.id + '.likelihood' : null }),
      green: goal(asOf, 'Goal: certain income covers the costs from ' + longDate(cl.from), { target: Math.ceil(cl.costs), path: best ? 'income.' + best.id + '.likelihood' : null }),
      card: cardOf('Income stops ' + longDate(cl.from), money(cl.costs) + ' a month of costs, ' + money(cl.likely.value) + ' likely income', { label: 'Confirm income', path: best ? 'income.' + best.id + '.likelihood' : null, href: best ? null : 'session.html#/income' }),
      from: [...new Set([...cl.spending.from, ...cl.minimums.from, ...cl.likely.from])], rules: ['STAGE_CLIFF_MONTHS']
    });
  }

  // ------------------------------------------------------------ the year's tax
  // red: an input is missing. yellow: a number, but rough or not covered by a
  // set-aside. green: every input known and the balance due is covered.
  const tax = s.tax;
  const ty = (spine.taxYears || []).find((x) => x.year === year);
  const setAside = ty && ty.setAside ? v(ty.setAside) : null;
  const setAsideKnown = !!(ty && ty.setAside && ty.setAside.kind === 'known');
  const due = tax.balanceDue.value;
  const nextDate = tax.nextEstimated;
  let taxStage, taxNext = null;
  const setAsidePath = ty && ty.setAside ? 'taxYears.' + ty.id + '.setAside' : null;
  // The goal matches the monthly tax set-aside (S-180): the balance due, by the return date,
  // at the set-aside's own monthly amount, so the flag and the surplus line agree.
  const returnDue = (year + 1) + '-' + R('TAX_RETURN_DUE');
  const line = (s.cashflow.taxSetAside.lines || []).find((l) => l.kind === 'balance' && l.taxYear === year);
  const pace = line && line.amount ? ' (' + money(Math.ceil(line.amount)) + ' a month, the tax set-aside)' : '';
  const coverGoal = (stageWord) => goal(asOf, stageWord + 'set aside ' + money(Math.ceil(Math.max(0, due))) + ' for the ' + year + ' tax by ' + longDate(returnDue) + (setAside ? ', ' + money(Math.ceil(Math.max(0, due - setAside))) + ' more than the ' + money(setAside) + ' set aside' : '') + pace, { target: Math.ceil(Math.max(0, due)), gap: Math.max(0, due - (setAside || 0)), path: setAsidePath });
  if (due === null) {
    taxStage = 'red';
    const first = tax.balanceDue.missing[0];
    taxNext = goal(asOf, 'Next: enter ' + (tax.missingText ? tax.missingText.replace(/^missing: /, '') : labelFor(spine, first)) + (tax.partial ? ' (at least ' + money(tax.partial.federalIncomeTax.value) + ' federal is due on the income known so far)' : ''), { path: first });
  } else if (due <= 0 || (setAsideKnown && setAside >= due)) {
    taxStage = tax.balanceDue.kind === 'computed' ? 'green' : 'yellow';
    if (taxStage === 'yellow') taxNext = goal(asOf, 'Next: confirm ' + labelFor(spine, tax.balanceDue.rough[0]) + (tax.balanceDue.rough.length > 1 ? ' (and ' + (tax.balanceDue.rough.length - 1) + ' more rough inputs)' : ''), { path: tax.balanceDue.rough[0] });
  } else {
    taxStage = 'yellow';
    taxNext = tax.balanceDue.kind === 'rough' ? goal(asOf, 'Next: confirm ' + labelFor(spine, tax.balanceDue.rough[0]) + ', and ' + coverGoal('').text, { path: tax.balanceDue.rough[0], gap: Math.max(0, due - (setAside || 0)) }) : coverGoal('Next: ');
  }
  const taxGreen = goal(asOf, 'Goal: every ' + year + ' tax input known, and the balance due set aside by ' + longDate(returnDue) + pace, { target: due === null ? null : Math.ceil(due), gap: due === null ? null : Math.max(0, due - (setAside || 0)), path: setAsidePath });
  const taxBits = { stage: taxStage, next: taxStage === 'green' ? null : taxNext, green: taxStage === 'green' ? null : taxGreen };
  add({
    id: 'tax-' + year, ...taxBits,
    title: due === null ? 'The ' + year + ' tax bill cannot be figured yet' : 'Estimated ' + year + ' balance due: ' + money(due),
    detail: (due === null ? 'It needs ' + (tax.missingText || 'more inputs').replace(/^missing: /, '') + '. ' : '') + 'Next estimated payment date: ' + longDate(nextDate.date) + '.' + (setAside !== null && due !== null ? ' Set aside so far: ' + money(setAside) + '.' : ''),
    card: due === null ? cardOf('Your ' + year + ' tax needs numbers', 'Missing: ' + (tax.missingText || 'more inputs').replace(/^missing: (\d{4} )?/, ''), { label: 'Fill in taxes', path: tax.balanceDue.missing[0] || null, href: tax.balanceDue.missing[0] ? null : 'ledger.html#/taxes' })
      : taxStage === 'green' ? cardOf('Your ' + year + ' tax is covered', money(due) + ' due, set aside', { label: 'See taxes', href: 'ledger.html#/taxes' })
        : due > 0 && !(setAsideKnown && setAside >= due) ? cardOf('Set aside for your ' + year + ' tax', money(due) + ' due by ' + longDate(returnDue) + (line && line.amount ? ', ' + money(Math.ceil(line.amount)) + ' a month' : ''), { label: 'Set money aside', path: setAsidePath, href: setAsidePath ? null : 'ledger.html#/taxes' })
          : cardOf('Confirm your ' + year + ' tax numbers', money(due) + ' estimated, ' + tax.balanceDue.rough.length + (tax.balanceDue.rough.length === 1 ? ' guess' : ' guesses'), { label: 'Confirm numbers', path: tax.balanceDue.rough[0] || null, href: 'ledger.html#/taxes' }),
    from: [...new Set([...tax.balanceDue.from, ...(setAsidePath ? [setAsidePath] : [])])], rules: [nextDate.rule, ...tax.balanceDue.rules]
  });

  // Roth conversion this year: taxable income with nothing withheld. Same stage as the tax bill.
  for (const a of spine.accounts || []) for (const c of v(a.conversions) || []) {
    if (c.year !== year) continue;
    add({
      id: 'roth-conversion-' + a.id, ...taxBits,
      title: 'Roth conversion adds ' + year + ' taxable income',
      detail: 'The ' + money(c.taxable ?? c.amount) + ' converted in ' + year + ' counts as ' + year + ' taxable income. No tax was withheld from it.',
      card: cardOf('A Roth conversion adds tax', money(c.taxable ?? c.amount) + ' in ' + year + ', nothing withheld', { label: 'See taxes', href: 'ledger.html#/taxes' }),
      from: ['accounts.' + a.id + '.conversions']
    });
  }

  // Unemployment with no federal withholding. Same stage as the tax bill.
  for (const st of spine.income || []) {
    if (st.type !== 'unemployment' || v(st.withholding && st.withholding.federal) !== 0) continue;
    if ((st.start && st.start > year + '-12-31') || (st.end && st.end < year + '-01-01')) continue;
    const floor = tax.partial && tax.partial.federalIncomeTax.value;
    const detail = due !== null
      ? 'Estimated ' + year + ' balance due: ' + money(due) + '. Next estimated payment date: ' + longDate(nextDate.date) + '.'
      : 'The ' + year + ' balance due cannot be figured yet (' + tax.missingText + '). Tax on the ' + year + ' income known so far is at least ' + money(floor) + ' federal, and the unemployment (' + money(tax.inputs.unemployment) + ' in ' + year + ') had none withheld. Next estimated payment date: ' + longDate(nextDate.date) + '.';
    add({ id: 'unemployment-withholding-' + st.id, ...taxBits, title: st.label + ' has no federal tax withheld', detail, card: cardOf(st.label + ': no tax withheld', due !== null ? money(due) + ' due for ' + year : 'At least ' + money(floor) + ' federal for ' + year, { label: 'Plan for the tax', href: 'ledger.html#/taxes' }), from: ['income.' + st.id + '.withholding.federal', ...tax.balanceDue.missing], rules: [nextDate.rule, ...tax.balanceDue.rules] });
  }

  // ------------------------------------------------------------ utilization
  // Per card (cards that report to personal credit, or might) and the personal
  // total. red over STAGE_UTIL_RED, green at or under STAGE_UTIL_GREEN.
  const red = R('STAGE_UTIL_RED'), green = R('STAGE_UTIL_GREEN');
  const utilRules = ['STAGE_UTIL_RED', 'STAGE_UTIL_GREEN'];
  for (const c of s.debt.utilization.items) {
    if (c.reports === false || c.util.value === null) continue;
    const stage = stageFor(c.util.value, red, green);
    const card = spine.debts.find((d) => d.id === c.id);
    const by = card.promoEnds && v(card.promoEnds) && v(card.promoEnds) >= asOf ? v(card.promoEnds) : null;
    const path = 'debts.' + c.id + '.balance';
    const downTo = (share, word) => {
      const target = Math.floor(c.limit * share);
      return goal(asOf, word + 'pay it down to ' + money(target) + ' (' + pctWords(share) + ' of ' + money(c.limit) + '): ' + money(c.balance - target) + ' to go', { target, gap: c.balance - target, by, path });
    };
    add({
      id: 'utilization-' + c.id, stage,
      title: c.name + ' is at ' + pctWords(c.util.value) + ' of its limit',
      card: cardOf(c.name + ' is ' + pctWords(c.util.value) + ' of its limit', money(c.balance) + ' of ' + money(c.limit) + (stage === 'green' ? '' : '; paying ' + money(c.balance - Math.floor(c.limit * (stage === 'red' ? red : green))) + ' gets it to ' + pctWords(stage === 'red' ? red : green)), { label: stage === 'green' ? 'See the card' : 'Plan a payment', path }),
      detail: money(c.balance) + ' of ' + money(c.limit) + '. Over ' + pctWords(red) + ' of a limit counts against a credit score' + (c.reports === null ? ', if this card reports to personal credit (not entered yet)' : '') + '.',
      next: stage === 'red' ? downTo(red, 'Next: ') : stage === 'yellow' ? downTo(green, 'Next: ') : null,
      green: stage === 'green' ? null : downTo(green, 'Goal: '),
      from: c.util.from, rules: utilRules
    });
  }
  const pu = s.debt.utilization.personal, ov = s.debt.utilization.overall, cs = s.debt.creditScore;
  if (pu.value !== null) {
    const stage = stageFor(pu.value, red, green);
    const path = cs.smallest ? 'debts.' + cs.smallest.id + '.balance' : pu.from[0];
    const payTo = (share, word) => {
      const target = Math.floor(pu.limit * share);
      return goal(asOf, word + 'paying ' + money(pu.balance - target) + ' across personal cards gets them to ' + pctWords(share) + ' (' + money(target) + ' of ' + money(pu.limit) + ')', { target, gap: pu.balance - target, path });
    };
    add({
      id: 'utilization-personal', stage,
      title: 'Personal cards are at ' + pct1(pu.value) + ' of their limits',
      card: cardOf('Cards are ' + pctWords(pu.value) + ' of their limits', money(pu.balance) + ' of ' + money(pu.limit) + (stage === 'green' ? '' : '; paying ' + money(pu.balance - Math.floor(pu.limit * (stage === 'red' ? red : green))) + ' gets them to ' + pctWords(stage === 'red' ? red : green)), { label: stage === 'green' ? 'See the cards' : 'Plan a payment', path }),
      detail: money(pu.balance) + ' of ' + money(pu.limit) + ' on the cards that report to personal credit; over ' + pctWords(red) + ' counts against a credit score.' + (ov.value !== null ? ' All cards, business ones included: ' + pct1(ov.value) + '.' : '') + (cs.smallest && cs.personalAfter.value !== null ? ' Paying off ' + cs.smallest.name + ' (' + money(cs.smallest.balance) + '), the smallest balance over ' + pctWords(red) + ', would bring personal utilization to ' + pct1(cs.personalAfter.value) + '.' : ''),
      next: stage === 'red' ? payTo(red, 'Next: ') : stage === 'yellow' ? payTo(green, 'Next: ') : null,
      green: stage === 'green' ? null : payTo(green, 'Goal: '),
      from: pu.from, rules: utilRules
    });
  }

  // ------------------------------------------------------------ promo deadlines
  // red: the monthly amount that clears them in time is more than the monthly
  // surplus. yellow: it fits. green: every promo balance is paid off.
  const pr = s.debt.promo;
  const promoCards = (spine.debts || []).filter((d) => v(d.promoEnds) && v(d.promoEnds) >= asOf && v(d.promoApr) !== null);
  if (promoCards.length) {
    const surplus = s.cashflow.surplus.value;
    const last = pr.items.length ? pr.items[pr.items.length - 1].promoEnds : promoCards.map((d) => v(d.promoEnds)).sort().pop();
    const stage = !pr.items.length ? 'green' : surplus === null || pr.monthly.value > surplus ? 'red' : 'yellow';
    const after = (x) => x.aprAfter === null ? 'goes to its regular rate (not entered) on ' + longDate(x.switchDate) + ' if not paid' : 'goes to ' + rateWords(x.aprAfter) + (x.aprAfterKind === 'rough' ? ' (rough)' : '') + ' on ' + longDate(x.switchDate) + ' if not paid';
    const lines = pr.items.map((x) => money(x.balance) + ' on ' + x.name + ' ' + after(x) + ' (' + money(x.monthlyNeeded, true) + ' a month over ' + x.paymentsLeft + ' payments clears it' + (x.deferredInterest === true ? '; interest is deferred, so any balance left then can be charged interest from the start' : x.deferredInterest === null ? '; whether interest is deferred is not entered' : '') + ')');
    const path = pr.items.length ? 'debts.' + pr.items[0].id + '.balance' : null;
    const allPaid = (word) => goal(asOf, word + money(pr.total.value) + ' paid by ' + longDate(last), { target: 0, gap: pr.total.value, by: last, path });
    add({
      id: 'promo-deadlines', stage,
      title: stage === 'green' ? 'Every promo balance is paid off' : money(pr.total.value) + ' in promo balances due by ' + longDate(last),
      card: stage === 'green' ? cardOf('Promo balances are paid off', 'Nothing left on a 0% rate', { label: 'See the cards', href: 'ledger.html#/debt' }) : cardOf('Promo rates end ' + longDate(last), money(pr.total.value) + ' left; ' + money(Math.ceil(pr.monthly.value)) + ' a month clears it' + (stage === 'red' ? ', ' + money(Math.ceil(pr.monthly.value - (surplus ?? 0))) + ' more than your surplus' : ''), { label: 'Plan payments', path }),
      detail: stage === 'green' ? 'Nothing is left on a 0% intro rate.' : 'Clearing them in time takes about ' + money(pr.monthly.value, true) + ' a month: ' + lines.join('; ') + '.',
      next: stage === 'red'
        ? goal(asOf, 'Next: free up ' + money(Math.ceil(pr.monthly.value - (surplus ?? 0))) + ' a month: clearing the promos takes ' + money(Math.ceil(pr.monthly.value)) + ' a month' + (surplus === null ? ' and the monthly surplus is not known yet' : ' and the monthly surplus is ' + money(surplus)), { target: Math.ceil(pr.monthly.value), gap: pr.monthly.value - (surplus ?? 0), path })
        : stage === 'yellow' ? allPaid('Next: ') : null,
      green: stage === 'green' ? null : allPaid('Goal: '),
      from: pr.total.from
    });
  }

  // ------------------------------------------------------------ income ending
  // red: nothing at least STAGE_REPLACE_YELLOW likely follows. yellow: something
  // that likely does. green: a confirmed replacement (likelihood 1 and an amount).
  const days = R('APP_INCOME_END_DAYS');
  const horizon = addDays(asOf, days);
  const weightOf = (o) => (o.likelihood ? v(o.likelihood) : 1);
  for (const st of spine.income || []) {
    if (!st.end || st.end <= asOf || st.end > horizon) continue;
    const after = (spine.income || []).filter((o) => o !== st && o.type !== 'maybeMoney' && (!o.end || o.end > st.end) && (!o.start || o.start <= addDays(st.end, 31)) && (!o.start || o.start > asOf));
    const known = after.filter((o) => v(o.amount) !== null);
    const confirmed = known.filter((o) => weightOf(o) === 1);
    const likely = known.filter((o) => (weightOf(o) ?? 0) >= R('STAGE_REPLACE_YELLOW')).sort((a, b) => weightOf(b) - weightOf(a));
    const stage = confirmed.length ? 'green' : likely.length ? 'yellow' : 'red';
    const named = after.map((o) => o.label + (v(o.amount) === null ? ' (amount missing)' : o.likelihood ? ' (' + pctWords(v(o.likelihood)) + ' likely)' : ''));
    const lost = st.cadence === 'weekly' || st.cadence === 'biweekly' || st.cadence === 'monthly' || st.cadence === 'semimonthly' ? v(st.amount) * { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12 }[st.cadence] / 12 : null;
    const best = likely[0] || after[0] || null;
    const bestPath = best ? (v(best.amount) === null ? 'income.' + best.id + '.amount' : 'income.' + best.id + '.likelihood') : 'income.' + st.id + '.end';
    const confirmGoal = (word) => goal(asOf, word + 'a confirmed replacement' + (lost !== null ? ' for the ' + money(lost) + ' a month that ends' : '') + (best ? ' (confirm ' + best.label + ')' : ''), { gap: lost, path: bestPath });
    add({
      id: 'income-ends-' + st.id, stage,
      title: st.label + ' ends ' + longDate(st.end) + ', in ' + daysBetween(asOf, st.end) + ' days',
      card: cardOf(st.label + ' ends in ' + daysBetween(asOf, st.end) + ' days', (lost !== null ? money(lost) + ' a month ends ' : 'Ends ') + longDate(st.end) + (stage === 'green' ? ', replaced' : ''), { label: stage === 'green' ? 'See income' : 'Confirm what comes next', path: bestPath }),
      detail: stage === 'green' ? 'Replaced by ' + listWords(confirmed.map((o) => o.label)) + ' (confirmed).' : named.length ? 'What follows: ' + listWords(named) + '. None of it is confirmed yet.' : 'No income is entered to follow it.',
      next: stage === 'red' ? goal(asOf, 'Next: a replacement at least ' + pctWords(R('STAGE_REPLACE_YELLOW')) + ' likely, with an amount' + (lost !== null ? ' (' + money(lost) + ' a month ends)' : ''), { gap: lost, path: bestPath }) : stage === 'yellow' ? confirmGoal('Next: ') : null,
      green: stage === 'green' ? null : confirmGoal('Goal: '),
      from: ['income.' + st.id + '.amount', ...after.flatMap((o) => ['income.' + o.id + '.amount', ...(o.likelihood ? ['income.' + o.id + '.likelihood'] : [])])],
      rules: ['APP_INCOME_END_DAYS', 'STAGE_REPLACE_YELLOW']
    });
  }

  // ------------------------------------------------------------ runway
  // red under STAGE_RUNWAY_RED_MONTHS; yellow up to the Rule of 5 target; green at it.
  const em = s.emergency;
  const rw = em.tiers.full.runway;
  if (rw.value !== null && em.monthlyNeed) {
    const redMonths = R('STAGE_RUNWAY_RED_MONTHS'), target = em.targetMonths.value;
    const stage = rw.value < redMonths ? 'red' : target !== null && rw.value < target ? 'yellow' : 'green';
    const cashAcc = (spine.accounts || []).filter((a) => a.family === 'cash' && !isEarmarked(a));
    const home = cashAcc.find((a) => v(a.role) === 'emergency') || cashAcc.find((a) => ['savings', 'hysa'].includes(a.type)) || cashAcc[0];
    const path = home ? 'accounts.' + home.id + '.balance' : rw.from[0];
    const cash = s.sheet.cash.value;
    const toMonths = (m, word, extra) => { const t = Math.ceil(m * em.monthlyNeed); return goal(asOf, word + money(t) + ' in cash gets you to ' + (m === 1 ? '1 month' : m + ' months') + extra + ' (' + money(Math.max(0, t - cash)) + ' more)', { target: t, gap: Math.max(0, t - cash), path }); };
    const fat = em.tiers.fatOnly.runway.value;
    const back = em.backstop.contributions.value;
    add({
      id: 'runway', stage, title: 'Cash covers ' + months1(rw.value) + ' months of spending',
      card: cardOf('Cash covers ' + months1(rw.value) + ' months', money(cash) + ' now' + (stage === 'green' || target === null ? '' : '; ' + money(Math.ceil((stage === 'red' ? redMonths : target) * em.monthlyNeed)) + ' covers ' + (stage === 'red' ? redMonths : target) + ' months'), { label: stage === 'green' ? 'See your cash' : 'Build the cushion', path }),
      detail: money(cash) + ' in cash against ' + money(em.tiers.full.burn.value) + ' a month (expenses plus minimum payments)' + (fat !== null ? '; ' + months1(fat) + ' months on food, housing and transportation alone' : '') + '.' + (back ? ' Roth contributions of ' + money(back) + ' can come out with no tax or penalty; they are not counted as cash.' : '') + (s.sheet.setAsideNote ? ' ' + s.sheet.setAsideNote : ''),
      next: stage === 'red' ? toMonths(redMonths, 'Next: ', '') : stage === 'yellow' ? toMonths(target, 'Next: ', ', the Rule of 5 target') : null,
      green: stage === 'green' || target === null ? null : toMonths(target, 'Goal: ', ', the Rule of 5 target'),
      from: rw.from, rules: ['STAGE_RUNWAY_RED_MONTHS', 'APP_RULE_OF_5']
    });
  }

  // ------------------------------------------------------------ FI goal vs spending
  // red: the goal is under STAGE_FI_YELLOW_RATIO of what today's spending
  // implies; yellow up to STAGE_FI_GREEN_RATIO; green at or over. Each goal shows
  // both fixes: the FI goal it takes, or the monthly spending it takes.
  const fi = s.fi;
  const wr = v(spine.assumptions.withdrawalRate);
  if (fi.goal.value !== null && fi.implied.value && wr) {
    const ratio = fi.goal.value / fi.implied.value;
    const yr = R('STAGE_FI_YELLOW_RATIO'), gr = R('STAGE_FI_GREEN_RATIO');
    const stage = ratio < yr ? 'red' : ratio < gr ? 'yellow' : 'green';
    const spend = s.cashflow.expenses.total.value;
    const goalRec = (spine.goals || []).find((g) => g.type === 'fi');
    const path = 'goals.' + goalRec.id + (goalRec.fiNumber ? '.fiNumber' : '.annualSpending');
    const fix = (share, word) => {
      const goalNeeded = Math.ceil(share * fi.implied.value);
      const spendNeeded = Math.floor(fi.goal.value * wr / 12 / share);
      return goal(asOf, word + 'an FI goal of ' + money(goalNeeded) + ' or more (' + money(goalNeeded - fi.goal.value) + ' higher), or spending of ' + money(spendNeeded) + ' a month or less (' + money(Math.max(0, Math.ceil(spend - spendNeeded))) + ' less)', { target: goalNeeded, gap: goalNeeded - fi.goal.value, path });
    };
    const ys = fix(yr, 'Next: '), gs = fix(gr, 'Goal: ');
    add({
      id: 'fi-goal-gap', stage,
      title: stage === 'green' ? 'The FI goal covers today\'s spending' : 'The FI goal is below what today\'s spending implies',
      card: stage === 'green' ? cardOf('Your FI goal covers your spending', big(fi.goal.value) + ' goal vs ' + big(fi.implied.value) + ' your spending needs', { label: 'See goals', href: 'ledger.html#/goals' })
        : cardOf(stage === 'red' ? 'Your FI goal is too low' : 'Your FI goal is a little low', big(fi.goal.value) + ' goal vs ' + big(fi.implied.value) + ' your spending needs', { label: 'Update goal', path, prefill: goalRec.fiNumber ? Math.ceil(fi.implied.value) : Math.ceil(spend * 12) }, { label: 'Or lower spending', href: 'ledger.html#/needs' }),
      detail: 'Goal: ' + money(fi.goal.value) + '. Today\'s spending (' + money(spend) + ' a month, before debt payments) at a ' + pctWords(wr) + ' withdrawal rate implies ' + money(fi.implied.value) + ' (the goal is ' + pctWords(ratio) + ' of it).',
      next: stage === 'red' ? { ...ys, spendingNeeded: Math.floor(fi.goal.value * wr / 12 / yr), goalNeeded: Math.ceil(yr * fi.implied.value) } : stage === 'yellow' ? { ...fix(gr, 'Next: '), spendingNeeded: Math.floor(fi.goal.value * wr / 12 / gr), goalNeeded: Math.ceil(gr * fi.implied.value) } : null,
      green: stage === 'green' ? null : { ...gs, spendingNeeded: Math.floor(fi.goal.value * wr / 12 / gr), goalNeeded: Math.ceil(gr * fi.implied.value) },
      from: [...fi.goal.from, ...fi.implied.from], rules: ['STAGE_FI_YELLOW_RATIO', 'STAGE_FI_GREEN_RATIO']
    });
  }

  // ------------------------------------------------------------ health coverage switch
  // red: under STAGE_COVERAGE_RED_DAYS away with no plan type. green: enrolled
  // and money set aside for it. yellow: anything in between.
  const ageLimit = R('APP_HEALTH_PARENT_AGE');
  for (const p of spine.household.people) {
    const birth = v(p.birthDate);
    if (!birth) continue;
    const cov = (spine.household.healthCoverage || []).filter((e) => !e.personId || e.personId === p.id);
    const now = inForce(cov, asOf);
    const change = cov.filter((e) => e.from && e.from > asOf).sort((a, b) => (a.from < b.from ? -1 : 1))[0] || null;
    if (!now || (v(now.value) !== 'parent_plan' && !change)) continue;
    const turns = (+birth.slice(0, 4) + ageLimit) + birth.slice(4);
    const when = change ? change.from : turns;
    if (when <= asOf) continue;
    const base = change ? 'household.healthCoverage.' + change.id : null;
    const costs = (spine.expenses || []).filter((e) => e.start && Math.abs(daysBetween(e.start, when)) <= 31);
    const cost = costs.length ? costs.reduce((a, e) => a + (v(e.amount) ?? 0), 0) : null;
    const plan = change && change.planType ? v(change.planType) : null;
    const enrolled = change && change.enrolled ? v(change.enrolled) : null;
    const saved = change && change.setAside ? v(change.setAside) : null;
    const left = daysBetween(asOf, when);
    const stage = enrolled === true && saved > 0 ? 'green' : left < R('STAGE_COVERAGE_RED_DAYS') && plan === null ? 'red' : 'yellow';
    const hsa = plan === null ? 'Plan type is not entered yet.' : ['hdhp', 'bronze', 'catastrophic'].includes(plan) ? 'This plan type qualifies.' : 'This plan type does not qualify.';
    const setAsideGoal = (word) => goal(asOf, word + 'enrolled, with ' + (cost ? money(cost) + ' (one month of the new cost)' : 'a set-aside') + ' set aside by ' + longDate(when), { target: cost, gap: cost === null ? null : Math.max(0, cost - (saved || 0)), by: when, path: base ? base + (enrolled === true ? '.setAside' : '.enrolled') : null });
    const nextGoal = plan === null && base ? goal(asOf, 'Next: enter the new plan type (HDHP, bronze, catastrophic or other)', { path: base + '.planType' })
      : cost === null ? goal(asOf, 'Next: enter the monthly cost of the new coverage', { path: base ? base + '.value' : null })
        : setAsideGoal('Next: ');
    add({
      id: 'health-26-' + p.id, stage,
      title: p.name + '\'s coverage ' + (v(now.value) === 'parent_plan' ? 'on a parent\'s plan ends at ' + ageLimit : 'changes') + ' (' + longDate(when) + ', in ' + left + ' days)',
      card: cardOf('Health coverage changes in ' + left + ' days', longDate(when) + (cost ? ', ' + money(cost) + ' a month after' : ''), { label: stage === 'green' ? 'See coverage' : 'Set up the new plan', path: nextGoal.path || (base ? base + '.value' : null), href: base ? null : 'ledger.html#/needs' }),
      detail: (costs.length ? listWords(costs.map((e) => money(v(e.amount)) + ' a month for ' + e.label)) + ' starts then. ' : '') + 'Putting money in an HSA depends on the new plan: an HDHP qualifies, and bronze and catastrophic plans count from 2026. ' + hsa,
      next: stage === 'green' ? null : nextGoal,
      green: stage === 'green' ? null : setAsideGoal('Goal: '),
      from: ['household.people.' + p.id + '.birthDate', ...(base ? [base + '.value', base + '.planType', base + '.enrolled', base + '.setAside'] : []), ...costs.map((e) => 'expenses.' + e.id + '.amount')],
      rules: ['APP_HEALTH_PARENT_AGE', 'HDHP_MIN_S', 'STAGE_COVERAGE_RED_DAYS']
    });
  }

  // ------------------------------------------------------------ subscriptions (S-191)
  // Yellow while one charges within SUB_RENEW_SOON_DAYS or has not been
  // reviewed in SUB_REVIEW_DAYS; green when every one has had a recent look.
  const sub = s.subs;
  if (sub && sub.items.length) {
    const look = sub.toLook;
    const stage = look.length ? 'yellow' : 'green';
    const soon = sub.items.filter((i) => i.soon);
    const due = sub.items.filter((i) => i.due);
    const first = look[0];
    add({
      id: 'subscriptions', stage,
      title: sub.items.length + ' subscription' + (sub.items.length === 1 ? '' : 's') + ': ' + money(sub.monthly.value) + ' a month (' + money(sub.yearly) + ' a year)',
      card: cardOf(stage === 'green' ? 'Subscriptions are checked' : due.length ? 'Subscriptions not checked in ' + sub.reviewDays + ' days' : 'A subscription charges soon', (look.length || sub.items.length) + ' subscription' + ((look.length || sub.items.length) === 1 ? '' : 's') + ', ' + money(look.length ? look.reduce((a, i) => a + (i.monthly ?? 0), 0) : sub.monthly.value) + ' a month', { label: 'Review subscriptions', href: 'ledger.html#/needs/subscriptions' }),
      detail: [soon.length ? 'Charging soon: ' + listWords(soon.map((i) => i.label + ' on ' + longDate(i.renews) + (i.monthly !== null ? ' (' + money(i.monthly) + ' a month)' : ''))) + '.' : null,
        due.length ? 'Not reviewed in ' + sub.reviewDays + ' days: ' + listWords(due.map((i) => i.label)) + '.' : null,
        stage === 'green' ? 'Every subscription was reviewed in the last ' + sub.reviewDays + ' days.' : null].filter(Boolean).join(' '),
      next: first ? goal(asOf, 'Next: look at ' + first.label + (first.soon ? ' before it charges on ' + longDate(first.renews) : '') + ' and mark it reviewed', { path: 'expenses.' + first.id + '.reviewed' }) : null,
      green: stage === 'green' ? null : goal(asOf, 'Goal: every subscription reviewed in the last ' + sub.reviewDays + ' days, none charging unseen'),
      from: sub.items.flatMap((i) => ['expenses.' + i.id + '.amount', 'expenses.' + i.id + '.renews', 'expenses.' + i.id + '.reviewed']),
      rules: ['SUB_REVIEW_DAYS', 'SUB_RENEW_SOON_DAYS']
    });
  }

  // ------------------------------------------------------------ inputs of each headline number
  // red: an input is missing. yellow: an input is rough. green: every input known.
  const inputs = [
    ['tax', year + ' tax', tax.balanceDue],
    ['takehome', 'Monthly take-home', s.cashflow.income.takeHome],
    ['surplus', 'Left after saving', s.cashflow.surplus],
    ['utilization', 'Personal card utilization', s.debt.utilization.personal],
    ['networth', 'Net worth', s.sheet.netWorth],
    ['fi', 'FI percent', fi.fiPercent],
    ['runway', 'Cash runway', em.tiers.full.runway]
  ];
  for (const [id, what, r] of inputs) {
    if (!r) continue;
    const missing = [...new Set(r.missing || [])], rough = [...new Set(r.rough || [])];
    const stage = missing.length ? 'red' : rough.length ? 'yellow' : 'green';
    const fields = (list) => listWords(list.map((p) => labelFor(spine, p)));
    add({
      id: 'input-' + id, stage,
      title: stage === 'red' ? what + ' needs ' + missing.length + ' input' + (missing.length === 1 ? '' : 's') : stage === 'yellow' ? what + ' uses ' + rough.length + ' rough number' + (rough.length === 1 ? '' : 's') : what + ': every input known',
      card: cardOf(stage === 'red' ? what + ' is missing a number' : stage === 'yellow' ? what + ' rests on guesses' : what + ' is complete', stage === 'red' ? 'Needs ' + labelFor(spine, missing[0]) + (missing.length > 1 ? ' and ' + (missing.length - 1) + ' more' : '') : stage === 'yellow' ? rough.length + (rough.length === 1 ? ' guess' : ' guesses') : 'Every number it uses is known', { label: stage === 'red' ? 'Fill it in' : stage === 'yellow' ? 'Firm it up' : 'See it', path: missing[0] || rough[0] || null, href: missing[0] || rough[0] ? null : 'ledger.html' }),
      detail: stage === 'red' ? 'Needs: ' + fields(missing) + '.' : stage === 'yellow' ? 'Rough: ' + fields(rough) + '.' : 'Every number it uses is known.',
      next: stage === 'red' ? goal(asOf, 'Next: enter ' + labelFor(spine, missing[0]) + (missing.length > 1 ? ' (and ' + (missing.length - 1) + ' more)' : ''), { path: missing[0] })
        : stage === 'yellow' ? goal(asOf, 'Next: confirm ' + labelFor(spine, rough[0]) + (rough.length > 1 ? ' (and ' + (rough.length - 1) + ' more)' : ''), { path: rough[0] }) : null,
      green: stage === 'green' ? null : goal(asOf, 'Goal: every input known', { path: missing[0] || rough[0] }),
      from: missing.length ? missing : rough.length ? rough : r.from || []
    });
  }

  // Red first, then yellow, then green; the order within a stage is kept.
  return out.map((f, i) => [f, i]).sort((a, b) => a[0].stageNumber - b[0].stageNumber || a[1] - b[1]).map(([f]) => f);
}
