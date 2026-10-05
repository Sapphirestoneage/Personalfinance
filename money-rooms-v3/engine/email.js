/* The follow-up email: their plate grouped by institution, each item with
   where to find the number. Plain text the coach can paste. Never a balance. */
import { byInstitution } from './plates.js';

const WHERE_BY_KIND = { money: 'the latest statement or the app home screen', percent: 'the statement, usually near "interest charge" or "rate"', month: 'the statement or the welcome letter', int: 'the statement', text: 'anywhere you have it written down', choice: 'the plan documents', bool: 'the account settings', date: 'the document itself', hours: 'a normal week\'s calendar' };

export function whereToFind(def, fieldsData) {
  if (def.where) return def.where;
  return WHERE_BY_KIND[def.kind] || 'the statement';
}

export function followUpEmail(record, fields, theirItems, opts) {
  const o = opts || {};
  const name = (record.sun.f.name && record.sun.f.name.v) ? record.sun.f.name.v.split(' ')[0] : 'there';
  const groups = byInstitution(theirItems);
  const lines = [];
  lines.push('Subject: A few numbers for next time');
  lines.push('');
  lines.push('Hi ' + name + ',');
  lines.push('');
  lines.push('Thanks for today. Before we meet again, these are the figures that would sharpen the picture most, grouped by where to look. Rough numbers are fine; a photo of the page works too.');
  lines.push('');
  groups.forEach(g => {
    lines.push(g.institution);
    g.items.forEach(i => {
      const def = fields.fields[i.field];
      const what = (i.row ? i.row + ': ' : '') + (def ? def.label.toLowerCase() : i.label);
      const where = def ? whereToFind(def, fields) : 'wherever you have it';
      const why = i.state === 'rough' ? ' (we used a rough figure)' : i.state === 'will-send' ? ' (you said you would send it)' : '';
      lines.push('  - ' + what + why + '. Where: ' + where + '.');
    });
    lines.push('');
  });
  if (o.nextDate) lines.push('See you ' + o.nextDate + '.');
  lines.push('');
  lines.push(o.coachName || 'Eli');
  return lines.join('\n');
}
