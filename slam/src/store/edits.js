// Small structural changes to a household draft (used inside store.update).
// No math here: just finding things and adding or moving them.

import { newLine, newCategory, newIncome, newDebt, EVERYTHING_CATEGORY_ID } from './schema.js';

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
