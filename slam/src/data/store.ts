/* ==========================================================================
   Zustand store: what the screens read. Loads from Dexie once, keeps rows
   in memory, writes through on every change. Computed values are derived
   on read (engine calls) and never stored.
   ========================================================================== */
import { create } from 'zustand';
import { demoRows } from '@/content/canonical';
import type { ProfileModel } from '@/engine/model';
import { setValue } from './assumptions';
import { getDb, type SlamDB } from './db';
import { profileToModel } from './model';
import type { Business, Label, Offer, Profile, Scenario } from './schemas';
import { comparable, exportAll, importAll, parseExport, serialize } from './transfer';

export type Status = 'loading' | 'ready' | 'error';

export interface AppState {
  status: Status;
  error: string | null;
  profile: Profile | null;
  businesses: Business[];
  offers: Offer[];
  scenarios: Scenario[];
  hidden: boolean;
  /** how the current data got here; shown on the shell */
  seeded: 'existing' | 'demo' | 'import' | null;

  init(db?: SlamDB): Promise<void>;
  reload(): Promise<void>;
  setInput(businessId: string, key: string, value: number | null, label?: Label): Promise<void>;
  setSetting(key: string, value: number | null, label?: Label): Promise<void>;
  setBusinessActive(businessId: string, active: boolean): Promise<void>;
  exportBackup(): Promise<string>;
  importBackup(text: string): Promise<void>;
  resetToDemo(): Promise<void>;
  hide(): void;
  unhide(): void;
  model(): ProfileModel | null;
}

let dbRef: SlamDB | null = null;
const db = () => dbRef ?? (dbRef = getDb());
const now = () => new Date().toISOString();

async function readAll(d: SlamDB) {
  const profile = (await d.profiles.toArray())[0] ?? null;
  const pid = profile?.id;
  const businesses = pid ? await d.businesses.where('profileId').equals(pid).toArray() : [];
  const offers = pid ? await d.offers.where('businessId').anyOf(businesses.map((b) => b.id)).toArray() : [];
  const scenarios = pid ? await d.scenarios.where('profileId').equals(pid).toArray() : [];
  businesses.sort((a, b) => a.priority - b.priority);
  return { profile, businesses, offers, scenarios };
}

async function seedDemo(d: SlamDB): Promise<void> {
  const rows = demoRows(now());
  await d.transaction('rw', d.dataTables, async () => {
    await d.putProfile(rows.profile);
    for (const b of rows.businesses) await d.putBusiness(b);
    for (const o of rows.offers) await d.putOffer(o);
    for (const s of rows.scenarios) await d.putScenario(s);
  });
}

export const useAppStore = create<AppState>((set, get) => ({
  status: 'loading',
  error: null,
  profile: null,
  businesses: [],
  offers: [],
  scenarios: [],
  hidden: false,
  seeded: null,

  async init(customDb?: SlamDB) {
    if (customDb) dbRef = customDb;
    try {
      const d = db();
      const count = await d.profiles.count();
      let seeded: AppState['seeded'] = 'existing';
      if (count === 0) {
        await seedDemo(d);
        seeded = 'demo';
      }
      set({ ...(await readAll(d)), status: 'ready', error: null, seeded });
    } catch (e) {
      set({ status: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  },

  async reload() {
    set({ ...(await readAll(db())) });
  },

  async setInput(businessId, key, value, label = 'Yours') {
    const b = get().businesses.find((x) => x.id === businessId);
    if (!b) return;
    const source = label === 'Yours' ? 'typed by you' : b.inputs[key]?.source ?? '';
    const next: Business = { ...b, inputs: setValue(b.inputs, key, value, label, source, now()), updatedAt: now() };
    await db().putBusiness(next);
    set({ businesses: get().businesses.map((x) => (x.id === businessId ? next : x)) });
  },

  async setSetting(key, value, label = 'Yours') {
    const p = get().profile;
    if (!p) return;
    const source = label === 'Yours' ? 'typed by you' : p.settings[key]?.source ?? '';
    const next: Profile = { ...p, settings: setValue(p.settings, key, value, label, source, now()), updatedAt: now() };
    await db().putProfile(next);
    set({ profile: next });
  },

  async setBusinessActive(businessId, active) {
    const b = get().businesses.find((x) => x.id === businessId);
    if (!b) return;
    const next: Business = { ...b, active, updatedAt: now() };
    await db().putBusiness(next);
    set({ businesses: get().businesses.map((x) => (x.id === businessId ? next : x)) });
  },

  async exportBackup() {
    return serialize(await exportAll(db()));
  },

  async importBackup(text) {
    const file = parseExport(text);
    await importAll(db(), file);
    const check = await exportAll(db());
    if (JSON.stringify(comparable(check)) !== JSON.stringify(comparable(file))) {
      throw new Error('The import did not restore the file exactly. Nothing else was changed.');
    }
    set({ ...(await readAll(db())), seeded: 'import' });
  },

  async resetToDemo() {
    const d = db();
    await d.clearAll();
    await seedDemo(d);
    set({ ...(await readAll(d)), seeded: 'demo' });
  },

  hide: () => set({ hidden: true }),
  unhide: () => set({ hidden: false }),

  model() {
    const { profile, businesses, offers } = get();
    if (!profile) return null;
    return profileToModel(profile, businesses, offers);
  },
}));
