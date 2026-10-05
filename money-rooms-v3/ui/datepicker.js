/* One calendar for every date (MR-038): the browser's own date picker, which
   looks like a calendar on a phone and on a desktop. A month field shows the
   first of the month and stores YYYY-MM; a day field stores YYYY-MM-DD. The
   value is read back from the record on every render, so what is picked
   sticks. Typing still works: the digits fill the segments in order. */
import { h } from './dom.js';

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
  const v = toInputDate(iso);
  if (input.value !== v) input.value = v;
}
