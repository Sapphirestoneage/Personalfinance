// Export and import of households as versioned JSON files.

import { migrate } from './migrate.js';
import { validateHousehold } from './validate.js';

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
    if (data.exportVersion > EXPORT_VERSION) throw new Error('That file came from a newer version of SLAM.');
    doc = data.household;
  }
  const migrated = migrate(doc);
  const errs = validateHousehold(migrated);
  if (errs.length) throw new Error('That file has problems: ' + errs.slice(0, 3).join('; '));
  return migrated;
}
