// The feed (S-207, answer 21): the spine feeds the Budget; the Budget's log
// and bank statements supply real dates and actuals back to the spine's log.
// A CSV statement (the same formats the old Budget read) or an old Budget
// document becomes proposals: same (already in the log), matched (a planned
// line within 2% and 5 days), recurring (a merchant seen three times or
// more), new, or skip (a card payment or transfer is not spending). Nothing
// lands until applyImport; an import key keeps a re-import from adding a
// line twice. Merchants are cleaned the same way everywhere.

import { valueOf as v, daysBetween } from './spine.js';
import { logSpend } from './edits.js';
import { cleanMerchant } from './spending.js';

export const FORMATS = {
  'chase-card': { label: 'Chase credit card', headers: ['transaction date', 'post date', 'description', 'category', 'type', 'amount'] },
  'chase-checking': { label: 'Chase checking', headers: ['details', 'posting date', 'description', 'amount', 'type', 'balance'] },
  amex: { label: 'American Express', headers: ['date', 'description', 'amount'], extra: ['card member', 'account #', 'extended details', 'appears on your statement as'] },
  'capital-one': { label: 'Capital One', headers: ['transaction date', 'posted date', 'card no.', 'description', 'category', 'debit', 'credit'] },
  generic: { label: 'Generic (date, description, amount)', headers: ['date', 'description', 'amount'] }
};
const norm = (h) => String(h).trim().toLowerCase();
const CARD_FORMATS = ['chase-card', 'amex', 'capital-one'];
export const MATCH_DAYS = 5;
export const MATCH_SHARE = 0.02;
// A typed entry on a bill's own line can differ more from the plan (a bill varies) and still be that bill (S-209).
export const BILL_MATCH_SHARE = 0.25;
export const RECURRING_COUNT = 3;

// A small CSV reader: quoted fields, commas and line breaks inside quotes, doubled quotes, Windows line endings.
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  const s = String(text).replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i++; } else if (c === '"') quoted = false; else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(field); field = ''; if (row.some((x) => x.trim() !== '')) rows.push(row); row = []; }
    else field += c;
  }
  row.push(field);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

export function detectFormat(headerRow) {
  const hs = headerRow.map(norm);
  const has = (list) => list.every((x) => hs.includes(x));
  if (has(FORMATS['capital-one'].headers)) return 'capital-one';
  if (has(FORMATS['chase-card'].headers)) return 'chase-card';
  if (has(FORMATS['chase-checking'].headers)) return 'chase-checking';
  if (has(FORMATS.amex.headers) && FORMATS.amex.extra.some((x) => hs.includes(x))) return 'amex';
  if (hs.some((x) => x.includes('date')) && hs.some((x) => x.includes('desc') || x === 'payee' || x === 'name') && hs.some((x) => x.includes('amount'))) return 'generic';
  return null;
}

