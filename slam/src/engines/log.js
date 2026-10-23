// The log (S-085): every money movement for a month in one list, from quick
// entry ("manual"), a confirmed bill or paycheck ("scheduled"), or a bank CSV
// ("import"). This file decides which entries count, which lines were used
// lately, and how an import lines up with what was already logged.
// Matching rules: same account (or one side has none), same direction, amount
// within $1 or 2%, dates within 3 days, and similar merchants when both sides
// have one. A clear match (one candidate each way, and similar merchants or
// the same amount to the cent) merges; anything else waits for the coach.

import { r2 } from './money.js';

const DAY = 86400000;
const daysApart = (a, b) => Math.abs(Math.round((Date.parse(a) - Date.parse(b)) / DAY));

// An imported entry waiting on "same or different?" does not count yet, so the
// manual entry it may match is never counted twice.
export function isPending(t) {
  return Array.isArray(t.possible) && t.possible.length > 0;
}

// Deleted entries (S-096) never count, even if a caller passes the full file.
export function counted(txs) {
  return txs.filter((t) => !isPending(t) && !t.deleted);
}

export function sourceOf(t) {
  return t.source || 'import';
}

// "TRADER JOE S" and "Trader Joe's" are the same shop.
function words(m) {
  return String(m || '').toUpperCase().replace(/[^A-Z0-9 ]/g, '').split(/\s+/).filter(Boolean);
}
export function similarMerchant(a, b) {
  const x = words(a).join('');
  const y = words(b).join('');
  if (!x || !y) return false;
  if (x === y || x.startsWith(y) || y.startsWith(x)) return true;
  const fa = words(a)[0];
  const fb = words(b)[0];
  return fa.length >= 4 && fa === fb;
}

export function amountClose(a, b) {
  return Math.abs(a - b) <= Math.max(1, 0.02 * Math.max(Math.abs(a), Math.abs(b))) + 1e-9;
}

function isCandidate(imp, e) {
  if (sourceOf(e) === 'import' || e.adjust) return false;
  if (Math.sign(imp.amount) !== Math.sign(e.amount)) return false;
  if (imp.account && e.account && imp.account !== e.account) return false;
  if (!amountClose(imp.amount, e.amount)) return false;
  if (daysApart(imp.date, e.date) > 3) return false;
  if (imp.merchant && e.merchant && !similarMerchant(imp.merchant, e.merchant)) return false;
  return true;
}

const sig = (t) => [t.account || '', t.date, t.amount, t.description].join('|');

// incoming: transactions from importCSV. Returns one row per incoming entry:
// 'same' (already imported), 'matched' (merges into entryId), 'possible'
// (candidates to confirm), or 'new'.
export function matchImport(log, incoming) {
  const haveIds = new Set(log.map((t) => t.id));
  const haveSigs = {};
  for (const t of log) if (sourceOf(t) === 'import') haveSigs[sig(t)] = (haveSigs[sig(t)] || 0) + 1;
  const seen = {};
  const open = log.filter((t) => sourceOf(t) !== 'import');
  const rows = incoming.map((tx) => {
    const s = sig(tx);
    seen[s] = (seen[s] || 0) + 1;
    if (haveIds.has(tx.id) || seen[s] <= (haveSigs[s] || 0)) return { tx, status: 'same' };
    return { tx, status: null, candidates: open.filter((e) => isCandidate(tx, e)).map((e) => e.id) };
  });
  const claims = {};
  for (const r of rows) for (const id of r.candidates || []) claims[id] = (claims[id] || 0) + 1;
  const byId = Object.fromEntries(open.map((e) => [e.id, e]));
  for (const r of rows) {
    if (r.status) continue;
    if (!r.candidates.length) { r.status = 'new'; continue; }
    const only = r.candidates.length === 1 ? byId[r.candidates[0]] : null;
    const clear = only && claims[only.id] === 1 && ((r.tx.merchant && only.merchant && similarMerchant(r.tx.merchant, only.merchant)) || r2(r.tx.amount) === r2(only.amount));
    if (clear) { r.status = 'matched'; r.entryId = only.id; } else r.status = 'possible';
  }
  const count = (st) => rows.filter((r) => r.status === st).length;
  return { rows, matched: count('matched'), fresh: count('new'), possible: count('possible'), same: count('same') };
}

export function matchSummary(m) {
  return 'Matched ' + m.matched + ', new ' + m.fresh + ', possible matches ' + m.possible + ' to confirm' + (m.same ? ', already imported ' + m.same : '') + '.';
}

// Lines used lately in quick entry, newest first, then everything else.
export function recentLines(doc, n = 6) {
  const out = [];
  const manual = doc.transactions.filter((t) => sourceOf(t) !== 'import' && t.lineId).slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  for (const t of manual) if (!out.includes(t.lineId)) out.push(t.lineId);
  return out.slice(0, n);
}

// Quick entry's account: the one used last, else the first checking account.
export function lastAccount(doc) {
  const live = new Set((doc.accounts || []).filter((a) => a.state !== 'archived').map((a) => a.id));
  const manual = doc.transactions.filter((t) => sourceOf(t) === 'manual' && t.account && live.has(t.account));
  if (manual.length) return manual.reduce((a, t) => (t.date >= a.date ? t : a)).account;
  const chk = (doc.accounts || []).find((a) => a.state !== 'archived' && a.type === 'checking');
  return chk ? chk.id : null;
}

// One month of the log, newest first, with how many came from each source.
export function monthLog(doc, month) {
  const list = doc.transactions.filter((t) => t.date.startsWith(month)).slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const by = { manual: 0, scheduled: 0, import: 0 };
  for (const t of list) by[sourceOf(t)] += 1;
  return { month, entries: list, count: list.length, bySource: by, pending: list.filter(isPending).length, last: list.length ? list[0].date : null };
}
