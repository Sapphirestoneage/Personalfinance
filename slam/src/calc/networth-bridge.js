// The net worth bridge (S-112): why net worth changed in a month, like the budget-to-cash bridge
// (bridge.js) but for the balance sheet. Every line is sourced and linked.
//
//   start net worth                         (every account and debt at the start of the month)
// + surplus                                 (the budget's: take-home - spending - savings)
// + timing and one-offs                     (the cash bridge's yearly bills, money owed and paid back,
//                                            one-off spending, and income vs take-home)
// + saved and invested                      (the budget's savings lines, which are money moved into your
//                                            own accounts, plus paycheck deductions into an account)
// + debt paid down                          (card payments in the budget, and each other debt's balance
//                                            going down: the principal; the interest stays spent)
// + market change on investments            (per account: end - start - contributions)
// + value change on things you own          (per home, vehicle, or other thing: end - start)
// - debt added, not from payments           (each other debt's balance going up: interest added, new
//                                            borrowing, anything else)
// = explained end net worth
//   not explained yet = actual end net worth - explained end net worth
//
// Why it ties (worked out in S-112): the change in net worth is the change in cash, investments,
// and things you own, less the change in what is owed. Investments are contributions + market by
// definition, things you own are their value change, and other debts are paid down - added by
// definition. The cash and cards part is the cash bridge. So what is left, not explained yet, is
// the cash bridge's own not explained yet, plus money moved into investments that the budget did
// not count as savings (or counted but did not move), plus the contributions of an investment
// account that was not updated this month. With nothing missing, explained + not explained = the
// actual change, by construction.
//
// FI net worth runs the same lines on FI accounts only: assets that do not count (and the debts
// they secure) are left out, and money moved into them is its own line. Its not explained yet is
// the same amount as the total's.

import { bridgeFor } from './bridge.js';
import { balanceAt, liabilities, lastDayOf, kindOf } from './balances.js';
import { contributionsFor } from './contributions.js';
import { netWorthAt } from './networth.js';
import { counted } from './log.js';
import { countsForFI } from '../store/schema.js';

