// The log (S-085): every money movement for a month in one list, from quick
// entry ("manual"), a confirmed bill or paycheck ("scheduled"), or a bank CSV
// ("import"). This file decides which entries count, which lines were used
// lately, and how an import lines up with what was already logged.
// Matching rules: same account (or one side has none), same direction, amount
// within $1 or 2%, dates within 3 days, and similar merchants when both sides
// have one. A clear match (one candidate each way, and similar merchants or
// the same amount to the cent) merges; anything else waits for the coach.
// Depends on money.js (r2). Amounts are dollars, positive = money out and negative = money in
// (tx-import.js sets the sign); dates are 'YYYY-MM-DD'.

import { r2 } from './money.js';

const DAY = 86400000;
const daysApart = (a, b) => Math.abs(Math.round((Date.parse(a) - Date.parse(b)) / DAY));

/**
 * An imported entry waiting on "same or different?" does not count yet, so the
 * manual entry it may match is never counted twice.
 * @param {object} t a log entry.
 * @returns {boolean} true while t.possible lists candidates.
 */
export function isPending(t) {
  return Array.isArray(t.possible) && t.possible.length > 0;
}

/**
 * The entries that count: not pending a match and not deleted. Deleted entries (S-096) never count,
 * even if a caller passes the full file.
 * @param {object[]} txs log entries (doc.transactions).
 * @returns {object[]} the same entries, filtered.
 */
export function counted(txs) {
  return txs.filter((t) => !isPending(t) && !t.deleted);
}

/**
 * Where an entry came from; an entry from before sources existed is an import.
 * @param {object} t a log entry.
 * @returns {string} 'manual', 'scheduled' or 'import'.
 */
export function sourceOf(t) {
  return t.source || 'import';
}

