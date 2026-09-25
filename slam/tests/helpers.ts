import { expect } from 'vitest';
import type { Result } from '@/engine/types';

/** dollars -> cents, for readable expectations */
export const $ = (dollars: number): number => Math.round(dollars * 100);

export function unwrap<T>(r: Result<T>): T {
  if (!r.ok) throw new Error('incomplete: ' + r.missing.join(', '));
  return r.value;
}

/** |actual - expected| <= tolerance, with a readable message */
export function within(actual: number, expected: number, tolerance: number, what = 'value'): void {
  const diff = Math.abs(actual - expected);
  expect(diff, `${what}: got ${actual}, wanted ${expected} (+/- ${tolerance})`).toBeLessThanOrEqual(tolerance);
}

/** money within +/- dollars */
export function withinDollars(actualCents: number, expectedDollars: number, dollars: number, what = 'money'): void {
  within(actualCents, $(expectedDollars), dollars * 100, what);
}
