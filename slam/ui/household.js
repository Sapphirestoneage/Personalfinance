// Loading and saving the household for every page.
// Order: the household saved in this browser, then fixtures/eli.local.json (on
// this machine only, gitignored), then the made-up demo household. Every file
// goes through one loader (engine/normalize.js readHousehold, S-228): a field
// it cannot use is named for the Ledger, never a crash, and a household saved
// in this browser always opens, never the demo in its place.

import { fetchRules } from '../engine/rules.js';
import { readHousehold, fileProblems } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';
import { readProfile, setBaseline } from './profile-file.js';

const KEY = 'slam-spine:v1';
const base = new URL('../', import.meta.url);
const todayIso = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

function readSaved() {
  try { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}

async function fetchJson(rel) {
  try {
    const r = await fetch(new URL(rel, base), { cache: 'no-store' });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

// What the file held that could not be used, in one line for the page (the Ledger lists each).
const needWords = (spine) => { const n = fileProblems(spine).open.length; return n ? n + ' field' + (n === 1 ? '' : 's') + ' from the file could not be used and read missing: the Ledger lists ' + (n === 1 ? 'it' : 'them') + ' at the top.' : null; };

export async function loadAll() {
  const [rules, institutions] = await Promise.all([fetchRules(new URL('data/', base)), fetchJson('data/institutions.json').then((x) => x || { names: [], aliases: {} })]);
  const saved = readSaved();
  let problem = null;
  if (saved) {
    // Edits saved by an earlier version, or with a field this version cannot use, are read, not dropped (S-167, S-228).
    try {
      const { spine } = readHousehold(saved, { today: todayIso() });
      return { rules, institutions, spine: applyDefaults(spine, rules), source: 'saved', problem: needWords(spine) };
    } catch (err) {
      // Not a household at all: keep a copy under its own key so nothing is lost, and say so.
      try { localStorage.setItem(KEY + ':unreadable:' + new Date().toISOString(), JSON.stringify(saved)); } catch { /* storage blocked */ }
      problem = 'What this browser saved could not be read (' + err.message + '). A copy is kept in this browser; showing the file instead.';
    }
  }
  const local = await fetchJson('fixtures/eli.local.json');
  if (local) { try { const { spine } = readHousehold(local, { today: todayIso() }); return { rules, institutions, spine: applyDefaults(spine, rules), source: 'local', problem: problem || needWords(spine) }; } catch (err) { problem = (problem ? problem + ' ' : '') + 'fixtures/eli.local.json could not be read (' + err.message + ').'; } }
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
export function whose(spine) {
  if (spine.meta && spine.meta.demo === true) return { example: true, name: 'Example household' };
  const own = spine.meta && typeof spine.meta.name === 'string' && spine.meta.name.trim() && spine.meta.name !== 'Household' ? spine.meta.name.trim() : null;
  const person = ((spine.household && spine.household.people) || [])[0];
  return { example: false, name: own || (person && person.name) || 'Your household' };
}

export const SOURCE_WORDS = {
  saved: 'Saved in this browser',
  local: 'Your profile file (fixtures/eli.local.json)',
  file: 'Your file, open on this page only',
  demo: 'Example household (made up)'
};
