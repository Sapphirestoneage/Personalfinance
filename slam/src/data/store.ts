/* ==========================================================================
   Zustand store: what the screens read. Loads from Dexie once, keeps rows
   in memory, writes through on every change. Computed values are derived
   on read (engine calls) and never stored.
   ========================================================================== */
import { create } from 'zustand';
import { freshRows, sampleRows, type Rows } from '@/content/samples';
import { stepKey } from '@/content/stages';
import type { ProfileModel } from '@/engine/model';
import { setValue } from './assumptions';
import { getDb, type SlamDB } from './db';
import { profileToModel } from './model';
import type { Business, ChartPref, ClientRecord, EventId, EventParamsPatch, Label, LabelMode, Milestone, Multipliers, Offer, PathwayStage, Profile, Sale, Scenario, ScenarioKind, ScenarioOverride, Source, WeekLog } from './schemas';
import { buildSnapshot, snapshotMarkdown } from './snapshot';
import { comparable, exportAll, importAll, parseExport, serialize } from './transfer';
import { migrateWeekLog } from './migrate';

export type Status = 'loading' | 'ready' | 'error';

export interface ValuePatch {
  inputs?: Record<string, number | null>;
  offers?: Partial<Record<Offer['type'], Record<string, number | null>>>;
  shared?: Record<string, number | null>;
}

export interface AppState {
  status: Status;
  error: string | null;
  profile: Profile | null;
  businesses: Business[];
  offers: Offer[];
  scenarios: Scenario[];
  clients: ClientRecord[];
  sales: Sale[];
  weekLogs: WeekLog[];
  milestones: Milestone[];
  sources: Source[];
  hidden: boolean;
  presenter: boolean;
  seeded: 'existing' | 'fresh' | 'sample' | 'import' | null;

  init(db?: SlamDB): Promise<void>;
  reload(): Promise<void>;
  setInput(businessId: string, key: string, value: number | null, label?: Label, source?: string): Promise<void>;
  setOfferValue(offerId: string, key: string, value: number | null, label?: Label, source?: string): Promise<void>;
  setOfferActive(offerId: string, active: boolean): Promise<void>;
  setSetting(key: string, value: number | null, label?: Label, source?: string): Promise<void>;
  applyValues(businessId: string, patch: ValuePatch, label?: Label, source?: string): Promise<void>;
  setBusinessActive(businessId: string, active: boolean): Promise<void>;
  setPriorityOrder(ids: string[]): Promise<void>;
  setLabelMode(mode: LabelMode): Promise<void>;
  setChartPref(id: string, pref: ChartPref): Promise<void>;
  completeStep(businessId: string, stage: PathwayStage): Promise<void>;
  setScenario(kind: ScenarioKind, multipliers: Multipliers, events: EventId[], eventParams?: EventParamsPatch): Promise<void>;
  setBusinessOverride(businessId: string, kind: ScenarioKind, override: ScenarioOverride | undefined): Promise<void>;
  putSource(s: Source): Promise<void>;
  deleteSource(id: string): Promise<void>;
  putClient(c: ClientRecord): Promise<void>;
  deleteClient(id: string): Promise<void>;
  addSale(s: Sale): Promise<void>;
  putWeekLog(w: WeekLog): Promise<void>;
  addMilestone(key: string, businessId?: string): Promise<void>;
  exportBackup(): Promise<string>;
  importBackup(text: string): Promise<void>;
  snapshotText(): string;
  snapshotMarkdownText(): string;
  loadSample(sampleId: string): Promise<void>;
  resetFresh(): Promise<void>;
  hide(): void;
  unhide(): void;
  clearError(): void;
  setPresenter(on: boolean): void;
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
  const clients = pid ? await d.clients.where('profileId').equals(pid).toArray() : [];
  const sales = pid ? await d.sales.where('profileId').equals(pid).toArray() : [];
  const weekLogs = pid ? (await d.weekLogs.where('profileId').equals(pid).toArray()).map((w) => migrateWeekLog(w as unknown as Record<string, unknown>) as unknown as WeekLog) : [];
  const milestones = pid ? await d.milestones.where('profileId').equals(pid).toArray() : [];
  const sources = pid ? await d.sources.where('profileId').equals(pid).toArray() : [];
  businesses.sort((a, b) => a.priority - b.priority);
  sources.sort((a, b) => a.name.localeCompare(b.name));
  weekLogs.sort((a, b) => b.weekStart.localeCompare(a.weekStart));
  clients.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { profile, businesses, offers, scenarios, clients, sales, weekLogs, milestones, sources };
}

async function seed(d: SlamDB, rows: Rows): Promise<void> {
  await d.transaction('rw', d.dataTables, async () => {
    for (const t of d.dataTables) await t.clear();
    await d.putProfile(rows.profile);
    for (const b of rows.businesses) await d.putBusiness(b);
    for (const o of rows.offers) await d.putOffer(o);
    for (const s of rows.scenarios) await d.putScenario(s);
  });
}

