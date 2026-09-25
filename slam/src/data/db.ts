/* ==========================================================================
   Dexie: the on-device store. One database, one table per entity. Every
   write goes through a `put*` helper that validates with the Zod schema,
   so a bad shape never reaches IndexedDB.

   The database name says nothing about the kind of work.
   ========================================================================== */
import Dexie, { type EntityTable } from 'dexie';
import {
  type Business,
  BusinessSchema,
  type ClientRecord,
  ClientRecordSchema,
  type Milestone,
  MilestoneSchema,
  type Offer,
  OfferSchema,
  type Profile,
  ProfileSchema,
  type Sale,
  SaleSchema,
  type Scenario,
  ScenarioSchema,
  type Source,
  SourceSchema,
  type WeekLog,
  WeekLogSchema,
} from './schemas';

export interface Meta {
  key: string;
  value: string;
}

export const DB_NAME = 'slam';

export class SlamDB extends Dexie {
  profiles!: EntityTable<Profile, 'id'>;
  businesses!: EntityTable<Business, 'id'>;
  offers!: EntityTable<Offer, 'id'>;
  scenarios!: EntityTable<Scenario, 'id'>;
  sources!: EntityTable<Source, 'id'>;
  clients!: EntityTable<ClientRecord, 'id'>;
  sales!: EntityTable<Sale, 'id'>;
  weekLogs!: EntityTable<WeekLog, 'id'>;
  milestones!: EntityTable<Milestone, 'id'>;
  meta!: EntityTable<Meta, 'key'>;

  constructor(name: string = DB_NAME) {
    super(name);
    /* Bumping this version needs an upgrade function and a note in CLAUDE.md. */
    this.version(1).stores({
      profiles: 'id',
      businesses: 'id, profileId, [profileId+priority]',
      offers: 'id, businessId',
      scenarios: 'id, profileId, [profileId+kind]',
      sources: 'id, profileId',
      clients: 'id, profileId, stage',
      sales: 'id, profileId, businessId, clientId, date',
      weekLogs: 'id, profileId, weekStart',
      milestones: 'id, profileId, key',
      meta: 'key',
    });
  }

  get dataTables() {
    return [this.profiles, this.businesses, this.offers, this.scenarios, this.sources, this.clients, this.sales, this.weekLogs, this.milestones, this.meta];
  }

  /* Validated writes. */
  async putProfile(p: Profile) {
    return this.profiles.put(ProfileSchema.parse(p));
  }
  async putBusiness(b: Business) {
    return this.businesses.put(BusinessSchema.parse(b));
  }
  async putOffer(o: Offer) {
    return this.offers.put(OfferSchema.parse(o));
  }
  async putScenario(s: Scenario) {
    return this.scenarios.put(ScenarioSchema.parse(s));
  }
  async putSource(s: Source) {
    return this.sources.put(SourceSchema.parse(s));
  }
  async putClient(c: ClientRecord) {
    return this.clients.put(ClientRecordSchema.parse(c));
  }
  async putSale(s: Sale) {
    return this.sales.put(SaleSchema.parse(s));
  }
  async putWeekLog(w: WeekLog) {
    return this.weekLogs.put(WeekLogSchema.parse(w));
  }
  async putMilestone(m: Milestone) {
    return this.milestones.put(MilestoneSchema.parse(m));
  }

  /** Everything gone, in one transaction. Used by reset and by import. */
  async clearAll(): Promise<void> {
    await this.transaction('rw', this.dataTables, async () => {
      for (const t of this.dataTables) await t.clear();
    });
  }
}

let shared: SlamDB | null = null;
/** The app's one database. Tests make their own with `new SlamDB(name)`. */
export function getDb(): SlamDB {
  if (!shared) shared = new SlamDB();
  return shared;
}
