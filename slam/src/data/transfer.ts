/* ==========================================================================
   Export and import: a plain JSON file with everything the device holds.
   The file name and the title inside never reveal the kind of work.
   Import validates the whole file first, then replaces every table in one
   transaction, so a bad file changes nothing.
   ========================================================================== */
import type { SlamDB } from './db';
import { EXPORT_FORMAT, type ExportFile, ExportSchema, SCHEMA_VERSION } from './schemas';

export const EXPORT_REMINDER =
  'This file holds your numbers in plain text. Keep it somewhere private (a locked folder or an encrypted drive), and delete copies you no longer need.';

export function exportFileName(date: Date = new Date(), kind: 'backup' | 'snapshot' = 'backup'): string {
  const d = date.toISOString().slice(0, 10);
  return `numbers-${kind}-${d}.json`;
}

export async function exportAll(db: SlamDB, now: Date = new Date()): Promise<ExportFile> {
  const [profiles, businesses, offers, scenarios, sources, clients, sales, weekLogs, milestones] = await db.transaction(
    'r',
    db.dataTables,
    () =>
      Promise.all([
        db.profiles.toArray(),
        db.businesses.toArray(),
        db.offers.toArray(),
        db.scenarios.toArray(),
        db.sources.toArray(),
        db.clients.toArray(),
        db.sales.toArray(),
        db.weekLogs.toArray(),
        db.milestones.toArray(),
      ]),
  );
  const byId = <T extends { id: string }>(rows: T[]) => [...rows].sort((a, b) => a.id.localeCompare(b.id));
  const file: ExportFile = {
    format: EXPORT_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    profiles: byId(profiles),
    businesses: byId(businesses),
    offers: byId(offers),
    scenarios: byId(scenarios),
    sources: byId(sources),
    clients: byId(clients),
    sales: byId(sales),
    weekLogs: byId(weekLogs),
    milestones: byId(milestones),
  };
  return ExportSchema.parse(file);
}

export function serialize(file: ExportFile): string {
  return JSON.stringify(file, null, 2);
}

export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportError';
  }
}

/** Parse and validate; throws ImportError with a plain message. */
export function parseExport(text: string): ExportFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ImportError('That file is not readable as a backup.');
  }
  const result = ExportSchema.safeParse(raw);
  if (!result.success) {
    const first = result.error.issues[0];
    const where = first?.path.join('.') || 'file';
    throw new ImportError(`That backup does not match what this version expects (${where}: ${first?.message ?? 'invalid'}).`);
  }
  return result.data;
}

/** Replace everything on the device with the file's contents. */
export async function importAll(db: SlamDB, file: ExportFile): Promise<void> {
  await db.transaction('rw', db.dataTables, async () => {
    for (const t of db.dataTables) await t.clear();
    await db.profiles.bulkAdd(file.profiles);
    await db.businesses.bulkAdd(file.businesses);
    await db.offers.bulkAdd(file.offers);
    await db.scenarios.bulkAdd(file.scenarios);
    await db.sources.bulkAdd(file.sources);
    await db.clients.bulkAdd(file.clients);
    await db.sales.bulkAdd(file.sales);
    await db.weekLogs.bulkAdd(file.weekLogs);
    await db.milestones.bulkAdd(file.milestones);
  });
}

/** The part of an export that must survive a round trip exactly (the stamp is new each time). */
export function comparable(file: ExportFile): Omit<ExportFile, 'exportedAt'> {
  const { exportedAt: _stamp, ...rest } = file;
  return rest;
}
