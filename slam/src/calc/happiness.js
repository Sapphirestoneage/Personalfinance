// Happiness, three ways, for lines with a joy rating (1 to 10):
// the rating as entered, % of happiness (rating / sum of ratings, adds to 100%
// across rated lines), and joy per $100 (rating / (monthly amount / 100)).
// No rating is "not rated" (null), never 0. A rated line at $0 is "no cost".

export function joyPer100(rating, amount) {
  if (rating === null || rating === undefined || amount === null || amount === undefined) return null;
  if (amount <= 0) return null;
  return rating / (amount / 100);
}

// lines: [{ id, joy, amount }]. Returns { byId: { id: { rating, share, per100, noCost } }, points }.
export function happinessOf(lines) {
  const rated = lines.filter((l) => l.joy !== null && l.joy !== undefined);
  const points = rated.reduce((a, l) => a + l.joy, 0);
  const byId = {};
  for (const l of rated) {
    byId[l.id] = { rating: l.joy, share: points ? l.joy / points : null, per100: joyPer100(l.joy, l.amount), noCost: l.amount === 0 };
  }
  return { byId, points, ratedCount: rated.length };
}

// Share of dollars going to lines rated 7 or above, out of all dollars in the column.
export function happySpendShare(lines, total) {
  if (!total || !lines.some((l) => l.joy !== null && l.joy !== undefined && l.amount !== null)) return null;
  return lines.filter((l) => l.joy !== null && l.joy !== undefined && l.joy >= 7 && l.amount !== null).reduce((a, l) => a + l.amount, 0) / total;
}
