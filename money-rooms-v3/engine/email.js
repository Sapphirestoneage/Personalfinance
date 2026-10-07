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

/* After the discovery call (Level 8, MR-045): the next steps in plain language, the client's goals in their words, and at most three things to bring. */
export function discoveryEmail(record, summary, opts) {
  const o = opts || {};
  const name = (record.sun.f.name && record.sun.f.name.v) ? record.sun.f.name.v.split(' ')[0] : 'there';
  const gentle = (record.sessionMode || 'standard') === 'gentle';
  const lines = ['Subject: Thanks for today, and what comes next', '', 'Hi ' + name + ',', '', 'Thank you for walking me through where things stand. Here is what I heard and where we go from here.', ''];
  if (summary.goals && summary.goals.length) { lines.push('What you want:'); summary.goals.slice(0, 6).forEach(g => lines.push('  - ' + g.goal + (g.when ? ' (' + g.when + ')' : ''))); lines.push(''); }
  if (summary.words && summary.words.length) { lines.push('In your words: "' + summary.words[0] + '"'); lines.push(''); }
  lines.push('Next steps:');
  lines.push('  - Our first session starts by confirming the numbers you gave me, then we fill in the rest together' + (gentle ? ', at your pace' : '') + '.');
  lines.push('  - Nothing to log into on the call. ' + (gentle ? 'If a statement is easy to find, a photo is plenty; if not, we work with what you know.' : 'A photo of a statement is plenty.'));
  lines.push('');
  const bring = (summary.numbers || []).filter(n => n.status === 'unknown' || n.status === 'will-send').slice(0, 3);
  if (bring.length) { lines.push(gentle ? 'If it is easy, before we meet:' : 'Before we meet, if you can:'); bring.forEach(b => lines.push('  - ' + b.item + (b.status === 'will-send' ? ' (you said you would send it)' : ''))); lines.push(''); }
  if (o.nextDate) lines.push('See you ' + o.nextDate + '.'); lines.push(''); lines.push(o.coachName || 'Eli');
  return lines.join('\n');
}

/* After a session: the targets as to-dos in the client's words. */
export function targetsEmail(record, targetRows, areaLabels, opts) {
  const o = opts || {};
  const name = (record.sun.f.name && record.sun.f.name.v) ? record.sun.f.name.v.split(' ')[0] : 'there';
  const d = c => '$' + Math.round(c / 100).toLocaleString('en-US');
  const lines = ['Subject: Your targets, in your words', '', 'Hi ' + name + ',', '', 'Thanks for today. These are the numbers you said you want to aim for, next to where each one is right now.', ''];
  (targetRows || []).filter(t => t.saved || t.value !== t.actual).forEach(t => {
    const word = t.choice === 'dream' || t.choice === 'room' ? 'what you\'d want' : t.choice === 'gut' ? 'what you said' : t.choice === 'middle' ? 'meeting in the middle' : 'keeping it as is';
    lines.push('  - You said ' + word + ' for ' + (areaLabels[t.key] || t.label).toLowerCase() + ' is ' + d(t.value) + ' a month. Right now it is ' + d(t.actual) + '.');
  });
  if (lines.length === 6) lines.push('  - No targets chosen yet; we pick them next time.');
  lines.push(''); if (o.nextDate) lines.push('See you ' + o.nextDate + '.'); lines.push(''); lines.push(o.coachName || 'Eli');
  return lines.join('\n');
}
