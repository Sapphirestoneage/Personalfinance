// "Add to my calendar" (overnight Track A): the bills, paydays and deadlines for the next 12 months as an .ics file
// (RFC 5545), one all-day event each, from the same calendar every screen reads. Pure: no dates of its own.

import { calendar } from './calendar.js';

// What goes in: money that moves on a day, and dates to know. Not the everyday spread or the plan's suggestion.
const KINDS = new Set(['pay', 'bill', 'subscription', 'debt', 'estimatedTax', 'taxReturn', 'promoEnds', 'maxDeadline', 'incomeStarts', 'incomeEnds', 'ask', 'bonusBy']);
const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const day = (iso) => iso.replace(/-/g, '');
const next = (iso) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
const dollars = (x) => '$' + Math.round(Math.abs(x)).toLocaleString('en-US');
// Lines longer than 75 octets fold onto the next line with a leading space (RFC 5545 3.1).
const fold = (line) => { const out = []; let s = line; while (s.length > 74) { out.push(s.slice(0, 74)); s = ' ' + s.slice(74); } out.push(s); return out.join('\r\n'); };

// [{ uid, date, title, note }] for the next `months` months from the as-of month.
export function icsEvents(spine, rules, { months = 12, from = null } = {}) {
  const cal = calendar(spine, rules, { from: from || spine.meta.asOf.slice(0, 7), months });
  const out = [];
  for (const m of cal.months) for (const e of m.events) {
    if (!e.date || !KINDS.has(e.kind)) continue;
    const money = e.amount !== null && e.amount !== undefined ? (e.direction === 'in' ? ' +' : e.direction === 'out' ? ' -' : ' ') + dollars(e.amount) : '';
    out.push({ uid: (e.id || e.kind) + '-' + e.date + '@slam', date: e.date, title: e.label + money + (e.rough ? ' (about)' : ''), note: e.note || '' });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
// The file's text. stamp: when it was made (YYYYMMDDTHHMMSSZ), passed in so the same household gives the same file.
export function icsText(events, { stamp = '20260101T000000Z', name = 'SLAM' } = {}) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SLAM//Calendar//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:' + esc(name)];
  for (const e of events) lines.push('BEGIN:VEVENT', 'UID:' + esc(e.uid), 'DTSTAMP:' + stamp, 'DTSTART;VALUE=DATE:' + day(e.date), 'DTEND;VALUE=DATE:' + day(next(e.date)), 'SUMMARY:' + esc(e.title), ...(e.note ? ['DESCRIPTION:' + esc(e.note)] : []), 'TRANSP:TRANSPARENT', 'END:VEVENT');
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
