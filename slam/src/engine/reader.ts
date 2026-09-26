/* ==========================================================================
   The assumption reader: the only way a number enters the engine.

   `reader(book)` returns an object whose `req(key)` hands back the stored
   value and records the key and its label. A null value (not entered) or
   an absent key is recorded as missing; `req` then returns NaN so that no
   arithmetic downstream can accidentally look valid. Callers check
   `r.missing` before returning a value and hand back `incomplete` instead.
   ========================================================================== */
import type { Assumption, AssumptionMap, Label } from '@/data/schemas';
import { type BasedOn, weakestLabel } from './types';

export type Book = AssumptionMap;

export interface Reader {
  /** required number; null or absent is recorded as missing and returns NaN */
  req(key: string): number;
  /** a number that may legitimately be absent from this book (an optional offer) */
  has(key: string): boolean;
  readonly missing: string[];
  basedOn(): BasedOn;
}

export function reader(book: Book, prefix = ''): Reader {
  const keys: string[] = [];
  const labels: Label[] = [];
  const missing: string[] = [];
  return {
    req(key: string): number {
      const a: Assumption | undefined = book[key];
      const full = prefix + key;
      if (!a || a.value === null || !Number.isFinite(a.value)) {
        missing.push(full);
        return Number.NaN;
      }
      keys.push(full);
      labels.push(a.label);
      return a.value;
    },
    has(key: string): boolean {
      return key in book;
    },
    missing,
    basedOn(): BasedOn {
      return {
        keys: Array.from(new Set(keys)),
        weakest: weakestLabel(labels),
        allYours: labels.every((l) => l === 'Yours'),
      };
    },
  };
}

/** Build a book from plain numbers (tests, sandboxes). Label defaults to Preset. */
export function bookOf(values: Record<string, number | null>, label: Label = 'Preset', source = 'test'): Book {
  const updated = '2026-01-01T00:00:00.000Z';
  const out: Book = {};
  for (const [key, value] of Object.entries(values)) out[key] = { key, value, label, source, updated };
  return out;
}

/** A copy of the book with some values replaced; labels are kept. */
export function withValues(book: Book, patch: Record<string, number | null>): Book {
  const out: Book = { ...book };
  for (const [key, value] of Object.entries(patch)) {
    const prev = book[key];
    out[key] = prev ? { ...prev, value } : { key, value, label: 'Placeholder', source: 'override', updated: '2026-01-01T00:00:00.000Z' };
  }
  return out;
}

/** A copy of the book with some values multiplied (scenarios). Missing keys stay missing. */
export function scaled(book: Book, factors: Record<string, number>): Book {
  const out: Book = { ...book };
  for (const [key, factor] of Object.entries(factors)) {
    const prev = book[key];
    if (prev && prev.value !== null) out[key] = { ...prev, value: prev.value * factor };
  }
  return out;
}
