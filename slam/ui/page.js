// What every page shares (S-208): a skip link to the content, an error catcher
// that shows a banner instead of a silent failure, a one-line footer, and a polite live region for the page's headline. Formatting only.

import { clients, adopt, newClient, switchTo, renameClient, syncName, duplicateClient, deleteClient, showExample } from './clients.js';
import { showList } from './shortcuts.js';
import { h, ledgerHref, shortDate } from './view.js';
import { accountGaps } from '../engine/calendar-views.js';
import { whose, loadMyFile } from './household.js';
import { loadFailWords } from './profile-file.js';
import { pref } from './prefs.js';

let banner = null;
function showError(text) {
  const app = document.getElementById('app') || document.body;
  if (!banner) { banner = h('div', { class: 'error-banner', role: 'alert' }, h('strong', {}, 'Something went wrong. '), h('span', { class: 'error-text' }), ' ', h('button', { type: 'button', class: 'btn small', onclick: () => location.reload() }, 'Reload the page'), ' ', h('button', { type: 'button', class: 'btn ghost small', onclick: () => { banner.remove(); banner = null; } }, 'Hide')); app.parentNode.insertBefore(banner, app); }
  banner.querySelector('.error-text').textContent = String(text || 'an error with no message');
}

// The Builder link; on the Builder itself it is where you are, so it is plain words, not a link to the same screen.
// Client view (Preferences) hides it.
const builderLink = () => (pref('view') === 'client' ? null : /\/builder\.html$/.test(location.pathname) ? h('span', { class: 'builder-link', 'aria-current': 'page' }, 'Builder') : h('a', { class: 'builder-link', href: 'builder.html' }, 'Builder'));

// Call once at the top of a page's script (the shell, ui/shell.js, calls it for its pages). Adds the skip link before
// the app, the footer line and the one small Builder link after it (S-230: the Design kit, All formulas and Rules live
// there, out of the tabs), and the catcher.
export function mountPage({ app }) {
  // Looked for beside the app, not inside it: the Design kit shows samples of both.
  if (!app.parentNode.querySelector(':scope > .skip')) app.parentNode.insertBefore(h('a', { class: 'skip', href: '#app' }, 'Skip to the content'), app);
  if (!app.parentNode.querySelector(':scope > .build-stamp')) app.parentNode.appendChild(h('footer', { class: 'build-stamp' }, h('span', {}, 'Your numbers stay in this browser.'), ' ', builderLink(), ' ', h('button', { type: 'button', class: 'btn small ghost keys-btn', onclick: showList }, 'Keyboard shortcuts')));
  window.addEventListener('error', (e) => showError(e.message || (e.error && e.error.message)));
  window.addEventListener('unhandledrejection', (e) => showError(e.reason && e.reason.message ? e.reason.message : e.reason));
  return { showError };
}

// A headline that screen readers announce when it changes.
export const liveHeadline = (text) => h('p', { class: 'headline', 'aria-live': 'polite' }, text);

// No cash account with a balance, or some without one (S-209): said once at the top, with the field to fill.
export function gapsCard(spine, sim) {
  // A month before the as-of date has no run; that is not a missing account.
  if (!sim) return null;
  const g = accountGaps(spine, sim);
  if (g.none) return h('section', { class: 'card', 'aria-labelledby': 'gaps-h' }, h('h2', { id: 'gaps-h' }, 'No cash by day yet'),
    h('p', {}, 'Add a checking account and its balance to see cash by day. Nothing is guessed, so until then the days show no balance.'),
    h('div', { class: 'edit-actions' }, h('a', { class: 'btn primary', href: g.fix ? ledgerHref(g.fix) : 'ledger.html' }, g.fix ? 'Add the balance' : 'Add an account')));
  if (!g.checking) return h('section', { class: 'card', 'aria-labelledby': 'gaps-h' }, h('h2', { id: 'gaps-h' }, g.noChecking ? 'No checking account yet' : 'Checking has no balance yet'),
    h('p', {}, 'Cash by day, safe to spend and the lowest point all read checking, so they wait for ' + (g.noChecking ? 'a checking account and its balance' : 'its balance') + '. Savings and other accounts are not counted in its place.'),
    g.missing.length ? h('p', { class: 'muted missing-row' }, 'No balance for ', ...g.missing.flatMap((m, i) => [i ? ', ' : '', h('a', { href: ledgerHref(m.path) }, m.name)]), '.') : null,
    h('div', { class: 'edit-actions' }, h('a', { class: 'btn primary', href: g.fix ? ledgerHref(g.fix) : 'ledger.html' }, g.noChecking ? 'Add a checking account' : 'Add the balance')));
  if (!g.missing.length) return null;
  return h('p', { class: 'muted missing-row' }, 'No balance for ', ...g.missing.flatMap((m, i) => [i ? ', ' : '', h('a', { href: ledgerHref(m.path) }, m.name)]), ', so ' + (g.missing.length === 1 ? 'it is' : 'they are') + ' left out of the cash line.');
}

