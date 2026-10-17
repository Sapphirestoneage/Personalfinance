// The number store. Holds the client list and the one open household.
// Every change goes through update(), which validates, saves, and records undo.
// Screens read store.doc and never keep their own copies of numbers.

import { newHousehold } from './schema.js';
import { migrate } from './migrate.js';
import { validateHousehold } from './validate.js';
import { createHistory } from './history.js';
import { exportHousehold, parseImport } from './transfer.js';
import { closeMonth, reviseMonth } from './months.js';
import { recordEstimates, checkAppendOnly } from './estimate-log.js';

const BACKUP_LIMIT = 10;

export function createStore(storage, clock = () => new Date()) {
  const history = createHistory();
  const listeners = new Set();
  let doc = null;

  const nowIso = () => clock().toISOString();
  const notify = (label) => listeners.forEach((fn) => fn(doc, label));

  function indexEntry(d) {
    return { id: d.id, name: d.profile.name, updatedAt: d.updatedAt };
  }

  function persist(d) {
    const errs = validateHousehold(d);
    if (errs.length) throw new Error('Change refused: ' + errs[0]);
    storage.saveHousehold(d);
    const list = storage.loadIndex().filter((e) => e.id !== d.id);
    list.push(indexEntry(d));
    list.sort((a, b) => a.name.localeCompare(b.name));
    storage.saveIndex(list);
  }

  const store = {
    get doc() { return doc; },
    list: () => storage.loadIndex(),
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    create(name) {
      const d = newHousehold(name, clock());
      persist(d);
      store.open(d.id);
      return d.id;
    },

    // Adds an already-built household (demo data, tests) and opens it.
    add(raw) {
      const d = migrate(raw);
      persist(d);
      store.open(d.id);
      return d.id;
    },

    open(id) {
      const raw = storage.loadHousehold(id);
      if (!raw) throw new Error('No client with id ' + id);
      doc = migrate(raw);
      history.clear();
      storage.setSetting('lastOpen', id);
      notify('open');
      return doc;
    },

    close() { doc = null; history.clear(); notify('close'); },

    remove(id) {
      storage.deleteHousehold(id);
      storage.saveIndex(storage.loadIndex().filter((e) => e.id !== id));
      if (doc && doc.id === id) store.close();
    },

    // mutator receives a draft copy and changes it in place.
    update(label, mutator) {
      if (!doc) throw new Error('No client is open');
      const draft = JSON.parse(JSON.stringify(doc));
      mutator(draft);
      // Estimate history (S-090): written here for every change, and never rewritten.
      checkAppendOnly(doc, draft);
      recordEstimates(doc, draft, nowIso());
      draft.updatedAt = nowIso();
      persist(draft);
      history.record(doc, label);
      doc = draft;
      notify(label);
      return doc;
    },

    undo() { return step(history.undo(doc)); },
    redo() { return step(history.redo(doc)); },
    canUndo: () => history.canUndo(),
    canRedo: () => history.canRedo(),
    undoLabel: () => history.undoLabel(),
    redoLabel: () => history.redoLabel(),

    exportCurrent() { return exportHousehold(doc, nowIso()); },

    // Takes a full backup of every household before importing anything.
    importText(text) {
      const incoming = parseImport(text);
      const backup = store.backupAll('Before import of ' + incoming.profile.name);
      persist(incoming);
      store.open(incoming.id);
      return { id: incoming.id, backupId: backup.id };
    },

    backupAll(reason) {
      const docs = storage.loadIndex().map((e) => storage.loadHousehold(e.id)).filter(Boolean);
      const b = { id: 'bk-' + Date.now().toString(36), takenAt: nowIso(), reason, docs };
      const list = storage.loadBackups();
      list.push(b);
      while (list.length > BACKUP_LIMIT) list.shift();
      storage.saveBackups(list);
      return b;
    },
    listBackups: () => storage.loadBackups().map(({ id, takenAt, reason, docs }) => ({ id, takenAt, reason, count: docs.length })),
    restoreBackup(id) {
      const b = storage.loadBackups().find((x) => x.id === id);
      if (!b) throw new Error('No backup ' + id);
      for (const d of b.docs) persist(migrate(d));
      if (doc) store.open(doc.id);
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

  function step(result) {
    if (!result) return null;
    persist(result.doc);
    doc = result.doc;
    notify(result.label);
    return result.label;
  }

  return store;
}
