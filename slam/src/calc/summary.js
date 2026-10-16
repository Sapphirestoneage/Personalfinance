// One call that computes everything the screens show. Screens read this
// object and format it; they never do math of their own.

import { incomeSummary } from './income.js';
import { tagTotals } from './tags.js';
import { lineIdeas, debtsByType } from './breakdown.js';
import { eraTimeline } from './eras.js';
import { budgetModel } from './model.js';
import { budgetTotals } from './totals.js';
import { gaps, accuracy, blindSpot, culprits, gutCheck, correctionFactors, proofOfCash, blindCompare } from './compare.js';
import { monthHistory, monthSnapshot } from './history.js';
import { fiftyThirtyTwenty, draftt, incomeStatement, joyLens } from './lenses.js';
import { questionItems, completion, nextSteps, roughList } from './completion.js';
import { availableGuesses, householdSize, guessFor } from './guesses.js';
import { ratio, minus } from './money.js';
import { txMonths, detect, topMerchants, weekdaySpending, sizeVsCount } from './tx-analysis.js';
import { nextStage } from './next-stage.js';

function pctBlock(e, d, a, b, takeHome) {
  return { estimate: ratio(e, takeHome), dream: ratio(d, takeHome), actual: ratio(a, takeHome), basis: ratio(b, takeHome) };
}

function tableRows(model, totals) {
  const th = totals.takeHome;
  return model.categories.map((c) => {
    const basis = totals.bases[c.id];
    const lines = c.lines.map((l) => {
      const lb = l.actual !== null ? l.actual : l.estimate;
      return {
        id: l.id, name: l.name, computed: l.computed, kind: l.kind, need: l.need, tag: l.tag, path: l.path, joy: l.joy, state: l.state,
        estimate: l.estimate, dream: l.dream, actual: l.actual, basis: lb, status: l.status, sourceStatus: l.sourceStatus || null,
        gaps: gaps(l.estimate, l.dream, l.actual), accuracy: accuracy(l.estimate, l.actual),
        pctTakeHome: pctBlock(l.estimate, l.dream, l.actual, lb, th),
        pctSpending: c.savings ? null : ratio(lb, totals.spending),
        owedOutstanding: l.owedOutstanding
      };
    });
    return {
      id: c.id, name: c.name, savings: c.savings, isDebt: c.isDebt, isEverything: c.isEverything, notForMe: c.notForMe, state: c.state,
      estimate: c.estimate.amount, dream: c.dream.amount, actual: c.actual.amount, partial: c.actual.partial,
      estimateFrom: c.estimate.from, dreamFrom: c.dream.from, carved: c.estimate.carved, total: c.estimate.total, overSplit: !!c.estimate.overSplit,
      basis: basis.amount, basisFrom: basis.from,
      status: { estimate: c.estimate.status, dream: c.dream.status, actual: c.actual.status },
      gaps: gaps(c.estimate.amount, c.dream.amount, c.actual.amount),
      accuracy: accuracy(c.estimate.amount, c.actual.amount),
      pctTakeHome: pctBlock(c.estimate.amount, c.dream.amount, c.actual.amount, basis.amount, th),
      pctSpending: c.savings ? null : ratio(basis.amount, totals.spending),
      lines
    };
  });
}

export function buildSummary(doc, refs) {
  const income = incomeSummary(doc, refs.tax);
  const model = budgetModel(doc);
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
  summary.lineIdeas = lineIdeas(doc, refs);
  summary.debtsByType = debtsByType(doc);
  summary.eras = eraTimeline(doc, totals, refs);
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

export function closeMonthSnapshot(summary) {
  return monthSnapshot(summary.model, summary.income);
}
