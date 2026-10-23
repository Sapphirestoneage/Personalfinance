// The monthly plan (S-076): what a plan adds up to, where to start one from,
// and the side-by-side review of a month's actuals against next month's plan.
// Plan amounts come only from doc.plans; estimates are read, never written.
// Depends on model.js (budgetModel, primaryPayFrequency), normalize.js (toMonthly, hasAnswer), money.js
// (sumKnown, ratio, minus) and happiness.js (joy and stress per line). Dollars a month; a month is 'YYYY-MM'.

import { budgetModel, primaryPayFrequency } from './model.js';
import { toMonthly, hasAnswer } from './normalize.js';
import { sumKnown, ratio, minus } from './money.js';
import { happinessOf, happySpendShare, stressOf } from './happiness.js';

const blank = { amount: null, cadence: 'month', status: null, source: 'client', asOf: null, note: '' };
const copy = (v) => JSON.parse(JSON.stringify(v));

/**
 * The month before.
 * @param {string} key 'YYYY-MM'.
 * @returns {string} 'YYYY-MM'.
 */
export function prevMonthKey(key) {
  let [y, m] = key.split('-').map(Number);
  m -= 1;
  if (m < 1) {
    m = 12;
    y -= 1;
  }
  return y + '-' + String(m).padStart(2, '0');
}

/**
 * The category tree as it stands for a month: lines added in review for that
 * month are in, lines added for a later month are out.
 * @param {object} doc the household file.
 * @param {string} key 'YYYY-MM'.
 * @returns {object} what budgetModel returns, dollars a month.
 */
export function modelForMonth(doc, key) {
  if (key === doc.currentMonth) return budgetModel(doc);
  // Another open month: its typed actuals live in doc.monthActuals; a line with none is blank there, never this
  // month's number.
  const saved = (doc.monthActuals || {})[key] || {};
  return budgetModel({
    ...doc,
    currentMonth: key,
    categories: doc.categories.map((c) => ({
      ...c,
      lines: c.lines.map((l) => ({ ...l, actual: saved[l.id] || blank }))
    }))
  });
}

/**
 * One month's actuals per line and per category, from wherever that month lives.
 * @param {object} doc the household file.
 * @param {object} history what monthHistory returns (summary.history).
 * @param {string} key 'YYYY-MM'.
 * @returns {{key: string, closed: boolean, lines: Object<string, ?number>, cats: Object<string, ?number>, spending: ?number,
 *   outflow: ?number}} dollars a month; outflow is spending plus savings, null when neither is known.
 */
export function actualsFor(doc, history, key) {
  const closed = doc.months.find((m) => m.key === key);
  const lines = {};
  const cats = {};
  const savings = {};
  if (closed) {
    // A closed month keeps its snapshot; a line revised after closing wins over the snapshot's actual.
    for (const [id, l] of Object.entries(closed.snapshot.lines)) {
      const rev = closed.revised.lines[id];
      lines[id] = rev ? rev.amount : l.actual;
    }
    // The category total comes from history (it carries the revisions), else the snapshot.
    for (const [id, c] of Object.entries(closed.snapshot.categories)) {
      const pt = (history.byCategory[id] || []).find((p) => p.key === key);
      cats[id] = pt ? pt.actual : c.actual;
      savings[id] = !!c.savings;
    }
  } else {
    for (const c of modelForMonth(doc, key).categories) {
      cats[c.id] = c.actual.amount;
      savings[c.id] = c.savings;
      for (const l of c.lines) lines[l.id] = l.actual;
    }
  }
  const spending = sumKnown(
    Object.keys(cats)
      .filter((id) => !savings[id])
      .map((id) => cats[id])
  ).total;
  const saved = sumKnown(
    Object.keys(cats)
      .filter((id) => savings[id])
      .map((id) => cats[id])
  ).total;
  return {
    key,
    closed: !!closed,
    lines,
    cats,
    spending,
    outflow: spending === null && saved === null ? null : (spending || 0) + (saved || 0)
  };
}

/**
 * What a month's plan adds up to. A category planned as one number ('cat:' entry)
 * counts that number; otherwise its lines' plan amounts add up. Debt payments are
 * the debt minimums (computed, never typed twice).
 * @param {object} doc the household file.
 * @param {string} month 'YYYY-MM'.
 * @returns {?object} { month, createdFrom, cats: { id: { id, name, savings, isDebt, byCategory, amount, lines } }, spending,
 *   savings, outflow }: dollars a month (a per-paycheck plan amount is read with the primary pay frequency); null with no plan.
 */
