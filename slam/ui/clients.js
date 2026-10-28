// Clients (practical run, S-269; pulled forward from Phase 3b): each client is its own household in this browser. The
// household on screen lives where it always has ('slam-spine:v1' and its history); the others wait in their own slots
// and swap in on a switch. Nothing here ever leaves the browser: no client is a file in the repo.
//
// Storage: 'slam-clients:v1' = { current: id | null, list: [{ id, name }] }; a waiting client's household and history
// at 'slam-client:<id>' and 'slam-client-history:<id>'. current null: the example household is on screen.

import { blankHousehold, slugOf } from '../engine/blank.js';

const LIST = 'slam-clients:v1', SPINE = 'slam-spine:v1', HISTORY = 'slam-history:v1', LAST = 'slam-last-step:v1', DELETED = 'slam-deleted-client:v1';
const slot = (id) => 'slam-client:' + id, hslot = (id) => 'slam-client-history:' + id;
const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const put = (k, v) => { try { if (v === null || v === undefined) localStorage.removeItem(k); else localStorage.setItem(k, v); return true; } catch { return false; } };
const todayIso = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const nameIn = (raw) => { try { const s = JSON.parse(raw); const p = s && s.household && s.household.people && s.household.people[0]; return (s && s.meta && s.meta.demo !== true && ((p && p.name) || s.meta.name)) || null; } catch { return null; } };

// The list. A household kept from before there were clients becomes the first client, so nothing is lost.
export function clients() {
  let reg = null;
  try { reg = JSON.parse(get(LIST) || 'null'); } catch { reg = null; }
  if (reg && Array.isArray(reg.list)) return reg;
  reg = { current: null, list: [] };
  const raw = get(SPINE), name = raw ? nameIn(raw) : null;
  if (raw && name) { const id = freshId(reg, name); reg.list.push({ id, name }); reg.current = id; }
  write(reg);
  return reg;
}
const write = (reg) => put(LIST, JSON.stringify(reg));
function freshId(reg, name) { const base = slugOf(name); let id = base, n = 2; while (reg.list.some((c) => c.id === id)) id = base + '-' + n++; return id; }
// The example, edited on screen, is someone's own numbers now: it joins the list as the current client.
export function adopt(name) { const reg = clients(); if (reg.current || !name) return reg; const id = freshId(reg, name); reg.list.push({ id, name }); reg.current = id; claimStart(id); write(reg); return reg; }
export const currentClient = () => { const reg = clients(); return reg.list.find((c) => c.id === reg.current) || null; };

// Puts the household on screen away in its client's slot (the example is never kept).
function stash(reg) {
  if (!reg.current) {
    // The example, once edited, is someone's own numbers: it becomes a client rather than being dropped.
    const raw = get(SPINE), nm = raw ? nameIn(raw) : null;
    if (nm) { const id = freshId(reg, nm); reg.list.push({ id, name: nm }); put(slot(id), raw); put(hslot(id), get(HISTORY)); claimStart(id); }
    put(SPINE, null); put(HISTORY, null); return;
  }
  put(slot(reg.current), get(SPINE)); put(hslot(reg.current), get(HISTORY));
}
function bring(reg, id) {
  reg.current = id;
  if (id) { put(SPINE, get(slot(id))); put(HISTORY, get(hslot(id))); put(slot(id), null); put(hslot(id), null); } else { put(SPINE, null); put(HISTORY, null); }
  write(reg);
}

