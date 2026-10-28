// Worked out from what was read, never asked (S-243): a card's utilization and whether it carries a balance, the
// interest a month and a year, the close and due days; a bank account's paychecks and repeating bills; transfers
// matched across accounts so nothing counts twice; what is invested and on pace against this year's limits; the
// net worth the batch shows; and how old each statement is. Flags are plain sentences; the screen never colors
// them red.

import { val, daysBetween, fromDay, toDay } from './text.js';
import { DOC_TYPES } from './classify.js';
import { PRESETS } from '../schema.js';
import { merchantKey } from '../../src/calc/tx-import.js';

export const STALE_DAYS = 45;
const r2 = (x) => (x === null || x === undefined ? null : Math.round(x * 100) / 100);
const r4 = (x) => (x === null || x === undefined ? null : Math.round(x * 10000) / 10000);
const dayOf = (iso) => (iso ? +iso.slice(8, 10) : null);
const v = (doc, k) => (doc.fields && doc.fields[k] ? val(doc.fields[k]) : null);
const close = (doc) => val(doc.common && doc.common.closing);
const isInvestment = (doc) => doc.reader === 'investment' || doc.reader === 'plan';
const isCash = (doc) => doc.reader === 'bank';

// ---------------------------------------------------------------- one document
export function deriveDoc(doc, { today }) {
  const d = { flags: [] };
  const c = close(doc);
  d.staleDays = c ? daysBetween(c, today) : null;
  if (d.staleDays !== null && d.staleDays > STALE_DAYS) d.flags.push({ id: 'stale', text: 'This statement closed ' + d.staleDays + ' days ago, so the numbers are older than ' + STALE_DAYS + ' days. A newer one would be better.' });
  if (doc.reader === 'card') deriveCard(doc, d, today);
  if (doc.reader === 'bank') deriveBank(doc, d);
  if (doc.reader === 'plan') { const un = v(doc, 'unvested'); if (un !== null && un > 0.5) d.flags.push({ id: 'unvested', text: money(un) + ' of the employer money is not yours yet. Leaving the job before it vests gives it up.' }); }
  if (isInvestment(doc) && doc.reader === 'investment' && ['brokerage', 'ira_traditional', 'ira_roth', 'ira_rollover', 'ira_sep'].includes(doc.type)) {
    const cash = v(doc, 'cashBalance'), total = v(doc, 'ending');
    if (cash !== null && total !== null && cash > Math.max(500, total * 0.1)) d.flags.push({ id: 'idle-cash', text: money(cash) + ' is sitting in cash in this account, not invested. Decide if it is waiting for something.' });
  }
  return d;
}
function deriveCard(doc, d, today) {
  const bal = v(doc, 'newBalance'), lim = v(doc, 'limit'), prev = v(doc, 'previousBalance'), pay = v(doc, 'payments'), interest = v(doc, 'interest');
  d.utilization = bal !== null && lim ? r4(bal / lim) : null;
  d.carrying = interest !== null && interest > 0 ? true : prev !== null && pay !== null ? pay < prev - 0.005 : null;
  d.paidInFull = prev !== null && pay !== null ? pay >= prev - 0.005 : null;
  d.monthlyInterest = interest; d.annualInterest = interest === null ? null : r2(interest * 12);
  d.closeDay = dayOf(close(doc)); d.dueDay = dayOf(v(doc, 'dueDate'));
  const over = v(doc, 'overLimit');
  if ((over !== null && over > 0) || (bal !== null && lim !== null && bal > lim)) d.flags.push({ id: 'over-limit', text: 'The balance is ' + money(over !== null && over > 0 ? over : bal - lim) + ' over the limit. New charges may be declined until it is paid down.' });
  const due = v(doc, 'dueDate');
  if (due && bal !== null && bal > 0 && due <= today) d.flags.push({ id: 'due', text: due === today ? 'The payment is due today.' : 'The payment date on this statement, ' + due + ', has passed. Check that it was paid.' });
  if (v(doc, 'autopayType') === 'minimum' && d.carrying) d.flags.push({ id: 'min-autopay', text: 'AutoPay pays only the minimum while this card carries a balance, so interest keeps building. Raising it would cut the interest.' });
  const af = v(doc, 'annualFee'), purch = v(doc, 'purchases');
  if (af !== null && af > 0 && purch !== null && purch <= 0.005) d.flags.push({ id: 'fee-no-use', text: 'An annual fee of ' + money(af) + ' was charged with no purchases this period. Worth deciding if the card earns its keep.' });
}
// Paychecks and repeating bills from a bank account's rows.
export function deriveBank(doc, d = { flags: [] }, history = []) {
  const tx = (doc.fields && doc.fields.transactions) || [];
  d.paychecks = paychecks(tx, history);
  d.recurring = recurring(tx, history);
  const apy = v(doc, 'apy'), bal = v(doc, 'ending'), ip = v(doc, 'interestPeriod');
  d.interestAnnualized = ip !== null && bal ? r4((ip * 12) / bal) : null;
  d.apyGap = d.interestAnnualized !== null && apy !== null ? r4(d.interestAnnualized - apy) : null;
  return d;
}
const PAY_WORDS = /payroll|direct ?dep|dir dep|salary|\bppd\b|ach credit|wages|paycheck|\bpay\b/i;
const CADENCE = (gap) => (gap >= 5 && gap <= 9 ? 'weekly' : gap >= 12 && gap <= 16 ? 'biweekly' : gap >= 13 && gap <= 18 ? 'semimonthly' : gap >= 26 && gap <= 35 ? 'monthly' : null);
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
export function paychecks(tx, history = []) {
  const rows = [...tx, ...history].filter((t) => t.amount > 0 && (t.type === 'deposit' || t.type === 'income') && PAY_WORDS.test(t.description || ''));
  const groups = {};
  for (const t of rows) { const k = merchantKey(t.description); (groups[k] = groups[k] || []).push(t); }
  const out = [];
  for (const [k, list] of Object.entries(groups)) {
    const dates = [...new Set(list.map((t) => t.date))].sort();
    const gaps = dates.slice(1).map((dt, i) => daysBetween(dates[i], dt));
    const gap = median(gaps);
    const cadence = gap === null ? null : CADENCE(gap);
    const last = dates[dates.length - 1];
    const step = cadence === 'weekly' ? 7 : cadence === 'biweekly' ? 14 : cadence === 'semimonthly' ? 15 : cadence === 'monthly' ? 30 : null;
    out.push({ employer: k, amount: median(list.map((t) => t.amount)), count: list.length, cadence, last, next: step ? fromDay(toDay(last) + step) : null, conf: cadence ? 'inferred' : 'missing' });
  }
  return out.sort((a, b) => b.amount - a.amount);
}
// The same payee, about the same amount (within 25%), seen more than once in these files or in the log.
export function recurring(tx, history = []) {
  const rows = [...tx.map((t) => ({ ...t, here: true })), ...history].filter((t) => t.amount < 0 || t.type === 'purchase' || t.type === 'spend');
  const groups = {};
  for (const t of rows) { const k = merchantKey(t.description || t.merchant || ''); if (k === 'UNKNOWN') continue; (groups[k] = groups[k] || []).push(t); }
  const out = [];
  for (const [k, list] of Object.entries(groups)) {
    if (list.length < 2 || !list.some((t) => t.here)) continue;
    const amts = list.map((t) => Math.abs(t.amount)); const m = median(amts);
    if (!amts.every((a) => Math.abs(a - m) <= Math.max(1, m * 0.25))) continue;
    const dates = [...new Set(list.map((t) => t.date))].sort();
    if (dates.length < 2) continue;
    out.push({ merchant: k, amount: m, count: list.length, last: dates[dates.length - 1], cadence: CADENCE(median(dates.slice(1).map((dt, i) => daysBetween(dates[i], dt)))) });
  }
  return out;
}

