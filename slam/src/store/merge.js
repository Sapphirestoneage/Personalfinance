// Merge, not replace (S-096). Two copies of one client file (say the coach's
// and one edited on another device) are merged record by record, by id:
//   only in one copy           -> kept (added)
//   changed in one copy only   -> that copy's version
//   changed in both since the last shared version -> a conflict for the coach to pick
//   unchanged in both, or the other copy is older -> kept as it is here
// "Changed" means the record's version is past the version both copies last
// shared (doc.sync.versions, written on export and on every merge). Deleted
// markers are part of a record, so a delete merges like any edit, and a
// delete on one side with an edit on the other is a conflict. Everything that
// is not a record (profile, settings, the month being worked on) stays as it
// is here; closed months only in the other copy are added.
// Pure functions: the store saves the result. Depends on flatten, contentOf, and
// COLLECTIONS in records.js (where each kind of record lives and how it is keyed).

import { flatten, contentOf, COLLECTIONS } from './records.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
const kidsOf = (coll) => coll.children || [];
// Same content (bookkeeping and child records aside) and the same deleted state; versions and timestamps alone do not count.
const sameRecord = (a, b, coll) => contentOf(a, kidsOf(coll)) === contentOf(b, kidsOf(coll)) && !!a.deleted === !!b.deleted;

export function describe(key, rec) {
  const kind = key.split(':')[0];
  const name = rec.name || rec.label || rec.description || rec.note || '';
  const when = rec.date ? ' (' + rec.date + ')' : '';
  const label = { entry: 'Log entry', line: 'Line', category: 'Category', income: 'Income', debt: 'Debt', account: 'Account', tag: 'Tag', balance: 'Balance', 'plan-line': 'Plan line' }[kind] || kind;
  return label + (name || when ? ': ' : '') + name + when;
}

// Put one record from another copy into this document, at the same place.
function put(doc, key, x) {
  const c = x.coll;
  const rec = clone(x.rec);
  if (c.kind === 'array') {
    const list = c.get(doc);
    if (!list) return;
    const i = list.findIndex((r) => r.id === rec.id);
    if (i < 0) { for (const k of kidsOf(c)) rec[k] = rec[k] || []; list.push(rec); return; }
    // A parent keeps the child records it has here; children merge on their own.
    for (const k of kidsOf(c)) rec[k] = list[i][k];
    list[i] = rec;
    return;
  }
  if (c.kind === 'nested') {
    const parentColl = COLLECTIONS.find((p) => p.name === c.parent);
    const parent = (parentColl.get(doc) || []).find((p) => p.id === x.parentId);
    if (!parent) return;
    const list = (parent[c.field] = parent[c.field] || []);
    const i = list.findIndex((r) => r.id === rec.id);
    if (i < 0) list.push(rec); else list[i] = rec;
    return;
  }
  // A 'map' record (a month's balance, a plan line) sits at a two-level path, under an inner key for plans.
  const root = c.get(doc);
  const [a, b] = x.path;
  root[a] = root[a] || (c.inner ? { [c.inner]: {} } : {});
  if (c.inner) { root[a][c.inner] = root[a][c.inner] || {}; root[a][c.inner][b] = rec; } else root[a][b] = rec;
}

export function mergeDocs(local, incoming) {
  if (local.id !== incoming.id) throw new Error('These are two different clients');
  // The versions both copies last shared; this copy's record of them wins when both have one.
  const base = { ...((incoming.sync || {}).versions || {}), ...((local.sync || {}).versions || {}) };
  const L = flatten(local);
  const I = flatten(incoming);
  const doc = clone(local);
  const out = { added: [], fromIncoming: [], fromLocal: [], same: 0, conflicts: [], monthsAdded: 0 };
  // Parents before children (the collection order), so a new line has its category.
  const keys = [...new Set([...Object.keys(L), ...Object.keys(I)])].sort((a, b) => order(a) - order(b));
  for (const key of keys) {
    const l = L[key];
    const i = I[key];
    if (!i) { if (l.rec.version > (base[key] || 0)) out.fromLocal.push(key); else out.same += 1; continue; }
    if (!l) { put(doc, key, i); out.added.push(key); continue; }
    if (sameRecord(l.rec, i.rec, l.coll)) { out.same += 1; continue; }
    // Never shared (no base for this key): the lower version number stands in for the shared one.
    const b = base[key] !== undefined ? base[key] : Math.min(l.rec.version, i.rec.version);
    const changedL = l.rec.version > b;
    const changedI = i.rec.version > b;
    if (changedI && !changedL) { put(doc, key, i); out.fromIncoming.push(key); continue; }
    if (changedL && !changedI) { out.fromLocal.push(key); continue; }
    // Neither is past the shared version: the other copy is older, keep this one. With no shared
    // version and the same version number, there is no telling which is newer, so the coach picks.
    if (!changedL && !changedI && (base[key] !== undefined || l.rec.version !== i.rec.version)) { out.fromLocal.push(key); continue; }
    out.conflicts.push({
      key, what: describe(key, l.rec),
      local: { rec: clone(l.rec), by: l.rec.deleted ? l.rec.deletedBy : l.rec.updatedBy, at: l.rec.updatedAt, deleted: !!l.rec.deleted },
      incoming: { rec: clone(i.rec), by: i.rec.deleted ? i.rec.deletedBy : i.rec.updatedBy, at: i.rec.updatedAt, deleted: !!i.rec.deleted }
    });
  }
  // Closed months only in the other copy are added (a closed month is never edited, only revised).
  for (const m of incoming.months || []) if (!doc.months.some((x) => x.key === m.key)) { doc.months.push(clone(m)); out.monthsAdded += 1; }
  doc.months.sort((a, b) => (a.key < b.key ? -1 : 1));
  // The flattened other copy rides along so resolveMerge can place a picked record.
  return { doc, ...out, incoming: { flat: I } };
}

const order = (key) => COLLECTIONS.findIndex((c) => c.name === key.split(':')[0]);

// Apply the coach's picks ({ key: 'local' | 'incoming' }; unpicked keeps this copy's), then mark
// everything shared at the versions it now has.
export function resolveMerge(result, picks = {}, nowIso) {
  const doc = clone(result.doc);
  for (const c of result.conflicts) {
    const pick = picks[c.key] === 'incoming' ? c.incoming.rec : c.local.rec;
    // The pick gets a version past both, so the next merge on either device takes it as the newer one.
    const x = { ...result.incoming.flat[c.key], rec: { ...pick, version: Math.max(c.local.rec.version, c.incoming.rec.version) + 1 } };
    put(doc, c.key, x);
  }
  doc.sync = { versions: versionsOf(doc), at: nowIso || null };
  return doc;
}

export function versionsOf(doc) {
  return Object.fromEntries(Object.entries(flatten(doc)).map(([k, x]) => [k, x.rec.version]));
}
