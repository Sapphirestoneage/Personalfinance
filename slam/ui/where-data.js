// Where to find each kind of number (data/where-to-find.json), with the Builder's changes kept in this browser.
// Formatting only: the matching is engine/where.js.

const KEY = 'slam-where:v1';
let base = null;
try { const r = await fetch(new URL('../data/where-to-find.json', import.meta.url), { cache: 'no-store' }); if (r.ok) base = await r.json(); } catch { /* offline: no where words */ }

// { id: { where, short, minutes } } changed in this browser.
export function whereChanges() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } }
export function keepWhereChanges(x) { try { if (Object.keys(x).length) localStorage.setItem(KEY, JSON.stringify(x)); else localStorage.removeItem(KEY); return true; } catch { return false; } }
// The table in use: the file's kinds with this browser's changes on top, or null when the file could not be read.
export function whereTable() {
  if (!base) return null;
  const mine = whereChanges();
  return { ...base, kinds: base.kinds.map((k) => (mine[k.id] ? { ...k, ...mine[k.id] } : k)) };
}
export const whereFile = () => base;
