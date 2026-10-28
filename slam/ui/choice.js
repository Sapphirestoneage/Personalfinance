// One choice row for every small choice (S-282): one option is always chosen. When nobody has chosen yet, the
// recommended one (the house default or the most likely answer) shows chosen as a guess: a dashed border and a small
// "guess" tag, never faded. The recommended option says "Recommended". At most three show; the rest sit behind
// "More choices". Tapping the guess confirms it; tapping the chosen one again clears it when clear is allowed.
// options: [[value, words]]; value: the answer, or null; onPick(value | null).

import { h } from './view.js';

export function choiceRow({ id, options, value = null, recommended = null, onPick, label = null, clear = true, max = 3, more = false }) {
  const shown = value === null ? recommended : value;
  const first = options.slice(0, max), rest = options.slice(max);
  const inRest = rest.some(([k]) => k === shown);
  const btn = ([k, words]) => h('button', {
    type: 'button', class: 'seg-btn choice-btn' + (value === null && k === recommended ? ' is-guess' : ''), id: id ? id + '-' + k : null,
    'aria-pressed': String(shown === k),
    onclick: () => onPick(value === k && clear ? null : k)
  }, h('span', { class: 'seg-label' }, words), k === recommended ? h('span', { class: 'rec-tag' }, value === null ? 'guess' : 'Recommended') : null);
  const row = h('div', { class: 'segmented choice-row', role: 'group', 'aria-labelledby': label ? label : null }, first.map(btn));
  if (!rest.length) return row;
  const extra = h('details', { class: 'more-choices', open: more || inRest || null }, h('summary', { class: 'btn small' }, 'More choices (' + rest.length + ')'), h('div', { class: 'segmented choice-row' }, rest.map(btn)));
  return h('div', { class: 'choice-wrap' }, row, extra);
}
// The same row inside a form that stays open (an editor, the add form): it keeps its own pick and draws itself again on
// a tap, so the form reads .value when it saves. Guide me's rows need none of this: the page redraws on every change.
export function liveChoice({ id, options, value = null, recommended = null, clear = true, label = null, onPick = () => {} }) {
  const el = h('div', { class: 'choice-live' });
  let now = value;
  const draw = () => el.replaceChildren(choiceRow({ id, options, value: now, recommended, clear, label, onPick: (k) => { now = k; draw(); onPick(k); } }));
  draw();
  return { el, get value() { return now; } };
}
