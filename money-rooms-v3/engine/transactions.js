/* Transactions (Level 10, MR-055): a CSV export (Rocket Money, or any bank
   with a remembered column mapper), cleaned (card payments and transfers
   between her own accounts out, refunds and roommate reimbursements netted,
   work reimbursements flagged), categorized by merchant rules the coach can
   override, and read for what repeats, what is a fee, what is buy now pay
   later, what creeps up, and when money comes in against when bills go out.
   The outputs feed the spending lines as verified actuals and the Level 8
   variance. Pure; applyActuals is the one function that writes, through the
   record API. Amounts are cents; spending is positive, money in is
   negative. */
import { createRow, addRow, setField, removeRow } from './record.js';
import { freshFacts } from './fields.js';
import { isGuessRow } from './guesses.js';
import { AREAS } from './anchors.js';
const AREA_WORDS = { accommodation: 'your home', utilities: 'phone, internet and subscriptions', food: 'food', transportation: 'getting around', therapy: 'health and therapy', wants: 'fun and wants', irregular: 'the once-a-year things', mistakes: 'fees', other: 'other' };

/* ---- CSV ---- */
export function parseCsv(text) {
  const rows = []; let row = []; let cell = ''; let q = false;
  const src = String(text || '').replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
    if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && src[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  const clean = rows.filter(r => r.some(x => String(x).trim() !== ''));
  if (!clean.length) return { headers: [], rows: [] };
  const headers = clean[0].map(h => String(h).trim());
  return { headers, rows: clean.slice(1).map(r => { const o = {}; headers.forEach((h, k) => { o[h] = r[k] === undefined ? '' : String(r[k]).trim(); }); return o; }) };
}
const norm = s => String(s || '').toLowerCase().trim();
export function isRocketMoney(headers, rules) { const R = rules.rocketMoney; return headers.includes(R.date) && headers.includes(R.description) && headers.includes(R.amount); }
/* Guess which column is which; the coach fixes the rest and the mapper is remembered per institution. */
export function guessMapping(headers, rules) {
  if (isRocketMoney(headers, rules)) { const R = rules.rocketMoney; return { date: R.date, description: R.description, amount: R.amount, account: headers.includes(R.account) ? R.account : null, category: headers.includes(R.category) ? R.category : null, signs: 'rocket', source: 'rocket' }; }
  const pick = key => headers.find(h => rules.columnGuesses[key].includes(norm(h))) || headers.find(h => rules.columnGuesses[key].some(g => norm(h).indexOf(g) !== -1)) || null;
  const m = { date: pick('date'), description: pick('description'), amount: pick('amount'), debit: pick('debit'), credit: pick('credit'), account: pick('account'), category: pick('category'), source: 'bank' };
  m.signs = m.debit || m.credit ? 'columns' : 'bank';
  return m;
}
export function parseMoney(s) { const t = String(s || '').replace(/[$,\s]/g, ''); if (!t) return null; const neg = /^\(.*\)$/.test(t) || t.startsWith('-'); const n = parseFloat(t.replace(/[()\-+]/g, '')); if (!Number.isFinite(n)) return null; return Math.round(n * 100) * (neg ? -1 : 1); }
export function parseDate(s) {
  const t = String(s || '').trim(); let m;
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t))) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
  if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(t))) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return y + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0'); }
  return null;
}
/* Rows to transactions. signs: rocket (spending positive), bank (debits negative), columns (debit and credit columns). */
export function normalize(parsed, mapping, institution) {
  const out = [];
  parsed.rows.forEach((r, k) => {
    const date = parseDate(r[mapping.date]); if (!date) return;
    let cents = null;
    if (mapping.signs === 'columns') { const d = parseMoney(r[mapping.debit]); const c = parseMoney(r[mapping.credit]); cents = (d ? Math.abs(d) : 0) - (c ? Math.abs(c) : 0); if (d === null && c === null) return; }
    else { const a = parseMoney(r[mapping.amount]); if (a === null) return; cents = mapping.signs === 'rocket' ? a : -a; }
    out.push({ id: 't' + k, date, description: r[mapping.description] || '', amount: cents, account: mapping.account ? (r[mapping.account] || institution || '') : (institution || ''), rawCategory: mapping.category ? r[mapping.category] || '' : '' });
  });
  return out.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
}
export function merchantKey(description) { return norm(description).replace(/\b\d{2,}\b/g, '').replace(/\s+(x{2,}\d+|\*+\w+|#\w+)/g, '').replace(/[^a-z& ]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 3).join(' '); }
function daysBetween(a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / 86400000); }

/* ---- categorize ---- */
export function ruleFor(description, rules) { const d = norm(description); for (const r of rules.rules) { if (new RegExp(r.match, 'i').test(d)) return r; } return null; }
export function categorize(txs, rules, overrides) {
  const ov = overrides || {};
  return txs.map(t => { const key = merchantKey(t.description); const rule = ruleFor(t.description, rules); const cat = ov[key] || (rule ? rule.category : (t.amount < 0 ? 'income' : 'other')); return Object.assign({}, t, { merchant: key, category: cat, label: rule ? rule.label : (ov[key] ? 'Your rule' : 'Other'), overridden: !!ov[key] }); });
}

/* ---- clean ---- */
/* ctx: { sharedLines: [{ rowId, name, fullCents, shareCents, category }], roommates, accounts } */
export function clean(txs, ctx) {
  const c = ctx || {}; const removed = []; const netted = []; const flags = []; const keep = [];
  const byId = {}; txs.forEach(t => { byId[t.id] = t; });
  const used = new Set();
  /* transfers between her own accounts: same amount, opposite sign, within three days, different accounts; or a rule match */
  txs.forEach(t => {
    if (used.has(t.id)) return;
    if (t.category === 'cardPayment') { removed.push({ tx: t, reason: 'card payment' }); used.add(t.id); return; }
    if (t.category === 'ownTransfer') { removed.push({ tx: t, reason: 'transfer between your accounts' }); used.add(t.id); return; }
    const twin = txs.find(u => !used.has(u.id) && u.id !== t.id && u.amount === -t.amount && Math.abs(daysBetween(t.date, u.date)) <= 3 && u.account !== t.account && t.category !== 'transfer' && u.category !== 'transfer');
    if (twin && t.amount > 0 && t.category !== 'income') { removed.push({ tx: t, reason: 'transfer between your accounts', twin: twin.id }); removed.push({ tx: twin, reason: 'transfer between your accounts', twin: t.id }); used.add(t.id); used.add(twin.id); }
  });
  /* refunds: an inflow at a merchant she paid within 30 days nets against that spend */
  txs.forEach(t => {
    if (used.has(t.id) || !(t.amount < 0) || t.category === 'income' || t.category === 'transfer') return;
    const spend = txs.find(u => !used.has(u.id) && u.amount > 0 && u.merchant === t.merchant && Math.abs(daysBetween(u.date, t.date)) <= 30);
    if (spend || t.category === 'refund') { netted.push({ tx: t, against: spend ? spend.id : null, kind: 'refund', cents: -t.amount }); used.add(t.id); }
  });
  /* person to person: an inflow close to a roommate's share of a shared bill, within seven days of it, is a reimbursement the coach confirms; a note that says reimburse or expense is work money */
  txs.forEach(t => {
    if (used.has(t.id) || t.category !== 'transfer') return;
    if (t.amount < 0) {
      if (/reimb|expense|per diem|mileage/.test(norm(t.description))) { flags.push({ tx: t, kind: 'work reimbursement' }); used.add(t.id); return; }
      const line = (c.sharedLines || []).find(l => { const theirs = l.fullCents - l.shareCents; return theirs > 0 && Math.abs(-t.amount - theirs) <= Math.max(500, theirs * 0.1); });
      if (line) { const bill = txs.find(u => u.amount > 0 && u.category === line.category && Math.abs(daysBetween(u.date, t.date)) <= 7); netted.push({ tx: t, against: bill ? bill.id : null, kind: 'roommate', line: line.rowId, lineName: line.name, category: line.category, cents: -t.amount, confirmed: null }); used.add(t.id); return; }
      netted.push({ tx: t, against: null, kind: 'p2p in', cents: -t.amount, confirmed: null }); used.add(t.id); return;
    }
    flags.push({ tx: t, kind: 'p2p out' });
  });
  txs.forEach(t => { if (!used.has(t.id)) keep.push(t); });
  return { kept: keep, removed, netted, flags };
}

/* ---- detect ---- */
/* the next date for a cadence: weeks by days, months by the calendar */
export function nextDateOf(ymd, cad) {
  if (cad === 'weekly' || cad === 'every two weeks') return new Date(Date.parse(ymd) + (cad === 'weekly' ? 7 : 14) * 86400000).toISOString().slice(0, 10);
  const months = cad === 'monthly' ? 1 : cad === 'quarterly' ? 3 : 12; const y = +ymd.slice(0, 4), m = +ymd.slice(5, 7) - 1 + months, d = +ymd.slice(8, 10);
  const yy = y + Math.floor(m / 12), mm = m % 12; const last = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
  return String(yy) + '-' + String(mm + 1).padStart(2, '0') + '-' + String(Math.min(d, last)).padStart(2, '0');
}
function cadenceOf(dates) {
  if (dates.length < 2) return null;
  const gaps = []; for (let i = 1; i < dates.length; i++) gaps.push(daysBetween(dates[i - 1], dates[i]));
  const med = gaps.slice().sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
  if (med >= 5 && med <= 9) return 'weekly'; if (med >= 12 && med <= 16) return 'every two weeks'; if (med >= 26 && med <= 35) return 'monthly'; if (med >= 80 && med <= 100) return 'quarterly'; if (med >= 350 && med <= 380) return 'annual';
  return null;
}
export function detect(txs, rules, opts) {
  const o = opts || {}; const spend = txs.filter(t => t.amount > 0);
  const groups = {}; spend.forEach(t => { (groups[t.merchant] = groups[t.merchant] || []).push(t); });
  const recurring = []; const oneTime = []; const priceCreep = []; const duplicates = [];
  const all = txs.slice().sort((a, b) => a.date < b.date ? -1 : 1);
  const spanDays = o.spanDays || (all.length ? daysBetween(all[0].date, all[all.length - 1].date) + 1 : 0);
  Object.keys(groups).forEach(m => {
    const g = groups[m].slice().sort((a, b) => a.date < b.date ? -1 : 1); const dates = g.map(t => t.date);
    const amounts = g.map(t => t.amount); const avg = Math.round(amounts.reduce((s, x) => s + x, 0) / g.length);
    const steady = amounts.every(a => Math.abs(a - avg) <= Math.max(300, avg * 0.15));
    const cad = cadenceOf(dates);
    const isSub = g[0].label === 'Subscriptions' || g[0].label === 'Gym' || g[0].label === 'Phone and internet';
    if (g.length >= 2 && cad && steady) { const last = dates[dates.length - 1]; recurring.push({ merchant: m, description: g[0].description, category: g[0].category, label: g[0].label, cadence: cad, amount: avg, count: g.length, monthly: Math.round(avg * (cad === 'weekly' ? 52 / 12 : cad === 'every two weeks' ? 26 / 12 : cad === 'monthly' ? 1 : cad === 'quarterly' ? 1 / 3 : 1 / 12)), nextDate: nextDateOf(last, cad), subscription: isSub || (avg <= 5000 && cad === 'monthly' && g[0].category !== 'food'), ids: g.map(t => t.id) }); }
    else if (g.length === 1 && isSub && g[0].amount >= 3000 && g[0].amount <= 30000 && spanDays >= 45 && (o.annualHints || []).some(h => norm(g[0].description).indexOf(h) !== -1 || /annual|yearly|year/.test(norm(g[0].description)))) { recurring.push({ merchant: m, description: g[0].description, category: g[0].category, label: g[0].label, cadence: 'annual', amount: g[0].amount, count: 1, monthly: Math.round(g[0].amount / 12), nextDate: nextDateOf(dates[0], 'annual'), subscription: true, ids: g.map(t => t.id), inferred: true }); }
    else if (g.length === 1 && isSub && /annual|yearly|year/.test(norm(g[0].description))) { recurring.push({ merchant: m, description: g[0].description, category: g[0].category, label: g[0].label, cadence: 'annual', amount: g[0].amount, count: 1, monthly: Math.round(g[0].amount / 12), nextDate: nextDateOf(dates[0], 'annual'), subscription: true, ids: g.map(t => t.id) }); }
    else if (g.length <= 2) g.forEach(t => oneTime.push(t));
    /* price creep: same merchant, the latest amount above the earliest by more than ten percent, at least three charges */
    if (g.length >= 3 && amounts[amounts.length - 1] > amounts[0] * 1.1 && cad) priceCreep.push({ merchant: m, description: g[0].description, from: amounts[0], to: amounts[amounts.length - 1], count: g.length });
    /* duplicates: same merchant, same amount, same day */
    for (let i = 1; i < g.length; i++) if (g[i].date === g[i - 1].date && g[i].amount === g[i - 1].amount) duplicates.push({ a: g[i - 1].id, b: g[i].id, merchant: m, amount: g[i].amount, date: g[i].date });
  });
  const fees = spend.filter(t => t.category === 'mistakes' || rules.feeWords.some(w => norm(t.description).indexOf(w) !== -1)).map(t => ({ tx: t, kind: rules.feeWords.find(w => norm(t.description).indexOf(w) !== -1) || 'fee' }));
  const bnpl = spend.filter(t => t.category === 'bnpl' || rules.bnplMerchants.some(w => norm(t.description).indexOf(w) !== -1)).map(t => ({ tx: t, merchant: t.merchant }));
  const subscriptions = recurring.filter(r => r.subscription).map(r => Object.assign({}, r, { annual: r.cadence === 'annual' ? r.amount : Math.round(r.monthly * 12) }));
  return { recurring: recurring.sort((a, b) => b.monthly - a.monthly), subscriptions: subscriptions.sort((a, b) => b.annual - a.annual), oneTime: oneTime.filter(t => !fees.some(f => f.tx.id === t.id) && !bnpl.some(b => b.tx.id === t.id)), fees, bnpl, priceCreep, duplicates, spanDays };
}

/* ---- patterns ---- */
export function patterns(txs, opts) {
  const o = opts || {}; const spend = txs.filter(t => t.amount > 0 && t.category !== 'income');
  const total = spend.reduce((s, t) => s + t.amount, 0) || 1;
  const byM = {}; spend.forEach(t => { byM[t.merchant] = (byM[t.merchant] || 0) + t.amount; });
  const topMerchants = Object.keys(byM).map(m => ({ merchant: m, cents: byM[m], share: byM[m] / total })).sort((a, b) => b.cents - a.cents).slice(0, 5);
  const small = spend.filter(t => t.amount < 2500), big = spend.filter(t => t.amount >= 10000);
  const weeknightEvening = {}; spend.forEach(t => { const d = new Date(t.date + 'T12:00:00Z').getUTCDay(); if (d >= 1 && d <= 4 && (t.label === 'Delivery' || t.label === 'Restaurants and takeout')) weeknightEvening[t.category] = (weeknightEvening[t.category] || 0) + t.amount; });
  const byDow = [0, 0, 0, 0, 0, 0, 0]; spend.forEach(t => { byDow[new Date(t.date + 'T12:00:00Z').getUTCDay()] += t.amount; });
  /* the cash flow calendar: paydays from income rows, bill days from recurring, the low days between */
  const income = txs.filter(t => t.category === 'income' || t.amount < -50000 && t.category !== 'transfer');
  const payDays = Array.from(new Set(income.map(t => parseInt(t.date.slice(8, 10), 10)))).sort((a, b) => a - b);
  const bills = (o.recurring || []).filter(r => r.cadence === 'monthly' || r.cadence === 'annual').map(r => ({ day: parseInt(r.nextDate.slice(8, 10), 10), merchant: r.merchant, cents: r.cadence === 'monthly' ? r.amount : r.monthly }));
  const billDays = bills.map(b => b.day);
  const lowDays = [];
  if (payDays.length) { const sortedBills = bills.slice().sort((a, b) => a.day - b.day); let running = 0; const start = payDays[0]; for (let d = start; d < start + 31; d++) { const day = ((d - 1) % 31) + 1; if (payDays.includes(day) && d !== start) break; sortedBills.filter(b => b.day === day).forEach(b => { running += b.cents; }); } const beforeNext = sortedBills.filter(b => payDays.length > 1 ? (b.day >= payDays[0] && b.day < payDays[1]) : true); const heavy = beforeNext.reduce((s, b) => s + b.cents, 0); if (heavy) lowDays.push({ from: payDays[0], to: payDays[1] || payDays[0], billsCents: heavy, note: 'Most bills land between paydays ' + payDays[0] + ' and ' + (payDays[1] || payDays[0]) }); }
  return { topMerchants, smallFrequent: { count: small.length, cents: small.reduce((s, t) => s + t.amount, 0) }, bigRare: { count: big.length, cents: big.reduce((s, t) => s + t.amount, 0) }, weeknightEvening, byDow, calendar: { payDays, billDays, lowDays, bills }, total };
}

/* ---- actuals and the blind spot ---- */
export function actuals(txs, spanDays, netted) {
  const months = Math.max(1, (spanDays || 30) / 30.4375);
  const by = {};
  /* confirmed roommate reimbursements come off their line's area */
  (netted || []).filter(n => n.kind === 'roommate' && n.confirmed && n.line).forEach(n => { const cat = n.category || 'accommodation'; by[cat] = (by[cat] || 0) - n.cents; }); txs.filter(t => t.amount > 0 && t.category !== 'income' && t.category !== 'transfer' && t.category !== 'cardPayment' && t.category !== 'ownTransfer' && t.category !== 'refund').forEach(t => { const c = t.category === 'bnpl' ? 'wants' : t.category; by[c] = (by[c] || 0) + t.amount; });
  const monthly = {}; Object.keys(by).forEach(c => { if (by[c] > 0) monthly[c] = Math.round(by[c] / months); });
  return { monthly, months: Math.round(months * 10) / 10, total: Object.values(monthly).reduce((s, x) => s + x, 0) };
}
/* Her gut against the actuals: the ratio per area, the blind spot (share of actual spending her gut did not cover), the correction factor for her next guesses. */
export function compareToGut(actualMonthly, gut) {
  const perArea = {}; let covered = 0, total = 0;
  AREAS.concat(['mistakes', 'other']).forEach(c => {
    const actual = actualMonthly[c] || 0; const a = gut && gut['spending:' + c]; const est = a ? a.cents : null;
    if (actual > 0 || est !== null) perArea[c] = { estimated: est, actual, ratio: est !== null && est > 0 ? Math.round(actual / est * 100) / 100 : null, gap: est !== null ? actual - est : actual };
    total += actual; covered += est !== null ? Math.min(est, actual) : 0;
  });
  const blindSpotPct = total > 0 ? Math.round((total - covered) / total * 1000) / 1000 : null;
  const correction = {}; Object.keys(perArea).forEach(c => { if (perArea[c].ratio !== null) correction[c] = perArea[c].ratio; });
  return { perArea, blindSpotPct, correction, total, covered };
}
/* One found-money win: the largest of a cancellable subscription, the fees, or the Venmo leak. */
export function foundMoney(det, cleaned) {
  const cands = [];
  const sub = det.subscriptions.filter(s => s.label === 'Subscriptions' || s.label === 'Gym').sort((a, b) => b.annual - a.annual)[0];
  if (sub) cands.push({ kind: 'subscription', label: sub.description, cents: sub.annual, text: 'Cancel ' + sub.description + ' and keep ' + dollars(sub.annual) + ' a year' });
  /* a subscription counts for a year; fees and the Venmo leak count what the window shows (one fee is not a yearly habit until it repeats) */
  const feeTotal = det.fees.reduce((s, f) => s + f.tx.amount, 0); if (feeTotal) cands.push({ kind: 'fee', label: 'Fees', cents: feeTotal, text: 'Stop the fees: ' + dollars(feeTotal) + ' in ' + Math.round(det.spanDays / 7) + ' weeks' });
  const leak = (cleaned.flags || []).filter(f => f.kind === 'p2p out').reduce((s, f) => s + f.tx.amount, 0); if (leak) cands.push({ kind: 'venmo', label: 'Person to person', cents: leak, text: dollars(leak) + ' went out by Venmo or Zelle with no bill behind it; name what it was' });
  return cands.sort((a, b) => b.cents - a.cents)[0] || null;
}
const dollars = c => '$' + Math.round(c / 100).toLocaleString('en-US');

/* Write the actuals into the Ledger: one verified line per recurring merchant in an area plus one for the rest; her shared lines stay; guess rows and her other typed lines in that area go. */
export function applyActuals(record, data, det, act, meta) {
  const m = meta || {}; const fields = data.fields; const now = m.now; const touched = [];
  const cats = Object.keys(act.monthly).filter(c => AREAS.includes(c) || c === 'mistakes' || c === 'other');
  cats.forEach(cat => {
    const existing = record.planets.spending.rows.filter(r => r.type === 'line' && r.f.category && r.f.category.v === cat);
    const keep = existing.filter(r => !isGuessRow(r) && r.f.shared && r.f.shared.v === true);
    existing.filter(r => !keep.includes(r)).forEach(r => removeRow(record, r.id, { now, session: m.session }));
    let covered = keep.reduce((s, r) => s + (r.f.amount && typeof r.f.amount.v === 'number' ? Math.round(r.f.amount.v * (r.f.myShare && typeof r.f.myShare.v === 'number' ? r.f.myShare.v : 1)) : 0), 0);
    det.recurring.filter(r => r.category === cat).forEach(r => {
      if (keep.some(k => (k.nickname || '').toLowerCase().indexOf(r.merchant.split(' ')[0]) !== -1)) return;
      const row = createRow('spending', 'line', { nickname: r.description.slice(0, 40), f: freshFacts(fields, 'spending', 'line'), notesPrivate: 'From transactions: ' + r.count + ' charges, ' + r.cadence });
      addRow(record, row, { now, session: m.session });
      setField(record, row.id, 'category', cat, 'known', 'client', { now, session: m.session });
      setField(record, row.id, 'amount', r.cadence === 'annual' ? r.amount : r.monthly, 'verified', 'client', { now, session: m.session, cad: r.cadence === 'annual' ? 'year' : 'month', why: 'correction' });
      setField(record, row.id, 'needWant', ['wants', 'irregular'].includes(cat) ? 'want' : 'need', 'known', 'client', { now, session: m.session });
      covered += r.monthly; touched.push(row.id);
    });
    const rest = act.monthly[cat] - covered;
    if (rest > 0) {
      const row = createRow('spending', 'line', { nickname: 'Everything else: ' + (AREA_WORDS[cat] || cat), f: freshFacts(fields, 'spending', 'line'), notesPrivate: 'From transactions, the part that does not repeat' });
      addRow(record, row, { now, session: m.session });
      setField(record, row.id, 'category', cat, 'known', 'client', { now, session: m.session });
      setField(record, row.id, 'amount', rest, 'verified', 'client', { now, session: m.session, cad: 'month', why: 'correction' });
      setField(record, row.id, 'needWant', ['wants', 'irregular'].includes(cat) ? 'want' : 'need', 'known', 'client', { now, session: m.session });
      if (cat === 'mistakes') setField(record, row.id, 'mistake', 'mistake', 'known', 'client', { now, session: m.session });
      touched.push(row.id);
    }
  });
  return touched;
}

/* Level 12 (MR-063): the month as a calendar, stored on the program at import so the calendar chart
   can draw it without the CSV. The days come from patterns(); this adds what each payday is worth. */
export function calendarOf(txs, det, pat) {
  const cal = (pat || patterns(txs, { recurring: det.recurring })).calendar;
  const dayOf = t => parseInt(t.date.slice(8, 10), 10) || 1;
  const spanMonths = Math.max(1, (det.spanDays || 30) / 30.44);
  const income = txs.filter(t => t.category === 'income' || t.amount < -50000 && t.category !== 'transfer');
  const paydays = cal.payDays.map(day => { const list = income.filter(t => dayOf(t) === day); return { label: list[0] ? list[0].description : 'Pay', days: [day], cents: Math.round(list.reduce((s, t) => s - t.amount, 0) / spanMonths) }; }).filter(p => p.cents > 0);
  const bills = cal.bills.map(b => { const r = (det.recurring || []).find(x => x.merchant === b.merchant); return { label: r && r.description ? r.description : b.merchant, day: b.day, cents: b.cents, category: r ? r.category : 'other' }; }).filter(b => b.cents > 0).sort((a, b) => a.day - b.day);
  return { bills, paydays, spanDays: det.spanDays || null };
}
