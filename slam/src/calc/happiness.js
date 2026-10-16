// Happiness, three ways, for lines with a joy or purpose rating (1 to 10), savings
// lines included (purpose counts as a positive, S-082):
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

// Satisfaction and stress (S-082). Stress is rated like joy (1 to 10, how much a
// line drains the client). For lines rated both ways: net = joy - stress, and a
// lean: more of (net 3 or more), less of (net -3 or less), or about even.
// Look at first: lines that drain more than they give, ranked by
// (stress - joy) x (monthly amount / 100), so big stressful dollars come first.
export const LEAN_GAP = 3;

export function stressOf(lines) {
  const rated = lines.filter((l) => l.stress !== null && l.stress !== undefined);
  const points = rated.reduce((a, l) => a + l.stress, 0);
  const byId = {};
  for (const l of rated) {
    const both = l.joy !== null && l.joy !== undefined;
    const net = both ? l.joy - l.stress : null;
    byId[l.id] = {
      stress: l.stress, share: points ? l.stress / points : null, per100: joyPer100(l.stress, l.amount),
      net, lean: net === null ? null : net >= LEAN_GAP ? 'more' : net <= -LEAN_GAP ? 'less' : 'even',
      drain: both && l.stress > l.joy && l.amount ? (l.stress - l.joy) * (l.amount / 100) : null
    };
  }
  const named = (id) => lines.find((l) => l.id === id);
  const lookFirst = Object.entries(byId).filter(([, x]) => x.drain !== null).sort((a, b) => b[1].drain - a[1].drain).map(([id, x]) => ({ id, name: named(id).name, ...x, joy: named(id).joy, amount: named(id).amount }));
  const moreOf = Object.entries(byId).filter(([, x]) => x.lean === 'more').map(([id, x]) => ({ id, name: named(id).name, ...x, joy: named(id).joy, amount: named(id).amount, joyPer100: joyPer100(named(id).joy, named(id).amount) }))
    .sort((a, b) => (b.joyPer100 === null ? -1 : b.joyPer100) - (a.joyPer100 === null ? -1 : a.joyPer100));
  const lessOf = Object.entries(byId).filter(([, x]) => x.lean === 'less').map(([id, x]) => ({ id, name: named(id).name, ...x }));
  const stressOnly = rated.filter((l) => l.joy === null || l.joy === undefined).map((l) => ({ id: l.id, name: l.name }));
  return { byId, points, ratedCount: rated.length, lookFirst, moreOf, lessOf, stressOnly };
}

// The plain reading for the satisfaction and stress card.
export function stressReading(s) {
  const money = (x) => '$' + Math.round(x).toLocaleString('en-US');
  const list = (xs) => (xs.length < 3 ? xs.join(' and ') : xs.slice(0, -1).join(', ') + ', and ' + xs[xs.length - 1]);
  if (!s.ratedCount) return 'Rate stress next to joy or purpose on any line (Actual pass, Details) to see what to keep more of and what to look at first.';
  const out = [];
  const [first, ...rest] = s.lookFirst;
  if (first) out.push('Look at ' + first.name + ' first: ' + money(first.amount) + ' a month that drains more than it gives (stress ' + first.stress + ', joy or purpose ' + first.joy + ').' + (rest.length ? ' Then ' + list(rest.slice(0, 2).map((x) => x.name)) + '.' : ''));
  else out.push('Nothing rated drains more than it gives.');
  if (s.moreOf.length) out.push('Worth more of: ' + list(s.moreOf.slice(0, 3).map((x) => x.name)) + '.');
  if (s.stressOnly.length) out.push('Rate joy or purpose for ' + list(s.stressOnly.map((x) => x.name)) + ' to compare.');
  return out.join(' ');
}
