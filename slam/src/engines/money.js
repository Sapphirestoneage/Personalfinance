// Tiny helpers for adding and dividing amounts where empty is not zero.
// null means "not entered"; these helpers never turn null into 0 silently.
// Plain arithmetic on dollar amounts of any period (the caller knows whether a number is a month or a
// year). No imports; most of the other engines import it.

/**
 * Adds the numbers that exist. total is null when nothing was entered.
 * @param {Array<?number>} list amounts in dollars; null or undefined for not entered
 * @returns {{total: ?number, missing: number}} the sum of the known ones, and how many were missing
 */
export function sumKnown(list) {
  let total = null;
  let missing = 0;
  for (const x of list) {
    if (x === null || x === undefined) {
      missing += 1;
      continue;
    }
    total = (total === null ? 0 : total) + x;
  }
  return { total, missing };
}

/** The total of sumKnown alone: dollars, or null when nothing was entered. */
export function sum(list) {
  return sumKnown(list).total;
}

/**
 * a / b, or null when either side is missing or b is zero.
 * @param {?number} a
 * @param {?number} b
 * @returns {?number} a ratio (0 to 1 for a share); never divides by zero
 */
export function ratio(a, b) {
  if (a === null || a === undefined || b === null || b === undefined || b === 0) return null;
  return a / b;
}

/**
 * a - b, or null when either side is missing (a difference with one side unknown is unknown).
 * @param {?number} a dollars
 * @param {?number} b dollars
 * @returns {?number}
 */
export function minus(a, b) {
  if (a === null || a === undefined || b === null || b === undefined) return null;
  return a - b;
}

/**
 * Round to the cent. "+ 0" turns a -0 into 0 so that a rounded zero never prints as "-$0".
 * @param {number} x dollars
 * @returns {number} dollars, two decimals
 */
export const r2 = (x) => Math.round(x * 100) / 100 + 0;

/**
 * The same, but a missing number stays missing (empty is not zero).
 * @param {?number} x dollars, or null for not entered
 * @returns {?number}
 */
export const r2OrNull = (x) => (x === null || x === undefined ? null : r2(x));

/**
 * Round to the cent after trimming floating-point noise to 12 significant digits. A total that
 * arithmetic left at 0.034999999999999996 is treated as 0.035 and rounds to 0.04, where plain r2
 * gives 0.03. Used where many fractions are added up (card interest, split payments).
 * @param {number} x dollars
 * @returns {number} dollars, two decimals
 */
export const r2Exact = (x) => Math.round(Number(x.toPrecision(12)) * 100) / 100 + 0;
