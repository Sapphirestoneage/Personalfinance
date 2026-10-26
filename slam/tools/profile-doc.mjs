// Writes docs/specs/profile-questions.md from the Profile's own spec (engine/profile.js): the three levels, what each
// question does, and where to find each Level 2 number. Run: node tools/profile-doc.mjs (a test keeps it current).
import { writeFileSync } from 'node:fs';
import { AREAS, LEVEL1, LEVEL2, L2_AREAS, WHERE_WORDS } from '../engine/profile.js';

export function profileDoc() {
  const L = [
    '# Profile questions (Phase 2.5 B3)', '',
    'Written from `engine/profile.js` by `node tools/profile-doc.mjs`; do not edit by hand. Every question changes at',
    'least one of: which fields show, what a number means, the starting guess, or what the app does. "Not sure" is always',
    'allowed. Changing an answer hides fields and never deletes them; switching back shows what was typed. Each change is',
    'logged as a life change with its date, and Undo takes it back. A number never changes which fields show.', '',
    'Where it lives: its own page (profile.html), opened by tapping the client\'s name in the header. The six tabs do not',
    'change. Each area ends with one line saying what it set up (for example "Shows Rent, your share, Utilities, your share").', '',
    '## Level 1: before the call', '',
    'The client\'s page "Before our first call" (before.html): about 5 minutes, facts only, taps only, the areas as cards in',
    'any order. The one number is the gut number ("About how much do you spend a month? Your best guess, don\'t look',
    'anything up"), saved to Numbers as a guess. "Send my answers" saves answers-<first name>-<date>.json: "Email or text',
    'this file to Eli." It never asks for account numbers or logins, and the answers stay on the phone until sent. On the',
    'Profile page, "Import answers" fills the Profile and the gut number and shows what it set up.', ''
  ];
  for (const [area, label] of AREAS) {
    L.push('### ' + label, '');
    for (const q of LEVEL1.filter((x) => x.area === area)) L.push('- **' + q.label + '** (' + (q.options ? q.options.map((o) => o[1]).join(' / ') : q.kind) + ', or Not sure' + (q.when ? '; asked only when it applies' : '') + (q.max ? '; up to ' + q.max : '') + '). ' + q.does);
    L.push('');
  }
  L.push('## Level 2: in the session', '', 'Coach-guided. Opens only for what Level 1 ticked; listed on the Session\'s first screen ("To ask today").', '');
  for (const [area, label] of Object.entries(L2_AREAS)) {
    L.push('### ' + label, '');
    for (const q of LEVEL2.filter((x) => x.area === area)) L.push('- **' + q.label + '**' + (q.options ? ' (' + q.options.map((o) => o[1]).join(' / ') + ', or Not sure)' : ' (a number in My numbers' + (q.where ? '; find it in ' + WHERE_WORDS[q.where].replace(/^./, (c) => c.toLowerCase()) : '') + ')') + (q.does ? '. ' + q.does : '.'));
    L.push('');
  }
  L.push('## Level 3: homework', '',
    'Every Level 2 question has "I know it" (type it), "I\'ll look it up" (a to-do with where to find it) or "Not sure" (a',
    'rough default, listed in Still guessing). The to-dos print on the One-pager and in the Profile\'s To-dos, grouped by',
    'where to find each item:', '', ...Object.values(WHERE_WORDS).map((w) => '- ' + w), '',
    'Plus the last 2 statements for each card and bank account, as CSV.', '');
  return L.join('\n');
}
if (process.argv[1] && process.argv[1].endsWith('profile-doc.mjs')) writeFileSync(new URL('../docs/specs/profile-questions.md', import.meta.url), profileDoc());
