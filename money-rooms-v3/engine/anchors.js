/* Anchors (Level 8, MR-046): what the client said before the numbers were
   looked up. Two sets, gut and dream. An anchor is written the first time the
   client gives that number and never overwritten by later edits; Re-anchor is
   an explicit action that keeps the old value in the record's history and
   writes a journal line of kind "anchor". Guesses never anchor. */
import { append } from './journal.js';

export const GUT_KEYS = Object.freeze(['spending:total', 'spending:accommodation', 'spending:utilities', 'spending:food', 'spending:transportation', 'spending:therapy', 'spending:wants', 'spending:irregular', 'income:takeHome', 'income:gross', 'debt:total', 'debt:minimums', 'safety:cash', 'invest:total']);
export const DREAM_KEYS = Object.freeze(['spending:total', 'spending:accommodation', 'spending:utilities', 'spending:food', 'spending:transportation', 'spending:therapy', 'spending:wants', 'spending:irregular', 'life:fiAge', 'housing:alone']);
export const AREAS = Object.freeze(['accommodation', 'utilities', 'food', 'transportation', 'therapy', 'wants', 'irregular']);

export function ensureAnchors(record) { if (!record.anchors) record.anchors = { gut: {}, dream: {}, history: [] }; if (!record.anchors.history) record.anchors.history = []; return record.anchors; }
export function getAnchor(record, set, key) { const a = record.anchors && record.anchors[set]; return a && a[key] ? a[key] : null; }

/* Write once. Returns the anchor when written, null when one already exists (or the source is a guess). */
export function setAnchor(record, set, key, value, meta) {
  const m = meta || {};
  if (m.source === 'estimated') return null;
  const A = ensureAnchors(record);
  if (A[set][key]) return null;
  const a = { cents: value && typeof value === 'object' && 'cents' in value ? value.cents : (typeof value === 'number' ? value : null), value: value && typeof value === 'object' && 'value' in value ? value.value : undefined, cadence: m.cadence || 'month', at: m.now || new Date().toISOString(), session: m.session || null, source: m.source || 'call', note: m.note || '', shared: !!m.shared, backfilled: !!m.backfilled };
  if (a.value === undefined) delete a.value;
  A[set][key] = a;
  append(record.journal, { kind: 'anchor', planet: key.split(':')[0], rowId: 'anchors', field: set + ':' + key, owner: 'sun', old: null, new: Object.assign({}, a), source: a.source === 'discovery' ? 'discovery' : 'client', state: 'rough', session: m.session || null }, m.now);
  return a;
}

/* Re-anchor: the explicit action. The old anchor goes to history. */
export function reanchor(record, set, key, value, meta) {
  const m = meta || {};
  const A = ensureAnchors(record);
  const old = A[set][key] || null;
  if (old) A.history.push(Object.assign({ set, key, replacedAt: m.now || new Date().toISOString() }, old));
  delete A[set][key];
  const a = setAnchor(record, set, key, value, Object.assign({}, m, { note: m.note || (old ? 'Re-anchored' : '') }));
  if (a && old) { const line = record.journal[record.journal.length - 1]; line.old = Object.assign({}, old); line.reanchor = true; }
  return a;
}

/* Dream total: the typed total, else the sum of dream areas. */
export function dreamTotal(record) {
  const d = (record.anchors && record.anchors.dream) || {};
  if (d['spending:total']) return { cents: d['spending:total'].cents, from: 'total' };
  const parts = AREAS.filter(k => d['spending:' + k]);
  if (!parts.length) return null;
  return { cents: parts.reduce((s, k) => s + d['spending:' + k].cents, 0), from: 'areas', areas: parts };
}
export function gutTotal(record) {
  const g = (record.anchors && record.anchors.gut) || {};
  if (g['spending:total']) return { cents: g['spending:total'].cents, from: 'total' };
  const parts = AREAS.filter(k => g['spending:' + k]);
  if (!parts.length) return null;
  return { cents: parts.reduce((s, k) => s + g['spending:' + k].cents, 0), from: 'areas', areas: parts };
}
