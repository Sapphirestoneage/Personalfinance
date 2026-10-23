// Next stage: one drastic change (a new job, school, a move) that costs money
// in the short term but is better on other measures. What the client would
// need to make it work, now vs next, and stay vs change over time.
// Dollars a month, except one-off costs and cash on hand (dollars, once). Depends on balances.js
// (cash on hand), normalize.js (toMonthly, hasAnswer), and money.js (ratio, sumKnown).

import { cashOnHand } from './balances.js';
import { toMonthly, hasAnswer } from './normalize.js';
import { ratio, sumKnown } from './money.js';

// Weeks in a month (52 / 12): turns hours a week into hours a month and back, the same factor income.js uses.
const HOURS_A_MONTH = 52 / 12;
// The stay vs change path runs ten years.
const MAX_MONTHS = 120;

// A Value as dollars a month. A next-stage value is never typed per paycheck, so 'monthly' is only a stand-in.
function monthly(v) {
  return v ? toMonthly(v, 'monthly') : null;
}

// A one-off amount: whatever was typed, regardless of cadence.
function oneOff(v) {
  if (!v || v.status === 'not-for-me') return 0;
  return v.amount;
}

// "dream" is the stored key of the lens shown as Best case (S-097); the old name is kept so files load unchanged.
export const CASES = ['disaster', 'likely', 'dream'];
const VALUE_FIELDS = ['takeHome', 'transitionTakeHome', 'laterTakeHome'];
const NUMBER_FIELDS = ['hoursPerWeek', 'transitionMonths', 'laterAfterMonths'];

/**
 * The plan as seen through one lens. Likely is what was typed; disaster and
 * dream only hold what differs, and anything left blank follows likely.
 * @param {object} ns the stored nextStage record
 * @param {string} caseId 'disaster' | 'likely' | 'dream'
 * @returns {object} the record with that lens's answers in place of the likely ones
 */
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

/**
 * All three lenses, plus cash on hand and runway (how long savings last through the switch).
 * @param {object} doc the household file
 * @param {object} income the income summary (summary.income); each source's hoursMonthly
 * @param {object} totals budgetTotals: takeHome, outflow, surplus in dollars a month
 * @param {Array<object>} culprits compare.js culprits; cutMonthly in dollars a month
 * @returns {?object} null with no next stage; else the likely case's fields plus cases { disaster, likely, dream },
 *   each with cash { onHand, gap, covers, runwayMonths }
 */
