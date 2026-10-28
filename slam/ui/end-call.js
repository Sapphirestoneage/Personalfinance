// End call (practical run, S-269): one screen at the end of a Session. Opening it saves a dated backup of this client's
// household (a download, every time), shows the one-pager to print or save, and splits what is still open into the
// client's to-dos and the coach's.

import { h, ledgerHref } from './view.js';
import { saveFile } from './save-file.js';
import { whose } from './household.js';
import { slugOf } from '../engine/blank.js';
import { openQuestions } from '../engine/questions.js';
import { homeworkList } from '../engine/profile.js';
import { tickTodos } from '../engine/features.js';
import { getAt, whoSupplies } from '../engine/spine.js';

// The open items, split: [{ who: 'client' | 'coach', words, path }]. A missing number is the client's to look up; a guess
// from a house default or a typical amount is the coach's to look up or keep; the type ticks say whose by supplier.
export function endCallTodos(spine, ranking, catalog) {
  const out = [];
  for (const q of openQuestions(spine, ranking) || []) {
    const f = getAt(spine, q.path), by = whoSupplies(f);
    out.push({ who: q.kind === 'missing' && by !== 'default' && by !== 'lookedUp' ? 'client' : 'coach', words: q.label + (q.kind === 'missing' ? ': not given yet' : ': a guess, worth checking'), path: q.row || q.path });
  }
  for (const g of homeworkList(spine, spine.meta.asOf)) for (const x of g.items) out.push({ who: 'client', words: x + ' (' + g.where + ')', path: null });
  if (catalog) for (const t of tickTodos(catalog, spine)) if (!out.some((o) => o.path === t.path)) out.push(t);
  return out;
}

// The backup: "maya-lopez-2026-10-27.json", the whole household as it stands; null where this window can't save files.
export function downloadBackup(spine, today) {
  const name = slugOf(whose(spine).name) + '-' + today + '.json';
  return saveFile(name, JSON.stringify(spine, null, 2) + '\n') === 'saved' ? name : null;
}

let savedFor = null;
export function endCallScreen(spine, ranking, catalog, today) {
  // Once per visit to this screen: a redraw (Undo, a late ranking) does not download it again.
  const file = savedFor && savedFor.spine === spine ? savedFor.file : downloadBackup(spine, today);
  savedFor = { spine, file };
  const todos = endCallTodos(spine, ranking, catalog), mine = todos.filter((t) => t.who === 'coach'), theirs = todos.filter((t) => t.who === 'client');
  const list = (xs, none) => (xs.length ? h('ul', { class: 'todo-list' }, xs.map((t) => h('li', {}, t.path ? h('a', { href: ledgerHref(t.path) }, t.words) : t.words))) : h('p', { class: 'muted' }, none));
  return [
    h('section', { class: 'card', 'aria-labelledby': 'ec-h' }, h('h2', { id: 'ec-h' }, 'End of the call'),
      file ? h('p', {}, 'A backup of ' + whose(spine).name + '\'s numbers was saved to your downloads as ', h('strong', {}, file), '.')
        : h('p', {}, 'This window can\'t save files, so no backup was saved here. The numbers stay in this browser; open SLAM in its own tab to save a backup.'),
      h('div', { class: 'edit-actions' },
        h('a', { class: 'btn primary', id: 'ec-print', href: 'onepager.html' }, 'Print or save the one-pager'),
        h('button', { type: 'button', class: 'btn', onclick: () => { savedFor = { spine, file: downloadBackup(spine, today) }; } }, 'Save another backup'))),
    h('section', { class: 'card', 'aria-labelledby': 'ec-you' }, h('h2', { id: 'ec-you' }, 'Your to-dos (' + theirs.length + ')'),
      h('p', { class: 'muted' }, 'Numbers to send or look up on a statement before we talk again.'), list(theirs, 'Nothing to look up.')),
    h('section', { class: 'card coach-only', 'aria-labelledby': 'ec-me' }, h('h2', { id: 'ec-me' }, 'Coach to-dos (' + mine.length + ')'),
      h('p', { class: 'muted' }, 'Guesses to look up or keep, and what you can find without the client.'), list(mine, 'Nothing left for you.'))
  ];
}
