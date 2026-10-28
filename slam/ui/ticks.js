// "What does it have?" (S-267): an item's features from data/type-features.json as Yes / No / Not sure ticks, folded
// under one slim line ("401(k): 4 of 12 checked"). Yes opens the feature's fields, No hides them, Not sure leaves them
// missing and makes a to-do. The answers are kept on the item (engine/features.js tickFeature); this only draws them.

import { h, showValue } from './view.js';
import { parseInput, inputText } from '../engine/edits.js';
import { featuresOf, featuresOfType, tickCount } from '../engine/features.js';
import { getAt } from '../engine/spine.js';
import { PRESETS, POLICY_TYPES } from '../engine/schema.js';
import { INCOME_WORDS } from '../engine/add.js';

// The catalog, read once (offline or missing: no ticks anywhere, nothing breaks).
export let catalog = null;
try { const r = await fetch(new URL('../data/type-features.json', import.meta.url), { cache: 'no-store' }); if (r.ok) catalog = await r.json(); } catch { /* offline: no ticks */ }
export const setCatalog = (c) => { catalog = c; };

export const ANSWERS = [['yes', 'Yes'], ['no', 'No'], ['notSure', 'Not sure']];
export const ANSWER_WORDS = Object.fromEntries(ANSWERS);
export const typeName = (type, collection) => (collection === 'income' ? INCOME_WORDS[type] : collection === 'policies' ? POLICY_TYPES[type] : (PRESETS[type] || {}).label) || type;

// The words for an answer on the shell's bar, so Undo says what it undoes: "401(k): Does your employer match? Yes".
export const tickWords = (name, f, answer) => name + ': ' + f.question + ' ' + (answer ? ANSWER_WORDS[answer] : 'answer cleared');

// tickList({ title, features, ticks, onAnswer(f, answer|null), below(f, answer) -> node, open, ontoggle }) -> <details>
// Tapping the pressed answer again clears it.
export function tickList({ title, features, ticks = {}, onAnswer, below = () => null, open = false, ontoggle = null, idBase = 'tk' }) {
  if (!features.length) return null;
  const checked = features.filter((f) => ticks[f.id]).length;
  return h('details', { class: 'card done-group tick-list', open: open || null, ontoggle },
    h('summary', {}, h('span', {}, title + ': ' + checked + ' of ' + features.length + ' checked')),
    h('p', { class: 'muted tick-lead' }, 'What does it have? Yes opens its numbers, No hides them, Not sure adds a to-do.'),
    h('ul', { class: 'tick-rows' }, features.map((f) => {
      const ans = ticks[f.id] || null;
      return h('li', { class: 'feature-row' },
        h('p', { class: 'tick-q', id: idBase + '-q-' + f.id }, f.question),
        f.note ? h('p', { class: 'edit-hint' }, f.note) : null,
        h('div', { class: 'segmented tick-seg', role: 'group', 'aria-labelledby': idBase + '-q-' + f.id },
          ANSWERS.map(([v, t]) => h('button', { type: 'button', class: 'seg-btn', id: idBase + '-' + f.id + '-' + v, 'aria-pressed': String(ans === v), onclick: () => onAnswer(f, ans === v ? null : v) }, h('span', { class: 'seg-label' }, t)))),
        below(f, ans));
    })));
}

// A saved item's ticks: answers go through onAnswer (the page's change(), so Undo works). Under a Yes, its fields as
// buttons that open each one (a value filled from the type's default reads "(a guess)"). tier 'core': the Session's.
export function itemTicks(spine, collection, id, { tier = null, onAnswer, onOpen = null, open = false, ontoggle = null }) {
  const item = (spine[collection] || []).find((x) => x.id === id);
  if (!item || !catalog) return null;
  const features = featuresOf(catalog, item, collection).filter((f) => !tier || f.tier === tier);
  const base = collection + '.' + id;
  const below = (f, ans) => (ans === 'yes' && onOpen ? h('div', { class: 'tick-fields' }, f.reveals.map((r) => {
    const fact = getAt(spine, base + '.' + r.field);
    const shown = fact && fact.value !== null && fact.value !== undefined ? showValue(fact.value, r.type) + (fact.kind === 'rough' ? ' (a guess)' : '') : 'Not given yet';
    return h('button', { type: 'button', class: 'btn small tick-field', onclick: () => onOpen(base + '.' + r.field) }, r.label + ': ' + shown);
  })) : null);
  return tickList({ title: typeName(item.type, collection), features, ticks: item.ticks || {}, onAnswer: (f, a) => onAnswer(base, f, a), below, open, ontoggle, idBase: 'tk-' + id });
}

// The count for one slim line elsewhere ("4 of 12 checked").
export const tickCountOf = (item, collection, tier = null) => (catalog ? tickCount(catalog, item, collection, { tier }) : { checked: 0, total: 0 });
export const featuresForType = (type, collection) => (catalog ? featuresOfType(catalog, type, collection) : []);

