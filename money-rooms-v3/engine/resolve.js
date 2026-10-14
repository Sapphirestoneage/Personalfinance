/* Snapshot and Sharpen (Level 15, MR-108): one resolver for every base
   number. A base number is a level total (the snapshot: a rough total row's
   field, a single number or a low-to-high range) and the moon rows that
   itemize it. itemized = the Known and Estimated rows; N/A rows count as
   zero and as covered; the remainder is what the snapshot says is still
   unitemized; the resolved total is itemized plus remainder. When the rows
   pass the snapshot the total is the rows and the gap is flagged, never
   written back: the gut number stays for the gut-against-actual read. A
   range snapshot resolves at its midpoint and carries the range into the
   precision band. Pure; every planet calls it, no view does. */
import { hasValue, numberOf, rangeOf } from './states.js';

/* The four states a detail row shows (the mapping to the stored states is the decision, MR-108):
   Known: verified or known, not a guess. Estimated: rough, or a guess or discovery figure. N/A: not applicable, not for me, or none (a real zero).
   Not yet: will-send (will email) or unknown (does not know); the stored state keeps the two apart. Blank: no field at all. */
export const ROW_STATES = Object.freeze([['known', 'Known'], ['estimated', 'Estimated'], ['na', 'N/A'], ['notYet', 'Not yet']]);
export function rowStateOf(f) {
  if (!f) return 'blank';
  if (f.state === 'will-send' || f.state === 'unknown') return 'notYet';
  if (f.state === 'not-applicable' || f.state === 'not-for-me' || f.state === 'none') return 'na';
  if (f.state === 'rough' || f.source === 'estimated' || f.source === 'discovery') return 'estimated';
  if (f.state === 'verified' || f.state === 'known') return 'known';
  return 'blank';
}
/* The stored state and source a row state maps back to; notYet takes the sub-choice (will email or does not know). */
export function storedFor(rowState, sub) {
  if (rowState === 'known') return { state: 'known' };
  if (rowState === 'estimated') return { state: 'rough' };
  if (rowState === 'na') return { state: 'not-for-me' };
  return { state: sub === 'email' ? 'will-send' : 'unknown' };
}
/* A base number's field is complete when it holds any value, a range, a guess, or a not-for-me; blank is the only incomplete state. */
export function snapshotComplete(f) { if (!f) return false; if (f.state === 'not-for-me' || f.state === 'not-applicable' || f.state === 'none') return true; return hasValue(f) || (f.source === 'estimated' && f.v !== null && f.v !== undefined); }

/* The uncertainty around a figure by its state (data/weights.json "uncertainty"), as a share. */
function spreadOf(f, weights) { const u = (weights && weights.uncertainty) || {}; if (!f) return 0; if (f.source === 'estimated') return u.estimated || 0.35; return u[f.state] || 0; }

/* resolveTotal({ snapshot, rows }, { weights })
   snapshot: { cents, range, state, source } or null (cents is the midpoint when a range was typed)
   rows: [{ id, cents (or null), range, state, source, label }] with the money already in the base number's period (a month, a year, or one-off)
   Returns { itemized, remainder, total, overGut, coverage, counts, range, rough, snapshot, status }. */
export function resolveTotal(input, opts) {
  const o = opts || {}; const W = o.weights || null;
  const rows = (input.rows || []).map(r => Object.assign({}, r, { rowState: r.rowState || rowStateOf(r) }));
  const counts = { known: 0, estimated: 0, na: 0, notYet: 0, blank: 0 };
  rows.forEach(r => { counts[r.rowState] = (counts[r.rowState] || 0) + 1; });
  const counted = rows.filter(r => (r.rowState === 'known' || r.rowState === 'estimated') && typeof r.cents === 'number');
  const itemized = counted.reduce((s, r) => s + r.cents, 0);
  const snap = input.snapshot && typeof input.snapshot.cents === 'number' ? input.snapshot : null;
  const hasSnapshot = !!snap; const hasRows = rows.length > 0; /* a Not yet row is itemizing too: the question becomes what makes up the rest */
  if (!hasSnapshot && !hasRows) return { status: 'needs', itemized: 0, remainder: 0, total: null, overGut: null, coverage: null, counts, range: null, rough: false, snapshot: null, hasSnapshot, hasRows };
  let remainder = 0, overGut = null, total = itemized;
  if (hasSnapshot) {
    if (itemized > snap.cents) { overGut = { gap: itemized - snap.cents, pct: snap.cents > 0 ? (itemized - snap.cents) / snap.cents : null }; remainder = 0; total = itemized; }
    else { remainder = snap.cents - itemized; total = snap.cents; }
  }
  /* the precision band: each counted row's own range or its state's spread, plus the remainder's (the snapshot's typed range, else its state's spread) */
  let low = 0, high = 0;
  counted.forEach(r => { if (r.range && typeof r.range.low === 'number') { low += r.range.low; high += r.range.high; } else { const s = spreadOf(r, W); low += Math.round(r.cents * (1 - s)); high += Math.round(r.cents * (1 + s)); } });
  if (remainder > 0) { if (snap.range && typeof snap.range.low === 'number') { low += Math.max(0, snap.range.low - itemized); high += Math.max(0, snap.range.high - itemized); } else { const s = spreadOf(snap, W); low += Math.round(remainder * (1 - s)); high += Math.round(remainder * (1 + s)); } }
  const rough = remainder > 0 || counts.estimated > 0 || (hasSnapshot && !hasRows && (snap.state === 'rough' || snap.source === 'estimated'));
  const coverage = total > 0 ? Math.min(1, itemized / total) : (hasRows && counts.na > 0 && !counted.length ? 1 : (total === 0 && hasRows ? 1 : 0));
  return { status: 'ok', itemized, remainder, total, overGut, coverage, counts, range: { low: Math.min(low, total), high: Math.max(high, total) }, rough, snapshot: snap ? { cents: snap.cents, range: snap.range || null, state: snap.state, source: snap.source } : null, hasSnapshot, hasRows };
}

/* A snapshot from a field: the midpoint and the typed range. */
export function snapshotFromField(f, cents) {
  if (!f || !hasValue(f)) return null;
  const n = typeof cents === 'number' ? cents : numberOf(f);
  if (n === null) return null;
  const r = rangeOf(f);
  return { cents: n, range: r ? { low: r.low, high: r.high } : null, state: f.state, source: f.source };
}
/* A row entry from a field: cents in the base period (already converted by the caller), the typed range, the states. */
export function rowFromField(id, label, f, cents, range) {
  return { id, label, cents: typeof cents === 'number' ? cents : null, range: range || null, state: f ? f.state : 'unknown', source: f ? f.source : 'client', rowState: rowStateOf(f) };
}

/* The label of the unitemized remainder, one string everywhere. */
export const REMAINDER_LABEL = 'Unitemized (from your snapshot)';
/* Coverage across base numbers, weighted by their resolved totals; a base number with no snapshot and no rows is out of the picture. */
export function overallCoverage(list) {
  const live = list.filter(b => b.resolved && b.resolved.status === 'ok' && b.resolved.total !== null);
  const total = live.reduce((s, b) => s + Math.abs(b.resolved.total), 0);
  if (!total) { const done = live.filter(b => b.resolved.coverage === 1).length; return live.length ? done / live.length : 0; }
  return live.reduce((s, b) => s + Math.abs(b.resolved.total) * b.resolved.coverage, 0) / total;
}
