// What every page shares (S-208): a skip link to the content, an error catcher
// that shows a banner instead of a silent failure, the build stamp in the
// footer, and a polite live region for the page's headline. Formatting only.

import { h } from './view.js';

// The build stamp: moved by hand with each batch (no build step).
export const BUILD = { label: 'Phase 2, Batch F', date: '2026-10-23' };

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
