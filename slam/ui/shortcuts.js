// Keyboard shortcuts (overnight Track J), on every page with the shell. None fire while typing in a box.
//   g then t, s, m, c, b or p   go to Today, Session, My numbers, Calendar, Spending (b for budget) or Plan
//   g then o                    open the Profile
//   n                           add (the screen's add button), if it has one
//   / or Ctrl/Cmd+K             find, or type a change (ui/search.js)
//   z, Shift+Z                  undo, redo (Ctrl/Cmd+Z works too, and in a box undoes the typing)
//   ?                           this list
// Formatting only.

import { h } from './view.js';

export const SHORTCUTS = [
  ['g t', 'Today'], ['g s', 'Session'], ['g m', 'My numbers'], ['g c', 'Calendar'], ['g b', 'Spending (the budget)'], ['g p', 'Plan'], ['g o', 'Profile'],
  ['n', 'Add something on this screen'], ['/', 'Find, or type a change'], ['Ctrl K', 'Find, or type a change, even in a box'],
  ['z', 'Undo'], ['Shift Z', 'Redo'], ['?', 'This list'], ['Esc', 'Close a box or this list']
];
const GO = { t: 'dashboard.html', s: 'session.html', m: 'ledger.html', c: 'calendar.html', b: 'spending.html', p: 'plan.html', o: 'profile.html' };

let dialog = null;
export function showList() {
  if (!dialog) {
    dialog = h('dialog', { class: 'keys-dialog', 'aria-labelledby': 'keys-h' },
      h('h2', { id: 'keys-h' }, 'Keyboard shortcuts'),
      h('table', { class: 'data-table keys-table' }, h('tbody', {}, SHORTCUTS.map(([k, w]) => h('tr', {}, h('td', {}, k.split(' ').map((x, i) => [i ? (k.startsWith('g ') ? ' then ' : ' + ') : null, h('kbd', {}, x)])), h('td', {}, w))))),
      h('div', { class: 'edit-actions' }, h('button', { type: 'button', class: 'btn primary', onclick: () => dialog.close() }, 'Close')));
    document.body.append(dialog);
  }
  if (!dialog.open) dialog.showModal();
}
// The screen's add button: "+ Add ...", "Add ..." (a button or a link), the first one showing.
function addButton() {
  const all = [...document.querySelectorAll('#app button, #app a.btn, #app summary.btn')];
  return all.find((b) => /^\+?\s*Add\b/i.test((b.textContent || '').trim()) && !b.disabled && b.offsetParent !== null) || null;
}

export function installShortcuts({ undo, redo, typing, say }) {
  let pendingG = 0;
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
    if (dialog && dialog.open) return;
    const k = e.key;
    if (pendingG && Date.now() - pendingG < 1500) {
      pendingG = 0;
      const href = GO[k.toLowerCase()];
      if (href) { e.preventDefault(); location.href = href; }
      return;
    }
    if (k === 'g') { pendingG = Date.now(); return; }
    if (k === '?') { e.preventDefault(); showList(); return; }
    if (k === 'n') { const b = addButton(); e.preventDefault(); if (b) b.click(); else say('Nothing to add on this screen'); return; }
    if (k === 'z') { e.preventDefault(); undo(); return; }
    if (k === 'Z') { e.preventDefault(); redo(); }
  });
}
