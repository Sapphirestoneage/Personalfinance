// Which guesses are worth checking now (Rough now and later): one ranking (engine/ledger.js stillGuessingSteps with
// its checkNow rule), shared by every page. It takes about a second, so it runs in slices of a few milliseconds after
// the page has drawn, and the answer is kept per household version in this browser, so the next page reads it at once.
// Formatting only: the rule is the engine's.

import { stillGuessingSteps, rowPathFor } from '../engine/ledger.js';
import { isOpenItem } from '../engine/questions.js';

const KEY = 'slam-urgency:v1';
let mem = { spine: null, hash: null, result: null };
let job = 0, running = null;
const waiting = new Set();

// A short fingerprint of the household, so a kept answer is only used for the same numbers.
function hashOf(spine) {
  const s = JSON.stringify(spine);
  let x = 2166136261;
  for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); }
  return (x >>> 0).toString(36) + ':' + s.length;
}
const slim = (r) => ({ swing: r.swing, materiality: r.materiality, items: r.items.map(({ path, label, kind, group, blocks, score, moves, was, urgency, until, why, top, due }) => ({ path, label, kind, group, blocks, score, moves, was, urgency, until, why, top, due })) });

// The full ranking ({ items, ... }) for this household, or null while it is still being worked out; onReady runs
// once it is (on this page). The same spine object never starts a second run.
export function guessesFor(spine, rules, onReady) {
  if (mem.spine === spine && mem.result) return mem.result;
  if (mem.spine !== spine) {
    const hash = hashOf(spine);
    mem = { spine, hash, result: null };
    try { const kept = JSON.parse(localStorage.getItem(KEY) || 'null'); if (kept && kept.hash === hash) mem.result = kept.result; } catch { /* storage blocked */ }
    if (mem.result) return mem.result;
  }
  if (onReady) waiting.add(onReady);
  if (running !== spine) start(spine, rules);
  return null;
}
function start(spine, rules) {
  running = spine;
  const mine = ++job, it = stillGuessingSteps(spine, rules);
  const run = () => {
    if (mine !== job) return;
    const end = performance.now() + 8;
    let r;
    while (!(r = it.next()).done) if (performance.now() > end) { setTimeout(run, 0); return; }
    running = null;
    if (mem.spine !== spine) return;
    mem.result = slim(r.value);
    try { localStorage.setItem(KEY, JSON.stringify({ hash: mem.hash, result: mem.result })); } catch { /* storage blocked or full */ }
    const fns = [...waiting]; waiting.clear();
    for (const fn of fns) fn(mem.result);
  };
  setTimeout(run, 0);
}

// path (the row's own path and the Fact's) -> { urgency, until, why }, or null until worked out.
const maps = new WeakMap();
export function mapOf(result, spine) {
  const kept = maps.get(result);
  if (kept && kept.spine === spine) return kept.m;
  const m = new Map();
  for (const it of result.items) { const u = { urgency: it.urgency, until: it.until || null, why: it.why || null }; m.set(it.path, u); m.set(rowPathFor(spine, it.path), u); }
  maps.set(result, { spine, m });
  return m;
}
export function urgencyMap(spine, rules, onReady) {
  const r = guessesFor(spine, rules, onReady);
  return r ? mapOf(r, spine) : null;
}
// Worth checking now: a guess or a missing number the rule (or an override) says matters now. Not worked out yet counts
// as now, so nothing hides before the answer is in; with a current answer, a number it does not list is fine for now
// (fresh: the answer is for these very numbers).
export function worthNow(map, path, kind, fresh = true) {
  if (kind !== 'rough' && kind !== 'missing') return false;
  if (!map) return true;
  const u = map.get(path);
  // Open questions (morning answer 10): the engine's one rule, so a row's mark and every count agree.
  return u ? isOpenItem({ kind, urgency: u.urgency }) : !fresh;
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// "check in Jan" (this year or next, the year added when it is not within 12 months).
export function checkInWords(until, today) {
  if (!until) return null;
  const y = +until.slice(0, 4), m = +until.slice(5, 7) - 1, ty = +today.slice(0, 4), tm = +today.slice(5, 7) - 1;
  const ahead = (y - ty) * 12 + (m - tm);
  return 'check in ' + MONTHS[m] + (ahead >= 12 || ahead < 0 ? ' ' + y : '');
}
