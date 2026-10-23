// Editing the spine: one Fact at a time, and an undo/redo history of whole
// documents (households are small; S-003 does the same for the Budget).

import { getAt, setAt, isFact } from './spine.js';
import { PRESETS, INCOME_TYPES } from './schema.js';

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

// Set a field that may not exist yet (a new tag such as "paid by someone else").
export function putFact(spine, path, value, kind, today) {
  return setAt(spine, path, { value, kind, asOf: today, source: 'ledger' });
}

// One expense, as its panel saves it (S-175, S-176): amount and how often, and
// who pays. sharing: null (keep), or { shared, sharedWith, yourShare, whoPays };
// yourShare null means an even split. A choice that matches the section default
// is not copied onto the expense, so the expense keeps following the default.
// coveredBy: a name when someone else covers it (counts $0), null when not; a
// name not on the household's list is added to it.
export function editExpense(spine, id, { amount, cadence, sharing = null, coveredBy = undefined, kind = 'known', label = null }, today) {
  const base = 'expenses.' + id;
  const e = getAt(spine, base);
  if (!e) throw new Error('No expense ' + id);
  const F = (value, k = kind) => ({ value, kind: value === null ? 'missing' : k, asOf: today, source: 'ledger' });
  let s = setAt(spine, base + '.amount', F(amount));
  // A new name keeps the id, so links and history still point at it.
  if (label && label.trim() && label.trim() !== e.label) s = setAt(s, base, { ...getAt(s, base), label: label.trim() });
  if (cadence && cadence !== e.cadence) s = setAt(s, base + '.cadence', cadence);
  if (sharing) {
    const def = (spine.household.expenseDefaults || {})[e.fat || 'other'] || {};
    const dv = (k) => (def[k] ? def[k].value : null);
    const want = { shared: !!sharing.shared, sharedWith: sharing.shared ? sharing.sharedWith ?? null : null, yourShare: sharing.shared ? sharing.yourShare ?? null : null, whoPays: sharing.shared ? sharing.whoPays || 'part' : null };
    const sameAsDefault = want.shared === (dv('shared') === true) && (!want.shared || (want.sharedWith === dv('sharedWith') && want.yourShare === dv('yourShare') && want.whoPays === (dv('whoPays') || 'part')));
    const cur = getAt(s, base);
    const next = { ...cur };
    for (const k of SHARE_KEYS) delete next[k];
    if (!sameAsDefault) {
      next.shared = F(want.shared, 'known');
      if (want.shared) {
        next.sharedWith = F(want.sharedWith, 'known');
        if (want.yourShare !== null) next.yourShare = F(want.yourShare, 'known');
        next.whoPays = F(want.whoPays, 'known');
      }
    }
    s = setAt(s, base, next);
  }
  if (coveredBy !== undefined) {
    const next = { ...getAt(s, base) };
    if (coveredBy) {
      next.covered = F(true, 'known'); next.coveredBy = F(coveredBy, 'known');
      for (const k of SHARE_KEYS) delete next[k];
      const known = spine.household.payers || [];
      if (!PAYERS.includes(coveredBy) && !known.includes(coveredBy)) s = { ...s, household: { ...s.household, payers: [...known, coveredBy] } };
    } else { delete next.covered; delete next.coveredBy; }
    s = setAt(s, base, next);
  }
  return s;
}
const SHARE_KEYS = ['shared', 'sharedWith', 'yourShare', 'whoPays'];
const PAYERS = ['Parents', 'Partner', 'Roommate', 'Employer', 'Family'];

