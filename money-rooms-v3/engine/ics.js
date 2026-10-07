/* Calendar export (Level 11, MR-051): one all-day event per projected goal
   finish and per booked session, as an .ics text. Plain titles, no numbers.
   Pure; the view hands the text to a download. */
function pad(n) { return String(n).padStart(2, '0'); }
function esc(t) { return String(t).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n'); }
function fold(line) { const out = []; let s = line; while (s.length > 73) { out.push(s.slice(0, 73)); s = ' ' + s.slice(73); } out.push(s); return out.join('\r\n'); }
/* an all-day event needs the day after as its end */
function nextDay(ymd) { const d = new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10))); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); }

/* events: [{ date: 'YYYY-MM-DD', title, uid }]; opts: { stamp: ISO string, name } */
export function icsOf(events, opts) {
  const o = opts || {}; const stamp = (o.stamp || new Date().toISOString()).replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Money Rooms v3//Goal timeline//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  if (o.name) lines.push(fold('X-WR-CALNAME:' + esc(o.name)));
  events.filter(e => e && /^\d{4}-\d{2}-\d{2}$/.test(e.date)).forEach(e => {
    const d = e.date.replace(/-/g, ''); const end = nextDay(e.date).replace(/-/g, '');
    lines.push('BEGIN:VEVENT', 'UID:' + (e.uid || (d + '-' + e.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'))) + '@money-rooms-v3', 'DTSTAMP:' + stamp, 'DTSTART;VALUE=DATE:' + d, 'DTEND;VALUE=DATE:' + end, fold('SUMMARY:' + esc(e.title)), 'TRANSP:TRANSPARENT', 'END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

/* The timeline's events: each goal with a finish month (the first of that month), each closed session. words: id to the title words. */
export function goalEvents(plan, sessions, words) {
  const out = [];
  plan.input.items.forEach(i => { const a = plan.assessment[i.id]; if (!a || !a.finishMonth) return; out.push({ date: a.finishMonth + '-01', title: (words && words[i.id]) || (i.clientName && i.step ? i.clientName : i.name + ' complete'), uid: 'goal-' + i.id.replace(/[^a-z0-9]+/gi, '-') }); });
  (sessions || []).forEach(s => { if (s && s.at) out.push({ date: s.at.slice(0, 10), title: s.label || 'Session', uid: 'session-' + s.id }); });
  return out.sort((a, b) => a.date < b.date ? -1 : 1);
}