export function planView(doc, month) {
  const plan = (doc.plans || {})[month];
  if (!plan) return null;
  const freq = primaryPayFrequency(doc);
  const pm = modelForMonth(doc, month);
  const cats = pm.categories
    .filter((c) => !c.notForMe)
    .map((c) => {
      if (c.isDebt)
        return {
          id: c.id,
          name: c.name,
          savings: false,
          isDebt: true,
          byCategory: true,
          amount: c.estimate.amount,
          lines: {}
        };
      const ce = plan.lines['cat:' + c.id];
      // A typed interest line replaced by computed interest (S-133) plans nothing: Debt payments has it.
      const lines = Object.fromEntries(
        c.lines.map((l) => [
          l.id,
          plan.lines[l.id] && l.covered !== 'computed-interest' ? toMonthly(plan.lines[l.id].amount, freq) : null
        ])
      );
      const amount = ce ? toMonthly(ce.amount, freq) : sumKnown(Object.values(lines)).total;
      return { id: c.id, name: c.name, savings: c.savings, isDebt: false, byCategory: !!ce, amount, lines };
    });
  const spending = sumKnown(cats.filter((c) => !c.savings).map((c) => c.amount)).total;
  const saved = sumKnown(cats.filter((c) => c.savings).map((c) => c.amount)).total;
  return {
    month,
    createdFrom: plan.createdFrom,
    cats: Object.fromEntries(cats.map((c) => [c.id, c])),
    spending,
    savings: saved,
    outflow: spending === null && saved === null ? null : (spending || 0) + (saved || 0)
  };
}

/**
 * Where a new plan can start: last month's plan, this month's actuals, or the
 * estimates (the dream life lives in Eras, S-097).
 * @param {object} doc the household file.
 * @param {object} history what monthHistory returns.
 * @param {string} source 'last-plan', 'actuals', or anything else for the estimates.
 * @param {string} reviewMonth 'YYYY-MM', the month whose actuals are copied.
 * @param {string} planMonth 'YYYY-MM', the month being planned.
 * @returns {Object<string, object>} { key: Value } for store/plans.js startPlan, key a line id or 'cat:' + a category id;
 *   each Value keeps its own cadence and status.
 */
export function planStartValues(doc, history, source, reviewMonth, planMonth) {
  const out = {};
  const pm = modelForMonth(doc, planMonth);
  const live = (c) => doc.categories.find((x) => x.id === c.id);
  if (source === 'last-plan') {
    const prev = (doc.plans || {})[prevMonthKey(planMonth)];
    // A line stopped in the last plan does not carry forward.
    for (const [k, e] of Object.entries(prev ? prev.lines : {})) if (!e.stop) out[k] = copy(e.amount);
    return out;
  }
  if (source === 'actuals') {
    const a = actualsFor(doc, history, reviewMonth);
    const saved = reviewMonth === doc.currentMonth ? null : (doc.monthActuals || {})[reviewMonth] || {};
    for (const c of pm.categories) {
      if (c.isDebt || c.notForMe) continue;
      for (const l of c.lines) {
        // A typed interest line replaced by computed interest (S-133) is not planned: Debt payments has it.
        if (l.covered === 'computed-interest') continue;
        if (a.lines[l.id] === null || a.lines[l.id] === undefined) continue;
        // The typed Value is copied when there is one (it keeps its cadence and status); a closed month's number, or
        // an actual from the log, becomes a monthly Value marked known.
        const stored = live(c).lines.find((x) => x.id === l.id);
        const v = a.closed ? null : saved ? saved[l.id] : stored && stored.actual;
        out[l.id] = v && hasAnswer(v) ? copy(v) : { ...blank, amount: a.lines[l.id], status: 'known' };
      }
    }
    return out;
  }
  const col = 'estimate';
  for (const c of pm.categories) {
    if (c.isDebt || c.notForMe) continue;
    const stored = live(c);
    if (c.isEverything) {
      // Everything else is planned as one number: what is left of the single total after the lines carved out of it.
      if (c[col].amount !== null) out['cat:' + c.id] = { ...blank, amount: c[col].amount, status: stored[col].status };
      continue;
    }
    // A category broken down in Rough keeps its first number stored, but the lines carry the estimate now.
    if (hasAnswer(stored[col]) && !(col === 'estimate' && stored.split)) {
      out['cat:' + c.id] = copy(stored[col]);
      continue;
    }
    for (const l of stored.lines) if (l.state !== 'archived' && hasAnswer(l[col])) out[l.id] = copy(l[col]);
  }
  return out;
}

