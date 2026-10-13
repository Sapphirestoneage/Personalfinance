/* One calendar for every date (MR-038): the browser's own date picker, which
   looks like a calendar on a phone and on a desktop. A month field shows the
   first of the month and stores YYYY-MM; a day field stores YYYY-MM-DD. The
   value is read back from the record on every render, so what is picked
   sticks. Typing still works: the digits fill the segments in order. */
import { h } from './dom.js';
import { parseTypedDate, formatTypedDate } from '../engine/parse.js';

/* MR-091: on a phone the calendar dialog cannot be counted on, so the date is a box you type into with a number keyboard */
export function typedDates() { try { return window.matchMedia('(max-width: 720px), (pointer: coarse)').matches; } catch (e) { return false; } }

export function toInputDate(iso) {
  if (!iso) return '';
  const s = String(iso);
  if (/^\d{4}-\d{2}$/.test(s)) return s + '-01';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return '';
}

export function fromInputDate(value, precision) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return precision === 'month' ? value.slice(0, 7) : value;
}

/* opts: { value, precision: 'month' | 'day', label, min, max, onCommit(iso | null), className, dataset, title } */
export function datePicker(opts) {
  const precision = opts.precision || 'day';
  if (typedDates()) {
    const box = h('input', {
      class: 'input date typed' + (opts.className ? ' ' + opts.className : ''), type: 'text', inputmode: 'numeric', value: formatTypedDate(opts.value, precision),
      placeholder: precision === 'month' ? 'mm/yyyy' : 'mm/dd/yyyy', 'aria-label': opts.label || 'Date', title: opts.title || (precision === 'month' ? 'A month, like 07/2027' : 'A date, like 07/01/2001'),
      dataset: Object.assign({ precision }, opts.dataset || {}),
      onChange: e => {
        const t = e.target.value.trim();
        if (t === '') { opts.onCommit(null); return; }
        const iso = parseTypedDate(t, precision); if (!iso) { e.target.classList.add('is-wrong'); return; } /* a half-typed date is not a change */
        e.target.classList.remove('is-wrong'); e.target.value = formatTypedDate(iso, precision); opts.onCommit(iso);
      },
    });
    box.addEventListener('input', () => box.classList.remove('is-wrong'));
    return box;
  }
  const input = h('input', {
    class: 'input date' + (opts.className ? ' ' + opts.className : ''), type: 'date', value: toInputDate(opts.value),
    'aria-label': opts.label || 'Date', min: opts.min || '1900-01-01', max: opts.max || '2100-12-31', title: opts.title || null,
    dataset: opts.dataset || null,
    onChange: e => {
      const iso = fromInputDate(e.target.value, precision);
      if (e.target.value !== '' && !iso) return; /* a half-typed date is not a change */
      opts.onCommit(iso);
    },
  });
  return input;
}

/* Patch a picker in place from the record, unless the coach is in it. */
export function setDateValue(input, iso) {
  if (!input || input === document.activeElement) return;
  const v = input.type === 'text' ? formatTypedDate(iso, input.dataset.precision || 'day') : toInputDate(iso);
  if (input.value !== v) input.value = v;
}
