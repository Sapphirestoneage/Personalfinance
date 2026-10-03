/* ==========================================================================
   Assumption helpers: the one place an Assumption is constructed.
   ========================================================================== */
import type { Assumption, AssumptionMap, Label } from './schemas';

export const CANONICAL_STAMP = '2026-09-01T00:00:00.000Z';

export function assume(key: string, value: number | null, label: Label, source: string, updated: string = CANONICAL_STAMP): Assumption {
  return { key, value, label, source, updated };
}

/** She typed it. */
export function yours(key: string, value: number | null, now: string = new Date().toISOString()): Assumption {
  return { key, value, label: 'Yours', source: 'typed by you', updated: now };
}

export function mapOf(...items: Assumption[]): AssumptionMap {
  const out: AssumptionMap = {};
  for (const a of items) out[a.key] = a;
  return out;
}

/** Set one value in a map, keeping everything else. Returns a new map. */
export function setValue(map: AssumptionMap, key: string, value: number | null, label: Label, source: string, now: string = new Date().toISOString()): AssumptionMap {
  return { ...map, [key]: { key, value, label, source, updated: now } };
}

export const LABEL_WORDS: Record<Label, string> = {
  Yours: 'yours',
  Cohort: 'from the cohort',
  Book: 'from the book',
  Preset: 'a preset',
  Placeholder: 'a placeholder',
};

/** Percent for display: 0.4 -> "40%". Never stored. */
export function pct(rate: number, digits = 0): string {
  return `${(rate * 100).toFixed(digits)}%`;
}
