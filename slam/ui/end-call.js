// End call (practical run, S-269): one screen at the end of a Session. Opening it saves a dated backup of this client's
// household (a download, every time), shows the one-pager to print or save, and splits what is still open into the
// client's to-dos and the coach's.

import { h, ledgerHref, shortDate } from './view.js';
import { fiPoint, fiMove, movers, moveWords } from '../engine/reveal.js';
import { fiWords } from './future.js';
import { currentClient } from './clients.js';
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

// The big reveal (S-286): the FI date, large, how far it moved since the last call, and the three changes that moved
// it most this call (the household's last 25 changes, each with the FI date before and after). The last call's date is
// kept per client in this browser: { prev, last }, each { date, ym, years }; opening End call on a new day moves last
// to prev, so the comparison is always with the call before this one.
const CALL_KEY = 'slam-last-call:v1';
function callNotes() { try { const o = JSON.parse(localStorage.getItem(CALL_KEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch { return {}; } }
export function noteCall(clientId, point, today, notes = callNotes(), keep = (o) => { try { localStorage.setItem(CALL_KEY, JSON.stringify(o)); } catch { /* lasts until the page closes */ } }) {
  const mine = notes[clientId] || { prev: null, last: null };
  if (mine.last && mine.last.date !== today) mine.prev = mine.last;
  mine.last = { date: today, ym: point.ym, years: point.years };
  keep({ ...notes, [clientId]: mine });
  return mine.prev;
}
// The movers take a moment (a projection per change): figured once per history, kept across redraws of the screen.
let moversMemo = { past: null, spine: null, top: [] };
export function revealCard(spine, rules, past, today) {
  if (!rules) return null;
  let point;
  try { point = fiPoint(spine, rules); } catch { return null; }
  const prev = noteCall((currentClient() || {}).id || 'example', point, today);
  const since = prev ? fiMove(prev, point) : null;
  if (moversMemo.past !== past || moversMemo.spine !== spine) moversMemo = { past, spine, top: movers(past || [], spine, rules, 3) };
  const top = moversMemo.top;
  return h('section', { class: 'card reveal', 'aria-labelledby': 'rv-h' },
    h('h2', { id: 'rv-h' }, 'When you can stop working'),
    h('p', { class: 'reveal-big' }, fiWords(point).replace(/^about /, 'About ').replace(/^now$/, 'Now').replace(/^not/, 'Not')),
    prev ? h('p', { class: 'reveal-since' }, 'Since our last call on ' + shortDate(prev.date) + ': ' + (since ? moveWords(since) : 'the same date')) : h('p', { class: 'reveal-since' }, 'Our first call: this is the starting line.'),
    top.length ? [h('h3', {}, 'What moved it most this call'), h('ol', { class: 'reveal-movers' }, top.map((m) => h('li', {}, h('span', {}, m.label), ': ', h('strong', {}, moveWords(m.move)))))] : h('p', { class: 'muted' }, 'Nothing moved the date this call.'));
}

let savedFor = null;
export function endCallScreen(spine, ranking, catalog, today, { rules = null, past = [] } = {}) {
  // Once per visit to this screen: a redraw (Undo, a late ranking) does not download it again.
  const file = savedFor && savedFor.spine === spine ? savedFor.file : downloadBackup(spine, today);
  savedFor = { spine, file };
  const todos = endCallTodos(spine, ranking, catalog), mine = todos.filter((t) => t.who === 'coach'), theirs = todos.filter((t) => t.who === 'client');
  const list = (xs, none) => (xs.length ? h('ul', { class: 'todo-list' }, xs.map((t) => h('li', {}, t.path ? h('a', { href: ledgerHref(t.path) }, t.words) : t.words))) : h('p', { class: 'muted' }, none));
  return [
    revealCard(spine, rules, past, today),
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
