// The only place that touches browser storage. Swap this adapter for cloud sync
// later; nothing else in the app knows where data lives.

// Any object with getItem / setItem / removeItem / keys works as a backend.
export function memoryBackend() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    keys: () => [...map.keys()]
  };
}

export function localStorageBackend(ls = globalThis.localStorage) {
  return {
    getItem: (k) => ls.getItem(k),
    setItem: (k, v) => ls.setItem(k, v),
    removeItem: (k) => ls.removeItem(k),
    keys: () => Object.keys(ls)
  };
}

const PREFIX = 'slam:';

export function createStorage(backend) {
  const read = (k) => {
    const raw = backend.getItem(PREFIX + k);
    return raw === null ? null : JSON.parse(raw);
  };
  const write = (k, v) => backend.setItem(PREFIX + k, JSON.stringify(v));
  return {
    loadIndex: () => read('index') || [],
    saveIndex: (list) => write('index', list),
    loadHousehold: (id) => read('hh:' + id),
    saveHousehold: (doc) => write('hh:' + doc.id, doc),
    deleteHousehold: (id) => backend.removeItem(PREFIX + 'hh:' + id),
    loadBackups: () => read('backups') || [],
    saveBackups: (list) => write('backups', list),
    getSetting: (k) => read('setting:' + k),
    setSetting: (k, v) => write('setting:' + k, v)
  };
}
