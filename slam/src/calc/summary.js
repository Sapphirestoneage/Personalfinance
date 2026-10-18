// One call that computes everything the screens show. Screens read this
// object and format it; they never do math of their own.

import { incomeSummary } from './income.js';
import { tagTotals } from './tags.js';
import { lineIdeas, debtsByType } from './breakdown.js';
import { eraTimeline } from './eras.js';
import { dreamLife } from './dream-life.js';
import { budgetModel, withComputedSavings } from './model.js';
import { budgetTotals } from './totals.js';
import { gaps, accuracy, blindSpot, culprits, gutCheck, correctionFactors, proofOfCash, blindCompare } from './compare.js';
import { monthHistory, monthSnapshot } from './history.js';
import { fiftyThirtyTwenty, draftt, incomeStatement, joyLens } from './lenses.js';
import { questionItems, completion, nextSteps, roughList } from './completion.js';
import { availableGuesses, householdSize, guessFor } from './guesses.js';
import { ratio, minus } from './money.js';
import { txMonths, detect, topMerchants, weekdaySpending, sizeVsCount } from './tx-analysis.js';
import { nextStage } from './next-stage.js';
import { planView } from './plan.js';
import { happinessOf, stressOf } from './happiness.js';
import { liveView, hasDeleted } from '../store/records.js';

function pctBlock(e, a, b, takeHome) {
  return { estimate: ratio(e, takeHome), actual: ratio(a, takeHome), basis: ratio(b, takeHome) };
}

function tableRows(model, totals) {
  const th = totals.takeHome;
  return model.categories.map((c) => {
    const basis = totals.bases[c.id];
    const lines = c.lines.map((l) => {
      const lb = l.actual !== null ? l.actual : l.estimate;
      return {
        id: l.id, name: l.name, type: l.type, addedInReview: !!l.addedFor, computed: l.computed, kind: l.kind, need: l.need, tag: l.tag, path: l.path, joy: l.joy, state: l.state,
        estimate: l.estimate, actual: l.actual, basis: lb, status: l.status, sourceStatus: l.sourceStatus || null,
        gaps: gaps(l.estimate, l.actual), accuracy: accuracy(l.estimate, l.actual),
        pctTakeHome: pctBlock(l.estimate, l.actual, lb, th),
        pctSpending: c.savings ? null : ratio(lb, totals.spending),
        owedOutstanding: l.owedOutstanding,
        covered: l.covered || null
      };
    });
    return {
      id: c.id, name: c.name, type: c.type, savings: c.savings, isDebt: c.isDebt, isEverything: c.isEverything, notForMe: c.notForMe, state: c.state,
      estimate: c.estimate.amount, actual: c.actual.amount, partial: c.actual.partial,
      estimateFrom: c.estimate.from, carved: c.estimate.carved, total: c.estimate.total, overSplit: !!c.estimate.overSplit,
      basis: basis.amount, basisFrom: basis.from,
      status: { estimate: c.estimate.status, actual: c.actual.status },
      gaps: gaps(c.estimate.amount, c.actual.amount),
      accuracy: accuracy(c.estimate.amount, c.actual.amount),
      pctTakeHome: pctBlock(c.estimate.amount, c.actual.amount, basis.amount, th),
      pctSpending: c.savings ? null : ratio(basis.amount, totals.spending),
      lines
    };
  });
}

export function buildSummary(full, refs) {
  // The store hands calc the live view already; a full file with deleted records is trimmed here too (S-096).
  const doc = hasDeleted(full) ? liveView(full) : full;
  const income = incomeSummary(doc, refs.tax);
  const model = withComputedSavings(budgetModel(doc), income.takeHome);
  const totals = budgetTotals(model, income, doc, refs.benchmarks.housingBand);
  const history = monthHistory(doc);
  const items = questionItems(doc, model, income);
  const comp = completion(items);
  const steps = nextSteps(items, doc, refs);
  const blind = blindSpot(model);
  const summary = {
    householdId: doc.id,
    month: doc.currentMonth,
    profile: { ...doc.profile, householdSize: householdSize(doc) },
    income, model, totals,
    rows: tableRows(model, totals),
    oneOffs: model.oneOffs,
    blindSpot: blind,
    culprits: culprits(model),
    gutCheck: gutCheck(doc, totals),
    corrections: correctionFactors(model, history),
    proofOfCash: proofOfCash(totals),
    history,
    lenses: {
      fiftyThirtyTwenty: fiftyThirtyTwenty(totals, refs.benchmarks.fiftyThirtyTwenty),
      draftt: draftt(model, totals, income),
      incomeStatement: incomeStatement(model, totals, income),
      joy: joyLens(model, totals)
    },
    completion: comp,
    items,
    next: steps.next,
    moreSteps: steps.more,
    smallStuff: steps.small,
    rough: roughList(doc),
    guesses: availableGuesses(doc, refs),
    blind: doc.blindRounds.length ? blindCompare(doc, model, doc.blindRounds[doc.blindRounds.length - 1].id) : null
  };
  summary.tags = tagTotals(doc, model);
  addPlanAndShares(summary, doc, model, totals);
  summary.lineIdeas = lineIdeas(doc, refs);
  summary.debtsByType = debtsByType(doc);
  // Eras opens with the dream life (S-097); it reads the budget, the budget never reads it.
  summary.dreamLife = dreamLife(doc, summary);
  summary.eras = eraTimeline(doc, totals, refs, summary.dreamLife);
  summary.sinceLast = sinceLast(doc, summary);
  summary.nextStage = nextStage(doc, income, totals, summary.culprits);
  // Living with family: what housing might cost on your own (an average, labeled guess).
  summary.moveOut = doc.household.livingWith === 'family' ? { guess: guessFor(doc, 'housing', refs), now: totals.housing } : null;
  summary.transactions = doc.transactions.length ? {
    count: doc.transactions.length, months: txMonths(doc.transactions), detections: detect(doc.transactions),
    top: topMerchants(doc.transactions), weekdays: weekdaySpending(doc.transactions), sizeVsCount: sizeVsCount(doc.transactions)
  } : null;
  return summary;
}