export const useAppStore = create<AppState>((set, get) => {
  /* The screen updates first, then the row is written; a failed write is
     reported and the row reloaded, so the screen never lies for long. */
  const persist = async (write: () => Promise<unknown>) => {
    try {
      await write();
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e), ...(await readAll(db())) });
    }
  };
  const saveBusiness = async (next: Business) => {
    set({ businesses: get().businesses.map((x) => (x.id === next.id ? next : x)).sort((a, b) => a.priority - b.priority) });
    await persist(() => db().putBusiness(next));
  };
  const saveProfile = async (next: Profile) => {
    set({ profile: next });
    await persist(() => db().putProfile(next));
  };
  const saveOffer = async (next: Offer) => {
    set({ offers: get().offers.map((x) => (x.id === next.id ? next : x)) });
    await persist(() => db().putOffer(next));
  };

  return {
    status: 'loading',
    error: null,
    profile: null,
    businesses: [],
    offers: [],
    scenarios: [],
    clients: [],
    sales: [],
    weekLogs: [],
    milestones: [],
    sources: [],
    hidden: false,
    presenter: false,
    seeded: null,

    async init(customDb?: SlamDB) {
      if (customDb) dbRef = customDb;
      try {
        const d = db();
        const count = await d.profiles.count();
        let seeded: AppState['seeded'] = 'existing';
        if (count === 0) {
          await seed(d, freshRows(now()));
          seeded = 'fresh';
        }
        set({ ...(await readAll(d)), status: 'ready', error: null, seeded });
      } catch (e) {
        set({ status: 'error', error: e instanceof Error ? e.message : String(e) });
      }
    },

    async reload() {
      set({ ...(await readAll(db())) });
    },

    async setInput(businessId, key, value, label = 'Yours', source) {
      const b = get().businesses.find((x) => x.id === businessId);
      if (!b) return;
      const src = source ?? (label === 'Yours' ? 'typed by you' : (b.inputs[key]?.source ?? ''));
      await saveBusiness({ ...b, inputs: setValue(b.inputs, key, value, label, src, now()), updatedAt: now() });
    },

    async setOfferValue(offerId, key, value, label = 'Yours', source) {
      const o = get().offers.find((x) => x.id === offerId);
      if (!o) return;
      const field = key as 'priceCents';
      const prev = o[field];
      await saveOffer({ ...o, [field]: { key, value, label, source: source ?? (label === 'Yours' ? 'typed by you' : (prev?.source ?? '')), updated: now() } });
    },

    async setOfferActive(offerId, active) {
      const o = get().offers.find((x) => x.id === offerId);
      if (!o) return;
      await saveOffer({ ...o, active });
    },

    async setSetting(key, value, label = 'Yours', source) {
      const p = get().profile;
      if (!p) return;
      const src = source ?? (label === 'Yours' ? 'typed by you' : (p.settings[key]?.source ?? ''));
      await saveProfile({ ...p, settings: setValue(p.settings, key, value, label, src, now()), updatedAt: now() });
    },

    async applyValues(businessId, patch, label = 'Yours', source = 'typed by you') {
      const stamp = now();
      const b = get().businesses.find((x) => x.id === businessId);
      if (b && patch.inputs) {
        let inputs = b.inputs;
        for (const [k, v] of Object.entries(patch.inputs)) inputs = setValue(inputs, k, v, label, source, stamp);
        await saveBusiness({ ...b, inputs, updatedAt: stamp });
      }
      if (patch.offers) {
        for (const [type, values] of Object.entries(patch.offers)) {
          const o = get().offers.find((x) => x.businessId === businessId && x.type === type);
          if (!o || !values) continue;
          const next: Offer = { ...o, active: true };
          for (const [k, v] of Object.entries(values)) (next as unknown as Record<string, unknown>)[k] = { key: k, value: v, label, source, updated: stamp };
          await saveOffer(next);
        }
      }
      if (patch.shared) {
        const p = get().profile;
        if (p) {
          let settings = p.settings;
          for (const [k, v] of Object.entries(patch.shared)) settings = setValue(settings, k, v, label, source, stamp);
          await saveProfile({ ...p, settings, updatedAt: stamp });
        }
      }
    },

    async setBusinessActive(businessId, active) {
      const b = get().businesses.find((x) => x.id === businessId);
      if (!b) return;
      await saveBusiness({ ...b, active, updatedAt: now() });
      const p = get().profile;
      if (p && !p.pathway.businessId && active) await saveProfile({ ...p, pathway: { ...p.pathway, businessId }, updatedAt: now() });
    },

    async setPriorityOrder(ids) {
      const stamp = now();
      const d = db();
      const next = get().businesses.map((b) => {
        const i = ids.indexOf(b.id);
        return i === -1 ? b : { ...b, priority: i + 1, updatedAt: stamp };
      });
      await d.transaction('rw', d.businesses, async () => {
        for (const b of next) await d.putBusiness(b);
      });
      set({ businesses: next.sort((a, b) => a.priority - b.priority) });
    },

    async setChartPref(id, pref) {
      const p = get().profile;
      if (!p) return;
      const prev = p.chartPrefs?.[id] ?? {};
      await saveProfile({ ...p, chartPrefs: { ...(p.chartPrefs ?? {}), [id]: { ...prev, ...pref } }, updatedAt: now() });
    },

    async setLabelMode(mode) {
      const p = get().profile;
      if (p) await saveProfile({ ...p, labelMode: mode, updatedAt: now() });
    },

    async completeStep(businessId, stage) {
      const p = get().profile;
      if (!p) return;
      const key = stepKey(businessId, stage);
      if (p.pathway.completedSteps.includes(key)) return;
      await saveProfile({ ...p, pathway: { ...p.pathway, completedSteps: [...p.pathway.completedSteps, key] }, updatedAt: now() });
    },

    async setScenario(kind, multipliers, events, eventParams) {
      const s = get().scenarios.find((x) => x.kind === kind);
      if (!s) return;
      const next: Scenario = { ...s, multipliers, events, ...(eventParams !== undefined ? { eventParams } : {}), updatedAt: now() };
      await db().putScenario(next);
      set({ scenarios: get().scenarios.map((x) => (x.id === next.id ? next : x)) });
    },

    async setBusinessOverride(businessId, kind, override) {
      const b = get().businesses.find((x) => x.id === businessId);
      if (!b) return;
      const scenarioOverrides = { ...b.scenarioOverrides };
      if (override) scenarioOverrides[kind] = override;
      else delete scenarioOverrides[kind];
      await saveBusiness({ ...b, scenarioOverrides, updatedAt: now() });
    },

    async putSource(src) {
      const rest = get().sources.filter((x) => x.id !== src.id);
      set({ sources: [...rest, src].sort((a, b) => a.name.localeCompare(b.name)) });
      await persist(() => db().putSource(src));
    },

    async deleteSource(id) {
      set({ sources: get().sources.filter((x) => x.id !== id) });
      await persist(() => db().sources.delete(id));
    },

    async putClient(c) {
      await db().putClient(c);
      const rest = get().clients.filter((x) => x.id !== c.id);
      set({ clients: [c, ...rest] });
    },

    async deleteClient(id) {
      await db().clients.delete(id);
      set({ clients: get().clients.filter((x) => x.id !== id) });
    },

    async addSale(s) {
      await db().putSale(s);
      set({ sales: [...get().sales, s] });
    },

    async putWeekLog(w) {
      const before = get().weekLogs.find((x) => x.id === w.id);
      const countsAsCheckIn = w.checkedIn && !before?.checkedIn;
      const rest = get().weekLogs.filter((x) => x.id !== w.id);
      set({ weekLogs: [w, ...rest].sort((a, b) => b.weekStart.localeCompare(a.weekStart)) });
      await persist(() => db().putWeekLog(w));
      if (countsAsCheckIn) {
        const p = get().profile;
        if (p) await saveProfile({ ...p, checkInCount: p.checkInCount + 1, updatedAt: now() });
      }
    },

    async addMilestone(key, businessId) {
      const p = get().profile;
      if (!p || get().milestones.some((m) => m.key === key && m.businessId === businessId)) return;
      const m: Milestone = { id: `m-${key}-${businessId ?? 'all'}`, profileId: p.id, key, achievedAt: now(), ...(businessId ? { businessId } : {}) };
      await db().putMilestone(m);
      set({ milestones: [...get().milestones, m] });
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

    snapshotText() {
      const { profile, businesses, offers, weekLogs, milestones } = get();
      if (!profile) return '';
      return JSON.stringify(buildSnapshot(profile, businesses, offers, weekLogs, milestones), null, 2);
    },

    snapshotMarkdownText() {
      const { profile, businesses, offers, weekLogs } = get();
      if (!profile) return '';
      return snapshotMarkdown(profile, businesses, offers, weekLogs);
    },

    async loadSample(sampleId) {
      const d = db();
      await seed(d, sampleRows(sampleId, now()));
      set({ ...(await readAll(d)), seeded: 'sample' });
    },

    async resetFresh() {
      const d = db();
      await seed(d, freshRows(now()));
      set({ ...(await readAll(d)), seeded: 'fresh' });
    },

    hide: () => set({ hidden: true }),
    unhide: () => set({ hidden: false }),
    clearError: () => set({ error: null }),
    setPresenter: (on) => set({ presenter: on }),

    model() {
      const { profile, businesses, offers, sources } = get();
      if (!profile) return null;
      return profileToModel(profile, businesses, offers, sources);
    },
  };
});
