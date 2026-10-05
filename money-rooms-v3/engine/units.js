/* Units: every engine number is a Quantity that knows its period (monthly,
   annual, oneoff), basis (real, nominal) and tax side (pretax, aftertax, na).
   Combining two quantities with different units throws, so a monthly figure
   can never be added to an annual one by accident. Cents are integers.
   Pure module, no imports, runs in Node and the browser. */

export const PERIODS = Object.freeze(['monthly', 'annual', 'oneoff']);
export const BASES = Object.freeze(['real', 'nominal']);
export const TAXES = Object.freeze(['pretax', 'aftertax', 'na']);

export class UnitError extends Error {
  constructor(message) { super(message); this.name = 'UnitError'; }
}

function isInt(n) { return typeof n === 'number' && Number.isFinite(n) && Math.round(n) === n; }

/* A "needs" result: the inputs for this figure are not there yet. It is a
   first-class value so that downstream math can carry the gap instead of
   inventing a zero. */
export function needs(list) {
  const arr = Array.isArray(list) ? list.slice() : [list];
  return Object.freeze({ status: 'needs', needs: Object.freeze(Array.from(new Set(arr.filter(Boolean)))) });
}
export function isNeeds(x) { return !!x && x.status === 'needs'; }
export function isQ(x) { return !!x && x.status === 'ok' && typeof x.cents === 'number'; }

/* Build a Quantity. `units` is { period, basis, tax }. `opts` may carry
   confidence (0..1) and range { low, high } in cents. */
export function q(cents, units, opts) {
  if (!isInt(cents)) throw new UnitError('cents must be an integer, got ' + String(cents));
  if (!units || PERIODS.indexOf(units.period) === -1) throw new UnitError('bad period ' + (units && units.period));
  if (BASES.indexOf(units.basis) === -1) throw new UnitError('bad basis ' + units.basis);
  if (TAXES.indexOf(units.tax) === -1) throw new UnitError('bad tax ' + units.tax);
  const o = opts || {};
  const confidence = o.confidence === undefined ? 1 : o.confidence;
  if (typeof confidence !== 'number' || confidence < 0 || confidence > 1 || Number.isNaN(confidence)) {
    throw new UnitError('confidence must be 0..1');
  }
  let range = null;
  if (o.range) {
    if (!isInt(o.range.low) || !isInt(o.range.high)) throw new UnitError('range must be integer cents');
    range = Object.freeze({ low: Math.min(o.range.low, o.range.high), high: Math.max(o.range.low, o.range.high) });
  }
  return Object.freeze({
    status: 'ok', cents, period: units.period, basis: units.basis, tax: units.tax,
    confidence, range, rough: !!o.rough || confidence < 0.9,
  });
}

/* Shorthands for the common unit triples. */
export const U = Object.freeze({
  monthlyAfter: Object.freeze({ period: 'monthly', basis: 'real', tax: 'aftertax' }),
  monthlyPre: Object.freeze({ period: 'monthly', basis: 'real', tax: 'pretax' }),
  monthlyNa: Object.freeze({ period: 'monthly', basis: 'real', tax: 'na' }),
  annualAfter: Object.freeze({ period: 'annual', basis: 'real', tax: 'aftertax' }),
  annualPre: Object.freeze({ period: 'annual', basis: 'real', tax: 'pretax' }),
  annualNa: Object.freeze({ period: 'annual', basis: 'real', tax: 'na' }),
  oneoff: Object.freeze({ period: 'oneoff', basis: 'real', tax: 'na' }),
  oneoffPre: Object.freeze({ period: 'oneoff', basis: 'real', tax: 'pretax' }),
  oneoffAfter: Object.freeze({ period: 'oneoff', basis: 'real', tax: 'aftertax' }),
});

export function unitsOf(a) { return { period: a.period, basis: a.basis, tax: a.tax }; }
export function sameUnits(a, b) { return a.period === b.period && a.basis === b.basis && a.tax === b.tax; }

export function assertUnits(a, b, what) {
  if (!sameUnits(a, b)) {
    throw new UnitError((what || 'combine') + ': ' + a.period + '/' + a.basis + '/' + a.tax
      + ' with ' + b.period + '/' + b.basis + '/' + b.tax);
  }
}

/* Dollar-weighted confidence: a $5 unknown should not drag down a $5,000 verified figure. */
export function weightedConfidence(parts) {
  let w = 0, sum = 0;
  parts.forEach(p => {
    const weight = Math.abs(p.cents) || 1;
    w += weight; sum += weight * p.confidence;
  });
  return w === 0 ? 1 : round4(sum / w);
}
function round4(x) { return Math.round(x * 10000) / 10000; }

function rangeOf(x) { return x.range || { low: x.cents, high: x.cents }; }

/* Add two quantities. Either may be a needs result; the needs win. */
export function add(a, b) {
  if (isNeeds(a) || isNeeds(b)) return needs((isNeeds(a) ? a.needs : []).concat(isNeeds(b) ? b.needs : []));
  assertUnits(a, b, 'add');
  const ra = rangeOf(a), rb = rangeOf(b);
  return q(a.cents + b.cents, unitsOf(a), {
    confidence: weightedConfidence([a, b]),
    range: (a.range || b.range) ? { low: ra.low + rb.low, high: ra.high + rb.high } : null,
    rough: a.rough || b.rough,
  });
}

