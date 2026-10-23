// Export and import of households as versioned JSON files. The envelope is { format,
// exportVersion, exportedAt, household }; the household inside is the full file, deleted
// records kept (store.js exportCurrent). Needs migrate.js (brings an older file up to the
// current schema) and validate.js (refuses a file the screens could not trust).

import { migrate } from './migrate.js';
import { validateHousehold } from './validate.js';

// The envelope's own version, separate from SCHEMA_VERSION: the household carries its schema
// version and migrate handles that. This one only moves if the wrapper itself changes.
export const EXPORT_FORMAT = 'slam-household';
export const EXPORT_VERSION = 1;

export function exportHousehold(doc, nowIso) {
  return JSON.stringify({
    format: EXPORT_FORMAT,
    exportVersion: EXPORT_VERSION,
    exportedAt: nowIso,
    household: doc
  }, null, 2);
}

// Accepts an export envelope or a bare household document.
// Returns a migrated, validated document, or throws with a plain message.
export function parseImport(text) {
  let data;
  try { data = JSON.parse(text); } catch (e) { throw new Error('That file is not valid JSON.'); }
  let doc = data;
  if (data && data.format === EXPORT_FORMAT) {
    // A newer wrapper may hold keys this build does not know; refuse rather than guess.
    if (data.exportVersion > EXPORT_VERSION) throw new Error('That file came from a newer version of SLAM.');
    doc = data.household;
  }
  const migrated = migrate(doc);
  const errs = validateHousehold(migrated);
  // Three problems are enough to name the trouble without swamping the message.
  if (errs.length) throw new Error('That file has problems: ' + errs.slice(0, 3).join('; '));
  return migrated;
}