export function nextStage(doc, income, totals, culprits) {
  if (!doc.nextStage) return null;
  // Cash on hand is read from the account balances (S-084), never asked here.
  const cash = cashOnHand(doc).amount;
  const cases = {};
  for (const c of CASES) {
    const r = nextStageCase(resolveCase(doc.nextStage, c), income, totals, culprits);
    // burn: the monthly shortfall during the lower-pay stretch; 0 when it covers itself.
    const burn = r.transitionGap !== null && r.transitionGap < 0 ? -r.transitionGap : 0;
    r.cash =
      cash === null
        ? null
        : {
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

// One lens of the plan: now, next, the switch, and what it takes. Outflow is spending plus savings (the
// budget's), so the surplus here is the budget's own surplus.
function nextStageCase(ns, income, totals, culprits) {
  const nowTakeHome = totals.takeHome;
  const nowOutflow = totals.outflow;
  const nowSurplus = totals.surplus;
  // Hours a week now: every source's monthly hours, over weeks a month. No hours typed anywhere reads as not known.
  const nowHours = income.sources.reduce((a, s) => a + (s.hoursMonthly || 0), 0) / HOURS_A_MONTH || null;

  // No cost changes typed means spending stays as it is: a real zero, not a missing fact. Same for one-offs.
  const costChange = sumKnown(ns.costChanges.map((c) => monthly(c.amount))).total || 0;
  const nextOutflow = nowOutflow === null ? null : nowOutflow + costChange;
  const nextTakeHome = monthly(ns.takeHome);
  const nextSurplus = nextTakeHome === null || nextOutflow === null ? null : nextTakeHome - nextOutflow;

  const oneOffs = sumKnown(ns.oneOffCosts.map((c) => oneOff(c.amount))).total || 0;
  // The switch: tMonths at the transition take-home against the new outflow. The gap is negative when cash is
  // burned; only the shortfall counts toward the burn. No transition is a burn of 0; a transition with no
  // take-home typed stays unknown.
  const tMonths = ns.transitionMonths || 0;
  const tTakeHome = tMonths ? monthly(ns.transitionTakeHome) : null;
  const transitionGap = tMonths && tTakeHome !== null && nextOutflow !== null ? tTakeHome - nextOutflow : null;
  const transitionBurn = transitionGap === null ? (tMonths ? null : 0) : Math.max(0, -transitionGap) * tMonths;
  // Cash needed up front: the one-time costs plus the whole shortfall of the switch.
  const cashNeeded = transitionBurn === null ? null : oneOffs + transitionBurn;

  // How long today's surplus takes to save it; no answer without a positive surplus.
  const monthsToSave = cashNeeded !== null && nowSurplus > 0 ? cashNeeded / nowSurplus : null;
  // cutNeeded: what spending must fall for the new budget to break even. ownWords: what the client already
  // said could go (the culprits' gaps, estimate vs actual).
  const cutNeeded = nextSurplus !== null && nextSurplus < 0 ? -nextSurplus : 0;
  const ownWords = culprits.reduce((a, c) => a + c.cutMonthly, 0);

  const nextHours = ns.hoursPerWeek || null;
  const laterTakeHome = monthly(ns.laterTakeHome);
  const laterAfter = ns.laterAfterMonths || null;
  const laterSurplus = laterTakeHome !== null && nextOutflow !== null ? laterTakeHome - nextOutflow : null;

  return {
    name: ns.name || 'Next stage',
    // perHour: take-home per hour worked, monthly take-home over monthly hours (hours a week x weeks a month).
    now: {
      takeHome: nowTakeHome,
      outflow: nowOutflow,
      surplus: nowSurplus,
      hours: nowHours,
      perHour: ratio(nowTakeHome, nowHours ? nowHours * HOURS_A_MONTH : null)
    },
    next: {
      takeHome: nextTakeHome,
      outflow: nextOutflow,
      surplus: nextSurplus,
      hours: nextHours,
      perHour: ratio(nextTakeHome, nextHours ? nextHours * HOURS_A_MONTH : null)
    },
    costChange,
    oneOffs,
    transitionMonths: tMonths,
    transitionTakeHome: tTakeHome,
    transitionGap,
    transitionBurn,
    // Whole months, rounded up; the 1e-9 keeps an exact 6 from becoming 7 through floating-point noise.
    cashNeeded,
    monthsToSave,
    monthsToSaveWhole: monthsToSave === null ? null : Math.ceil(monthsToSave - 1e-9),
    cutNeeded,
    ownWords,
    ownWordsCovers: cutNeeded > 0 ? ownWords >= cutNeeded : null,
    later: laterTakeHome === null ? null : { takeHome: laterTakeHome, afterMonths: laterAfter, surplus: laterSurplus },
    path: stayVsChange({ nowSurplus, oneOffs, tMonths, transitionGap, nextSurplus, laterSurplus, laterAfter }),
    // Hours come from the income (now) and the next-stage hours, so they are never asked twice.
    metrics: [
      { id: 'hours', label: 'Hours worked a week', now: nowHours, next: nextHours, better: 'lower', computed: true },
      ...(ns.metrics || [])
    ].map((m) => {
      // better: true when the change goes the metric's good way, null with a side missing or no change.
      const change = m.now === null || m.next === null ? null : m.next - m.now;
      return {
        ...m,
        change,
        better: change === null || change === 0 ? null : m.better === 'lower' ? change < 0 : change > 0
      };
    })
  };
}

/**
 * Running cash difference: change path minus staying put, month by month.
 * Month 0 is the one-off costs. Returns the path and the first month the
 * change catches up (null if not within 10 years).
 * @param {object} p nowSurplus, nextSurplus, transitionGap, laterSurplus in dollars a month (null = unknown);
 *   oneOffs in dollars once; tMonths and laterAfter in months
 * @returns {?{stay: Array<number>, change: Array<number>, breakEven: ?number, months: number}} cumulative
 *   dollars by month (index = months from now); breakEven is the first month the change path is at least the
 *   stay path; null when a needed number is unknown
 */
export function stayVsChange({ nowSurplus, oneOffs, tMonths, transitionGap, nextSurplus, laterSurplus, laterAfter }) {
  if (nowSurplus === null || nextSurplus === null || (tMonths && transitionGap === null)) return null;
  const stay = [0];
  const change = [-oneOffs];
  let breakEven = null;
  for (let m = 1; m <= MAX_MONTHS; m++) {
    // Each month adds that stretch's surplus: the transition gap during the switch, the later take-home's
    // surplus once laterAfter has passed, the next surplus in between.
    let s = nextSurplus;
    if (m <= tMonths) s = transitionGap;
    else if (laterSurplus !== null && laterAfter && m > laterAfter) s = laterSurplus;
    stay.push(stay[m - 1] + nowSurplus);
    change.push(change[m - 1] + s);
    if (breakEven === null && change[m] >= stay[m]) breakEven = m;
  }
  return { stay, change, breakEven, months: MAX_MONTHS };
}

// [label, which direction is better] for the measures offered when a next stage is started; the client adds their own.
export const DEFAULT_METRICS = [
  ['Commute, minutes a day', 'lower'],
  ['Stress, 1 to 10', 'lower'],
  ['Meaning or joy, 1 to 10', 'higher'],
  ['Time with family, hours a week', 'higher']
];