// ---------------------------------------------------------------- fields in place (the Session and the add form)
// One box for one field the catalog reveals, saved when it is left (Tab or Enter): onSet(value | null). A label above,
// "e.g." inside. A link or a list is set on the item's screen in My numbers.
const BOXED = /^(money|rate|int|text|date|bool|tiers)$|^choice:/;
export function fieldBox(r, value, onSet, id) {
  const msg = h('span', { class: 'edit-msg', role: 'alert' });
  const parse = (raw) => (r.type === 'text' ? { ok: true, value: raw } : parseInput(r.type, raw));
  let box;
  if (!BOXED.test(r.type)) return h('p', { class: 'muted tick-later' }, r.label + ': set it on this item in My numbers.');
  if (r.type === 'tiers') return tiersBox(r, value, onSet, id);
  if (r.type === 'bool' || r.type.startsWith('choice:')) {
    const opts = r.type === 'bool' ? [['true', 'Yes'], ['false', 'No']] : r.type.slice(7).split('|').map((x) => [x, showValue(x, r.type)]);
    box = h('select', { id, onchange: () => onSet(box.value === '' ? null : r.type === 'bool' ? box.value === 'true' : box.value) }, h('option', { value: '' }, 'Choose'), ...opts.map(([v, t]) => h('option', { value: v, selected: value !== null && value !== undefined && String(value) === v }, t)));
  } else {
    box = h('input', { id, type: r.type === 'date' ? 'date' : 'text', autocomplete: 'off', inputmode: ['money', 'rate', 'int'].includes(r.type) ? 'decimal' : null, placeholder: r.hint || null });
    box.value = value === null || value === undefined ? '' : r.type === 'date' || r.type === 'text' ? String(value) : inputText(r.type, value);
    box.addEventListener('change', () => { const raw = box.value.trim(); if (!raw) { msg.textContent = ''; onSet(null); return; } const p = parse(raw); if (!p.ok) { msg.textContent = p.message; return; } msg.textContent = ''; onSet(p.value); });
  }
  return h('div', { class: 'tick-box' }, h('label', { for: id, class: 'mini-label' }, r.label + (r.type === 'rate' ? ' (%)' : '')), box, msg);
}
// A match, tier by tier: a pair of boxes a tier, and + Add a tier. Saved once every pair is whole.
function tiersBox(r, value, onSet, id) {
  const tiers = Array.isArray(value) && value.length ? value.map((t) => ({ ...t })) : [{ rate: null, upTo: null }];
  const wrap = h('div', { class: 'tick-box tiers-box' });
  const msg = h('span', { class: 'edit-msg', role: 'alert' });
  const save = () => {
    const out = [];
    for (const t of tiers) { if (t.rate === null && t.upTo === null) continue; if (t.rate === null || t.upTo === null) return; out.push(t); }
    if (out.some((t) => t.upTo <= 0 || t.upTo > 1 || t.rate < 0 || t.rate > 2)) { msg.textContent = 'A match like 100, on the first 3 (% of pay)'; return; }
    msg.textContent = ''; onSet(out.length ? out : null);
  };
  const draw = () => wrap.replaceChildren(h('p', { class: 'mini-label' }, r.label), ...tiers.map((t, i) => {
    const one = (k, words) => { const b = h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', id: i === 0 && k === 'rate' ? id : null, 'aria-label': 'Tier ' + (i + 1) + ': ' + words, placeholder: k === 'rate' ? 'e.g. 100' : 'e.g. 3' });
      b.value = t[k] === null ? '' : inputText('rate', t[k]);
      b.addEventListener('change', () => { const raw = b.value.trim(); const p = raw ? parseInput('rate', raw) : { ok: true, value: null }; if (!p.ok) { msg.textContent = p.message; return; } t[k] = p.value; save(); });
      return b; };
    return h('div', { class: 'tier-row' }, one('rate', 'match %'), h('span', {}, i ? '% of the next' : '% of the first'), one('upTo', 'share of pay'), h('span', {}, '% of pay'));
  }), h('button', { type: 'button', class: 'btn small add', onclick: () => { tiers.push({ rate: null, upTo: null }); draw(); } }, '+ Add a tier'), msg);
  draw();
  return wrap;
}

// The ticks with their fields in place under a Yes: the Session (screen-one ticks only) and the add form.
// get(field) -> value; onSet(field, value, reveal); onAnswer(feature, answer | null).
export function inlineTicks({ title, features, ticks = {}, onAnswer, get, onSet, open = false, ontoggle = null, idBase }) {
  return tickList({ title, features, ticks, onAnswer, open, ontoggle, idBase,
    below: (f, ans) => (ans === 'yes' ? h('div', { class: 'tick-fields' }, f.reveals.map((r) => fieldBox(r, get(r.field), (x) => onSet(r.field, x, r), idBase + '-' + r.field))) : null) });
}

// The keys, once, in a small fold (S-270): Tab, Enter, Y / N / S and M.
export const KEYS = [['Tab', 'Next box'], ['Enter', 'Save the box and move on'], ['Y  N  S', 'Answer the question in focus: Yes, No, Not sure'], ['M', 'Open or close More']];
export const keysHint = () => h('details', { class: 'keys-hint' }, h('summary', {}, 'Keys'), h('dl', {}, KEYS.map(([k, w]) => [h('dt', {}, h('kbd', {}, k)), h('dd', {}, w)])));