const dollars = (x) => '$' + Math.round(Math.abs(x)).toLocaleString('en-US');
const pct = (x) => Math.round(x * 100) + '%';
const list = (xs) => (xs.length < 3 ? xs.join(' and ') : xs.slice(0, -1).join(', ') + ', and ' + xs[xs.length - 1]);

/**
 * The review table: a month's actuals next to the following plan, line by line,
 * with % of income, % of spending, and happiness.
 * @param {object} doc the household file.
 * @param {object} summary what buildSummary returns (take-home and history).
 * @param {string} reviewMonth 'YYYY-MM', the month reviewed.
 * @param {string} planMonth 'YYYY-MM', the month planned (usually the next).
 * @returns {object} { reviewMonth, planMonth, exists, createdFrom, groups, checklist, totals, ratedPoints, reading }: dollars a
 *   month; pctIncome is of take-home and pctSpending of that column's spending, ratios 0 to 1.
 */
export function reviewSummary(doc, summary, reviewMonth, planMonth) {
  // % of income is of take-home (what lands), the budget's one income number.
  const th = summary.totals.takeHome;
  const act = actualsFor(doc, summary.history, reviewMonth);
  const plan = planView(doc, planMonth);
  const entries = ((doc.plans || {})[planMonth] || { lines: {} }).lines;
  const pm = modelForMonth(doc, planMonth);
  const spendLines = pm.categories.filter((c) => !c.savings && !c.isDebt).flatMap((c) => c.lines);
  // Joy and stress are rated on every line but the computed debt lines; savings lines count (the positives).
  const allLines = pm.categories
    .filter((c) => !c.isDebt)
    .flatMap((c) => c.lines)
    .map((l) => ({
      id: l.id,
      name: l.name,
      joy: l.joy,
      stress: l.stress,
      amount: act.lines[l.id] === undefined ? null : act.lines[l.id]
    }));
  const joy = happinessOf(allLines);
  const strain = stressOf(allLines);
  const groups = [];
  for (const c of pm.categories) {
    if (c.notForMe) continue;
    const pc = plan ? plan.cats[c.id] : null;
    const byCategory = !!(pc && pc.byCategory && !c.isDebt);
    const rowOf = (key, name, src, extra) => {
      const actual = key.startsWith('cat:')
        ? act.cats[c.id] === undefined
          ? null
          : act.cats[c.id]
        : act.lines[src.id] === undefined
          ? null
          : act.lines[src.id];
      // A debt row's plan is its computed minimum; nothing is typed for it. Savings take no share of spending.
      const planAmt = c.isDebt
        ? src.estimate
        : key.startsWith('cat:')
          ? pc
            ? pc.amount
            : null
          : pc
            ? pc.lines[src.id]
            : null;
      const est = key.startsWith('cat:') ? c.estimate.amount : src.estimate;
      const e = entries[key] || null;
      return {
        key,
        name,
        catId: c.id,
        savings: c.savings,
        computed: !!c.isDebt,
        actual,
        estimate: est,
        plan: planAmt,
        pctIncome: { actual: ratio(actual, th), plan: ratio(planAmt, th), estimate: ratio(est, th) },
        pctSpending: c.savings
          ? { actual: null, plan: null }
          : { actual: ratio(actual, act.spending), plan: ratio(planAmt, plan ? plan.spending : null) },
        happiness: key.startsWith('cat:') ? null : joy.byId[src.id] || null,
        stress: key.startsWith('cat:') || c.isDebt ? null : strain.byId[src.id] || null,
        gapFromEstimate: minus(actual, est),
        addedInReview: !!(src && src.addedFor) || (e && e.decision === 'new'),
        decision: e ? e.decision : null,
        reviewed: e ? e.reviewed : false,
        stop: e ? e.stop : false,
        note: e ? e.note : '',
        startAmount: e ? toMonthly(e.start, primaryPayFrequency(doc)) : null,
        ...extra
      };
    };
    const lineOf = (l) => ({
      ...l,
      addedFor: (doc.categories.find((x) => x.id === c.id).lines.find((x) => x.id === l.id) || {}).addedFor || null
    });
    const rows = c.isDebt
      ? c.lines.map((l) => rowOf(l.id, l.name, l))
      : byCategory
        ? [rowOf('cat:' + c.id, 'All of ' + c.name + ' (one number)', null)]
        : c.lines.map((l) => rowOf(l.id, l.name, lineOf(l)));
    groups.push({
      id: c.id,
      name: c.name,
      type: c.type,
      savings: c.savings,
      isDebt: c.isDebt,
      byCategory,
      rows,
      actual: act.cats[c.id] === undefined ? null : act.cats[c.id],
      plan: pc ? pc.amount : null,
      estimate: c.estimate.amount
    });
  }
  // Lines ticked off per category (S-106: a collapsed category says how far its review is).
  for (const g of groups) g.reviewed = g.rows.filter((r) => r.reviewed).length;
  const plannable = groups.filter((g) => !g.isDebt).flatMap((g) => g.rows);
  const reviewed = plannable.filter((r) => r.reviewed).length;
  const catOf = Object.fromEntries(pm.categories.flatMap((c) => c.lines.map((l) => [l.id, c.id])));
  const planLines = spendLines.map((l) => ({
    joy: l.joy,
    amount: plan && plan.cats[catOf[l.id]] ? plan.cats[catOf[l.id]].lines[l.id] : null
  }));
  const actLines = spendLines.map((l) => ({
    joy: l.joy,
    amount: act.lines[l.id] === undefined ? null : act.lines[l.id]
  }));
  // The happy share: dollars on spending lines rated 7 or more, over the column's spending.
  const happyNow = happySpendShare(actLines, act.spending);
  const happyPlan = plan ? happySpendShare(planLines, plan.spending) : null;
  const totals = {
    takeHome: th,
    plan: plan ? plan.outflow : null,
    planSpending: plan ? plan.spending : null,
    planLeft: plan ? minus(th, plan.outflow) : null,
    actual: act.outflow,
    actualSpending: act.spending,
    // frees = this month's actual outflow - next month's plan: positive when the plan spends less.
    frees: plan ? minus(act.outflow, plan.outflow) : null,
    planPctIncome: plan ? ratio(plan.outflow, th) : null,
    happyNow,
    happyPlan,
    happyChange: happyNow === null || happyPlan === null ? null : happyPlan - happyNow
  };
  const out = {
    reviewMonth,
    planMonth,
    exists: !!plan,
    createdFrom: plan ? plan.createdFrom : null,
    groups,
    checklist: { reviewed, total: plannable.length },
    totals,
    ratedPoints: joy.points
  };
  out.reading = reviewReading(out);
  return out;
}

