// Small structural changes to a household draft (used inside store.update).
// No math here: just finding things and adding or moving them. Depends on the
// record constructors and constants in schema.js, newId (ids.js), guessLineType
// and DEFAULT_LINE_TYPES (types.js), and makeValue (value.js).

import { newLine, newCategory, newIncome, newDebt, newDeduction, newNextStage, newNextStageItem, newEra, EVERYTHING_CATEGORY_ID, FEE_LINES } from './schema.js';
import { newId } from './ids.js';
import { guessLineType, DEFAULT_LINE_TYPES } from './types.js';
import { makeValue } from './value.js';

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
  const line = newLine({ name, type: guessLineType(name, cat.type), kind: cat.kind, need: cat.need, savings: cat.savings, tag: cat.tag });
  cat.lines.push(line);
  return line;
}

// Remove a sub-category (S-123). It is archived, not erased: past months, the log, and a linked debt
// still find it, and it leaves every list and total from now on. Undo brings it back.
export function removeLine(doc, lineId) {
  const hit = findLine(doc, lineId);
  if (!hit) throw new Error('No line ' + lineId);
  hit.line.state = 'archived';
  // A debt this line paid goes back to its own minimum (see setDebtLine).
  for (const d of doc.debts || []) if (d.lineId === lineId) d.lineId = null;
}

// Who pays a split bill (S-138): 'part' (you pay your part) or 'whole' (you pay it all; they pay you back).
export function setSplitPays(doc, lineId, pays) {
  if (!['part', 'whole'].includes(pays)) throw new Error('Pay your part or the whole bill');
  findLine(doc, lineId).line.splitPays = pays;
}

// A fee line made on first use (S-123), in Bills and subscriptions (else the first spending category).
export function feeLine(doc, id) {
  const cat = findCategory(doc, 'bills') || doc.categories.find((c) => !c.savings && c.id !== 'debt' && c.id !== EVERYTHING_CATEGORY_ID);
  const line = newLine({ id, name: FEE_LINES[id], type: DEFAULT_LINE_TYPES[id], kind: 'variable', need: false, tag: 'planned' });
  cat.lines.push(line);
  return line;
}

// Several lines at once (S-122), from parseQuickLines (src/engines/quick-lines.js): each a name and an amount a month (or blank),
// "roughly" in Your estimates, and marked split with someone when the client said so.
export function addLines(doc, catId, items, status = 'roughly') {
  return items.map((it) => {
    const line = addLine(doc, catId, it.name);
    // A blank amount leaves the estimate blank (not entered), never 0.
    if (it.amount !== null && it.amount !== undefined) line.estimate = makeValue(it.amount, { status });
    if (it.shared) line.shared = true;
    return line;
  });
}

