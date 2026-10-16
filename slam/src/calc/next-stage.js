// Next stage: one drastic change (a new job, school, a move) that costs money
// in the short term but is better on other measures. What the client would
// need to make it work, now vs next, and stay vs change over time.

import { toMonthly, hasAnswer } from './normalize.js';
import { ratio, sumKnown } from './money.js';

const HOURS_A_MONTH = 52 / 12;
const MAX_MONTHS = 120;

function monthly(v) { return v ? toMonthly(v, 'monthly') : null; }

// A one-off amount: whatever was typed, regardless of cadence.
function oneOff(v) {
  if (!v || v.status === 'not-for-me') return 0;
  return v.amount;
}

export const CASES = ['disaster', 'likely', 'dream'];
const VALUE_FIELDS = ['takeHome', 'transitionTakeHome', 'laterTakeHome'];
const NUMBER_FIELDS = ['hoursPerWeek', 'transitionMonths', 'laterAfterMonths'];

// The plan as seen through one lens. Likely is what was typed; disaster and
// dream only hold what differs, and anything left blank follows likely.
export function resolveCase(ns, caseId) {
  if (caseId === 'likely') return ns;
  const o = (ns.cases && ns.cases[caseId]) || {};
  const out = { ...ns };
  for (const k of VALUE_FIELDS) if (o[k] && hasAnswer(o[k])) out[k] = o[k];
  for (const k of NUMBER_FIELDS) if (o[k] !== null && o[k] !== undefined) out[k] = o[k];
  const pick = (it) => ({ ...it, amount: it[caseId] && hasAnswer(it[caseId]) ? it[caseId] : it.amount });
  out.oneOffCosts = ns.oneOffCosts.map(pick);
  out.costChanges = ns.costChanges.map(pick);
  return out;
}

// All three lenses, plus cash on hand and runway (how long savings last through the switch).
export function nextStage(doc, income, totals, culprits) {
  if (!doc.nextStage) return null;
  const cash = doc.nextStage.cashOnHand ? oneOff(doc.nextStage.cashOnHand) : null;
  const cases = {};
  for (const c of CASES) {
    const r = nextStageCase(resolveCase(doc.nextStage, c), income, totals, culprits);
    const burn = r.transitionGap !== null && r.transitionGap < 0 ? -r.transitionGap : 0;
    r.cash = cash === null ? null : {
      onHand: cash,
      gap: r.cashNeeded === null ? null : cash - r.cashNeeded,
      covers: r.cashNeeded === null ? null : cash >= r.cashNeeded,
      // Months of the lower-pay stretch the cash lasts after the one-time costs.
      runwayMonths: burn > 0 ? Math.max(0, cash - r.oneOffs) / burn : null
    };
    cases[c] = r;
  }
  return { ...cases.likely, cases };
}

function nextStageCase(ns, income, totals, culprits) {
  const nowTakeHome = totals.takeHome;
  const nowOutflow = totals.outflow;
  const nowSurplus = totals.surplus;
  const nowHours = income.sources.reduce((a, s) => a + (s.hoursMonthly || 0), 0) / HOURS_A_MONTH || null;

  const costChange = sumKnown(ns.costChanges.map((c) => monthly(c.amount))).total || 0;
  const nextOutflow = nowOutflow === null ? null : nowOutflow + costChange;
  const nextTakeHome = monthly(ns.takeHome);
  const nextSurplus = nextTakeHome === null || nextOutflow === null ? null : nextTakeHome - nextOutflow;

  const oneOffs = sumKnown(ns.oneOffCosts.map((c) => oneOff(c.amount))).total || 0;
  const tMonths = ns.transitionMonths || 0;
  const tTakeHome = tMonths ? monthly(ns.transitionTakeHome) : null;
  const transitionGap = tMonths && tTakeHome !== null && nextOutflow !== null ? tTakeHome - nextOutflow : null;
  const transitionBurn = transitionGap === null ? (tMonths ? null : 0) : Math.max(0, -transitionGap) * tMonths;
  const cashNeeded = transitionBurn === null ? null : oneOffs + transitionBurn;

  const monthsToSave = cashNeeded !== null && nowSurplus > 0 ? cashNeeded / nowSurplus : null;
  const cutNeeded = nextSurplus !== null && nextSurplus < 0 ? -nextSurplus : 0;
  const ownWords = culprits.reduce((a, c) => a + c.cutMonthly, 0);

  const nextHours = ns.hoursPerWeek || null;
  const laterTakeHome = monthly(ns.laterTakeHome);
  const laterAfter = ns.laterAfterMonths || null;
  const laterSurplus = laterTakeHome !== null && nextOutflow !== null ? laterTakeHome - nextOutflow : null;

  return {
    name: ns.name || 'Next stage',
    now: { takeHome: nowTakeHome, outflow: nowOutflow, surplus: nowSurplus, hours: nowHours, perHour: ratio(nowTakeHome, nowHours ? nowHours * HOURS_A_MONTH : null) },
    next: { takeHome: nextTakeHome, outflow: nextOutflow, surplus: nextSurplus, hours: nextHours, perHour: ratio(nextTakeHome, nextHours ? nextHours * HOURS_A_MONTH : null) },
    costChange, oneOffs, transitionMonths: tMonths, transitionTakeHome: tTakeHome, transitionGap, transitionBurn,
    cashNeeded, monthsToSave, monthsToSaveWhole: monthsToSave === null ? null : Math.ceil(monthsToSave - 1e-9),
    cutNeeded, ownWords, ownWordsCovers: cutNeeded > 0 ? ownWords >= cutNeeded : null,
    later: laterTakeHome === null ? null : { takeHome: laterTakeHome, afterMonths: laterAfter, surplus: laterSurplus },
    path: stayVsChange({ nowSurplus, oneOffs, tMonths, transitionGap, nextSurplus, laterSurplus, laterAfter }),
    // Hours come from Basics (now) and the next-stage hours, so they are never asked twice.
    metrics: [{ id: 'hours', label: 'Hours worked a week', now: nowHours, next: nextHours, better: 'lower', computed: true }, ...(ns.metrics || [])].map((m) => {
      const change = m.now === null || m.next === null ? null : m.next - m.now;
      return { ...m, change, better: change === null || change === 0 ? null : (m.better === 'lower' ? change < 0 : change > 0) };
    })
  };
}

// Running cash difference: change path minus staying put, month by month.
// Month 0 is the one-off costs. Returns the path and the first month the
// change catches up (null if not within 10 years).
export function stayVsChange({ nowSurplus, oneOffs, tMonths, transitionGap, nextSurplus, laterSurplus, laterAfter }) {
  if (nowSurplus === null || nextSurplus === null || (tMonths && transitionGap === null)) return null;
  const stay = [0];
  const change = [-oneOffs];
  let breakEven = null;
  for (let m = 1; m <= MAX_MONTHS; m++) {
    let s = nextSurplus;
    if (m <= tMonths) s = transitionGap;
    else if (laterSurplus !== null && laterAfter && m > laterAfter) s = laterSurplus;
    stay.push(stay[m - 1] + nowSurplus);
    change.push(change[m - 1] + s);
    if (breakEven === null && change[m] >= stay[m]) breakEven = m;
  }
  return { stay, change, breakEven, months: MAX_MONTHS };
}

export const DEFAULT_METRICS = [
  ['Commute, minutes a day', 'lower'],
  ['Stress, 1 to 10', 'lower'],
  ['Meaning or joy, 1 to 10', 'higher'],
  ['Time with family, hours a week', 'higher']
];
