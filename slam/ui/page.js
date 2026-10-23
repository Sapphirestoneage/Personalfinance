// What every page shares (S-208): a skip link to the content, an error catcher
// that shows a banner instead of a silent failure, the build stamp in the
// footer, and a polite live region for the page's headline. Formatting only.

import { h, ledgerHref } from './view.js';
import { accountGaps } from '../engine/calendar-views.js';

// The build stamp: moved by hand with each batch (no build step).
export const BUILD = { label: 'Phase 2, Batch G', date: '2026-10-23' };

let banner = null;
function showError(text) {
  const app = document.getElementById('app') || document.body;
  if (!banner) { banner = h('div', { class: 'error-banner', role: 'alert' }, h('strong', {}, 'Something went wrong. '), h('span', { class: 'error-text' }), ' ', h('button', { type: 'button', class: 'btn small', onclick: () => location.reload() }, 'Reload the page'), ' ', h('button', { type: 'button', class: 'btn ghost small', onclick: () => { banner.remove(); banner = null; } }, 'Hide')); app.parentNode.insertBefore(banner, app); }
  banner.querySelector('.error-text').textContent = String(text || 'an error with no message');
}

// Call once at the top of a page's script. Adds the skip link before the app, the stamp after it, and the catcher.
export function mountPage({ app }) {
  if (!document.querySelector('.skip')) app.parentNode.insertBefore(h('a', { class: 'skip', href: '#app' }, 'Skip to the content'), app);
  if (!document.querySelector('.build-stamp')) app.parentNode.appendChild(h('footer', { class: 'build-stamp' }, 'SLAM ' + BUILD.label + ', ' + BUILD.date + '. Numbers are yours; nothing leaves this browser.'));
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
  if (!g.checking) return h('section', { class: 'card', 'aria-labelledby': 'gaps-h' }, h('h2', { id: 'gaps-h' }, 'Checking has no balance yet'),
    h('p', {}, 'Cash by day, safe to spend and the lowest point all read checking, so they wait for its balance. Other accounts are not counted in its place.'),
    g.missing.length ? h('p', { class: 'muted missing-row' }, 'No balance for ', ...g.missing.flatMap((m, i) => [i ? ', ' : '', h('a', { href: ledgerHref(m.path) }, m.name)]), '.') : null,
    h('div', { class: 'edit-actions' }, h('a', { class: 'btn primary', href: g.fix ? ledgerHref(g.fix) : 'ledger.html' }, 'Add the balance')));
  if (!g.missing.length) return null;
  return h('p', { class: 'muted missing-row' }, 'No balance for ', ...g.missing.flatMap((m, i) => [i ? ', ' : '', h('a', { href: ledgerHref(m.path) }, m.name)]), ', so ' + (g.missing.length === 1 ? 'it is' : 'they are') + ' left out of the cash line.');
}
