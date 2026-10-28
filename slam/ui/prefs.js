// Preferences (layer 13): how this browser shows the app. The list lives in data/preferences.json (one line each);
// this module reads it, keeps the choices in this browser, and applies the ones every page shares (theme, text size,
// hidden numbers). Tone is saved on the client (spine.profile.tone), so it goes through the Profile's own answer.

const KEY = 'slam-prefs:v1';
let LIST = [];
try { const r = await fetch(new URL('../data/preferences.json', import.meta.url), { cache: 'no-store' }); if (r.ok) LIST = (await r.json()).prefs || []; } catch { /* no list: every preference reads its default */ }
export const PREFS = LIST;
export const prefDef = (id) => LIST.find((p) => p.id === id) || null;

function stored() {
  try { const o = JSON.parse(localStorage.getItem(KEY) || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch { return {}; }
}
// Every preference with its value: the one chosen in this browser, else its default.
export function prefs() {
  const own = stored(), out = {};
  for (const p of LIST) out[p.id] = own[p.id] !== undefined ? own[p.id] : p.default;
  return { ...own, ...out };
}
export const pref = (id) => prefs()[id];
export function keepPref(id, value) {
  try { const o = { ...stored(), [id]: value }; localStorage.setItem(KEY, JSON.stringify(o)); applyPrefs(); return true; } catch { return false; }
}

// Theme, text size and hidden numbers, on the page itself. Called once by every page and again after a change.
let tapWired = false;
export function applyPrefs(doc = typeof document !== 'undefined' ? document : null) {
  if (!doc) return;
  const p = prefs(), root = doc.documentElement;
  if (p.theme === 'light' || p.theme === 'dark') root.dataset.theme = p.theme; else delete root.dataset.theme;
  root.classList.toggle('text-larger', p.textSize === 'larger');
  root.classList.toggle('discreet', p.hide === 'on');
  root.classList.toggle('client-view', p.view === 'client');
  // Hidden numbers: a tap shows that one amount until the next tap elsewhere.
  if (!tapWired) {
    tapWired = true;
    doc.addEventListener('click', (e) => {
      if (!root.classList.contains('discreet')) return;
      const hit = e.target.closest && e.target.closest(DISCREET);
      // A tile is one link: a tap anywhere on a blurred tile shows its number first.
      const card = !hit && e.target.closest ? e.target.closest('a, button') : null;
      const el = hit || (card && card.querySelector(DISCREET + ':not(.is-shown)')) || null;
      for (const x of doc.querySelectorAll('.is-shown')) if (x !== el) x.classList.remove('is-shown');
      // The first tap on a blurred amount shows it, even inside a link or button; the next tap follows it.
      if (el && !el.classList.contains('is-shown')) { el.classList.add('is-shown'); e.preventDefault(); e.stopPropagation(); }
    }, true);
  }
}
// What blurs in hidden-numbers mode: every amount on a summary.
export const DISCREET = '.tile-value, .go-total, .as-value, .math-value, .fb-amt, .fv-amt, .charge-amt, .wait-amt, .num, .safe-big, .srow-val, .tile-sub, .flag-line, .sum-line';
