// Loading and saving the household for every page.
// Order: the household saved in this browser, then fixtures/eli.local.json (on
// this machine only, gitignored), then the made-up demo household. Every file
// goes through one loader (engine/normalize.js readHousehold, S-228): a field
// it cannot use is named for the Ledger, never a crash, and a household saved
// in this browser always opens, never the demo in its place.

import { fetchRules } from '../engine/rules.js';
import { readHousehold, fileProblems } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';
import { readProfile, setBaseline, fingerprint } from './profile-file.js';

const KEY = 'slam-spine:v1';
const base = new URL('../', import.meta.url);
const todayIso = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

// What this browser saved: { raw, value }, value undefined when the text is not JSON; null when nothing is saved.
function readSaved() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch { return null; }
  if (!raw) return null;
  try { return { raw, value: JSON.parse(raw) }; } catch { return { raw, value: undefined }; }
}

async function fetchJson(rel) {
  try {
    const r = await fetch(new URL(rel, base), { cache: 'no-store' });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

// What the file held that could not be used, in one line for the page (the Ledger page lists each).
const needWords = (spine) => { const n = fileProblems(spine).open.length; return n ? n + (n === 1 ? ' thing in your file could not be read, so it shows as missing. Fill it in' : ' things in your file could not be read, so they show as missing. Fill them in') + ' at the top of the Ledger page.' : null; };

export async function loadAll() {
  const [rules, institutions] = await Promise.all([fetchRules(new URL('data/', base)), fetchJson('data/institutions.json').then((x) => x || { names: [], aliases: {} })]);
  const saved = readSaved();
  let problem = null;
  if (saved) {
    // Edits saved by an earlier version, or with a field this version cannot use, are read, not dropped (S-167, S-228).
    try {
      if (saved.value === undefined) throw new Error('what this browser saved is not JSON');
      const { spine } = readHousehold(saved.value, { today: todayIso() });
      return { rules, institutions, spine: applyDefaults(spine, rules), source: 'saved', problem: needWords(spine) };
    } catch (err) {
      // Not a household at all: keep one copy under a key made from its text, so nothing is lost and opening the page
      // again does not copy it again, and say so. The details go to the console.
      console.warn('Saved household: ' + err.message);
      const copy = KEY + ':unreadable:' + fingerprint(saved.raw);
      try { if (localStorage.getItem(copy) === null) localStorage.setItem(copy, saved.raw); } catch { /* storage blocked */ }
      problem = 'What this browser saved could not be read. A copy is kept in this browser, so nothing is lost.';
    }
  }
  const local = await fetchJson('fixtures/eli.local.json');
  if (local) { try { const { spine } = readHousehold(local, { today: todayIso() }); return { rules, institutions, spine: applyDefaults(spine, rules), source: 'local', problem: problem || needWords(spine) }; } catch (err) { console.warn('Local file: ' + err.message); problem = (problem ? problem + ' ' : '') + 'Your file on this computer could not be read.'; } }
  return { rules, institutions, spine: applyDefaults(readHousehold(await fetchJson('fixtures/demo.json'), { today: todayIso() }).spine, rules), source: 'demo', problem };
}

export function save(spine) {
  try { localStorage.setItem(KEY, JSON.stringify(spine)); return true; } catch { return false; }
}

export function forgetSaved() {
  try { localStorage.removeItem(KEY); } catch { /* storage blocked: nothing saved */ }
}

// Load my file (S-228): the file the person picks is read here, in the browser, by the one loader; nothing is
// uploaded anywhere. It is saved in this browser only, so every page opens to it. Returns what loadAll returns, so a
// page reopens on it; when the browser will not keep it, it is open on this page only, and the page says so.
export async function loadMyFile(file, rules) {
  const { spine } = await readProfile(file, { today: todayIso() });
  const ready = applyDefaults(spine, rules);
  const stored = save(ready);
  if (stored) setBaseline(ready);
  const words = needWords(ready);
  return { spine: ready, source: stored ? 'saved' : 'file', problem: stored ? words : 'This browser did not keep ' + file.name + ', so it is open on this page only.' + (words ? ' ' + words : '') };
}

// Whose numbers these are (S-228): the made-up household is "Example household"; anything else is the person's.
// The person's name comes first, then the file's own name for the household.
export function whose(spine) {
  if (spine.meta && spine.meta.demo === true) return { example: true, name: 'Example household' };
  const person = ((spine.household && spine.household.people) || [])[0];
  const named = person && typeof person.name === 'string' && person.name.trim() ? person.name.trim() : null;
  const own = spine.meta && typeof spine.meta.name === 'string' && spine.meta.name.trim() && spine.meta.name !== 'Household' ? spine.meta.name.trim() : null;
  return { example: false, name: named || own || 'Your household' };
}

export const SOURCE_WORDS = {
  saved: 'Saved in this browser',
  local: 'Your file on this computer',
  file: 'Your file, open on this page only',
  demo: 'Example household (made up)'
};