// Whose numbers (S-228): every page's header says whose numbers these are, as a person icon and the name, which opens
// Profile. The made-up household reads "Example household"; Open file is on the Builder.
// A person icon, drawn as an outline in the text color.
const icon = () => {
  const NS = 'http://www.w3.org/2000/svg', el = (tag, at) => { const x = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(at)) x.setAttribute(k, v); return x; };
  const svg = el('svg', { viewBox: '0 0 24 24', width: '18', height: '18', 'aria-hidden': 'true', focusable: 'false', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' });
  svg.append(el('circle', { cx: '12', cy: '8', r: '4' }), el('path', { d: 'M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7' }));
  return h('span', { class: 'whose-icon' }, svg);
};
// The client switcher (practical run, S-269; was the name menu): the client's name always in the header; it opens the
// list of clients to switch to, New client, Rename, Duplicate, Delete (asked first, with Undo), the example, Profile
// and Open file. A switch reloads the page on the other household. rename(name) renames through the page's change().
export function whoseMenu(spine, { rules, reopen, rename = null, asOf = spine.meta.asOf } = {}) {
  const w = whose(spine), reg = w.example ? clients() : adopt(w.name), at = reg.list.find((c) => c.id === reg.current) || null;
  if (at && !w.example && at.name !== w.name) syncName(w.name);
  const input = h('input', { type: 'file', accept: '.json,application/json', hidden: true, 'aria-label': 'A household backup file' });
  const msg = h('p', { class: 'edit-msg', role: 'status' });
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    try { const loaded = await loadMyFile(file, rules); reopen({ rules, ...loaded }); } catch (err) { console.warn(err); msg.textContent = loadFailWords(err, file.name); }
  });
  const reload = () => location.reload();
  const nameBox = h('input', { type: 'text', id: 'client-name', autocomplete: 'off', placeholder: 'e.g. Maya Lopez', 'aria-describedby': 'client-name-hint' });
  const create = (e) => { e.preventDefault(); const nm = nameBox.value.trim(); if (!nm) { msg.textContent = 'Type the client\'s name first'; nameBox.focus(); return; } newClient(nm); location.assign('session.html'); };
  const newForm = h('form', { class: 'client-new', hidden: true, novalidate: true, onsubmit: create },
    h('label', { for: 'client-name', class: 'edit-label' }, 'New client'), nameBox, h('p', { class: 'edit-hint', id: 'client-name-hint' }, 'Starts empty, kept only in this browser.'),
    h('div', { class: 'edit-actions' }, h('button', { type: 'submit', id: 'client-create', class: 'btn primary small' }, 'Create'), h('button', { type: 'button', class: 'btn small', onclick: () => { newForm.hidden = true; } }, 'Cancel')));
  const renameBox = h('input', { type: 'text', id: 'client-rename', autocomplete: 'off', value: w.example ? '' : w.name, 'aria-label': 'New name' });
  const renameForm = h('form', { class: 'client-new', hidden: true, novalidate: true, onsubmit: (e) => { e.preventDefault(); const nm = renameBox.value.trim(); if (!nm || !at) return; renameClient(at.id, nm); if (rename) rename(nm); } },
    h('label', { for: 'client-rename', class: 'edit-label' }, 'Rename'), renameBox, h('div', { class: 'edit-actions' }, h('button', { type: 'submit', class: 'btn primary small' }, 'Rename')));
  const others = reg.list.filter((c) => c.id !== reg.current);
  return h('details', { class: 'whose-menu' },
    h('summary', { class: 'btn small whose-name', id: 'client-switch', 'aria-label': 'Client: ' + w.name + '. Switch or add a client' }, icon(), h('span', { class: 'whose-text' }, w.name), h('span', { 'aria-hidden': 'true' }, ' \u25BE')),
    h('div', { class: 'whose-items' },
      h('p', { class: 'whose-full' }, h('strong', {}, w.name)),
      h('p', { class: 'muted' }, (w.example ? 'Made up, to try the app. ' : '') + 'Numbers as of ' + shortDate(asOf) + '. Kept in this browser.'),
      others.length ? h('ul', { class: 'client-list', 'aria-label': 'Switch to' }, others.map((c) => h('li', {}, h('button', { type: 'button', class: 'btn small client-pick', onclick: () => { if (switchTo(c.id)) reload(); } }, c.name)))) : null,
      h('button', { type: 'button', id: 'client-new', class: 'btn small', onclick: () => { newForm.hidden = false; nameBox.focus(); } }, '+ New client'), newForm,
      at ? h('div', { class: 'client-actions' },
        h('button', { type: 'button', class: 'btn small', onclick: () => { renameForm.hidden = false; renameBox.focus(); renameBox.select(); } }, 'Rename'),
        h('button', { type: 'button', class: 'btn small', onclick: () => { if (duplicateClient()) reload(); } }, 'Duplicate'),
        h('button', { type: 'button', class: 'btn small danger', onclick: () => { if (confirm('Delete ' + at.name + ' from this browser? You can undo it right after.')) { deleteClient(at.id); reload(); } } }, 'Delete')) : null,
      renameForm,
      reg.current ? h('button', { type: 'button', class: 'btn small', onclick: () => { showExample(); reload(); } }, 'Show the example household') : null,
      h('a', { class: 'btn small', href: 'profile.html' }, 'Profile'),
      h('button', { type: 'button', class: 'btn small', onclick: () => input.click() }, 'Open a backup file'), input, msg));
}