// A section's sharing default; new and untouched expenses there follow it.
export function setSectionSharing(spine, tag, { shared, sharedWith = null, yourShare = null, whoPays = 'part' }, today) {
  const F = (value) => ({ value, kind: value === null ? 'missing' : 'known', asOf: today, source: 'ledger' });
  const d = shared ? { shared: F(true), sharedWith: F(sharedWith), whoPays: F(whoPays), ...(yourShare !== null ? { yourShare: F(yourShare) } : {}) } : { shared: F(false) };
  return { ...spine, household: { ...spine.household, expenseDefaults: { ...(spine.household.expenseDefaults || {}), [tag]: d } } };
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

// ---------------------------------------------------------------- add, remove, many at once (S-169)
// Fields a new item starts with, as missing Facts, by family or collection.
const STARTING_FIELDS = {
  cash: ['institution', 'balance', 'apy'], fixedTerm: ['institution', 'balance', 'rate', 'maturityDate'],
  employerRetirement: ['institution', 'balance', 'monthlyContribution'], ira: ['institution', 'balance', 'monthlyContribution'],
  hsaFsa: ['institution', 'balance', 'monthlyContribution'], education: ['institution', 'balance', 'beneficiary'],
  taxable: ['institution', 'balance', 'costBasis'], otherAssets: ['balance', 'appreciationRate'],
  debt: ['institution', 'balance', 'apr', 'minimum']
};

function newId(list, label) {
  const base = String(label || 'item').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'item';
  const taken = new Set((list || []).map((x) => x.id));
  let id = base, n = 2;
  while (taken.has(id)) id = base + '-' + n++;
  return id;
}

// addItem(spine, { collection, type, label, cadence, fat }, today) -> { spine, id, firstPath }
// A new account, debt, income stream, expense or goal, with its starting
// fields missing (red) so the Ledger asks for them. House defaults run after.
export function addItem(spine, { collection, type, label, cadence = 'monthly', fat = null }, today) {
  const stamp = { asOf: today, source: 'ledger' };
  const M = () => ({ value: null, kind: 'missing', ...stamp });
  const K = (value) => ({ value, kind: 'known', ...stamp });
  const list = spine[collection] || [];
  const id = newId(list, label);
  let item, first;
  if (collection === 'accounts' || collection === 'debts') {
    const preset = PRESETS[type];
    if (!preset || (collection === 'debts') !== (preset.family === 'debt')) throw new Error('Not a ' + collection + ' type: ' + type);
    item = { id, family: preset.family, type, name: K(label || preset.label) };
    for (const k of STARTING_FIELDS[preset.family] || ['balance']) item[k] = M();
    if (type === 'roth_ira') item.basis = M();
    if (type === 'student_loan') item.plan = M();
    if (type === 'credit_card') Object.assign(item, { limit: M(), business: M(), reportsToPersonalCredit: M() });
    first = collection + '.' + id + '.balance';
  } else if (collection === 'income') {
    if (!INCOME_TYPES.includes(type)) throw new Error('Not an income type: ' + type);
    const noWithholding = type === '1099';
    item = { id, type, label: label || type, personId: spine.household.people[0].id, amount: M(), cadence, start: null, end: null,
      withholding: { federal: noWithholding ? K(0) : M(), state: noWithholding ? K(0) : M() } };
    if (type === 'maybeMoney') item.likelihood = M();
    first = 'income.' + id + '.amount';
  } else if (collection === 'expenses') {
    item = { id, label: label || 'New expense', amount: M(), cadence, start: null, end: null, fixed: null, need: M(), fat };
    first = 'expenses.' + id + '.amount';
  } else if (collection === 'goals') {
    item = { id, type: type || 'savings', label: label || 'New goal' };
    if (item.type === 'fi') item.fiNumber = M(); else item.target = M();
    first = 'goals.' + id + (item.type === 'fi' ? '.fiNumber' : '.target');
  } else throw new Error('Cannot add to ' + collection);
  return { spine: { ...spine, [collection]: [...list, item] }, id, firstPath: first };
}

// Remove one item (undo brings it back).
export function removeItem(spine, collection, id) {
  if (!(spine[collection] || []).some((x) => x.id === id)) throw new Error('No ' + collection + ' item ' + id);
  return { ...spine, [collection]: spine[collection].filter((x) => x.id !== id) };
}

// Many fields at once: confirm (those with a value become known), rough (those
// with a value become rough), notForMe. rows: [{ path, type }] from the Ledger.
export function bulkEdit(spine, rows, action, today) {
  let s = spine;
  for (const r of rows) {
    if (r.type === 'cardRate') {
      const cardId = r.path.split('.')[1];
      if (action === 'rough') {
        for (const k of ['apr', 'promoApr', 'promoEnds']) { const f = getAt(s, 'debts.' + cardId + '.' + k); if (f && f.value !== null) s = setAt(s, 'debts.' + cardId + '.' + k, { ...f, kind: 'rough', asOf: today, source: 'ledger' }); }
      } else s = editCardRate(s, cardId, action, { today });
      continue;
    }
    const f = getAt(s, r.path);
    if (!isFact(f)) continue;
    if (action === 'notForMe') s = editFact(s, r.path, 'notForMe', { today });
    else if (f.value !== null && action === 'confirm') s = editFact(s, r.path, 'confirm', { today });
    else if (f.value !== null && action === 'rough') s = editFact(s, r.path, 'set', { value: f.value, kind: 'rough', today });
  }
  return s;
}
