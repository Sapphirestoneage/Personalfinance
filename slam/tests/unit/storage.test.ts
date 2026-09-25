/* Data survives a reopen; export then import restores everything exactly. */
import { beforeEach, describe, expect, it } from 'vitest';
import { SlamDB } from '@/data/db';
import { comparable, exportAll, exportFileName, importAll, parseExport, serialize } from '@/data/transfer';
import { useAppStore } from '@/data/store';
import { demoRows } from '@/content/canonical';
import { aggregateMonth } from '@/engine/aggregate';
import { inPersonMonth } from '@/engine/businesses';
import { canonicalInPerson } from '@/content/canonical';
import { unwrap, within } from '../helpers';

let n = 0;
const fresh = () => new SlamDB(`test-${Date.now()}-${n++}`);

describe('Dexie storage', () => {
  it('validates on write', async () => {
    const db = fresh();
    const b = demoRows().businesses[0]!;
    await expect(db.putBusiness({ ...b, priority: 0 })).rejects.toThrow();
    await expect(db.putBusiness({ ...b, legalName: 'x' } as never)).rejects.toThrow();
    expect(await db.businesses.count()).toBe(0);
  });

  it('keeps data across a close and reopen of the same database', async () => {
    const name = `persist-${Date.now()}`;
    const a = new SlamDB(name);
    const rows = demoRows();
    await a.putProfile(rows.profile);
    for (const b of rows.businesses) await a.putBusiness(b);
    a.close();
    const b = new SlamDB(name);
    expect(await b.profiles.count()).toBe(1);
    expect(await b.businesses.count()).toBe(4);
    b.close();
  });

  it('export then import restores everything exactly', async () => {
    const db = fresh();
    const rows = demoRows();
    await db.putProfile(rows.profile);
    for (const b of rows.businesses) await db.putBusiness(b);
    for (const o of rows.offers) await db.putOffer(o);
    for (const s of rows.scenarios) await db.putScenario(s);
    await db.putClient({
      id: 'c1',
      profileId: 'demo',
      alias: 'Blue',
      stage: 'regular',
      keyDates: { firstContact: '2026-09-01' },
      screeningResult: 'pass',
      depositStatus: 'paid',
      offersBought: ['b-regulars-tribute'],
      contactConsent: true,
      agreedBudgetCents: 50_000,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    });
    await db.putSale({ id: 's1', profileId: 'demo', businessId: 'b-regulars', clientId: 'c1', date: '2026-09-03', amountCents: 20_000, feeCents: 2_000, variableCostCents: 0, createdAt: '2026-09-03T00:00:00.000Z' });
    await db.putWeekLog({ id: 'w1', profileId: 'demo', weekStart: '2026-08-31', inquiries: 12, bookings: 3, sessionsHeld: null, revenueCents: null, hours: 20, energy: 4, loggedAt: '2026-09-06T00:00:00.000Z' });
    await db.putMilestone({ id: 'm1', profileId: 'demo', key: 'first-checkin', achievedAt: '2026-09-06T00:00:00.000Z' });

    const before = await exportAll(db, new Date('2026-09-10T00:00:00.000Z'));
    const text = serialize(before);
    expect(text).not.toMatch(/domme|findom|kink|fetish|escort/i);

    const target = fresh();
    await importAll(target, parseExport(text));
    const after = await exportAll(target, new Date('2026-09-11T00:00:00.000Z'));
    expect(comparable(after)).toEqual(comparable(before));
    expect(after.clients[0]!.agreedBudgetCents).toBe(50_000);
    expect(after.weekLogs[0]!.sessionsHeld).toBeNull();
  });

  it('a bad file changes nothing', async () => {
    const db = fresh();
    await db.putProfile(demoRows().profile);
    expect(() => parseExport('not json')).toThrow(/not readable/);
    expect(() => parseExport(JSON.stringify({ format: 'slam-backup', schemaVersion: 1 }))).toThrow(/does not match/);
    expect(await db.profiles.count()).toBe(1);
  });

  it('file names never reveal the kind of work', () => {
    expect(exportFileName(new Date('2026-09-25T12:00:00Z'))).toBe('numbers-backup-2026-09-25.json');
    expect(exportFileName(new Date('2026-09-25T12:00:00Z'), 'snapshot')).toBe('numbers-snapshot-2026-09-25.json');
  });
});

describe('the store', () => {
  beforeEach(() => {
    useAppStore.setState({ status: 'loading', profile: null, businesses: [], offers: [], scenarios: [], hidden: false, seeded: null, error: null });
  });

  it('seeds the demo on an empty device and computes G1 from what it stored', async () => {
    await useAppStore.getState().init(fresh());
    const s = useAppStore.getState();
    expect(s.status).toBe('ready');
    expect(s.seeded).toBe('demo');
    expect(s.businesses.map((b) => b.priority)).toEqual([1, 2, 3, 4]);
    const model = s.model()!;
    const inPerson = model.businesses.find((b) => b.type === 'inPerson')!;
    const totals = unwrap(aggregateMonth({ businesses: [inPerson], shared: model.shared }));
    /* the demo has the add-on and the retainer on, so it is the G7 mix at 60 inquiries, capped at 18 sessions */
    const expected = unwrap(inPersonMonth(canonicalInPerson({ addon: true, retainer: true }).inputs, canonicalInPerson({ addon: true, retainer: true }).offers, { sellableHours: null }));
    within(totals.grossProfitCents, expected.grossProfitCents, 1e-6);
    within(totals.businesses[0]!.month.volumes.sessions!, 18, 1e-9);
  });

  it('writes a typed value through, labeled Yours, and exports then imports it exactly', async () => {
    await useAppStore.getState().init(fresh());
    await useAppStore.getState().setInput('b-inperson', 'inquiriesPerMonth', 42);
    const b = useAppStore.getState().businesses.find((x) => x.id === 'b-inperson')!;
    expect(b.inputs.inquiriesPerMonth?.value).toBe(42);
    expect(b.inputs.inquiriesPerMonth?.label).toBe('Yours');
    const text = await useAppStore.getState().exportBackup();
    await useAppStore.getState().resetToDemo();
    expect(useAppStore.getState().businesses.find((x) => x.id === 'b-inperson')!.inputs.inquiriesPerMonth?.value).toBe(60);
    await useAppStore.getState().importBackup(text);
    expect(useAppStore.getState().businesses.find((x) => x.id === 'b-inperson')!.inputs.inquiriesPerMonth?.value).toBe(42);
    expect(useAppStore.getState().seeded).toBe('import');
  });

  it('a null value is stored as not entered and the engine reports it missing', async () => {
    await useAppStore.getState().init(fresh());
    await useAppStore.getState().setInput('b-inperson', 'bookingRate', null);
    const model = useAppStore.getState().model()!;
    const r = aggregateMonth(model);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.missing).toContain('b-inperson.bookingRate');
  });
});
