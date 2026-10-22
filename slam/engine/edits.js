// Editing the spine: one Fact at a time, and an undo/redo history of whole
// documents (households are small; S-003 does the same for the Budget).

import { getAt, setAt, isFact } from './spine.js';

// Text typed in the Ledger to a stored value. Rates are typed as percents
// ("25" or "25%" is 0.25). Returns { ok, value } or { ok: false, message }.
export function parseInput(type, text) {
  const raw = String(text ?? '').trim();
  if (raw === '') return { ok: false, message: 'Type a value, or use Not for me' };
  if (type === 'money' || type === 'int' || type === 'rate') {
    const n = Number(raw.replace(/[$,%\s]/g, ''));
    if (!Number.isFinite(n)) return { ok: false, message: 'Type a number' };
    if (type === 'int' && !Number.isInteger(n)) return { ok: false, message: 'Type a whole number' };
    return { ok: true, value: type === 'rate' ? Math.round(n * 1e6) / 1e8 : n };
  }
  if (type === 'date') return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? { ok: true, value: raw } : { ok: false, message: 'Use YYYY-MM-DD' };
  if (type === 'bool') return /^(yes|true)$/i.test(raw) ? { ok: true, value: true } : /^(no|false)$/i.test(raw) ? { ok: true, value: false } : { ok: false, message: 'Yes or no' };
  if (type.startsWith('choice:')) return type.slice(7).split('|').includes(raw) ? { ok: true, value: raw } : { ok: false, message: 'Pick one of the choices' };
  if (type === 'list') { try { const v = JSON.parse(raw); return Array.isArray(v) ? { ok: true, value: v } : { ok: false, message: 'A list in [ ]' }; } catch { return { ok: false, message: 'A list in [ ]' }; } }
  return { ok: true, value: raw };
}

// The reverse: a stored value as the text an input box starts with.
export function inputText(type, value) {
  if (value === null || value === undefined) return '';
  if (type === 'rate') return String(Math.round(value * 1e8) / 1e6);
  if (type === 'list') return JSON.stringify(value);
  return String(value);
}

// The Ledger's three actions on a Fact. Each returns a new spine.
// set: a typed value, kept as known or rough. confirm: the current value
// becomes known. notForMe: does not apply (value null).
export function editFact(spine, path, action, { value, kind = 'known', today }) {
  const f = getAt(spine, path);
  if (!isFact(f)) throw new Error('No field at ' + path);
  const stamp = { asOf: today, source: 'ledger' };
  let next;
  if (action === 'set') next = { value, kind, ...stamp };
  else if (action === 'confirm') { if (f.value === null) throw new Error('Nothing to confirm at ' + path); next = { value: f.value, kind: 'known', ...stamp }; }
  else if (action === 'notForMe') next = { value: null, kind: 'notForMe', ...stamp };
  else if (action === 'clear') next = { value: null, kind: 'missing', ...stamp };
  else throw new Error('Unknown edit ' + action);
  return setAt(spine, path, next);
}

// ---------------------------------------------------------------- card rate
// The Ledger's one "Interest rate" panel for a card (S-161). Typed text in:
// { apr, hasIntro, introRate, introEnds }. A blank APR is allowed: the house
// default fills it in as rough (engine/defaults.js). A blank intro rate is 0.
export function parseCardRate({ apr, hasIntro, introRate, introEnds }) {
  const out = { apr: null, intro: null };
  if (String(apr ?? '').trim() !== '') {
    const p = parseInput('rate', apr);
    if (!p.ok) return { ok: false, message: (hasIntro ? 'Rate after intro: ' : 'Interest rate: ') + p.message };
    out.apr = p.value;
  }
  if (hasIntro) {
    const r = String(introRate ?? '').trim() === '' ? { ok: true, value: 0 } : parseInput('rate', introRate);
    if (!r.ok) return { ok: false, message: 'Intro rate: ' + r.message };
    const e = parseInput('date', introEnds);
    if (!e.ok) return { ok: false, message: 'Intro ends: pick a date' };
    out.intro = { rate: r.value, ends: e.value };
  }
  return { ok: true, value: out };
}

// set: { apr, intro } from parseCardRate, kept as known or rough; with no
// intro, intro fields that exist become not for me. confirm: every rate field
// in use becomes known. notForMe: the card charges no interest.
export function editCardRate(spine, cardId, action, { value, kind = 'known', today }) {
  const base = 'debts.' + cardId;
  const card = getAt(spine, base);
  if (!card || card.type !== 'credit_card') throw new Error('No card ' + cardId);
  const stamp = { asOf: today, source: 'ledger' };
  const put = (s, k, f) => setAt(s, base + '.' + k, { ...f, ...stamp });
  let s = spine;
  if (action === 'set') {
    s = put(s, 'apr', value.apr === null ? { value: null, kind: 'missing' } : { value: value.apr, kind });
    if (value.intro) {
      s = put(s, 'promoApr', { value: value.intro.rate, kind });
      s = put(s, 'promoEnds', { value: value.intro.ends, kind });
    } else for (const k of ['promoApr', 'promoEnds']) if (card[k]) s = put(s, k, { value: null, kind: 'notForMe' });
  } else if (action === 'confirm') {
    for (const k of ['apr', 'promoApr', 'promoEnds']) if (card[k] && card[k].value !== null) s = put(s, k, { value: card[k].value, kind: 'known' });
  } else if (action === 'notForMe') {
    for (const k of ['apr', 'promoApr', 'promoEnds']) if (k === 'apr' || card[k]) s = put(s, k, { value: null, kind: 'notForMe' });
  } else throw new Error('Unknown edit ' + action);
  return s;
}

// ---------------------------------------------------------------- history
export const MAX_STEPS = 200;

export function createHistory(doc) {
  return { past: [], present: doc, future: [] };
}
export function commit(h, doc, label = '') {
  const past = [...h.past, { doc: h.present, label }];
  return { past: past.slice(-MAX_STEPS), present: doc, future: [] };
}
export function undo(h) {
  if (!h.past.length) return h;
  const prev = h.past[h.past.length - 1];
  return { past: h.past.slice(0, -1), present: prev.doc, future: [{ doc: h.present, label: prev.label }, ...h.future] };
}
export function redo(h) {
  if (!h.future.length) return h;
  const [next, ...rest] = h.future;
  return { past: [...h.past, { doc: h.present, label: next.label }], present: next.doc, future: rest };
}
export const canUndo = (h) => h.past.length > 0;
export const canRedo = (h) => h.future.length > 0;
export const undoLabel = (h) => (h.past.length ? h.past[h.past.length - 1].label : null);
export const redoLabel = (h) => (h.future.length ? h.future[0].label : null);