// MM/DD/YYYY, M/D/YY or YYYY-MM-DD to YYYY-MM-DD.
export function parseDate(s) {
  const t = String(s).trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return y + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0'); }
  return null;
}
export function parseMoney(s) {
  const t = String(s === undefined || s === null ? '' : s).trim();
  if (t === '') return null;
  const neg = /^\(.*\)$/.test(t) || t.startsWith('-');
  const n = Number(t.replace(/[()$,\s+-]/g, ''));
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

function readRow(format, cols, row, flip) {
  const get = (name) => row[cols.indexOf(name)];
  if (format === 'capital-one') { const debit = parseMoney(get('debit')), credit = parseMoney(get('credit')); return { date: parseDate(get('transaction date')), description: get('description'), outflow: (debit || 0) - (credit || 0), typeHint: null }; }
  if (format === 'chase-card') { const a = parseMoney(get('amount')); return { date: parseDate(get('transaction date')), description: get('description'), outflow: a === null ? null : -a, typeHint: norm(get('type') || '') }; }
  if (format === 'chase-checking') { const a = parseMoney(get('amount')); return { date: parseDate(get('posting date')), description: get('description'), outflow: a === null ? null : -a, typeHint: norm(get('type') || '') }; }
  if (format === 'amex') { const a = parseMoney(get('amount')); return { date: parseDate(get('date')), description: get('description'), outflow: a, typeHint: null }; }
  const dateCol = cols.find((c) => c.includes('date')), descCol = cols.find((c) => c.includes('desc') || c === 'payee' || c === 'name'), amtCol = cols.find((c) => c.includes('amount'));
  const a = parseMoney(row[cols.indexOf(amtCol)]);
  return { date: parseDate(row[cols.indexOf(dateCol)]), description: row[cols.indexOf(descCol)], outflow: a === null ? null : (flip ? a : -a), typeHint: null };
}

// Rows out of a statement: money out is positive; a row with no date, amount or words is skipped and named.
export function readCsv(text, { format = 'auto', flip = false } = {}) {
  const rows = parseCsv(text);
  if (!rows.length) throw new Error('The file is empty.');
  const fmt = format === 'auto' ? detectFormat(rows[0]) : format;
  if (!fmt || !FORMATS[fmt]) throw new Error('Could not tell what kind of file this is. Pick the format by hand.');
  const cols = rows[0].map(norm);
  const out = [], skipped = [];
  rows.slice(1).forEach((row, i) => {
    const r = readRow(fmt, cols, row, flip);
    if (!r.date || r.outflow === null || r.outflow === undefined || !r.description || !String(r.description).trim()) { skipped.push(i + 2); return; }
    out.push({ date: r.date, description: String(r.description).trim(), outflow: Math.round(r.outflow * 100) / 100, typeHint: r.typeHint });
  });
  return { format: fmt, label: FORMATS[fmt].label, isCard: CARD_FORMATS.includes(fmt), rows: out, skippedRows: skipped };
}

const rx = (p) => new RegExp(p, 'i');
// What a statement row is, by the kind rules (data/merchant-rules.json).
export function classifyKind(row, kindRules, isCard) {
  const d = row.description, hint = row.typeHint;
  if (hint === 'payment' || rx(kindRules['card-payment']).test(d)) return 'card-payment';
  if (rx(kindRules.transfer).test(d)) return 'transfer';
  if (row.outflow < 0) {
    if (rx(kindRules.income).test(d)) return 'income';
    if (rx(kindRules.reimbursement).test(d)) return 'reimbursement';
    if (hint === 'return' || rx(kindRules.refund).test(d) || isCard) return 'refund';
    return 'income';
  }
  if (hint === 'fee' || rx(kindRules.fee).test(d)) return 'fee';
  return 'spend';
}

// Words that carry no meaning when two names are compared.
const STOP = new Set(['and', 'the', 'of', 'or', 'a', 'an', 'to', 'for', 'line', 'bill', 'bills']);
const tokens = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w && !STOP.has(w));
// Names the old Budget used for a line, against what the spine calls it.
const ALIASES = { 'eating-out': ['dining', 'restaurants', 'eating out'], subscriptions: ['streaming', 'subscriptions'], transit: ['transit', 'bus', 'train', 'rideshare'], 'home-insurance': ['renters insurance', 'home insurance'], shopping: ['everything else', 'other', 'shopping'], delivery: ['delivery', 'takeout'] };

// The spine line a merchant, a line id or a line name points at: the learned memory first, then an id, then the words.
export function matchExpense(spine, { merchant = null, lineId = null, name = null, memory = {}, rules = [] } = {}) {
  const expenses = spine.expenses || [];
  if (merchant && memory[merchant] && expenses.some((e) => e.id === memory[merchant])) return memory[merchant];
  const candidates = [];
  if (lineId) candidates.push(lineId, ...(ALIASES[lineId] || []));
  if (name) candidates.push(name);
  if (merchant && rules.length) { const d = String(merchant).toUpperCase(); const hit = rules.find((r) => d.includes(String(r.match).toUpperCase())); if (hit) candidates.push(hit.lineId, ...(ALIASES[hit.lineId] || [])); }
  for (const c of candidates) {
    const byId = expenses.find((e) => e.id === c || e.id === String(c).replace(/-/g, '_'));
    if (byId) return byId.id;
    const want = tokens(c);
    if (!want.length) continue;
    const exact = expenses.find((e) => tokens(e.label).join(' ') === want.join(' '));
    if (exact) return exact.id;
    const scored = expenses.map((e) => { const have = tokens(e.label); const hit = want.filter((w) => have.includes(w)).length; return { e, score: hit / Math.max(want.length, have.length) }; }).filter((x) => x.score >= 0.5).sort((a, b) => b.score - a.score);
    if (scored.length) return scored[0].e.id;
  }
  return null;
}

function hash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); }
export const amountClose = (a, b, share = MATCH_SHARE) => Math.abs(a - b) <= Math.max(1, share * Math.max(Math.abs(a), Math.abs(b))) + 1e-9;
const dayGap = (iso, day) => { if (!day) return null; const d = +iso.slice(8, 10); return Math.min(Math.abs(d - day), 31 - Math.abs(d - day)); };

