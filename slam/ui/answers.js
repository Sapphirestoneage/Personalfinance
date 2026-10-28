// The four answers (owner's ask, 2026-10-28): every number on a fast-entry row takes the number itself, "rough"
// (the number plus a flag), "not now" (parked for later) or "not for me" (counts as done). The box is the first
// answer; the other three are plain buttons beside it, the one in force pressed. Rough with an empty box waits for
// the number typed next and saves it rough. Formatting only: the caller writes the answer (onSet(value, kind)).

import { h } from './view.js';
import { moneyBox, rateBox, intBox } from './boxes.js';
import { laterDate, setLaterPath } from './later.js';
import { refresh } from './shell.js';

// A box tapped Rough while empty: the next number typed in it is saved rough.
const pendingRough = new Set();

// answerField({ id, label, type: money | rate | int, path, fact, value, onSet, placeholder, hint })
//   fact: the field's Fact ({ value, kind }); value: what the box shows (the Fact's value unless the caller says).
//   onSet(value, kind): value a number, or null with kind missing (cleared) or notForMe.
export function answerField({ id, label, type = 'money', path, fact, value, onSet, placeholder, hint = null }) {
  const f = fact || { value: null, kind: 'missing' };
  const shown = value === undefined ? f.value : value;
  const kindFor = () => { const k = pendingRough.has(id) ? 'rough' : 'known'; pendingRough.delete(id); return k; };
  const set = (x) => onSet(x, x === null ? 'missing' : kindFor());
  const make = type === 'rate' ? rateBox : type === 'int' ? intBox : moneyBox;
  const box = type === 'int' ? intBox(id, shown, label, set, { placeholder: placeholder || '', min: 0, max: 120 }) : make(id, shown, label, set, placeholder || (type === 'rate' ? '%' : '$'));
  if (f.kind === 'notForMe') box.placeholder = 'Not for me';
  const rough = f.kind === 'rough' || pendingRough.has(id);
  const notNow = !!laterDate(path);
  const notMe = f.kind === 'notForMe';
  const btn = (words, pressed, title, onclick) => h('button', { type: 'button', class: 'btn small toggle ans-btn', 'aria-pressed': String(pressed), title, onclick }, words);
  const roughBtn = btn('Rough', rough, rough ? 'A rough number: tap to call it known' : 'Keep the number but call it rough', () => {
    if (f.value !== null) { onSet(f.value, rough ? 'known' : 'rough'); return; }
    if (pendingRough.has(id)) { pendingRough.delete(id); roughBtn.setAttribute('aria-pressed', 'false'); return; }
    pendingRough.add(id); roughBtn.setAttribute('aria-pressed', 'true'); box.focus();
  });
  const nowBtn = btn('Not now', notNow, notNow ? 'Set aside: tap to ask again' : 'Park it for a later session', () => { setLaterPath(path, !notNow); refresh(); });
  const meBtn = btn('Not for me', notMe, notMe ? 'Does not apply: tap to ask again' : 'Does not apply: counts as done', () => onSet(null, notMe ? 'missing' : 'notForMe'));
  return h('div', { class: 'af' + (notMe ? ' af-notme' : '') },
    h('label', { class: 'mini-label', for: id }, label),
    h('div', { class: 'af-row' }, box, h('span', { class: 'ans', role: 'group', 'aria-label': label + ': rough, not now or not for me' }, roughBtn, nowBtn, meBtn)),
    hint ? h('p', { class: 'edit-hint' }, hint) : null);
}
