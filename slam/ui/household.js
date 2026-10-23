// Loading and saving the household for the Ledger and Dashboard pages.
// Order: edits saved in this browser, then fixtures/eli.local.json (on this
// machine only, gitignored), then the made-up demo household.

import { fetchRules } from '../engine/rules.js';
import { loadHousehold, upgradeSpine } from '../engine/normalize.js';
import { validate } from '../engine/schema.js';
import { applyDefaults } from '../engine/defaults.js';

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
  const [rules, institutions] = await Promise.all([fetchRules(new URL('data/', base)), fetchJson('data/institutions.json').then((x) => x || { names: [], aliases: {} })]);
  const saved = readSaved();
  let problem = null;
  if (saved) {
    // Edits saved by an earlier version are upgraded, not dropped (S-167).
    const up = upgradeSpine(saved);
    const check = validate(up);
    if (check.ok) return { rules, institutions, spine: applyDefaults(up, rules), source: 'saved' };
    // Still unreadable: keep a copy under its own key so nothing is lost, and say so.
    try { localStorage.setItem(KEY + ':unreadable:' + new Date().toISOString(), JSON.stringify(saved)); } catch { /* storage blocked */ }
    problem = 'Edits saved in this browser could not be read (' + check.errors[0].path + ': ' + check.errors[0].message + '). A copy is kept in this browser; showing the file instead.';
  }
  const local = await fetchJson('fixtures/eli.local.json');
  if (local) return { rules, institutions, spine: applyDefaults(loadHousehold(local), rules), source: 'local', problem };
  return { rules, institutions, spine: applyDefaults(loadHousehold(await fetchJson('fixtures/demo.json')), rules), source: 'demo', problem };
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