// Each of these changes what is on screen; the caller reloads the page.
export function switchTo(id) { const reg = clients(); if (reg.current === id) return false; stash(reg); bring(reg, id); return true; }
export function newClient(name) {
  const reg = clients(), nm = String(name || '').trim() || 'New client';
  stash(reg);
  const id = freshId(reg, nm);
  reg.list.push({ id, name: nm });
  put(slot(id), JSON.stringify(blankHousehold(nm, todayIso())));
  bring(reg, id);
  return id;
}
export function duplicateClient() {
  const reg = clients(), at = reg.list.find((c) => c.id === reg.current), raw = get(SPINE);
  if (!at || !raw) return null;
  const nm = at.name + ' (copy)', id = freshId(reg, nm);
  const s = JSON.parse(raw); s.meta = { ...s.meta, name: nm };
  stash(reg);
  reg.list.push({ id, name: nm });
  put(slot(id), JSON.stringify(s));
  bring(reg, id);
  return id;
}
// Renames in the list; the page renames the household itself through change(), so Undo takes it back.
export function renameClient(id, name) { const reg = clients(), c = reg.list.find((x) => x.id === id); if (!c || !String(name).trim()) return false; c.name = String(name).trim(); write(reg); return true; }
export function syncName(name) { const reg = clients(), c = reg.list.find((x) => x.id === reg.current); if (c && name && c.name !== name) { c.name = name; write(reg); } }
// Deletes a client (after the page asked). What it held is kept for this browser tab, so Undo can bring it back.
export function deleteClient(id) {
  const reg = clients(), i = reg.list.findIndex((c) => c.id === id);
  if (i < 0) return false;
  const on = reg.current === id;
  const kept = { client: reg.list[i], at: i, spine: on ? get(SPINE) : get(slot(id)), history: on ? get(HISTORY) : get(hslot(id)), was: on };
  try { sessionStorage.setItem(DELETED, JSON.stringify(kept)); } catch { /* the Undo lasts only until the page reloads */ }
  reg.list.splice(i, 1);
  put(slot(id), null); put(hslot(id), null);
  if (on) { const next = reg.list[0] ? reg.list[0].id : null; reg.current = null; put(SPINE, null); put(HISTORY, null); if (next) bring(reg, next); else write(reg); } else write(reg);
  return on;
}
// The client deleted last, once (the page offers Undo for it after its reload).
export function takeDeleted() { try { const x = JSON.parse(sessionStorage.getItem(DELETED) || 'null'); sessionStorage.removeItem(DELETED); return x; } catch { return null; } }
export function restoreClient(kept) {
  const reg = clients();
  if (!kept || reg.list.some((c) => c.id === kept.client.id)) return false;
  reg.list.splice(Math.min(kept.at, reg.list.length), 0, kept.client);
  put(slot(kept.client.id), kept.spine); put(hslot(kept.client.id), kept.history);
  write(reg);
  if (kept.was) { stash(reg); bring(reg, kept.client.id); }
  return true;
}
// The example couple (Batch 7, S-277): a made-up household (fixtures/demo-couple.json) added as its own client, so it can
// be edited and switched to like any other; adding it again just switches to it.
export function addClientFrom(name, spine) {
  const reg = clients(), have = reg.list.find((c) => c.name === name);
  if (have) return switchTo(have.id);
  stash(reg);
  const id = freshId(reg, name);
  reg.list.push({ id, name });
  // Its own copy is a client's household, not the example: it keeps its name and can be edited and kept.
  put(slot(id), JSON.stringify({ ...spine, meta: { ...spine.meta, demo: false, name } }));
  bring(reg, id);
  return true;
}
export function showExample() { const reg = clients(); stash(reg); bring(reg, null); }

// Pick up where we left off: the Session step each client was last on.
export function rememberStep(step) { const reg = clients(); let all = {}; try { all = JSON.parse(get(LAST) || '{}') || {}; } catch { all = {}; } all[reg.current || 'example'] = step; put(LAST, JSON.stringify(all)); }
export function lastStep() { const reg = clients(); try { return (JSON.parse(get(LAST) || '{}') || {})[reg.current || 'example'] || null; } catch { return null; } }

// The household as it stood when today's call started (S-286): the first time it opens on a day, kept per client, so
// End call can say what moved the FI date since. Stays in this browser.
const startSlot = () => 'slam-call-start:' + (clients().current || 'here');
export function markCallStart(spine) {
  if (!spine) return;
  try { const was = JSON.parse(get(startSlot()) || 'null'); if (was && was.date === todayIso()) return; } catch { /* start fresh */ }
  put(startSlot(), JSON.stringify({ date: todayIso(), spine }));
}
// The example made into a client was stamped under no name (the first edit stamps it before the client exists); the
// moment it becomes a client, today's start moves to its own slot, so a reload still finds it.
function claimStart(id) {
  const here = 'slam-call-start:here';
  try { const x = JSON.parse(get(here) || 'null'); if (!x || x.date !== todayIso()) return; put('slam-call-start:' + id, JSON.stringify(x)); put(here, null); } catch { /* nothing to move */ }
}
// Until the move has happened, the start is read from the unnamed slot.
export function callStart() {
  for (const k of [startSlot(), 'slam-call-start:here']) { try { const x = JSON.parse(get(k) || 'null'); if (x && x.date === todayIso()) return x.spine; } catch { /* next */ } }
  return null;
}