// A planned line that this charge looks like: the amount within 2% of a per-charge amount, the day within 5 of the pay day or the next charge.
function plannedMatch(spine, amount, date) {
  for (const e of spine.expenses || []) {
    const per = v(e.amount);
    if (per === null || !amountClose(amount, per)) continue;
    const day = e.payDay && e.payDay.kind !== 'notForMe' ? v(e.payDay) : null;
    const renews = e.renews && e.renews.kind !== 'notForMe' ? v(e.renews) : null;
    const gap = day ? dayGap(date, day) : renews ? Math.abs(daysBetween(renews, date)) % 28 : null;
    if (gap === null || gap <= MATCH_DAYS || (renews && Math.abs(daysBetween(renews, date)) <= MATCH_DAYS)) return e.id;
  }
  return null;
}

const LOG_KIND = { spend: 'spend', fee: 'spend', refund: 'refund', reimbursement: 'refund', income: 'income' };

// Turn rows (from a statement or a Budget log) into proposals against the spine's log.
function propose(spine, items, { source }) {
  const have = new Set((spine.log || []).map((e) => e.importKey).filter(Boolean));
  const merchantCounts = {};
  for (const e of spine.log || []) if (e.merchant) merchantCounts[e.merchant] = (merchantCounts[e.merchant] || 0) + 1;
  for (const it of items) if (it.merchant) merchantCounts[it.merchant] = (merchantCounts[it.merchant] || 0) + 1;
  // An entry typed in the logger or logged as happened on the calendar is the same money as the statement
  // row that shows it: within 2% and 5 days, the same line when both name one, the same merchant when both
  // name one. Each such entry absorbs one row at most, so nothing lands twice.
  const open = (spine.log || []).filter((e) => e.source !== 'import');
  const claimed = new Set();
  const twin = (it, kind, expense) => open.find((e) => !claimed.has(e.id) && (e.kind === 'income') === (kind === 'income') && amountClose(e.amount, it.amount) && Math.abs(daysBetween(e.date, it.date)) <= MATCH_DAYS && (!e.expenseId || !expense || e.expenseId === expense) && (!e.merchant || !it.merchant || tokens(e.merchant).some((w) => tokens(it.merchant).includes(w))));
  const proposals = items.map((it) => {
    const skip = !LOG_KIND[it.kind];
    const kind = LOG_KIND[it.kind] || it.kind;
    const expense = skip || kind === 'income' ? null : it.expenseId || plannedMatch(spine, it.amount, it.date);
    const exp = expense ? (spine.expenses || []).find((e) => e.id === expense) : null;
    const dup = skip || have.has(it.key) ? null : twin(it, kind, expense);
    if (dup) claimed.add(dup.id);
    let status = skip ? 'skip' : have.has(it.key) || dup ? 'same' : expense ? 'matched' : it.merchant && merchantCounts[it.merchant] >= RECURRING_COUNT ? 'recurring' : 'new';
    const why = status === 'skip' ? (it.kind === 'card-payment' ? 'a card payment, not spending' : it.kind === 'transfer' ? 'a transfer between accounts, not spending' : 'not spending') : status === 'same' ? (dup ? 'already in the log: ' + (dup.source === 'scheduled' ? 'logged as happened on the calendar' : 'typed') + ' on ' + dup.date : 'already in the log') : status === 'matched' ? (it.expenseId ? 'the line it was logged to' : 'the amount and the day fit this line') : status === 'recurring' ? 'this merchant shows up ' + merchantCounts[it.merchant] + ' times' : 'nothing like it in the plan';
    return { key: it.key, date: it.date, amount: it.amount, kind, merchant: it.merchant, description: it.description, expenseId: expense, tag: exp ? exp.fat || 'other' : it.tag || (kind === 'income' ? null : 'other'), paidWith: it.paidWith, status, why, include: status !== 'skip' && status !== 'same', source };
  });
  const counts = Object.fromEntries(['same', 'matched', 'recurring', 'new', 'skip'].map((k) => [k, proposals.filter((p) => p.status === k).length]));
  return { proposals, counts, words: 'Matched ' + counts.matched + ', recurring ' + counts.recurring + ', new ' + counts.new + (counts.same ? ', already in the log ' + counts.same : '') + (counts.skip ? ', not spending ' + counts.skip : '') + '.' };
}

