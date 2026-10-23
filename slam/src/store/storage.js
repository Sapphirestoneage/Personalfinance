// The only place that touches where data lives (S-096). Everything else reads and writes through
// the async interface createStorage returns (listed above it). Today it is backed by localStorage;
// a server-backed version (see HOSTING.md) keeps the same interface. No imports.
// Device preferences (theme, last client opened) stay on this device: getSetting, setSetting.

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

// Every key starts with this, so the app's data is easy to tell from anything else on the same origin.
const PREFIX = 'slam:';

// The interface:
//   listClients()      -> [{ id, name, updatedAt }]
//   loadClient(id)     -> the client's full document (with deleted records), or null
//   saveClient(doc)    -> saves it and updates the client list (a client marked deleted leaves the list;
//                         nothing is ever erased, S-098)
//   loadBackups(), saveBackups(list)
//   subscribe(fn)      -> fn(clientId) when a client changes somewhere else (another tab today)
// A server-backed version adds per-record saves, so the store can send one change at a time:
//   saveRecord(clientId, collection, record)   create or update one record (by id and version)
//   deleteRecord(clientId, collection, id)     mark it deleted (never removed)
//   watchClient(clientId, fn)                  fn(records) when the other side saves
// and keeps saveClient for whole-file imports.
export function createStorage(backend) {
  const read = (k) => {
    const raw = backend.getItem(PREFIX + k);
    return raw === null ? null : JSON.parse(raw);
  };
  const write = (k, v) => backend.setItem(PREFIX + k, JSON.stringify(v));
  // The client list is its own small record, so listing clients never loads a whole document.
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
    // Only client documents matter here; the id follows 'slam:hh:' (3 is the length of 'hh:').
    subscribe(fn) {
      return backend.onChange ? backend.onChange((key) => { if (key.startsWith(PREFIX + 'hh:')) fn(key.slice(PREFIX.length + 3)); }) : () => {};
    },
    getSetting: (k) => read('setting:' + k),
    setSetting: (k, v) => write('setting:' + k, v)
  };
}