const r2 = (x) => Math.round(x * 100) / 100 + 0;
const add = (xs) => r2(xs.reduce((a, x) => a + x, 0));
const TIMING = ['yearly', 'owed', 'received', 'one-off', 'income'];
const COUNTS = new Set(['spend', 'fee', 'refund', 'reimbursement']);
const prevDay = (date) => new Date(Date.parse(date + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);

const typed = (v) => !!v && v.amount !== null && v.amount !== undefined;

// One account's or debt's balance going into the month: the start typed for the month (on any day it
// was read), else the latest dated balance before the month. The same start the cash bridge uses.
export function monthStartOf(doc, key, month) {
  const b = ((doc.balances || {})[month] || {})[key];
  if (b && typed(b.start)) return { date: b.startOn || month + '-01', amount: b.start.amount, status: b.start.status, from: 'start' };
  return balanceAt(doc, key, prevDay(month + '-01'));
}

// And at the end of the month: the end typed for the month, else the latest dated balance in it.
export function monthEndOf(doc, key, month) {
  const b = ((doc.balances || {})[month] || {})[key];
  if (b && typed(b.end)) return { date: b.endOn || lastDayOf(month), amount: b.end.amount, status: b.end.status, from: 'end' };
  return balanceAt(doc, key, lastDayOf(month));
}

// Updated this month: an end typed for it, or a balance checked during it.
function span(doc, key, month) {
  const s = monthStartOf(doc, key, month);
  const e = monthEndOf(doc, key, month);
  const updated = !!e && (e.from === 'end' || (e.from === 'check' && e.date >= month + '-01'));
  return { start: s ? s.amount : null, end: e ? e.amount : null, updated, last: e ? e.date : null };
}

export function netWorthBridge(doc, income, month) {
  const br = bridgeFor(doc, income, month);
  const contrib = contributionsFor(doc, income, month);
  const accts = (doc.accounts || []).filter((a) => a.state !== 'archived');
  const securedBy = {};
  for (const a of accts) if (a.securedDebtId && !securedBy[a.securedDebtId]) securedBy[a.securedDebtId] = a;
  const startNW = netWorthAt(doc, month + '-01', (key) => monthStartOf(doc, key, month));
  const endNW = netWorthAt(doc, lastDayOf(month), (key) => monthEndOf(doc, key, month));

  const invested = accts.filter((a) => kindOf(a) === 'invested').map((a) => ({ a, ...span(doc, a.id, month), c: contrib.byAccount[a.id] }));
  const valued = accts.filter((a) => kindOf(a) === 'valued').map((a) => ({ a, ...span(doc, a.id, month) }));
  const debts = liabilities(doc).filter((l) => !l.account).map((l) => {
    const by = securedBy[l.debtId] || null;
    return { l, ...span(doc, l.key, month), fi: !(by && !countsForFI(by)) };
  });
  // Savings-line entries out of your accounts this month (the budget counted them as savings).
  const savingsLines = new Set((doc.categories || []).filter((c) => c.savings).flatMap((c) => c.lines.map((l) => l.id)));
  const savEntries = add(counted(doc.transactions || []).filter((t) => t.date.slice(0, 7) === month && savingsLines.has(t.lineId) && COUNTS.has(t.kind) && !t.oneOff).map((t) => t.amount));

  const step = (key) => (br.steps.find((x) => x.key === key) || { amount: 0 }).amount;
  const timing = br.steps.filter((x) => TIMING.includes(x.key));
  const cardMin = step('card-min');

  const build = (fiOnly) => {
    const inv = invested.filter((x) => !fiOnly || countsForFI(x.a));
    const val = valued.filter((x) => !fiOnly || countsForFI(x.a));
    const dbt = debts.filter((x) => !fiOnly || x.fi);
    const known = (x) => x.start !== null && x.end !== null;
    const market = inv.filter((x) => known(x) && x.updated).map((x) => ({ name: x.a.name, id: x.a.id, amount: r2(x.end - x.start - x.c.total), start: x.start, end: x.end, contributions: x.c.total }));
    const value = val.filter((x) => known(x) && x.end !== x.start).map((x) => ({ name: x.a.name, id: x.a.id, amount: r2(x.end - x.start), start: x.start, end: x.end }));
    const paid = dbt.filter((x) => known(x) && x.end < x.start).map((x) => ({ name: x.l.name, key: x.l.key, amount: r2(x.start - x.end) }));
    const added = dbt.filter((x) => known(x) && x.end > x.start).map((x) => ({ name: x.l.name, key: x.l.key, amount: r2(x.end - x.start) }));
    const deductions = add(inv.map((x) => x.c.deductions));
    // FI only: money moved into accounts that do not count leaves FI net worth.
    const movedOut = fiOnly ? invested.filter((x) => !countsForFI(x.a)).map((x) => ({ name: x.a.name, id: x.a.id, amount: r2(-x.c.transfers) })).filter((x) => x.amount) : [];
    const lines = [];
    const line = (key, label, amount, from, link) => { lines.push({ key, label, amount: r2(amount), from, link }); };
    line('surplus', 'Surplus: take-home less spending and savings', br.surplus === null ? null : br.surplus, 'The budget for ' + month, { to: 'actual' });
    const t = add(timing.map((x) => x.amount));
    if (t) line('timing', 'Timing and one-offs', t, timing.map((x) => x.short + ' ' + money(x.amount)).join(', '), { to: 'bridge' });
    const saved = r2((br.savings || 0) + deductions);
    if (saved) line('saved', 'Saved and invested (moved into your own accounts, not spent)', saved, 'Savings lines ' + money(br.savings || 0) + (deductions ? ', from the paycheck ' + money(deductions) : ''), { to: 'actual' });
    if (movedOut.length) line('moved-out', 'Moved into accounts that do not count toward FI', add(movedOut.map((x) => x.amount)), movedOut.map((x) => x.name + ' ' + money(-x.amount)).join(', '), { to: 'balances' });
    const down = r2(cardMin + add(paid.map((x) => x.amount)));
    if (down) line('paid-down', 'Debt paid down (the principal; interest stays spent)', down, [cardMin ? 'Card payments ' + money(cardMin) : null, ...paid.map((x) => x.name + ' ' + money(x.amount))].filter(Boolean).join(', '), { to: 'balances' });
    const m = add(market.map((x) => x.amount));
    if (market.length && m) line('market', 'Market change on investments', m, market.map((x) => x.name + ' ' + signed(x.amount)).join(', '), { to: 'balances' });
    const v = add(value.map((x) => x.amount));
    if (v) line('value', 'Value change on things you own', v, value.map((x) => x.name + ' ' + signed(x.amount)).join(', '), { to: 'balances' });
    const up = add(added.map((x) => x.amount));
    if (up) line('debt-added', 'Debt added, not from payments (interest, new borrowing)', -up, added.map((x) => x.name + ' +' + money(x.amount)).join(', '), { to: 'balances' });
    const start = fiOnly ? startNW.fi : startNW.total;
    const actualEnd = fiOnly ? endNW.fi : endNW.total;
    // The surplus is needed; without it nothing is explained.
    const explained = start === null || br.surplus === null ? null : r2(start + add(lines.map((x) => x.amount)));
    // Cash and cards must be in to know the actual change (as in the cash bridge).
    const cashKnown = br.actual !== null && !br.missing.length;
    const unexplained = explained !== null && actualEnd !== null && cashKnown ? r2(actualEnd - explained) : null;
    const stale = inv.filter((x) => !x.updated && x.c.total).map((x) => ({ name: x.a.name, last: x.last, contributions: x.c.total }));
    return { start, lines, explained, actual: actualEnd, change: start === null || actualEnd === null ? null : r2(actualEnd - start), unexplained, stale, market, value, paid, added };
  };

  const total = build(false);
  const fi = build(true);
  const out = {
    month, total, fi,
    // Where the not explained part comes from, when everything is in (see the identity above).
    parts: { cash: br.unexplained, moved: r2(add(invested.map((x) => x.c.transfers)) - savEntries), stale: r2(-add(invested.filter((x) => !x.updated).map((x) => x.c.total))) },
    within: br.within,
    missingStart: startNW.missing, missingEnd: endNW.missing
  };
  out.total.ties = out.total.unexplained === null ? null : Math.abs(out.total.unexplained) < br.within;
  out.fi.ties = out.fi.unexplained === null ? null : Math.abs(out.fi.unexplained) < br.within;
  out.reading = reading(out.total, br.within);
  out.fiReading = reading(out.fi, br.within, 'FI net worth');
  return out;
}

function money(x) {
  const v = Math.round(Math.abs(x) * 100) / 100;
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 });
}
const signed = (x) => (x < 0 ? '-' : '+') + money(x);
const whole = (x) => '$' + Math.round(Math.abs(x)).toLocaleString('en-US');

