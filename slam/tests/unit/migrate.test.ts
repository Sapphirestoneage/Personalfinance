/* Rows and files from the earlier build keep working. */
import { describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { SlamDB } from '@/data/db';
import { migrateExport, migrateWeekLog } from '@/data/migrate';
import { exportAll, parseExport, serialize } from '@/data/transfer';
import { sampleRows } from '@/content/samples';

const name = () => `mig-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

describe('week logs from before checkedIn existed', () => {
  it('count as checked in when they hold a number, and gain the new fields', () => {
    const old = { id: 'w', profileId: 'p', weekStart: '2026-09-07', inquiries: 4, bookings: null, sessions: 1, revenueCents: null, hours: null, energy: null, loggedAt: '2026-09-07T00:00:00.000Z' };
    const row = migrateWeekLog(old);
    expect(row.checkedIn).toBe(true);
    expect(row.sessionsHeld).toBe(1);
    expect('sessions' in row).toBe(false);
    expect(row.reachActions).toBeNull();
    const empty = migrateWeekLog({ id: 'e', inquiries: null, bookings: null, sessionsHeld: null, revenueCents: null, hours: null, energy: null });
    expect(empty.checkedIn).toBe(false);
  });
  it('leaves a current row alone', () => {
    const cur = { id: 'w', checkedIn: false, sessionsHeld: null, reachActions: 3, inquiries: 9 };
    expect(migrateWeekLog(cur)).toEqual(cur);
  });
});

describe('a device with version 1 rows', () => {
  it('opens under version 2 with the rows upgraded and exportable', async () => {
    const dbName = name();
    /* write rows the way the earlier build did, straight into a version-1 database */
    const v1 = new Dexie(dbName);
    v1.version(1).stores({ profiles: 'id', businesses: 'id, profileId, [profileId+priority]', offers: 'id, businessId', scenarios: 'id, profileId, [profileId+kind]', sources: 'id, profileId', clients: 'id, profileId, stage', sales: 'id, profileId, businessId, clientId, date', weekLogs: 'id, profileId, weekStart', milestones: 'id, profileId, key', meta: 'key' });
    const rows = sampleRows('sample-inperson');
    await v1.table('profiles').put(rows.profile);
    for (const b of rows.businesses) await v1.table('businesses').put(b);
    for (const o of rows.offers) await v1.table('offers').put(o);
    for (const sc of rows.scenarios) {
      const { eventParams: _e, ...old } = sc;
      await v1.table('scenarios').put(old);
    }
    await v1.table('weekLogs').put({ id: 'w1', profileId: rows.profile.id, weekStart: '2026-09-07', inquiries: 6, bookings: 2, sessions: 1, revenueCents: null, hours: null, energy: 3, loggedAt: '2026-09-07T00:00:00.000Z' });
    v1.close();

    const db = new SlamDB(dbName);
    const logs = await db.weekLogs.toArray();
    expect(logs[0]!.checkedIn).toBe(true);
    expect(logs[0]!.sessionsHeld).toBe(1);
    expect(logs[0]!.reachActions).toBeNull();
    const file = await exportAll(db);
    expect(file.schemaVersion).toBe(2);
    expect(file.weekLogs[0]!.checkedIn).toBe(true);
    db.close();
  });
});

describe('a backup file from the earlier build', () => {
  it('imports after migration; a newer or unknown file is refused with a plain message', async () => {
    const db = new SlamDB(name());
    const rows = sampleRows('sample-inperson');
    await db.putProfile(rows.profile);
    for (const b of rows.businesses) await db.putBusiness(b);
    const current = await exportAll(db);
    const old = JSON.parse(serialize(current)) as Record<string, unknown>;
    old.schemaVersion = 1;
    old.weekLogs = [{ id: 'w1', profileId: rows.profile.id, weekStart: '2026-09-07', inquiries: 6, bookings: 2, sessions: null, revenueCents: null, hours: null, energy: null, loggedAt: '2026-09-07T00:00:00.000Z' }];
    const parsed = parseExport(JSON.stringify(old));
    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.weekLogs[0]!.checkedIn).toBe(true);
    expect(migrateExport({ schemaVersion: 2, x: 1 })).toEqual({ schemaVersion: 2, x: 1 });
    expect(() => parseExport(JSON.stringify({ ...old, schemaVersion: 9 }))).toThrow(/newer version/);
    expect(() => parseExport(JSON.stringify({ format: 'other' }))).toThrow(/not a backup/);
    db.close();
  });
});
