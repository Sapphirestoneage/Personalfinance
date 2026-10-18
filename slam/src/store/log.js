// The log (S-085): add a quick entry, edit or remove one, and bring in a bank
// CSV using calc's match result. No math here; matching is decided in
// calc/log.js and only applied here.

import { newId } from './ids.js';
import { merchantKey } from '../calc/tx-import.js';

export const ENTRY_KINDS = ['spend', 'transfer', 'card-payment', 'refund', 'reimbursement', 'income', 'fee'];
export const ENTRY_SOURCES = ['manual', 'scheduled', 'import'];

// fields: { date, amount (positive = money out), kind, lineId, incomeId, merchant, note, account }
export function addEntry(doc, fields, source = 'manual') {
  if (typeof fields.amount !== 'number' || !Number.isFinite(fields.amount)) throw new Error('An entry needs an amount');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.date || '')) throw new Error('An entry needs a date');
  const merchant = fields.merchant ? merchantKey(fields.merchant) : '';
  const lineId = fields.lineId || (merchant && doc.merchantMemory[merchant]) || null;
  const t = {
    id: newId('tx'), date: fields.date, amount: fields.amount, description: (fields.merchant || '').trim(),
    account: fields.account || null, kind: fields.kind || 'spend', merchant, lineId, bnpl: false,
    source, note: fields.note || '', incomeId: fields.incomeId || null
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
  for (const k of ['date', 'amount', 'kind', 'lineId', 'incomeId', 'note', 'account']) if (k in change) t[k] = change[k];
  // Owed back by someone else, a one-off, and which purchase a reimbursement settles (S-088).
  for (const k of ['owed', 'oneOff', 'settles']) if (k in change) { if (change[k] === null || change[k] === false || change[k] === 0) delete t[k]; else t[k] = change[k]; }
  // The months a payment covers, for Paid ahead (S-119): 2 or more, or null for the line's own period.
  if ('coverMonths' in change) {
    if (change.coverMonths === null) delete t.coverMonths;
    else if (Number.isInteger(change.coverMonths) && change.coverMonths >= 2 && change.coverMonths <= 60) t.coverMonths = change.coverMonths;
    else throw new Error('Covers 2 to 60 months');
  }
  if ('merchant' in change) { t.description = change.merchant; t.merchant = change.merchant ? merchantKey(change.merchant) : ''; }
  sortLog(doc);
}

// rows from calc's matchImport. Matched pairs become one entry: the bank's
// date, amount, and merchant; the logged entry's line and note.
export function mergeImport(doc, match) {
  const out = { added: 0, merged: 0, waiting: 0 };
  for (const r of match.rows) {
    if (r.status === 'same') continue;
    const tx = { ...r.tx, source: 'import', note: r.tx.note || '' };
    if (r.status === 'matched') { mergeInto(doc, tx, r.entryId); out.merged += 1; continue; }
    if (r.status === 'possible') { tx.possible = r.candidates.slice(); out.waiting += 1; }
    doc.transactions.push(tx);
    out.added += 1;
  }
  sortLog(doc);
  return out;
}

function mergeInto(doc, imported, entryId) {
  const e = doc.transactions.find((x) => x.id === entryId);
  // The logged entry's line, note, and kind win (the coach said what it was); the bank's date, amount, and merchant win.
  const merged = { ...imported, kind: e.kind || imported.kind, lineId: e.lineId || imported.lineId, note: e.note || imported.note || '',
    incomeId: e.incomeId || imported.incomeId || null,
    mergedFrom: { id: e.id, source: e.source, date: e.date, amount: e.amount, merchant: e.description || '' } };
  if (e.scheduleKey) merged.scheduleKey = e.scheduleKey;
  delete merged.possible;
  if (e.lineId && imported.merchant && !doc.merchantMemory[imported.merchant]) doc.merchantMemory[imported.merchant] = e.lineId;
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
