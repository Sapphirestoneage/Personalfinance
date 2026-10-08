/* Sensitivity for the views (Level 9, MR-042): memoised per record version,
   debounced on edits, capped at forty roots, run in a module Worker when the
   browser has one and on a timer otherwise. Callers pass a function that
   receives the result; it runs at once when the result is already known. */
import { sensitivity, versionKey } from '../engine/sensitivity.js';

const MAX_ROOTS = 40;
let cache = { key: null, result: null };
/* MR-072: the last result survives a reload, so the levers, the scoreboard and the calculators open with their numbers */
const STORE_KEY = 'mr3.sensitivity';
function remember(key, result) { try { localStorage.setItem(STORE_KEY, JSON.stringify({ key, result })); } catch (e) { /* storage full or blocked: the in-memory cache still works */ } }
function recall(key) { try { const raw = localStorage.getItem(STORE_KEY); if (!raw) return null; const o = JSON.parse(raw); return o && o.key === key ? o.result : null; } catch (e) { return null; } }
let pending = null; let worker = null; let workerReady = false; let timer = null;
const waiting = new Set();

function ensureWorker(app) {
  if (worker !== null || typeof Worker === 'undefined') return worker;
  try {
    worker = new Worker(new URL('./levers-worker.js', import.meta.url), { type: 'module' });
    worker.postMessage({ type: 'data', data: app.data }); workerReady = true;
    worker.onmessage = e => { const m = e.data; if (m.key !== pending) return; pending = null; if (m.result) { cache = { key: m.key, result: m.result }; remember(m.key, m.result); waiting.forEach(cb => cb(m.result)); } waiting.clear(); };
    worker.onerror = () => { worker = false; workerReady = false; if (pending) { const k = pending; pending = null; runSync(k); } };
  } catch (e) { worker = false; }
  return worker;
}
let lastApp = null;
function runSync(key) {
  if (!lastApp || !lastApp.record) return;
  const r = sensitivity({ record: lastApp.record, data: lastApp.data, today: lastApp.result.today, maxRoots: MAX_ROOTS });
  cache = { key, result: r }; remember(key, r); waiting.forEach(cb => cb(r)); waiting.clear();
}
export function getSensitivity(app, cb) {
  if (!app.record || !app.result) return null;
  lastApp = app;
  const key = versionKey(app.record, app.result.today);
  if (cache.key === key && cache.result) { if (cb) cb(cache.result); return cache.result; }
  const kept = recall(key); if (kept) { cache = { key, result: kept }; if (cb) cb(kept); return kept; }
  if (cb) waiting.add(cb);
  if (pending === key) return null;
  pending = key;
  clearTimeout(timer);
  timer = setTimeout(() => {
    const w = ensureWorker(app);
    if (w && workerReady) w.postMessage({ type: 'run', key, record: JSON.parse(JSON.stringify(Object.assign({}, app.record, { journal: [] }))), today: app.result.today, maxRoots: MAX_ROOTS });
    else { runSync(key); pending = null; }
  }, 250);
  return null;
}
export function cachedSensitivity(app) { if (!app.record || !app.result) return null; const key = versionKey(app.record, app.result.today); if (cache.key === key) return cache.result; const kept = recall(key); if (kept) { cache = { key, result: kept }; return kept; } return null; }
