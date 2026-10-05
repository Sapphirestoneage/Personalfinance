/* Answer states (how sure) and sources (who supplied it). One keystroke each.
   A field is { v, state, source }. Confidence comes from the state, capped by
   the source. These tables are the only place the numbers live. */

export const STATES = Object.freeze({
  verified: Object.freeze({ id: 'verified', key: 'v', label: 'Verified', short: 'Ver', confidence: 1.0, counts: true }),
  known: Object.freeze({ id: 'known', key: 'k', label: 'Known', short: 'Known', confidence: 0.9, counts: true }),
  rough: Object.freeze({ id: 'rough', key: 'r', label: 'Rough', short: 'Rough', confidence: 0.6, counts: true, rough: true }),
  'will-send': Object.freeze({ id: 'will-send', key: 'w', label: 'Will send', short: 'Send', confidence: 0.3, counts: true, rough: true }),
  unknown: Object.freeze({ id: 'unknown', key: 'u', label: 'Unknown', short: 'Unk', confidence: 0, counts: false }),
  none: Object.freeze({ id: 'none', key: 'n', label: 'None', short: 'None', confidence: 1.0, counts: true, zero: true }),
  'not-applicable': Object.freeze({ id: 'not-applicable', key: 'a', label: 'Not applicable', short: 'N/A', confidence: 1.0, counts: false, removed: true }),
  'not-for-me': Object.freeze({ id: 'not-for-me', key: 'x', label: 'Not for me', short: 'Not me', confidence: 1.0, counts: false, excluded: true }),
});
export const STATE_ORDER = Object.freeze(['verified', 'known', 'rough', 'will-send', 'unknown', 'none', 'not-applicable', 'not-for-me']);

export const SOURCES = Object.freeze({
  client: Object.freeze({ id: 'client', key: 'c', label: 'Client', long: 'Client must provide', cap: 1.0, plate: 'theirs' }),
  'lookup-confirmed': Object.freeze({ id: 'lookup-confirmed', key: 'l', label: 'Looked up', long: 'Coach looked up (confirmed)', cap: 0.85, plate: 'mine' }),
  'lookup-verify': Object.freeze({ id: 'lookup-verify', key: 'y', label: 'Looked up (verify)', long: 'Coach looked up (verify)', cap: 0.7, plate: 'mine', rough: false }),
  inferred: Object.freeze({ id: 'inferred', key: 'i', label: 'Inferred', long: 'Inferred from other facts', cap: 1.0, plate: null }),
  estimated: Object.freeze({ id: 'estimated', key: 'e', label: 'Estimated', long: 'Estimated default (national average)', cap: 0.5, plate: 'mine', rough: true }),
  computed: Object.freeze({ id: 'computed', key: 'p', label: 'Computed', long: 'Computed by the engine', cap: 1.0, plate: null }),
});
export const SOURCE_ORDER = Object.freeze(['client', 'lookup-confirmed', 'lookup-verify', 'inferred', 'estimated', 'computed']);

export function stateByKey(k) { return STATE_ORDER.map(id => STATES[id]).find(s => s.key === k) || null; }
export function sourceByKey(k) { return SOURCE_ORDER.map(id => SOURCES[id]).find(s => s.key === k) || null; }

export function isState(id) { return Object.prototype.hasOwnProperty.call(STATES, id); }
export function isSource(id) { return Object.prototype.hasOwnProperty.call(SOURCES, id); }

/* Confidence of one field. `inputConfidence` is used for inferred fields. */
export function confidenceOf(field, inputConfidence) {
  if (!field) return 0;
  const st = STATES[field.state];
  if (!st) throw new Error('unknown state ' + field.state);
  const src = SOURCES[field.source || 'client'];
  if (!src) throw new Error('unknown source ' + field.source);
  if (field.source === 'inferred' && typeof inputConfidence === 'number') return Math.min(st.confidence, inputConfidence);
  return Math.min(st.confidence, src.cap);
}

/* Does this field hold a usable value for math? */
export function hasValue(field) {
  if (!field) return false;
  const st = STATES[field.state];
  if (!st || !st.counts) return false;
  if (st.zero) return true;
  return field.v !== null && field.v !== undefined && field.v !== '';
}

/* True when the figure should print with a tilde. */
export function isRough(field) {
  if (!field) return false;
  const st = STATES[field.state];
  const src = SOURCES[field.source || 'client'];
  return !!((st && st.rough) || (src && src.rough));
}

/* The numeric value for math: a range gives its midpoint; None gives 0. */
export function numberOf(field) {
  if (!hasValue(field)) return null;
  const st = STATES[field.state];
  if (st.zero) return 0;
  const v = field.v;
  if (v && typeof v === 'object' && typeof v.low === 'number') return Math.round((v.low + v.high) / 2);
  return typeof v === 'number' ? v : null;
}
export function rangeOf(field) {
  if (!hasValue(field)) return null;
  const v = field.v;
  if (v && typeof v === 'object' && typeof v.low === 'number') return { low: v.low, high: v.high };
  return null;
}

/* Does this field put a task on a plate? Unknown, rough, will-send, estimated. */
export function needsFollowUp(field) {
  if (!field) return false;
  if (field.state === 'unknown' || field.state === 'rough' || field.state === 'will-send') return true;
  if (field.source === 'estimated') return true;
  if (field.source === 'lookup-verify') return true;
  return false;
}

export function plateOf(field) {
  if (!needsFollowUp(field)) return null;
  const src = SOURCES[field.source || 'client'];
  return src.plate || 'theirs';
}

/* A fresh field. */
export function field(v, state, source) {
  if (!isState(state)) throw new Error('unknown state ' + state);
  if (!isSource(source)) throw new Error('unknown source ' + source);
  const st = STATES[state];
  if (st.zero) v = 0;
  if (state === 'unknown' || state === 'not-applicable' || state === 'not-for-me') v = null;
  if (v && typeof v === 'object' && typeof v.low === 'number' && state !== 'rough') state = 'rough';
  return { v: v === undefined ? null : v, state, source };
}
