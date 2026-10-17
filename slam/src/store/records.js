// Records (S-096): every thing a person creates or edits carries a stable id,
// createdAt and updatedAt (UTC ISO timestamps), createdBy and updatedBy
// ("coach" or "client"), and a version that goes up by one on each edit.
// Nothing is hard-deleted: removing a record leaves it in the file with
// deleted: true, deletedAt, and deletedBy. Calc and screens only ever see the
// live view, with deleted records left out.
//
// Edits keep working on plain documents: the store compares the document
// before and after an edit (stamp) and writes the bookkeeping itself.

import { newId } from './ids.js';

export const META = ['id', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy', 'version', 'deleted', 'deletedAt', 'deletedBy'];

// Where records live. kind 'array': a list of records with ids; 'nested': a list inside each record
// of a parent collection; 'map': records keyed by a path (they get a random id of their own).
export const COLLECTIONS = [
  { name: 'category', kind: 'array', get: (d) => d.categories, set: (d, v) => { d.categories = v; }, children: ['lines'] },
  { name: 'line', kind: 'nested', parent: 'category', field: 'lines' },
  { name: 'income', kind: 'array', get: (d) => d.income, set: (d, v) => { d.income = v; }, children: ['deductions'] },
  { name: 'deduction', kind: 'nested', parent: 'income', field: 'deductions' },
  { name: 'debt', kind: 'array', get: (d) => d.debts, set: (d, v) => { d.debts = v; } },
  { name: 'account', kind: 'array', get: (d) => d.accounts, set: (d, v) => { d.accounts = v; } },
  { name: 'entry', kind: 'array', get: (d) => d.transactions, set: (d, v) => { d.transactions = v; } },
  { name: 'tag', kind: 'array', get: (d) => d.tags, set: (d, v) => { d.tags = v; } },
  { name: 'era', kind: 'array', get: (d) => d.eras && d.eras.list, set: (d, v) => { d.eras.list = v; } },
  { name: 'estimate-change', kind: 'array', get: (d) => d.estimateLog, set: (d, v) => { d.estimateLog = v; } },
  { name: 'balance-check', kind: 'array', get: (d) => d.cashflow && d.cashflow.checks, set: (d, v) => { d.cashflow.checks = v; } },
  { name: 'next-cost', kind: 'array', get: (d) => d.nextStage && d.nextStage.oneOffCosts, set: (d, v) => { d.nextStage.oneOffCosts = v; } },
  { name: 'next-change', kind: 'array', get: (d) => d.nextStage && d.nextStage.costChanges, set: (d, v) => { d.nextStage.costChanges = v; } },
  { name: 'next-measure', kind: 'array', get: (d) => d.nextStage && d.nextStage.metrics, set: (d, v) => { d.nextStage.metrics = v; } },
  { name: 'balance', kind: 'map', get: (d) => d.balances, depth: 2 },
  { name: 'plan-line', kind: 'map', get: (d) => d.plans, depth: 2, inner: 'lines' }
];

const clone = (x) => JSON.parse(JSON.stringify(x));

// The content of a record without its bookkeeping (and without child records, which are records of their own).
export function contentOf(rec, children = []) {
  const out = {};
  for (const [k, v] of Object.entries(rec)) if (!META.includes(k) && !children.includes(k)) out[k] = v;
  return JSON.stringify(out);
}

// Every record in a document, by a stable key: { key: { rec, coll, where } }.
export function flatten(doc) {
  const out = {};
  for (const c of COLLECTIONS) {
    if (c.kind === 'array') {
      for (const r of c.get(doc) || []) out[c.name + ':' + r.id] = { rec: r, coll: c };
      if (c.children) {
        for (const parent of c.get(doc) || []) for (const field of c.children) {
          const child = COLLECTIONS.find((x) => x.parent === c.name && x.field === field);
          for (const r of parent[field] || []) out[child.name + ':' + r.id] = { rec: r, coll: child, parentId: parent.id };
        }
      }
    }
    if (c.kind === 'map') {
      for (const [a, inner] of Object.entries(c.get(doc) || {})) {
        const level = c.inner ? (inner || {})[c.inner] || {} : inner || {};
        for (const [b, r] of Object.entries(level)) if (r && typeof r === 'object') out[c.name + ':' + a + '/' + b] = { rec: r, coll: c, path: [a, b] };
      }
    }
  }
  return out;
}

const childrenOf = (coll) => coll.children || [];

// List records made without an id (estimate log rows, balance checks) get one before anything is keyed by id.
// For an older file the id comes from the record's place in the file, so two copies of one old file
// get the same ids and merge cleanly; a new record gets a random one.
function ensureIds(doc, fromPlace = false) {
  for (const c of COLLECTIONS) {
    if (c.kind !== 'array') continue;
    (c.get(doc) || []).forEach((r, i) => {
      if (!r.id) r.id = fromPlace ? 'old-' + c.name + '-' + i : newId('rec');
      for (const field of childrenOf(c)) (r[field] || []).forEach((k, j) => { if (!k.id) k.id = fromPlace ? 'old-' + c.name + '-' + i + '-' + j : newId('rec'); });
    });
  }
  return doc;
}

function fresh(rec, nowIso, role, idNeeded) {
  if (idNeeded && !rec.id) rec.id = newId('rec');
  if (rec.version === undefined) Object.assign(rec, { createdAt: nowIso, updatedAt: nowIso, createdBy: role, updatedBy: role, version: 1 });
}

// The live view: the document with every deleted record left out.
export function liveView(doc) {
  if (!doc) return doc;
  const d = clone(doc);
  const keep = (list) => (list || []).filter((r) => !r.deleted);
  for (const c of COLLECTIONS) {
    if (c.kind === 'array' && c.get(d)) {
      c.set(d, keep(c.get(d)));
      for (const parent of c.get(d)) for (const field of childrenOf(c)) parent[field] = keep(parent[field]);
    }
    if (c.kind === 'map') {
      for (const [a, inner] of Object.entries(c.get(d) || {})) {
        const level = c.inner ? (inner || {})[c.inner] : inner;
        if (!level) continue;
        for (const [b, r] of Object.entries(level)) if (r && r.deleted) delete level[b];
      }
    }
  }
  return d;
}

export function hasDeleted(doc) {
  return Object.values(flatten(doc)).some((x) => x.rec.deleted);
}

// After an edit: stamp new and changed records, and keep anything the edit removed as a deleted record.
// prev: the full document before (with deleted records), or null. draft: the edited live view.
export function stamp(prev, draft, nowIso, role) {
  const next = ensureIds(clone(draft));
  const before = prev ? flatten(prev) : {};
  const after = flatten(next);
  for (const [key, x] of Object.entries(after)) {
    const p = before[key];
    const kids = childrenOf(x.coll);
    if (!p) { fresh(x.rec, nowIso, role, x.coll.kind === 'map'); continue; }
    const same = contentOf(p.rec, kids) === contentOf(x.rec, kids) && !p.rec.deleted;
    for (const k of ['id', 'createdAt', 'createdBy']) if (p.rec[k] !== undefined) x.rec[k] = p.rec[k];
    if (p.rec.version === undefined) { fresh(x.rec, nowIso, role, x.coll.kind === 'map'); continue; }
    if (same) {
      for (const k of ['updatedAt', 'updatedBy', 'version']) x.rec[k] = p.rec[k];
    } else {
      Object.assign(x.rec, { updatedAt: nowIso, updatedBy: role, version: p.rec.version + 1 });
      delete x.rec.deleted; delete x.rec.deletedAt; delete x.rec.deletedBy;
    }
  }
  // Records the edit removed (and ones deleted before) stay in the file, marked deleted.
  for (const [key, p] of Object.entries(before)) {
    if (after[key]) continue;
    const tomb = p.rec.deleted ? clone(p.rec) : { ...clone(p.rec), deleted: true, deletedAt: nowIso, deletedBy: role, updatedAt: nowIso, updatedBy: role, version: (p.rec.version || 1) + 1 };
    putBack(next, p, tomb);
  }
  return next;
}

function putBack(doc, p, tomb) {
  const c = p.coll;
  if (c.kind === 'array') {
    const list = c.get(doc);
    if (!list) return;
    list.push(tomb);
    return;
  }
  if (c.kind === 'nested') {
    const parentColl = COLLECTIONS.find((x) => x.name === c.parent);
    const parent = (parentColl.get(doc) || []).find((r) => r.id === p.parentId);
    // A child of a deleted parent stays inside the parent's own deleted copy.
    if (parent) (parent[c.field] = parent[c.field] || []).push(tomb);
    return;
  }
  const root = c.get(doc);
  if (!root) return;
  const [a, b] = p.path;
  root[a] = root[a] || (c.inner ? { [c.inner]: {} } : {});
  const level = c.inner ? (root[a][c.inner] = root[a][c.inner] || {}) : root[a];
  level[b] = tomb;
}

// For older files (migration) and anything loaded without bookkeeping: stamp every record once.
export function stampAll(doc, atIso, role = 'coach') {
  ensureIds(doc, true);
  for (const x of Object.values(flatten(doc))) fresh(x.rec, atIso, role, x.coll.kind === 'map');
  return doc;
}

// The record's bookkeeping left out, for comparisons and tests.
export function stripMeta(doc) {
  const d = clone(doc);
  for (const x of Object.values(flatten(d))) for (const k of META) if (k !== 'id' || x.coll.kind === 'map') delete x.rec[k];
  return d;
}