// A bank or card statement as proposals. paidWith: 'cash' or a card id in the spine.
export function proposeCsv(spine, rules, text, { format = 'auto', flip = false, paidWith = 'cash', merchantRules = { kindRules: {}, rules: [] } } = {}) {
  const read = readCsv(text, { format, flip });
  const memory = (spine.feed && spine.feed.memory) || {};
  const seen = {};
  const items = read.rows.map((r) => {
    const kind = classifyKind(r, merchantRules.kindRules || {}, read.isCard);
    const merchant = cleanMerchant(r.description);
    const sig = [paidWith, r.date, r.outflow, r.description].join('|');
    seen[sig] = (seen[sig] || 0) + 1;
    return { key: 'csv:' + hash(sig + '|' + seen[sig]), date: r.date, amount: Math.abs(r.outflow), kind, merchant, description: r.description, paidWith, expenseId: kind === 'spend' || kind === 'fee' ? matchExpense(spine, { merchant, memory, rules: merchantRules.rules || [] }) : null, tag: null };
  });
  return { format: read.format, label: read.label, skippedRows: read.skippedRows, ...propose(spine, items, { source: 'import' }) };
}

// An old Budget document (its transactions) as proposals: the line it was logged to maps by id, alias or words; a card account maps to the spine's card by name.
export function proposeBudget(spine, rules, doc, { merchantRules = { kindRules: {}, rules: [] } } = {}) {
  const lines = {};
  for (const c of doc.categories || []) for (const l of c.lines || []) lines[l.id] = l.name;
  const accounts = Object.fromEntries((doc.accounts || []).map((a) => [a.id, a]));
  const memory = (spine.feed && spine.feed.memory) || {};
  const cardOf = (accountId) => { const a = accounts[accountId]; if (!a || !/card/i.test(a.type || '')) return 'cash'; const hit = (spine.debts || []).find((d) => d.type === 'credit_card' && (d.id === a.id || tokens(v(d.name)).join(' ') === tokens(a.name).join(' '))); return hit ? hit.id : 'cash'; };
  const items = (doc.transactions || []).map((tx) => {
    const merchant = cleanMerchant(tx.description || tx.merchant || '') || null;
    const expenseId = tx.lineId ? matchExpense(spine, { merchant, lineId: tx.lineId, name: lines[tx.lineId], memory, rules: merchantRules.rules || [] }) : (merchant ? matchExpense(spine, { merchant, memory, rules: merchantRules.rules || [] }) : null);
    return { key: 'budget:' + tx.id, date: tx.date, amount: Math.abs(tx.amount), kind: tx.kind === 'income' ? 'income' : tx.kind, merchant, description: tx.note || tx.description || '', paidWith: cardOf(tx.account), expenseId, tag: null };
  }).filter((it) => /^\d{4}-\d{2}-\d{2}$/.test(it.date || '') && Number.isFinite(it.amount));
  return { count: items.length, ...propose(spine, items, { source: 'import' }) };
}

// Land the proposals picked: each becomes a log entry with its import key (never twice); a merchant with a line is remembered.
export function applyImport(spine, proposals, { picks = null, learn = true } = {}) {
  let out = spine;
  const have = new Set((spine.log || []).map((e) => e.importKey).filter(Boolean));
  let added = 0, skipped = 0;
  const memory = { ...((spine.feed && spine.feed.memory) || {}) };
  for (const p of proposals) {
    const wanted = picks ? picks.includes(p.key) : p.include;
    if (!wanted || p.status === 'skip' || have.has(p.key)) { skipped++; continue; }
    out = logSpend(out, { amount: p.amount, date: p.date, kind: p.kind, tag: p.expenseId ? null : p.tag, expenseId: p.expenseId, merchant: p.merchant, note: p.description && p.description !== p.merchant ? p.description : null, paidWith: p.paidWith, source: 'import', importKey: p.key }).spine;
    have.add(p.key); added++;
    if (learn && p.merchant && p.expenseId) memory[p.merchant] = p.expenseId;
  }
  if (learn && Object.keys(memory).length) out = { ...out, feed: { ...(out.feed || {}), memory } };
  return { spine: out, added, skipped };
}

// The old Budget's households saved in this browser (keys slam:hh:<id>), as documents.
export function budgetDocsFromStorage(getItem, keys) {
  const out = [];
  for (const k of keys || []) {
    if (!String(k).startsWith('slam:hh:')) continue;
    try { const doc = JSON.parse(getItem(k)); if (doc && Array.isArray(doc.transactions)) out.push({ key: k, id: k.slice(8), name: (doc.profile && (doc.profile.name || doc.profile.household)) || k.slice(8), transactions: doc.transactions.length, doc }); } catch { /* not a document */ }
  }
  return out;
}
