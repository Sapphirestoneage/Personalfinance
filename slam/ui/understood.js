// What a box understood (S-285): under a money, rate, day or date box, the reading in words ("$500 a week, about
// $2,166.67 a month", "Dec 6, 2026"), in full-contrast text. When it could mean two things, the other reading is a
// button beside it. One component for every box that reads how people talk.
import { h } from './view.js';
import { understood, localToday, dateWords } from '../engine/natural.js';
import { inputText } from '../engine/edits.js';

export function echo(input, type, opts = {}) {
  const line = h('p', { class: 'understood', 'aria-live': 'polite' });
  const show = () => {
    const r = understood(type, input.value, localToday(), opts);
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
// A stored date shows in words ("Jan 1, 2024"), never as 2024-01-01; the words read back as the same day.
// past: true for a day that already happened (a purchase, a check-in, money lent): "Oct 20" typed after Oct 20 is this
// year's, never next year's (engine/natural.js readDate).
export const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
export function dateBox(id, value, onValue, attrs = {}, { past = false } = {}) {
  const box = h('input', { id, type: 'text', autocomplete: 'off', placeholder: past ? 'e.g. Oct 20 or yesterday' : 'e.g. Dec 6 or the 15th', ...attrs });
  box.value = value && ISO_DAY.test(String(value)) ? dateWords(String(value)) : value || '';
  box.addEventListener('input', () => { const r = understood('date', box.value, localToday(), { past }); onValue(r && r.ok ? r.value : ''); });
  return echo(box, 'date', { past });
}