// ---------------------------------------------------------------- across the batch
// Transfers: a bank row that pays a card matches the card statement's payment credit (same amount within 5 days, or
// the card's last four in the words); a move between two bank accounts matches the other side. Both rows are tagged
// transferWith so the log never counts them.
export function matchTransfers(docs) {
  const pairs = [];
  for (const d of docs) for (const t of ((d.fields && d.fields.transactions) || [])) delete t.transferWith;
  const banks = docs.filter((x) => x.reader === 'bank'), cards = docs.filter((x) => x.reader === 'card');
  const close = (a, b) => Math.abs(Math.abs(a) - Math.abs(b)) < 0.005;
  const near = (a, b) => Math.abs(daysBetween(a, b)) <= 5;
  const taken = new Set();
  for (const b of banks) for (const t of (b.fields.transactions || [])) {
    if (t.amount >= 0 || !/payment|autopay|pymt|crd|card|transfer|xfer/i.test(t.description)) continue;
    for (const c of cards) {
      const four = val(c.common.lastFour);
      const hit = (c.fields.transactions || []).find((p) => p.type === 'payment' && !taken.has(p) && close(p.amount, t.amount) && near(p.date, t.date));
      if (!hit && !(four && t.description.includes(four) && close(t.amount, v(c, 'payments') || 0))) continue;
      t.transferWith = c.id; if (hit) { hit.transferWith = b.id; taken.add(hit); }
      pairs.push({ from: b.id, to: c.id, amount: Math.abs(t.amount), date: t.date, kind: 'card-payment', byLastFour: !hit });
      break;
    }
  }
  for (const a of banks) for (const t of (a.fields.transactions || [])) {
    if (t.transferWith || t.amount >= 0 || !/transfer|xfer|to savings|to checking|online transfer/i.test(t.description)) continue;
    for (const b of banks) {
      if (b === a) continue;
      const hit = (b.fields.transactions || []).find((p) => !p.transferWith && p.amount > 0 && close(p.amount, t.amount) && near(p.date, t.date) && /transfer|xfer|from/i.test(p.description));
      if (!hit) continue;
      t.transferWith = b.id; hit.transferWith = a.id;
      pairs.push({ from: a.id, to: b.id, amount: Math.abs(t.amount), date: t.date, kind: 'transfer' });
      break;
    }
  }
  return pairs;
}