// A new category goes last among spending: before Savings and the one total.
export function addCategory(doc, name, type) {
  const cat = newCategory({ name: name || 'New category', type: type || 'other' });
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

// Break a one-number Rough answer into sub-categories. The client's number stays
// exactly as they said it (lesson 17); while split, the lines carry the estimate.
export function breakDown(doc, catId) {
  findCategory(doc, catId).split = true;
}

// Back to one number: the client's own first number again. Only when there never
// was one does the lines' total fill the blank (marked roughly).
export function useOneNumber(doc, catId, monthly) {
  const cat = findCategory(doc, catId);
  cat.split = false;
  if (cat.estimate.amount !== null || cat.estimate.status !== null) return;
  if (monthly === null) return;
  // monthly is dollars a month from the engine. Rounded to the cent and marked roughly: a total of rough numbers is rough.
  cat.estimate = { amount: Math.round(monthly * 100) / 100, cadence: 'month', status: 'roughly', source: 'client', asOf: null, note: 'Total of the sub-categories' };
}

// Eras: add from a ready-made template, move earlier or later, remove.
export function addEra(doc, template) {
  const t = template || {};
  const era = newEra({ template: t.id, name: t.name, months: t.months });
  doc.eras.list.push(era);
  return era;
}

export function moveEra(doc, eraId, step) {
  const list = doc.eras.list;
  const i = list.findIndex((e) => e.id === eraId);
  const j = i + step;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
}

export function removeEra(doc, eraId) {
  doc.eras.list = doc.eras.list.filter((e) => e.id !== eraId);
}

// Renaming keeps the type; a line still typed "Other" gets one guessed from its new name.
export function renameLine(doc, lineId, name) {
  const { category, line } = findLine(doc, lineId);
  line.name = name;
  if (line.type === 'other') line.type = guessLineType(name, category.type);
}

export function setLineType(doc, lineId, type) {
  findLine(doc, lineId).line.type = type;
}

export function addIncome(doc, fields) {
  const inc = newIncome(fields);
  doc.income.push(inc);
  return inc;
}

export function addDebt(doc, fields) {
  const d = newDebt(fields);
  doc.debts.push(d);
  // "No debts" is an answer of its own (the debt total reads 0, not blank); a debt withdraws it.
  doc.noDebts = false;
  return d;
}

// S-116: the budget line that pays a debt (null to unlink). One line pays one debt; the debt's own
// minimum is kept but not used while linked (the line's estimate is the minimum).
export function setDebtLine(doc, debtId, lineId) {
  const debt = doc.debts.find((x) => x.id === debtId);
  if (!debt) throw new Error('No debt ' + debtId);
  if (lineId && !findLine(doc, lineId)) throw new Error('No line ' + lineId);
  if (lineId && doc.debts.some((x) => x.id !== debtId && x.lineId === lineId)) throw new Error('That line already pays another debt');
  debt.lineId = lineId || null;
}

// S-118: a source's income for a month with no log entries: an amount, 'none' (none this month), or
// null (back to empty). Refused when the log already has its entries (the log owns the money).
export function setIncomeActual(doc, month, incomeId, value) {
  if (!(doc.income || []).some((i) => i.id === incomeId)) throw new Error('No income ' + incomeId);
  const n = (doc.transactions || []).filter((t) => t.kind === 'income' && t.incomeId === incomeId && t.date.startsWith(month) && !t.deleted).length;
  if (n && value !== null) throw new Error('This comes from ' + n + (n === 1 ? ' entry' : ' entries') + '. Add one, or edit an entry.');
  doc.incomeActuals = doc.incomeActuals || {};
  const m = doc.incomeActuals[month] = doc.incomeActuals[month] || {};
  if (value === null) delete m[incomeId];
  // "None this month" is a typed 0 with status not-for-me: an answer, unlike a blank.
  else if (value === 'none') m[incomeId] = { amount: 0, cadence: 'month', status: 'not-for-me', source: 'client', asOf: null, note: 'None this month' };
  else m[incomeId] = { ...value, cadence: 'month' };
  if (!Object.keys(m).length) delete doc.incomeActuals[month];
}

// S-116: a card's promo APR ends on a day (YYYY-MM-DD), or null.
export function setPromoEnds(doc, debtId, date) {
  const debt = doc.debts.find((x) => x.id === debtId);
  if (date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('A date is YYYY-MM-DD');
  debt.promoEnds = date;
}

// One total instead of categories: the total lives on an "Everything else"
// category. Category estimates entered later are carved out of it by the engines,
// so the client's original total is never overwritten.
export function useSingleTotal(doc) {
  doc.settings.singleTotal = true;
  if (!findCategory(doc, EVERYTHING_CATEGORY_ID)) {
    const cat = newCategory({ id: EVERYTHING_CATEGORY_ID, name: 'Everything else', type: 'other', kind: 'variable' });
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
export function getField(doc, path) {
  if (path[0] === 'line') return findLine(doc, path[1]).line[path[2]];
  return getAt(doc, path);
}

export function setField(doc, path, value) {
  if (path[0] === 'line') {
    if (path[2] === 'actual') refuseTypingOverLog(doc, path[1]);
    findLine(doc, path[1]).line[path[2]] = value;
    return;
  }
  setAt(doc, path, value);
}

// The log owns the money (S-087): a line with entries this month is not typed over.
// Spending, fees, refunds, and reimbursements count; transfers, card payments, and income are not spending.
// An import still waiting on a possible match (t.possible) is not counted yet.
const LOGGED_KINDS = new Set(['spend', 'fee', 'refund', 'reimbursement']);
export function logEntriesFor(doc, lineId, month) {
  return (doc.transactions || []).filter((t) => t.lineId === lineId && t.date.startsWith(month) && LOGGED_KINDS.has(t.kind) && !(t.possible && t.possible.length));
}
function refuseTypingOverLog(doc, lineId) {
  const n = logEntriesFor(doc, lineId, doc.currentMonth).length;
  if (n) throw new Error('This comes from ' + n + (n === 1 ? ' entry' : ' entries') + '. Add one, or edit an entry.');
}

// Blind guess: a fresh round of rough estimates asked without showing the old ones.
export function startBlindRound(doc, dateIso) {
  const round = { id: 'blind-' + dateIso.replace(/[^0-9]/g, '').slice(0, 14), date: dateIso, estimates: {} };
  doc.blindRounds.push(round);
  return round;
}

// Transactions: add new ones (skipping any already imported) and re-map one
// (optionally remembering the merchant). Actuals come from the log in the engines (S-087).
export function addTransactions(doc, txs) {
  const have = new Set(doc.transactions.map((t) => t.id));
  const fresh = txs.filter((t) => !have.has(t.id)).map((t) => ({ source: 'import', note: '', ...t }));
  for (const t of fresh) if (t.lineId && FEE_LINES[t.lineId] && !findLine(doc, t.lineId)) feeLine(doc, t.lineId);
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
  // A measure is { now, next, better }: today's number, the next stage's, and whether 'higher' or 'lower' is the good way.
  const item = list === 'metrics'
    ? { id: newNextStageItem().id, label: label || 'New measure', now: null, next: null, better: 'higher' }
    : newNextStageItem(label);
  doc.nextStage[list].push(item);
  return item;
}

export function removeNextStageItem(doc, list, id) {
  doc.nextStage[list] = doc.nextStage[list].filter((x) => x.id !== id);
}