/**
 * The plain reading under the review table: what the plan does, never a verdict.
 * @param {object} r what reviewSummary returns.
 * @returns {string} whole dollars; parts with nothing to say are left out.
 */
export function reviewReading(r) {
  const t = r.totals;
  if (!r.exists) return 'Start a plan for next month to see what it would change.';
  const out = [];
  // Within 50 cents counts as a match, since the sentence shows whole dollars.
  if (t.frees !== null)
    out.push(
      t.frees > 0.5
        ? "Next month's plan frees " + dollars(t.frees) + '.'
        : t.frees < -0.5
          ? "Next month's plan spends " + dollars(t.frees) + ' more than this month.'
          : "Next month's plan matches this month's actual."
    );
  const rows = r.groups.filter((g) => !g.isDebt).flatMap((g) => g.rows);
  const cuts = rows.filter((x) => x.decision === 'cut');
  if (cuts.length) {
    // For the sentence only: a cut line with no actual or no rating adds nothing to these shares.
    const spend = cuts.reduce((a, x) => a + (x.actual || 0), 0);
    const joy = cuts.reduce((a, x) => a + (x.happiness && x.happiness.share ? x.happiness.share : 0), 0);
    out.push(
      'The cuts were in ' +
        list(cuts.map((x) => x.name)) +
        ', which held ' +
        pct(ratio(spend, t.actualSpending) || 0) +
        ' of spending and ' +
        pct(joy) +
        ' of happiness.'
    );
  }
  const changes = rows.filter((x) => x.decision === 'change' && x.plan !== null);
  for (const x of changes.slice(0, 3))
    out.push(
      x.name + ' changes from ' + (x.actual === null ? 'no actual' : dollars(x.actual)) + ' to ' + dollars(x.plan) + '.'
    );
  const added = rows.filter((x) => x.decision === 'new');
  if (added.length)
    out.push('Added: ' + list(added.map((x) => x.name + (x.plan !== null ? ' at ' + dollars(x.plan) : ''))) + '.');
  if (t.planLeft !== null)
    out.push(
      t.planLeft >= 0
        ? 'The plan leaves ' + dollars(t.planLeft) + ' of take-home.'
        : 'The plan is ' + dollars(t.planLeft) + ' over take-home.'
    );
  return out.join(' ');
}
