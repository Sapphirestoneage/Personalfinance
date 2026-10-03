/* ==========================================================================
   Older shapes to the current one. Used by the Dexie upgrade (rows already
   on the device) and by import (a backup file written by an older build).
   Every rule here is additive and idempotent: a current row passes through
   unchanged.
   ========================================================================== */

type Row = Record<string, unknown>;

/** WeekLog: a saved log before `checkedIn` existed counts as checked in when it holds any number. */
export function migrateWeekLog(row: Row): Row {
  const out = { ...row };
  if (out.checkedIn === undefined) out.checkedIn = ['inquiries', 'bookings', 'sessionsHeld', 'sessions', 'revenueCents', 'hours', 'energy'].some((k) => out[k] !== null && out[k] !== undefined);
  if (out.sessionsHeld === undefined && 'sessions' in out) {
    out.sessionsHeld = out.sessions ?? null;
    delete out.sessions;
  }
  if (out.sessionsHeld === undefined) out.sessionsHeld = null;
  if (out.reachActions === undefined) out.reachActions = null;
  return out;
}

export function migrateScenario(row: Row): Row {
  const out = { ...row };
  if (out.eventParams !== undefined && (out.eventParams === null || typeof out.eventParams !== 'object')) delete out.eventParams;
  return out;
}

export function migrateSource(row: Row): Row {
  const out = { ...row };
  if (out.followers === null) delete out.followers;
  return out;
}

/** A whole export file, any version this build can read, to the current version. */
export function migrateExport(raw: Row): Row {
  const version = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 0;
  if (version >= 2) return raw;
  const out: Row = { ...raw, schemaVersion: 2 };
  const list = (k: string) => (Array.isArray(out[k]) ? (out[k] as Row[]) : []);
  out.weekLogs = list('weekLogs').map(migrateWeekLog);
  out.scenarios = list('scenarios').map(migrateScenario);
  out.sources = list('sources').map(migrateSource);
  for (const k of ['profiles', 'businesses', 'offers', 'clients', 'sales', 'milestones']) if (!Array.isArray(out[k])) out[k] = [];
  return out;
}