// "TRADER JOE S" and "Trader Joe's" are the same shop.
function words(m) {
  return String(m || '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '')
    .split(/\s+/)
    .filter(Boolean);
}
/**
 * Same shop? Letters and digits only, case folded: equal, one a prefix of the other, or the same first
 * word of 4 or more characters.
 * @param {string} a a merchant name, as typed or imported.
 * @param {string} b the other.
 * @returns {boolean} false when either is blank.
 */
export function similarMerchant(a, b) {
  const x = words(a).join('');
  const y = words(b).join('');
  if (!x || !y) return false;
  if (x === y || x.startsWith(y) || y.startsWith(x)) return true;
  const fa = words(a)[0];
  const fb = words(b)[0];
  return fa.length >= 4 && fa === fb;
}

/**
 * Within $1 or 2% of the larger amount, whichever is more (the matching rule in the header).
 * @param {number} a dollars.
 * @param {number} b dollars.
 * @returns {boolean}
 */
export function amountClose(a, b) {
  // 1e-9 absorbs floating-point noise right at the boundary.
  return Math.abs(a - b) <= Math.max(1, 0.02 * Math.max(Math.abs(a), Math.abs(b))) + 1e-9;
}

// Can a logged entry be the same movement as an import? Imports never match imports (duplicates are
// caught by signature), and an adjustment is a balance correction, not a purchase. Then the header's rules.
function isCandidate(imp, e) {
  if (sourceOf(e) === 'import' || e.adjust) return false;
  if (Math.sign(imp.amount) !== Math.sign(e.amount)) return false;
  if (imp.account && e.account && imp.account !== e.account) return false;
  if (!amountClose(imp.amount, e.amount)) return false;
  if (daysApart(imp.date, e.date) > 3) return false;
  if (imp.merchant && e.merchant && !similarMerchant(imp.merchant, e.merchant)) return false;
  return true;
}

// An import's identity: account, date, amount and description. The same signature twice in one file is
// two real entries (two coffees), so copies are counted, not just seen.
const sig = (t) => [t.account || '', t.date, t.amount, t.description].join('|');

/**
 * Lines an import up with what is already logged.
 * @param {object[]} log the entries already in the file (doc.transactions).
 * @param {object[]} incoming transactions from importCSV (tx-import.js), signed like the log.
 * @returns {{rows: Array<{tx: object, status: string, candidates?: string[], entryId?: string}>, matched: number, fresh: number, possible: number, same: number}}
 *   one row per incoming entry: 'same' (already imported), 'matched' (merges into entryId), 'possible' (candidates
 *   to confirm), or 'new'; the counts are of each status.
 */
export function matchImport(log, incoming) {
  const haveIds = new Set(log.map((t) => t.id));
  const haveSigs = {};
  for (const t of log) if (sourceOf(t) === 'import') haveSigs[sig(t)] = (haveSigs[sig(t)] || 0) + 1;
  const seen = {};
  const open = log.filter((t) => sourceOf(t) !== 'import');
  const rows = incoming.map((tx) => {
    const s = sig(tx);
    seen[s] = (seen[s] || 0) + 1;
    // Already imported when the id is known, or the file has no more copies of this signature than the log does.
    if (haveIds.has(tx.id) || seen[s] <= (haveSigs[s] || 0)) return { tx, status: 'same' };
    return { tx, status: null, candidates: open.filter((e) => isCandidate(tx, e)).map((e) => e.id) };
  });
  // An entry claimed by two imports is never a clear match for either; the coach decides.
  const claims = {};
  for (const r of rows) for (const id of r.candidates || []) claims[id] = (claims[id] || 0) + 1;
  const byId = Object.fromEntries(open.map((e) => [e.id, e]));
  for (const r of rows) {
    if (r.status) continue;
    if (!r.candidates.length) {
      r.status = 'new';
      continue;
    }
    const only = r.candidates.length === 1 ? byId[r.candidates[0]] : null;
    const clear =
      only &&
      claims[only.id] === 1 &&
      ((r.tx.merchant && only.merchant && similarMerchant(r.tx.merchant, only.merchant)) ||
        r2(r.tx.amount) === r2(only.amount));
    if (clear) {
      r.status = 'matched';
      r.entryId = only.id;
    } else r.status = 'possible';
  }
  const count = (st) => rows.filter((r) => r.status === st).length;
  return { rows, matched: count('matched'), fresh: count('new'), possible: count('possible'), same: count('same') };
}

/**
 * One sentence of counts for the import screen.
 * @param {object} m what matchImport returns.
 * @returns {string}
 */
export function matchSummary(m) {
  return (
    'Matched ' +
    m.matched +
    ', new ' +
    m.fresh +
    ', possible matches ' +
    m.possible +
    ' to confirm' +
    (m.same ? ', already imported ' + m.same : '') +
    '.'
  );
}

/**
 * Lines used lately in quick entry, newest first (the screen lists the other lines after these).
 * @param {object} doc the household file.
 * @param {number} [n=6] how many.
 * @returns {string[]} line ids, each once, from manual and scheduled entries; imports are not the coach's picks.
 */
export function recentLines(doc, n = 6) {
  const out = [];
  const manual = doc.transactions
    .filter((t) => sourceOf(t) !== 'import' && t.lineId)
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  for (const t of manual) if (!out.includes(t.lineId)) out.push(t.lineId);
  return out.slice(0, n);
}

/**
 * Quick entry's account: the one used last by a manual entry, else the first live checking account.
 * @param {object} doc the household file.
 * @returns {?string} an account id; null when there is neither.
 */
export function lastAccount(doc) {
  const live = new Set((doc.accounts || []).filter((a) => a.state !== 'archived').map((a) => a.id));
  const manual = doc.transactions.filter((t) => sourceOf(t) === 'manual' && t.account && live.has(t.account));
  if (manual.length) return manual.reduce((a, t) => (t.date >= a.date ? t : a)).account;
  const chk = (doc.accounts || []).find((a) => a.state !== 'archived' && a.type === 'checking');
  return chk ? chk.id : null;
}

/**
 * One month of the log, newest first, with how many came from each source.
 * @param {object} doc the household file.
 * @param {string} month 'YYYY-MM'.
 * @returns {{month: string, entries: object[], count: number, bySource: {manual: number, scheduled: number, import: number}, pending: number, last: string|null}}
 *   every entry dated that month, pending ones included and counted; last is the newest date 'YYYY-MM-DD'.
 */
export function monthLog(doc, month) {
  const list = doc.transactions
    .filter((t) => t.date.startsWith(month))
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const by = { manual: 0, scheduled: 0, import: 0 };
  for (const t of list) by[sourceOf(t)] += 1;
  return {
    month,
    entries: list,
    count: list.length,
    bySource: by,
    pending: list.filter(isPending).length,
    last: list.length ? list[0].date : null
  };
}
