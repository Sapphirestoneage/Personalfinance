// The number store. Holds the client list and the one open household.
// Every change goes through update(), which validates, saves, and records undo.
// Screens read store.doc and never keep their own copies of numbers.
//
// Records and deletes (S-096): store.doc is the live view (deleted records left
// out). The full document, with deleted records kept and every record stamped
// with id, timestamps, author, and version, is what gets saved and exported.
// Saving goes through the async storage interface (storage.js); the store keeps
// the open client and the client list in memory, so screens stay simple.

import { newHousehold } from './schema.js';
import { migrate } from './migrate.js';
import { validateHousehold } from './validate.js';
import { createHistory } from './history.js';
import { exportHousehold, parseImport } from './transfer.js';
import { closeMonth, reviseMonth } from './months.js';
import { recordEstimates, checkAppendOnly } from './estimate-log.js';
import { stamp, liveView } from './records.js';
import { mergeDocs, resolveMerge, versionsOf } from './merge.js';
import { currentRole } from './session.js';

const BACKUP_LIMIT = 10;

export function createStore(storage, clock = () => new Date()) {
  const history = createHistory();
  const listeners = new Set();
  let full = null;
  let live = null;
  let clients = [];
  let backups = [];
  let pending = Promise.resolve();
  let pendingMerge = null;
  const cache = new Map();

  const nowIso = () => clock().toISOString();
  const notify = (label) => listeners.forEach((fn) => fn(live, label));
  const setFull = (d) => { full = d; live = d ? liveView(d) : null; };

  // Validate what the screens see; save the whole file in the background (the list updates now).
  function persist(d) {
    const errs = validateHousehold(liveView(d));
    if (errs.length) throw new Error('Change refused: ' + errs[0]);
    cache.set(d.id, d);
    clients = [...clients.filter((e) => e.id !== d.id), { id: d.id, name: d.profile.name, updatedAt: d.updatedAt }].sort((a, b) => a.name.localeCompare(b.name));
    const copy = JSON.parse(JSON.stringify(d));
    pending = pending.then(() => storage.saveClient(copy));
    return pending;
  }

  function stampNew(d) {
    return stamp(null, d, nowIso(), currentRole());
  }

  const store = {
    get doc() { return live; },
    // The full file: deleted records kept, for export and merge.
    get fullDoc() { return full; },
    // The client list as last loaded (load() fills it; saves keep it current).
    list: () => clients.slice(),
    backups: () => backups.map(({ id, takenAt, reason, docs }) => ({ id, takenAt, reason, count: docs.length })),
    listBackups: () => store.backups(),
    async load() {
      clients = await storage.listClients();
      backups = await storage.loadBackups();
      return clients;
    },
    // Wait for saves to finish (tests, and before leaving the page).
    flush: () => pending,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    create(name) {
      const d = stampNew(newHousehold(name, clock()));
      persist(d);
      setFull(d);
      history.clear();
      notify('open');
      return d.id;
    },

    // Adds an already-built household (demo data, tests) and opens it.
    add(raw) {
      const d = migrate(raw);
      persist(d);
      setFull(d);
      history.clear();
      notify('open');
      return d.id;
    },

    async open(id) {
      const raw = cache.has(id) ? cache.get(id) : await storage.loadClient(id);
      if (!raw) throw new Error('No client with id ' + id);
      setFull(migrate(raw));
      cache.set(id, full);
      history.clear();
      storage.setSetting('lastOpen', id);
      notify('open');
      return live;
    },

    close() { setFull(null); history.clear(); notify('close'); },

    async remove(id) {
      cache.delete(id);
      clients = clients.filter((e) => e.id !== id);
      if (full && full.id === id) store.close();
      await pending;
      await storage.deleteClient(id);
    },

    // mutator receives a draft copy of the live view and changes it in place.
    update(label, mutator) {
      if (!full) throw new Error('No client is open');
      const draft = JSON.parse(JSON.stringify(live));
      mutator(draft);
      // Estimate history (S-090): written here for every change, and never rewritten.
      checkAppendOnly(live, draft);
      recordEstimates(live, draft, nowIso());
      draft.updatedAt = nowIso();
      const next = stamp(full, draft, nowIso(), currentRole());
      persist(next);
      history.record(full, label);
      setFull(next);
      notify(label);
      return live;
    },

    undo() { return step(history.undo(full)); },
    redo() { return step(history.redo(full)); },
    canUndo: () => history.canUndo(),
    canRedo: () => history.canRedo(),
    undoLabel: () => history.undoLabel(),
    redoLabel: () => history.redoLabel(),

    // Exporting shares the file: every record's version is written down as the last shared one.
    exportCurrent() {
      const shared = { ...full, sync: { versions: versionsOf(full), at: nowIso() } };
      persist(shared);
      setFull(shared);
      return exportHousehold(shared, nowIso());
    },

    // Takes a full backup of every household before importing anything. A file for a client
    // already here is merged record by record (S-096); conflicts wait for resolveImport.
    async importText(text) {
      const incoming = parseImport(text);
      const backup = await store.backupAll('Before import of ' + incoming.profile.name);
      const here = cache.get(incoming.id) || await storage.loadClient(incoming.id);
      if (!here) {
        persist(incoming);
        await store.open(incoming.id);
        return { id: incoming.id, backupId: backup.id, merged: false };
      }
      const result = mergeDocs(migrate(here), incoming);
      const summary = { id: incoming.id, backupId: backup.id, merged: true, added: result.added.length, fromIncoming: result.fromIncoming.length, fromLocal: result.fromLocal.length, conflicts: result.conflicts };
      if (result.conflicts.length) { pendingMerge = result; return summary; }
      // Nothing new in the file (say it was imported already): leave this copy exactly as it is.
      if (!result.added.length && !result.fromIncoming.length && !result.monthsAdded) { await store.open(incoming.id); return { ...summary, unchanged: true }; }
      await store.applyMerge(result, {});
      return summary;
    },
    // The conflicts of the import waiting for the coach, if any.
    pendingImport: () => pendingMerge,
    async resolveImport(picks) {
      if (!pendingMerge) throw new Error('No import waiting');
      const r = pendingMerge;
      pendingMerge = null;
      await store.applyMerge(r, picks);
    },
    cancelImport() { pendingMerge = null; notify('import cancelled'); },
    async applyMerge(result, picks) {
      const d = resolveMerge(result, picks, nowIso());
      d.updatedAt = nowIso();
      persist(d);
      if (full && full.id === d.id) history.record(full, 'Merge import');
      await store.open(d.id);
    },

    async backupAll(reason) {
      await pending;
      const list = await storage.listClients();
      const docs = (await Promise.all(list.map((e) => storage.loadClient(e.id)))).filter(Boolean);
      const b = { id: 'bk-' + clock().getTime().toString(36) + '-' + backups.length, takenAt: nowIso(), reason, docs };
      backups = [...(await storage.loadBackups()), b];
      while (backups.length > BACKUP_LIMIT) backups.shift();
      await storage.saveBackups(backups);
      return b;
    },
    async restoreBackup(id) {
      const b = backups.find((x) => x.id === id);
      if (!b) throw new Error('No backup ' + id);
      for (const d of b.docs) persist(migrate(d));
      await pending;
      if (full) await store.open(full.id);
    },

    // snapshot comes from calc (monthSnapshot).
    closeMonth(snapshot) {
      let key;
      store.update('Close month', (d) => { key = closeMonth(d, snapshot, nowIso()); });
      return key;
    },
    reviseMonth(key, lineId, amount) {
      store.update('Revise ' + key, (d) => reviseMonth(d, key, lineId, amount, nowIso()));
    }
  };

  // Another tab (or, later, the other person) saved this client: load it again.
  storage.subscribe((id) => {
    cache.delete(id);
    if (full && full.id === id) store.open(id).then(() => notify('changed elsewhere'));
  });

  function step(result) {
    if (!result) return null;
    persist(result.doc);
    setFull(result.doc);
    notify(result.label);
    return result.label;
  }

  return store;
}
