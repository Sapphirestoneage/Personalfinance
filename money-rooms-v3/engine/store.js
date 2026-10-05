/* Storage: one record per client in localStorage under mr3:client:<id>.
   Export and import as JSON (journal included) with a pre-import snapshot
   so an import can be undone. The storage adapter is injectable so Node
   tests run against a Map. Every record that comes out of here has been
   migrated to the current schema. */

import { SCHEMA_VERSION, createRecord } from './record.js';
import { append } from './journal.js';
import { PLANETS } from './sun.js';

export const KEY_PREFIX = 'mr3:client:';
export const SNAPSHOT_PREFIX = 'mr3:snapshot:';
export const SETTINGS_KEY = 'mr3:settings';

export function memoryStorage() {
  const m = new Map();
  return {
    getItem(k) { return m.has(k) ? m.get(k) : null; },
    setItem(k, v) { m.set(k, String(v)); },
    removeItem(k) { m.delete(k); },
    keys() { return Array.from(m.keys()); },
  };
}

export function browserStorage(ls) {
  const s = ls || globalThis.localStorage;
  return {
    getItem(k) { return s.getItem(k); },
    setItem(k, v) { s.setItem(k, v); },
    removeItem(k) { s.removeItem(k); },
    keys() { const out = []; for (let i = 0; i < s.length; i++) out.push(s.key(i)); return out; },
  };
}

/* Migrations: each lifts a record one version. Any field change ships one
   of these and a test in tests/engine/migrate.test.js with a fixture. */
export const MIGRATIONS = [
  {
    from: 0, to: 1,
    note: 'pre-release records had no plates and no quick notes',
    up(rec) {
      rec.myPlate = rec.myPlate || { done: {}, snoozed: {} };
      rec.theirPlate = rec.theirPlate || { done: {}, snoozed: {} };
      rec.quickNotes = rec.quickNotes || [];
      rec.coachNotes = rec.coachNotes || [];
      rec.sessions = rec.sessions || [];
      rec.scenarios = rec.scenarios || [];
      return rec;
    },
  },
  {
    from: 1, to: 2,
    note: 'the Sun gained assumptions, clientPicks and onepager edits; rows gained stress and followUp',
    up(rec) {
      rec.sun.assumptions = rec.sun.assumptions || {};
      rec.sun.clientPicks = rec.sun.clientPicks || [];
      rec.sun.onepager = rec.sun.onepager || {};
      PLANETS.forEach(p => {
        if (!rec.planets[p]) rec.planets[p] = { rows: [] };
        rec.planets[p].rows.forEach(r => {
          if (r.stress === undefined) r.stress = null;
          if (r.followUp === undefined) r.followUp = false;
        });
      });
      return rec;
    },
  },
];

export function migrate(rec) {
  let r = rec;
  if (typeof r.schemaVersion !== 'number') r.schemaVersion = 0;
  while (r.schemaVersion < SCHEMA_VERSION) {
    const m = MIGRATIONS.find(x => x.from === r.schemaVersion);
    if (!m) throw new Error('no migration from schema ' + r.schemaVersion);
    r = m.up(r);
    r.schemaVersion = m.to;
  }
  if (r.schemaVersion > SCHEMA_VERSION) throw new Error('record is from a newer app (schema ' + r.schemaVersion + ')');
  return r;
}

export function createStore(adapter) {
  const s = adapter || browserStorage();
  function key(id) { return KEY_PREFIX + id; }
  return {
    save(record, now) {
      record.updatedAt = now || new Date().toISOString();
      s.setItem(key(record.id), JSON.stringify(record));
      return record.updatedAt;
    },
    load(id) {
      const raw = s.getItem(key(id));
      if (!raw) return null;
      const rec = migrate(JSON.parse(raw));
      return rec;
    },
    remove(id) { s.removeItem(key(id)); },
    list() {
      return s.keys().filter(k => k.indexOf(KEY_PREFIX) === 0).map(k => {
        const r = JSON.parse(s.getItem(k));
        const name = r.sun && r.sun.f && r.sun.f.name && r.sun.f.name.v;
        return { id: r.id, name: name || '', updatedAt: r.updatedAt, schemaVersion: r.schemaVersion };
      }).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    },
    exportJson(record) {
      return JSON.stringify({ app: 'money-rooms-v3', exportedAt: new Date().toISOString(), record }, null, 2);
    },
    /* Import: snapshot whatever that id holds now, then write the imported record. */
    importJson(text, now) {
      let parsed;
      try { parsed = JSON.parse(text); } catch (e) { throw new Error('that file is not JSON'); }
      const rec = parsed && parsed.record ? parsed.record : parsed;
      if (!rec || !rec.id || !rec.sun || !rec.planets) throw new Error('that file is not a Money Rooms v3 export');
      const migrated = migrate(rec);
      const ts = now || new Date().toISOString();
      let snapshotKey = null;
      const existing = s.getItem(key(migrated.id));
      if (existing) {
        snapshotKey = SNAPSHOT_PREFIX + migrated.id + ':' + ts;
        s.setItem(snapshotKey, existing);
      }
      append(migrated.journal, { kind: 'import', planet: 'sun', rowId: 'sun', field: null, owner: 'sun', old: null, new: 'import', source: 'client', state: 'known', snapshotKey }, ts);
      this.save(migrated, ts);
      return { record: migrated, snapshotKey };
    },
    undoImport(snapshotKey) {
      const raw = s.getItem(snapshotKey);
      if (!raw) return null;
      const rec = migrate(JSON.parse(raw));
      this.save(rec);
      s.removeItem(snapshotKey);
      return rec;
    },
    snapshots(id) {
      return s.keys().filter(k => k.indexOf(SNAPSHOT_PREFIX + id + ':') === 0).sort();
    },
    settings() {
      const raw = s.getItem(SETTINGS_KEY);
      return raw ? JSON.parse(raw) : { view: 'coach', lastClient: null };
    },
    saveSettings(obj) { s.setItem(SETTINGS_KEY, JSON.stringify(obj)); },
    newRecord(opts) { const r = createRecord(opts); this.save(r, r.createdAt); return r; },
  };
}