// Percentages and happiness for every category and line (S-076), and the plan
// for the month on screen when there is one. % of income is of take-home;
// % of spending is of total spending in that same column.
function addPlanAndShares(summary, doc, model, totals) {
  const plan = planView(doc, doc.currentMonth);
  summary.plan = plan;
  const th = totals.takeHome;
  const colTotal = { estimate: totals.estimateTotal, actual: totals.actualTotal, basis: totals.spending, plan: plan ? plan.spending : null };
  // Joy or purpose counts savings lines too (the positives); debt lines are computed, never rated.
  const ratedLines = model.categories.filter((c) => !c.isDebt).flatMap((c) => c.lines).map((l) => ({ id: l.id, name: l.name, joy: l.joy, stress: l.stress, amount: l.actual !== null ? l.actual : l.estimate }));
  const joy = happinessOf(ratedLines);
  summary.happinessPoints = joy.points;
  summary.stress = stressOf(ratedLines);
  const shares = (x, savings) => {
    const amt = { estimate: x.estimate, actual: x.actual, basis: x.basis, plan: x.plan };
    return {
      income: Object.fromEntries(Object.entries(amt).map(([k, v]) => [k, ratio(v, th)])),
      spending: Object.fromEntries(Object.entries(amt).map(([k, v]) => [k, savings ? null : ratio(v, colTotal[k])]))
    };
  };
  const lensRow = (id) => summary.lenses.joy.rows.find((r) => r.id === id) || null;
  for (const r of summary.rows) {
    const pc = plan ? plan.cats[r.id] : null;
    r.plan = pc ? pc.amount : null;
    r.basis = totals.bases[r.id] ? totals.bases[r.id].amount : null;
    r.gaps.actualMinusPlan = minus(r.actual, r.plan);
    r.gaps.actualMinusPlanPct = ratio(r.gaps.actualMinusPlan, r.plan);
    r.pct = shares(r, r.savings);
    for (const l of r.lines) {
      l.plan = pc && !pc.byCategory ? (pc.lines[l.id] === undefined ? null : pc.lines[l.id]) : null;
      l.gaps.actualMinusPlan = minus(l.actual, l.plan);
      l.gaps.actualMinusPlanPct = ratio(l.gaps.actualMinusPlan, l.plan);
      l.pct = shares(l, r.savings);
      l.happiness = joy.byId[l.id] || null;
      l.stressInfo = summary.stress.byId[l.id] || null;
    }
    // Category happiness: % of happiness adds its lines; rating and joy per $100 stay spend-weighted (joy lens).
    const rated = r.lines.filter((l) => l.happiness);
    const lr = lensRow(r.id);
    r.happiness = rated.length ? { share: rated.reduce((a, l) => a + (l.happiness.share || 0), 0), rating: lr ? lr.joy : null, per100: lr ? lr.joyPer100 : null } : null;
  }
  summary.totals.planSpending = plan ? plan.spending : null;
  summary.totals.planOutflow = plan ? plan.outflow : null;
}

// The small set of numbers kept in doc.snapshots for "since last time".
export function snapshotOf(summary, dateIso) {
  return {
    date: dateIso,
    takeHome: summary.totals.takeHome,
    spending: summary.totals.spending,
    surplus: summary.totals.surplus,
    savingsRate: summary.totals.savingsRate,
    blindSpot: summary.blindSpot.pct,
    completion: summary.completion.pct
  };
}

export function sinceLast(doc, summary) {
  const last = doc.snapshots[doc.snapshots.length - 1];
  if (!last) return null;
  const now = snapshotOf(summary, null);
  const out = { date: last.date };
  for (const k of ['takeHome', 'spending', 'surplus', 'savingsRate', 'blindSpot', 'completion']) out[k] = minus(now[k], last[k]);
  return out;
}

// The month's income (S-118) is saved with it: estimate, plan, and actual per source.
export function closeMonthSnapshot(summary) {
  return { ...monthSnapshot(summary.model, summary.income), income: summary.totals.income };
}
