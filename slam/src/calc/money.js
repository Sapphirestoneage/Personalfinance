// Tiny helpers for adding and dividing amounts where empty is not zero.
// null means "not entered"; these helpers never turn null into 0 silently.

export function round2(x) {
  if (x === null || x === undefined) return null;
  return Math.round((x + Math.sign(x) * Number.EPSILON) * 100) / 100;
}

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
