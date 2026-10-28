// End call (practical run, S-269): one screen at the end of a Session. Opening it saves a dated backup of this client's
// household (a download, every time), shows the one-pager to print or save, and splits what is still open into the
// client's to-dos and the coach's.

import { h, ledgerHref, money, pct } from './view.js';
import { summarize } from '../engine/summary.js';
import { fiMovers } from '../engine/story.js';
import { labelFor } from '../engine/labels.js';
import { callStart } from './clients.js';
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
    out.push({ who: q.kind === 'missing' && by !== 'default' && by !== 'lookedUp' ? 'client' : 'coach', words: q.label + (q.kind === 'missing' ? ': not given yet' : ': a guess to answer'), path: q.row || q.path });
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
// The reveal (S-286): End call opens on the FI date, large, and the three changes made since the call started that
// moved it most. The weighing runs after the screen is up (each change is put back alone and the date figured again).
// Whole years on screen, as the strip says them (the tenth lives in Show the math); under a year, months.
const yearsWords = (y) => { const n = Math.abs(y), r = n >= 1 ? Math.round(n) + (Math.round(n) === 1 ? ' year' : ' years') : Math.round(n * 12) + (Math.round(n * 12) === 1 ? ' month' : ' months'); return r; };
const valWords = (x) => (typeof x !== 'number' ? String(x) : Math.abs(x) < 1 && x !== 0 ? pct(x, 1) : money(x));
const itemName = (spine, path) => { const [c, id] = path.split('.'), x = (spine[c] || []).find((i) => i.id === id) || {}; return (x.name && typeof x.name === 'object' ? x.name.value : x.name) || x.label || id; };
export function fiReveal(spine, rules) {
  const s = summarize(spine, rules, { flags: false }), y = s.fi.yearsToFi.value;
  const year = y === null ? null : +spine.meta.asOf.slice(0, 4) + Math.round(y);
  const list = h('ol', { class: 'reveal-movers' }, h('li', { class: 'muted' }, 'Working out what moved it...'));
  const start = callStart();
  const card = h('section', { class: 'card reveal', 'aria-labelledby': 'rv-h' },
    h('h2', { id: 'rv-h', class: 'reveal-label' }, 'Free to stop working'),
    h('p', { class: 'reveal-year' }, year === null ? 'Not at this pace' : String(year)),
    y !== null ? h('p', { class: 'reveal-sub' }, (s.fi.yearsToFi.kind === 'rough' ? 'About ' : '') + yearsWords(y) + ' from now') : null,
    start ? [h('h3', {}, 'What moved it most today'), list] : null);
  if (start) setTimeout(() => {
    let r;
    try { r = fiMovers(start, spine, rules); } catch { list.replaceChildren(h('li', { class: 'muted' }, 'Could not work it out this time.')); return; }
    if (!r.movers.length) { list.replaceChildren(h('li', { class: 'muted' }, 'Nothing changed today moved the date.')); return; }
    list.replaceChildren(...r.movers.map((m) => h('li', {},
      h('span', { class: 'mover-what' }, m.added ? 'Added ' + itemName(spine, m.path) : labelFor(spine, m.path) + ', ' + valWords(m.from) + ' to ' + valWords(m.to)),
      h('span', { class: 'mover-years ' + (m.years > 0 ? 'is-sooner' : 'is-later') }, yearsWords(m.years) + (m.years > 0 ? ' sooner' : ' later')))));
  }, 30);
  return card;
}

export function endCallScreen(spine, ranking, catalog, today) {
  // Once per visit to this screen: a redraw (Undo, a late ranking) does not download it again.
  const file = savedFor && savedFor.spine === spine ? savedFor.file : downloadBackup(spine, today);
  savedFor = { spine, file };
  const todos = endCallTodos(spine, ranking, catalog), mine = todos.filter((t) => t.who === 'coach'), theirs = todos.filter((t) => t.who === 'client');
  const list = (xs, none) => (xs.length ? h('ul', { class: 'todo-list' }, xs.map((t) => h('li', {}, t.path ? h('a', { href: ledgerHref(t.path) }, t.words) : t.words))) : h('p', { class: 'muted' }, none));
  return [
    h('section', { class: 'card', 'aria-labelledby': 'ec-h' }, h('h2', { id: 'ec-h' }, 'Save and print'),
      file ? h('p', {}, 'A backup of ' + whose(spine).name + '\'s numbers was saved to your downloads as ', h('strong', {}, file), '.')
        : h('p', {}, 'This window can\'t save files, so no backup was saved here. The numbers stay in this browser; open SLAM in its own tab to save a backup.'),
      h('div', { class: 'edit-actions' },
        h('a', { class: 'btn primary', id: 'ec-print', href: 'onepager.html' }, 'Print or save the one-pager'),
        h('button', { type: 'button', class: 'btn', onclick: () => { savedFor = { spine, file: downloadBackup(spine, today) }; } }, 'Download a backup'))),
    h('section', { class: 'card', 'aria-labelledby': 'ec-you' }, h('h2', { id: 'ec-you' }, 'Your to-dos (' + theirs.length + ')'),
      h('p', { class: 'muted' }, 'Things to tell us or look up before we talk again.'), list(theirs, 'Nothing to look up.')),
    h('section', { class: 'card coach-only', 'aria-labelledby': 'ec-me' }, h('h2', { id: 'ec-me' }, 'Coach to-dos (' + mine.length + ')'),
      h('p', { class: 'muted' }, 'Guesses to look up or keep, and what you can find without the client.'), list(mine, 'Nothing left for you.'))
  ];
}
