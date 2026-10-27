// Loading and saving the household for every page.
// Order: the household saved in this browser, then fixtures/eli.local.json (on
// this machine only, gitignored, and only on localhost with ?local=1), then the made-up demo household. Every file
// goes through one loader (engine/normalize.js readHousehold, S-228): a field
// it cannot use is named for the Ledger, never a crash, and a household saved
// in this browser always opens, never the demo in its place.

import { fetchRules } from '../engine/rules.js';
import { readHousehold, fileProblems } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';
import { createHistory } from '../engine/edits.js';
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

export async function fetchJson(rel) {
  try {
    const r = await fetch(new URL(rel, base), { cache: 'no-store' });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

// What the file held that could not be used, in one line for the page (the Ledger page lists each).
const needWords = (spine) => { const n = fileProblems(spine).open.length; return n ? n + (n === 1 ? ' thing in your file could not be read, so it shows as missing. Fill it in' : ' things in your file could not be read, so they show as missing. Fill them in') + ' at the top of My numbers.' : null; };

// Rules changed in this browser on the Builder's Rules page (S-230): { <year>: { <id>: {...} } }, laid over the
// rules files by the one loader every page calls (loadRules, through loadAll).
const RULES_KEY = 'slam-rules:v1';
export function ruleOverrides() {
  try { const o = JSON.parse(localStorage.getItem(RULES_KEY) || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch { return {}; }
}
export function keepRuleOverrides(o) {
  try { if (o && Object.values(o).some((y) => y && Object.keys(y).length)) localStorage.setItem(RULES_KEY, JSON.stringify(o)); else localStorage.removeItem(RULES_KEY); return true; } catch { return false; }
}
export const loadRules = () => fetchRules(new URL('data/', base), [2026], ruleOverrides());
export const rulesFile = (year = 2026) => fetchJson('data/rules-' + year + '.json');
export const houseFile = () => fetchJson('data/house-defaults.json');

// The file on this computer is looked for only on localhost with ?local=1: never on the published site or the
// artifact, so no page asks for a file that is not there.
const LOCAL_KEY = 'slam-local:v1';
export function lookForLocalFile(loc = typeof location !== 'undefined' ? location : null) {
  if (!loc) return false;
  if (!/^(localhost|127\.0\.0\.1|\[::1\])$/.test(loc.hostname)) return false;
  // Asked once, remembered for this browser tab, so moving between the tabs keeps the file.
  const asked = new URLSearchParams(loc.search).get('local') === '1';
  try { if (asked) sessionStorage.setItem(LOCAL_KEY, '1'); return asked || sessionStorage.getItem(LOCAL_KEY) === '1'; } catch { return asked; }
}

export async function loadAll() {
  const [rules, institutions] = await Promise.all([loadRules(), fetchJson('data/institutions.json').then((x) => x || { names: [], aliases: {} })]);
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
  const local = lookForLocalFile() ? await fetchJson('fixtures/eli.local.json') : null;
  if (local) { try { const { spine } = readHousehold(local, { today: todayIso() }); return { rules, institutions, spine: applyDefaults(spine, rules), source: 'local', problem: problem || needWords(spine) }; } catch (err) { console.warn('Local file: ' + err.message); problem = (problem ? problem + ' ' : '') + 'Your file on this computer could not be read.'; } }
  return { rules, institutions, spine: applyDefaults(readHousehold(await fetchJson('fixtures/demo.json'), { today: todayIso() }).spine, rules), source: 'demo', problem };
}

export function save(spine) {
  try { localStorage.setItem(KEY, JSON.stringify(spine)); return true; } catch { return false; }
}

// Going back to the file or the example is a different household: its history goes too.
export function forgetSaved() {
  try { localStorage.removeItem(KEY); } catch { /* storage blocked: nothing saved */ }
  clearHistory();
}

// The household history every page shares (S-230): the last 25 changes, kept in this browser beside the household,
// so Undo and Redo work on any page, in any tab and after a reload. It belongs to the household saved with it (a
// fingerprint of that text): when the saved household is not the one it was kept for, a page starts a fresh one.
// Loading a different household (Open file, going back to the file or the example) clears it.
const HISTORY_KEY = 'slam-history:v1';
export const HISTORY_STEPS = 25;
export function openHistory(spine) {
  const fresh = createHistory(spine);
  let kept = null;
  try { kept = JSON.parse(localStorage.getItem(HISTORY_KEY) || 'null'); } catch { return fresh; }
  const saved = readSaved();
  if (!kept || !Array.isArray(kept.past) || !Array.isArray(kept.future) || !saved || saved.value === undefined || kept.fp !== fingerprint(saved.value)) return fresh;
  return { past: kept.past.slice(-HISTORY_STEPS), present: spine, future: kept.future.slice(0, HISTORY_STEPS) };
}
// Saves the household and its history. False when the browser will not keep the household; when the history does
// not fit, the oldest steps go first.
export function keepHistory(hist) {
  if (!save(hist.present)) return false;
  const fp = fingerprint(hist.present);
  let past = hist.past.slice(-HISTORY_STEPS), future = hist.future.slice(0, HISTORY_STEPS);
  for (;;) {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify({ fp, past, future })); return true; } catch { /* too big for this browser: drop the oldest step */ }
    if (!past.length && !future.length) { clearHistory(); return true; }
    if (past.length) past = past.slice(1); else future = future.slice(0, -1);
  }
}
// The example, edited, as the person's own household (bug sweep): no longer marked as the example, its "(demo)" name
// gone, so the header reads the person's name, or "Your household" until there is one.
export function yours(doc) {
  const meta = { ...doc.meta, demo: false, name: 'Household' };
  delete meta.from;
  return { ...doc, meta };
}
// Try with example numbers (bug sweep): forget the household kept in this browser, so every page opens on the example.
// The caller asks first when what is kept is someone's own numbers (keptIsYours).
export function keptIsYours() { const s = readSaved(); if (!s) return false; if (s.value === undefined) return true; return !(s.value && s.value.meta && s.value.meta.demo === true) && !(s.value && s.value._meta && s.value._meta.demo === true); }
export function useExample() { try { localStorage.removeItem(KEY); } catch { /* storage blocked: nothing was kept */ } clearHistory(); }
export function clearHistory() { try { localStorage.removeItem(HISTORY_KEY); } catch { /* storage blocked: nothing kept */ } }
// The keys whose change in another tab means this page's household is out of date.
export const HOUSEHOLD_KEYS = [KEY, HISTORY_KEY, RULES_KEY];

// Open file (S-228): the file the person picks is read here, in the browser, by the one loader; nothing is
// uploaded anywhere. It is saved in this browser only, so every page opens to it. Returns what loadAll returns, so a
// page reopens on it; when the browser will not keep it, it is open on this page only, and the page says so.
export async function loadMyFile(file, rules) {
  const { spine } = await readProfile(file, { today: todayIso() });
  const ready = applyDefaults(spine, rules);
  const stored = save(ready);
  // A different household: the last one's changes cannot be undone onto it.
  clearHistory();
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
