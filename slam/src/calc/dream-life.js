// The dream life (S-097), shown at the top of Eras: what the client would like
// to spend, short term (this year, or the next step) and long term (the life
// they are building toward), next to today. The budget never reads the dream
// columns; this file is the only calc that does, through columnModel.
//
// Today, per category, is the budget's actual, falling back to the estimate
// (and saying so). A category with no long-term dream follows its short-term
// one (line by line: a blank line follows its short-term dream); a category
// with no dream at all follows today. Totals are spending only (savings
// categories are shown, never added in), the same as the budget's spending.

import { columnModel } from './model.js';
import { ratio, minus, sumKnown } from './money.js';

const r2 = (x) => (x === null ? null : Math.round(x * 100) / 100);

// "The pay this dream needs": the monthly take-home that pays for this spending and still
// saves the same share of take-home as today. spending / (1 - savingsShare).
export function takeHomeFor(spending, savingsShare) {
  if (spending === null || savingsShare === null || savingsShare >= 1) return null;
  return r2(spending / (1 - savingsShare));
}

function todayOf(row) {
  if (row.actual !== null) return { amount: row.actual, from: 'actual' };
  if (row.estimate !== null) return { amount: row.estimate, from: 'estimate' };
  return { amount: null, from: null };
}

const names = (xs) => (xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1]);

// One sentence on how a dream compares with today. diffs: [{ name, diff }].
export function dreamReading(label, total, today, diffs) {
  const d = minus(total, today);
  if (d === null) return null;
  const dollars = '$' + Math.round(Math.abs(d)).toLocaleString('en-US');
  if (Math.abs(d) < 0.5) return 'Your ' + label + ' costs about the same as today.';
  const up = d > 0;
  const top = diffs.filter((x) => (up ? x.diff > 0 : x.diff < 0)).sort((a, b) => (up ? b.diff - a.diff : a.diff - b.diff)).slice(0, 2).map((x) => x.name);
  return 'Your ' + label + ' costs ' + dollars + ' a month ' + (up ? 'more' : 'less') + ' than today' + (top.length ? ', mostly ' + names(top) : '') + '.';
}

// summary: the budget summary (rows and totals). Returns the comparison, totals, and readings.
export function dreamLife(doc, summary) {
  const th = summary.totals.takeHome;
  const short = columnModel(doc, 'dream');
  const long = columnModel(doc, 'dreamLong', 'dream');
  const hasShort = short.some((c) => c.own && !c.isDebt && !c.notForMe);
  const hasLong = long.some((c) => c.own && !c.isDebt && !c.notForMe);
  const any = hasShort || hasLong;
  const rows = [];
  for (const s of short) {
    const b = summary.rows.find((x) => x.id === s.id);
    if (!b || s.isEverything && b.estimate === null) continue;
    const l = long.find((x) => x.id === s.id);
    const today = todayOf(b);
    const shortAmt = s.amount !== null ? s.amount : today.amount;
    const longAmt = l.own && l.amount !== null ? l.amount : shortAmt;
    rows.push({
      id: s.id, name: s.name, savings: s.savings, isDebt: s.isDebt, notForMe: s.notForMe,
      today: today.amount, todayFrom: today.from,
      short: shortAmt, shortFrom: s.amount !== null ? 'dream' : 'today',
      long: longAmt, longFrom: l.own && l.amount !== null ? 'dream' : s.amount !== null ? 'short' : 'today',
      todayShare: ratio(today.amount, th), shortShare: ratio(shortAmt, th), longShare: ratio(longAmt, th),
      shortDiff: minus(shortAmt, today.amount), longDiff: minus(longAmt, today.amount)
    });
  }
  const spend = rows.filter((r) => !r.savings);
  const sum = (k) => sumKnown(spend.map((r) => r[k])).total;
  const today = sum('today');
  const shortTotal = sum('short');
  const longTotal = sum('long');
  // Today's share of take-home saved (the budget's savings over take-home).
  const savingsShare = ratio(summary.totals.savings, th);
  // The dream the pay is worked out for: long term (which copies short term where it is blank).
  const payNeeded = takeHomeFor(longTotal, savingsShare);
  return {
    any, hasShort, hasLong, rows, takeHome: th,
    today, shortTotal, longTotal,
    shortDiff: minus(shortTotal, today), longDiff: minus(longTotal, today),
    todayUsesEstimate: rows.filter((r) => r.todayFrom === 'estimate').map((r) => r.name),
    savingsShare,
    pay: { needed: payNeeded, short: minus(payNeeded, th) },
    // With no long-term dream at all, long follows short, so only the short-term sentence is said.
    readings: {
      short: hasShort ? dreamReading('short-term dream', shortTotal, today, spend.map((r) => ({ name: r.name, diff: r.shortDiff }))) : null,
      long: hasLong ? dreamReading('long-term dream', longTotal, today, spend.map((r) => ({ name: r.name, diff: r.longDiff }))) : null
    },
    // For the dream entry screen (moved from the budget as it was): each column as given, and what it leaves.
    entry: entryOf(summary, short, columnModel(doc, 'dreamLong'), th)
  };
}

// The dream entry rows and running totals: the budget's own row (name, type, estimate)
// with each dream column beside it, exactly as typed (no following).
function entryOf(summary, short, long, th) {
  const rows = summary.rows.map((r) => {
    const s = short.find((x) => x.id === r.id) || {};
    const l = long.find((x) => x.id === r.id) || {};
    return {
      id: r.id, name: r.name, type: r.type, isDebt: r.isDebt, isEverything: r.isEverything, notForMe: r.notForMe, savings: r.savings,
      estimate: r.estimate, estimateFrom: r.estimateFrom, pctTakeHome: { estimate: r.pctTakeHome.estimate },
      dream: s.amount === undefined ? null : s.amount, dreamFrom: s.from || null,
      dreamLong: l.amount === undefined ? null : l.amount, dreamLongFrom: l.from || null,
      status: { dream: s.status || null, dreamLong: l.status || null }
    };
  });
  const column = (cats) => {
    const answered = cats.filter((c) => c.amount !== null);
    const outflow = answered.length ? sumKnown(answered.map((c) => c.amount)).total : null;
    return { outflow, left: minus(th, outflow) };
  };
  return { rows, dream: column(short), dreamLong: column(long) };
}

// Where an era's blank spending starts (S-097, ERA_SPEND_FROM): today's budget, a dream,
// or null for the template's share of today (the default).
// With no dream life (or none passed in), a dream start falls back to the template's share.
export function eraSpendBase(dl, from, baseSpend) {
  if (from === 'today') return baseSpend;
  if (!dl || !dl.any) return null;
  if (from === 'dream') return dl.shortTotal;
  if (from === 'dreamLong') return dl.longTotal;
  return null;
}