// One plain sentence or two, no judgment. "Net worth rose $1,240. $650 you saved, $410 the market added, $180 of debt paid down."
export function reading(b, within, name = 'Net worth') {
  if (b.change === null) return name + ' needs a balance for every account at the start and end of the month.';
  const amt = (k) => (b.lines.find((x) => x.key === k) || { amount: 0 }).amount;
  const saved = r2(amt('surplus') + amt('timing') + amt('saved') + amt('moved-out'));
  const bits = [];
  if (Math.round(saved)) bits.push(saved > 0 ? whole(saved) + ' you saved' : whole(saved) + ' more went out than came in');
  if (Math.round(amt('market'))) bits.push(amt('market') > 0 ? whole(amt('market')) + ' the market added' : whole(amt('market')) + ' the market took');
  if (Math.round(amt('paid-down'))) bits.push(whole(amt('paid-down')) + ' of debt paid down');
  if (Math.round(amt('value'))) bits.push(amt('value') > 0 ? whole(amt('value')) + ' of value gained on things you own' : whole(amt('value')) + ' of value lost on things you own');
  if (Math.round(amt('debt-added'))) bits.push(whole(amt('debt-added')) + ' added to debts');
  const head = name + (Math.abs(b.change) < 0.5 ? ' held steady' : b.change > 0 ? ' rose ' + whole(b.change) : ' fell ' + whole(b.change)) + '.';
  const tail = b.unexplained !== null && Math.abs(b.unexplained) >= (within === undefined ? 25 : within) ? ' ' + whole(b.unexplained) + ' is not explained yet' + (b.stale.length ? ' (' + b.stale.map((x) => x.name).join(', ') + ' not updated this month)' : '') + '.' : '';
  return head + (bits.length ? ' ' + bits.join(', ').replace(/^./, (c) => c.toUpperCase()) + '.' : '') + tail;
}

// The waterfall: start, each line, explained, not explained yet (drawn apart), actual end.
export function netWorthBridgeRows(b) {
  if (b.start === null) return [];
  const rows = [{ label: 'Start', from: 0, to: b.start, kind: 'total' }];
  let run = b.start;
  for (const l of b.lines) { rows.push({ label: SHORT[l.key] || l.label, from: run, to: run + l.amount, kind: 'step' }); run += l.amount; }
  rows.push({ label: 'Explained', from: 0, to: b.explained, kind: 'total' });
  if (b.unexplained !== null && Math.abs(b.unexplained) >= 0.005) rows.push({ label: 'Not explained yet', from: b.explained, to: b.actual, kind: 'unexplained' });
  if (b.actual !== null) rows.push({ label: 'End', from: 0, to: b.actual, kind: 'total' });
  return rows;
}
const SHORT = { surplus: 'Surplus', timing: 'Timing', saved: 'Saved', 'moved-out': 'Moved out of FI', 'paid-down': 'Debt paid', market: 'Market', value: 'Values', 'debt-added': 'Debt added' };
