// Eras: life chapters laid end to end after today's budget ("regular life"), each starting after the one before it
// plus its months of regular life. Cash is followed month by month through every era, next to staying in regular
// life the whole time. Blank take-home in an era uses the template's share of today's, labeled a guess. Blank
// spending starts from what the era says (spendFrom, S-097): today's budget, the short- or long-term dream, or the
// template's share of today (the default, a guess). Dollars a month. Depends on normalize.js (hasAnswer, toMonthly),
// money.js (minus), balances.js (cashOnHand), dream-life.js (eraSpendBase) and src/data/era-templates.json (via refs).

import { hasAnswer, toMonthly } from './normalize.js';
import { minus } from './money.js';
import { cashOnHand } from './balances.js';
import { eraSpendBase } from './dream-life.js';

/**
 * A month key moved by n months (a negative n goes back).
 * @param {string} key 'YYYY-MM'.
 * @param {number} n whole months.
 * @returns {string} 'YYYY-MM'.
 */
export function addMonths(key, n) {
  const [y, m] = key.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return Math.floor(t / 12) + '-' + String((t % 12) + 1).padStart(2, '0');
}

// An era's take-home or spending: the typed answer first, then a start handed in (today or a dream),
// then the template's share of today's number (to the cent, labeled a guess). A template with no
// share, or no base to take a share of, leaves it blank.
function eraMoney(value, base, share, start = null) {
  if (hasAnswer(value)) return { amount: toMonthly(value, 'monthly'), guess: false };
  if (start !== null) return { amount: start, guess: false };
  if (base === null || share === undefined) return { amount: null, guess: false };
  return { amount: Math.round(base * share * 100) / 100, guess: true };
}

/**
 * Every era in order with its cash path, next to staying in regular life.
 * @param {object} doc the household document (eras.list, currentMonth).
 * @param {object} totals budget totals, dollars a month (takeHome, spending).
 * @param {object} refs reference data; refs.eraTemplates.templates gives each template's income and spending as a
 *   share of today's (0 to 1) and its hints.
 * @param {object|null} [dreams=null] the dreamLife result, for eras whose spending starts from a dream.
 * @returns {object} eras (start and end 'YYYY-MM'; income, spend and net in dollars a month; oneTime and total in
 *   dollars; cashStart, cashEnd, runsOut month, shortBy, saveFirstMonths), path (one point a month: cash vs regular),
 *   endKey, cashEnd, regularEnd, costVsRegular (dollars) and totalMonths.
 */
export function eraTimeline(doc, totals, refs, dreams = null) {
  const eras = doc.eras || { list: [] };
  const templates = Object.fromEntries(
    ((refs.eraTemplates && refs.eraTemplates.templates) || []).map((t) => [t.id, t])
  );
  const baseIncome = totals.takeHome;
  const baseSpend = totals.spending;
  const baseNet = minus(baseIncome, baseSpend);
  // Cash now is read from the account balances (S-084), never asked here.
  const cashNow = cashOnHand(doc).amount;
  const cashKnown = cashNow !== null;
  // With no balances the path starts at 0 and shows only the change; runsOut and shortBy are withheld
  // below, since a 0 start would call every dip a shortfall.
  let cash = cashKnown ? cashNow : 0;
  let regular = cash;
  let key = doc.currentMonth;
  const path = [];
  const step = (net, eraId) => {
    if (net !== null) cash += net;
    if (baseNet !== null) regular += baseNet;
    path.push({ key, cash: net === null ? null : cash, regular: baseNet === null ? null : regular, eraId });
    key = addMonths(key, 1);
  };
  const out = [];
  for (const e of eras.list) {
    const t = templates[e.template] || templates.custom || {};
    // The months of regular life before this era run at today's net.
    for (let i = 0; i < e.gapMonths; i++) step(baseNet, null);
    const income = eraMoney(e.takeHome, baseIncome, t.income);
    const spendFrom = e.spendFrom || 'template';
    const startAt = eraSpendBase(dreams, spendFrom, baseSpend);
    const spend = eraMoney(e.spending, baseSpend, t.spending, startAt);
    const net = minus(income.amount, spend.amount);
    const oneTime = e.oneTime.amount;
    const start = key;
    const cashStart = cash;
    // The one-time cost is paid on day one, so it alone can run the cash out before the first month.
    if (oneTime !== null) cash -= oneTime;
    let low = cash;
    let runsOut = cash < 0 ? start : null;
    for (let i = 0; i < e.months; i++) {
      step(net, e.id);
      if (net !== null && cash < low) low = cash;
      if (runsOut === null && net !== null && cash < 0) runsOut = path[path.length - 1].key;
    }
    const shortBy = low < 0 ? -low : 0;
    out.push({
      id: e.id,
      name: e.name,
      template: e.template,
      oneTimeHint: t.oneTimeHint || '',
      about: t.about || '',
      start,
      end: addMonths(start, e.months - 1),
      months: e.months,
      gapMonths: e.gapMonths,
      income: income.amount,
      incomeGuess: income.guess,
      spend: spend.amount,
      spendGuess: spend.guess,
      spendFrom,
      spendTyped: hasAnswer(e.spending),
      spendStart: startAt,
      net,
      oneTime,
      oneTimeBlank: oneTime === null,
      // A blank one-time cost counts as none in the total; oneTimeBlank tells the screen to say so.
      total: net === null ? null : net * e.months - (oneTime || 0),
      cashStart,
      cashEnd: net === null ? null : cash,
      cashChange: net === null ? null : cash - cashStart,
      runsOut: cashKnown ? runsOut : null,
      shortBy: cashKnown ? shortBy : null,
      // Months of regular life to save first so the cash never dips below zero.
      saveFirstMonths: cashKnown && shortBy > 0 && baseNet > 0 ? Math.ceil(shortBy / baseNet) : null
    });
  }
  const last = path.length ? path[path.length - 1] : null;
  return {
    cashKnown,
    baseIncome,
    baseSpend,
    baseNet,
    eras: out,
    path,
    endKey: last ? last.key : null,
    cashEnd: last ? last.cash : null,
    regularEnd: last ? last.regular : null,
    // What the eras cost compared with regular life over the same months.
    costVsRegular: last && last.cash !== null && last.regular !== null ? last.regular - last.cash : null,
    totalMonths: path.length
  };
}