// Utilization across the batch, and personal cards only; what is invested and how it is split; contributions
// against this year's limits; the net worth these statements show.
export function deriveBatch(docs, { today, rules = null, spine = null } = {}) {
  const out = { flags: [] };
  const newest = newestPerAccount(docs);
  const cards = newest.filter((d) => d.reader === 'card');
  const sum = (list, k) => list.reduce((s, d) => (v(d, k) === null ? s : s + v(d, k)), 0);
  const withLimit = cards.filter((d) => v(d, 'limit') && v(d, 'newBalance') !== null);
  const personal = withLimit.filter((d) => !d.business);
  out.utilization = { overall: withLimit.length ? r4(sum(withLimit, 'newBalance') / sum(withLimit, 'limit')) : null, personal: personal.length ? r4(sum(personal, 'newBalance') / sum(personal, 'limit')) : null, cards: withLimit.length, personalCards: personal.length };
  out.transfers = matchTransfers(docs);
  // Invested: investment and plan accounts' ending values; the split by class from the holdings that name one.
  const inv = newest.filter(isInvestment);
  out.invested = { total: r2(inv.reduce((s, d) => s + (v(d, 'ending') ?? v(d, 'total') ?? 0), 0)), accounts: inv.length };
  const byClass = {};
  for (const d of inv) for (const h of (d.fields.holdings || [])) { const k = h.assetClass || 'not stated'; byClass[k] = r2((byClass[k] || 0) + h.value); }
  for (const d of inv) { const cash = v(d, 'cashBalance'); if (cash) byClass.cash = r2((byClass.cash || 0) + cash); }
  out.allocation = byClass;
  // Contributions this year against the limit for the account's type (data/rules-<year>.json, one table with sources).
  out.contributions = [];
  const year = +today.slice(0, 4), dayOfYear = daysBetween(year + '-01-01', today) + 1;
  for (const d of inv) {
    const preset = PRESETS[DOC_TYPES[d.type] ? DOC_TYPES[d.type].preset : null];
    const ytd = d.reader === 'plan' ? v(d, 'ytdEmployee') : (v(d, 'contributions') || []).filter((c) => c.year === year).reduce((s, c) => s + c.amount, 0) || (v(d, 'employeeContrib') ?? null);
    if (ytd === null || ytd === undefined || !preset || !preset.limitRule || !rules) continue;
    let limit = null;
    try { limit = rules.get(preset.limitRule, year); } catch { limit = null; }
    if (typeof limit !== 'number') continue;
    const pace = r2((ytd / dayOfYear) * 365);
    const status = ytd > limit + 0.005 ? 'over' : pace > limit * 1.02 ? 'exceed' : ytd > 0 && pace < limit * 0.9 ? 'miss' : 'on';
    out.contributions.push({ doc: d.id, type: d.type, year, ytd: r2(ytd), limit, pace, status, rule: preset.limitRule });
    const name = DOC_TYPES[d.type].words;
    if (status === 'over') out.flags.push({ id: 'over-limit-contrib', doc: d.id, text: 'The ' + name + ' has ' + money(ytd) + ' in for ' + year + ', over the ' + money(limit) + ' limit. The extra needs to come out before the tax deadline.' });
    else if (status === 'exceed') out.flags.push({ id: 'pace-exceed', doc: d.id, text: 'At this pace the ' + name + ' passes its ' + money(limit) + ' limit for ' + year + '. The last contributions of the year may need trimming.' });
    else if (status === 'miss') out.flags.push({ id: 'pace-miss', doc: d.id, text: 'At this pace the ' + name + ' ends ' + year + ' at about ' + money(pace) + ' of the ' + money(limit) + ' limit. Fine if that is the plan.' });
  }
  // Net worth from these statements: liquid is cash and taxable brokerage; total is everything less the debts.
  let liquid = 0, assets = 0, debts = 0;
  for (const d of newest) {
    const bal = d.reader === 'card' ? v(d, 'newBalance') : d.reader === 'loan' ? v(d, 'principal') : d.reader === 'plan' ? v(d, 'total') : d.reader === 'cd' ? v(d, 'balance') : v(d, 'ending');
    if (bal === null) continue;
    if (d.reader === 'card' || d.reader === 'loan') debts += bal; else { assets += bal; if (isCash(d) || d.type === 'brokerage') liquid += bal; }
  }
  out.netWorth = { liquid: r2(liquid), assets: r2(assets), debts: r2(debts), total: r2(assets - debts), accounts: newest.length };
  return out;
}
// The newest statement for each account (institution + last four, else institution + type + product).
export const accountKey = (d) => [val(d.institution) || '?', val(d.common.lastFour) || (d.type + ':' + (val(d.common.product) || '?'))].join('|');
// A statement outranks a transactions file for the same account (a CSV holds no balances or rates); among
// statements the newest closing date wins. merge.js sorts a group the same way.
export const docRank = (d) => (d.file.kind === 'pdf' ? 2 : d.fields && (v(d, 'ending') !== null || v(d, 'newBalance') !== null) ? 1 : 0);
export function newestPerAccount(docs) {
  const best = {};
  for (const d of docs) { if (!d.reader) continue; const k = accountKey(d); if (!best[k] || docRank(d) > docRank(best[k]) || (docRank(d) === docRank(best[k]) && (close(d) || '') > (close(best[k]) || ''))) best[k] = d; }
  return Object.values(best);
}
const money = (x) => '$' + Math.round(x).toLocaleString('en-US');
