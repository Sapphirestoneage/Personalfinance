// What a box understood (S-285): under a money, rate, day or date box, the reading in words ("$500 a week, about
// $2,166.67 a month", "Dec 6, 2026"), in full-contrast text. When it could mean two things, the other reading is a
// button beside it. One component for every box that reads how people talk.
import { h } from './view.js';
import { understood, localToday } from '../engine/natural.js';
import { inputText } from '../engine/edits.js';

export function echo(input, type) {
  const line = h('p', { class: 'understood', 'aria-live': 'polite' });
  const show = () => {
    const r = understood(type, input.value, localToday());
    line.replaceChildren();
    if (!r) { line.remove(); return; }
    if (!line.isConnected) (input.closest('.affix') || input).after(line);
    if (!r.ok) { line.classList.add('is-unread'); line.append(r.message); return; }
    line.classList.remove('is-unread');
    line.append(h('span', { class: 'understood-tag' }, 'Reads as '), h('strong', {}, r.words));
    if (r.alt) line.append(' ', h('button', { type: 'button', class: 'btn small', onclick: () => {
      input.value = type === 'date' ? r.alt.value : type === 'rate' ? inputText('rate', r.alt.value) + '%' : String(r.alt.value);
      input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); input.focus();
    } }, 'I meant ' + r.alt.words));
  };
  input.addEventListener('input', show);
  input.addEventListener('change', show);
  return input;
}
// A date box that takes "dec 6", "the 15th" or "next friday" (never the browser's own picker, which takes none).
export function dateBox(id, value, onValue, attrs = {}) {
  const box = h('input', { id, type: 'text', autocomplete: 'off', placeholder: 'e.g. Dec 6 or the 15th', ...attrs });
  box.value = value || '';
  box.addEventListener('input', () => { const r = understood('date', box.value, localToday()); onValue(r && r.ok ? r.value : ''); });
  return echo(box, 'date');
}
