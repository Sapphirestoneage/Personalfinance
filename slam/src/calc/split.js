// A split line (S-134): with how many other people, and your share. Who pays the bill (S-138):
//   'part'  - you pay only your part (the default): the amount on the line is your part.
//     whole bill = your part / (share / 100), to the cent
//   'whole' - it goes on your card and the others pay you back: the amount on the line is the whole bill.
//     your part = whole bill x share / 100, to the cent; paid back to you = whole bill - your part
//     Until the share is known, all of it is yours (you are liable for the whole bill).
// Either way the budget counts your part; what the others pay back reduces the line, as any
// reimbursement does (S-088), so it is never counted as income.
//   your share = the typed percent, else an even split: 100 / (people + 1), to two decimals
// Spotify Family, 3 others: share 100 / 4 = 25%. You pay your part, 21: whole bill 21 / 0.25 = 84.
// You pay the whole 84: your part 84 x 0.25 = 21, paid back 84 - 21 = 63.
// Blank (null) wherever an input is missing (empty is not zero).

const typed = (v) => (v && v.amount !== null && v.amount !== undefined ? v.amount : null);
const r2 = (x) => Math.round(Number(x.toPrecision(12)) * 100) / 100;

// amount: the line's typed amount, monthly (your part, or the whole bill when you pay it all).
export function splitOf(line, amount) {
  if (!line.shared) return null;
  const pays = line.splitPays === 'whole' ? 'whole' : 'part';
  const people = typed(line.splitPeople);
  const typedShare = typed(line.splitShare);
  const share = typedShare !== null ? typedShare : people !== null && people >= 1 ? r2(100 / (people + 1)) : null;
  const known = share !== null && share > 0;
  const has = amount !== null && amount !== undefined;
  const base = { pays, people, share, shareFrom: typedShare !== null ? 'typed' : share === null ? null : 'even' };
  if (pays === 'whole') {
    const yours = !has ? null : known ? r2(amount * (share / 100)) : amount;
    return { ...base, yours, whole: has ? amount : null, paidBack: has && known ? r2(amount - yours) : null };
  }
  return { ...base, yours: has ? amount : null, whole: has && known ? r2(amount / (share / 100)) : null, paidBack: null };
}

// What the budget counts for a line: your part of a split you pay in full, else the amount as typed.
export function countedAmount(line, amount) {
  const sp = splitOf(line, amount);
  return sp && sp.pays === 'whole' ? sp.yours : amount;
}
