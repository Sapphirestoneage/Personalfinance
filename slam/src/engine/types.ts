/* ==========================================================================
   Engine result types. Pure data, no UI, no storage.

   A Result is either complete (with the value and what it was based on) or
   incomplete (with the list of assumption keys that were null). A missing
   input never becomes a number; the screen shows what is missing instead.
   ========================================================================== */
import type { Label } from '@/data/schemas';
import { LABEL_STRENGTH } from '@/data/schemas';

export interface BasedOn {
  /** every assumption key the computation read */
  keys: string[];
  /** the least trustworthy label among them */
  weakest: Label;
  /** true only when every input was typed by her */
  allYours: boolean;
}

export type Result<T> =
  | { ok: true; value: T; basedOn: BasedOn }
  | { ok: false; missing: string[] };

export function ok<T>(value: T, basedOn: BasedOn): Result<T> {
  return { ok: true, value, basedOn };
}

export function incomplete<T>(missing: string[]): Result<T> {
  return { ok: false, missing: Array.from(new Set(missing)) };
}

export function weakestLabel(labels: Label[]): Label {
  let weakest: Label = 'Yours';
  for (const l of labels) if (LABEL_STRENGTH[l] < LABEL_STRENGTH[weakest]) weakest = l;
  return weakest;
}

export function mergeBasedOn(parts: BasedOn[]): BasedOn {
  const keys = Array.from(new Set(parts.flatMap((p) => p.keys)));
  const weakest = weakestLabel(parts.map((p) => p.weakest));
  return { keys, weakest, allYours: parts.every((p) => p.allYours) };
}

export const NO_INPUTS: BasedOn = { keys: [], weakest: 'Yours', allYours: true };
