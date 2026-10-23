// The log (S-085): add a quick entry, edit one, and bring in a bank CSV using
// the log engine's match result. No math here; matching is decided by matchImport
// in src/engines/log.js and only applied here. Depends on newId (ids.js),
// merchantKey (src/engines/tx-import.js), FEE_LINES (schema.js), and findLine
// and feeLine (edits.js).

import { newId } from './ids.js';
import { merchantKey } from '../engines/tx-import.js';
import { FEE_LINES } from './schema.js';
import { findLine, feeLine } from './edits.js';

// spend and fee count against a line; refund and reimbursement give money back to one; transfer and
// card-payment move money between accounts and are not spending; income is a paycheck.
export const ENTRY_KINDS = ['spend', 'transfer', 'card-payment', 'refund', 'reimbursement', 'income', 'fee'];
// manual: typed by the coach. scheduled: "It happened" on a calendar item. import: a bank CSV.
export const ENTRY_SOURCES = ['manual', 'scheduled', 'import'];

// fields: { date, amount (positive = money out), kind, lineId, incomeId, merchant, note, account }
export function addEntry(doc, fields, source = 'manual') {
  // An entry always has an amount; a typed 0 is one, a missing number is not.
  if (typeof fields.amount !== 'number' || !Number.isFinite(fields.amount)) throw new Error('An entry needs an amount');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.date || '')) throw new Error('An entry needs a date');
  // The merchant key boils the description down to a few words, so one shop's charges share a remembered line.
  const merchant = fields.merchant ? merchantKey(fields.merchant) : '';
  const lineId = fields.lineId || (merchant && doc.merchantMemory[merchant]) || null;
  const t = {
    id: newId('tx'),
    date: fields.date,
    amount: fields.amount,
    description: (fields.merchant || '').trim(),
    account: fields.account || null,
    kind: fields.kind || 'spend',
    merchant,
    lineId,
    bnpl: false,
    source,
    note: fields.note || '',
    incomeId: fields.incomeId || null
  };
  if (fields.scheduleKey) t.scheduleKey = fields.scheduleKey;
  // Recurring merchants remember their line.
  if (merchant && fields.lineId) doc.merchantMemory[merchant] = fields.lineId;
  doc.transactions.push(t);
  sortLog(doc);
  return t;
}

export function sortLog(doc) {
  doc.transactions.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function editEntry(doc, id, change) {
  const t = doc.transactions.find((x) => x.id === id);
  if (!t) throw new Error('No entry ' + id);
  for (const k of ['date', 'amount', 'kind', 'lineId', 'incomeId', 'note', 'account'])
    if (k in change) t[k] = change[k];
  // Owed back by someone else, a one-off, and which purchase a reimbursement settles (S-088).
  // Off is absent, not false, so an entry that never had the flag reads the same as one where it was cleared.
  for (const k of ['owed', 'oneOff', 'settles'])
    if (k in change) {
      if (change[k] === null || change[k] === false || change[k] === 0) delete t[k];
      else t[k] = change[k];
    }
  // The months a payment covers, for Paid ahead (S-119): 2 or more, or null for the line's own period.
  if ('coverMonths' in change) {
    if (change.coverMonths === null) delete t.coverMonths;
    else if (Number.isInteger(change.coverMonths) && change.coverMonths >= 2 && change.coverMonths <= 60)
      t.coverMonths = change.coverMonths;
    else throw new Error('Covers 2 to 60 months');
  }
  if ('merchant' in change) {
    t.description = change.merchant;
    t.merchant = change.merchant ? merchantKey(change.merchant) : '';
  }
  sortLog(doc);
}

// rows from matchImport (src/engines/log.js). Matched pairs become one entry: the bank's
// date, amount, and merchant; the logged entry's line and note.
export function mergeImport(doc, match) {
  const out = { added: 0, merged: 0, waiting: 0 };
  for (const r of match.rows) {
    if (r.status === 'same') continue;
    const tx = { ...r.tx, source: 'import', note: r.tx.note || '' };
    if (r.status === 'matched') {
      mergeInto(doc, tx, r.entryId);
      out.merged += 1;
      continue;
    }
    // A possible match is saved with its candidate ids and waits for the coach (confirmMatch or rejectMatch);
    // until then it is not counted (isPending in the log engine).
    if (r.status === 'possible') {
      tx.possible = r.candidates.slice();
      out.waiting += 1;
    }
    // A fee line is made the first time an entry is mapped to it (S-123).
    if (tx.lineId && FEE_LINES[tx.lineId] && !findLine(doc, tx.lineId)) feeLine(doc, tx.lineId);
    doc.transactions.push(tx);
    out.added += 1;
  }
  sortLog(doc);
  return out;
}

function mergeInto(doc, imported, entryId) {
  const e = doc.transactions.find((x) => x.id === entryId);
  // The logged entry's line, note, and kind win (the coach said what it was); the bank's date, amount, and merchant win.
  const merged = {
    ...imported,
    kind: e.kind || imported.kind,
    lineId: e.lineId || imported.lineId,
    note: e.note || imported.note || '',
    incomeId: e.incomeId || imported.incomeId || null,
    mergedFrom: { id: e.id, source: e.source, date: e.date, amount: e.amount, merchant: e.description || '' }
  };
  if (e.scheduleKey) merged.scheduleKey = e.scheduleKey;
  delete merged.possible;
  // A merge teaches the merchant's line only when nothing was remembered yet; a mapping the coach made stays.
  if (e.lineId && imported.merchant && !doc.merchantMemory[imported.merchant])
    doc.merchantMemory[imported.merchant] = e.lineId;
  // Both originals leave the log; mergedFrom keeps what the logged entry said, so nothing is lost.
  doc.transactions = doc.transactions.filter((x) => x.id !== entryId && x.id !== imported.id);
  // Other imports that could have been this entry now stand on their own (or wait on the rest).
  for (const t of doc.transactions) {
    if (!t.possible) continue;
    t.possible = t.possible.filter((id) => id !== entryId);
    if (!t.possible.length) delete t.possible;
  }
  doc.transactions.push(merged);
  return merged;
}

// The coach says an imported entry is the same as a logged one: merge them.
export function confirmMatch(doc, importId, entryId) {
  const imp = doc.transactions.find((x) => x.id === importId);
  if (!imp || !(imp.possible || []).includes(entryId)) throw new Error('Not a possible match');
  mergeInto(doc, imp, entryId);
  sortLog(doc);
}

// Not the same: both count on their own.
export function rejectMatch(doc, importId) {
  const imp = doc.transactions.find((x) => x.id === importId);
  delete imp.possible;
}

// A likely duplicate the coach checked: both charges are real.
export function markNotDuplicate(doc, ids) {
  for (const t of doc.transactions) if (ids.includes(t.id)) t.notDuplicate = true;
}
