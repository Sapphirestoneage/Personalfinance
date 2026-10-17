// The only place that touches where data lives (S-096). Everything else reads
// and writes through this async interface:
//   listClients()      -> [{ id, name, updatedAt }]
//   loadClient(id)     -> the client's full document (with deleted records), or null
//   saveClient(doc)    -> saves it and updates the client list (a client marked deleted leaves the list;
//                         nothing is ever erased, S-098)
//   loadBackups(), saveBackups(list)
//   subscribe(fn)      -> fn(clientId) when a client changes somewhere else (another tab today)
// Device preferences (theme, last client opened) stay on this device: getSetting, setSetting.
//
// Today it is backed by localStorage. A server-backed version (see HOSTING.md) keeps this
// interface and adds per-record saves, so the store can send one change at a time:
//   saveRecord(clientId, collection, record)   create or update one record (by id and version)
//   deleteRecord(clientId, collection, id)     mark it deleted (never removed)
//   watchClient(clientId, fn)                  fn(records) when the other side saves
// and keeps saveClient for whole-file imports.

// Any object with getItem / setItem / removeItem / keys works as a backend.
// changedElsewhere(key) stands in for another device saving (for tests).
export function memoryBackend() {
  const map = new Map();
  const fns = new Set();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    keys: () => [...map.keys()],
    onChange: (fn) => { fns.add(fn); return () => fns.delete(fn); },
    changedElsewhere: (k) => { for (const fn of fns) fn(k); }
  };
}

export function localStorageBackend(ls = globalThis.localStorage) {
  return {
    getItem: (k) => ls.getItem(k),
    setItem: (k, v) => ls.setItem(k, v),
    removeItem: (k) => ls.removeItem(k),
    keys: () => Object.keys(ls),
    // Another tab saved: tell the app which key changed.
    onChange: (fn) => {
      const h = (e) => { if (e.key) fn(e.key); };
      globalThis.addEventListener('storage', h);
      return () => globalThis.removeEventListener('storage', h);
    }
  };
}

const PREFIX = 'slam:';

export function createStorage(backend) {
  const read = (k) => {
    const raw = backend.getItem(PREFIX + k);
    return raw === null ? null : JSON.parse(raw);
  };
  const write = (k, v) => backend.setItem(PREFIX + k, JSON.stringify(v));
  const index = () => read('index') || [];
  return {
    async listClients() { return index(); },
    async loadClient(id) { return read('hh:' + id); },
    async saveClient(doc) {
      write('hh:' + doc.id, doc);
      const list = index().filter((e) => e.id !== doc.id);
      if (!doc.deleted) list.push({ id: doc.id, name: doc.profile.name, updatedAt: doc.updatedAt });
      list.sort((a, b) => a.name.localeCompare(b.name));
      write('index', list);
    },
    async loadBackups() { return read('backups') || []; },
    async saveBackups(list) { write('backups', list); },
    subscribe(fn) {
      return backend.onChange ? backend.onChange((key) => { if (key.startsWith(PREFIX + 'hh:')) fn(key.slice(PREFIX.length + 3)); }) : () => {};
    },
    getSetting: (k) => read('setting:' + k),
    setSetting: (k, v) => write('setting:' + k, v)
  };
}
