// Loading and saving the household for the Ledger and Dashboard pages.
// Order: edits saved in this browser, then fixtures/eli.local.json (on this
// machine only, gitignored), then the made-up demo household.

import { fetchRules } from '../engine/rules.js';
import { loadHousehold } from '../engine/normalize.js';
import { validate } from '../engine/schema.js';

const KEY = 'slam-spine:v1';
const base = new URL('../', import.meta.url);

function readSaved() {
  try { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}

async function fetchJson(rel) {
  try {
    const r = await fetch(new URL(rel, base), { cache: 'no-store' });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

export async function loadAll() {
  const rules = await fetchRules(new URL('data/', base));
  const saved = readSaved();
  if (saved && validate(saved).ok) return { rules, spine: saved, source: 'saved' };
  const local = await fetchJson('fixtures/eli.local.json');
  if (local) return { rules, spine: loadHousehold(local), source: 'local' };
  return { rules, spine: loadHousehold(await fetchJson('fixtures/demo.json')), source: 'demo' };
}

export function save(spine) {
  try { localStorage.setItem(KEY, JSON.stringify(spine)); return true; } catch { return false; }
}

export function forgetSaved() {
  try { localStorage.removeItem(KEY); } catch { /* storage blocked: nothing saved */ }
}

export const SOURCE_WORDS = {
  saved: 'Your edits, saved in this browser',
  local: 'Your profile file (fixtures/eli.local.json)',
  demo: 'Example household (made up)'
};
