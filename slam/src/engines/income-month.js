// Income for one month (S-118): the estimate (take-home a month, from Setup, Income: one stored number
// a paycheck), the plan, and the actual from the log.
//
// Plan: scheduled pay (a W-2 or unemployment paycheck) is the take-home a paycheck x the real number of
// paydays in the month from the pay schedule ("3 paychecks this month"), never typed. Side and variable
// income start from the estimate and can be changed for the month (plans[month].income).
// Actual: each source's income entries in the log (paychecks confirmed with "It happened", imported
// deposits, quick entries marked income), "from your log, N entries". A source with no entries can take
// a typed amount, or "none this month" (doc.incomeActuals[month]); otherwise it is still empty.
// Income entries with no source count too (the money landed) and are a month-end checklist item.
// The month's income is tracked when any of it is known; then the surplus uses it (totals.js).
// Depends on normalize.js (toMonthly), log.js (counted), calendar.js (payDates) and money.js (r2, minus).
// Dollars a month, to the cent; log amounts are negative for money in, so income sums are negated.

import { toMonthly } from './normalize.js';
import { counted } from './log.js';
import { payDates } from './calendar.js';
import { r2, minus } from './money.js';

// Paychecks a year by frequency; a scheduled source needs one of these to count its paydays.
const PER_YEAR = { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12 };
const SCHEDULED = ['w2', 'unemployment'];

/**
 * Scheduled pay: W-2 or unemployment with a known pay frequency, so paydays can be counted.
 * @param {object} inc an income source.
 * @returns {boolean}
 */
export const isScheduled = (inc) => SCHEDULED.includes(inc.type) && !!PER_YEAR[inc.payFrequency];

/**
 * Income entries in the log for a month (deleted and pending-match entries left out).
 * @param {object} doc the household file.
 * @param {string} month 'YYYY-MM'.
 * @returns {object[]} log entries of kind 'income'; amounts negative (money in), as the log stores them.
 */
export function incomeEntries(doc, month) {
  return counted(doc.transactions || []).filter((t) => t.kind === 'income' && t.date.slice(0, 7) === month);
}

/**
 * One month's income: estimate, plan and actual per source, and in total.
 * @param {object} doc the household file.
 * @param {object} income the income summary (summary.income); archived sources drop out.
 * @param {string} month 'YYYY-MM'.
 * @returns {object} dollars a month, to the cent: { month, sources, unassigned, tracked, estimate, plan, actual, gapFromEstimate,
 *   gapFromPlan, empty, logged }; each source { id, label, type, scheduled, estimate, plan, planNote, paydays, actual,
 *   from ('log', 'typed', 'none' or null), status, gapFromEstimate, gapFromPlan, count }; a gap is null until both sides exist.
 */
export function incomeMonth(doc, income, month) {
  const live = (doc.income || []).filter((i) => i.state !== 'archived');
  const entries = incomeEntries(doc, month);
  const typed = (doc.incomeActuals || {})[month] || {};
  const planned = ((doc.plans || {})[month] || {}).income || {};
  const sources = live.map((inc) => {
    const s = (income.sources || []).find((x) => x.id === inc.id) || {};
    const estimate = s.takeHomeMonthly === undefined ? null : s.takeHomeMonthly;
    let plan = estimate;
    let paydays = null;
    let planNote = '';
    if (isScheduled(inc)) {
      const dates = payDates(inc, month);
      // Back from the monthly estimate to one paycheck (x 12 / paychecks a year), then times the real paydays this month.
      const per = estimate === null ? null : r2((estimate * 12) / PER_YEAR[inc.payFrequency]);
      // No next pay date means paydays cannot be counted: the plan stays at the estimate.
      if (dates) {
        paydays = dates.length;
        plan = per === null ? null : r2(per * dates.length);
        planNote = dates.length + (dates.length === 1 ? ' paycheck' : ' paychecks') + ' this month';
      }
    } else if (planned[inc.id] && planned[inc.id].amount !== null && planned[inc.id].amount !== undefined) {
      // The month's plan amount is a Value; 'monthly' only matters if its cadence is per paycheck.
      plan = toMonthly(planned[inc.id], 'monthly');
      planNote = 'changed for this month';
    }
    const mine = entries.filter((t) => t.incomeId === inc.id);
    const t = typed[inc.id];
    let actual = null;
    let from = null;
    let status = null;
    // Log entries win over a typed amount. "None this month" is an answer: actual 0, not empty.
    if (mine.length) {
      actual = r2(-mine.reduce((a, x) => a + x.amount, 0));
      from = 'log';
      status = 'computed';
    } else if (t && t.status === 'not-for-me') {
      actual = 0;
      from = 'none';
      status = 'not-for-me';
    } else if (t && t.amount !== null && t.amount !== undefined) {
      actual = t.amount;
      from = 'typed';
      status = t.status;
    }
    return {
      id: inc.id,
      label: inc.label,
      type: inc.type,
      scheduled: isScheduled(inc),
      estimate,
      plan,
      planNote,
      paydays,
      actual,
      from,
      status,
      gapFromEstimate: minus(actual, estimate),
      gapFromPlan: minus(actual, plan),
      count: mine.length
    };
  });
  const known = new Set(live.map((i) => i.id));
  const loose = entries.filter((t) => !t.incomeId || !known.has(t.incomeId));
  const unassigned = {
    count: loose.length,
    amount: r2(-loose.reduce((a, x) => a + x.amount, 0)),
    ids: loose.map((x) => x.id)
  };
  const tracked = sources.some((x) => x.actual !== null) || loose.length > 0;
  // A total is null while any source is missing that number (empty is not zero).
  const add = (xs) => (xs.some((x) => x === null) ? null : r2(xs.reduce((a, x) => a + x, 0)));
  const estimate = add(sources.map((x) => x.estimate));
  const plan = add(sources.map((x) => x.plan));
  // Only what is known adds up; sources still empty are named.
  const actual = tracked ? r2(sources.reduce((a, x) => a + (x.actual || 0), 0) + unassigned.amount) : null;
  return {
    month,
    sources,
    unassigned,
    tracked,
    estimate,
    plan,
    actual,
    // Actual against the estimate and against the plan (null until both sides exist).
    gapFromEstimate: minus(actual, estimate),
    gapFromPlan: minus(actual, plan),
    empty: sources.filter((x) => x.actual === null).map((x) => x.label),
    logged: r2(-entries.reduce((a, x) => a + x.amount, 0))
  };
}
