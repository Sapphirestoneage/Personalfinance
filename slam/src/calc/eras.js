// Eras: life chapters laid end to end after today's budget ("regular life").
// Each era starts after the one before it, plus its months of regular life.
// Cash is followed month by month through every era, next to staying in
// regular life the whole time. Blank take-home or spending in an era uses the
// template's share of today's numbers, labeled a guess.

import { hasAnswer, toMonthly } from './normalize.js';
import { minus } from './money.js';

export function addMonths(key, n) {
  const [y, m] = key.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return Math.floor(t / 12) + '-' + String((t % 12) + 1).padStart(2, '0');
}

function eraMoney(value, base, share) {
  if (hasAnswer(value)) return { amount: toMonthly(value, 'monthly'), guess: false };
  if (base === null || share === undefined) return { amount: null, guess: false };
  return { amount: Math.round(base * share * 100) / 100, guess: true };
}

export function eraTimeline(doc, totals, refs) {
  const eras = doc.eras || { cashNow: null, list: [] };
  const templates = Object.fromEntries(((refs.eraTemplates && refs.eraTemplates.templates) || []).map((t) => [t.id, t]));
  const baseIncome = totals.takeHome;
  const baseSpend = totals.spending;
  const baseNet = minus(baseIncome, baseSpend);
  const cashKnown = !!eras.cashNow && eras.cashNow.amount !== null;
  let cash = cashKnown ? eras.cashNow.amount : 0;
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
    for (let i = 0; i < e.gapMonths; i++) step(baseNet, null);
    const income = eraMoney(e.takeHome, baseIncome, t.income);
    const spend = eraMoney(e.spending, baseSpend, t.spending);
    const net = minus(income.amount, spend.amount);
    const oneTime = e.oneTime.amount;
    const start = key;
    const cashStart = cash;
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
      id: e.id, name: e.name, template: e.template, oneTimeHint: t.oneTimeHint || '', about: t.about || '',
      start, end: addMonths(start, e.months - 1), months: e.months, gapMonths: e.gapMonths,
      income: income.amount, incomeGuess: income.guess, spend: spend.amount, spendGuess: spend.guess,
      net, oneTime, oneTimeBlank: oneTime === null,
      total: net === null ? null : net * e.months - (oneTime || 0),
      cashStart, cashEnd: net === null ? null : cash,
      runsOut: cashKnown ? runsOut : null, shortBy: cashKnown ? shortBy : null,
      // Months of regular life to save first so the cash never dips below zero.
      saveFirstMonths: cashKnown && shortBy > 0 && baseNet > 0 ? Math.ceil(shortBy / baseNet) : null
    });
  }
  const last = path.length ? path[path.length - 1] : null;
  return {
    cashKnown, baseIncome, baseSpend, baseNet,
    eras: out, path,
    endKey: last ? last.key : null,
    cashEnd: last ? last.cash : null,
    regularEnd: last ? last.regular : null,
    // What the eras cost compared with regular life over the same months.
    costVsRegular: last && last.cash !== null && last.regular !== null ? last.regular - last.cash : null,
    totalMonths: path.length
  };
}