export function sub(a, b) {
  if (isNeeds(a) || isNeeds(b)) return needs((isNeeds(a) ? a.needs : []).concat(isNeeds(b) ? b.needs : []));
  assertUnits(a, b, 'subtract');
  const ra = rangeOf(a), rb = rangeOf(b);
  return q(a.cents - b.cents, unitsOf(a), {
    confidence: weightedConfidence([a, b]),
    range: (a.range || b.range) ? { low: ra.low - rb.high, high: ra.high - rb.low } : null,
    rough: a.rough || b.rough,
  });
}

/* Sum a list; an empty list is a zero at full confidence in the given units. */
export function sum(list, units) {
  let acc = q(0, units);
  for (const x of list) acc = add(acc, x);
  if (isQ(acc) && list.length) {
    const ok = list.filter(isQ);
    return q(acc.cents, units, { confidence: weightedConfidence(ok), range: acc.range, rough: acc.rough });
  }
  return acc;
}

export function scale(a, k) {
  if (isNeeds(a)) return a;
  if (typeof k !== 'number' || !Number.isFinite(k)) throw new UnitError('scale needs a finite factor');
  const r = a.range ? { low: Math.round(a.range.low * k), high: Math.round(a.range.high * k) } : null;
  return q(Math.round(a.cents * k), unitsOf(a), { confidence: a.confidence, range: r, rough: a.rough });
}

/* Change the tax side on purpose (e.g. gross minus tax becomes after-tax). */
export function asTax(a, tax) {
  if (isNeeds(a)) return a;
  return q(a.cents, { period: a.period, basis: a.basis, tax }, { confidence: a.confidence, range: a.range, rough: a.rough });
}
export function asPeriod(a, period) {
  if (isNeeds(a)) return a;
  return q(a.cents, { period, basis: a.basis, tax: a.tax }, { confidence: a.confidence, range: a.range, rough: a.rough });
}

export function toMonthly(a) {
  if (isNeeds(a)) return a;
  if (a.period === 'monthly') return a;
  if (a.period === 'annual') return asPeriod(scale(a, 1 / 12), 'monthly');
  throw new UnitError('a oneoff amount has no monthly form');
}
export function toAnnual(a) {
  if (isNeeds(a)) return a;
  if (a.period === 'annual') return a;
  if (a.period === 'monthly') return asPeriod(scale(a, 12), 'annual');
  throw new UnitError('a oneoff amount has no annual form');
}

/* Cadence on a typed row -> monthly cents. `paychecksPerYear` comes from the
   pay frequency (26 biweekly, 24 semimonthly, 52 weekly, 12 monthly). */
export function cadenceToMonthly(cents, cadence, paychecksPerYear) {
  if (!isInt(cents)) throw new UnitError('cents must be an integer');
  switch (cadence) {
    case 'month': return cents;
    case 'year': return Math.round(cents / 12);
    case 'paycheck': {
      const n = paychecksPerYear || 26;
      return Math.round(cents * n / 12);
    }
    case 'oneoff': return 0;
    default: throw new UnitError('unknown cadence ' + cadence);
  }
}

/* A ratio of two quantities (same period is required when both have one). */
export function ratio(num, den) {
  if (isNeeds(num) || isNeeds(den)) return needs((isNeeds(num) ? num.needs : []).concat(isNeeds(den) ? den.needs : []));
  if (num.period !== 'oneoff' && den.period !== 'oneoff' && num.period !== den.period) {
    throw new UnitError('ratio of ' + num.period + ' over ' + den.period);
  }
  if (num.basis !== den.basis) throw new UnitError('ratio across bases');
  if (den.cents === 0) return needs(['a non-zero denominator']);
  const rn = rangeOf(num), rd = rangeOf(den);
  const lows = [rn.low / rd.high, rn.low / rd.low, rn.high / rd.high, rn.high / rd.low].filter(Number.isFinite);
  return Object.freeze({
    status: 'ok', kind: 'ratio', value: num.cents / den.cents,
    confidence: weightedConfidence([num, den]),
    range: (num.range || den.range) && lows.length ? { low: Math.min(...lows), high: Math.max(...lows) } : null,
    rough: num.rough || den.rough,
  });
}

export function pct(value, confidence, range) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new UnitError('pct needs a finite number');
  return Object.freeze({ status: 'ok', kind: 'ratio', value, confidence: confidence === undefined ? 1 : confidence, range: range || null, rough: (confidence !== undefined && confidence < 0.9) });
}

export function count(value, unit, confidence) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new UnitError('count needs a finite number');
  return Object.freeze({ status: 'ok', kind: 'count', unit, value, confidence: confidence === undefined ? 1 : confidence, rough: (confidence !== undefined && confidence < 0.9) });
}

export function dateValue(iso, confidence) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}(-\d{2})?$/.test(iso)) throw new UnitError('date must be YYYY-MM or YYYY-MM-DD');
  return Object.freeze({ status: 'ok', kind: 'date', value: iso, confidence: confidence === undefined ? 1 : confidence, rough: (confidence !== undefined && confidence < 0.9) });
}
