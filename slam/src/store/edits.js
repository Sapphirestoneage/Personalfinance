// Small structural changes to a household draft (used inside store.update).
// No math here: just finding things and adding or moving them.

import { newLine, newCategory, newIncome, newDebt, newDeduction, newNextStage, newNextStageItem, EVERYTHING_CATEGORY_ID } from './schema.js';
import { newId } from './ids.js';

export function findCategory(doc, catId) {
  return doc.categories.find((c) => c.id === catId) || null;
}

export function findLine(doc, lineId) {
  for (const c of doc.categories) {
    const l = c.lines.find((x) => x.id === lineId);
    if (l) return { category: c, line: l };
  }
  return null;
}

export function addLine(doc, catId, name) {
  const cat = findCategory(doc, catId);
  const line = newLine({ name, kind: cat.kind, need: cat.need, savings: cat.savings, tag: cat.tag });
  cat.lines.push(line);
  return line;
}

// A new category goes last among spending: before Savings and the one total.
export function addCategory(doc, name) {
  const cat = newCategory({ name: name || 'New category' });
  const at = doc.categories.findIndex((c) => ['savings', EVERYTHING_CATEGORY_ID].includes(c.id));
  doc.categories.splice(at === -1 ? doc.categories.length : at, 0, cat);
  return cat;
}

// Tags: reuse one with the same name (any case) instead of making a twin.
export function addTag(doc, name) {
  const clean = String(name || '').trim();
  if (!clean) throw new Error('A tag needs a name');
  const same = doc.tags.find((t) => t.name.toLowerCase() === clean.toLowerCase());
  if (same) return same;
  const tag = { id: newId('tag'), name: clean };
  doc.tags.push(tag);
  return tag;
}

export function toggleLineTag(doc, lineId, tagId) {
  const { line } = findLine(doc, lineId);
  line.tags = line.tags.includes(tagId) ? line.tags.filter((t) => t !== tagId) : [...line.tags, tagId];
}

export function renameTag(doc, tagId, name) {
  const clean = String(name || '').trim();
  if (!clean) throw new Error('A tag needs a name');
  doc.tags.find((t) => t.id === tagId).name = clean;
}

export function removeTag(doc, tagId) {
  doc.tags = doc.tags.filter((t) => t.id !== tagId);
  for (const c of doc.categories) for (const l of c.lines) l.tags = l.tags.filter((t) => t !== tagId);
}

export function addIncome(doc, fields) {
  const inc = newIncome(fields);
  doc.income.push(inc);
  return inc;
}

export function addDebt(doc, fields) {
  const d = newDebt(fields);
  doc.debts.push(d);
  doc.noDebts = false;
  return d;
}

// One total instead of categories: the total lives on an "Everything else"
// category. Category estimates entered later are carved out of it by calc,
// so the client's original total is never overwritten.
export function useSingleTotal(doc) {
  doc.settings.singleTotal = true;
  if (!findCategory(doc, EVERYTHING_CATEGORY_ID)) {
    const cat = newCategory({ id: EVERYTHING_CATEGORY_ID, name: 'Everything else', kind: 'variable' });
    doc.categories.push(cat);
  }
  return findCategory(doc, EVERYTHING_CATEGORY_ID);
}

// Value fields are addressed by a path like ['categories', 'food', 'estimate'].
// Arrays are matched by id so paths survive reordering.
export function resolvePath(doc, path) {
  let node = doc;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    node = Array.isArray(node) ? node.find((x) => x.id === key) : node[key];
    if (node === undefined || node === null) throw new Error('Bad path ' + path.join('.'));
  }
  return { parent: node, key: path[path.length - 1] };
}

export function getAt(doc, path) {
  const { parent, key } = resolvePath(doc, path);
  return Array.isArray(parent) ? parent.find((x) => x.id === key) : parent[key];
}

export function setAt(doc, path, value) {
  const { parent, key } = resolvePath(doc, path);
  parent[key] = value;
}

// Line paths are written as ['line', lineId, field] for convenience.
export function linePath(lineId, field) {
  return ['line', lineId, field];
}

export function getField(doc, path) {
  if (path[0] === 'line') return findLine(doc, path[1]).line[path[2]];
  return getAt(doc, path);
}

export function setField(doc, path, value) {
  if (path[0] === 'line') { findLine(doc, path[1]).line[path[2]] = value; return; }
  setAt(doc, path, value);
}

// Blind guess: a fresh round of rough estimates asked without showing the old ones.
export function startBlindRound(doc, dateIso) {
  const round = { id: 'blind-' + dateIso.replace(/[^0-9]/g, '').slice(0, 14), date: dateIso, estimates: {} };
  doc.blindRounds.push(round);
  return round;
}

// Transactions: add new ones (skipping any already imported), re-map one
// (optionally remembering the merchant), and replace line actuals for a month
// after the client confirms.
export function addTransactions(doc, txs) {
  const have = new Set(doc.transactions.map((t) => t.id));
  const fresh = txs.filter((t) => !have.has(t.id));
  doc.transactions.push(...fresh);
  doc.transactions.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return fresh.length;
}

export function setTransactionLine(doc, txId, lineId, remember) {
  const t = doc.transactions.find((x) => x.id === txId);
  t.lineId = lineId || null;
  if (!remember) return;
  if (lineId) doc.merchantMemory[t.merchant] = lineId;
  else delete doc.merchantMemory[t.merchant];
  // apply the learned mapping to the merchant's other unmapped transactions too
  for (const o of doc.transactions) if (o.merchant === t.merchant && !o.lineId && lineId) o.lineId = lineId;
}

export function setTransactionKind(doc, txId, kind) {
  doc.transactions.find((x) => x.id === txId).kind = kind;
}

export function removeTransaction(doc, txId) {
  doc.transactions = doc.transactions.filter((x) => x.id !== txId);
}

// rows: [{ lineId, fromTransactions, count }] from calc's actualsProposal.
export function applyTransactionActuals(doc, rows, monthLabel) {
  for (const r of rows) {
    const found = findLine(doc, r.lineId);
    if (!found) continue;
    found.line.actual = {
      amount: r.fromTransactions, cadence: 'month', status: 'known', source: 'lookup',
      asOf: new Date().toISOString().slice(0, 10), note: 'From ' + r.count + ' transactions, ' + monthLabel
    };
  }
}

export function addDeduction(doc, incomeId, kind) {
  const inc = doc.income.find((i) => i.id === incomeId);
  const d = newDeduction({ kind });
  inc.deductions.push(d);
  return d;
}

export function removeDeduction(doc, incomeId, deductionId) {
  const inc = doc.income.find((i) => i.id === incomeId);
  inc.deductions = inc.deductions.filter((d) => d.id !== deductionId);
}

// Next stage: start one, add or remove one-off costs, cost changes, and measures.
export function startNextStage(doc, metrics) {
  doc.nextStage = newNextStage(metrics);
  return doc.nextStage;
}

export function addNextStageItem(doc, list, label) {
  const item = list === 'metrics'
    ? { id: newNextStageItem().id, label: label || 'New measure', now: null, next: null, better: 'higher' }
    : newNextStageItem(label);
  doc.nextStage[list].push(item);
  return item;
}

export function removeNextStageItem(doc, list, id) {
  doc.nextStage[list] = doc.nextStage[list].filter((x) => x.id !== id);
}
