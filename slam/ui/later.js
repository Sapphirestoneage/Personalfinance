// Not now (S-194): a number you will come back to. It stays missing or rough (the numbers stay honest), but Still
// guessing stops asking until Ask me again, and onboarding's finish screen lists it. Kept per viewer in this browser,
// with the day it was set aside, keyed by the field's row in My numbers. Shared by My numbers and onboarding.

const LATER_KEY = 'slam-ledger-later:v1';
let later = (() => { try { return JSON.parse(localStorage.getItem(LATER_KEY)) || {}; } catch { return {}; } })();
const keep = () => { try { localStorage.setItem(LATER_KEY, JSON.stringify(later)); } catch { /* storage blocked: lasts until the page closes */ } };
const todayIso = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

// The day a field was set aside, or undefined.
export const laterDate = (path) => later[path];
export const isLaterPath = (path) => !!later[path];
// Set a field aside (on) or ask again (off); returns a function that puts it back the way it was.
export function setLaterPath(path, on) {
  const before = later[path];
  if (on) later[path] = todayIso(); else delete later[path];
  keep();
  return () => { if (before) later[path] = before; else delete later[path]; keep(); };
}
export const laterPaths = () => Object.keys(later);
