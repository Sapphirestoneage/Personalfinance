// Tiny helpers for adding and dividing amounts where empty is not zero.
// null means "not entered"; these helpers never turn null into 0 silently.

// Adds the numbers that exist. total is null when nothing was entered.
export function sumKnown(list) {
  let total = null;
  let missing = 0;
  for (const x of list) {
    if (x === null || x === undefined) { missing += 1; continue; }
    total = (total === null ? 0 : total) + x;
  }
  return { total, missing };
}

export function sum(list) {
  return sumKnown(list).total;
}

// a / b, or null when either side is missing or b is zero.
export function ratio(a, b) {
  if (a === null || a === undefined || b === null || b === undefined || b === 0) return null;
  return a / b;
}

export function minus(a, b) {
  if (a === null || a === undefined || b === null || b === undefined) return null;
  return a - b;
}

// Round to the cent. "+ 0" turns a -0 into 0 so that a rounded zero never prints as "-$0".
export const r2 = (x) => Math.round(x * 100) / 100 + 0;

// The same, but a missing number stays missing (empty is not zero).
export const r2OrNull = (x) => (x === null || x === undefined ? null : r2(x));

// Round to the cent after trimming floating-point noise to 12 significant digits. A total that
// arithmetic left at 0.034999999999999996 is treated as 0.035 and rounds to 0.04, where plain r2
// gives 0.03. Used where many fractions are added up (card interest, split payments).
export const r2Exact = (x) => Math.round(Number(x.toPrecision(12)) * 100) / 100 + 0;
