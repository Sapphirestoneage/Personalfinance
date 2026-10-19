// A split line (S-134): the amount on the line is what you pay; the split says with how many other people
// and your share, so the whole bill can be shown next to it.
//   your share = the typed percent, else an even split: 100 / (people + 1), to two decimals
//   whole bill = your amount / (share / 100), to the cent
// Spotify Family at 21 a month with 3 others: share 100 / 4 = 25%, whole bill 21 / 0.25 = 84.
// Blank (null) wherever an input is missing (empty is not zero).

const typed = (v) => (v && v.amount !== null && v.amount !== undefined ? v.amount : null);
const r2 = (x) => Math.round(Number(x.toPrecision(12)) * 100) / 100;

export function splitOf(line, monthlyAmount) {
  if (!line.shared) return null;
  const people = typed(line.splitPeople);
  const typedShare = typed(line.splitShare);
  const share = typedShare !== null ? typedShare : people !== null && people >= 1 ? r2(100 / (people + 1)) : null;
  const whole = share === null || !(share > 0) || monthlyAmount === null || monthlyAmount === undefined ? null : r2(monthlyAmount / (share / 100));
  return { people, share, shareFrom: typedShare !== null ? 'typed' : share === null ? null : 'even', yours: monthlyAmount, whole };
}
