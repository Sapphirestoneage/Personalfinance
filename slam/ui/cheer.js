// Celebrations, warm but calm (Part 7, S-286): one line with a check and a short glow, at the top of the screen, gone
// after a few seconds. No confetti, no sound, no game feel. Shown for the real milestones engine/cheers.js finds (a debt
// paid off, a goal reached, a cushion step reached, a headline number unlocked); the strip glows once with it.
// Formatting only.

import { h } from './view.js';

let el = null, timer = null, stripTimer = null;
// lines: [{ words }] from engine/cheers.js reached().
export function cheer(lines) {
  if (!lines || !lines.length || typeof document === 'undefined') return;
  if (!el) { el = h('div', { class: 'cheer', role: 'status', 'aria-live': 'polite' }); document.body.append(el); }
  el.replaceChildren(h('span', { class: 'cheer-mark', 'aria-hidden': 'true' }, '✓'), h('span', { class: 'cheer-words' }, lines.map((x) => x.words).join('. ')));
  el.classList.remove('is-on');
  void el.offsetWidth; // restart the glow when a second line lands
  el.classList.add('is-on');
  clearTimeout(timer);
  timer = setTimeout(() => el.classList.remove('is-on'), 4500);
  const strip = document.querySelector('.headline-strip');
  if (strip) { strip.classList.remove('is-glow'); void strip.offsetWidth; strip.classList.add('is-glow'); clearTimeout(stripTimer); stripTimer = setTimeout(() => strip.classList.remove('is-glow'), 1500); }
}
