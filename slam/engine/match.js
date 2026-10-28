// Match tiers (S-266, wired S-272): the one place a workplace match is figured. No imports, so every engine can read it.

const val = (f) => (f && typeof f === 'object' && f.kind !== 'missing' && f.kind !== 'notForMe' ? f.value : null);
// Match tiers (S-266): what a plan matches, as [{ rate, upTo }] (upTo: the width of pay this tier covers). From
// matchTiers when there, else the one tier of matchRate and matchCap, else none.
export function matchTiersOf(a) {
  const t = a && a.matchTiers && Array.isArray(val(a.matchTiers)) ? val(a.matchTiers) : null;
  if (t && t.length) return t;
  const rate = a && a.matchRate ? val(a.matchRate) : null, cap = a && a.matchCap ? val(a.matchCap) : null;
  return typeof rate === 'number' && rate > 0 && typeof cap === 'number' && cap > 0 ? [{ rate, upTo: cap }] : [];
}
// The employer's match a month on `put` a month in, at `wage` a month of pay: each tier matches its share of what goes in.
export function matchOn(tiers, put, wage) {
  let from = 0, out = 0;
  for (const t of tiers) { const band = Math.max(0, Math.min(put, (from + t.upTo) * wage) - from * wage); out += t.rate * band; from += t.upTo; }
  return out;
}
// The share of pay that gets the full match.
export const fullMatchShare = (tiers) => tiers.reduce((a, t) => a + t.upTo, 0);

// The match's facts on an account, for a tracker: the tiers when typed, else the old rate and cap.
export const matchPaths = (a) => (a && a.matchTiers && Array.isArray(val(a.matchTiers)) && val(a.matchTiers).length ? ['matchTiers'] : ['matchRate', 'matchCap']);
// The match's share of what the full match asks, as one rate (100% of 3% then 50% of 2%: 80% over 5%).
export const blendedRate = (tiers) => { const w = fullMatchShare(tiers); return w > 0 ? tiers.reduce((x, t) => x + t.rate * t.upTo, 0) / w : 0; };
// A year-end true-up (S-272): the plan tops the match up to the full year's figure, so money put in early is not short.
export const hasTrueUp = (a) => !!a && !!a.trueUp && val(a.trueUp) === true;
