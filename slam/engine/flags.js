// Flags: plain-English alerts built from the data. They say what is true and
// what it means in dollars and dates; they never tell anyone what to do.
// Each flag: { id, level: act | watch | info, title, detail, from: [paths], rules: [ids] }.

import { valueOf, daysBetween, addDays, inForce } from './spine.js';
import { labelFor, listWords } from './labels.js';
import { money } from '../src/ui/format.js';

const v = valueOf;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const longDate = (iso) => MONTHS[+iso.slice(5, 7) - 1] + ' ' + +iso.slice(8, 10) + ', ' + iso.slice(0, 4);
const pctWords = (x) => Math.round(x * 100) + '%';
const pct1 = (x) => (Math.round(x * 1000) / 10).toFixed(1) + '%';
const rateWords = (x) => String(Math.round(x * 10000) / 100) + '%';
const months1 = (x) => (Math.round(x * 10) / 10).toFixed(1);

// s: the summary from summary.js (cashflow, sheet, debt, emergency, fi, tax).
export function buildFlags(spine, rules, s) {
  const asOf = s.asOf, year = +asOf.slice(0, 4);
  const out = [];
  const add = (f) => out.push({ rules: [], from: [], ...f });

  // Roth conversion this year: taxable income with nothing withheld.
  for (const a of spine.accounts || []) for (const c of v(a.conversions) || []) {
    if (c.year !== year) continue;
    add({
      id: 'roth-conversion-' + a.id, level: 'watch',
      title: 'Roth conversion adds ' + year + ' taxable income',
      detail: 'The ' + money(c.taxable ?? c.amount) + ' converted in ' + year + ' counts as ' + year + ' taxable income. No tax was withheld from it.',
      from: ['accounts.' + a.id + '.conversions']
    });
  }

  // Unemployment with no federal withholding.
  const tax = s.tax;
  for (const st of spine.income || []) {
    if (st.type !== 'unemployment' || v(st.withholding && st.withholding.federal) !== 0) continue;
    if ((st.start && st.start > year + '-12-31') || (st.end && st.end < year + '-01-01')) continue;
    const next = tax.nextEstimated;
    const due = tax.balanceDue.value;
    const floor = tax.partial && tax.partial.federalIncomeTax.value;
    const detail = due !== null
      ? 'Estimated ' + year + ' balance due: ' + money(due) + '. Next estimated payment date: ' + longDate(next.date) + '.'
      : 'The ' + year + ' balance due cannot be figured yet (' + tax.missingText + '). Tax on the ' + year + ' income known so far is at least ' + money(floor) + ' federal, and the unemployment (' + money(tax.inputs.unemployment) + ' in ' + year + ') had none withheld. Next estimated payment date: ' + longDate(next.date) + '.';
    add({ id: 'unemployment-withholding-' + st.id, level: 'act', title: st.label + ' has no federal tax withheld', detail, from: ['income.' + st.id + '.withholding.federal', ...tax.balanceDue.missing], rules: [next.rule, ...tax.balanceDue.rules] });
  }

  // Card utilization (S-158): per card, for cards that report to personal
  // credit (or may: unknown counts), and the personal total. Business cards
  // that do not report, and the overall total, are shown but not flagged.
  const warn = rules.get('APP_UTIL_WARN', year);
  for (const c of s.debt.utilization.items) {
    if (c.reports === false || c.util.value === null || c.util.value <= warn) continue;
    add({ id: 'utilization-' + c.id, level: 'watch', title: c.name + ' is at ' + pctWords(c.util.value) + ' of its limit', detail: money(c.balance) + ' of ' + money(c.limit) + '. Over ' + pctWords(warn) + ' of a limit counts against a credit score' + (c.reports === null ? ', if this card reports to personal credit (not entered yet)' : '') + '.', from: c.util.from, rules: ['APP_UTIL_WARN'] });
  }
  const pu = s.debt.utilization.personal, ov = s.debt.utilization.overall, cs = s.debt.creditScore;
  if (pu.value !== null && pu.value > warn) {
    add({
      id: 'utilization-personal', level: 'watch', title: 'Personal cards are at ' + pct1(pu.value) + ' of their limits',
      detail: money(pu.balance) + ' of ' + money(pu.limit) + ' on the cards that report to personal credit; over ' + pctWords(warn) + ' counts against a credit score.' + (ov.value !== null ? ' All cards, business ones included: ' + pct1(ov.value) + '.' : '') + (cs.smallest && cs.personalAfter.value !== null ? ' Paying off ' + cs.smallest.name + ' (' + money(cs.smallest.balance) + '), the smallest balance over ' + pctWords(warn) + ', would bring personal utilization to ' + pct1(cs.personalAfter.value) + '.' : ''),
      from: pu.from, rules: ['APP_UTIL_WARN']
    });
  }

  // Promo balances and the monthly amount that clears them in time.
  const pr = s.debt.promo;
  if (pr.items.length) {
    // "$700 on a card goes to 24% on April 1, 2027 if not paid": the rate after the intro, from the day after it ends.
    const after = (x) => x.aprAfter === null ? 'goes to its regular rate (not entered) on ' + longDate(x.switchDate) + ' if not paid' : 'goes to ' + rateWords(x.aprAfter) + (x.aprAfterKind === 'rough' ? ' (rough)' : '') + ' on ' + longDate(x.switchDate) + ' if not paid';
    const lines = pr.items.map((x) => money(x.balance) + ' on ' + x.name + ' ' + after(x) + ' (' + money(x.monthlyNeeded, true) + ' a month over ' + x.paymentsLeft + ' payments clears it' + (x.deferredInterest === true ? '; interest is deferred, so any balance left then can be charged interest from the start' : x.deferredInterest === null ? '; whether interest is deferred is not entered' : '') + ')');
    add({ id: 'promo-deadlines', level: 'act', title: money(pr.total.value) + ' in promo balances due by ' + longDate(pr.items[pr.items.length - 1].promoEnds), detail: 'Clearing them in time takes about ' + money(pr.monthly.value, true) + ' a month: ' + lines.join('; ') + '.', from: pr.total.from });
  }

  // Income ending soon with no confirmed replacement.
  const days = rules.get('APP_INCOME_END_DAYS', year);
  const horizon = addDays(asOf, days);
  for (const st of spine.income || []) {
    if (!st.end || st.end <= asOf || st.end > horizon) continue;
    const after = (spine.income || []).filter((o) => o !== st && (!o.end || o.end > st.end) && (!o.start || o.start <= addDays(st.end, 31)) && o.type !== 'maybeMoney');
    const confirmed = after.filter((o) => (!o.likelihood || v(o.likelihood) === 1) && v(o.amount) !== null && (!o.start || o.start > asOf || true));
    const replacements = confirmed.filter((o) => o.start && o.start > asOf);
    if (replacements.length) continue;
    const named = after.filter((o) => o.start && o.start > asOf).map((o) => o.label + (v(o.amount) === null ? ' (amount missing)' : o.likelihood ? ' (' + pctWords(v(o.likelihood)) + ' likely)' : ''));
    add({
      id: 'income-ends-' + st.id, level: 'act',
      title: st.label + ' ends ' + longDate(st.end) + ', in ' + daysBetween(asOf, st.end) + ' days',
      detail: named.length ? 'What follows: ' + listWords(named) + '. None of it is confirmed yet.' : 'No income is entered to follow it.',
      from: ['income.' + st.id + '.amount', ...after.flatMap((o) => ['income.' + o.id + '.amount', ...(o.likelihood ? ['income.' + o.id + '.likelihood'] : [])])],
      rules: ['APP_INCOME_END_DAYS']
    });
  }

  // Runway.
  const em = s.emergency;
  const rw = em.tiers.full.runway;
  if (rw.value !== null && rw.value < em.runwayWarnMonths) {
    const fat = em.tiers.fatOnly.runway.value;
    const back = em.backstop.contributions.value;
    add({
      id: 'runway', level: 'act', title: 'Cash covers ' + months1(rw.value) + ' months of spending',
      detail: money(s.sheet.cash.value) + ' in cash against ' + money(em.tiers.full.burn.value) + ' a month (expenses plus minimum payments)' + (fat !== null ? '; ' + months1(fat) + ' months on food, housing and transportation alone' : '') + '.' + (back ? ' Roth contributions of ' + money(back) + ' can come out with no tax or penalty; they are not counted as cash.' : ''),
      from: rw.from, rules: ['APP_RUNWAY_WARN']
    });
  }

  // FI goal below what today's spending implies.
  const fi = s.fi;
  if (fi.goalBelowImplied.value === true) {
    add({
      id: 'fi-goal-gap', level: 'watch', title: 'The FI goal is below what today\'s spending implies',
      detail: 'Goal: ' + money(fi.goal.value) + '. Today\'s spending (' + money(s.cashflow.expenses.total.value) + ' a month, before debt payments) at a ' + pctWords(v(spine.assumptions.withdrawalRate)) + ' withdrawal rate implies ' + money(fi.implied.value) + '.',
      from: [...fi.goal.from, ...fi.implied.from]
    });
  }

  // Health coverage changes at 26, and what HSA eligibility depends on.
  const ageLimit = rules.get('APP_HEALTH_PARENT_AGE', year);
  for (const p of spine.household.people) {
    const birth = v(p.birthDate);
    if (!birth) continue;
    const cov = (spine.household.healthCoverage || []).filter((e) => !e.personId || e.personId === p.id);
    const now = inForce(cov, asOf);
    if (!now || v(now.value) !== 'parent_plan') continue;
    const turns = (+birth.slice(0, 4) + ageLimit) + birth.slice(4);
    const change = cov.find((e) => e.from && e.from > asOf) || null;
    const when = change ? change.from : turns;
    const costs = (spine.expenses || []).filter((e) => e.start && Math.abs(daysBetween(e.start, when)) <= 31);
    const plan = change && change.planType ? v(change.planType) : null;
    const hsa = plan === null ? 'Plan type is not entered yet.' : ['hdhp', 'bronze', 'catastrophic'].includes(plan) ? 'This plan type qualifies.' : 'This plan type does not qualify.';
    add({
      id: 'health-26-' + p.id, level: 'watch',
      title: p.name + '\'s coverage on a parent\'s plan ends at ' + ageLimit + ' (' + longDate(when) + ')',
      detail: (costs.length ? listWords(costs.map((e) => money(v(e.amount)) + ' a month for ' + e.label)) + ' starts then. ' : '') + 'Putting money in an HSA depends on the new plan: an HDHP qualifies, and bronze and catastrophic plans count from 2026. ' + hsa,
      from: ['household.people.' + p.id + '.birthDate', ...(change ? ['household.healthCoverage.' + change.id + '.value', 'household.healthCoverage.' + change.id + '.planType'] : []), ...costs.map((e) => 'expenses.' + e.id + '.amount')],
      rules: ['APP_HEALTH_PARENT_AGE', 'HDHP_MIN_S']
    });
  }

  // Results that need an input, naming the field.
  const needs = [
    ['tax', year + ' tax', tax.balanceDue, tax.missingText],
    ['takehome', 'Monthly take-home', s.cashflow.income.takeHome],
    ['surplus', 'Monthly surplus', s.cashflow.surplus],
    ['utilization', 'Personal card utilization', s.debt.utilization.personal],
    ['networth', 'Net worth', s.sheet.netWorth],
    ['fi', 'FI percent', fi.fiPercent],
    ['runway', 'Cash runway', em.tiers.full.runway]
  ];
  for (const [id, what, r, text] of needs) {
    if (!r || !r.missing || !r.missing.length) continue;
    const fields = [...new Set(r.missing)].map((p) => labelFor(spine, p));
    add({
      id: 'missing-' + id, level: 'info',
      title: what + (r.value === null ? ' cannot be figured yet' : ' is built without some inputs'),
      detail: (text ? text.charAt(0).toUpperCase() + text.slice(1) + '. ' : '') + 'Needs: ' + listWords(fields) + '.',
      from: r.missing
    });
  }

  const order = { act: 0, watch: 1, info: 2 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}
